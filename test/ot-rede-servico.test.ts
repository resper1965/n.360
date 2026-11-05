import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { chavesOt, hmacOt } from '../src/services/ot-cifra';
import { chaveAtivo, EVIDENCIA_SENSOR, filtrarNovidade, planejarResumo, resumoRedeSchema, type Plano } from '../src/services/ot-rede';
import { applySchema, seedTwoProjects, workerEnv } from './helpers/d1';
// saída real do scripts/n-ot-resumo-zeek.py sobre scripts/fixtures-zeek; o teste Python garante que continua igual à do script
import esperado from '../scripts/fixtures-zeek/resumo-esperado.json';

// n.ot L3: validação do resumo do sensor de rede e montagem de achados e pendências. D1 real.
const chaves = chavesOt(workerEnv())!;
const PJ = 'proj-a';
const base = { formato: 'n.ot-resumo-rede/1', gerado_em: '2026-11-04T12:00:00Z', periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T23:59:59Z' } };
const at = (ip: string, extra: Record<string, unknown> = {}) => ({ ip, protocolos: [], portas_servico: [], ...extra });
const cx = (origem: string, destino: string, porta: number, aplicacao: string | null, transporte = 'tcp') =>
  ({ origem, destino, transporte, porta, aplicacao, contagem: 3, primeira_vez: '2026-11-01T00:00:00Z', ultima_vez: '2026-11-02T00:00:00Z' });
const resumo = (ativos: unknown[], conexoes: unknown[]) => resumoRedeSchema.parse({ ...base, ativos, conexoes });

beforeAll(async () => {
  await applySchema(); await seedTwoProjects();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', ?, 'SE 1')`).bind(PJ),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_hash) VALUES ('a-rtu', ?, 's1', 'RTU 1', ?)`).bind(PJ, await hmacOt(chaves, PJ, '10.1.1.10')),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_hash, mac_hash) VALUES ('a-ihm', ?, 's1', 'IHM', ?, 'mh')`).bind(PJ, await hmacOt(chaves, PJ, '10.1.1.20')),
  ]);
});

describe('resumoRedeSchema', () => {
  const ok = { ...base, ativos: [at('10.1.1.10', { mac: '00:30:a7:01:02:03', fabricante: 'SEL', protocolos: ['dnp3'], portas_servico: [20000] })],
    conexoes: [cx('10.1.1.20', '10.1.1.10', 20000, 'dnp3')] };
  it('aceita o formato da spec', () => expect(resumoRedeSchema.safeParse(ok).success).toBe(true));
  it('aceita a saída do script sobre as fixtures (contrato entre o script e o importador)', () => {
    const r = resumoRedeSchema.safeParse(esperado);
    expect(r.error?.issues).toBeUndefined();
    expect(r.data!.ativos.length).toBeGreaterThan(0);
    expect(r.data!.conexoes.length).toBeGreaterThan(0);
  });
  it.each([
    ['campo desconhecido', { ...ok, extra: 1 }],
    ['formato diferente', { ...ok, formato: 'outro/1' }],
    ['IP inválido', { ...ok, ativos: [at('999.1.1.1')] }],
    ['aplicação fora da lista', { ...ok, conexoes: [cx('10.1.1.20', '10.1.1.10', 20000, 'iec61850x')] }],
    ['fabricante com e-mail', { ...ok, ativos: [at('10.1.1.10', { fabricante: 'ana@x.com' })] }],
    ['mais de 5.000 ativos', { ...ok, ativos: Array.from({ length: 5001 }, (_, i) => at(`10.0.${i >> 8}.${i & 255}`)) }],
  ])('recusa %s', (_, r) => expect(resumoRedeSchema.safeParse(r).success).toBe(false));
});

