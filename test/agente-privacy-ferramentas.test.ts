import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, habilitarPrivacy } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { semearCatalogo } from '../src/services/requisitos';
import { f, tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';
import { TOOLS, READ_TOOLS, ferramentaPermitida } from '../mcp-server-niso/src/ferramentas';
import { INSTRUCOES, ROTEIROS, ROTEIROS_AUDITOR } from '../src/mcp/contexto';

/**
 * Ferramentas nomeadas do n.privacy no agente (remoto; o stdio usa as mesmas definições de ferramentas.ts). Leitura para o
 * consultor e o auditor; escrita só do consultor, sempre em rascunho (tratamento Draft, LIA rascunho, DPIA Draft), nunca
 * aprovando. D1 real, chamadas pelo /mcp com token OAuth de verdade.
 */
const P = 'pv-a';
const SO_ISO = 'pv-iso';
const OUTRA = 'pv-outra';
const LEITURA = ['niso_privacy_ropa', 'niso_privacy_ropa_detalhe', 'niso_privacy_requisitos_lacunas', 'niso_privacy_titular_pedidos',
  'niso_privacy_incidentes', 'niso_privacy_terceiros', 'niso_privacy_encarregado', 'niso_privacy_ponto_de_partida'];
const ESCRITA = ['niso_privacy_propor_tratamento', 'niso_privacy_atualizar_tratamento', 'niso_privacy_ligar_tratamento',
  'niso_privacy_criar_dpia_do_tratamento', 'niso_privacy_rascunhar_lia', 'niso_privacy_registrar_pedido_titular',
  'niso_privacy_registrar_incidente', 'niso_privacy_ligar_documento_requisito'];
const json = { 'Content-Type': 'application/json' };
const comoAgente = (caminho: string, props: Record<string, unknown>, init: RequestInit = {}) =>
  worker.fetch(new Request('http://localhost' + caminho, init), { ...workerEnv(), AGENTE: props } as any);
const dados = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);
const linha = <T = Record<string, unknown>>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();

