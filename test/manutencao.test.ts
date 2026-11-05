import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData } from './helpers/d1';
import { manutencaoDiaria } from '../src/manutencao';

/**
 * Cron de manutenção (`src/manutencao.ts`).
 *
 * A asserção que carrega este arquivo não é "apagou as linhas velhas" — é
 * **não apagou as vivas**. `rate_limits` não tem TTL e a linha é reaproveitada:
 * apagar a linha de uma janela ABERTA zera o contador de quem está sendo
 * limitado naquele instante, o que transforma uma rotina de limpeza em bypass
 * de rate limit. É o modo de falha caro aqui, e o barato (deixar lixo) é
 * justamente o que a rotina existe para tolerar.
 */

const SEG = (d: number) => Math.floor(Date.now() / 1000) - d * 24 * 60 * 60;

describe('manutenção diária', () => {
  beforeEach(async () => {
    await applySchema();
    await resetData();
  });

  describe('purga de rate_limits', () => {
    it('NÃO apaga janela aberta — apagar zeraria o contador de quem está limitado', async () => {
      const agora = Math.floor(Date.now() / 1000);
      await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)')
        .bind('login:acct:alvo@x.com', 9, agora).run();

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(0);

      const linha = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?')
        .bind('login:acct:alvo@x.com').first<any>();
      expect(linha, 'a purga apagou uma janela aberta').not.toBeNull();
      expect(linha.count, 'o contador foi zerado — isto é bypass de rate limit').toBe(9);
    });

    it('NÃO apaga janela fechada recentemente (margem antes do corte)', async () => {
      // Fechada há ~1 dia: já não conta para nada, mas está dentro da margem.
      // O teste existe para o corte não virar "apaga tudo que não está aberto".
      await env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)')
        .bind('recente', 3, SEG(1)).run();

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(0);
      expect(await env.DB.prepare('SELECT key FROM rate_limits WHERE key = ?').bind('recente').first()).not.toBeNull();
    });

    it('apaga o que está parado há mais de 7 dias', async () => {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)').bind('velho-1', 4, SEG(30)),
        env.DB.prepare('INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?)').bind('velho-2', 1, SEG(8)),
      ]);

      const r = await manutencaoDiaria(env as any);
      expect(r.rate_limits_removidos).toBe(2);
      const { results } = await env.DB.prepare('SELECT key FROM rate_limits').all();
      expect(results).toHaveLength(0);
    });
  });

  describe('purga de tokens de auditor vencidos', () => {
    beforeEach(async () => {
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-a', 'Cliente A', 'ISO 27001', 'controller', 'Active').run();
    });

    it('mantém token válido e token vencido DENTRO da carência', async () => {
      // A carência é de propósito: num produto de GRC, investigar um acesso de
      // auditor do mês passado exige que a linha ainda exista.
      await env.DB.batch([
        env.DB.prepare('INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?,?)')
          .bind('at-vivo', 'proj-a', 'tok-vivo', '2099-01-01T00:00:00Z'),
        env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?, datetime('now','-10 days'))`)
          .bind('at-recente', 'proj-a', 'tok-recente'),
      ]);

      const r = await manutencaoDiaria(env as any);
      expect(r.tokens_auditor_removidos).toBe(0);
      const { results } = await env.DB.prepare('SELECT id FROM auditor_tokens ORDER BY id').all();
      expect((results as any[]).map(x => x.id)).toEqual(['at-recente', 'at-vivo']);
    });

    it('apaga token vencido há mais de 90 dias — credencial morta não se guarda para sempre', async () => {
      await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?, datetime('now','-200 days'))`)
        .bind('at-antigo', 'proj-a', 'tok-antigo').run();

      const r = await manutencaoDiaria(env as any);
      expect(r.tokens_auditor_removidos).toBe(1);
      expect(await env.DB.prepare('SELECT id FROM auditor_tokens WHERE id = ?').bind('at-antigo').first()).toBeNull();
    });
  });

  describe('política de retenção', () => {
    it('apaga registro de aviso de prazo com mais de 400 dias, e NÃO o recente', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('proj-av','C','ISO 27001:2022','Controller','Active')`),
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-av','av@x.com','x','Av','consultor')`),
        env.DB.prepare(`INSERT INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo, criado_em) VALUES ('av-velho','proj-av','capa','c1','D0','u-av','2025-08-01','CAPA', datetime('now','-401 days'))`),
        env.DB.prepare(`INSERT INTO avisos_prazo (id, project_id, fonte, item_id, marco, user_id, vence_em, titulo, criado_em) VALUES ('av-ano','proj-av','capa','c2','D0','u-av','2025-10-01','CAPA', datetime('now','-370 days'))`),
      ]);
      const r = await manutencaoDiaria(env as any);
      expect(r.retencao.avisos_prazo).toBe(1);
      const { results } = await env.DB.prepare('SELECT id FROM avisos_prazo').all<{ id: string }>();
      expect(results.map((x) => x.id)).toEqual(['av-ano']);
    });

    it('apaga notificação e chat velhos, e NÃO toca nos recentes', async () => {
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-r', 'Cliente R', 'ISO 27001', 'controller', 'Active').run();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO notifications (id, type, title, created_at) VALUES (?,?,?, datetime('now','-200 days'))`).bind('n-velha', 'x', 'Velha'),
        env.DB.prepare(`INSERT INTO notifications (id, type, title, created_at) VALUES (?,?,?, datetime('now','-30 days'))`).bind('n-nova', 'x', 'Nova'),
        env.DB.prepare(`INSERT INTO ai_chat_history (id, project_id, role, content, created_at) VALUES (?,?,?,?, datetime('now','-200 days'))`).bind('c-velho', 'proj-r', 'user', 'texto antigo'),
        env.DB.prepare(`INSERT INTO ai_chat_history (id, project_id, role, content, created_at) VALUES (?,?,?,?, datetime('now','-10 days'))`).bind('c-novo', 'proj-r', 'user', 'texto recente'),
      ]);

      const r = await manutencaoDiaria(env as any);
      expect(r.retencao.notifications).toBe(1);
      expect(r.retencao.ai_chat_history).toBe(1);

      const { results } = await env.DB.prepare(
        `SELECT id FROM notifications UNION ALL SELECT id FROM ai_chat_history ORDER BY id`
      ).all();
      expect((results as any[]).map((x) => x.id)).toEqual(['c-novo', 'n-nova']);
    });

    it('NÃO apaga registro de GRC, por mais velho que seja', async () => {
      // A asserção que impede a política de virar destruição de trabalho do
      // cliente. Evidência, risco e controle são a razão de o produto existir, e
      // o prazo deles é decisão do cliente — muitas vezes de norma, porque
      // certificação exige o histórico dos ciclos anteriores.
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-g', 'Cliente G', 'ISO 27001', 'controller', 'Active').run();

      // Preenche toda coluna NOT NULL sem default a partir do PRAGMA. Listar as
      // colunas à mão aqui já custou três rodadas de "NOT NULL constraint
      // failed" — e o que este teste quer afirmar não tem nada a ver com o
      // formato da linha.
      for (const [tabela, id] of [['risks', 'r-antigo'], ['evidence', 'e-antiga']] as const) {
        const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${tabela}")`).all<any>();
        const usadas: string[] = [];
        const valores: unknown[] = [];
        for (const col of cols as any[]) {
          if (col.name === 'id') { usadas.push('id'); valores.push(id); continue; }
          if (col.name === 'project_id') { usadas.push('project_id'); valores.push('proj-g'); continue; }
          if (col.name === 'created_at') { continue; }
          if (col.notnull && col.dflt_value === null) {
            usadas.push(col.name);
            valores.push(/INT|REAL|NUM/i.test(col.type ?? '') ? 1 : 'x');
          }
        }
        usadas.push('created_at');
        await env.DB.prepare(
          `INSERT INTO "${tabela}" (${usadas.map((u) => `"${u}"`).join(',')}) VALUES (${usadas.slice(0, -1).map(() => '?').join(',')}, datetime('now','-3000 days'))`
        ).bind(...valores).run();
      }

      await manutencaoDiaria(env as any);

      expect(await env.DB.prepare('SELECT id FROM risks WHERE id = ?').bind('r-antigo').first()).not.toBeNull();
      expect(await env.DB.prepare('SELECT id FROM evidence WHERE id = ?').bind('e-antiga').first()).not.toBeNull();
    });

    it('a trilha de auditoria NÃO é purgada — nem pela política, nem por acidente', async () => {
      // Duas barreiras somadas: a tabela não está na política, e os triggers da
      // migration 0018 recusam DELETE no nível do banco. O teste confere as duas.
      await env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, created_at) VALUES (?,?,?, datetime('now','-3000 days'))`)
        .bind(crypto.randomUUID(), 'acao.antiga', 'quem@x.com').run();

      const r = await manutencaoDiaria(env as any);
      expect(Object.keys(r.retencao)).not.toContain('audit_logs');

      await expect(
        env.DB.prepare(`DELETE FROM audit_logs WHERE action = 'acao.antiga'`).run()
      ).rejects.toThrow(/append-only/);
    });
    it('pendência de fluxo do sensor sem resolução sai em 90 dias; a de 89 fica', async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-pend','C','ISO 27001','controller','Active')`),
        env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-pend', 'p-pend', 'S')`),
        env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, criado_por) VALUES ('l-pend', 'p-pend', 's-pend', 'documento', '2026-11-04', 'D', 'u')`),
        env.DB.prepare(`INSERT INTO ot_fluxos_pendentes (id, project_id, levantamento_id, origem_ip_hash, dados, created_at) VALUES
          ('pend-91', 'p-pend', 'l-pend', 'h', '{}', datetime('now', '-91 days')), ('pend-89', 'p-pend', 'l-pend', 'h', '{}', datetime('now', '-89 days'))`),
      ]);
      const r = await manutencaoDiaria(env as any);
      expect(r.falhas).toEqual([]);
      expect(r.retencao.ot_fluxos_pendentes).toBe(1);
      const { results } = await env.DB.prepare('SELECT id FROM ot_fluxos_pendentes LIMIT 10').all<{ id: string }>();
      expect(results.map((x) => x.id)).toEqual(['pend-89']);
    });
  });

  describe('catálogo de requisitos', () => {
    const n = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

    it('semeia o catálogo (LGPD incluída), não duplica na segunda vez e não rebaixa mapeamento validado', async () => {
      const r1 = await manutencaoDiaria(env as any);
      expect(r1.falhas).toEqual([]);
      expect(r1.catalogo?.requisitos).toBeGreaterThan(0);
      expect(await n(`SELECT count(*) AS n FROM requisitos WHERE fonte_id = 'lgpd'`)).toBeGreaterThan(0);

      const total = await n('SELECT count(*) AS n FROM requisitos');
      const mapas = await n('SELECT count(*) AS n FROM requisito_mapeamentos');
      expect(mapas).toBeGreaterThan(0);
      const um = await env.DB.prepare('SELECT de_id, para_id FROM requisito_mapeamentos LIMIT 1').first<{ de_id: string; para_id: string }>();
      await env.DB.prepare(`UPDATE requisito_mapeamentos SET estado = 'validado_juridico', validado_por = 'u', validado_em = datetime('now') WHERE de_id = ? AND para_id = ?`)
        .bind(um!.de_id, um!.para_id).run();

      const r2 = await manutencaoDiaria(env as any);
      expect(r2.catalogo).toEqual({ fontes: 0, requisitos: 0, mapeamentos: 0 });
      expect(await n('SELECT count(*) AS n FROM requisitos')).toBe(total);
      expect(await n('SELECT count(*) AS n FROM requisito_mapeamentos')).toBe(mapas);
      const estado = await env.DB.prepare('SELECT estado FROM requisito_mapeamentos WHERE de_id = ? AND para_id = ?')
        .bind(um!.de_id, um!.para_id).first<{ estado: string }>();
      expect(estado!.estado).toBe('validado_juridico');
    });

    it('liga ao requisito o controle sem requisito_id cujo código bate com o catálogo', async () => {
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-cat','C','ISO 27001','controller','Active')`).run();
      await env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('ctl-cat','p-cat','ISO 27001:2022','A.5.1 Políticas de segurança da informação','Missing')`).run();
      const r = await manutencaoDiaria(env as any);
      expect(r.falhas).toEqual([]);
      expect(r.controles_ligados).toBeGreaterThanOrEqual(1);
      const c = await env.DB.prepare(`SELECT requisito_id FROM compliance_controls WHERE id = 'ctl-cat'`).first<{ requisito_id: string | null }>();
      expect(c!.requisito_id).toBe('iso27001:2022:A.5.1');
      expect((await manutencaoDiaria(env as any)).controles_ligados).toBe(0);
    });
  });

  describe('tolerância a falha', () => {
    it('uma tarefa que estoura não impede as outras, e a falha vai no resultado', async () => {
      // Sem a tabela, a purga de rate_limits estoura; a de tokens tem de rodar
      // assim mesmo. Perder a limpeza de hoje é aceitável; perder o registro do
      // porquê, não.
      await env.DB.prepare('DROP TABLE rate_limits').run();
      await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?,?,?,?,?)`)
        .bind('proj-b', 'Cliente B', 'ISO 27001', 'controller', 'Active').run();
      await env.DB.prepare(`INSERT INTO auditor_tokens (id, project_id, token_hash, expires_at) VALUES (?,?,?, datetime('now','-200 days'))`)
        .bind('at-x', 'proj-b', 'tok-x').run();

      const r = await manutencaoDiaria(env as any);

      expect(r.falhas.length, 'a falha não foi registrada').toBe(1);
      expect(r.falhas[0]).toContain('rate_limits');
      expect(r.tokens_auditor_removidos, 'a segunda tarefa não rodou após a falha da primeira').toBe(1);
    });
  });
});
