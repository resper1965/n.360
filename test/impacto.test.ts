import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { PERGUNTAS_IMPACTO, recomendarRipd, type RespostaImpacto } from '../src/services/impacto';
import { documentoAtual, hashConteudo } from '../src/services/pedidos';

describe('catálogo do teste de impacto', () => {
  it('tem 14 perguntas: a de alto risco primeiro, 2 de critério geral e 11 de critério específico', () => {
    expect(PERGUNTAS_IMPACTO).toHaveLength(14);
    expect(PERGUNTAS_IMPACTO[0]).toMatchObject({ id: 'alto_risco', grupo: 'alto_risco' });
    expect(PERGUNTAS_IMPACTO.filter((p) => p.grupo === 'alto_risco')).toHaveLength(1);
    expect(PERGUNTAS_IMPACTO.filter((p) => p.grupo === 'geral').map((p) => p.id)).toEqual(['afeta_direitos', 'larga_escala']);
    expect(PERGUNTAS_IMPACTO.filter((p) => p.grupo === 'especifico').map((p) => p.id)).toEqual([
      'sensiveis', 'vulneraveis', 'finalidade_distinta', 'compartilhamento_novo', 'monitoramento', 'perfilizacao',
      'combinacao', 'transferencia', 'tecnologia_inovadora', 'decisao_automatizada', 'legitimo_interesse',
    ]);
    expect(PERGUNTAS_IMPACTO.every((p) => p.texto.length > 20)).toBe(true);
  });
});

describe('recomendarRipd', () => {
  const treze = () => Object.fromEntries(PERGUNTAS_IMPACTO.filter((p) => p.grupo !== 'alto_risco').map((p) => [p.id, 'nao'])) as Record<string, RespostaImpacto>;
  it('alto risco sim recomenda o RIPD sozinho, com o motivo alto_risco', () => {
    expect(recomendarRipd({ alto_risco: 'sim' })).toEqual({ resultado: 'recomendado', motivos: ['alto_risco'] });
    expect(recomendarRipd({ ...treze(), alto_risco: 'sim', larga_escala: 'sim', sensiveis: 'sim' }).motivos).toEqual(['alto_risco', 'larga_escala', 'sensiveis']);
  });
  it('a pergunta nova é opcional na conta: as 13 em não sem ela continuam dispensável; não sei nela também', () => {
    expect(recomendarRipd(treze()).resultado).toBe('dispensavel_a_confirmar');
    expect(recomendarRipd({ ...treze(), alto_risco: 'nao_sei' }).resultado).toBe('dispensavel_a_confirmar');
    expect(recomendarRipd({ ...treze(), alto_risco: 'nao' }).resultado).toBe('dispensavel_a_confirmar');
  });
  const todas = (v: RespostaImpacto) => Object.fromEntries(PERGUNTAS_IMPACTO.map((p) => [p.id, v])) as Record<string, RespostaImpacto>;
  it('um critério geral E um específico marcados recomendam o RIPD e listam os motivos', () => {
    const r = recomendarRipd({ ...todas('nao'), larga_escala: 'sim', sensiveis: 'sim', monitoramento: 'sim' });
    expect(r).toEqual({ resultado: 'recomendado', motivos: ['larga_escala', 'sensiveis', 'monitoramento'] });
  });
  it('só específico, ou só geral, não basta para recomendar', () => {
    expect(recomendarRipd({ ...todas('nao'), sensiveis: 'sim' })).toEqual({ resultado: 'dispensavel_a_confirmar', motivos: [] });
    expect(recomendarRipd({ ...todas('nao'), larga_escala: 'sim' })).toEqual({ resultado: 'dispensavel_a_confirmar', motivos: [] });
  });
  it('tudo respondido sem geral E específico deixa dispensável, mas a confirmação é humana', () => {
    expect(recomendarRipd(todas('nao')).resultado).toBe('dispensavel_a_confirmar');
  });
  it('pergunta sem resposta ou "não sei" deixa incompleto, salvo quando já há geral e específico', () => {
    expect(recomendarRipd({ sensiveis: 'nao' }).resultado).toBe('incompleto');
    expect(recomendarRipd(todas('nao_sei')).resultado).toBe('incompleto');
    expect(recomendarRipd({ ...todas('nao_sei'), larga_escala: 'sim', perfilizacao: 'sim' }).resultado).toBe('recomendado');
  });
});

