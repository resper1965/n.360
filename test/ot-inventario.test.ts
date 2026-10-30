import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { requireResourceAccess, sha256Hex } from '../src/helpers';
import { chavesOt, decifrarOt, aadOt, hmacOt } from '../src/services/ot-cifra';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Inventário do n.ot (N2): CRUD, cifra (P0-8), máscara única (P0-6), filtro de site (P0-4), recusa de agente/chave (P0-2),
// violação 4.1.2/4.1.3 e conformidade por item da RO-CB.BR.01. Contra o D1 real.

type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const PB = '/api/v1/projects/proj-b/ot';
const chamar = async (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra });
const json = async <T = Record<string, unknown>>(r: Response) => r.json<T>();

const IP1 = '10.1.1.10';
const MAC1 = 'AA-BB-CC-11-22-33';
const ATIVO_ARCIBER = {
  nome: 'RTU Bay 1', no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'Fab', modelo: 'M1',
  funcao: 'telecontrole', ip: IP1, mac: MAC1, protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: '2.4.1.7',
};

let plat: H, gestor: H, tec: H, tec0: H, cli: H, cons: H, caDes: H, caNao: H, tecB: H;
const ids: Record<string, string> = {};

const criar = async (h: H, rota: string, corpo: unknown, base = P) => {
  const r = await chamar(h, 'POST', `${base}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await json<{ id: string }>(r)).id;
};

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarOt('proj-a', 'proj-b');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-tec0', 'tec0@cliente.teste', 'x', 'Técnico sem site', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a'),
      ('u-tecb', 'tecb@cliente.teste', 'x', 'Técnico B', 'org_user', 'proj-b'),
      ('u-ca-d', 'ca-d@ness.lat', 'x', 'Admin designado', 'consultoria_admin', NULL),
      ('u-ca-n', 'ca-n@ness.lat', 'x', 'Admin não designado', 'consultoria_admin', NULL)`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Admin', 'ca-d@ness.lat', 'consultor', 'Consultor')`),
  ]);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-tec0', 'u-cli', 'u-tecb', 'u-ca-d', 'u-ca-n', 'cons:cons-ot@ness.lat'], ['ot']);
  // TOTP recente: revelar exige o step-up do P1-1 (test/ot-stepup.test.ts).
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', totp_em: Date.now() });
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  tec0 = await sessionFor({ id: 'u-tec0', email: 'tec0@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  tecB = await sessionFor({ id: 'u-tecb', email: 'tecb@cliente.teste', role: 'org_user', client_project_id: 'proj-b' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  caDes = await sessionFor({ id: 'u-ca-d', email: 'ca-d@ness.lat', role: 'consultoria_admin' });
  caNao = await sessionFor({ id: 'u-ca-n', email: 'ca-n@ness.lat', role: 'consultoria_admin' });

  // Inventário pela própria API: s1 e s2 no proj-a, sb no proj-b.
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte', tipo: 'subestacao', criticidade: 'alta' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul', tipo: 'subestacao' });
  ids.sb = await criar(plat, 'sites', { nome: 'SE Outro cliente' }, PB);
  for (const [k, nivel] of [['z2', 2], ['z3', 3], ['z4', 4]] as const) ids[k] = await criar(cons, 'zonas', { site_id: ids.s1, nome: `Zona ${nivel}`, nivel_purdue: nivel });
  ids.zs2 = await criar(cons, 'zonas', { site_id: ids.s2, nome: 'Supervisão Sul', nivel_purdue: 2, tipo: 'supervisao' });
  ids.a1 = await criar(gestor, 'ativos', { site_id: ids.s1, zona_id: ids.z2, ...ATIVO_ARCIBER });
  ids.a2 = await criar(cons, 'ativos', { site_id: ids.s2, nome: 'IED Sul', ip: '10.2.2.20' });
  ids.ab = await criar(plat, 'ativos', { site_id: ids.sb, nome: 'IED B', ip: IP1 }, PB);
  ids.f11 = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, destino_zona_id: ids.z3, protocolo: 'DNP3', porta: 20000 });
  ids.f12 = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, destino_zona_id: ids.zs2, protocolo: 'IEC 104', porta: 2404 });
  ids.fext = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true, via_vpn: false, finalidade: 'Manutenção remota do fornecedor' });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
});

