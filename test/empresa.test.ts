import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { cnpjValido } from '../src/schemas';

/**
 * Cadastro da empresa do projeto (migration 0071) e o assistente "Novo projeto": `GET/PUT /projects/:id/empresa`,
 * `POST /projects` com `empresa` e `pessoas`, `GET /projects/consulta-cnpj/:cnpj`. D1 real; o fetch da BrasilAPI é
 * dublê (nunca rede). CNPJs fabricados com dígito verificador válido, de nenhuma empresa.
 */
const CNPJ_A = '11111111000191';
const CNPJ_B = '22222222000191';
const CNPJ_C = '12345000000102';
const CNPJ_D = '98765000000187';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra });

let pa: Record<string, string>, cadm: Record<string, string>, cadmB: Record<string, string>, cons: Record<string, string>,
  com: Record<string, string>, cli: Record<string, string>, cliUser: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, modulos_contratados, max_projects) VALUES ('org_e', 'Consultoria E', 'cons-e', '["iso","privacy"]', 100), ('org_f', 'Consultoria F', 'cons-f', '["iso"]', 100)`),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id, cnpj, sector, employee_count) VALUES
      ('pe1', 'Alfa Fictícia', 'ISO 27001', 'Controller', 'active', 'org_e', NULL, 'Varejo', 10),
      ('pf1', 'Beta Fictícia', 'ISO 27001', 'Controller', 'active', 'org_f', NULL, NULL, NULL)`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id, client_project_id) VALUES
      ('u-cadm', 'cadm@e.lat', 'x', 'Admin E', 'consultoria_admin', 'org_e', NULL),
      ('u-cadmf', 'cadm@f.lat', 'x', 'Admin F', 'consultoria_admin', 'org_f', NULL),
      ('u-cons', 'cons@e.lat', 'x', 'Consultor E', 'consultor', 'org_e', NULL),
      ('u-com', 'com@e.lat', 'x', 'Comercial E', 'comercial', 'org_e', NULL),
      ('u-cli', 'cli@e.lat', 'x', 'Cliente Admin', 'org_admin', 'org_e', 'pe1'),
      ('u-cliu', 'cliu@e.lat', 'x', 'Cliente', 'org_user', 'org_e', 'pe1')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('pe1', 'Consultor E', 'cons@e.lat', 'consultor', 'Consultor')`),
  ]);
  pa = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
  cadm = await sessionFor({ id: 'u-cadm', email: 'cadm@e.lat', role: 'consultoria_admin', org_id: 'org_e' });
  cadmB = await sessionFor({ id: 'u-cadmf', email: 'cadm@f.lat', role: 'consultoria_admin', org_id: 'org_f' });
  cons = await sessionFor({ id: 'u-cons', email: 'cons@e.lat', role: 'consultor', org_id: 'org_e' });
  com = await sessionFor({ id: 'u-com', email: 'com@e.lat', role: 'comercial', org_id: 'org_e' });
  cli = await sessionFor({ id: 'u-cli', email: 'cli@e.lat', role: 'org_admin', client_project_id: 'pe1', org_id: 'org_e' });
  cliUser = await sessionFor({ id: 'u-cliu', email: 'cliu@e.lat', role: 'org_user', client_project_id: 'pe1', org_id: 'org_e' });
});

afterEach(() => vi.unstubAllGlobals());

describe('CNPJ: dígito verificador', () => {
  it('aceita o fabricado válido e recusa dígito errado, repetido e tamanho errado', () => {
    for (const ok of [CNPJ_A, CNPJ_B, CNPJ_C, CNPJ_D, '11222333000181']) expect(cnpjValido(ok), ok).toBe(true);
    for (const ruim of ['11111111000192', '11111111111111', '1111111100019', '', 'abcdefghijklmn']) expect(cnpjValido(ruim), ruim).toBe(false);
  });
});

describe('GET/PUT /projects/:id/empresa', () => {
  it('sem linha, devolve a semente das colunas antigas do projeto', async () => {
    const r = await chamar(cadm, 'GET', '/api/v1/projects/pe1/empresa');
    expect(r.status).toBe(200);
    const { empresa, pode_editar } = await r.json<any>();
    expect(empresa).toMatchObject({ project_id: 'pe1', razao_social: 'Alfa Fictícia', setor: 'Varejo', funcionarios: 10, pais: 'BR', cnpj: null });
    expect(pode_editar).toBe(true);
  });

  it('PUT normaliza o CNPJ, grava 1:1, sincroniza projects e registra só os NOMES dos campos', async () => {
    const r = await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', {
      cnpj: '11.111.111/0001-91', razao_social: 'Alfa Fictícia Ltda', nome_fantasia: 'Alfa', uf: 'sp', funcionarios: 42,
      representante_nome: 'Pessoa Representante Fictícia', representante_cargo: 'Diretora',
    });
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo = await r.json<any>();
    expect(corpo.empresa).toMatchObject({ cnpj: CNPJ_A, uf: 'SP', funcionarios: 42, setor: 'Varejo' });
    expect(corpo.alterados).toEqual(expect.arrayContaining(['cnpj', 'razao_social', 'nome_fantasia', 'uf', 'funcionarios', 'representante_nome']));
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM empresas WHERE project_id = 'pe1'`).first<any>()).n).toBe(1);
    const p = await env.DB.prepare(`SELECT cnpj, employee_count, sector, client_name FROM projects WHERE id = 'pe1'`).first<any>();
    expect(p).toEqual({ cnpj: CNPJ_A, employee_count: 42, sector: 'Varejo', client_name: 'Alfa' });
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'empresa.atualizada' AND project_id = 'pe1' ORDER BY rowid DESC LIMIT 1`).first<any>();
    expect(log.details).toContain('representante_nome');
    expect(log.details).not.toContain('Pessoa Representante');
  });

  it('campo ausente não mexe; vazio limpa; client_name não é apagado quando nome e razão vêm vazios', async () => {
    expect((await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', { telefone: '1130000000' })).status).toBe(200);
    let e = (await (await chamar(cadm, 'GET', '/api/v1/projects/pe1/empresa')).json<any>()).empresa;
    expect(e).toMatchObject({ cnpj: CNPJ_A, telefone: '1130000000', nome_fantasia: 'Alfa' });
    expect((await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', { nome_fantasia: '', razao_social: '  ' })).status).toBe(200);
    e = (await (await chamar(cadm, 'GET', '/api/v1/projects/pe1/empresa')).json<any>()).empresa;
    expect(e.nome_fantasia).toBeNull();
    expect((await env.DB.prepare(`SELECT client_name FROM projects WHERE id = 'pe1'`).first<any>()).client_name).toBe('Alfa');
    await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', { razao_social: 'Alfa Fictícia Ltda' });
  });

  it('validação: CNPJ com dígito errado, UF, data, e-mail, chave desconhecida e CPF são recusados (400)', async () => {
    for (const corpo of [{ cnpj: '11111111000192' }, { uf: 'São' }, { data_abertura: '01/02/2020' }, { email: 'nao-e-email' },
      { cpf: '00000000000' }, { representante_cpf: '1' }, { funcionarios: -1 }]) {
      const r = await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
  });

  it('empresa sem CNPJ: documento alternativo e país', async () => {
    const r = await chamar(pa, 'PUT', '/api/v1/projects/pf1/empresa', { documento_alternativo: 'EIN 00-0000000', pais: 'Estados Unidos', razao_social: 'Beta Fictícia Inc.' });
    expect(r.status).toBe(200);
    expect((await r.json<any>()).empresa).toMatchObject({ cnpj: null, documento_alternativo: 'EIN 00-0000000', pais: 'Estados Unidos' });
  });

  it('CNPJ já usado por OUTRO projeto da mesma organização: 409 com o projeto; em outra organização, liberado', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pe2', 'Gama Fictícia', 'ISO 27001', 'Controller', 'active', 'org_e')`).run();
    const r = await chamar(cadm, 'PUT', '/api/v1/projects/pe2/empresa', { cnpj: CNPJ_A });
    expect(r.status).toBe(409);
    expect((await r.json<any>()).projeto_existente).toEqual({ id: 'pe1', nome: 'Alfa Fictícia Ltda' });
    // o próprio projeto pode regravar o seu
    expect((await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', { cnpj: CNPJ_A })).status).toBe(200);
    // outra organização: liberado
    expect((await chamar(cadmB, 'PUT', '/api/v1/projects/pf1/empresa', { cnpj: CNPJ_A })).status).toBe(200);
  });

  it('permissões: org_admin edita o próprio; org_user só lê; comercial não alcança; agente consultor edita; agente auditor só lê', async () => {
    expect((await chamar(cli, 'PUT', '/api/v1/projects/pe1/empresa', { site: 'https://alfa.exemplo' })).status).toBe(200);
    // o cliente não vê o nome de outro projeto da consultoria no 409
    const dup = await chamar(cli, 'PUT', '/api/v1/projects/pe1/empresa', { cnpj: CNPJ_B });
    expect(dup.status).toBe(200); // CNPJ_B ainda livre na org_e
    expect((await chamar(cadm, 'PUT', '/api/v1/projects/pe1/empresa', { cnpj: CNPJ_A })).status).toBe(200);
    await chamar(cadm, 'PUT', '/api/v1/projects/pe2/empresa', { cnpj: CNPJ_C });
    const r409 = await chamar(cli, 'PUT', '/api/v1/projects/pe1/empresa', { cnpj: CNPJ_C });
    expect(r409.status).toBe(409);
    expect(JSON.stringify(await r409.json())).not.toContain('Gama');

    expect((await chamar(cliUser, 'GET', '/api/v1/projects/pe1/empresa')).status).toBe(200);
    expect((await chamar(cliUser, 'PUT', '/api/v1/projects/pe1/empresa', { site: 'x' })).status).toBe(403);
    expect((await chamar(com, 'GET', '/api/v1/projects/pe1/empresa')).status).toBe(403);
    expect((await chamar(cons, 'PUT', '/api/v1/projects/pe1/empresa', { complemento: 'Sala 1' })).status).toBe(200);

    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-e', 'u-cons', 'pe1', datetime('now','+30 days'))`).run();
    const agente = { AGENTE: { concessaoId: 'c-e', userId: 'u-cons', email: 'cons@e.lat', projectId: 'pe1' } };
    expect((await chamar({}, 'GET', '/api/v1/projects/pe1/empresa', undefined, agente)).status).toBe(200);
    // D4/agente: o agente com o papel de consultor preenche o cadastro (a trilha leva "agente de ..."); o auditor só lê.
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'PUT', '/api/v1/projects/pe1/empresa', { site: 'https://agente.exemplo' }, agente)).status).toBe(200);
    await env.DB.prepare(`UPDATE agente_concessoes SET revogado_em = datetime('now') WHERE id = 'c-e'`).run(); // a mesma conta não tem os dois papéis ativos
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em, papel) VALUES ('c-ea', 'u-cons', 'pe1', datetime('now','+30 days'), 'auditor')`).run();
    const auditor = { AGENTE: { concessaoId: 'c-ea', userId: 'u-cons', email: 'cons@e.lat', projectId: 'pe1', papel: 'auditor' } };
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'PUT', '/api/v1/projects/pe1/empresa', { site: 'x' }, auditor)).status).toBe(403);
    await env.DB.batch([env.DB.prepare(`DELETE FROM agente_concessoes WHERE id = 'c-ea'`), env.DB.prepare(`UPDATE agente_concessoes SET revogado_em = NULL WHERE id = 'c-e'`)]); // os outros testes do arquivo usam a c-e
  });

  it('isolamento: consultoria_admin da organização F não lê nem edita a empresa de projeto da organização E', async () => {
    expect((await chamar(cadmB, 'GET', '/api/v1/projects/pe1/empresa')).status).toBe(403);
    expect((await chamar(cadmB, 'PUT', '/api/v1/projects/pe1/empresa', { razao_social: 'Invasora' })).status).toBe(403);
    expect((await env.DB.prepare(`SELECT razao_social FROM empresas WHERE project_id = 'pe1'`).first<any>()).razao_social).toBe('Alfa Fictícia Ltda');
  });

  it('company-profile (rota antiga) espelha no cadastro novo', async () => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pe3', 'Delta Fictícia', 'ISO 27001', 'Controller', 'active', 'org_e')`).run();
    expect((await chamar(cadm, 'PUT', '/api/v1/projects/pe3/company-profile', { cnpj: '98.765.000/0001-87', employee_count: 5, sector: 'Saúde' })).status).toBe(200);
    expect(await env.DB.prepare(`SELECT cnpj, funcionarios, setor, razao_social FROM empresas WHERE project_id = 'pe3'`).first())
      .toEqual({ cnpj: CNPJ_D, funcionarios: 5, setor: 'Saúde', razao_social: 'Delta Fictícia' });
  });
});

