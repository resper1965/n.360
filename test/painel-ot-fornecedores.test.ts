import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { blocoOt } from '../src/services/painel-ot';
import { diaMaisSP, hojeEmSaoPaulo } from '../src/services/hoje';
import { quadrosOt } from '../src/services/painel-ot-quadros';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Fornecedores e riscos de OT no Painel (spec 2026-11-19, PR4). Situação da avaliação = a de terceiros.ts (situacaoDe); escopo de
// lerFornecedores e de lerReferencias (P0-4). Só contagem: nenhum nome de fornecedor, ativo ou título de risco sai (P0-6).
// Só em `completo` (Gestor e equipe); leitor e técnico não recebem nem consultam. Orçamento de D1: as duas consultas entram no batch dos quadros.
type H = Record<string, string>;
const chamar = (h: H, caminho: string, extra: Record<string, unknown> = {}) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...(workerEnv() as any), ...extra });
const json = async (h: H, caminho: string, extra: Record<string, unknown> = {}) => { const r = await chamar(h, caminho, extra); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H, extra: Record<string, unknown> = {}) => json(h, '/api/v1/projects/proj-a/painel?modulo=ot', extra);
let gestor: H, tecnico: H, leitor: H, cons: H;
let consId = '';

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, status) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao', 'ativo'),
      ('s2', 'proj-a', 'SE Sul Exemplo', 'em_operacao', 'ativo'), ('s3', 'proj-a', 'SE Removida Exemplo', 'em_operacao', 'removido')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Supervisao', 2)`),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, externo, via_vpn) VALUES ('f1', 'proj-a', 's1', 'z1', 1, 0)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at2', 'proj-a', 's2', 'Ativo Sul ABC')`),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fv', 'proj-a', 'organizacao', 'Fornecedora Vigente Exemplo'),
      ('fp', 'proj-a', 'organizacao', 'Fornecedora Pendente Exemplo'), ('fr', 'proj-a', 'organizacao', 'Fornecedora Reprovada Exemplo')`),
    env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, created_at) VALUES
      ('av-antiga', 'proj-a', 'fv', 'questionario', 'reprovado', ?1, '2026-01-01 00:00:00'),
      ('av-nova', 'proj-a', 'fv', 'questionario', 'aprovado', ?1, '2026-06-01 00:00:00'),
      ('av-r', 'proj-a', 'fr', 'questionario', 'reprovado', ?1, '2026-06-01 00:00:00')`).bind(diaMaisSP(200)),
    env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, ot_fluxo_id, criado_por) VALUES
      ('o1', 'proj-a', 'fv', 'integrador', 's1', NULL, 'u-g'), ('o2', 'proj-a', 'fp', 'acesso_remoto', NULL, 'f1', 'u-g'),
      ('o3', 'proj-a', 'fr', 'fabricante', 's2', NULL, 'u-g'), ('o4', 'proj-a', 'fr', 'integrador', 's3', NULL, 'u-g')`),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, probability, impact) VALUES ('rk1', 'proj-a', 'a', 'Titulo Risco Secreto', 4, 5),
      ('rk2', 'proj-a', 'a', 't', 2, 2), ('rk3', 'proj-a', 'a', 't', 1, 1), ('rk4', 'proj-a', 'a', 't', 5, 5)`),
    env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, risk_id, ot_site_id, ot_ativo_id, criado_por) VALUES
      ('rf1', 'proj-a', 'rk1', 's1', NULL, 'u-g'), ('rf2', 'proj-a', 'rk2', NULL, 'at2', 'u-g'), ('rf4', 'proj-a', 'rk4', 's3', NULL, 'u-g')`),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  consId = c!.id;
  await concederModulos([consId], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: consId, email: 'c@ness.lat', role: 'consultor' });
});

const ESPERADO = [
  { papel: 'integrador', total: 1, vigentes: 1, pendentes: 0, vencidos: 0, sem_vpn: 0 },
  { papel: 'fabricante', total: 1, vigentes: 0, pendentes: 0, vencidos: 1, sem_vpn: 0 },
  { papel: 'acesso_remoto', total: 1, vigentes: 0, pendentes: 1, vencidos: 0, sem_vpn: 1 },
];

describe('Fornecedores de OT no Painel', () => {
  it('por papel, com a situação da avaliação mais recente; site removido não conta (equipe e Gestor)', async () => {
    expect((await ot(cons)).modulos.ot.fornecedores).toEqual(ESPERADO);
    expect((await ot(gestor)).modulos.ot.fornecedores).toEqual(ESPERADO);
  });
  it('os mesmos vínculos que GET /ot/fornecedores devolve à mesma pessoa', async () => {
    const lista = (await json(cons, '/api/v1/projects/proj-a/ot/fornecedores')).fornecedores as { parte_id: string; papel: string }[];
    const doPainel = (await ot(cons)).modulos.ot.fornecedores.reduce((t: number, p: any) => t + p.total, 0);
    expect(new Set(lista.map((f) => `${f.papel}|${f.parte_id}`)).size).toBe(doPainel);
  });
  it('P0-6: nenhum nome de fornecedor, de ativo ou título de risco sai no painel', async () => {
    for (const h of [gestor, cons]) {
      const corpo = JSON.stringify(await ot(h));
      for (const x of ['Fornecedora', 'Ativo Sul ABC', 'Titulo Risco Secreto']) expect(corpo, x).not.toContain(x);
    }
  });
});

