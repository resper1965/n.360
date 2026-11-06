import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import { sha256Hex } from '../src/helpers';
import { handlerOtSensor } from '../src/routes/ot-sensor';
import { gravarPlano } from '../src/services/ot-rede';
import { applySchema, workerEnv, seedTwoProjects, habilitarOt } from './helpers/d1';

// n.ot: a sonda envia o resumo sozinha (POST /ot-sensor/resumo). D1 real, credencial `ots_` no Bearer.
const URL_ENVIO = 'https://n360.ness.com.br/ot-sensor/resumo';
const IP_OK = '203.0.113.5';
const cred = (n: number) => 'ots_' + String(n).padStart(64, '0');
type Opc = { k?: string | null; ip?: string | null; h?: Record<string, string>; e?: any; corpo?: BodyInit };
const pedido = (corpo: string, o: Opc = {}) => new Request(URL_ENVIO, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(o.k !== null && { Authorization: `Bearer ${o.k ?? cred(1)}` }),
    ...(o.ip !== null && { 'CF-Connecting-IP': o.ip ?? IP_OK }), ...o.h },
  body: o.corpo ?? corpo,
});
const enviar = (corpo: string, o: Opc = {}) => worker.fetch(pedido(corpo, o), o.e ?? workerEnv(), createExecutionContext());

/** 4 ativos novos com MAC em 10.<n>.0.x e 2 conexões entre eles (pendências: as pontas ainda não estão no inventário). */
const resumo = (n: number, extra: Record<string, unknown> = {}) => JSON.stringify({
  formato: 'n.ot-resumo-rede/1', gerado_em: '2026-11-04T12:00:00Z', periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T00:00:00Z' },
  ativos: [1, 2, 3, 4].map((i) => ({ ip: `10.${n}.0.${i}`, mac: `00:30:a7:00:0${n % 10}:0${i}`, protocolos: ['modbus'], portas_servico: [502] })),
  conexoes: [[1, 2], [3, 4]].map(([o, d]) => ({ origem: `10.${n}.0.${o}`, destino: `10.${n}.0.${d}`, transporte: 'tcp', porta: 502, aplicacao: 'modbus',
    contagem: 5, primeira_vez: '2026-11-01T00:00:00Z', ultima_vez: '2026-11-02T00:00:00Z' })),
  ...extra,
});
const conta = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;
const daSessao = (lev: string) => Promise.all([
  conta('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?', lev),
  conta('SELECT count(*) AS n FROM ot_fluxos_pendentes WHERE levantamento_id = ?', lev),
]);
/** Achados e pendências gravados pela sonda, em todas as sessões dela. */
async function gravadosDe(sensor: string) {
  return Promise.all([
    conta(`SELECT count(*) AS n FROM ot_achados WHERE project_id = 'proj-a' AND criado_por = ?`, `sensor:${sensor}`),
    conta(`SELECT count(*) AS n FROM ot_fluxos_pendentes p JOIN ot_levantamentos l ON l.id = p.levantamento_id WHERE l.criado_por = ?`, `sensor:${sensor}`),
  ]);
}

