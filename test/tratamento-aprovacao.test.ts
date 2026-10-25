import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { hashPassword } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { documentoAtual, hashConteudo } from '../src/services/pedidos';

/**
 * Fatia 4.3: aprovação do tratamento por pedido (`tipo = 'tratamento'`, ref_id = o registro do RoPA). O conteúdo congelado é o
 * registro e tudo o que ele liga; a aprovação é DERIVADA (vale o pedido aprovado com o hash do conteúdo de hoje).
 */
const SENHA = 'Senha-forte-123!';
const P = 'ta-proj';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;

let consultor: Record<string, string>, ciso: Record<string, string>;
type Reg = { id: string; aprovacao_pedido: { ciso: { por: string } | null; ceo: { por: string } | null }; ciso_approved_by: string | null };
const registro = async (id: string) => (await json<{ records: Reg[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa`))).records.find((r) => r.id === id)!;
async function novo(finalidade = 'Folha de pagamento') {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: finalidade, data_subjects: 'Colaboradores' });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
const pedir = (ref: string, papel = 'ciso') =>
  chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos`, { tipo: 'tratamento', ref_id: ref, papel_exigido: papel, destinatarios: [{ email: 'ciso@cliente.com' }] });
const pedido = async (ref: string) => {
  const r = await pedir(ref);
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
};
const aprovar = (id: string) => chamar(ciso, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
const statusPedidos = async (ref: string) =>
  (await env.DB.prepare(`SELECT status FROM pedidos WHERE tipo = 'tratamento' AND ref_id = ? ORDER BY criado_em, rowid`).bind(ref).all<{ status: string }>()).results.map((r) => r.status);

beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', ?, 'Cons', 'consultor', NULL, 'org_ness'),
      ('u-ciso', 'ciso@cliente.com', ?, 'Cida', 'org_user', ?, 'org_ness')`).bind(senha, senha, P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES
      ('g-cons', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-ciso', ?1, 'Cida Matriz', 'ciso@cliente.com', 'executivo', 'CISO')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('ta-i1', ?, 'ERP', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('ta-d1', ?, 'RH')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('ta-pa1', ?, 'organizacao', 'Operadora Exemplo')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  ciso = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_user', client_project_id: P });
}, 60_000);

describe('pedido de aprovação do tratamento', () => {
  it('congela o registro e as ligações; a aprovação aparece na lista e nada é assinado no registro', async () => {
    const id = await novo();
    await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] });
    await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/departamentos`, { departamentos: ['ta-d1'] });
    await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id });
    await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile', destinatario_parte_id: 'ta-pa1', mecanismo: 'cláusulas' });
    expect((await registro(id)).aprovacao_pedido).toEqual({ ciso: null, ceo: null });

    const ped = await pedido(id);
    const p = await env.DB.prepare('SELECT titulo, conteudo_json, status, papel_exigido FROM pedidos WHERE id = ?').bind(ped).first<{ titulo: string; conteudo_json: string; status: string; papel_exigido: string }>();
    expect(p).toMatchObject({ titulo: 'Tratamento: Folha de pagamento', status: 'aberto', papel_exigido: 'ciso' });
    expect(JSON.parse(p!.conteudo_json)).toMatchObject({
      finalidade: 'Folha de pagamento', titulares: 'Colaboradores',
      itens: ['ERP (sistema)'], departamentos: ['RH'], partes: ['operador: Operadora Exemplo'], transferencias: ['Chile | Operadora Exemplo | cláusulas'],
    });

    const r = await aprovar(ped);
    expect(r.status, await r.clone().text()).toBe(200);
    const reg = await registro(id);
    expect(reg.aprovacao_pedido.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(reg.aprovacao_pedido.ceo).toBeNull();
    expect(reg.ciso_approved_by).toBeNull(); // o pedido não escreve na aprovação direta antiga
  });

  it('ciência não vale para tratamento; registro alheio ou inexistente é 404', async () => {
    const id = await novo('Para validar');
    expect((await pedir(id, 'ciente')).status).toBe(400);
    expect((await pedir('nao-existe')).status).toBe(404);
  });

  it('mudar o registro invalida a aprovação sozinho e substitui o pedido aberto; a prova antiga fica', async () => {
    const id = await novo('Para editar');
    const ped = await pedido(id);
    await aprovar(ped);
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();

    const r = await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Para editar', retention_period: '5 anos' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
    expect(await statusPedidos(id)).toEqual(['aprovado']); // aprovado não é reaberto nem apagado
    expect(await env.DB.prepare(`SELECT count(*) AS n FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'aprovado'`).bind(ped).first()).toEqual({ n: 1 });
  });

  it.each([
    ['item', (id: string) => chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] })],
    ['departamento', (id: string) => chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/departamentos`, { departamentos: ['ta-d1'] })],
    ['transferência', (id: string) => chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile' })],
    ['parte', (id: string) => chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id })],
  ])('mudar %s invalida a aprovação', async (_n, mudar) => {
    const id = await novo(`Muda ${_n}`);
    await aprovar(await pedido(id));
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
    expect((await mudar(id)).status).toBeLessThan(300);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
  });

  it('remover o vínculo da parte e a transferência também invalida', async () => {
    const id = await novo('Remove ligações');
    const v = await chamar(consultor, 'POST', `/api/v1/projects/${P}/partes/ta-pa1/vinculos`, { papel: 'operador', alvo_tipo: 'tratamento', alvo_id: id });
    const vinculoId = (await json<{ id: string }>(v)).id;
    const t = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/transferencias`, { pais: 'Chile' });
    const transfId = (await json<{ id: string }>(t)).id;
    await aprovar(await pedido(id));
    expect((await chamar(consultor, 'DELETE', `/api/v1/projects/${P}/partes/ta-pa1/vinculos/${vinculoId}`)).status).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
    await aprovar(await pedido(id));
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
    expect((await chamar(consultor, 'DELETE', `/api/v1/projects/${P}/ropa/${id}/transferencias/${transfId}`)).status).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
  });

  it('pedido ainda aberto é substituído por um novo quando uma ligação muda (e quando só o status muda, não)', async () => {
    const id = await novo('Pedido aberto');
    await pedido(id);
    expect(await statusPedidos(id)).toEqual(['aberto']);
    await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Pedido aberto', status: 'Under Review' });
    expect(await statusPedidos(id)).toEqual(['aberto']);
    expect((await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${id}/itens`, { itens: ['ta-i1'] })).status).toBe(200);
    expect(await statusPedidos(id)).toEqual(['substituido', 'aberto']);
  });

  it('mandar para revisão pelo PUT uma atividade aprovada é reabrir: o consultor recebe 403 e a aprovação fica', async () => {
    const id = await novo('Só status');
    await aprovar(await pedido(id));
    const r = await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Só status', status: 'Under Review' });
    expect(r.status, await r.clone().text()).toBe(403);
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();
  });

  it('a aprovação direta antiga segue funcionando ao lado da derivada', async () => {
    const id = await novo('Aprovação direta');
    const admin = await sessionFor({ id: 'u-ciso', email: 'ciso@cliente.com', role: 'org_admin', client_project_id: P });
    const direta = await chamar(admin, 'POST', `/api/v1/projects/${P}/ropa/${id}/approve`, { role: 'ciso' });
    expect(direta.status, await direta.clone().text()).toBe(200);
    expect((await registro(id)).ciso_approved_by).toBe('Cida Matriz');
    expect((await registro(id)).aprovacao_pedido).toEqual({ ciso: null, ceo: null });
  });
});

// Migration 0072: teste de impacto, impacto_finalizado_em e origem_hash ficam FORA do conteúdo congelado. Aprovação de antes continua valendo.
describe('teste de impacto e aprovações (não regressão da 0072)', () => {
  it('responder e finalizar o teste e criar a DPIA do tratamento não derrubam a aprovação nem substituem pedido', async () => {
    const id = await novo('Aprovado antes da 0072');
    await aprovar(await pedido(id));
    const aberto = await novo('Pedido aberto antes da 0072');
    await pedido(aberto);
    const antes = await hashConteudo((await documentoAtual(env.DB, 'tratamento', id, P))!.conteudo);
    for (const rid of [id, aberto]) {
      expect((await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${rid}/impacto`, { respostas: { sensiveis: 'sim', larga_escala: 'sim' }, finalizar: true })).status).toBe(200);
      expect((await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${rid}/dpia`)).status).toBe(201);
    }
    expect(await hashConteudo((await documentoAtual(env.DB, 'tratamento', id, P))!.conteudo)).toBe(antes);
    expect((await registro(id)).aprovacao_pedido.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(await statusPedidos(id)).toEqual(['aprovado']);
    expect(await statusPedidos(aberto)).toEqual(['aberto']);
  });

  it('origem_hash não entra no conteúdo congelado da DPIA', async () => {
    const id = await novo('DPIA com origem');
    const dpia = (await json<{ id: string }>(await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa/${id}/dpia`))).id;
    const doc = (await documentoAtual(env.DB, 'dpia', dpia, P))!;
    expect(Object.keys(doc.conteudo)).not.toContain('origem_hash');
    await env.DB.prepare('UPDATE dpia_assessments SET origem_hash = NULL WHERE id = ?').bind(dpia).run();
    expect(await hashConteudo((await documentoAtual(env.DB, 'dpia', dpia, P))!.conteudo)).toBe(await hashConteudo(doc.conteudo));
  });
});

