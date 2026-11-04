import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import worker, { ROTAS_OAUTH } from '../src/index';
import { sha256Hex } from '../src/helpers';
import { aadOt, chavesOt, decifrarOt } from '../src/services/ot-cifra';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Endpoint MCP do agente de coleta do n.ot (L5, Task 3). D1 real, chave `ot_coleta` no Bearer.
type H = Record<string, string>;
const BASE = 'https://n360.ness.com.br';
const P = '/api/v1/projects/proj-a/ot';
const humano = (h: H, metodo: string, caminho: string, corpo?: unknown) => worker.fetch(new Request(BASE + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv(), createExecutionContext());
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await humano(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

const bruto = (chave: string | null, method: string, params: unknown = {}, e: any = workerEnv()) =>
  worker.fetch(new Request(`${BASE}/ot-coleta/mcp`, {
    method: 'POST',
    headers: { Host: 'n360.ness.com.br', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(chave && { Authorization: `Bearer ${chave}` }) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), e, createExecutionContext());

async function rpc(chave: string, method: string, params: unknown = {}) {
  const r = await bruto(chave, method, params);
  const texto = await r.text();
  expect(r.status, texto).toBe(200);
  const json = r.headers.get('Content-Type')?.includes('text/event-stream') ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6) : texto;
  return JSON.parse(json).result;
}
const ferramenta = async (chave: string, name: string, args: unknown) => {
  const res = await rpc(chave, 'tools/call', { name, arguments: args });
  return { erro: res.isError === true, texto: res.content[0].text as string, dados: res.isError ? undefined : JSON.parse(res.content[0].text) };
};

const ins = (id: string, projeto: string, texto: string, permissions: string, extra = `'Active', '2099-01-01T00:00:00.000Z'`) =>
  sha256Hex(texto).then((h) => env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status, expires_at)
    VALUES (?, ?, ?, 'agente', ?, ${extra})`).bind(id, projeto, h, permissions).run());

let cons: H;
let chave = '', chaveId = '';
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-c', 'Cliente C', 'ISO 27001', 'controller', 'Active')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES ('proj-c', 'iso', 'teste')`).run();
  await env.DB.prepare(`UPDATE projects SET agente_coleta_ot = 1 WHERE id = 'proj-c'`).run();
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a', 'proj-b');
  await concederModulos(['u-gestor', 'cons:cons-ot@ness.lat'], ['ot']);
  const gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  ids.a1 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'RTU 1', ip: '10.1.1.10' });
  ids.z1 = await criar(cons, 'zonas', { site_id: ids.s1, nome: 'Zona Real', nivel_purdue: 2 });
  const rb = await humano(cons, 'POST', '/api/v1/projects/proj-b/ot/sites', { nome: 'SE de B' });
  ids.sB = (await rb.json<{ id: string }>()).id;
  ids.levHumano = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-01', documento_titulo: 'Manual' });
  expect((await humano(gestor, 'PUT', `${P}/agente`, { ligado: true })).status).toBe(200);
  const k = await (await humano(cons, 'POST', `${P}/agente/chaves`, { nome: 'Claude Code' })).json<{ id: string; chave: string }>();
  chave = k.chave; chaveId = k.id;
  await ins('k-rd', 'proj-a', 'k-leitura', 'read');
  await ins('k-rev', 'proj-a', 'k-revogada', 'ot_coleta', `'Revoked', NULL`);
  await ins('k-venc', 'proj-a', 'k-vencida', 'ot_coleta', `'Active', '2020-01-01T00:00:00.000Z'`);
  await ins('k-b', 'proj-b', 'k-desligado', 'ot_coleta');
  await ins('k-c', 'proj-c', 'k-sem-ot', 'ot_coleta');
  await ins('k-outra', 'proj-a', 'k-outra', 'ot_coleta');
  await ins('k-teto', 'proj-a', 'k-teto', 'ot_coleta');
  await ins('k-nula', 'proj-a', 'k-sem-validade', 'ot_coleta', `'Active', NULL`);
  await ins('k-sess', 'proj-a', 'k-sessoes', 'ot_coleta');
});