const sensor = async (id: string, projeto: string, site: string, faixa: string, n: number, situacao = 'ativa') => {
  await env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, situacao) VALUES (?, ?, ?, ?, ?, 'teste', ?)`)
    .bind(id, projeto, site, `SE ${id}`, faixa, situacao).run();
  await credencial(`c-${id}`, id, projeto, cred(n));
};
const credencial = async (id: string, sensorId: string, projeto: string, texto: string, expira = '2099-01-01T00:00:00.000Z', situacao = 'ativa') =>
  env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em, situacao) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, sensorId, projeto, await sha256Hex(texto), expira, situacao).run();

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-c', 'Cliente C', 'ISO 27001', 'controller', 'Active')`).run();
  await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE 1'), ('s2', 'proj-a', 'SE 2'), ('s3', 'proj-a', 'SE 3'),
    ('sc', 'proj-c', 'SE C')`).run();
  await sensor('sen1', 'proj-a', 's1', '203.0.113.0/24', 1);
  await sensor('sen2', 'proj-a', 's2', '203.0.113.0/24', 2);
  await sensor('sen3', 'proj-a', 's3', '203.0.113.0/24', 3);
  await sensor('sen-sem-faixa', 'proj-a', 's1', '', 4);
  await sensor('sen-c', 'proj-c', 'sc', '203.0.113.0/24', 5);
  await sensor('sen-rev', 'proj-a', 's1', '203.0.113.0/24', 6, 'revogada');
  await credencial('c-rev', 'sen1', 'proj-a', cred(7), '2099-01-01T00:00:00.000Z', 'revogada');
  await credencial('c-venc', 'sen1', 'proj-a', cred(8), '2020-01-01T00:00:00.000Z');
  await env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status, expires_at) VALUES
    ('k-col', 'proj-a', ?, 'agente', 'ot_coleta', 'Active', '2099-01-01T00:00:00.000Z'), ('k-api', 'proj-a', ?, 'comum', 'read', 'Active', NULL)`)
    .bind(await sha256Hex('otc_coleta'), await sha256Hex('chave-comum')).run();
});

describe('autenticação', () => {
  it('credencial ot_coleta, chave comum, ots_ revogada, vencida, de sonda revogada ou ausente: 401', async () => {
    for (const k of ['otc_coleta', 'chave-comum', cred(7), cred(8), cred(6), cred(99), null]) {
      const r = await enviar(resumo(90), { k });
      expect(r.status, String(k)).toBe(401);
      expect(r.headers.get('WWW-Authenticate')).toContain('Bearer');
    }
  });

  it('a credencial ots_ válida não abre o /api: 401', async () => {
    const r = await worker.fetch(new Request('https://n360.ness.com.br/api/v1/projects/proj-a/ot/sites', { headers: { Authorization: `Bearer ${cred(1)}` } }),
      workerEnv(), createExecutionContext());
    expect(r.status).toBe(401);
  });

  it('projeto sem o módulo ot: 403', async () => {
    expect((await enviar(resumo(90), { k: cred(5) })).status).toBe(403);
  });

  it('★ sem faixa, IP fora, IP só no X-Forwarded-For ou sem CF-Connecting-IP: 403', async () => {
    expect((await enviar(resumo(90), { k: cred(4) })).status).toBe(403);
    expect((await enviar(resumo(90), { ip: '198.51.100.9' })).status).toBe(403);
    expect((await enviar(resumo(90), { ip: '198.51.100.9', h: { 'X-Forwarded-For': IP_OK } })).status).toBe(403);
    expect((await enviar(resumo(90), { ip: null, h: { 'X-Forwarded-For': IP_OK } })).status).toBe(403);
    expect(await conta('SELECT count(*) AS n FROM ot_sensor_envios')).toBe(0);
  });

  it('allowlist do projeto que exclui o IP: 403', async () => {
    await env.DB.prepare(`INSERT INTO project_security_policy (project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist) VALUES ('proj-a', 0, NULL, '192.0.2.0/24')`).run();
    try {
      expect((await enviar(resumo(90))).status).toBe(403);
    } finally {
      await env.DB.prepare(`DELETE FROM project_security_policy WHERE project_id = 'proj-a'`).run();
    }
  });

  it('sem as chaves do n.ot: 503', async () => {
    expect((await enviar(resumo(90), { e: { ...workerEnv(), OT_INVENTARIO_HMAC_KEY: undefined } })).status).toBe(503);
  });
});

