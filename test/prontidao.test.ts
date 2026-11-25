import { describe, it, expect, beforeEach } from 'vitest';
import { diaMaisSP } from '../src/services/hoje';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';
import { avaliarProntidao, CRITERIOS, type Contagens } from '../src/services/prontidao';

/**
 * Prontidão para a certificação (Onda 2 do diagnóstico de 15/10/2026): critérios explícitos, cada um com a cláusula de origem,
 * a situação, o motivo, o número que o sustenta e a tela onde se resolve. Função pura e rota contra o D1 real.
 */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const dias = (n: number) => diaMaisSP(n);

const vazio: Contagens = {
  escopo: false, contexto: false, partes: 0, papeis: 0, politica_vigente: 0, politica_a51_aprovada: 0,
  controles: { feito: 0, andamento: 0, falta: 0, na: 0 }, na_sem_justificativa: 0, implementados_sem_evidencia: 0,
  riscos: 0, riscos_sem_tratamento: 0, indicadores: 0, indicadores_medidos: 0, documentos_revisao_vencida: 0,
  evidencias: 0, evidencias_vencidas_ou_nao_conformes: 0, treinamentos_concluidos: 0, auditorias_internas: 0,
  analises_criticas: 0, nc_sem_acao_concluida: 0, nc_total: 0, acoes_vencidas: 0, fases: { concluidas: 0, total: 0 },
};
const cheio: Contagens = {
  ...vazio, escopo: true, contexto: true, partes: 3, papeis: 2, politica_vigente: 1,
  controles: { feito: 90, andamento: 0, falta: 0, na: 3 }, riscos: 12, indicadores: 4, indicadores_medidos: 4,
  evidencias: 40, treinamentos_concluidos: 25, auditorias_internas: 1, analises_criticas: 1, fases: { concluidas: 41, total: 41 },
};

describe('critérios (catálogo)', () => {
  it('todo critério cita a cláusula da ISO/IEC 27001:2022, diz o estágio, a tela e a ação; ids únicos', () => {
    const ids = CRITERIOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CRITERIOS) {
      expect(c.requisito).toMatch(/^\d+(\.\d+)*( e \d+(\.\d+)*)?$/);
      expect([1, 2]).toContain(c.estagio);
      expect(c.tela).toBeTruthy();
      expect(c.acao).toBeTruthy();
      for (const d of c.destrava) expect(ids).toContain(d);
    }
  });
});

