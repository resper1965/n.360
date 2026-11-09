import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { somarMeses, salvarPrazo } from '../src/services/fornecedor-modelos';
import { hojeEmSaoPaulo } from '../src/services/hoje';

/** Fatia 2 do ciclo de avaliação do fornecedor: teto da validade pelo prazo do modelo e "reavaliar" quando o tipo muda. */
const P = 'rv-proj', ORG = 'rv-org';
const B = `/api/v1/projects/${P}`;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

let consultor: Record<string, string>;
const hoje = hojeEmSaoPaulo();
const avaliar = (valido_ate: string) => chamar(consultor, 'POST', `${B}/terceiros/rv-f/avaliacoes`, { resultado: 'aprovado', valido_ate });
type T = { id: string; situacao: string; pendencias: string[]; terceiro_tipo: string; validade_maxima?: string; ultima_avaliacao: { tipo_avaliado: string } | null };
const terceiro = async () => ((await (await chamar(consultor, 'GET', `${B}/terceiros`)).json()) as T[]).find((t) => t.id === 'rv-f')!;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES (?1, 'Consultoria', ?1)`).bind(ORG),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', ?)`).bind(P, ORG),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('rv-cons', 'cons@rv.teste', 'x', 'Cons', 'consultor', NULL, ?)`).bind(ORG),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-rv', ?, 'Cons', 'cons@rv.teste', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('rv-f', ?, 'organizacao', 'Fornecedor', 'medio')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('rv-v', ?1, 'rv-f', 'terceiro', 'projeto', ?1)`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['rv-cons'], ['privacy']);
  consultor = await sessionFor({ id: 'rv-cons', email: 'cons@rv.teste', role: 'consultor', org_id: ORG });
});

describe('teto da validade e reavaliação', () => {
  it('a validade não passa do prazo do modelo do tipo (médio: 24 meses); o tipo da avaliação fica gravado', async () => {
    const acima = await avaliar(somarMeses(hoje, 25));
    expect(acima.status).toBe(400);
    expect(((await acima.json()) as { error: string }).error).toContain('24 meses');
    const r = await avaliar(somarMeses(hoje, 24));
    expect(r.status, await r.clone().text()).toBe(201);
    const t = await terceiro();
    expect(t).toMatchObject({ situacao: 'vigente' });
    expect(t.ultima_avaliacao!.tipo_avaliado).toBe('medio');
    const ficha = (await (await chamar(consultor, 'GET', `${B}/terceiros/rv-f`)).json()) as T;
    expect(ficha.validade_maxima).toBe(somarMeses(hoje, 24));
  });

  it('a criticidade que troca o tipo pede reavaliação: situação "reavaliar", pendência "Avaliação" e contagem do encarregado', async () => {
    const crit = { impacto: 'alto', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' };
    expect((await chamar(consultor, 'POST', `${B}/terceiros/rv-f/criticidades`, crit)).status).toBe(201);
    const t = await terceiro();
    expect(t).toMatchObject({ terceiro_tipo: 'critico', situacao: 'reavaliar' });
    expect(t.pendencias).toContain('Avaliação');
    const enc = (await (await chamar(consultor, 'GET', `${B}/encarregado`)).json()) as { terceiros: { pendentes: number; com_pendencia: number } };
    expect(enc.terceiros).toMatchObject({ pendentes: 1, com_pendencia: 1 });
  });

  it('a avaliação nova no tipo atual vale pelo prazo dele (crítico: 12 meses, ou o que a consultoria definir) e volta a vigente', async () => {
    expect((await avaliar(somarMeses(hoje, 13))).status).toBe(400);
    await salvarPrazo(env.DB, ORG, 'critico', 6, 'adm@rv.teste');
    expect((await avaliar(somarMeses(hoje, 7))).status).toBe(400);
    expect((await avaliar(somarMeses(hoje, 6))).status).toBe(201);
    const t = await terceiro();
    expect(t).toMatchObject({ situacao: 'vigente' });
    expect(t.ultima_avaliacao!.tipo_avaliado).toBe('critico');
  });
});
