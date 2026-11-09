import { logAudit } from '../helpers';
import { nivelDaCriticidade, tipoDaCriticidade, type NivelCriticidade, type RespostasCriticidade } from './criticidade';
import { hojeEmSaoPaulo } from './hoje';
import { prazoDoTipo, somarMeses } from './fornecedor-modelos';

/**
 * Núcleo do n.privacy, fatia 6: terceiros (TPRM) tipificados. O terceiro é uma parte do tipo `organizacao`; o tipo define o
 * método de avaliação (o servidor decide); a avaliação tem validade e a situação é DERIVADA dela (nunca gravada).
 */

export const TIPOS_TERCEIRO = ['grande_provedor', 'medio', 'pequeno', 'critico'] as const;
export type TipoTerceiro = (typeof TIPOS_TERCEIRO)[number];
export type Metodo = 'trust_center' | 'questionario' | 'auditoria';
export type Situacao = 'pendente' | 'vigente' | 'vencida' | 'reprovada' | 'reavaliar';

/** O tipo define o método formal da avaliação (spec seção 5). Trust center é link mais validade, preenchido à mão. */
export const METODO_DO_TIPO: Record<TipoTerceiro, Metodo> = { grande_provedor: 'trust_center', medio: 'questionario', pequeno: 'questionario', critico: 'auditoria' };

/**
 * Quem pode receber um questionário de homologação. Desacoplado do método: o crítico tem método formal `auditoria`, mas também
 * recebe questionário (é o de maior criticidade — precisa do questionário conforme pedido do dono). O grande provedor fica de
 * fora (trust center de hiperescala; questionário próprio não é acionável). A avaliação gerada pelo questionário registra o
 * método `questionario`, decidido no servidor, sem mudar o método formal do tipo.
 */
export const PODE_QUESTIONARIO: ReadonlySet<TipoTerceiro> = new Set<TipoTerceiro>(['medio', 'pequeno', 'critico']);

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const hoje = () => hojeEmSaoPaulo();
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type Avaliacao = {
  id: string; metodo: Metodo; resultado: 'aprovado' | 'com_ressalvas' | 'reprovado'; valido_ate: string;
  evidencia_url: string | null; observacao: string | null; avaliado_por: string | null; created_at: string;
  /** o tipo do fornecedor quando a avaliação foi feita (0106); null nas anteriores à fatia 2 que a migration não alcançou */
  tipo_avaliado?: string | null;
};

/**
 * Situação derivada da avaliação MAIS RECENTE: reprovada, vencida (passou de `valido_ate`), reavaliar (no prazo, mas feita noutro tipo:
 * o modelo e o prazo mudaram), vigente ou pendente (nunca avaliado).
 */
export function situacaoDe(ultima: Pick<Avaliacao, 'resultado' | 'valido_ate' | 'tipo_avaliado'> | null | undefined, em = hoje(), tipoAtual: TipoTerceiro | null = null): Situacao {
  if (!ultima) return 'pendente';
  if (ultima.resultado === 'reprovado') return 'reprovada';
  if (ultima.valido_ate < em) return 'vencida';
  return tipoAtual && ultima.tipo_avaliado && ultima.tipo_avaliado !== tipoAtual ? 'reavaliar' : 'vigente';
}

export type Terceiro = {
  id: string; nome: string; cnpj: string | null; terceiro_tipo: TipoTerceiro | null; metodo: Metodo | null; situacao: Situacao;
  /** o terceiro pode receber questionário de homologação (médio, pequeno ou crítico), independente do método formal */
  pode_questionario: boolean;
  ultima_avaliacao: Avaliacao | null; tratamentos: number; documentos: number;
  /** nível da criticidade mais recente; null = nunca avaliada */
  nivel: NivelCriticidade | null; dpa: boolean; atividades: number;
  /** o que falta para o critério de pronto da rotina de TPRM, na ordem Tipo, Criticidade, Avaliação, DPA; vazia = completo */
  pendencias: string[];
};

