import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, habilitarPrivacy, concederModulos } from './helpers/d1';
import { faixaDoCaminho } from '../src/modulos';
import { mascararPii } from '../src/services/rascunhos-privacy';

/**
 * Agentes de rascunho do n.privacy (fatia 5.3): sugestão para o tratamento, rascunho de resposta ao titular e de comunicação de
 * incidente. Nada é gravado no registro; só a trilha `agente.rascunho`, sem o texto. D1 real; `env.AI` sempre simulado.
 */
const P = 'ap-p';
const SO_ISO = 'ap-iso';

type Msg = { role: string; content: string };
const ia = {
  resposta: '' as string,
  falha: false,
  chamadas: [] as Msg[][],
};
const AI = {
  run: async (_modelo: string, payload: { messages: Msg[] }) => {
    ia.chamadas.push(payload.messages);
    if (ia.falha) throw new Error('modelo fora do ar');
    return { response: ia.resposta };
  },
};
const chamar = (h: Record<string, string>, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost/api/v1/projects/' + caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo ?? {}),
  }), { ...env, AI } as never);
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;
const trilha = async () => (await env.DB.prepare(`SELECT action, details, project_id FROM audit_logs WHERE action = 'agente.rascunho' ORDER BY created_at, rowid`).all<{ action: string; details: string; project_id: string }>()).results;
const enviado = () => ia.chamadas.at(-1)!.map((m) => m.content).join('\n');

const SUGESTAO = { base_legal: 'lgpd:art7:v', retencao: '5 anos após o fim do contrato', dpia_requerido: false, justificativa: 'Tratamento necessário ao contrato com o cliente.' };

let consultor: Record<string, string>, orgAdmin: Record<string, string>, orgAdminSemModulo: Record<string, string>, orgUser: Record<string, string>, consultorIso: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'I', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, SO_ISO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('ap-c', 'cons@ness.lat', 'x', 'C', 'consultor', NULL, 'org_ness'),
      ('ap-adm', 'adm@cliente.com', 'x', 'A', 'org_admin', ?1, 'org_ness'),
      ('ap-adm2', 'adm2@cliente.com', 'x', 'A2', 'org_admin', ?1, 'org_ness'),
      ('ap-usr', 'usr@cliente.com', 'x', 'U', 'org_user', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('ap-g1', ?, 'C', 'cons@ness.lat', 'consultor', 'Consultor'), ('ap-g2', ?, 'C', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, SO_ISO),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, recipients, international_transfers, owner, legal_basis, retention_period, dpia_required)
      VALUES ('ap-r1', ?, 'Gestão de contratos de clientes', 'Nome, e-mail, endereço', 'Clientes', 'Contabilidade', 0, 'Fulana Responsavel', NULL, NULL, 0)`).bind(P),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ap-r-iso', ?, 'Folha')`).bind(SO_ISO),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em)
      VALUES ('ap-t1', ?, 'TP-2026-0001', 'acesso', 'email', 'Beltrano Titular', 'beltrano@exemplo.com', 'Quero meus dados, CPF 000.000.000-00', '2026-10-01', '2026-10-16')`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ocorrido_em, ciencia_em, risco_titular, avaliacao_texto)
      VALUES ('ap-i1', ?, 'IN-2026-0001', 'Acesso indevido ao CRM', 'Credencial vazada usada por terceiro', NULL, '2026-10-10', 'relevante', 'Dados de contato de clientes expostos')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('ap-enc', ?, 'pessoa', 'Encarregada Exemplo', 'dpo@exemplo.com')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('ap-v1', ?1, 'ap-enc', 'encarregado', 'projeto', ?1)`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['ap-adm', 'ap-usr'], ['privacy']);
  consultor = await sessionFor({ id: 'ap-c', email: 'cons@ness.lat', role: 'consultor' });
  orgAdmin = await sessionFor({ id: 'ap-adm', email: 'adm@cliente.com', role: 'org_admin', client_project_id: P });
  orgAdminSemModulo = await sessionFor({ id: 'ap-adm2', email: 'adm2@cliente.com', role: 'org_admin', client_project_id: P });
  orgUser = await sessionFor({ id: 'ap-usr', email: 'usr@cliente.com', role: 'org_user', client_project_id: P });
  consultorIso = consultor;
});

