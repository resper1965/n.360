import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, sessionFor, habilitarPrivacy } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { BASE, f, tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';
import { INSTRUCOES_AUDITOR } from '../src/mcp/contexto';

/**
 * Agente AUDITOR no MCP remoto: a conta de equipe escolhe o papel no consentimento. O auditor só LÊ o projeto da
 * concessão (n.iso e n.privacy) e grava achado de auditoria e nota de auditor; qualquer outra escrita é recusada no
 * SERVIDOR, mesmo forjada. Separação de funções: a mesma conta não tem consultor e auditor ativos no mesmo projeto.
 */
const P = 'aud-a';
const OUTRO = 'aud-b';
const comoAgente = (caminho: string, props: Record<string, unknown>, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: props } as any);
const json = { 'Content-Type': 'application/json' };
const AUD = { userId: 'u-aud', email: 'aud@ness.lat', projectId: P, concessaoId: 'c-aud', papel: 'auditor' };
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

async function rpc(token: string, method: string, params: unknown = {}) {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const texto = await r.text();
  expect(r.status, texto).toBe(200);
  const corpo = r.headers.get('Content-Type')?.includes('text/event-stream') ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6) : texto;
  return JSON.parse(corpo).result;
}

/** Consentimento até o fim; devolve a resposta do passo de confirmar (sem trocar o código por token). */
async function consentir(email: string, projeto: string, papel: string): Promise<Response> {
  const reg = await (await f('/oauth/register', { method: 'POST', headers: json, body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:33418/callback'], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:33418/callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', resource: `${BASE}/mcp` });
  const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
  await f('/oauth/authorize/entrar', form({ pedido, email, senha: 'senha-forte-123', codigo: '' }));
  return f('/oauth/authorize/confirmar', form({ pedido, projeto, papel }));
}

describe('Agente auditor (MCP remoto)', () => {
  let token: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Acme', 'ISO 27001', 'controller', 'Active'), (?, 'Outro', 'ISO 27001', 'controller', 'Active')`).bind(P, OUTRO),
      ...['aud', 'sep', 'cons', 'rev'].flatMap((k) => [
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultor')`).bind(`u-${k}`, `${k}@ness.lat`, senha, k),
        env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, ?, ?, 'consultor', 'Consultor')`).bind(P, k, `${k}@ness.lat`),
      ]),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'aud', 'aud@ness.lat', 'consultor', 'Consultor')`).bind(OUTRO),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-pa', 'pa@ness.lat', ?, 'PA', 'platform_admin'), ('u-com', 'com@ness.lat', ?, 'Com', 'comercial')`).bind(senha, senha),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title) VALUES ('ctl-a', ?, 'ISO 27001', 'A.5.1 Políticas')`).bind(P),
      env.DB.prepare(`INSERT INTO audit_schedule (id, project_id, audit_type, title, scheduled_date) VALUES ('au-a', ?, 'internal', 'Interna 2026', '2026-10-20'), ('au-b', ?, 'internal', 'Do outro', '2026-10-20')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-a', ?, 'a.md', 'k-a', 'h', 'x'), ('ev-b', ?, 'b.md', 'k-b', 'h', 'x')`).bind(P, OUTRO),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat) VALUES ('r-a', ?, 'Base', 'Vazamento')`).bind(P),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ro-a', ?, 'Folha de pagamento')`).bind(P),
    ]);
    await habilitarPrivacy(P);
    token = await tokenDoAgente('aud@ness.lat', P, 'auditor');
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-aud', 'u-aud', ?, datetime('now', '+30 days'), 'auditor')`).bind(P).run();
  }, 60_000);

  it('a concessão nasce com o papel escolhido e o token traz o escopo do papel', async () => {
    const c = await env.DB.prepare(`SELECT papel FROM agente_concessoes WHERE user_id = 'u-aud' AND id <> 'c-aud'`).first<{ papel: string }>();
    expect(c!.papel).toBe('auditor');
  });

  it('o consentimento mostra os dois papéis, nenhum pré-marcado, com o alcance do auditor', async () => {
    const reg = await (await f('/oauth/register', { method: 'POST', headers: json, body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:33418/callback'], client_name: 'Teste', token_endpoint_auth_method: 'none' }) })).json<any>();
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:33418/callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', resource: `${BASE}/mcp` });
    const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
    const html = await (await f('/oauth/authorize/entrar', form({ pedido, email: 'cons@ness.lat', senha: 'senha-forte-123', codigo: '' }))).text();
    expect(html).toContain('name="papel" value="consultor"');
    expect(html).toContain('name="papel" value="auditor"');
    expect(html).not.toMatch(/<input[^>]*name="papel"[^>]*checked/);
    expect(html).toContain('Grava só achado de auditoria e nota de auditor');
  });

  it('papel desconhecido no consentimento é recusado', async () => {
    expect((await consentir('cons@ness.lat', P, 'admin')).status).toBe(400);
  });

  it('platform_admin e comercial continuam sem conectar agente', async () => {
    for (const email of ['pa@ness.lat', 'com@ness.lat']) {
      const reg = await (await f('/oauth/register', { method: 'POST', headers: json, body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:33418/callback'], client_name: 'T', token_endpoint_auth_method: 'none' }) })).json<any>();
      const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:33418/callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', resource: `${BASE}/mcp` });
      const pedido = (await (await f(`/oauth/authorize?${q}`)).text()).match(/name="pedido" value="([^"]+)"/)![1];
      expect((await f('/oauth/authorize/entrar', form({ pedido, email, senha: 'senha-forte-123', codigo: '' }))).status, email).toBe(401);
    }
  });

  it('tools/list do auditor: leitura, niso_ler e as duas escritas de auditoria; nada do consultor', async () => {
    const nomes: string[] = (await rpc(token, 'tools/list')).tools.map((t: any) => t.name);
    for (const n of ['niso_contexto', 'niso_skill', 'niso_ler', 'niso_list_controls', 'niso_list_risks', 'niso_list_evidence', 'niso_audit_pack', 'niso_gap_analysis', 'niso_create_audit_finding', 'niso_create_auditor_note']) expect(nomes, n).toContain(n);
    for (const n of ['niso_executar', 'niso_create_evidence', 'niso_update_control', 'niso_criar_politica', 'niso_gerar_secao', 'niso_create_risk', 'niso_create_asset', 'niso_respond_auditor_note']) expect(nomes, n).not.toContain(n);
  });

  it('handshake e niso_contexto são do auditor', async () => {
    const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    expect(init.instructions).toBe(INSTRUCOES_AUDITOR);
    expect(INSTRUCOES_AUDITOR.length).toBeLessThanOrEqual(2048);
    const texto = (await chamarFerramenta(token, 'niso_contexto', {})).content[0].text;
    expect(texto).toContain('Papel: AUDITOR');
    expect(texto).toContain('agente auditor de aud@ness.lat');
    expect(texto).toContain('quem implementa não audita');
    expect(texto).toContain('comunicação à ANPD');
    expect(texto).toContain('9.2');
  });

  it('lê as áreas dos dois módulos do projeto', async () => {
    for (const c of ['', '/controls', '/risks', '/evidence', '/documentos', '/audits', '/audit-pack', '/auditor-notes', '/ropa', '/dpia', '/requisitos/lacunas?fonte=lgpd', '/titular-pedidos', '/incidentes', '/terceiros']) {
      const r = await comoAgente(`/api/v1/projects/${P}${c}`, AUD);
      expect(r.status, c || 'projeto').toBe(200);
    }
    expect((await comoAgente('/api/v1/audits/au-a/findings', AUD)).status).toBe(200);
    expect((await comoAgente('/api/v1/evidence/ev-a/detail', AUD)).status).toBe(200);
    // A evidência por id: a do projeto da concessão se lê; a de outro projeto é 404, como a inexistente.
    expect((await comoAgente('/api/v1/evidence/ev-a', AUD)).status).toBe(200);
    expect((await comoAgente('/api/v1/evidence/ev-b', AUD)).status).toBe(404);
    const res = await chamarFerramenta(token, 'niso_ler', { caminho: `/api/v1/projects/${P}/ropa` });
    expect(res.isError, res.content[0].text).toBeFalsy();
  });

  it('qualquer escrita do consultor é 403, mesmo forjada direto na API', async () => {
    const forjadas: [string, string, unknown?][] = [
      ['POST', `/api/v1/projects/${P}/risks`, { asset: 'x', threat: 'y' }],
      ['PUT', '/api/v1/risks/r-a', { asset: 'x', threat: 'y' }],
      ['DELETE', '/api/v1/risks/r-a'],
      ['PUT', `/api/v1/projects/${P}/controls/ctl-a`, { status: 'implemented' }],
      ['POST', `/api/v1/projects/${P}/politicas`, { tema: 'POL-CRY' }],
      ['POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'x' }],
      ['PUT', '/api/v1/evidence/ev-a/content', { content: 'x' }],
      ['PUT', '/api/v1/auditor-notes/qualquer/respond', { response: 'x' }],
      ['PUT', '/api/v1/audit-findings/qualquer', { description: 'x' }],
      ['DELETE', '/api/v1/audit-findings/qualquer'],
    ];
    for (const [method, caminho, corpo] of forjadas) {
      const r = await comoAgente(caminho, AUD, { method, headers: { ...json, 'X-Agente-Confirmado': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      expect(r.status, `${method} ${caminho}`).toBe(403);
      expect((await r.json<any>()).error, `${method} ${caminho}`).toMatch(/auditor/);
    }
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM risks WHERE project_id = ?`).bind(P).first<any>()).n).toBe(1);
    // Fora do projeto: nem leitura.
    expect((await comoAgente('/api/v1/evidence/ev-b/detail', AUD)).status).toBe(403);
    expect((await comoAgente(`/api/v1/projects/${OUTRO}/risks`, AUD)).status).toBe(403);
    expect((await comoAgente('/api/v1/audits/au-b/findings', AUD)).status).toBe(403);
  });

  it('pelo MCP: niso_executar e ferramenta de escrita do consultor são recusados', async () => {
    for (const [name, args] of [
      ['niso_executar', { metodo: 'POST', caminho: `/api/v1/projects/${P}/risks`, corpo: { asset: 'x', threat: 'y' } }],
      ['niso_create_evidence', { projectId: P, fileName: 'x.md', content: 'x' }],
      ['niso_update_control', { projectId: P, controlId: 'ctl-a', status: 'implemented' }],
      ['niso_criar_politica', { projectId: P, tema: 'POL-CRY' }],
    ] as const) {
      const res = await chamarFerramenta(token, name, args);
      expect(res.isError, name).toBe(true);
      expect(res.content[0].text, name).toContain('indisponível para o agente auditor');
    }
    // niso_ler é só GET, mesmo pedindo outro método.
    const res = await chamarFerramenta(token, 'niso_ler', { caminho: '/api/v1/risks/r-a', metodo: 'DELETE' });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM risks WHERE id = 'r-a'`).first<any>()).n).toBe(1);
    expect(res.content[0].text).not.toContain('HTTP 200');
  });

  it('grava achado (com CAPA na NC) e nota; a trilha diz "agente auditor de"', async () => {
    const achado = await chamarFerramenta(token, 'niso_create_audit_finding', { auditId: 'au-a', projectId: P, controlId: 'ctl-a', findingType: 'minor_nc', description: 'Política sem aprovação da direção', evidenceReviewed: 'ev-a (a.md)' });
    expect(achado.isError, achado.content[0].text).toBeFalsy();
    const linha = await env.DB.prepare(`SELECT project_id, capa_id FROM audit_findings WHERE audit_id = 'au-a'`).first<any>();
    expect(linha.project_id).toBe(P);
    expect(linha.capa_id).toBeTruthy();
    const semControle = await chamarFerramenta(token, 'niso_create_audit_finding', { auditId: 'au-a', projectId: P, findingType: 'observation', description: 'RoPA sem retenção definida' });
    expect(semControle.isError, semControle.content[0].text).toBeFalsy();

    const nota = await chamarFerramenta(token, 'niso_create_auditor_note', { projectId: P, controlId: 'ctl-a', noteType: 'evidence_request', content: 'Envie a ata de aprovação' });
    expect(nota.isError, nota.content[0].text).toBeFalsy();
    const n = await env.DB.prepare(`SELECT project_id, auditor_token, note_type FROM auditor_notes WHERE content = 'Envie a ata de aprovação'`).first<any>();
    expect(n.project_id).toBe(P);
    expect(n.auditor_token).toMatch(/^agente:/);
    expect(n.note_type).toBe('evidence_request');

    const atores = (await env.DB.prepare(`SELECT DISTINCT actor FROM audit_logs WHERE action IN ('audit_finding.created', 'auditor_note.created')`).all<{ actor: string }>()).results.map((r) => r.actor);
    expect(atores).toEqual([`agente auditor de aud@ness.lat (Acme / ${P})`]);
  });

  it('achado e nota em outro projeto são recusados', async () => {
    const achado = await chamarFerramenta(token, 'niso_create_audit_finding', { auditId: 'au-b', projectId: P, findingType: 'observation', description: 'x' });
    expect(achado.isError).toBe(true);
    expect(await env.DB.prepare(`SELECT 1 FROM audit_findings WHERE audit_id = 'au-b'`).first()).toBeNull();
    const nota = await chamarFerramenta(token, 'niso_create_auditor_note', { projectId: OUTRO, content: 'x' });
    expect(nota.isError).toBe(true);
    expect((await comoAgente(`/api/v1/projects/${OUTRO}/auditor-notes`, AUD, { method: 'POST', headers: json, body: JSON.stringify({ content: 'x' }) })).status).toBe(403);
    expect(await env.DB.prepare(`SELECT 1 FROM auditor_notes WHERE project_id = ?`).bind(OUTRO).first()).toBeNull();
  });

  it('regressão: o consultor continua sem achado e sem nota de auditor', async () => {
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-cons', 'u-cons', ?, datetime('now', '+30 days'))`).bind(P).run();
    const CONS = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-cons' };
    expect((await comoAgente('/api/v1/audits/au-a/findings', CONS, { method: 'POST', headers: json, body: JSON.stringify({ project_id: P, finding_type: 'observation', description: 'x' }) })).status).toBe(403);
    expect((await comoAgente(`/api/v1/projects/${P}/auditor-notes`, CONS, { method: 'POST', headers: json, body: JSON.stringify({ content: 'x' }) })).status).toBe(403);
    // Sessão humana também não grava nota de auditor pela rota do agente.
    const s = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
    expect((await f(`/api/v1/projects/${P}/auditor-notes`, { method: 'POST', headers: { ...s, ...json }, body: JSON.stringify({ content: 'x' }) })).status).toBe(403);
  });

  it('o papel vale pelo banco: token de auditor com concessão trocada para consultor cai, e papel forjado nas props também', async () => {
    // Props dizendo consultor numa concessão de auditor: recusado (401), não promovido.
    expect((await comoAgente(`/api/v1/projects/${P}/risks`, { ...AUD, papel: 'consultor' }, { method: 'POST', headers: json, body: JSON.stringify({ asset: 'x', threat: 'y' }) })).status).toBe(401);
    const tk = await tokenDoAgente('rev@ness.lat', P, 'auditor');
    expect((await rpc(tk, 'tools/list')).tools.length).toBeGreaterThan(0);
    await env.DB.prepare(`UPDATE agente_concessoes SET papel = 'consultor' WHERE user_id = 'u-rev'`).run();
    const r = await f('/mcp', { method: 'POST', headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
    expect(r.status).toBe(401);
  });

  it('separação de funções: o segundo papel é recusado e liberado depois de revogar o primeiro', async () => {
    const tk = await tokenDoAgente('sep@ness.lat', P, 'consultor');
    const recusa = await consentir('sep@ness.lat', P, 'auditor');
    expect(recusa.status).toBe(409);
    expect(await recusa.text()).toContain('Revogue o outro acesso');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM agente_concessoes WHERE user_id = 'u-sep'`).first<any>()).n).toBe(1);

    // Duas ativas por corrida (inserção direta): nenhuma vale.
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-sep-aud', 'u-sep', ?, datetime('now', '+30 days'), 'auditor')`).bind(P).run();
    expect((await comoAgente(`/api/v1/projects/${P}/risks`, { userId: 'u-sep', email: 'sep@ness.lat', projectId: P, concessaoId: 'c-sep-aud', papel: 'auditor' })).status).toBe(401);
    await env.DB.prepare(`DELETE FROM agente_concessoes WHERE id = 'c-sep-aud'`).run();
    expect((await rpc(tk, 'tools/list')).tools.length).toBeGreaterThan(0);

    const { id } = (await env.DB.prepare(`SELECT id FROM agente_concessoes WHERE user_id = 'u-sep'`).first<any>())!;
    const adm = await sessionFor({ id: 'u-o', email: 'dono@acme.com', role: 'org_admin', client_project_id: P });
    expect((await f(`/api/v1/projects/${P}/agentes/${id}/revogar`, { method: 'POST', headers: adm })).status).toBe(200);
    expect((await consentir('sep@ness.lat', P, 'auditor')).status).toBe(200);
  });

  it('o administrador do cliente vê o papel de cada agente', async () => {
    const adm = await sessionFor({ id: 'u-o', email: 'dono@acme.com', role: 'org_admin', client_project_id: P });
    const lista = await (await f(`/api/v1/projects/${P}/agentes`, { headers: adm })).json<any[]>();
    expect(lista.find((a) => a.id === 'c-aud').papel).toBe('auditor');
    expect(lista.find((a) => a.id === 'c-cons').papel).toBe('consultor');
  });
});
