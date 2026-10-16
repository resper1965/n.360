import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { workerEnv } from './helpers/d1';
import { semearBancada, chamar, catalogoDeTeste, type Sessoes } from './helpers/passos';
import { __usarCatalogoDeTeste } from '../src/data/passos/catalogo';

const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

// Um `it` por chamador do que a Bancada mudou (upload, aceite de documento, PUT da fase, PUT do checklist).
describe('chamadores do que mudou com a Bancada', () => {
  let s: Sessoes;
  beforeAll(async () => {
    __usarCatalogoDeTeste(catalogoDeTeste());
    s = await semearBancada();
    await env.DB.prepare("INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))").run();
  });
  afterAll(() => __usarCatalogoDeTeste(null));
  const linha = (item: string) => env.DB.prepare("SELECT is_checked, evidence_id FROM checklist_progress WHERE project_id='p-a' AND item_id=?").bind(item).first<{ is_checked: number; evidence_id: string | null }>();
  const marcar = (items: unknown[], h = s.adm, amb: Record<string, unknown> = {}) => chamar('PUT', '/api/v1/projects/p-a/checklist-progress', h, { items }, amb);

  it('POST /documents/upload com item_id liga a evidência e NÃO marca o passo', async () => {
    const form = new FormData();
    form.append('file', new File(['conteudo'], 'politica.pdf', { type: 'application/pdf' }));
    form.append('item_id', 'p3_3');
    const r = await worker.fetch(new Request('http://localhost/api/v1/projects/p-a/documents/upload', { method: 'POST', headers: s.cons, body: form }), workerEnv() as never);
    expect(r.status, await r.clone().text()).toBe(201);
    const l = await linha('p3_3');
    expect(l?.evidence_id).toBeTruthy();
    expect(l?.is_checked).toBe(0);
  });

  it('POST /approve-document liga a evidência e NÃO marca o passo', async () => {
    const r = await chamar('POST', '/api/v1/projects/p-a/approve-document', s.cons, { itemId: 'p3_4', content: '# Declaração' });
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await linha('p3_4');
    expect(l?.evidence_id).toBeTruthy();
    expect(l?.is_checked).toBe(0);
  });

  it('PUT /phases/3: status dá 409 e notes dá 200', async () => {
    const r1 = await chamar('PUT', '/api/v1/projects/p-a/phases/3', s.cons, { status: 'completed' });
    expect(r1.status).toBe(409);
    expect((await r1.json<{ error: string }>()).error).toMatch(/calculada pelos passos/);
    expect((await chamar('PUT', '/api/v1/projects/p-a/phases/3', s.cons, { notes: 'Nota da fase' })).status).toBe(200);
    const f = await env.DB.prepare("SELECT status, notes FROM project_phases WHERE project_id='p-a' AND phase_number=3").first<{ status: string; notes: string }>();
    expect(f?.notes).toBe('Nota da fase');
    expect(f?.status).not.toBe('completed');
  });

  it('PUT /checklist-progress: critério pendente é 409 e nada é gravado', async () => {
    const r = await marcar([{ phase_number: 3, item_id: 'p3_3', is_checked: true, notes: 'x' }]);
    expect(r.status).toBe(409);
    expect((await r.json<{ itens: Array<{ item_id: string }> }>()).itens[0].item_id).toBe('p3_3');
    expect((await linha('p3_3'))?.is_checked).toBe(0);
  });

  it('PUT /checklist-progress: critério cumprido passa, item já marcado reenviado passa, item fora do catálogo passa', async () => {
    await chamar('PUT', '/api/v1/projects/p-a/passos/p3_3/campos', s.adm, { campos: { justificativas: 'A.7.4 fica de fora.' } });
    // p3_3 já tem a evidência ligada pelo upload acima
    const ok = await marcar([{ phase_number: 3, item_id: 'p3_3', is_checked: true, evidence_id: (await linha('p3_3'))!.evidence_id }]);
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await linha('p3_3'))?.is_checked).toBe(1);
    expect((await marcar([{ phase_number: 3, item_id: 'p3_3', is_checked: true }])).status).toBe(200); // aba antiga
    expect((await marcar([{ phase_number: 1, item_id: 'p1_a', is_checked: true }])).status).toBe(200); // sem passo no catálogo
    const f = await env.DB.prepare("SELECT status FROM project_phases WHERE project_id='p-a' AND phase_number=3").first<{ status: string }>();
    expect(f?.status).toBe('in_progress'); // o cache da fase acompanhou (p3_4 ainda aberto)
  });

  it('PUT /checklist-progress: o agente não marca (403), mas pode gravar sem marcar', async () => {
    expect((await marcar([{ phase_number: 3, item_id: 'p3_4', is_checked: true }], {}, { AGENTE })).status).toBe(403);
    expect((await marcar([{ phase_number: 3, item_id: 'p3_4', is_checked: false, notes: 'rascunho' }], {}, { AGENTE })).status).toBe(200);
  });
});
