import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, designarConsultor, inserirAtivo } from './helpers/d1';
import { faixaDoCaminho } from '../src/modulos';
import { LIMIAR_SIMILAR } from '../src/services/similares';

/**
 * Parecidos por significado (etapa 2 da entrevista do RoPA). D1 real; o binding AI é um dublê PONTUAL com vetores fabricados:
 * os três nomes de folha ficam perto entre si e "controle de acesso físico" fica longe. O que o teste prova é a regra em volta
 * do modelo (candidatos do banco, cosseno, limiar, limite, isolamento, falha), não a qualidade do bge-m3.
 */
const P = 'sim-p';
const OUTRO = 'sim-outro';
const DIGITADO = 'folha de pagamento';

// Vetores fabricados (4 dimensões). Texto desconhecido vira um vetor ortogonal a todos, cosseno 0.
const VETORES: Record<string, number[]> = {
  [DIGITADO]: [1, 0.2, 0, 0],
  'payroll system': [0.9, 0.35, 0.1, 0],
  'processo de pagamento': [0.8, 0, 0.5, 0],
  'controle de acesso físico': [0, 0, 0.1, 1],
  // Áreas: quatro perto do digitado, para o limite de 3; uma logo abaixo do limiar.
  'Folha': [1, 0.25, 0, 0], 'Departamento Pessoal': [0.95, 0.3, 0.05, 0], 'Remuneração': [0.9, 0.1, 0.2, 0],
  'Benefícios e salários': [0.85, 0.2, 0.3, 0], 'Facilities': [0.6, 0, 0.6, 0.4],
};
const ia = { textos: [] as string[][], chamadas: 0, falha: false, formato: 'ok' as 'ok' | 'ruim' };
const AI = {
  run: async (_modelo: string, entrada: { text: string[] }) => {
    ia.chamadas++;
    ia.textos.push(entrada.text);
    if (ia.falha) throw new Error(`modelo fora do ar: ${entrada.text.join('|')}`);
    if (ia.formato === 'ruim') return { response: 'texto' };
    return { shape: [entrada.text.length, 4], data: entrada.text.map((t) => VETORES[t] ?? [0, 0, 0, 0.0001]) };
  },
};

const chamar = (h: Record<string, string>, projeto: string, corpo: unknown, ambiente: Record<string, unknown> = { ...env, AI }) =>
  app.fetch(new Request(`http://localhost/api/v1/projects/${projeto}/similares`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo),
  }), ambiente as never);
type Resp = { resultados: { id: string; nome: string; score: number }[]; indisponivel?: boolean };

