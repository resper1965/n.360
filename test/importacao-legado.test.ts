import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, habilitarPrivacy } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';
import { MODELOS, modeloDoCsv, itensDoModelo } from '../src/services/importacao-modelos';
import { motivoGenerico } from '../src/services/importacao';
import tratamentosCsv from '../docs/modelos-importacao/tratamentos.csv?raw';
import terceirosCsv from '../docs/modelos-importacao/terceiros.csv?raw';
import riscosCsv from '../docs/modelos-importacao/riscos.csv?raw';
import gapsCsv from '../docs/modelos-importacao/gaps.csv?raw';
import impactoCsv from '../docs/modelos-importacao/impacto.csv?raw';
import cicloCsv from '../docs/modelos-importacao/ciclo.csv?raw';
import basesCsv from '../docs/modelos-importacao/bases.csv?raw';
import ripdCsv from '../docs/modelos-importacao/ripd.csv?raw';
import liaCsv from '../docs/modelos-importacao/lia.csv?raw';
import pedidosCsv from '../docs/modelos-importacao/pedidos.csv?raw';

/**
 * Importação do legado (F6): entidades da atividade (risco, gap, impacto, ciclo, bases), RIPD e LIA com estrutura, modelos de CSV sem
 * IA e o relatório de reconciliação. D1 real; `env.AI` simulado e CONTADO (o caminho do modelo de CSV não pode chamá-lo).
 */
const P = 'leg-p';
const OUTRO = 'leg-outro';

type Msg = { role: string; content: string };
const ia = { tipo: 'avaliacao', extracao: (_t: string) => '{"avaliacoes":[]}', chamadas: [] as Msg[][] };
const AI = {
  run: async (_m: string, payload: { messages: Msg[] }) => {
    ia.chamadas.push(payload.messages);
    if (payload.messages[0].content.includes('CLASSIFICAR')) return { response: `{"tipo":"${ia.tipo}"}` };
    return { response: ia.extracao(payload.messages[1].content) };
  },
  toMarkdown: async (doc: { name: string; blob: Blob }) => ({ id: '1', name: doc.name, mimeType: doc.blob.type, tokens: 1, format: 'markdown', data: '' }),
};
const envComIa = (extra: Record<string, unknown> = {}) => ({ ...env, AI, ...extra });
const AGENTE = { userId: 'u-c', email: 'cons@ness.lat', projectId: P, concessaoId: 'c-leg' };

let consultor: Record<string, string>, cliente: Record<string, string>, consultorOutro: Record<string, string>;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost/api/v1/projects/' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' || metodo === 'DELETE' ? undefined : JSON.stringify(corpo ?? {}),
  }), envComIa(extra) as never);
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

type Item = { id: string; entidade: string; dados: Record<string, unknown>; decisao: string; confianca: string; origem: string | null; duplicata_de: string | null; motivo: string | null; aviso: string | null; registro_id: string | null };