// Migration 0074 (F3): ciclo de vida, bases adicionais e a base do GDPR ficam FORA do conteúdo congelado. Aprovação de antes continua valendo.
describe('ciclo de vida e bases e aprovações (não regressão da 0074)', () => {
  it('gravar ciclo, bases adicionais e GDPR não derruba a aprovação, não muda o hash nem substitui o pedido aberto', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
      env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:art7:ii', 'lgpd', 'art. 7, II', 'Cumprimento de obrigação legal ou regulatória'), ('lgpd:art7:ix', 'lgpd', 'art. 7, IX', 'Legítimo interesse do controlador ou de terceiro')`),
    ]);
    const id = await novo('Aprovado antes da 0074');
    await aprovar(await pedido(id));
    const aberto = await novo('Pedido aberto antes da 0074');
    await pedido(aberto);
    const antes = await hashConteudo((await documentoAtual(env.DB, 'tratamento', id, P))!.conteudo);
    for (const rid of [id, aberto]) {
      expect((await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${rid}/ciclo`, { etapas: [
        { etapa: 'coleta', situacao: 'registrada', item_id: 'ta-i1', descricao: 'Formulário' }, { etapa: 'eliminacao', situacao: 'nao_aplicavel' },
      ] })).status).toBe(200);
      expect((await chamar(consultor, 'PUT', `/api/v1/projects/${P}/ropa/${rid}/bases`, { adicionais: [{ requisito_id: 'lgpd:art7:ii' }, { requisito_id: 'lgpd:art7:ix' }], base_gdpr: 'Art. 6(1)(c)' })).status).toBe(200);
    }
    const doc = (await documentoAtual(env.DB, 'tratamento', id, P))!;
    expect(Object.keys(doc.conteudo)).not.toEqual(expect.arrayContaining(['base_gdpr']));
    expect(await hashConteudo(doc.conteudo)).toBe(antes);
    expect((await registro(id)).aprovacao_pedido.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(await statusPedidos(id)).toEqual(['aprovado']);
    expect(await statusPedidos(aberto)).toEqual(['aberto']);
  });
});

// Migration 0069: dados sensíveis (art. 11) e crianças e adolescentes (art. 14) entram no conteúdo congelado SÓ quando marcados.
// Desmarcados (todo registro existente depois da 0069), o conteúdo e o hash ficam byte a byte como antes: nenhum pedido aberto é substituído.
describe('riscos do tratamento no conteúdo congelado', () => {
  // Hash do registro abaixo calculado ANTES da 0069 (código sem as colunas). Mudou? Todo pedido aberto de tratamento seria substituído.
  const HASH_ANTES_DA_0069 = 'c9978f1a6e8be0ca4ac815ce7bf8bd0e238baf3de7fc5fcd79b1dfe8ca9a3cc3';
  const fixo = async (id: string) => {
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required)
      VALUES (?, ?, 'Folha fixa', 'Cadastrais', 'Colaboradores', 'Obrigação legal', '5 anos', 'Contabilidade', 1, 'Cláusulas-padrão', 0)`).bind(id, P).run();
  };

  it('desmarcados: conteúdo sem as chaves novas e hash igual ao de antes da 0069', async () => {
    await fixo('ta-fixo');
    const doc = await documentoAtual(env.DB, 'tratamento', 'ta-fixo', P);
    expect(Object.keys(doc!.conteudo)).not.toContain('dados_sensiveis');
    expect(Object.keys(doc!.conteudo)).not.toContain('criancas_adolescentes');
    expect(await hashConteudo(doc!.conteudo)).toBe(HASH_ANTES_DA_0069);
  });

  it('marcar um risco muda o conteúdo, substitui o pedido aberto e invalida a aprovação; aprovar com ele marcado funciona', async () => {
    const id = await novo('Risco marcado');
    const antes = (await documentoAtual(env.DB, 'tratamento', id, P))!;
    await pedido(id);
    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Risco marcado', dados_sensiveis: 0, criancas_adolescentes: 0 })).status).toBe(200);
    expect(await statusPedidos(id)).toEqual(['aberto']); // gravar 0 sobre 0 não é mudança

    expect((await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Risco marcado', criancas_adolescentes: 1 })).status).toBe(200);
    const depois = (await documentoAtual(env.DB, 'tratamento', id, P))!;
    expect(depois.conteudo).toEqual({ ...antes.conteudo, criancas_adolescentes: 1 });
    expect(await hashConteudo(depois.conteudo)).not.toBe(await hashConteudo(antes.conteudo));
    expect(await statusPedidos(id)).toEqual(['substituido', 'aberto']);

    const aberto = await env.DB.prepare(`SELECT id FROM pedidos WHERE tipo = 'tratamento' AND ref_id = ? AND status = 'aberto'`).bind(id).first<{ id: string }>();
    const r = await aprovar(aberto!.id);
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await registro(id)).aprovacao_pedido.ciso).not.toBeNull();

    await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Risco marcado', dados_sensiveis: true });
    expect((await registro(id)).aprovacao_pedido.ciso).toBeNull();
  });
});