/** Critério de pronto da skill avaliacao-terceiros: tipo, criticidade, avaliação vigente e DPA ligado. Pura. */
export function pendenciasDe(t: Pick<Terceiro, 'terceiro_tipo' | 'nivel' | 'situacao' | 'dpa'>): string[] {
  return [!t.terceiro_tipo && 'Tipo', !t.nivel && 'Criticidade', t.situacao !== 'vigente' && 'Avaliação', !t.dpa && 'DPA'].filter((x): x is string => !!x);
}

/** Atividades que usam a parte, pelas duas origens: vínculo (`parte_vinculos`) e compartilhamento externo da atividade. */
const SQL_ATIVIDADES = `SELECT parte_id, alvo_id AS ropa_id, 'vinculo' AS origem FROM parte_vinculos WHERE project_id = ?1 AND alvo_tipo = 'tratamento'
  UNION ALL SELECT parte_id, ropa_id, 'compartilhamento_externo' FROM tratamento_externo_parceiros WHERE project_id = ?1`;

const COLS_AVALIACAO = 'id, parte_id, metodo, resultado, valido_ate, evidencia_url, observacao, avaliado_por, created_at, tipo_avaliado';

/**
 * Organização que o n.iso importou só como parte interessada (a ANPD, um cliente) e que nada no n.privacy usa: sem tipo, avaliação,
 * documento, perfil de fornecedor nem outro vínculo. Não é terceiro; qualquer uso (tipificar, avaliar, ligar a tratamento) a traz de volta.
 */
const SO_PARTE_INTERESSADA = `EXISTS (SELECT 1 FROM parte_vinculos v WHERE v.parte_id = p.id AND v.papel = 'parte_interessada')
  AND NOT EXISTS (SELECT 1 FROM parte_vinculos v WHERE v.parte_id = p.id AND v.papel != 'parte_interessada')
  AND p.terceiro_tipo IS NULL
  AND NOT EXISTS (SELECT 1 FROM avaliacoes_terceiro a WHERE a.parte_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM documento_partes d WHERE d.parte_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM documentos_arquivo_partes d WHERE d.parte_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM vendors f WHERE f.parte_id = p.id)`;

/** Quem é fornecedor, igual nos dois módulos e em toda contagem: organização ativa que não é só parte interessada. Alias `p` = partes. */
export const SQL_EH_FORNECEDOR = `p.tipo = 'organizacao' AND p.status = 'ativa' AND NOT (${SO_PARTE_INTERESSADA})`;

/**
 * O fornecedor tem DPA: documento ligado com papel `dpa` (decisão de 20/10/2026, fonte única nos dois módulos). `vendors.dpa_signed`
 * e `dpa_url` são histórico ("declarado, sem documento") e não contam. Alias `p` = partes. Desde a 0086 o documento em arquivo também vale,
 * mas só publicado e com arquivo anexado (`SQL_ARQUIVO_VALE`, alias `a`): rascunho, obsoleto e documento sem arquivo não provam nada.
 */
export const SQL_ARQUIVO_VALE = `a.status = 'publicado' AND a.r2_key IS NOT NULL`;
/** O documento versionado só prova o DPA VIGENTE (rascunho e obsoleto não valem), como o em arquivo só publicado (`SQL_ARQUIVO_VALE`). Alias `dv`. */
export const SQL_VERSIONADO_VALE = `dv.status = 'vigente'`;
export const SQL_TEM_DPA = `(EXISTS (SELECT 1 FROM documento_partes d JOIN documentos dv ON dv.id = d.documento_id WHERE d.parte_id = p.id AND d.project_id = p.project_id AND d.papel = 'dpa' AND ${SQL_VERSIONADO_VALE})
  OR EXISTS (SELECT 1 FROM documentos_arquivo_partes ap JOIN documentos_arquivo a ON a.id = ap.documento_arquivo_id
              WHERE ap.parte_id = p.id AND ap.project_id = p.project_id AND ap.papel = 'dpa' AND ${SQL_ARQUIVO_VALE}))`;

