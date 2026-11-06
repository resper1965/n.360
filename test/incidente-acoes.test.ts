// Ações corretivas do incidente (fatia 4, migration 0100): mesma corrective_actions, protocolo -PA derivado, anexos. Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

const P = 'ia-proj';
const OUTRO = 'ia-outro';
const B = `/api/v1/projects/${P}`;
let consultor: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ia-cons', 'cons-ia@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('ia-cli', 'cli-ia@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ia', ?, 'Cons', 'cons-ia@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ia-p1', ?1, 'pessoa', 'Ana Exemplo'), ('ia-p-o', ?2, 'pessoa', 'Alheia')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status) VALUES ('ia-in', ?1, 'IN-2026-0007', 'Incidente exemplo', '2026-10-01', 'aberto'), ('ia-in-o', ?2, 'IN-2026-0001', 'Alheio', '2026-10-01', 'aberto')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('ia-cli', ['privacy']);
  consultor = await sessionFor({ id: 'ia-cons', email: 'cons-ia@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'ia-cli', email: 'cli-ia@cliente.com', role: 'org_user', client_project_id: P });
});

describe('ações corretivas do incidente', () => {
  it('nasce sem ação; cria com tratamento e prazo opcional; protocolo -PA na ordem de criação; conclui e reabre', async () => {
    expect((await json(await chamar(consultor, 'GET', `${B}/incidentes/ia-in/acoes`))).acoes).toEqual([]);
    const c1 = await chamar(consultor, 'POST', `${B}/incidentes/ia-in/acoes`, { title: 'Isolar o servidor', tratamento: 'contencao', assigned_to_parte_id: 'ia-p1' });
    expect(c1.status, await c1.clone().text()).toBe(201);
    const c2 = await chamar(consultor, 'POST', `${B}/incidentes/ia-in/acoes`, { title: 'Revisar acessos', tratamento: 'aperfeicoamento', due_date: '2026-12-01', description: 'Detalhe (exemplo)' });
    expect(c2.status).toBe(201);
    const { acoes } = await json(await chamar(consultor, 'GET', `${B}/incidentes/ia-in/acoes`));
    expect(acoes.map((a: any) => [a.protocolo, a.title, a.tratamento, a.due_date, a.status, a.assigned_to_parte_nome])).toEqual([
      ['IN-2026-0007-PA01', 'Isolar o servidor', 'contencao', null, 'Open', 'Ana Exemplo'],
      ['IN-2026-0007-PA02', 'Revisar acessos', 'aperfeicoamento', '2026-12-01', 'Open', null],
    ]);
    const id = (await json(c1)).id;
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/ia-in/acoes/${id}`, { status: 'Closed' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT status, completed_at FROM corrective_actions WHERE id = ?').bind(id).first<any>()).completed_at).toBeTruthy();
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/ia-in/acoes/${id}`, { status: 'Open' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT completed_at FROM corrective_actions WHERE id = ?').bind(id).first<any>()).completed_at).toBeNull();
    // A mesma ação aparece na CAPA (é o mesmo cadastro, ligado pelo incidente).
    expect((await env.DB.prepare('SELECT incidente_id FROM corrective_actions WHERE id = ?').bind(id).first<any>()).incidente_id).toBe('ia-in');
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'incidente.acao'`).all<{ details: string }>();
    expect(JSON.stringify(trilha.results)).not.toContain('Isolar o servidor');
  });

  it('recusa: tratamento fora da lista, campo extra, pessoa de outro projeto, ação ou incidente de outro projeto; cliente só lê', async () => {
    for (const corpo of [{ title: 'X', tratamento: 'mitigar' }, { title: 'X', extra: 1 }, { title: '' }, { title: 'X', due_date: '01/12/2026' }]) {
      expect((await chamar(consultor, 'POST', `${B}/incidentes/ia-in/acoes`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar(consultor, 'POST', `${B}/incidentes/ia-in/acoes`, { title: 'X', assigned_to_parte_id: 'ia-p-o' })).status).toBe(400);
    expect((await chamar(consultor, 'POST', `${B}/incidentes/ia-in-o/acoes`, { title: 'X' })).status).toBe(404);
    await env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, incidente_id, title, status) VALUES ('ia-ca-o', ?, 'ia-in-o', 'Alheia', 'Open')`).bind(OUTRO).run();
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/ia-in/acoes/ia-ca-o`, { status: 'Closed' })).status).toBe(404);
    expect((await chamar(cliente, 'GET', `${B}/incidentes/ia-in/acoes`)).status).toBe(200);
    expect((await chamar(cliente, 'POST', `${B}/incidentes/ia-in/acoes`, { title: 'X' })).status).toBe(403);
    // O banco recusa tratamento fora da lista também por SQL direto.
    await expect(env.DB.prepare(`UPDATE corrective_actions SET tratamento = 'mitigar' WHERE id = 'ia-ca-o'`).run()).rejects.toThrow(/CHECK/);
  });

  it('anexos da ação: anexa PDF, lista, baixa e remove; ação de outro incidente não alcança', async () => {
    const id = (await json(await chamar(consultor, 'POST', `${B}/incidentes/ia-in/acoes`, { title: 'Com anexo' }))).id;
    const envia = (url: string, bytes: Uint8Array, nome: string) => {
      const fd = new FormData(); fd.append('file', new File([bytes], nome));
      return app.fetch(new Request(`http://localhost${url}`, { method: 'POST', headers: consultor, body: fd }), workerEnv());
    };
    expect((await envia(`${B}/incidentes/ia-in/acoes/${id}/anexos`, new Uint8Array([1, 2, 3, 4]), 'falso.pdf')).status).toBe(400);
    const r = await envia(`${B}/incidentes/ia-in/acoes/${id}/anexos`, PDF, 'plano.pdf');
    expect(r.status, await r.clone().text()).toBe(201);
    const anexoId = (await json(r)).id;
    const { anexos } = await json(await chamar(consultor, 'GET', `${B}/incidentes/ia-in/acoes/${id}/anexos`));
    expect(anexos.map((a: any) => a.file_name)).toEqual(['plano.pdf']);
    expect((await chamar(consultor, 'GET', `${B}/incidentes/ia-in/acoes/${id}/anexos/${anexoId}`)).status).toBe(200);
    // Pela rota de outro incidente a ação não existe.
    expect((await envia(`${B}/incidentes/ia-in-o/acoes/${id}/anexos`, PDF, 'x.pdf')).status).toBe(404);
    expect((await chamar(consultor, 'DELETE', `${B}/incidentes/ia-in/acoes/${id}/anexos/${anexoId}`)).status).toBe(200);
    expect((await json(await chamar(consultor, 'GET', `${B}/incidentes/ia-in/acoes/${id}/anexos`))).anexos).toEqual([]);
  });
});