describe('corpo', () => {
  it('Content-Length acima de 5 MB: 413 sem ler o corpo', async () => {
    let lido = false;
    const corpo = new ReadableStream({ pull() { lido = true; throw new Error('não devia ler'); } }, { highWaterMark: 0 });
    const r = await handlerOtSensor(pedido('', { corpo, h: { 'Content-Length': String(5 * 1024 * 1024 + 1) } }), workerEnv(), createExecutionContext());
    expect(r.status).toBe(413);
    expect(lido).toBe(false);
  });

  it('sem Content-Length, acima de 5 MB pelo stream: 413', async () => {
    const pedaco = new Uint8Array(1024 * 1024).fill(32);
    let n = 0;
    const corpo = new ReadableStream({ pull(c) { if (n++ < 6) c.enqueue(pedaco); else c.close(); } });
    const req = pedido('', { corpo });
    expect(req.headers.get('Content-Length')).toBeNull();
    expect((await handlerOtSensor(req, workerEnv(), createExecutionContext())).status).toBe(413);
  });

  it('sem período, início ≥ fim ou fim a mais de 1 h no futuro: 400 "relógio da sonda"', async () => {
    for (const periodo of [undefined, { inicio: '2026-11-03T00:00:00Z', fim: '2026-11-03T00:00:00Z' }, { inicio: '2026-11-01T00:00:00Z', fim: '2099-01-01T00:00:00Z' }]) {
      const r = await enviar(resumo(90, { periodo }));
      expect(r.status, JSON.stringify(periodo)).toBe(400);
      expect((await r.json<{ error: string }>()).error).toContain('relógio da sonda');
    }
  });

  it('capture_loss 101, versão inválida ou JSON malformado: 400; válidos são aceitos', async () => {
    for (const c of [resumo(90, { capture_loss: 101 }), resumo(90, { versao_script: 'v 1' }), '{']) expect((await enviar(c)).status).toBe(400);
    const r = await enviar(resumo(91, { capture_loss: 2.5, versao_script: '1.0.0' }));
    expect(r.status).toBe(200);
    const e = await env.DB.prepare('SELECT capture_loss, versao_script FROM ot_sensor_envios WHERE id = ?').bind((await r.json<{ envio_id: string }>()).envio_id).first();
    expect(e).toEqual({ capture_loss: 2.5, versao_script: '1.0.0' });
  });
});