/** As colunas do perfil de segurança (`vendors`) que entram no índice de confiança. */
export type PerfilDoIndice = Partial<Record<'has_iso27001' | 'has_iso27701' | 'has_soc2' | 'has_mfa' | 'has_encryption' | 'has_backup' | 'has_incident_plan' | 'has_pentest', unknown>>
  & { trust_center_url?: string | null };

/** Índice de confiança do fornecedor (0 a 100). O DPA vale 10 pontos só com documento ligado (`SQL_TEM_DPA`). */
export function indiceDeConfianca(v: PerfilDoIndice, temDpa: boolean): number {
  const pontos: [unknown, number][] = [[v.has_iso27001, 20], [v.has_iso27701, 15], [v.has_soc2, 15], [v.has_mfa, 10], [v.has_encryption, 15],
    [v.has_backup, 10], [v.has_incident_plan, 10], [v.has_pentest, 10], [v.trust_center_url?.trim(), 5], [temDpa, 10]];
  return Math.min(100, pontos.reduce((s, [tem, n]) => s + (tem ? n : 0), 0));
}

export function nivelDeDiligencia(indice: number): string {
  if (indice > 90) return 'Low';
  if (indice > 60) return 'Medium';
  return 'High';
}

export async function temDpa(db: D1Database, parteId: string): Promise<boolean> {
  return !!(await db.prepare(`SELECT 1 FROM partes p WHERE p.id = ? AND ${SQL_TEM_DPA}`).bind(parteId).first());
}

/** Recalcula o índice e a diligência do perfil de segurança da parte (se houver) quando o DPA é ligado ou desligado. */
export async function recalcularIndice(db: D1Database, parteId: string): Promise<void> {
  const v = await db.prepare('SELECT * FROM vendors WHERE parte_id = ?').bind(parteId).first<PerfilDoIndice>();
  if (!v) return;
  const indice = indiceDeConfianca(v, await temDpa(db, parteId));
  await db.prepare('UPDATE vendors SET trust_score = ?, diligence_level = ? WHERE parte_id = ?').bind(indice, nivelDeDiligencia(indice), parteId).run();
}

/** Fornecedores que usam o documento em arquivo como DPA: a situação dele (publicar, anexar, apagar) muda o índice de confiança deles. */
export async function partesComDpaDoArquivo(db: D1Database, arquivoId: string): Promise<string[]> {
  const r = await db.prepare(`SELECT DISTINCT parte_id FROM documentos_arquivo_partes WHERE documento_arquivo_id = ? AND papel = 'dpa'`).bind(arquivoId).all<{ parte_id: string }>();
  return r.results.map((x) => x.parte_id);
}

