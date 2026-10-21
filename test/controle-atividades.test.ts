import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';

describe('GET /controls/:id/atividades', () => {
  let s: Sessoes;
  let ativa: string; let cancelada: string; let alheia: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ca-c1', ?, 'ISO27001', 'A.8.24 Exemplo', 'Implemented')`).bind(P),
      env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ca-c2', ?, 'ISO27001', 'A.9 Alheio', 'Implemented')`).bind(OUTRO),
    ]);
    ativa = await novaAtividade(s.consultor, { processing_purpose: 'Folha de pagamento exemplo' });
    cancelada = await novaAtividade(s.consultor, { processing_purpose: 'Atividade cancelada exemplo' });
    alheia = await novaAtividade(s.outro, { processing_purpose: 'Atividade de outro projeto' }, OUTRO);
    const m = (id: string, proj: string, rid: string, medida: string, ctrl: string) =>
      env.DB.prepare(`INSERT INTO tratamento_medidas (id, project_id, ropa_id, medida, status, controle_id) VALUES (?, ?, ?, ?, 'ativa', ?)`).bind(id, proj, rid, medida, ctrl);
    await env.DB.batch([
      m('ca-m1', P, ativa, 'Criptografia', 'ca-c1'), m('ca-m2', P, cancelada, 'Criptografia', 'ca-c1'), m('ca-m3', OUTRO, alheia, 'Criptografia', 'ca-c2'),
    ]);
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(cancelada).run();
  });

  it('devolve só a atividade ativa do projeto, com a medida', async () => {
    const r = await chamar(s.consultor, 'GET', '/api/v1/controls/ca-c1/atividades');
    expect(r.status).toBe(200);
    const { atividades } = await json<{ atividades: any[] }>(r);
    expect(atividades).toEqual([{ ropa_id: ativa, atividade: expect.any(String), medida: 'Criptografia' }]);
  });

  it('controle sem medida ligada: lista vazia', async () => {
    await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ca-c3', ?, 'ISO27001', 'Sem medida', 'Missing')`).bind(P).run();
    expect(await json(await chamar(s.consultor, 'GET', '/api/v1/controls/ca-c3/atividades'))).toEqual({ atividades: [] });
  });

  it('controle inexistente ou de projeto sem acesso: recusado como nas outras rotas por id', async () => {
    expect((await chamar(s.consultor, 'GET', '/api/v1/controls/nao-existe/atividades')).status).toBeGreaterThanOrEqual(403);
    expect((await chamar(s.outro, 'GET', '/api/v1/controls/ca-c1/atividades')).status).toBe(403);
  });
});
