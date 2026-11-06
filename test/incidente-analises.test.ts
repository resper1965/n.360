// Análises e histórico do incidente (fatia 3, migration 0101). Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

const P = 'ian-proj';
const OUTRO = 'ian-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
let bia: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ian-a', 'ana-ian@ness.lat', 'x', 'Ana Exemplo', 'consultor', NULL, 'org_ness'), ('ian-b', 'bia-ian@ness.lat', 'x', 'Bia Exemplo', 'consultor', NULL, 'org_ness'), ('ian-cli', 'cli-ian@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ian-a', ?1, 'Ana', 'ana-ian@ness.lat', 'consultor', 'Consultora'), ('g-ian-b', ?1, 'Bia', 'bia-ian@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status, risco_titular) VALUES ('ian-in', ?1, 'IN-2026-0009', 'Incidente exemplo', '2026-10-01', 'aberto', NULL), ('ian-enc', ?1, 'IN-2026-0010', 'Encerrado exemplo', '2026-10-01', 'encerrado', 'baixo'), ('ian-o', ?2, 'IN-2026-0001', 'Alheio', '2026-10-01', 'aberto', NULL)`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('ian-cli', ['privacy']);
  ana = await sessionFor({ id: 'ian-a', email: 'ana-ian@ness.lat', role: 'consultor' });
  bia = await sessionFor({ id: 'ian-b', email: 'bia-ian@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'ian-cli', email: 'cli-ian@cliente.com', role: 'org_user', client_project_id: P });
});

describe('análises do incidente', () => {
  it('várias análises com autor e data; só o autor altera a sua; o cliente só lê', async () => {
    const r1 = await chamar(ana, 'POST', `${B}/incidentes/ian-in/analises`, { texto: 'Origem provável: credencial vazada (exemplo).' });
    expect(r1.status, await r1.clone().text()).toBe(201);
    const id = (await json(r1)).id;
    expect((await chamar(bia, 'POST', `${B}/incidentes/ian-in/analises`, { texto: 'Logs confirmam acesso às 10h (exemplo).' })).status).toBe(201);
    const { analises } = await json(await chamar(ana, 'GET', `${B}/incidentes/ian-in/analises`));
    expect(analises.map((a: any) => [a.autor_nome, a.pode_editar])).toEqual([['Ana Exemplo', true], ['Bia Exemplo', false]]);
    expect((await chamar(bia, 'PUT', `${B}/incidentes/ian-in/analises/${id}`, { texto: 'Mudado por outra pessoa' })).status).toBe(403);
    expect((await chamar(ana, 'PUT', `${B}/incidentes/ian-in/analises/${id}`, { texto: 'Origem confirmada (exemplo).' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT texto FROM incidente_analises WHERE id = ?').bind(id).first<any>()).texto).toBe('Origem confirmada (exemplo).');
    expect((await chamar(cliente, 'GET', `${B}/incidentes/ian-in/analises`)).status).toBe(200);
    expect((await chamar(cliente, 'POST', `${B}/incidentes/ian-in/analises`, { texto: 'X' })).status).toBe(403);
  });

  it('recusa: texto vazio, campo extra, incidente de outro projeto; encerrado não muda, também no banco', async () => {
    for (const corpo of [{ texto: '   ' }, { texto: 'x', extra: 1 }, {}]) expect((await chamar(ana, 'POST', `${B}/incidentes/ian-in/analises`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    expect((await chamar(ana, 'POST', `${B}/incidentes/ian-o/analises`, { texto: 'X' })).status).toBe(404);
    expect((await chamar(ana, 'POST', `${B}/incidentes/ian-enc/analises`, { texto: 'X' })).status).toBe(409);
    await expect(env.DB.prepare(`INSERT INTO incidente_analises (id, project_id, incidente_id, autor, texto) VALUES ('x1', ?, 'ian-enc', 'a', 'b')`).bind(P).run()).rejects.toThrow(/encerrado/);
    await expect(env.DB.prepare(`INSERT INTO incidente_analises (id, project_id, incidente_id, autor, texto) VALUES ('x2', ?, 'ian-o', 'a', 'b')`).bind(P).run()).rejects.toThrow(/outro projeto/);
  });
});

describe('histórico do incidente', () => {
  it('lê só os eventos do incidente, mais novo primeiro, sem texto livre; exporta CSV', async () => {
    const id = (await json(await chamar(ana, 'POST', `${B}/incidentes`, { titulo: 'Vazamento com título sigiloso', ciencia_em: new Date(Date.now() - 3_600_000).toISOString() }))).id;
    expect((await chamar(ana, 'PUT', `${B}/incidentes/${id}`, { severidade: 'alta', descricao: 'Texto livre sigiloso' })).status).toBe(200);
    expect((await chamar(ana, 'POST', `${B}/incidentes/${id}/analises`, { texto: 'Análise sigilosa' })).status).toBe(201);
    expect((await chamar(ana, 'POST', `${B}/incidentes/${id}/acoes`, { title: 'Ação sigilosa' })).status).toBe(201);
    const { historico } = await json(await chamar(ana, 'GET', `${B}/incidentes/${id}/historico`));
    expect(historico.map((h: any) => h.evento)).toEqual(['Ação corretiva', 'Análise', 'Registro alterado', 'Registrado']);
    expect(historico.find((h: any) => h.evento === 'Registro alterado').detalhe).toBe('descricao, severidade');
    expect(historico[0].nome).toBe('Ana Exemplo');
    expect(JSON.stringify(historico)).not.toMatch(/sigilos/);
    // O histórico de outro incidente não aparece aqui.
    expect((await json(await chamar(ana, 'GET', `${B}/incidentes/ian-in/historico`))).historico.every((h: any) => h.evento === 'Análise')).toBe(true);
    const csv = await chamar(ana, 'GET', `${B}/incidentes/${id}/historico/csv`);
    expect(csv.status).toBe(200);
    const texto = await csv.text();
    expect(texto.split('\r\n')[0]).toBe('﻿"Data";"Evento";"Detalhe";"Quem"');
    expect(texto).toContain('"Registro alterado"');
    expect((await chamar(ana, 'GET', `${B}/incidentes/ian-o/historico`)).status).toBe(404);
  });
});