/** Terceiros do projeto (partes organização ativas, menos as que são só parte interessada) com tipo, situação, nº de tratamentos que os usam e nº de documentos (DPA). */
export async function listarTerceiros(db: D1Database, projectId: string): Promise<Terceiro[]> {
  const [partes, avals, trat, docs, crits, dpas] = await db.batch([
    db.prepare(`SELECT id, nome, cnpj, terceiro_tipo FROM partes p WHERE project_id = ?1 AND ${SQL_EH_FORNECEDOR} ORDER BY nome`).bind(projectId),
    db.prepare(`SELECT ${COLS_AVALIACAO} FROM avaliacoes_terceiro WHERE project_id = ? ORDER BY created_at, rowid`).bind(projectId),
    db.prepare(`SELECT parte_id, count(DISTINCT ropa_id) AS n FROM (${SQL_ATIVIDADES}) GROUP BY parte_id`).bind(projectId),
    db.prepare(`SELECT parte_id, count(*) AS n FROM (SELECT parte_id, documento_id AS doc FROM documento_partes WHERE project_id = ?1
      UNION SELECT parte_id, documento_arquivo_id FROM documentos_arquivo_partes WHERE project_id = ?1) GROUP BY parte_id`).bind(projectId),
    db.prepare(`SELECT parte_id, nivel FROM criticidades_terceiro WHERE project_id = ? ORDER BY created_at, rowid`).bind(projectId),
    db.prepare(`SELECT p.id AS parte_id FROM partes p WHERE p.project_id = ? AND ${SQL_TEM_DPA}`).bind(projectId),
  ]);
  const nivel = new Map<string, NivelCriticidade>();
  for (const c of crits.results as { parte_id: string; nivel: NivelCriticidade }[]) nivel.set(c.parte_id, c.nivel); // ordenado: a última sobrescreve
  const comDpa = new Set((dpas.results as { parte_id: string }[]).map((d) => d.parte_id));
  const ultima = new Map<string, Avaliacao>();
  for (const a of avals.results as (Avaliacao & { parte_id: string })[]) ultima.set(a.parte_id, a); // ordenado: a última sobrescreve
  const n = (r: { results: unknown[] }) => new Map((r.results as { parte_id: string; n: number }[]).map((x) => [x.parte_id, x.n]));
  const nt = n(trat), nd = n(docs);
  return (partes.results as { id: string; nome: string; cnpj: string | null; terceiro_tipo: TipoTerceiro | null }[]).map((p) => {
    const u = ultima.get(p.id) ?? null;
    const atividades = nt.get(p.id) ?? 0;
    const t = { id: p.id, nome: p.nome, cnpj: p.cnpj, terceiro_tipo: p.terceiro_tipo, metodo: p.terceiro_tipo ? METODO_DO_TIPO[p.terceiro_tipo] : null,
      pode_questionario: !!p.terceiro_tipo && PODE_QUESTIONARIO.has(p.terceiro_tipo), situacao: situacaoDe(u, hoje(), p.terceiro_tipo), ultima_avaliacao: u,
      tratamentos: atividades, documentos: nd.get(p.id) ?? 0, nivel: nivel.get(p.id) ?? null, dpa: comDpa.has(p.id), atividades };
    return { ...t, pendencias: pendenciasDe(t) };
  });
}

/** Organizações ativas que a lista de terceiros esconde (só parte interessada): quem quiser tratá-las como terceiro tipifica uma. */
export async function listarCandidatos(db: D1Database, projectId: string): Promise<{ id: string; nome: string }[]> {
  const r = await db.prepare(`SELECT id, nome FROM partes p WHERE project_id = ?1 AND tipo = 'organizacao' AND status = 'ativa' AND (${SO_PARTE_INTERESSADA}) ORDER BY nome`)
    .bind(projectId).all<{ id: string; nome: string }>();
  return r.results;
}

/** A ficha do terceiro: dados, e-mail, perfil de segurança (`vendors`, as colunas de GET .../vendors), histórico, documentos ligados,
 * suboperadores e as atividades que o usam (o mesmo tratamento pelas duas origens aparece uma vez, como vínculo). null = não é do projeto. */
