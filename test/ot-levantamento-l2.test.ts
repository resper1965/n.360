import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { manutencaoDiaria } from '../src/manutencao';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Levantamento do n.ot (spec 2026-11-01, L2): achado de fluxo. Base da L1: sessões, achados, confronto sem oráculo, envio ao lote. D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

let gestor: H, tec: H, cons: H, cli: H;
const ids: Record<string, string> = {};
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
    ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
    ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
    ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a')`).run();
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'u-cli', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
  ids.a1 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'RTU 1', ip: '10.1.1.10' });
  ids.a2 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'IHM 1', ip: '10.1.1.11' });
  ids.a3 = await criar(cons, 'ativos', { site_id: ids.s2, nome: 'RTU Sul', ip: '10.2.1.10' });
  ids.z1 = await criar(cons, 'zonas', { site_id: ids.s1, nome: 'Supervisão', nivel_purdue: 2 });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
  ids.lev1 = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer' });
  ids.lev2 = await criar(cons, 'levantamentos', { site_id: ids.s2, tipo: 'visita', realizado_em: '2026-11-01' });
});


type Ach = { id: string; entidade: string; pergunta_id: string | null; dados: Record<string, unknown>; erros: { campo: string }[]; confronto?: string; alvo_id?: string };
const sessao = async (h: H) => (await (await chamar(h, 'GET', `${P}/levantamentos/${ids.lev1}`)).json<{ achados: Ach[] }>()).achados;
const fluxoAch = (dados: Record<string, unknown>, extra: Record<string, unknown> = {}) => chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/achados`,
  { entidade: 'fluxo', dados, evidencia: 'relatado', ...extra });

describe('achado de fluxo (L2)', () => {
  it('cria com pergunta e devolve entidade, pergunta_id e dados', async () => {
    const r = await fluxoAch({ origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, protocolo: 'Modbus', porta: 502 }, { pergunta_id: 'rot-01' });
    expect(r.status).toBe(201);
    const { id, erros } = await r.json<{ id: string; erros: unknown[] }>();
    expect(erros).toEqual([]);
    expect(await sessao(cons)).toContainEqual(expect.objectContaining({ id, entidade: 'fluxo', pergunta_id: 'rot-01', dados: expect.objectContaining({ porta: 502 }) }));
  });

  it('pergunta inexistente: 400', async () => {
    expect((await fluxoAch({ origem_ativo_id: ids.a1, destino_ativo_id: ids.a2 }, { pergunta_id: 'rot-99' })).status).toBe(400);
  });

  it('ponta de outro site: 201 com erro no campo e fora de dados', async () => {
    const r = await fluxoAch({ origem_ativo_id: ids.a3, destino_ativo_id: ids.a2 });
    expect(r.status).toBe(201);
    const { id, erros } = await r.json<{ id: string; erros: { campo: string }[] }>();
    expect(erros.map((e) => e.campo)).toContain('origem_ativo_id');
    expect((await sessao(cons)).find((a) => a.id === id)!.dados).not.toHaveProperty('origem_ativo_id');
  });

  it('confronto: confirma, contradiz, novo; técnico não recebe confronto', async () => {
    const f = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, externo: false });
    const conf = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_ativo_id: ids.a2 }, evidencia: 'x' });
    const contra = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_ativo_id: ids.a2, externo: true }, evidencia: 'x' });
    const novo = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a2, destino_zona_id: ids.z1 }, evidencia: 'x' });
    const c = await sessao(cons);
    expect(c.find((a) => a.id === conf)).toMatchObject({ confronto: 'confirma', alvo_id: f });
    expect(c.find((a) => a.id === contra)).toMatchObject({ confronto: 'contradiz', alvo_id: f });
    expect(c.find((a) => a.id === novo)).toMatchObject({ confronto: 'novo', alvo_id: null });
    for (const a of await sessao(tec)) { expect(a).not.toHaveProperty('confronto'); expect(a).not.toHaveProperty('alvo_id'); }
  });

  it('PUT: entidade é 400; porta inválida é 200 com erro', async () => {
    const id = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a2, destino_ativo_id: ids.a1 }, evidencia: 'x' });
    const u = `${P}/levantamentos/${ids.lev1}/achados/${id}`;
    expect((await chamar(cons, 'PUT', u, { entidade: 'ativo' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', u, { dados: { origem_ativo_id: ids.a2, destino_ativo_id: ids.a1, porta: 70000 } })).status).toBe(200);
    expect((await sessao(cons)).find((a) => a.id === id)!.erros.map((e) => e.campo)).toContain('porta');
  });

  it('achado de ativo segue como na L1: IP existente confirma', async () => {
    const id = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'RTU 1', ip: '10.1.1.10' }, evidencia: 'x' });
    expect((await sessao(cons)).find((a) => a.id === id)).toMatchObject({ entidade: 'ativo', confronto: 'confirma', alvo_id: ids.a1 });
  });
});

type Item = { id: string; entidade: string; decisao: string; registro_id?: string | null; dados: Record<string, unknown>; [k: string]: unknown };
type Fluxo = { id: string; origem_ativo_id: string | null; destino_zona_id: string | null; via_vpn: boolean; violacoes: string[]; [k: string]: unknown };
const enviar = async (achados: string[]) => {
  const r = await chamar(cons, 'POST', `${P}/levantamentos/${ids.lev1}/enviar`, { achados });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await r.json<{ id: string }>()).id;
};
const itensDo = async (h: H, lote: string) => (await (await chamar(h, 'GET', `${P}/lotes/${lote}`)).json<{ itens: Item[] }>()).itens;
const fluxosS1 = async () => (await (await chamar(cons, 'GET', `${P}/fluxos?site_id=${ids.s1}`)).json<{ fluxos: Fluxo[] }>()).fluxos;
const aprovar = async (lote: string) => expect((await chamar(gestor, 'POST', `${P}/lotes/${lote}/aprovar`)).status).toBe(200);

describe('lote com fluxos', () => {
  const l: Record<string, string> = {};
  it('enviar leva ativo e fluxo ao lote; o achado guarda o item', async () => {
    const at = await criar(cons, `levantamentos/${ids.lev1}/achados`, { dados: { nome: 'Switch L2' }, evidencia: 'x' });
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_zona_id: ids.z1, externo: true, via_vpn: false }, evidencia: 'x' });
    l.lote1 = await enviar([at, fl]);
    const itens = await itensDo(gestor, l.lote1);
    expect(itens).toHaveLength(2);
    expect(itens.find((i) => i.entidade === 'fluxo')!.dados.origem_ativo_id).toBe(ids.a1);
    expect(itens.find((i) => i.entidade === 'ativo')!.dados.nome).toBe('Switch L2');
    const { results } = await env.DB.prepare(`SELECT lote_item_id FROM ot_achados WHERE id IN (?, ?)`).bind(at, fl).all<{ lote_item_id: string | null }>();
    expect(results.every((a) => a.lote_item_id)).toBe(true);
  });

  it('aprovar cria o fluxo com violação; o item fica gravado com registro_id', async () => {
    await aprovar(l.lote1);
    const f = (await fluxosS1()).find((x) => x.origem_ativo_id === ids.a1 && x.destino_zona_id === ids.z1)!;
    expect(f.violacoes).toEqual(['4.1.2', '4.1.3']);
    l.fluxo = f.id;
    expect((await itensDo(gestor, l.lote1)).find((i) => i.entidade === 'fluxo')).toMatchObject({ decisao: 'gravado', registro_id: f.id });
  });

  it('mesma chave atualiza o fluxo existente, sem criar outro', async () => {
    const n0 = (await fluxosS1()).length;
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_zona_id: ids.z1, via_vpn: true }, evidencia: 'x' });
    await aprovar(await enviar([fl]));
    const fs = await fluxosS1();
    expect(fs).toHaveLength(n0);
    expect(fs.find((x) => x.id === l.fluxo)).toMatchObject({ via_vpn: true, violacoes: [] });
  });

  it('item de fluxo com erro é recusado e a manutenção devolve o achado a rascunho', async () => {
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { externo: true }, evidencia: 'x' });
    l.lote3 = await enviar([fl]);
    await aprovar(l.lote3);
    expect((await itensDo(gestor, l.lote3))[0].decisao).toBe('recusado');
    await manutencaoDiaria(env as any);
    expect(await env.DB.prepare(`SELECT situacao, lote_id, lote_item_id FROM ot_achados WHERE id = ?`).bind(fl).first())
      .toEqual({ situacao: 'rascunho', lote_id: null, lote_item_id: null });
  });

  it('bidirecional casado ao contrário: atualiza só externo/VPN, pontas intactas, lote concluído', async () => {
    const f = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a2, destino_zona_id: ids.z1, direcao: 'bidirecional', externo: true, via_vpn: false });
    const n0 = (await fluxosS1()).length;
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_zona_id: ids.z1, destino_ativo_id: ids.a2, via_vpn: true }, evidencia: 'x' });
    const lote = await enviar([fl]);
    await aprovar(lote);
    const fs = await fluxosS1();
    expect(fs).toHaveLength(n0);
    expect(fs.find((x) => x.id === f)).toMatchObject({ origem_ativo_id: ids.a2, origem_zona_id: null, destino_ativo_id: null, destino_zona_id: ids.z1,
      direcao: 'bidirecional', via_vpn: true });
    expect(await env.DB.prepare('SELECT status FROM ot_lotes WHERE id = ?').bind(lote).first()).toEqual({ status: 'concluido' });
  });

  it('ponta removida entre o envio e a aprovação: item recusado', async () => {
    const a4 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'CLP 4' });
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: a4, destino_zona_id: ids.z1 }, evidencia: 'x' });
    const lote = await enviar([fl]);
    expect((await chamar(cons, 'DELETE', `${P}/ativos/${a4}`)).status).toBe(200);
    await aprovar(lote);
    expect((await itensDo(gestor, lote))[0]).toMatchObject({ decisao: 'recusado', motivo: 'Uma ponta do fluxo foi removida' });
  });

  it('técnico lê o lote sem marca de duplicata no item de fluxo', async () => {
    const it = (await itensDo(tec, l.lote1)).find((i) => i.entidade === 'fluxo')!;
    expect(it).not.toHaveProperty('possivel_duplicata');
    expect(it).not.toHaveProperty('duplicata_de');
  });
});

describe('revisão final (L2)', () => {
  it('externo/via_vpn ausentes não comparam nem gravam: confirma e, aprovado, mantém externo=1 e via_vpn=1', async () => {
    const a5 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'CLP 5' });
    const f = await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: a5, destino_zona_id: ids.z1, externo: true, via_vpn: true });
    const fl = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: a5, destino_zona_id: ids.z1, protocolo: 'OPC' }, evidencia: 'x' });
    expect((await sessao(cons)).find((a) => a.id === fl)).toMatchObject({ confronto: 'confirma', alvo_id: f });
    await aprovar(await enviar([fl]));
    expect((await fluxosS1()).find((x) => x.id === f)).toMatchObject({ externo: true, via_vpn: true, protocolo: 'OPC' });
  });

  it('pergunta_id vazio: 400 no POST e no PUT', async () => {
    expect((await fluxoAch({ origem_ativo_id: ids.a1 }, { pergunta_id: '' })).status).toBe(400);
    const id = await criar(cons, `levantamentos/${ids.lev1}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1 }, evidencia: 'x' });
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${ids.lev1}/achados/${id}`, { pergunta_id: '' })).status).toBe(400);
  });

  it('nomes_pontas: só nomes das pontas citadas, do site; ler a sessão com fluxos não grava ver_sensivel', async () => {
    const lev = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'visita', realizado_em: '2026-11-02' });
    const vazio = await (await chamar(cons, 'GET', `${P}/levantamentos/${lev}`)).json<{ nomes_pontas: Record<string, string> }>();
    expect(vazio.nomes_pontas).toEqual({});
    await criar(cons, `levantamentos/${lev}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a1, destino_zona_id: ids.z1 }, evidencia: 'x' });
    await criar(cons, `levantamentos/${lev}/achados`, { entidade: 'fluxo', dados: { origem_ativo_id: ids.a3, destino_ativo_id: ids.a2 }, evidencia: 'x' });
    const conta = async () => (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel'`).first<{ n: number }>())!.n;
    const n0 = await conta();
    const r = await (await chamar(cons, 'GET', `${P}/levantamentos/${lev}`)).json<{ nomes_pontas: Record<string, string>; ativos_do_site: { id: string; nome: string }[] }>();
    expect(r.nomes_pontas).toEqual({ [ids.a1]: 'RTU 1', [ids.z1]: 'Supervisão', [ids.a2]: 'IHM 1' });
    expect(r.ativos_do_site).toContainEqual({ id: ids.a1, nome: 'RTU 1' });
    expect(r.ativos_do_site.map((a) => a.id)).not.toContain(ids.a3);
    expect(JSON.stringify(r)).not.toContain('10.1.1.');
    expect(await conta()).toBe(n0);
    const lote = await (await chamar(cons, 'POST', `${P}/levantamentos/${lev}/enviar`, { achados: (await (await chamar(cons, 'GET', `${P}/levantamentos/${lev}`))
      .json<{ achados: { id: string }[] }>()).achados.map((a) => a.id) })).json<{ id: string }>();
    const l = await (await chamar(gestor, 'GET', `${P}/lotes/${lote.id}`)).json<{ nomes_pontas: Record<string, string> }>();
    expect(l.nomes_pontas).toEqual({ [ids.a1]: 'RTU 1', [ids.z1]: 'Supervisão', [ids.a2]: 'IHM 1' });
    expect(await conta()).toBe(n0);
  });

  it('lote com mais de 500 itens: a leitura traz todos (LIMIT acima do teto global de SELECT)', async () => {
    const r = await chamar(cons, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: Array(501).fill({ nome: 'X' }) });
    expect(r.status).toBe(201);
    expect(await itensDo(gestor, (await r.json<{ id: string }>()).id)).toHaveLength(501);
  });
});
