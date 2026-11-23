import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { blocoOt } from '../src/services/painel-ot';
import { diaMaisSP, hojeEmSaoPaulo } from '../src/services/hoje';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';

// Quadros do Painel do n.ot (spec 2026-11-19, PR3): cada número bate com a tela de origem nos mesmos dados; só no ?modulo=ot; dois
// db.batch a mais e nenhuma consulta por site. D1 real.
type H = Record<string, string>;
const HOJE = hojeEmSaoPaulo();
const chamar = (h: H, caminho: string, extra: Record<string, unknown> = {}) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...(workerEnv() as any), ...extra });
const json = async (h: H, caminho: string, extra: Record<string, unknown> = {}) => { const r = await chamar(h, caminho, extra); expect(r.status).toBe(200); return (await r.json()) as any; };
const ot = (h: H, extra: Record<string, unknown> = {}) => json(h, '/api/v1/projects/proj-a/painel?modulo=ot', extra);
let gestor: H, tecnico: H, leitor: H, cons: H, plat: H;
let consId = '';

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  // 02:00Z é ainda o dia anterior em São Paulo: a credencial vence em 24 dias, não em 25
  const credencialVence = `${diaMaisSP(25)}T02:00:00.000Z`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('u-l', 'l@cliente.teste', 'x', 'Leitor', 'client', 'proj-a'), ('u-p', 'p@ness.lat', 'x', 'Plataforma', 'platform_admin', NULL)`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s1', 'proj-a', 'SE Norte Exemplo', 'em_operacao', NULL),
      ('s2', 'proj-a', 'SE Sul Exemplo', 'base_em_aprovacao', ?)`).bind(diaMaisSP(30)),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z1', 'proj-a', 's1', 'Supervisao', 2), ('z2', 'proj-a', 's1', 'DMZ', 3),
      ('z3', 'proj-a', 's1', 'Corporativa', 4), ('z4', 'proj-a', 's2', 'Supervisao Sul', 2)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome, no_arciber, categoria_arciber, tipo_dispositivo, fabricante, funcao, ip_cifrado,
        protocolos_portas, firmware_nao_aplicavel, ultima_verificacao_em, verificado_por)
      VALUES ('at1', 'proj-a', 's1', 'z1', 'Ativo Secreto XYZ', 1, 'centro_operacao', 'IED', 'Fabricante Exemplo', 'Protecao', 'ot1:segredo', '[{"protocolo":"modbus"}]', 1,
        datetime('now', '-700 days'), 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome) VALUES ('at2', 'proj-a', 's1', 'z2', 'Ativo Comum ABC')`),
    env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, externo, via_vpn) VALUES ('f1', 'proj-a', 's2', 'z4', 1, 0)`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'chave-sensor-1', '{}', ?1, ?1, 'aberto', NULL),
      ('d2', 'proj-a', 's1', 'fluxo', 'chave-sensor-2', '{}', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z', 'regularizado', NULL),
      ('d3', 'proj-a', 's2', 'fluxo', 'chave-sensor-3', '{}', ?1, ?1, 'aceito', ?2),
      ('d4', 'proj-a', 's2', 'fluxo', 'chave-sensor-4', '{}', ?1, ?1, 'tratado', NULL),
      ('d5', 'proj-a', 's1', 'fluxo', 'chave-sensor-5', '{}', ?3, ?3, 'regularizado', NULL)`)
      // d5: dia 1º às 01:00Z ainda é o último dia do mês anterior em São Paulo, e conta nele
      .bind(`${HOJE}T12:00:00Z`, `${diaMaisSP(20)}T12:00:00Z`, `${HOJE.slice(0, 7)}-01T01:00:00Z`),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES ('ca1', 'proj-a', 'Fechar o acesso remoto', ?, 'Open')`).bind(diaMaisSP(40)),
    env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por) VALUES ('r1', 'proj-a', 'ca1', 's2', 'd4', 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, proxima_revisao, atualizado_por) VALUES
      ('a1', 'proj-a', 'ons-ro-cb-br-01-rev00-4.2.2', 'atende', NULL, ?, 'u-g'),
      ('a2', 'proj-a', 'ons-ro-cb-br-01-rev00-4.1.4', 'parcial', 'em curso', NULL, 'u-g')`).bind(diaMaisSP(10)),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, proxima_revisao, atualizado_por) VALUES
      ('a3', 'proj-a', 'ons-ro-cb-br-01-rev00-4.3.2', 'atende', NULL, NULL, 'u-g')`),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES ('ev1', 'proj-a', 'politica.pdf', 'k', 'h', 'u-g', '2020-01-01')`),
    env.DB.prepare(`INSERT INTO ot_requisito_evidencias (evidencia_id, requisito_id, project_id) VALUES ('ev1', 'ons-ro-cb-br-01-rev00-4.3.2', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES ('sn1', 'proj-a', 's1', 'Sonda Norte', '10.0.0.0/8', 'u-g')`),
    env.DB.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em) VALUES ('kc1', 'sn1', 'proj-a', 'hash', ?)`).bind(credencialVence),
  ]);
  // Site removido (fora de sitesPermitidos, P0-4) com zona, ativo, desvio e ação: nada dele entra em quadro algum.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, status) VALUES ('s9', 'proj-a', 'SE Removida Exemplo', 'em_operacao', 'removido')`),
    env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z9', 'proj-a', 's9', 'Campo', 1)`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome) VALUES ('at9', 'proj-a', 's9', 'z9', 'Ativo Removido')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d9', 'proj-a', 's9', 'fluxo', 'chave-sensor-9', '{}', ?1, ?1, 'aceito', ?2)`).bind(`${HOJE}T12:00:00Z`, `${diaMaisSP(15)}T12:00:00Z`),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status) VALUES ('ca9', 'proj-a', 'Acao removida', ?, 'Open')`).bind(diaMaisSP(5)),
    env.DB.prepare(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por) VALUES ('r9', 'proj-a', 'ca9', 's9', 'd9', 'u-g')`),
  ]);
  await concederModulos(['u-g', 'u-t', 'u-l', 'u-p'], ['iso', 'ot']);
  await designarConsultor('c@ness.lat', 'proj-a');
  consId = (await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>())!.id;
  await concederModulos([consId], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  leitor = await sessionFor({ id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' });
  plat = await sessionFor({ id: 'u-p', email: 'p@ness.lat', role: 'platform_admin' });
  cons = await sessionFor({ id: consId, email: 'c@ness.lat', role: 'consultor' });
});

describe('cada número bate com a tela de origem', () => {
  it('Conformidade: o resumo é o do GET /ot/assessment da mesma pessoa', async () => {
    for (const h of [cons, gestor]) {
      const a = await json(h, '/api/v1/projects/proj-a/ot/assessment');
      expect(a.resumo.revisar).toBeGreaterThan(0); // evidência vencida no 4.3.2
      expect((await ot(h)).modulos.ot.conformidade.resumo).toEqual(a.resumo);
    }
  });
  it('ativos do ARCiber, por nível Purdue e fluxos externos: os mesmos do GET /ot/indicadores', async () => {
    const i = await json(cons, '/api/v1/projects/proj-a/ot/indicadores');
    const q = (await ot(cons)).modulos.ot;
    expect({ total: q.conformidade.ativos.arciber, completos: q.conformidade.ativos.completos }).toEqual(i.completude.arciber);
    expect(Object.fromEntries(q.conformidade.ativos.por_nivel.map((n: any) => [n.nivel, n.ativos]))).toEqual(i.por_nivel);
    expect(q.desvios.fluxos_externos).toEqual({ externos: i.fluxos_externos.externos, sem_vpn: i.fluxos_externos.sem_vpn });
  });
  it('Conformidade por categoria: "atende" conta como concluído; o inventário nunca', async () => {
    const cats = (await ot(cons)).modulos.ot.conformidade.categorias;
    const arq = cats.find((c: any) => c.tema === 'Arquitetura tecnológica para o ambiente');
    expect(arq.feito).toBe(0); // 4.1.1 a 4.1.3 são técnicos e 4.1.4 é parcial
    expect(arq.andamento).toBeGreaterThanOrEqual(1);
    const gov = cats.find((c: any) => c.tema === 'Governança de segurança da informação');
    expect(gov.feito).toBe(1); // 4.2.2 atende
  });
  it('Desvios: estado de hoje por site e detectados por mês (12 meses)', async () => {
    const d = (await ot(cons)).modulos.ot.desvios;
    expect(d.por_site.map((t: any) => [t.tema, t.feito, t.andamento, t.falta])).toEqual([['SE Norte Exemplo', 2, 0, 1], ['SE Sul Exemplo', 0, 2, 0]]);
    expect(d.meses).toHaveLength(12);
    expect(d.meses[11]).toBe(HOJE.slice(0, 7));
    expect(d.por_mes[11]).toBe(3);
    expect(d.por_mes[10]).toBe(1); // d5, mês anterior em São Paulo
    expect(d.por_mes.reduce((t: number, n: number) => t + n, 0)).toBe(4); // d2 é de 2020, fora da janela
  });
});

describe('só os sites permitidos (P0-4)', () => {
  it('site removido: nenhum desvio, ativo, nível, aceite ou ação dele em quadro algum', async () => {
    const o = (await ot(gestor)).modulos.ot;
    expect(o.desvios.por_mes.reduce((t: number, n: number) => t + n, 0)).toBe(4);
    expect(o.conformidade.ativos.por_nivel.map((n: any) => n.nivel)).not.toContain(1);
    const rot = o.vencimentos.flatMap((l: any) => l.itens.map((i: any) => i.rotulo));
    expect(rot).not.toContain('');
    expect(rot).not.toContain('SE Removida Exemplo');
    expect(o.vencimentos.find((l: any) => l.tipo === 'Ação de desvio').itens).toHaveLength(1);
    expect(o.vencimentos.find((l: any) => l.tipo === 'Aceite de desvio').itens).toHaveLength(1);
  });
});

describe('Vencimentos de 90 dias por papel', () => {
  const tipos = (v: any[]) => v.map((l) => l.tipo);
  const rotulos = (v: any[], tipo: string) => v.find((l) => l.tipo === tipo).itens.map((i: any) => i.rotulo);
  it('consultor: obra, revalidação, revisão, credencial e ação; sem aceite (é do Gestor); rótulo é site ou código', async () => {
    const v = (await ot(cons)).modulos.ot.vencimentos;
    expect(tipos(v)).toEqual(['Obra', 'Revalidação dos ativos', 'Revisão do assessment', 'Credencial de sonda', 'Ação de desvio']);
    expect(rotulos(v, 'Obra')).toEqual(['SE Sul Exemplo']);
    expect(rotulos(v, 'Revalidação dos ativos')).toEqual(['SE Norte Exemplo']);
    expect(rotulos(v, 'Revisão do assessment')).toEqual(['Item 4.2.2']);
    expect(rotulos(v, 'Credencial de sonda')).toEqual(['SE Norte Exemplo']);
    expect(v.find((l: any) => l.tipo === 'Credencial de sonda').itens[0].dias).toBe(24); // dia de São Paulo, não de UTC
    expect(rotulos(v, 'Ação de desvio')).toEqual(['SE Sul Exemplo']);
  });
  it('Gestor: também o aceite de desvio', async () => {
    const v = (await ot(gestor)).modulos.ot.vencimentos;
    expect(tipos(v)).toContain('Aceite de desvio');
    expect(rotulos(v, 'Aceite de desvio')).toEqual(['SE Sul Exemplo']);
  });
  it('platform_admin (não abre a sonda) não recebe credencial de sonda', async () => {
    expect((await ot(plat)).modulos.ot.vencimentos.map((l: any) => l.tipo)).not.toContain('Credencial de sonda');
  });
  it('o próximo prazo do bloco (frase "Em dia") é o primeiro vencimento do n.ot', async () => {
    const b = await blocoOt(env.DB, 'proj-a', { id: consId, email: 'c@ness.lat', role: 'consultor' }, HOJE, new Date(), true);
    expect(b.proximo).toMatchObject({ rotulo: 'Item 4.2.2', dias: 10, tipo: 'Revisão do assessment' });
  });
});

describe('quem vê o quê (P0)', () => {
  it('leitor: só o resumo da Conformidade em números (decisão 3)', async () => {
    const o = (await ot(leitor)).modulos.ot;
    expect(Object.keys(o).sort()).toEqual(['comecando', 'conformidade', 'saude']);
    expect(Object.keys(o.conformidade)).toEqual(['resumo']);
  });
  it('leitor: a frase de saúde não cita vencimento do n.ot (site, obra, desvio); a do módulo igual à do Início do n.360', async () => {
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s8', 'proj-a', 'SE Leste Exemplo', 'em_obra', ?)`).bind(diaMaisSP(3)).run();
    try {
      const d = await ot(leitor);
      const g = await json(leitor, '/api/v1/projects/proj-a/painel');
      for (const t of [JSON.stringify(d.saude), JSON.stringify(d.modulos.ot)]) for (const x of ['SE Leste', 'SE Norte', 'SE Sul', 'obra', 'desvio', 'Item 4.']) expect(t, x).not.toContain(x);
      expect(d.modulos.ot.saude).toEqual(g.modulos.ot.saude);
      // controle: o vencimento existe (a equipe o recebe no quadro)
      expect(JSON.stringify((await ot(cons)).modulos.ot.vencimentos)).toContain('SE Leste Exemplo');
    } finally { await env.DB.prepare(`DELETE FROM ot_sites WHERE id = 's8'`).run(); }
  });
  it('leitor: não consulta desvios, ações, ativos nem níveis (só o resumo da Conformidade)', async () => {
    const c = contando();
    await blocoOt(c.DB as any, 'proj-a', { id: 'u-l', email: 'l@cliente.teste', role: 'client', client_project_id: 'proj-a' }, HOJE, new Date(), true);
    expect(c.sqls.filter((q) => /ot_referencias|primeira_vez|nivel_purdue AS nivel|AS completos|aceito_ate IS NOT NULL/.test(q))).toEqual([]);
  });
  it('técnico: nada da organização (sem conformidade, desvios nem vencimentos)', async () => {
    const o = (await ot(tecnico)).modulos.ot;
    for (const k of ['conformidade', 'desvios', 'vencimentos']) expect(o[k], k).toBeUndefined();
  });
  it('Início do n.360: nenhum quadro novo nem contagem de ativos', async () => {
    for (const h of [cons, gestor]) {
      const d = await json(h, '/api/v1/projects/proj-a/painel');
      expect(d.modulos.ot.conformidade).toBeUndefined();
      expect(d.modulos.ot.desvios).toBeUndefined();
      expect(JSON.stringify(d)).not.toMatch(/arciber|por_nivel|fluxos_externos/);
    }
  });
  it('nenhuma resposta leva IP, MAC, nome de ativo, nome de sonda, faixa ou chave do sensor (P0-6)', async () => {
    for (const h of [cons, gestor, leitor, tecnico]) {
      const corpo = JSON.stringify(await ot(h));
      expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
      for (const x of ['Sonda Norte', 'Ativo Secreto XYZ', 'Ativo Comum ABC', 'ot1:', 'chave-sensor', 'Fechar o acesso']) expect(corpo, x).not.toContain(x);
    }
  });
});