let consultor: Record<string, string>, admin: Record<string, string>, orgAdmin: Record<string, string>, orgUser: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_x', 'Outra', 'outra')`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'X', 'LGPD', 'Controller', 'Active', 'org_x')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('sim-adm', 'adm@cliente.com', 'x', 'A', 'org_admin', ?1, 'org_ness'), ('sim-usr', 'usr@cliente.com', 'x', 'U', 'org_user', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('d1', ?1, 'Folha'), ('d2', ?1, 'Departamento Pessoal'), ('d3', ?1, 'Remuneração'),
      ('d4', ?1, 'Benefícios e salários'), ('d5', ?1, 'Facilities')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome, status) VALUES ('d6', ?, 'payroll system', 'inativo')`).bind(P),
  ]);
  await inserirAtivo({ id: 'i1', project_id: P, name: 'payroll system', category: 'Software' });
  await inserirAtivo({ id: 'i2', project_id: P, name: 'processo de pagamento', category: 'Informacao' });
  await inserirAtivo({ id: 'i3', project_id: P, name: 'controle de acesso físico', category: 'Hardware' });
  await inserirAtivo({ id: 'i4', project_id: P, name: 'Fulano de Tal', category: 'Pessoas' });
  await inserirAtivo({ id: 'i5', project_id: P, name: 'Folha antiga', category: 'Software', status: 'Removido' });
  await inserirAtivo({ id: 'i9', project_id: OUTRO, name: 'payroll system', category: 'Software' });
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
  admin = await sessionFor({ id: 'sim-root', email: 'root@ness.lat', role: 'platform_admin' });
  orgAdmin = await sessionFor({ id: 'sim-adm', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
  orgUser = await sessionFor({ id: 'sim-usr', email: 'usr@cliente.com', role: 'org_user', client_project_id: P });
});

beforeEach(() => { ia.textos = []; ia.chamadas = 0; ia.falha = false; ia.formato = 'ok'; });

describe('rota de parecidos por significado', () => {
  it('é do núcleo e fica fora do agente', async () => {
    expect(faixaDoCaminho(`/api/v1/projects/${P}/similares`)).toBe('nucleo');
    expect(LIMIAR_SIMILAR).toBe(0.75);
  });

  it('sistema: ordena do mais próximo, corta no limiar e lê os candidatos do banco do projeto', async () => {
    const r = await chamar(consultor, P, { tipo: 'item', nome: DIGITADO });
    expect(r.status).toBe(200);
    const b = await r.json() as Resp;
    // Cossenos dos vetores fabricados; "controle de acesso físico" dá 0 e fica abaixo do limiar.
    expect(b.resultados.map((x) => x.score)).toEqual([0.98, 0.832]);
    expect(b.resultados.map((x) => x.id)).toEqual(['i1', 'i2']);
    expect(b.resultados[0].score).toBeGreaterThan(b.resultados[1].score);
    expect(b.indisponivel).toBeUndefined();
    // Uma chamada só, em lote; o digitado primeiro e só nomes do banco deste projeto (sem Pessoas, sem removido, sem outro projeto).
    expect(ia.chamadas).toBe(1);
    expect(ia.textos[0][0]).toBe(DIGITADO);
    expect([...ia.textos[0].slice(1)].sort()).toEqual(['controle de acesso físico', 'payroll system', 'processo de pagamento']);
  });

  it('área: no máximo 3, e departamento inativo não entra', async () => {
    const b = await (await chamar(admin, P, { tipo: 'area', nome: DIGITADO })).json() as Resp;
    // "Benefícios e salários" (0,945) passa do limiar mas fica fora pelo limite; "Facilities" (0,627) fica abaixo do limiar.
    expect(b.resultados.map((x) => x.score)).toEqual([0.999, 0.993, 0.973]);
    expect(b.resultados).toHaveLength(3);
    expect(b.resultados.map((x) => x.id)).toEqual(['d1', 'd2', 'd3']);
    expect(ia.textos[0]).not.toContain('payroll system');
    expect(ia.textos[0]).not.toContain(undefined);
  });

  it('recusa pessoa, tipo inválido, campo a mais e nome fora do tamanho, sem chamar o modelo', async () => {
    for (const corpo of [{ tipo: 'pessoa', nome: 'Maria' }, { tipo: 'x', nome: 'abc' }, { tipo: 'item', nome: 'abc', candidatos: ['payroll'] },
      { tipo: 'item', nome: '' }, { tipo: 'item', nome: 'a'.repeat(121) }]) {
      expect((await chamar(consultor, P, corpo)).status).toBe(400);
    }
    expect(ia.chamadas).toBe(0);
  });

  it('só a equipe que cadastra pede; cliente recebe 403 sem chamar o modelo', async () => {
    expect((await chamar(orgAdmin, P, { tipo: 'item', nome: DIGITADO })).status).toBe(403);
    expect((await chamar(orgUser, P, { tipo: 'item', nome: DIGITADO })).status).toBe(403);
    expect(ia.chamadas).toBe(0);
  });

  it('isolamento: consultor não alcança projeto de outra organização', async () => {
    const r = await chamar(consultor, OUTRO, { tipo: 'item', nome: DIGITADO });
    expect([403, 404]).toContain(r.status);
    expect(ia.chamadas).toBe(0);
  });

  it('modelo ausente, falhando ou fora do formato: 200 com indisponivel, sem o nome no log', async () => {
    const logs: string[] = [];
    const espia = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    const s = [vi.spyOn(console, 'log').mockImplementation(espia), vi.spyOn(console, 'warn').mockImplementation(espia), vi.spyOn(console, 'error').mockImplementation(espia)];
    try {
      const semAi = await chamar(consultor, P, { tipo: 'item', nome: DIGITADO }, { ...env, AI: undefined });
      expect(await semAi.json()).toEqual({ resultados: [], indisponivel: true });
      ia.falha = true;
      const falha = await chamar(consultor, P, { tipo: 'item', nome: DIGITADO });
      expect(falha.status).toBe(200);
      expect(await falha.json()).toEqual({ resultados: [], indisponivel: true });
      ia.falha = false; ia.formato = 'ruim';
      expect(await (await chamar(consultor, P, { tipo: 'item', nome: DIGITADO })).json()).toEqual({ resultados: [], indisponivel: true });
      ia.formato = 'ok';
      await chamar(consultor, P, { tipo: 'item', nome: DIGITADO });
    } finally { s.forEach((x) => x.mockRestore()); }
    expect(logs.some((l) => l.includes('similares'))).toBe(true);
    expect(logs.join('\n')).not.toContain(DIGITADO);
    const trilha = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE details LIKE ?`).bind(`%${DIGITADO}%`).first<{ n: number }>();
    expect(trilha?.n).toBe(0);
  });

  it('limite por usuário: 429 quando a janela estoura', async () => {
    const outro = await sessionFor({ id: 'sim-limite', email: 'lim@ness.lat', role: 'platform_admin' });
    await env.SESSIONS.put('ratelimit:similares:sim-limite', '60', { expirationTtl: 600 });
    expect((await chamar(outro, P, { tipo: 'item', nome: DIGITADO })).status).toBe(429);
    expect(ia.chamadas).toBe(0);
  });
});
