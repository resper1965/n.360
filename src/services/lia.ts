import { logAudit } from '../helpers';
import { documentoAtual, hashConteudo } from './pedidos';
import { lerImpacto, type Recomendacao } from './impacto';
import { lerCiclo, cicloEmTexto } from './ciclo';
import { lerBases, basesEmTexto, SQL_TITULOS_ADICIONAIS } from './bases';

export const RESULTADO_IMPACTO: Record<Recomendacao['resultado'], string> = {
  recomendado: 'RIPD recomendado', dispensavel_a_confirmar: 'RIPD dispensável, a confirmar', incompleto: 'incompleto',
};

/**
 * Núcleo do n.privacy, fatia 5: LIA (teste de legítimo interesse), uma por tratamento, e a DPIA que nasce do tratamento.
 * A LIA é exigida quando a base legal do tratamento é o legítimo interesse; a exigência só aparece nas ligações, não bloqueia.
 */

const normaliza = (s: string | null | undefined) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A base é legítimo interesse? Vale o título da base do catálogo ou o texto livre do registro (sem acento nem caixa, nas duas ordens: o formulário antigo gravava "Interesse legitimo"). */
export const ehLegitimoInteresse = (...textos: (string | null | undefined)[]) => textos.some((t) => /legitimo interesse|interesse legitimo/.test(normaliza(t)));

export type Lia = {
  id: string; ropa_id: string; finalidade_legitima: string | null; necessidade: string | null; balanceamento: string | null; salvaguardas: string | null;
  conclusao: 'prevalece' | 'nao_prevalece' | null; status: 'rascunho' | 'concluida'; concluida_em: string | null; concluida_por: string | null;
  criado_por: string | null; updated_at: string;
};
export type DadosLia = Partial<Pick<Lia, 'finalidade_legitima' | 'necessidade' | 'balanceamento' | 'salvaguardas' | 'conclusao' | 'status'>>;
type Falha = { ok: false; status: 400 | 404 | 409; error: string };

const COLUNAS = 'id, ropa_id, finalidade_legitima, necessidade, balanceamento, salvaguardas, conclusao, status, concluida_em, concluida_por, criado_por, updated_at';
const CAMPOS_TEXTO = ['finalidade_legitima', 'necessidade', 'balanceamento', 'salvaguardas'] as const;
const OBRIGATORIOS = ['finalidade_legitima', 'necessidade', 'balanceamento'] as const;

export type LiaDaLista = { ropa_id: string; atividade: string; status: 'faltando' | 'rascunho' | 'concluida'; conclusao: Lia['conclusao']; concluida_por: string | null; concluida_em: string | null };

/**
 * A lista de LIAs do projeto (spec 2026-10-19): as LIAs gravadas (a consulta do export `lia`) e, com `status: 'faltando'`, as atividades
 * ativas de legítimo interesse sem LIA (a regra da conferência: base principal, adicional, texto do GDPR ou a base GDPR de interesses legítimos).
 */
export async function liasDoProjeto(db: D1Database, projectId: string): Promise<LiaDaLista[]> {
  const { results } = await db.prepare(
    `SELECT r.id AS ropa_id, r.processing_purpose AS atividade, r.status AS ropa_status, r.legal_basis, r.base_gdpr, q.titulo AS base_titulo,
            ${SQL_TITULOS_ADICIONAIS} AS adicionais,
            EXISTS (SELECT 1 FROM tratamento_bases_gdpr g WHERE g.ropa_id = r.id AND g.project_id = r.project_id AND g.base = 'interesses_legitimos') AS gdpr_li,
            l.id AS lia_id, l.status, l.conclusao, l.concluida_por, l.concluida_em
       FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id
       LEFT JOIN lia_assessments l ON l.ropa_id = r.id AND l.project_id = r.project_id
      WHERE r.project_id = ? ORDER BY r.processing_purpose, r.id`
  ).bind(projectId).all<{ ropa_id: string; atividade: string; ropa_status: string | null; legal_basis: string | null; base_gdpr: string | null; base_titulo: string | null;
    adicionais: string | null; gdpr_li: number; lia_id: string | null; status: 'rascunho' | 'concluida' | null; conclusao: Lia['conclusao']; concluida_por: string | null; concluida_em: string | null }>();
  return results
    .filter((r) => r.lia_id || (r.ropa_status !== 'Inactive' && (r.gdpr_li || ehLegitimoInteresse(r.legal_basis, r.base_titulo, r.adicionais, r.base_gdpr))))
    .map((r) => ({ ropa_id: r.ropa_id, atividade: r.atividade, status: r.status ?? 'faltando', conclusao: r.conclusao ?? null, concluida_por: r.concluida_por ?? null, concluida_em: r.concluida_em ?? null }));
}