describe('POST /projects com empresa e pessoas-chave', () => {
  it('cria projeto, empresa e pessoas no mesmo fluxo; o DPO vira encarregado', async () => {
    const r = await chamar(cadm, 'POST', '/api/v1/projects', {
      project_name: 'Programa Épsilon', standards: 'ISO 27001', org_role: 'Controller', modulos: ['iso', 'privacy'],
      empresa: { cnpj: CNPJ_B, razao_social: 'Épsilon Fictícia S.A.', nome_fantasia: 'Épsilon', setor: 'Indústria', funcionarios: 300, municipio: 'Cidade Fictícia', uf: 'MG' },
      pessoas: { representante: { nome: 'pessoa representante ficticia', cargo: 'Diretor-presidente' }, dpo: { nome: 'Encarregada Fictícia', email: 'DPO@Epsilon.exemplo' } },
    });
    expect(r.status, await r.clone().text()).toBe(201);
    const { id, client_name, modulos } = await r.json<any>();
    expect(client_name).toBe('Épsilon');
    expect(modulos).toEqual(['iso', 'privacy']);
    expect(await env.DB.prepare(`SELECT cnpj, razao_social, representante_nome, representante_cargo FROM empresas WHERE project_id = ?`).bind(id).first())
      .toEqual({ cnpj: CNPJ_B, razao_social: 'Épsilon Fictícia S.A.', representante_nome: 'pessoa representante ficticia', representante_cargo: 'Diretor-presidente' });
    expect(await env.DB.prepare(`SELECT cnpj, sector, employee_count FROM projects WHERE id = ?`).bind(id).first()).toEqual({ cnpj: CNPJ_B, sector: 'Indústria', employee_count: 300 });
    const { results } = await env.DB.prepare(
      `SELECT p.nome, p.email, v.papel FROM partes p JOIN parte_vinculos v ON v.parte_id = p.id WHERE p.project_id = ? AND v.alvo_tipo = 'projeto' AND v.alvo_id = ? ORDER BY v.papel`
    ).bind(id, id).all<any>();
    expect(results).toEqual([
      { nome: 'Encarregada Fictícia', email: 'dpo@epsilon.exemplo', papel: 'encarregado' },
      { nome: 'Pessoa Representante Ficticia', email: null, papel: 'responsavel' },
    ]);
  });

  it('CNPJ já usado na organização: 409 e nada é criado', async () => {
    const antes = (await env.DB.prepare('SELECT count(*) AS n FROM projects').first<any>()).n;
    const r = await chamar(cadm, 'POST', '/api/v1/projects', { empresa: { cnpj: CNPJ_B, razao_social: 'Outra' } });
    expect(r.status).toBe(409);
    expect((await r.json<any>()).projeto_existente.nome).toBe('Épsilon');
    expect((await env.DB.prepare('SELECT count(*) AS n FROM projects').first<any>()).n).toBe(antes);
  });

  it('falha no meio (pessoa) não deixa projeto pela metade', async () => {
    await env.DB.prepare(`CREATE TRIGGER falha_parte BEFORE INSERT ON partes BEGIN SELECT RAISE(ABORT, 'parte falhou'); END`).run();
    try {
      const antes = (await env.DB.prepare('SELECT count(*) AS n FROM projects').first<any>()).n;
      const r = await chamar(cadm, 'POST', '/api/v1/projects', { empresa: { razao_social: 'Zeta Fictícia' }, pessoas: { dpo: { nome: 'Alguém Fictício' } } });
      expect(r.status).toBe(500);
      expect((await env.DB.prepare('SELECT count(*) AS n FROM projects').first<any>()).n).toBe(antes);
      expect(await env.DB.prepare(`SELECT 1 FROM empresas WHERE razao_social = 'Zeta Fictícia'`).first()).toBeNull();
    } finally {
      await env.DB.prepare('DROP TRIGGER falha_parte').run();
    }
  });

  it('o POST antigo (sem empresa) continua igual: sem linha em empresas', async () => {
    const r = await chamar(cadm, 'POST', '/api/v1/projects', { client_name: 'Eta Fictícia' });
    expect(r.status).toBe(201);
    const { id } = await r.json<any>();
    expect(await env.DB.prepare('SELECT 1 FROM empresas WHERE project_id = ?').bind(id).first()).toBeNull();
    expect((await chamar(cadm, 'POST', '/api/v1/projects', {})).status).toBe(400); // client_name segue obrigatório sem empresa
  });

  it('o agente MCP não cria projeto', async () => {
    const agente = { AGENTE: { concessaoId: 'c-e', userId: 'u-cons', email: 'cons@e.lat', projectId: 'pe1' } };
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'POST', '/api/v1/projects', { client_name: 'X' }, agente)).status).toBe(403);
  });
});

