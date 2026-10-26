import { describe, it, expect, beforeAll } from 'vitest';
import { diaMaisSP } from '../src/services/hoje';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import { PERGUNTAS_PADRAO, percentual, lerCongelado } from '../src/services/homologacao';
import { itensDoDia, hojeEmSaoPaulo, somarDias } from '../src/services/avisos-prazo';

/** F5: homologação de fornecedor por questionário. Dados fictícios. */
const P = 'hm-proj';
const OUTRO = 'hm-outro';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extraEnv: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extraEnv });
const json = async <T>(r: Response) => (await r.json()) as T;
const dias = (n: number) => diaMaisSP(n);
const publico = (acao: string, corpo: unknown, ip = '203.0.113.7') => chamar({ 'CF-Connecting-IP': ip }, 'POST', `/api/v1/public/homologacao/${acao}`, corpo);
const tokenDe = (url: string) => url.split('#')[1];

let consultor: Record<string, string>, cliente: Record<string, string>, semPrivacy: Record<string, string>;
const base = `/api/v1/projects/${P}/homologacoes`;
const AGENTE = { AGENTE: { concessaoId: 'hm-conc', userId: 'hm-cons', email: 'cons@hm.lat', projectId: P } };
const criar = (corpo: object = {}) => chamar(consultor, 'POST', base, { parte_id: 'hm-medio', ...corpo });

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente Ficticio', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('hm-cons', 'cons@hm.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('hm-cli', 'cli@hm.lat', 'x', 'Cli', 'org_admin', ?, 'org_ness'), ('hm-sem', 'sem@hm.lat', 'x', 'Sem', 'org_admin', ?, 'org_ness')`).bind(P, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('hm-g', ?, 'Cons', 'cons@hm.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('hm-medio', ?1, 'organizacao', 'Fornecedor Medio', 'medio'), ('hm-grande', ?1, 'organizacao', 'Nuvem Grande', 'grande_provedor'),
      ('hm-sem-tipo', ?1, 'organizacao', 'Sem Tipo', NULL), ('hm-alheio', ?2, 'organizacao', 'Alheio', 'pequeno')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('hm-conc', 'hm-cons', ?, datetime('now','+30 days'))`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('hm-cli', ['privacy']);
  await concederModulos('hm-sem', ['iso']);
  consultor = await sessionFor({ id: 'hm-cons', email: 'cons@hm.lat', role: 'consultor', org_id: 'org_ness' });
  cliente = await sessionFor({ id: 'hm-cli', email: 'cli@hm.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
  semPrivacy = await sessionFor({ id: 'hm-sem', email: 'sem@hm.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
});

describe('percentual', () => {
  it('conta só resposta válida de pergunta congelada; sem pergunta é 0', () => {
    const perguntas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(percentual(perguntas, { a: { resposta: 'sim' }, b: { resposta: 'na' }, z: { resposta: 'sim' } })).toEqual({ respondidas: 2, total: 4, percentual: 50 });
    expect(percentual([], {})).toEqual({ respondidas: 0, total: 0, percentual: 0 });
  });
});

describe('perguntas do projeto', () => {
  it('o modelo padrão é semeado na primeira leitura, uma vez só, marcado a validar', async () => {
    const r = await json<{ a_validar: boolean; perguntas: { id: string; origem: string; ativa: number }[] }>(await chamar(consultor, 'GET', `${base}/perguntas`));
    expect(r.perguntas).toHaveLength(PERGUNTAS_PADRAO.length);
    expect(r.a_validar).toBe(true);
    expect(r.perguntas.every((p) => p.origem === 'padrao' && p.ativa === 1)).toBe(true);
    await chamar(consultor, 'GET', `${base}/perguntas`);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM homologacao_perguntas WHERE project_id = ?').bind(P).first<{ n: number }>())!.n).toBe(PERGUNTAS_PADRAO.length);
  });

  it('o consultor cria, edita (vira do projeto) e desativa; corpo inválido é 400; pergunta de outro projeto é 404', async () => {
    const nova = await chamar(consultor, 'POST', `${base}/perguntas`, { tema: 'Continuidade', texto: 'Existe plano de continuidade testado no último ano?' });
    expect(nova.status, await nova.clone().text()).toBe(201);
    const { id } = await json<{ id: string }>(nova);
    const primeira = (await json<{ perguntas: { id: string }[] }>(await chamar(consultor, 'GET', `${base}/perguntas`))).perguntas[0].id;
    expect((await chamar(consultor, 'PUT', `${base}/perguntas/${primeira}`, { texto: 'Há política de segurança aprovada?' })).status).toBe(200);
    expect((await chamar(consultor, 'PUT', `${base}/perguntas/${id}`, { ativa: false })).status).toBe(200);
    const r = await json<{ a_validar: boolean; perguntas: { id: string; origem: string; ativa: number; texto: string }[] }>(await chamar(consultor, 'GET', `${base}/perguntas`));
    expect(r.perguntas.find((p) => p.id === primeira)).toMatchObject({ origem: 'projeto', texto: 'Há política de segurança aprovada?' });
    expect(r.perguntas.find((p) => p.id === id)).toMatchObject({ ativa: 0 });
    expect((await chamar(consultor, 'POST', `${base}/perguntas`, { tema: 'X', texto: '' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base}/perguntas/${primeira}`, { origem: 'padrao' })).status).toBe(400);
    await env.DB.prepare(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto) VALUES ('hm-q-alheia', ?, 'T', 'P')`).bind(OUTRO).run();
    const idAlheia = 'hm-q-alheia';
    expect((await chamar(consultor, 'PUT', `${base}/perguntas/${idAlheia}`, { texto: 'x' })).status).toBe(404);
  });

  it('cliente lê mas não edita; o agente lê mas não edita; pessoa sem o n.privacy recebe 403', async () => {
    expect((await chamar(cliente, 'GET', `${base}/perguntas`)).status).toBe(200);
    expect((await chamar(cliente, 'POST', `${base}/perguntas`, { tema: 'T', texto: 'P' })).status).toBe(403);
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'GET', `${base}/perguntas`, undefined, AGENTE)).status).toBe(200);
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'POST', `${base}/perguntas`, { tema: 'T', texto: 'P' }, AGENTE)).status).toBe(403);
    expect((await chamar(semPrivacy, 'GET', `${base}/perguntas`)).status).toBe(403);
  });
});