describe('avaliarProntidao (função pura)', () => {
  it('projeto vazio: nada atendido no estágio 1, e a frase diz quantos itens faltam (nunca "pronto")', () => {
    const r = avaliarProntidao(vazio);
    // Revisão vencida é o único critério que um cadastro vazio não descumpre (não há documento vencido).
    const e1 = r.criterios.filter((c) => c.estagio === 1 && c.id !== 'documentos_revisao');
    expect(e1.every((c) => c.situacao === 'pendente')).toBe(true);
    expect(r.estagios[0]).toMatchObject({ estagio: 1, pronto: false, faltam: e1.length });
    expect(r.veredito.frase).toBe(`Faltam ${e1.length} itens para o estágio 1.`);
    expect(r.veredito.frase).not.toMatch(/conforme/i);
  });

  it('tudo cadastrado e em dia: pronto para os dois estágios, com a ressalva de que não substitui a auditoria', () => {
    const r = avaliarProntidao(cheio);
    expect(r.criterios.filter((c) => c.situacao === 'pendente').map((c) => c.id)).toEqual([]);
    expect(r.veredito.frase).toBe('Pronto para os estágios 1 e 2.');
    expect(r.veredito.apoio).toMatch(/não substitui/i);
  });

  it('estágio 1 pronto e estágio 2 não: a frase diz os dois', () => {
    const r = avaliarProntidao({ ...cheio, auditorias_internas: 0, acoes_vencidas: 2 });
    expect(r.veredito.frase).toBe('Pronto para o estágio 1. Faltam 2 itens para o estágio 2.');
    expect(avaliarProntidao({ ...cheio, escopo: false }).veredito.frase).toBe('Falta 1 item para o estágio 1.');
    const acoes = r.criterios.find((c) => c.id === 'acoes_vencidas')!;
    expect(acoes).toMatchObject({ situacao: 'pendente', numero: '2 vencidas', tela: 'capa', filtro: 'vencidas' });
  });

  it('cada critério traz o número que o sustenta: controles aplicáveis implementados e exclusões sem justificativa', () => {
    const r = avaliarProntidao({ ...cheio, controles: { feito: 31, andamento: 50, falta: 9, na: 3 }, na_sem_justificativa: 2 });
    expect(r.criterios.find((c) => c.id === 'controles')).toMatchObject({ situacao: 'pendente', numero: '31 de 90' });
    expect(r.criterios.find((c) => c.id === 'soa')).toMatchObject({ situacao: 'pendente', numero: '2 sem justificativa' });
    expect(r.indicador).toEqual({ implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' });
  });

  it('ordem do que falta: estágio 1 antes do 2 e, dentro do estágio, o que destrava mais pendências primeiro', () => {
    const r = avaliarProntidao(vazio);
    const estagios = r.faltam.map((c) => c.estagio);
    expect([...estagios].sort()).toEqual(estagios);
    for (const e of [1, 2]) {
      const destr = r.faltam.filter((c) => c.estagio === e).map((c) => c.destrava_pendentes);
      expect([...destr].sort((a, b) => b - a)).toEqual(destr);
    }
    // O escopo destrava os riscos e a SoA: vem antes da revisão de documentos, que não destrava nada.
    const ordem = r.faltam.map((c) => c.id);
    expect(ordem.indexOf('escopo')).toBeLessThan(ordem.indexOf('objetivos'));
  });

  it('NC: sem auditoria interna não há NC a tratar (não se aplica); com NC aberta, pendente', () => {
    expect(avaliarProntidao(vazio).criterios.find((c) => c.id === 'nc_tratadas')!.situacao).toBe('nao_se_aplica');
    expect(avaliarProntidao({ ...cheio, nc_total: 3, nc_sem_acao_concluida: 1 }).criterios.find((c) => c.id === 'nc_tratadas'))
      .toMatchObject({ situacao: 'pendente', numero: '1 de 3' });
  });

  it('a visão do cliente: o que depende dele, só entre as pendências', () => {
    const r = avaliarProntidao({ ...cheio, politica_vigente: 0, evidencias_vencidas_ou_nao_conformes: 4 });
    expect(r.do_cliente.map((c) => c.id).sort()).toEqual(['evidencias_validas', 'politica']);
    expect(r.do_cliente.every((c) => !!c.cliente)).toBe(true);
  });
});

let consultor: Record<string, string>, cliente: Record<string, string>, outro: Record<string, string>;
const prontidao = async (h: Record<string, string>, projeto = 'pa') => {
  const r = await chamar(h, `/api/v1/projects/${projeto}/prontidao`);
  return { status: r.status, corpo: (await r.json()) as any };
};

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b', 'Outra consultoria', 'outra-prontidao')`),
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id, scope) VALUES ('pa', 'Exemplo A', 'ISO 27001', 'Controller', 'Active', 'org_ness', 'Plataforma SaaS'),
      ('pb', 'Exemplo B', 'ISO 27001', 'Controller', 'Active', 'org_b', NULL)`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', 'pa', 'org_ness'), ('u-b', 'cons@b.lat', 'x', 'Cons B', 'consultor', NULL, 'org_b')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pa', 'Cons', 'cons@ness.lat', 'consultor', 'C'),
      ('g2', 'pb', 'Cons B', 'cons@b.lat', 'consultor', 'C')`),
    db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description) VALUES
      ('c1', 'pa', 'ISO 27001:2022', 'A.5.1 — Políticas', 'Implemented', ''), ('c2', 'pa', 'ISO 27001:2022', 'A.5.2 — Papéis', 'Partial', ''),
      ('c3', 'pa', 'ISO 27001:2022', 'A.7.1 — Perímetros', 'Not Applicable', ''), ('c4', 'pa', 'ISO 27001:2022', 'A.8.1 — Dispositivos', 'Missing', '')`),
    db().prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, status, treatment_plan) VALUES
      ('r1', 'pa', 'ERP', 'Ransomware', 5, 4, 'Open', ''), ('r2', 'pa', 'CRM', 'Vazamento', 3, 3, 'Open', 'MFA')`),
    db().prepare(`INSERT INTO corrective_actions (id, project_id, title, status, due_date) VALUES ('a1', 'pa', 'Revisar acessos', 'Open', ?)`).bind(dias(-3)),
  ]);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', iat: Date.now() });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'pa', iat: Date.now() });
  outro = await sessionFor({ id: 'u-b', email: 'cons@b.lat', role: 'consultor', iat: Date.now() });
});

