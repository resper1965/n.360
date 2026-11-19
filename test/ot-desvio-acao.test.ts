import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Desvio → ação corretiva (onda 3, Task 4). O título é lido por quem não tem o ot: só o que a pessoa escreveu, sem nome de ativo/zona/site.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const CHAVE = 'chave-acao-ot';
const AGENTE = { userId: 'cons:ag@ness.lat', email: 'ag@ness.lat', projectId: 'proj-a', concessaoId: 'c-ag' };
let cons: H, tec: H, semOt: H;

async function chamar(h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) {
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra }, ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
const acao = (h: H, id: string, corpo: Record<string, unknown>, extra?: Record<string, unknown>) => chamar(h, 'POST', `${P}/desvios/${id}/acao`, corpo, extra);
const ok = { titulo: 'Revisar a regra de acesso remoto', assigned_to: 'Maria Souza' };
const n = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
async function desvio(id: string, site = 's1', projeto = 'proj-a', situacao = 'aberto') {
  await run(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, situacao, primeira_vez, ultima_vez) VALUES (?, ?, ?, 'ativo', ?, ?, ?, '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`,
    id, projeto, site, `chave-${id}-SENS99`, JSON.stringify({ fabricante: 'FABRICANTE-X7', protocolos_portas: [{ protocolo: 'protoz', porta: 47808 }] }), situacao);
}

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'), ('u-sem', 'sem@cliente.teste', 'x', 'Sem OT', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'Subestação Ágata'), ('sb', 'proj-b', 'SE B')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Zona Controle', 2)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at1', 'proj-a', 's1', 'RTU-Principal'), ('at2', 'proj-a', 's1', 'ab')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ac', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await designarConsultor('c@ness.lat', 'proj-a'); await designarConsultor(AGENTE.email, 'proj-a');
  await run(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ag', ?, 'proj-a', datetime('now', '+30 days'))`, AGENTE.userId);
  await concederModulos(['u-t', 'cons:c@ness.lat', AGENTE.userId], ['ot']);
  cons = await sessionFor({ id: 'cons:c@ness.lat', email: 'c@ness.lat', role: 'consultor' });
  tec = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  semOt = await sessionFor({ id: 'u-sem', email: 'sem@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  vi.spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(null, { status: 200 })) as typeof fetch);
});

describe('POST /desvios/:id/acao', () => {
  it('201: cria a ação com o título enviado, uma referência e o desvio tratado; a 2ª chamada é 200 idempotente', async () => {
    await desvio('d1');
    const r = await acao(cons, 'd1', { ...ok, descricao: 'Texto livre', prazo: '2026-12-31' });
    expect(r.status, await r.clone().text()).toBe(201);
    const j = await r.json<{ ok: boolean; acao_id: string; ja_existia: boolean }>();
    expect(j).toMatchObject({ ok: true, ja_existia: false });
    expect(await env.DB.prepare(`SELECT title, description, status, assigned_to, due_date FROM corrective_actions WHERE id = ?`).bind(j.acao_id).first())
      .toEqual({ title: ok.titulo, description: 'Texto livre', status: 'Open', assigned_to: 'Maria Souza', due_date: '2026-12-31' });
    expect(await env.DB.prepare(`SELECT acao_id, ot_site_id FROM ot_referencias WHERE ot_desvio_id = 'd1'`).all().then((x) => x.results)).toEqual([{ acao_id: j.acao_id, ot_site_id: 's1' }]);
    expect(await env.DB.prepare(`SELECT situacao, nota FROM ot_desvios WHERE id = 'd1'`).first()).toEqual({ situacao: 'tratado', nota: 'Ação corretiva aberta' });
    expect(await n(`SELECT count(*) n FROM audit_logs WHERE action = 'ot.desvio.acao'`)).toBe(1);

    const r2 = await acao(cons, 'd1', { ...ok, titulo: 'Outro título qualquer' });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ ok: true, acao_id: j.acao_id, ja_existia: true });
    expect(await n(`SELECT count(*) n FROM corrective_actions WHERE title LIKE 'Revisar%' OR title LIKE 'Outro%'`)).toBe(1);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd1'`)).toBe(1);
  });

  it('o servidor não copia dado do desvio: nem a resposta nem a ação trazem protocolo, porta, fabricante ou chave', async () => {
    await desvio('d2');
    const r = await acao(cons, 'd2', ok);
    const texto = await r.text();
    const linha = JSON.stringify(await env.DB.prepare(`SELECT * FROM corrective_actions WHERE title = ?`).bind(ok.titulo).all());
    for (const s of ['protoz', '47808', 'FABRICANTE-X7', 'SENS99', 'chave-d2']) { expect(texto).not.toContain(s); expect(linha).not.toContain(s); }
  });

  it('núcleo: quem não tem o ot vê a ação (só título) e nenhum campo de referência', async () => {
    const r = await chamar(semOt, 'GET', '/api/v1/projects/proj-a/capa');
    expect(r.status, await r.clone().text()).toBe(200);
    const { actions } = await r.json<{ actions: Record<string, unknown>[] }>();
    const a = actions.find((x) => x.title === ok.titulo)!;
    expect(a).toBeTruthy();
    expect(JSON.stringify(actions)).not.toMatch(/ot_desvio|ot_site|ot_ativo|referencia/);
  });

  it('sem n.iso no projeto: 409 e nada é criado', async () => {
    await desvio('d3');
    await run(`DELETE FROM projeto_modulos WHERE project_id = 'proj-a' AND modulo = 'iso'`);
    const antes = await n(`SELECT count(*) n FROM corrective_actions`);
    const r = await acao(cons, 'd3', ok);
    await run(`INSERT INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES ('proj-a', 'iso', 'teste')`);
    expect(r.status).toBe(409);
    expect((await r.json<{ error: string }>()).error).toContain('n.iso');
    expect(await n(`SELECT count(*) n FROM corrective_actions`)).toBe(antes);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd3'`)).toBe(0);
    expect(await n(`SELECT count(*) n FROM ot_desvios WHERE id = 'd3' AND situacao = 'aberto'`)).toBe(1);
  });

  it('texto com IP, e-mail ou MAC: 400; sem responsável: 400', async () => {
    for (const titulo of ['Isolar o host 10.1.2.3 agora', 'Avisar fulano@empresa.com sobre', 'Trocar o equipamento 00:1A:2B:3C:4D:5E']) {
      const r = await acao(cons, 'd3', { ...ok, titulo });
      expect(r.status, titulo).toBe(400);
    }
    expect((await acao(cons, 'd3', { titulo: ok.titulo })).status).toBe(400);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd3'`)).toBe(0);
  });

  it('nome de ativo, zona ou site (qualquer caixa/acento): 400 sem dizer qual; texto inócuo: 201', async () => {
    await desvio('d4');
    for (const titulo of ['Revisar o rtu-principal do pátio', 'Segregar a ZONA CONTROLE da rede', 'Auditar subestacao agata hoje', 'Trocar SUBESTAÇÃO ÁGATA']) {
      const r = await acao(cons, 'd4', { ...ok, titulo });
      expect(r.status, titulo).toBe(400);
      const e = (await r.json<{ error: string }>()).error;
      expect(e).toBe('O texto não pode citar o nome de ativos, zonas ou sites do projeto.');
      expect(e.toLowerCase()).not.toMatch(/rtu|ágata|agata|controle/);
    }
    expect((await acao(cons, 'd4', { ...ok, titulo: 'Texto inócuo sobre processo', descricao: 'cita a Zona Controle' })).status).toBe(400); // descrição também
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd4'`)).toBe(0);
    expect((await acao(cons, 'd4', { ...ok, titulo: 'Texto inócuo sobre ab processo' })).status).toBe(201); // nome com menos de 3 letras é ignorado
  });

  it('agente e chave de API recusados (P0-2); sem ot e técnico: 403', async () => {
    await desvio('d5');
    expect((await acao({ 'X-API-Key': CHAVE }, 'd5', ok)).status).toBe(403);
    expect((await acao({}, 'd5', ok, { AGENTE })).status).toBe(403);
    expect((await acao(semOt, 'd5', ok)).status).toBe(403);
    expect((await acao(tec, 'd5', ok)).status).toBe(403);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'd5'`)).toBe(0);
  });

  it('desvio de outro projeto e inexistente: 404; desvio não aberto e sem ação: 409; corpo com campo a mais: 400', async () => {
    await desvio('db', 'sb', 'proj-b'); await desvio('d6', 's1', 'proj-a', 'aceito');
    expect((await acao(cons, 'db', ok)).status).toBe(404);
    expect((await acao(cons, 'nao-existe', ok)).status).toBe(404);
    expect((await acao(cons, 'd6', ok)).status).toBe(409);
    expect((await acao(cons, 'd5', { ...ok, severity: 'High' })).status).toBe(400);
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id IN ('db', 'd6')`)).toBe(0);
  });

  it('corrida: se o desvio deixou de estar aberto entre a checagem e o batch, nenhuma ação órfã nasce', async () => {
    const { criarAcaoDoDesvio } = await import('../src/services/ot-desvio-acao');
    await desvio('d7');
    const antes = await n(`SELECT count(*) n FROM corrective_actions`);
    const a = await criarAcaoDoDesvio(env.DB, 'proj-a', 'd7', JSON.stringify(['s1']), 'x', { titulo: 'Primeira', assigned_to: 'a' });
    const b = await criarAcaoDoDesvio(env.DB, 'proj-a', 'd7', JSON.stringify(['s1']), 'x', { titulo: 'Segunda', assigned_to: 'a' });
    expect(a).not.toBeNull(); expect(b).toBeNull();
    expect(await n(`SELECT count(*) n FROM corrective_actions`)).toBe(antes + 1);
    expect(await n(`SELECT count(*) n FROM corrective_actions WHERE title = 'Segunda'`)).toBe(0);
  });
});