export async function lerTerceiro(db: D1Database, projectId: string, parteId: string) {
  const todos = await listarTerceiros(db, projectId);
  const t = todos.find((x) => x.id === parteId);
  if (!t) return null;
  const [hist, docs, subs, trat, parte, seg, resp] = await db.batch([
    db.prepare(`SELECT ${COLS_AVALIACAO} FROM avaliacoes_terceiro WHERE parte_id = ? AND project_id = ? ORDER BY created_at DESC, rowid DESC`).bind(parteId, projectId),
    db.prepare(`SELECT * FROM (SELECT d.id, d.titulo, d.status, dp.papel, 'versionado' AS origem FROM documento_partes dp JOIN documentos d ON d.id = dp.documento_id WHERE dp.parte_id = ?1 AND dp.project_id = ?2
      UNION ALL SELECT a.id, a.nome, a.status, ap.papel, 'arquivo' FROM documentos_arquivo_partes ap JOIN documentos_arquivo a ON a.id = ap.documento_arquivo_id WHERE ap.parte_id = ?1 AND ap.project_id = ?2) ORDER BY titulo`).bind(parteId, projectId),
    db.prepare(`SELECT p.id, p.nome FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id WHERE v.papel = 'suboperador' AND v.alvo_tipo = 'parte' AND v.alvo_id = ? AND v.project_id = ? ORDER BY p.nome`).bind(parteId, projectId),
    // 'compartilhamento_externo' < 'vinculo': o MAX dá vínculo quando o tratamento vem pelas duas origens
    db.prepare(`SELECT r.id, r.processing_purpose AS finalidade, MAX(a.origem) AS origem FROM (${SQL_ATIVIDADES}) a JOIN ropa_records r ON r.id = a.ropa_id
      WHERE a.parte_id = ?2 GROUP BY r.id ORDER BY r.processing_purpose`).bind(projectId, parteId),
    db.prepare(`SELECT email FROM partes WHERE id = ? AND project_id = ?`).bind(parteId, projectId),
    // o perfil de segurança é opcional: o terceiro já passou pelo critério de fornecedor (`listarTerceiros`)
    db.prepare(`SELECT v.*, p.nome AS name FROM vendors v JOIN partes p ON p.id = v.parte_id WHERE v.parte_id = ?1 AND v.project_id = ?2`).bind(parteId, projectId),
    // responsável do fornecedor: a pessoa com o vínculo `responsavel` sobre esta organização (o vínculo que o núcleo já tem)
    db.prepare(`SELECT v.id AS vinculo_id, p.id, p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id WHERE v.papel = 'responsavel' AND v.alvo_tipo = 'parte' AND v.alvo_id = ? AND v.project_id = ? ORDER BY p.nome`).bind(parteId, projectId),
  ]);
  // o índice sai calculado agora, como na lista do n.iso (`comIndiceAtual`): o gravado envelhece quando o DPA muda de situação
  const perfil = seg.results[0] as (PerfilDoIndice & Record<string, unknown>) | undefined;
  const seguranca = perfil ? { ...perfil, trust_score: indiceDeConfianca(perfil, t.dpa), diligence_level: nivelDeDiligencia(indiceDeConfianca(perfil, t.dpa)) } : null;
  // a data máxima da nova avaliação, pelo prazo do modelo do tipo atual (a tela preenche e trava o campo)
  const validade_maxima = t.terceiro_tipo ? somarMeses(hoje(), await prazoDoTipo(db, projectId, t.terceiro_tipo)) : null;
  return { ...t, validade_maxima, email: (parte.results[0] as { email: string | null } | undefined)?.email ?? null, seguranca, responsaveis: resp.results,
    historico: hist.results as Avaliacao[], documentos_ligados: docs.results, suboperadores: subs.results, tratamentos_afetados: trat.results };
}

const parteDoProjeto = (db: D1Database, projectId: string, parteId: string) =>
  db.prepare(`SELECT id, tipo, terceiro_tipo, status FROM partes WHERE id = ? AND project_id = ?`).bind(parteId, projectId).first<{ id: string; tipo: string; terceiro_tipo: TipoTerceiro | null; status: string }>();

export async function definirTipo(db: D1Database, projectId: string, parteId: string, ator: string, tipo: TipoTerceiro | null): Promise<Falha | { ok: true }> {
  const p = await parteDoProjeto(db, projectId, parteId);
  if (!p) return falha(404, 'Parte não encontrada');
  if (p.tipo !== 'organizacao') return falha(400, 'Só organização é terceiro');
  await db.prepare(`UPDATE partes SET terceiro_tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(tipo, parteId, projectId).run();
  // tipado é terceiro do projeto: o vínculo faz o gatilho vendor_perfil_do_terceiro criar o perfil de segurança do n.iso
  if (tipo) await db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'terceiro', 'projeto', ?)`)
    .bind(crypto.randomUUID(), projectId, parteId, projectId).run();
  await logAudit(db, 'terceiro.tipo', ator, `Parte ${parteId}: tipo de terceiro ${p.terceiro_tipo ?? '—'} → ${tipo ?? '—'}`, '', '', projectId);
  return { ok: true };
}

