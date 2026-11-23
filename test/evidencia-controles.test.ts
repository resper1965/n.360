// Evidência ligada a vários controles (N:N, migration 0119). Um mesmo documento sustenta vários controles sem ser duplicado;
// evidence.control_id fica como o primeiro vínculo, para leitura compatível.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, execSql } from './helpers/d1';
import migration0119 from '../migrations/0119_evidencia_controles.sql?raw';

const P = 'p-n2n';
let cons: Record<string, string>;
const chamar = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...cons, 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env);
const vinculos = async (ev: string) =>
  (await env.DB.prepare('SELECT control_id FROM evidencia_controles WHERE evidence_id = ? ORDER BY control_id').bind(ev).all<{ control_id: string }>()).results.map((r) => r.control_id);
const principal = async (ev: string) => (await env.DB.prepare('SELECT control_id FROM evidence WHERE id = ?').bind(ev).first<{ control_id: string | null }>())?.control_id;

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-outro', 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES
      ('c-1', ?1, 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented'),
      ('c-2', ?1, 'ISO 27001:2022', 'A.5.2 Papéis', 'Implemented'),
      ('c-3', ?1, 'ISO 27001:2022', 'A.5.3 Segregação', 'Implemented'),
      ('c-fora', 'p-outro', 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    // Nasce com control_id: o gatilho evidencia_controle_inicial grava o primeiro vínculo.
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-1', ?, 'c-1', 'politica.pdf', 'k/1', 'h1', 'alguem@cliente.com')`).bind(P),
  ]);
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

describe('migration 0119 — evidencia_controles', () => {
  it('schema.sql e a migration criam a mesma tabela; repetível', async () => {
    const definicao = async () => ((await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'evidencia_controles'`).first<{ sql: string }>())?.sql ?? '').replace(/\s+/g, ' ').trim();
    const doSchema = await definicao();
    expect(doSchema).toContain('PRIMARY KEY (evidence_id, control_id)');
    await execSql('DROP TABLE evidencia_controles; DROP TRIGGER evidencia_controle_inicial;');
    await execSql(migration0119);
    await execSql(migration0119);
    expect(await definicao()).toBe(doSchema);
  });

  it('nenhuma evidência existente perde vínculo: o control_id de hoje vira o primeiro vínculo', async () => {
    // Estado de antes da 0119: sem a tabela nem o gatilho, só evidence.control_id.
    await execSql('DROP TABLE evidencia_controles; DROP TRIGGER evidencia_controle_inicial;');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by, created_at) VALUES ('ev-a', ?, 'c-2', 'a.pdf', 'k/a', 'ha', 'ana@cliente.com', '2026-01-02 10:00:00')`).bind(P),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-sem', ?, NULL, 'b.pdf', 'k/b', 'hb', 'ana@cliente.com')`).bind(P),
      // Dado legado com controle de OUTRO projeto: não vira vínculo (seria evidência de um cliente no controle de outro).
      env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-cruzada', ?, 'c-fora', 'c.pdf', 'k/c', 'hc', 'ana@cliente.com')`).bind(P),
    ]);
    const antes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM evidence e JOIN compliance_controls c ON c.id = e.control_id AND c.project_id = e.project_id`).first<{ n: number }>();
    await execSql(migration0119);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM evidencia_controles').first<{ n: number }>())!.n).toBe(antes!.n);
    expect(await vinculos('ev-1')).toEqual(['c-1']);
    expect(await vinculos('ev-a')).toEqual(['c-2']);
    expect(await env.DB.prepare(`SELECT ligado_por, created_at FROM evidencia_controles WHERE evidence_id = 'ev-a'`).first()).toEqual({ ligado_por: 'ana@cliente.com', created_at: '2026-01-02 10:00:00' });
    expect(await vinculos('ev-sem')).toEqual([]);
    expect(await vinculos('ev-cruzada')).toEqual([]);
    // evidence.control_id não é tocado pela migration.
    expect(await principal('ev-cruzada')).toBe('c-fora');
  });

  it('o banco recusa vínculo a controle de outro projeto; apagar a evidência apaga os vínculos', async () => {
    await expect(env.DB.prepare(`INSERT INTO evidencia_controles (evidence_id, control_id, project_id) VALUES ('ev-1', 'c-fora', ?)`).bind(P).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM evidence WHERE id = 'ev-1'`).run();
    expect(await vinculos('ev-1')).toEqual([]);
  });
});