beforeEach(() => { ia.resposta = ''; ia.falha = false; ia.chamadas = []; });

describe('faixa', () => {
  it('as três rotas são do n.privacy', () => {
    expect(faixaDoCaminho('/api/v1/projects/p1/ropa/r1/sugestao')).toBe('privacy');
    expect(faixaDoCaminho('/api/v1/projects/p1/titular-pedidos/t1/rascunho')).toBe('privacy');
    expect(faixaDoCaminho('/api/v1/projects/p1/incidentes/i1/rascunho-comunicacao')).toBe('privacy');
    expect(faixaDoCaminho('/api/v1/projects/p1/incidentes/i1')).toBe('nucleo');
  });
});

describe('sugestão para o tratamento', () => {
  it('devolve a sugestão validada, não grava no registro e deixa só a trilha sem o texto', async () => {
    ia.resposta = '```json\n' + JSON.stringify(SUGESTAO) + '\n```';
    const antes = await env.DB.prepare('SELECT * FROM ropa_records WHERE id = ?').bind('ap-r1').first();
    const r = await chamar(consultor, `${P}/ropa/ap-r1/sugestao`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toEqual({ ok: true, sugestao: SUGESTAO });
    expect(await env.DB.prepare('SELECT * FROM ropa_records WHERE id = ?').bind('ap-r1').first()).toEqual(antes);
    const t = await trilha();
    expect(t.at(-1)).toMatchObject({ action: 'agente.rascunho', project_id: P });
    expect(t.at(-1)!.details).toContain('ap-r1');
    expect(t.at(-1)!.details).not.toContain(SUGESTAO.justificativa);
  });

  it('manda ao modelo só a descrição do tratamento, nunca o nome do responsável', async () => {
    ia.resposta = JSON.stringify(SUGESTAO);
    await chamar(consultor, `${P}/ropa/ap-r1/sugestao`);
    const txt = enviado();
    expect(txt).toContain('Gestão de contratos de clientes');
    expect(txt).toContain('lgpd:art7:v');
    expect(txt).not.toContain('Fulana Responsavel');
  });

  it('saída fora do esquema (base inexistente, chave a mais, texto solto) é 502 e não deixa trilha', async () => {
    const n = (await trilha()).length;
    for (const resposta of [
      JSON.stringify({ ...SUGESTAO, base_legal: 'lgpd:art99' }),
      JSON.stringify({ ...SUGESTAO, extra: 'x' }),
      JSON.stringify({ ...SUGESTAO, dpia_requerido: 'sim' }),
      'Não sei responder.',
    ]) {
      ia.resposta = resposta;
      const r = await chamar(consultor, `${P}/ropa/ap-r1/sugestao`);
      expect(r.status, resposta).toBe(502);
      expect((await json<{ error: string }>(r)).error).toMatch(/IA/);
    }
    expect((await trilha()).length).toBe(n);
  });

  it('modelo fora do ar é 502 e a falha vai ao log (registraErro)', async () => {
    ia.falha = true;
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await chamar(consultor, `${P}/ropa/ap-r1/sugestao`);
      expect(r.status).toBe(502);
      const linhas = erro.mock.calls.map(([l]) => String(l));
      expect(linhas.some((l) => l.includes('"erro_handler"') && l.includes('modelo fora do ar'))).toBe(true);
    } finally { erro.mockRestore(); }
  });

  it('tratamento inexistente ou de outro projeto é 404', async () => {
    ia.resposta = JSON.stringify(SUGESTAO);
    expect((await chamar(consultor, `${P}/ropa/nao-existe/sugestao`)).status).toBe(404);
    expect((await chamar(consultor, `${P}/ropa/ap-r-iso/sugestao`)).status).toBe(404);
  });
});

