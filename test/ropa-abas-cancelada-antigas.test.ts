import { describe, it, expect, beforeAll } from 'vitest';
import { prepararProjeto, chamar, json, base, novaAtividade, P, type Sessoes } from './helpers/ropa-abas';

/** Cancelada recusa escrita também pelas sub-rotas de antes (ropa.ts): as duas portas fecham igual (409). */
describe('atividade cancelada nas sub-rotas antigas', () => {
  let s: Sessoes;
  let rid: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    rid = await novaAtividade(s.consultor);
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, { acao: 'cancelar', motivo: 'duplicada' })).status).toBe(200);
  });

  it('PUT impacto, ciclo, bases, itens, departamentos e POST riscos, acoes, transferencias: 409', async () => {
    for (const [m, c] of [['PUT', 'impacto'], ['PUT', 'ciclo'], ['PUT', 'bases'], ['PUT', 'itens'], ['PUT', 'departamentos'], ['POST', 'riscos'], ['POST', 'acoes'], ['POST', 'transferencias']] as const) {
      const r = await chamar(s.consultor, m, `${base(rid)}/${c}`, {});
      expect(r.status, `${m} ${c}`).toBe(409);
      expect((await json(r)).error).toContain('cancelada');
    }
  });

  it('PUT /ropa/:id (edição direta) também: 409; reativar pela ficha volta a aceitar', async () => {
    expect((await chamar(s.consultor, 'PUT', `/api/v1/ropa/${rid}`, { processing_purpose: 'x' })).status).toBe(409);
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, { acao: 'reativar' })).status).toBe(200);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/ciclo`, { etapas: [] })).status).not.toBe(409);
  });

  it('atividade de outro id (importar) não é barrada pela guarda', async () => {
    const r = await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/ropa/importar`, {});
    expect(r.status).not.toBe(409);
  });
});
