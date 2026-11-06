// test/titular-consulta.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { gerarCodigoAcompanhamento, normalizarCodigo } from '../src/services/titular-pedidos';

/** Consulta pública do pedido do titular (migration 0105, spec 2026-11-06-titular-consulta-protocolo). */
const P = 'tc-proj', Q = 'tc-outro';
const post = (caminho: string, corpo: unknown, h: Record<string, string> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo) }), workerEnv());
const abrir = (token: string, ip = '10.0.0.1') => post('/api/v1/public/titular-pedidos/abrir',
  { token, tipo: 'acesso', titular_nome: 'Fulano', titular_contato: 'fulano@exemplo.com', descricao: 'Quero acesso.' }, { 'CF-Connecting-IP': ip });
const consultar = (corpo: unknown, ip = '10.0.0.2') => post('/api/v1/public/titular-pedidos/consultar', corpo, { 'CF-Connecting-IP': ip });

let consultor: Record<string, string>;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, Q),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('tc-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc1', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor'), ('g-tc2', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P, Q),
  ]);
  for (const p of [P, Q]) await habilitarPrivacy(p);
  await concederModulos(['tc-cons'], ['privacy']);
  consultor = await sessionFor({ id: 'tc-cons', email: 'cons@ness.teste', role: 'consultor' });
  for (const p of [P, Q]) {
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${p}/titular-portal`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor }, body: '{}' }), workerEnv());
    tokens[p] = ((await r.json()) as { url: string }).url.split('#')[1];
  }
});

describe('código de acompanhamento', () => {
  it('formato, alfabeto sem ambíguos e normalização', () => {
    const c = gerarCodigoAcompanhamento();
    expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
    expect(gerarCodigoAcompanhamento()).not.toBe(c);
    expect(normalizarCodigo(c.toLowerCase().replace(/-/g, ' '))).toBe(c);
    expect(normalizarCodigo('K7QM3XRP9WTDH2F')).toBeNull(); // 15
    expect(normalizarCodigo('O7QM-3XRP-9WTD-H2FN')).toBeNull(); // O fora do alfabeto
  });
});

describe('abrir e consultar', () => {
  let protocolo = '', codigo = '', protocoloQ = '', codigoQ = '';

  it('a abertura devolve o código e grava só o hash', async () => {
    const r = await abrir(tokens[P]);
    expect(r.status, await r.clone().text()).toBe(201);
    const corpo = await r.json() as { protocolo: string; codigo: string; email_enviado: boolean };
    ({ protocolo, codigo } = corpo);
    expect(corpo.email_enviado).toBe(true); // sem RESEND_API_KEY o envio é simulado e conta como enviado
    expect(codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
    const linha = await env.DB.prepare('SELECT * FROM titular_pedidos WHERE project_id = ? AND protocolo = ?').bind(P, protocolo).first<Record<string, unknown>>();
    expect(linha!.acompanhamento_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(linha)).not.toContain(codigo);
    const q = await (await abrir(tokens[Q])).json() as { protocolo: string; codigo: string };
    ({ protocolo: protocoloQ, codigo: codigoQ } = q);
    expect(protocoloQ).toBe(protocolo); // protocolo se repete entre projetos: o código decide
  });

  it('a consulta certa devolve só situação e datas', async () => {
    const r = await consultar({ protocolo, codigo });
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await r.json() as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(['prazo_em', 'protocolo', 'recebido_em', 'respondido_em', 'status', 'tipo']);
    expect(d).toMatchObject({ protocolo, tipo: 'acesso', status: 'recebido', respondido_em: null });
  });

  it('código em minúsculas, sem hífen e protocolo em minúsculas também consultam', async () => {
    const r = await consultar({ protocolo: protocolo.toLowerCase(), codigo: codigo.toLowerCase().replace(/-/g, '') });
    expect(r.status).toBe(200);
  });

  it('código errado, código de outro pedido e formato de código inválido: o mesmo 404', async () => {
    const errado = codigo.slice(0, -1) + (codigo.endsWith('2') ? '3' : '2');
    const respostas = await Promise.all([
      consultar({ protocolo, codigo: errado }),
      consultar({ protocolo: 'PT-2026-9999', codigo: codigoQ }),
      consultar({ protocolo, codigo: 'nada-a-ver' }),
    ]);
    for (const r of respostas) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: 'Protocolo ou código não conferem' });
    }
    // o código do outro projeto com o mesmo número de protocolo devolve o pedido DELE, nunca o deste
    const outro = await (await consultar({ protocolo, codigo: codigoQ })).json() as { protocolo: string };
    expect(outro.protocolo).toBe(protocoloQ);
  });

  it('campo a mais ou protocolo fora do formato: 400', async () => {
    expect((await consultar({ protocolo, codigo, projeto: P })).status).toBe(400);
    expect((await consultar({ protocolo: 'XX-1', codigo })).status).toBe(400);
  });

  it('a situação acompanha o atendimento; o texto da resposta não sai', async () => {
    const id = (await env.DB.prepare('SELECT id FROM titular_pedidos WHERE project_id = ? AND protocolo = ?').bind(P, protocolo).first<{ id: string }>())!.id;
    await env.DB.prepare(`UPDATE titular_pedidos SET status = 'respondido', respondido_em = '2026-11-06', resposta_texto = 'Segredo da resposta' WHERE id = ?`).bind(id).run();
    const r = await consultar({ protocolo, codigo });
    const d = await r.json() as Record<string, unknown>;
    expect(d).toMatchObject({ status: 'respondido', respondido_em: '2026-11-06' });
    expect(JSON.stringify(d)).not.toContain('Segredo');
    // gravado como instante UTC (o PUT usa toISOString): 02:30 UTC de 07/11 ainda é 06/11 em São Paulo
    await env.DB.prepare(`UPDATE titular_pedidos SET respondido_em = '2026-11-07T02:30:00.000Z' WHERE id = ?`).bind(id).run();
    expect(await (await consultar({ protocolo, codigo })).json()).toMatchObject({ respondido_em: '2026-11-06', recebido_em: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('portal desligado: a consulta continua', async () => {
    await env.DB.prepare('UPDATE titular_portais SET ativo = 0 WHERE project_id = ?').bind(P).run();
    expect((await consultar({ protocolo, codigo })).status).toBe(200);
  });

  it('pedido sem código (registrado pelo DPO) não é consultável', async () => {
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${Q}/titular-pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor }, body: JSON.stringify({ tipo: 'acesso', canal: 'email' }) }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(201);
    const linha = await env.DB.prepare(`SELECT acompanhamento_hash FROM titular_pedidos WHERE project_id = ? AND canal = 'email'`).bind(Q).first<{ acompanhamento_hash: string | null }>();
    expect(linha!.acompanhamento_hash).toBeNull();
  });

  it('limite por IP: 429', async () => {
    let ultimo = 0;
    for (let i = 0; i < 31; i++) ultimo = (await consultar({ protocolo, codigo: 'nada-a-ver' }, '10.9.9.9')).status;
    expect(ultimo).toBe(429);
  });
});
