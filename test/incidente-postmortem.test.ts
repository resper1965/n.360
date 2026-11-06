// Post mortem do incidente (fatia 5, migration 0103). Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { PERGUNTAS_POSTMORTEM } from '../src/data/incidente-postmortem';

const P = 'ipm-proj';
const OUTRO = 'ipm-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ipm-a', 'ana-ipm@ness.lat', 'x', 'Ana Exemplo', 'consultor', NULL, 'org_ness'), ('ipm-cli', 'cli-ipm@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ipm-a', ?, 'Ana', 'ana-ipm@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status, risco_titular) VALUES ('ipm-in', ?1, 'IN-2026-0020', 'Aberto exemplo', '2026-10-01', 'aberto', NULL), ('ipm-enc', ?1, 'IN-2026-0021', 'Encerrado exemplo', '2026-10-01', 'encerrado', 'baixo'), ('ipm-o', ?2, 'IN-2026-0001', 'Alheio', '2026-10-01', 'encerrado', 'baixo')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('ipm-cli', ['privacy']);
  ana = await sessionFor({ id: 'ipm-a', email: 'ana-ipm@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'ipm-cli', email: 'cli-ipm@cliente.com', role: 'org_user', client_project_id: P });
});

describe('post mortem do incidente', () => {
  it('são as 14 perguntas do legado; antes do encerramento lê mas não grava', async () => {
    expect(PERGUNTAS_POSTMORTEM).toHaveLength(14);
    const r = await json(await chamar(ana, 'GET', `${B}/incidentes/ipm-in/postmortem`));
    expect(r.aberto).toBe(false);
    expect(r.perguntas).toHaveLength(14);
    expect(r.perguntas.every((p: any) => p.resposta === null)).toBe(true);
    expect((await chamar(ana, 'PUT', `${B}/incidentes/ipm-in/postmortem`, { respostas: { melhorar: 'X' } })).status).toBe(409);
  });

  it('depois do encerramento grava, apaga com null ou branco, não reabre e não leva o texto à trilha', async () => {
    expect((await chamar(ana, 'PUT', `${B}/incidentes/ipm-enc/postmortem`, { respostas: { melhorar: 'Treinar o plantão (texto sigiloso)', autoridades: 'ANPD' } })).status).toBe(200);
    let r = await json(await chamar(ana, 'GET', `${B}/incidentes/ipm-enc/postmortem`));
    expect(r.aberto).toBe(true);
    expect(r.perguntas.find((p: any) => p.id === 'melhorar').resposta).toBe('Treinar o plantão (texto sigiloso)');
    expect((await env.DB.prepare(`SELECT status FROM incidentes WHERE id = 'ipm-enc'`).first<any>()).status).toBe('encerrado');
    expect((await chamar(ana, 'PUT', `${B}/incidentes/ipm-enc/postmortem`, { respostas: { melhorar: null, autoridades: '   ' } })).status).toBe(200);
    r = await json(await chamar(ana, 'GET', `${B}/incidentes/ipm-enc/postmortem`));
    expect(r.perguntas.every((p: any) => p.resposta === null)).toBe(true);
    const { historico } = await json(await chamar(ana, 'GET', `${B}/incidentes/ipm-enc/historico`));
    expect(historico[0]).toMatchObject({ evento: 'Post mortem', detalhe: '2 resposta(s)', nome: 'Ana Exemplo' });
    expect(JSON.stringify(historico)).not.toMatch(/sigiloso/);
  });

  it('recusa: pergunta desconhecida, campo extra, texto longo, outro projeto, cliente só lê', async () => {
    for (const corpo of [{ respostas: { inventada: 'x' } }, { respostas: {} }, { respostas: { melhorar: 'x' }, extra: 1 }, { respostas: { melhorar: 'x'.repeat(5001) } }])
      expect((await chamar(ana, 'PUT', `${B}/incidentes/ipm-enc/postmortem`, corpo)).status, JSON.stringify(corpo).slice(0, 60)).toBe(400);
    expect((await chamar(ana, 'GET', `${B}/incidentes/ipm-o/postmortem`)).status).toBe(404);
    expect((await chamar(ana, 'PUT', `${B}/incidentes/ipm-o/postmortem`, { respostas: { melhorar: 'x' } })).status).toBe(404);
    expect((await chamar(cliente, 'GET', `${B}/incidentes/ipm-enc/postmortem`)).status).toBe(200);
    expect((await chamar(cliente, 'PUT', `${B}/incidentes/ipm-enc/postmortem`, { respostas: { melhorar: 'x' } })).status).toBe(403);
  });

  it('no banco: só incidente encerrado do mesmo projeto, também por SQL direto', async () => {
    const ins = (inc: string, proj: string) => env.DB.prepare(`INSERT INTO incidente_postmortem (incidente_id, project_id, pergunta, resposta) VALUES (?, ?, 'melhorar', 'x')`).bind(inc, proj).run();
    await expect(ins('ipm-in', P)).rejects.toThrow(/encerrado/);
    await expect(ins('ipm-o', P)).rejects.toThrow(/encerrado/);
    await ins('ipm-enc', P);
    await expect(env.DB.prepare(`UPDATE incidente_postmortem SET incidente_id = 'ipm-in' WHERE incidente_id = 'ipm-enc'`).run()).rejects.toThrow(/encerrado/);
  });
});
