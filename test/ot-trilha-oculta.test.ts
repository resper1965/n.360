import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { exportarProjeto } from '../src/portabilidade';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos } from './helpers/d1';

const chamar = (h: Record<string, string>, caminho: string, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...workerEnv(), ...extra });

const CHAVE = 'chave-trilha-ot-leitura';
const ID = 'DESVIO-ID-123';
const OT = 'ot.desvio.tratado';
let comOt: Record<string, string>, semOt: Record<string, string>, tecnico: Record<string, string>, comOtSemModuloNoProjeto: Record<string, string>;
let chave: Record<string, string>;

const linha = (id: string, acao: string, projeto: string, tipo: string, entidade: string) =>
  env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id) VALUES (?, ?, 'x@y.z', 'detalhe', ?, ?, ?)`).bind(id, acao, projeto, tipo, entidade);

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarOt('proj-a'); // proj-b fica sem o n.ot
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('t-ot', 't-ot@c.teste', 'x', 'Com OT', 'org_user', 'proj-a'),
      ('t-sem', 't-sem@c.teste', 'x', 'Sem OT', 'org_user', 'proj-a'),
      ('t-tec', 't-tec@c.teste', 'x', 'Tecnico', 'org_user', 'proj-a'),
      ('t-b', 't-b@c.teste', 'x', 'OT so na pessoa', 'org_user', 'proj-b')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-tr', 'proj-a', ?, 'leitura', 'read', 'Active')`).bind(await sha256Hex(CHAVE)),
    linha('al-ot-a', OT, 'proj-a', 'ot_desvio', ID),
    linha('al-capa-a', 'capa_created', 'proj-a', 'capa', 'CAPA-OK-1'),
    linha('al-ot-b', OT, 'proj-b', 'ot_desvio', ID + '-B'),
    linha('al-capa-b', 'capa_created', 'proj-b', 'capa', 'CAPA-OK-B'),
  ]);
  await concederModulos(['t-ot', 't-b'], ['iso', 'ot']);
  await concederModulos(['t-sem', 't-tec'], ['iso']);
  const s = (id: string, p: string) => sessionFor({ id, email: `${id}@c.teste`, role: 'org_user', client_project_id: p });
  comOt = await s('t-ot', 'proj-a'); semOt = await s('t-sem', 'proj-a'); tecnico = await s('t-tec', 'proj-a');
  comOtSemModuloNoProjeto = await s('t-b', 'proj-b');
  chave = { 'X-API-Key': CHAVE };
});

const texto = async (r: Response) => { const t = await r.text(); expect(r.status, t.slice(0, 200)).toBe(200); return t; };
const ROTAS = ['audit-trail', 'audit-pack', 'export/audit-log', 'export'];

describe('audit-trail, audit-pack, CSV e exportação sem ot.% para quem não tem o n.ot', () => {
  for (const rota of ROTAS) {
    it(`${rota}: chave de API de leitura não recebe ot.% nem o id; capa_created fica`, async () => {
      const t = await texto(await chamar(chave, `/api/v1/projects/proj-a/${rota}`));
      expect(t).not.toContain(OT); expect(t).not.toContain(ID); expect(t).toContain('capa_created');
    });
  }
  for (const rota of ['audit-trail', 'audit-pack', 'export/audit-log']) {
    it(`${rota}: pessoa sem ot e técnico não recebem ot.% nem o id`, async () => {
      for (const h of [semOt, tecnico]) {
        const t = await texto(await chamar(h, `/api/v1/projects/proj-a/${rota}`));
        expect(t).not.toContain(OT); expect(t).not.toContain(ID); expect(t).toContain('capa_created');
      }
    });
    it(`${rota}: pessoa com ot (pessoa e projeto) continua vendo`, async () => {
      const t = await texto(await chamar(comOt, `/api/v1/projects/proj-a/${rota}`));
      expect(t).toContain(OT);
      if (rota !== 'export/audit-log') expect(t).toContain(ID);
      expect(t).toContain('capa_created');
    });
  }
  it('export: pessoa sem ot no projeto com ot é recusada (403) sem vazar o id', async () => {
    for (const h of [semOt, tecnico]) {
      const r = await chamar(h, '/api/v1/projects/proj-a/export');
      expect(r.status).toBe(403);
      expect(await r.text()).not.toContain(ID);
    }
  });
  it('export: pessoa com ot em projeto com ot leva as linhas ot.%', async () => {
    const t = await texto(await chamar(comOt, '/api/v1/projects/proj-a/export'));
    expect(t).toContain(OT); expect(t).toContain(ID);
  });
  for (const rota of ['audit-trail', 'audit-pack', 'export/audit-log', 'export']) {
    it(`${rota}: projeto SEM o módulo ot, mesmo pessoa com ot, não recebe ot.%`, async () => {
      const t = await texto(await chamar(comOtSemModuloNoProjeto, `/api/v1/projects/proj-b/${rota}`));
      expect(t).not.toContain(OT); expect(t).not.toContain(ID + '-B'); expect(t).toContain('capa_created');
    });
  }
  it('exportarProjeto sem o 4o argumento fecha por padrao (sem principal: backup/job nao leva ot.%)', async () => {
    const dados = JSON.stringify((await exportarProjeto(workerEnv() as any, 'proj-a')).dados);
    expect(dados).not.toContain(OT); expect(dados).toContain('capa_created');
    expect(JSON.stringify((await exportarProjeto(workerEnv() as any, 'proj-a', false, true)).dados)).toContain(OT);
  });
});
