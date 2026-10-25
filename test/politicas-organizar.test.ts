import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';

const P = 'p-porg';
let h: Record<string, string>;
const chamar = (metodo: string, caminho: string, corpo?: unknown, hdr = h) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${P}${caminho}`, { method: metodo, headers: { ...hdr, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }), workerEnv() as never);

const R1 = 'iso27001:2022:A.8.24', R2 = 'iso27001:2022:A.5.15';
async function doc(id: string, titulo: string, status: string, controle: string | null) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status, origem_control_id) VALUES (?, ?, 'politica', ?, ?, ?)`).bind(id, P, titulo, status, controle),
    env.DB.prepare(`INSERT INTO documento_versoes (id, documento_id, project_id, numero, estado, texto, hash, criado_por) VALUES (?, ?, ?, 1, 'vigente', 'Texto', 'h', 'x')`).bind(`v-${id}`, id, P),
  ]);
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Org', 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'iso27001:2022', 'A.8.24', 'Criptografia'), (?, 'iso27001:2022', 'A.5.15', 'Acesso')`).bind(R1, R2),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES ('c-cry', ?, 'ISO 27001', 'A.8.24 Criptografia', 'Implemented', ?), ('c-sem', ?, 'ISO 27001', 'A.9.9 Sem catalogo', 'Missing', NULL), ('c-acc', ?, 'ISO 27001', 'A.5.15 Acesso', 'Missing', ?), ('c-old', ?, 'ISO 27001', 'A.1.1 Antigo', 'Missing', NULL)`).bind(P, R1, P, P, R2, P),
  ]);
  await doc('d-ctl', 'Política de Criptografia (controle)', 'vigente', 'c-cry');
  await doc('d-ctl2', 'Política sem catálogo', 'vigente', 'c-sem');
  await doc('d-ctl3', 'Política de Acesso (controle)', 'vigente', 'c-acc');
  await doc('d-obs', 'Política antiga', 'obsoleto', 'c-old');
  await doc('d-tem', 'POL-CRY-001 Criptografia', 'vigente', null);
  await doc('d-tem2', 'POL-ACC-001 Acesso', 'rascunho', null);
  await env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('d-tem', ?, ?)`).bind(R2, P).run();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-porg2', 'Outro', 'ISO 27001', 'controller', 'Active', 'org_ness')`),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c-out', 'p-porg2', 'ISO 27001', 'A.2.2 Fora', 'Missing')`),
  ]);
  await env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status, origem_control_id) VALUES ('d-out', 'p-porg2', 'politica', 'Política de fora', 'vigente', 'c-out')`).run();
  h = await sessionFor({ id: 'po-e', email: 'po@ness.lat', role: 'platform_admin', org_id: 'org_ness' });
});

describe('organizar políticas', () => {
  it('GET separa por controle e temáticas e ignora obsoleto', async () => {
    const r = await (await chamar('GET', '/politicas/organizar')).json<any>();
    expect(r.por_controle.map((x: any) => x.id).sort()).toEqual(['d-ctl', 'd-ctl2', 'd-ctl3']);
    expect(r.por_controle.find((x: any) => x.id === 'd-ctl')).toMatchObject({ controle_id: 'c-cry', controle: 'A.8.24 Criptografia', requisito_id: R1 });
    expect(r.tematicas.map((x: any) => x.id)).toEqual(['d-tem2', 'd-tem']);
    expect(Array.isArray(r.sem_cobertura)).toBe(true);
  });

  it('incorporar liga o requisito, aposenta a origem e mantém as versões', async () => {
    const antes = (await env.DB.prepare(`SELECT count(*) n FROM documento_versoes WHERE documento_id = 'd-ctl'`).first<{ n: number }>())!.n;
    const r = await chamar('POST', '/politicas/organizar/incorporar', { origem: 'd-ctl', destino: 'd-tem' });
    expect(r.status).toBe(200);
    expect((await r.json<any>()).requisitos).toBe(2);
    const reqs = (await env.DB.prepare(`SELECT requisito_id FROM documento_requisitos WHERE documento_id = 'd-tem'`).all()).results.map((x: any) => x.requisito_id).sort();
    expect(reqs).toEqual([R2, R1].sort());
    expect((await env.DB.prepare(`SELECT status FROM documentos WHERE id = 'd-ctl'`).first<any>())!.status).toBe('obsoleto');
    expect((await env.DB.prepare(`SELECT count(*) n FROM documento_versoes WHERE documento_id = 'd-ctl'`).first<{ n: number }>())!.n).toBe(antes);
    expect(await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'politica.incorporada'`).first()).not.toBeNull();
  });

  it('incorporar recusa combinações inválidas', async () => {
    const inc = (origem: string, destino: string) => chamar('POST', '/politicas/organizar/incorporar', { origem, destino });
    expect((await inc('d-ctl3', 'd-ctl2')).status).toBe(400);
    expect((await inc('d-tem2', 'd-tem')).status).toBe(400);
    expect((await inc('d-tem', 'd-tem')).status).toBe(400);
    expect((await inc('d-ctl', 'd-tem')).status).toBe(400);
    expect((await inc('d-ctl2', 'd-tem')).status).toBe(409);
    expect((await inc('nao-existe', 'd-tem')).status).toBe(404);
  });

  it('promover troca título e requisitos e vira temática', async () => {
    const r = await chamar('POST', '/documentos/d-ctl3/promover', { titulo: 'POL-ACC-002 Acesso', requisitos: [R2] });
    expect(r.status).toBe(200);
    const d = await env.DB.prepare(`SELECT titulo, origem_control_id o FROM documentos WHERE id = 'd-ctl3'`).first<any>();
    expect(d).toMatchObject({ titulo: 'POL-ACC-002 Acesso', o: null });
    const o = await (await chamar('GET', '/politicas/organizar')).json<any>();
    expect(o.por_controle.some((x: any) => x.id === 'd-ctl3')).toBe(false);
    expect(o.tematicas.some((x: any) => x.id === 'd-ctl3')).toBe(true);
    const reqs = (await env.DB.prepare(`SELECT requisito_id FROM documento_requisitos WHERE documento_id = 'd-ctl3'`).all()).results.map((x: any) => x.requisito_id);
    expect(reqs).toEqual([R2]);
    expect(await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'politica.promovida'`).first()).not.toBeNull();
  });

  it('promover com requisito desconhecido dá 400 e não muda o título', async () => {
    const r = await chamar('POST', '/documentos/d-ctl2/promover', { titulo: 'POL-NOVA Qualquer', requisitos: ['nao:existe'] });
    expect(r.status).toBe(400);
    expect((await r.json<any>()).desconhecidos).toEqual(['nao:existe']);
    expect((await env.DB.prepare(`SELECT titulo FROM documentos WHERE id = 'd-ctl2'`).first<any>())!.titulo).toBe('Política sem catálogo');
    expect((await chamar('POST', '/documentos/d-tem/promover', { titulo: 'POL-NOVA Qualquer', requisitos: [R1] })).status).toBe(400);
  });

  it('documento de outro projeto dá 404 e promover obsoleto dá 400', async () => {
    expect((await chamar('POST', '/politicas/organizar/incorporar', { origem: 'd-out', destino: 'd-tem' })).status).toBe(404);
    expect((await chamar('POST', '/politicas/organizar/incorporar', { origem: 'd-ctl2', destino: 'd-out' })).status).toBe(404);
    expect((await chamar('POST', '/documentos/d-out/promover', { titulo: 'POL-FORA Qualquer', requisitos: [R1] })).status).toBe(404);
    expect((await chamar('POST', '/documentos/d-obs/promover', { titulo: 'POL-OBS Qualquer', requisitos: [R1] })).status).toBe(400);
  });

  it('client e org_admin recebem 403 nas três', async () => {
    for (const role of ['client', 'org_admin']) {
      const x = await sessionFor({ id: `po-${role}`, email: `${role}@cli.lat`, role, org_id: 'org_ness' });
      expect((await chamar('GET', '/politicas/organizar', undefined, x)).status).toBe(403);
      expect((await chamar('POST', '/politicas/organizar/incorporar', { origem: 'a', destino: 'b' }, x)).status).toBe(403);
      expect((await chamar('POST', '/documentos/d-ctl2/promover', { titulo: 'POL-NOVA Qualquer', requisitos: [R1] }, x)).status).toBe(403);
    }
  });
});
