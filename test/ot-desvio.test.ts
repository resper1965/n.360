import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import { sha256Hex } from '../src/helpers';
import { handlerOtSensor } from '../src/routes/ot-sensor';
import { aadOt, chavesOt, decifrarOt, hmacOt } from '../src/services/ot-cifra';
import { aprovarLote } from '../src/services/ot-coleta';
import { detectarDesvios, reabrirVencidos } from '../src/services/ot-desvio';
import { enviarAoLote } from '../src/services/ot-levantamento';
import type { Plano } from '../src/services/ot-rede';
import { applySchema, workerEnv, seedTwoProjects, habilitarOt, designarConsultor, concederModulos, sessionFor } from './helpers/d1';

// n.ot desvio (Task 3): o que a sonda viu e não está aprovado. Envio real pela rota, D1 real; o fetch global responde o DoH e captura o webhook.
// Cada teste monta o seu cenário (site, sonda, inventário): nenhum depende da ordem.
const URL_ENVIO = 'https://n360.ness.com.br/ot-sensor/resumo';
const ch = chavesOt(workerEnv())!;
const entregas: Record<string, any>[] = [];
let geracao = 0;
let nCenario = 0;

const pedido = (corpo: string, cred: string) => new Request(URL_ENVIO, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred}`, 'CF-Connecting-IP': '203.0.113.5' }, body: corpo,
});
/** Roda `f` com um ExecutionContext e espera o waitUntil (a entrega do webhook); devolve o resultado e os POSTs feitos. */
async function comCtx<T>(f: (ctx: ExecutionContext) => Promise<T>) {
  const antes = entregas.length;
  const ctx = createExecutionContext();
  const r = await f(ctx);
  await waitOnExecutionContext(ctx);
  return { r, posts: entregas.slice(antes) };
}
const cx = (o: string, d: string, porta = 502) => ({ origem: o, destino: d, transporte: 'tcp', porta, aplicacao: 'modbus', contagem: 3,
  primeira_vez: '2026-11-01T00:00:00Z', ultima_vez: '2026-11-02T00:00:00Z' });
/** Cada chamada muda `gerado_em`: outra impressão, como o resumo do dia seguinte. */
const resumo = (ativos: unknown[], conexoes: unknown[]) => JSON.stringify({
  formato: 'n.ot-resumo-rede/1', gerado_em: `2026-11-04T${String(10 + Math.floor(geracao / 60)).padStart(2, '0')}:${String(geracao++ % 60).padStart(2, '0')}:00Z`,
  periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T00:00:00Z' }, ativos, conexoes,
});
/** Ativo novo (10.30.0.7), fluxo aprovado (1 → 2), fluxo fora do inventário (3 → 4) e pendência (1 → 9, a 9 não está no inventário). */
const R1 = () => resumo(
  [{ ip: '10.30.0.7', mac: '00:30:a7:00:00:07', fabricante: 'SEL', protocolos: ['modbus'], portas_servico: [502] }],
  [cx('10.30.0.1', '10.30.0.2'), cx('10.30.0.3', '10.30.0.4'), cx('10.30.0.1', '10.30.0.9')],
);
const trilhas = async (acao: string, projeto = 'proj-a') =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = ? AND project_id = ?`).bind(acao, projeto).first<{ n: number }>())!.n;

/** Site novo com sonda, zona, 4 ativos (10.30.0.1–4; 1 e 3 na zona "Nível 1") e o fluxo aprovado 1 → 2. */
async function cenario() {
  const k = ++nCenario;
  const site = `s${k}`, sensor = `sen${k}`, cred = 'ots_' + String(k).padStart(64, '0');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES (?, 'proj-a', ?, 'em_operacao')`).bind(site, `SE ${k}`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'proj-a', ?, 'Nível 1', 1)`).bind(`z${k}`, site),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES (?, 'proj-a', ?, ?, '203.0.113.0/24', 'teste')`)
      .bind(sensor, site, `SE ${sensor}`),
    env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES (?, ?, 'proj-a', ?, '2099-01-01T00:00:00.000Z')`)
      .bind(`c${k}`, sensor, await sha256Hex(cred)),
    ...await Promise.all([1, 2, 3, 4].map(async (i) => env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, zona_id, ip_hash, mac_hash)
      VALUES (?, 'proj-a', ?, ?, ?, ?, 'mh')`).bind(`${site}-inv-${i}`, site, `RTU-0${i}`, i % 2 ? `z${k}` : null, await hmacOt(ch, 'proj-a', `10.30.0.${i}`)))),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, destino_ativo_id, protocolo, porta) VALUES (?, 'proj-a', ?, ?, ?, 'modbus', 502)`)
      .bind(`${site}-f1`, site, `${site}-inv-1`, `${site}-inv-2`),
  ]);
  const enviar = async (corpo = R1()) => {
    const { r, posts } = await comCtx((ctx) => worker.fetch(pedido(corpo, cred), workerEnv(), ctx));
    expect(r.status).toBe(200);
    return posts;
  };
  const desvios = async () => (await env.DB.prepare(`SELECT * FROM ot_desvios WHERE site_id = ? ORDER BY tipo, dados`).bind(site).all<Record<string, any>>()).results;
  return { site, sensor, cred, enviar, desvios };
}

