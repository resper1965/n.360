import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { saudeDoProjeto, estadoDoPrograma, situacaoNaCarteira, type ItemFazer } from '../src/services/painel';

/**
 * Painel de entrada (estudo de 14/10/2026, direção A): a frase e o estado como funções puras, e a rota contra o D1 real
 * (cobertura por status, vencimentos no limite de 90 dias, visão por papel, isolamento entre projetos e organizações, módulo).
 */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const item = (grupo: ItemFazer['grupo'], texto: string, modulo: ItemFazer['modulo'] = 'privacy'): ItemFazer => ({ grupo, texto, quando: '', contexto: '', acao: 'Abrir', tela: 'x', modulo });

type Tema = { tema: string; feito: number; andamento: number; falta: number };
type Painel = {
  visao: string; empresa: { razao_social: string | null } | null; programa: { estado: string; rotulo: string }; saude: { tom: string; rotulo: string; frase: string };
  encarregados: { nome: string }[]; decisoes?: { titulo: string; acao: string }[]; selos?: Record<string, unknown>;
  modulos: Record<string, { saude: { tom: string }; numeros: [string, string][]; comecando: boolean; fazer?: { grupo: string; texto: string; acao: string; contexto: string; quando: string }[];
    cobertura?: Tema[]; vencimentos?: { tipo: string; vencidos: number; itens: { dias: number; rotulo: string }[] }[]; riscos?: { p: number; i: number; n: number }[]; pedidos_semana?: number[] }>;
};

describe('frase de saúde (função pura)', () => {
  it('atrasado nomeia o mais grave; atenção, o primeiro da semana; em dia diz o próximo prazo', () => {
    const atrasado = saudeDoProjeto({ itens: [item('atraso', '2 pedidos do titular atrasados'), item('semana', 'x'), item('plano', 'y')], comecando: false });
    expect(atrasado).toMatchObject({ tom: 'atraso', rotulo: 'Atrasado', frase: '2 pedidos do titular atrasados.' });
    expect(atrasado.apoio).toContain('1 assunto com prazo vencido');
    expect(saudeDoProjeto({ itens: [item('semana', 'auditoria em 3 dias')], comecando: false })).toMatchObject({ tom: 'semana', rotulo: 'Atenção', frase: 'Auditoria em 3 dias.' });
    const ok = saudeDoProjeto({ itens: [item('plano', 'z')], comecando: false, proximo: { dias: 12, rotulo: 'PT-1', tipo: 'Pedidos do titular' } });
    expect(ok).toMatchObject({ tom: 'ok', rotulo: 'Em dia' });
    expect(ok.apoio).toContain('PT-1 (pedidos do titular), em 12 dias');
  });
  it('cliente num projeto começando: a frase não promete passos que a visão dele não mostra', () => {
    const s = saudeDoProjeto({ itens: [], comecando: true, cliente: true, decisoes: 0 });
    expect(s.rotulo).toBe('Começando');
    expect(s.apoio).not.toContain('passos');
    expect(s.apoio).toContain('consultoria');
    expect(saudeDoProjeto({ itens: [], comecando: true }).apoio).toContain('Os primeiros passos estão abaixo');
  });
  it('projeto vazio NUNCA está em dia, nem com a lista vazia', () => {
    expect(saudeDoProjeto({ itens: [], comecando: true })).toMatchObject({ tom: 'plano', rotulo: 'Começando' });
    expect(saudeDoProjeto({ itens: [], comecando: true }).rotulo).not.toBe('Em dia');
  });
  it('"Sua vez" só para o cliente com pedido; com os dois módulos, a frase diz de qual é o item', () => {
    expect(saudeDoProjeto({ itens: [item('atraso', 'a')], comecando: false, cliente: true, decisoes: 3 })).toMatchObject({ tom: 'vez', frase: '3 pedidos esperam a sua decisão.' });
    expect(saudeDoProjeto({ itens: [item('atraso', 'a')], comecando: false, cliente: false, decisoes: 3 }).tom).toBe('atraso');
    expect(saudeDoProjeto({ itens: [item('atraso', '4 ações corretivas passaram do prazo', 'iso'), item('plano', 'b', 'privacy')], comecando: false }).frase)
      .toBe('4 ações corretivas passaram do prazo no n.iso.');
  });
});

