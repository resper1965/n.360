import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { PERGUNTAS_LIA, ABAS_LIA } from '../src/data/lia-perguntas';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Questionário da LIA (migration 0084, spec 2026-10-26): 12 perguntas em tabela própria; a conclusão e a regra de concluir não mudam. Só dado fictício. */
const P = 'lq-proj';
const OUTRO = 'lq-outro';
const base = (p = P, r = 'lq-ropa') => `/api/v1/projects/${p}/ropa/${r}/lia`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}) }), workerEnv());
let consultor: Record<string, string>;
const perguntasDe = (corpo: any) => Object.fromEntries(corpo.abas.flatMap((a: any) => a.perguntas.map((p: any) => [p.id, p])));
const COMPLETA = { finalidade_legitima: 'Prevenir fraude', necessidade: 'Dados mínimos', balanceamento: 'Titular espera esse uso', conclusao: 'prevalece' as const };

beforeAll(async () => {
  await applySchema();
  for (const id of [P, OUTRO]) {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(id).run();
  }
  await habilitarPrivacy(P, OUTRO);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, data_subjects, dados_sensiveis) VALUES ('lq-ropa', ?, 'Atendimento ficticio', 'Legítimo interesse', 'Clientes ficticios', 1)`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('lq-ropa2', ?, 'Outra ficticia')`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('lq-alheia', ?, 'Alheia')`).bind(OUTRO),
  ]);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('lq-cons', 'lqcons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('lq-g', ?, 'Cons', 'lqcons@ness.lat', 'consultor', 'Consultor')`).bind(P),
  ]);
  await concederModulos('lq-cons', ['privacy']);
  consultor = await sessionFor({ id: 'lq-cons', email: 'lqcons@ness.lat', role: 'consultor' });
});

describe('catálogo de perguntas da LIA', () => {
  it('tem 3 abas com 4 perguntas cada (12), ids únicos e curtos', () => {
    expect(ABAS_LIA.map((a) => PERGUNTAS_LIA.filter((p) => p.aba === a.id).length)).toEqual([4, 4, 4]);
    expect(PERGUNTAS_LIA).toHaveLength(12);
    expect(new Set(PERGUNTAS_LIA.map((p) => p.id)).size).toBe(12);
    expect(PERGUNTAS_LIA.every((p) => p.id.length <= 60 && p.texto.length > 5)).toBe(true);
  });
});

