import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta, f } from './helpers/mcp-agente';
import { montarContexto } from '../src/mcp/contexto';

/**
 * Área comercial para o agente MCP (decisão do dono de 15/10/2026): o agente LÊ e RASCUNHA — lista e lê leads, funil,
 * levantamentos, propostas e serviços; cria lead e muda o status dele (menos "ganho"); cria e edita proposta em rascunho.
 * Gerar, enviar, aceitar, recusar, aceite manual, fechar venda, preço e catálogo seguem humanos. Só o agente de quem é do
 * comercial (`ehComercial`, relido a cada chamada), e só a organização dessa pessoa. Vale com o interruptor desligado.
 */
const OFF = () => ({ ...workerEnv(), COMERCIAL_ATIVO: 'false' });
const json = { 'Content-Type': 'application/json' };
const comoAgente = (caminho: string, props: Record<string, unknown>, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...OFF(), AGENTE: props } as any);
const CA = { userId: 'u-ca', email: 'ca@x.lat', projectId: 'p-x', concessaoId: 'c-ca' };
const CO = { userId: 'u-co', email: 'co@x.lat', projectId: 'p-x', concessaoId: 'c-co' };
const COMERCIAIS = ['niso_comercial_listar', 'niso_comercial_ler', 'niso_comercial_criar_lead', 'niso_comercial_status_lead', 'niso_comercial_rascunhar_proposta'];

async function nomesDaLista(token: string): Promise<string[]> {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, ...json, Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const texto = await r.text();
  const corpo = r.headers.get('Content-Type')?.includes('text/event-stream') ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6) : texto;
  return JSON.parse(corpo).result.tools.map((t: { name: string }) => t.name);
}