// Onda 2 (uma aprovação só): a etapa de aprovação da atividade lê, nas ligações, a aprovação vigente, a que perdeu a validade
// porque a atividade mudou e se há pedido aguardando. Só leitura: o conteúdo congelado e o hash não mudam.
describe('situação da aprovação nas ligações (etapa 5 da atividade)', () => {
  type Sit = { aprovacao: { ciso: { por: string } | null }; aprovacao_anterior: { por: string; em: string } | null; pedidos_abertos: number };
  const lig = async (id: string) => json<Sit>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/${id}/ligacoes`));

  it('sem pedido; com pedido aberto; aprovada; e depois de mudar, a aprovação anterior com quem e quando', async () => {
    const id = await novo('Situação da aprovação');
    expect(await lig(id)).toMatchObject({ aprovacao: { ciso: null }, aprovacao_anterior: null, pedidos_abertos: 0 });
    const ped = await pedido(id);
    expect((await lig(id)).pedidos_abertos).toBe(1);
    await aprovar(ped);
    expect(await lig(id)).toMatchObject({ aprovacao: { ciso: { por: 'Cida Matriz' } }, aprovacao_anterior: null, pedidos_abertos: 0 });
    await chamar(consultor, 'PUT', `/api/v1/ropa/${id}`, { processing_purpose: 'Situação da aprovação', retention_period: '2 anos' });
    const depois = await lig(id);
    expect(depois.aprovacao.ciso).toBeNull();
    expect(depois.aprovacao_anterior).toMatchObject({ por: 'Cida Matriz' });
    expect(depois.aprovacao_anterior!.em).toBeTruthy();
  });

  it('uma aprovação feita antes continua valendo: ler a situação não muda o hash nem o pedido', async () => {
    const id = await novo('Aprovada antes da onda 2');
    await aprovar(await pedido(id));
    const antes = await hashConteudo((await documentoAtual(env.DB, 'tratamento', id, P))!.conteudo);
    await lig(id);
    await chamar(consultor, 'GET', `/api/v1/projects/${P}/ropa/${id}/impacto`);
    expect(await hashConteudo((await documentoAtual(env.DB, 'tratamento', id, P))!.conteudo)).toBe(antes);
    expect((await registro(id)).aprovacao_pedido.ciso).toMatchObject({ por: 'Cida Matriz' });
    expect(await statusPedidos(id)).toEqual(['aprovado']);
  });
});
