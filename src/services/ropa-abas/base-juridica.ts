import { ehBaseDoCatalogo } from '../bases';
import { ehLegitimoInteresse } from '../lia';
import { BASES_GDPR } from '../../data/ropa-abas/gdpr';
import type { BaseJuridicaCorpo } from '../../schemas/ropa-abas';
import { exigirEditavel, falha, type Falha, type Gravado } from './comum';

/** A principal é a base que está no hash (`base_legal_id`): mantém a atual enquanto selecionada; senão o 1º do art. 7º; senão o 1º do art. 11. */
export function escolherPrincipal(atual: string | null, ids: string[]): string | null {
  if (!ids.length) return null;
  if (atual && ids.includes(atual)) return atual;
  return ids.find((i) => i.startsWith('lgpd:art7:')) ?? ids[0];
}

type Inciso = { requisito_id: string; referencia: string; titulo: string; finalidade: string; principal: boolean; finalidade_pendente: boolean };

/** Principal (finalidade em `ropa_records`) e adicionais (finalidade em `tratamento_bases`), principal primeiro. */
async function incisosGravados(db: D1Database, projectId: string, ropaId: string, principalId: string | null, finalidadePrincipal: string | null): Promise<Inciso[]> {
  const { results } = await db.prepare(
    `SELECT b.requisito_id, q.referencia, q.titulo, COALESCE(b.finalidade, '') AS finalidade
       FROM tratamento_bases b JOIN requisitos q ON q.id = b.requisito_id WHERE b.ropa_id = ? AND b.project_id = ? ORDER BY b.requisito_id`
  ).bind(ropaId, projectId).all<{ requisito_id: string; referencia: string; titulo: string; finalidade: string }>();
  const out: Inciso[] = [];
  if (principalId) {
    const q = await db.prepare('SELECT referencia, titulo FROM requisitos WHERE id = ?').bind(principalId).first<{ referencia: string; titulo: string }>();
    if (q) out.push({ requisito_id: principalId, referencia: q.referencia, titulo: q.titulo, finalidade: finalidadePrincipal ?? '', principal: true, finalidade_pendente: !(finalidadePrincipal ?? '').trim() });
  }
  for (const r of results) out.push({ ...r, principal: false, finalidade_pendente: !r.finalidade.trim() });
  return out;
}

type Registro = { previsao_legal: string | null; base_legal_id: string | null; base_legal_finalidade: string | null; base_art11_na: number | null; legal_basis: string | null; base_gdpr: string | null };
const lerRegistro = (db: D1Database, projectId: string, ropaId: string) =>
  db.prepare('SELECT previsao_legal, base_legal_id, base_legal_finalidade, base_art11_na, legal_basis, base_gdpr FROM ropa_records WHERE id = ? AND project_id = ?')
    .bind(ropaId, projectId).first<Registro>();

