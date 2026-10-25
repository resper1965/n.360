// Rodada 3 da auditoria MCP: DELETE de /api/v1/ropa/:id respeitam a situação derivada (achado 1).
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, json, base, novaAtividade, aprovarTratamentoDeTeste, P, type Sessoes } from './helpers/ropa-abas';

let s: Sessoes;
beforeAll(async () => { s = await prepararProjeto(); });
const linha = (rid: string) => env.DB.prepare('SELECT status FROM ropa_records WHERE id = ?').bind(rid).first<{ status: string }>();

describe('DELETE /api/v1/ropa/:id com a atividade aprovada por pedido (achado 1)', () => {
  it('aprovada por pedido (status não é Approved): 409 para pessoa e agente, e a linha continua', async () => {
    const rid = await aprovarTratamentoDeTeste(env.DB, P);
    expect((await json(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`))).situacao.codigo).toBe('aprovada');
    const pessoa = await chamar(s.consultor, 'DELETE', `/api/v1/ropa/${rid}`);
    expect(pessoa.status).toBe(409);
    expect((await json(pessoa)).error).toContain('cancele pela situação');
    const agente = await chamar({ 'X-Agente-Confirmado': '1' }, 'DELETE', `/api/v1/ropa/${rid}`, undefined, { AGENTE: { userId: 'ra-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'ra-c' } });
    expect(agente.status).toBe(409);
    expect(await linha(rid)).not.toBeNull();
  });

  it('não aprovada: apaga como antes', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.consultor, 'DELETE', `/api/v1/ropa/${rid}`)).status).toBe(200);
    expect(await linha(rid)).toBeNull();
  });
});
