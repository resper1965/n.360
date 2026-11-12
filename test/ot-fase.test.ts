import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { aprovarBase, devolverBase, pedirBase, situacaoDoSite } from '../src/services/ot-fase';
import { applySchema, execSql, resetData, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0110_ot_site_fase.sql?raw';

const P = 'proj-a';
const S = 's1';
const ator = { id: 'u-gestor' };
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const zona = (id: string, nivel: number, site = S) => run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, ?, 'z', ?)`, id, P, site, nivel);
const levantamento = (id = 'lv1', site = S) => run(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES (?, ?, ?, 'visita', '2026-11-01', 'u')`, id, P, site);
const achado = (id: string, lv = 'lv1') => run(`INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por) VALUES (?, ?, ?, 'u')`, id, P, lv);
const lote = (id: string, status = 'em_revisao', criado = '2026-11-01 10:00:00') =>
  run(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, status, criado_por, created_at) VALUES (?, ?, ?, 'manual', ?, 'u', ?)`, id, P, S, status, criado);
const tresZonas = async () => { await zona('z2', 2); await zona('z3', 3); await zona('z4', 4); };
const passo = async () => (await situacaoDoSite(env.DB, P, S))!.proximo_passo;
const fase = async () => (await env.DB.prepare(`SELECT fase FROM ot_sites WHERE id = ?`).bind(S).first<{ fase: string }>())!.fase;

describe('ot-fase: fase do site e condições da base', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => { await resetData(); await seedTwoProjects(); await run(`INSERT INTO ot_sites (id, project_id, nome) VALUES (?, ?, 'SE A')`, S, P); });

  it('migração 0110: site existente vira em_levantamento', async () => {
    await run(`DROP TABLE IF EXISTS ot_sites_old`);
    await run(`CREATE TABLE ot_sites_old AS SELECT id, project_id, nome FROM ot_sites`);
    await run(`DROP TABLE IF EXISTS ot_sites_mig`);
    await run(`CREATE TABLE ot_sites_mig (id TEXT, project_id TEXT, nome TEXT)`);
    await run(`INSERT INTO ot_sites_mig SELECT * FROM ot_sites_old`);
    await execSql(mig.replace(/ot_sites/g, 'ot_sites_mig'));
    const r = await env.DB.prepare(`SELECT fase, base_pedida_em FROM ot_sites_mig WHERE id = ?`).bind(S).first();
    expect(r).toEqual({ fase: 'em_levantamento', base_pedida_em: null });
    await expect(run(`UPDATE ot_sites_mig SET fase = 'x'`)).rejects.toThrow(/CHECK/);
  });

  it('situação: site de outro projeto ou inexistente é null', async () => {
    expect(await situacaoDoSite(env.DB, 'proj-b', S)).toBeNull();
    expect(await situacaoDoSite(env.DB, P, 'nao-existe')).toBeNull();
  });

  describe('proximo_passo, na ordem da spec §3', () => {
    it('em_operacao e em_obra: em_operacao', async () => {
      await run(`UPDATE ot_sites SET fase = 'em_operacao' WHERE id = ?`, S);
      expect(await passo()).toBe('em_operacao');
      await run(`UPDATE ot_sites SET fase = 'em_obra' WHERE id = ?`, S);
      expect(await passo()).toBe('em_operacao');
    });
    it('base_em_aprovacao: aguardar_base (mesmo com rascunho)', async () => {
      await levantamento(); await achado('a1');
      await run(`UPDATE ot_sites SET fase = 'base_em_aprovacao' WHERE id = ?`, S);
      expect(await passo()).toBe('aguardar_base');
    });
    it('sem conteúdo e sem zonas: comecar', async () => { expect(await passo()).toBe('comecar'); });
    it('rascunhos > 0: revisar (mesmo com zonas e lote)', async () => {
      await tresZonas(); await levantamento(); await achado('a1'); await lote('l1');
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect([s.proximo_passo, s.rascunhos, s.tem_conteudo]).toEqual(['revisar', 1, true]);
    });
    it('lote em revisão: aguardar_lote, com o id do mais antigo', async () => {
      await tresZonas(); await lote('l-novo', 'em_revisao', '2026-11-02 10:00:00'); await lote('l-velho', 'em_revisao', '2026-11-01 10:00:00'); await lote('l-ok', 'concluido');
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect([s.proximo_passo, s.lotes_em_revisao, s.lote_em_revisao_id]).toEqual(['aguardar_lote', 2, 'l-velho']);
    });
    it('zonas 4.1.1 e nada pendente: pedir_base', async () => {
      await tresZonas(); await levantamento();
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect([s.proximo_passo, s.zonas_4_1_1, s.fase]).toEqual(['pedir_base', true, 'em_levantamento']);
    });
    it('conteúdo sem as zonas 2, 3 e 4: revisar', async () => {
      await zona('z2', 2); await zona('z3', 3); await levantamento();
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect([s.proximo_passo, s.zonas_4_1_1]).toEqual(['revisar', false]);
    });
    it('rascunho de levantamento removido não conta', async () => {
      await tresZonas(); await levantamento(); await achado('a1'); await run(`UPDATE ot_levantamentos SET status = 'removido'`);
      expect((await situacaoDoSite(env.DB, P, S))!.rascunhos).toBe(0);
    });
  });

  describe('pedirBase', () => {
    it('409 com rascunho', async () => {
      await tresZonas(); await levantamento(); await achado('a1');
      expect(await pedirBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/rascunho/i) });
      expect(await fase()).toBe('em_levantamento');
    });
    it('409 com lote em revisão', async () => {
      await tresZonas(); await lote('l1');
      expect(await pedirBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/lote/i) });
    });
    it('409 sem zonas 2, 3 e 4', async () => {
      await zona('z2', 2);
      expect(await pedirBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/zonas/i) });
    });
    it('409 fora de em_levantamento; 404 para site de outro projeto', async () => {
      await tresZonas();
      expect(await pedirBase(env.DB, ator, P, S)).toEqual({ ok: true });
      expect(await pedirBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409 });
      expect(await pedirBase(env.DB, ator, 'proj-b', S)).toMatchObject({ ok: false, status: 404 });
    });
    it('com as condições atendidas muda a fase e grava quem e quando', async () => {
      await tresZonas();
      expect(await pedirBase(env.DB, ator, P, S)).toEqual({ ok: true });
      const r = await env.DB.prepare(`SELECT fase, base_pedida_em, base_pedida_por FROM ot_sites WHERE id = ?`).bind(S).first<any>();
      expect(r.fase).toBe('base_em_aprovacao'); expect(r.base_pedida_por).toBe('u-gestor'); expect(r.base_pedida_em).toBeTruthy();
    });
  });

  describe('aprovarBase', () => {
    it('passa para em_operacao e grava quem e quando', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      expect(await aprovarBase(env.DB, { id: 'u-aprov' }, P, S)).toEqual({ ok: true });
      const r = await env.DB.prepare(`SELECT fase, base_aprovada_em, base_aprovada_por FROM ot_sites WHERE id = ?`).bind(S).first<any>();
      expect(r.fase).toBe('em_operacao'); expect(r.base_aprovada_por).toBe('u-aprov'); expect(r.base_aprovada_em).toBeTruthy();
    });
    it('409 se entrou rascunho depois do pedido', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      await levantamento(); await achado('a1');
      expect(await aprovarBase(env.DB, ator, P, S)).toEqual({ ok: false, status: 409, error: 'As condições da base mudaram desde o pedido' });
      expect(await fase()).toBe('base_em_aprovacao');
    });
    it('um rascunho inserido logo antes do UPDATE também barra (condições no WHERE, sem checagem prévia)', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      await levantamento(); await achado('a2');
      const r = await aprovarBase(env.DB, ator, P, S);
      expect(r).toMatchObject({ ok: false, status: 409 });
      expect(await fase()).toBe('base_em_aprovacao');
    });
    it('409 fora de base_em_aprovacao; 404 para outro projeto', async () => {
      expect(await aprovarBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409 });
      expect(await aprovarBase(env.DB, ator, 'proj-b', S)).toMatchObject({ ok: false, status: 404 });
    });
    it('duas aprovações simultâneas: uma muda, a outra dá 409', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      const rs = await Promise.all([aprovarBase(env.DB, ator, P, S), aprovarBase(env.DB, ator, P, S)]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.filter((r) => !r.ok)).toMatchObject([{ status: 409 }]);
    });
  });

  describe('devolverBase', () => {
    it('volta para em_levantamento e limpa base_pedida_*', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      expect(await devolverBase(env.DB, ator, P, S)).toEqual({ ok: true });
      const r = await env.DB.prepare(`SELECT fase, base_pedida_em, base_pedida_por FROM ot_sites WHERE id = ?`).bind(S).first();
      expect(r).toEqual({ fase: 'em_levantamento', base_pedida_em: null, base_pedida_por: null });
    });
    it('409 fora de base_em_aprovacao; 404 para outro projeto', async () => {
      expect(await devolverBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409 });
      expect(await devolverBase(env.DB, ator, 'proj-b', S)).toMatchObject({ ok: false, status: 404 });
    });
  });
});