describe('agente na área comercial', () => {
  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug, status) VALUES ('org_x', 'Consultoria X', 'cx', 'Active'), ('org_y', 'Consultoria Y', 'cy', 'Active')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-x', 'Cliente X', 'ISO 27001', 'controller', 'Active', 'org_x')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-ca', 'ca@x.lat', ?, 'CA', 'consultoria_admin', 'org_x'), ('u-co', 'co@x.lat', ?, 'CO', 'consultor', 'org_x')`).bind(senha, senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-x', 'CO', 'co@x.lat', 'consultor', 'Consultor')`),
      env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ca', 'u-ca', 'p-x', datetime('now', '+30 days')), ('c-co', 'u-co', 'p-x', datetime('now', '+30 days'))`),
      env.DB.prepare(`INSERT INTO leads (id, company_name, status, org_id) VALUES ('l-x', 'Prospect X', 'New', 'org_x'), ('l-y', 'Prospect Y', 'New', 'org_y')`),
      env.DB.prepare(`INSERT INTO propostas (id, org_id, lead_id, status, cliente, criada_por) VALUES ('pp-y', 'org_y', 'l-y', 'rascunho', 'Prospect Y', 'y@y.lat'), ('pp-g', 'org_x', 'l-x', 'gerada', 'Prospect X', 'ca@x.lat')`),
    ]);
  }, 60_000);

  it('lê o funil da própria organização, com o interruptor desligado', async () => {
    const leads = await comoAgente('/api/v1/leads', CA);
    expect(leads.status).toBe(200);
    expect((await leads.json<any[]>()).map((l) => l.id)).toEqual(['l-x']);
    for (const r of ['/api/v1/funil', '/api/v1/propostas', '/api/v1/servicos', '/api/v1/assessments', '/api/v1/leads/l-x', '/api/v1/propostas/pp-g']) {
      expect((await comoAgente(r, CA)).status, r).toBe(200);
    }
  });

  it('não alcança outra organização', async () => {
    expect((await comoAgente('/api/v1/leads/l-y', CA)).status).toBe(404);
    expect((await comoAgente('/api/v1/propostas/pp-y', CA)).status).toBe(404);
    expect((await comoAgente('/api/v1/propostas/pp-y', CA, { method: 'PUT', headers: json, body: '{"contexto":"x"}' })).status).toBe(404);
  });

  it('cria lead e proposta em rascunho, e edita o rascunho', async () => {
    const lead = await comoAgente('/api/v1/leads', CA, { method: 'POST', headers: json, body: JSON.stringify({ company_name: 'Prospect Novo' }) });
    expect(lead.status).toBe(201);
    const { id: leadId } = await lead.json<any>();
    expect((await env.DB.prepare('SELECT org_id FROM leads WHERE id = ?').bind(leadId).first<any>()).org_id).toBe('org_x');
    expect((await comoAgente(`/api/v1/leads/${leadId}/status`, CA, { method: 'PUT', headers: json, body: '{"status":"Proposal"}' })).status).toBe(200);

    const prop = await comoAgente('/api/v1/propostas', CA, { method: 'POST', headers: json, body: JSON.stringify({ leadId, contexto: 'Rascunho do agente' }) });
    expect(prop.status).toBe(201);
    const p = await prop.json<any>();
    expect([p.status, p.org_id]).toEqual(['rascunho', 'org_x']);
    expect((await comoAgente(`/api/v1/propostas/${p.id}`, CA, { method: 'PUT', headers: json, body: '{"escopo":"Escopo"}' })).status).toBe(200);
    const trilha = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'proposta.criada' AND details LIKE ?`).bind(`%${p.id}%`).first<any>();
    expect(trilha.actor).toContain('agente de ca@x.lat');
  });

  it('não gera, envia, aceita, recusa, fecha venda, mexe em preço nem em catálogo', async () => {
    const recusas: [string, string, unknown?][] = [
      ['POST', '/api/v1/propostas/pp-g/gerar', {}],
      ['POST', '/api/v1/propostas/pp-g/enviar', { email: 'c@cliente.lat' }],
      ['POST', '/api/v1/propostas/pp-g/link', {}],
      ['POST', '/api/v1/propostas/pp-g/aceite-manual', { nome: 'Fulano', cargo: 'CEO', email: 'c@cliente.lat' }],
      ['POST', '/api/v1/propostas/pp-g/aprovar-desconto', {}],
      ['POST', '/api/v1/propostas/pp-g/revisao', {}],
      ['GET', '/api/v1/propostas/pp-g/docx'],
      ['PUT', '/api/v1/pricing-config', { margem: 0 }],
      ['GET', '/api/v1/pricing-config'],
      ['PUT', '/api/v1/org/config', { nome: 'X' }],
      ['POST', '/api/v1/servicos', {}],
      ['PUT', '/api/v1/servicos/s-1', {}],
      ['DELETE', '/api/v1/leads/l-x'],
      ['GET', '/api/v1/leads/consulta-cnpj/11222333000181'],
      ['POST', '/api/v1/leads/l-x/enrich-cnpj', {}],
      ['GET', '/api/v1/proposals'],
    ];
    for (const [method, caminho, corpo] of recusas) {
      const r = await comoAgente(caminho, CA, { method, headers: json, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
      expect(r.status, `${method} ${caminho}`).toBe(403);
    }
    // A página pública da proposta não tem sessão: com o interruptor desligado, some para todos (404).
    expect((await comoAgente('/api/v1/public/propostas/aceitar', CA, { method: 'POST', headers: json, body: '{}' })).status).toBe(404);
    // "Ganho" é o fechamento: humano. A proposta gerada não é rascunho: o agente não a edita.
    await env.DB.prepare(`UPDATE leads SET status = 'Proposal' WHERE id = 'l-x'`).run();
    expect((await comoAgente('/api/v1/leads/l-x/status', CA, { method: 'PUT', headers: json, body: '{"status":"Won"}' })).status).toBe(403);
    await env.DB.prepare(`UPDATE propostas SET status = 'aguardando_aprovacao' WHERE id = 'pp-g'`).run();
    expect((await comoAgente('/api/v1/propostas/pp-g', CA, { method: 'PUT', headers: json, body: '{"contexto":"x"}' })).status).toBe(409);
    expect((await env.DB.prepare(`SELECT status FROM leads WHERE id = 'l-x'`).first<any>()).status).toBe('Proposal');
  });

  it('o agente de quem não é do comercial não entra, e o papel é relido a cada chamada', async () => {
    expect((await comoAgente('/api/v1/leads', CO)).status).toBe(403);
    // Rebaixado a consultor (e designado, para a concessão seguir valendo): perde a área comercial na chamada seguinte.
    await env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-x', 'CA', 'ca@x.lat', 'consultor', 'Consultor')`).run();
    await env.DB.prepare(`UPDATE users SET role = 'consultor' WHERE id = 'u-ca'`).run();
    expect((await comoAgente('/api/v1/projects/p-x/risks', CA)).status).toBe(200);
    expect((await comoAgente('/api/v1/leads', CA)).status).toBe(403);
    await env.DB.prepare(`UPDATE users SET role = 'consultoria_admin' WHERE id = 'u-ca'`).run();
    expect((await comoAgente('/api/v1/leads', CA)).status).toBe(200);
  });

  it('o principal comercial não serve fora da área: o projeto segue preso à concessão', async () => {
    expect((await comoAgente('/api/v1/projects/p-x/risks', CA)).status).toBe(200);
    expect((await comoAgente('/api/v1/platform/orgs', CA)).status).toBe(403);
    expect((await comoAgente('/api/v1/users', CA)).status).toBe(403);
  });

  it('tools/list: as niso_comercial_* só para o agente de quem é do comercial; contexto avisa', async () => {
    const ca = await nomesDaLista(await tokenDoAgente('ca@x.lat', 'p-x'));
    const co = await nomesDaLista(await tokenDoAgente('co@x.lat', 'p-x'));
    for (const n of COMERCIAIS) {
      expect(ca, n).toContain(n);
      expect(co, n).not.toContain(n);
    }
    expect(montarContexto({ id: 'p', client_name: 'C' }, 'x', 'consultor', true)).toContain('niso_comercial_rascunhar_proposta');
    expect(montarContexto({ id: 'p', client_name: 'C' }, 'x', 'consultor', false)).not.toContain('niso_comercial_rascunhar_proposta');
  }, 60_000);

  it('ferramentas: lista, lê, cria lead e rascunha proposta; o consultor ouve "indisponível"', async () => {
    const t = await tokenDoAgente('ca@x.lat', 'p-x');
    const lista = await chamarFerramenta(t, 'niso_comercial_listar', { area: 'leads' });
    expect(lista.isError).toBeFalsy();
    expect(lista.content[0].text).toContain('Prospect X');
    expect(lista.content[0].text).not.toContain('Prospect Y');
    const lead = await chamarFerramenta(t, 'niso_comercial_criar_lead', { company_name: 'Pela Ferramenta' });
    const leadId = JSON.parse(lead.content[0].text).id;
    expect(leadId).toBeTruthy();
    const prop = await chamarFerramenta(t, 'niso_comercial_rascunhar_proposta', { leadId, contexto: 'c' });
    const p = JSON.parse(prop.content[0].text);
    expect(p.status).toBe('rascunho');
    const ed = await chamarFerramenta(t, 'niso_comercial_rascunhar_proposta', { id: p.id, escopo: 'e' });
    expect(JSON.parse(ed.content[0].text).escopo).toBe('e');
    const ler = await chamarFerramenta(t, 'niso_comercial_ler', { area: 'proposta', id: p.id });
    expect(JSON.parse(ler.content[0].text).id).toBe(p.id);
    const st = await chamarFerramenta(t, 'niso_comercial_status_lead', { id: leadId, status: 'Lost' });
    expect(st.isError).toBeFalsy();
    // campo fora do esquema é recusado antes da API
    expect((await chamarFerramenta(t, 'niso_comercial_rascunhar_proposta', { id: p.id, status: 'gerada' })).isError).toBe(true);
    const co = await chamarFerramenta(await tokenDoAgente('co@x.lat', 'p-x'), 'niso_comercial_listar', { area: 'leads' });
    expect(co.isError).toBe(true);
  }, 60_000);
});