export type NovaAvaliacao = { resultado: Avaliacao['resultado']; valido_ate: string; evidencia_url?: string | null; observacao?: string | null };

/**
 * Registra a avaliação. A validade é obrigatória e não pode estar no passado. `metodoForcado` é decidido pelo SERVIDOR (só a
 * conclusão do questionário o usa, para gravar `questionario` mesmo no crítico, cujo método formal é `auditoria`); nunca vem do corpo.
 */
export async function registrarAvaliacao(db: D1Database, projectId: string, parteId: string, ator: string, d: NovaAvaliacao, metodoForcado?: Metodo): Promise<Falha | { ok: true; id: string; metodo: Metodo }> {
  const p = await parteDoProjeto(db, projectId, parteId);
  if (!p) return falha(404, 'Parte não encontrada');
  if (p.tipo !== 'organizacao') return falha(400, 'Só organização é terceiro');
  if (p.status !== 'ativa') return falha(409, 'Fornecedor inativo não recebe avaliação: reative a organização antes');
  if (!p.terceiro_tipo) return falha(400, 'Defina o tipo do terceiro antes de registrar a avaliação');
  if (!dataValida(d.valido_ate)) return falha(400, 'valido_ate precisa ser uma data AAAA-MM-DD');
  if (d.valido_ate < hoje()) return falha(400, 'valido_ate não pode estar no passado');
  // teto: o prazo do modelo do tipo ATUAL (fatia 2); o tipo da avaliação fica gravado para a reavaliação quando ele mudar
  const meses = await prazoDoTipo(db, projectId, p.terceiro_tipo);
  const maxima = somarMeses(hoje(), meses);
  if (d.valido_ate > maxima) return falha(400, `A validade passa do prazo máximo do tipo (${meses} meses): até ${maxima.split('-').reverse().join('/')}`);
  const metodo = metodoForcado ?? METODO_DO_TIPO[p.terceiro_tipo];
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, evidencia_url, observacao, avaliado_por, tipo_avaliado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, parteId, metodo, d.resultado, d.valido_ate, d.evidencia_url ?? null, d.observacao ?? null, ator, p.terceiro_tipo).run();
  await logAudit(db, 'terceiro.avaliacao', ator, `Parte ${parteId}: avaliação ${metodo} (${d.resultado}) válida até ${d.valido_ate}`, '', '', projectId);
  return { ok: true, id, metodo };
}

export type PapelDocumento = 'dpa' | 'contrato' | 'outro';

/** `versionado` = `documentos` (política, norma…); `arquivo` = `documentos_arquivo` (o PDF/DOCX do legado, 0086). Nome de tabela só desta lista. */
export type OrigemDocumento = 'versionado' | 'arquivo';
const LIGACAO: Record<OrigemDocumento, { documento: string; ligacao: string; coluna: string }> = {
  versionado: { documento: 'documentos', ligacao: 'documento_partes', coluna: 'documento_id' },
  arquivo: { documento: 'documentos_arquivo', ligacao: 'documentos_arquivo_partes', coluna: 'documento_arquivo_id' },
};

export async function ligarDocumento(db: D1Database, projectId: string, parteId: string, ator: string, documentoId: string, papel: PapelDocumento, origem: OrigemDocumento = 'versionado'): Promise<Falha | { ok: true }> {
  const t = LIGACAO[origem];
  if (!(await parteDoProjeto(db, projectId, parteId))) return falha(404, 'Parte não encontrada');
  if (!(await db.prepare(`SELECT 1 FROM ${t.documento} WHERE id = ? AND project_id = ?`).bind(documentoId, projectId).first())) return falha(400, 'Documento inexistente ou de outro projeto');
  try {
    await db.prepare(`INSERT INTO ${t.ligacao} (${t.coluna}, parte_id, papel, project_id) VALUES (?, ?, ?, ?)`).bind(documentoId, parteId, papel, projectId).run();
  } catch (e) {
    if (/UNIQUE|PRIMARY KEY/i.test(String((e as Error)?.message))) return falha(409, 'Esse documento já está ligado a este terceiro com esse papel');
    throw e;
  }
  if (papel === 'dpa') await recalcularIndice(db, parteId);
  await logAudit(db, 'terceiro.documento', ator, `Parte ${parteId}: documento${origem === 'arquivo' ? ' em arquivo' : ''} ${documentoId} ligado como ${papel}`, '', '', projectId);
  return { ok: true };
}

