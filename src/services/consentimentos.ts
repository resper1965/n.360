import { logAudit } from '../helpers';
import { hojeEmSaoPaulo } from './hoje';

/**
 * Núcleo do n.privacy, fatia 7: prova de consentimento ligada ao tratamento (quem, quando, finalidade, versão do aviso). `titular_ref` é uma
 * referência PSEUDONIMIZADA escolhida pela equipe (a tela avisa: nada de CPF). Revogar não apaga: a prova do que existiu fica.
 */

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const hoje = () => hojeEmSaoPaulo();
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s));

const COLS = 'c.id, c.ropa_id, r.processing_purpose AS tratamento, c.titular_ref, c.finalidade, c.versao_aviso, c.obtido_em, c.canal, c.revogado_em, c.revogado_por, c.criado_por, c.created_at';

export async function listarConsentimentos(db: D1Database, projectId: string, ropaId?: string) {
  const { results } = await db.prepare(
    `SELECT ${COLS} FROM consentimentos c JOIN ropa_records r ON r.id = c.ropa_id
      WHERE c.project_id = ?1 AND (?2 IS NULL OR c.ropa_id = ?2) ORDER BY c.obtido_em DESC, c.created_at DESC`
  ).bind(projectId, ropaId ?? null).all();
  return results.map((r) => ({ ...r, vigente: !r.revogado_em }));
}

export type NovoConsentimento = { ropa_id: string; titular_ref: string; finalidade: string; versao_aviso: string; obtido_em: string; canal?: string | null };

export async function registrarConsentimento(db: D1Database, projectId: string, ator: string, d: NovoConsentimento): Promise<Falha | { ok: true; id: string }> {
  const v = await validar(db, projectId, d);
  if (v) return v;
  const id = crypto.randomUUID();
  await inserir(db, projectId, ator, id, d, null);
  await logAudit(db, 'consentimento.registrado', ator, `Consentimento ${id} registrado no tratamento ${d.ropa_id} (aviso ${d.versao_aviso})`, '', '', projectId);
  return { ok: true, id };
}

/**
 * Importar histórico (importação, fatia 4): consentimento obtido (e talvez revogado) antes do sistema, com as datas do registro de
 * origem. `titular_ref` já chega pseudonimizado pela importação. A revogação importada fica sem `revogado_por` (ninguém do sistema revogou).
 */
export async function importarConsentimento(db: D1Database, projectId: string, ator: string, d: NovoConsentimento & { revogado_em?: string | null }): Promise<Falha | { ok: true; id: string }> {
  const v = await validar(db, projectId, d);
  if (v) return v;
  if (d.revogado_em != null) {
    if (!ehData(d.revogado_em)) return falha(400, 'revogado_em precisa ser uma data AAAA-MM-DD');
    if (d.revogado_em.slice(0, 10) > hoje()) return falha(400, 'revogado_em não pode estar no futuro');
    if (d.revogado_em.slice(0, 10) < d.obtido_em.slice(0, 10)) return falha(400, 'revogado_em não pode ser anterior a obtido_em');
  }
  const id = crypto.randomUUID();
  await inserir(db, projectId, ator, id, d, d.revogado_em ?? null);
  await logAudit(db, 'consentimento.importado', ator, `Consentimento ${id} importado do histórico no tratamento ${d.ropa_id} (obtido em ${d.obtido_em.slice(0, 10)}${d.revogado_em ? `, revogado em ${d.revogado_em.slice(0, 10)}` : ''})`, '', '', projectId);
  return { ok: true, id };
}

async function validar(db: D1Database, projectId: string, d: NovoConsentimento): Promise<Falha | null> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(d.ropa_id, projectId).first())) return falha(404, 'Tratamento não encontrado');
  if (!ehData(d.obtido_em)) return falha(400, 'obtido_em precisa ser uma data AAAA-MM-DD');
  if (d.obtido_em.slice(0, 10) > hoje()) return falha(400, 'obtido_em não pode estar no futuro');
  return null;
}

const inserir = (db: D1Database, projectId: string, ator: string, id: string, d: NovoConsentimento, revogadoEm: string | null) =>
  db.prepare(`INSERT INTO consentimentos (id, project_id, ropa_id, titular_ref, finalidade, versao_aviso, obtido_em, canal, revogado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, d.ropa_id, d.titular_ref, d.finalidade, d.versao_aviso, d.obtido_em, d.canal ?? null, revogadoEm, ator).run();

export async function revogarConsentimento(db: D1Database, projectId: string, id: string, ator: string): Promise<Falha | { ok: true }> {
  const c = await db.prepare('SELECT revogado_em FROM consentimentos WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ revogado_em: string | null }>();
  if (!c) return falha(404, 'Consentimento não encontrado');
  if (c.revogado_em) return falha(409, 'Consentimento já revogado');
  await db.prepare(`UPDATE consentimentos SET revogado_em = ?, revogado_por = ? WHERE id = ? AND project_id = ?`).bind(new Date().toISOString(), ator, id, projectId).run();
  await logAudit(db, 'consentimento.revogado', ator, `Consentimento ${id} revogado`, '', '', projectId);
  return { ok: true };
}
