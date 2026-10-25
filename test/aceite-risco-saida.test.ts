import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, type Sessoes } from './helpers/ropa-abas';

/** Sair de Accepted por status explícito desfaz o aceite: carimbo limpo e trilha, nas duas portas. */
describe('aceite de risco: saída por status', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const linha = (id: string) => env.DB.prepare('SELECT status, accepted_by, accepted_at, aceite_manual FROM risks WHERE id = ?').bind(id).first<any>();
  const trilhas = (id: string) => env.DB.prepare(`SELECT count(*) n FROM audit_logs WHERE action = 'risk.aceite_invalidado' AND details LIKE ?`).bind(`%${id}%`).first<{ n: number }>();

  it('PUT /risks/:id: Accepted para Open limpa o carimbo e grava a trilha', async () => {
    const rid = await novaAtividade(s.consultor);
    const { id } = await json<{ id: string }>(await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Ameaça exemplo', vulnerability: 'Descrição exemplo', impact: 3, probability: 3 }));
    expect((await chamar(s.consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Accepted' })).status).toBe(200);
    expect((await linha(id)).accepted_by).not.toBeNull();
    expect((await chamar(s.consultor, 'PUT', `/api/v1/risks/${id}`, { status: 'Open' })).status).toBe(200);
    expect(await linha(id)).toMatchObject({ status: 'Open', accepted_by: null, accepted_at: null, aceite_manual: 0 });
    expect((await trilhas(id))!.n).toBe(1);
  });

  it('sub-rota da atividade: Accepted para Mitigated limpa o carimbo e grava a trilha', async () => {
    const rid = await novaAtividade(s.consultor);
    const { id } = await json<{ id: string }>(await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Ameaça exemplo', vulnerability: 'Descrição exemplo', impact: 3, probability: 3 }));
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/riscos/${id}`, { status: 'Accepted' })).status).toBe(200);
    expect((await linha(id)).accepted_by).not.toBeNull();
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/riscos/${id}`, { status: 'Mitigated' })).status).toBe(200);
    expect(await linha(id)).toMatchObject({ status: 'Mitigated', accepted_by: null, accepted_at: null, aceite_manual: 0 });
    expect((await trilhas(id))!.n).toBe(1);
  });
});
