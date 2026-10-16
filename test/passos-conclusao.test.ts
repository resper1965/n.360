import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env } from 'cloudflare:test';
import { semearBancada, chamar, catalogoDeTeste, type Sessoes } from './helpers/passos';
import { __usarCatalogoDeTeste } from '../src/data/passos/catalogo';

const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'p-a', concessaoId: 'c-1' };
const MOTIVO = 'Cliente já tinha o documento assinado em 2025';

describe('concluir, exceção, reabrir, bloquear e situação antiga', () => {
  let s: Sessoes;
  beforeAll(async () => {
    __usarCatalogoDeTeste(catalogoDeTeste());
    s = await semearBancada();
    await env.DB.prepare("INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-1','u-cons','p-a', datetime('now','+30 days'))").run();
  });
  afterAll(() => __usarCatalogoDeTeste(null));
  const url = (passo: string, acao = '') => `/api/v1/projects/p-a/passos/${passo}${acao ? `/${acao}` : ''}`;
  const post = (passo: string, acao: string, corpo: unknown, h = s.adm, amb: Record<string, unknown> = {}) => chamar('POST', url(passo, acao), h, corpo, amb);
  const put = (passo: string, corpo: unknown, h = s.adm) => chamar('PUT', url(passo, 'campos'), h, corpo);
  const faseStatus = async (n: number) => (await env.DB.prepare('SELECT status, completed_at FROM project_phases WHERE project_id = ? AND phase_number = ?').bind('p-a', n).first<{ status: string; completed_at: string | null }>())!;
  const prova = () => env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by) VALUES ('ev-a1','p-a','dec.md','k-a1','h','x')"),
    env.DB.prepare("INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, evidence_id) VALUES ('cp-1','p-a',3,'p3_3',0,'ev-a1') ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET evidence_id = 'ev-a1'"),
  ]);

  it('409 com a lista do que falta; cumprido o critério, 200', async () => {
    const r1 = await post('p3_3', 'concluir', {});
    expect(r1.status).toBe(409);
    expect((await r1.json<any>()).faltam.map((x: any) => x.tipo)).toContain('campos_preenchidos');
    expect((await env.DB.prepare("SELECT is_checked FROM checklist_progress WHERE project_id='p-a' AND item_id='p3_3'").first<any>())?.is_checked ?? 0).toBe(0);
    await put('p3_3', { campos: { justificativas: 'A.7.4 fica de fora.' } });
    await prova();
    const r2 = await post('p3_3', 'concluir', {});
    expect(r2.status, await r2.clone().text()).toBe(200);
    expect(await r2.json()).toMatchObject({ ok: true, estado: 'concluido', concluido_por_excecao: false });
    expect((await faseStatus(3)).status).toBe('in_progress');
  });

  it('exceção é da equipe: org_admin toma 403, motivo curto 400, equipe conclui e a trilha guarda a justificativa', async () => {
    expect((await post('p3_4', 'concluir', { excecao: { motivo: MOTIVO } }, s.adm)).status).toBe(403);
    expect((await post('p3_4', 'concluir', { excecao: { motivo: 'curto' } }, s.cons)).status).toBe(400);
    const r = await post('p3_4', 'concluir', { excecao: { motivo: MOTIVO } }, s.cons);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ concluido_por_excecao: true });
    const trilha = await env.DB.prepare("SELECT justification FROM audit_logs WHERE project_id = 'p-a' AND action = 'passo.concluido_com_excecao'").first<{ justification: string }>();
    expect(trilha?.justification).toBe(MOTIVO);
  });

  it('todos os passos da fase concluídos levam a fase a completed com completed_at', async () => {
    const f = await faseStatus(3);
    expect(f.status).toBe('completed');
    expect(f.completed_at).not.toBeNull();
  });

  it('o motivo da exceção só aparece para a equipe; o cliente vê justificada', async () => {
    const cli = await (await chamar('GET', url('p3_4'), s.adm)).json<any>();
    expect(cli.excecao).toEqual({ justificada: true });
    expect(cli.anotacao_anterior).toBeNull();
    const eq = await (await chamar('GET', url('p3_4'), s.cons)).json<any>();
    expect(eq.excecao).toMatchObject({ motivo: MOTIVO });
  });

  it('reabrir volta a is_checked 0, zera a exceção e registra; a fase deixa completed', async () => {
    const r = await post('p3_4', 'reabrir', {});
    expect(r.status).toBe(200);
    const l = await env.DB.prepare("SELECT is_checked, excecao_motivo FROM checklist_progress WHERE project_id='p-a' AND item_id='p3_4'").first<any>();
    expect(l).toEqual({ is_checked: 0, excecao_motivo: null });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'passo.reaberto'").first<any>()).n).toBe(1);
    const f = await faseStatus(3);
    expect(f.status).toBe('in_progress');
    expect(f.completed_at).toBeNull();
  });

  it('bloquear exige motivo e responsável; derruba a fase para blocked; desbloquear devolve', async () => {
    expect((await post('p3_4', 'bloquear', { motivo: 'Aguardando a diretoria' }, s.cons)).status).toBe(400);
    expect((await post('p3_4', 'bloquear', { motivo: 'abc', responsavel: 'Maria Souza' }, s.cons)).status).toBe(400);
    expect((await post('p3_4', 'bloquear', { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' }, s.leitura)).status).toBe(403);
    expect((await post('p3_4', 'bloquear', { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' }, s.cons)).status).toBe(200);
    const b = await (await chamar('GET', '/api/v1/projects/p-a/bancada', s.cons)).json<any>();
    expect(b.fases.find((f: any) => f.numero === 3)).toMatchObject({ situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza' } });
    expect((await faseStatus(3)).status).toBe('blocked');
    expect((await post('p3_3', 'bloquear', { motivo: 'passo já concluído', responsavel: 'Maria' }, s.cons)).status).toBe(409);
    expect((await post('p3_4', 'desbloquear', {}, s.cons)).status).toBe(200);
    expect((await faseStatus(3)).status).toBe('in_progress');
  });

  it('bloquear no passo certo encerra a situação antiga bloqueada da fase', async () => {
    await env.DB.prepare("UPDATE project_phases SET status='blocked', legado_status='blocked' WHERE project_id='p-a' AND phase_number=4").run();
    expect((await post('p4_1', 'bloquear', { motivo: 'Aguardando a diretoria', responsavel: 'Maria' }, s.cons)).status).toBe(404); // fora do catálogo de teste
    await env.DB.prepare("UPDATE project_phases SET legado_status=NULL, status='pending' WHERE project_id='p-a' AND phase_number=4").run();
    await env.DB.prepare("UPDATE project_phases SET status='blocked', legado_status='blocked' WHERE project_id='p-a' AND phase_number=3").run();
    expect((await post('p3_4', 'bloquear', { motivo: 'Aguardando a diretoria', responsavel: 'Maria' }, s.cons)).status).toBe(200);
    const f = await env.DB.prepare("SELECT legado_status FROM project_phases WHERE project_id='p-a' AND phase_number=3").first<any>();
    expect(f.legado_status).toBeNull();
    await post('p3_4', 'desbloquear', {}, s.cons);
  });

  it('DELETE situacao-antiga é da equipe e libera a fase', async () => {
    await env.DB.prepare("UPDATE project_phases SET status='blocked', legado_status='blocked' WHERE project_id='p-a' AND phase_number=6").run();
    const del = (h: Record<string, string>) => chamar('DELETE', '/api/v1/projects/p-a/bancada/fases/6/situacao-antiga', h);
    expect((await del(s.adm)).status).toBe(403);
    expect((await del(s.cons)).status).toBe(200);
    // a fase 6 não está no catálogo reduzido do teste; o que importa é a marca antiga ter sido encerrada
    const f = await env.DB.prepare("SELECT legado_status FROM project_phases WHERE project_id='p-a' AND phase_number=6").first<any>();
    expect(f.legado_status).toBeNull();
  });

  it('PATCH grava só o que veio, valida a data e o passo vira em andamento', async () => {
    expect((await chamar('PATCH', url('p2_1'), s.adm, { assigned_to: 'Maria Souza', due_date: '2026-11-05' })).status).toBe(200);
    expect((await chamar('PATCH', url('p2_1'), s.adm, { due_date: '2026-12-01' })).status).toBe(200);
    const l = await env.DB.prepare("SELECT assigned_to, due_date FROM checklist_progress WHERE project_id='p-a' AND item_id='p2_1'").first<any>();
    expect(l).toEqual({ assigned_to: 'Maria Souza', due_date: '2026-12-01' });
    expect((await chamar('PATCH', url('p2_1'), s.adm, { due_date: '05/11/2026' })).status).toBe(400);
    const g = await (await chamar('GET', url('p2_1'), s.adm)).json<any>();
    expect(g.passo.estado).toBe('em_andamento');
  });

  it('entrevistas: p2_1 só conclui depois das duas trilhas', async () => {
    await put('p2_1', { campos: { resumo: 'Duas áreas ouvidas.' } });
    const r1 = await post('p2_1', 'concluir', {});
    expect(r1.status).toBe(409);
    expect((await r1.json<any>()).faltam.map((x: any) => x.tipo)).toEqual(['entrevistas_concluidas']);
    await env.DB.prepare("INSERT INTO project_interviews (id, project_id, track, question, answer) VALUES ('i1','p-a','executiva','q','a'), ('i2','p-a','rh','q','a')").run();
    expect((await post('p2_1', 'concluir', {})).status).toBe(200);
  });

  it('anotação antiga: só a equipe descarta, e só se não for o JSON do assistente', async () => {
    await env.DB.prepare("INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes) VALUES ('cp-n','p-a',3,'p3_4',0,'texto livre antigo') ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET notes = 'texto livre antigo'").run();
    expect((await chamar('GET', url('p3_4'), s.cons).then((r) => r.json<any>())).anotacao_anterior).toBe('texto livre antigo');
    const del = (h: Record<string, string>, amb: Record<string, unknown> = {}) => chamar('DELETE', url('p3_4', 'anotacao-anterior'), h, undefined, amb);
    expect((await del(s.adm)).status).toBe(403);
    expect((await del({}, { AGENTE })).status).toBe(403);
    expect((await del(s.cons)).status).toBe(200);
    expect((await env.DB.prepare("SELECT notes FROM checklist_progress WHERE project_id='p-a' AND item_id='p3_4'").first<any>()).notes).toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'passo.anotacao_descartada'").first<any>()).n).toBe(1);
    await env.DB.prepare("UPDATE checklist_progress SET notes = '{\"aprovador\":\"CEO\"}' WHERE project_id='p-a' AND item_id='p3_4'").run();
    expect((await del(s.cons)).status).toBe(409);
  });

  it('o agente não reabre, bloqueia nem desbloqueia', async () => {
    for (const acao of ['reabrir', 'bloquear', 'desbloquear']) {
      expect((await post('p3_3', acao, acao === 'bloquear' ? { motivo: 'Aguardando', responsavel: 'Maria' } : {}, {}, { AGENTE })).status, acao).toBe(403);
    }
  });
});