describe('P0-8: IP/MAC só cifrados, pelo servidor', () => {
  it('o banco guarda ot1:k1: com AAD da linha e HMAC por projeto; nunca o valor em claro', async () => {
    const l = await env.DB.prepare(`SELECT * FROM ot_ativos WHERE id = ?`).bind(ids.a1).first<Record<string, string>>();
    expect(JSON.stringify(l)).not.toContain(IP1);
    expect(l!.ip_cifrado).toMatch(/^ot1:k1:/);
    const k = chavesOt(env)!;
    expect(await decifrarOt(l!.ip_cifrado, k, aadOt('proj-a', 'ot_ativos', ids.a1, 'ip'))).toBe(IP1);
    expect(await decifrarOt(l!.mac_cifrado, k, aadOt('proj-a', 'ot_ativos', ids.a1, 'mac'))).toBe('aa:bb:cc:11:22:33');
    expect(l!.ip_hash).toBe(await hmacOt(k, 'proj-a', IP1));
    const b = await env.DB.prepare(`SELECT ip_hash FROM ot_ativos WHERE id = ?`).bind(ids.ab).first<{ ip_hash: string }>();
    expect(b!.ip_hash, 'mesmo IP em outro projeto, outro hash').not.toBe(l!.ip_hash);
  });

  it('corpo com project_id, status, verificado_por, ultima_verificacao_em, ip_cifrado ou ip_hash é recusado (400)', async () => {
    for (const extra of [{ project_id: 'proj-b' }, { status: 'removido' }, { verificado_por: 'x' }, { ultima_verificacao_em: '2026-01-01' },
      { ip_cifrado: 'ot1:k1:a:b' }, { ip_hash: 'abc' }, { mac_hash: 'abc' }]) {
      const r = await chamar(cons, 'POST', `${P}/ativos`, { site_id: ids.s1, nome: 'X', ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
      expect((await chamar(cons, 'PUT', `${P}/ativos/${ids.a2}`, extra)).status, `PUT ${JSON.stringify(extra)}`).toBe(400);
    }
  });

  it('sem OT_INVENTARIO_KEY ou OT_INVENTARIO_HMAC_KEY: 503 em toda rota de ativos e nada é gravado', async () => {
    const antes = (await env.DB.prepare(`SELECT count(*) AS n FROM ot_ativos`).first<{ n: number }>())!.n;
    for (const falta of [{ OT_INVENTARIO_KEY: undefined }, { OT_INVENTARIO_HMAC_KEY: undefined }]) {
      for (const [m, c, corpo] of [['GET', `${P}/ativos`], ['GET', `${P}/ativos/${ids.a1}`], ['POST', `${P}/ativos`, { site_id: ids.s1, nome: 'Y', ip: '10.9.9.9' }],
        ['PUT', `${P}/ativos/${ids.a2}`, { nome: 'Z' }], ['DELETE', `${P}/ativos/${ids.a2}`], ['POST', `${P}/ativos/${ids.a1}/revelar`, { justificativa: 'conferência de campo' }]] as const) {
        const r = await chamar(plat, m, c, corpo, falta);
        expect(r.status, `${m} ${c} ${JSON.stringify(falta)}`).toBe(503);
      }
    }
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM ot_ativos`).first<{ n: number }>())!.n).toBe(antes);
    expect((await chamar(plat, 'GET', `${P}/ativos/${ids.a2}`)).status).toBe(200);
  });

  it('IP e MAC inválidos são recusados; MAC em outro formato vira o mesmo hash', async () => {
    expect((await chamar(cons, 'POST', `${P}/ativos`, { site_id: ids.s1, nome: 'X', ip: '999.1.1.1' })).status).toBe(400);
    expect((await chamar(cons, 'POST', `${P}/ativos`, { site_id: ids.s1, nome: 'X', mac: 'zz' })).status).toBe(400);
    const id = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'Mesmo MAC', mac: 'aabb.cc11.2233' });
    const [x, y] = await Promise.all([ids.a1, id].map((i) => env.DB.prepare(`SELECT mac_hash FROM ot_ativos WHERE id = ?`).bind(i).first<{ mac_hash: string }>()));
    expect(x!.mac_hash).toBe(y!.mac_hash);
    expect((await chamar(cons, 'DELETE', `${P}/ativos/${id}`)).status).toBe(200);
  });
});

describe('P0-6: máscara única por papel', () => {
  const ver = async (h: H) => {
    const lista = await chamar(h, 'GET', `${P}/ativos`);
    expect(lista.status, await lista.clone().text()).toBe(200);
    const texto = await lista.text();
    const detalhe = await (await chamar(h, 'GET', `${P}/ativos/${ids.a1}`)).text();
    return { texto, detalhe, a1: (JSON.parse(texto) as { ativos: { id: string; ip: string; mac: string; mascarado: boolean }[] }).ativos.find((a) => a.id === ids.a1)! };
  };

  it('Gestor ARCiber (org_admin), consultor designado e consultoria_admin designado veem IP/MAC completos', async () => {
    for (const h of [gestor, cons, caDes]) {
      const { a1, detalhe } = await ver(h);
      expect(a1).toMatchObject({ ip: IP1, mac: 'aa:bb:cc:11:22:33', mascarado: false });
      expect(JSON.parse(detalhe)).toMatchObject({ ip: IP1, mascarado: false });
    }
  });

  it('client, org_user, platform_admin e consultoria_admin não designado veem mascarado igual na lista e no detalhe; cifra e hash nunca saem', async () => {
    for (const h of [cli, tec, plat, caNao]) {
      const { a1, texto, detalhe } = await ver(h);
      expect(a1).toMatchObject({ ip: '•••', mac: 'aa:bb:cc:••:••:••', mascarado: true });
      expect(JSON.parse(detalhe)).toMatchObject({ ip: '•••', mac: 'aa:bb:cc:••:••:••', mascarado: true });
      for (const t of [texto, detalhe]) {
        expect(t).not.toContain(IP1);
        expect(t).not.toMatch(/11:22:33|ip_cifrado|mac_cifrado|ip_hash|mac_hash|ot1:/);
      }
    }
    // firmware, modelo e portas ficam em claro (§12.1, pergunta 3)
    expect((await ver(tec)).a1).toMatchObject({ firmware_so_versao: '2.4.1.7', modelo: 'M1', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }] });
  });

  it('leitura sem máscara grava ot.inventario.ver_sensivel (uma linha por requisição, com contagem); mascarada não grava', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel'`).first<{ n: number }>())!.n;
    const n0 = await conta();
    await chamar(cli, 'GET', `${P}/ativos`);
    await chamar(plat, 'GET', `${P}/ativos/${ids.a1}`);
    expect(await conta()).toBe(n0);
    await chamar(gestor, 'GET', `${P}/ativos`);
    expect(await conta()).toBe(n0 + 1);
    const l = await env.DB.prepare(`SELECT actor, details, project_id FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel' ORDER BY rowid DESC LIMIT 1`).first<Record<string, string>>();
    expect(l).toMatchObject({ actor: 'gestor@cliente.teste', project_id: 'proj-a' });
    expect(l!.details).toMatch(/^\d+ ativo\(s\) com IP\/MAC sem máscara$/);
  });

  it('platform_admin revela por ação explícita, com justificativa registrada; sem justificativa é 400; quem não pode revelar recebe 403', async () => {
    expect((await chamar(plat, 'POST', `${P}/ativos/${ids.a1}/revelar`, {})).status).toBe(400);
    const r = await chamar(plat, 'POST', `${P}/ativos/${ids.a1}/revelar`, { justificativa: 'suporte ao incidente 123 do cliente' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toMatchObject({ ip: IP1, mac: 'aa:bb:cc:11:22:33', mascarado: false });
    const l = await env.DB.prepare(`SELECT actor, justification, entity_id FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel' ORDER BY rowid DESC LIMIT 1`).first<Record<string, string>>();
    expect(l).toEqual({ actor: 'pa@ness.lat', justification: 'suporte ao incidente 123 do cliente', entity_id: ids.a1 });
    for (const h of [cli, tec, caNao]) expect((await chamar(h, 'POST', `${P}/ativos/${ids.a1}/revelar`, { justificativa: 'quero ver o endereço' })).status).toBe(403);
  });

  it('campo livre com IPv4, IPv6 ou MAC é recusado na validação', async () => {
    for (const [rota, corpo] of [
      ['sites', { nome: 'SE 10.0.0.1' }], ['sites', { nome: 'SE', localizacao: 'rack fe80::1' }], ['zonas', { site_id: ids.s1, nome: 'Z', nivel_purdue: 2, descricao: 'gw 2001:db8:0:0:1:0:0:1' }],
      ['ativos', { site_id: ids.s1, nome: 'aa:bb:cc:dd:ee:ff' }], ['ativos', { site_id: ids.s1, nome: 'X', funcao: 'responde em 192.168.0.1' }],
      ['fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true, finalidade: 'para aabb.ccdd.eeff' }],
    ] as const) {
      const r = await chamar(cons, 'POST', `${P}/${rota}`, corpo);
      expect(r.status, `${rota} ${JSON.stringify(corpo)}`).toBe(400);
    }
  });
});

describe('P0-4: filtro de site único', () => {
  const lista = async (h: H, rota: string) => {
    const r = await chamar(h, 'GET', `${P}/${rota}`);
    expect(r.status, `${rota} ${await r.clone().text()}`).toBe(200);
    return Object.values(await json<Record<string, { id: string }[]>>(r))[0].map((x) => x.id);
  };

  it('org_user vê só o site vinculado: sites, zonas, ativos; fluxo para zona de outro site não aparece', async () => {
    expect(await lista(tec, 'sites')).toEqual([ids.s1]);
    expect((await lista(tec, 'zonas')).sort()).toEqual([ids.z2, ids.z3, ids.z4].sort());
    expect(await lista(tec, 'ativos')).toEqual([ids.a1]);
    expect((await lista(tec, 'fluxos')).sort()).toEqual([ids.f11, ids.fext].sort());
    expect((await lista(cons, 'fluxos')).sort()).toEqual([ids.f11, ids.f12, ids.fext].sort());
    expect((await chamar(tec, 'GET', `${P}/ativos/${ids.a2}`)).status).toBe(404);
    expect((await chamar(tec, 'GET', `${P}/ativos?site_id=${ids.s2}`)).status).toBe(200);
    expect(await lista(tec, `ativos?site_id=${ids.s2}`)).toEqual([]);
  });

  it('org_user sem linha em ot_site_acessos: zero sites, zero ativos, zero fluxos, conformidade sobre nada', async () => {
    for (const rota of ['sites', 'zonas', 'ativos', 'fluxos', 'acessos']) expect(await lista(tec0, rota), rota).toEqual([]);
    const conf = await json<{ itens: { codigo: string; situacao: string; numeros?: Record<string, number> }[] }>(await chamar(tec0, 'GET', `${P}/conformidade`));
    expect(conf.itens.find((i) => i.codigo === '4.1.1')!.situacao).toBe('sem_evidencia');
    expect(conf.itens.find((i) => i.codigo === '4.1.2')!.numeros).toEqual({ externos: 0, sem_vpn: 0 });
  });

  it('entre projetos: conta de B não entra em A; id de B pela URL de A é 404; site/zona/ativo de B no corpo é recusado', async () => {
    expect((await chamar(tecB, 'GET', `${P}/ativos`)).status).toBe(403);
    expect(await lista(plat, 'ativos')).not.toContain(ids.ab);
    expect((await chamar(plat, 'GET', `${P}/ativos/${ids.ab}`)).status).toBe(404);
    expect((await chamar(plat, 'PUT', `${P}/sites/${ids.sb}`, { nome: 'Tomado' })).status).toBe(404);
    expect((await chamar(plat, 'DELETE', `${P}/ativos/${ids.ab}`)).status).toBe(404);
    expect((await chamar(plat, 'POST', `${P}/zonas`, { site_id: ids.sb, nome: 'Z', nivel_purdue: 2 })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${P}/fluxos`, { site_id: ids.s1, origem_ativo_id: ids.a1, destino_ativo_id: ids.ab })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${P}/ativos`, { site_id: ids.sb, nome: 'X' })).status).toBe(400);
    expect((await chamar(plat, 'POST', `${P}/fluxos`, { site_id: ids.sb, origem_ativo_id: ids.a1, externo: true })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tecb', site_id: ids.s1 })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.sb })).status).toBe(400);
    // zona de outro site do mesmo projeto também não serve ao ativo
    expect((await chamar(cons, 'POST', `${P}/ativos`, { site_id: ids.s1, zona_id: ids.zs2, nome: 'X' })).status).toBe(400);
    expect((await env.DB.prepare(`SELECT nome FROM ot_sites WHERE id = ?`).bind(ids.sb).first<{ nome: string }>())!.nome).toBe('SE Outro cliente');
  });

  it('as tabelas ot_* ficam fora de requireResourceAccess (que não conhece site): falha fechada', async () => {
    for (const t of ['ot_sites', 'ot_zonas', 'ot_ativos', 'ot_fluxos', 'ot_site_acessos']) {
      await expect(requireResourceAccess(env.DB, t, ids.a1, { id: 'u-pa', role: 'platform_admin' }), t).rejects.toThrow('Invalid table');
    }
  });

  it('revogar o acesso tira o site na hora', async () => {
    expect((await chamar(gestor, 'DELETE', `${P}/acessos/${ids.s1}/u-tec`)).status).toBe(200);
    expect(await lista(tec, 'ativos')).toEqual([]);
    expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
    expect(await lista(tec, 'ativos')).toEqual([ids.a1]);
  });
});

describe('papéis e escrita', () => {
  it('org_user e client não escrevem; chave de API e agente MCP recebem 403 nas rotas novas (P0-2)', async () => {
    for (const h of [tec, cli]) {
      for (const [m, c, corpo] of [['POST', `${P}/sites`, { nome: 'X' }], ['PUT', `${P}/ativos/${ids.a1}`, { nome: 'X' }], ['DELETE', `${P}/fluxos/${ids.f11}`],
        ['POST', `${P}/acessos`, { user_id: 'u-tec0', site_id: ids.s1 }]] as const) {
        expect((await chamar(h, m, c, corpo)).status, `${m} ${c}`).toBe(403);
      }
    }
    const CHAVE = 'chave-ot-inventario';
    await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-inv', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)).run();
    for (const [m, c] of [['GET', `${P}/ativos`], ['POST', `${P}/sites`], ['GET', `${P}/conformidade`]]) {
      expect((await chamar({ 'X-API-Key': CHAVE }, m, c, m === 'GET' ? undefined : { nome: 'X' })).status, `${m} ${c}`).toBe(403);
    }
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-inv', 'cons:cons-ot@ness.lat', 'proj-a', datetime('now', '+30 days'))`).run();
    const AGENTE = { userId: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', projectId: 'proj-a', concessaoId: 'c-inv' };
    expect((await chamar({}, 'GET', `${P}/ativos`, undefined, { AGENTE })).status).toBe(403);
  });

  it('CRUD: atualizar, remover (exclusão lógica: a linha fica, some das listas)', async () => {
    const id = await criar(cons, 'sites', { nome: 'SE Temporária' });
    expect((await chamar(cons, 'PUT', `${P}/sites/${id}`, { criticidade: 'baixa' })).status).toBe(200);
    expect((await chamar(cons, 'PUT', `${P}/sites/${id}`, {})).status).toBe(400);
    expect((await chamar(cons, 'DELETE', `${P}/sites/${id}`)).status).toBe(200);
    expect((await chamar(cons, 'DELETE', `${P}/sites/${id}`)).status).toBe(404);
    // site removido não recebe cadastro novo
    for (const [rota, corpo] of [['zonas', { nome: 'Z', nivel_purdue: 2 }], ['ativos', { nome: 'X' }], ['fluxos', { origem_ativo_id: ids.a1, externo: true }]] as const) {
      expect((await chamar(cons, 'POST', `${P}/${rota}`, { site_id: id, ...corpo })).status, rota).toBe(400);
    }
    expect(await env.DB.prepare(`SELECT status, criticidade FROM ot_sites WHERE id = ?`).bind(id).first()).toEqual({ status: 'removido', criticidade: 'baixa' });
    const ids0 = (await json<{ sites: { id: string }[] }>(await chamar(cons, 'GET', `${P}/sites`))).sites.map((s) => s.id);
    expect(ids0).not.toContain(id);
  });

  it('4.3.1: ativo do ARCiber incompleto é recusado com a lista dos campos, na criação e na edição', async () => {
    const r = await chamar(cons, 'POST', `${P}/ativos`, { ...ATIVO_ARCIBER, site_id: ids.s1, protocolos_portas: [] });
    expect(r.status).toBe(400);
    expect((await json<{ error: string }>(r)).error).toContain('4.3.1');
    const e = await chamar(cons, 'PUT', `${P}/ativos/${ids.a1}`, { ip: null, mac: null });
    expect(e.status).toBe(400);
    expect((await json<{ error: string }>(e)).error).toContain('4.3.1');
    expect((await chamar(cons, 'PUT', `${P}/ativos/${ids.a1}`, { ip: null })).status, 'fica o MAC').toBe(200);
    expect((await chamar(cons, 'PUT', `${P}/ativos/${ids.a1}`, { ip: IP1 })).status).toBe(200);
    expect((await json<{ ip: string }>(await chamar(gestor, 'GET', `${P}/ativos/${ids.a1}`))).ip).toBe(IP1);
  });

  it('a trilha do n.ot não leva IP, MAC nem nome de ativo', async () => {
    const { results } = await env.DB.prepare(`SELECT action, details FROM audit_logs WHERE action LIKE 'ot.%'`).all<{ action: string; details: string }>();
    expect(results.length).toBeGreaterThan(10);
    for (const l of results) expect(l.details, l.action).not.toMatch(/10\.1\.1\.10|10\.2\.2\.20|aa:bb|AA-BB|RTU Bay|IED Sul|SE Norte/);
  });
});

describe('4.1.2/4.1.3 e conformidade por item da RO-CB.BR.01', () => {
  it('fluxo externo sem VPN sai marcado como violação; com VPN, não; fluxo interno exige as duas pontas', async () => {
    const r = await chamar(cons, 'POST', `${P}/fluxos`, { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true });
    const criado = await json<{ id: string; violacoes: string[] }>(r);
    expect(criado.violacoes).toEqual(['4.1.2', '4.1.3']);
    const vpn = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true, via_vpn: true });
    const fluxos = (await json<{ fluxos: { id: string; violacoes: string[]; externo: boolean }[] }>(await chamar(tec, 'GET', `${P}/fluxos`))).fluxos;
    expect(fluxos.find((f) => f.id === ids.fext)).toMatchObject({ externo: true, violacoes: ['4.1.2', '4.1.3'] });
    expect(fluxos.find((f) => f.id === vpn)!.violacoes).toEqual([]);
    expect(fluxos.find((f) => f.id === ids.f11)!.violacoes).toEqual([]);
    const meia = await chamar(cons, 'POST', `${P}/fluxos`, { site_id: ids.s1, origem_ativo_id: ids.a1 });
    expect(meia.status).toBe(400);
    expect((await json<{ error: string }>(meia)).error).toContain('ponta');
    expect((await chamar(cons, 'DELETE', `${P}/fluxos/${criado.id}`)).status).toBe(200);
  });

  it('25 itens com prazo de 18/27 meses; só afirma o que o inventário sustenta', async () => {
    const r = await chamar(gestor, 'GET', `${P}/conformidade`);
    expect(r.status, await r.clone().text()).toBe(200);
    const c = await json<{ itens: { codigo: string; prazo_meses: number | null; prazo_em: string | null; situacao: string; evidencia: string }[]; resumo: Record<string, number> }>(r);
    expect(c.itens).toHaveLength(25);
    const item = (k: string) => c.itens.find((i) => i.codigo === k)!;
    expect(item('4.1.2')).toMatchObject({ prazo_meses: 18, prazo_em: '2023-01-09', situacao: 'nao_atende' });
    expect(item('4.1.3')).toMatchObject({ situacao: 'nao_atende' });
    expect(item('4.1.1')).toMatchObject({ prazo_meses: 27, prazo_em: '2023-10-09', situacao: 'nao_atende' }); // s2 só tem o nível 2
    expect(item('4.1.1').evidencia).toContain('1 de 2');
    expect(item('5.1.1')).toMatchObject({ prazo_meses: null, prazo_em: null, situacao: 'sem_evidencia' });
    // campos completos, mas sem verificação registrada: não se afirma o 4.3.1
    expect(item('4.3.1').situacao).toBe('sem_evidencia');
    expect(item('4.2.1').situacao).toBe('sem_evidencia');
    expect(Object.values(c.resumo).reduce((a, b) => a + b, 0)).toBe(25);
    expect(c.itens.some((i) => !['nao_atende', 'evidencia_no_inventario', 'sem_evidencia'].includes(i.situacao))).toBe(false);

    // técnico do s1: o s1 tem as 3 zonas -> há evidência do 4.1.1 no que ele vê
    expect((await json<typeof c>(await chamar(tec, 'GET', `${P}/conformidade`))).itens.find((i) => i.codigo === '4.1.1')!.situacao).toBe('evidencia_no_inventario');
  });

  it('4.2.1: titular e suplente "Gestor ARCiber" na governança viram evidência; 4.3.1 com verificação vencida é não atende', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES
        ('proj-a', 'Titular', 't@cliente.teste', 'executivo', 'Gestor ARCiber', 1), ('proj-a', 'Suplente', 's@cliente.teste', 'executivo', 'Gestor ARCiber', 0)`),
      env.DB.prepare(`UPDATE ot_ativos SET ultima_verificacao_em = datetime('now', '-25 months') WHERE id = ?`).bind(ids.a1),
    ]);
    const c = await json<{ itens: { codigo: string; situacao: string }[] }>(await chamar(gestor, 'GET', `${P}/conformidade`));
    expect(c.itens.find((i) => i.codigo === '4.2.1')!.situacao).toBe('evidencia_no_inventario');
    expect(c.itens.find((i) => i.codigo === '4.3.1')!.situacao).toBe('nao_atende');
  });
});
