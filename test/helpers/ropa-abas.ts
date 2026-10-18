import { env } from 'cloudflare:test';
import app from '../../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './d1';
import { semearCatalogo } from '../../src/services/requisitos';
import { sha256Hex } from '../../src/helpers';

/** Projeto, usuários e atividade de teste da feature "RoPA em abas". Tudo fictício. */
export const P = 'ra-proj';
export const OUTRO = 'ra-outro';
export const AGENTE = { userId: 'ra-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'ra-c' };
export type Sessoes = { consultor: Record<string, string>; cliente: Record<string, string>; adminCliente: Record<string, string>; soIso: Record<string, string>; outro: Record<string, string> };

export const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
export const comoAgente = (metodo: string, caminho: string, corpo?: unknown) => chamar({}, metodo, caminho, corpo, { AGENTE });
export const json = async <T = any>(r: Response) => (await r.json()) as T;
export const base = (rid: string, p = P) => `/api/v1/projects/${p}/ropa/${rid}`;

export async function prepararProjeto(): Promise<Sessoes> {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente exemplo', 'LGPD', 'Controller', 'Active', 'org_ness'), (?2, 'Outro exemplo', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('ra-cons', 'cons@ness.lat', 'x', 'Consultor exemplo', 'consultor', NULL, 'org_ness'),
      ('ra-cli', 'cli@cliente.exemplo', 'x', 'Cliente exemplo', 'org_user', ?1, 'org_ness'),
      ('ra-adm', 'adm@cliente.exemplo', 'x', 'Admin exemplo', 'org_admin', ?1, 'org_ness'),
      ('ra-iso', 'iso@cliente.exemplo', 'x', 'So iso', 'org_user', ?1, 'org_ness'),
      ('ra-out', 'out@outro.exemplo', 'x', 'Outro', 'consultor', NULL, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('ra-g1', ?1, 'Consultor exemplo', 'cons@ness.lat', 'consultor', 'Consultor'), ('ra-g2', ?2, 'Outro', 'out@outro.exemplo', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('ra-c', 'ra-cons', ?, datetime('now','+30 days'))`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('ra-cli', ['privacy']);
  await concederModulos('ra-adm', ['privacy']);
  await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'ra-iso'`).run();
  await concederModulos('ra-iso', ['iso']);
  return {
    consultor: await sessionFor({ id: 'ra-cons', email: 'cons@ness.lat', role: 'consultor' }),
    cliente: await sessionFor({ id: 'ra-cli', email: 'cli@cliente.exemplo', role: 'org_user', client_project_id: P }),
    adminCliente: await sessionFor({ id: 'ra-adm', email: 'adm@cliente.exemplo', role: 'org_admin', client_project_id: P }),
    soIso: await sessionFor({ id: 'ra-iso', email: 'iso@cliente.exemplo', role: 'org_user', client_project_id: P }),
    outro: await sessionFor({ id: 'ra-out', email: 'out@outro.exemplo', role: 'consultor' }),
  };
}

let n = 0;
/** Cria uma atividade pela API (Draft) e devolve o id. */
export async function novaAtividade(h: Record<string, string>, corpo: object = {}, projeto = P): Promise<string> {
  const r = await chamar(h, 'POST', `/api/v1/projects/${projeto}/ropa`, { processing_purpose: `Atividade exemplo ${++n}`, ...corpo });
  if (r.status !== 201) throw new Error(`novaAtividade: ${r.status} ${await r.text()}`);
  return (await json<{ id: string }>(r)).id;
}

/** Item do inventário (compartilhado com o n.iso). */
export async function novoItem(id: string, nome = 'Sistema exemplo', projeto = P) {
  await env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES (?, ?, ?, 'sistema')`).bind(id, projeto, nome).run();
  return id;
}

/**
 * Cria um tratamento com pedido de aprovação CISO aprovado cujo hash é o do conteúdo atual (sem passar pela rota, para a migration não
 * depender do código novo). Devolve o id do tratamento. Usa o mesmo cálculo da aprovação real (hashConteudo de documentoAtual).
 */
export async function aprovarTratamentoDeTeste(db: D1Database, projeto: string): Promise<string> {
  const { documentoAtual, hashConteudo } = await import('../../src/services/pedidos');
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente exemplo', 'LGPD', 'Controller', 'Active')`).bind(projeto),
    db.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_subjects, data_categories) VALUES (?, ?, 'Atividade aprovada exemplo', 'Titular exemplo A', 'Dado exemplo 1')`).bind(`${projeto}-r`, projeto),
  ]);
  const doc = await documentoAtual(db, 'tratamento', `${projeto}-r`, projeto);
  const hash = await hashConteudo(doc!.conteudo);
  await db.batch([
    db.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por) VALUES (?, 'org_ness', ?, 'tratamento', ?, 'Tratamento: exemplo', ?, ?, 'ciso', 'aprovado', 'cons@ness.lat')`)
      .bind(`${projeto}-p`, projeto, `${projeto}-r`, JSON.stringify(doc!.conteudo), hash),
    db.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, nome, status, decidido_em) VALUES (?, ?, 'dpo@cliente.exemplo', 'Encarregado exemplo', 'aprovado', datetime('now'))`).bind(`${projeto}-d`, `${projeto}-p`),
  ]);
  return `${projeto}-r`;
}
export { applySchema, sha256Hex };
