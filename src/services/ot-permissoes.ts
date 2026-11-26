import { ehPapelCliente } from '../helpers';
import { modulosDoProjeto } from '../modulos';
import { gestorArciberDireto, podeCriarLote, podeEditarOt, podeVerCompleto, sitesPermitidos, type AtorOt } from './ot-inventario';

/** O leitor do n.ot (spec 2026-11-26 §6): a mesma regra do Painel (`painel-ot.ts`): papel de cliente (`PAPEIS_CLIENTE`, helpers.ts)
 *  que não é o Gestor ARCiber do projeto (org_admin dele) nem o técnico. Síncrona: serve também o middleware de routes/ot.ts. */
export const ehLeitorOt = (u: { role: string; client_project_id?: string | null }, projectId: string) =>
  ehPapelCliente(u) && u.role !== 'org_user' && !(u.role === 'org_admin' && u.client_project_id === projectId);

/** Gestor ARCiber do projeto: o org_admin dele ou o admin direto no cargo. A regra única das rotas de decisão e da tela. */
export const ehGestorArciberOt = async (db: D1Database, u: AtorOt & { client_project_id?: string | null }, projectId: string) =>
  (u.role === 'org_admin' && u.client_project_id === projectId) || gestorArciberDireto(db, u, projectId);

export type Permissoes = { editar: boolean; criar_lote: boolean; aprovar_lote: boolean; ver_sondas: boolean; gestor: boolean; leitor: boolean;
  tecnico: boolean; acao_corretiva: boolean; tela_inicial: 'painel' | 'implantacao' };

/** Spec 2026-11-26 §6: a tela não recalcula papel; lê isto. As mesmas funções que as rotas usam para decidir. */
export async function permissoesOt(db: D1Database, u: AtorOt & { client_project_id?: string | null }, projectId: string): Promise<Permissoes> {
  const editar = podeEditarOt(u);
  const sites = await sitesPermitidos(db, u, projectId);
  const [completo, gestor, mods, opera] = await Promise.all([
    podeVerCompleto(db, u, projectId), ehGestorArciberOt(db, u, projectId), modulosDoProjeto(db, projectId),
    db.prepare(`SELECT 1 AS x FROM ot_sites WHERE project_id = ? AND status = 'ativo' AND fase = 'em_operacao' AND id IN (SELECT value FROM json_each(?)) LIMIT 1`)
      .bind(projectId, sites).first(),
  ]);
  return {
    editar, criar_lote: podeCriarLote(u), aprovar_lote: completo, ver_sondas: completo, gestor, leitor: ehLeitorOt(u, projectId),
    tecnico: u.role === 'org_user', acao_corretiva: editar && mods.includes('iso'), tela_inicial: editar && !opera ? 'implantacao' : 'painel',
  };
}
