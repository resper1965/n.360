import { logAudit } from '../helpers';
import { prazoDe, proximoProtocolo } from './parametros-legais';

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

export type SituacaoComunicacao = 'sem_prazo' | 'comunicado' | 'no_prazo' | 'vence_hoje' | 'atrasado';
/** Cada comunicação: feita, ou o prazo em relação a hoje (sem prazo = parâmetro não cadastrado). */
export function situacaoDaComunicacao(prazo: string | null, feita: string | null, em = new Date().toISOString().slice(0, 10)): SituacaoComunicacao {
  if (feita) return 'comunicado';
  if (!prazo) return 'sem_prazo';
  const dia = prazo.slice(0, 10);
  return dia < em ? 'atrasado' : dia === em ? 'vence_hoje' : 'no_prazo';
}

const COLS = 'id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, risco_titular, avaliacao_texto, comunicacao_anpd_em, comunicacao_titular_em, prazo_anpd_em, prazo_titular_em, status, responsavel_parte_id, criado_por, created_at, updated_at';
export type Incidente = {
  id: string; protocolo: string; titulo: string; descricao: string | null; ocorrido_em: string | null; ciencia_em: string; risco_titular: Risco | null; avaliacao_texto: string | null;
  comunicacao_anpd_em: string | null; comunicacao_titular_em: string | null; prazo_anpd_em: string | null; prazo_titular_em: string | null; status: string; responsavel_parte_id: string | null;
};
const comSituacao = (i: Incidente) => ({
  ...i,
  situacao_anpd: situacaoDaComunicacao(i.prazo_anpd_em, i.comunicacao_anpd_em),
  situacao_titular: situacaoDaComunicacao(i.prazo_titular_em, i.comunicacao_titular_em),
});

export async function listarIncidentes(db: D1Database, projectId: string) {
  const { results } = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE project_id = ? ORDER BY ciencia_em DESC, protocolo DESC`).bind(projectId).all<Incidente>();
  return results.map(comSituacao);
}

export async function lerIncidente(db: D1Database, projectId: string, id: string) {
  const i = await db.prepare(`SELECT ${COLS} FROM incidentes WHERE id = ? AND project_id = ?`).bind(id, projectId).first<Incidente>();
  return i ? comSituacao(i) : null;
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
  await logAudit(db, 'incidente.criado', ator, `Incidente ${protocolo} registrado; prazo ANPD ${prazoAnpd ? prazoAnpd.slice(0, 16) : 'não calculado'}`, '', '', projectId);
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
};

/**
 * Importar histórico (importação, fatia 4): incidente já tratado fora do sistema, com as datas e o status do registro de origem. Mesmas
 * regras do encerramento (risco avaliado; risco relevante exige a comunicação à ANPD). Prazos: encerrado não tem (não se recalcula); aberto
 * tem os do parâmetro, contados da ciência, para a comunicação ainda não feita, mesmo que já vencidos (a tela os mostra atrasados; volta
 * em `prazos_vencidos`). O aviso retroativo é cortado na rotina de avisos (prazo anterior à criação do registro não avisa).
 */
export async function importarIncidente(db: D1Database, projectId: string, ator: string, d: IncidenteImportado): Promise<Falha | { ok: true; id: string; protocolo: string; prazos_vencidos: string[] }> {
  for (const [campo, v] of [['ciencia_em', d.ciencia_em], ['comunicacao_anpd_em', d.comunicacao_anpd_em], ['comunicacao_titular_em', d.comunicacao_titular_em]] as const) {
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
    `INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ciencia_em, risco_titular, comunicacao_anpd_em, comunicacao_titular_em, prazo_anpd_em, prazo_titular_em, status, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.titulo, d.descricao, d.ciencia_em, d.risco_titular ?? null, d.comunicacao_anpd_em ?? null, d.comunicacao_titular_em ?? null,
    prazoAnpd, prazoTitular, d.status, ator).run());
  if (!protocolo) return falha(409, 'Não foi possível gerar o protocolo; tente de novo');
  await logAudit(db, 'incidente.importado', ator, `Incidente ${protocolo} (${d.status}) importado do histórico; ciência em ${d.ciencia_em}`, '', '', projectId);
  return { ok: true, id, protocolo, prazos_vencidos: vencidos };
}

/** Avalia o risco ao titular: o incidente aberto passa a `avaliado`. Reavaliar é permitido enquanto não encerrado. */
export async function avaliarRisco(db: D1Database, projectId: string, id: string, ator: string, d: { risco_titular: Risco; avaliacao_texto?: string | null }): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const status = i.status === 'aberto' ? 'avaliado' : i.status;
  await db.prepare(`UPDATE incidentes SET risco_titular = ?, avaliacao_texto = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`)
    .bind(d.risco_titular, d.avaliacao_texto ?? null, status, id, projectId).run();
  await logAudit(db, 'incidente.risco', ator, `Incidente ${i.protocolo}: risco ao titular ${d.risco_titular}`, '', '', projectId);
  return { ok: true };
}

/** Registra que a comunicação foi feita (à ANPD ou ao titular). Sem data, vale agora. A data não pode estar no futuro. */
export async function registrarComunicacao(db: D1Database, projectId: string, id: string, ator: string, d: { destino: 'anpd' | 'titular'; em?: string }): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente encerrado não muda');
  const em = d.em ?? agora();
  if (!ehInstante(em)) return falha(400, 'em precisa ser uma data ou data e hora ISO');
  if (Date.parse(em.length === 10 ? `${em}T00:00:00Z` : em) > Date.now() + 60_000) return falha(400, 'A comunicação não pode estar no futuro');
  const coluna = d.destino === 'anpd' ? 'comunicacao_anpd_em' : 'comunicacao_titular_em'; // vem da lista fechada do tipo, nunca do corpo cru
  await db.prepare(`UPDATE incidentes SET ${coluna} = ?, status = 'comunicado', updated_at = datetime('now') WHERE id = ? AND project_id = ?`).bind(em, id, projectId).run();
  await logAudit(db, 'incidente.comunicacao', ator, `Incidente ${i.protocolo}: comunicação ${d.destino === 'anpd' ? 'à ANPD' : 'ao titular'} em ${em}`, '', '', projectId);
  return { ok: true };
}

export async function encerrarIncidente(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const i = await lerIncidente(db, projectId, id);
  if (!i) return falha(404, 'Incidente não encontrado');
  if (i.status === 'encerrado') return falha(409, 'Incidente já encerrado');
  if (!i.risco_titular) return falha(409, 'Avalie o risco ao titular antes de encerrar');
  if (i.risco_titular === 'relevante' && !i.comunicacao_anpd_em) return falha(409, 'Risco relevante exige a comunicação à ANPD registrada antes de encerrar');
  await db.prepare(`UPDATE incidentes SET status = 'encerrado', updated_at = datetime('now') WHERE id = ? AND project_id = ?`).bind(id, projectId).run();
  await logAudit(db, 'incidente.encerrado', ator, `Incidente ${i.protocolo} encerrado`, '', '', projectId);
  return { ok: true };
}
