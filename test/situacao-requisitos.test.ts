import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { resetComCatalogo, sessionFor, workerEnv, habilitarOt, concederModulos } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import { semearCatalogo } from '../src/services/requisitos';
import { exportarProjeto, tabelasExportaveis } from '../src/portabilidade';
import { situacaoDoItemTecnico } from '../src/services/situacao-unica';
import type { LinhaSituacao } from '../src/services/situacao-requisitos';

const P = 'sr-p';
const AGENTE = { userId: 'u-ot', email: 'ot@ness.lat', projectId: P, concessaoId: 'c-sr' };
const base = `/api/v1/projects/${P}/requisitos-situacao`;
const chamar = (h: Record<string, string>, extra: object = {}, caminho = base) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...workerEnv(), ...extra } as any);
const ler = async (h: Record<string, string>, extra: object = {}) => {
  const r = await chamar(h, extra);
  expect(r.status).toBe(200);
  return (await r.json()) as LinhaSituacao[];
};

let ot: Record<string, string>, semOt: Record<string, string>, chave: Record<string, string>, vizinho: Record<string, string>;

beforeAll(async () => {
  await resetComCatalogo();
  await semearCatalogo(env.DB);
  const ctrl = (id: string, status: string, req: string | null) =>
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES (?, ?, 'ISO 27001:2022', 'c', ?, ?)`).bind(id, P, status, req);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), ('sr-o', 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-ot', 'ot@ness.lat', 'x', 'Ot', 'consultor', NULL, 'org_ness'), ('u-iso', 'iso@ness.lat', 'x', 'Iso', 'consultor', NULL, 'org_ness'),
      ('u-viz', 'viz@o.com', 'x', 'Viz', 'client', 'sr-o', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', ?1, 'Ot', 'ot@ness.lat', 'consultor', 'C'), ('g2', ?1, 'Iso', 'iso@ness.lat', 'consultor', 'C')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-sr', 'u-ot', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('k-sr', ?, ?, 'k', 'read', 'Active')`).bind(P, await sha256Hex('chave-sr')),
    env.DB.prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('tst', 'Teste')`),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((r) => env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'tst', ?, 't')`).bind(`tst:${r}`, r)),
    ctrl('c1', 'Implemented', 'tst:A'), ctrl('c2', 'Planned', 'tst:B'), ctrl('c3', 'Partial', 'tst:C'), ctrl('c4', 'Missing', 'tst:D'), ctrl('c5', 'Not Applicable', 'tst:E'),
    ctrl('c6', 'Implemented', null),
    // técnico 4.1.1 chega a evidencia_no_inventario (zonas 2, 3 e 4); uma política avaliada
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', ?, 'Sub', 'em_operacao')`).bind(P),
    ...[2, 3, 4].map((n) => env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, 's1', 'z', ?)`).bind(`z${n}`, P, n)),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, atualizado_por) VALUES ('av1', ?, 'ons-ro-cb-br-01-rev00-4.1.4', 'parcial', 'em andamento', 'u')`).bind(P),
  ]);
  await habilitarOt(P);
  await concederModulos('u-ot', ['iso', 'privacy', 'ot']);
  await concederModulos('u-iso', ['iso']);
  ot = await sessionFor({ id: 'u-ot', email: 'ot@ness.lat', role: 'consultor' });
  semOt = await sessionFor({ id: 'u-iso', email: 'iso@ness.lat', role: 'consultor' });
  vizinho = await sessionFor({ id: 'u-viz', email: 'viz@o.com', role: 'client', client_project_id: 'sr-o' });
  chave = { 'X-API-Key': 'chave-sr' };
});

const isoDe = (l: LinhaSituacao[]) => Object.fromEntries(l.filter((x) => x.origem === 'n.iso').map((x) => [x.referencia, x.situacao]));

describe('leitura única: n.iso', () => {
  it('status do controle → situação única; controle sem requisito_id não aparece', async () => {
    const l = await ler(semOt);
    expect(isoDe(l)).toEqual({ A: 'atende', B: 'nao_atende', C: 'parcial', D: 'nao_avaliado', E: 'nao_se_aplica' });
    expect(l).toHaveLength(5);
  });
});

describe('leitura única: n.ot só para a pessoa com o módulo ot', () => {
  it('pessoa sem ot, agente (conta com ot) e chave de API: zero linhas n.ot, mas as do n.iso continuam', async () => {
    for (const l of [await ler(semOt), await ler({}, { AGENTE }), await ler(chave)]) {
      expect(l.filter((x) => x.origem === 'n.ot')).toHaveLength(0);
      expect(l.filter((x) => x.origem === 'n.iso')).toHaveLength(5);
    }
  });

  it('pessoa com ot: 25 linhas ONS; técnicos com derivado e nenhum atende', async () => {
    const o = (await ler(ot)).filter((x) => x.origem === 'n.ot');
    expect(o).toHaveLength(25);
    const tec = o.filter((x) => ['4.1.1', '4.1.2', '4.1.3', '4.2.1', '4.3.1'].includes(x.referencia));
    expect(tec).toHaveLength(5);
    expect(tec.every((x) => x.derivado && x.situacao !== 'atende')).toBe(true);
    expect(tec.find((x) => x.referencia === '4.1.1')).toMatchObject({ situacao: 'nao_avaliado', derivado: 'evidencia_no_inventario' });
    expect(o.find((x) => x.referencia === '4.1.4')).toMatchObject({ situacao: 'parcial', requisito_id: 'ons-ro-cb-br-01-rev00-4.1.4' });
    expect(o.find((x) => x.referencia === '4.1.4')!.derivado).toBeUndefined();
    expect(o.find((x) => x.referencia === '5.1.1')!.situacao).toBe('nao_avaliado');
    expect(o.filter((x) => x.situacao === 'atende')).toHaveLength(0);
  });

  it('o item técnico nunca vira atende (unidade)', () => {
    for (const s of ['nao_atende', 'evidencia_no_inventario', 'sem_evidencia', null] as const) expect(situacaoDoItemTecnico(s).situacao).not.toBe('atende');
  });
});

describe('acesso à rota', () => {
  it('pessoa de outro projeto e sem sessão são negadas', async () => {
    expect([403, 404]).toContain((await chamar(vizinho)).status);
    expect((await chamar({})).status).toBe(401);
  });
});

describe('portabilidade', () => {
  it('a leitura não é tabela: o export não ganha tabela nem campo', async () => {
    const tabelas = await tabelasExportaveis(workerEnv());
    expect(tabelas.filter((t) => /situacao/.test(t))).toEqual([]);
    expect(JSON.stringify(await exportarProjeto(workerEnv(), P))).not.toMatch(/requisitos-situacao|origem":"n\.(iso|ot)"/);
  });
});
