import { logAudit } from '../helpers';
import { prazoDe, proximoProtocolo } from './parametros-legais';
import { hojeEmSaoPaulo, diaEmSaoPaulo } from './hoje';

/**
 * Núcleo do n.privacy, fatia 7: incidente de segurança com dado pessoal (registro interno). Protocolo `IN-AAAA-NNNN`; os dois prazos de
 * comunicação saem dos parâmetros e contam da CIÊNCIA, congelados na criação (sem parâmetro ficam nulos). Encerrar exige risco avaliado, e
 * risco relevante exige a comunicação à ANPD registrada (o CHECK do banco também barra).
 */

export const RISCOS = ['sem_risco', 'baixo', 'relevante'] as const;
type Risco = (typeof RISCOS)[number];
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });

const agora = () => new Date().toISOString();
const ehInstante = (s: string) => /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(s) && !Number.isNaN(Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s));

export type SituacaoComunicacao = 'sem_prazo' | 'comunicado' | 'no_prazo' | 'vence_hoje' | 'atrasado' | 'nao_exigida';
/** Riscos avaliados em que a comunicação à ANPD e aos titulares não é exigida (Res. CD/ANPD 15/2024, arts. 5º e 9º: só risco ou dano relevante). */
export const RISCOS_SEM_COMUNICACAO: readonly Risco[] = ['sem_risco', 'baixo'];
/** A mesma regra em SQL, para as contas que não passam por `situacaoDaComunicacao` (painel, carteira, avisos). `col` é a coluna do risco. */
export const sqlComunicacaoExigida = (col: string) => `COALESCE(${col}, '') NOT IN (${RISCOS_SEM_COMUNICACAO.map((r) => `'${r}'`).join(', ')})`;
/**
 * Cada comunicação: feita; não exigida (risco avaliado sem_risco ou baixo); ou o prazo em relação a hoje (sem prazo = parâmetro não
 * cadastrado). Risco ainda não avaliado conta o prazo: o risco não pode esconder o prazo antes da avaliação.
 */
export function situacaoDaComunicacao(prazo: string | null, feita: string | null, risco: Risco | null, em = hojeEmSaoPaulo()): SituacaoComunicacao {
  if (feita) return 'comunicado';
  if (risco && RISCOS_SEM_COMUNICACAO.includes(risco)) return 'nao_exigida';
  if (!prazo) return 'sem_prazo';
  const dia = diaEmSaoPaulo(prazo)!;
  return dia < em ? 'atrasado' : dia === em ? 'vence_hoje' : 'no_prazo';
}

