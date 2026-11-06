// Encaminhamento do pedido do titular a ponto focal (spec 2026-11-06, migration 0104). Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { diaMaisSP, hojeEmSaoPaulo } from '../src/services/hoje';
import { emailEncaminhamentoTitular } from '../src/services/emails';

const P = 'tenc-proj';
const OUTRO = 'tenc-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;
const enc = (corpo: Record<string, unknown>, pedido = 'tenc-p') => chamar(ana, 'POST', `${B}/titular-pedidos/${pedido}/encaminhamentos`, corpo);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('tenc-a', 'ana-tenc@ness.lat', 'x', 'Ana Exemplo', 'consultor', NULL, 'org_ness'), ('tenc-cli', 'cli-tenc@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tenc', ?, 'Ana', 'ana-tenc@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, titular_nome, titular_contato, descricao, recebido_em, status, respondido_em) VALUES
      ('tenc-p', ?1, 'PT-2026-0001', 'acesso', 'Titular Sigiloso', 'sigiloso@exemplo.invalid', 'Descrição sigilosa', '2026-10-01', 'recebido', NULL),
      ('tenc-r', ?1, 'PT-2026-0002', 'acesso', NULL, NULL, NULL, '2026-10-01', 'respondido', '2026-10-05'),
      ('tenc-o', ?2, 'PT-2026-0001', 'acesso', NULL, NULL, NULL, '2026-10-01', 'recebido', NULL)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email, status) VALUES
      ('tenc-pf', ?1, 'pessoa', 'Ponto Focal', 'pf@exemplo.invalid', 'ativa'),
      ('tenc-org', ?1, 'organizacao', 'Empresa', 'org@exemplo.invalid', 'ativa'),
      ('tenc-sem', ?1, 'pessoa', 'Sem Email', NULL, 'ativa'),
      ('tenc-ina', ?1, 'pessoa', 'Inativa', 'ina@exemplo.invalid', 'inativa'),
      ('tenc-alheio', ?2, 'pessoa', 'Alheio', 'al@exemplo.invalid', 'ativa')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('tenc-cli', ['privacy']);
  ana = await sessionFor({ id: 'tenc-a', email: 'ana-tenc@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'tenc-cli', email: 'cli-tenc@cliente.com', role: 'org_user', client_project_id: P });
});