export async function salvarBaseJuridica(db: D1Database, projectId: string, ropaId: string, _ator: string, corpo: BaseJuridicaCorpo): Promise<Falha | Gravado> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const reg = await lerRegistro(db, projectId, ropaId);
  const stmts: D1PreparedStatement[] = [];
  let mudouHash = false;

  if (corpo.gdpr) {
    const bases = corpo.gdpr.map((g) => g.base);
    if (new Set(bases).size !== bases.length) return falha(400, 'Base do GDPR repetida');
  }

  if (corpo.lgpd || corpo.art11) {
    const gravados = await incisosGravados(db, projectId, ropaId, reg?.base_legal_id ?? null, reg?.base_legal_finalidade ?? null);
    const manter = (prefixo: string) => gravados.filter((x) => x.requisito_id.startsWith(prefixo)).map((x) => ({ requisito_id: x.requisito_id, finalidade: x.finalidade }));
    const art7 = corpo.lgpd ?? manter('lgpd:art7:');
    const art11 = corpo.art11 ? corpo.art11.incisos : manter('lgpd:art11:');
    const todos = [...art7, ...art11];
    const ids = todos.map((x) => x.requisito_id);
    if (new Set(ids).size !== ids.length) return falha(400, 'Inciso repetido');
    const { results } = await db.prepare('SELECT id, titulo FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{ id: string; titulo: string }>();
    const existe = new Map(results.map((r) => [r.id, r]));
    const invalidos = ids.filter((i) => !existe.has(i) || !ehBaseDoCatalogo(i));
    if (invalidos.length) return falha(400, 'Requisito inexistente ou que não é base legal', invalidos);

    const antigaId = reg?.base_legal_id ?? null;
    const principal = escolherPrincipal(antigaId, ids);
    const final = todos.find((x) => x.requisito_id === principal);
    if (principal !== antigaId) {
      mudouHash = true;
      stmts.push(db.prepare('UPDATE ropa_records SET base_legal_id = ?, legal_basis = ? WHERE id = ? AND project_id = ?')
        .bind(principal, principal ? existe.get(principal)!.titulo : null, ropaId, projectId));
    }
    stmts.push(db.prepare('UPDATE ropa_records SET base_legal_finalidade = ? WHERE id = ? AND project_id = ?').bind(final?.finalidade ?? null, ropaId, projectId));
    stmts.push(db.prepare('DELETE FROM tratamento_bases WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId));
    for (const x of todos) if (x.requisito_id !== principal) {
      stmts.push(db.prepare('INSERT INTO tratamento_bases (ropa_id, requisito_id, project_id, finalidade) VALUES (?, ?, ?, ?)').bind(ropaId, x.requisito_id, projectId, x.finalidade));
    }
  }
  if (corpo.art11) stmts.push(db.prepare('UPDATE ropa_records SET base_art11_na = ? WHERE id = ? AND project_id = ?').bind(corpo.art11.nao_aplicavel ? 1 : 0, ropaId, projectId));
  if (Object.hasOwn(corpo, 'previsao_legal')) stmts.push(db.prepare('UPDATE ropa_records SET previsao_legal = ? WHERE id = ? AND project_id = ?').bind(corpo.previsao_legal ?? null, ropaId, projectId));
  if (corpo.gdpr) {
    stmts.push(db.prepare('DELETE FROM tratamento_bases_gdpr WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId));
    for (const g of corpo.gdpr) stmts.push(db.prepare('INSERT INTO tratamento_bases_gdpr (ropa_id, base, finalidade, project_id) VALUES (?, ?, ?, ?)').bind(ropaId, g.base, g.finalidade, projectId));
  }
  if (stmts.length) {
    stmts.push(db.prepare('UPDATE ropa_records SET updated_at = ? WHERE id = ? AND project_id = ?').bind(new Date().toISOString(), ropaId, projectId));
    await db.batch(stmts);
  }
  return { ok: true, mudouHash };
}

export type BaseJuridica = {
  previsao_legal: string | null;
  lgpd: Inciso[];
  art11: { nao_aplicavel: boolean; incisos: Inciso[] };
  gdpr: { base: string; rotulo: string; finalidade: string }[];
  lia_exigida: boolean;
  base_gdpr_texto_anterior: string | null;
  legal_basis_texto: string | null;
};

/** null = a atividade não é do projeto. Atividade só com texto antigo em `legal_basis` aparece em `legal_basis_texto` (nada é apagado). */
export async function lerBaseJuridica(db: D1Database, projectId: string, ropaId: string): Promise<BaseJuridica | null> {
  const reg = await lerRegistro(db, projectId, ropaId);
  if (!reg) return null;
  const incisos = await incisosGravados(db, projectId, ropaId, reg.base_legal_id, reg.base_legal_finalidade);
  const { results } = await db.prepare('SELECT base, finalidade FROM tratamento_bases_gdpr WHERE ropa_id = ? AND project_id = ? ORDER BY base').bind(ropaId, projectId).all<{ base: keyof typeof BASES_GDPR; finalidade: string }>();
  const gdpr = results.map((g) => ({ base: g.base, rotulo: BASES_GDPR[g.base]?.rotulo ?? g.base, finalidade: g.finalidade }));
  const liaExigida = incisos.some((i) => i.requisito_id === 'lgpd:art7:ix' || ehLegitimoInteresse(i.titulo))
    || gdpr.some((g) => g.base === 'interesses_legitimos') || ehLegitimoInteresse(reg.legal_basis);
  return {
    previsao_legal: reg.previsao_legal,
    lgpd: incisos.filter((i) => i.requisito_id.startsWith('lgpd:art7:')),
    art11: { nao_aplicavel: reg.base_art11_na === 1, incisos: incisos.filter((i) => i.requisito_id.startsWith('lgpd:art11:')) },
    gdpr,
    lia_exigida: liaExigida,
    base_gdpr_texto_anterior: reg.base_gdpr?.trim() ? reg.base_gdpr : null,
    legal_basis_texto: reg.legal_basis,
  };
}
