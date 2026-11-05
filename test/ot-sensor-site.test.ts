import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { ehInterno, ipNaFaixa } from '../src/services/ot-rede';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// n.ot L3: faixas internas do site (CIDR) e classificação de rede interna. D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());

let cons: H;
beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['cons:cons-ot@ness.lat'], ['ot']);
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
});
void env;

const sites = async () => (await (await chamar(cons, 'GET', `${P}/sites`)).json<{ sites: { id: string; faixas_internas: string[] }[] }>()).sites;

describe('faixas_internas do site', () => {
  it('grava e devolve como array; PUT atualiza; sem faixas devolve []', async () => {
    const r = await chamar(cons, 'POST', `${P}/sites`, { nome: 'SE A', faixas_internas: ['200.10.0.0/24', '2001:db8::/32'] });
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    expect((await sites()).find((s) => s.id === id)?.faixas_internas).toEqual(['200.10.0.0/24', '2001:db8::/32']);
    expect((await chamar(cons, 'PUT', `${P}/sites/${id}`, { faixas_internas: ['10.9.0.0/16'] })).status).toBe(200);
    expect((await sites()).find((s) => s.id === id)?.faixas_internas).toEqual(['10.9.0.0/16']);
    const r2 = await chamar(cons, 'POST', `${P}/sites`, { nome: 'SE B' });
    const { id: id2 } = await r2.json<{ id: string }>();
    expect((await sites()).find((s) => s.id === id2)?.faixas_internas).toEqual([]);
  });

  it.each([['200.10.0.0/33'], ['abc'], ['200.10.0.0'], ['::/129']])('recusa %s com a mensagem', async (f) => {
    const r = await chamar(cons, 'POST', `${P}/sites`, { nome: 'X', faixas_internas: [f] });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('Faixa inválida: use CIDR, como 200.10.0.0/24');
  });

  it('recusa mais de 50 faixas', async () => {
    const r = await chamar(cons, 'POST', `${P}/sites`, { nome: 'X', faixas_internas: Array.from({ length: 51 }, (_, i) => `200.10.${i}.0/24`) });
    expect(r.status).toBe(400);
  });
});

describe('ehInterno / ipNaFaixa', () => {
  it.each(['10.1.1.1', '172.20.0.1', '192.168.0.9', 'fd00::1', 'fe80::1'])('%s é interno', (ip) => expect(ehInterno(ip, [])).toBe(true));
  it.each(['8.8.8.8', '172.32.0.1', '2001:4860::1'])('%s é externo', (ip) => expect(ehInterno(ip, [])).toBe(false));
  it('usa as faixas do site', () => {
    expect(ehInterno('200.10.0.7', ['200.10.0.0/24'])).toBe(true);
    expect(ehInterno('200.10.1.7', ['200.10.0.0/24'])).toBe(false);
    expect(ipNaFaixa('2001:db8::5', '2001:db8::/32')).toBe(true);
    expect(ipNaFaixa('10.0.0.1', '0.0.0.0/0')).toBe(true);
    expect(ipNaFaixa('10.0.0.1', '2001:db8::/32')).toBe(false);
  });
});