describe('envio', () => {
  it('com novidade: sessão documento encerrada, achados em rascunho com chave_sensor; resposta só recebido e envio_id; trilha só com ids e contagens', async () => {
    const r = await enviar(resumo(10));
    expect(r.status).toBe(200);
    const j = await r.json<Record<string, unknown>>();
    expect(Object.keys(j).sort()).toEqual(['envio_id', 'recebido']);
    expect(j.recebido).toBe(true);
    const e = (await env.DB.prepare('SELECT * FROM ot_sensor_envios WHERE id = ?').bind(j.envio_id).first<Record<string, any>>())!;
    expect(e).toMatchObject({ situacao: 'concluido', sensor_id: 'sen1', project_id: 'proj-a', periodo_inicio: '2026-11-01T00:00:00Z', periodo_fim: '2026-11-03T00:00:00Z' });
    expect(JSON.parse(e.contagens)).toMatchObject({ ativos_novos: 4, fluxos_pendentes: 2 });
    const lev = (await env.DB.prepare('SELECT * FROM ot_levantamentos WHERE id = ?').bind(e.levantamento_id).first<Record<string, any>>())!;
    expect(lev).toMatchObject({ tipo: 'documento', situacao: 'encerrado', site_id: 's1', criado_por: 'sensor:sen1', documento_titulo: 'Sonda SE sen1 · 01/11 a 03/11' });
    expect(lev.encerrado_em).toBeTruthy();
    const { results } = await env.DB.prepare('SELECT situacao, origem, chave_sensor, evidencia FROM ot_achados WHERE levantamento_id = ?').bind(lev.id).all<Record<string, any>>();
    expect(results).toHaveLength(4);
    for (const a of results) {
      expect(a).toMatchObject({ situacao: 'rascunho', origem: 'consultor' });
      expect(a.chave_sensor).toBeTruthy();
      expect(a.evidencia).toMatch(/^Sensor de rede \(Zeek\): /);
    }
    expect(await daSessao(lev.id)).toEqual([4, 2]);
    const t = await env.DB.prepare(`SELECT actor, details, ip_address FROM audit_logs WHERE action = 'ot.sensor.resumo' AND details LIKE ?`).bind(`Envio ${j.envio_id} %`)
      .all<Record<string, string>>();
    expect(t.results).toHaveLength(1);
    expect(t.results[0].actor).toBe('sensor:sen1');
    expect(t.results[0].ip_address).toBe('');
    expect(t.results[0].details).toContain('ativos_novos 4');
    expect(JSON.stringify(t.results)).not.toMatch(/10\.10\.0|203\.0\.113|ots_/);
  });

  it('envio repetido: 200 com o mesmo envio_id, sem criar nada; 31 iguais não dão 429', async () => {
    const c = resumo(11);
    const primeiro = await (await enviar(c)).json<{ envio_id: string }>();
    const antes = await gravadosDe('sen1');
    const sessoes = await conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen1'`);
    for (let i = 0; i < 30; i++) {
      const r = await enviar(c);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ recebido: true, envio_id: primeiro.envio_id });
    }
    expect(await gravadosDe('sen1')).toEqual(antes);
    expect(await conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen1'`)).toBe(sessoes);
  });

  it('sem novidade: envio concluído com levantamento_id nulo e nenhuma sessão nova', async () => {
    const c = resumo(10); // mesmos itens do primeiro envio, outro gerado_em: o filtro de novidade pula todos
    const sessoes = await conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen1'`);
    const r = await enviar(c.replace('2026-11-04T12:00:00Z', '2026-11-04T13:00:00Z'));
    expect(r.status).toBe(200);
    const e = await env.DB.prepare('SELECT situacao, levantamento_id FROM ot_sensor_envios WHERE id = ?').bind((await r.json<{ envio_id: string }>()).envio_id).first();
    expect(e).toEqual({ situacao: 'concluido', levantamento_id: null });
    expect(await conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen1'`)).toBe(sessoes);
  });

  it('★ chave por site: duas sondas em dois sites com a mesma faixa privada geram dois conjuntos', async () => {
    const c = resumo(12);
    expect((await enviar(c, { k: cred(1) })).status).toBe(200);
    expect((await enviar(c, { k: cred(2) })).status).toBe(200);
    const sessoes = await env.DB.prepare(`SELECT e.sensor_id, e.levantamento_id FROM ot_sensor_envios e WHERE e.impressao = ? ORDER BY e.sensor_id`)
      .bind(await sha256Hex(c)).all<{ sensor_id: string; levantamento_id: string }>();
    expect(sessoes.results.map((x) => x.sensor_id)).toEqual(['sen1', 'sen2']);
    for (const s of sessoes.results) expect(await daSessao(s.levantamento_id)).toEqual([4, 2]);
  });

  it('teto: o 31º envio diferente no dia é 429; o repetido continua 200', async () => {
    const c = resumo(13);
    const ok = await (await enviar(c, { k: cred(3) })).json<{ envio_id: string }>();
    await env.DB.batch(Array.from({ length: 29 }, (_, i) => env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, situacao)
      VALUES (?, 'sen3', 'proj-a', ?, 'concluido')`).bind(`teto-${i}`, `imp-${i}`)));
    const r = await enviar(resumo(14), { k: cred(3) });
    expect(r.status).toBe(429);
    expect(await enviar(c, { k: cred(3) }).then((x) => x.json())).toEqual({ recebido: true, envio_id: ok.envio_id });
  });

  it('processando há 11 min: reprocessa a mesma linha; há 2 min: 503', async () => {
    const c = resumo(15), d = resumo(16);
    await env.DB.prepare(`INSERT INTO ot_sensor_envios (id, sensor_id, project_id, impressao, atualizado_em) VALUES
      ('velho', 'sen1', 'proj-a', ?, datetime('now', '-11 minutes')), ('novo', 'sen1', 'proj-a', ?, datetime('now', '-2 minutes'))`)
      .bind(await sha256Hex(c), await sha256Hex(d)).run();
    const r = await enviar(c);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ recebido: true, envio_id: 'velho' });
    const e = (await env.DB.prepare(`SELECT situacao, levantamento_id FROM ot_sensor_envios WHERE id = 'velho'`).first<{ situacao: string; levantamento_id: string }>())!;
    expect(e.situacao).toBe('concluido');
    expect(await daSessao(e.levantamento_id)).toEqual([4, 2]);
    const r2 = await enviar(d);
    expect(r2.status).toBe(503);
    expect((await r2.json<{ error: string }>()).error).toContain('em processamento');
  });

  it('★ falha no meio: 5xx e a linha fica liberada; o reenvio a assume, reusa a sessão e o total é o de um envio limpo', async () => {
    const c = resumo(17);
    const metade: typeof gravarPlano = async (db, ch, a) => {
      await gravarPlano(db, ch, { ...a, plano: { ...a.plano, ativos: a.plano.ativos.slice(0, 2), macs: [], fluxos: [], pendentes: a.plano.pendentes.slice(0, 1) } });
      throw new Error('falha forçada');
    };
    const sessoes = () => conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen1'`);
    const antes = await sessoes();
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...x: unknown[]) => { errs.push(x); };
    let r: Response;
    try { r = await handlerOtSensor(pedido(c), workerEnv(), createExecutionContext(), { gravarPlano: metade }); } finally { console.error = orig; }
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(errs).toHaveLength(1);
    const imp = await sha256Hex(c);
    const liberada = (await env.DB.prepare(`SELECT id, situacao, levantamento_id, atualizado_em < datetime('now', '-10 minutes') AS velho
      FROM ot_sensor_envios WHERE impressao = ?`).bind(imp).first<{ id: string; situacao: string; levantamento_id: string; velho: number }>())!;
    expect(liberada).toMatchObject({ situacao: 'processando', velho: 1 });
    expect(await daSessao(liberada.levantamento_id)).toEqual([2, 1]);
    expect(await sessoes()).toBe(antes + 1);
    const r2 = await enviar(c);
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ recebido: true, envio_id: liberada.id });
    const e = (await env.DB.prepare('SELECT situacao, levantamento_id, contagens FROM ot_sensor_envios WHERE impressao = ?').bind(imp).first<Record<string, string>>())!;
    expect(e).toMatchObject({ situacao: 'concluido', levantamento_id: liberada.levantamento_id });
    expect(JSON.parse(e.contagens)).toMatchObject({ ativos_novos: 2, fluxos_pendentes: 1, repetidos: 3 });
    expect(await sessoes()).toBe(antes + 1); // nenhuma sessão nova
    expect(await daSessao(liberada.levantamento_id)).toEqual([4, 2]);
  });

  it('★ dois envios simultâneos do mesmo corpo: um único conjunto de achados; 200 e 200 ou 503', async () => {
    const c = resumo(18);
    const sessoes = () => conta(`SELECT count(*) AS n FROM ot_levantamentos WHERE criado_por = 'sensor:sen2'`);
    const antes = await sessoes();
    const rs = await Promise.all([enviar(c, { k: cred(2) }), enviar(c, { k: cred(2) })]);
    const st = rs.map((r) => r.status).sort();
    expect(st[0]).toBe(200);
    expect([200, 503]).toContain(st[1]);
    const envios = await env.DB.prepare(`SELECT levantamento_id FROM ot_sensor_envios WHERE sensor_id = 'sen2' AND impressao = ?`).bind(await sha256Hex(c))
      .all<{ levantamento_id: string }>();
    expect(envios.results).toHaveLength(1);
    expect(await daSessao(envios.results[0].levantamento_id)).toEqual([4, 2]);
    expect(await sessoes()).toBe(antes + 1);
  });
});
