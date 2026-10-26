import { describe, it, expect, beforeAll } from 'vitest';
import { diaMaisSP } from '../src/services/hoje';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { celulaCsv, montarCsv, TETO_LINHAS } from '../src/services/exportacao';
import { faixaDePrazo } from '../src/services/riscos-atividade';

/**
 * F4: CSV que abre no Excel em pt-BR (BOM, `;`, CRLF), com a fórmula neutralizada, das listas do n.privacy. Atividades e RIPD no
 * núcleo; riscos e ações das atividades e LIA na faixa privacy. Trilha só com contagem.
 */
const P = 'ex-proj';
const OUTRO = 'ex-outro';
const SO_ISO = 'ex-iso';
const AGENTE = { userId: 'u-ex', email: 'ex@ness.lat', projectId: P, concessaoId: 'c-ex' };

const chamar = (h: Record<string, string>, caminho: string, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'GET', headers: h }), { ...workerEnv(), ...extra } as any);
const exp = (tipo: string, p = P, q = '') => `/api/v1/projects/${p}/export/${tipo}${q}`;
/** Linhas do CSV sem o BOM; cada linha em células (sem aspas externas). */
const linhas = (txt: string) => txt.replace(/^﻿/, '').split('\r\n').filter(Boolean)
  .map((l) => l.split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
const dia = (deslocamento: number) => diaMaisSP(deslocamento);

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness'), (?3, 'Só ISO', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO, SO_ISO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-ex', 'ex@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ex1', ?1, 'Cons', 'ex@ness.lat', 'consultor', 'Consultor'), ('g-ex2', ?2, 'Cons', 'ex@ness.lat', 'consultor', 'Consultor'), ('g-ex3', ?3, 'Cons', 'ex@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO, SO_ISO),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-ex', 'u-ex', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_subjects, legal_basis, dados_sensiveis, status) VALUES
      ('ex-r1', ?1, '=HYPERLINK("http://exemplo.invalid")', 'Clientes; parceiros', 'Execução de contrato', 1, 'Active'),
      ('ex-r2', ?1, 'Folha de pagamento', 'Empregados', 'Obrigação legal', 0, 'Draft'),
      ('ex-alheio', ?2, 'Atividade de outro projeto', 'Outros', 'Consentimento', 0, 'Active')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, descricao) VALUES ('ex-r2', ?, 'coleta', 'registrada', 'Formulário de admissão')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, impact, probability, risk_level, status) VALUES
      ('ex-k1', ?1, 'ex-r1', 'A', 'Vazamento', 5, 4, 'High', 'Open'),
      ('ex-k2', ?1, 'ex-r2', 'B', 'Acesso indevido', 2, 2, 'Low', 'Open'),
      ('ex-k3', ?1, NULL, 'C', 'Risco só do n.iso', 3, 3, 'Medium', 'Open'),
      ('ex-k4', ?2, 'ex-alheio', 'D', 'Risco alheio', 5, 5, 'Critical', 'Open')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, ropa_id, title, due_date, status) VALUES
      ('ex-a1', ?1, 'ex-r1', 'Ação vencida', ?3, 'Open'),
      ('ex-a2', ?1, 'ex-r1', 'Ação em 10 dias', ?4, 'Open'),
      ('ex-a3', ?1, 'ex-r2', 'Ação sem prazo', NULL, 'Open'),
      ('ex-a4', ?1, NULL, 'CAPA só do n.iso', ?3, 'Open'),
      ('ex-a5', ?2, 'ex-alheio', 'Ação alheia', ?3, 'Open')`).bind(P, OUTRO, dia(-3), dia(10)),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, data_subjects_types, status) VALUES
      ('ex-d1', ?1, 'ex-r1', 'RIPD do cadastro', 'Clientes', 'Draft'), ('ex-d2', ?2, 'ex-alheio', 'RIPD alheio', 'Outros', 'Approved')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id, finalidade_legitima, status) VALUES ('ex-l1', ?1, 'ex-r1', 'Prevenção a fraude', 'rascunho'), ('ex-l2', ?2, 'ex-alheio', 'LIA alheia', 'rascunho')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-ex', email: 'ex@ness.lat', role: 'consultor' });
});

describe('CSV', () => {
  it('célula: aspas dobradas, fórmula neutralizada, decimal com vírgula', () => {
    expect(celulaCsv('a "b"')).toBe('"a ""b"""');
    for (const f of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1']) expect(celulaCsv(f)).toBe(`"'${f}"`);
    expect(celulaCsv(1.5)).toBe('"1,5"');
    expect(celulaCsv(3)).toBe('"3"');
    expect(celulaCsv(null)).toBe('""');
  });
  it('arquivo: BOM, separador ponto e vírgula e CRLF', () => {
    const t = montarCsv(['A', 'B'], [['x;y', 'linha\nnova']]);
    expect(t.startsWith('﻿"A";"B"\r\n')).toBe(true);
    expect(t).toContain('"x;y";"linha\nnova"\r\n');
  });
  it('faixa de prazo da ação', () => {
    const hoje = '2026-10-14';
    expect(faixaDePrazo(null, hoje)).toBe('sem_prazo');
    expect(faixaDePrazo('2026-10-13', hoje)).toBe('vencidas');
    expect(faixaDePrazo('2026-10-14', hoje)).toBe('ate_30');
    expect(faixaDePrazo('2026-11-13', hoje)).toBe('ate_30');
    expect(faixaDePrazo('2026-11-14', hoje)).toBe('de_31_a_90');
    expect(faixaDePrazo('2027-01-12', hoje)).toBe('de_31_a_90');
    expect(faixaDePrazo('2027-01-13', hoje)).toBe('de_91_a_150');
    expect(faixaDePrazo('2027-03-13', hoje)).toBe('de_91_a_150');
    expect(faixaDePrazo('2027-03-14', hoje)).toBe('mais_de_150');
  });
});

describe('rotas', () => {
  it('atividades: só as do projeto, cabeçalho em português, fórmula neutralizada, ciclo junto', async () => {
    const r = await chamar(consultor, exp('atividades'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="atividades-\d{4}-\d{2}-\d{2}\.csv"$/);
    const txt = await r.text();
    expect(txt.charCodeAt(0)).toBe(0xfeff);
    const l = linhas(txt);
    expect(l[0][0]).toBe('Finalidade');
    expect(l).toHaveLength(3);
    expect(txt).not.toContain('Atividade de outro projeto');
    expect(txt).toContain(`"'=HYPERLINK(""http://exemplo.invalid"")"`);
    expect(txt).toContain('Coleta: Formulário de admissão');
  });

  it('riscos das atividades: sem risco só do n.iso nem de outro projeto; filtro da célula do mapa', async () => {
    const txt = await (await chamar(consultor, exp('riscos-atividade'))).text();
    expect(txt).toContain('Vazamento');
    expect(txt).toContain('Acesso indevido');
    expect(txt).not.toContain('Risco só do n.iso');
    expect(txt).not.toContain('Risco alheio');
    const filtrado = await (await chamar(consultor, exp('riscos-atividade', P, '?probabilidade=4&impacto=5'))).text();
    expect(linhas(filtrado)).toHaveLength(2);
    expect(filtrado).toContain('Vazamento');
    expect((await chamar(consultor, exp('riscos-atividade', P, '?probabilidade=9'))).status).toBe(400);
  });

  it('ações das atividades: faixa de prazo e filtro da faixa', async () => {
    const txt = await (await chamar(consultor, exp('acoes-atividade'))).text();
    expect(txt).not.toContain('CAPA só do n.iso');
    expect(txt).not.toContain('Ação alheia');
    expect(linhas(txt)).toHaveLength(4);
    const vencidas = linhas(await (await chamar(consultor, exp('acoes-atividade', P, '?faixa=vencidas'))).text());
    expect(vencidas.map((x) => x[1])).toEqual(['Ação', 'Ação vencida']);
    expect((await chamar(consultor, exp('acoes-atividade', P, '?faixa=qualquer'))).status).toBe(400);
  });

  it('ações: o CSV traz Área, Recomendação e Plano e respeita busca, área e situação da tela', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('ex-dep', ?, 'Recursos Humanos')`).bind(P),
      env.DB.prepare(`INSERT INTO tratamento_departamentos (ropa_id, project_id, departamento_id) VALUES ('ex-r2', ?, 'ex-dep')`).bind(P),
      env.DB.prepare(`UPDATE corrective_actions SET recomendacao = 'Revisar a retenção', action_plan = 'Plano exemplo' WHERE id = 'ex-a3'`),
    ]);
    const todas = linhas(await (await chamar(consultor, exp('acoes-atividade'))).text());
    expect(todas[0].slice(0, 6)).toEqual(['Atividade', 'Área', 'Ação', 'Descrição', 'Recomendação', 'Plano']);
    const semPrazo = todas.find((l) => l[2] === 'Ação sem prazo')!;
    expect(semPrazo.slice(1, 6)).toEqual(['Recursos Humanos', 'Ação sem prazo', '', 'Revisar a retenção', 'Plano exemplo']);
    const porArea = linhas(await (await chamar(consultor, exp('acoes-atividade', P, '?area=Recursos%20Humanos'))).text());
    expect(porArea.map((l) => l[2])).toEqual(['Ação', 'Ação sem prazo']);
    const atraso = linhas(await (await chamar(consultor, exp('acoes-atividade', P, '?status=atraso'))).text());
    expect(atraso.map((l) => l[2])).toEqual(['Ação', 'Ação vencida']);
    const abertas = linhas(await (await chamar(consultor, exp('acoes-atividade', P, '?status=Open'))).text());
    expect(abertas.map((l) => l[2])).toEqual(['Ação', 'Ação em 10 dias', 'Ação sem prazo']); // a vencida só cai em "atraso", como na tela
    const busca = linhas(await (await chamar(consultor, exp('acoes-atividade', P, '?q=FOLHA'))).text());
    expect(busca.map((l) => l[2])).toEqual(['Ação', 'Ação sem prazo']); // atividade "Folha de pagamento"
    expect((await chamar(consultor, exp('acoes-atividade', P, '?status=qualquer'))).status).toBe(400);
  });

  it('riscos: motivo, nível, situação e área da tela filtram o arquivo', async () => {
    const motivo = linhas(await (await chamar(consultor, exp('riscos-atividade', P, '?motivo=Vazamento'))).text());
    expect(motivo.map((l) => l[1])).toEqual(['Ameaça', 'Vazamento']);
    const nivel = linhas(await (await chamar(consultor, exp('riscos-atividade', P, '?nivel=Low'))).text());
    expect(nivel.map((l) => l[1])).toEqual(['Ameaça', 'Acesso indevido']);
    expect(linhas(await (await chamar(consultor, exp('riscos-atividade', P, '?status=Closed'))).text())).toHaveLength(1);
    const area = linhas(await (await chamar(consultor, exp('riscos-atividade', P, '?area=Recursos%20Humanos'))).text());
    expect(area.map((l) => l[1])).toEqual(['Ameaça', 'Acesso indevido']);
    expect((await chamar(consultor, exp('riscos-atividade', P, '?nivel=Enorme'))).status).toBe(400);
  });

  it('RIPD e LIA: só os do projeto', async () => {
    const ripd = await (await chamar(consultor, exp('ripd'))).text();
    expect(ripd).toContain('RIPD do cadastro');
    expect(ripd).not.toContain('RIPD alheio');
    expect(ripd).toContain('Rascunho');
    const lia = await (await chamar(consultor, exp('lia'))).text();
    expect(lia).toContain('Prevenção a fraude');
    expect(lia).not.toContain('LIA alheia');
  });

  it('trilha leva o tipo e a contagem, nunca o conteúdo', async () => {
    await chamar(consultor, exp('atividades'));
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'exportacao.csv' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
    expect(t!.details).toBe('Exportação CSV de atividades: 2 linhas');
  });

  it('faixa: projeto só com n.iso exporta atividades e RIPD, mas não riscos, ações nem LIA das atividades', async () => {
    expect((await chamar(consultor, exp('atividades', SO_ISO))).status).toBe(200);
    expect((await chamar(consultor, exp('ripd', SO_ISO))).status).toBe(200);
    for (const t of ['riscos-atividade', 'acoes-atividade', 'lia']) expect((await chamar(consultor, exp(t, SO_ISO))).status, t).toBe(403);
  });

  it('o agente não exporta arquivo', async () => {
    const r = await chamar({}, exp('atividades'), { AGENTE });
    expect(r.status).toBe(403);
  });

  it('exportações antigas do n.iso: trilha só com tipo e contagem, formato inalterado e fora do agente', async () => {
    const antigas: Array<[string, string]> = [['risks', 'riscos'], ['vendors', 'fornecedores'], ['training', 'treinamentos'], ['audit-log', 'trilha de auditoria'], ['assets', 'ativos']];
    for (const [tipo, rotulo] of antigas) {
      const r = await chamar(consultor, exp(tipo));
      expect(r.status, tipo).toBe(200);
      expect(r.headers.get('Content-Disposition'), tipo).toBe(`attachment; filename="${tipo}.csv"`);
      const linhasCsv = (await r.text()).split('\n').filter(Boolean).length - 1;
      const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'exportacao.csv' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
      expect(t!.details, tipo).toBe(`Exportação CSV de ${rotulo}: ${linhasCsv} linhas`);
      expect((await chamar({}, exp(tipo), { AGENTE })).status, tipo).toBe(403);
    }
  });

  it('teto de linhas: corta e avisa no cabeçalho', async () => {
    const stmts = Array.from({ length: TETO_LINHAS + 1 }, (_, i) => `('ex-m${i}', '${P}', 'Massa ${i}')`);
    for (let i = 0; i < stmts.length; i += 500) {
      await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ${stmts.slice(i, i + 500).join(', ')}`).run();
    }
    const r = await chamar(consultor, exp('atividades'));
    expect(r.headers.get('X-Exportacao-Truncada')).toBe('1');
    expect(linhas(await r.text())).toHaveLength(TETO_LINHAS + 1);
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id LIKE 'ex-m%'`).run();
  });
});