async function novoLote() {
  const r = await chamar(consultor, 'POST', `${P}/importacoes`);
  expect(r.status).toBe(201);
  return (await json<{ id: string }>(r)).id;
}
async function enviarEProcessar(lote: string, nome: string, conteudo: string) {
  const fd = new FormData();
  fd.append('file', new File([conteudo], nome, { type: 'text/csv' }));
  const up = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/importacoes/${lote}/arquivos`, { method: 'POST', headers: consultor, body: fd }), envComIa() as never);
  expect(up.status, await up.clone().text()).toBe(201);
  const aid = (await json<{ id: string }>(up)).id;
  for (let i = 0; i < 20; i++) {
    const r = await json<{ restantes: number }>(await chamar(consultor, 'POST', `${P}/importacoes/${lote}/arquivos/${aid}/processar`));
    if (!(r.restantes > 0)) break;
  }
  return aid;
}
const lerLote = async (lote: string) => json<{ arquivos: { id: string; status: string; tipo: string; modelo: string }[]; itens: Item[] }>(await chamar(consultor, 'GET', `${P}/importacoes/${lote}`));
/** Aceita todos os pendentes do lote e confirma em rodadas, como a tela. */
async function aceitarEConfirmar(lote: string) {
  const { itens } = await lerLote(lote);
  const ids = itens.filter((i) => i.decisao === 'pendente').map((i) => i.id);
  if (ids.length) expect((await chamar(consultor, 'POST', `${P}/importacoes/${lote}/itens/decidir`, { ids, decisao: 'aceito' })).status).toBe(200);
  const resultados: { item_id: string; decisao: string; motivo?: string; aviso?: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await chamar(consultor, 'POST', `${P}/importacoes/${lote}/confirmar`);
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await json<{ resultados: typeof resultados; restantes: number }>(r);
    resultados.push(...b.resultados);
    if (!(b.restantes > 0)) break;
  }
  return resultados;
}
const ropaId = async (finalidade: string) => (await env.DB.prepare('SELECT id FROM ropa_records WHERE project_id = ? AND processing_purpose = ?').bind(P, finalidade).first<{ id: string }>())!.id;

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'O', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-c', 'cons@ness.lat', 'x', 'C', 'consultor', NULL, 'org_ness'), ('u-o', 'outro@ness.lat', 'x', 'O', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_admin', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', ?, 'C', 'cons@ness.lat', 'consultor', 'Consultor'), ('g2', ?, 'O', 'outro@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
  ]);
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-leg', 'u-c', ?, datetime('now','+30 days'))`).bind(P).run();
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-c', email: 'cons@ness.lat', role: 'consultor' });
  consultorOutro = await sessionFor({ id: 'u-o', email: 'outro@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_admin', client_project_id: P });
});

describe('modelos de CSV', () => {
  it('cada amostra de docs/modelos-importacao casa com o seu modelo, e só o cabeçalho exato casa', () => {
    const amostras: Record<string, string> = {
      tratamentos: tratamentosCsv, terceiros: terceirosCsv, riscos: riscosCsv, gaps: gapsCsv, impacto: impactoCsv, ciclo: cicloCsv, bases: basesCsv,
      ripd: ripdCsv, lia: liaCsv, pedidos: pedidosCsv,
    };
    expect(Object.keys(amostras).sort()).toEqual(MODELOS.map((m) => m.nome).sort());
    for (const [nome, csv] of Object.entries(amostras)) expect(modeloDoCsv(csv)?.nome, nome).toBe(nome);
    expect(modeloDoCsv('finalidade;titulares\nVendas;Clientes')).toBeNull(); // subconjunto: segue pela IA
    // LIA: o cabeçalho de sete colunas continua valendo; as 23 perguntas são opcionais, mas coluna desconhecida derruba o casamento.
    const lia7 = 'tratamento;conclusao;riscos;finalidade_legitima;necessidade;balanceamento;salvaguardas';
    expect(modeloDoCsv(`${lia7}\nX;;;;;;`)?.nome).toBe('lia');
    expect(modeloDoCsv(`${lia7};coleta_direta\nX;;;;;;;sim`)?.nome).toBe('lia');
    expect(modeloDoCsv(`${lia7};coluna_inventada\nX;;;;;;;x`)).toBeNull();
    expect(modeloDoCsv('tratamento;coleta_direta\nX;sim')).toBeNull(); // faltam as obrigatórias
    expect(modeloDoCsv('﻿"Atividade","Ameaça","Etapa","Situação","Item","Descrição"\n')).toBeNull();
    expect(modeloDoCsv('﻿"Atividade","Etapa","Situação","Item","Descrição"\nx,coleta,registrada,,\n')?.nome).toBe('ciclo'); // BOM, aspas, vírgula, acento
  });

  it('converte lista, sim/não, nota, data brasileira e opção; o terceiro ganha a avaliação aninhada', () => {
    const [r] = itensDoModelo(riscosCsv, MODELOS.find((m) => m.nome === 'riscos')!);
    expect(r.dados).toMatchObject({ atividade: 'Pagar salários', impacto: 4, probabilidade: 3, prazo: '2099-06-30', estrategia: 'mitigar', status: 'aberto' });
    const [t] = itensDoModelo(terceirosCsv, MODELOS.find((m) => m.nome === 'terceiros')!);
    expect(t.dados).toEqual({ nome: 'Provedor Nuvem Exemplo', tipo: 'grande_provedor', tratamentos: ['Pagar salários', 'Atender clientes'],
      ultima_avaliacao: { resultado: 'aprovado', valido_ate: '2099-12-31', metodo: 'Relatório de auditoria do provedor' } });
    const [tr] = itensDoModelo(tratamentosCsv, MODELOS.find((m) => m.nome === 'tratamentos')!);
    expect(tr.dados).toMatchObject({ transferencia_internacional: false, sistemas: ['Sistema Folha Exemplo'] });
  });
});

