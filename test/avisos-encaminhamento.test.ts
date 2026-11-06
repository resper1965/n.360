// Aviso de prazo do encaminhamento do pedido do titular a ponto focal (spec 2026-11-06): D0 e atraso, sem D-7.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

const HOJE = '2026-10-07';
const db = () => env.DB;
const enc = (id: string, prazo: string, status = 'aguardando') =>
  db().prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, status, retorno, enviado_por) VALUES (?, 'tp1', 'p1', 'pa1', ?, 'Ver', ?, ?, 'a@ness.lat')`)
    .bind(id, prazo, status, status === 'respondido' ? 'Feito' : null);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'LGPD', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('pa1', 'p1', 'pessoa', 'Ponto Focal', 'pf@exemplo.com.br')`),
    db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em) VALUES ('tp1', 'p1', 'PT-2026-0001', 'acesso', '2026-10-01')`),
  ]);
});

describe('fonte encaminhamento_titular', () => {
  it('hoje e vencido avisam; 7 dias antes, respondido e cancelado não', async () => {
    await db().batch([enc('d0', '2026-10-07'), enc('atr', '2026-10-04'), enc('d7', '2026-10-14'), enc('resp', '2026-10-04', 'respondido'), enc('canc', '2026-10-04', 'cancelado')]);
    const itens = (await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === 'encaminhamento_titular');
    expect(Object.fromEntries(itens.map((i) => [i.item_id, i.marco]))).toEqual({ d0: 'D0', atr: 'atraso-2026-W41' });
    expect(itens[0].titulo).toBe('Encaminhamento do pedido PT-2026-0001 a Ponto Focal');
    expect(tituloDoAviso({ fonte: 'encaminhamento_titular', marco: 'D0', titulo: itens[0].titulo })).toBe('Encaminhamento do pedido PT-2026-0001 a Ponto Focal vence hoje');
  });
});
