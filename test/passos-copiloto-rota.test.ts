import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, concederModulos, workerEnv } from './helpers/d1';
import { __usarCatalogoDeTeste } from '../src/data/passos/catalogo';
import type { Catalogo, Passo } from '../src/data/passos/tipos';
import campoJson from '../contracts/bancada/copiloto-campo.json';
import conversaJson from '../contracts/bancada/copiloto-conversa.json';
import revisaoJson from '../contracts/bancada/copiloto-revisao.json';

/** Rotas do copiloto do passo. D1 real; o binding AI é um dublê pontual. A regra de negócio está em copiloto-passo.test.ts. */
const P = 'cpr-p';
const OUTRA = 'cpr-outra';
const PASSO: Passo = {
  id: 'p3_3', fase: 3, ordem: 1, titulo: 'Registrar as justificativas', clausula: 'A.5', porQue: 'O auditor vai pedir o registro.',
  campos: [
    { id: 'justificativas', rotulo: 'Justificativas', tipo: 'texto_longo', obrigatorio: true, exemplo: 'A.7.4: sem acesso físico.' },
    { id: 'aprovado_por', rotulo: 'Quem aprovou?', tipo: 'texto', obrigatorio: true, exemplo: 'Nome e cargo.', semIA: true },
  ],
  prova: { descricao: 'Arquivo', obrigatoria: false, aceita: 'arquivo' }, ondeVive: [], concluidoQuando: [{ tipo: 'campos_preenchidos', rotulo: 'Campos' }],
};
const catalogo: Catalogo = { versao: 't', etapas: [], fases: [], passos: [PASSO] };

type Msg = { role: string; content: string };
const ia = { resposta: {} as unknown, chamadas: 0 };
const AI = { run: async (_m: string, _e: { messages: Msg[] }) => { ia.chamadas++; return { response: ia.resposta }; } };
const rota = (h: Record<string, string>, projeto: string, passo: string, acao: string, corpo: unknown, ambiente: Record<string, unknown> = { ...env, AI }) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${projeto}/passos/${passo}/copiloto/${acao}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), ambiente as never);
const campo = (h: Record<string, string>, corpo: unknown = { campo: 'justificativas' }, projeto = P, passo = 'p3_3') => rota(h, projeto, passo, 'rascunhar-campo', corpo);

let consultor: Record<string, string>, orgAdmin: Record<string, string>, orgUser: Record<string, string>, outro: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  __usarCatalogoDeTeste(catalogo);
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_cpr', 'Outra', 'outra-cpr')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'O', 'ISO 27001', 'Controller', 'Active', 'org_cpr')`).bind(P, OUTRA),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('cpr-c', 'cons@ness.lat', 'x', 'C', 'consultor', NULL, 'org_ness'),
      ('cpr-adm', 'adm@cliente.com', 'x', 'A', 'org_admin', ?1, 'org_ness'),
      ('cpr-usr', 'usr@cliente.com', 'x', 'U', 'org_user', ?1, 'org_ness'),
      ('cpr-out', 'adm@outra.com', 'x', 'O', 'org_admin', ?2, 'org_cpr')`).bind(P, OUTRA),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('cpr-g1', ?, 'C', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('cpr-conc', 'cpr-c', ?, datetime('now', '+30 days'))`).bind(P),
  ]);
  await concederModulos(['cpr-adm', 'cpr-usr', 'cpr-c', 'cpr-out'], ['iso']);
  consultor = await sessionFor({ id: 'cpr-c', email: 'cons@ness.lat', role: 'consultor' });
  orgAdmin = await sessionFor({ id: 'cpr-adm', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
  orgUser = await sessionFor({ id: 'cpr-usr', email: 'usr@cliente.com', role: 'org_user', client_project_id: P });
  outro = await sessionFor({ id: 'cpr-out', email: 'adm@outra.com', role: 'org_admin', client_project_id: OUTRA, org_id: 'org_cpr' });
});
afterAll(() => __usarCatalogoDeTeste(null));
beforeEach(() => { ia.resposta = { valor: 'Texto proposto', fontes: [] }; ia.chamadas = 0; });

