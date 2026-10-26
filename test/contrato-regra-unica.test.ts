import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { diaMaisSP } from '../src/services/hoje';
import { painelDoProjeto } from '../src/services/painel';
import { contagensDoProjeto } from '../src/services/prontidao';
import { checkCoherence } from '../src/services/coherence';
import { visaoDoEncarregado } from '../src/services/encarregado';
import { CONSULTAS_ENTIDADE } from '../src/services/passos/contexto';
import { escopoRopa } from '../src/services/escopo-itens';

/**
 * Contrato "uma regra por conceito" (P1 da equalização): o MESMO projeto, contado pelas telas e serviços, dá o mesmo
 * número. Risco e ação do programa (`ropa_id` nulo) são contados pelo Painel, pela Prontidão e pela coherence; matriz,
 * CAPA e Bancada contam também os das atividades (escopo `todos`, de propósito); o n.privacy conta só os das atividades.
 * Evidência a corrigir (vencida ou não conforme) é um número só no Painel, na Prontidão e no "O que fazer".
 */
const P = 'rg-1';
const db = () => env.DB;
const ontem = () => diaMaisSP(-1);
let h: Record<string, string>;
const chamar = (caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Cliente', 'ISO 27001', 'controller', 'Active')`).bind(P),
    db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('rg-ropa', ?, 'Folha')`).bind(P),
    // riscos: um do programa, um da atividade; os dois "Mitigate" abertos e sem controle (regra R1 da coherence)
    db().prepare(`INSERT INTO risks (id, project_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, status, ropa_id) VALUES
      ('rg-r1', ?1, 'Servidor', 'Ransomware', 'v', 3, 3, 'Medium', 'Mitigate', 'Open', NULL),
      ('rg-r2', ?1, 'Folha', 'Vazamento', 'v', 4, 4, 'High', 'Mitigate', 'Open', 'rg-ropa')`).bind(P),
    // ações vencidas: uma do programa, uma da atividade
    db().prepare(`INSERT INTO corrective_actions (id, project_id, title, status, due_date, assigned_to, ropa_id) VALUES
      ('rg-c1', ?1, 'Ação do programa', 'Open', ?2, 'Ana', NULL),
      ('rg-c2', ?1, 'Ação da atividade', 'Open', ?2, 'Ana', 'rg-ropa')`).bind(P, ontem()),
    // evidências: vencida, não conforme, conforme em dia, parcial em dia
    db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate, evaluation_status) VALUES
      ('rg-e1', ?1, 'a.pdf', 'k1', 'h1', 'u', ?2, 'conforming'),
      ('rg-e2', ?1, 'b.pdf', 'k2', 'h2', 'u', NULL, 'non_conforming'),
      ('rg-e3', ?1, 'c.pdf', 'k3', 'h3', 'u', NULL, 'conforming'),
      ('rg-e4', ?1, 'd.pdf', 'k4', 'h4', 'u', NULL, 'partial')`).bind(P, ontem()),
  ]);
  await habilitarPrivacy(P);
  h = await sessionFor({ id: 'u-rg', email: 'rg@ness.lat', role: 'platform_admin' });
});

const total = (t?: { feito: number; andamento: number; falta: number }) => (t ? t.feito + t.andamento + t.falta : -1);

describe('riscos e ações: o escopo é explícito e a mesma conta dá o mesmo número', () => {
  it('escopo `todos` (matriz, CAPA, Bancada, carteira) conta os dois; o do programa, só o dele', async () => {
    const riscos = ((await (await chamar(`/api/v1/projects/${P}/risks`)).json()) as any).risks;
    const acoes = ((await (await chamar(`/api/v1/projects/${P}/capa`)).json()) as any).actions;
    expect(riscos).toHaveLength(2);
    expect(acoes).toHaveLength(2);
    const bancada = async (sql: string) => (await db().prepare(sql).bind(P).first<{ n: number }>())!.n;
    expect(await bancada(CONSULTAS_ENTIDADE.riscos)).toBe(2);
    expect(await bancada(CONSULTAS_ENTIDADE.acoes_corretivas)).toBe(2);
    // a lista, a Bancada e a mesma função de escopo concordam
    const via = async (t: string, e: Parameters<typeof escopoRopa>[0]) =>
      (await db().prepare(`SELECT count(*) AS n FROM ${t} WHERE project_id = ?${escopoRopa(e)}`).bind(P).first<{ n: number }>())!.n;
    expect([await via('risks', 'todos'), await via('risks', 'programa'), await via('risks', 'atividades')]).toEqual([2, 1, 1]);
    expect([await via('corrective_actions', 'todos'), await via('corrective_actions', 'programa'), await via('corrective_actions', 'atividades')]).toEqual([2, 1, 1]);
  });

  it('Painel (n.iso), Prontidão e coherence contam só o programa: 1 risco, 1 ação vencida', async () => {
    const painel = await painelDoProjeto(db(), P, ['iso'], { cliente: false });
    const cob = painel.modulos.iso!.cobertura!;
    expect(total(cob.find((t) => t.tema === 'Riscos'))).toBe(1);
    expect(total(cob.find((t) => t.tema === 'Ações corretivas'))).toBe(1);
    const { contagens } = await contagensDoProjeto(db(), P);
    expect(contagens.riscos).toBe(1);
    expect(contagens.acoes_vencidas).toBe(1);
    const coh = await checkCoherence(db(), P);
    expect(coh.issues.filter((i) => i.rule === 'risk_without_control')).toHaveLength(1);
  });

  it('o n.privacy conta só o das atividades: 1 ação vencida, 1 risco alto', async () => {
    const v = await visaoDoEncarregado(db(), P);
    expect(v.riscos).toEqual({ altos: 1, acoes_vencidas: 1 });
    const painel = await painelDoProjeto(db(), P, ['privacy'], { cliente: false });
    expect(painel.modulos.privacy!.riscos!.reduce((t, x) => t + x.n, 0)).toBe(1);
  });
});

describe('evidência a corrigir: um critério só (só `conforming` em dia cobre; `partial` é parcial)', () => {
  it('Painel n.iso, Painel n.privacy, Prontidão e "O que fazer" dão 2 (vencida e não conforme)', async () => {
    for (const m of ['iso', 'privacy'] as const) {
      const painel = await painelDoProjeto(db(), P, [m], { cliente: false });
      const ev = painel.modulos[m]!.cobertura!.find((t) => t.tema === 'Evidências')!;
      // conforme em dia cobre (1); parcial fica em análise (1); vencida e não conforme faltam (2)
      expect([ev.feito, ev.andamento, ev.falta]).toEqual([1, 1, 2]);
    }
    expect((await contagensDoProjeto(db(), P)).contagens.evidencias_vencidas_ou_nao_conformes).toBe(2);
    const v = await visaoDoEncarregado(db(), P);
    expect(v.evidencias.a_corrigir).toBe(2);
  });
});
