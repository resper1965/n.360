import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, sessionFor, workerEnv } from './helpers/d1';

// Spec 2026-11-26 §7 (revisão do PR1a): o item de "O que fazer" leva `site` só quando o grupo é de UM site; desvios contam só
// os sites fora de obra; base, obra e aceite (`aceites_site`) também levam o site. Com dois sites, o item vai sem `site`. D1 real.
type H = Record<string, string>;
const fazer = async (h: H) => {
  const r = await app.fetch(new Request('http://localhost/api/v1/projects/proj-a/painel?modulo=ot', { headers: h }), workerEnv() as any);
  expect(r.status).toBe(200);
  return ((await r.json()) as any).modulos.ot.fazer as { texto: string; aba?: string; site?: string }[];
};
const item = (f: { texto: string }[], re: RegExp) => f.find((i) => re.test(i.texto));
const desvio = (id: string, site: string, situacao = 'aberto', aceito = 'NULL') => env.DB.prepare(`INSERT INTO ot_desvios
  (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
  ('${id}', 'proj-a', '${site}', 'fluxo', 'chave-${id}', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', '${situacao}', ${aceito})`);
const EM_3_DIAS = "datetime('now', '+3 days')";
let gestor: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES
      ('sA', 'proj-a', 'SE Norte Exemplo', 'em_operacao', NULL), ('sB', 'proj-a', 'SE Obra Exemplo', 'em_obra', ${EM_3_DIAS}),
      ('sC', 'proj-a', 'SE Sul Exemplo', 'base_em_aprovacao', NULL)`),
    desvio('dA', 'sA'), desvio('dB', 'sB'), desvio('dAc', 'sA', 'aceito', EM_3_DIAS),
  ]);
  await concederModulos(['u-g'], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
});

describe('?modulo=ot: o item leva o site quando é de um site só', () => {
  it('desvios (fora da obra), base, obra e aceite levam o site e a aba', async () => {
    const f = await fazer(gestor);
    expect(item(f, /desvio aberto/)).toMatchObject({ texto: '1 desvio aberto', aba: 'desvios', site: 'sA' }); // o desvio de sB (em obra) não conta
    expect(item(f, /base aguardando/)).toMatchObject({ aba: 'base', site: 'sC' });
    expect(item(f, /obra vence/)).toMatchObject({ site: 'sB' });
    expect(item(f, /obra vence/)).not.toHaveProperty('aba');
    expect(item(f, /aceite de desvio/)).toMatchObject({ aba: 'desvios', site: 'sA' });
  });
  it('dois sites no mesmo grupo: o item vai sem site (a tela abre a lista)', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('sD', 'proj-a', 'SE Leste Exemplo', 'em_operacao', NULL),
        ('sE', 'proj-a', 'SE Oeste Exemplo', 'base_em_aprovacao', NULL), ('sF', 'proj-a', 'SE Obra Dois', 'em_obra', ${EM_3_DIAS})`),
      desvio('dD', 'sD'), desvio('dDc', 'sD', 'aceito', EM_3_DIAS),
    ]);
    const f = await fazer(gestor);
    for (const re of [/desvios abertos/, /bases aguardando/, /obras vencem/, /aceites de desvio/]) {
      expect(item(f, re), String(re)).toBeTruthy();
      expect(item(f, re), String(re)).not.toHaveProperty('site');
    }
  });
});
