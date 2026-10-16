import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { designarConsultor } from './helpers/d1';
import { semearBancada, chamar, type Sessoes } from './helpers/passos';
import { formaDe } from './helpers/contrato';
import bancadaJson from '../contracts/bancada/bancada.json';
import passoJson from '../contracts/bancada/passo.json';

const chaves = (o: any) => Object.keys(o).sort();

describe('rotas de leitura da bancada', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await semearBancada();
    await env.DB.prepare("INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-vazio','V','ISO 27001','controller','Active')").run();
  });

  it('catalogo: 6 etapas, 41 fases, 132 passos e cache privado', async () => {
    const r = await chamar('GET', '/api/v1/passos/catalogo', s.adm);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=300');
    const j = await r.json<any>();
    expect([j.ok, j.etapas.length, j.fases.length, j.passos.length]).toEqual([true, 6, 41, 132]);
    expect(typeof j.versao).toBe('string');
  });
  it('bancada tem a forma do contrato e conta os 132 passos', async () => {
    const r = await chamar('GET', '/api/v1/projects/p-a/bancada', s.adm);
    expect(r.status, await r.clone().text()).toBe(200);
    const j = await r.json<any>();
    const c = bancadaJson as any;
    expect(chaves(j)).toEqual(chaves(c));
    expect(chaves(j.passos[0])).toEqual(chaves(c.passos[0]));
    expect(chaves(j.fases[0])).toEqual(chaves(c.fases[0]));
    expect(chaves(j.totais)).toEqual(chaves(c.totais));
    expect(chaves(j.projeto)).toEqual(chaves(c.projeto));
    expect(j.passos).toHaveLength(132);
    expect(j.fases).toHaveLength(41);
    expect(j.tem_fases).toBe(true);
    expect(j.continuar).toEqual({ fase: 0, passo: 'p0_1' });
  });
  it('passo tem a forma do contrato; id inexistente e 404', async () => {
    const r = await chamar('GET', '/api/v1/projects/p-a/passos/p3_3', s.adm);
    expect(r.status, await r.clone().text()).toBe(200);
    const j = await r.json<any>();
    const c = passoJson as any;
    expect(chaves(j)).toEqual(chaves(c));
    expect(chaves(j.avaliacao)).toEqual(chaves(c.avaliacao));
    expect(chaves(j.prova)).toEqual(chaves(c.prova));
    expect(chaves(j.passo)).toEqual(chaves(c.passo));
    expect((await chamar('GET', '/api/v1/projects/p-a/passos/p99_9', s.adm)).status).toBe(404);
  });
  it('isolamento: conta de outro projeto toma 403; projeto sem fases devolve tem_fases false', async () => {
    expect((await chamar('GET', '/api/v1/projects/p-b/bancada', s.adm)).status).toBe(403);
    await designarConsultor('cons@ness.lat', 'p-vazio');
    const r = await chamar('GET', '/api/v1/projects/p-vazio/bancada', s.cons);
    expect((await r.json<any>()).tem_fases).toBe(false);
  });
  it('helper de forma', () => { expect(formaDe({ a: [1] })).toEqual({ a: ['number'] }); });
});