describe('planejarResumo', () => {
  const site = { id: 's1', faixas: [] as string[] };
  it('ativos: novo interno, MAC que completa, externo nunca', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([
      at('10.1.1.30', { mac: '00:30:a7:01:02:04', fabricante: 'SEL', protocolos: ['dnp3'], portas_servico: [20000] }),
      at('10.1.1.10', { mac: '00-30-A7-01-02-03' }),
      at('10.1.1.20', { mac: '00:30:a7:01:02:05' }),
      at('8.8.8.8', { protocolos: ['dns'] }),
      at('10.1.1.10', { mac: '00:30:a7:01:02:03' }), // conhecido repetido: conta uma vez
    ], []));
    expect(p.ativos.map((a) => a.dados)).toEqual([{ ip: '10.1.1.30', nome: 'SEL (dnp3) #1', mac: '00:30:a7:01:02:04', fabricante: 'SEL', protocolos_portas: [{ protocolo: 'dnp3', porta: 20000 }] }]);
    expect(p.macs.map((m) => m.dados)).toEqual([{ ip: '10.1.1.10', mac: '00:30:a7:01:02:03', nome: 'RTU 1' }]);
    expect(p.contagem).toMatchObject({ ativos_novos: 1, ativos_conhecidos: 2, macs_completados: 1 });
  });

  it('ativos novos: nome gerado sem IP, numerado na ordem; mesmo IP escrito de dois jeitos vira um', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([
      at('fd00::1', { protocolos: ['modbus'], mac: '00:30:a7:00:00:01' }), at('fd00:0:0::1'), at('10.1.1.50'), at('10.1.1.51', { fabricante: 'ABB' })],
    [cx('10.1.1.50', '10.1.1.10', 502, null), cx('10.1.1.51', '10.1.1.10', 502, null)]));
    expect(p.ativos.map((a) => a.dados.nome)).toEqual(['Dispositivo (modbus) #1', 'Dispositivo (rede) #2', 'ABB (rede) #3']);
    expect(p.ativos.map((a) => a.dados.ip)).toEqual(['fd00::1', '10.1.1.50', '10.1.1.51']);
    expect(p.contagem.ativos_novos).toBe(3);
  });

  it('ativo com mais de 100 portas: só as 100 primeiras, na ordem do resumo', async () => {
    const portas = Array.from({ length: 150 }, (_, i) => 1000 + i);
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([at('10.1.1.40', { protocolos: ['modbus'], portas_servico: portas, mac: '00:30:a7:00:00:40' })], []));
    expect(p.ativos[0].dados.protocolos_portas).toEqual(portas.slice(0, 100).map((porta) => ({ protocolo: 'modbus', porta })));
  });

  it('multicast, broadcast e não especificado: nem ativo, nem fluxo, nem pendência; ativo novo sem MAC só se originou conexão', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo(
      [at('10.1.1.60'), at('10.1.1.255'), at('10.1.1.61'), at('224.0.0.251'), at('0.0.0.0', { mac: '00:30:a7:00:00:60' }), at('ff02::fb'), at('127.0.0.1'),
        at('169.254.7.7', { mac: '00:30:a7:00:00:77' })], // APIPA é interna
      [cx('10.1.1.60', '10.1.1.255', 47808, null, 'udp'), // broadcast da sub-rede: só como destino, não vira ativo
        cx('10.1.1.61', '224.0.0.251', 5353, 'dns', 'udp'), cx('10.1.1.20', '239.255.255.250', 1900, null, 'udp'),
        cx('0.0.0.0', '255.255.255.255', 67, null, 'udp'), cx('10.1.1.20', '255.255.255.255', 47808, 'bacnet', 'udp'),
        cx('fe80::1', 'ff02::fb', 5353, 'dns', 'udp'), cx('::', 'fe80::2', 547, null, 'udp'), cx('10.1.1.20', '127.0.0.1', 80, 'http')]));
    expect(p.ativos.map((a) => a.dados.ip)).toEqual(['10.1.1.60', '169.254.7.7']);
    expect(p.fluxos).toEqual([]);
    expect(p.pendentes.map((x) => [x.origem_ip_hash, x.destino_ip_hash])).toEqual([[await hmacOt(chaves, PJ, '10.1.1.60'), await hmacOt(chaves, PJ, '10.1.1.255')]]);
  });

  it('outstation que só responde (TCP 502, sem MAC) vira ativo novo; broadcast que só recebe UDP sem aplicação não', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([at('10.1.1.70'), at('10.1.1.255')],
      [cx('10.1.1.20', '10.1.1.70', 502, null), cx('10.1.1.20', '10.1.1.255', 137, null, 'udp')]));
    expect(p.ativos.map((a) => a.dados.ip)).toEqual(['10.1.1.70']);
  });

  it('pendente com lado externo: hash nulo desse lado, nunca o HMAC do IP externo', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([], [cx('203.0.113.5', '10.1.1.30', 502, 'modbus'), cx('10.1.1.30', '198.51.100.9', 443, 'https')]));
    expect(p.pendentes).toEqual([
      { chave: expect.any(String), origem_ip_hash: null, destino_ip_hash: await hmacOt(chaves, PJ, '10.1.1.30'), dados: { protocolo: 'modbus', porta: 502, direcao: 'unidirecional', externo: true } },
      { chave: expect.any(String), origem_ip_hash: await hmacOt(chaves, PJ, '10.1.1.30'), destino_ip_hash: null, dados: { protocolo: 'https', porta: 443, direcao: 'unidirecional', externo: true } },
    ]);
    const s = JSON.stringify(p.pendentes);
    for (const ext of ['203.0.113.5', '198.51.100.9']) expect(s).not.toContain(await hmacOt(chaves, PJ, ext));
  });

  it('fluxos: pontas resolvidas, externo, pendente só com hash, faixa interna do site, duplicata', async () => {
    const r = resumo([], [
      cx('10.1.1.20', '10.1.1.10', 20000, 'dnp3'),
      cx('10.1.1.20', '10.1.1.10', 20000, 'dnp3', 'udp'),
      cx('10.1.1.20', '203.0.113.5', 443, 'https'),
      cx('10.1.1.30', '10.1.1.10', 502, null),
      cx('200.10.0.7', '10.1.1.10', 502, 'modbus'),
      cx('8.8.8.8', '1.1.1.1', 53, 'dns', 'udp'),
    ]);
    const p = await planejarResumo(env.DB, chaves, PJ, site, r);
    expect(p.fluxos.map((f) => f.dados)).toEqual([
      { origem_ativo_id: 'a-ihm', destino_ativo_id: 'a-rtu', protocolo: 'dnp3', porta: 20000, direcao: 'unidirecional' },
      { origem_ativo_id: 'a-ihm', protocolo: 'https', porta: 443, direcao: 'unidirecional', externo: true },
      { destino_ativo_id: 'a-rtu', protocolo: 'modbus', porta: 502, direcao: 'unidirecional', externo: true },
    ]);
    expect(p.pendentes).toEqual([{ chave: expect.any(String), origem_ip_hash: await hmacOt(chaves, PJ, '10.1.1.30'), destino_ip_hash: await hmacOt(chaves, PJ, '10.1.1.10'),
      dados: { protocolo: 'tcp', porta: 502, direcao: 'unidirecional' } }]);
    expect(JSON.stringify(p.pendentes)).not.toContain('10.1.1.30');
    expect(p.contagem).toMatchObject({ fluxos_criados: 3, fluxos_pendentes: 1 });

    const comFaixa = await planejarResumo(env.DB, chaves, PJ, { id: 's1', faixas: ['200.10.0.0/24'] }, r);
    expect(comFaixa.pendentes.map((x) => x.origem_ip_hash)).toContain(await hmacOt(chaves, PJ, '200.10.0.7'));
    expect(comFaixa.fluxos.some((f) => f.dados.protocolo === 'modbus')).toBe(false);
  });
});

