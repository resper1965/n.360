import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { abrirObra, aprovarBase, devolverBase, pedirBase, renovarObra, situacaoDoSite, vencerObras } from '../src/services/ot-fase';
import { applySchema, execSql, resetData, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0110_ot_site_fase.sql?raw';
import mig111 from '../migrations/0111_ot_site_obra.sql?raw';
import { diaMaisSP } from '../src/services/hoje';

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
    it('em_operacao: em_operacao', async () => {
      await run(`UPDATE ot_sites SET fase = 'em_operacao' WHERE id = ?`, S);
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
      expect(await aprovarBase(env.DB, { id: 'u-aprov' }, P, S)).toEqual({ ok: true, fechouObra: false });
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
    it('409 se entrou lote em revisão depois do pedido', async () => {
      await tresZonas(); await pedirBase(env.DB, ator, P, S);
      await lote('l1');
      expect(await aprovarBase(env.DB, ator, P, S)).toEqual({ ok: false, status: 409, error: 'As condições da base mudaram desde o pedido' });
      expect(await fase()).toBe('base_em_aprovacao');
    });
    it('rascunho da sonda (chave_sensor) não trava pedir nem aprovar; o do consultor trava', async () => {
      await tresZonas(); await levantamento();
      await run(`INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por, chave_sensor) VALUES ('sonda1', ?, 'lv1', 'u', 'k1')`, P);
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect([s.rascunhos, s.rascunhos_bloqueiam, s.proximo_passo]).toEqual([1, 0, 'pedir_base']);
      await achado('a-consultor');
      expect(await pedirBase(env.DB, ator, P, S)).toMatchObject({ ok: false, status: 409 });
      await run(`DELETE FROM ot_achados WHERE id = 'a-consultor'`);
      expect(await pedirBase(env.DB, ator, P, S)).toEqual({ ok: true });
      await run(`INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por, chave_sensor) VALUES ('sonda2', ?, 'lv1', 'u', 'k2')`, P);
      expect(await aprovarBase(env.DB, ator, P, S)).toEqual({ ok: true, fechouObra: false });
      expect(await fase()).toBe('em_operacao');
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
  describe('obra (0111)', () => {
    const obraSql = async () => (await env.DB.prepare(`SELECT fase, obra_ate, obra_justificativa, obra_renovada, obra_aberta_por FROM ot_sites WHERE id = ?`).bind(S).first<any>())!;
    const emOperacao = () => run(`UPDATE ot_sites SET fase = 'em_operacao' WHERE id = ?`, S);
    const d = (ate: string) => ({ justificativa: 'troca de painel', ate });

    it('migração 0111 aplica sobre site existente', async () => {
      await run(`DROP TABLE IF EXISTS ot_sites_mig`);
      await run(`CREATE TABLE ot_sites_mig (id TEXT, project_id TEXT, nome TEXT)`);
      await run(`INSERT INTO ot_sites_mig SELECT id, project_id, nome FROM ot_sites`);
      await execSql(mig111.replace(/ot_sites/g, 'ot_sites_mig'));
      expect(await env.DB.prepare(`SELECT obra_ate, obra_renovada FROM ot_sites_mig WHERE id = ?`).bind(S).first()).toEqual({ obra_ate: null, obra_renovada: 0 });
    });
    it('abrirObra: só de em_operacao, grava a obra', async () => {
      expect(await abrirObra(env.DB, ator, P, S, d(diaMaisSP(10)))).toMatchObject({ ok: false, status: 409 });
      await emOperacao();
      expect(await abrirObra(env.DB, ator, P, S, d(diaMaisSP(10)))).toEqual({ ok: true });
      expect(await obraSql()).toMatchObject({ fase: 'em_obra', obra_ate: diaMaisSP(10), obra_justificativa: 'troca de painel', obra_renovada: 0, obra_aberta_por: 'u-gestor' });
      expect(await abrirObra(env.DB, ator, 'proj-b', S, d(diaMaisSP(10)))).toMatchObject({ ok: false, status: 404 });
    });
    it('abrirObra: prazo acima de 90 dias, hoje ou passado dá 400', async () => {
      await emOperacao();
      for (const ate of [diaMaisSP(91), diaMaisSP(0), diaMaisSP(-1), '2026-13-01']) expect(await abrirObra(env.DB, ator, P, S, d(ate))).toMatchObject({ ok: false, status: 400 });
      expect(await abrirObra(env.DB, ator, P, S, d(diaMaisSP(90)))).toEqual({ ok: true });
    });
    it('renovarObra: uma vez; segunda 409; além de 90 dias do atual 400', async () => {
      await emOperacao(); await abrirObra(env.DB, ator, P, S, d(diaMaisSP(10)));
      expect(await renovarObra(env.DB, ator, P, S, d(diaMaisSP(101)))).toMatchObject({ ok: false, status: 400 });
      expect(await renovarObra(env.DB, ator, P, S, d(diaMaisSP(10)))).toMatchObject({ ok: false, status: 400 });
      expect(await renovarObra(env.DB, ator, P, S, { justificativa: 'atraso', ate: diaMaisSP(100) })).toEqual({ ok: true });
      expect(await obraSql()).toMatchObject({ obra_ate: diaMaisSP(100), obra_justificativa: 'atraso', obra_renovada: 1 });
      expect(await renovarObra(env.DB, ator, P, S, d(diaMaisSP(105)))).toMatchObject({ ok: false, status: 409 });
    });
    it('pedirBase funciona de em_obra; devolverBase volta para em_obra; aprovarBase limpa a obra', async () => {
      await tresZonas(); await emOperacao(); await abrirObra(env.DB, ator, P, S, d(diaMaisSP(10)));
      expect(await pedirBase(env.DB, ator, P, S)).toEqual({ ok: true });
      expect(await fase()).toBe('base_em_aprovacao');
      expect(await devolverBase(env.DB, ator, P, S)).toEqual({ ok: true });
      expect(await fase()).toBe('em_obra');
      await pedirBase(env.DB, ator, P, S);
      expect(await aprovarBase(env.DB, ator, P, S)).toEqual({ ok: true, fechouObra: true });
      expect(await obraSql()).toMatchObject({ fase: 'em_operacao', obra_ate: null, obra_justificativa: null, obra_renovada: 0, obra_aberta_por: null });
    });
    it('vencerObras: move o vencido (limpando a base pedida) e não toca a obra vigente', async () => {
      await tresZonas(); await run(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s2', ?, 'SE B', 'em_obra', ?)`, P, diaMaisSP(5));
      await run(`UPDATE ot_sites SET fase = 'base_em_aprovacao', obra_ate = ?, base_pedida_em = CURRENT_TIMESTAMP WHERE id = ?`, diaMaisSP(-1), S);
      expect(await vencerObras(env.DB, diaMaisSP(0))).toEqual([{ siteId: S, projectId: P }]);
      expect(await obraSql()).toMatchObject({ fase: 'em_operacao', obra_ate: null });
      expect(await env.DB.prepare(`SELECT fase, obra_ate FROM ot_sites WHERE id = 's2'`).first()).toEqual({ fase: 'em_obra', obra_ate: diaMaisSP(5) });
    });
    it('situação: obra e passos do modo projeto em em_obra', async () => {
      await emOperacao(); await abrirObra(env.DB, ator, P, S, d(diaMaisSP(10)));
      let s = (await situacaoDoSite(env.DB, P, S))!;
      expect(s.obra).toEqual({ ate: diaMaisSP(10), renovada: false, justificativa: 'troca de painel' });
      expect(s.proximo_passo).toBe('comecar');
      await tresZonas();
      expect(await passo()).toBe('pedir_base');
      await levantamento(); await achado('a1');
      expect(await passo()).toBe('revisar');
    });
    it('situação: revalidar a 60 dias ou menos de completar 24 meses', async () => {
      await emOperacao();
      const ativo = (id: string, ver: string, arc = 1, st = 'ativo') => run(`INSERT INTO ot_ativos (id, project_id, site_id, nome, no_arciber, status, ultima_verificacao_em, categoria_arciber, tipo_dispositivo, fabricante, funcao, ip_cifrado, protocolos_portas, firmware_nao_aplicavel)
        VALUES (?, ?, ?, 'a', ?, ?, ?, 'centro_operacao', 'CLP', 'X', 'f', 'ot1:cif', '[{"protocolo":"tcp","porta":502}]', 1)`, id, P, S, arc, st, ver);
      expect((await situacaoDoSite(env.DB, P, S))!).toMatchObject({ revalidar_em: null, proximo_passo: 'em_operacao' });
      await ativo('x1', '2026-11-01', 0);
      expect((await situacaoDoSite(env.DB, P, S))!.revalidar_em).toBeNull();
      await ativo('x2', `${diaMaisSP(-365)} 00:00:00`);
      expect((await situacaoDoSite(env.DB, P, S))!.proximo_passo).toBe('em_operacao');
      await ativo('x3', `${diaMaisSP(-730 + 59)} 00:00:00`);
      const s = (await situacaoDoSite(env.DB, P, S))!;
      expect(s.proximo_passo).toBe('revalidar'); expect(s.revalidar_em).toBeTruthy();
    });
  });
});
