import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { manutencaoDiaria } from '../src/manutencao';
import { chavesOt, decifrarOt, aadOt, hmacOt } from '../src/services/ot-cifra';
import { aprovarLote } from '../src/services/ot-coleta';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';
import xlsxReal from './fixtures/ot-planilha-openpyxl.xlsx.b64?raw';

// Coleta do n.ot (N3): lotes em staging por planilha (CSV/XLSX) e entrada manual, dedupe sem revelar o alvo, aprovação que
// promove ao inventário. Modelo de ameaças P0-3 (o original não fica, nada vai à IA) e P0-5 (dedupe sem oráculo). D1 real.

type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = async (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra });
const json = async <T = Record<string, unknown>>(r: Response) => r.json<T>();

/** Upload multipart: o arquivo e o site. */
const enviar = async (h: H, site: string, nome: string, conteudo: BlobPart, extra: Record<string, unknown> = {}) => {
  const fd = new FormData();
  fd.set('site_id', site);
  fd.set('file', new File([conteudo], nome));
  return app.fetch(new Request(`http://localhost${P}/lotes`, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...extra });
};

const IP1 = '10.1.1.10';
const IP2 = '10.2.2.20';
const ATIVO_ARCIBER = {
  nome: 'RTU Bay 1', no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'Fab', modelo: 'M1',
  funcao: 'telecontrole', ip: IP1, mac: 'AA-BB-CC-11-22-33', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: '2.4.1.7',
};
const CAB = 'nome;ip;mac;fabricante;modelo;tipo;funcao;protocolos;firmware;arciber;categoria;zona';
const csv = (...linhas: string[]) => [CAB, ...linhas].join('\n');

let plat: H, gestor: H, tec: H, tec0: H, cli: H, cons: H, caDes: H;
const ids: Record<string, string> = {};

const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
interface Item { id: string; linha: number; decisao: string; motivo?: string | null; erros: { campo: string; motivo: string }[]; possivel_duplicata: boolean; duplicata_de?: string; registro_id?: string; dados: Record<string, unknown> }
const lerLote = async (h: H, id: string) => {
  const r = await chamar(h, 'GET', `${P}/lotes/${id}`);
  expect(r.status, await r.clone().text()).toBe(200);
  const texto = await r.text();
  return { texto, ...(JSON.parse(texto) as { lote: Record<string, unknown>; itens: Item[] }) };
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
      ('u-ca-d', 'ca-d@ness.lat', 'x', 'Admin designado', 'consultoria_admin', NULL)`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Admin', 'ca-d@ness.lat', 'consultor', 'Consultor')`),
  ]);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-tec0', 'u-cli', 'u-ca-d', 'cons:cons-ot@ness.lat'], ['ot']);
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  tec0 = await sessionFor({ id: 'u-tec0', email: 'tec0@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  caDes = await sessionFor({ id: 'u-ca-d', email: 'ca-d@ness.lat', role: 'consultoria_admin' });

  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
  ids.z2 = await criar(cons, 'zonas', { site_id: ids.s1, nome: 'Supervisão', nivel_purdue: 2 });
  ids.a1 = await criar(gestor, 'ativos', { site_id: ids.s1, zona_id: ids.z2, ...ATIVO_ARCIBER });
  ids.a2 = await criar(cons, 'ativos', { site_id: ids.s2, nome: 'IED Sul', ip: IP2, fabricante: 'Fab', modelo: 'M9' });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
});

