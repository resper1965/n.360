import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// E3 T3: o técnico (org_user) abre levantamento e traz dados, só nos sites concedidos (lista fechada em routes/ot.ts); o resto segue 403.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const ENV_EXTRA = { AI: { run: async () => ({ response: { colunas: [{ indice: 0, campo: 'nome' }] } }), toMarkdown: async () => [] } };
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), { ...workerEnv(), ...ENV_EXTRA });
const multipart = (h: H, caminho: string, campos: Record<string, string>) => {
  const fd = new FormData();
  fd.set('file', new File(['Equipamento;Endereço\nRTU Tec;10.1.7.1\n'], 'inv.csv'));
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return app.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...ENV_EXTRA });
};
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
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
});

const nova = (site: string) => ({ site_id: site, tipo: 'visita', realizado_em: '2026-11-12' });

const lev = (h: H, extra: Record<string, unknown> = {}) => criar(h, 'levantamentos', { ...nova(ids.s1), ...extra });

describe('técnico: levantamento e dados nos sites concedidos', () => {
  it('cria levantamento no site concedido (201) e não no outro (400, referência inválida)', async () => {
    await lev(tec);
    expect((await chamar(tec, 'POST', `${P}/levantamentos`, nova(ids.s2))).status).toBe(400);
  });

  it('edita notas, registra achado, edita achado e envia para aprovação', async () => {
    const l = await lev(tec);
    const n = await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { notas: 'ronda feita' });
    expect(n.status, await n.clone().text()).toBe(200);
    const a = await chamar(tec, 'POST', `${P}/levantamentos/${l}/achados`, { dados: { nome: 'RTU Tec', ip: '10.1.7.9' }, evidencia: 'visto no painel' });
    expect(a.status, await a.clone().text()).toBe(201);
    const aid = (await a.json<{ id: string }>()).id;
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${l}/achados/${aid}`, { evidencia: 'visto no painel 2' })).status).toBe(200);
    const e = await chamar(tec, 'POST', `${P}/levantamentos/${l}/enviar`, { achados: [aid] });
    expect(e.status, await e.clone().text()).toBe(201);
  });

  it('PUT do levantamento: técnico só notas, roteiro e encerrar; reabrir ou mexer em função é 403; editor segue livre', async () => {
    const l = await lev(tec);
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { notas: 'a', roteiro: {} })).status).toBe(200);
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { situacao: 'encerrado' })).status).toBe(200);
    const r = await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { situacao: 'aberto' });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Forbidden: o técnico só registra notas, respostas e encerra o levantamento' });
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { funcao: 'Chefe' })).status).toBe(403);
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${l}`, { notas: 'b', turno: 'A' })).status).toBe(403);
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${l}`, { situacao: 'aberto', funcao: 'Chefe' })).status).toBe(200);
  });

  it('levantamento de site não concedido: 404 em PUT, achados e enviar', async () => {
    const outro = await criar(cons, 'levantamentos', nova(ids.s2));
    expect((await chamar(tec, 'PUT', `${P}/levantamentos/${outro}`, { notas: 'x' })).status).toBe(404);
    expect((await chamar(tec, 'POST', `${P}/levantamentos/${outro}/achados`, { dados: { nome: 'X' }, evidencia: 'y' })).status).toBe(404);
    expect((await chamar(tec, 'POST', `${P}/levantamentos/${outro}/enviar`, { achados: ['a'] })).status).toBe(404);
    expect((await chamar(tec, 'POST', `${P}/sites/${ids.s2}/enviar`, { achados: ['a'] })).status).toBe(404);
  });

  it('de-para: planilha e texto passam no site concedido e dão 404 no outro; rede segue A1', async () => {
    const doc = await lev(tec, { tipo: 'documento', documento_titulo: 'Inventário' });
    const docOutro = await criar(cons, 'levantamentos', { ...nova(ids.s2), tipo: 'documento', documento_titulo: 'Inventário' });
    const prop = await multipart(tec, `${P}/levantamentos/${doc}/depara/planilha/proposta`, {});
    expect(prop.status, await prop.clone().text()).toBe(200);
    const apl = await multipart(tec, `${P}/levantamentos/${doc}/depara/planilha/aplicar`, { mapeamento: JSON.stringify({ '0': 'nome', '1': 'ip' }) });
    expect(apl.status, await apl.clone().text()).toBe(201);
    expect((await multipart(tec, `${P}/levantamentos/${docOutro}/depara/planilha/proposta`, {})).status).toBe(404);
    expect((await multipart(tec, `${P}/levantamentos/${docOutro}/depara/planilha/aplicar`, { mapeamento: '{"0":"nome"}' })).status).toBe(404);
    // texto: o arquivo de teste é CSV, que o leitor de documento recusa com 400 (passou da permissão e da trava de site)
    expect((await multipart(tec, `${P}/levantamentos/${docOutro}/depara/texto`, {})).status).toBe(404);
    expect((await multipart(tec, `${P}/levantamentos/${doc}/depara/texto`, {})).status).toBe(400);
    // rede: fora da lista do técnico (só quem vê o inventário completo)
    expect((await chamar(tec, 'POST', `${P}/levantamentos/${doc}/depara/rede`, {})).status).toBe(403);
  });

  it('lote manual segue permitido ao técnico', async () => {
    const r = await chamar(tec, 'POST', `${P}/lotes/manual`, { site_id: ids.s1, itens: [{ nome: 'RTU M', ip: '10.1.7.50' }] });
    expect(r.status, await r.clone().text()).toBe(201);
  });
});

describe('técnico e cliente: o resto continua 403', () => {
  const proibidas: [string, string, unknown][] = [
    ['POST', 'zonas', { site_id: 'x', nome: 'Z' }], ['POST', 'ativos', { site_id: 'x', nome: 'A' }], ['POST', 'sites', { nome: 'S' }],
    ['POST', 'fluxos', {}], ['POST', 'sites/x/base/pedir', {}], ['POST', 'lotes/x/aprovar', {}], ['POST', 'lotes/x/rejeitar', {}],
    ['DELETE', 'levantamentos/x', undefined], ['PUT', 'sites/x', {}],
  ];
  it.each(proibidas)('técnico: %s /%s', async (m, rota, corpo) => {
    expect((await chamar(tec, m, `${P}/${rota}`, corpo)).status).toBe(403);
  });
  it('cliente: nenhuma escrita, nem as do técnico', async () => {
    for (const [m, rota, corpo] of [...proibidas, ['POST', 'levantamentos', nova(ids.s1)], ['POST', 'lotes/manual', {}],
      ['POST', 'levantamentos/x/enviar', {}], ['POST', 'levantamentos/x/depara/texto', {}]] as [string, string, unknown][]) {
      expect((await chamar(cli, m, `${P}/${rota}`, corpo)).status, `${m} ${rota}`).toBe(403);
    }
  });
  it('chave de API segue recusada (P0-2)', async () => {
    expect([401, 403]).toContain((await chamar({ 'X-API-Key': 'qualquer' }, 'POST', `${P}/levantamentos`, nova(ids.s1))).status);
  });
});