describe('quem pode pedir', () => {
  it('org_admin com o módulo pode; sem o módulo, org_user e projeto sem n.privacy recebem 403', async () => {
    ia.resposta = JSON.stringify(SUGESTAO);
    expect((await chamar(orgAdmin, `${P}/ropa/ap-r1/sugestao`)).status).toBe(200);
    for (const [h, caminho] of [
      [orgAdminSemModulo, `${P}/ropa/ap-r1/sugestao`],
      [orgAdminSemModulo, `${P}/titular-pedidos/ap-t1/rascunho`],
      [orgAdminSemModulo, `${P}/incidentes/ap-i1/rascunho-comunicacao`],
      [orgUser, `${P}/ropa/ap-r1/sugestao`],
      [orgUser, `${P}/titular-pedidos/ap-t1/rascunho`],
      [orgUser, `${P}/incidentes/ap-i1/rascunho-comunicacao`],
      [consultorIso, `${SO_ISO}/ropa/ap-r-iso/sugestao`],
      [consultorIso, `${SO_ISO}/incidentes/x/rascunho-comunicacao`],
    ] as const) {
      const r = await chamar(h, caminho, { destino: 'anpd' });
      expect(r.status, caminho).toBe(403);
    }
  });
});

describe('rascunho de resposta ao titular', () => {
  it('manda o tipo e as datas, nunca nome, contato ou descrição; não grava a resposta', async () => {
    ia.resposta = JSON.stringify({ texto: 'Prezado(a) titular, <b>seguem</b> os dados.' });
    const r = await chamar(consultor, `${P}/titular-pedidos/ap-t1/rascunho`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await json(r)).toEqual({ ok: true, texto: 'Prezado(a) titular, <b>seguem</b> os dados.' });
    const txt = enviado();
    expect(txt).toContain('acesso');
    expect(txt).toContain('2026-10-16');
    for (const pessoal of ['Beltrano', 'beltrano@exemplo.com', '000.000.000-00', 'Quero meus dados']) expect(txt).not.toContain(pessoal);
    const p = await env.DB.prepare('SELECT resposta_texto, status FROM titular_pedidos WHERE id = ?').bind('ap-t1').first();
    expect(p).toEqual({ resposta_texto: null, status: 'recebido' });
    expect((await trilha()).at(-1)!.details).toContain('TP-2026-0001');
  });

  it('texto vazio ou formato errado é 502', async () => {
    for (const resposta of [JSON.stringify({ texto: '' }), JSON.stringify({ resposta: 'x' }), '']) {
      ia.resposta = resposta;
      expect((await chamar(consultor, `${P}/titular-pedidos/ap-t1/rascunho`)).status, resposta).toBe(502);
    }
  });

  it('pedido inexistente é 404', async () => {
    ia.resposta = JSON.stringify({ texto: 'x' });
    expect((await chamar(consultor, `${P}/titular-pedidos/nao-existe/rascunho`)).status).toBe(404);
  });
});