const COLS = 'id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, risco_titular, avaliacao_texto, comunicacao_anpd_em, comunicacao_titular_em, prazo_anpd_em, prazo_titular_em, status, responsavel_parte_id, criado_por, created_at, updated_at, origem_alerta, severidade, tipo, comprometimento, titulares_estimados, criterios_risco, fim_em, anpd_protocolo, anpd_canal, anpd_justificativa';
export type Incidente = {
  id: string; protocolo: string; titulo: string; descricao: string | null; ocorrido_em: string | null; ciencia_em: string; risco_titular: Risco | null; avaliacao_texto: string | null;
  comunicacao_anpd_em: string | null; comunicacao_titular_em: string | null; prazo_anpd_em: string | null; prazo_titular_em: string | null; status: string; responsavel_parte_id: string | null;
  origem_alerta: string | null; severidade: string | null; tipo: string | null; comprometimento: string | null; titulares_estimados: number | null; criterios_risco: string | null; fim_em: string | null;
  anpd_protocolo: string | null; anpd_canal: string | null; anpd_justificativa: string | null;
};
const lista = (json: string | null): string[] => { try { const v = JSON.parse(json ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const comSituacao = (i: Incidente) => ({
  ...i,
  comprometimento: lista(i.comprometimento),
  criterios_risco: lista(i.criterios_risco),
  situacao_anpd: situacaoDaComunicacao(i.prazo_anpd_em, i.comunicacao_anpd_em, i.risco_titular),
  situacao_titular: situacaoDaComunicacao(i.prazo_titular_em, i.comunicacao_titular_em, i.risco_titular),
  // Protocolo interno da comunicação à ANPD (o legado mostra `-COM01`): derivado, sem coluna; uma comunicação por incidente.
  anpd_protocolo_interno: i.comunicacao_anpd_em ? `${i.protocolo}-COM01` : null,
});

export async function listarIncidentes(db: D1Database, projectId: string) {
  const { results } = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE project_id = ? ORDER BY ciencia_em DESC, protocolo DESC`).bind(projectId).all<Incidente>();
  return results.map(comSituacao);
}

/** O incidente com as áreas e os titulares × dados afetados (nomes do cadastro). */
export async function lerIncidente(db: D1Database, projectId: string, id: string) {
  const i = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE id = ? AND project_id = ?`).bind(id, projectId).first<Incidente>();
  if (!i) return null;
  const [areas, dados] = await Promise.all([
    db.prepare(`SELECT d.id, d.nome FROM incidente_departamentos x JOIN departamentos d ON d.id = x.departamento_id
                WHERE x.incidente_id = ? AND x.project_id = ? ORDER BY d.nome`).bind(id, projectId).all<{ id: string; nome: string }>(),
    db.prepare(`SELECT x.titular_id, t.nome AS titular, x.dado_id, d.nome AS dado, d.sensivel FROM incidente_dados x
                JOIN catalogo_itens t ON t.id = x.titular_id JOIN catalogo_itens d ON d.id = x.dado_id
                WHERE x.incidente_id = ? AND x.project_id = ? ORDER BY t.nome, d.nome`).bind(id, projectId).all<{ titular_id: string; titular: string; dado_id: string; dado: string; sensivel: number }>(),
  ]);
  return { ...comSituacao(i), areas: areas.results, dados: dados.results };
}

export type NovoIncidente = { titulo: string; descricao?: string | null; ocorrido_em?: string | null; ciencia_em: string; responsavel_parte_id?: string | null };

export async function criarIncidente(db: D1Database, projectId: string, ator: string, d: NovoIncidente): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_anpd_em: string | null; prazo_titular_em: string | null }> {
  if (!ehInstante(d.ciencia_em)) return falha(400, 'ciencia_em precisa ser uma data (AAAA-MM-DD) ou data e hora ISO');
  if (Date.parse(d.ciencia_em.length === 10 ? `${d.ciencia_em}T00:00:00Z` : d.ciencia_em) > Date.now() + 60_000) return falha(400, 'ciencia_em não pode estar no futuro');
  if (d.ocorrido_em && !ehInstante(d.ocorrido_em)) return falha(400, 'ocorrido_em precisa ser uma data ou data e hora ISO');
  if (d.responsavel_parte_id && !(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.responsavel_parte_id, projectId).first())) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');
  const [prazoAnpd, prazoTitular] = await Promise.all([prazoDe(db, 'incidente.comunicacao_anpd', d.ciencia_em), prazoDe(db, 'incidente.comunicacao_titular', d.ciencia_em)]);
  const id = crypto.randomUUID();
  const protocolo = await comProtocolo(db, projectId, d.ciencia_em, (protocolo) => db.prepare(
    `INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, prazo_anpd_em, prazo_titular_em, responsavel_parte_id, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.titulo, d.descricao ?? null, d.ocorrido_em ?? null, d.ciencia_em, prazoAnpd, prazoTitular, d.responsavel_parte_id ?? null, ator).run());
  if (!protocolo) return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
  await logAudit(db, 'incidente.criado', ator, `Incidente ${protocolo} registrado; prazo ANPD ${prazoAnpd ? prazoAnpd.slice(0, 16) : 'não calculado'}`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true, id, protocolo, prazo_anpd_em: prazoAnpd, prazo_titular_em: prazoTitular };
}

/** Protocolo `IN-AAAA-NNNN` (ano da ciência) e o INSERT; colisão de número tenta o próximo. null: 3 colisões. */
async function comProtocolo(db: D1Database, projectId: string, ciencia: string, inserir: (protocolo: string) => Promise<unknown>): Promise<string | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const protocolo = await proximoProtocolo(db, 'incidentes', 'IN', projectId, Number(ciencia.slice(0, 4)));
    try {
      await inserir(protocolo);
      return protocolo;
    } catch (e) {
      if (!/UNIQUE/i.test(String((e as Error)?.message))) throw e;
    }
  }
  return null;
}

const instanteMs = (s: string) => Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
export type StatusIncidente = 'aberto' | 'avaliado' | 'comunicado' | 'encerrado';
export type IncidenteImportado = {
  titulo: string; descricao: string; ciencia_em: string; risco_titular?: Risco | null; comunicacao_anpd_em?: string | null; comunicacao_titular_em?: string | null; status: StatusIncidente;
  origem_alerta?: string | null; severidade?: string | null; tipo?: string | null; comprometimento?: string[] | null; titulares_estimados?: number | null;
  criterios_risco?: string[] | null; fim_em?: string | null; anpd_protocolo?: string | null; anpd_canal?: string | null; anpd_justificativa?: string | null;
};

/**
 * Importar histórico (importação, fatia 4): incidente já tratado fora do sistema, com as datas e o status do registro de origem. Mesmas
 * regras do encerramento (risco avaliado; risco relevante exige a comunicação à ANPD). Prazos: encerrado não tem (não se recalcula); aberto
 * tem os do parâmetro, contados da ciência, para a comunicação ainda não feita, mesmo que já vencidos (a tela os mostra atrasados; volta
 * em `prazos_vencidos`). A rotina de avisos dá carência na semana ISO da criação ao prazo que nasceu vencido; depois, o atraso volta.
 */
export async function importarIncidente(db: D1Database, projectId: string, ator: string, d: IncidenteImportado): Promise<Falha | { ok: true; id: string; protocolo: string; prazos_vencidos: string[] }> {
  if ((d.anpd_protocolo || d.anpd_canal) && !d.comunicacao_anpd_em) return falha(400, 'Protocolo e canal da ANPD exigem a data da comunicação à ANPD');
  for (const [campo, v] of [['ciencia_em', d.ciencia_em], ['comunicacao_anpd_em', d.comunicacao_anpd_em], ['comunicacao_titular_em', d.comunicacao_titular_em], ['fim_em', d.fim_em]] as const) {
    if (v == null) continue;
    if (!ehInstante(v)) return falha(400, `${campo} precisa ser uma data (AAAA-MM-DD) ou data e hora ISO`);
    if (instanteMs(v) > Date.now() + 60_000) return falha(400, `${campo} não pode estar no futuro`);
  }
  if (d.status !== 'aberto' && !d.risco_titular) return falha(400, `risco_titular: incidente ${d.status} precisa do risco ao titular avaliado`);
  if (d.status === 'encerrado' && d.risco_titular === 'relevante' && !d.comunicacao_anpd_em) return falha(400, 'Risco relevante exige a comunicação à ANPD registrada para um incidente encerrado');
  if (d.status === 'comunicado' && !d.comunicacao_anpd_em && !d.comunicacao_titular_em) return falha(400, 'Incidente comunicado precisa da data de uma comunicação');

  const vencidos: string[] = [];
  const prazo = async (chave: 'incidente.comunicacao_anpd' | 'incidente.comunicacao_titular', feita: string | null | undefined, rotulo: string) => {
    if (d.status === 'encerrado' || feita) return null;
    const p = await prazoDe(db, chave, d.ciencia_em);
    if (p && instanteMs(p) < Date.now()) vencidos.push(`${rotulo} ${p.slice(0, 16)}`);
    return p;
  };
  const prazoAnpd = await prazo('incidente.comunicacao_anpd', d.comunicacao_anpd_em, 'ANPD');
  const prazoTitular = await prazo('incidente.comunicacao_titular', d.comunicacao_titular_em, 'titular');
  const id = crypto.randomUUID();
  const protocolo = await comProtocolo(db, projectId, d.ciencia_em, (protocolo) => db.prepare(
    `INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ciencia_em, risco_titular, comunicacao_anpd_em, comunicacao_titular_em, prazo_anpd_em, prazo_titular_em, status, criado_por,
       origem_alerta, severidade, tipo, comprometimento, titulares_estimados, criterios_risco, fim_em, anpd_protocolo, anpd_canal, anpd_justificativa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.titulo, d.descricao, d.ciencia_em, d.risco_titular ?? null, d.comunicacao_anpd_em ?? null, d.comunicacao_titular_em ?? null,
    prazoAnpd, prazoTitular, d.status, ator, d.origem_alerta ?? null, d.severidade ?? null, d.tipo ?? null,
    d.comprometimento?.length ? JSON.stringify(d.comprometimento) : null, d.titulares_estimados ?? null,
    d.criterios_risco?.length ? JSON.stringify(d.criterios_risco) : null, d.fim_em ?? null, d.anpd_protocolo ?? null, d.anpd_canal ?? null,
    d.anpd_justificativa ?? null).run());
  if (!protocolo) return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
  await logAudit(db, 'incidente.importado', ator, `Incidente ${protocolo} (${d.status}) importado do histórico; ciência em ${d.ciencia_em}`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true, id, protocolo, prazos_vencidos: vencidos };
}