/** O corpo nunca tem IP, MAC, a cifra nem o hash deles. */
function semEndereco(posts: Record<string, any>[]) {
  for (const p of posts) {
    const t = JSON.stringify(p);
    expect(t).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(t).not.toMatch(/[0-9a-f]{2}(:[0-9a-f]{2}){5}/i);
    for (const k of ['ip', 'mac', 'ip_cifrado', 'mac_cifrado', 'ip_hash', 'mac_hash', 'origem_ip_hash', 'destino_ip_hash']) expect(t).not.toContain(`"${k}"`);
  }
}
/** D1 cujo `prepare` lança na leitura de zonas do corpo do webhook (as `vezes` primeiras; Infinity = sempre). */
function dbSemZonas(vezes = Infinity) {
  let n = 0;
  return new Proxy(env.DB, {
    get(t, k) {
      if (k === 'prepare') return (sql: string) => { if (sql.includes('FROM ot_zonas') && n++ < vezes) throw new Error('zonas indisponíveis'); return t.prepare(sql); };
      const v = (t as any)[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
async function semLog<T>(f: () => Promise<T>) {
  const errs: unknown[][] = [];
  const orig = console.error;
  console.error = (...x: unknown[]) => { errs.push(x); };
  try { return { r: await f(), errs }; } finally { console.error = orig; }
}

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-manual', 'proj-a', 'SE Manual'), ('s-carga', 'proj-a', 'SE Carga'),
      ('s-b', 'proj-b', 'SE B')`),
    env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret, status) VALUES ('w1', 'proj-a', 'https://soc.example/h', 'ot.desvio', 'seg', 'Active'),
      ('w2', 'proj-b', 'https://soc.example/b', 'ot.desvio', 'seg', 'Active')`),
  ]);
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.startsWith('https://cloudflare-dns.com/')) {
      const tipo = new URL(url).searchParams.get('type');
      return new Response(JSON.stringify({ Answer: tipo === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] }));
    }
    entregas.push(JSON.parse(String(init!.body)));
    return new Response(null, { status: 200 });
  }) as typeof fetch);
});