describe('Riscos de OT no Painel', () => {
  it('só riscos ligados a site, ativo ou desvio em site permitido; risco do núcleo sem ligação e site removido ficam fora', async () => {
    const r = (await ot(cons)).modulos.ot.riscos as { p: number; i: number; n: number }[];
    expect(r.reduce((t, c) => t + c.n, 0)).toBe(2);
    expect(r).toEqual(expect.arrayContaining([{ p: 4, i: 5, n: 1 }, { p: 2, i: 2, n: 1 }]));
  });
});

describe('quem vê (P0)', () => {
  it('P0-4 na própria consulta: com só o s2 permitido, só o vínculo e o risco do s2 (o técnico não chega aqui, mas a consulta não confia nisso)', async () => {
    const q = await quadrosOt(env.DB, 'proj-a', hojeEmSaoPaulo(), { sites: JSON.stringify(['s2']), lista: [{ id: 's2', nome: 'SE Sul Exemplo', fase: 'em_operacao', obra_ate: null }],
      revalidar: new Map(), credenciais: [], gestor: false, veSondas: false, soResumo: false });
    expect(q.completo!.fornecedores.map((p) => p.papel)).toEqual(['fabricante']);
    expect(q.completo!.riscos.reduce((t, c) => t + c.n, 0)).toBe(1); // rk2, pelo ativo do s2
  });
  it('leitor e técnico não recebem fornecedores nem riscos; o Início do n.360 também não', async () => {
    for (const h of [leitor, tecnico]) {
      const o = (await ot(h)).modulos.ot;
      expect(o.fornecedores).toBeUndefined();
      expect(o.riscos).toBeUndefined();
    }
    const d = await json(cons, '/api/v1/projects/proj-a/painel');
    expect(d.modulos.ot.fornecedores).toBeUndefined();
    expect(d.modulos.ot.riscos).toEqual([]); // o bloco genérico de sempre, vazio (src/services/painel-ot.ts)
  });
});

// Orçamento de D1: as duas consultas novas entram no db.batch dos quadros (nenhum batch novo); leitor, técnico e Início nem as fazem.
const contando = () => {
  const sqls: string[] = []; const lotes: number[] = [];
  const DB = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (q: string) => { sqls.push(q); return t.prepare(q); }
    : k === 'batch' ? (xs: D1PreparedStatement[]) => { lotes.push(xs.length); return t.batch(xs); } : (t as any)[k]?.bind?.(t) ?? (t as any)[k]) });
  return { sqls, lotes, DB };
};
const tocaNovas = (q: string) => /ot_fornecedores|ot_referencias r\s+LEFT JOIN ot_sites/.test(q);
describe('custo', () => {
  it('detalhe continua somando exatamente dois db.batch ao bloco; fornecedores e riscos vão no batch dos quadros', async () => {
    const ator = { id: consId, email: 'c@ness.lat', role: 'consultor' };
    const dia = hojeEmSaoPaulo();
    const sem = contando(); await blocoOt(sem.DB as any, 'proj-a', ator, dia, new Date(), false);
    const com = contando(); await blocoOt(com.DB as any, 'proj-a', ator, dia, new Date(), true);
    expect(com.lotes.length - sem.lotes.length).toBe(2);
    expect(com.sqls.filter(tocaNovas)).toHaveLength(2);
    expect(sem.sqls.filter(tocaNovas)).toEqual([]);
  });
  it('leitor, técnico e o Início do n.360 não consultam fornecedores nem riscos de OT', async () => {
    for (const [h, caminho] of [[leitor, '?modulo=ot'], [tecnico, '?modulo=ot'], [cons, '']] as const) {
      const c = contando();
      await json(h, '/api/v1/projects/proj-a/painel' + caminho, { DB: c.DB });
      expect(c.sqls.filter(tocaNovas)).toEqual([]);
    }
  });
});

