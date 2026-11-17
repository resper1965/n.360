import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, execSql, sessionFor, workerEnv } from './helpers/d1';
import { lacunasDaFonte, resumoDeLacunas } from '../src/services/requisitos';
import { montarAssessment } from '../src/services/ot-avaliacao';
import { SQL_CLASSE_CONTROLE } from '../src/services/classe-controle';
import req from '../migrations/0090_ot_requisitos.sql?raw';

/**
 * Onda 2, tarefa 1: caracterização dos três números que o cliente vê. Fixa o valor de HOJE (antes do catálogo único),
 * para que a unificação só mude um deles de propósito. Os valores foram conferidos à mão contra as regras do
 * levantamento (seção 3); se um deles mudar, a mudança é decisão, não efeito colateral.
 */
const db = () => env.DB;
const run = (sql: string, ...b: unknown[]) => db().prepare(sql).bind(...b).run();
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id, scope) VALUES ('pn', 'Exemplo', 'ISO 27001, ISO 27701', 'Controller', 'Active', 'org_ness', 'Plataforma')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pn', 'Cons', 'cons@ness.lat', 'consultor', 'C')`),
  ]);
});

describe('n.iso: indicador "X de Y controles aplicáveis implementados"', () => {
  it('soma TODAS as normas do projeto (sem filtro de standard); Not Applicable sai, texto desconhecido conta como em andamento', async () => {
    const c = (id: string, standard: string, title: string, status: string) =>
      db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES (?, 'pn', ?, ?, ?, '')`).bind(id, standard, title, status);
    await db().batch([
      // 27001:2022: 2 feitos, 4 em andamento (Partial, In Progress, Planned, texto desconhecido), 2 falta (Missing, vazio), 1 não aplicável
      c('a1', 'ISO 27001:2022', 'A.5.1 — Políticas', 'Implemented'), c('a2', 'ISO 27001:2022', 'A.5.2 — Papéis', 'Compliant'),
      c('a3', 'ISO 27001:2022', 'A.5.3 — Segregação', 'Partial'), c('a4', 'ISO 27001:2022', 'A.5.4 — Gestão', 'In Progress'),
      c('a5', 'ISO 27001:2022', 'A.6.1 — Triagem', 'Planned'), c('a6', 'ISO 27001:2022', 'A.6.2 — Termos', 'Revisando com o jurídico'),
      c('a7', 'ISO 27001:2022', 'A.7.1 — Perímetros', 'Missing'), c('a9', 'ISO 27001:2022', 'A.7.3 — Escritórios', ''), c('a8', 'ISO 27001:2022', 'A.7.2 — Entrada', 'Not Applicable'),
      // 27701:2025: 1 feito, 1 em andamento, 1 falta
      c('b1', 'ISO 27701:2025', 'A.1.2.1 — Finalidade', 'Implemented'), c('b2', 'ISO 27701:2025', 'A.1.2.2 — Base legal', 'In Progress'),
      c('b3', 'ISO 27701:2025', 'A.2.1 — Operador', 'Missing'),
    ]);
    const h = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', iat: Date.now() });

    const r = await chamar(h, '/api/v1/projects/pn/prontidao');
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as any;
    // feito 3 (2 + 1); aplicáveis = 3 + 5 andamento + 3 falta = 11. Só a 27001 daria 2 de 8: a 27701 entra junto.
    expect(corpo.indicador).toEqual({ implementados: 3, aplicaveis: 11, texto: '3 de 11 controles aplicáveis implementados' });
    expect(corpo.numeros.controles).toMatchObject({ implementados: 3, aplicaveis: 11 });

    // O Painel do n.iso mostra o mesmo número; "avaliados" (classe <> falta) = 9 de 12 (Planned e texto desconhecido contam; Missing e vazio não), então o programa não está "começando".
    const p = (await (await chamar(h, '/api/v1/projects/pn/painel?modulo=iso')).json()) as any;
    expect(p.modulos.iso.numeros[0]).toEqual(['3 de 11', 'controles aplicáveis implementados']);
    expect(p.modulos.iso.comecando).toBe(false);
    // `controles` do estadoDoPrograma (painel.ts:450), pela expressão de produção: classe <> 'falta'. 12 - 3 falta (2 Missing + vazio) = 9; inclui Planned e Not Applicable.
    const { n } = (await db().prepare(`SELECT count(*) AS n FROM compliance_controls WHERE project_id = 'pn' AND (${SQL_CLASSE_CONTROLE}) <> 'falta'`).first<{ n: number }>())!;
    expect(n).toBe(9);
  });
});

describe('n.privacy: cobertura LGPD/ANPD (resumoDeLacunas)', () => {
  it('cobre documento vigente, evidência conforming e controle feito por mapeamento validado equivalente; o resto, não', async () => {
    const ok = 'Jurídico';
    const lote: D1PreparedStatement[] = [
      db().prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('iso27001:2022', 'ISO 27001'), ('lgpd', 'LGPD')`),
    ];
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      lote.push(db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'lgpd', ?, 'x')`).bind(`lgpd:L${i}`, `L${i}`));
    }
    const controle = (n: number, status: string, tipo: string, estado: string) => {
      lote.push(db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'iso27001:2022', ?, 'x')`).bind(`iso:C${n}`, `C${n}`));
      lote.push(db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES (?, 'pn', 'ISO 27001:2022', 'c', ?, ?)`).bind(`cc${n}`, status, `iso:C${n}`));
      lote.push(db().prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(`iso:C${n}`, `lgpd:L${n}`, tipo, estado, estado === 'validado_juridico' ? ok : null, estado === 'validado_juridico' ? '2026-10-10' : null));
    };
    // L1 documento vigente (coberto) | L2 evidência conforming no prazo (coberto) | L3 evidência partial (parcial)
    // L4 controle feito + equivalente validado (coberto) | L5 feito + parcial validado (parcial) | L6 Planned + equivalente validado (lacuna)
    // L7 feito + equivalente só proposto (lacuna) | L8 feito + relacionado validado (lacuna) | L9 excluído (não aplicável, fora do total) | L10 nada (lacuna) | L11 Partial + equivalente (parcial) | L12 In Progress + equivalente (parcial)
    controle(4, 'Implemented', 'equivalente', 'validado_juridico');
    controle(5, 'Implemented', 'parcial', 'validado_juridico');
    controle(6, 'Planned', 'equivalente', 'validado_juridico');
    controle(7, 'Implemented', 'equivalente', 'proposto');
    controle(8, 'Implemented', 'relacionado', 'validado_juridico');
    controle(11, 'Partial', 'equivalente', 'validado_juridico'); // L11/L12: Partial e In Progress, mesmo com equivalente, só dão parcial
    controle(12, 'In Progress', 'equivalente', 'validado_juridico');
    const ev = (id: string, status: string) => db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, evaluation_status, valido_ate) VALUES (?, 'pn', ?, 'k', 'h', 'u', ?, '2099-01-01')`).bind(id, id, status);
    lote.push(
      db().prepare(`INSERT INTO documentos (id, project_id, titulo, status) VALUES ('d1', 'pn', 'Política', 'vigente')`),
      db().prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('d1', 'lgpd:L1', 'pn')`),
      ev('e2', 'conforming'), ev('e3', 'partial'),
      db().prepare(`INSERT INTO evidencia_requisitos (evidencia_id, requisito_id, project_id) VALUES ('e2', 'lgpd:L2', 'pn'), ('e3', 'lgpd:L3', 'pn')`),
      db().prepare(`INSERT INTO requisito_exclusoes (project_id, requisito_id, justificativa, decidido_por) VALUES ('pn', 'lgpd:L9', 'Não tratamos esse tipo de dado na operação', 'u-cons')`),
    );
    await db().batch(lote);

    const itens = await lacunasDaFonte(db(), 'pn', 'lgpd');
    expect(Object.fromEntries(itens.map((i) => [i.referencia, i.situacao]))).toEqual({
      L1: 'coberto', L2: 'coberto', L3: 'parcial', L4: 'coberto', L5: 'parcial', L6: 'lacuna', L7: 'lacuna', L8: 'lacuna', L9: 'nao_aplicavel', L10: 'lacuna', L11: 'parcial', L12: 'parcial',
    });
    expect(resumoDeLacunas(itens)).toEqual({ total: 11, cobertos: 3, parciais: 4, lacunas: 4, nao_aplicaveis: 1 });
  });
});

describe('n.ot: resumo do assessment (montarAssessment)', () => {
  it('política conta a situação (sem avaliação = nao_avaliado); técnico nunca conta atende; 5.1.1 fica nao_avaliado', async () => {
    await execSql(req);
    await run(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'pn', 'Subestação', 'em_operacao')`);
    const av = (cod: string, situacao: string) => run(
      `INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, atualizado_por) VALUES (?, 'pn', ?, ?, ?, 'u')`,
      `av-${cod}`, `ons-ro-cb-br-01-rev00-${cod}`, situacao, situacao === 'atende' ? null : 'justificativa de teste');
    await av('4.1.4', 'atende'); await av('4.2.2', 'atende'); await av('4.3.2', 'parcial');
    await av('4.3.3', 'nao_atende'); await av('4.4.1', 'nao_atende'); await av('4.4.2', 'nao_se_aplica');

    const { itens, resumo } = await montarAssessment(db(), 'pn', ['s1']);
    expect(itens).toHaveLength(25);
    expect(itens.filter((i) => i.tipo === 'tecnico').map((i: any) => [i.codigo, i.situacao_org])).toEqual(TECNICOS_ESPERADOS);
    // 19 de política: 2 atende, 1 parcial, 2 nao_atende, 1 nao_se_aplica e 13 sem avaliação. Os 5 técnicos: nao_atende ou nao_avaliado. + 5.1.1.
    expect(resumo).toEqual(RESUMO_ESPERADO);
    expect(resumo.atende).toBe(2); // só vem das duas avaliações de política: o inventário nunca afirma "atende"
  });
});