describe('detecção pelo envio da sonda', () => {
  it('fluxo fora do inventário, ativo novo e pendência abrem; fluxo aprovado não; um POST com os três, pontas por nome', async () => {
    const c = await cenario();
    const posts = await c.enviar();
    const ds = await c.desvios();
    expect(ds.map((d) => [d.tipo, d.situacao, d.ocorrencias, d.sensor_id])).toEqual([
      ['ativo', 'aberto', 1, c.sensor], ['fluxo', 'aberto', 1, c.sensor], ['fluxo', 'aberto', 1, c.sensor]]);
    // fluxo aprovado (1 → 2) não abre: os fluxos são o de 3 → 4 e a pendência 1 → 9
    const fluxos = ds.filter((d) => d.tipo === 'fluxo').map((d) => JSON.parse(d.dados));
    expect(fluxos.map((f) => f.origem_ativo_id ?? null).sort()).toEqual([null, `${c.site}-inv-3`]);
    expect(fluxos.find((f) => !f.origem_ativo_id)).toMatchObject({ origem_ip_hash: await hmacOt(ch, 'proj-a', '10.30.0.1'),
      destino_ip_hash: await hmacOt(ch, 'proj-a', '10.30.0.9') });
    const ativo = JSON.parse(ds[0].dados);
    expect(ativo.ip).toBeUndefined();
    expect(await decifrarOt(ativo.ip_cifrado, ch, aadOt('proj-a', 'ot_desvios', ds[0].id, 'ip'))).toBe('10.30.0.7');
    expect(await decifrarOt(ativo.mac_cifrado, ch, aadOt('proj-a', 'ot_desvios', ds[0].id, 'mac'))).toBe('00:30:a7:00:00:07');
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p).toMatchObject({ event: 'ot.desvio', evento: 'ot.desvio', projeto_id: 'proj-a', site: { id: c.site }, nao_listados: 0 });
    expect(p.desvios).toHaveLength(3);
    expect(p.desvios.every((d: any) => d.acao === 'aberto' && d.situacao === 'aberto' && d.link.endsWith(`/ot/desvios/${d.id}`))).toBe(true);
    const conhecido = p.desvios.find((d: any) => d.origem.ativo === 'RTU-03');
    expect(conhecido).toMatchObject({ tipo: 'fluxo', protocolo: 'modbus', porta: 502, externo: false, origem: { ativo: 'RTU-03', zona: 'Nível 1' },
      destino: { ativo: 'RTU-04', zona: null }, ocorrencias: 1 });
    // pendência: a ponta inventariada sai pelo nome (via ip_hash); a desconhecida, nula
    const pendente = p.desvios.find((d: any) => d.origem.ativo === 'RTU-01');
    expect(pendente).toMatchObject({ tipo: 'fluxo', origem: { ativo: 'RTU-01', zona: 'Nível 1' }, destino: { ativo: null, zona: null } });
    expect(p.desvios.find((d: any) => d.tipo === 'ativo')).toMatchObject({ origem: { ativo: null, zona: null }, protocolo: 'modbus', porta: 502 });
    semEndereco(posts);
    const t = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'ot.desvio.aberto' AND details LIKE ?`).bind(`% ${c.site}`).all();
    expect(t.results).toEqual([{ actor: `sensor:${c.sensor}`, details: `3 desvio(s) aberto(s) no site ${c.site}` }]);
  });

  it('site em_levantamento: o resumo não cria desvio (sem base aprovada não há o que comparar)', async () => {
    const c = await cenario();
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_levantamento' WHERE id = ?`).bind(c.site).run();
    await c.enviar();
    expect(await c.desvios()).toEqual([]);
  });
  it('site em_obra: o desvio é gravado e nenhum webhook sai; com a obra em aprovação também', async () => {
    const c = await cenario();
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_obra', obra_ate = '2099-01-01' WHERE id = ?`).bind(c.site).run();
    expect(await c.enviar()).toHaveLength(0);
    expect(await c.desvios()).toHaveLength(3);
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'base_em_aprovacao' WHERE id = ?`).bind(c.site).run();
    expect(await c.enviar()).toHaveLength(0);
    expect((await c.desvios()).every((d) => d.ocorrencias === 2)).toBe(true);
  });
  it('base_em_aprovacao sem obra: nada é calculado', async () => {
    const c = await cenario();
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'base_em_aprovacao' WHERE id = ?`).bind(c.site).run();
    expect(await c.enviar()).toHaveLength(0);
    expect(await c.desvios()).toEqual([]);
  });
  it('o mesmo resumo de novo: ocorrências 2 e nenhum webhook', async () => {
    const c = await cenario();
    await c.enviar();
    expect(await c.enviar()).toHaveLength(0);
    expect((await c.desvios()).map((d) => d.ocorrencias)).toEqual([2, 2, 2]);
  });

  it('tratado + reenvio: volta a aberto, com webhook reaberto e trilha', async () => {
    const c = await cenario();
    await c.enviar();
    const [ativo] = await c.desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'tratado', nota = 'ok' WHERE id = ?`).bind(ativo.id).run();
    const posts = await c.enviar();
    expect((await c.desvios())[0]).toMatchObject({ situacao: 'aberto', ocorrencias: 2 });
    expect(posts.map((p) => p.desvios.map((d: any) => [d.id, d.acao, d.situacao]))).toEqual([[[ativo.id, 'reaberto', 'aberto']]]);
    semEndereco(posts);
    expect(await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.desvio.reaberto' AND details LIKE ?`).bind(`% ${c.site}`).first())
      .toEqual({ details: `1 desvio(s) reaberto(s) no site ${c.site}` });
  });

  it('regularizado cujo item reaparece (saiu do inventário): volta a aberto, com webhook reaberto', async () => {
    const c = await cenario();
    await c.enviar();
    const fluxo = (await c.desvios())[1];
    // regularizado antes do envio (a guarda compara updated_at com o instante do plano)
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'regularizado', updated_at = datetime('now', '-1 minute') WHERE id = ?`).bind(fluxo.id).run();
    const posts = await c.enviar();
    expect((await c.desvios())[1]).toMatchObject({ id: fluxo.id, situacao: 'aberto' });
    expect(posts.map((p) => p.desvios.map((d: any) => [d.id, d.acao]))).toEqual([[[fluxo.id, 'reaberto']]]);
  });

  it('regularizado depois de o plano ser calculado: o plano velho não o reabre', async () => {
    const c = await cenario();
    await c.enviar();
    const fluxo = (await c.desvios())[1];
    const doPlano = new Date(Date.now() - 60_000); // plano calculado um minuto antes da regularização
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'regularizado', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(fluxo.id).run();
    const plano: Plano = { ativos: [], macs: [], fluxos: [], contagem: {} as Plano['contagem'],
      pendentes: [{ chave: fluxo.chave_sensor, origem_ip_hash: null, destino_ip_hash: null, dados: { protocolo: 'modbus', porta: 502 } }] };
    const { r, posts } = await comCtx((ctx) => detectarDesvios(workerEnv(), ctx, { projectId: 'proj-a', siteId: c.site, sensorId: c.sensor, plano, agora: doPlano }));
    expect(r).toEqual({ abertos: 0, reabertos: 0, atualizados: 0 });
    expect(posts).toHaveLength(0);
    expect((await c.desvios())[1]).toMatchObject({ id: fluxo.id, situacao: 'regularizado' });
  });

  it('aceito com prazo futuro + reenvio: só atualiza, sem webhook', async () => {
    const c = await cenario();
    await c.enviar();
    const [ativo] = await c.desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'aceito', aceito_ate = '2099-01-01T00:00:00.000Z' WHERE id = ?`).bind(ativo.id).run();
    expect(await c.enviar()).toHaveLength(0);
    expect((await c.desvios())[0]).toMatchObject({ situacao: 'aceito', ocorrencias: 2 });
  });

  it('aceito vencido + reenvio: aberto, com a mesma ação do cron (aceite_vencido) e a trilha dela', async () => {
    const c = await cenario();
    await c.enviar();
    const [ativo] = await c.desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'aceito', aceito_ate = '2026-01-01T00:00:00.000Z' WHERE id = ?`).bind(ativo.id).run();
    const posts = await c.enviar();
    expect((await c.desvios())[0]).toMatchObject({ situacao: 'aberto', aceito_ate: null });
    expect(posts.map((p) => p.desvios.map((d: any) => [d.id, d.acao, d.situacao]))).toEqual([[[ativo.id, 'aceite_vencido', 'aberto']]]);
    expect(await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'ot.desvio.aceite_vencido' AND details LIKE ?`).bind(`% ${c.site}`).first())
      .toEqual({ actor: `sensor:${c.sensor}` });
  });

  it('aceito vencido + reabrirVencidos: aberto, com webhook aceite_vencido', async () => {
    const c = await cenario();
    await c.enviar();
    const [ativo] = await c.desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'aceito', aceito_ate = '2026-01-01T00:00:00.000Z' WHERE id = ?`).bind(ativo.id).run();
    const antes = await trilhas('ot.desvio.aceite_vencido');
    const { r, posts } = await comCtx((ctx) => reabrirVencidos(workerEnv(), ctx, new Date()));
    expect(r).toBe(1);
    expect((await c.desvios())[0]).toMatchObject({ situacao: 'aberto', aceito_ate: null });
    expect(posts.map((p) => p.desvios.map((d: any) => [d.id, d.acao]))).toEqual([[[ativo.id, 'aceite_vencido']]]);
    expect(await trilhas('ot.desvio.aceite_vencido')).toBe(antes + 1);
  });

  it('aprovar no lote o achado do desvio: regularizado, com webhook fechado; o reenvio não o reabre', async () => {
    const c = await cenario();
    await c.enviar();
    const [ativo] = await c.desvios();
    const achado = (await env.DB.prepare(`SELECT id, levantamento_id FROM ot_achados WHERE chave_sensor = ?`).bind(ativo.chave_sensor).first<{ id: string; levantamento_id: string }>())!;
    const lote = await enviarAoLote(env.DB, ch, { id: 'u-cria' }, 'proj-a', { id: achado.levantamento_id, site_id: c.site }, [achado.id]);
    expect(lote.ok).toBe(true);
    const antes = await trilhas('ot.desvio.regularizado');
    const { r, posts } = await comCtx((ctx) => aprovarLote(env.DB, ch, { id: 'u-aprova', email: 'g@cliente.teste' }, 'proj-a', JSON.stringify([c.site]),
      (lote as { id: string }).id, { env: workerEnv(), ctx }));
    expect(r).toMatchObject({ ok: true, criados: 1 });
    expect((await c.desvios())[0].situacao).toBe('regularizado');
    expect(posts.map((p) => p.desvios.map((d: any) => [d.id, d.acao, d.situacao]))).toEqual([[[ativo.id, 'fechado', 'regularizado']]]);
    semEndereco(posts);
    expect(await trilhas('ot.desvio.regularizado')).toBe(antes + 1);
    await c.enviar(); // o ativo agora está no inventário: sai do plano
    expect((await c.desvios())[0].situacao).toBe('regularizado');
  });

  it('250 desvios num envio: 200 listados e nao_listados 50', async () => {
    const plano: Plano = { ativos: [], macs: [], fluxos: [], contagem: {} as Plano['contagem'],
      pendentes: Array.from({ length: 250 }, (_, i) => ({ chave: `k-${i}`, origem_ip_hash: null, destino_ip_hash: null,
        dados: { protocolo: 'modbus', porta: i, direcao: 'unidirecional', externo: true } })) };
    const { r, posts } = await comCtx((ctx) => detectarDesvios(workerEnv(), ctx, { projectId: 'proj-a', siteId: 's-carga', sensorId: 'sen-x', plano, agora: new Date() }));
    expect(r).toEqual({ abertos: 250, reabertos: 0, atualizados: 0 });
    expect(posts).toHaveLength(1);
    expect(posts[0].desvios).toHaveLength(200);
    expect(posts[0].nao_listados).toBe(50);
    expect(posts[0].desvios[0]).toMatchObject({ tipo: 'fluxo', externo: true, origem: { ativo: null, zona: null } });
    semEndereco(posts);
  });

  it('detectarDesvios que lança: o envio da sonda ainda devolve 200 e o erro vai ao log', async () => {
    const c = await cenario();
    const { r, errs } = await semLog(() => handlerOtSensor(pedido(R1(), c.cred), workerEnv(), createExecutionContext(),
      { detectarDesvios: async () => { throw new Error('falha forçada'); } }));
    expect(r.status).toBe(200);
    expect(errs.map((e) => e[0])).toEqual(['ot.desvio']);
  });
});

describe('falha ao montar o aviso', () => {
  it('corpoWebhook que lança: o estado e a trilha ficam, o erro vai ao log e nenhum POST sai', async () => {
    const c = await cenario();
    const e = { ...workerEnv(), DB: dbSemZonas() };
    const plano: Plano = { ativos: [], macs: [], fluxos: [], contagem: {} as Plano['contagem'],
      pendentes: [{ chave: `k-falha-${c.site}`, origem_ip_hash: null, destino_ip_hash: null, dados: { protocolo: 'modbus', porta: 1, externo: true } }] };
    const { r: { r, posts }, errs } = await semLog(() => comCtx((ctx) => detectarDesvios(e, ctx, { projectId: 'proj-a', siteId: c.site, sensorId: c.sensor, plano,
      agora: new Date() })));
    expect(r.abertos).toBe(1);
    expect(posts).toHaveLength(0);
    expect(errs.map((x) => x[0])).toEqual(['ot.desvio']);
    expect((await c.desvios()).map((d) => d.situacao)).toEqual(['aberto']);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.desvio.aberto' AND details LIKE ?`).bind(`% ${c.site}`).first())
      .toEqual({ n: 1 });
  });

  it('segundo bloco do batch falha: o primeiro, já gravado, tem trilha e webhook; o erro sobe', async () => {
    const c = await cenario();
    let n = 0;
    const db = new Proxy(env.DB, {
      get(t, k) {
        if (k === 'batch') return (s: D1PreparedStatement[]) => { if (++n === 2) throw new Error('batch indisponível'); return t.batch(s); };
        const v = (t as any)[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const plano: Plano = { ativos: [], macs: [], fluxos: [], contagem: {} as Plano['contagem'],
      pendentes: Array.from({ length: 60 }, (_, i) => ({ chave: `k-bloco-${c.site}-${i}`, origem_ip_hash: null, destino_ip_hash: null, dados: { protocolo: 'modbus', porta: i } })) };
    const antes = entregas.length;
    const ctx = createExecutionContext();
    await expect(detectarDesvios({ ...workerEnv(), DB: db }, ctx, { projectId: 'proj-a', siteId: c.site, sensorId: c.sensor, plano, agora: new Date() }))
      .rejects.toThrow('batch indisponível');
    await waitOnExecutionContext(ctx);
    expect(await c.desvios()).toHaveLength(50);
    expect(await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.desvio.aberto' AND details LIKE ?`).bind(`% ${c.site}`).first())
      .toEqual({ details: `50 desvio(s) aberto(s) no site ${c.site}` });
    const posts = entregas.slice(antes);
    expect(posts).toHaveLength(1);
    expect(posts[0].desvios).toHaveLength(50);
  });

  it('reabrirVencidos com dois projetos e o aviso do primeiro falhando: os dois reabrem e têm trilha; o segundo é avisado', async () => {
    const c = await cenario();
    await env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, situacao, aceito_ate, primeira_vez, ultima_vez) VALUES
      ('dv-a', 'proj-a', ?, 'fluxo', 'k-va', 'aceito', '2026-01-01', '2026-01-01', '2026-01-01'),
      ('dv-b', 'proj-b', 's-b', 'fluxo', 'k-vb', 'aceito', '2026-01-01', '2026-01-01', '2026-01-01')`).bind(c.site).run();
    const antes = [await trilhas('ot.desvio.aceite_vencido'), await trilhas('ot.desvio.aceite_vencido', 'proj-b')];
    const { r: { r, posts }, errs } = await semLog(() => comCtx((ctx) => reabrirVencidos({ ...workerEnv(), DB: dbSemZonas(1) }, ctx, new Date())));
    expect(r).toBe(2);
    expect((await env.DB.prepare(`SELECT situacao FROM ot_desvios WHERE id IN ('dv-a', 'dv-b')`).all()).results).toEqual([{ situacao: 'aberto' }, { situacao: 'aberto' }]);
    expect([await trilhas('ot.desvio.aceite_vencido'), await trilhas('ot.desvio.aceite_vencido', 'proj-b')]).toEqual([antes[0] + 1, antes[1] + 1]);
    expect(errs.map((x) => x[0])).toEqual(['ot.desvio']);
    expect(posts).toHaveLength(1);
    expect(['dv-a', 'dv-b']).toContain(posts[0].desvios[0].id);
  });
});

describe('importação manual', () => {
  it('o resumo importado em …/depara/rede não gera desvio', async () => {
    await designarConsultor('cons-d@ness.lat', 'proj-a');
    await concederModulos(['cons:cons-d@ness.lat'], ['ot']);
    const h = await sessionFor({ id: 'cons:cons-d@ness.lat', email: 'cons-d@ness.lat', role: 'consultor' });
    await env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, criado_por)
      VALUES ('lev-m', 'proj-a', 's-manual', 'documento', '2026-11-04', 'Manual', 'cons:cons-d@ness.lat')`).run();
    const fd = new FormData();
    fd.set('file', new File([resumo([{ ip: '10.40.0.1', mac: '00:30:a7:00:40:01', protocolos: [], portas_servico: [] }], [cx('10.40.0.1', '10.40.0.2')])], 'r.json'));
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/proj-a/ot/levantamentos/lev-m/depara/rede', { method: 'POST', headers: h, body: fd }),
      workerEnv(), createExecutionContext());
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_desvios WHERE site_id = 's-manual'`).first()).toEqual({ n: 0 });
  });
});
