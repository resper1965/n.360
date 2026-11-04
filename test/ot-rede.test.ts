import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { aadOt, chavesOt, decifrarOt, hmacOt } from '../src/services/ot-cifra';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// n.ot L3: importação do resumo do sensor de rede na sessão de documento. O arquivo fica em memória: nada ao R2, sem IA. D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const CHAVE = 'chave-ot-rede';
const chaves = chavesOt(workerEnv())!;
const puts: unknown[] = [];
let chamadasIa = 0;
const ENV_EXTRA = {
  AI: { run: async () => { chamadasIa++; return {}; }, toMarkdown: async () => { chamadasIa++; return []; } },
  STORAGE: { put: async (...a: unknown[]) => { puts.push(a); } }, TRILHA: { put: async (...a: unknown[]) => { puts.push(a); } },
};
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), { ...workerEnv(), ...ENV_EXTRA });
const enviar = (h: H, lev: string, conteudo: BlobPart) => {
  const fd = new FormData();
  fd.set('file', new File([conteudo], 'resumo.json'));
  return app.fetch(new Request(`http://localhost${P}/levantamentos/${lev}/depara/rede`, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...ENV_EXTRA });
};
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

const base = { formato: 'n.ot-resumo-rede/1', gerado_em: '2026-11-04T12:00:00Z', periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T23:59:59Z' } };
const at = (ip: string, extra: Record<string, unknown> = {}) => ({ ip, protocolos: [], portas_servico: [], ...extra });
const cx = (origem: string, destino: string, porta: number, aplicacao: string | null) =>
  ({ origem, destino, transporte: 'tcp', porta, aplicacao, contagem: 3, primeira_vez: '2026-11-01T00:00:00Z', ultima_vez: '2026-11-02T00:00:00Z' });
const RESUMO = JSON.stringify({
  ...base,
  ativos: [
    at('10.1.1.30', { mac: '00:30:a7:01:02:04', fabricante: 'SEL', protocolos: ['dnp3'], portas_servico: [20000] }),
    at('10.1.1.10', { mac: '00:30:a7:01:02:03' }),
    at('10.1.1.20', { mac: '00:30:a7:01:02:05' }),
    at('8.8.8.8', { protocolos: ['dns'] }),
  ],
  conexoes: [
    cx('10.1.1.20', '10.1.1.10', 20000, 'dnp3'),
    cx('10.1.1.20', '203.0.113.5', 443, 'https'),
    cx('10.1.1.30', '10.1.1.10', 20000, 'dnp3'),
    cx('10.1.1.20', '200.10.0.7', 502, 'modbus'), // faixa interna do site: ponta interna desconhecida
  ],
});
const IPS = ['10.1.1.30', '10.1.1.10', '10.1.1.20', '203.0.113.5', '200.10.0.7'];

let gestor: H, cons: H, caNao: H;
const ids: Record<string, string> = {};
const doc = (titulo: string) => criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-04', documento_titulo: titulo });
type Ach = { id: string; entidade: string; origem: string; evidencia: string; dados: Record<string, unknown>; confronto?: string };
const achados = async (h: H, lev: string) => (await (await chamar(h, 'GET', `${P}/levantamentos/${lev}`)).json<{ achados: Ach[] }>()).achados;
const contar = async (lev: string) => (await env.DB.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-ca-n', 'ca-n@ness.lat', 'x', 'Admin não designado', 'consultoria_admin', NULL)`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ot-r', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-ca-n', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  caNao = await sessionFor({ id: 'u-ca-n', email: 'ca-n@ness.lat', role: 'consultoria_admin' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte', faixas_internas: ['200.10.0.0/24'] });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_hash) VALUES ('a-rtu', 'proj-a', ?, 'RTU 1', ?)`).bind(ids.s1, await hmacOt(chaves, 'proj-a', '10.1.1.10')),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_hash, mac_hash) VALUES ('a-ihm', 'proj-a', ?, 'IHM', ?, 'mh')`).bind(ids.s1, await hmacOt(chaves, 'proj-a', '10.1.1.20')),
  ]);
  // Fluxo do inventário marcado interno nas mesmas pontas do fluxo externo do sensor (dado legado: o CHECK de hoje o recusaria).
  await env.DB.batch([
    env.DB.prepare('PRAGMA ignore_check_constraints = ON'),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, protocolo, porta, externo) VALUES ('f-ihm', 'proj-a', ?, 'a-ihm', 'https', 443, 0)`).bind(ids.s1),
    env.DB.prepare('PRAGMA ignore_check_constraints = OFF'),
  ]);
  ids.doc = await doc('Sensor SE Norte');
  ids.ent = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-04' });
});

describe('POST /levantamentos/:id/depara/rede', () => {
  it('resumo válido: 201 com as contagens; achados do consultor com evidência do sensor e IP cifrado com a AAD do id gravado', async () => {
    const r = await enviar(cons, ids.doc, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ ativos_novos: 1, ativos_conhecidos: 2, macs_completados: 1, fluxos_criados: 2, fluxos_pendentes: 2, nao_importados: 0 });
    const lista = await achados(cons, ids.doc);
    expect(lista).toHaveLength(4);
    expect(lista.filter((a) => a.entidade === 'fluxo')).toHaveLength(2);
    for (const a of lista) {
      expect(a.origem).toBe('consultor');
      expect(a.evidencia).toBe('Sensor de rede (Zeek): 12 conexões entre 01/11 e 03/11');
    }
    const novo = await env.DB.prepare(`SELECT id, dados FROM ot_achados WHERE levantamento_id = ? AND entidade = 'ativo' AND dados LIKE '%SEL%'`).bind(ids.doc)
      .first<{ id: string; dados: string }>();
    const d = JSON.parse(novo!.dados) as { ip_cifrado: string; mac_cifrado: string };
    expect(await decifrarOt(d.ip_cifrado, chaves, aadOt('proj-a', 'ot_achados', novo!.id, 'ip'))).toBe('10.1.1.30');
    expect(await decifrarOt(d.mac_cifrado, chaves, aadOt('proj-a', 'ot_achados', novo!.id, 'mac'))).toBe('00:30:a7:01:02:04');
  });

  it('fluxo externo do sensor contra o fluxo interno do inventário nas mesmas pontas: o consultor vê contradiz', async () => {
    const f = (await achados(cons, ids.doc)).find((a) => a.entidade === 'fluxo' && a.dados.externo === true)!;
    expect(f.dados).toMatchObject({ origem_ativo_id: 'a-ihm', protocolo: 'https', porta: 443 });
    expect(f.confronto).toBe('contradiz');
  });

  it('pendências gravadas só com hash, sem IP em claro, e com a evidência para a segunda passagem', async () => {
    const { results } = await env.DB.prepare('SELECT * FROM ot_fluxos_pendentes WHERE levantamento_id = ? LIMIT 100').bind(ids.doc).all<{ origem_ip_hash: string; dados: string }>();
    expect(results).toHaveLength(2);
    const texto = JSON.stringify(results);
    for (const ip of IPS) expect(texto).not.toContain(ip);
    expect(results.map((p) => p.origem_ip_hash).sort()).toEqual([await hmacOt(chaves, 'proj-a', '10.1.1.20'), await hmacOt(chaves, 'proj-a', '10.1.1.30')].sort());
    for (const p of results) expect(JSON.parse(p.dados)).toMatchObject({ direcao: 'unidirecional', evidencia: 'Sensor de rede (Zeek): 12 conexões entre 01/11 e 03/11' });
  });

  it('quem vê mascarado recebe só achados_criados e fluxos_pendentes', async () => {
    const lev = await doc('Sensor mascarado');
    const r = await enviar(caNao, lev, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ achados_criados: 4, fluxos_pendentes: 2 });
  });

  it('recusas: campo desconhecido (400, nada gravado), JSON malformado, sessão de entrevista, 6 MB, chave de API', async () => {
    const lev = await doc('Recusas');
    const r = await enviar(cons, lev, JSON.stringify({ ...JSON.parse(RESUMO), extra: 1 }));
    expect(r.status).toBe(400);
    expect((await r.json<{ error: string }>()).error).toMatch(/^Resumo de rede inválido: /);
    const ip = await enviar(cons, lev, JSON.stringify({ ...JSON.parse(RESUMO), ativos: [at('999.1.1.1')] }));
    expect(ip.status).toBe(400);
    expect((await ip.json<{ error: string }>()).error).not.toContain('999.1.1.1');
    expect((await enviar(cons, lev, '{ não é json')).status).toBe(400);
    expect(await contar(lev)).toBe(0);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(0);
    expect((await enviar(cons, ids.ent, RESUMO)).status).toBe(409);
    expect((await enviar(cons, lev, 'x'.repeat(6 * 1024 * 1024))).status).toBe(413);
    expect((await enviar({ 'X-API-Key': CHAVE }, lev, RESUMO)).status).toBe(403);
  });

  it('teto: sessão com 1.998 achados e resumo que geraria 5 → nao_importados 3; sem período, a evidência usa a data do resumo', async () => {
    const lev = await doc('Cheio');
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1998)
      INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por) SELECT 'rede-cheio-' || i, 'proj-a', ?, 'x' FROM n`).bind(lev).run();
    const { periodo: _p, ...semPeriodo } = base;
    const r = await enviar(gestor, lev, JSON.stringify({ ...semPeriodo, ativos: [1, 2, 3, 4, 5].map((i) => at(`10.1.2.${i}`)), conexoes: [] }));
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ ativos_novos: 5, nao_importados: 3 });
    expect(await contar(lev)).toBe(2000);
    const ev = await env.DB.prepare(`SELECT evidencia FROM ot_achados WHERE levantamento_id = ? AND id NOT LIKE 'rede-cheio-%' LIMIT 1`).bind(lev).first<{ evidencia: string }>();
    expect(ev!.evidencia).toBe('Sensor de rede (Zeek): 0 conexões entre 04/11 e 04/11');
  });

  it('nada ao R2, sem IA; trilha só com contagens', async () => {
    expect(puts).toEqual([]);
    expect(chamadasIa).toBe(0);
    const { results } = await env.DB.prepare(`SELECT details, justification FROM audit_logs WHERE action = 'ot.depara.rede' LIMIT 100`).all<{ details: string; justification: string }>();
    expect(results.length).toBeGreaterThanOrEqual(3);
    for (const l of results) {
      expect(l.details + l.justification).not.toMatch(/\d+\.\d+\.\d+\.\d+|resumo\.json/);
    }
  });
});
