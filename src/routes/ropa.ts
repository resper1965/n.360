import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { semRastros, logAudit, requireResourceAccess, escapeHtml, autoridadeDeAssinatura, recusaDeAssinatura, recusaSenhaDeOutro, erro500, registraErro, PODE_REVOGAR_APROVACAO, setParcial, valoresParciais, refForaDoProjeto } from '../helpers';
import { COLUNAS_REVOGACAO } from './controls';
import { validateBody, ropaSchema, copilotoRopaSchema, ropaApprovalSchema, revogarRopaSchema, ropaImportarSchema, liaSalvarSchema, tratamentoItensSchema, tratamentoDepartamentosSchema, tratamentoTransferenciaSchema, tratamentoImpactoSchema, tratamentoCicloSchema, tratamentoBasesSchema, riscoAtividadeCriarSchema, riscoAtividadeAtualizarSchema, acaoAtividadeCriarSchema, acaoAtividadeAtualizarSchema } from '../schemas';
import { listarRiscos, criarRisco, atualizarRisco, apagarRisco, listarAcoes, criarAcao, atualizarAcao, apagarAcao, riscosDoMapa, gapsDoProjeto, sqlAreaDaAtividade } from '../services/riscos-atividade';
import { lerImpacto, salvarImpacto } from '../services/impacto';
import { lerCiclo, salvarCiclo, cicloEmTexto, etapasDe, type EtapaLida } from '../services/ciclo';
import { lerBases, salvarBases, basesEmTexto, type BaseLida } from '../services/bases';
import { criarTransferencia, definirLigacao, diagramaDoTratamento, lerLigacoes, removerTransferencia } from '../services/tratamentos';
import { aprovacoesDoProjeto } from '../services/documentos';
import { importarTratamentos } from '../services/tratamentos-importar';
import { apagarLia, criarDpiaDoTratamento, lerLia, liasDoProjeto, salvarLia } from '../services/lia';
import { conferirPedidosDoDocumento } from './pedidos';
import { sugerirTratamento } from '../services/rascunhos-privacy';
import { copilotoDoRopa, podePedirCopiloto } from '../services/copiloto-ropa';
import { lerEmpresa } from '../services/empresas';
import { situacaoDaAtividade } from '../services/ropa-abas/situacao';
import { atividadeDoProjeto } from '../services/ropa-abas/comum';
import { textosDaColeta, mesmosNomes } from '../services/ropa-abas/derivada';

export const ropaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectRopaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Atividade cancelada não recebe escrita por nenhuma sub-rota antiga (impacto, riscos, ações, ciclo, bases, itens...): a ficha em abas já
 * recusa com 409 e as duas portas têm de fechar igual. Só reativar (POST /situacao, no router da ficha) e revogar a aprovação passam.
 * Id que não é de atividade do projeto (`importar`, `copiloto`) segue para o handler.
 */
projectRopaApp.use('/:recordId/*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.path.endsWith('/revoke-approval')) return next();
  const a = await atividadeDoProjeto(c.env.DB, c.req.param('projectId')!, c.req.param('recordId')!);
  if (a?.status === 'Inactive') return c.json({ error: 'Atividade cancelada: reative para editar' }, 409);
  return next();
});

/** A base legal é um requisito do catálogo global (fatia 4.1): existe ou não, sem tenant. */
const baseLegalInexistente = async (db: D1Database, id: unknown) =>
  typeof id === 'string' && id !== '' && !(await db.prepare('SELECT 1 FROM requisitos WHERE id = ?').bind(id).first());

/**
 * Riscos que a importação de programa não trouxe: o INSERT grava 0 nas três colunas (NOT NULL) quando o item não tinha o campo, e
 * a tela afirmaria "não". Enquanto o registro não for editado (updated_at = created_at), devolve quais ficaram sem informação, a
 * partir dos dados do item importado. A planilha CSV não deixa rastro por registro: fica de fora (sem coluna nova).
 */
const RISCOS_IMPORTADOS: [coluna: string, campo: string][] = [['dados_sensiveis', 'dados_sensiveis'], ['criancas_adolescentes', 'criancas_adolescentes'], ['international_transfers', 'transferencia_internacional']];
const SQL_DADOS_IMPORTADOS = `(SELECT ii.dados FROM importacao_itens ii WHERE ii.registro_id = r.id AND ii.project_id = r.project_id
  AND ii.entidade = 'tratamento' AND ii.decisao = 'gravado' AND r.updated_at = r.created_at LIMIT 1) AS dados_importados`;
export function naoInformados(dados: unknown): string[] {
  if (typeof dados !== 'string') return [];
  let d: Record<string, unknown>;
  try { d = JSON.parse(dados); } catch { return []; }
  return RISCOS_IMPORTADOS.filter(([, campo]) => typeof d[campo] !== 'boolean').map(([coluna]) => coluna);
}
const comNaoInformados = ({ dados_importados, ...r }: Record<string, unknown>): Record<string, unknown> => ({ ...r, nao_informado: naoInformados(dados_importados) });

