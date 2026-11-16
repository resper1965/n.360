import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedTwoProjects, habilitarOt } from './helpers/d1';
import { blocoOt } from '../src/services/painel-ot';

// Bloco do n.ot no painel (onda 0). D1 real, linhas semeadas direto.
const DIA = '2026-11-14';
const AGORA = new Date('2026-11-14T15:00:00Z');
const gestor = { id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' };
const tecnico = { id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' };
const consultor = { id: 'u-c', email: 'c@ness.lat', role: 'consultor' };
const consultoriaAdmin = { id: 'u-ca', email: 'ca@ness.lat', role: 'consultoria_admin' };
const gestorDeOutro = { id: 'u-x', email: 'x@outro.teste', role: 'org_admin', client_project_id: 'proj-b' };
const textos = async (ator: typeof gestor, projeto = 'proj-a') => (await blocoOt(env.DB, projeto, ator, DIA, AGORA)).itens.map((i) => i.texto);

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  const req = await env.DB.prepare('SELECT id FROM ot_requisitos LIMIT 1').first<{ id: string }>();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES
      ('s1', 'proj-a', 'SE Norte', 'em_operacao', NULL), ('s2', 'proj-a', 'SE Sul', 'base_em_aprovacao', NULL),
      ('s3', 'proj-a', 'SE Leste', 'em_obra', '2026-11-18T02:59:59Z')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL),
      ('d2', 'proj-a', 's2', 'fluxo', 'k2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL),
      ('d3', 'proj-a', 's1', 'fluxo', 'k3', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-17T12:00:00Z')`),
    env.DB.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, status, criado_por) VALUES ('l1', 'proj-a', 's2', 'manual', 'em_revisao', 'u-t')`),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, proxima_revisao, atualizado_por) VALUES ('a1', 'proj-a', ?, 'atende', '2026-11-01', 'u-c')`).bind(req!.id),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, created_at) VALUES ('sn1', 'proj-a', 's1', 'Sonda 1', '10.0.0.0/8', 'u-c', '2026-11-01 00:00:00'),
      ('sn2', 'proj-a', 's2', 'Sonda Sul', '10.1.0.0/16', 'u-c', '2026-11-01 00:00:00')`),
    env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome, ip_cifrado) VALUES ('at1', 'proj-a', 's2', 'Ativo Secreto XYZ', 'ot1:segredo')`),
  ]);
});