export async function lerLia(db: D1Database, projectId: string, ropaId: string): Promise<Lia | null> {
  return db.prepare(`SELECT ${COLUNAS} FROM lia_assessments WHERE ropa_id = ? AND project_id = ?`).bind(ropaId, projectId).first<Lia>();
}

/**
 * Grava a LIA do tratamento (cria ou altera só o que veio). Concluir exige finalidade, necessidade, balanceamento e conclusão;
 * LIA concluída não muda por edição: reabrir (`status: 'rascunho'`) é um ato à parte.
 */
export async function salvarLia(db: D1Database, projectId: string, ropaId: string, ator: string, d: DadosLia): Promise<Falha | { ok: true; id: string; criada: boolean }> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const atual = await lerLia(db, projectId, ropaId);
  if (atual?.status === 'concluida' && d.status !== 'rascunho') return { ok: false, status: 409, error: 'LIA concluída: reabra (status rascunho) para editar' };

  const final = { ...(atual ?? {}), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as Partial<Lia>;
  const status = d.status ?? atual?.status ?? 'rascunho';
  if (status === 'concluida') {
    const faltam = OBRIGATORIOS.filter((c) => !String(final[c] ?? '').trim());
    if (faltam.length || !final.conclusao) return { ok: false, status: 400, error: `Para concluir, preencha: ${[...faltam, ...(final.conclusao ? [] : ['conclusao'])].join(', ')}` };
  }
  const concluindo = status === 'concluida' && atual?.status !== 'concluida';
  const sets = [...CAMPOS_TEXTO, 'conclusao'].filter((c) => (d as Record<string, unknown>)[c] !== undefined);

  if (!atual) {
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO lia_assessments (id, project_id, ropa_id, finalidade_legitima, necessidade, balanceamento, salvaguardas, conclusao, status, concluida_em, concluida_por, criado_por, origem_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, projectId, ropaId, d.finalidade_legitima ?? null, d.necessidade ?? null, d.balanceamento ?? null, d.salvaguardas ?? null, d.conclusao ?? null, status,
      concluindo ? new Date().toISOString() : null, concluindo ? ator : null, ator, await hashDoTratamento(db, projectId, ropaId)).run();
    await logAudit(db, 'lia.criada', ator, `LIA do tratamento ${ropaId} criada (${status})`, '', '', projectId);
    return { ok: true, id, criada: true };
  }
  const colunas = [...sets.map((c) => `${c} = ?`), 'status = ?', 'concluida_em = ?', 'concluida_por = ?', "updated_at = datetime('now')"];
  await db.prepare(`UPDATE lia_assessments SET ${colunas.join(', ')} WHERE id = ? AND project_id = ?`).bind(
    ...sets.map((c) => (d as Record<string, unknown>)[c] ?? null), status,
    status === 'concluida' ? (concluindo ? new Date().toISOString() : atual.concluida_em) : null,
    status === 'concluida' ? (concluindo ? ator : atual.concluida_por) : null, atual.id, projectId,
  ).run();
  await logAudit(db, concluindo ? 'lia.concluida' : 'lia.atualizada', ator, `LIA do tratamento ${ropaId}: ${status}`, '', '', projectId);
  return { ok: true, id: atual.id, criada: false };
}

export async function apagarLia(db: D1Database, projectId: string, ropaId: string, ator: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM lia_assessments WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId).run();
  if (r.meta.changes) await logAudit(db, 'lia.apagada', ator, `LIA do tratamento ${ropaId} apagada`, '', '', projectId);
  return (r.meta.changes ?? 0) > 0;
}

/** Hash do conteúdo do tratamento agora (o mesmo da aprovação): a DPIA/LIA guarda de qual versão do RoPA nasceu. */
export const hashDoTratamento = async (db: D1Database, projectId: string, ropaId: string) => {
  const doc = await documentoAtual(db, 'tratamento', ropaId, projectId);
  return doc ? hashConteudo(doc.conteudo) : null;
};

type RegistroParaDpia = {
  processing_purpose: string; data_subjects: string | null; data_categories: string | null; retention_period: string | null; recipients: string | null;
  dados_sensiveis: number; criancas_adolescentes: number; legal_basis: string | null; base_legal: string | null;
};

/**
 * Selo "mudou na origem" (F3): a DPIA/LIA guardou em `origem_hash` o hash do tratamento quando nasceu; se o de hoje é outro, o RoPA
 * mudou depois. Só avisa: nada é invalidado. Sem `origem_hash` (nascida antes da 0072 ou à mão) não há como saber: false.
 * Um hash por tratamento, calculado uma vez.
 */