const gravacoes = async () => (await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM project_phase_answers) + (SELECT COUNT(*) FROM checklist_progress) AS n`).first<{ n: number }>())!.n;
const formaDe = (o: unknown): unknown => Array.isArray(o) ? (o.length ? [formaDe(o[0])] : []) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, formaDe(v)])) : typeof o;

describe('POST .../copiloto/rascunhar-campo', () => {
  it('equipe e org_admin recebem a proposta, com as mesmas chaves do contrato, e nada é gravado', async () => {
    const antes = await gravacoes();
    for (const h of [consultor, orgAdmin]) {
      const r = await campo(h);
      expect(r.status).toBe(200);
      const b = await r.json() as Record<string, unknown>;
      expect(b).toMatchObject({ ok: true, proposta: { campo: 'justificativas', valor: 'Texto proposto' } });
      const { indisponivel_exemplo: _ex, ...contrato } = campoJson as Record<string, unknown>;
      expect(Object.keys(b).sort()).toEqual(Object.keys(contrato).sort());
      expect(formaDe((b.proposta as { fontes: unknown[] }).fontes)).toEqual([]);
      expect(Object.keys(b.proposta as object).sort()).toEqual(Object.keys((contrato as { proposta: object }).proposta).sort());
    }
    expect(await gravacoes()).toBe(antes);
  });

  it('org_user: 403, sem chamar o modelo (a trava de papel de escrita do auth já recusa antes do serviço)', async () => {
    const r = await campo(orgUser);
    expect(r.status).toBe(403);
    expect(ia.chamadas).toBe(0);
  });

  it('agente MCP: 403 fora do alcance, sem chamar o modelo', async () => {
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/passos/p3_3/copiloto/rascunhar-campo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agente-Confirmado': '1' }, body: JSON.stringify({ campo: 'justificativas' }),
    }), { ...workerEnv(), AI, AGENTE: { userId: 'cpr-c', email: 'cons@ness.lat', projectId: P, concessaoId: 'cpr-conc' } } as never);
    expect(r.status).toBe(403);
    expect((await r.json() as { error: string }).error).toContain('fora do alcance do agente');
    expect(ia.chamadas).toBe(0);
  });

  it('passo inexistente: 404; campo semIA: 400; campo desconhecido: 404; corpo com chave a mais ou sem campo: 400', async () => {
    expect((await campo(consultor, { campo: 'justificativas' }, P, 'p9_9')).status).toBe(404);
    const semIA = await campo(consultor, { campo: 'aprovado_por' });
    expect(semIA.status).toBe(400);
    expect((await semIA.json() as { error: string }).error).toBe('Este campo é da pessoa; o assistente não o propõe');
    expect((await campo(consultor, { campo: 'nao_existe' })).status).toBe(404);
    expect((await campo(consultor, { campo: 'justificativas', extra: 1 })).status).toBe(400);
    expect((await campo(consultor, {})).status).toBe(400);
    expect((await campo(consultor, { campo: 'justificativas', instrucao: 'x'.repeat(501) })).status).toBe(400);
    expect(ia.chamadas).toBe(0);
  });

  it('projeto de outro tenant: 403 ou 404, sem chamar o modelo', async () => {
    expect([403, 404]).toContain((await campo(outro, { campo: 'justificativas' }, P)).status);
    expect([403, 404]).toContain((await campo(orgAdmin, { campo: 'justificativas' }, OUTRA)).status);
    expect(ia.chamadas).toBe(0);
  });

  it('modelo ausente: 200 com indisponivel', async () => {
    const r = await rota(consultor, P, 'p3_3', 'rascunhar-campo', { campo: 'justificativas' }, { ...env, AI: undefined });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ indisponivel: true });
  });
});

const CONVERSA = 'O cliente disse que a revisão acontece todo trimestre e que o time é remoto, sem acesso físico.';
const conversa = (h: Record<string, string>, corpo: unknown = { conversa: CONVERSA }, projeto = P) => rota(h, projeto, 'p3_3', 'da-conversa', corpo);

describe('POST .../copiloto/da-conversa', () => {
  beforeEach(() => { ia.resposta = { campos: { justificativas: 'Revisão trimestral; time remoto.', aprovado_por: 'Maria' } }; });

  it('equipe e org_admin recebem as propostas, com as mesmas chaves do contrato, e nada é gravado', async () => {
    const antes = await gravacoes();
    for (const h of [consultor, orgAdmin]) {
      const r = await conversa(h);
      expect(r.status).toBe(200);
      const b = await r.json() as Record<string, unknown>;
      const { indisponivel_exemplo: _ex, ...contrato } = conversaJson as Record<string, unknown>;
      expect(Object.keys(b).sort()).toEqual(Object.keys(contrato).sort());
      expect(b).toMatchObject({ ok: true, propostas: { justificativas: 'Revisão trimestral; time remoto.' }, nao_encontrado: [], avisos: [] });
      expect(b.propostas).not.toHaveProperty('aprovado_por');
    }
    expect(await gravacoes()).toBe(antes);
  });

  it('conversa com menos de 20 ou mais de 8.000 caracteres, sem conversa ou com chave a mais: 400 sem chamar o modelo', async () => {
    for (const corpo of [{ conversa: 'curta demais' }, { conversa: 'a'.repeat(8001) }, {}, { conversa: CONVERSA, campo: 'justificativas' }, { conversa: 42 }]) {
      expect((await conversa(consultor, corpo)).status, JSON.stringify(corpo).slice(0, 40)).toBe(400);
    }
    expect(ia.chamadas).toBe(0);
  });

  it('org_user 403; agente MCP 403 fora do alcance; passo inexistente 404; outro tenant 403 ou 404; modelo ausente 200 indisponível', async () => {
    expect((await conversa(orgUser)).status).toBe(403);
    const ag = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/passos/p3_3/copiloto/da-conversa`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agente-Confirmado': '1' }, body: JSON.stringify({ conversa: CONVERSA }),
    }), { ...workerEnv(), AI, AGENTE: { userId: 'cpr-c', email: 'cons@ness.lat', projectId: P, concessaoId: 'cpr-conc' } } as never);
    expect(ag.status).toBe(403);
    expect((await ag.json() as { error: string }).error).toContain('fora do alcance do agente');
    expect((await rota(consultor, P, 'p9_9', 'da-conversa', { conversa: CONVERSA })).status).toBe(404);
    expect([403, 404]).toContain((await conversa(outro)).status);
    expect([403, 404]).toContain((await conversa(orgAdmin, { conversa: CONVERSA }, OUTRA)).status);
    expect(ia.chamadas).toBe(0);
    const sem = await rota(consultor, P, 'p3_3', 'da-conversa', { conversa: CONVERSA }, { ...env, AI: undefined });
    expect(sem.status).toBe(200);
    expect(await sem.json()).toEqual({ indisponivel: true });
  });
});

