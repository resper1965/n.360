import { expect } from 'vitest';
type H = Record<string, string>;
type Chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => Promise<Response>;
type Item = { entidade?: 'ativo' | 'fluxo'; dados: Record<string, unknown> };

/**
 * Spec 2026-11-26, decisão 3: inventário só entra por lote decidido por outra pessoa. Vai pelo achado, como a tela (o lote manual não
 * aceita fluxo: a entidade só vem do achado, `criarLote`, `src/services/ot-coleta.ts:187-191`).
 * - UM lote por chamada (teto de 20 lotes por dia por pessoa, `ot-coleta.ts:17,196`): junte os ativos de uma preparação numa chamada;
 *   fluxo cujas pontas são ativos novos vai numa segunda chamada (a ponta precisa existir quando o achado é registrado).
 * - `dados` sem `site_id` (o site é o do levantamento; `site_id` no item é "campo não aceito").
 * - O `decisor` precisa ver completo e não ser o autor (Gestor do projeto ou outro consultor designado; platform_admin não decide).
 * - Item completo no 4.3.1 sai VERIFICADO (a aprovação carimba): diferente da rota direta, que deixava "não verificado".
 */
export async function inventarioPorLote(chamar: Chamar, o: { autor: H; decisor: H; site: string; itens: Item[]; projeto?: string }) {
  const P = `/api/v1/projects/${o.projeto ?? 'proj-a'}/ot`;
  const ok = async (r: Promise<Response>, status: number) => { const x = await r; expect(x.status, await x.clone().text()).toBe(status); return x.json<Record<string, unknown>>(); };
  const lev = await ok(chamar(o.autor, 'POST', `${P}/levantamentos`, { site_id: o.site, tipo: 'visita', realizado_em: '2026-11-26' }), 201);
  const achados: string[] = [];
  for (const i of o.itens) achados.push(String((await ok(chamar(o.autor, 'POST', `${P}/levantamentos/${lev.id}/achados`,
    { entidade: i.entidade ?? 'ativo', dados: i.dados, evidencia: 'preparação do teste' }), 201)).id));
  const lote = await ok(chamar(o.autor, 'POST', `${P}/levantamentos/${lev.id}/enviar`, { achados }), 201);
  await ok(chamar(o.decisor, 'POST', `${P}/lotes/${lote.id}/aprovar`), 200);
  const lido = await ok(chamar(o.decisor, 'GET', `${P}/lotes/${lote.id}`), 200) as { itens: { linha: number; registro_id: string; decisao: string }[] };
  expect(lido.itens.every((x) => x.decisao === 'gravado'), JSON.stringify(lido.itens)).toBe(true);
  return [...lido.itens].sort((a, b) => a.linha - b.linha).map((x) => x.registro_id);
}