describe('fluxo da homologação', () => {
  let id = '';
  let token = '';

  it('criar: link uma vez, só o hash no banco, perguntas ativas congeladas', async () => {
    const r = await criar({ dias: 10 });
    expect(r.status, await r.clone().text()).toBe(201);
    const d = await json<{ id: string; url: string; expira_em: string; email_enviado: boolean }>(r);
    expect(d.url).toMatch(/\/homologacao#[0-9a-f]{64}$/);
    expect(d.email_enviado).toBe(false);
    id = d.id;
    token = tokenDe(d.url);
    const linha = await env.DB.prepare('SELECT token_hash, perguntas_json, status FROM homologacoes WHERE id = ?').bind(id).first<{ token_hash: string; perguntas_json: string; status: string }>();
    expect(linha!.token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(linha)).not.toContain(token);
    expect(JSON.parse(linha!.perguntas_json).perguntas).toHaveLength(PERGUNTAS_PADRAO.length); // a pergunta desativada não vai
    const lista = await json<{ id: string; status: string; percentual: number; token_hash?: string }[]>(await chamar(consultor, 'GET', `${base}?parte_id=hm-medio`));
    expect(lista.find((h) => h.id === id)).toMatchObject({ status: 'aberta', percentual: 0 });
    expect(JSON.stringify(lista)).not.toContain(linha!.token_hash);
  });

  it('criar recusa terceiro que não é avaliado por questionário, de outro projeto, prazo fora de 1 a 60; o cliente e o agente não criam', async () => {
    expect((await criar({ parte_id: 'hm-grande' })).status).toBe(400);
    expect((await criar({ parte_id: 'hm-sem-tipo' })).status).toBe(400);
    expect((await criar({ parte_id: 'hm-alheio' })).status).toBe(404);
    expect((await criar({ dias: 0 })).status).toBe(400);
    expect((await criar({ dias: 61 })).status).toBe(400);
    expect((await chamar(cliente, 'POST', base, { parte_id: 'hm-medio' })).status).toBe(403);
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'POST', base, { parte_id: 'hm-medio' }, AGENTE)).status).toBe(403);
  });

  it('o fornecedor abre só o que é dele: cliente, fornecedor, perguntas e as próprias respostas', async () => {
    const r = await publico('ver', { token });
    expect(r.status).toBe(200);
    const d = await json<{ cliente: string; fornecedor: string; perguntas: { id: string; tema: string; texto: string }[]; respostas: object; percentual: number }>(r);
    expect(d).toMatchObject({ cliente: 'Cliente Ficticio', fornecedor: 'Fornecedor Medio', respostas: {}, percentual: 0 });
    expect(Object.keys(d.perguntas[0]).sort()).toEqual(['id', 'tema', 'texto']);
    expect(JSON.stringify(d)).not.toMatch(/token_hash|project_id|hm-proj|cons@hm/);
  });

  it('renomear a parte ou o cliente depois de criar não muda o que o link mostra (nomes congelados); homologação antiga usa o valor ao vivo', async () => {
    await env.DB.batch([
      env.DB.prepare(`UPDATE partes SET nome = 'DADO DO PROJETO' WHERE id = 'hm-medio'`),
      env.DB.prepare(`UPDATE projects SET client_name = 'OUTRO DADO' WHERE id = ?`).bind(P),
    ]);
    try {
      const d = await json<{ cliente: string; fornecedor: string }>(await publico('ver', { token }));
      expect(d).toMatchObject({ cliente: 'Cliente Ficticio', fornecedor: 'Fornecedor Medio' });
      // array antigo (sem nomes congelados): valor ao vivo
      const { visaoDoFornecedor } = await import('../src/services/homologacao');
      const antiga = await visaoDoFornecedor(env.DB, { id: 'x', project_id: P, parte_id: 'hm-medio', perguntas_json: '[]', respostas_json: '{}', expira_em: '2099-01-01' });
      expect(antiga).toMatchObject({ cliente: 'OUTRO DADO', fornecedor: 'DADO DO PROJETO' });
    } finally {
      await env.DB.batch([
        env.DB.prepare(`UPDATE partes SET nome = 'Fornecedor Medio' WHERE id = 'hm-medio'`),
        env.DB.prepare(`UPDATE projects SET client_name = 'Cliente Ficticio' WHERE id = ?`).bind(P),
      ]);
    }
  });

  it('salva rascunho (mescla), recusa pergunta que não é do envio e campo extra; % no servidor', async () => {
    const ids = (await json<{ perguntas: { id: string }[] }>(await publico('ver', { token }))).perguntas.map((p) => p.id);
    let r = await publico('salvar', { token, respostas: { [ids[0]]: { resposta: 'sim', justificativa: 'Politica aprovada em 2026' } } });
    expect(r.status, await r.clone().text()).toBe(200);
    r = await publico('salvar', { token, respostas: { [ids[1]]: { resposta: 'parcial' } } });
    expect((await json<{ percentual: number }>(r)).percentual).toBe(Math.round((2 / ids.length) * 100));
    expect((await publico('salvar', { token, respostas: { 'outra-pergunta': { resposta: 'sim' } } })).status).toBe(400);
    expect((await publico('salvar', { token, respostas: { [ids[0]]: { resposta: 'talvez' } } })).status).toBe(400);
    expect((await publico('salvar', { token, respostas: {}, extra: 1 })).status).toBe(400);
    expect((await publico('salvar', { token, respostas: { [ids[0]]: { resposta: 'sim', justificativa: 'x'.repeat(1001) } } })).status).toBe(400);
    const d = await json<{ respostas: Record<string, { resposta: string }> }>(await publico('ver', { token }));
    expect(d.respostas[ids[0]].resposta).toBe('sim');
    expect(d.respostas[ids[1]].resposta).toBe('parcial');
  });

  it('enviar: fica respondida, imutável, e o link passa a responder como inválido', async () => {
    const ids = (await json<{ perguntas: { id: string }[] }>(await publico('ver', { token }))).perguntas.map((p) => p.id);
    const r = await publico('enviar', { token, respostas: Object.fromEntries(ids.map((q) => [q, { resposta: 'sim' }])) });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await json<{ percentual: number }>(r)).percentual).toBe(100);
    const det = await json<{ status: string; percentual: number; perguntas: { id: string; resposta: string | null }[] }>(await chamar(consultor, 'GET', `${base}/${id}`));
    expect(det).toMatchObject({ status: 'respondida', percentual: 100 });
    expect(det.perguntas.every((p) => p.resposta === 'sim')).toBe(true);
    for (const acao of ['ver', 'salvar', 'enviar']) {
      const x = await publico(acao, acao === 'ver' ? { token } : { token, respostas: {} });
      expect(x.status, acao).toBe(404);
      expect(await x.json()).toEqual({ error: 'Link inválido ou expirado' });
    }
  });

  it('enviar avisa no sino o consultor designado, uma vez só, com o nome da parte e sem o token', async () => {
    const sinos = (await env.DB.prepare(`SELECT user_id, title, message, link, target_id FROM notifications WHERE type = 'homologacao_enviada'`).all<Record<string, string>>()).results;
    expect(sinos).toHaveLength(1); // o reenvio do teste anterior (404) não duplicou
    expect(sinos[0]).toMatchObject({ user_id: 'hm-cons', title: 'Homologação respondida', link: `/projects/${P}/terceiros`, target_id: id });
    expect(sinos[0].message).toContain('Fornecedor Medio');
    expect(JSON.stringify(sinos)).not.toContain(token);
    expect(JSON.stringify(sinos)).not.toContain(await sha256Hex(token));
  });

  it('falha do aviso não impede o envio', async () => {
    const r = await criar({ dias: 5 });
    const outro = tokenDe((await json<{ url: string }>(r)).url);
    await env.DB.prepare('ALTER TABLE notifications RENAME TO notifications_fora').run();
    try {
      const x = await publico('enviar', { token: outro, respostas: {} });
      expect(x.status, await x.clone().text()).toBe(200);
    } finally {
      await env.DB.prepare('ALTER TABLE notifications_fora RENAME TO notifications').run();
    }
  });

  it('concluir é da equipe; o agente e o cliente não concluem; data no passado volta o status', async () => {
    expect((await chamar(cliente, 'POST', `${base}/${id}/concluir`, { resultado: 'aprovado', valido_ate: dias(365) })).status).toBe(403);
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'POST', `${base}/${id}/concluir`, { resultado: 'aprovado', valido_ate: dias(365) }, AGENTE)).status).toBe(403);
    expect((await chamar(consultor, 'POST', `${base}/${id}/concluir`, { resultado: 'aprovado', valido_ate: dias(-1) })).status).toBe(400);
    expect((await chamar(consultor, 'GET', `${base}/${id}`)).ok).toBe(true);
    expect((await json<{ status: string }>(await chamar(consultor, 'GET', `${base}/${id}`))).status).toBe('respondida');
  });

  it('concluir grava a avaliação com método questionário; situação e avisos de prazo do terceiro mudam', async () => {
    const vence = somarDias(hojeEmSaoPaulo(), 7); // marco D-7 da fonte avaliacao_terceiro
    const r = await chamar(consultor, 'POST', `${base}/${id}/concluir`, { resultado: 'com_ressalvas', valido_ate: vence, observacao: 'Falta DPA assinado' });
    expect(r.status, await r.clone().text()).toBe(200);
    const { avaliacao_id } = await json<{ avaliacao_id: string }>(r);
    const av = await env.DB.prepare('SELECT metodo, resultado, valido_ate, parte_id FROM avaliacoes_terceiro WHERE id = ?').bind(avaliacao_id).first();
    expect(av).toEqual({ metodo: 'questionario', resultado: 'com_ressalvas', valido_ate: vence, parte_id: 'hm-medio' });
    const terceiro = (await json<{ id: string; situacao: string }[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/terceiros`))).find((t) => t.id === 'hm-medio');
    expect(terceiro!.situacao).toBe('vigente');
    const avisos = (await itensDoDia(env.DB, hojeEmSaoPaulo())).itens.filter((i) => i.fonte === 'avaliacao_terceiro' && i.project_id === P);
    expect(avisos).toHaveLength(1);
    expect((await chamar(consultor, 'POST', `${base}/${id}/concluir`, { resultado: 'aprovado', valido_ate: dias(30) })).status).toBe(409);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM avaliacoes_terceiro WHERE parte_id = ?').bind('hm-medio').first<{ n: number }>())!.n).toBe(1);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action LIKE 'homologacao.%' AND project_id = ?`).bind(P).all<{ details: string }>();
    expect(trilha.results.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(trilha.results)).not.toMatch(/Politica aprovada|Falta DPA/);
  });

  it('concluir antes de respondida é 409; cancelar invalida o link; vencido responde igual a inexistente', async () => {
    const nova = await json<{ id: string; url: string }>(await criar());
    expect((await chamar(consultor, 'POST', `${base}/${nova.id}/concluir`, { resultado: 'aprovado', valido_ate: dias(30) })).status).toBe(409);
    expect((await chamar(consultor, 'POST', `${base}/${nova.id}/cancelar`)).status).toBe(200);
    expect((await publico('ver', { token: tokenDe(nova.url) })).status).toBe(404);
    expect((await chamar(consultor, 'POST', `${base}/${nova.id}/cancelar`)).status).toBe(409);
    const vencida = await json<{ id: string; url: string }>(await criar());
    await env.DB.prepare(`UPDATE homologacoes SET expira_em = datetime('now', '-1 minute') WHERE id = ?`).bind(vencida.id).run();
    const a = await publico('ver', { token: tokenDe(vencida.url) });
    const b = await publico('ver', { token: 'f'.repeat(64) });
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await a.text()).toBe(await b.text());
    expect((await json<{ id: string; expirada: boolean }[]>(await chamar(consultor, 'GET', base))).find((h) => h.id === vencida.id)!.expirada).toBe(true);
  });

  it('a lista de fornecedores traz o resumo do último questionário não cancelado (Data de envio e % respondido)', async () => {
    const feita = await json<{ id: string }>(await criar());
    await env.DB.prepare(`UPDATE homologacoes SET enviada_em = '2026-10-05 09:00:00' WHERE id = ?`).bind(feita.id).run();
    const cancelada = await json<{ id: string }>(await criar());
    await chamar(consultor, 'POST', `${base}/${cancelada.id}/cancelar`);
    const lista = await json<{ id: string; questionario: { enviada_em: string | null; percentual: number; total: number } | null }[]>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/terceiros`));
    const grande = lista.find((t) => t.id === 'hm-medio')!;
    expect(grande.questionario).toMatchObject({ enviada_em: '2026-10-05 09:00:00', percentual: 0 }); // a cancelada, mais nova, não vale
    expect(lista.every((t) => t.questionario === null || typeof t.questionario.total === 'number')).toBe(true);
  });

  it('homologação de outro projeto não é alcançada pelo caminho do projeto', async () => {
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${P}/homologacoes/nao-existe`)).status).toBe(404);
    expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/homologacoes/nao-existe/cancelar`)).status).toBe(404);
  });
});

describe('rotas públicas', () => {
  it('limite por IP antes de ler o corpo', async () => {
    let ultimo = 0;
    for (let i = 0; i < 125; i++) ultimo = (await publico('ver', { token: 'x' }, '198.51.100.9')).status;
    expect(ultimo).toBe(429);
  }, 60_000);

  it('token ausente ou grande demais é 400', async () => {
    expect((await publico('ver', {}, '198.51.100.10')).status).toBe(400);
    expect((await publico('ver', { token: 'a'.repeat(201) }, '198.51.100.10')).status).toBe(400);
  });
});

describe('lerCongelado', () => {
  it('JSON que não é objeto nem array vira perguntas vazias, sem lançar', () => {
    for (const j of ['null', '5', '"texto"', 'true', '{"perguntas":"x"}', 'não é json']) {
      expect(lerCongelado(j)).toEqual({ perguntas: [], fornecedor: null, cliente: null });
    }
    expect(lerCongelado('[{"id":"a"}]').perguntas).toHaveLength(1);
  });
});
