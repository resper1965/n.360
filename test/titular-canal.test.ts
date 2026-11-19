import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, workerEnv, habilitarPrivacy, sessionFor, concederModulos } from './helpers/d1';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { faixaDoCaminho } from '../src/modulos';
import { salvarCanal, lerCanal, resumoDoCanal, hostsDoApp, MSG_LINK_DO_PORTAL } from '../src/services/titular-canal';
import { titularCanalSchema } from '../src/schemas';
import { exportarProjeto } from '../src/portabilidade';
import { mesclar } from '../src/services/mesclar';
import { gerarPortal } from '../src/services/titular-pedidos';
import { hojeEmSaoPaulo } from '../src/services/hoje';
import fonteDoServico from '../src/services/titular-canal.ts?raw';

/**
 * Canal do titular (migration 0117, spec 2026-11-19): uma linha por projeto, gravada por quem gere o portal. O link do portal
 * (`/solicitacao#<token>`, credencial de portador) nunca entra; a trilha leva só os nomes dos campos; sai na portabilidade.
 */
const P = 'tc-proj';
const OUTRO = 'tc-outro';
const HOSTS = hostsDoApp({});
const ATOR = 'cons@ness.teste';
const linha = () => env.DB.prepare('SELECT * FROM titular_canal WHERE project_id = ?').bind(P).first<Record<string, unknown>>();

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      (?1, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES
      ('tc-pa', ?1, 'pessoa', 'Ana Exemplo'), ('tc-pa2', ?1, 'pessoa', 'Ana Exemplo Dup'), ('tc-pb', ?2, 'pessoa', 'Bruno Outro')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
});

const ROTA = `/api/v1/projects/${P}/titular-canal`;
const AGENTE = { userId: 'tc-cons', email: 'cons@ness.teste', projectId: P, concessaoId: 'tc-conc' };
const requisicao = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) });
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(requisicao(metodo, caminho, h, corpo), workerEnv());
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(requisicao(metodo, caminho, { 'X-Agente-Confirmado': '1' }, corpo), { ...workerEnv(), AGENTE } as any);
const S: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('tc-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('tc-adm', 'adm@cliente.teste', 'x', 'Adm', 'org_admin', ?1, 'org_ness'),
      ('tc-usr', 'usr@cliente.teste', 'x', 'Usr', 'org_user', ?1, 'org_ness'),
      ('tc-cli', 'cli@cliente.teste', 'x', 'Cli', 'client', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('tc-conc', 'tc-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('tc-kw', ?1, ?2, 'escrita', 'write', 'Active'), ('tc-kr', ?1, ?3, 'leitura', 'read', 'Active')`)
      .bind(P, await sha256Hex('tc-chave-escrita'), await sha256Hex('tc-chave-leitura')),
  ]);
  await habilitarPrivacy(P, OUTRO); // de novo: agora a conta do consultor existe e recebe o módulo
  await concederModulos(['tc-adm', 'tc-usr', 'tc-cli'], ['privacy']);
  S.cons = await sessionFor({ id: 'tc-cons', email: 'cons@ness.teste', role: 'consultor' });
  S.adm = await sessionFor({ id: 'tc-adm', email: 'adm@cliente.teste', role: 'org_admin', client_project_id: P });
  S.usr = await sessionFor({ id: 'tc-usr', email: 'usr@cliente.teste', role: 'org_user', client_project_id: P });
  S.cli = await sessionFor({ id: 'tc-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: P });
  S.chaveW = { 'X-API-Key': 'tc-chave-escrita' };
  S.chaveR = { 'X-API-Key': 'tc-chave-leitura' };
});

describe('corpo (titularCanalSchema)', () => {
  it('aceita e-mail, telefone e https; recusa o resto e campo do servidor (conferido_em)', () => {
    const ok = (x: unknown) => titularCanalSchema.safeParse(x).success;
    expect(ok({ email: 'privacidade@exemplo.com.br', telefone: '+55 11 4000-0000', formulario_url: 'https://exemplo.com.br/fale', divulgacao_url: null, conferir: true })).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ email: 'nao-e-email' })).toBe(false);
    expect(ok({ divulgacao_url: 'http://exemplo.com.br/privacidade' })).toBe(false);
    expect(ok({ formulario_url: 'javascript:alert(1)' })).toBe(false);
    expect(ok({ telefone: 'ligue já' })).toBe(false);
    expect(ok({ conferido_em: '2020-01-01' })).toBe(false);
    expect(ok({ conferir: false })).toBe(false);
    expect(ok({ divulgacao_url: 'https://user:senha@exemplo.com.br/x' })).toBe(false);
    expect(ok({ project_id: 'outro' })).toBe(false);
  });
});