describe('blocoOt', () => {
  it('projeto sem site está começando e não tem item', async () => {
    const b = await blocoOt(env.DB, 'proj-b', consultor, DIA, AGORA);
    expect(b.comecando).toBe(true);
    expect(b.itens).toEqual([]);
    expect(b.passos[0]).toMatchObject({ feito: false, tela: 'ot' });
  });

  it('consultor vê o que a tela dele mostra (sondas, desvios, lotes), sem base, obra, revisão nem aceite (são do Gestor)', async () => {
    const b = await blocoOt(env.DB, 'proj-a', consultor, DIA, AGORA);
    const textos = b.itens.map((i) => i.texto);
    expect(textos).toEqual(['2 sondas paradas', '2 desvios abertos', '1 lote aguardando revisão']);
    expect(b.itens.every((i) => i.modulo === 'ot' && i.tela === 'ot')).toBe(true);
    expect(b.numeros).toEqual([['1 de 3', 'sites em operação'], ['2', 'desvios abertos']]);
  });

  it('obra em base_em_aprovacao também conta como obra a vencer', async () => {
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'base_em_aprovacao' WHERE id = 's3'`).run();
    const t = (await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA)).itens.map((i) => i.texto);
    await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_obra' WHERE id = 's3'`).run();
    expect(t).toContain('1 obra vence em até 7 dias');
  });

  it('Gestor ARCiber vê tudo, inclusive o aceite a vencer', async () => {
    const b = await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA);
    expect(b.itens.map((i) => i.texto)).toEqual(expect.arrayContaining(['2 sondas paradas', '1 requisito com revisão vencida', '2 desvios abertos',
      '1 lote aguardando revisão', '1 base aguardando aprovação', '1 obra vence em até 7 dias', '1 aceite de desvio vence em até 7 dias']));
  });

  it('consultoria_admin segue a tela: sondas (edita), sem lote nem desvio (a tela o tira de quem aprova)', async () => {
    expect(await textos(consultoriaAdmin)).toEqual(['2 sondas paradas']);
  });

  it('desvio aberto em site com obra ativa (obra_ate) não entra no item, como na tela; o número do topo segue contando', async () => {
    // s3 (em_obra) e s2 (base_em_aprovacao com obra_ate) em obra; s1 em operação
    await env.DB.batch([env.DB.prepare(`UPDATE ot_sites SET obra_ate = '2026-12-30' WHERE id = 's2'`),
      env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao) VALUES ('d6', 'proj-a', 's3', 'fluxo', 'k6', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto')`)]);
    try {
      const b = await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA);
      expect(b.itens.map((i) => i.texto)).toContain('1 desvio aberto'); // d1 (s1); d2 está em s2, em obra
      expect(b.numeros[1]).toEqual(['3', 'desvios abertos']);
    } finally { await env.DB.batch([env.DB.prepare(`UPDATE ot_sites SET obra_ate = NULL WHERE id = 's2'`), env.DB.prepare(`DELETE FROM ot_desvios WHERE id = 'd6'`)]); }
  });

  it('o aprovador não vê o lote que ele mesmo criou', async () => {
    await env.DB.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, status, criado_por) VALUES ('l2', 'proj-a', 's2', 'manual', 'em_revisao', 'u-g')`).run();
    try {
      expect(await textos(gestor)).toContain('1 lote aguardando revisão'); // só o l1; o l2 é dele
      expect(await textos(consultor)).toContain('2 lotes aguardando revisão');
    } finally { await env.DB.prepare(`DELETE FROM ot_lotes WHERE id = 'l2'`).run(); }
  });

  it('técnico só conta os sites concedidos', async () => {
    const b = await blocoOt(env.DB, 'proj-a', tecnico, DIA, AGORA);
    const textos = b.itens.map((i) => i.texto);
    // o técnico não edita nem aprova: sem lote, desvio, base, obra nem revisão; sonda é de quem edita
    expect(textos).toEqual([]);
    expect(b.numeros[0]).toEqual(['1 de 1', 'sites em operação']);
  });

  it('nada do bloco leva endereço, faixa de rede, nome de ativo nem de sonda, para gestor, técnico e consultor', async () => {
    for (const ator of [gestor, tecnico, consultor]) {
      const corpo = JSON.stringify(await blocoOt(env.DB, 'proj-a', ator, DIA, AGORA));
      expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
      for (const proibido of ['Sonda 1', 'Sonda Sul', 'Ativo Secreto XYZ', 'ot1:']) expect(corpo, `${ator.role}: ${proibido}`).not.toContain(proibido);
    }
  });

  it('org_admin com client_project_id de OUTRO projeto não é Gestor deste e não vê o aceite', async () => {
    expect((await textos(gestorDeOutro)).join(' ')).not.toContain('aceite');
  });

  it('fronteira de 7 dias: obra e aceite em exatamente hoje + 7 entram, hoje + 8 não', async () => {
    await env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s4', 'proj-a', 'SE Borda', 'em_obra', '2026-11-21'), ('s5', 'proj-a', 'SE Fora', 'em_obra', '2026-11-22')`).run();
    await env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d4', 'proj-a', 's1', 'fluxo', 'k4', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-21T23:59:59.999Z'),
      ('d5', 'proj-a', 's1', 'fluxo', 'k5', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-22T23:59:59.999Z')`).run();
    try {
      const t = await textos(gestor);
      expect(t).toContain('2 obras vencem em até 7 dias'); // s3 e s4; s5 fica fora
      expect(t).toContain('2 aceites de desvio vencem em até 7 dias'); // d3 e d4; d5 fica fora
    } finally {
      await env.DB.batch([env.DB.prepare(`DELETE FROM ot_sites WHERE id IN ('s4', 's5')`), env.DB.prepare(`DELETE FROM ot_desvios WHERE id IN ('d4', 'd5')`)]);
    }
  });
});
