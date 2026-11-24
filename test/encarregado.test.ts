import { describe, it, expect, beforeEach } from 'vitest';
import { diaMaisSP } from '../src/services/hoje';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

/** Fatia 8: a visão do encarregado é só consulta. Funciona com tudo vazio e não mistura projetos. */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const dias = (n: number) => diaMaisSP(n);

type Visao = {
  prioridades: { nivel: string; texto: string; tela: string }[];
  pedidos_titular: { abertos: number; atrasados: number; vencem_em_7_dias: number; exigem_atencao: number; sem_prazo: number; itens: { protocolo: string }[] };
  incidentes: { abertos: number; comunicacoes_atrasadas: number; comunicacoes_pendentes: number; sem_avaliacao_de_risco: number };
  tratamentos: { total: number; sem_base_legal: number; dpia_pendente: number; lia_pendente: number; sem_responsavel: number; com_terceiro_vencido: number };
  terceiros: { total: number; sem_tipo: number; pendentes: number; vencidos: number; reprovados: number; com_pendencia: number };
  documentos: { revisao_vencida: number };
  evidencias: { a_corrigir: number; vencem_em_7_dias: number };
  lgpd: { carregada: boolean; total?: number; cobertos?: number; parciais?: number; lacunas?: number };
  prazos_legais: { nao_definidos: string[] };
  canal: { meios: string[]; portal_ativo: boolean; divulgado: boolean; conferido_em: string | null };
};
let consultor: Record<string, string>, cliente: Record<string, string>;
const ver = async (h = consultor, projeto = 'e1') => json<Visao>(await chamar(h, `/api/v1/projects/${projeto}/encarregado`));

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('e1', 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), ('e2', 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', 'e1', 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('ge1', 'e1', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
  ]);
  await habilitarPrivacy('e1', 'e2');
  // o cliente já existia: recebe o n.privacy como ao ligar o módulo pela tela (rota coberta em modulos-por-pessoa)
  await concederModulos('u-cli', ['privacy']);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: 'e1' });
});

describe('projeto vazio', () => {
  it('tudo zerado, LGPD "não carregada", e as prioridades dizem o que falta: encarregado, RoPA, catálogo e prazos legais', async () => {
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ abertos: 0, atrasados: 0, vencem_em_7_dias: 0, exigem_atencao: 0, sem_prazo: 0, itens: [] });
    expect(v.incidentes).toMatchObject({ abertos: 0, comunicacoes_atrasadas: 0, comunicacoes_pendentes: 0 });
    expect(v.tratamentos).toEqual({ total: 0, sem_base_legal: 0, dpia_pendente: 0, lia_pendente: 0, sem_responsavel: 0, com_terceiro_vencido: 0 });
    expect(v.terceiros).toMatchObject({ total: 0, vencidos: 0, com_pendencia: 0 });
    expect(v.evidencias).toEqual({ a_corrigir: 0, vencem_em_7_dias: 0 });
    expect(v.lgpd).toEqual({ carregada: false });
    expect(v.prazos_legais.nao_definidos).toEqual(['titular.resposta', 'incidente.comunicacao_anpd', 'incidente.comunicacao_titular']);
    // projeto vazio NÃO é projeto em dia: RoPA vazio e catálogo ausente viram prioridade, com a tela de destino
    expect(v.prioridades.map((p) => `${p.nivel}: ${p.texto} -> ${p.tela}`)).toEqual([
      'alta: Nenhum encarregado indicado (LGPD, art. 41) -> encarregado',
      'alta: Canal do titular não registrado -> titular',
      'alta: Nenhum tratamento no RoPA (LGPD, art. 37) -> ropa',
      'media: Catálogo de requisitos LGPD não carregado -> requisitos',
      'media: 3 prazos legais ainda não cadastrados (os prazos ficam "não calculados") -> titular',
    ]);
  });
  it('o cliente lê a visão; projeto inexistente não devolve dado', async () => {
    expect((await chamar(cliente, '/api/v1/projects/e1/encarregado')).status).toBe(200);
    expect((await chamar(cliente, '/api/v1/projects/e2/encarregado')).status).toBe(403);
  });
  it('catálogo LGPD não carregado é assunto da ness.: o cliente não vê essa prioridade (o resto, sim)', async () => {
    const textos = (await ver(cliente)).prioridades.map((p) => p.texto);
    expect(textos).not.toContain('Catálogo de requisitos LGPD não carregado');
    expect(textos).toContain('Nenhum encarregado indicado (LGPD, art. 41)');
    expect((await ver()).prioridades.map((p) => p.texto)).toContain('Catálogo de requisitos LGPD não carregado');
  });
});