// Segregação: quem abriu a ação a partir do desvio não a conclui (recusa só; nunca revela a origem a quem não é o criador).
describe('concluir a ação do desvio', () => {
  const MSG = 'Quem criou a ação a partir do desvio não a conclui. Peça a outra pessoa.';
  const outro = async () => { await designarConsultor('o@ness.lat', 'proj-a'); return sessionFor({ id: 'cons:o@ness.lat', email: 'o@ness.lat', role: 'consultor' }); };
  const DEC = { 'X-Agente-Ferramenta': 'niso_concluir_acao', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent('pedido do consultor') };
  const status = async (id: string) => (await env.DB.prepare('SELECT status FROM corrective_actions WHERE id = ?').bind(id).first<{ status: string }>())!.status;
  async function nova(d: string) {
    await desvio(d);
    const j = await (await acao(cons, d, ok)).json<{ acao_id: string }>();
    return j.acao_id;
  }
  const capa = (h: H, id: string, corpo: Record<string, unknown>, extra?: Record<string, unknown>) => chamar(h, 'PUT', `/api/v1/capa/${id}`, { title: 'Revisar', ...corpo }, extra);

  it('o criador fecha: 403 com a mensagem e a ação segue aberta; editar sem fechar: 200', async () => {
    const id = await nova('dc1');
    const r = await capa(cons, id, { status: 'Closed' });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: MSG });
    expect(await status(id)).toBe('Open');
    expect((await capa(cons, id, { status: 'In Progress' })).status).toBe(200);
    expect(await status(id)).toBe('In Progress');
  });

  it('outra pessoa fecha: 200 e a resposta não revela a origem', async () => {
    const id = await nova('dc2');
    const r = await capa(await outro(), id, { status: 'Closed' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.text()).not.toMatch(/desvio|ot/i);
    expect(await status(id)).toBe('Closed');
  });

  it('ação sem referência fecha normalmente pelo seu criador', async () => {
    await run(`INSERT INTO corrective_actions (id, project_id, title, status) VALUES ('ca-livre', 'proj-a', 'Livre', 'Open')`);
    expect((await capa(cons, 'ca-livre', { status: 'Closed' })).status).toBe(200);
    expect(await status('ca-livre')).toBe('Closed');
  });

  it('o agente do próprio criador (mesmo id) também é recusado, mesmo com a ferramenta; o de outra pessoa conclui', async () => {
    const id = await nova('dc3');
    await run(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-agc', 'cons:c@ness.lat', 'proj-a', datetime('now', '+30 days'))`);
    const r = await capa({ ...DEC }, id, { status: 'Closed' }, { AGENTE: { ...AGENTE, userId: 'cons:c@ness.lat', email: 'c@ness.lat', concessaoId: 'c-agc' } });
    expect(r.status, await r.clone().text()).toBe(403);
    expect(await status(id)).toBe('Open');
    const r2 = await capa({ ...DEC }, id, { status: 'Closed' }, { AGENTE });
    expect(r2.status, await r2.clone().text()).toBe(200);
    expect(await status(id)).toBe('Closed');
  });

  it('falha ao ler a referência: fecha nada (fail-closed, 500)', async () => {
    const id = await nova('dc4');
    const orig = env.DB.prepare.bind(env.DB);
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation(((sql: string) => {
      if (/FROM ot_referencias WHERE acao_id/.test(sql)) throw new Error('boom');
      return orig(sql);
    }) as typeof env.DB.prepare);
    const r = await capa(await outro(), id, { status: 'Closed' });
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(await status(id)).toBe('Open');
  });

  it('desvio pelo outro caminho: religar a ação a um incidente e fechar pela rota do incidente também é recusado ao criador', async () => {
    const id = await nova('dc5');
    await run(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, risco_titular, status) VALUES ('inc-dc5', 'proj-a', 'IN-2026-0905', 'X', '2026-10-01', 'baixo', 'avaliado')`);
    expect((await capa(cons, id, { status: 'Open', incidente_id: 'inc-dc5' })).status).toBe(200);
    const url = `/api/v1/projects/proj-a/incidentes/inc-dc5/acoes/${id}`;
    const r = await chamar(cons, 'PUT', url, { status: 'Closed' });
    expect(r.status, await r.clone().text()).toBe(403);
    expect(await r.json()).toEqual({ error: MSG });
    expect(await status(id)).toBe('Open');
    expect((await chamar(await outro(), 'PUT', url, { status: 'Closed' })).status).toBe(200);
    expect(await status(id)).toBe('Closed');
  });

  it('apagar a referência do desvio: 409 e fechar segue 403; referência de site avulsa apaga normalmente e não trava ninguém', async () => {
    const id = await nova('dc6');
    const ref = (await env.DB.prepare(`SELECT id FROM ot_referencias WHERE acao_id = ? AND ot_desvio_id = 'dc6'`).bind(id).first<{ id: string }>())!.id;
    const d = await chamar(cons, 'DELETE', `${P}/referencias/${ref}`);
    expect(d.status).toBe(409);
    expect(await d.json()).toEqual({ error: 'Este vínculo nasceu de um desvio e não pode ser removido.' });
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE id = ?`, ref)).toBe(1);
    expect((await capa(cons, id, { status: 'Closed' })).status).toBe(403);
    // Quem liga um site à ação de outra pessoa não fica barrado por isso; a referência avulsa se remove.
    const o = await outro();
    await concederModulos(['cons:o@ness.lat'], ['ot']);
    const c2 = await chamar(o, 'POST', `${P}/referencias`, { acao_id: id, ot_site_id: 's1' });
    expect(c2.status, await c2.clone().text()).toBe(201);
    const r2 = await capa(o, id, { status: 'Closed' });
    expect(r2.status, await r2.clone().text()).toBe(200);
    expect((await chamar(cons, 'DELETE', `${P}/referencias/${(await c2.json<{ id: string }>()).id}`)).status).toBe(200);
  });
});