describe('GET /projects/consulta-cnpj/:cnpj', () => {
  let pedidas: string[] = [];
  const brasilApi = (status: number, corpo: unknown) => {
    pedidas = [];
    vi.stubGlobal('fetch', async (u: any) => { pedidas.push(typeof u === 'string' ? u : u.url); return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }); });
  };
  const RESPOSTA = {
    cnpj: CNPJ_C, razao_social: 'TETA FICTICIA COMERCIO LTDA', nome_fantasia: 'TETA', natureza_juridica: 'Sociedade Empresária Limitada',
    porte: 'MICRO EMPRESA', data_inicio_atividade: '2010-05-03', descricao_situacao_cadastral: 'BAIXADA', cnae_fiscal: 4751201,
    cnae_fiscal_descricao: 'Comércio varejista <b>especializado</b>', cep: 1310100, descricao_tipo_de_logradouro: 'AVENIDA', logradouro: 'FICTICIA',
    numero: '100', complemento: 'X'.repeat(5000), bairro: 'CENTRO', municipio: 'CIDADE FICTICIA', uf: 'sp', ddd_telefone_1: '1130000000', email: null,
    qsa: [{ nome_socio: 'SOCIO FICTICIO DA SILVA', cnpj_cpf_do_socio: '***000000**' }],
  };

  it('sucesso: proposta normalizada, texto cortado, sem QSA', async () => {
    brasilApi(200, RESPOSTA);
    const r = await chamar(cadm, 'GET', '/api/v1/projects/consulta-cnpj/12.345.000%2F0001-02');
    expect(r.status, await r.clone().text()).toBe(200);
    const corpo = await r.json<any>();
    const texto = JSON.stringify(corpo);
    expect(pedidas).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${CNPJ_C}`]);
    expect(texto).not.toMatch(/SOCIO|qsa|nome_socio/i);
    expect(corpo.proposta).toMatchObject({ cnpj: CNPJ_C, razao_social: 'TETA FICTICIA COMERCIO LTDA', situacao_cadastral: 'BAIXADA', cep: '01310100',
      logradouro: 'AVENIDA FICTICIA', uf: 'SP', cnae_codigo: '4751201', data_abertura: '2010-05-03', email: null });
    expect(corpo.proposta.complemento.length).toBe(200);
    expect(corpo.existente).toEqual({ id: 'pe2', nome: 'Gama Fictícia' }); // CNPJ_C já está no pe2 da org_e
  });

  it('provedor fora do ar ou resposta malformada: 200 indisponível; CNPJ inexistente: 404', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('rede'); });
    expect(await (await chamar(cadm, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_D}`)).json()).toMatchObject({ indisponivel: true });
    brasilApi(200, { qualquer: 'coisa' });
    expect(await (await chamar(cadm, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_D}`)).json()).toMatchObject({ indisponivel: true });
    brasilApi(500, { erro: 1 });
    expect(await (await chamar(cadm, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_D}`)).json()).toMatchObject({ indisponivel: true });
    brasilApi(404, { message: 'não encontrado' });
    expect((await chamar(cadm, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_D}`)).status).toBe(404);
  });

  it('CNPJ com dígito errado: 400 sem chamar o provedor', async () => {
    brasilApi(200, RESPOSTA);
    expect((await chamar(cadm, 'GET', '/api/v1/projects/consulta-cnpj/11111111000192')).status).toBe(400);
    expect(pedidas).toEqual([]);
  });

  it('só platform_admin e consultoria_admin; consultor, comercial, cliente e agente recebem 403', async () => {
    brasilApi(200, RESPOSTA);
    expect((await chamar(pa, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_C}`)).status).toBe(200);
    for (const h of [cons, com, cli, cliUser]) expect((await chamar(h, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_C}`)).status).toBe(403);
    const agente = { AGENTE: { concessaoId: 'c-e', userId: 'u-cons', email: 'cons@e.lat', projectId: 'pe1' } };
    const r = await chamar({}, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_C}`, undefined, agente);
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('fora do alcance do agente');
  });

  it('limite por usuário: 429 depois de 30 em 10 minutos', async () => {
    brasilApi(200, RESPOSTA);
    const quem = await sessionFor({ id: 'u-cadm', email: 'cadm@e.lat', role: 'consultoria_admin', org_id: 'org_e' });
    let ultimo = 0;
    for (let i = 0; i < 31; i++) ultimo = (await chamar(quem, 'GET', `/api/v1/projects/consulta-cnpj/${CNPJ_D}`)).status;
    expect(ultimo).toBe(429);
  });
});
