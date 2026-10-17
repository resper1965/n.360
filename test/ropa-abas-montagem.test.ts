import { describe, it, expect, beforeAll } from 'vitest';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, type Sessoes } from './helpers/ropa-abas';
import { faixaDoCaminho } from '../src/modulos';

/**
 * Pacote 0: a montagem do esqueleto. Os handlers da PR1 existem (A e S); aqui se prova só
 * a montagem: a rota existe na cadeia (401/403/404, nunca 500), a faixa é do n.privacy e o agente é recusado onde deve.
 */
describe('ficha em abas: montagem das rotas', () => {
  let s: Sessoes;
  let rid: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    rid = await novaAtividade(s.consultor);
  });

  it('sem sessão: 401', async () => {
    expect((await chamar({}, 'GET', `${base(rid)}/ficha`)).status).toBe(401);
  });

  it('consultor: as rotas da PR1 respondem (validam, nunca 500); os catálogos e as etapas são da PR2 (404)', async () => {
    for (const [m, c] of [['GET', 'ficha'], ['GET', 'conferencia'], ['GET', 'medidas'], ['GET', 'gaps'], ['PUT', 'escopo'], ['PUT', 'agentes']] as const) {
      expect((await chamar(s.consultor, m, `${base(rid)}/${c}`, m === 'PUT' ? {} : undefined)).status, `${m} ${c}`).toBe(200);
    }
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, {})).status).toBe(400);
    expect((await chamar(s.consultor, 'GET', `${base(rid)}/gaps/x/anexos`)).status).toBe(404);
    expect((await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/titulares`)).status).toBe(404);
  });

  it('pessoa sem o n.privacy: 403 na ficha, nas abas e nos catálogos', async () => {
    for (const c of [`${base(rid)}/ficha`, `${base(rid)}/medidas`, `${base(rid)}/etapas`, `/api/v1/projects/${P}/catalogos/titulares`]) {
      const r = await chamar(s.soIso, 'GET', c);
      expect(r.status, c).toBe(403);
      expect((await json(r)).error, c).toContain('n.privacy');
    }
  });

  it('a faixa das rotas novas é do n.privacy; o registro antigo segue no núcleo', () => {
    const r = '/api/v1/projects/:projectId/ropa/:recordId';
    for (const sufixo of ['ficha', 'escopo', 'agentes', 'base-juridica', 'logs', 'conferencia', 'situacao', 'relatorio', 'medidas', 'medidas/:id', 'gaps', 'gaps/:id/anexos/:aid', 'etapas', 'etapas/coleta/titulares/:t']) {
      expect(faixaDoCaminho(`${r}/${sufixo}`), sufixo).toBe('privacy');
    }
    expect(faixaDoCaminho('/api/v1/projects/:projectId/catalogos/titulares')).toBe('privacy');
    expect(faixaDoCaminho('/api/v1/projects/:projectId/ropa/:recordId')).toBe('nucleo');
  });

  it('o agente é recusado nos atos humanos e NÃO é recusado na aba Agentes de Tratamento', async () => {
    const recusas: [string, string][] = [
      ['POST', `${base(rid)}/situacao`], ['DELETE', `${base(rid)}/medidas/x`], ['DELETE', `${base(rid)}/gaps/x`],
      ['POST', `${base(rid)}/gaps/x/anexos`], ['GET', `${base(rid)}/relatorio`], ['POST', `${base(rid)}/etapas/coleta/rascunho`],
    ];
    for (const [m, c] of recusas) {
      const r = await comoAgente(m, c);
      expect(r.status, `${m} ${c}`).toBe(403);
      expect((await json(r)).error, `${m} ${c}`).toContain('fora do alcance do agente');
    }
    // `.../agentes` aqui é a aba (controlador/operador), não a gestão de concessões do agente.
    const ok = await comoAgente('PUT', `${base(rid)}/agentes`, {});
    expect(ok.status).toBe(200); // passou do corte do agente
    // a rota de gestão de concessões continua fora do alcance
    const gestao = await comoAgente('GET', '/api/v1/agentes');
    expect(gestao.status).toBe(403);
  });
});