const P = 'im-proj';
const OUTRO = 'im-outro';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: object = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...workerEnv(), ...extra } as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const base = (rid: string) => `/api/v1/projects/${P}/ropa/${rid}`;
const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-im' };
type Lido = { perguntas: { id: string; resposta: RespostaImpacto | null }[]; recomendacao: { resultado: string; motivos: string[] }; finalizado_em: string | null };

let consultor: Record<string, string>, cliente: Record<string, string>;
async function novoRegistro(finalidade: string) {
  const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: finalidade, data_subjects: 'Colaboradores' });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
const hashDoTratamento = async (rid: string) => hashConteudo((await documentoAtual(env.DB, 'tratamento', rid, P))!.conteudo);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-im', ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-im', 'u-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('im-alheio', ?, 'Do outro')`).bind(OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('u-cli', ['privacy']);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('rota do teste de impacto', () => {
  it('grava as respostas, recomenda o RIPD e finaliza; a resposta seguinte não apaga as anteriores', async () => {
    const rid = await novoRegistro('Folha de pagamento');
    const put = await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { larga_escala: 'sim', monitoramento: 'nao' }, finalizar: false });
    expect(put.status, await put.clone().text()).toBe(200);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' } })).status).toBe(200);
    const get = await json<Lido>(await chamar(consultor, 'GET', `${base(rid)}/impacto`));
    expect(get.recomendacao).toEqual({ resultado: 'recomendado', motivos: ['larga_escala', 'sensiveis'] });
    expect(get.perguntas.find((p) => p.id === 'monitoramento')!.resposta).toBe('nao');
    expect(get.perguntas).toHaveLength(14);
    expect(get.finalizado_em).toBeNull();
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: {}, finalizar: true })).status).toBe(200);
    expect((await json<Lido>(await chamar(consultor, 'GET', `${base(rid)}/impacto`))).finalizado_em).not.toBeNull();
    expect((await json<Lido>(await chamar(cliente, 'GET', `${base(rid)}/impacto`))).recomendacao.resultado).toBe('recomendado');
  });

  it('recusa pergunta desconhecida, resposta inválida, campo a mais e registro de outro projeto', async () => {
    const rid = await novoRegistro('Outra');
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { inventada: 'sim' } })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'talvez' } })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: {}, extra: 1 })).status).toBe(400);
    expect((await chamar(consultor, 'GET', `${base('im-alheio')}/impacto`)).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${base('im-alheio')}/impacto`, { respostas: { sensiveis: 'sim' } })).status).toBe(404);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM tratamento_impacto WHERE ropa_id = 'im-alheio'`).first<{ n: number }>())!.n).toBe(0);
  });

  it('responder o teste não mexe no hash da aprovação do tratamento', async () => {
    const rid = await novoRegistro('Com aprovação');
    const antes = await hashDoTratamento(rid);
    await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' }, finalizar: true });
    expect(await hashDoTratamento(rid)).toBe(antes);
  });

  it('o cliente sem permissão de escrita não grava; o agente responde mas não finaliza', async () => {
    const rid = await novoRegistro('Cliente');
    expect((await chamar(cliente, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' } })).status).toBe(403);
    const ag = (corpo: unknown) => chamar({}, 'PUT', `${base(rid)}/impacto`, corpo, { AGENTE });
    expect((await ag({ respostas: { sensiveis: 'sim' } })).status).toBe(200);
    expect((await ag({ respostas: {}, finalizar: true })).status).toBe(403);
    expect((await json<Lido>(await chamar(consultor, 'GET', `${base(rid)}/impacto`))).finalizado_em).toBeNull();
  });
});

// Onda 2 (atividade como fluxo): o servidor pré-preenche o que a atividade já garante, sem gravar nada e sem mudar a regra.
describe('respostas que vêm da atividade (nunca perguntar de novo)', () => {
  type ComOrigem = { perguntas: { id: string; resposta: RespostaImpacto | null; da_atividade: RespostaImpacto | null; curto: string }[]; recomendacao: { resultado: string } };
  const ler = async (rid: string) => json<ComOrigem>(await chamar(consultor, 'GET', `${base(rid)}/impacto`));
  const de = (l: ComOrigem, id: string) => l.perguntas.find((p) => p.id === id)!;

  it('sensível, criança, transferência e legítimo interesse marcados na atividade chegam como "sim", sem gravar e sem mudar a recomendação', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, {
      processing_purpose: 'Marketing', data_subjects: 'Clientes', dados_sensiveis: 1, criancas_adolescentes: 1, international_transfers: 1,
      legal_basis: 'Legítimo interesse do controlador ou de terceiro',
    });
    const rid = (await json<{ id: string }>(r)).id;
    const l = await ler(rid);
    for (const id of ['sensiveis', 'vulneraveis', 'transferencia', 'legitimo_interesse']) {
      expect(de(l, id), id).toMatchObject({ resposta: null, da_atividade: 'sim' });
    }
    expect(de(l, 'larga_escala').da_atividade).toBeNull();
    expect(l.recomendacao.resultado).toBe('incompleto');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM tratamento_impacto WHERE ropa_id = ?').bind(rid).first<{ n: number }>())!.n).toBe(0);
  });

  it('só o que a origem garante: base sem legítimo interesse vira "não"; sensível e transferência desmarcados ficam sem proposta', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/ropa`, { processing_purpose: 'Folha', legal_basis: 'Execução de contrato' });
    const rid = (await json<{ id: string }>(r)).id;
    const l = await ler(rid);
    expect(de(l, 'legitimo_interesse').da_atividade).toBe('nao');
    for (const id of ['sensiveis', 'vulneraveis', 'transferencia']) expect(de(l, id).da_atividade, id).toBeNull();
    // Sem base nenhuma, nem o "não" do legítimo interesse é garantido.
    expect(de(await ler(await novoRegistro('Sem base')), 'legitimo_interesse').da_atividade).toBeNull();
  });

  it('transferência registrada nas ligações também conta, e a resposta gravada continua sendo a da pessoa', async () => {
    const rid = await novoRegistro('Com transferência ligada');
    expect((await chamar(consultor, 'POST', `${base(rid)}/transferencias`, { pais: 'Chile' })).status).toBeLessThan(300);
    expect(de(await ler(rid), 'transferencia').da_atividade).toBe('sim');
    await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { transferencia: 'nao' } });
    expect(de(await ler(rid), 'transferencia')).toMatchObject({ resposta: 'nao', da_atividade: 'sim' });
  });

  it('cada pergunta traz um rótulo curto em português, com acento', async () => {
    const l = await ler(await novoRegistro('Rótulos'));
    expect(l.perguntas.every((p) => p.curto.length > 3)).toBe(true);
    expect(de(l, 'sensiveis').curto).toBe('há dados sensíveis');
    expect(de(l, 'legitimo_interesse').curto).toBe('a base é o legítimo interesse');
  });
});

describe('pergunta de alto risco pela rota', () => {
  it('salvarImpacto aceita alto_risco, o GET a devolve primeiro com grupo alto_risco e a recomendação segue a regra', async () => {
    const rid = await novoRegistro('Alto risco exemplo');
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { alto_risco: 'sim' } })).status).toBe(200);
    const get = await json<any>(await chamar(consultor, 'GET', `${base(rid)}/impacto`));
    expect(get.perguntas[0]).toMatchObject({ id: 'alto_risco', grupo: 'alto_risco', resposta: 'sim' });
    expect(get.recomendacao).toEqual({ resultado: 'recomendado', motivos: ['alto_risco'] });
  });

  it('processamento automatizado decisao propõe decisao_automatizada sim, sem gravar', async () => {
    const rid = await novoRegistro('Decisão automatizada exemplo');
    await env.DB.prepare(`UPDATE ropa_records SET processamento_automatizado = 'decisao' WHERE id = ?`).bind(rid).run();
    const get = await json<any>(await chamar(consultor, 'GET', `${base(rid)}/impacto`));
    expect(get.perguntas.find((p: any) => p.id === 'decisao_automatizada')).toMatchObject({ resposta: null, da_atividade: 'sim' });
    const apoio = await novoRegistro('Apoio exemplo');
    await env.DB.prepare(`UPDATE ropa_records SET processamento_automatizado = 'apoio' WHERE id = ?`).bind(apoio).run();
    const g2 = await json<any>(await chamar(consultor, 'GET', `${base(apoio)}/impacto`));
    expect(g2.perguntas.find((p: any) => p.id === 'decisao_automatizada').da_atividade).toBeNull();
  });

  it('atividade nova e vazia: o teste responde com as 14 perguntas sem resposta', async () => {
    const get = await json<any>(await chamar(consultor, 'GET', `${base(await novoRegistro('Vazia exemplo'))}/impacto`));
    expect(get.perguntas).toHaveLength(14);
    expect(get.perguntas.every((p: any) => p.resposta === null)).toBe(true);
    expect(get.recomendacao.resultado).toBe('incompleto');
  });
});
