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
const URL_ENVIO = 'https://n360.ness.com.br/ot-sensor/resumo';
const CRED = 'ots_' + '1'.padStart(64, '0');
const ch = chavesOt(workerEnv())!;
const entregas: Record<string, any>[] = [];
let geracao = 0;

const pedido = (corpo: string) => new Request(URL_ENVIO, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CRED}`, 'CF-Connecting-IP': '203.0.113.5' }, body: corpo,
});
/** Envia e espera o waitUntil (a entrega do webhook); devolve o status e os POSTs feitos neste envio. */
async function enviar(corpo: string) {
  const antes = entregas.length;
  const ctx = createExecutionContext();
  const r = await worker.fetch(pedido(corpo), workerEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return { status: r.status, posts: entregas.slice(antes) };
}
const cx = (o: string, d: string, porta = 502) => ({ origem: o, destino: d, transporte: 'tcp', porta, aplicacao: 'modbus', contagem: 3,
  primeira_vez: '2026-11-01T00:00:00Z', ultima_vez: '2026-11-02T00:00:00Z' });
/** Cada chamada muda `gerado_em`: outra impressão, como o resumo do dia seguinte. */
const resumo = (ativos: unknown[], conexoes: unknown[]) => JSON.stringify({
  formato: 'n.ot-resumo-rede/1', gerado_em: `2026-11-04T12:${String(geracao++).padStart(2, '0')}:00Z`,
  periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T00:00:00Z' }, ativos, conexoes,
});
const R1 = () => resumo(
  [{ ip: '10.30.0.7', mac: '00:30:a7:00:00:07', fabricante: 'SEL', protocolos: ['modbus'], portas_servico: [502] }],
  [cx('10.30.0.1', '10.30.0.2'), cx('10.30.0.3', '10.30.0.4'), cx('10.30.0.1', '10.30.0.9')],
);
const desvios = async () => (await env.DB.prepare(`SELECT * FROM ot_desvios WHERE project_id = 'proj-a' AND site_id = 's1' ORDER BY tipo, dados`)
  .all<Record<string, any>>()).results;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE Norte'), ('s2', 'proj-a', 'SE Sul'), ('s9', 'proj-a', 'SE Carga')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Nível 1', 1)`),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sen1', 'proj-a', 's1', 'SE sen1', '203.0.113.0/24', 'teste')`),
    env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('c1', 'sen1', 'proj-a', ?, '2099-01-01T00:00:00.000Z')`)
      .bind(await sha256Hex(CRED)),
    env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret, status) VALUES ('w1', 'proj-a', 'https://soc.example/h', 'ot.desvio', 'seg', 'Active')`),
    ...await Promise.all([1, 2, 3, 4].map(async (i) => env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, zona_id, ip_hash, mac_hash)
      VALUES (?, 'proj-a', 's1', ?, ?, ?, 'mh')`).bind(`inv-${i}`, `RTU-0${i}`, i === 3 ? 'z1' : null, await hmacOt(ch, 'proj-a', `10.30.0.${i}`)))),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, destino_ativo_id, protocolo, porta) VALUES ('f1', 'proj-a', 's1', 'inv-1', 'inv-2', 'modbus', 502)`),
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
  it('fluxo fora do inventário, ativo novo e ponta desconhecida abrem; fluxo aprovado não; um POST com os três', async () => {
    const { status, posts } = await enviar(R1());
    expect(status).toBe(200);
    const ds = await desvios();
    expect(ds.map((d) => [d.tipo, d.situacao, d.ocorrencias, d.sensor_id])).toEqual([
      ['ativo', 'aberto', 1, 'sen1'], ['fluxo', 'aberto', 1, 'sen1'], ['fluxo', 'aberto', 1, 'sen1']]);
    // fluxo aprovado (inv-1 → inv-2) não abre: os fluxos são o de inv-3 → inv-4 e o pendente para 10.30.0.9
    const fluxos = ds.filter((d) => d.tipo === 'fluxo').map((d) => JSON.parse(d.dados));
    expect(fluxos.map((f) => f.origem_ativo_id ?? null).sort()).toEqual(['inv-3', null]);
    const ativo = JSON.parse(ds[0].dados);
    expect(ativo.ip).toBeUndefined();
    expect(await decifrarOt(ativo.ip_cifrado, ch, aadOt('proj-a', 'ot_desvios', ds[0].id, 'ip'))).toBe('10.30.0.7');
    expect(await decifrarOt(ativo.mac_cifrado, ch, aadOt('proj-a', 'ot_desvios', ds[0].id, 'mac'))).toBe('00:30:a7:00:00:07');
    expect(posts).toHaveLength(1);
    const c = posts[0];
    expect(c).toMatchObject({ event: 'ot.desvio', evento: 'ot.desvio', projeto_id: 'proj-a', site: { id: 's1', nome: 'SE Norte' }, nao_listados: 0 });
    expect(c.desvios).toHaveLength(3);
    expect(c.desvios.every((d: any) => d.acao === 'aberto' && d.situacao === 'aberto' && d.link.endsWith(`/ot/desvios/${d.id}`))).toBe(true);
    const conhecido = c.desvios.find((d: any) => d.origem.ativo === 'RTU-03');
    expect(conhecido).toMatchObject({ tipo: 'fluxo', protocolo: 'modbus', porta: 502, externo: false, origem: { ativo: 'RTU-03', zona: 'Nível 1' },
      destino: { ativo: 'RTU-04', zona: null }, ocorrencias: 1 });
    const pendente = c.desvios.find((d: any) => d.tipo === 'fluxo' && d !== conhecido);
    expect(pendente).toMatchObject({ origem: { ativo: null, zona: null }, destino: { ativo: null, zona: null } });
    const trilha = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'ot.desvio.aberto'`).all<Record<string, string>>();
    expect(trilha.results).toEqual([{ actor: 'sensor:sen1', details: '3 desvio(s) aberto(s) no site s1' }]);
  });

  it('o mesmo resumo de novo: ocorrências 2 e nenhum webhook', async () => {
    const { status, posts } = await enviar(R1());
    expect(status).toBe(200);
    expect((await desvios()).map((d) => d.ocorrencias)).toEqual([2, 2, 2]);
    expect(posts).toHaveLength(0);
  });

  it('tratado + reenvio: volta a aberto, com webhook reaberto e trilha', async () => {
    const [ativo] = await desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'tratado', nota = 'ok' WHERE id = ?`).bind(ativo.id).run();
    const { posts } = await enviar(R1());
    expect((await desvios())[0]).toMatchObject({ situacao: 'aberto', ocorrencias: 3 });
    expect(posts).toHaveLength(1);
    expect(posts[0].desvios.map((d: any) => [d.id, d.acao, d.situacao])).toEqual([[ativo.id, 'reaberto', 'aberto']]);
    expect(await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.desvio.reaberto'`).first()).toEqual({ details: '1 desvio(s) reaberto(s) no site s1' });
  });

  it('aceito com prazo futuro + reenvio: só atualiza, sem webhook', async () => {
    const [ativo] = await desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET situacao = 'aceito', aceito_ate = '2099-01-01T00:00:00.000Z' WHERE id = ?`).bind(ativo.id).run();
    const { posts } = await enviar(R1());
    expect((await desvios())[0]).toMatchObject({ situacao: 'aceito', ocorrencias: 4 });
    expect(posts).toHaveLength(0);
  });

  it('aceito vencido + reabrirVencidos: aberto, com webhook aceite_vencido', async () => {
    const [ativo] = await desvios();
    await env.DB.prepare(`UPDATE ot_desvios SET aceito_ate = '2026-01-01T00:00:00.000Z' WHERE id = ?`).bind(ativo.id).run();
    const antes = entregas.length;
    const ctx = createExecutionContext();
    expect(await reabrirVencidos(workerEnv(), ctx, new Date())).toBe(1);
    await waitOnExecutionContext(ctx);
    expect((await desvios())[0]).toMatchObject({ situacao: 'aberto', aceito_ate: null });
    expect(entregas.slice(antes).map((p) => p.desvios.map((d: any) => [d.id, d.acao]))).toEqual([[[ativo.id, 'aceite_vencido']]]);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.desvio.aceite_vencido'`).first()).toEqual({ n: 1 });
  });

  it('aprovar no lote o achado do desvio: regularizado, com webhook fechado; o reenvio não o reabre', async () => {
    const [ativo] = await desvios();
    const achado = (await env.DB.prepare(`SELECT id, levantamento_id FROM ot_achados WHERE chave_sensor = ?`).bind(ativo.chave_sensor).first<{ id: string; levantamento_id: string }>())!;
    const lote = await enviarAoLote(env.DB, ch, { id: 'u-cria' }, 'proj-a', { id: achado.levantamento_id, site_id: 's1' }, [achado.id]);
    expect(lote.ok).toBe(true);
    const antes = entregas.length;
    const ctx = createExecutionContext();
    const r = await aprovarLote(env.DB, ch, { id: 'u-aprova', email: 'g@cliente.teste' }, 'proj-a', JSON.stringify(['s1']), (lote as { id: string }).id,
      { env: workerEnv(), ctx });
    await waitOnExecutionContext(ctx);
    expect(r).toMatchObject({ ok: true, criados: 1 });
    expect((await desvios())[0].situacao).toBe('regularizado');
    expect(entregas.slice(antes).map((p) => p.desvios.map((d: any) => [d.id, d.acao, d.situacao]))).toEqual([[[ativo.id, 'fechado', 'regularizado']]]);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'ot.desvio.regularizado'`).first()).toEqual({ n: 1 });
    await enviar(R1()); // o ativo agora está no inventário: sai do plano
    expect((await desvios())[0].situacao).toBe('regularizado');
  });

  it('★ o corpo de nenhum webhook tem IP, MAC nem os campos deles', () => {
    expect(entregas.length).toBeGreaterThan(0);
    for (const p of entregas) {
      const t = JSON.stringify(p);
      expect(t).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(t).not.toMatch(/[0-9a-f]{2}(:[0-9a-f]{2}){5}/i);
      for (const k of ['ip', 'mac', 'ip_cifrado', 'mac_cifrado']) expect(t).not.toContain(`"${k}"`);
    }
  });

  it('250 desvios num envio: 200 listados e nao_listados 50', async () => {
    const plano: Plano = { ativos: [], macs: [], fluxos: [], contagem: {} as Plano['contagem'],
      pendentes: Array.from({ length: 250 }, (_, i) => ({ chave: `k-${i}`, origem_ip_hash: null, destino_ip_hash: null,
        dados: { protocolo: 'modbus', porta: i, direcao: 'unidirecional', externo: true } })) };
    const antes = entregas.length;
    const ctx = createExecutionContext();
    expect(await detectarDesvios(workerEnv(), ctx, { projectId: 'proj-a', siteId: 's9', sensorId: 'sen1', plano, agora: new Date() }))
      .toEqual({ abertos: 250, reabertos: 0, atualizados: 0 });
    await waitOnExecutionContext(ctx);
    const posts = entregas.slice(antes);
    expect(posts).toHaveLength(1);
    expect(posts[0].desvios).toHaveLength(200);
    expect(posts[0].nao_listados).toBe(50);
    expect(posts[0].desvios[0]).toMatchObject({ tipo: 'fluxo', externo: true, origem: { ativo: null, zona: null } });
  });

  it('detectarDesvios que lança: o envio da sonda ainda devolve 200 e o erro vai ao log', async () => {
    const errs: unknown[][] = [];
    const orig = console.error;
    console.error = (...x: unknown[]) => { errs.push(x); };
    let r: Response;
    try {
      r = await handlerOtSensor(pedido(R1()), workerEnv(), createExecutionContext(), { detectarDesvios: async () => { throw new Error('falha forçada'); } });
    } finally { console.error = orig; }
    expect(r.status).toBe(200);
    expect(errs.map((e) => e[0])).toEqual(['ot.desvio']);
  });
});

describe('importação manual', () => {
  it('o resumo importado em …/depara/rede não gera desvio', async () => {
    await designarConsultor('cons-d@ness.lat', 'proj-a');
    await concederModulos(['cons:cons-d@ness.lat'], ['ot']);
    const h = await sessionFor({ id: 'cons:cons-d@ness.lat', email: 'cons-d@ness.lat', role: 'consultor' });
    await env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, criado_por)
      VALUES ('lev-m', 'proj-a', 's2', 'documento', '2026-11-04', 'Manual', 'cons:cons-d@ness.lat')`).run();
    const fd = new FormData();
    fd.set('file', new File([resumo([{ ip: '10.40.0.1', mac: '00:30:a7:00:40:01', protocolos: [], portas_servico: [] }], [cx('10.40.0.1', '10.40.0.2')])], 'r.json'));
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/proj-a/ot/levantamentos/lev-m/depara/rede', { method: 'POST', headers: h, body: fd }),
      workerEnv(), createExecutionContext());
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM ot_desvios WHERE site_id = 's2'`).first()).toEqual({ n: 0 });
  });
});