async function nomesDaLista(token: string): Promise<string[]> {
  const r = await f('/mcp', {
    method: 'POST',
    headers: { Host: 'niso.ness.com.br', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const texto = await r.text();
  const corpo = r.headers.get('Content-Type')?.includes('text/event-stream') ? texto.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6) : texto;
  return JSON.parse(corpo).result.tools.map((t: { name: string }) => t.name);
}

describe('ferramentas nomeadas do n.privacy (definições)', () => {
  it('as 16 existem, com esquema estrito; leitura para todos os papéis, escrita só do consultor', () => {
    for (const n of [...LEITURA, ...ESCRITA]) {
      const t = TOOLS.find((x) => x.name === n);
      expect(t, n).toBeTruthy();
      expect(t!.inputSchema.additionalProperties, n).toBe(false);
      expect((t!.inputSchema.required as string[])[0], n).toBe('projectId');
    }
    for (const n of LEITURA) {
      expect(READ_TOOLS.has(n), n).toBe(true);
      for (const papel of ['readonly', 'auditor', 'consultant'] as const) expect(ferramentaPermitida(n, papel), `${n} ${papel}`).toBe(true);
    }
    for (const n of ESCRITA) {
      expect(ferramentaPermitida(n, 'consultant'), n).toBe(true);
      expect(ferramentaPermitida(n, 'auditor'), n).toBe(false);
      expect(ferramentaPermitida(n, 'readonly'), n).toBe(false);
      expect(TOOLS.find((x) => x.name === n)!.description, n).toContain('PEÇA APROVAÇÃO HUMANA');
    }
    // Nenhuma ferramenta nomeada para o que está fora do agente: rascunho de IA, importação, aprovar, publicar, encerrar, revogar.
    expect(TOOLS.map((t) => t.name).filter((n) => /sugest|importa|aprova|publica|encerra|revoga|conclu/.test(n))).toEqual([]);
  });

  it('roteiros e handshake falam das ferramentas e das skills novas', () => {
    expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
    expect(INSTRUCOES).toContain('niso_privacy_');
    for (const x of ['niso_privacy_propor_tratamento', 'niso_privacy_ligar_tratamento', 'niso_privacy_rascunhar_lia', 'implantacao-privacy',
      'migracao-programa', 'avaliacao-terceiros', 'atendimento-titular']) expect(ROTEIROS, x).toContain(x);
    // Roteiro 5 segue as abas da atividade, na ordem, e diz o que é da pessoa.
    const r5 = ROTEIROS.split('\n').find((l) => l.startsWith('5.'))!;
    for (const b of ['Escopo', 'Tratamento de Dados', 'Agentes de Tratamento', 'Medidas de Segurança', 'Base Jurídica', 'Controle de GAPs', 'Teste de Impacto', 'Riscos', 'Logs']) expect(r5, b).toContain(b);
    expect(r5.indexOf('Escopo')).toBeLessThan(r5.indexOf('Logs'));
    expect(r5).toContain('anexos, relatório e aprovação são de uma pessoa');
    for (const n of LEITURA) expect(ROTEIROS_AUDITOR, n).toContain(n);
    // Incidente com risco sem_risco ou baixo: a comunicação é "nao_exigida" (não pendente, não atrasada); os dois roteiros explicam.
    for (const r of [ROTEIROS, ROTEIROS_AUDITOR]) expect(r).toMatch(/nao_exigida[^\n]*(sem_risco|baixo)/);
  });
});

describe('ferramentas nomeadas do n.privacy (MCP remoto)', () => {
  let token: string, tokenIso: string, tokenSemModulo: string, tokenAuditor: string;
  let ropaId: string;

  beforeAll(async () => {
    await applySchema();
    await semearCatalogo(env.DB);
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-pv', 'Outra consultoria', 'outra-pv')`),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES (?, 'Acme', 'LGPD', 'controller', 'Active'), (?, 'So ISO', 'ISO 27001', 'controller', 'Active')`).bind(P, SO_ISO),
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Outra', 'LGPD', 'controller', 'Active', 'org-pv')`).bind(OUTRA),
      ...['pc', 'sm', 'au'].flatMap((k) => [
        env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'consultor')`).bind(`u-${k}`, `${k}@ness.lat`, senha, k),
        env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, ?, ?, 'consultor', 'Consultor')`).bind(P, k, `${k}@ness.lat`),
      ]),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'pc', 'pc@ness.lat', 'consultor', 'Consultor')`).bind(SO_ISO),
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('dp-a', ?, 'Pessoas'), ('dp-b', ?, 'Financeiro')`).bind(P, P),
      env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('it-a', ?, 'Sistema de folha', 'sistema'), ('it-b', ?, 'Planilha de benefícios', 'base')`).bind(P, P),
      env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo) VALUES ('doc-a', ?, 'Política de privacidade')`).bind(P),
      env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('doc-a', 'lgpd:art6', ?)`).bind(P),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('ro-outra', ?, 'Cobrança da outra')`).bind(OUTRA),
    ]);
    await habilitarPrivacy(P);
    // u-sm: o projeto tem o n.privacy, a pessoa não.
    await env.DB.prepare(`DELETE FROM usuario_modulos WHERE user_id = 'u-sm' AND modulo = 'privacy'`).run();
    token = await tokenDoAgente('pc@ness.lat', P);
    tokenIso = await tokenDoAgente('pc@ness.lat', SO_ISO);
    tokenSemModulo = await tokenDoAgente('sm@ness.lat', P);
    tokenAuditor = await tokenDoAgente('au@ness.lat', P, 'auditor');
  }, 60_000);

  it('tools/list: consultor vê as de leitura e escrita; auditor só as de leitura', async () => {
    const cons = await nomesDaLista(token);
    for (const n of [...LEITURA, ...ESCRITA]) expect(cons, n).toContain(n);
    const aud = await nomesDaLista(tokenAuditor);
    for (const n of LEITURA) expect(aud, n).toContain(n);
    for (const n of ESCRITA) expect(aud, n).not.toContain(n);
    // Contagem citada em docs/agente/README.md e mcp-server-niso/README.md.
    expect([cons.length, aud.length]).toEqual([53, 22]);
  });

  it('propor_tratamento cria em Draft com os campos da entrevista e a base do catálogo; não aceita status', async () => {
    const res = await chamarFerramenta(token, 'niso_privacy_propor_tratamento', {
      projectId: P, processing_purpose: 'Folha de pagamento: pagar salários e recolher encargos', data_subjects: 'Colaboradores, Dependentes',
      criancas_adolescentes: true, data_categories: 'Identificação, Financeiro', dados_sensiveis: false,
      legal_basis: 'Cumprimento de obrigação legal ou regulatória', base_legal_id: 'lgpd:art7:ii', retention_period: '5 anos após o desligamento',
      international_transfers: false, dpia_required: true,
    });
    expect(res.isError, res.content[0].text).toBeFalsy();
    const d = dados(res);
    expect(d.status).toBe('Draft');
    ropaId = d.id;
    const r = await linha<any>(`SELECT * FROM ropa_records WHERE id = ?`, ropaId);
    expect(r).toMatchObject({ project_id: P, status: 'Draft', base_legal_id: 'lgpd:art7:ii', criancas_adolescentes: 1, dpia_required: 1, ciso_approved_by: null, ceo_approved_by: null });

    const comStatus = await chamarFerramenta(token, 'niso_privacy_propor_tratamento', { projectId: P, processing_purpose: 'Outra atividade', status: 'Approved' });
    expect(comStatus.isError).toBe(true);
    const dup = await chamarFerramenta(token, 'niso_privacy_propor_tratamento', { projectId: P, processing_purpose: 'folha de pagamento:  pagar salários e recolher encargos' });
    expect(dup.isError).toBe(true);
    expect(dup.content[0].text).toContain(ropaId);
    expect((await linha<any>(`SELECT COUNT(*) AS n FROM ropa_records WHERE project_id = ?`, P)).n).toBe(1);
    const ator = await linha<any>(`SELECT actor FROM audit_logs WHERE action = 'ropa_created' ORDER BY rowid DESC`);
    expect(ator.actor).toBe(`agente de pc@ness.lat (Acme / ${P})`);
  });

  it('atualizar_tratamento muda só o enviado, mantém Draft e recusa status', async () => {
    const res = await chamarFerramenta(token, 'niso_privacy_atualizar_tratamento', { projectId: P, ropaId, recipients: 'Contabilidade terceirizada' });
    expect(res.isError, res.content[0].text).toBeFalsy();
    const r = await linha<any>(`SELECT recipients, retention_period, status FROM ropa_records WHERE id = ?`, ropaId);
    expect(r).toEqual({ recipients: 'Contabilidade terceirizada', retention_period: '5 anos após o desligamento', status: 'Draft' });
    for (const args of [{ projectId: P, ropaId, status: 'Active' }, { projectId: P, ropaId }]) {
      expect((await chamarFerramenta(token, 'niso_privacy_atualizar_tratamento', args)).isError, JSON.stringify(args)).toBe(true);
    }
    expect((await linha<any>(`SELECT status FROM ropa_records WHERE id = ?`, ropaId)).status).toBe('Draft');
  });

  it('ligar_tratamento soma itens e departamentos e grava a base legal', async () => {
    let res = await chamarFerramenta(token, 'niso_privacy_ligar_tratamento', { projectId: P, ropaId, itens: ['it-a'], departamentos: ['dp-a'] });
    expect(res.isError, res.content[0].text).toBeFalsy();
    res = await chamarFerramenta(token, 'niso_privacy_ligar_tratamento', { projectId: P, ropaId, itens: ['it-b'], base_legal_id: 'lgpd:art7:v', legal_basis: 'Execução de contrato' });
    expect(res.isError, res.content[0].text).toBeFalsy();
    const itens = (await env.DB.prepare(`SELECT item_id FROM tratamento_itens WHERE ropa_id = ? ORDER BY item_id`).bind(ropaId).all<any>()).results.map((x) => x.item_id);
    expect(itens).toEqual(['it-a', 'it-b']);
    expect((await linha<any>(`SELECT departamento_id FROM tratamento_departamentos WHERE ropa_id = ?`, ropaId)).departamento_id).toBe('dp-a');
    expect(await linha(`SELECT base_legal_id, legal_basis, status FROM ropa_records WHERE id = ?`, ropaId)).toEqual({ base_legal_id: 'lgpd:art7:v', legal_basis: 'Execução de contrato', status: 'Draft' });
    // Base inexistente no catálogo e item de outro projeto são recusados pela rota.
    expect((await chamarFerramenta(token, 'niso_privacy_ligar_tratamento', { projectId: P, ropaId, base_legal_id: 'lgpd:art99' })).isError).toBe(true);
  });

  it('criar_dpia_do_tratamento cria Draft ligada; a segunda vez recusa com o id', async () => {
    const res = await chamarFerramenta(token, 'niso_privacy_criar_dpia_do_tratamento', { projectId: P, ropaId });
    expect(res.isError, res.content[0].text).toBeFalsy();
    const dpia = await linha<any>(`SELECT id, status, ropa_id FROM dpia_assessments WHERE ropa_id = ?`, ropaId);
    expect(dpia).toMatchObject({ status: 'Draft', ropa_id: ropaId });
    const de_novo = await chamarFerramenta(token, 'niso_privacy_criar_dpia_do_tratamento', { projectId: P, ropaId });
    expect(de_novo.isError).toBe(true);
    expect(de_novo.content[0].text).toContain('409');
  });

  it('rascunhar_lia grava rascunho, não conclui, e não mexe em LIA concluída', async () => {
    const res = await chamarFerramenta(token, 'niso_privacy_rascunhar_lia', { projectId: P, ropaId, finalidade_legitima: 'Prevenir fraude', necessidade: 'Sem os dados não há como', balanceamento: 'Expectativa razoável', conclusao: 'prevalece' });
    expect(res.isError, res.content[0].text).toBeFalsy();
    expect(await linha(`SELECT status, concluida_por FROM lia_assessments WHERE ropa_id = ?`, ropaId)).toEqual({ status: 'rascunho', concluida_por: null });
    expect((await chamarFerramenta(token, 'niso_privacy_rascunhar_lia', { projectId: P, ropaId, status: 'concluida' })).isError).toBe(true);
    await env.DB.prepare(`UPDATE lia_assessments SET status = 'concluida', concluida_em = '2026-10-12', concluida_por = 'pessoa@cliente.com' WHERE ropa_id = ?`).bind(ropaId).run();
    const fechada = await chamarFerramenta(token, 'niso_privacy_rascunhar_lia', { projectId: P, ropaId, salvaguardas: 'x' });
    expect(fechada.isError).toBe(true);
    expect(await linha(`SELECT status, salvaguardas FROM lia_assessments WHERE ropa_id = ?`, ropaId)).toEqual({ status: 'concluida', salvaguardas: null });
  });

  it('registrar_pedido_titular e registrar_incidente registram e avaliam, sem encerrar nem definir prazo', async () => {
    const ped = await chamarFerramenta(token, 'niso_privacy_registrar_pedido_titular', { projectId: P, tipo: 'acesso', canal: 'email', descricao: 'Pediu cópia dos dados', recebido_em: '2026-10-10' });
    expect(ped.isError, ped.content[0].text).toBeFalsy();
    expect(dados(ped).protocolo).toMatch(/^PT-2026-/);
    expect((await chamarFerramenta(token, 'niso_privacy_registrar_pedido_titular', { projectId: P, tipo: 'acesso', prazo_em: '2030-01-01' })).isError).toBe(true);
    expect((await linha<any>(`SELECT status FROM titular_pedidos WHERE project_id = ?`, P)).status).toBe('recebido');

    const inc = await chamarFerramenta(token, 'niso_privacy_registrar_incidente', { projectId: P, titulo: 'Envio de planilha ao destinatário errado', ciencia_em: '2026-10-12', risco_titular: 'baixo', avaliacao_texto: 'Dados de contato, destinatário interno' });
    expect(inc.isError, inc.content[0].text).toBeFalsy();
    expect(await linha(`SELECT status, risco_titular FROM incidentes WHERE id = ?`, dados(inc).id)).toEqual({ status: 'avaliado', risco_titular: 'baixo' });
  });

  it('ligar_documento_requisito soma ao que já estava ligado', async () => {
    const res = await chamarFerramenta(token, 'niso_privacy_ligar_documento_requisito', { projectId: P, documentoId: 'doc-a', requisitos: ['lgpd:art37'] });
    expect(res.isError, res.content[0].text).toBeFalsy();
    const ligados = (await env.DB.prepare(`SELECT requisito_id FROM documento_requisitos WHERE documento_id = 'doc-a' ORDER BY requisito_id`).all<any>()).results.map((x) => x.requisito_id);
    expect(ligados).toEqual(['lgpd:art37', 'lgpd:art6']);
  });

  it('as 8 de leitura funcionam no projeto fixo, para consultor e auditor', async () => {
    for (const tk of [token, tokenAuditor]) {
      for (const n of LEITURA) {
        const res = await chamarFerramenta(tk, n, n === 'niso_privacy_ropa_detalhe' ? { projectId: P, ropaId } : { projectId: P });
        expect(res.isError, `${n}: ${res.content[0].text}`).toBeFalsy();
      }
    }
    const ropa = dados(await chamarFerramenta(token, 'niso_privacy_ropa', { projectId: P }));
    expect(ropa.total).toBe(1);
    expect(ropa.registros[0]).toMatchObject({ id: ropaId, nao_informado: [], ligacoes: { itens: 2, departamentos: 1, dpias: 1, dpia_pendente: false, base_legal: 'art. 7, V' } });
    const det = dados(await chamarFerramenta(token, 'niso_privacy_ropa_detalhe', { projectId: P, ropaId }));
    expect(det.registro.id).toBe(ropaId);
    expect(det.ligacoes.itens.map((i: any) => i.id).sort()).toEqual(['it-a', 'it-b']);
    expect(det.lia.status).toBe('concluida');
    // Ciclo de vida, bases adicionais/GDPR e teste de impacto (F3 e 0072) também vêm no detalhe.
    expect(det.ciclo.map((e: any) => e.etapa)).toContain('coleta');
    expect(det.bases).toMatchObject({ adicionais: [], base_gdpr: null });
    expect(det.impacto.recomendacao).toBeTruthy();
    expect(Array.isArray(det.impacto.perguntas)).toBe(true);
    const lac = dados(await chamarFerramenta(token, 'niso_privacy_requisitos_lacunas', { projectId: P }));
    expect(Object.keys(lac)).toEqual(['lgpd', 'anpd']);
    expect(dados(await chamarFerramenta(token, 'niso_privacy_requisitos_lacunas', { projectId: P, fonte: 'anpd' })).fonte).toBe('anpd');
  });

  it('auditor: escrita nomeada recusada, mesmo chamada direto, e nada grava', async () => {
    const antes = (await linha<any>(`SELECT COUNT(*) AS n FROM ropa_records`)).n;
    for (const n of ESCRITA) {
      const res = await chamarFerramenta(tokenAuditor, n, { projectId: P, ropaId, processing_purpose: 'Auditor tentando', tipo: 'acesso', titulo: 'x', ciencia_em: '2026-10-12', documentoId: 'doc-a', requisitos: ['lgpd:art7'] });
      expect(res.isError, n).toBe(true);
      expect(res.content[0].text, n).toContain('indisponível para o agente auditor');
    }
    expect((await linha<any>(`SELECT COUNT(*) AS n FROM ropa_records`)).n).toBe(antes);
  });

  it('faixa: projeto sem n.privacy e pessoa sem n.privacy recebem 403; o RoPA (núcleo) segue legível sem as ligações', async () => {
    for (const n of ['niso_privacy_titular_pedidos', 'niso_privacy_terceiros', 'niso_privacy_encarregado', 'niso_privacy_requisitos_lacunas']) {
      const iso = await chamarFerramenta(tokenIso, n, { projectId: SO_ISO });
      expect(iso.isError, n).toBe(true);
      expect(iso.content[0].text, n).toContain('403');
      const pessoa = await chamarFerramenta(tokenSemModulo, n, { projectId: P });
      expect(pessoa.isError, n).toBe(true);
      expect(pessoa.content[0].text, n).toContain('403');
    }
    expect((await chamarFerramenta(tokenSemModulo, 'niso_privacy_rascunhar_lia', { projectId: P, ropaId, salvaguardas: 'x' })).isError).toBe(true);
    const ropa = await chamarFerramenta(tokenSemModulo, 'niso_privacy_ropa', { projectId: P });
    expect(ropa.isError, ropa.content[0].text).toBeFalsy();
    expect(dados(ropa).aviso).toMatch(/ligações não lidas: HTTP 403/);
  });

  it('outro projeto (de outra organização): recusado pelo projeto fixo e pela rota', async () => {
    const pool: Record<string, unknown> = { ropaId: 'ro-outra', processing_purpose: 'x', tipo: 'acesso', titulo: 'x', ciencia_em: '2026-10-12', documentoId: 'doc-a', requisitos: ['lgpd:art7'], retention_period: 'x', salvaguardas: 'x', itens: ['it-a'] };
    for (const n of [...LEITURA, ...ESCRITA]) {
      const props = Object.keys(TOOLS.find((t) => t.name === n)!.inputSchema.properties as object);
      const args = Object.fromEntries([['projectId', OUTRA], ...Object.entries(pool).filter(([k]) => props.includes(k))]);
      const res = await chamarFerramenta(token, n, args);
      expect(res.isError, n).toBe(true);
      expect(res.content[0].text, n).toContain('fora do escopo');
    }
    const id = await chamarFerramenta(token, 'niso_privacy_atualizar_tratamento', { projectId: P, ropaId: 'ro-outra', retention_period: 'invadido' });
    expect(id.isError).toBe(true);
    const { id: concessaoId } = (await linha<any>(`SELECT id FROM agente_concessoes WHERE user_id = 'u-pc' AND project_id = ?`, P))!;
    const forjado = await comoAgente('/api/v1/ropa/ro-outra', { userId: 'u-pc', email: 'pc@ness.lat', projectId: P, concessaoId },
      { method: 'PUT', headers: json, body: JSON.stringify({ processing_purpose: 'x', retention_period: 'invadido' }) });
    expect(forjado.status).toBeGreaterThanOrEqual(400);
    expect(await linha(`SELECT retention_period FROM ropa_records WHERE id = 'ro-outra'`)).toEqual({ retention_period: null });
  });

  it('o que está fora do agente continua recusado pelo niso_executar', async () => {
    const { id: incId } = (await linha<any>(`SELECT id FROM incidentes WHERE project_id = ?`, P))!;
    for (const [metodo, caminho, corpo] of [
      ['POST', `/api/v1/projects/${P}/ropa/${ropaId}/sugestao`, {}],
      ['POST', `/api/v1/projects/${P}/incidentes/${incId}/encerrar`, {}],
      ['POST', `/api/v1/projects/${P}/incidentes/${incId}/rascunho-comunicacao`, { destino: 'anpd' }],
      ['POST', `/api/v1/projects/${P}/consentimentos/qualquer/revogar`, {}],
      ['POST', `/api/v1/projects/${P}/importacoes`, {}],
      ['POST', `/api/v1/projects/${P}/ropa/${ropaId}/revoke-approval`, { role: 'todas', reason: 'motivo longo' }],
      ['PUT', '/api/v1/parametros-legais/prazo_titular', { valor: 1 }],
    ] as const) {
      const res = await chamarFerramenta(token, 'niso_executar', { metodo, caminho, corpo, confirmado_pelo_usuario: true });
      expect(res.isError, caminho).toBe(true);
      expect(res.content[0].text, caminho).toContain('HTTP 403');
    }
    // Parecidos por significado (embeddings) são da tela: recusados pelo FORA_DO_AGENTE, antes do corte de papel da rota.
    const similares = await chamarFerramenta(token, 'niso_executar', { metodo: 'POST', caminho: `/api/v1/projects/${P}/similares`, corpo: { tipo: 'item', nome: 'folha' } });
    expect(similares.content[0].text).toContain('fora do alcance do agente');
    // Concluir ou reabrir a LIA, nem pelo genérico.
    for (const status of ['concluida', 'rascunho']) {
      const lia = await chamarFerramenta(token, 'niso_executar', { metodo: 'PUT', caminho: `/api/v1/projects/${P}/ropa/${ropaId}/lia`, corpo: { status } });
      expect(lia.content[0].text, status).toContain('HTTP 403');
    }
    expect((await linha<any>(`SELECT status FROM lia_assessments WHERE ropa_id = ?`, ropaId)).status).toBe('concluida');
    // Aprovar exige autoridade na matriz de governança: o agente não a tem.
    const aprovar = await chamarFerramenta(token, 'niso_executar', { metodo: 'POST', caminho: `/api/v1/projects/${P}/ropa/${ropaId}/approve`, corpo: { role: 'ciso' } });
    expect(aprovar.isError).toBe(true);
    expect(await linha(`SELECT status, ciso_approved_by FROM ropa_records WHERE id = ?`, ropaId)).toEqual({ status: 'Draft', ciso_approved_by: null });
    expect((await linha<any>(`SELECT status FROM incidentes WHERE id = ?`, incId)).status).toBe('avaliado');
  });
});