describe('GET e PUT /ropa/:id/lia/questionario', () => {
  it('o GET devolve as abas sem resposta e a sugestão da atividade (só leitura)', async () => {
    const r = await chamar(consultor, 'GET', `${base()}/questionario`);
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo: any = await r.json();
    expect(corpo.abas.map((a: any) => a.id)).toEqual(['finalidade', 'necessidade', 'proporcionalidade']);
    const p = perguntasDe(corpo);
    expect(Object.values(p).every((x: any) => x.resposta === null)).toBe(true);
    expect(p.finalidades.da_atividade).toBe('Base legal: Legítimo interesse');
    expect(p.relacao_formal.da_atividade).toBe('Titulares: Clientes ficticios');
    expect(p.dados_sensiveis.da_atividade).toContain('(sim)');
    expect(p.beneficios_empresa.da_atividade).toBeNull();
    expect((await env.DB.prepare('SELECT count(*) AS n FROM lia_respostas').first<{ n: number }>())!.n).toBe(0); // sugestão nunca é gravada
  });

  it('grava, relê, troca e apaga com null; texto em branco também apaga', async () => {
    const put = (respostas: object) => chamar(consultor, 'PUT', `${base()}/questionario`, { respostas });
    const r0 = await put({ finalidades: 'Atender pedidos', coleta_direta: 'sim' });
    expect(r0.status, await r0.clone().text()).toBe(200);
    let p = perguntasDe(await (await chamar(consultor, 'GET', `${base()}/questionario`)).json());
    expect([p.finalidades.resposta, p.coleta_direta.resposta]).toEqual(['Atender pedidos', 'sim']);
    await put({ coleta_direta: 'nao' });
    await put({ finalidades: null });
    await put({ beneficios_empresa: '   ' });
    p = perguntasDe(await (await chamar(consultor, 'GET', `${base()}/questionario`)).json());
    expect([p.finalidades.resposta, p.coleta_direta.resposta, p.beneficios_empresa.resposta]).toEqual([null, 'nao', null]);
  });

  it('recusa pergunta desconhecida, escolha fora de sim/nao/nao_sei, texto longo, corpo vazio e campo a mais', async () => {
    const put = (corpo: unknown) => chamar(consultor, 'PUT', `${base()}/questionario`, corpo);
    expect((await put({ respostas: { inventada: 'x' } })).status).toBe(400);
    expect((await put({ respostas: { proporcional: 'talvez' } })).status).toBe(400);
    expect((await put({ respostas: { finalidades: 'a'.repeat(2001) } })).status).toBe(400);
    expect((await put({ respostas: {} })).status).toBe(400);
    expect((await put({ respostas: { finalidades: 'x' }, extra: 1 })).status).toBe(400);
  });

  it('isolamento: atividade de outro projeto é 404 na leitura, na escrita e nos logs, e nada é gravado', async () => {
    expect((await chamar(consultor, 'GET', `${base(P, 'lq-alheia')}/questionario`)).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${base(P, 'lq-alheia')}/questionario`, { respostas: { finalidades: 'x' } })).status).toBe(404);
    expect((await chamar(consultor, 'GET', `${base(P, 'lq-alheia')}/logs`)).status).toBe(404);
    expect((await env.DB.prepare(`SELECT 1 FROM lia_respostas WHERE ropa_id = 'lq-alheia'`).first())).toBeNull();
  });

  it('LIA existente sem respostas continua concluível, e responder não muda a conclusão nem o status', async () => {
    const lia = await chamar(consultor, 'PUT', `${base(P, 'lq-ropa2')}`, COMPLETA);
    expect(lia.status).toBe(201);
    const concluida = await chamar(consultor, 'PUT', base(P, 'lq-ropa2'), { status: 'concluida' });
    expect(concluida.status, await concluida.clone().text()).toBe(200); // sem nenhuma das 12 respostas
    const antes = await env.DB.prepare(`SELECT * FROM lia_assessments WHERE ropa_id = 'lq-ropa2'`).first();
    expect((await chamar(consultor, 'PUT', `${base(P, 'lq-ropa2')}/questionario`, { respostas: { proporcional: 'sim', menos_dados: 'Só o e-mail' } })).status).toBe(200);
    expect(await env.DB.prepare(`SELECT * FROM lia_assessments WHERE ropa_id = 'lq-ropa2'`).first()).toEqual(antes);
  });

  it('os logs usam entity_type lia, sem texto digitado, e apagar a LIA leva as respostas', async () => {
    await chamar(consultor, 'PUT', `${base()}/questionario`, { respostas: { realmente_necessario: 'sim', menos_dados: 'segredo-fictício-123' } });
    const r = await chamar(consultor, 'GET', `${base()}/logs`);
    expect(r.status).toBe(200);
    const texto = await r.clone().text();
    expect(texto).not.toContain('segredo-fictício-123');
    const { logs } = (await r.json()) as { logs: { evento: string; nome: string; data: string }[] };
    expect(logs.map((l) => l.evento)).toContain('Questionário respondido (Necessidade)');
    expect(Object.keys(logs[0]).sort()).toEqual(['data', 'evento', 'nome']);
    const gravada = await env.DB.prepare(`SELECT entity_type, entity_id FROM audit_logs WHERE action = 'lia.questionario' AND entity_id = 'lq-ropa' LIMIT 1`).first();
    expect(gravada).toEqual({ entity_type: 'lia', entity_id: 'lq-ropa' });

    await chamar(consultor, 'PUT', base(), { finalidade_legitima: 'x' });
    expect((await chamar(consultor, 'GET', `${base()}/logs`).then((x) => x.json()) as any).logs.map((l: any) => l.evento)).toContain('Criada');
    expect((await chamar(consultor, 'DELETE', base())).status).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM lia_respostas WHERE ropa_id = 'lq-ropa'`).first()).toBeNull();
  });
});