describe('rascunho de comunicação de incidente', () => {
  it('lista o que o incidente tem e o que falta (calculado do registro, não do modelo) e não registra a comunicação', async () => {
    ia.resposta = JSON.stringify({ texto: 'À ANPD: comunicamos o incidente.' });
    const r = await chamar(consultor, `${P}/incidentes/ap-i1/rascunho-comunicacao`, { destino: 'anpd' });
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await json<{ texto: string; presentes: string[]; faltando: string[] }>(r);
    expect(b.texto).toBe('À ANPD: comunicamos o incidente.');
    expect(b.presentes).toEqual(expect.arrayContaining(['Descrição do incidente', 'Data da ciência', 'Riscos e impactos aos titulares', 'Dados do encarregado']));
    expect(b.faltando).toEqual(expect.arrayContaining(['Data da ocorrência', 'Natureza e categoria dos dados afetados', 'Número de titulares afetados']));
    expect(b.presentes.some((x) => b.faltando.includes(x))).toBe(false);
    expect(enviado()).toContain('Credencial vazada');
    expect(enviado()).not.toContain('dpo@exemplo.com');
    expect(enviado()).not.toContain('Encarregada Exemplo');
    const i = await env.DB.prepare('SELECT status, comunicacao_anpd_em, comunicacao_titular_em FROM incidentes WHERE id = ?').bind('ap-i1').first();
    expect(i).toEqual({ status: 'aberto', comunicacao_anpd_em: null, comunicacao_titular_em: null });
    expect((await trilha()).at(-1)!.details).toContain('IN-2026-0001');
  });

  it('ao titular usa a lista do art. 9 (sem número de titulares)', async () => {
    ia.resposta = JSON.stringify({ texto: 'Prezado titular.' });
    const r = await chamar(consultor, `${P}/incidentes/ap-i1/rascunho-comunicacao`, { destino: 'titular' });
    expect(r.status).toBe(200);
    const b = await json<{ presentes: string[]; faltando: string[] }>(r);
    expect([...b.presentes, ...b.faltando]).not.toContain('Número de titulares afetados');
  });

  it('destino fora da lista é 400 sem chamar o modelo; incidente inexistente é 404', async () => {
    expect((await chamar(consultor, `${P}/incidentes/ap-i1/rascunho-comunicacao`, { destino: 'imprensa' })).status).toBe(400);
    expect(ia.chamadas.length).toBe(0);
    ia.resposta = JSON.stringify({ texto: 'x' });
    expect((await chamar(consultor, `${P}/incidentes/nao-existe/rascunho-comunicacao`, { destino: 'anpd' })).status).toBe(404);
  });
});

describe('minimização do texto livre', () => {
  it('mascararPii tira CPF (com e sem pontuação), e-mail e telefone; CNPJ e datas ficam', () => {
    const t = mascararPii('CPF 123.456.789-09 ou 12345678909, joao.silva+x@exemplo.com.br, (11) 98765-4321, 11 3456-7890, +55 21 912345678, sem DDD 98765-4321 e 3456-7890; CNPJ 12.345.678/0001-90 e 12345678000190; em 2026-10-10 às 10:30');
    for (const pii of ['123.456.789-09', '12345678909', 'joao.silva', '98765-4321', '3456-7890', '912345678']) expect(t).not.toContain(pii);
    expect(t).toContain('12.345.678/0001-90');
    expect(t).toContain('12345678000190');
    expect(t).toContain('2026-10-10 às 10:30');
    expect(mascararPii(null)).toBeNull();
  });

  it('CPF, e-mail e telefone na descrição do incidente não chegam ao modelo', async () => {
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ciencia_em, avaliacao_texto)
      VALUES ('ap-i2', ?, 'IN-2026-0002', 'Vazamento do titular 987.654.321-00', 'Planilha com 98765432100, fulano@exemplo.com e (21) 99876-5432', '2026-10-11', 'Ligar para 11 3333-4444')`).bind(P).run();
    ia.resposta = JSON.stringify({ texto: 'ok' });
    const r = await chamar(consultor, `${P}/incidentes/ap-i2/rascunho-comunicacao`, { destino: 'anpd' });
    expect(r.status, await r.clone().text()).toBe(200);
    const txt = enviado();
    for (const pii of ['987.654.321-00', '98765432100', 'fulano@exemplo.com', '99876-5432', '3333-4444']) expect(txt).not.toContain(pii);
    expect(txt).toContain('[CPF]');
    expect(txt).toContain('Planilha com');
  });

  it('CPF e e-mail no texto livre do tratamento não chegam ao modelo', async () => {
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, recipients)
      VALUES ('ap-r2', ?, 'Cobrança do cliente 111.222.333-44', 'CPF 11122233344, e-mail cobranca@exemplo.com', 'Enviar a contato@exemplo.com')`).bind(P).run();
    ia.resposta = JSON.stringify(SUGESTAO);
    const r = await chamar(consultor, `${P}/ropa/ap-r2/sugestao`);
    expect(r.status, await r.clone().text()).toBe(200);
    const txt = enviado();
    for (const pii of ['111.222.333-44', '11122233344', 'cobranca@exemplo.com', 'contato@exemplo.com']) expect(txt).not.toContain(pii);
    expect(txt).toContain('Cobrança do cliente [CPF]');
  });
});