/** Avalia o risco ao titular: o incidente aberto passa a `avaliado`. Reavaliar é permitido enquanto não encerrado. */
/**
 * Corrige o registro (título, descrição, data da ocorrência, responsável) enquanto não está encerrado. A ciência fica de fora: os prazos
 * de comunicação contam dela e foram congelados na criação. Campo ausente mantém; a trilha diz só quais campos mudaram, nunca o texto.
 */
export type RegistroIncidente = {
  titulo?: string; descricao?: string | null; ocorrido_em?: string | null; responsavel_parte_id?: string | null; origem_alerta?: string | null;
  severidade?: string | null; tipo?: string | null; comprometimento?: string[]; titulares_estimados?: number | null; criterios_risco?: string[];
  fim_em?: string | null; areas?: string[]; dados?: { titular_id: string; dado_id: string }[];
  anpd_protocolo?: string | null; anpd_canal?: string | null; anpd_justificativa?: string | null;
};
const CAMPOS_REGISTRO = ['titulo', 'descricao', 'ocorrido_em', 'responsavel_parte_id', 'origem_alerta', 'severidade', 'tipo', 'comprometimento',
  'titulares_estimados', 'criterios_risco', 'fim_em', 'anpd_protocolo', 'anpd_canal', 'anpd_justificativa'] as const; // allowlist: o nome da coluna nunca vem do corpo
