import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';
import { itensDoDia, avisosDePrazo } from '../src/services/avisos-prazo';

// Avisos de prazo do n.ot (onda 0). D1 real; HOJE é simulado pelo parâmetro.
// Formatos reais gravados: obra_ate 'AAAA-MM-DD' (ot-fase.ts); aceito_ate 'AAAA-MM-DDT23:59:59.999Z' (routes/ot.ts).
const HOJE = '2026-11-14';
const db = () => env.DB;
const sinos = async (user: string) => (await db().prepare('SELECT type, title, message, link FROM notifications WHERE user_id = ? ORDER BY type').bind(user)
  .all<{ type: string; title: string; message: string; link: string }>()).results;

beforeEach(async () => {
  await applySchema(); await resetData();
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ONS', 'Controller', 'Active', 'org_ness')`).run();
  await habilitarOt('p1');
  await db().prepare(`INSERT INTO ot_requisitos (id, framework, codigo, titulo, versao) VALUES ('rq1', 'F', '9.1', 't', 'v')`).run();
  await db().batch([
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'p1'), ('u-o', 'o@cliente.teste', 'x', 'Outro', 'org_admin', 'p1')`),
    db().prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s1', 'p1', 'SE Norte', 'em_operacao', NULL), ('s2', 'p1', 'SE Sul', 'em_obra', '2026-11-21')`),
    db().prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'p1', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-21T23:59:59.999Z'),
      ('d2', 'p1', 's1', 'fluxo', 'k2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL)`),
    db().prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, proxima_revisao, atualizado_por) VALUES ('a1', 'p1', 'rq1', 'atende', '2026-11-14', 'x')`),
  ]);
  await concederModulos(['u-g'], ['ot']);        // u-o é org_admin do projeto, mas não tem o módulo
  await designarConsultor('c@ness.lat', 'p1');
});

describe('fontes do n.ot', () => {
  it('aceite e obra em D-7, revisão em D0; desvio aberto não entra', async () => {
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    const ot = itens.filter((i) => i.fonte.startsWith('ot_')).map((i) => [i.fonte, i.item_id, i.marco, i.vence_em]);
    expect(ot).toEqual(expect.arrayContaining([['ot_aceite', 'd1', 'D-7', '2026-11-21'], ['ot_obra', 's2', 'D-7', '2026-11-21'], ['ot_revisao', 'a1', 'D0', '2026-11-14']]));
    expect(ot).toHaveLength(3);
  });

  it('aceite e obra não têm marco de atraso', async () => {
    const { itens } = await itensDoDia(db(), '2026-11-25');
    expect(itens.filter((i) => i.fonte === 'ot_aceite' || i.fonte === 'ot_obra')).toEqual([]);
    expect(itens.find((i) => i.fonte === 'ot_revisao')?.marco).toMatch(/^atraso-/);
  });

  it('aceite e obra vão só ao Gestor ARCiber com o módulo; a revisão, a quem tem o n.ot', async () => {
    const c = await db().prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
    await concederModulos([c!.id], ['ot']);
    await avisosDePrazo(workerEnv(), HOJE);
    const g = await sinos('u-g');
    expect(g.map((s) => s.type)).toEqual(['prazo_ot_aceite', 'prazo_ot_obra']);
    expect(g.every((s) => s.link === '/projects/p1/ot')).toBe(true);
    expect(await sinos('u-o')).toEqual([]);
    expect((await sinos(c!.id)).map((s) => s.type)).toEqual(['prazo_ot_revisao']);
  });

  it('idempotente, e o texto não leva endereço nem nome de ativo', async () => {
    await avisosDePrazo(workerEnv(), HOJE);
    await avisosDePrazo(workerEnv(), HOJE);
    const g = await sinos('u-g');
    expect(g).toHaveLength(2);
    const texto = JSON.stringify(g);
    expect(texto).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(texto).toContain('SE Sul');
    expect(g.find((s) => s.type === 'prazo_ot_aceite')!.message).toBe('Aceite de desvio no site SE Norte (prazo 21/11/2026)');
  });
});