describe('projeto com pendências', () => {
  it('conta e prioriza: pedidos atrasados, incidentes, tratamentos, terceiros, evidências e documentos', async () => {
    await db().batch([
      db().prepare(`INSERT INTO parametros_legais (chave, valor, unidade, fonte, revisado_em, revisado_por) VALUES ('titular.resposta', 15, 'dias_corridos', 'F', '2026-10-01', 'X'), ('incidente.comunicacao_anpd', 72, 'horas', 'F', '2026-10-01', 'X'), ('incidente.comunicacao_titular', 72, 'horas', 'F', '2026-10-01', 'X')`),
      // pedidos: um atrasado, um que vence em 3 dias, um sem prazo, um respondido (não conta)
      db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status, respondido_em) VALUES
        ('a1', 'e1', 'PT-1', 'acesso', '2026-09-01', ?1, 'recebido', NULL), ('a2', 'e1', 'PT-2', 'acesso', '2026-09-20', ?2, 'em_andamento', NULL),
        ('a3', 'e1', 'PT-3', 'acesso', '2026-09-20', NULL, 'recebido', NULL), ('a4', 'e1', 'PT-4', 'acesso', '2026-09-01', ?1, 'respondido', '2026-09-05')`).bind(dias(-5), dias(3)),
      // incidentes: um com comunicações atrasadas, um sem avaliação
      db().prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, prazo_anpd_em, prazo_titular_em, status, risco_titular) VALUES
        ('i1', 'e1', 'IN-1', 'Atrasado', '2026-09-01', ?1, ?1, 'avaliado', 'relevante'), ('i2', 'e1', 'IN-2', 'Sem risco avaliado', '2026-10-01', NULL, NULL, 'aberto', NULL),
        ('i3', 'e1', 'IN-3', 'Risco baixo: comunicação não exigida', '2026-09-01', ?1, ?1, 'avaliado', 'baixo')`).bind(dias(-2)),
      // tratamentos: sem base, com DPIA exigida sem DPIA, legítimo interesse sem LIA, sem responsável
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, dpia_required, owner) VALUES
        ('t1', 'e1', 'Sem base', NULL, 0, 'DPO'), ('t2', 'e1', 'DPIA', 'Execução de contrato', 1, 'DPO'), ('t3', 'e1', 'Fraude', 'Legítimo interesse', 0, 'DPO')`),
      // terceiros: um vencido, um nunca avaliado, ligado a t1
      db().prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('p1', 'e1', 'organizacao', 'Vencido', 'medio'), ('p2', 'e1', 'organizacao', 'Nunca', 'medio'), ('p3', 'e1', 'organizacao', 'Sem tipo', NULL)`),
      db().prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES ('av1', 'e1', 'p1', 'questionario', 'aprovado', '2020-01-01')`),
      db().prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'e1', 'p1', 'operador', 'tratamento', 't1')`),
      // evidências e documento
      db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES ('ev1', 'e1', 'a.pdf', 'k', 'h', 'u', ?1), ('ev2', 'e1', 'b.pdf', 'k', 'h', 'u', ?2)`).bind(dias(-1), dias(4)),
      db().prepare(`INSERT INTO documentos (id, project_id, titulo, status, revisar_ate) VALUES ('d1', 'e1', 'Política', 'vigente', ?1)`).bind(dias(-10)),
    ]);
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ abertos: 3, atrasados: 1, vencem_em_7_dias: 1, exigem_atencao: 2, sem_prazo: 1 });
    expect(v.pedidos_titular.itens.map((i) => i.protocolo).sort()).toEqual(['PT-1', 'PT-2', 'PT-3']);
    expect(v.incidentes).toMatchObject({ abertos: 3, comunicacoes_atrasadas: 2, comunicacoes_pendentes: 4, sem_avaliacao_de_risco: 1 });
    expect(v.tratamentos).toEqual({ total: 3, sem_base_legal: 1, dpia_pendente: 1, lia_pendente: 1, sem_responsavel: 0, com_terceiro_vencido: 1 });
    expect(v.terceiros).toEqual({ total: 3, sem_tipo: 1, pendentes: 1, vencidos: 1, reprovados: 0, com_pendencia: 3 });
    expect(v.evidencias).toEqual({ a_corrigir: 1, vencem_em_7_dias: 1 });
    expect(v.documentos.revisao_vencida).toBe(1);
    expect(v.prazos_legais.nao_definidos).toEqual([]);
    const textos = v.prioridades.map((p) => `${p.nivel}: ${p.texto}`);
    expect(textos).toContain('alta: 1 pedido do titular atrasado');
    expect(textos).toContain('alta: 2 comunicações de incidente atrasadas');
    expect(textos).toContain('alta: 1 incidente sem avaliação de risco');
    expect(textos).toContain('alta: 1 fornecedor com avaliação vencida');
    expect(textos).toContain('alta: 1 tratamento exige DPIA e não tem');
    expect(textos).toContain('alta: 1 tratamento por legítimo interesse sem LIA');
    expect(textos).toContain('media: 1 pedido do titular vence em até 7 dias');
    expect(textos).toContain('media: 1 evidência vencida ou não conforme');
    expect(textos).toContain('media: 1 documento com revisão vencida');
    expect(textos).toContain('media: 1 fornecedor nunca avaliado ou a reavaliar');
    expect(textos).toContain('media: 1 tratamento sem base legal');
    // a alta vem antes da média
    expect(v.prioridades.findIndex((p) => p.nivel === 'media')).toBeGreaterThan(v.prioridades.map((p) => p.nivel).lastIndexOf('alta') - 1);
  });

  it('a DPIA ligada e a LIA feita tiram as pendências; a base legal do catálogo conta como base', async () => {
    await db().batch([
      db().prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
      db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:ix', 'lgpd', 'art. 7, IX', 'Legítimo interesse')`),
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, base_legal_id, dpia_required, owner) VALUES ('t1', 'e1', 'Tudo certo', NULL, 'lgpd:ix', 1, 'DPO')`),
      db().prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name) VALUES ('dp1', 'e1', 't1', 'DPIA')`),
      db().prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id) VALUES ('l1', 'e1', 't1')`),
    ]);
    const v = await ver();
    expect(v.tratamentos).toMatchObject({ total: 1, sem_base_legal: 0, dpia_pendente: 0, lia_pendente: 0 });
    expect(v.lgpd).toMatchObject({ carregada: true, total: 1, lacunas: 1 }); // o catálogo da LGPD existe e o artigo ainda não tem cobertura
    // com tratamento e catálogo, as duas prioridades de projeto vazio somem
    expect(v.prioridades.map((p) => p.texto)).not.toContain('Nenhum tratamento no RoPA (LGPD, art. 37)');
    expect(v.prioridades.map((p) => p.texto)).not.toContain('Catálogo de requisitos LGPD não carregado');
  });

  it('riscos altos abertos e ações vencidas das atividades (F2); risco só do n.iso e ação concluída não contam', async () => {
    await db().batch([
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, legal_basis, owner) VALUES ('t1', 'e1', 'Folha', 'Obrigação legal', 'DPO'), ('t9', 'e2', 'Do outro', 'Obrigação legal', 'DPO')`),
      db().prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, impact, probability, risk_level, status) VALUES
        ('k1', 'e1', 't1', 'ERP', 'Alto aberto', 4, 4, 'High', 'Open'), ('k2', 'e1', 't1', 'ERP', 'Crítico', 5, 5, 'Critical', 'Open'),
        ('k3', 'e1', 't1', 'ERP', 'Alto aceito', 4, 4, 'High', 'Accepted'), ('k4', 'e1', 't1', 'ERP', 'Baixo', 1, 1, 'Low', 'Open'),
        ('k5', 'e1', NULL, 'Servidor', 'Só ISO', 5, 5, 'Critical', 'Open'), ('k6', 'e2', 't9', 'ERP', 'Do outro', 5, 5, 'Critical', 'Open')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, ropa_id, title, due_date, status) VALUES
        ('c1', 'e1', 't1', 'Vencida', ?1, 'Open'), ('c2', 'e1', 't1', 'Concluída', ?1, 'Closed'), ('c3', 'e1', 't1', 'No prazo', ?2, 'Open'),
        ('c4', 'e1', NULL, 'Só ISO', ?1, 'Open'), ('c5', 'e2', 't9', 'Do outro', ?1, 'Open')`).bind(dias(-3), dias(10)),
    ]);
    const v = await ver() as Visao & { riscos: { altos: number; acoes_vencidas: number } };
    expect(v.riscos).toEqual({ altos: 2, acoes_vencidas: 1 });
    const prios = v.prioridades.map((p) => `${p.nivel}: ${p.texto} -> ${p.tela}`);
    expect(prios).toContain('alta: 2 riscos altos ou críticos em aberto nas atividades -> mapa-de-risco');
    expect(prios).toContain('alta: 1 ação de atividade com prazo vencido -> ropa');
  });

  it('faixas de prazo das ações abertas das atividades (F4), com a lista de cada faixa; CAPA só do n.iso, concluída e de outro projeto fora', async () => {
    await db().batch([
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('t1', 'e1', 'Folha'), ('t9', 'e2', 'Do outro')`),
      db().prepare(`INSERT INTO corrective_actions (id, project_id, ropa_id, title, due_date, status) VALUES
        ('f1', 'e1', 't1', 'Vencida', ?1, 'Open'), ('f2', 'e1', 't1', 'Em 10 dias', ?2, 'Open'), ('f3', 'e1', 't1', 'Em 60 dias', ?3, 'In Progress'),
        ('f4', 'e1', 't1', 'Em 120 dias', ?4, 'Open'), ('f5', 'e1', 't1', 'Em 200 dias', ?5, 'Open'), ('f6', 'e1', 't1', 'Sem prazo', NULL, 'Open'),
        ('f7', 'e1', 't1', 'Concluída', ?1, 'Closed'), ('f8', 'e1', NULL, 'Só ISO', ?1, 'Open'), ('f9', 'e2', 't9', 'Do outro', ?1, 'Open')`)
        .bind(dias(-3), dias(10), dias(60), dias(120), dias(200)),
    ]);
    const v = await ver() as Visao & { acoes_por_prazo: { faixa: string; rotulo: string; total: number; itens: { id: string; ropa_id: string; atividade: string }[] }[] };
    expect(v.acoes_por_prazo.map((f) => [f.faixa, f.total])).toEqual([
      ['vencidas', 1], ['ate_30', 1], ['de_31_a_90', 1], ['de_91_a_150', 1], ['mais_de_150', 1], ['sem_prazo', 1],
    ]);
    expect(v.acoes_por_prazo[0]).toMatchObject({ rotulo: 'Vencidas', itens: [{ id: 'f1', ropa_id: 't1', atividade: 'Folha' }] });
  });

  it('não mistura projetos', async () => {
    await db().batch([
      db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES ('x1', 'e2', 'PT-9', 'acesso', '2026-09-01', ?1, 'recebido')`).bind(dias(-5)),
      db().prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES ('x2', 'e2', 'z.pdf', 'k', 'h', 'u', ?1)`).bind(dias(-1)),
      db().prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('x3', 'e2', 'Do outro')`),
    ]);
    const v = await ver();
    expect(v.pedidos_titular.abertos).toBe(0);
    expect(v.evidencias.a_corrigir).toBe(0);
    expect(v.tratamentos.total).toBe(0);
  });
});

describe('prazo às 22h de Brasília', () => {
  it('conta no dia de Brasília: pedido do 7º dia às 22h vence em 7 dias; o atrasado não entra nos 7 dias; incidente de ontem às 22h atrasado', async () => {
    const as22 = (n: number) => `${dias(n + 1)}T01:00:00.000Z`; // 22h de Brasília do dia n
    await db().batch([
      db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES
        ('q1', 'e1', 'PT-1', 'acesso', ?1, ?2, 'recebido'), ('q2', 'e1', 'PT-2', 'acesso', ?1, ?3, 'recebido')`).bind(dias(-10), as22(7), as22(-2)),
      db().prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, prazo_anpd_em, prazo_titular_em, status, risco_titular) VALUES
        ('j1', 'e1', 'IN-1', 'Ontem às 22h', ?1, ?2, NULL, 'avaliado', 'relevante')`).bind(dias(-5), as22(-1)),
    ]);
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ atrasados: 1, vencem_em_7_dias: 1, exigem_atencao: 2 });
    expect(v.incidentes.comunicacoes_atrasadas).toBe(1);
  });
});

describe('prazo gravado à meia-noite UTC', () => {
  it('pedido contado do recebimento sem hora: o 8º dia à meia-noite UTC é o 8º dia, não o 7º às 21h', async () => {
    await db().prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, prazo_em, status) VALUES
      ('m1', 'e1', 'PT-M1', 'acesso', ?1, ?2, 'recebido')`).bind(dias(-8), `${dias(8)}T00:00:00.000Z`).run();
    const v = await ver();
    expect(v.pedidos_titular).toMatchObject({ atrasados: 0, vencem_em_7_dias: 0, exigem_atencao: 0 });
  });
});

