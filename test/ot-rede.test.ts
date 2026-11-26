import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { aadOt, chavesOt, decifrarOt, hmacOt } from '../src/services/ot-cifra';
import { inventarioPorLote } from './helpers/ot';
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
const enviar = (h: H, lev: string, conteudo: BlobPart, extra: Record<string, unknown> = {}) => {
  const fd = new FormData();
  fd.set('file', new File([conteudo], 'resumo.json'));
  return app.fetch(new Request(`http://localhost${P}/levantamentos/${lev}/depara/rede`, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...ENV_EXTRA, ...extra });
};
/** D1 cujo `batch` falha quando leva um INSERT em ot_achados (o resto passa ao banco real). */
function dbQueFalhaNosAchados() {
  const sqlDe = new WeakMap<object, string>();
  return new Proxy(env.DB, {
    get(t, k) {
      if (k === 'prepare') return (sql: string) => {
        const st = t.prepare(sql);
        const bind = st.bind.bind(st);
        st.bind = (...v: unknown[]) => { const b = bind(...v); sqlDe.set(b, sql); return b; };
        return st;
      };
      if (k === 'batch') return async (stmts: D1PreparedStatement[]) => {
        if (stmts.some((x) => sqlDe.get(x)?.includes('INSERT INTO ot_achados'))) throw new Error('falha forçada');
        return t.batch(stmts);
      };
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
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
    cx('10.1.1.10', '203.0.113.9', 443, 'https'),
    cx('10.1.1.30', '10.1.1.10', 20000, 'dnp3'),
    cx('10.1.1.20', '200.10.0.7', 502, 'modbus'), // faixa interna do site: ponta interna desconhecida
  ],
});
const IPS = ['10.1.1.30', '10.1.1.10', '10.1.1.20', '203.0.113.5', '203.0.113.9', '200.10.0.7'];

let gestor: H, cons: H, caNao: H;
const ids: Record<string, string> = {};
const doc = (titulo: string) => criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-04', documento_titulo: titulo });
type Ach = { id: string; entidade: string; origem: string; evidencia: string; dados: Record<string, unknown>; confronto?: string };
const achados = async (h: H, lev: string) => (await (await chamar(h, 'GET', `${P}/levantamentos/${lev}`)).json<{ achados: Ach[] }>()).achados;
/** Os testes de teto reimportam o RESUMO no mesmo site: sem as chaves anteriores, o filtro de novidade não o recusa. */
const esquecerChaves = () => env.DB.batch([env.DB.prepare(`UPDATE ot_achados SET chave_sensor = NULL WHERE project_id = 'proj-a'`),
  env.DB.prepare(`UPDATE ot_fluxos_pendentes SET chave_sensor = NULL WHERE project_id = 'proj-a'`)]);
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
  // Fluxo externo do inventário igual ao externo da IHM no sensor (mesma ponta, protocolo e porta: não vira achado); o da RTU não tem par (novo).
  [ids.fext] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: 'a-ihm', externo: true, protocolo: 'https', porta: 443 } }] });
  ids.doc = await doc('Sensor SE Norte');
  ids.ent = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-04' });
});

