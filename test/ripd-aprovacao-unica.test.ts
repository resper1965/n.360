import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { assinaturaDpia } from '../src/services/pedidos';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

/** Decisão do dono de 20/10/2026 (spec 2026-10-20-frente2-regras-unicas-design.md, B1). */
const P = 'ru-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
const ler = (id: string) => env.DB.prepare('SELECT status, dpo_signature, ceo_signature, dpo_approved_at FROM dpia_assessments WHERE id = ?').bind(id).first<Record<string, unknown>>();
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P).run();
  await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('ru-1', ?, 'Folha', 'Draft'), ('ru-2', ?, 'CRM', 'Draft'), ('ru-3', ?, 'Ponto', 'Draft'), ('ru-4', ?, 'Acesso', 'Draft')`).bind(P, P, P, P).run();
  await habilitarPrivacy(P);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('RIPD: uma assinatura basta e mudar conteúdo invalida', () => {
  it('só a do CEO aprova; só a do CISO também', async () => {
    await (await assinaturaDpia(env.DB, P, 'ru-1', 'ceo', 'Diretora'))!.run();
    expect((await ler('ru-1'))!.status).toBe('Approved');
    await (await assinaturaDpia(env.DB, P, 'ru-2', 'ciso', 'Encarregado'))!.run();
    expect((await ler('ru-2'))!.status).toBe('Approved');
  });

  it('editar o conteúdo de um RIPD aprovado zera as assinaturas, volta a rascunho e grava a trilha', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-2', { risks_identified: 'Risco novo' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler('ru-2')).toMatchObject({ status: 'Draft', dpo_signature: null, ceo_signature: null, dpo_approved_at: null });
    const log = await env.DB.prepare(`SELECT project_id, details FROM audit_logs WHERE action = 'dpia.aprovacao_invalidada'`).first<{ project_id: string; details: string }>();
    expect(log!.project_id).toBe(P);
    expect(log!.details).toContain('risks_identified');
    expect(log!.details).not.toContain('Risco novo');
  });

  it('PUT sem mudança de conteúdo mantém a aprovação, mesmo com status no corpo', async () => {
    await (await assinaturaDpia(env.DB, P, 'ru-3', 'ciso', 'Encarregado'))!.run();
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-3', { processing_name: 'Ponto', status: 'Draft' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler('ru-3')).toMatchObject({ status: 'Approved', dpo_signature: 'Encarregado' });
  });

  it('rascunho para revisão pelo PUT não zera nada (não havia assinatura)', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-4', { status: 'Under Review' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await ler('ru-4'))!.status).toBe('Under Review');
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'dpia.aprovacao_invalidada' AND details LIKE '%ru-4%'`).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('salvar pela tela sem mudar nada (campos vazios chegam como texto vazio) mantém a aprovação', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('ru-5', ?, 'Visitas', 'Draft')`).bind(P).run();
    await (await assinaturaDpia(env.DB, P, 'ru-5', 'ceo', 'Diretora'))!.run();
    const vazio = { system_name: '', data_flow_description: '', data_subjects_types: '', personal_data_categories: '', risks_identified: '',
      mitigation_measures: '', dpo_opinion: '', necessity_proportionality: '' }; // os campos que a tela (updateDPIA) manda
    const r = await chamar(consultor, 'PUT', '/api/v1/dpia/ru-5', { processing_name: 'Visitas', ...vazio });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await ler('ru-5')).toMatchObject({ status: 'Approved', ceo_signature: 'Diretora' });
  });
});