describe('canal do titular (0117)', () => {
  const doCanal = async () => (await ver()).prioridades.filter((p) => p.texto.startsWith('Canal')) as unknown as Record<string, string>[];
  it('sem meio: alta e Exigido, para Solicitações; com meio e sem página: média; página nunca conferida: média; conferida: nenhuma', async () => {
    expect(await doCanal()).toEqual([expect.objectContaining({ nivel: 'alta', texto: 'Canal do titular não registrado', tela: 'titular',
      grupo: 'semana', quando: 'Exigido', acao: 'Registrar o canal', aba: 'pedidos' })]);
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email) VALUES ('tc1', 'e1', 'privacidade@exemplo.com.br')`).run();
    expect((await doCanal()).map((p) => `${p.nivel}: ${p.texto} -> ${p.tela}`)).toEqual(['media: Canal sem página de divulgação ou nunca conferido -> titular']);
    await db().prepare(`UPDATE titular_canal SET divulgacao_url = 'https://exemplo.com.br/privacidade' WHERE id = 'tc1'`).run();
    expect((await doCanal()).map((p) => p.nivel)).toEqual(['media']);
    await db().prepare(`UPDATE titular_canal SET conferido_em = '2026-11-19' WHERE id = 'tc1'`).run();
    expect(await doCanal()).toEqual([]);
    expect((await ver()).canal).toEqual({ meios: ['email'], portal_ativo: false, divulgado: true, conferido_em: '2026-11-19' });
  });
  it('conferido mas sem página de divulgação: ainda média', async () => {
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email, conferido_em) VALUES ('tc4', 'e1', 'privacidade@exemplo.com.br', '2026-11-19')`).run();
    expect((await doCanal()).map((p) => p.nivel)).toEqual(['media']);
  });
  it('só o portal ativo conta como meio (sem a alta), mas a página continua pedida', async () => {
    await db().prepare(`INSERT INTO titular_portais (project_id, token_hash, ativo) VALUES ('e1', 'h-e1', 1)`).run();
    const textos = (await ver()).prioridades.map((p) => p.texto);
    expect(textos).not.toContain('Canal do titular não registrado');
    expect(textos).toContain('Canal sem página de divulgação ou nunca conferido');
  });
  it('a visão não leva o endereço do canal, só o resumo; o outro projeto não conta', async () => {
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email, divulgacao_url) VALUES ('tc2', 'e2', 'outro@exemplo.com.br', 'https://outro.exemplo/p')`).run();
    const v = await ver();
    expect(v.canal.meios).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('outro@exemplo.com.br');
  });
  it('a visão do próprio projeto não leva e-mail, URL nem telefone do canal', async () => {
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email, telefone, formulario_url, divulgacao_url) VALUES ('tc3', 'e1', 'meu@exemplo.com.br', '11 4000-9999', 'https://exemplo.com.br/form', 'https://exemplo.com.br/priv')`).run();
    const v = await ver();
    expect(v.canal.meios).toEqual(['email', 'telefone', 'formulario']);
    const t = JSON.stringify(v);
    for (const x of ['meu@exemplo.com.br', '11 4000-9999', 'exemplo.com.br/form', 'exemplo.com.br/priv']) expect(t).not.toContain(x);
  });
});