export async function desligarDocumento(db: D1Database, projectId: string, parteId: string, ator: string, documentoId: string, papel: PapelDocumento, origem: OrigemDocumento = 'versionado'): Promise<boolean> {
  const t = LIGACAO[origem];
  const r = await db.prepare(`DELETE FROM ${t.ligacao} WHERE ${t.coluna} = ? AND parte_id = ? AND papel = ? AND project_id = ?`).bind(documentoId, parteId, papel, projectId).run();
  if (!r.meta.changes) return false;
  if (papel === 'dpa') await recalcularIndice(db, parteId);
  await logAudit(db, 'terceiro.documento', ator, `Parte ${parteId}: documento${origem === 'arquivo' ? ' em arquivo' : ''} ${documentoId} desligado (${papel})`, '', '', projectId);
  return true;
}

export type Criticidade = RespostasCriticidade & { id: string; nivel: NivelCriticidade; avaliado_por: string | null; created_at: string };

/** Histórico de criticidade do fornecedor, o mais recente primeiro. `atual` é null enquanto nunca foi avaliado. */
export async function lerCriticidades(db: D1Database, projectId: string, parteId: string): Promise<{ atual: Criticidade | null; historico: Criticidade[] } | null> {
  if (!(await parteDoProjeto(db, projectId, parteId))) return null;
  const r = await db.prepare(`SELECT id, impacto, exclusividade, risco_financeiro, conformidade, risco_reputacional, nivel, avaliado_por, created_at
    FROM criticidades_terceiro WHERE parte_id = ? AND project_id = ? ORDER BY created_at DESC, rowid DESC`).bind(parteId, projectId).all<Criticidade>();
  return { atual: r.results[0] ?? null, historico: r.results };
}

/** Grava a avaliação e ajusta o tipo pelo nível (grande_provedor fica). O nível é derivado aqui, nunca vem do cliente. */
export async function registrarCriticidade(db: D1Database, projectId: string, parteId: string, ator: string, r: RespostasCriticidade): Promise<Falha | { ok: true; id: string; nivel: NivelCriticidade; tipo: TipoTerceiro }> {
  const p = await parteDoProjeto(db, projectId, parteId);
  if (!p) return falha(404, 'Parte não encontrada');
  if (p.tipo !== 'organizacao') return falha(400, 'Só organização é terceiro');
  const nivel = nivelDaCriticidade(r);
  const tipo = tipoDaCriticidade(nivel, p.terceiro_tipo);
  const id = crypto.randomUUID();
  // Histórico e troca do tipo no MESMO batch (transação no D1): ou gravam os dois, ou nenhum.
  const gravacoes = [db.prepare(`INSERT INTO criticidades_terceiro (id, project_id, parte_id, impacto, exclusividade, risco_financeiro, conformidade, risco_reputacional, nivel, avaliado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, projectId, parteId, r.impacto, r.exclusividade, r.risco_financeiro, r.conformidade, r.risco_reputacional, nivel, ator)];
  if (tipo !== p.terceiro_tipo) gravacoes.push(
    db.prepare(`UPDATE partes SET terceiro_tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(tipo, parteId, projectId),
    // mesmo vínculo que definirTipo grava: é ele que faz o gatilho criar o perfil de segurança do n.iso
    db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'terceiro', 'projeto', ?)`).bind(crypto.randomUUID(), projectId, parteId, projectId),
  );
  await db.batch(gravacoes);
  await logAudit(db, 'terceiro.criticidade', ator, `Parte ${parteId}: criticidade ${nivel} (tipo ${tipo})`, '', '', projectId);
  return { ok: true, id, nivel, tipo };
}