describe('migração do legado pelos modelos, sem IA', () => {
  let loteBase: string;
  it('tratamentos primeiro, depois o que é da atividade: grava tudo, com avisos guardados no item', async () => {
    loteBase = await novoLote();
    ia.chamadas = [];
    const aid = await enviarEProcessar(loteBase, 'tratamentos.csv', tratamentosCsv);
    expect(ia.chamadas).toHaveLength(0);
    const { arquivos, itens } = await lerLote(loteBase);
    expect(arquivos.find((a) => a.id === aid)).toMatchObject({ status: 'processado', tipo: 'inventario', modelo: 'modelo CSV: tratamentos' });
    expect(itens.map((i) => [i.entidade, i.confianca, i.decisao, i.origem])).toEqual([
      ['tratamento', 'alta', 'pendente', 'registro 1 do modelo tratamentos'], ['tratamento', 'alta', 'pendente', 'registro 2 do modelo tratamentos'],
    ]);

    // Todos os modelos da atividade no mesmo lote: a ordem da confirmação grava os tratamentos antes.
    for (const [nome, csv] of [['riscos.csv', riscosCsv], ['gaps.csv', gapsCsv], ['impacto.csv', impactoCsv], ['ciclo.csv', cicloCsv], ['bases.csv', basesCsv],
      ['ripd.csv', ripdCsv], ['lia.csv', liaCsv], ['terceiros.csv', terceirosCsv], ['pedidos.csv', pedidosCsv]]) await enviarEProcessar(loteBase, nome, csv);
    expect(ia.chamadas).toHaveLength(0);
    const resultados = await aceitarEConfirmar(loteBase);
    expect(resultados.filter((r) => r.decisao === 'recusado'), JSON.stringify(resultados)).toEqual([]);

    const folha = await ropaId('Pagar salários');
    const atend = await ropaId('Atender clientes');
    const maria = (await env.DB.prepare(`SELECT id FROM partes WHERE project_id = ? AND nome = 'Maria Exemplo'`).bind(P).first<{ id: string }>())!.id;
    const risco = await env.DB.prepare(`SELECT * FROM risks WHERE ropa_id = ?`).bind(folha).first<Record<string, unknown>>();
    expect(risco).toMatchObject({ threat: 'Acesso indevido à folha', impact: 4, probability: 3, risk_level: 'Medium', treatment: 'Mitigate',
      residual_level: 'Low', owner_parte_id: maria, status: 'Open', accepted_by: null });
    expect(risco!.asset_id).toBeTruthy();
    const acoes = (await env.DB.prepare(`SELECT title, due_date, risk_id, status, assigned_to_parte_id FROM corrective_actions WHERE ropa_id = ? ORDER BY title`).bind(folha).all()).results;
    expect(acoes).toEqual([
      { title: 'Formalizar a norma de acesso à folha', due_date: '2099-03-31', risk_id: risco!.id, status: 'In Progress', assigned_to_parte_id: maria },
      { title: 'Tratar o risco: Acesso indevido à folha', due_date: '2099-06-30', risk_id: risco!.id, status: 'Open', assigned_to_parte_id: maria },
    ]);
    // Risco só com nível: 3 x 3, com aviso guardado no item.
    expect(await env.DB.prepare(`SELECT impact, probability FROM risks WHERE ropa_id = ?`).bind(atend).first()).toEqual({ impact: 3, probability: 3 });
    const { itens: depois } = await lerLote(loteBase);
    expect(depois.find((i) => i.entidade === 'risco' && i.dados.atividade === 'Atender clientes')!.aviso).toContain('derivados do nível medio');
    // Ação com responsável que existe (João veio com o tratamento) não avisa.
    expect(depois.find((i) => i.entidade === 'gap' && i.dados.atividade === 'Atender clientes')!.aviso).toBeNull();

    const imp = (await env.DB.prepare(`SELECT pergunta, resposta FROM tratamento_impacto WHERE ropa_id = ? ORDER BY pergunta`).bind(atend).all<{ pergunta: string; resposta: string }>()).results;
    expect(imp).toHaveLength(13);
    expect(imp.find((x) => x.pergunta === 'monitoramento')!.resposta).toBe('sim');
    expect((await env.DB.prepare('SELECT impacto_finalizado_em AS f FROM ropa_records WHERE id = ?').bind(atend).first<{ f: string | null }>())!.f).toBeNull();
    const ciclo = (await env.DB.prepare(`SELECT etapa, situacao, item_id IS NOT NULL AS tem_item FROM tratamento_ciclo WHERE ropa_id = ? ORDER BY etapa`).bind(folha).all()).results;
    expect(ciclo).toEqual([
      { etapa: 'coleta', situacao: 'registrada', tem_item: 1 }, { etapa: 'compartilhamento_externo', situacao: 'registrada', tem_item: 0 },
      { etapa: 'eliminacao', situacao: 'nao_aplicavel', tem_item: 0 },
    ]);
    expect((await env.DB.prepare(`SELECT requisito_id FROM tratamento_bases WHERE ropa_id = ?`).bind(atend).all()).results).toEqual([{ requisito_id: 'lgpd:art7:i' }]);
    expect((await env.DB.prepare(`SELECT base_gdpr FROM ropa_records WHERE id = ?`).bind(atend).first<{ base_gdpr: string }>())!.base_gdpr).toContain('Art. 6(1)(f)');
    const dpia = await env.DB.prepare(`SELECT necessity_proportionality AS n, mitigation_measures AS m, residual_risk_level AS r, risks_identified AS ri FROM dpia_assessments WHERE ropa_id = ?`).bind(atend).first<Record<string, string>>();
    expect(dpia!.n).toContain('Base legal'); // o herdado do tratamento continua
    expect(dpia!.n).toContain('Só os dados necessários ao atendimento');
    expect(dpia!.m).toContain('Controle de acesso por perfil');
    expect(dpia!.r).toBe('Low');
    expect(dpia!.ri).toContain('Retenção além do prazo');
    const lia = await env.DB.prepare(`SELECT * FROM lia_assessments WHERE ropa_id = ?`).bind(atend).first<Record<string, unknown>>();
    expect(lia).toMatchObject({ finalidade_legitima: 'Responder às solicitações dos clientes', necessidade: 'Sem o histórico não há como atender',
      salvaguardas: 'Opção de não receber contato', status: 'rascunho', conclusao: null });
    expect(String(lia!.balanceamento)).toContain('Expectativa razoável');
    // As 23 perguntas da amostra vão para lia_respostas (todas texto livre, gravado como veio).
    const resp = Object.fromEntries((await env.DB.prepare(`SELECT pergunta, resposta FROM lia_respostas WHERE ropa_id = ?`).bind(atend).all<{ pergunta: string; resposta: string }>()).results.map((r) => [r.pergunta, r.resposta]));
    expect(Object.keys(resp)).toHaveLength(23);
    expect(resp).toMatchObject({ finalidades: 'Atender e responder aos clientes', tratamento_necessario: 'Sim, sem o histórico não há como atender', finalidade_sem_dados: 'Não', finalidade_menos_dados: 'Só nome e contato', coleta_direta: 'Sim, informados pelo próprio cliente' });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM titular_pedidos WHERE project_id = ?`).bind(P).first<{ n: number }>())!.n).toBe(2);
  }, 30_000); // dez arquivos num lote: sob carga passa dos 5 s, e a segunda tentativa acharia os tratamentos da primeira

  it('reimportar os mesmos arquivos não duplica nem sobrescreve: tudo nasce descartado como duplicata', async () => {
    // Uma pessoa mudou uma resposta do teste de impacto depois da importação.
    const atend = await ropaId('Atender clientes');
    await env.DB.prepare(`UPDATE tratamento_impacto SET resposta = 'nao' WHERE ropa_id = ? AND pergunta = 'monitoramento'`).bind(atend).run();
    const lote = await novoLote();
    for (const [nome, csv] of [['riscos.csv', riscosCsv], ['gaps.csv', gapsCsv], ['impacto.csv', impactoCsv], ['ciclo.csv', cicloCsv]]) await enviarEProcessar(lote, nome, csv);
    const { itens } = await lerLote(lote);
    expect(itens.every((i) => i.decisao === 'descartado' && i.duplicata_de), JSON.stringify(itens.map((i) => [i.entidade, i.decisao]))).toBe(true);
    // Aceitar mesmo assim: nada é sobrescrito nem duplicado.
    await chamar(consultor, 'POST', `${P}/importacoes/${lote}/itens/decidir`, { ids: itens.map((i) => i.id), decisao: 'aceito' });
    const resultados = [];
    for (let i = 0; i < 5; i++) {
      const b = await json<{ resultados: { decisao: string; motivo?: string }[]; restantes: number }>(await chamar(consultor, 'POST', `${P}/importacoes/${lote}/confirmar`));
      resultados.push(...b.resultados);
      if (!(b.restantes > 0)) break;
    }
    expect(resultados.every((r) => r.decisao === 'recusado')).toBe(true);
    expect(resultados.map((r) => r.motivo)).toEqual(expect.arrayContaining([
      'já existe risco com essa ameaça nesta atividade', 'já existe ação com esse título nesta atividade',
      'nada a gravar: as perguntas do arquivo já estavam respondidas na atividade (mantidas)', 'etapa já registrada nesta atividade (mantida)',
    ]));
    expect((await env.DB.prepare(`SELECT resposta FROM tratamento_impacto WHERE ropa_id = ? AND pergunta = 'monitoramento'`).bind(atend).first<{ resposta: string }>())!.resposta).toBe('nao');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM risks WHERE project_id = ?`).bind(P).first<{ n: number }>())!.n).toBe(2);
  });

  it('atividade inexistente recusa; responsável e ativo inexistentes viram aviso; aceite e PII não entram', async () => {
    const lote = await novoLote();
    const cab = Object.keys(MODELOS.find((m) => m.nome === 'riscos')!.colunas).join(';');
    await enviarEProcessar(lote, 'r.csv', `${cab}
Atividade que não existe;Ameaça qualquer;;;2;2;;mitigar;;;;;;aberto
Pagar salários;Vazamento por e-mail para fulano@exemplo.com;;Sistema Fantasma;5;5;;aceitar;;;;;Pessoa Fantasma;aceito
Pagar salários;;;;9;9;;mitigar;;;;;;aberto
`);
    const { itens } = await lerLote(lote);
    const invalido = itens.find((i) => i.decisao === 'recusado')!;
    expect(invalido.motivo).toMatch(/^registro 3: ameaca/);
    expect(JSON.stringify(itens)).not.toContain('fulano@exemplo.com');
    const r = await aceitarEConfirmar(lote);
    expect(r.find((x) => x.decisao === 'recusado')!.motivo).toBe('atividade "Atividade que não existe" não encontrada no RoPA deste projeto');
    const gravado = r.find((x) => x.decisao === 'gravado')!;
    expect(gravado.aviso).toContain('ativo "Sistema Fantasma" não está nos itens');
    expect(gravado.aviso).toContain('responsável "Pessoa Fantasma" não está nas partes');
    expect(gravado.aviso).toContain('o aceite do risco não foi importado');
    const risco = await env.DB.prepare(`SELECT threat, treatment, status, accepted_by, owner_parte_id FROM risks WHERE threat LIKE 'Vazamento%'`).first<Record<string, unknown>>();
    expect(risco).toEqual({ threat: 'Vazamento por e-mail para [dado pessoal]', treatment: 'Accept', status: 'Open', accepted_by: null, owner_parte_id: null });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM partes WHERE nome = 'Pessoa Fantasma'`).first<{ n: number }>())!.n).toBe(0);

    // Reconciliação deste lote: contagens e motivos sem nome nem e-mail.
    const rec = await json<{ entidades: { entidade: string; propostos: number; gravados: number; recusados: number; com_aviso: number }[]; motivos: { tipo: string; motivo: string; quantidade: number }[]; sem_pendencia: boolean }>(
      await chamar(consultor, 'GET', `${P}/importacoes/${lote}/reconciliacao`));
    expect(rec.entidades).toEqual([expect.objectContaining({ entidade: 'risco', propostos: 3, gravados: 1, recusados: 2, com_aviso: 1 })]);
    expect(rec.sem_pendencia).toBe(false);
    const textos = rec.motivos.map((m) => m.motivo).join('\n');
    expect(textos).toContain('atividade "..." não encontrada no RoPA deste projeto');
    expect(textos).toContain('registro <n>: ameaca');
    expect(textos).not.toMatch(/Fantasma|Atividade que não existe|fulano/);
  });
});

describe('caminho por IA: arquivo de avaliação traz riscos e ações', () => {
  it('o texto vai mascarado ao modelo e o item risco vira entidade risco; tipo fora da lista recusa', async () => {
    const lote = await novoLote();
    ia.tipo = 'avaliacao';
    let enviado = '';
    ia.extracao = (t) => {
      enviado = t;
      return JSON.stringify({ avaliacoes: [
        { tipo: 'risco', atividade: 'Pagar salários', ameaca: 'Perda de backup', impacto: 3, probabilidade: 2, estrategia: 'mitigar', confianca: 'alta', origem: 'linha' },
        { tipo: 'gap', atividade: 'Pagar salários', titulo: 'Testar restauração', confianca: 'media' },
        { tipo: 'politica', tratamento: 'x' },
      ] });
    };
    await enviarEProcessar(lote, 'planilha-de-riscos.csv', 'Risco;Contato\nPerda de backup;dpo@exemplo.com\n');
    expect(enviado).not.toContain('dpo@exemplo.com');
    const { itens } = await lerLote(lote);
    expect(itens.map((i) => [i.entidade, i.decisao])).toEqual([['risco', 'pendente'], ['gap', 'pendente'], ['dpia', 'recusado']]);
    expect(itens[2].motivo).toContain('informe dpia, lia, risco, gap, impacto ou ciclo');
  });
});

describe('reconciliação: acesso e CSV', () => {
  it('CSV com BOM, resumo por entidade e coluna do legado; trilha só com contagens', async () => {
    const lote = (await json<{ lotes: { id: string; itens: number }[] }>(await chamar(consultor, 'GET', `${P}/importacoes`))).lotes.at(-1)!.id;
    const r = await chamar(consultor, 'GET', `${P}/importacoes/${lote}/reconciliacao/csv`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/csv');
    const csv = await r.text();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Entidade";"No legado (preencher)";"Propostos"');
    expect(csv).toContain('"Tratamentos";"";"2";"0";"0";"2"');
    expect(csv).toContain('"Total"');
    expect(csv.indexOf('﻿', 1)).toBe(-1);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'importacao.reconciliacao' ORDER BY rowid DESC`).first<{ details: string }>();
    expect(trilha!.details).toMatch(/propostos, \d+ gravados, \d+ recusados$/);
  });

  it('cliente recebe 403, lote de outro projeto 404, projeto alheio 403 e o agente não lê', async () => {
    const lote = await novoLote();
    expect((await chamar(cliente, 'GET', `${P}/importacoes/${lote}/reconciliacao`)).status).toBe(403);
    expect((await chamar(consultorOutro, 'GET', `${OUTRO}/importacoes/${lote}/reconciliacao`)).status).toBe(404); // lote de outro projeto
    expect((await chamar(consultorOutro, 'GET', `${P}/importacoes/${lote}/reconciliacao/csv`)).status).toBe(403); // projeto alheio
    const agente = await app.fetch(new Request(`http://localhost/api/v1/projects/${P}/importacoes/${lote}/reconciliacao`), envComIa({ AGENTE }) as never);
    expect(agente.status).toBe(403);
  });

  it('motivo genérico tira aspas, ids, datas e dado pessoal', async () => {
    expect(await motivoGenerico('responsável "Maria" não está; risco 0f8e2a4c-1b2d-4e5f-8a9b-0c1d2e3f4a5b criado em 2026-01-02; contato ana@exemplo.com'))
      .toBe('responsável "..." não está; risco <id> criado em <data>; contato [dado pessoal]');
  });
});