describe('excluir a ação que nasceu de um desvio (CAPA)', () => {
  it('reabre o desvio, resposta igual à de uma exclusão comum, e uma nova ação pode ser criada', async () => {
    await desvio('dcapa');
    const j = await (await acao(cons, 'dcapa', ok)).json<{ acao_id: string }>();
    expect(await env.DB.prepare(`SELECT situacao, nota FROM ot_desvios WHERE id = 'dcapa'`).first()).toEqual({ situacao: 'tratado', nota: 'Ação corretiva aberta' });
    await run(`INSERT INTO corrective_actions (id, project_id, title) VALUES ('comum', 'proj-a', 'comum')`);
    const normal = await chamar(cons, 'DELETE', `/api/v1/capa/comum`);
    const r = await chamar(cons, 'DELETE', `/api/v1/capa/${j.acao_id}`);
    expect(r.status).toBe(normal.status);
    expect(await r.text()).toBe(await normal.text());
    expect(await env.DB.prepare(`SELECT situacao, nota FROM ot_desvios WHERE id = 'dcapa'`).first()).toEqual({ situacao: 'aberto', nota: null });
    expect(await n(`SELECT count(*) n FROM ot_referencias WHERE ot_desvio_id = 'dcapa'`)).toBe(0);
    expect((await acao(cons, 'dcapa', ok)).status).toBe(201);
  });

  it('desvio já regularizado/aceito não é reaberto pela exclusão da ação', async () => {
    await desvio('dreg');
    const j = await (await acao(cons, 'dreg', ok)).json<{ acao_id: string }>();
    await run(`UPDATE ot_desvios SET situacao = 'aceito' WHERE id = 'dreg'`);
    await chamar(cons, 'DELETE', `/api/v1/capa/${j.acao_id}`);
    expect((await env.DB.prepare(`SELECT situacao FROM ot_desvios WHERE id = 'dreg'`).first<{ situacao: string }>())!.situacao).toBe('aceito');
  });
});