describe('salvarCanal', () => {
  it('grava, lê com o nome do responsável e devolve só os nomes dos campos mudados; ausente não mexe, null limpa', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', responsavel_parte_id: 'tc-pa' }, HOSTS))
      .toEqual({ ok: true, campos: ['email', 'telefone', 'responsavel_parte_id'] });
    const { canal, portal_ativo } = await lerCanal(env.DB, P);
    expect(canal).toMatchObject({ project_id: P, email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', formulario_url: null,
      responsavel_parte_id: 'tc-pa', responsavel_nome: 'Ana Exemplo', atualizado_por: ATOR, conferido_em: null });
    expect(portal_ativo).toBe(false);
    expect(await salvarCanal(env.DB, P, ATOR, { telefone: null }, HOSTS)).toEqual({ ok: true, campos: ['telefone'] });
    expect(await linha()).toMatchObject({ email: 'privacidade@exemplo.com.br', telefone: null });
  });

  it('o link do portal nunca entra: host do app ou caminho /solicitacao → 422 e nada gravado', async () => {
    const urls = ['https://n360.ness.com.br/solicitacao#tok-abc123', 'https://niso.ness.com.br/privacy', 'https://nprivacy.ness.com.br/x',
      'https://exemplo.com.br/solicitacao#tok-abc123', 'https://EXEMPLO.com.br/Solicitacao',
      // variantes: barras extras, %-codificado, ponto final no host, porta, ponto-e-barra, ./ e ..
      'https://exemplo.com.br//solicitacao#tok', 'https://exemplo.com.br///SOLICITACAO/', 'https://exemplo.com.br/%73olicitacao#tok',
      'https://exemplo.com.br/%2Fsolicitacao#tok', 'https://n360.ness.com.br./x', 'https://N360.NESS.COM.BR:8443/x', 'https://exemplo.com.br/a/../solicitacao#tok',
      'https://exemplo.com.br/./solicitacao', 'https://u:p@n360.ness.com.br/x',
      // token em fragmento, query, redirecionamento aninhado, `;/`, `..%2F`, host que serve o app mas não está na lista, prévia workers.dev
      `https://cliente.com.br/fale#${'a1'.repeat(32)}`, `https://cliente.com.br/fale?t=${'0f'.repeat(32).toUpperCase()}`,
      `https://cliente.com.br/lgpd?redirect=https%3A%2F%2Fn360.ness.com.br%2Fsolicitacao%23${'ab'.repeat(32)}`,
      `https://cliente.com.br/lgpd?r=${encodeURIComponent(encodeURIComponent('https://x.dev/solicitacao#t'))}`,
      'https://cliente.com.br/;/solicitacao#t', 'https://cliente.com.br/x/..%2Fsolicitacao', 'https://www.n360.ness.com.br/x',
      'https://pr-12-niso.ness.workers.dev/x', 'https://n360-pr7.equipe.workers.dev/x', 'https://cliente.com.br/?ref=n360.ness.com.br'];
    for (const url of urls) for (const campo of ['formulario_url', 'divulgacao_url'] as const) {
      expect(await salvarCanal(env.DB, P, ATOR, { [campo]: url }, HOSTS), `${campo} ${url}`).toEqual({ ok: false, status: 422, error: MSG_LINK_DO_PORTAL });
    }
    const { n } = (await env.DB.prepare(`SELECT count(*) AS n FROM titular_canal WHERE coalesce(formulario_url, '') || coalesce(divulgacao_url, '') LIKE '%solicitacao%'
      OR coalesce(formulario_url, '') || coalesce(divulgacao_url, '') LIKE '%ness.com.br%'`).first<{ n: number }>())!;
    expect(n).toBe(0);
    expect(hostsDoApp({ APP_URL: 'https://n360-homolog.exemplo.dev' })).toEqual(expect.arrayContaining(['n360-homolog.exemplo.dev', 'n360.ness.com.br']));
  });

  it('endereço legítimo passa, mesmo com sha de git (40 hex) ou md5 (32 hex) no caminho', async () => {
    const ok = await salvarCanal(env.DB, P, ATOR, { formulario_url: `https://cliente.com.br/fale/${'ab12cd34'.repeat(5)}?v=${'0'.repeat(32)}`, divulgacao_url: 'https://cliente.com.br/privacidade#encarregado' }, HOSTS);
    expect(ok).toMatchObject({ ok: true });
    await salvarCanal(env.DB, P, ATOR, { formulario_url: null, divulgacao_url: null }, HOSTS);
  });

  it('responsável inativo é recusado; o já gravado não trava a edição de outro campo', async () => {
    await env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, status) VALUES ('tc-pi', ?, 'pessoa', 'Inativa', 'inativa')`).bind(P).run();
    expect(await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'tc-pi' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    await env.DB.prepare(`UPDATE partes SET status = 'inativa' WHERE id = 'tc-pa'`).run();
    expect(await salvarCanal(env.DB, P, ATOR, { telefone: '11 4000-0000' }, HOSTS)).toMatchObject({ ok: true });
    await env.DB.prepare(`UPDATE partes SET status = 'ativa' WHERE id = 'tc-pa'`).run();
  });

  it('a conferência do responsável também vale dentro do INSERT (sem janela entre checar e gravar)', async () => {
    const cega = { prepare: (sql: string) => (sql.startsWith('SELECT 1 FROM partes') ? { bind: () => ({ first: async () => ({ 1: 1 }) }) } : env.DB.prepare(sql)) } as unknown as D1Database;
    expect(await salvarCanal(cega, P, ATOR, { responsavel_parte_id: 'tc-pb' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    expect((await linha())!.responsavel_parte_id).toBe('tc-pa');
  });

  it('responsável de outro projeto ou inexistente: 400, nada muda', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'tc-pb' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    expect(await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'nao-existe' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    expect((await linha())!.responsavel_parte_id).toBe('tc-pa');
  });

  it('conferência: o servidor carimba dia e pessoa; sem página é 422; outro campo não mexe; trocar a página apaga a conferência', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { conferir: true }, HOSTS)).toMatchObject({ ok: false, status: 422 });
    expect(await salvarCanal(env.DB, P, ATOR, { divulgacao_url: 'https://exemplo.com.br/privacidade', conferir: true }, HOSTS))
      .toEqual({ ok: true, campos: ['divulgacao_url', 'conferencia'] });
    expect(await linha()).toMatchObject({ conferido_em: hojeEmSaoPaulo(), conferido_por: ATOR });
    await salvarCanal(env.DB, P, 'outra@ness.teste', { email: 'lgpd@exemplo.com.br' }, HOSTS);
    expect(await linha()).toMatchObject({ conferido_em: hojeEmSaoPaulo(), conferido_por: ATOR, atualizado_por: 'outra@ness.teste' });
    await salvarCanal(env.DB, P, ATOR, { divulgacao_url: 'https://exemplo.com.br/lgpd' }, HOSTS);
    expect(await linha()).toMatchObject({ conferido_em: null, conferido_por: null });
  });

  it('trilha titular.canal só com os NOMES dos campos, nunca o endereço', async () => {
    const { results } = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular.canal' AND project_id = ?`).bind(P).all<{ details: string }>();
    expect(results.length).toBeGreaterThanOrEqual(5);
    const texto = JSON.stringify(results);
    for (const v of ['privacidade@', 'lgpd@', '4000', 'exemplo.com.br/']) expect(texto, v).not.toContain(v);
    expect(texto).toContain('Canal do titular atualizado: email, telefone, responsavel_parte_id');
  });
});