describe('estado do programa e situação na carteira (funções puras)', () => {
  it('operação desde o mês da primeira aprovação; implantação com cadastro; começando sem', () => {
    expect(estadoDoPrograma('2026-03-17T10:00:00Z', true)).toEqual({ estado: 'operacao', desde: '2026-03', rotulo: 'Em operação desde março de 2026' });
    expect(estadoDoPrograma(null, true).rotulo).toBe('Em implantação');
    expect(estadoDoPrograma(null, false).rotulo).toBe('Começando');
  });
  it('prazo legal vencido vem antes de tudo; sem cadastro é começando; o resto, em dia com o próximo prazo', () => {
    const base = { modulos: ['iso', 'privacy'] as ('iso' | 'privacy')[], pedidos_atrasados: 0, comunicacoes_atrasadas: 0, acoes_vencidas: 0, terceiros_vencidos: 0, vence_7_dias: 0, tratamentos: 1, controles: 0, proximo: null };
    expect(situacaoNaCarteira({ ...base, pedidos_atrasados: 2, acoes_vencidas: 1 })).toMatchObject({ tom: 'atraso', situacao: '2 prazos legais vencidos', modulo: 'privacy' });
    expect(situacaoNaCarteira({ ...base, modulos: ['iso'], pedidos_atrasados: 2 }).tom).not.toBe('atraso');
    expect(situacaoNaCarteira({ ...base, tratamentos: 0 })).toMatchObject({ tom: 'plano', situacao: 'Começando' });
    expect(situacaoNaCarteira({ ...base, proximo: { data: '2026-11-03', rotulo: 'Pedido PT-9' } })).toMatchObject({ tom: 'ok', urgente: 'Próximo: Pedido PT-9 em 03/11' });
  });
});

let consultor: Record<string, string>, cliente: Record<string, string>, consultorB: Record<string, string>, semPrivacy: Record<string, string>;
const painel = async (h: Record<string, string>, projeto: string, modulo?: string) => {
  const r = await chamar(h, `/api/v1/projects/${projeto}/painel${modulo ? `?modulo=${modulo}` : ''}`);
  return { status: r.status, corpo: (await r.json()) as Painel };
};

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO organizations (id, name, slug) VALUES ('org_b', 'Outra consultoria', 'outra-painel')`),
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pa', 'Exemplo A', 'ISO 27001', 'Controller', 'Active', 'org_ness'),
      ('pv', 'Vazio', 'ISO 27001', 'Controller', 'Active', 'org_ness'), ('pb', 'Exemplo B', 'ISO 27001', 'Controller', 'Active', 'org_b')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', 'pa', 'org_ness'), ('u-b', 'cons@b.lat', 'x', 'Cons B', 'consultor', NULL, 'org_b'),
      ('u-iso', 'iso@ness.lat', 'x', 'Só ISO', 'consultor', NULL, 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pa', 'Cons', 'cons@ness.lat', 'consultor', 'C'),
      ('g2', 'pv', 'Cons', 'cons@ness.lat', 'consultor', 'C'), ('g3', 'pb', 'Cons B', 'cons@b.lat', 'consultor', 'C'), ('g4', 'pa', 'Só ISO', 'iso@ness.lat', 'consultor', 'C')`),
  ]);
  await habilitarPrivacy('pa', 'pv', 'pb');
  await concederModulos(['u-cons', 'u-cli', 'u-b']);
  await concederModulos('u-iso', ['iso']);
  await db().prepare(`DELETE FROM usuario_modulos WHERE user_id = 'u-iso' AND modulo = 'privacy'`).run();
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor', org_id: 'org_ness' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'pa', org_id: 'org_ness' });
  consultorB = await sessionFor({ id: 'u-b', email: 'cons@b.lat', role: 'consultor', org_id: 'org_b' });
  semPrivacy = await sessionFor({ id: 'u-iso', email: 'iso@ness.lat', role: 'consultor', org_id: 'org_ness' });
});

