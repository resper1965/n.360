import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index';
import { encerrarObrasVencidas } from '../src/services/ot-desvio';
import { hojeEmSaoPaulo, diaMaisSP } from '../src/services/hoje';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, resetData } from './helpers/d1';

// n.ot E4 (Task 2): rotas da obra (só Gestor), entrega dos desvios abertos ao fechar a obra e o cron do prazo.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
let gestor: H, cons: H;
const posts: { url: string; corpo: any }[] = [];

async function chamar(h: H, metodo: string, caminho: string, corpo?: unknown) {
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const site = async (id = 's1') => (await env.DB.prepare(`SELECT fase, obra_ate FROM ot_sites WHERE id = ?`).bind(id).first<any>())!;
const trilhas = async (acao: string) => (await env.DB.prepare(`SELECT details, justification FROM audit_logs WHERE action = ? AND project_id = 'proj-a'`).bind(acao).all<any>()).results;
const ontem = () => diaMaisSP(-1);
const desvio = (id: string, siteId = 's1') => run(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez)
  VALUES (?, 'proj-a', ?, 'ativo', ?, '{}', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, id, siteId, `k-${id}`);

describe('obra do site', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    posts.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      if (url.startsWith('https://cloudflare-dns.com/')) {
        return new Response(JSON.stringify({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] }));
      }
      posts.push({ url, corpo: JSON.parse(String(init!.body)) });
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
    await resetData(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte', 'em_operacao'), ('sb', 'proj-b', 'SE B', 'em_operacao')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('cons:c@ness.lat', 'c@ness.lat', 'x', 'Consultor', 'consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Consultor', 'c@ness.lat', 'consultor', 'Consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Gestora', 'gestora@cliente.teste', 'cliente', 'Gestor ARCiber')`),
      env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret, status) VALUES ('w1', 'proj-a', 'https://soc.example/h', 'ot.desvio', 'seg', 'Active')`),
    ]);
    await concederModulos(['u-g', 'cons:c@ness.lat'], ['ot']);
    gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    cons = await sessionFor({ id: 'cons:c@ness.lat', email: 'c@ness.lat', role: 'consultor' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('abrir: consultor 403; justificativa com IP 400; Gestor abre e a trilha leva a justificativa', async () => {
    const corpo = { justificativa: 'Troca dos relés da SE', ate: diaMaisSP(10) };
    expect((await chamar(cons, 'POST', `${P}/sites/s1/obra/abrir`, corpo)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/obra/abrir`, { ...corpo, justificativa: 'Troca no 10.0.0.1' })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/obra/abrir`, { ...corpo, ate: '2026-13-01' })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/obra/abrir`, corpo)).status).toBe(200);
    expect(await site()).toEqual({ fase: 'em_obra', obra_ate: corpo.ate });
    expect((await trilhas('ot.site.obra_aberta'))[0]).toMatchObject({ justification: corpo.justificativa });
  });

  it('abrir em site de outro projeto: 404', async () => {
    expect((await chamar(gestor, 'POST', `${P}/sites/sb/obra/abrir`, { justificativa: 'Troca dos relés', ate: diaMaisSP(10) })).status).toBe(404);
  });

  it('renovar: Gestor renova uma vez; consultor 403; obra já vencida (ainda sem varredura) 409', async () => {
    await run(`UPDATE ot_sites SET fase = 'em_obra', obra_ate = ? WHERE id = 's1'`, diaMaisSP(5));
    const corpo = { justificativa: 'Atraso do fornecedor', ate: diaMaisSP(20) };
    expect((await chamar(cons, 'POST', `${P}/sites/s1/obra/renovar`, corpo)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/obra/renovar`, corpo)).status).toBe(200);
    expect((await site()).obra_ate).toBe(corpo.ate);
    expect(await trilhas('ot.site.obra_renovada')).toHaveLength(1);
    await run(`UPDATE ot_sites SET obra_ate = ?, obra_renovada = 0 WHERE id = 's1'`, ontem());
    const r = await chamar(gestor, 'POST', `${P}/sites/s1/obra/renovar`, { justificativa: 'Atraso do fornecedor', ate: diaMaisSP(3) });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'A obra já venceu' });
  });

  it('aprovar a base depois de obra: fecha a obra, trilha extra e um POST com os desvios abertos', async () => {
    await Promise.all([2, 3, 4].map((n) => run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'proj-a', 's1', 'z', ?)`, `z${n}`, n)));
    await run(`UPDATE ot_sites SET fase = 'base_em_aprovacao', obra_ate = ? WHERE id = 's1'`, diaMaisSP(5));
    await Promise.all([desvio('d1'), desvio('d2')]);
    await run(`UPDATE ot_desvios SET situacao = 'tratado' WHERE id = 'd2'`);
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/aprovar`, { declaracao: true })).status).toBe(200);
    expect((await site()).fase).toBe('em_operacao');
    expect(await trilhas('ot.site.obra_fechada')).toHaveLength(1);
    expect(posts).toHaveLength(1);
    expect(posts[0].corpo.desvios.map((d: any) => [d.id, d.acao])).toEqual([['d1', 'aberto']]);
  });

  it('aprovar a base sem obra: nenhum POST', async () => {
    await Promise.all([2, 3, 4].map((n) => run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'proj-a', 's1', 'z', ?)`, `z${n}`, n)));
    await run(`UPDATE ot_sites SET fase = 'base_em_aprovacao' WHERE id = 's1'`);
    await desvio('d1');
    expect((await chamar(gestor, 'POST', `${P}/sites/s1/base/aprovar`, { declaracao: true })).status).toBe(200);
    expect(posts).toHaveLength(0);
  });

  it('cron: obra vencida vira em_operacao, com trilha, e-mail ao Gestor ARCiber (sem dado de rede) e um POST dos desvios abertos', async () => {
    await run(`UPDATE ot_sites SET fase = 'em_obra', obra_ate = ? WHERE id = 's1'`, ontem());
    await run(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s2', 'proj-a', 'SE Sul', 'em_obra', ?)`, diaMaisSP(3));
    await desvio('d1');
    const ctx = createExecutionContext();
    expect(await encerrarObrasVencidas({ ...workerEnv(), RESEND_API_KEY: 'k' } as any, ctx, hojeEmSaoPaulo())).toBe(1);
    await waitOnExecutionContext(ctx);
    expect((await site()).fase).toBe('em_operacao');
    expect((await site('s2')).fase).toBe('em_obra');
    expect(await trilhas('ot.site.obra_vencida')).toHaveLength(1);
    const email = posts.find((p) => p.url.includes('resend'));
    expect(email!.corpo.to[0]).toBe('gestora@cliente.teste');
    expect(email!.corpo.subject).toContain('SE Norte');
    const hook = posts.find((p) => p.url.startsWith('https://soc.example'));
    expect(hook!.corpo.desvios.map((d: any) => d.id)).toEqual(['d1']);
  });
});