describe('encaminhamento do pedido do titular', () => {
  it('encaminha a pessoa com e-mail, cria a tratativa sem a mensagem e lista com a situação do prazo', async () => {
    const r = await enc({ parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: 'Localizar registros de ponto (mensagem sigilosa)' });
    expect(r.status).toBe(201);
    const { id, email_enviado } = await json(r);
    expect(email_enviado).toBe(false);
    const ts = await json(await chamar(ana, 'GET', `${B}/titular-pedidos/tenc-p/tratativas`));
    const t = ts.find((x: any) => x.tipo === 'encaminhamento');
    expect(t.texto).toMatch(/^Encaminhado a Ponto Focal, prazo \d{2}\/\d{2}\/\d{4}$/);
    expect((await enc({ parte_id: 'tenc-pf', prazo: hojeEmSaoPaulo(), mensagem: 'Hoje' })).status).toBe(201);
    await env.DB.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, enviado_por) VALUES ('tenc-velho', 'tenc-p', ?, 'tenc-pf', '2026-01-02', 'Antigo', 'a')`).bind(P).run();
    const { encaminhamentos } = await json(await chamar(ana, 'GET', `${B}/titular-pedidos/tenc-p/encaminhamentos`));
    expect(encaminhamentos.map((e: any) => [e.parte_nome, e.situacao])).toEqual(expect.arrayContaining([['Ponto Focal', 'no_prazo'], ['Ponto Focal', 'vence_hoje'], ['Ponto Focal', 'atrasado']]));
    expect(encaminhamentos.find((e: any) => e.id === id).mensagem).toContain('Localizar');
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular_pedido.encaminhamento' AND project_id = ?`).bind(P).all<any>();
    expect(JSON.stringify(trilha.results)).not.toMatch(/sigilos|Localizar/);
  });

  it('retorno só de aguardando; cancelar; respondido sem retorno é 400', async () => {
    const { id } = await json(await enc({ parte_id: 'tenc-pf', prazo: diaMaisSP(5), mensagem: 'Ver cadastro' }));
    const put = (eid: string, corpo: unknown) => chamar(ana, 'PUT', `${B}/titular-pedidos/tenc-p/encaminhamentos/${eid}`, corpo);
    expect((await put(id, { status: 'respondido' })).status).toBe(400);
    expect((await put(id, { status: 'respondido', retorno: 'Dados localizados no sistema de ponto' })).status).toBe(200);
    expect((await put(id, { status: 'cancelado' })).status).toBe(409);
    const e = await env.DB.prepare(`SELECT status, retorno, retorno_por, retorno_em FROM titular_pedido_encaminhamentos WHERE id = ?`).bind(id).first<any>();
    expect(e).toMatchObject({ status: 'respondido', retorno: 'Dados localizados no sistema de ponto', retorno_por: 'ana-tenc@ness.lat' });
    expect(e.retorno_em).toBeTruthy();
    const { id: id2 } = await json(await enc({ parte_id: 'tenc-pf', prazo: diaMaisSP(5), mensagem: 'Outra' }));
    expect((await put(id2, { status: 'cancelado' })).status).toBe(200);
    expect((await put('inexistente', { status: 'cancelado' })).status).toBe(404);
  });

  it('recusa: pessoa errada, prazo no passado, campo extra, pedido encerrado, outro projeto, cliente', async () => {
    for (const [corpo, st] of [
      [{ parte_id: 'tenc-org', prazo: diaMaisSP(3), mensagem: 'x' }, 400], [{ parte_id: 'tenc-sem', prazo: diaMaisSP(3), mensagem: 'x' }, 400],
      [{ parte_id: 'tenc-ina', prazo: diaMaisSP(3), mensagem: 'x' }, 400], [{ parte_id: 'tenc-alheio', prazo: diaMaisSP(3), mensagem: 'x' }, 400],
      [{ parte_id: 'tenc-pf', prazo: diaMaisSP(-1), mensagem: 'x' }, 400], [{ parte_id: 'tenc-pf', prazo: '2026-02-30', mensagem: 'x' }, 400],
      [{ parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: '' }, 400], [{ parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: 'x', extra: 1 }, 400],
    ] as const) expect((await enc(corpo as any)).status, JSON.stringify(corpo)).toBe(st);
    expect((await enc({ parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: 'x' }, 'tenc-r')).status).toBe(409);
    expect((await enc({ parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: 'x' }, 'tenc-o')).status).toBe(404);
    expect((await chamar(cliente, 'POST', `${B}/titular-pedidos/tenc-p/encaminhamentos`, { parte_id: 'tenc-pf', prazo: diaMaisSP(3), mensagem: 'x' })).status).toBe(403);
    expect((await chamar(cliente, 'GET', `${B}/titular-pedidos/tenc-p/encaminhamentos`)).status).toBe(200);
  });

  it('e-mail ao ponto focal: protocolo, tipo, prazo e mensagem; nunca dado do titular', () => {
    const m = emailEncaminhamentoTitular({ protocolo: 'PT-2026-0001', tipo: 'Acesso aos dados', prazo: '2026-12-01', mensagem: 'Localizar registros', nome: 'Ponto Focal', quem: { nome: 'Ana', email: 'ana@ness.lat' } });
    for (const t of [m.html, m.text]) for (const s of ['PT-2026-0001', 'Acesso aos dados', '01/12/2026', 'Localizar registros']) expect(t, s).toContain(s);
    expect(m.assunto).toContain('PT-2026-0001');
  });
});