describe('POST /levantamentos/:id/depara/rede', () => {
  it('resumo válido: 201 com as contagens; achados do consultor com evidência do sensor e IP cifrado com a AAD do id gravado', async () => {
    const r = await enviar(cons, ids.doc, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ ativos_novos: 1, ativos_conhecidos: 2, macs_completados: 1, fluxos_criados: 2, fluxos_pendentes: 2, nao_importados: 0,
      pendentes_nao_importados: 0, fluxos_conhecidos: 1, repetidos: 0 });
    const lista = await achados(cons, ids.doc);
    expect(lista).toHaveLength(4);
    expect(lista.filter((a) => a.entidade === 'fluxo')).toHaveLength(2);
    for (const a of lista) {
      expect(a.origem).toBe('consultor');
      expect(a.evidencia).toBe('Sensor de rede (Zeek): 15 conexões entre 01/11 e 03/11');
    }
    const novo = await env.DB.prepare(`SELECT id, dados FROM ot_achados WHERE levantamento_id = ? AND entidade = 'ativo' AND dados LIKE '%SEL%'`).bind(ids.doc)
      .first<{ id: string; dados: string }>();
    const d = JSON.parse(novo!.dados) as { ip_cifrado: string; mac_cifrado: string };
    expect(await decifrarOt(d.ip_cifrado, chaves, aadOt('proj-a', 'ot_achados', novo!.id, 'ip'))).toBe('10.1.1.30');
    expect(await decifrarOt(d.mac_cifrado, chaves, aadOt('proj-a', 'ot_achados', novo!.id, 'mac'))).toBe('00:30:a7:01:02:04');
  });

  it('fluxo externo do sensor: o já cadastrado (mesma ponta, protocolo e porta) não vira achado; o sem par é novo', async () => {
    const externos = (await achados(cons, ids.doc)).filter((a) => a.entidade === 'fluxo' && a.dados.externo === true);
    expect(externos.find((a) => a.dados.origem_ativo_id === 'a-ihm')).toBeUndefined();
    expect(externos.find((a) => a.dados.origem_ativo_id === 'a-rtu')!.confronto).toBe('novo');
  });

  // Externo de uma ponta só não casa pelo índice (revisão do PR3a): o achado é "novo" e, aprovado, vira outro fluxo, não sobrescreve o do inventário.
  it('fluxo do inventário com outra porta: o do sensor ainda vira achado (novo: externo de uma ponta só não casa)', async () => {
    const lev = await doc('Outra porta');
    const r = await enviar(cons, lev, JSON.stringify({ ...base, ativos: [], conexoes: [cx('10.1.1.20', '203.0.113.5', 8443, 'https')] }));
    expect(await r.json()).toMatchObject({ fluxos_criados: 1, fluxos_conhecidos: 0 });
    expect((await achados(cons, lev))[0]).toMatchObject({ entidade: 'fluxo', dados: { origem_ativo_id: 'a-ihm', porta: 8443 }, confronto: 'novo' });
  });

  it('pendências gravadas só com hash, sem IP em claro, e com a evidência para a segunda passagem', async () => {
    const { results } = await env.DB.prepare('SELECT * FROM ot_fluxos_pendentes WHERE levantamento_id = ? LIMIT 100').bind(ids.doc).all<{ origem_ip_hash: string; dados: string }>();
    expect(results).toHaveLength(2);
    const texto = JSON.stringify(results);
    for (const ip of IPS) expect(texto).not.toContain(ip);
    expect(results.map((p) => p.origem_ip_hash).sort()).toEqual([await hmacOt(chaves, 'proj-a', '10.1.1.20'), await hmacOt(chaves, 'proj-a', '10.1.1.30')].sort());
    for (const p of results) expect(JSON.parse(p.dados)).toMatchObject({ direcao: 'unidirecional', evidencia: 'Sensor de rede (Zeek): 15 conexões entre 01/11 e 03/11' });
  });

  it('o mesmo resumo de novo, em outra sessão do site: nenhum achado nem pendência, tudo em repetidos', async () => {
    const lev = await doc('Repetido');
    const r = await enviar(cons, lev, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ ativos_novos: 0, ativos_conhecidos: 2, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 0, nao_importados: 0,
      pendentes_nao_importados: 0, fluxos_conhecidos: 1, repetidos: 6 });
    expect(await contar(lev)).toBe(0);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(0);
    const chaves = await env.DB.prepare(`SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ? AND chave_sensor IS NOT NULL`).bind(ids.doc).first<{ n: number }>();
    expect(chaves!.n).toBe(4);
  });

  it('quem vê mascarado não importa: 403 e nada gravado', async () => {
    const lev = await doc('Sensor mascarado');
    const r = await enviar(caNao, lev, RESUMO);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Importar o resumo de rede exige ver o inventário completo (Gestor ARCiber ou consultoria designada)' });
    expect(await contar(lev)).toBe(0);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(0);
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
    const r = await enviar(gestor, lev, JSON.stringify({ ...semPeriodo, ativos: [1, 2, 3, 4, 5].map((i) => at(`10.1.2.${i}`, { mac: `00:30:a7:00:02:0${i}` })), conexoes: [] }));
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ ativos_novos: 2, nao_importados: 3 });
    expect(await contar(lev)).toBe(2000);
    const ev = await env.DB.prepare(`SELECT evidencia FROM ot_achados WHERE levantamento_id = ? AND id NOT LIKE 'rede-cheio-%' LIMIT 1`).bind(lev).first<{ evidencia: string }>();
    expect(ev!.evidencia).toBe('Sensor de rede (Zeek): 0 conexões entre 04/11 e 04/11');
  });

  it('perto do teto: só as vagas livres, na ordem ativos novos, MACs, fluxos; contagens do que foi gravado', async () => {
    await esquecerChaves();
    const lev = await doc('Quase cheio');
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1997)
      INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por) SELECT 'rede-quase-' || i, 'proj-a', ?, 'x' FROM n`).bind(lev).run();
    const r = await enviar(cons, lev, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ ativos_novos: 1, ativos_conhecidos: 2, macs_completados: 1, fluxos_criados: 1, fluxos_pendentes: 2, nao_importados: 1,
      pendentes_nao_importados: 0, fluxos_conhecidos: 1, repetidos: 0 });
    expect(await contar(lev)).toBe(2000);
  });

  it('teto de 2.000 pendências por sessão: o excedente volta em pendentes_nao_importados', async () => {
    await esquecerChaves();
    const lev = await doc('Pendências cheias');
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1999)
      INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, dados) SELECT 'pend-' || i, 'proj-a', ?, 'h', '{}' FROM n`).bind(lev).run();
    const r = await enviar(cons, lev, RESUMO);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ fluxos_pendentes: 1, pendentes_nao_importados: 1 });
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(2000);
  });

  it('falha ao gravar os achados: 500 e nenhuma pendência desta requisição fica', async () => {
    await esquecerChaves();
    const lev = await doc('Falha');
    const r = await enviar(cons, lev, RESUMO, { DB: dbQueFalhaNosAchados() });
    expect(r.status).toBe(500);
    expect(await contar(lev)).toBe(0);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(0);
  });

  it('achado que completa o MAC leva o nome do ativo: enviado ao lote e aprovado por outra pessoa, o ativo ganha o MAC', async () => {
    const mac = (await achados(cons, ids.doc)).find((a) => a.entidade === 'ativo' && a.dados.nome === 'RTU 1')!;
    expect(mac).toBeTruthy();
    const e = await chamar(cons, 'POST', `${P}/levantamentos/${ids.doc}/enviar`, { achados: [mac.id] });
    expect(e.status, await e.clone().text()).toBe(201);
    const ap = await chamar(gestor, 'POST', `${P}/lotes/${(await e.json<{ id: string }>()).id}/aprovar`);
    expect(ap.status, await ap.clone().text()).toBe(200);
    const a = await env.DB.prepare(`SELECT mac_hash FROM ot_ativos WHERE id = 'a-rtu'`).first<{ mac_hash: string | null }>();
    expect(a!.mac_hash).toBe(await hmacOt(chaves, 'proj-a', '00:30:a7:01:02:03'));
  });

  it('segunda passagem: aprovado o ativo da ponta desconhecida, a pendência vira achado de fluxo com as duas pontas, mesmo com a sessão encerrada', async () => {
    // IP próprio deste teste: o 10.1.1.30 já tem pendências em outras sessões do arquivo
    const lev = await doc('Segunda passagem');
    const r = await enviar(cons, lev, JSON.stringify({ ...base, ativos: [at('10.1.1.40', { protocolos: ['dnp3'] })], conexoes: [cx('10.1.1.40', '10.1.1.10', 20000, 'dnp3')] }));
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ ativos_novos: 1, fluxos_pendentes: 1 });
    const ativo = (await achados(cons, lev)).find((a) => a.entidade === 'ativo')!;
    const e = await chamar(cons, 'POST', `${P}/levantamentos/${lev}/enviar`, { achados: [ativo.id] });
    expect(e.status, await e.clone().text()).toBe(201);
    await env.DB.prepare(`UPDATE ot_levantamentos SET situacao = 'encerrado', encerrado_em = CURRENT_TIMESTAMP WHERE id = ?`).bind(lev).run();
    const ap = await chamar(gestor, 'POST', `${P}/lotes/${(await e.json<{ id: string }>()).id}/aprovar`);
    expect(ap.status, await ap.clone().text()).toBe(200);
    expect(await ap.json()).toMatchObject({ criados: 1, fluxos_pendentes_resolvidos: 1 });
    const novo = await env.DB.prepare('SELECT id FROM ot_ativos WHERE ip_hash = ?').bind(await hmacOt(chaves, 'proj-a', '10.1.1.40')).first<{ id: string }>();
    const fluxo = await env.DB.prepare(`SELECT dados, evidencia, origem, chave_sensor FROM ot_achados WHERE levantamento_id = ? AND entidade = 'fluxo'`).bind(lev)
      .first<{ dados: string; evidencia: string; origem: string; chave_sensor: string }>();
    // a chave da pendência passa ao achado: o filtro de novidade continua a ver o fluxo
    expect(fluxo!.chave_sensor).toBe(await hmacOt(chaves, 'proj-a', `${ids.s1}|10.1.1.40|10.1.1.10|dnp3|20000`));
    expect(JSON.parse(fluxo!.dados)).toMatchObject({ origem_ativo_id: novo!.id, destino_ativo_id: 'a-rtu', protocolo: 'dnp3', porta: 20000, direcao: 'unidirecional' });
    expect(fluxo).toMatchObject({ evidencia: 'Sensor de rede (Zeek): 3 conexões entre 01/11 e 03/11', origem: 'consultor' });
    expect((await env.DB.prepare('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n).toBe(0);
  });

  /** Importa um ativo novo com o IP dado (com MAC, sem conexões), envia o achado ao lote; `antes` roda antes da aprovação; devolve sessão, lote e resposta. */
  async function aprovarAtivoNovo(ip: string, antes: (lev: string, hash: string) => Promise<void>, extra: Record<string, unknown> = {}) {
    const lev = await doc(`Ativo novo ${ip.split('.').pop()}`);
    const r = await enviar(cons, lev, JSON.stringify({ ...base, ativos: [at(ip, { mac: `00:30:a7:00:00:${Number(ip.split('.').pop()).toString(16).padStart(2, '0')}` })], conexoes: [] }));
    expect(r.status, await r.clone().text()).toBe(201);
    const ativo = (await achados(cons, lev)).find((a) => a.entidade === 'ativo')!;
    const e = await chamar(cons, 'POST', `${P}/levantamentos/${lev}/enviar`, { achados: [ativo.id] });
    expect(e.status, await e.clone().text()).toBe(201);
    await antes(lev, await hmacOt(chaves, 'proj-a', ip));
    const loteId = (await e.json<{ id: string }>()).id;
    const ap = await app.fetch(new Request(`http://localhost${P}/lotes/${loteId}/aprovar`, { method: 'POST', headers: gestor }), { ...workerEnv(), ...ENV_EXTRA, ...extra });
    return { lev, loteId, ap };
  }
  const pendente = (id: string, lev: string, origem: string | null, destino: string | null, dados: string) => env.DB.prepare(`INSERT INTO ot_fluxos_pendentes
    (id, project_id, levantamento_id, origem_ip_hash, destino_ip_hash, dados) VALUES (?, 'proj-a', ?, ?, ?, ?)`).bind(id, lev, origem, destino, dados).run();
  const existe = async (id: string) => !!(await env.DB.prepare('SELECT 1 FROM ot_fluxos_pendentes WHERE id = ?').bind(id).first());

  it('segunda passagem: pendência malformada é pulada, a externa (destino nulo) resolve com uma ponta; a aprovação devolve 200 e grava a trilha', async () => {
    const EXT = JSON.stringify({ protocolo: 'https', porta: 443, direcao: 'unidirecional', externo: true, evidencia: 'Sensor de rede (Zeek): 2 conexões entre 01/11 e 02/11' });
    const { lev, loteId, ap } = await aprovarAtivoNovo('10.1.1.41', async (lev, h) => {
      // O CHECK da tabela barra JSON inválido; a linha ruim simula dado gravado antes do CHECK ou corrompido.
      await env.DB.batch([env.DB.prepare('PRAGMA ignore_check_constraints = ON'),
        env.DB.prepare(`INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, dados) VALUES ('pend-ruim', 'proj-a', ?, ?, '{não é json')`).bind(lev, h),
        env.DB.prepare('PRAGMA ignore_check_constraints = OFF')]);
      await pendente('pend-ext', lev, h, null, EXT);
    });
    expect(ap.status, await ap.clone().text()).toBe(200);
    expect(await ap.json()).toMatchObject({ criados: 1, fluxos_pendentes_resolvidos: 1 });
    const novo = await env.DB.prepare('SELECT id FROM ot_ativos WHERE ip_hash = ?').bind(await hmacOt(chaves, 'proj-a', '10.1.1.41')).first<{ id: string }>();
    const f = await env.DB.prepare(`SELECT dados, evidencia FROM ot_achados WHERE levantamento_id = ? AND entidade = 'fluxo'`).bind(lev).first<{ dados: string; evidencia: string }>();
    const d = JSON.parse(f!.dados);
    expect(d).toMatchObject({ origem_ativo_id: novo!.id, externo: 1, protocolo: 'https', porta: 443 });
    expect(d.destino_ativo_id).toBeUndefined();
    expect(f!.evidencia).toBe('Sensor de rede (Zeek): 2 conexões entre 01/11 e 02/11');
    expect([await existe('pend-ruim'), await existe('pend-ext')]).toEqual([true, false]);
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.lote.aprovado' AND details LIKE ? LIMIT 1`).bind(`%${loteId}%`).first<{ details: string }>();
    expect(t!.details).toContain('1 fluxo(s) pendente(s) resolvido(s)');
  });

  it('segunda passagem que falha no banco não derruba a aprovação já gravada: 200, resolvidos 0, trilha gravada e a pendência fica', async () => {
    const DADOS = JSON.stringify({ protocolo: 'dnp3', porta: 20000, direcao: 'unidirecional', evidencia: 'Sensor' });
    const rtu = await hmacOt(chaves, 'proj-a', '10.1.1.10');
    const db = new Proxy(env.DB, {
      get(t, k) {
        if (k === 'prepare') return (sql: string) => { if (sql.includes('FROM ot_fluxos_pendentes p')) throw new Error('falha forçada'); return t.prepare(sql); };
        const v = (t as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const { loteId: lote, ap } = await aprovarAtivoNovo('10.1.1.43', async (lev, h) => { await pendente('pend-falha', lev, h, rtu, DADOS); }, { DB: db });
    expect(ap.status, await ap.clone().text()).toBe(200);
    expect(await ap.json()).toMatchObject({ criados: 1, fluxos_pendentes_resolvidos: 0 });
    expect(await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'ot.lote.aprovado' AND details LIKE ? LIMIT 1`).bind(`%${lote}%`).first()).toBeTruthy();
    expect(await existe('pend-falha')).toBe(true);
  });

  it('segunda passagem: sessão cheia (2.000) deixa a pendência; mesmo hash em sessão de outro site não resolve', async () => {
    const DADOS = JSON.stringify({ protocolo: 'dnp3', porta: 20000, direcao: 'unidirecional', evidencia: 'Sensor' });
    const cheia = await doc('Cheia para a segunda passagem');
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
      INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por) SELECT 'rede-2p-' || i, 'proj-a', ?, 'x' FROM n`).bind(cheia).run();
    const s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
    const outro = await criar(cons, 'levantamentos', { site_id: s2, tipo: 'documento', realizado_em: '2026-11-04', documento_titulo: 'Outro site' });
    const rtu = await hmacOt(chaves, 'proj-a', '10.1.1.10');
    const { ap } = await aprovarAtivoNovo('10.1.1.42', async (_lev, h) => {
      await pendente('pend-cheia', cheia, h, rtu, DADOS);
      await pendente('pend-outro-site', outro, h, null, DADOS);
    });
    expect(ap.status, await ap.clone().text()).toBe(200);
    expect(await ap.json()).toMatchObject({ criados: 1, fluxos_pendentes_resolvidos: 0 });
    expect([await existe('pend-cheia'), await existe('pend-outro-site')]).toEqual([true, true]);
    expect(await contar(cheia)).toBe(2000);
    expect(await contar(outro)).toBe(0);
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
