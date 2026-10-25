import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedTwoProjects } from './helpers/d1';
import { descartarRascunho } from '../src/services/documentos';

const H = (c: string) => c.repeat(64);
const estados = async (documentoId: string) =>
  (await env.DB.prepare(`SELECT estado FROM documento_versoes WHERE documento_id = ? ORDER BY numero`).bind(documentoId).all<{ estado: string }>()).results.map((v) => v.estado);

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('dr-doc', 'proj-a', 'politica', 'POL-X-001 Teste', 'vigente')`),
    env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado, origem, criado_por) VALUES
      ('dr-v1', 'proj-a', 'dr-doc', 1, 'Vigente', '${H('a')}', 'vigente', 'humano', 'x@ness.lat'),
      ('dr-v2', 'proj-a', 'dr-doc', 2, 'Proposta', '${H('b')}', 'rascunho', 'agente', 'x@ness.lat')`),
  ]);
});

describe('descartarRascunho', () => {
  it('documento de outro projeto: 404', async () => {
    expect(await descartarRascunho(env.DB, 'proj-b', 'dr-doc', 'x')).toMatchObject({ ok: false, status: 404 });
  });

  it('apaga só o rascunho e mantém a vigente; sem rascunho dá 404', async () => {
    expect(await descartarRascunho(env.DB, 'proj-a', 'dr-doc', 'ator@ness.lat')).toEqual({ ok: true });
    expect(await estados('dr-doc')).toEqual(['vigente']);
    expect(await descartarRascunho(env.DB, 'proj-a', 'dr-doc', 'ator@ness.lat')).toMatchObject({ ok: false, status: 404 });
  });
});