// Casos de borda (revisão): sites s4/s5 novos, lidos só por quadrosOt com a lista de sites explícita (não mexem nos casos acima).
describe('casos de borda', () => {
  const q = (sites: string[]) => quadrosOt(env.DB, 'proj-a', hojeEmSaoPaulo(), { sites: JSON.stringify(sites),
    lista: sites.map((id) => ({ id, nome: id, fase: 'em_operacao', obra_ate: null })), revalidar: new Map(), credenciais: [], gestor: false, veSondas: false, soResumo: false });
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, status) VALUES ('s4', 'proj-a', 'SE Leste Exemplo', 'em_operacao', 'ativo'),
        ('s5', 'proj-a', 'SE Oeste Exemplo', 'em_operacao', 'ativo')`),
      env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z4', 'proj-a', 's4', 'Z4', 2), ('z4b', 'proj-a', 's4', 'Z4b', 1), ('z5', 'proj-a', 's5', 'Z5', 2)`),
      env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, destino_zona_id, externo, via_vpn) VALUES
        ('f45', 'proj-a', 's4', 'z4', 'z5', 0, 0), ('f4ext', 'proj-a', 's4', 'z4', NULL, 1, 0), ('f4vpn', 'proj-a', 's4', 'z4', NULL, 1, 1),
        ('f4int', 'proj-a', 's4', 'z4', 'z4b', 0, 0)`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('fx', 'proj-a', 'organizacao', 'Fornecedora X', NULL),
        ('fi', 'proj-a', 'organizacao', 'Fornecedora I', NULL), ('fa1', 'proj-a', 'organizacao', 'Fornecedora A1', NULL),
        ('fa2', 'proj-a', 'organizacao', 'Fornecedora A2', NULL), ('fre', 'proj-a', 'organizacao', 'Fornecedora Re', 'medio'),
        ('fve', 'proj-a', 'organizacao', 'Fornecedora Ve', NULL)`),
      env.DB.prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate, tipo_avaliado, created_at) VALUES
        ('av-re', 'proj-a', 'fre', 'questionario', 'aprovado', ?1, 'pequeno', '2026-06-01 00:00:00'),
        ('av-ve', 'proj-a', 'fve', 'questionario', 'aprovado', '2020-01-01', NULL, '2019-06-01 00:00:00')`).bind(diaMaisSP(200)),
      env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, ot_fluxo_id, criado_por) VALUES
        ('o5', 'proj-a', 'fx', 'acesso_remoto', NULL, 'f45', 'u-g'), ('o6', 'proj-a', 'fi', 'integrador', NULL, 'f4ext', 'u-g'),
        ('o7', 'proj-a', 'fa1', 'acesso_remoto', NULL, 'f4vpn', 'u-g'), ('o8', 'proj-a', 'fa2', 'acesso_remoto', NULL, 'f4int', 'u-g'),
        ('o9', 'proj-a', 'fre', 'fabricante', 's4', NULL, 'u-g'), ('o10', 'proj-a', 'fve', 'fabricante', 's4', NULL, 'u-g')`),
      env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, status) VALUES ('at4r', 'proj-a', 's4', 'R', 'removido'),
        ('at4a', 'proj-a', 's4', 'A', 'ativo'), ('at4b', 'proj-a', 's4', 'B', 'ativo')`),
      env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, primeira_vez, ultima_vez) VALUES
        ('dv4', 'proj-a', 's4', 'fluxo', 'k-dv4', '2026-06-01T12:00:00Z', '2026-06-01T12:00:00Z')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, probability, impact) VALUES ('rk5', 'proj-a', 'a', 't', 3, 3),
        ('rk6', 'proj-a', 'a', 't', 1, 2), ('rk7', 'proj-a', 'a', 't', 2, 4)`),
      env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, risk_id, ot_site_id, ot_ativo_id, ot_desvio_id, criado_por) VALUES
        ('rf5', 'proj-a', 'rk5', 's4', NULL, 'dv4', 'u-g'), ('rf6', 'proj-a', 'rk6', NULL, 'at4r', NULL, 'u-g'),
        ('rf7a', 'proj-a', 'rk7', NULL, 'at4a', NULL, 'u-g'), ('rf7b', 'proj-a', 'rk7', NULL, 'at4b', NULL, 'u-g')`),
    ]);
  });
  it('P0-4 FLUXO_VISIVEL: fornecedor só de um fluxo do s4 com a ponta no s5 não conta para quem vê só o s4; conta com os dois', async () => {
    const so4 = (await q(['s4'])).completo!.fornecedores.find((p) => p.papel === 'acesso_remoto')!;
    const ambos = (await q(['s4', 's5'])).completo!.fornecedores.find((p) => p.papel === 'acesso_remoto')!;
    expect(so4.total).toBe(2); // fa1 e fa2; fx (f45, ponta z5 no s5) fora
    expect(ambos.total).toBe(3);
  });
  it('situação (reavaliar -> pendentes, vencida -> vencidos) e sem_vpn só de acesso_remoto em fluxo externo sem VPN', async () => {
    expect((await q(['s4'])).completo!.fornecedores).toEqual([
      { papel: 'integrador', total: 1, vigentes: 0, pendentes: 1, vencidos: 0, sem_vpn: 0 }, // fi em fluxo externo sem VPN, mas não é acesso remoto
      { papel: 'fabricante', total: 2, vigentes: 0, pendentes: 1, vencidos: 1, sem_vpn: 0 }, // fre reavaliar (medio x pequeno), fve vencida
      { papel: 'acesso_remoto', total: 2, vigentes: 0, pendentes: 2, vencidos: 0, sem_vpn: 0 }, // fa1 com VPN, fa2 interno
    ]);
  });
  it('riscos: ligado por desvio conta; ativo removido em site ativo não; o mesmo risco em dois ativos conta uma vez', async () => {
    const r = (await q(['s4'])).completo!.riscos;
    expect(r).toHaveLength(2);
    expect(r).toEqual(expect.arrayContaining([{ p: 3, i: 3, n: 1 }, { p: 2, i: 4, n: 1 }]));
  });
});
