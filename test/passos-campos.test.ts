import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env } from 'cloudflare:test';
import { semearBancada, chamar, catalogoDeTeste, type Sessoes } from './helpers/passos';
import { __usarCatalogoDeTeste } from '../src/data/passos/catalogo';

const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };

describe('PUT /projects/:id/passos/:itemId/campos', () => {
  let s: Sessoes;
  beforeAll(async () => {
    __usarCatalogoDeTeste(catalogoDeTeste());
    s = await semearBancada();
    await env.DB.prepare("INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))").run();
  });
  afterAll(() => __usarCatalogoDeTeste(null));
  const put = (corpo: unknown, h = s.adm, projeto = 'p-a', passo = 'p3_3', amb: Record<string, unknown> = {}) =>
    chamar('PUT', `/api/v1/projects/${projeto}/passos/${passo}/campos`, h, corpo, amb);
  const resposta = (chave: string) => env.DB.prepare("SELECT answer FROM project_phase_answers WHERE project_id = 'p-a' AND question_key = ?").bind(chave).first<{ answer: string }>();

  it('grava, devolve salvo_em e leva o cache da fase a in_progress', async () => {
    const r = await put({ campos: { justificativas: 'A.7.4 fica de fora.' } });
    expect(r.status, await r.clone().text()).toBe(200);
    const j = await r.json<any>();
    expect(j.salvo_em).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(j.gravados).toEqual({ justificativas: j.salvo_em });
    expect(j.avaliacao.ok).toBe(false);
    expect(j.fase).toEqual({ numero: 3, situacao: 'in_progress' });
    const f = await env.DB.prepare("SELECT status FROM project_phases WHERE project_id = 'p-a' AND phase_number = 3").first<{ status: string }>();
    expect(f?.status).toBe('in_progress');
  });

  it('GET devolve o valor com quem gravou e herdado false', async () => {
    const j = await (await chamar('GET', '/api/v1/projects/p-a/passos/p3_3', s.adm)).json<any>();
    expect(j.valores.justificativas).toMatchObject({ valor: 'A.7.4 fica de fora.', por: 'a@x.test', herdado: false });
  });

  it('recusa opção fora da lista, campo desconhecido, chave a mais e texto acima do teto', async () => {
    const r = await put({ campos: { aprovador: 'Estagiário' } }, s.adm, 'p-a', 'p3_4');
    expect(r.status).toBe(400);
    expect((await r.json<any>()).campo).toBe('aprovador');
    expect((await put({ campos: { nao_existe: 'x' } })).status).toBe(400);
    expect((await put({ campos: { justificativas: 'x' }, extra: 1 })).status).toBe(400);
    expect((await put({ campos: { justificativas: 'x'.repeat(4001) } })).status).toBe(400);
  });

  it('valor vazio apaga a linha', async () => {
    await put({ campos: { aprovador: 'CEO' } }, s.adm, 'p-a', 'p3_4');
    expect(await resposta('p3_4.aprovador')).toMatchObject({ answer: 'CEO' });
    expect((await put({ campos: { aprovador: '' } }, s.adm, 'p-a', 'p3_4')).status).toBe(200);
    expect(await resposta('p3_4.aprovador')).toBeNull();
  });

  it('409 quando outra pessoa alterou o campo, e 200 quando o visto confere', async () => {
    await put({ campos: { justificativas: 'versão da Ana' } });
    const r = await put({ campos: { justificativas: 'versão do Bia' }, vistos: { justificativas: null } }, s.cons);
    expect(r.status).toBe(409);
    const atual = (await r.json<any>()).conflitos[0];
    expect(atual).toMatchObject({ campo: 'justificativas', valor_atual: 'versão da Ana' });
    const ok = await put({ campos: { justificativas: 'versão do Bia' }, vistos: { justificativas: atual.atualizado_em } }, s.cons);
    expect(ok.status).toBe(200);
  });

  it('campo que substitui pergunta grava na question_key original, visível em /phase-answers', async () => {
    expect((await put({ campos: { escopo_antigo: 'Todo o escritório de São Paulo.' } })).status).toBe(200);
    expect(await resposta('p3_q1')).toMatchObject({ answer: 'Todo o escritório de São Paulo.' });
    expect(await resposta('p3_3.escopo_antigo')).toBeNull();
    const r = await chamar('GET', '/api/v1/projects/p-a/phase-answers', s.adm);
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).toContain('Todo o escritório de São Paulo.');
  });

  it('valor herdado do JSON antigo de notes vira linha no primeiro autosave do passo', async () => {
    await env.DB.prepare("DELETE FROM project_phase_answers WHERE project_id = 'p-a' AND question_key = 'p3_3.justificativas'").run();
    await env.DB.prepare("INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes) VALUES ('cp-h','p-a',3,'p3_3',0,?) ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET notes = excluded.notes")
      .bind(JSON.stringify({ justificativas: 'texto do assistente antigo' })).run();
    const antes = await (await chamar('GET', '/api/v1/projects/p-a/passos/p3_3', s.adm)).json<any>();
    expect(antes.valores.justificativas).toMatchObject({ valor: 'texto do assistente antigo', herdado: true });
    const r = await put({ campos: { escopo_antigo: 'Outro campo.' } });
    expect((await r.json<any>()).gravados).toHaveProperty('justificativas');
    const depois = await (await chamar('GET', '/api/v1/projects/p-a/passos/p3_3', s.adm)).json<any>();
    expect(depois.valores.justificativas).toMatchObject({ valor: 'texto do assistente antigo', herdado: false });
  });

  it('papel de leitura grava (paridade com marcar item); conta de outro projeto toma 403', async () => {
    expect((await put({ campos: { justificativas: 'do leitor' } }, s.leitura)).status).toBe(200);
    expect((await put({ campos: { justificativas: 'invasor' } }, s.admB)).status).toBe(403);
  });

  it('agente grava campos, mas toma 403 ao concluir', async () => {
    expect((await put({ campos: { justificativas: 'rascunho do agente' } }, {}, 'p-a', 'p3_3', { AGENTE })).status).toBe(200);
    expect((await chamar('POST', '/api/v1/projects/p-a/passos/p3_3/concluir', {}, {}, { AGENTE })).status).toBe(403);
  });

  it('duas gravações em 10 minutos geram uma linha de trilha por pessoa e passo', async () => {
    await put({ campos: { aprovador: 'CEO' } }, s.adm, 'p-a', 'p3_4');
    await put({ campos: { aprovador: 'CISO' } }, s.adm, 'p-a', 'p3_4');
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE project_id = 'p-a' AND action = 'passo.campos_salvos' AND actor = 'a@x.test' AND details LIKE '%p3_4%'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });
});