const EM_JSON = new Set(['comprometimento', 'criterios_risco']);
const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const AINDA_ABERTO = `EXISTS (SELECT 1 FROM incidentes WHERE id = ? AND status <> 'encerrado')`;
const quando = (s: string) => Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);

/**
 * Corrige e completa o registro (campos, áreas e titulares × dados) enquanto não está encerrado. A ciência fica de fora: os prazos de
 * comunicação contam dela e foram congelados na criação. Campo ausente mantém; áreas e dados enviados substituem a lista. A trilha diz só
 * quais campos mudaram, nunca o texto.
 */
export async function atualizarIncidente(db: D1Database, projectId: string, id: string, ator: string, d: RegistroIncidente): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  for (const k of ['ocorrido_em', 'fim_em'] as const) if (d[k] && !ehInstante(d[k]!)) return falha(400, `${k} precisa ser uma data ou data e hora ISO`);
  const ocorrido = d.ocorrido_em !== undefined ? d.ocorrido_em : i.ocorrido_em;
  const fim = d.fim_em !== undefined ? d.fim_em : i.fim_em;
  if (ocorrido && fim && quando(fim) < quando(ocorrido)) return falha(400, 'O fim não pode ser antes da ocorrência');
  // Protocolo e canal descrevem uma comunicação que aconteceu: só depois de registrada (a justificativa vale antes, para o atraso ou a dispensa).
  if ((d.anpd_protocolo || d.anpd_canal) && !i.comunicacao_anpd_em) return falha(409, 'Registre a comunicação à ANPD antes do protocolo e do canal');
  if (d.responsavel_parte_id && !(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.responsavel_parte_id, projectId).first())) return falha(400, 'responsavel_parte_id inexistente ou de outro projeto');
  // Áreas e dados do cadastro DESTE projeto: conferidos antes (400 com o motivo), o gatilho do banco é a segunda trava.
  if (d.areas?.length) {
    const ok = await db.prepare(`SELECT count(*) AS n FROM departamentos WHERE project_id = ? AND id IN (SELECT value FROM json_each(?))`).bind(projectId, JSON.stringify(d.areas)).first<{ n: number }>();
    if ((ok?.n ?? 0) !== d.areas.length) return falha(400, 'Área inexistente ou de outro projeto');
  }
  if (d.dados?.length) {
    const ids = [...new Set(d.dados.flatMap((x) => [x.titular_id, x.dado_id]))];
    const { results } = await db.prepare(`SELECT id, tipo FROM catalogo_itens WHERE project_id = ? AND id IN (SELECT value FROM json_each(?))`).bind(projectId, JSON.stringify(ids)).all<{ id: string; tipo: string }>();
    const tipo = new Map(results.map((r) => [r.id, r.tipo]));
    if (d.dados.some((x) => tipo.get(x.titular_id) !== 'titular' || tipo.get(x.dado_id) !== 'dado')) return falha(400, 'Titular ou dado inexistente ou de outro projeto');
  }
  const valor = (k: (typeof CAMPOS_REGISTRO)[number]) => (EM_JSON.has(k) ? JSON.stringify(d[k] ?? []) : (d[k] ?? null));
  const atual = (k: (typeof CAMPOS_REGISTRO)[number]) => (EM_JSON.has(k) ? JSON.stringify(i[k] ?? []) : (i[k] ?? null));
  const mudaram: string[] = CAMPOS_REGISTRO.filter((k) => d[k] !== undefined && valor(k) !== atual(k));
  const stmts: D1PreparedStatement[] = [];
  if (mudaram.length) {
    stmts.push(db.prepare(`UPDATE incidentes SET ${mudaram.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status <> 'encerrado'`)
      .bind(...mudaram.map((k) => valor(k as (typeof CAMPOS_REGISTRO)[number])), id, projectId));
  }
  if (d.areas && !mesmoConjunto(d.areas, i.areas.map((a) => a.id))) {
    mudaram.push('areas');
    stmts.push(db.prepare(`DELETE FROM incidente_departamentos WHERE incidente_id = ? AND project_id = ? AND ${AINDA_ABERTO}`).bind(id, projectId, id),
      ...d.areas.map((a) => db.prepare('INSERT INTO incidente_departamentos (incidente_id, departamento_id, project_id) VALUES (?, ?, ?)').bind(id, a, projectId)));
  }
  const par = (x: { titular_id: string; dado_id: string }) => `${x.titular_id}|${x.dado_id}`;
  if (d.dados && !mesmoConjunto(d.dados.map(par), i.dados.map(par))) {
    mudaram.push('dados');
    stmts.push(db.prepare(`DELETE FROM incidente_dados WHERE incidente_id = ? AND project_id = ? AND ${AINDA_ABERTO}`).bind(id, projectId, id),
      ...d.dados.map((x) => db.prepare('INSERT INTO incidente_dados (incidente_id, titular_id, dado_id, project_id) VALUES (?, ?, ?, ?)').bind(id, x.titular_id, x.dado_id, projectId)));
  }
  if (!stmts.length) return { ok: true };
  // Uma transação só: campos e listas mudam juntos ou nada muda. Se o encerramento chegar entre a leitura e aqui, o gatilho
  // `*_aberto` recusa a inclusão e a transação inteira volta; a exclusão só vale com o incidente aberto (AINDA_ABERTO).
  let r: D1Result[];
  try { r = await db.batch(stmts); } catch (e) {
    if (/encerrado não muda/.test(String((e as Error)?.message))) return falha(409, 'Incidente encerrado não muda');
    throw e;
  }
  if (mudaram.some((k) => (CAMPOS_REGISTRO as readonly string[]).includes(k)) && !r[0].meta.changes) return falha(409, 'Incidente encerrado não muda');
  await logAudit(db, 'incidente.alterado', ator, `Incidente ${i.protocolo}: ${mudaram.join(', ')}`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true };
}