describe('P0-3: a planilha é lida no Worker; o original não fica e nada vai à IA', () => {
  it('CSV e XLSX viram lote em revisão; o R2 não recebe nada; env.AI (toMarkdown e run) não é chamado', async () => {
    const chamadas: string[] = [];
    const AI = { toMarkdown: async () => { chamadas.push('toMarkdown'); throw new Error('proibido'); }, run: async () => { chamadas.push('run'); throw new Error('proibido'); } };
    const antes = (await env.STORAGE.list()).objects.length;
    const xlsx = Uint8Array.from(atob(xlsxReal.trim()), (ch) => ch.charCodeAt(0));
    for (const [nome, conteudo] of [['inv.csv', csv(`Novo IED;10.1.1.99;;Fab;M5;IED;protecao;;;nao;;`)], ['inv.xlsx', xlsx]] as const) {
      const r = await enviar(tec, ids.s1, nome, conteudo, { AI });
      expect(r.status, `${nome} ${await r.clone().text()}`).toBe(201);
      const b = await json<{ id: string; status: string; itens: number }>(r);
      expect(b.status).toBe('em_revisao');
      expect(b.itens).toBeGreaterThan(0);
      const lote = await env.DB.prepare(`SELECT * FROM ot_lotes WHERE id = ?`).bind(b.id).first<Record<string, unknown>>();
      expect(lote).toMatchObject({ fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', site_id: ids.s1 });
    }
    expect(chamadas).toEqual([]);
    const depois = await env.STORAGE.list();
    expect(depois.objects.length, depois.objects.map((o) => o.key).join(',')).toBe(antes);
  });

  it('o staging guarda IP/MAC só cifrados (AAD do item) e com o HMAC do projeto', async () => {
    const r = await enviar(tec, ids.s1, 'a.csv', csv(`Gateway;10.1.1.77;00-11-22-33-44-55;Fab;G1;GW;borda;;;nao;;`));
    const { id } = await json<{ id: string }>(r);
    const linha = await env.DB.prepare(`SELECT id, dados FROM ot_lote_itens WHERE lote_id = ?`).bind(id).first<{ id: string; dados: string }>();
    expect(linha!.dados).not.toContain('10.1.1.77');
    expect(linha!.dados).not.toMatch(/00[:-]11[:-]22/);
    const d = JSON.parse(linha!.dados) as Record<string, string>;
    const k = chavesOt(env)!;
    expect(await decifrarOt(d.ip_cifrado, k, aadOt('proj-a', 'ot_lote_itens', linha!.id, 'ip'))).toBe('10.1.1.77');
    expect(await decifrarOt(d.mac_cifrado, k, aadOt('proj-a', 'ot_lote_itens', linha!.id, 'mac'))).toBe('00:11:22:33:44:55');
    expect(d.ip_hash).toBe(await hmacOt(k, 'proj-a', '10.1.1.77'));
  });

  it('acima dos tetos ou ilegível: 400 e nenhum lote nem item gravado', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT (SELECT count(*) FROM ot_lotes) + (SELECT count(*) FROM ot_lote_itens) AS n`).first<{ n: number }>())!.n;
    const n0 = await conta();
    for (const [nome, conteudo] of [['g.csv', csv(...Array(5001).fill('X;;;;;;;;;;;'))], ['x.xlsx', 'não é zip'], ['x.pdf', '%PDF'], ['v.csv', CAB]] as const) {
      const r = await enviar(tec, ids.s1, nome, conteudo);
      expect(r.status, nome).toBe(400);
    }
    expect(await conta()).toBe(n0);
  });

  it('linha inválida não derruba o lote: fica com o erro (campo e regra, sem o valor)', async () => {
    const r = await enviar(tec, ids.s1, 'm.csv', csv(`Bom;10.1.1.50;;Fab;M;IED;f;;;nao;;`, `Ruim;999.1.1.1;;Fab;M;IED;responde em 192.168.0.9;;;nao;;`,
      `Incompleto;10.1.1.51;;Fab;M;RTU;f;;;sim;centro_operacao;`));
    expect(r.status).toBe(201);
    const { itens, texto } = await lerLote(cons, (await json<{ id: string }>(r)).id);
    expect(itens.map((i) => i.erros.map((e) => e.campo))).toEqual([[], ['ip', 'funcao'], ['4.3.1']]);
    expect(texto).not.toMatch(/999\.1\.1\.1|192\.168\.0\.9/);
  });
});

describe('P0-5: dedupe sem revelar o alvo, só no site do lote', () => {
  it('A1: quem não vê completo não recebe a marca de duplicata (nem chave, nem contagem); quem vê, a marca e o id do ativo', async () => {
    const r = await enviar(tec, ids.s1, 'd.csv', csv(`Qualquer;${IP1};;;;;;;;nao;;`, `Outro;${IP2};;;;;;;;nao;;`, `Novo;10.9.9.9;;;;;;;;nao;;`,
      `RTU Bay 1;;;Fab;M1;;;;;nao;;`));
    expect(r.status).toBe(201);
    const resposta = await json<{ id: string }>(r);
    const id = resposta.id;
    expect(Object.keys(resposta).sort()).toEqual(['colunas_ignoradas', 'com_erro', 'id', 'itens', 'status']);
    for (const h of [tec, cli, plat]) {
      const { itens, texto } = await lerLote(h, id);
      expect(texto).not.toContain('duplicata');
      // o IP existente (linha 2) e o novo (linha 4) saem com a mesma forma e os mesmos valores, fora id, linha e dados
      expect({ ...itens[0], id: 0, linha: 0, dados: 0 }).toEqual({ ...itens[2], id: 0, linha: 0, dados: 0 });
      expect(texto).not.toContain(ids.a1);
      expect(texto).not.toContain(ids.a2);
      expect(texto).not.toMatch(/duplicata_de|registro_id|ip_hash|ip_cifrado|ot1:/);
      // a resposta para o IP do outro site e a do IP novo têm a mesma forma
      const [, outro, novo] = itens;
      expect(Object.keys(outro).sort()).toEqual(Object.keys(novo).sort());
      expect({ ...outro, id: 0, linha: 0, dados: 0 }).toEqual({ ...novo, id: 0, linha: 0, dados: 0 });
      expect(itens[0].dados).toMatchObject({ ip: '•••', mascarado: true });
    }
    const { itens } = await lerLote(gestor, id);
    expect(itens.map((i) => i.possivel_duplicata)).toEqual([true, false, false, true]);
    expect(itens.map((i) => i.duplicata_de ?? null)).toEqual([ids.a1, null, null, ids.a1]);
    expect(itens[0].dados).toMatchObject({ ip: IP1, mascarado: false });
  });

  it('A1: técnico mascarado manda um IP existente e um novo e recebe respostas indistinguíveis; o Gestor vê a marca e a contagem', async () => {
    const manual = (h: H, ip: string) => chamar(h, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'Sonda', ip }] });
    const [existe, novo] = [await manual(tec, IP1), await manual(tec, '10.1.1.123')];
    expect(existe.status).toBe(201);
    const [a, b] = [await json(existe), await json(novo)];
    expect({ ...a, id: 0 }).toEqual({ ...b, id: 0 });
    expect(JSON.stringify(a)).not.toContain('duplicata');
    const [la, lb] = [await lerLote(tec, a.id as string), await lerLote(tec, b.id as string)];
    expect({ ...la.itens[0], id: 0, dados: 0 }).toEqual({ ...lb.itens[0], id: 0, dados: 0 });
    expect({ ...la.lote, id: 0, created_at: 0, updated_at: 0 }).toEqual({ ...lb.lote, id: 0, created_at: 0, updated_at: 0 });
    const g = await json(await manual(gestor, IP1));
    expect(g).toMatchObject({ possiveis_duplicatas: 1 });
    expect((await lerLote(gestor, a.id as string)).itens[0]).toMatchObject({ possivel_duplicata: true, duplicata_de: ids.a1 });
  });

  it('técnico só cria lote nos sites vinculados; site sem acesso responde igual a site inexistente; sem vínculo, nenhum', async () => {
    const semAcesso = await enviar(tec, ids.s2, 'a.csv', csv(`X;;;;;;;;;nao;;`));
    const inexistente = await enviar(tec, 'site-que-nao-existe', 'a.csv', csv(`X;;;;;;;;;nao;;`));
    expect(semAcesso.status).toBe(400);
    expect(await semAcesso.text()).toBe(await inexistente.text());
    expect((await enviar(tec0, ids.s1, 'a.csv', csv(`X;;;;;;;;;nao;;`))).status).toBe(400);
    expect((await chamar(tec0, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'X' }] })).status).toBe(400);
    expect((await json<{ lotes: unknown[] }>(await chamar(tec0, 'GET', `${P}/lotes`))).lotes).toEqual([]);
  });

  it('teto de itens por lote (5.000) e de lotes por dia por pessoa', async () => {
    const r = await chamar(cons, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: Array(5001).fill({ nome: 'X' }) });
    expect(r.status).toBe(400);
    await env.DB.batch(Array.from({ length: 20 }, (_, i) => env.DB.prepare(
      `INSERT INTO ot_lotes (id, project_id, site_id, fonte, criado_por, status) VALUES (?, 'proj-a', ?, 'manual', 'u-ca-d', 'rejeitado')`).bind(`l-teto-${i}`, ids.s1)));
    const muitos = await chamar(caDes, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'X' }] });
    expect(muitos.status).toBe(429);
  });
});

describe('entrada manual pela mesma tubulação', () => {
  it('JSON vira lote manual; campo do servidor no item (cifra, hash, verificação) vira erro do item, não gravação', async () => {
    const r = await chamar(gestor, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [
      { nome: 'Switch', ip: '10.1.1.60', fabricante: 'Fab', zona_id: ids.z2 },
      { nome: 'Forjado', ip_cifrado: 'ot1:k1:a:b', verificado_por: 'eu', ip_hash: 'x' },
    ] });
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    expect(await env.DB.prepare(`SELECT fonte FROM ot_lotes WHERE id = ?`).bind(id).first('fonte')).toBe('manual');
    const { itens } = await lerLote(cons, id);
    expect(itens[0]).toMatchObject({ erros: [], dados: { nome: 'Switch', ip: '10.1.1.60', zona_id: ids.z2 } });
    expect(itens[1].erros.map((e) => e.campo).sort()).toEqual(['ip_cifrado', 'ip_hash', 'verificado_por']);
    const banco = await env.DB.prepare(`SELECT dados FROM ot_lote_itens WHERE lote_id = ? AND linha = 2`).bind(id).first<{ dados: string }>();
    expect(banco!.dados).not.toMatch(/eu|ot1:k1:a:b/);
  });
});

describe('papéis', () => {
  it('client só lê; chave de API e agente recebem 403; sem as chaves do n.ot, 503', async () => {
    expect((await enviar(cli, ids.s1, 'a.csv', csv(`X;;;;;;;;;nao;;`))).status).toBe(403);
    expect((await chamar(cli, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'X' }] })).status).toBe(403);
    expect((await chamar(cli, 'GET', `${P}/lotes`)).status).toBe(200);
    const CHAVE = 'chave-ot-coleta';
    await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-col', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)).run();
    for (const [m, c, corpo] of [['GET', `${P}/lotes`], ['POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'X' }] }]] as const) {
      expect((await chamar({ 'X-API-Key': CHAVE }, m, c, corpo)).status, `${m} ${c}`).toBe(403);
    }
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-col', 'cons:cons-ot@ness.lat', 'proj-a', datetime('now', '+30 days'))`).run();
    expect((await chamar({}, 'GET', `${P}/lotes`, undefined, { AGENTE: { userId: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', projectId: 'proj-a', concessaoId: 'c-col' } })).status).toBe(403);
    for (const falta of [{ OT_INVENTARIO_KEY: undefined }, { OT_INVENTARIO_HMAC_KEY: undefined }]) {
      expect((await chamar(cons, 'GET', `${P}/lotes`, undefined, falta)).status).toBe(503);
      expect((await chamar(cons, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'X' }] }, falta)).status).toBe(503);
      expect((await enviar(cons, ids.s1, 'a.csv', csv(`X;;;;;;;;;nao;;`), falta)).status).toBe(503);
    }
  });
});

describe('aprovação promove ao inventário', () => {
  let lote: string;
  beforeAll(async () => {
    const r = await enviar(tec, ids.s1, 'ap.csv', csv(
      // duplicata do a1 com os campos do 4.3.1 recoletados: atualiza o que veio e carimba a verificação
      `Mesmo IP;${IP1};;Fab;;RTU;telecontrole;DNP3:20000;3.0.0;sim;centro_operacao;`,
      `RTU Nova;10.1.1.90;;Fab;M7;RTU;telecontrole;DNP3:20000|IEC104:2404;1.2;sim;centro_operacao;Supervisão`,
      `Ruim;;;;;;responde em 192.168.0.9;;;nao;;`,
    ));
    expect(r.status).toBe(201);
    lote = (await json<{ id: string }>(r)).id;
  });

  it('técnico, client e platform_admin não aprovam; quem criou não aprova o próprio lote', async () => {
    for (const h of [tec, cli, plat]) expect((await chamar(h, 'POST', `${P}/lotes/${lote}/aprovar`)).status).toBe(403);
    const r = await chamar(gestor, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'Do gestor' }] });
    const proprio = (await json<{ id: string }>(r)).id;
    expect((await chamar(gestor, 'POST', `${P}/lotes/${proprio}/aprovar`)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/lotes/${proprio}/rejeitar`, { motivo: 'lançado por engano' })).status).toBe(403);
    expect((await chamar(cons, 'POST', `${P}/lotes/${proprio}/rejeitar`, { motivo: 'lançado por engano' })).status).toBe(200);
    expect(await env.DB.prepare(`SELECT status FROM ot_lotes WHERE id = ?`).bind(proprio).first('status')).toBe('rejeitado');
    expect(await env.DB.prepare(`SELECT decisao FROM ot_lote_itens WHERE lote_id = ?`).bind(proprio).first('decisao')).toBe('descartado');
    expect((await chamar(cons, 'POST', `${P}/lotes/${proprio}/aprovar`)).status).toBe(409);
  });

  it('Gestor ARCiber aprova: duplicata atualiza o ativo, novo é criado, item com erro é recusado; verificação e trilha registradas', async () => {
    const n0 = (await env.DB.prepare(`SELECT count(*) AS n FROM ot_ativos WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n;
    const r = await chamar(gestor, 'POST', `${P}/lotes/${lote}/aprovar`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toMatchObject({ criados: 1, atualizados: 1, recusados: 1 });
    expect((await chamar(caDes, 'POST', `${P}/lotes/${lote}/aprovar`)).status, 'aprova uma vez só').toBe(409);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM ot_ativos WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n).toBe(n0 + 1);

    const a1 = await env.DB.prepare(`SELECT * FROM ot_ativos WHERE id = ?`).bind(ids.a1).first<Record<string, unknown>>();
    expect(a1).toMatchObject({ firmware_so_versao: '3.0.0', nome: 'Mesmo IP', fabricante: 'Fab', verificado_por: 'gestor@cliente.teste' });
    expect(a1!.ultima_verificacao_em).toBeTruthy();
    const { itens } = await lerLote(gestor, lote);
    expect(itens.map((i) => i.decisao)).toEqual(['gravado', 'gravado', 'recusado']);
    const nova = await env.DB.prepare(`SELECT * FROM ot_ativos WHERE id = ?`).bind(itens[1].registro_id).first<Record<string, string>>();
    expect(nova).toMatchObject({ nome: 'RTU Nova', site_id: ids.s1, zona_id: ids.z2, no_arciber: 1, verificado_por: 'gestor@cliente.teste',
      protocolos_portas: JSON.stringify([{ protocolo: 'DNP3', porta: 20000 }, { protocolo: 'IEC104', porta: 2404 }]) });
    // a cifra do staging não serve ao inventário (AAD): o servidor recifra para a linha nova
    expect(await decifrarOt(nova!.ip_cifrado, chavesOt(env)!, aadOt('proj-a', 'ot_ativos', nova!.id, 'ip'))).toBe('10.1.1.90');
    expect(await env.DB.prepare(`SELECT status, decidido_por FROM ot_lotes WHERE id = ?`).bind(lote).first()).toEqual({ status: 'concluido', decidido_por: 'gestor@cliente.teste' });

    const t = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'ot.lote.aprovado' ORDER BY rowid DESC LIMIT 1`).first<Record<string, string>>();
    expect(t).toMatchObject({ actor: 'gestor@cliente.teste' });
    expect(t!.details).toContain('1 criado(s), 1 atualizado(s), 1 recusado(s)');
  });

  it('a trilha da coleta não leva IP, MAC nem nome de ativo', async () => {
    const { results } = await env.DB.prepare(`SELECT action, details FROM audit_logs WHERE action LIKE 'ot.lote.%'`).all<{ action: string; details: string }>();
    expect(results.length).toBeGreaterThan(3);
    for (const l of results) expect(l.details, l.action).not.toMatch(/10\.1\.1\.|192\.168|RTU|Gateway|Switch|00:11/);
  });

  it('4.3.1: a verificação registrada na aprovação vira evidência; verificação sem quem verificou não conta', async () => {
    const conf = async (h: H, base = P) => (await json<{ itens: { codigo: string; situacao: string }[] }>(await chamar(h, 'GET', `${base}/conformidade`))).itens.find((i) => i.codigo === '4.3.1')!.situacao;
    expect(await conf(gestor)).toBe('evidencia_no_inventario');
    // proj-b: ativo do ARCiber com data de verificação mas sem verificado_por (gravado fora da aprovação)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('sb', 'proj-b', 'SE B')`),
      env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, no_arciber, categoria_arciber, tipo_dispositivo, fabricante, funcao, ip_cifrado,
        protocolos_portas, firmware_so_versao, ultima_verificacao_em) VALUES ('ab', 'proj-b', 'sb', 'X', 1, 'centro_operacao', 'RTU', 'F', 'f', 'ot1:k1:a:b',
        '[{"protocolo":"DNP3"}]', '1', datetime('now'))`),
    ]);
    expect(await conf(plat, '/api/v1/projects/proj-b/ot')).toBe('sem_evidencia');
  });
});

describe('4.3.1 e P1-4: verificação só com recoleta; alvo alterado depois da revisão volta a pendente', () => {
  const conf = async () => (await json<{ itens: { codigo: string; situacao: string }[] }>(await chamar(gestor, 'GET', `${P}/conformidade`))).itens.find((i) => i.codigo === '4.3.1')!.situacao;
  const ativo = (id: string) => env.DB.prepare(`SELECT * FROM ot_ativos WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  const loteDo = async (h: H, ...linhas: string[]) => {
    const r = await enviar(h, ids.s1, 'v.csv', csv(...linhas));
    expect(r.status, await r.clone().text()).toBe(201);
    return (await json<{ id: string }>(r)).id;
  };
  let nova: string;
  beforeAll(async () => {
    nova = (await env.DB.prepare(`SELECT id FROM ot_ativos WHERE nome = 'RTU Nova'`).first<{ id: string }>())!.id;
  });

  it('PUT direto: nome não mexe na verificação; campo do 4.3.1 a zera e o 4.3.1 deixa de dizer evidencia_no_inventario', async () => {
    expect(await conf()).toBe('evidencia_no_inventario');
    expect((await chamar(gestor, 'PUT', `${P}/ativos/${nova}`, { nome: 'RTU Nova 2' })).status).toBe(200);
    expect(await ativo(nova)).toMatchObject({ verificado_por: 'gestor@cliente.teste' });
    expect((await chamar(gestor, 'PUT', `${P}/ativos/${ids.a1}`, { firmware_so_versao: '3.0.1', ip: '10.1.1.11' })).status).toBe(200);
    expect(await ativo(ids.a1)).toMatchObject({ verificado_por: null, ultima_verificacao_em: null });
    expect(await conf()).not.toBe('evidencia_no_inventario');
  });

  it('planilha parcial não renova a verificação: sem mudar campo do 4.3.1 mantém a data; mudando parte deles, zera', async () => {
    await env.DB.prepare(`UPDATE ot_ativos SET ultima_verificacao_em = '2026-01-01 00:00:00' WHERE id = ?`).bind(nova).run();
    const l1 = await loteDo(tec, `RTU Nova 2;10.1.1.90;;Fab;M8;;;;;;;`); // casa pelo IP; IP e fabricante iguais, muda o modelo
    expect((await chamar(gestor, 'POST', `${P}/lotes/${l1}/aprovar`)).status).toBe(200);
    expect(await ativo(nova)).toMatchObject({ modelo: 'M8', verificado_por: 'gestor@cliente.teste', ultima_verificacao_em: '2026-01-01 00:00:00' });
    const l2 = await loteDo(tec, `RTU Nova 2;10.1.1.90;;Fab2;M8;;;;;;;`); // muda o fabricante sem recoletar o resto do 4.3.1
    expect((await chamar(gestor, 'POST', `${P}/lotes/${l2}/aprovar`)).status).toBe(200);
    expect(await ativo(nova)).toMatchObject({ verificado_por: null, ultima_verificacao_em: null });
  });

  it('alvo alterado depois da revisão: o item volta a pendente, o alvo não é sobrescrito e o lote fica em revisão', async () => {
    const l = await loteDo(tec, `Do lote;10.1.1.90;;;;;;;;;;`, `Item novo;10.1.1.91;;;;;;;;;;`);
    expect((await chamar(gestor, 'PUT', `${P}/ativos/${nova}`, { nome: 'Editado depois' })).status).toBe(200);
    const r = await chamar(gestor, 'POST', `${P}/lotes/${l}/aprovar`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toMatchObject({ criados: 1, atualizados: 0, pendentes: 1 });
    expect(await ativo(nova)).toMatchObject({ nome: 'Editado depois' });
    expect(await env.DB.prepare(`SELECT status FROM ot_lotes WHERE id = ?`).bind(l).first('status')).toBe('em_revisao');
    const { itens } = await lerLote(gestor, l);
    expect(itens.map((i) => i.decisao)).toEqual(['pendente', 'gravado']);
    expect(itens[0].motivo).toMatch(/mudou depois da revisão/);
    expect((await lerLote(tec, l)).texto, 'A1: o motivo de alvo alterado também é marca de duplicata').not.toMatch(/mudou depois da revisão/);
    // revisado de novo (nada mudou desde a volta), a aprovação grava
    const r2 = await chamar(gestor, 'POST', `${P}/lotes/${l}/aprovar`);
    expect(await json(r2)).toMatchObject({ atualizados: 1, pendentes: 0 });
    expect(await ativo(nova)).toMatchObject({ nome: 'Do lote' });
    expect(await env.DB.prepare(`SELECT status FROM ot_lotes WHERE id = ?`).bind(l).first('status')).toBe('concluido');
  });

  it('edição entre a leitura e a gravação: o WHERE do updated_at não sobrescreve e o item fica pendente', async () => {
    const l = await loteDo(tec, `Corrida perdida;10.1.1.90;;;;;;;;;;`);
    // o batch da gravação roda depois de uma edição concorrente do alvo
    const db = new Proxy(env.DB, { get: (t, k) => k === 'batch'
      ? async (stmts: D1PreparedStatement[]) => { await t.prepare(`UPDATE ot_ativos SET nome = 'Concorrente', updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now', '+1 second') WHERE id = ?`).bind(nova).run(); return t.batch(stmts); }
      : (typeof (t as any)[k] === 'function' ? (t as any)[k].bind(t) : (t as any)[k]) }) as D1Database;
    const r = await aprovarLote(db, chavesOt(env)!, { id: 'u-gestor', email: 'gestor@cliente.teste' }, 'proj-a', JSON.stringify([ids.s1]), l);
    expect(r).toMatchObject({ ok: true, pendentes: 1 });
    expect(await ativo(nova)).toMatchObject({ nome: 'Concorrente' });
    expect(await env.DB.prepare(`SELECT decisao FROM ot_lote_itens WHERE lote_id = ?`).bind(l).first('decisao')).toBe('pendente');
  });

  it('ativo novo com o mesmo IP criado depois da revisão também volta o item a pendente', async () => {
    const l = await loteDo(tec, `Sem par;10.1.1.92;;;;;;;;;;`);
    const outro = await criar(gestor, 'ativos', { site_id: ids.s1, nome: 'Chegou antes', ip: '10.1.1.92' });
    const r = await chamar(gestor, 'POST', `${P}/lotes/${l}/aprovar`);
    expect(await json(r)).toMatchObject({ criados: 0, atualizados: 0, pendentes: 1 });
    expect(await ativo(outro)).toMatchObject({ nome: 'Chegou antes' });
  });
});

describe('retenção: lote não concluído expira em 7 dias', () => {
  it('a manutenção diária apaga lote parado há mais de 7 dias (e os itens); concluído fica', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, criado_por, status, created_at) VALUES
        ('l-velho', 'proj-a', ?, 'manual', 'u-tec', 'em_revisao', datetime('now', '-8 days')),
        ('l-feito', 'proj-a', ?, 'manual', 'u-tec', 'concluido', datetime('now', '-8 days')),
        ('l-novo', 'proj-a', ?, 'manual', 'u-tec', 'em_revisao', datetime('now', '-6 days'))`).bind(ids.s1, ids.s1, ids.s1),
      env.DB.prepare(`INSERT INTO ot_lote_itens (id, project_id, lote_id, linha) VALUES ('i-velho', 'proj-a', 'l-velho', 2)`),
    ]);
    const r = await manutencaoDiaria(env as never);
    expect(r.retencao.ot_lotes).toBeGreaterThanOrEqual(1);
    const { results } = await env.DB.prepare(`SELECT id FROM ot_lotes WHERE id IN ('l-velho', 'l-feito', 'l-novo') ORDER BY id`).all<{ id: string }>();
    expect(results.map((l) => l.id)).toEqual(['l-feito', 'l-novo']);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_lote_itens WHERE id = 'i-velho'`).first('n')).toBe(0);
  });
});
