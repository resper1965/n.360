import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';
import { semearCatalogo, ligarControles } from '../src/services/requisitos';
import { fecharVenda } from '../src/services/fechar-venda';

/**
 * Onda 2, tarefa 3: invariante "controle de 27001:2022 e 27701:2025, criado por QUALQUER caminho, nasce ligado ao
 * requisito quando o catálogo já foi semeado". Cada caminho que cria compliance_controls tem o seu caso.
 */
const db = () => env.DB;
const NORMAS = `('ISO 27001:2022', 'ISO 27701:2025')`;
const semLigacao = async (projeto: string) => (await db().prepare(
  `SELECT count(*) n FROM compliance_controls WHERE project_id = ? AND standard IN ${NORMAS} AND requisito_id IS NULL`).bind(projeto).first<{ n: number }>())!.n;
const total = async (projeto: string) => (await db().prepare(
  `SELECT count(*) n FROM compliance_controls WHERE project_id = ? AND standard IN ${NORMAS}`).bind(projeto).first<{ n: number }>())!.n;
const post = (h: Record<string, string>, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo ?? {}) }), workerEnv() as any);

let h: Record<string, string>;
async function projeto(id: string, standards = 'ISO 27001, ISO 27701') {
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Exemplo', ?, 'Controller', 'Active', 'org_ness')`).bind(id, standards).run();
}

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-adm', 'adm@ness.lat', 'x', 'Adm', 'platform_admin', 'org_ness')`).run();
  await db().prepare(`INSERT OR REPLACE INTO organizations (id, name, slug, plan) VALUES ('org_ness', 'ness.', 'ness', 'interno')`).run();
  h = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin', iat: Date.now() });
});

describe('controles nascem ligados ao requisito (catálogo semeado)', () => {
  beforeEach(async () => { await semearCatalogo(db()); });

  it('criação de projeto (POST /projects)', async () => {
    const r = await post(h, '/api/v1/projects', { client_name: 'Novo', standards: 'ISO 27001, ISO 27701', org_role: 'Controller', modulos: ['iso'] });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
    const id = (await db().prepare(`SELECT id FROM projects WHERE client_name = 'Novo'`).first<{ id: string }>())!.id;
    expect(await total(id)).toBeGreaterThan(0);
    expect(await semLigacao(id)).toBe(0);
  });

  it('seed-27001-2022 e seed-27701-2025', async () => {
    await projeto('ps');
    expect((await post(h, '/api/v1/projects/ps/seed-27001-2022')).status).toBe(200);
    expect((await post(h, '/api/v1/projects/ps/seed-27701-2025')).status).toBe(200);
    expect(await total('ps')).toBeGreaterThan(93);
    expect(await semLigacao('ps')).toBe(0);
  });

  it('migrate-27701 (2013 para 2022) e migrate-27701-2025 (2019 para 2025)', async () => {
    await projeto('pm');
    await db().batch([
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES ('A.5.1.1', 'pm', 'ISO 27001:2013', 'A.5.1.1 — Políticas', 'Implemented', '')`),
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES ('7.2.1', 'pm', 'ISO 27701:2019', '7.2.1 — Finalidade', 'Implemented', '')`),
    ]);
    expect((await post(h, '/api/v1/projects/pm/migrate-27701')).status).toBe(200);
    expect((await post(h, '/api/v1/projects/pm/migrate-27701-2025')).status).toBe(200);
    expect(await total('pm')).toBeGreaterThan(0);
    // 27001:2022 liga tudo. O migrate 27701:2025 grava ids grossos do mapa (ex.: "A.1.1") que o catálogo não tem:
    // esses não têm requisito a que ligar, e só eles podem ficar de fora.
    const orfaos = (await db().prepare(`SELECT c.standard, c.title FROM compliance_controls c WHERE c.project_id = 'pm' AND c.standard IN ${NORMAS} AND c.requisito_id IS NULL
      AND NOT (c.standard = 'ISO 27701:2025' AND NOT EXISTS (SELECT 1 FROM requisitos r WHERE r.fonte_id = 'iso27701:2025' AND r.referencia = c.title))`).all()).results;
    expect(orfaos).toEqual([]);
  });

  it('fecharVenda', async () => {
    const serv = { nome: 'Implementação ISO 27001 e 27701', norma: 'ISO/IEC 27001, ISO/IEC 27701', tipo: 'projeto', descricao: '', premissas: [], exclusoes: [], diasPorFaixa: { '1': 60 },
      fases: [{ nome: 'Diagnóstico', objetivo: '', atividades: '', entregaveis: '', criterioAceite: '', pct: 100, semanas: 2 }] };
    await db().batch([
      db().prepare(`INSERT INTO leads (id, company_name, cnpj, status, org_id) VALUES ('l1', 'Cliente', '11222333000199', 'Proposal', 'org_ness')`),
      db().prepare(`INSERT INTO propostas (id, org_id, lead_id, numero, status, cliente, total_projeto, mensalidade, documento_html, documento_hash, criada_por)
        VALUES ('pp1', 'org_ness', 'l1', 'N-1', 'enviada', 'Cliente Ltda.', 1000, 0, '<p>d</p>', 'hash', 'adm@ness.lat')`),
      db().prepare(`INSERT INTO proposta_itens (id, proposta_id, ordem, servico_id, servico, meses, valor) VALUES ('pi1', 'pp1', 0, NULL, ?, NULL, 1000)`).bind(JSON.stringify(serv)),
    ]);
    const r = await fecharVenda(db(), { propostaId: 'pp1', orgId: 'org_ness', origem: 'link',
      aceite: { nome: 'M', cargo: 'D', email: 'm@c.com', ip: '203.0.113.9' }, atorEmail: 'm@c.com' });
    expect(r.ok).toBe(true);
    const pid = (await db().prepare(`SELECT projeto_id FROM propostas WHERE id = 'pp1'`).first<{ projeto_id: string }>())!.projeto_id;
    expect(await total(pid)).toBeGreaterThan(93);
    expect(await semLigacao(pid)).toBe(0);
  });
});

describe('catálogo ainda não semeado', () => {
  it('controles nascem sem ligação e ligarControles liga depois', async () => {
    await projeto('pn');
    expect((await post(h, '/api/v1/projects/pn/seed-27001-2022')).status).toBe(200);
    expect(await semLigacao('pn')).toBe(93);
    await semearCatalogo(db());
    expect(await ligarControles(db(), 'pn')).toBe(93);
    expect(await semLigacao('pn')).toBe(0);
  });
});
