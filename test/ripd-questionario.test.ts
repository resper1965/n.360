import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { assinaturaDpia, documentoAtual, hashConteudo } from '../src/services/pedidos';
import { PERGUNTAS_RIPD, ABAS_RIPD } from '../src/data/ripd-perguntas';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

/** Questionário do RIPD (migration 0083, spec 2026-10-26): respostas em tabela própria, fora do hash da aprovação. Só dado fictício. */
const P = 'rq-proj';
const OUTRO = 'rq-outro';
const base = (p = P, d = 'rq-1') => `/api/v1/projects/${p}/dpia/${d}`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
let consultor: Record<string, string>;
let admin: Record<string, string>;

const perguntasDe = (corpo: any) => Object.fromEntries(corpo.abas.flatMap((a: any) => a.perguntas.map((p: any) => [p.id, p])));

beforeAll(async () => {
  await applySchema();
  for (const id of [P, OUTRO]) {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(id).run();
  }
  await habilitarPrivacy(P, OUTRO);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, volume_mensal) VALUES ('rq-ropa', ?, 'Folha ficticia', 'cerca de 300 titulares por mes')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, status) VALUES ('rq-1', ?, 'rq-ropa', 'Folha', 'Draft')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('rq-sem', ?, 'Sem atividade', 'Draft')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('rq-alheio', ?, 'Alheio', 'Draft')`).bind(OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, nome, tipo) VALUES ('rq-op', ?, 'Operadora Ficticia', 'organizacao')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('rq-v', ?, 'rq-op', 'operador', 'tratamento', 'rq-ropa')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('rq-it', ?, 'Banco Ficticio', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id, descricao_etapa) VALUES ('rq-ropa', ?, 'armazenamento', 'registrada', 'rq-it', 'nuvem ficticia')`).bind(P),
  ]);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
  admin = await sessionFor({ id: 'adm', email: 'adm@ness.lat', role: 'platform_admin' });
});

describe('catálogo de perguntas do RIPD', () => {
  it('tem 3 abas com 4, 8 e 5 perguntas, ids únicos e as não confirmadas marcadas no arquivo de dados', async () => {
    expect(ABAS_RIPD.map((a) => PERGUNTAS_RIPD.filter((p) => p.aba === a.id).length)).toEqual([4, 8, 5]);
    expect(new Set(PERGUNTAS_RIPD.map((p) => p.id)).size).toBe(PERGUNTAS_RIPD.length);
    expect(PERGUNTAS_RIPD.every((p) => p.id.length <= 60 && p.texto.length > 5)).toBe(true);
  });
});