const VAZIOS_ROPA: Record<string, unknown> = {
  processing_purpose: null, data_categories: null, data_subjects: null, legal_basis: null, consent_details: null,
  data_subject_rights_details: null, retention_period: null, recipients: null, international_transfers: 0,
  transfer_safeguards: null, dpia_required: 0, dados_sensiveis: 0, criancas_adolescentes: 0, status: 'Draft', owner: null, owner_parte_id: null, base_legal_id: null,
};
/** As colunas do registro que entram no conteúdo congelado do pedido de aprovação (`DOCUMENTOS.tratamento` em `services/pedidos.ts`). */
const COLUNAS_CONGELADAS_ROPA = ['processing_purpose', 'data_categories', 'data_subjects', 'legal_basis', 'base_legal_id', 'retention_period',
  'recipients', 'international_transfers', 'transfer_safeguards', 'dpia_required', 'dados_sensiveis', 'criancas_adolescentes'];

// Direct ROPA operations (/api/v1/ropa)
ropaApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    // Ausente preserva o valor gravado (setParcial); o transform de boolLike deixa a chave com undefined.
    const body = Object.fromEntries(Object.entries(valid.data as Record<string, unknown>).filter(([, v]) => v !== undefined)) as any;
    const atual = await c.env.DB.prepare(`SELECT status, project_id, ${COLUNAS_CONGELADAS_ROPA.join(', ')} FROM ropa_records WHERE id = ?`)
      .bind(id).first<Record<string, unknown> & { status: string | null; project_id: string | null }>();
    if (atual?.status === 'Inactive') return c.json({ error: 'Atividade cancelada: reative para editar' }, 409);
    // O projeto vem do ROPA gravado, nunca do corpo.
    // A2: com titulares na Coleta, o texto deles é derivado: só o valor derivado passa (spec 4.4).
    if (atual?.project_id && (Object.hasOwn(body, 'data_subjects') || Object.hasOwn(body, 'data_categories'))) {
      const coleta = await textosDaColeta(c.env.DB, atual.project_id, id);
      const divergente = (Object.hasOwn(body, 'data_subjects') && !mesmosNomes(body.data_subjects, coleta.data_subjects))
        || (Object.hasOwn(body, 'data_categories') && !mesmosNomes(body.data_categories, coleta.data_categories));
      if (coleta.temTitulares && divergente) return c.json({ error: 'Titulares e dados desta atividade são registrados na etapa Coleta' }, 409);
    }
    const fora = await refForaDoProjeto(c.env.DB, atual?.project_id, body, ['owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    if (await baseLegalInexistente(c.env.DB, body.base_legal_id)) return c.json({ error: 'base_legal_id inexistente no catálogo de requisitos' }, 400);
    // Sair de 'Approved' pelo PUT deixaria as assinaturas na linha sem motivo nem trilha: é revogação.
    if (atual?.status === 'Approved' && Object.hasOwn(body, 'status')) {
      return c.json({ error: 'ROPA aprovado não muda de status pela edição. Para reabrir, use "Revogar aprovação" (motivo obrigatório).' }, 400);
    }
    for (const k of ['international_transfers', 'dpia_required', 'dados_sensiveis', 'criancas_adolescentes']) if (k in body && body[k] !== null) body[k] = body[k] ? 1 : 0;
    // Aprovação direta antiga (assinaturas na linha): mudar conteúdo aprovado a derruba, como no RIPD. Compara o valor que SERIA gravado.
    const gravar = valoresParciais(body, VAZIOS_ROPA);
    const texto = (x: unknown) => (typeof x === 'string' ? x.replace(/\r\n/g, '\n') : x ?? null);
    const mudaram = atual?.status === 'Approved' ? COLUNAS_CONGELADAS_ROPA.filter((col) => Object.hasOwn(gravar, col) && texto(gravar[col]) !== texto(atual[col])) : [];
    const p = setParcial(body, VAZIOS_ROPA);
    if (p.sql) await c.env.DB.prepare(`UPDATE ropa_records SET ${p.sql}, updated_at=? WHERE id=?`).bind(...p.binds, new Date().toISOString(), id).run();
    if (mudaram.length) {
      await c.env.DB.prepare(`UPDATE ropa_records SET ${COLUNAS_REVOGACAO.ciso}, ${COLUNAS_REVOGACAO.ceo}, status = 'Under Review' WHERE id = ?`).bind(id).run();
      await logAudit(c.env.DB, 'ropa.aprovacao_invalidada', c.get('user')?.email || 'system', `ROPA ${id}: conteúdo mudou (${mudaram.join(', ')}); aprovação e assinaturas zeradas, voltou a revisão.`, '', '', atual?.project_id ?? undefined);
    }
    // A2: texto plano gravado agora precisa ser materializado de novo na próxima leitura das etapas (a marca de materialização sai).
    if (atual?.project_id && (Object.hasOwn(body, 'data_subjects') || Object.hasOwn(body, 'data_categories'))) {
      await c.env.DB.prepare('UPDATE ropa_records SET etapas_materializadas_em = NULL WHERE id = ? AND project_id = ?').bind(id, atual.project_id).run();
    }
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_updated', user?.email || 'system', `ROPA ${id} updated`);
    if (atual?.project_id) await conferirPedidosDoDocumento(c, 'tratamento', id, atual.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar ROPA', e);
  }
});

ropaApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'ropa_records', id, c.get('user'));
    const atual = await c.env.DB.prepare('SELECT status FROM ropa_records WHERE id = ?').bind(id).first<{ status: string | null }>();
    if (atual?.status === 'Approved') {
      return c.json({ error: 'ROPA aprovado não pode ser excluído. Revogue a aprovação antes (motivo obrigatório).' }, 409);
    }
    // As ligações caem por FK; os vínculos de parte não têm FK (alvo polimórfico) e saem aqui, junto.
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM parte_vinculos WHERE alvo_tipo = 'tratamento' AND alvo_id = ? AND NOT EXISTS (SELECT 1 FROM ropa_records WHERE id = ? AND status = 'Approved')").bind(id, id),
      c.env.DB.prepare("DELETE FROM ropa_records WHERE id = ? AND status IS NOT 'Approved'").bind(id),
    ]);
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_deleted', user?.email || 'system', `ROPA ${id} deleted`);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao excluir ROPA', e);
  }
});

// Project ROPA operations (/api/v1/projects/:projectId/ropa)
projectRopaApp.get('/', async (c) => {
  const projectId = c.req.param('projectId');
  const result = await c.env.DB.prepare(
    `SELECT r.*, pa.nome AS owner_parte_nome, ${sqlAreaDaAtividade('r.id', 'r.project_id')} AS area, ${SQL_DADOS_IMPORTADOS} FROM ropa_records r
     LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
     WHERE r.project_id = ? ORDER BY r.created_at DESC`
  ).bind(projectId).all();
  const aprovacoes = await aprovacoesDoProjeto(c.env.DB, projectId!, undefined, 'tratamento');
  const records = semRastros(result.results as Record<string, unknown>[]).map(comNaoInformados).map((r) => {
    const aprovacao_pedido = aprovacoes.get(String(r.id)) ?? { ciso: null, ceo: null };
    const { codigo, rotulo } = situacaoDaAtividade({ status: r.status as string | null, reaberta_em: r.reaberta_em as string | null, aprovacao: aprovacao_pedido, aprovacao_anterior: null });
    return { ...r, aprovacao_pedido, situacao: { codigo, rotulo } };
  });
  return c.json({ ok: true, records });
});