describe('GET /projects/:id/prontidao (D1 real)', () => {
  it('lê o cadastro: controles, exclusão sem justificativa, risco sem tratamento e ação vencida', async () => {
    const { status, corpo } = await prontidao(consultor);
    expect(status).toBe(200);
    const c = (id: string) => corpo.criterios.find((x: any) => x.id === id);
    expect(c('escopo').situacao).toBe('atendido');
    expect(c('controles')).toMatchObject({ situacao: 'pendente', numero: '1 de 3' });
    expect(c('soa')).toMatchObject({ situacao: 'pendente', numero: '1 sem justificativa' });
    expect(c('tratamento')).toMatchObject({ situacao: 'pendente', numero: '1 de 2 sem tratamento' });
    expect(c('acoes_vencidas')).toMatchObject({ situacao: 'pendente', numero: '1 vencida' });
    // O consultor da governança não conta como papel do SGSI do cliente.
    expect(c('papeis').situacao).toBe('pendente');
    expect(corpo.numeros).toMatchObject({ controles: { implementados: 1, aplicaveis: 3 }, riscos: 2, evidencias: 0 });
    expect(corpo.veredito.frase).toMatch(/^Faltam \d+ itens para o estágio 1\.$/);
  });

  it('risco tratado (migration 0121): estratégia "aceitar" com aceite vigente e o aceite legado contam; aceite do residual de risco a mitigar não', async () => {
    const aceite = (id: string, risco: string, situacao: string) => db().prepare(`INSERT INTO risco_aceites (id, project_id, risk_id, aceito_por, papel, aceito_em,
        nivel_residual, controles_json, conteudo_json, hash, status_anterior, situacao, encerrado_em, encerrado_por, motivo)
      VALUES (?1, 'pa', ?2, 'ceo@x.com', 'ceo', '2026-11-20T10:00:00Z', 'Low', '[]', '{}', ?3, 'Open', ?4, ?5, ?6, ?6)`)
      .bind(id, risco, 'h'.repeat(64), situacao, situacao === 'vigente' ? null : '2026-11-21T10:00:00Z', situacao === 'vigente' ? null : 'ceo@x.com');
    await db().batch([
      db().prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, status, treatment, treatment_plan) VALUES
        ('r3', 'pa', 'A', 'Aceito formalmente', 5, 4, 'High', 'Open', 'Accept', ''), ('r4', 'pa', 'B', 'Residual aceito a mitigar', 5, 4, 'High', 'Open', 'Mitigate', ''),
        ('r5', 'pa', 'C', 'Legado', 3, 3, 'Medium', 'Accepted', 'Mitigate', ''), ('r6', 'pa', 'D', 'Revogado', 3, 3, 'Medium', 'Accepted', 'Mitigate', '')`),
    ]);
    await db().batch([aceite('ra3', 'r3', 'vigente'), aceite('ra4', 'r4', 'vigente'), aceite('ra6', 'r6', 'revogado')]);
    const { corpo } = await prontidao(consultor);
    // Sem tratamento: r1 (sem plano), r4 (aceite do residual não trata quem é para mitigar) e r6 (Accepted com aceite revogado).
    expect(corpo.criterios.find((x: any) => x.id === 'tratamento')).toMatchObject({ numero: '3 de 6 sem tratamento' });
    const iso = ((await (await chamar(consultor, '/api/v1/projects/pa/painel?modulo=iso')).json()) as any).modulos.iso;
    expect(iso.cobertura.find((x: any) => x.tema === 'Riscos')).toMatchObject({ feito: 2, andamento: 1, falta: 3 });
    const altos = iso.fazer.find((x: any) => /riscos? altos? sem tratamento/.test(x.texto));
    expect(altos.contexto).toContain('Residual aceito a mitigar');
    expect(altos.contexto).not.toContain('Aceito formalmente');
  });

  it('o número de controles é o mesmo do Painel do n.iso, para os mesmos dados', async () => {
    const { corpo } = await prontidao(consultor);
    const r = await chamar(consultor, '/api/v1/projects/pa/painel?modulo=iso');
    const painel = (await r.json()) as any;
    expect(painel.modulos.iso.numeros[0]).toEqual([`${corpo.numeros.controles.implementados} de ${corpo.numeros.controles.aplicaveis}`, 'controles aplicáveis implementados']);
  });

  it('cliente recebe a visão dele; consultor de outra organização não alcança o projeto', async () => {
    const cli = await prontidao(cliente);
    expect(cli.status).toBe(200);
    expect(cli.corpo.visao).toBe('cliente');
    expect((await prontidao(consultor)).corpo.visao).toBe('equipe');
    expect((await prontidao(outro)).status).toBe(403);
  });
});

describe('POST /projects/:id/phases (começar a jornada)', () => {
  it('a equipe carrega as fases do projeto sem jornada; repetir não duplica; cliente não carrega', async () => {
    const post = (h: Record<string, string>) => app.fetch(new Request('http://localhost/api/v1/projects/pa/phases', { method: 'POST', headers: h }), workerEnv() as any);
    expect((await post(cliente)).status).toBe(403);
    const r = await post(consultor);
    expect(r.status).toBe(201);
    const n = (await db().prepare('SELECT count(*) AS n FROM project_phases WHERE project_id = ?').bind('pa').first<{ n: number }>())!.n;
    expect(n).toBeGreaterThan(0);
    expect((await post(consultor)).status).toBe(409);
    expect((await db().prepare('SELECT count(*) AS n FROM project_phases WHERE project_id = ?').bind('pa').first<{ n: number }>())!.n).toBe(n);
  });
});