async function semear() {
  await db().batch([
    db().prepare(`INSERT INTO parametros_legais (chave, valor, unidade, fonte, revisado_em, revisado_por) VALUES ('titular.resposta', 15, 'dias_corridos', 'F', '2026-10-01', 'X'),
      ('incidente.comunicacao_anpd', 72, 'horas', 'F', '2026-10-01', 'X'), ('incidente.comunicacao_titular', 72, 'horas', 'F', '2026-10-01', 'X')`),
    db().prepare(`INSERT INTO empresas (project_id, razao_social, nome_fantasia, cnpj, setor) VALUES ('pa', 'Exemplo Logística S.A.', 'Exemplo Log', '12345678000190', 'Transporte')`),
    // atividades: uma aprovada, uma ativa com base, uma em rascunho; uma exige RIPD (sem RIPD)
    db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, dpia_required, status, ciso_approved_at) VALUES
      ('r1', 'pa', 'Folha', 'Obrigação legal', 0, 'Approved', '2026-03-10T10:00:00Z'), ('r2', 'pa', 'Câmeras', 'Legítimo interesse', 1, 'Active', NULL),
      ('r3', 'pa', 'Rascunho', NULL, 0, 'Draft', NULL), ('rb', 'pb', 'Atividade B zzb', 'Contrato', 0, 'Approved', NULL)`),
    db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES
      ('t1', 'pa', 'PT-1', 'acesso', ?1, ?2, 'recebido'), ('t2', 'pa', 'PT-2', 'acesso', ?1, ?3, 'em_andamento'), ('t3', 'pa', 'PT-3', 'acesso', ?1, ?4, 'recebido'),
      ('t4', 'pa', 'PT-4', 'acesso', ?1, ?5, 'recebido'), ('tb', 'pb', 'PT-B', 'acesso', ?1, ?2, 'recebido')`)
      .bind(dias(-20), dias(-2), dias(0), dias(90), dias(91)),
    db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate, evaluation_status) VALUES
      ('e1', 'pa', 'ok.pdf', 'k', 'h', 'u', NULL, 'conforming'), ('e2', 'pa', 'pend.pdf', 'k', 'h', 'u', NULL, 'pending'), ('e3', 'pa', 'venc.pdf', 'k', 'h', 'u', ?1, 'conforming')`).bind(dias(-1)),
    db().prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, ropa_id) VALUES ('rk1', 'pa', 'a', 'Vazamento', 5, 4, 'High', 'r2'), ('rk2', 'pa', 'a', 'TMS fora', 4, 4, 'High', NULL)`),
    db().prepare(`INSERT INTO corrective_actions (id, project_id, title, due_date, status, ropa_id) VALUES ('c1', 'pa', 'Revisão de acessos', ?1, 'Open', NULL),
      ('c2', 'pa', 'Backup', ?2, 'Open', NULL), ('c3', 'pa', 'Reduzir retenção', ?3, 'Open', 'r2')`).bind(dias(-10), dias(30), dias(15)),
    db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('k1', 'pa', 'ISO 27001:2022', 'A.5.1 Políticas', 'Completed'),
      ('k2', 'pa', 'ISO 27001:2022', 'A.5.2 Papéis', 'In Progress'), ('k3', 'pa', 'ISO 27001:2022', 'A.8.1 Dispositivos', 'Missing'), ('k4', 'pa', 'ISO 27001:2022', 'A.7.5 Ameaças', 'Not Applicable')`),
    db().prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por) VALUES
      ('pd1', 'org_ness', 'pa', 'tratamento', 'r1', 'Aprovar "Folha"', 'ciso', '{}', 'h', 'cons@ness.lat')`),
    db().prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, user_id) VALUES ('d1', 'pd1', 'cli@cliente.com', 'u-cli')`),
  ]);
}

describe('GET /projects/:id/painel', () => {
  it('n.privacy: empresa, estado do programa, frase e "O que fazer" com o mais grave primeiro', async () => {
    await semear();
    const { status, corpo } = await painel(consultor, 'pa', 'privacy');
    expect(status).toBe(200);
    expect(corpo.visao).toBe('equipe');
    expect(corpo.empresa?.razao_social).toBe('Exemplo Logística S.A.');
    expect(corpo.programa).toMatchObject({ estado: 'operacao', rotulo: 'Em operação desde março de 2026' });
    expect(Object.keys(corpo.modulos)).toEqual(['privacy']);
    const m = corpo.modulos.privacy;
    expect(m.fazer![0]).toMatchObject({ grupo: 'atraso', texto: '1 pedido do titular atrasado', acao: 'Responder os pedidos', contexto: 'PT-1 (acesso)', tela: 'titular', aba: 'pedidos', filtro: 'atrasados' });
    // A lista de destino abre filtrada pela situação do item (chave fechada, nunca dado).
    expect(m.fazer!.find((i) => i.texto.includes('evidência vencida'))).toMatchObject({ tela: 'evidence', filtro: 'vencidas' });
    expect(m.fazer!.map((i) => i.grupo)).toEqual([...m.fazer!.map((i) => i.grupo)].sort((a, b) => ['atraso', 'semana', 'plano'].indexOf(a) - ['atraso', 'semana', 'plano'].indexOf(b)));
    expect(corpo.saude).toMatchObject({ tom: 'atraso', rotulo: 'Atrasado', frase: '1 pedido do titular atrasado.' });
    // a lista e a frase saem da mesma conta: o primeiro item é o que a frase nomeia
    expect(corpo.saude.frase.startsWith(m.fazer![0].texto)).toBe(true);
    expect(corpo.selos).toHaveProperty('pedidos_titular');
  });

  it('cobertura por status e vencimentos no limite de 90 dias (o dia 90 entra, o 91 não; o vencido vira contagem)', async () => {
    await semear();
    const m = (await painel(consultor, 'pa', 'privacy')).corpo.modulos.privacy;
    const t = (nome: string) => m.cobertura!.find((x) => x.tema === nome);
    expect(t('Atividades (RoPA)')).toMatchObject({ feito: 1, andamento: 1, falta: 1 });
    expect(t('RIPD exigidos')).toMatchObject({ feito: 0, andamento: 0, falta: 1 });
    expect(t('LIA exigidas')).toMatchObject({ feito: 0, andamento: 0, falta: 1 });
    expect(t('Evidências')).toMatchObject({ feito: 1, andamento: 1, falta: 1 });
    expect(t('Ciclo de vida documentado')).toMatchObject({ feito: 0, andamento: 0, falta: 3 });
    expect(t('Pedidos do titular (90 dias)')).toMatchObject({ feito: 0, andamento: 3, falta: 1 });
    const pedidos = m.vencimentos!.find((l) => l.tipo === 'Pedidos do titular')!;
    expect(pedidos.vencidos).toBe(1);
    expect(pedidos.itens.map((i) => [i.rotulo, i.dias])).toEqual([['PT-2', 0], ['PT-3', 90]]);
    expect(m.vencimentos!.find((l) => l.tipo === 'Evidências')!.vencidos).toBe(1);
    // ações das atividades: das faixas de prazo que a visão do encarregado já monta
    expect(m.vencimentos!.find((l) => l.tipo === 'Ações das atividades')).toEqual({ tipo: 'Ações das atividades', vencidos: 0, itens: [{ dias: 15, rotulo: 'Reduzir retenção' }] });
    expect(m.riscos).toEqual([{ p: 4, i: 5, n: 1 }]);
    expect(m.pedidos_semana).toHaveLength(12);
    expect(m.pedidos_semana!.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('n.iso: cobertura do Anexo A por tema (sem os não aplicáveis), ações vencidas e o mapa só dos riscos do n.iso', async () => {
    await semear();
    const { corpo } = await painel(consultor, 'pa', 'iso');
    const m = corpo.modulos.iso;
    expect(m.cobertura!.find((x) => x.tema === 'Controles organizacionais')).toMatchObject({ feito: 1, andamento: 1, falta: 0 });
    expect(m.cobertura!.find((x) => x.tema === 'Controles físicos')).toMatchObject({ feito: 0, andamento: 0, falta: 0 });
    expect(m.cobertura!.find((x) => x.tema === 'Controles tecnológicos')).toMatchObject({ falta: 1 });
    expect(m.fazer![0]).toMatchObject({ grupo: 'atraso', texto: '1 ação corretiva passou do prazo', contexto: 'A mais antiga: Revisão de acessos', tela: 'capa', filtro: 'vencidas' });
    expect(m.fazer!.find((i) => i.tela === 'evidence')).toMatchObject({ filtro: 'vencidas_ou_nao_conformes' });
    expect(m.fazer!.map((i) => i.texto)).toContain('1 exclusão da SoA sem justificativa');
    expect(m.fazer!.map((i) => i.texto)).toContain('1 risco alto sem tratamento definido');
    expect(m.riscos).toEqual([{ p: 4, i: 4, n: 1 }]);
    expect(m.numeros[0]).toEqual(['1 de 3', 'controles implementados']);
  });

  it('n.360 (sem ?modulo): os dois módulos; a lista junta os dois em ordem de prazo', async () => {
    await semear();
    const { corpo } = await painel(consultor, 'pa');
    expect(Object.keys(corpo.modulos).sort()).toEqual(['iso', 'privacy']);
    expect(corpo.saude.tom).toBe('atraso');
  });

  it('projeto vazio: "Começando", nunca "Em dia", e os primeiros passos', async () => {
    const { corpo } = await painel(consultor, 'pv', 'privacy');
    expect(corpo.saude.rotulo).toBe('Começando');
    expect(corpo.programa.rotulo).toBe('Começando');
    expect(corpo.modulos.privacy.comecando).toBe(true);
    const iso = (await painel(consultor, 'pv', 'iso')).corpo;
    expect(iso.saude.rotulo).toBe('Começando');
  });

  it('cliente: "Sua vez" e o que espera a decisão dele; sem lista, cobertura, mapa nem vencimentos', async () => {
    await semear();
    const { status, corpo } = await painel(cliente, 'pa', 'privacy');
    expect(status).toBe(200);
    expect(corpo.visao).toBe('cliente');
    expect(corpo.saude).toMatchObject({ tom: 'vez', rotulo: 'Sua vez' });
    expect(corpo.decisoes).toEqual([expect.objectContaining({ titulo: 'Aprovar "Folha"', acao: 'Ler e aprovar' })]);
    const m = corpo.modulos.privacy;
    for (const k of ['fazer', 'cobertura', 'riscos', 'vencimentos', 'pedidos_semana']) expect(m, k).not.toHaveProperty(k);
    expect(corpo.modulos.privacy.numeros).toHaveLength(3);
  });

  it('cliente no n.iso: o próximo marco da jornada (a primeira fase não concluída), sem a lista da consultoria', async () => {
    await semear();
    await db().prepare(`INSERT INTO project_phases (id, project_id, phase_number, title, status) VALUES
      ('f0', 'pa', 0, 'Mobilização', 'completed'), ('f1', 'pa', 1, 'Entrevista Executiva', 'skipped'), ('f2', 'pa', 2, 'Entrevistas por Trilha', 'in_progress'),
      ('f3', 'pa', 3, 'Diagnóstico', 'pending'), ('fb', 'pb', 0, 'Fase zzb', 'in_progress')`).run();
    const iso = (await painel(cliente, 'pa', 'iso')).corpo.modulos.iso as Painel['modulos'][string] & { jornada?: unknown };
    expect(iso.jornada).toEqual({ atual: { numero: 3, titulo: 'Entrevistas por Trilha', status: 'in_progress' }, concluidas: 2, total: 4 });
    expect(iso).not.toHaveProperty('fazer');
    // a equipe não recebe o bloco (ela tem a lista inteira), e o n.privacy não tem jornada
    expect((await painel(consultor, 'pa', 'iso')).corpo.modulos.iso).not.toHaveProperty('jornada');
    expect((await painel(cliente, 'pa', 'privacy')).corpo.modulos.privacy).not.toHaveProperty('jornada');
  });

  it('módulo: projeto sem o módulo = 403; pessoa sem o módulo = 403; módulo inventado = 400', async () => {
    await db().prepare(`DELETE FROM projeto_modulos WHERE project_id = 'pv' AND modulo = 'privacy'`).run();
    expect((await painel(consultor, 'pv', 'privacy')).status).toBe(403);
    expect((await painel(semPrivacy, 'pa', 'privacy')).status).toBe(403);
    // sem ?modulo, quem só tem o n.iso recebe só o n.iso
    expect(Object.keys((await painel(semPrivacy, 'pa')).corpo.modulos)).toEqual(['iso']);
    expect((await chamar(consultor, '/api/v1/projects/pa/painel?modulo=x')).status).toBe(400);
  });

  it('isolamento: nenhum número de outro projeto nem de outra organização', async () => {
    await semear();
    const texto = JSON.stringify((await painel(consultor, 'pa')).corpo);
    expect(texto).not.toContain('zzb');
    expect(texto).not.toContain('PT-B');
    // o projeto da outra organização é recusado nos dois sentidos
    expect((await painel(consultor, 'pb')).status).toBe(403);
    expect((await painel(consultorB, 'pa')).status).toBe(403);
    const b = (await painel(consultorB, 'pb', 'privacy')).corpo;
    expect(JSON.stringify(b)).not.toContain('PT-1');
    expect(b.modulos.privacy.cobertura!.find((x) => x.tema === 'Atividades (RoPA)')).toMatchObject({ feito: 1, andamento: 0, falta: 0 });
  });
});

describe('GET /api/v1/carteira', () => {
  it('só os projetos que a pessoa alcança, do mais urgente ao em dia, sem a outra organização', async () => {
    await semear();
    const r = await chamar(consultor, '/api/v1/carteira');
    expect(r.status).toBe(200);
    const { projetos } = (await r.json()) as { projetos: { id: string; tom: string; situacao: string; modulos: string[]; modulo_urgente: string }[] };
    expect(projetos.map((p) => p.id)).toEqual(['pa', 'pv']);
    expect(projetos[0]).toMatchObject({ tom: 'atraso', situacao: '1 prazo legal vencido', modulo_urgente: 'privacy', modulos: ['iso', 'privacy'] });
    expect(projetos[1]).toMatchObject({ tom: 'plano', situacao: 'Começando' });
    const b = (await (await chamar(consultorB, '/api/v1/carteira')).json()) as { projetos: { id: string }[] };
    expect(b.projetos.map((p) => p.id)).toEqual(['pb']);
  });
  it('o cliente vê só o projeto dele; quem só tem o n.iso não conta prazo do n.privacy', async () => {
    await semear();
    const c = (await (await chamar(cliente, '/api/v1/carteira')).json()) as { projetos: { id: string }[] };
    expect(c.projetos.map((p) => p.id)).toEqual(['pa']);
    const s = (await (await chamar(semPrivacy, '/api/v1/carteira')).json()) as { projetos: { id: string; modulos: string[]; situacao: string }[] };
    expect(s.projetos).toEqual([expect.objectContaining({ id: 'pa', modulos: ['iso'], situacao: '1 prazo vencido' })]);
  });
});

describe('desempenho', () => {
  it('500 atividades: p95 do painel abaixo de 300 ms no D1 de teste', async () => {
    const stmts = [];
    for (let i = 0; i < 500; i++) {
      stmts.push(db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, dpia_required, status) VALUES (?, 'pa', ?, ?, ?, ?)`)
        .bind(`ger-${i}`, `Atividade gerada ${i}`, i % 3 ? 'Contrato' : 'Legítimo interesse', i % 5 === 0 ? 1 : 0, i % 4 ? 'Active' : 'Approved'));
      if (i % 5 === 0) stmts.push(db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES (?, 'pa', ?, 'acesso', ?, ?, 'recebido')`)
        .bind(`gp-${i}`, `PT-G${i}`, dias(-(i % 80)), dias(15 - (i % 30))));
      if (i % 10 === 0) stmts.push(db().prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, ropa_id) VALUES (?, 'pa', 'a', 't', ?, ?, ?)`)
        .bind(`gr-${i}`, 1 + (i % 5), 1 + ((i / 10) % 5), `ger-${i}`));
    }
    for (let i = 0; i < stmts.length; i += 100) await db().batch(stmts.slice(i, i + 100));
    await painel(consultor, 'pa'); // aquece
    const tempos: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const { status } = await painel(consultor, 'pa');
      tempos.push(performance.now() - t0);
      expect(status).toBe(200);
    }
    tempos.sort((a, b) => a - b);
    const p95 = tempos[Math.ceil(tempos.length * 0.95) - 1];
    expect(p95).toBeLessThan(300);
  }, 60_000);
});