export async function avaliarRisco(db: D1Database, projectId: string, id: string, ator: string, d: { risco_titular: Risco; avaliacao_texto?: string | null }): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const status = i.status === 'aberto' ? 'avaliado' : i.status;
  // `status <> 'encerrado'` na própria WHERE: o encerramento pode ter chegado entre a leitura e esta escrita.
  const r = await db.prepare(`UPDATE incidentes SET risco_titular = ?, avaliacao_texto = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status = ?`)
    .bind(d.risco_titular, d.avaliacao_texto ?? null, status, id, projectId, i.status).run();
  if (!r.meta.changes) return falha(409, 'O incidente mudou enquanto você editava; recarregue');
  await logAudit(db, 'incidente.risco', ator, `Incidente ${i.protocolo}: risco ao titular ${d.risco_titular}`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true };
}

/** Registra que a comunicação foi feita (à ANPD ou ao titular). Sem data, vale agora. A data não pode estar no futuro. */
export async function registrarComunicacao(db: D1Database, projectId: string, id: string, ator: string,
  d: { destino: 'anpd' | 'titular'; em?: string; anpd_canal?: string | null; anpd_protocolo?: string | null }): Promise<Falha | { ok: true }> {
  if (d.destino === 'titular' && (d.anpd_canal || d.anpd_protocolo)) return falha(400, 'Canal e protocolo são da comunicação à ANPD');
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const em = d.em ?? agora();
  if (!ehInstante(em)) return falha(400, 'em precisa ser uma data ou data e hora ISO');
  if (Date.parse(em.length === 10 ? `${em}T00:00:00Z` : em) > Date.now() + 60_000) return falha(400, 'A comunicação não pode estar no futuro');
  const coluna = d.destino === 'anpd' ? 'comunicacao_anpd_em' : 'comunicacao_titular_em'; // vem da lista fechada do tipo, nunca do corpo cru
  // A primeira data registrada é a oficial: uma segunda aba ou um reenvio não a sobrescreve.
  if (i[coluna]) return falha(409, `Comunicação ${d.destino === 'anpd' ? 'à ANPD' : 'ao titular'} já registrada em ${String(i[coluna]).slice(0, 10)}`);
  const anpd = d.destino === 'anpd' ? ', anpd_canal = coalesce(?, anpd_canal), anpd_protocolo = coalesce(?, anpd_protocolo)' : '';
  const extra = d.destino === 'anpd' ? [d.anpd_canal ?? null, d.anpd_protocolo ?? null] : [];
  const r = await db.prepare(`UPDATE incidentes SET ${coluna} = ?${anpd}, status = 'comunicado', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status <> 'encerrado' AND ${coluna} IS NULL`).bind(em, ...extra, id, projectId).run();
  if (!r.meta.changes) return falha(409, 'O incidente mudou enquanto você editava; recarregue');
  await logAudit(db, 'incidente.comunicacao', ator, `Incidente ${i.protocolo}: comunicação ${d.destino === 'anpd' ? 'à ANPD' : 'ao titular'} em ${em}`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true };
}

export async function encerrarIncidente(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente já encerrado');
  if (!i.risco_titular) return falha(409, 'Avalie o risco ao titular antes de encerrar');
  if (i.risco_titular === 'relevante' && !i.comunicacao_anpd_em) return falha(409, 'Risco relevante exige a comunicação à ANPD registrada antes de encerrar');
  const r = await db.prepare(`UPDATE incidentes SET status = 'encerrado', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status <> 'encerrado'`).bind(id, projectId).run();
  if (!r.meta.changes) return falha(409, 'Incidente já encerrado');
  await logAudit(db, 'incidente.encerrado', ator, `Incidente ${i.protocolo} encerrado`, '', '', projectId, { tipo: 'incidente', id });
  return { ok: true };
}
