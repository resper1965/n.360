import { env } from 'cloudflare:test';
import { chamar, json, P } from './ropa-abas';

/** Ajudantes só dos testes do pacote A. Tudo fictício; nada depende de dado preexistente. */

/** Abre um pedido de aprovação do tratamento (rota real) e devolve o id. */
export async function abrirPedido(h: Record<string, string>, rid: string): Promise<string> {
  await env.DB.prepare(`INSERT OR IGNORE INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('ra-ciso', ?, 'Direção exemplo', 'ciso@cliente.exemplo', 'executivo', 'CISO')`).bind(P).run();
  const r = await chamar(h, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'tratamento', ref_id: rid, papel_exigido: 'ciso', destinatarios: [{ email: 'ciso@cliente.exemplo' }] });
  if (r.status !== 201) throw new Error(`abrirPedido: ${r.status} ${await r.text()}`);
  return (await json<{ id: string }>(r)).id;
}

/** Ids dos pedidos de tratamento ainda abertos para a atividade. */
export async function pedidosAbertos(rid: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT id FROM pedidos WHERE tipo = 'tratamento' AND ref_id = ? AND status = 'aberto' ORDER BY id`).bind(rid).all<{ id: string }>();
  return results.map((x) => x.id);
}

export async function novaParte(id: string, nome = 'Parte exemplo', projeto = P) {
  await env.DB.prepare(`INSERT INTO partes (id, project_id, nome) VALUES (?, ?, ?)`).bind(id, projeto, nome).run();
  return id;
}
export async function novaArea(id: string, nome = 'Área exemplo', projeto = P) {
  await env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES (?, ?, ?)`).bind(id, projeto, nome).run();
  return id;
}
export const linha = <T = any>(sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).first<T>();