export async function comOrigemMudou<T extends { ropa_id?: unknown; origem_hash?: unknown }>(db: D1Database, projectId: string, linhas: T[]): Promise<(T & { origem_mudou: boolean })[]> {
  const atuais = new Map<string, string | null>();
  for (const l of linhas) {
    if (typeof l.ropa_id === 'string' && l.origem_hash && !atuais.has(l.ropa_id)) atuais.set(l.ropa_id, await hashDoTratamento(db, projectId, l.ropa_id));
  }
  return linhas.map((l) => ({ ...l, origem_mudou: !!l.origem_hash && typeof l.ropa_id === 'string' && atuais.get(l.ropa_id) !== l.origem_hash }));
}

/**
 * DPIA `Draft` já ligada ao tratamento e pré-preenchida com o que o registro sabe (nada se pergunta de novo): finalidade, titulares,
 * categorias, fluxo (ligações, destinatários e ciclo de vida), bases legais (principal, adicionais e GDPR) e retenção (necessidade),
 * riscos do registro e o teste de impacto.
 * `origem_hash` guarda o hash do tratamento nesse momento. 409 (com o id) se já existe uma.
 */
export async function criarDpiaDoTratamento(
  db: D1Database, projectId: string, ropaId: string, ator: string,
  lig: { itens: { nome: string; tipo: string }[]; departamentos: { nome: string }[]; partes: { nome: string; papel: string }[]; transferencias: { pais: string; destinatario: string | null; mecanismo: string | null }[] },
): Promise<Falha | { ok: true; id: string } | { ok: false; status: 409; error: string; id: string }> {
  const reg = await db.prepare(
    `SELECT r.processing_purpose, r.data_subjects, r.data_categories, r.retention_period, r.recipients, r.dados_sensiveis, r.criancas_adolescentes, r.legal_basis,
            (SELECT q.referencia || ' - ' || q.titulo FROM requisitos q WHERE q.id = r.base_legal_id) AS base_legal
       FROM ropa_records r WHERE r.id = ? AND r.project_id = ?`
  ).bind(ropaId, projectId).first<RegistroParaDpia>();
  if (!reg) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const ja = await db.prepare('SELECT id FROM dpia_assessments WHERE ropa_id = ? AND project_id = ? ORDER BY created_at LIMIT 1').bind(ropaId, projectId).first<{ id: string }>();
  if (ja) return { ok: false, status: 409, error: 'Já existe DPIA ligada a este tratamento', id: ja.id };
  const linhas = [
    lig.itens.length ? `Sistemas, bases e processos: ${lig.itens.map((i) => `${i.nome} (${i.tipo})`).join(', ')}` : '',
    lig.departamentos.length ? `Departamentos: ${lig.departamentos.map((d) => d.nome).join(', ')}` : '',
    lig.partes.length ? `Partes: ${lig.partes.map((p) => `${p.nome} (${p.papel})`).join(', ')}` : '',
    lig.transferencias.length ? `Transferências: ${lig.transferencias.map((t) => `${t.pais}${t.destinatario ? ` para ${t.destinatario}` : ''}${t.mecanismo ? ` (${t.mecanismo})` : ''}`).join('; ')}` : '',
    reg.recipients ? `Destinatários: ${reg.recipients}` : '',
  ].filter(Boolean);
  const ciclo = cicloEmTexto((await lerCiclo(db, projectId, ropaId)) ?? []);
  if (ciclo.length) linhas.push(`Ciclo de vida: ${ciclo.join('; ')}`);
  const bases = await lerBases(db, projectId, ropaId);
  const base = [reg.base_legal, reg.legal_basis].filter(Boolean).join('; ');
  const necessidade = [base ? `Base legal: ${base}.` : '', ...(bases ? basesEmTexto(bases) : []), reg.retention_period ? `Retenção: ${reg.retention_period}.` : ''].filter(Boolean).join(' ');
  const impacto = await lerImpacto(db, projectId, ropaId);
  const sim = impacto?.perguntas.filter((p) => p.resposta === 'sim').map((p) => p.id) ?? [];
  const riscos = [
    reg.dados_sensiveis ? 'Dados pessoais sensíveis (LGPD art. 11).' : '',
    reg.criancas_adolescentes ? 'Dados de crianças e adolescentes (LGPD art. 14).' : '',
    impacto && sim.length ? `Teste de impacto (${RESULTADO_IMPACTO[impacto.recomendacao.resultado]}), respondidas sim: ${sim.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, system_name, data_subjects_types, personal_data_categories, data_flow_description,
       necessity_proportionality, risks_identified, origem_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`
  ).bind(id, projectId, ropaId, reg.processing_purpose, lig.itens.map((i) => i.nome).join(', ') || null, reg.data_subjects, reg.data_categories, linhas.join('\n') || null,
    necessidade || null, riscos || null, await hashDoTratamento(db, projectId, ropaId)).run();
  await logAudit(db, 'dpia.criada_do_tratamento', ator, `DPIA ${id} criada a partir do tratamento ${ropaId}`, '', '', projectId);
  return { ok: true, id };
}