describe('GET e PUT /dpia/:id/questionario', () => {
  it('o GET devolve as três abas, sem resposta, e a sugestão da atividade só leitura', async () => {
    const r = await chamar(consultor, 'GET', `${base()}/questionario`);
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo: any = await r.json();
    expect(corpo.abas.map((a: any) => a.id)).toEqual(['teste_impacto', 'conformidade', 'armazenamento']);
    const p = perguntasDe(corpo);
    expect(Object.values(p).every((x: any) => x.resposta === null)).toBe(true);
    expect(p.terceiros_operadores.da_atividade).toBe('Operadores: Operadora Ficticia');
    expect(p.onde_ficam.da_atividade).toBe('Banco Ficticio: nuvem ficticia');
    expect(p.quantos_titulares.da_atividade).toBe('cerca de 300 titulares por mes');
    expect(p.beneficios.da_atividade).toBeNull();
    // Sugestão nunca é gravada.
    expect((await env.DB.prepare('SELECT count(*) AS n FROM dpia_respostas').first<{ n: number }>())!.n).toBe(0);
  });

  it('RIPD sem atividade ligada não traz sugestão', async () => {
    const corpo: any = await (await chamar(consultor, 'GET', `${base(P, 'rq-sem')}/questionario`)).json();
    expect(Object.values(perguntasDe(corpo)).every((x: any) => x.da_atividade === null)).toBe(true);
  });

  it('o PUT grava texto e escolha, o GET devolve, e null apaga', async () => {
    const r = await chamar(consultor, 'PUT', `${base()}/questionario`, { respostas: { o_que_muda: 'Folha passa a ser digital', territorio_nacional: 'sim', beneficios: 'Menos papel' } });
    expect(r.status, await r.clone().text()).toBe(200);
    let p = perguntasDe(await (await chamar(consultor, 'GET', `${base()}/questionario`)).json());
    expect(p.o_que_muda.resposta).toBe('Folha passa a ser digital');
    expect(p.territorio_nacional.resposta).toBe('sim');
    const r2 = await chamar(consultor, 'PUT', `${base()}/questionario`, { respostas: { o_que_muda: null, beneficios: 'Menos papel e mais rapidez' } });
    expect(r2.status).toBe(200);
    p = perguntasDe(await (await chamar(consultor, 'GET', `${base()}/questionario`)).json());
    expect(p.o_que_muda.resposta).toBeNull();
    expect(p.beneficios.resposta).toBe('Menos papel e mais rapidez');
    expect(p.territorio_nacional.resposta).toBe('sim'); // as que não vieram ficam
  });

  it('recusa pergunta desconhecida, escolha fora de sim/nao/nao_sei, campo a mais, corpo vazio e texto longo', async () => {
    const put = (corpo: unknown) => chamar(consultor, 'PUT', `${base()}/questionario`, corpo);
    expect((await put({ respostas: { inventada: 'x' } })).status).toBe(400);
    expect((await put({ respostas: { territorio_nacional: 'talvez' } })).status).toBe(400);
    expect((await put({ respostas: { o_que_muda: 'x' }, extra: 1 })).status).toBe(400);
    expect((await put({ respostas: {} })).status).toBe(400);
    expect((await put({ respostas: { o_que_muda: 'a'.repeat(2001) } })).status).toBe(400);
    const muitas = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`p${i}`, 'x']));
    expect((await put({ respostas: muitas })).status).toBe(400);
  });

  it('RIPD de outro projeto: 404 pelo projeto da URL, e a linha alheia não muda', async () => {
    expect((await chamar(admin, 'GET', `${base(P, 'rq-alheio')}/questionario`)).status).toBe(404);
    expect((await chamar(admin, 'PUT', `${base(P, 'rq-alheio')}/questionario`, { respostas: { o_que_muda: 'x' } })).status).toBe(404);
    expect((await chamar(admin, 'GET', `${base(P, 'rq-alheio')}/logs`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT 1 FROM dpia_respostas WHERE dpia_id = 'rq-alheio'`).first()).toBeNull();
    // Consultor sem acesso ao outro projeto: 403 do projeto.
    expect((await chamar(consultor, 'GET', `${base(OUTRO, 'rq-alheio')}/questionario`)).status).toBe(403);
  });
});

describe('fora do hash da aprovação', () => {
  it('gravar resposta não muda o hash, a situação nem as assinaturas de um RIPD aprovado', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, risks_identified, status) VALUES ('rq-ap', ?, 'Ponto', 'Risco ficticio', 'Draft')`).bind(P).run();
    await (await assinaturaDpia(env.DB, P, 'rq-ap', 'ciso', 'Encarregado Ficticio'))!.run();
    const hash = async () => hashConteudo((await documentoAtual(env.DB, 'dpia', 'rq-ap', P))!.conteudo);
    const situacao = () => env.DB.prepare('SELECT * FROM dpia_assessments WHERE id = ?').bind('rq-ap').first();
    const antes = { hash: await hash(), linha: await situacao() };
    expect((antes.linha as any).status).toBe('Approved');

    const r = await chamar(consultor, 'PUT', `${base(P, 'rq-ap')}/questionario`, { respostas: { quem_aprova_mudancas: 'Direcao', auditorias_acesso: 'sim', onde_ficam: 'Servidor ficticio' } });
    expect(r.status, await r.clone().text()).toBe(200);

    expect(await hash()).toBe(antes.hash);
    expect(await situacao()).toEqual(antes.linha);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM dpia_respostas WHERE dpia_id = 'rq-ap'`).first<{ n: number }>())!.n).toBe(3);
  });
});

describe('logs do RIPD', () => {
  it('as ações novas e as do RIPD gravam entity_type dpia; a leitura é por RIPD, sem texto livre nem motivo', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status) VALUES ('rq-log', ?, 'Visitas', 'Draft')`).bind(P).run();
    await chamar(consultor, 'PUT', `${base(P, 'rq-log')}/questionario`, { respostas: { beneficios: 'Segredo digitado pela pessoa' } });
    const put = await chamar(consultor, 'PUT', '/api/v1/dpia/rq-log', { processing_name: 'Visitas', risks_identified: 'Risco novo' });
    expect(put.status, await put.clone().text()).toBe(200);
    // A revogação leva motivo (justification): ele não pode sair na aba.
    await (await assinaturaDpia(env.DB, P, 'rq-log', 'ceo', 'Diretora Ficticia'))!.run();
    const rev = await chamar(admin, 'POST', `/api/v1/projects/${P}/dpia/rq-log/revoke-approval`, { reason: 'Motivo sigiloso da revogacao' });
    expect(rev.status, await rev.clone().text()).toBe(200);

    const linhas = await env.DB.prepare(`SELECT action FROM audit_logs WHERE entity_type = 'dpia' AND entity_id = 'rq-log' ORDER BY rowid`).all<{ action: string }>();
    expect(linhas.results.map((l) => l.action)).toEqual(['dpia.questionario', 'dpia_updated', 'dpia.approval_revoked']);

    const r = await chamar(consultor, 'GET', `${base(P, 'rq-log')}/logs`);
    expect(r.status, await r.clone().text()).toBe(200);
    const texto = await r.text();
    const { logs } = JSON.parse(texto);
    expect(logs.map((l: any) => l.evento)).toEqual(['Aprovação revogada (reaberto)', 'Dados alterados', 'Questionário respondido (Teste de Impacto)']);
    expect(texto).not.toContain('Segredo digitado');
    expect(texto).not.toContain('Motivo sigiloso');
    expect(texto).not.toContain('Risco novo');
    // O log de outro RIPD não aparece neste.
    const outro: any = await (await chamar(consultor, 'GET', `${base(P, 'rq-1')}/logs`)).json();
    expect(outro.logs.every((l: any) => l.evento !== 'Aprovação revogada (reaberto)')).toBe(true);
  });
});