describe('resumoDoCanal (painel e trilha)', () => {
  it('meios pelos campos preenchidos, divulgado pela página; o portal ativo conta à parte; projeto sem linha = vazio', async () => {
    await salvarCanal(env.DB, P, ATOR, { formulario_url: 'https://exemplo.com.br/fale', telefone: '11 4000-0000' }, HOSTS);
    expect(await resumoDoCanal(env.DB, P)).toEqual({ meios: ['email', 'telefone', 'formulario'], portal_ativo: false, divulgado: true, conferido_em: null });
    expect(await resumoDoCanal(env.DB, OUTRO)).toEqual({ meios: [], portal_ativo: false, divulgado: false, conferido_em: null });
    await gerarPortal(env.DB, OUTRO, ATOR);
    expect(await resumoDoCanal(env.DB, OUTRO)).toEqual({ meios: [], portal_ativo: true, divulgado: false, conferido_em: null });
  });
});

describe('portabilidade e mescla', () => {
  it('a exportação do projeto leva a linha do canal; a do outro projeto não', async () => {
    const a = await exportarProjeto(workerEnv(), P);
    expect(a.dados.titular_canal).toEqual([expect.objectContaining({ project_id: P, email: 'lgpd@exemplo.com.br' })]);
    const b = await exportarProjeto(workerEnv(), OUTRO);
    expect(b.dados.titular_canal).toEqual([]);
    expect(JSON.stringify(b)).not.toContain('lgpd@exemplo.com.br');
  });

  it('mesclar partes leva o responsável do canal para o cadastro que fica', async () => {
    await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'tc-pa2' }, HOSTS);
    const r = await mesclar(env.DB, 'partes', P, ATOR, 'tc-pa', 'tc-pa2');
    expect('ok' in r && r.efeitos).toEqual(expect.arrayContaining([{ rotulo: 'Responsável do canal do titular', n: 1 }]));
    expect((await linha())!.responsavel_parte_id).toBe('tc-pa');
  });
});