// Custo: dois db.batch a mais no ?modulo=ot (o das consultas agrupadas e o de conformidadePorSite) e nenhuma consulta por site.
const contando = () => {
  const sqls: string[] = []; const lotes: number[] = [];
  const DB = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (q: string) => { sqls.push(q); return t.prepare(q); }
    : k === 'batch' ? (xs: D1PreparedStatement[]) => { lotes.push(xs.length); return t.batch(xs); } : (t as any)[k]?.bind?.(t) ?? (t as any)[k]) });
  return { sqls, lotes, DB };
};
describe('custo dos quadros', () => {
  it('o Início do n.360 não consulta os quadros (nem paga o custo)', async () => {
    const c = contando();
    await json(cons, '/api/v1/projects/proj-a/painel', { DB: c.DB });
    expect(c.sqls.filter((q) => /ot_requisito_evidencias|ot_referencias/.test(q))).toEqual([]);
  });
  it('detalhe soma exatamente dois db.batch ao bloco', async () => {
    const ator = { id: consId, email: 'c@ness.lat', role: 'consultor' };
    const sem = contando(); await blocoOt(sem.DB as any, 'proj-a', ator, HOJE, new Date(), false);
    const com = contando(); await blocoOt(com.DB as any, 'proj-a', ator, HOJE, new Date(), true);
    expect(com.lotes.length - sem.lotes.length).toBe(2);
  });
  it('150 sites: 200 e o número de consultas não cresce com os sites', async () => {
    const um = contando();
    await ot(cons, { DB: um.DB });
    await env.DB.batch(Array.from({ length: 150 }, (_, i) => env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES (?, 'proj-a', ?, 'em_levantamento')`).bind(`mass-${i}`, `Massa ${i}`)));
    try {
      const muitos = contando();
      const d = await ot(cons, { DB: muitos.DB });
      expect(muitos.sqls.length).toBe(um.sqls.length);
      expect(d.modulos.ot.por_site).toHaveLength(152);
    } finally { await env.DB.prepare(`DELETE FROM ot_sites WHERE id LIKE 'mass-%'`).run(); }
  });
});