projectRopaApp.post('/', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, ropaSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    if (await baseLegalInexistente(c.env.DB, body.base_legal_id)) return c.json({ error: 'base_legal_id inexistente no catálogo de requisitos' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, consent_details, data_subject_rights_details, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required, dados_sensiveis, criancas_adolescentes, status, owner, owner_parte_id, base_legal_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`
    ).bind(
      id, projectId, body.processing_purpose, body.data_categories ?? null, body.data_subjects ?? null,
      body.legal_basis ?? null, body.consent_details ?? null, body.data_subject_rights_details ?? null,
      body.retention_period ?? null, body.recipients ?? null, body.international_transfers ? 1 : 0,
      body.transfer_safeguards ?? null, body.dpia_required ? 1 : 0, body.dados_sensiveis ? 1 : 0, body.criancas_adolescentes ? 1 : 0, body.owner ?? null, body.owner_parte_id || null, body.base_legal_id || null, now, now
    ).run();
    const user = c.get('user');
    await logAudit(c.env.DB, 'ropa_created', user?.email || 'system', `ROPA ${id} created`);
    return c.json({ ok: true, id }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha ao criar ROPA', e);
  }
});

// Importação por planilha (fatia 4.4): cria `Draft`, devolve as linhas recusadas, reimportar não duplica.
projectRopaApp.post('/importar', async (c) => {
  try {
    const v = await validateBody(c, ropaImportarSchema);
    if (!v.success) return v.response;
    const r = await importarTratamentos(c.env.DB, c.req.param('projectId')!, c.get('user')?.email || 'system', v.data.csv);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json(r);
  } catch (e) { return erro500(c, 'Falha ao importar o RoPA', e); }
});

// Mapa de risco do n.privacy (F2): todos os riscos do projeto que têm atividade. Antes das rotas `/:recordId/...`.
projectRopaApp.get('/riscos-mapa', async (c) => c.json({ riscos: await riscosDoMapa(c.env.DB, c.req.param('projectId')!) }));
// Listas do legado (spec 2026-10-19): Gaps e LIA do projeto. Só leitura; o agente lê.
projectRopaApp.get('/gaps', async (c) => c.json({ gaps: await gapsDoProjeto(c.env.DB, c.req.param('projectId')!) }));
projectRopaApp.get('/lias', async (c) => c.json({ lias: await liasDoProjeto(c.env.DB, c.req.param('projectId')!) }));

// ─── LIA e DPIA do tratamento (fatia 5) ───────────────────────────────────────────────────────────

// Copiloto da entrevista (atividade nova): proposta de respostas a partir de uma descrição livre. Nada é gravado; faixa privacy.
projectRopaApp.post('/copiloto', async (c) => {
  try {
    if (!podePedirCopiloto(c.get('user'))) return c.json({ error: 'O copiloto é pedido pela equipe da consultoria ou pelo administrador do cliente' }, 403);
    const v = await validateBody(c, copilotoRopaSchema);
    if (!v.success) return v.response;
    return c.json(await copilotoDoRopa(c.env as unknown as Parameters<typeof copilotoDoRopa>[0], c.req.param('projectId')!, v.data.descricao, c.get('user')));
  } catch (e) { return erro500(c, 'Falha no copiloto da entrevista', e); }
});

projectRopaApp.get('/:recordId/lia', async (c) => {
  const projectId = c.req.param('projectId')!;
  if (!(await c.env.DB.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(c.req.param('recordId'), projectId).first())) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  return c.json({ lia: await lerLia(c.env.DB, projectId, c.req.param('recordId')) });
});

projectRopaApp.put('/:recordId/lia', async (c) => {
  try {
    const v = await validateBody(c, liaSalvarSchema);
    if (!v.success) return v.response;
    // O agente (MCP) rascunha; concluir ou reabrir a LIA é ato de uma pessoa, pela interface.
    if (c.get('user')?.agente === true && v.data.status !== undefined) {
      return c.json({ error: 'Forbidden: concluir ou reabrir a LIA é ato humano, pela interface' }, 403);
    }
    const r = await salvarLia(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'), c.get('user')?.email || 'system', v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, r.criada ? 201 : 200) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar a LIA', e); }
});

projectRopaApp.delete('/:recordId/lia', async (c) => {
  try {
    const ok = await apagarLia(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'), c.get('user')?.email || 'system');
    return ok ? c.json({ ok: true }) : c.json({ error: 'LIA não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao apagar a LIA', e); }
});

// Teste de impacto (0072): fora do conteúdo congelado da aprovação, então não substitui pedido nenhum (sem conferirPedidosDoDocumento).
projectRopaApp.get('/:recordId/impacto', async (c) => {
  const r = await lerImpacto(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.put('/:recordId/impacto', async (c) => {
  try {
    const v = await validateBody(c, tratamentoImpactoSchema);
    if (!v.success) return v.response;
    // O agente (MCP) responde; finalizar o teste é ato de uma pessoa, pela interface.
    if (c.get('user')?.agente === true && v.data.finalizar !== undefined) {
      return c.json({ error: 'Forbidden: finalizar o teste de impacto é ato humano, pela interface' }, 403);
    }
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await salvarImpacto(c.env.DB, projectId, c.req.param('recordId'), ator, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Trilha com os ids das perguntas, nunca texto livre.
    const fim = v.data.finalizar === undefined ? '' : v.data.finalizar ? '; finalizado' : '; reaberto';
    await logAudit(c.env.DB, 'ropa.impacto', ator, `ROPA ${c.req.param('recordId')}: teste de impacto (${Object.keys(v.data.respostas).join(', ') || 'sem respostas'})${fim}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao gravar o teste de impacto', e); }
});

// ─── Ciclo de vida e bases legais da atividade (F3, migration 0074) ───
// Fora do conteúdo congelado da aprovação: nenhuma das duas rotas substitui pedido (sem conferirPedidosDoDocumento). O agente (MCP)
// grava as duas, como grava itens e departamentos: nenhuma é ato que a regra reserve a uma pessoa.
projectRopaApp.get('/:recordId/ciclo', async (c) => {
  const etapas = await lerCiclo(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return etapas ? c.json({ etapas }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.put('/:recordId/ciclo', async (c) => {
  try {
    const v = await validateBody(c, tratamentoCicloSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await salvarCiclo(c.env.DB, projectId, c.req.param('recordId'), ator, v.data.etapas);
    if (!r.ok) return c.json({ error: r.error, ...(r.invalidos ? { invalidos: r.invalidos } : {}) }, r.status);
    // Trilha com as etapas e a situação, nunca a descrição (texto livre).
    await logAudit(c.env.DB, 'ropa.ciclo', ator, `ROPA ${c.req.param('recordId')}: ciclo de vida (${v.data.etapas.map((e) => `${e.etapa} ${e.situacao}`).join(', ')})`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao gravar o ciclo de vida', e); }
});

projectRopaApp.get('/:recordId/bases', async (c) => {
  const r = await lerBases(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.put('/:recordId/bases', async (c) => {
  try {
    const v = await validateBody(c, tratamentoBasesSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await salvarBases(c.env.DB, projectId, c.req.param('recordId'), v.data);
    if (!r.ok) return c.json({ error: r.error, ...(r.invalidos ? { invalidos: r.invalidos } : {}) }, r.status);
    // Trilha com os nomes dos campos e os ids do catálogo (públicos), nunca o texto livre.
    const campos = [v.data.adicionais ? `adicionais: ${v.data.adicionais.map((a) => a.requisito_id).join(', ') || 'nenhuma'}` : '', v.data.base_gdpr !== undefined ? 'base_gdpr' : ''].filter(Boolean);
    await logAudit(c.env.DB, 'ropa.bases', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: bases legais (${campos.join('; ') || 'sem mudança'})`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao gravar as bases legais', e); }
});

// ─── Riscos e ações da atividade (F2, migration 0073): o MESMO cadastro do n.iso, filtrado pela atividade ───
// O agente (MCP) cria e edita; aceitar risco é ato do cliente (recusado sempre); concluir ação é decisão do consultor (`niso_concluir_acao`);
// apagar pede a confirmação de `acaoDestrutiva`.
const ATO_HUMANO = { risco: 'aceitar risco é ato humano, pela interface' };

projectRopaApp.get('/:recordId/riscos', async (c) => {
  const r = await listarRiscos(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json({ riscos: r }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.post('/:recordId/riscos', async (c) => {
  try {
    const v = await validateBody(c, riscoAtividadeCriarSchema);
    if (!v.success) return v.response;
    if (c.get('user')?.agente === true && v.data.status === 'Accepted') return c.json({ error: `Forbidden: ${ATO_HUMANO.risco}` }, 403);
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await criarRisco(c.env.DB, projectId, c.req.param('recordId'), ator, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.risco', ator, `ROPA ${c.req.param('recordId')}: risco ${r.id} criado`, '', '', projectId);
    return c.json({ ok: true, id: r.id, risk_level: r.risk_level }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o risco da atividade', e); }
});

projectRopaApp.put('/:recordId/riscos/:riscoId', async (c) => {
  try {
    const v = await validateBody(c, riscoAtividadeAtualizarSchema);
    if (!v.success) return v.response;
    if (c.get('user')?.agente === true && v.data.status === 'Accepted') return c.json({ error: `Forbidden: ${ATO_HUMANO.risco}` }, 403);
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await atualizarRisco(c.env.DB, projectId, c.req.param('recordId'), c.req.param('riscoId'), ator, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Trilha com os nomes dos campos, nunca os valores.
    await logAudit(c.env.DB, 'ropa.risco', ator, `ROPA ${c.req.param('recordId')}: risco ${c.req.param('riscoId')} alterado (${Object.keys(v.data).join(', ')})`, '', '', projectId);
    return c.json({ ok: true, risk_level: r.risk_level });
  } catch (e) { return erro500(c, 'Falha ao atualizar o risco da atividade', e); }
});

projectRopaApp.delete('/:recordId/riscos/:riscoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const ok = await apagarRisco(c.env.DB, projectId, c.req.param('recordId'), c.req.param('riscoId'));
    if (!ok) return c.json({ error: 'Risco da atividade não encontrado' }, 404);
    await logAudit(c.env.DB, 'ropa.risco', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: risco ${c.req.param('riscoId')} apagado (ações ligadas mantidas)`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao apagar o risco da atividade', e); }
});

projectRopaApp.get('/:recordId/acoes', async (c) => {
  const r = await listarAcoes(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json({ acoes: r }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.post('/:recordId/acoes', async (c) => {
  try {
    const v = await validateBody(c, acaoAtividadeCriarSchema);
    if (!v.success) return v.response;
    if (c.get('user')?.agente === true && !c.get('user')?.agente_decisao && v.data.status === 'Closed') return c.json({ error: 'Forbidden: concluir ação é decisão do consultor: use niso_concluir_acao' }, 403);
    const projectId = c.req.param('projectId')!;
    const r = await criarAcao(c.env.DB, projectId, c.req.param('recordId'), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.acao', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ação ${r.id} criada`, '', '', projectId);
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a ação da atividade', e); }
});

projectRopaApp.put('/:recordId/acoes/:acaoId', async (c) => {
  try {
    const v = await validateBody(c, acaoAtividadeAtualizarSchema);
    if (!v.success) return v.response;
    if (c.get('user')?.agente === true && !c.get('user')?.agente_decisao && v.data.status === 'Closed') return c.json({ error: 'Forbidden: concluir ação é decisão do consultor: use niso_concluir_acao' }, 403);
    const projectId = c.req.param('projectId')!;
    const r = await atualizarAcao(c.env.DB, projectId, c.req.param('recordId'), c.req.param('acaoId'), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.acao', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ação ${c.req.param('acaoId')} alterada (${Object.keys(v.data).join(', ')})`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a ação da atividade', e); }
});

projectRopaApp.delete('/:recordId/acoes/:acaoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const ok = await apagarAcao(c.env.DB, projectId, c.req.param('recordId'), c.req.param('acaoId'));
    if (!ok) return c.json({ error: 'Ação da atividade não encontrada' }, 404);
    await logAudit(c.env.DB, 'ropa.acao', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ação ${c.req.param('acaoId')} apagada`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao apagar a ação da atividade', e); }
});

projectRopaApp.post('/:recordId/dpia', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const lig = await lerLigacoes(c.env.DB, projectId, c.req.param('recordId'));
    if (!lig) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
    const r = await criarDpiaDoTratamento(c.env.DB, projectId, c.req.param('recordId'), c.get('user')?.email || 'system', lig);
    if (!r.ok) return c.json({ error: r.error, ...('id' in r ? { id: r.id } : {}) }, r.status);
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a DPIA do tratamento', e); }
});

// ─── Ligações do tratamento (fatia 4.1): itens, departamentos, transferências; partes por parte_vinculos ───

projectRopaApp.get('/:recordId/ligacoes', async (c) => {
  const r = await lerLigacoes(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

// Sugestão de IA (base legal, retenção, DPIA): nada é gravado; aplicar é o PUT /api/v1/ropa/:id de sempre.
projectRopaApp.post('/:recordId/sugestao', async (c) => {
  try {
    const r = await sugerirTratamento(c.env, c.req.param('projectId')!, c.req.param('recordId'), c.get('user'), (e) => registraErro(c, e));
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gerar a sugestão para o tratamento', e); }
});

projectRopaApp.get('/:recordId/diagrama', async (c) => {
  const mermaid = await diagramaDoTratamento(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return mermaid === null ? c.json({ error: 'Registro do RoPA não encontrado' }, 404) : c.json({ mermaid });
});

projectRopaApp.put('/:recordId/itens', async (c) => {
  try {
    const v = await validateBody(c, tratamentoItensSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirLigacao(c.env.DB, projectId, c.req.param('recordId'), 'itens', v.data.itens);
    if (!r) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Item inexistente ou de outro projeto', invalidos: r.invalidos }, 400);
    await logAudit(c.env.DB, 'ropa.itens', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ${r.total} itens ligados`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os itens', e); }
});

projectRopaApp.put('/:recordId/departamentos', async (c) => {
  try {
    const v = await validateBody(c, tratamentoDepartamentosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirLigacao(c.env.DB, projectId, c.req.param('recordId'), 'departamentos', v.data.departamentos);
    if (!r) return c.json({ error: 'Registro do RoPA não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Departamento inexistente ou de outro projeto', invalidos: r.invalidos }, 400);
    await logAudit(c.env.DB, 'ropa.departamentos', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: ${r.total} departamentos ligados`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os departamentos', e); }
});

projectRopaApp.post('/:recordId/transferencias', async (c) => {
  try {
    const v = await validateBody(c, tratamentoTransferenciaSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await criarTransferencia(c.env.DB, projectId, c.req.param('recordId'), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.transferencia', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: transferência para ${v.data.pais}`, '', '', projectId);
    await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao registrar a transferência', e); }
});

projectRopaApp.delete('/:recordId/transferencias/:transferenciaId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const ok = await removerTransferencia(c.env.DB, projectId, c.req.param('recordId'), c.req.param('transferenciaId'));
    if (ok) await conferirPedidosDoDocumento(c, 'tratamento', c.req.param('recordId'), projectId);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Transferência não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao remover a transferência', e); }
});

// Revogar a aprovação (F6, decisão D1): ato do humano, pela interface, de platform_admin e do
// administrador do cliente. NÃO pede a senha do aprovador (como a revogação de controle), mas o
// motivo é obrigatório e vai para a trilha com o projeto. Sem assinatura nenhuma sobrando, o ROPA
// volta a rascunho; com uma sobrando (a aprovação grava `Approved` já na primeira), continua aprovado.
projectRopaApp.post('/:recordId/revoke-approval', async (c) => {
  try {
    const user = c.get('user');
    if (!PODE_REVOGAR_APROVACAO.has(user?.role ?? '')) {
      return c.json({ error: 'Forbidden: revogar aprovação é do administrador do cliente ou da plataforma' }, 403);
    }
    const projectId = c.req.param('projectId');
    const recordId = c.req.param('recordId');
    const valid = await validateBody(c, revogarRopaSchema);
    if (!valid.success) return valid.response;
    const { role, reason } = valid.data;

    const atual = await c.env.DB.prepare('SELECT ciso_approved_by, ceo_approved_by FROM ropa_records WHERE id = ? AND project_id = ?')
      .bind(recordId, projectId).first<{ ciso_approved_by: string | null; ceo_approved_by: string | null }>();
    if (!atual) return c.json({ error: 'ROPA não encontrado' }, 404);

    const limpaCiso = role !== 'ceo';
    const limpaCeo = role !== 'ciso';
    const sobra = (!limpaCiso && !!atual.ciso_approved_by) || (!limpaCeo && !!atual.ceo_approved_by);
    const colunas = [limpaCiso ? COLUNAS_REVOGACAO.ciso : '', limpaCeo ? COLUNAS_REVOGACAO.ceo : ''].filter(Boolean).join(', ');
    await c.env.DB.prepare(`UPDATE ropa_records SET ${colunas}, status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`)
      .bind(sobra ? 'Approved' : 'Draft', recordId, projectId).run();

    const quais = role === 'todas' ? 'todas as aprovações' : role === 'ciso' ? 'a aprovação do Líder SGSI' : 'a aprovação da Direção Executiva';
    await logAudit(c.env.DB, 'ropa.approval_revoked', user.email, `ROPA ${recordId}: revogada ${quais}${sobra ? '' : '; voltou a Draft'}.`, reason, c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true, role, status: sobra ? 'Approved' : 'Draft' });
  } catch (e: any) {
    return erro500(c, 'Erro ao revogar aprovação do ROPA', e);
  }
});

projectRopaApp.post('/:recordId/approve', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const recordId = c.req.param('recordId');
    const valid = await validateBody(c, ropaApprovalSchema);
    if (!valid.success) return valid.response;
    const { role } = valid.data;
    const user = c.get('user');

    if (role !== 'ciso' && role !== 'ceo') {
      return c.json({ error: 'Papel de aprovação inválido' }, 400);
    }

    // A autoridade sai da matriz de governança DESTE projeto — nunca do papel
    // de plataforma. Antes, quem não estava na matriz caía num `if (userGov)`
    // e passava sem checagem nenhuma: assinava os dois papéis do mesmo ROPA.
    const autoridade = await autoridadeDeAssinatura(c.env.DB, projectId || '', user);
    const recusa = recusaDeAssinatura(autoridade, role) ?? await recusaSenhaDeOutro(c.env.DB, user.id);
    if (recusa) return c.json({ error: recusa }, 403);

    const dbUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(user.email).first<any>();

    // O nome da matriz vem primeiro: é sob aquela designação que a pessoa
    // assina, e é ele que o auditor confere contra o organograma do projeto.
    let approvedBy = autoridade.nome || dbUser?.name || user.email;
    const now = new Date().toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '127.0.0.1';
    const ua = c.req.header('User-Agent') || 'Unknown';

    if (role === 'ciso') {
      await c.env.DB.prepare(
        'UPDATE ropa_records SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?, status = ? WHERE id = ? AND project_id = ?'
      ).bind(approvedBy, now, ip, ua, 'Approved', recordId, projectId).run();
      await logAudit(c.env.DB, 'ropa.approved_ciso', user.email, `ROPA ${recordId} aprovado pelo Líder SGSI (${approvedBy})`);
    } else {
      await c.env.DB.prepare(
        'UPDATE ropa_records SET ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ?, status = ? WHERE id = ? AND project_id = ?'
      ).bind(approvedBy, now, ip, ua, 'Approved', recordId, projectId).run();
      await logAudit(c.env.DB, 'ropa.approved_ceo', user.email, `ROPA ${recordId} aprovado pela Direção Executiva (${approvedBy})`);
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Erro ao aprovar ROPA', e);
  }
});

projectRopaApp.get('/report', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.html('<h3>Projeto não encontrado</h3>', 404);
    // Cabeçalho do controlador (art. 37): cadastro da empresa (0071) e o encarregado (vínculo `encarregado` no projeto).
    const empresa = await lerEmpresa(c.env.DB, projectId!);
    const dpo = await c.env.DB.prepare(
      `SELECT p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
        WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' ORDER BY v.created_at LIMIT 1`
    ).bind(projectId).first<{ nome: string; email: string | null }>();
    const cnpjFmt = empresa?.cnpj ? String(empresa.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null;
    const endereco = empresa ? [[empresa.logradouro, empresa.numero].filter(Boolean).join(', '), empresa.complemento, empresa.bairro,
      [empresa.municipio, empresa.uf].filter(Boolean).join('/'), empresa.cep].filter(Boolean).join(' · ') : '';
    const linhaControlador = [
      empresa?.razao_social ? `<strong>Controlador:</strong> ${escapeHtml(String(empresa.razao_social))}` : '',
      cnpjFmt ? `CNPJ ${escapeHtml(cnpjFmt)}` : empresa?.documento_alternativo ? `Documento ${escapeHtml(String(empresa.documento_alternativo))}` : '',
      endereco ? escapeHtml(endereco) : '',
      dpo ? `<strong>Encarregado:</strong> ${escapeHtml(dpo.nome)}${dpo.email ? ` (${escapeHtml(dpo.email)})` : ''}` : '',
    ].filter(Boolean).join('<br>');

    const { results: records } = await c.env.DB.prepare(
      `SELECT r.*, ${SQL_DADOS_IMPORTADOS} FROM ropa_records r WHERE r.project_id = ? AND COALESCE(r.status, '') <> 'Inactive' ORDER BY r.created_at ASC`
    ).bind(projectId).all<any>();
    // Bases adicionais e ciclo de vida (F3): uma leitura por tabela para o projeto inteiro.
    const [basesDoProjeto, ciclosDoProjeto] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT b.ropa_id, b.requisito_id, q.referencia, q.titulo, b.observacao FROM tratamento_bases b JOIN requisitos q ON q.id = b.requisito_id WHERE b.project_id = ? ORDER BY q.id`).bind(projectId),
      c.env.DB.prepare(`SELECT t.ropa_id, t.etapa, t.situacao, t.item_id, i.nome AS item_nome, t.descricao FROM tratamento_ciclo t LEFT JOIN itens i ON i.id = t.item_id WHERE t.project_id = ?`).bind(projectId),
    ]);
    const doRegistro = <T extends { ropa_id: string }>(linhas: T[], id: string) => linhas.filter((l) => l.ropa_id === id);

    let rowsHtml = '';
    for (const r of (records || [])) {
      const outrasBases = basesEmTexto({ adicionais: doRegistro(basesDoProjeto.results as (BaseLida & { ropa_id: string })[], r.id), base_gdpr: r.base_gdpr });
      const ciclo = cicloEmTexto(etapasDe(doRegistro(ciclosDoProjeto.results as (Omit<EtapaLida, 'rotulo'> & { ropa_id: string })[], r.id)));
      const falta = naoInformados(r.dados_importados);
      const simNao = (coluna: string) => (falta.includes(coluna) ? 'Não informado (importado, não revisado)' : r[coluna] ? 'Sim' : 'Não');
      const cisoSig = r.ciso_approved_by ? `<span style="color:#10b981; font-weight:600">✓ Assinado por ${escapeHtml(r.ciso_approved_by)} em ${new Date(r.ciso_approved_at).toLocaleDateString()}</span>` : '<span style="color:#d97706">Aguardando Líder SGSI</span>';
      const ceoSig = r.ceo_approved_by ? `<span style="color:#10b981; font-weight:600">✓ Assinado por ${escapeHtml(r.ceo_approved_by)} em ${new Date(r.ceo_approved_at).toLocaleDateString()}</span>` : '<span style="color:#d97706">Aguardando Direção Executiva</span>';
      
      rowsHtml += `
        <div class="ropa-card">
          <div class="ropa-card-header">
            <h3>${escapeHtml(r.processing_purpose)}</h3>
            <span class="ropa-status status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
          </div>
          <div class="ropa-card-body">
            <div class="ropa-field">
              <div class="ropa-label">Categorias de Dados</div>
              <div class="ropa-value">${escapeHtml(r.data_categories || '-')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Titulares</div>
              <div class="ropa-value">${escapeHtml(r.data_subjects || '-')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Base Legal</div>
              <div class="ropa-value">${escapeHtml(r.legal_basis)}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Tempo de Retenção</div>
              <div class="ropa-value">${escapeHtml(r.retention_period || '-')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Dados sensíveis (art. 11)</div>
              <div class="ropa-value">${simNao('dados_sensiveis')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Crianças e adolescentes (art. 14)</div>
              <div class="ropa-value">${simNao('criancas_adolescentes')}</div>
            </div>
            <div class="ropa-field">
              <div class="ropa-label">Transferência internacional</div>
              <div class="ropa-value">${simNao('international_transfers')}</div>
            </div>
            <div class="ropa-field full-width">
              <div class="ropa-label">Destinatários / Compartilhamento</div>
              <div class="ropa-value">${escapeHtml(r.recipients || '-')}</div>
            </div>
            ${outrasBases.length ? `<div class="ropa-field full-width">
              <div class="ropa-label">Outras bases legais</div>
              <div class="ropa-value">${outrasBases.map((t) => escapeHtml(t)).join('<br>')}</div>
            </div>` : ''}
            ${ciclo.length ? `<div class="ropa-field full-width">
              <div class="ropa-label">Ciclo de vida do dado</div>
              <div class="ropa-value">${ciclo.map((t) => escapeHtml(t)).join('<br>')}</div>
            </div>` : ''}
          </div>
          <div class="ropa-card-footer">
            <div><strong>Líder SGSI:</strong> ${cisoSig}</div>
            <div style="margin-top: 4px;"><strong>Direção Executiva:</strong> ${ceoSig}</div>
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório ROPA - ${escapeHtml(project.client_name || 'Projeto GRC')}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
        <style>
          body { background-color: #f1f5f9; color: #070b14; font-family: 'Inter', sans-serif; margin: 0; padding: 2rem; line-height: 1.6; }
          .ropa-card { background: #ffffff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .ropa-card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1rem; }
          .ropa-card-header h3 { font-family: 'Montserrat', sans-serif; margin: 0; font-size: 1.1rem; color: #0f172a; }
          .ropa-status { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
          .status-Approved { background: #d1fae5; color: #065f46; }
          .status-Draft { background: #feefc3; color: #b45309; }
          .ropa-card-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
          .ropa-field { display: flex; flex-direction: column; }
          .ropa-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 2px; }
          .ropa-value { font-size: 0.9rem; color: #334155; }
          .ropa-field.full-width { grid-column: 1 / -1; }
          .ropa-card-footer { border-top: 1px dashed #e2e8f0; margin-top: 1rem; padding-top: 1rem; font-size: 0.85rem; color: #475569; }
        </style>
      </head>
      <body>
        <h1 style="font-family: 'Montserrat', sans-serif; color: #0f172a;">Relatório ROPA — ${escapeHtml(project.client_name)}</h1>
        <p style="color: #64748b;">Registro das Atividades de Tratamento de Dados Pessoais (Art. 37 LGPD / ISO 27701)</p>
        ${linhaControlador ? `<p style="color: #334155;">${linhaControlador}</p>` : ''}
        ${rowsHtml || '<p>Nenhum registro ROPA cadastrado neste projeto.</p>'}
      </body>
      </html>
    `;
    return c.html(html);
  } catch (e) {
    return c.html(
      `<h3>Erro ao gerar relatório ROPA</h3><p>Informe o identificador ao suporte: ${escapeHtml(registraErro(c, e))}</p>`,
      500
    );
  }
});