describe('chave de novidade', () => {
  const site = { id: 's1', faixas: [] as string[] };
  it('ativo: o mesmo IP privado em dois sites dá chaves diferentes; no mesmo site, a mesma', async () => {
    expect(await chaveAtivo(chaves, PJ, 's1', '10.1.1.30')).not.toBe(await chaveAtivo(chaves, PJ, 's2', '10.1.1.30'));
    expect(await chaveAtivo(chaves, PJ, 's1', '10.1.1.30')).toBe(await chaveAtivo(chaves, PJ, 's1', '10.1.1.30'));
    const [a, b] = await Promise.all(['s1', 's2'].map((id) => planejarResumo(env.DB, chaves, PJ, { id, faixas: [] }, resumo([at('10.1.1.30', { mac: '00:30:a7:01:02:04' })], []))));
    expect(a.ativos[0].chave).toBe(await chaveAtivo(chaves, PJ, 's1', '10.1.1.30'));
    expect(a.ativos[0].chave).not.toBe(b.ativos[0].chave);
  });

  it('fluxo: dois IPs externos para o mesmo destino interno, protocolo e porta dão uma chave; o lado externo é o literal ext', async () => {
    const p = await planejarResumo(env.DB, chaves, PJ, site, resumo([], [cx('203.0.113.5', '10.1.1.30', 443, 'https'), cx('198.51.100.9', '10.1.1.30', 443, 'https'),
      cx('10.1.1.30', '203.0.113.5', 443, 'https')]));
    expect(p.pendentes.map((x) => x.chave)).toEqual([await hmacOt(chaves, PJ, 's1|ext|10.1.1.30|https|443'), await hmacOt(chaves, PJ, 's1|10.1.1.30|ext|https|443')]);
  });

  it('filtrarNovidade: pula rascunho, descartado há 10 dias e pendência de mesma chave; mantém descartado há 100 dias, enviado e chave de outro site', async () => {
    const ip = (i: number) => `10.1.9.${i}`;
    const k = (i: number, s = 's1') => chaveAtivo(chaves, PJ, s, ip(i));
    await env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES ('lev-f', ?, 's1', 'documento', '2026-11-04', 'x')`).bind(PJ).run();
    const achado = async (id: string, chave: string, situacao: string, dias: number) => env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id,
      criado_por, situacao, updated_at, chave_sensor) VALUES (?, ?, 'lev-f', 'x', ?, datetime('now', ?), ?)`).bind(id, PJ, situacao, `-${dias} days`, chave).run();
    await achado('f1', await k(1), 'rascunho', 0);
    await achado('f2', await k(2), 'descartado', 10);
    await env.DB.prepare(`INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, dados, chave_sensor) VALUES ('f3', ?, 'lev-f', 'h', '{}', ?)`)
      .bind(PJ, await k(3)).run();
    await achado('f4', await k(4), 'descartado', 100);
    await achado('f5', await k(5), 'enviado', 0);
    await achado('f6', await k(6, 's2'), 'rascunho', 0);
    const plano: Plano = { ativos: await Promise.all([1, 2, 3, 4, 5, 6].map(async (i) => ({ chave: await k(i), dados: { ip: ip(i) } }))), macs: [], fluxos: [], pendentes: [],
      contagem: { ativos_novos: 6, ativos_conhecidos: 0, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 0 } };
    const r = await filtrarNovidade(env.DB, PJ, plano);
    expect(r.repetidos).toBe(3);
    expect(r.plano.ativos.map((a) => a.dados.ip)).toEqual([ip(4), ip(5), ip(6)]);
    expect(r.plano.contagem.ativos_novos).toBe(3);
  });
});

it('EVIDENCIA_SENSOR', () => {
  expect(EVIDENCIA_SENSOR(5321, '2026-11-01T00:00:00Z', '2026-11-03T23:59:59Z')).toBe('Sensor de rede (Zeek): 5321 conexões entre 01/11 e 03/11');
});