describe('autenticação do /ot-coleta/mcp', () => {
  it('sem chave, chave read, revogada, vencida ou sem validade: 401 com WWW-Authenticate', async () => {
    for (const k of [null, 'k-leitura', 'k-revogada', 'k-vencida', 'k-sem-validade', 'inexistente']) {
      const r = await bruto(k, 'tools/list');
      expect(r.status, String(k)).toBe(401);
      expect(r.headers.get('WWW-Authenticate')).toContain('Bearer');
    }
  });

  it('interruptor desligado ou projeto sem n.ot: 403', async () => {
    for (const k of ['k-desligado', 'k-sem-ot']) {
      const r = await bruto(k, 'tools/list');
      expect(r.status, k).toBe(403);
    }
    expect((await (await bruto('k-desligado', 'tools/list')).json<{ error: string }>()).error).toBe('Agente de coleta desligado neste projeto');
  });

  it('sem as chaves do n.ot: 503', async () => {
    const e = { ...workerEnv(), OT_INVENTARIO_KEY: undefined };
    expect((await bruto(chave, 'tools/list', {}, e)).status).toBe(503);
  });

  it('fora do OAuth; fica no domínio de módulo (como o /mcp) e o host legado redireciona ao APP_URL', async () => {
    expect(ROTAS_OAUTH('/ot-coleta/mcp')).toBe(false);
    const em = (host: string) => worker.fetch(new Request(`https://${host}/ot-coleta/mcp`, { method: 'POST' }), workerEnv(), createExecutionContext());
    expect((await em('niso.ness.com.br')).status).toBe(401);
    const r = await em('n-iso.ness.com.br');
    expect(r.status).toBe(308);
    expect(r.headers.get('Location')).toBe('https://n360.ness.com.br/ot-coleta/mcp');
  });

  it('X-API-Key também vale e atualiza last_used_at', async () => {
    const r = await worker.fetch(new Request(`${BASE}/ot-coleta/mcp`, {
      method: 'POST', headers: { Host: 'n360.ness.com.br', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-API-Key': 'k-outra' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }), workerEnv(), createExecutionContext());
    expect(r.status).toBe(200);
    const l = await env.DB.prepare(`SELECT last_used_at FROM api_keys WHERE id = 'k-outra'`).first<{ last_used_at: string | null }>();
    expect(l!.last_used_at).toBeTruthy();
  });
});

describe('política de segurança do cliente', () => {
  const comIp = (ip: string | null, k = 'k-outra') => worker.fetch(new Request(`${BASE}/ot-coleta/mcp`, {
    method: 'POST',
    headers: { Host: 'n360.ness.com.br', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${k}`,
      ...(ip && { 'CF-Connecting-IP': ip }) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'criar_sessao_documental', arguments: { site_id: ids.s1, documento_titulo: 'Allowlist' } } }),
  }), workerEnv(), createExecutionContext());
  const sessoes = async () => (await env.DB.prepare(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'apikey:k-outra'`).first<{ n: number }>())!.n;

  it('allowlist de IP que exclui o chamador: 403 e nada executado; IP permitido: executa', async () => {
    await env.DB.prepare(`INSERT INTO project_security_policy (project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist) VALUES ('proj-a', 1, 60, '203.0.113.0/24')`).run();
    try {
      const antes = await sessoes();
      for (const ip of ['198.51.100.7', null]) {
        const r = await comIp(ip);
        expect(r.status, String(ip)).toBe(403);
        expect((await r.json<{ error: string }>()).error).toBe('Forbidden: origem não permitida pela política de segurança deste cliente');
      }
      expect(await sessoes()).toBe(antes);
      const ok = await comIp('203.0.113.7'); // MFA e TTL da política não alcançam o agente
      const texto = await ok.text();
      expect(ok.status, texto).toBe(200);
      expect(texto).toContain('levantamento_id');
      expect(await sessoes()).toBe(antes + 1);
    } finally {
      await env.DB.prepare(`DELETE FROM project_security_policy WHERE project_id = 'proj-a'`).run();
    }
  });

  it('falha da trilha depois de gravar não vira Falha interna', async () => {
    await env.DB.prepare(`CREATE TRIGGER trilha_falha BEFORE INSERT ON audit_logs WHEN NEW.action = 'ot.agente.criar_sessao_documental' BEGIN SELECT RAISE(ABORT, 'trilha fora'); END`).run();
    try {
      const antes = await sessoes();
      const r = await ferramenta('k-outra', 'criar_sessao_documental', { site_id: ids.s1, documento_titulo: 'Sem trilha' });
      expect(r.erro, r.texto).toBe(false);
      expect(r.dados.levantamento_id).toBeTruthy();
      expect(await sessoes()).toBe(antes + 1);
    } finally {
      await env.DB.prepare('DROP TRIGGER trilha_falha').run();
    }
  });
});

describe('ferramentas', () => {
  it('tools/list: exatamente as 4, com esquema estrito', async () => {
    const { tools } = await rpc(chave, 'tools/list');
    expect(tools.map((t: any) => t.name).sort()).toEqual(['criar_sessao_documental', 'encerrar_sessao', 'ler_depara', 'registrar_achados']);
    expect(tools.every((t: any) => t.inputSchema.additionalProperties === false)).toBe(true);
  });

  it('nome fora das 4: Ferramenta indisponível', async () => {
    const r = await ferramenta(chave, 'niso_ler', { caminho: '/api/v1/projects' });
    expect(r).toMatchObject({ erro: true, texto: 'Ferramenta indisponível' });
  });

  it('ler_depara: formato, vocabulários, roteiro e sites só com id e nome; nada do inventário', async () => {
    const r = await ferramenta(chave, 'ler_depara', {});
    expect(r.erro).toBe(false);
    expect(r.dados.sites).toEqual([{ id: ids.s1, nome: 'SE Norte' }]);
    expect(r.dados.vocabularios.categoria_arciber).toEqual(['centro_operacao', 'infra_dados_voz', 'ambiente_ons']);
    expect(r.dados.limites).toEqual({ achados_por_chamada: 200, achados_por_sessao: 2000 });
    expect(r.dados.roteiro.length).toBe(15);
    expect(Object.keys(r.dados.roteiro[0]).sort()).toEqual(['id', 'item_norma', 'texto']);
    expect(r.dados.campos.map((c: any) => c.campo)).toContain('categoria_arciber');
    expect(r.dados.campos.map((c: any) => c.campo)).not.toContain('zona');
    expect(r.dados.regras.join(' ')).toMatch(/IP/);
    expect(r.texto).not.toContain('RTU 1');
    expect(r.texto).not.toContain(ids.a1);
  });

  it('criar_sessao_documental: sessão documento do agente; site de outro projeto é recusado', async () => {
    const r = await ferramenta(chave, 'criar_sessao_documental', { site_id: ids.s1, documento_titulo: 'Diagrama unifilar SE Norte', documento_data: '2026-10-01' });
    expect(r.erro, r.texto).toBe(false);
    ids.lev = r.dados.levantamento_id;
    const l = await env.DB.prepare('SELECT tipo, criado_por, project_id, situacao FROM ot_levantamentos WHERE id = ?').bind(ids.lev).first();
    expect(l).toEqual({ tipo: 'documento', criado_por: `apikey:${chaveId}`, project_id: 'proj-a', situacao: 'aberto' });
    expect((await ferramenta(chave, 'criar_sessao_documental', { site_id: ids.sB, documento_titulo: 'x' })).erro).toBe(true);
    expect((await ferramenta(chave, 'criar_sessao_documental', { site_id: ids.s1, documento_titulo: 'fale com ana@x.com' })).erro).toBe(true);
  });

  it('registrar_achados: mesma resposta para existente e novo; IP cifrado com a AAD do achado; evidência com e-mail recusada', async () => {
    const r = await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.lev, achados: [
      { dados: { nome: 'RTU 1', ip: '10.1.1.10' }, evidencia: 'Página 3: RTU principal da subestação' },
      { dados: { nome: 'Gateway novo', categoria_arciber: 'centro_operacao' }, evidencia: 'Página 4: gateway de comunicação' },
      { dados: { nome: 'IHM' }, evidencia: 'contato: joao@empresa.com.br' },
    ] });
    expect(r.erro, r.texto).toBe(false);
    expect(Object.keys(r.dados).sort()).toEqual(['com_aviso', 'criados', 'recusados']);
    expect(r.dados.criados).toBe(2);
    expect(r.dados.recusados).toEqual([{ indice: 2, motivo: expect.any(String) }]);
    expect(r.texto).not.toMatch(/joao|confronto|alvo_id|duplicata/);
    const { results } = await env.DB.prepare('SELECT id, dados, origem, situacao, criado_por FROM ot_achados WHERE levantamento_id = ? ORDER BY created_at')
      .bind(ids.lev).all<{ id: string; dados: string; origem: string; situacao: string; criado_por: string }>();
    expect(results.length).toBe(2);
    expect(results.every((a) => a.origem === 'agente' && a.situacao === 'rascunho' && a.criado_por === `apikey:${chaveId}`)).toBe(true);
    expect(results.some((a) => a.dados.includes('10.1.1.10'))).toBe(false);
    const comIp = results.find((a) => a.dados.includes('ip_cifrado'))!;
    const d = JSON.parse(comIp.dados);
    expect(await decifrarOt(d.ip_cifrado, chavesOt(env as any)!, aadOt('proj-a', 'ot_achados', comIp.id, 'ip'))).toBe('10.1.1.10');
    ids.achados = JSON.stringify(results.map((a) => a.id));
  });

  it('zona e zona_id: recusa uniforme, a mesma resposta para zona real e inventada', async () => {
    const resp = [];
    for (const dados of [{ nome: 'CLP 1', zona: 'Zona Real' }, { nome: 'CLP 1', zona: 'Zona Inventada' }, { nome: 'CLP 1', zona_id: ids.z1 }, { nome: 'CLP 1', zona_id: 'z-falsa' }]) {
      const r = await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.lev, achados: [{ dados, evidencia: 'Página 9: CLP' }] });
      expect(r.erro, r.texto).toBe(false);
      resp.push(r.texto);
    }
    expect(new Set(resp).size).toBe(1);
    expect(JSON.parse(resp[0])).toEqual({ criados: 0, recusados: [{ indice: 0, motivo: 'campo não aceito pelo agente' }], com_aviso: 0 });
  });

  it('argumentos fora do esquema estrito (projectId, project_id): recusados', async () => {
    for (const extra of [{ projectId: 'proj-b' }, { project_id: 'proj-b' }]) {
      const r = await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.lev, achados: [{ dados: { nome: 'x' }, evidencia: 'y' }], ...extra });
      expect(r.erro).toBe(true);
      expect(r.texto).toMatch(/inválido/i);
    }
    expect((await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.lev, achados: [] })).erro).toBe(true);
  });

  it('sessão do humano ou de outra chave: Sessão não encontrada', async () => {
    const humanoR = await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.levHumano, achados: [{ dados: { nome: 'x' }, evidencia: 'y' }] });
    expect(humanoR).toMatchObject({ erro: true, texto: 'Sessão não encontrada' });
    const outra = await ferramenta('k-outra', 'registrar_achados', { levantamento_id: ids.lev, achados: [{ dados: { nome: 'x' }, evidencia: 'y' }] });
    expect(outra).toMatchObject({ erro: true, texto: 'Sessão não encontrada' });
    expect(await ferramenta('k-outra', 'encerrar_sessao', { levantamento_id: ids.lev })).toMatchObject({ erro: true, texto: 'Sessão não encontrada' });
  });

  it('o consultor lê a sessão pela rota da L1 e envia os achados do agente ao lote', async () => {
    const r = await (await humano(cons, 'GET', `${P}/levantamentos/${ids.lev}`)).json<{ achados: { id: string; origem: string }[] }>();
    expect(r.achados.length).toBe(2);
    expect(r.achados.every((a) => a.origem === 'agente')).toBe(true);
    const env2 = await humano(cons, 'POST', `${P}/levantamentos/${ids.lev}/enviar`, { achados: JSON.parse(ids.achados) });
    expect(env2.status, await env2.clone().text()).toBe(201);
  });

  it('encerrar_sessao: depois, registrar e encerrar de novo dão Sessão encerrada', async () => {
    expect(await ferramenta(chave, 'encerrar_sessao', { levantamento_id: ids.lev })).toMatchObject({ erro: false, dados: { ok: true } });
    const l = await env.DB.prepare('SELECT situacao, encerrado_em FROM ot_levantamentos WHERE id = ?').bind(ids.lev).first<{ situacao: string; encerrado_em: string }>();
    expect(l!.situacao).toBe('encerrado');
    expect(l!.encerrado_em).toBeTruthy();
    const r = await ferramenta(chave, 'registrar_achados', { levantamento_id: ids.lev, achados: [{ dados: { nome: 'x' }, evidencia: 'y' }] });
    expect(r).toMatchObject({ erro: true, texto: 'Sessão encerrada' });
  });

  it('trilha: ot.agente.registrar_achados com o ator da chave e a contagem, sem IP', async () => {
    const { results } = await env.DB.prepare(`SELECT actor, details, project_id FROM audit_logs WHERE action = 'ot.agente.registrar_achados'`)
      .all<{ actor: string; details: string; project_id: string }>();
    const ok = results.find((l) => l.details.includes('2 achados'))!;
    expect(ok).toMatchObject({ actor: `apikey:${chaveId} (Claude Code)`, project_id: 'proj-a' });
    expect(results.some((l) => l.details.includes('10.1.1.10') || l.details.includes('joao'))).toBe(false);
    const acoes = (await env.DB.prepare(`SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'ot.agente.%' AND actor LIKE 'apikey:%'`).all<{ action: string }>())
      .results.map((l) => l.action).sort();
    expect(acoes).toEqual(['ot.agente.criar_sessao_documental', 'ot.agente.encerrar_sessao', 'ot.agente.ler_depara', 'ot.agente.registrar_achados']);
  });

  it('teto: a 121ª tools/call da chave na hora é recusada; tools/list segue de graça', async () => {
    await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?, 119, ?)').bind('ot:agente:k-teto', Math.floor(Date.now() / 1000)).run();
    expect((await ferramenta('k-teto', 'ler_depara', {})).erro).toBe(false); // 120ª
    const r = await ferramenta('k-teto', 'ler_depara', {});
    expect(r.erro).toBe(true);
    expect(r.texto).toMatch(/Limite de 120 chamadas por hora/);
    expect((await rpc('k-teto', 'tools/list')).tools.length).toBe(4);
  });

  it('lote JSON-RPC (array): 400 e nada executado', async () => {
    const antes = (await env.DB.prepare(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = ?`).bind(`apikey:${chaveId}`).first<{ n: number }>())!.n;
    const chamada = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'criar_sessao_documental', arguments: { site_id: ids.s1, documento_titulo: 'Lote' } } });
    const r = await worker.fetch(new Request(`${BASE}/ot-coleta/mcp`, {
      method: 'POST',
      headers: { Host: 'n360.ness.com.br', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${chave}` },
      body: JSON.stringify([chamada(1), chamada(2)]),
    }), workerEnv(), createExecutionContext());
    expect(r.status).toBe(400);
    const depois = (await env.DB.prepare(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = ?`).bind(`apikey:${chaveId}`).first<{ n: number }>())!.n;
    expect(depois).toBe(antes);
  });

  it('teto diário: a 21ª sessão da chave é recusada', async () => {
    const ins20 = Array.from({ length: 20 }, (_, i) => env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, criado_por)
      VALUES (?, 'proj-a', ?, 'documento', '2026-11-04', 'Doc', 'apikey:k-sess')`).bind(`lev-sess-${i}`, ids.s1));
    await env.DB.batch(ins20);
    const r = await ferramenta('k-sessoes', 'criar_sessao_documental', { site_id: ids.s1, documento_titulo: 'Doc 21' });
    expect(r).toMatchObject({ erro: true, texto: 'Limite de 20 sessões por dia desta chave atingido. Tente de novo amanhã.' });
  });
});

describe('carry-overs da Task 2', () => {
  it('GET /agente/chaves mostra a vencida como Vencida; DELETE de chave já revogada: 404, sem trilha nova', async () => {
    const { chaves } = await (await humano(cons, 'GET', `${P}/agente/chaves`)).json<{ chaves: { id: string; status: string }[] }>();
    expect(chaves.find((k) => k.id === 'k-venc')!.status).toBe('Vencida');
    expect(chaves.find((k) => k.id === chaveId)!.status).toBe('Active');
    const antes = (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.agente.chave_revogada'`).first<{ n: number }>())!.n;
    expect((await humano(cons, 'DELETE', `${P}/agente/chaves/k-rev`)).status).toBe(404);
    const depois = (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.agente.chave_revogada'`).first<{ n: number }>())!.n;
    expect(depois).toBe(antes);
  });
});