describe('n.ot: item técnico com evidência no inventário nunca conta como atende', () => {
  it('4.1.1 chega a evidencia_no_inventario (site com zonas 2, 3 e 4) e o resumo o põe em nao_avaliado', async () => {
    await execSql(req);
    await run(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'pn', 'Subestação', 'em_operacao')`);
    for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'pn', 's1', 'z', ?)`, `z${n}`, n);
    await run(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, atualizado_por) VALUES ('av1', 'pn', 'ons-ro-cb-br-01-rev00-4.1.4', 'atende', NULL, 'u')`);

    const { itens, resumo } = await montarAssessment(db(), 'pn', ['s1']);
    const t = itens.find((i) => i.codigo === '4.1.1') as any;
    expect(t.tipo).toBe('tecnico');
    expect(t.por_site[0].situacao).toBe('evidencia_no_inventario'); // (b) a situação do payload não vira atende
    expect(t.situacao_org).toBe('evidencia_no_inventario');
    // (a) o único atende é a avaliação de política; o técnico entra em nao_avaliado (5 técnicos + 5.1.1 + 18 de política sem avaliação = 24); a_confirmar 1 = a avaliação ainda não confirmada
    expect(resumo).toEqual({ atende: 1, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 24, revisar: 0, a_confirmar: 1 });
  });
});

// Um site em operação sem zonas: só o 4.1.1 é "nao_atende" (sem as 3 zonas); os outros quatro técnicos ficam "sem_evidencia".
const TECNICOS_ESPERADOS = [['4.1.1', 'nao_atende'], ['4.1.2', 'sem_evidencia'], ['4.1.3', 'sem_evidencia'], ['4.2.1', 'sem_evidencia'], ['4.3.1', 'sem_evidencia']];
// nao_atende 3 = 2 de política + o técnico 4.1.1; nao_avaliado 18 = 13 de política sem avaliação + 4 técnicos + o 5.1.1; a_confirmar 6 = as 6 avaliações não confirmadas.
const RESUMO_ESPERADO = { atende: 2, parcial: 1, nao_atende: 3, nao_se_aplica: 1, nao_avaliado: 18, revisar: 0, a_confirmar: 6 };
