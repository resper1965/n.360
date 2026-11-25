// GET /api/v1/evidence/:id (a evidência com controles, avaliação e aprovações, sem rastros de IP/navegador) e o filtro
// `?controlId=` da lista do projeto (por id da linha ou código do controle, pelo vínculo N:N, com paginação).
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, sessionFor } from './helpers/d1';

const P = 'p-evl';
let cons: Record<string, string>, cliente: Record<string, string>;
const chamar = (h: Record<string, string>, caminho: string) => worker.fetch(new Request('http://localhost' + caminho, { headers: h }), env);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'),
      ('p-evl-outro', 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES
      ('ctrl-a51', ?1, 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented'), ('ctrl-a52', ?1, 'ISO 27001:2022', 'A.5.2 Papéis', 'Implemented'),
      ('ctrl-fora', 'p-evl-outro', 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by, avaliacao_ia, evaluation_status, evaluation_notes,
        ciso_approved_by, ciso_approved_at, ciso_approved_ip, ciso_approved_ua, created_at) VALUES
      ('ev-1', ?1, 'ctrl-a51', 'politica.pdf', 'k/1', 'h1', 'ana@cliente.com', 'Atende', 'Approved', 'Nota humana', 'Lia Lider', '2026-11-20T10:00:00Z', '10.0.0.1', 'Navegador', '2026-11-01 10:00:00'),
      ('ev-2', ?1, 'ctrl-a52', 'papeis.pdf', 'k/2', 'h2', 'ana@cliente.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-02 10:00:00'),
      ('ev-3', ?1, 'ctrl-a51', 'treino.pdf', 'k/3', 'h3', 'ana@cliente.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-03 10:00:00'),
      ('ev-fora', 'p-evl-outro', 'ctrl-fora', 'x.pdf', 'k/x', 'hx', 'x@outro.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-01 10:00:00')`).bind(P),
    // ev-2 também sustenta A.5.1 (N:N).
    env.DB.prepare(`INSERT INTO evidencia_controles (evidence_id, control_id, project_id, ligado_por) VALUES ('ev-2', 'ctrl-a51', ?, 'cons@ness.lat')`).bind(P),
  ]);
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('GET /api/v1/evidence/:id', () => {
  it('quem alcança o projeto lê a evidência com controles, avaliação e aprovações, sem IP nem navegador', async () => {
    for (const h of [cons, cliente]) {
      const r = await chamar(h, '/api/v1/evidence/ev-1');
      expect(r.status, await r.clone().text()).toBe(200);
      const { evidence } = await r.json<any>();
      expect(evidence).toMatchObject({ id: 'ev-1', project_id: P, control_id: 'ctrl-a51', control_ids: ['ctrl-a51'], avaliacao_ia: 'Atende',
        evaluation_status: 'Approved', evaluation_notes: 'Nota humana', ciso_approved_by: 'Lia Lider', ciso_approved_at: '2026-11-20T10:00:00Z', ceo_approved_by: null });
      expect(evidence).not.toHaveProperty('ciso_approved_ip');
      expect(evidence).not.toHaveProperty('ciso_approved_ua');
    }
  });

  it('de outro projeto e inexistente: 404, a mesma resposta', async () => {
    const fora = await chamar(cons, '/api/v1/evidence/ev-fora');
    const nada = await chamar(cons, '/api/v1/evidence/nao-existe');
    expect(fora.status).toBe(404);
    expect(nada.status).toBe(404);
    expect(await fora.json()).toEqual(await nada.json());
    expect((await chamar(cliente, '/api/v1/evidence/ev-fora')).status).toBe(404);
  });
});

describe('GET /api/v1/projects/:projectId/evidence?controlId=', () => {
  const ids = async (q: string) => {
    const r = await chamar(cons, `/api/v1/projects/${P}/evidence${q}`);
    expect(r.status).toBe(200);
    return { ids: (await r.json<any>()).evidence.map((e: any) => e.id), mais: r.headers.get('X-Has-More') };
  };

  it('filtra pelo vínculo N:N, pelo id da linha ou pelo código do controle', async () => {
    expect((await ids('')).ids).toEqual(['ev-3', 'ev-2', 'ev-1']);
    expect((await ids('?controlId=ctrl-a51')).ids).toEqual(['ev-3', 'ev-2', 'ev-1']);
    expect((await ids('?controlId=A.5.1')).ids).toEqual(['ev-3', 'ev-2', 'ev-1']);
    expect((await ids('?controlId=A.5.2')).ids).toEqual(['ev-2']);
  });

  it('mantém a paginação; controle inexistente ou de outro projeto é lista vazia', async () => {
    expect(await ids('?controlId=A.5.1&limit=2')).toEqual({ ids: ['ev-3', 'ev-2'], mais: 'true' });
    expect(await ids('?controlId=A.5.1&limit=2&offset=2')).toEqual({ ids: ['ev-1'], mais: 'false' });
    expect((await ids('?controlId=A.9.9')).ids).toEqual([]);
    expect((await ids('?controlId=ctrl-fora')).ids).toEqual([]);
  });
});