describe('P0 do n.ot', () => {
  it('o serviço não lê nem grava nada ot_ e não importa módulo do n.ot', () => {
    expect(fonteDoServico).not.toMatch(/\bot_|from '\.\/ot/);
  });
});

describe('rotas GET|PUT /api/v1/projects/:id/titular-canal', () => {
  it('lê: equipe, org_admin, org_user, client, chave de leitura e o agente (200)', async () => {
    for (const [quem, h] of Object.entries({ cons: S.cons, adm: S.adm, usr: S.usr, cli: S.cli, chaveR: S.chaveR })) {
      const r = await chamar(h, 'GET', ROTA);
      expect(r.status, quem).toBe(200);
      expect(await r.json(), quem).toMatchObject({ canal: { project_id: P }, portal_ativo: false });
    }
    const ag = await comoAgente('GET', ROTA);
    expect(ag.status, await ag.clone().text()).toBe(200);
  });

  it('grava: equipe e org_admin (200); quem gravou fica em atualizado_por', async () => {
    expect((await chamar(S.cons, 'PUT', ROTA, { email: 'canal@exemplo.com.br' })).status).toBe(200);
    const r = await chamar(S.adm, 'PUT', ROTA, { telefone: '11 4000-0001' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await (await chamar(S.cli, 'GET', ROTA)).json()).toMatchObject({ canal: { email: 'canal@exemplo.com.br', telefone: '11 4000-0001', atualizado_por: 'adm@cliente.teste' } });
  });

  it('recusa a gravação (403) a org_user, client, chave de escrita, chave de leitura e ao agente; nada muda', async () => {
    for (const [quem, h] of Object.entries({ usr: S.usr, cli: S.cli, chaveW: S.chaveW, chaveR: S.chaveR })) {
      expect((await chamar(h, 'PUT', ROTA, { email: 'invasor@exemplo.com.br' })).status, quem).toBe(403);
    }
    const ag = await comoAgente('PUT', ROTA, { email: 'invasor@exemplo.com.br' });
    expect(ag.status).toBe(403);
    expect((await ag.json<{ error: string }>()).error).toContain('fora do alcance do agente');
    expect((await linha())!.email).toBe('canal@exemplo.com.br');
  });

  it('outro projeto: nem lê nem grava (403), e nenhuma linha nasce lá', async () => {
    const C = `/api/v1/projects/${OUTRO}/titular-canal`;
    for (const h of [S.cons, S.adm]) {
      expect((await chamar(h, 'GET', C)).status).toBe(403);
      expect((await chamar(h, 'PUT', C, { email: 'x@exemplo.com.br' })).status).toBe(403);
    }
    expect(await env.DB.prepare('SELECT 1 FROM titular_canal WHERE project_id = ?').bind(OUTRO).first()).toBeNull();
  });

  it('link do portal: 422 com a mensagem; http e campo do servidor: 400', async () => {
    const r = await chamar(S.cons, 'PUT', ROTA, { formulario_url: 'https://n360.ness.com.br/solicitacao#tok-abc123' });
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBe(MSG_LINK_DO_PORTAL);
    expect((await chamar(S.cons, 'PUT', ROTA, { divulgacao_url: 'http://exemplo.com.br/privacidade' })).status).toBe(400);
    expect((await chamar(S.cons, 'PUT', ROTA, { conferido_em: '2020-01-01' })).status).toBe(400);
  });

  it('faixa n.privacy: projeto só com o n.iso recusa (403)', async () => {
    expect(faixaDoCaminho('/api/v1/projects/x/titular-canal')).toBe('privacy');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('tc-iso', 'Só ISO', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc-iso', 'tc-iso', 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`),
    ]);
    expect((await chamar(S.cons, 'GET', '/api/v1/projects/tc-iso/titular-canal')).status).toBe(403);
  });
});
