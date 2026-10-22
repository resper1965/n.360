import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, seedTwoProjects, sessionFor } from './helpers/d1';

/**
 * Corpo de escrita passa por schema — em TODOS os writes, não só nos que já
 * tinham um.
 *
 * 12 handlers liam `c.req.json<any>()` e gravavam direto. O sintoma catalogado
 * disso é o D2 do backlog (`evaluation_status` com valor fora do enum): sem
 * schema, o que chega ao D1 é o que o cliente mandou. A assimetria mais clara
 * estava em `vendors`: o POST validava com `createVendorSchema`, o PUT aceitava
 * qualquer coisa e gravava 18 colunas.
 *
 * Campo desconhecido continua ACEITO (`.passthrough()`, como os 62 handlers que
 * já validavam): o buraco é campo errado, não campo extra — recusar extra
 * quebraria integração que hoje funciona, e isso seria mudança de contrato.
 *
 * O ator é `platform_admin` de propósito: atravessa as checagens de tenant e de
 * papel, então um 403 não pode mascarar a ausência de validação. O que se mede
 * aqui é só o corpo.
 */

const A = 'proj-a';

// [nome, método, caminho, corpo inválido, o que o torna inválido]
const CASOS: Array<[string, string, string, unknown, string]> = [
  ['audits PUT', 'PUT', '/api/v1/audits/aud-1', { audit_type: 'Interna', title: 123, scheduled_date: '2026-01-01' }, 'title não é texto'],
  ['audits POST', 'POST', `/api/v1/projects/${A}/audits`, { title: 'Auditoria' }, 'audit_type e scheduled_date faltando (NOT NULL)'],
  ['capa PUT', 'PUT', '/api/v1/capa/capa-1', { description: 'sem título' }, 'title obrigatório faltando'],
  ['certification POST', 'POST', `/api/v1/projects/${A}/certification`, { stage: 'x'.repeat(600) }, 'stage acima do teto de 500'],
  ['assets PUT (platform)', 'PUT', '/api/v1/assets/ast-1', { name: '' }, 'name vazio'],
  ['dpia PUT (platform)', 'PUT', '/api/v1/dpia/dpia-1', { status: 'x'.repeat(600) }, 'status acima do teto'],
  ['assets POST (projeto)', 'POST', `/api/v1/projects/${A}/assets`, { type: 'Hardware' }, 'name obrigatório faltando (NOT NULL)'],
  ['assets PUT (projeto)', 'PUT', `/api/v1/projects/${A}/assets/ast-1`, { name: 123 }, 'name não é texto'],
  ['dpia POST (projeto)', 'POST', `/api/v1/projects/${A}/dpia`, { processing_name: 'x'.repeat(60_000) }, 'texto acima do teto de 50k'],
  ['risks PUT', 'PUT', '/api/v1/risks/rsk-1', { asset: 'Ativo', threat: 'Ameaça', impact: 99 }, 'impact fora da matriz 1..5'],
  ['training PUT', 'PUT', '/api/v1/training/trn-1', { employee_name: '', training_name: 'LGPD' }, 'employee_name vazio'],
  ['vendors PUT', 'PUT', '/api/v1/vendors/vnd-1', { category: 'Nuvem' }, 'name obrigatório faltando (NOT NULL)'],
  // Campos de data que a tela exibe: só data (ou data e hora ISO onde um sistema externo manda hora), nunca texto livre.
  ['audits POST data', 'POST', `/api/v1/projects/${A}/audits`, { audit_type: 'Interna', title: 'A', scheduled_date: '<img src=x onerror=alert(1)>' }, 'scheduled_date não é data'],
  ['audits PUT data', 'PUT', '/api/v1/audits/aud-1', { audit_type: 'Interna', title: 'A', status: 'Planned', scheduled_date: '<img src=x onerror=alert(1)>' }, 'scheduled_date não é data'],
  ['training POST data', 'POST', `/api/v1/projects/${A}/training`, { employee_name: 'Ana', training_name: 'LGPD', completion_date: '<img src=x onerror=alert(1)>' }, 'completion_date não é data'],
  ['training PUT data', 'PUT', '/api/v1/training/trn-1', { employee_name: 'Ana', training_name: 'LGPD', completion_date: '<img src=x onerror=alert(1)>' }, 'completion_date não é data'],
  ['training import data', 'POST', `/api/v1/projects/${A}/training/import-external`, { records: [{ employee_name: 'Ana', training_name: 'LGPD', completion_date: '<img src=x onerror=alert(1)>' }] }, 'completion_date não é data'],
  ['management-reviews POST data', 'POST', `/api/v1/projects/${A}/management-reviews`, { review_date: '<img src=x onerror=alert(1)>' }, 'review_date não é data'],
  ['metrics POST data', 'POST', `/api/v1/projects/${A}/metrics`, { metric_name: 'M', last_measured_at: '<img src=x onerror=alert(1)>' }, 'last_measured_at não é data'],
];

describe('Validação de corpo nos writes que liam JSON cru', () => {
  let headers: Record<string, string>;

  beforeAll(async () => {
    await applySchema();
    await seedTwoProjects();
    headers = {
      ...(await sessionFor({ id: 'u-staff', email: 'staff@ness.io', role: 'platform_admin' })),
      'Content-Type': 'application/json',
    };
  });

  async function req(metodo: string, caminho: string, corpo: unknown) {
    return app.fetch(
      new Request(`http://localhost${caminho}`, { method: metodo, headers, body: JSON.stringify(corpo) }),
      env as any
    );
  }

  for (const [nome, metodo, caminho, corpo, porque] of CASOS) {
    it(`${nome} recusa com 400: ${porque}`, async () => {
      const res = await req(metodo, caminho, corpo);
      expect(res.status, `${metodo} ${caminho}`).toBe(400);
      const body = await res.json() as any;
      // O contrato de erro de validação do repo (test/validation-contract.test.ts).
      expect(body.error).toBe('Payload inválido');
      expect(Array.isArray(body.details)).toBe(true);
    });
  }

  it('data válida continua aceita: dia, data e hora ISO no import externo e o campo de data vazio da tela', async () => {
    expect((await req('POST', `/api/v1/projects/${A}/training/import-external`, { records: [{ employee_name: 'Ana', training_name: 'LGPD', completion_date: '2026-07-15T10:00:00Z' }] })).status).not.toBe(400);
    expect((await req('POST', `/api/v1/projects/${A}/training`, { employee_name: 'Ana', training_name: 'LGPD', completion_date: '2026-07-15' })).status).not.toBe(400);
    expect((await req('POST', `/api/v1/projects/${A}/metrics`, { metric_name: 'M', last_measured_at: '' })).status).not.toBe(400);
    expect((await req('POST', `/api/v1/projects/${A}/management-reviews`, { review_date: '2026-10-08' })).status).not.toBe(400);
  });

  it('campo desconhecido continua aceito — não é este o buraco', async () => {
    const res = await req('PUT', '/api/v1/vendors/vnd-1', { name: 'Fornecedor', campo_que_nao_existe: 'x' });
    expect(res.status).not.toBe(400);
  });
});