const revisao = (h: Record<string, string>, corpo: unknown = undefined, projeto = P) => rota(h, projeto, 'p3_3', 'revisao', corpo);

describe('POST .../copiloto/revisao', () => {
  beforeAll(async () => {
    await env.DB.prepare(`INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer) VALUES ('cpr-a1', ?, 3, 'p3_3.justificativas', 'A.7.4: sem acesso físico.')`).bind(P).run();
  });
  beforeEach(() => {
    ia.resposta = { resumo: 'Falta data.', pontos: [{ severidade: 'alto', alvo: { tipo: 'campo', id: 'justificativas' }, o_que_o_auditor_questionaria: 'Quem revisou?', por_que: 'Sem data.' }, { severidade: 'alto', alvo: { tipo: 'campo', id: 'zzz' }, o_que_o_auditor_questionaria: 'x', por_que: 'y' }] };
  });

  it('sem corpo ou com {}: equipe e org_admin recebem a revisão, com as mesmas chaves do contrato, e nada é gravado', async () => {
    const antes = await gravacoes();
    for (const [h, corpo] of [[consultor, undefined], [orgAdmin, {}]] as const) {
      const r = await revisao(h, corpo);
      expect(r.status).toBe(200);
      const b = await r.json() as Record<string, unknown>;
      const { indisponivel_exemplo: _ex, ...contrato } = revisaoJson as Record<string, unknown>;
      expect(Object.keys(b).sort()).toEqual(Object.keys(contrato).sort());
      expect(Object.keys((b.pontos as object[])[0]).sort()).toEqual(Object.keys((contrato as { pontos: object[] }).pontos[0]).sort());
      expect(b.rotulo).toBe('Revisão assistida; não é parecer de certificação');
      expect(b.pontos).toHaveLength(1);
    }
    expect(await gravacoes()).toBe(antes);
  });

  it('corpo com chave ou JSON inválido: 400; org_user 403; agente MCP 403; passo inexistente 404; outro tenant 403 ou 404; modelo ausente 200', async () => {
    expect((await revisao(consultor, { campo: 'x' })).status).toBe(400);
    const ruim = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/passos/p3_3/copiloto/revisao`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor }, body: '{nao' }), { ...env, AI } as never);
    expect(ruim.status).toBe(400);
    expect((await revisao(orgUser)).status).toBe(403);
    const ag = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/passos/p3_3/copiloto/revisao`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agente-Confirmado': '1' }, body: '{}',
    }), { ...workerEnv(), AI, AGENTE: { userId: 'cpr-c', email: 'cons@ness.lat', projectId: P, concessaoId: 'cpr-conc' } } as never);
    expect(ag.status).toBe(403);
    expect((await ag.json() as { error: string }).error).toContain('fora do alcance do agente');
    expect((await rota(consultor, P, 'p9_9', 'revisao', undefined)).status).toBe(404);
    expect([403, 404]).toContain((await revisao(outro)).status);
    expect([403, 404]).toContain((await revisao(orgAdmin, undefined, OUTRA)).status);
    expect(ia.chamadas).toBe(0);
    const sem = await rota(consultor, P, 'p3_3', 'revisao', undefined, { ...env, AI: undefined });
    expect(await sem.json()).toEqual({ indisponivel: true });
  });
});
