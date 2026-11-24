import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv } from './helpers/d1';
import { itensDoDia, tituloDoAviso, avisosDePrazo } from '../src/services/avisos-prazo';

/** Prazos do pedido do titular e do incidente (fatia 7): fontes `titular_pedido` e `incidente`. HOJE é uma quarta, semana ISO 2026-W41. */
const HOJE = '2026-10-07';
const db = () => env.DB;

// created_at no passado do HOJE fixo: prazo anterior à criação do registro não avisa (histórico importado, avisos-prazo.ts).
const ped = (id: string, prazo: string | null, status = 'recebido') =>
  db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status, respondido_em, responsavel_parte_id, created_at) VALUES (?, 'p1', ?, 'acesso', '2026-09-20', ?, ?, ?, 'pa1', '2026-09-20 12:00:00')`)
    .bind(id, `PT-2026-${id}`, prazo, status, ['respondido', 'negado'].includes(status) ? '2026-10-01' : null);
const inc = (id: string, extra: { anpd?: string | null; tit?: string | null; feitaAnpd?: string | null; feitaTit?: string | null; status?: string; risco?: string | null } = {}) =>
  db().prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, prazo_anpd_em, prazo_titular_em, comunicacao_anpd_em, comunicacao_titular_em, status, risco_titular, created_at) VALUES (?, 'p1', ?, 'Incidente', '2026-10-01', ?, ?, ?, ?, ?, ?, '2026-10-01 12:00:00')`)
    .bind(id, `IN-2026-${id}`, extra.anpd ?? null, extra.tit ?? null, extra.feitaAnpd ?? null, extra.feitaTit ?? null, extra.status ?? 'aberto', extra.risco ?? 'relevante');
const daFonte = async (fonte: string) => (await itensDoDia(db(), HOJE)).itens.filter((i) => i.fonte === fonte);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO partes (id, project_id, nome, email) VALUES ('pa1', 'p1', 'Ana Exemplo', 'ana@exemplo.com.br')`),
  ]);
});

describe('fonte titular_pedido', () => {
  it('prazo em 7 dias, hoje ou vencido entra com o marco certo; longe não; sem prazo (parâmetro ausente) não entra', async () => {
    await db().batch([ped('d7', '2026-10-14T10:00:00.000Z'), ped('d0', '2026-10-07'), ped('atr', '2026-10-01'), ped('longe', '2026-10-30'), ped('semprazo', null)]);
    expect(Object.fromEntries((await daFonte('titular_pedido')).map((i) => [i.item_id, i.marco]))).toEqual({ d7: 'D-7', d0: 'D0', atr: 'atraso-2026-W41' });
  });
  it('respondido, negado e arquivado não avisam; o responsável é a parte do pedido; o título cita o protocolo', async () => {
    await db().batch([ped('vivo', '2026-10-07'), ped('r', '2026-10-07', 'respondido'), ped('n', '2026-10-07', 'negado'), ped('a', '2026-10-07', 'arquivado')]);
    const it = await daFonte('titular_pedido');
    expect(it.map((i) => i.item_id)).toEqual(['vivo']);
    expect(it[0]).toMatchObject({ responsavel: 'ana@exemplo.com.br', titulo: 'Pedido do titular PT-2026-vivo' });
  });
  it('o título do sino', () => {
    const base = { fonte: 'titular_pedido' as const, titulo: 'Pedido do titular PT-2026-0001' };
    expect(tituloDoAviso({ ...base, marco: 'D-7' })).toBe('Pedido do titular PT-2026-0001 vence em 7 dias');
    expect(tituloDoAviso({ ...base, marco: 'atraso-2026-W41' })).toBe('Pedido do titular PT-2026-0001 com prazo vencido');
  });
});

describe('fonte incidente', () => {
  it('um item por comunicação pendente, com id próprio, e marco pelo prazo de cada uma', async () => {
    await inc('i1', { anpd: '2026-10-14T10:00:00.000Z', tit: '2026-10-07' }).run();
    const itens = await daFonte('incidente');
    expect(Object.fromEntries(itens.map((i) => [i.item_id, i.marco]))).toEqual({ 'i1:anpd': 'D-7', 'i1:titular': 'D0' });
    expect(itens.map((i) => i.titulo).sort()).toEqual(['Comunicação ao titular do incidente IN-2026-i1', 'Comunicação à ANPD do incidente IN-2026-i1']);
  });
  it('comunicação feita sai; encerrado sai; sem_risco e baixo saem (não exigida); sem prazo (parâmetro ausente) não entra', async () => {
    await db().batch([
      inc('feita', { anpd: '2026-10-07', tit: '2026-10-07', feitaAnpd: '2026-10-05' }), inc('enc', { anpd: '2026-10-07', feitaAnpd: '2026-10-06', status: 'encerrado' }),
      inc('semrisco', { anpd: '2026-10-07', risco: 'sem_risco' }), inc('baixo', { anpd: '2026-10-01', tit: '2026-10-07', risco: 'baixo' }), inc('semprazo', {}),
    ]);
    expect((await daFonte('incidente')).map((i) => i.item_id)).toEqual(['feita:titular']);
  });
  it('prazo às 22h de Brasília conta no dia de Brasília (01h UTC do dia seguinte): D0, D-7 e atraso', async () => {
    await db().batch([
      inc('hoje22', { anpd: '2026-10-08T01:00:00.000Z' }), inc('d7', { anpd: '2026-10-15T01:00:00.000Z' }), inc('ontem22', { anpd: '2026-10-07T01:00:00.000Z' }),
      ped('p22', '2026-10-08T01:00:00.000Z'),
    ]);
    expect(Object.fromEntries((await daFonte('incidente')).map((i) => [i.item_id, i.marco]))).toEqual({ 'hoje22:anpd': 'D0', 'd7:anpd': 'D-7', 'ontem22:anpd': 'atraso-2026-W41' });
    expect((await daFonte('titular_pedido')).map((i) => [i.item_id, i.marco])).toEqual([['p22', 'D0']]);
  });
  it('incidente ainda sem avaliação de risco avisa (o risco não pode esconder o prazo)', async () => {
    await inc('naoavaliado', { anpd: '2026-10-07', risco: null }).run();
    expect((await daFonte('incidente')).map((i) => i.item_id)).toEqual(['naoavaliado:anpd']);
  });
  it('o título do sino', () => {
    const base = { fonte: 'incidente' as const, titulo: 'Comunicação à ANPD do incidente IN-2026-0001' };
    expect(tituloDoAviso({ ...base, marco: 'D0' })).toBe('Comunicação à ANPD do incidente IN-2026-0001 vence hoje');
  });
  it('o sino do incidente leva à tela de incidentes (núcleo), não à do titular', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await db().batch([
      db().prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Carla', 'consultor')`),
      db().prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p1', 'Carla', 'cons@ness.lat', 'consultor', 'Consultor')`),
      inc('i1', { anpd: HOJE }),
    ]);
    await avisosDePrazo({ ...workerEnv(), RESEND_API_KEY: undefined }, HOJE);
    const links = (await db().prepare(`SELECT link FROM notifications WHERE type = 'prazo_incidente'`).all<{ link: string }>()).results.map((n) => n.link);
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(links)).toEqual(new Set(['/projects/p1/incidentes']));
    vi.restoreAllMocks();
  });
});