describe('ligar e desligar controles numa evidência', () => {
  it('ligar a um segundo controle: aparece nos dois, sem duplicar a evidência; control_id segue o primeiro', async () => {
    const r = await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-2' });
    expect(r.status, await r.clone().text()).toBe(201);
    // pelo código do controle também ("A.5.3"), como no upload
    expect((await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'A.5.3' })).status).toBe(201);
    expect(await vinculos('ev-1')).toEqual(['c-1', 'c-2', 'c-3']);
    expect(await principal('ev-1')).toBe('c-1');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM evidence').first<{ n: number }>())!.n).toBe(1);

    const lista = await (await chamar('GET', `/api/v1/projects/${P}/evidence`)).json<any>();
    expect(lista.evidence[0]).toMatchObject({ id: 'ev-1', control_id: 'c-1', control_ids: ['c-1', 'c-2', 'c-3'] });
    expect((await (await chamar('GET', '/api/v1/evidence/ev-1/detail')).json<any>()).control_ids).toEqual(['c-1', 'c-2', 'c-3']);

    const trace = await (await chamar('GET', `/api/v1/projects/${P}/traceability`)).json<any>();
    for (const ct of ['c-1', 'c-2', 'c-3']) expect(trace.controls.find((x: any) => x.id === ct).evidence.map((e: any) => e.id)).toEqual(['ev-1']);
    const gap = await (await chamar('GET', `/api/v1/projects/${P}/gap-analysis`)).json<any>();
    expect(gap.controls_with_evidence).toBe(3);

    const trilha = await env.DB.prepare(`SELECT actor, details FROM audit_logs WHERE action = 'evidence.controle_ligado' ORDER BY rowid`).all<any>();
    expect(trilha.results.map((t) => t.details)).toEqual(['Evidência ev-1 ligada ao controle c-2.', 'Evidência ev-1 ligada ao controle c-3.']);
    expect(trilha.results[0].actor).toBe('cons@ness.lat');
  });

  it('ligar de novo não duplica (200, ligado false); controle de outro projeto é 400 e não grava', async () => {
    const de_novo = await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-1' });
    expect(de_novo.status).toBe(200);
    expect((await de_novo.json<any>()).ligado).toBe(false);
    const fora = await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-fora' });
    expect(fora.status).toBe(400);
    expect(await vinculos('ev-1')).toEqual(['c-1']);
  });

  it('desligar o controle principal passa control_id ao vínculo que sobra; desligar o último deixa sem controle', async () => {
    await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-2' });
    const r = await chamar('DELETE', '/api/v1/evidence/ev-1/controles/c-1');
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await vinculos('ev-1')).toEqual(['c-2']);
    expect(await principal('ev-1')).toBe('c-2');
    expect((await chamar('DELETE', '/api/v1/evidence/ev-1/controles/c-1')).status).toBe(404);
    expect((await chamar('DELETE', '/api/v1/evidence/ev-1/controles/c-2')).status).toBe(200);
    expect(await principal('ev-1')).toBeNull();
    const t = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'evidence.controle_desligado' AND details LIKE '%ev-1%'`).first<{ n: number }>();
    expect(t!.n).toBe(2);
  });

  it('o PUT antigo (control_id) troca só o controle principal e mantém os outros vínculos', async () => {
    await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-2' });
    expect((await chamar('PUT', '/api/v1/evidence/ev-1', { control_id: 'c-3' })).status).toBe(200);
    expect(await vinculos('ev-1')).toEqual(['c-2', 'c-3']);
    expect(await principal('ev-1')).toBe('c-3');
  });

  it('a prontidão e o readiness contam o controle ligado pela segunda via como "com evidência"', async () => {
    await chamar('POST', '/api/v1/evidence/ev-1/controles', { control_id: 'c-2' });
    const r = await (await chamar('GET', `/api/v1/projects/${P}/readiness-check`)).json<any>();
    const semEvid = (r.achados ?? []).filter((a: any) => a.requisito === 'Evidência do controle').map((a: any) => a.referencia);
    expect(semEvid).toEqual(['c-3']);
  });
});
