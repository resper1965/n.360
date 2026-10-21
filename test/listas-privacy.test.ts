import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

/**
 * Listas do legado no n.privacy (spec 2026-10-19): Gaps, Riscos e LIA do projeto. Só leitura, só do projeto, o agente lê.
 */
const P = 'lp-proj';
const OUTRO = 'lp-outro';
const AGENTE = { userId: 'u-lp', email: 'lp@ness.lat', projectId: P, concessaoId: 'c-lp' };

const chamar = (h: Record<string, string>, caminho: string, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { headers: h }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const rota = (sufixo: string, p = P) => `/api/v1/projects/${p}/ropa/${sufixo}`;

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-lp', 'lp@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-lp', ?1, 'Cons', 'lp@ness.lat', 'consultor', 'Consultor'), ('g-lp2', ?2, 'Cons', 'lp@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-lp', 'u-lp', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis) VALUES
      ('lp-r1', ?1, 'Atividade Exemplo', 'Legítimo interesse'), ('lp-r2', ?1, 'Atividade Sem LIA', 'Interesse legitimo do controlador'),
      ('lp-r3', ?1, 'Atividade Consentimento', 'Consentimento'), ('lp-alheio', ?2, 'Atividade Alheia', 'Legítimo interesse')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('lp-pa', ?, 'pessoa', 'Responsável Exemplo')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('lp-d1', ?1, 'Recursos Humanos'), ('lp-d2', ?1, 'Jurídico'), ('lp-d9', ?2, 'Área Alheia')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO tratamento_departamentos (ropa_id, departamento_id, project_id) VALUES ('lp-r1', 'lp-d2', ?1), ('lp-r1', 'lp-d1', ?1), ('lp-alheio', 'lp-d9', ?2)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, ropa_id, title, description, recomendacao, action_plan, due_date, assigned_to_parte_id, status) VALUES
      ('lp-g1', ?1, 'lp-r1', 'Sem política', 'Sem política de retenção', 'Criar política', 'Redigir e aprovar', '2020-01-01', 'lp-pa', 'Open'),
      ('lp-g2', ?1, 'lp-r3', 'Gap fechado', NULL, NULL, NULL, NULL, NULL, 'Closed'),
      ('lp-g9', ?2, 'lp-alheio', 'Gap alheio', NULL, NULL, NULL, NULL, NULL, 'Open')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO acao_anexos (id, project_id, acao_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by) VALUES
      ('lp-x1', ?1, 'lp-g1', 'a.pdf', 'k1', 'h', 'pdf', 10, 'x'), ('lp-x2', ?1, 'lp-g1', 'b.pdf', 'k2', 'h', 'pdf', 10, 'x')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan, treatment_due_date, owner_parte_id, idr) VALUES
      ('lp-k1', ?1, 'lp-r1', 'Atividade Exemplo', 'Vazamento', 'Senha fraca', 4, 4, 'High', 'Mitigate', 'Ativar MFA', '2026-12-31', 'lp-pa', 1),
      ('lp-k9', ?2, 'lp-alheio', 'Atividade Alheia', 'Risco alheio', NULL, 2, 2, 'Low', 'Mitigate', NULL, NULL, NULL, 1)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id, finalidade_legitima, conclusao, status, concluida_por, concluida_em) VALUES
      ('lp-l1', ?1, 'lp-r1', 'Prevenção a fraude', 'prevalece', 'concluida', 'lp@ness.lat', '2026-10-01'),
      ('lp-l9', ?2, 'lp-alheio', 'LIA alheia', NULL, 'rascunho', NULL, NULL)`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-lp', email: 'lp@ness.lat', role: 'consultor' });
});

describe('GET /ropa/gaps', () => {
  it('lista os gaps do projeto com área, recomendação, plano, responsável, faixa e contagem de anexos', async () => {
    const r = await chamar(consultor, rota('gaps'));
    expect(r.status, await r.clone().text()).toBe(200);
    const { gaps } = await json<{ gaps: Record<string, unknown>[] }>(r);
    expect(gaps.map((g) => g.id).sort()).toEqual(['lp-g1', 'lp-g2']);
    expect(gaps.find((g) => g.id === 'lp-g1')).toEqual({
      id: 'lp-g1', ropa_id: 'lp-r1', atividade: 'Atividade Exemplo', area: 'Jurídico, Recursos Humanos', titulo: 'Sem política de retenção', recomendacao: 'Criar política',
      plano: 'Redigir e aprovar', responsavel: 'Responsável Exemplo', prazo: '2020-01-01', faixa: 'vencidas', status: 'Open', anexos: 2,
    });
    expect(gaps.find((g) => g.id === 'lp-g2')).toMatchObject({ titulo: 'Gap fechado', area: null, faixa: null, status: 'Closed', anexos: 0 });
  });
});

describe('GET /ropa/riscos-mapa (campos da lista)', () => {
  it('traz vulnerabilidade, plano, prazo, responsável (nome e id), área e idr', async () => {
    const { riscos } = await json<{ riscos: Record<string, unknown>[] }>(await chamar(consultor, rota('riscos-mapa')));
    expect(riscos.map((x) => x.id)).toEqual(['lp-k1']);
    expect(riscos[0]).toMatchObject({ vulnerabilidade: 'Senha fraca', plano: 'Ativar MFA', prazo: '2026-12-31', responsavel: 'Responsável Exemplo',
      owner_parte_id: 'lp-pa', area: 'Jurídico, Recursos Humanos', idr: 1 });
  });

  it('o CSV de riscos das atividades ganha a coluna Prazo', async () => {
    const txt = await (await chamar(consultor, `/api/v1/projects/${P}/export/riscos-atividade`)).text();
    expect(txt.split('\r\n')[0]).toContain('"Prazo"');
    expect(txt).toContain('"2026-12-31"');
  });
});

describe('GET /ropa/lias', () => {
  it('lista as LIAs do projeto e as atividades de legítimo interesse sem LIA como faltando', async () => {
    const r = await chamar(consultor, rota('lias'));
    expect(r.status, await r.clone().text()).toBe(200);
    const { lias } = await json<{ lias: Record<string, unknown>[] }>(r);
    expect(lias).toHaveLength(2);
    expect(lias.find((l) => l.ropa_id === 'lp-r1')).toEqual({
      ropa_id: 'lp-r1', atividade: 'Atividade Exemplo', area: 'Jurídico, Recursos Humanos', status: 'concluida', conclusao: 'prevalece', concluida_por: 'lp@ness.lat', concluida_em: '2026-10-01',
    });
    expect(lias.find((l) => l.ropa_id === 'lp-r2')).toEqual({
      ropa_id: 'lp-r2', atividade: 'Atividade Sem LIA', area: null, status: 'faltando', conclusao: null, concluida_por: null, concluida_em: null,
    });
  });
});

describe('GET /dpia (coluna Atividade)', () => {
  it('traz a finalidade do RoPA ligado; RIPD sem atividade vem com null', async () => {
    await env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, system_name, status) VALUES ('lp-d1', ?1, 'lp-r1', 'Sistema Exemplo', 'Draft'), ('lp-d2', ?1, NULL, 'Sem atividade', 'Draft')`).bind(P).run();
    const corpo = await json<{ assessments: Record<string, unknown>[] }>(await chamar(consultor, `/api/v1/projects/${P}/dpia`));
    expect(corpo.assessments.find((d) => d.id === 'lp-d1')).toMatchObject({ atividade: 'Atividade Exemplo', ropa_id: 'lp-r1' });
    expect(corpo.assessments.find((d) => d.id === 'lp-d2')).toMatchObject({ atividade: null });
  });
});

describe('agente MCP', () => {
  it('lê as três listas, só do projeto da concessão', async () => {
    for (const s of ['gaps', 'riscos-mapa', 'lias']) {
      const r = await chamar({}, rota(s), { AGENTE });
      expect(r.status, s).toBe(200);
      expect(await r.text(), s).not.toMatch(/alheio|Alheia/i);
    }
  });
});
