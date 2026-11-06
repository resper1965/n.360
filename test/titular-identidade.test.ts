// Conferência de identidade do pedido do titular (spec 2026-11-06, migration 0104). Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

const P = 'tid-proj';
const OUTRO = 'tid-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('tid-a', 'ana-tid@ness.lat', 'x', 'Ana Exemplo', 'consultor', NULL, 'org_ness'), ('tid-cli', 'cli-tid@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tid', ?, 'Ana', 'ana-tid@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em) VALUES ('tid-p', ?1, 'PT-2026-0001', 'acesso', '2026-10-01'), ('tid-o', ?2, 'PT-2026-0001', 'acesso', '2026-10-01')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('tid-cli', ['privacy']);
  ana = await sessionFor({ id: 'tid-a', email: 'ana-tid@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'tid-cli', email: 'cli-tid@cliente.com', role: 'org_user', client_project_id: P });
});

describe('conferência de identidade do titular', () => {
  it('grava método e observação, carimba quem e quando; regravar troca; null limpa', async () => {
    expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, { metodo: 'documento_foto', observacao: 'Conferido por vídeo com documento' })).status).toBe(200);
    let p = await json(await chamar(ana, 'GET', `${B}/titular-pedidos/tid-p`));
    expect(p).toMatchObject({ identidade_metodo: 'documento_foto', identidade_obs: 'Conferido por vídeo com documento', identidade_por: 'ana-tid@ness.lat', identidade_por_nome: 'Ana Exemplo' });
    expect(p.identidade_em).toBeTruthy();
    expect((await json(await chamar(ana, 'GET', `${B}/titular-pedidos`))).find((x: any) => x.id === 'tid-p').identidade_metodo).toBe('documento_foto');
    expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, { metodo: 'presencial' })).status).toBe(200);
    p = await json(await chamar(ana, 'GET', `${B}/titular-pedidos/tid-p`));
    expect(p).toMatchObject({ identidade_metodo: 'presencial', identidade_obs: null });
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular_pedido.identidade' AND project_id = ? ORDER BY rowid`).bind(P).all<any>();
    expect(t.results.map((r) => r.details)).toEqual(['Pedido PT-2026-0001: documento_foto', 'Pedido PT-2026-0001: presencial']);
    expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, { metodo: null })).status).toBe(200);
    p = await json(await chamar(ana, 'GET', `${B}/titular-pedidos/tid-p`));
    expect(p).toMatchObject({ identidade_metodo: null, identidade_obs: null, identidade_por: null, identidade_em: null });
  });

  it('recusa: método fora da lista, campo extra, número de documento, CPF, e-mail, longo; outro projeto 404; cliente 403', async () => {
    for (const corpo of [{ metodo: 'telepatia' }, { metodo: 'outro', extra: 1 }, {}, { metodo: 'outro', observacao: 'CPF 123.456.789-09' },
      { metodo: 'outro', observacao: 'RG 12 345 678' }, { metodo: 'outro', observacao: 'mandou de e@exemplo.com' }, { metodo: 'outro', observacao: 'x'.repeat(501) }])
      expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, corpo)).status, JSON.stringify(corpo).slice(0, 60)).toBe(400);
    expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, { metodo: 'outro', observacao: 'Ligou em 06/11/2026 às 10h' })).status).toBe(200);
    expect((await chamar(ana, 'PUT', `${B}/titular-pedidos/tid-o/identidade`, { metodo: 'outro' })).status).toBe(404);
    expect((await chamar(cliente, 'PUT', `${B}/titular-pedidos/tid-p/identidade`, { metodo: 'outro' })).status).toBe(403);
  });
});
