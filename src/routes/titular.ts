import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, logAudit, registraErro, sendEmail } from '../helpers';
import { appUrl } from '../config/url';
import { lerParametros, removerParametro, salvarParametro } from '../services/parametros-legais';
import { atualizarPedido, criarPedido, lerPedido, listarPedidos, gerarPortal, lerPortal, desativarPortal, listarTratativas, adicionarTratativa } from '../services/titular-pedidos';
import { guardarAnexoIncidente, listarAnexosIncidente, baixarAnexoIncidente, apagarAnexoIncidente, MAX_ANEXO } from '../services/incidente-anexos';
import { listarAcoesDoIncidente, criarAcaoDoIncidente, atualizarAcaoDoIncidente } from '../services/incidente-acoes';
import { listarAnalises, criarAnalise, atualizarAnalise, lerHistoricoIncidente } from '../services/incidente-analises';
import { lerPostmortem, salvarPostmortem } from '../services/incidente-postmortem';
import { salvarIdentidade } from '../services/titular-identidade';
import { listarEncaminhamentos, criarEncaminhamento, atualizarEncaminhamento } from '../services/titular-encaminhamentos';
import { emailEncaminhamentoTitular } from '../services/emails';
import { remetente } from '../services/email-layout';
import { dataHoraBr, montarCsv, TIPO_PEDIDO } from '../services/exportacao';
import { guardarAnexo, listarAnexos, baixarAnexo, apagarAnexo } from '../services/ropa-abas/anexos';
import { atualizarIncidente, avaliarRisco, criarIncidente, encerrarIncidente, lerIncidente, listarIncidentes, registrarComunicacao } from '../services/incidentes';
import { listarConsentimentos, registrarConsentimento, revogarConsentimento } from '../services/consentimentos';
import { rascunharComunicacao, rascunharResposta } from '../services/rascunhos-privacy';
import {
  validateBody, consentimentoCriarSchema, incidenteComunicacaoSchema, incidenteAcaoCriarSchema, incidenteAcaoAtualizarSchema, incidenteAnaliseSchema, incidentePostmortemSchema, titularIdentidadeSchema, encaminhamentoCriarSchema, encaminhamentoAtualizarSchema, incidenteCriarSchema, incidenteRascunhoSchema, incidenteRiscoSchema, incidenteAtualizarSchema, parametroLegalSchema,
  titularPedidoAtualizarSchema, titularPedidoCriarSchema, tratativaSchema,
} from '../schemas';

type Ctx = { Bindings: Bindings; Variables: Variables };

/**
 * Núcleo do n.privacy, fatia 7: pedido do titular, incidente e consentimento (registro interno). Os apps por projeto são montados em
 * `/api/v1/projects/:projectId/...`, então o `projectAccessMiddleware` já cortou o projeto. Os prazos legais são parâmetros globais,
 * lidos por todos e editados só pelo `platform_admin`.
 */

// ─── Prazos legais (globais) ─────────────────────────────────────────────────────────────────────
export const parametrosLegaisApp = new Hono<Ctx>();
const NEGADO = { error: 'Forbidden: só o administrador da plataforma edita os prazos legais' };

parametrosLegaisApp.get('/', async (c) => c.json(await lerParametros(c.env.DB)));

parametrosLegaisApp.put('/:chave', async (c) => {
  try {
    if (c.get('user')?.role !== 'platform_admin') return c.json(NEGADO, 403);
    const v = await validateBody(c, parametroLegalSchema);
    if (!v.success) return v.response;
    const r = await salvarParametro(c.env.DB, c.get('user').email, c.req.param('chave'), v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar o prazo legal', e); }
});

parametrosLegaisApp.delete('/:chave', async (c) => {
  try {
    if (c.get('user')?.role !== 'platform_admin') return c.json(NEGADO, 403);
    return (await removerParametro(c.env.DB, c.get('user').email, c.req.param('chave'))) ? c.json({ ok: true }) : c.json({ error: 'Parâmetro não definido' }, 404);
  } catch (e) { return erro500(c, 'Falha ao remover o prazo legal', e); }
});

// ─── Pedido do titular ───────────────────────────────────────────────────────────────────────────
export const titularPedidosApp = new Hono<Ctx>();

titularPedidosApp.get('/', async (c) => c.json(await listarPedidos(c.env.DB, c.req.param('projectId')!)));

titularPedidosApp.get('/:id', async (c) => {
  const p = await lerPedido(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'Pedido não encontrado' }, 404);
});

titularPedidosApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, titularPedidoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarPedido(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, protocolo: r.protocolo, prazo_em: r.prazo_em }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o pedido do titular', e); }
});

titularPedidosApp.put('/:id', async (c) => {
  try {
    const v = await validateBody(c, titularPedidoAtualizarSchema);
    if (!v.success) return v.response;
    // Responder, negar, arquivar e mexer no prazo legal são atos de pessoa (skill atendimento-titular): o agente organiza e rascunha.
    if (c.get('user')?.agente && (['respondido', 'negado', 'arquivado'].includes(v.data.status ?? '') || v.data.resposta_texto !== undefined || v.data.prazo_em !== undefined)) {
      return c.json({ error: 'Forbidden: responder, negar, arquivar e mudar o prazo do pedido do titular são atos humanos, pela interface' }, 403);
    }
    const r = await atualizarPedido(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o pedido do titular', e); }
});

// Conferência de identidade (spec 2026-11-06): pessoa da equipe ou o org_admin do projeto; chave de API e agente, não.
const podeAtender = (u: { role?: string } | undefined) => ehEquipeNess(u) || u?.role === 'org_admin';
titularPedidosApp.put('/:id/identidade', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: a conferência de identidade é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, titularIdentidadeSchema);
    if (!v.success) return v.response;
    const r = await salvarIdentidade(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a conferência de identidade', e); }
});

// Encaminhamento a ponto focal (spec 2026-11-06): o ponto focal recebe e-mail e responde por fora; o DPO registra o retorno.
titularPedidosApp.get('/:id/encaminhamentos', async (c) => {
  const l = await listarEncaminhamentos(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return l ? c.json({ encaminhamentos: l }) : c.json({ error: 'Pedido não encontrado' }, 404);
});

titularPedidosApp.post('/:id/encaminhamentos', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: encaminhar o pedido do titular é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, encaminhamentoCriarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const user = c.get('user');
    const r = await criarEncaminhamento(c.env.DB, projectId, c.req.param('id'), user.email, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    let email_enviado = false;
    try {
      const cliente = (await c.env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<string>('client_name')) ?? '';
      const m = emailEncaminhamentoTitular({ protocolo: r.protocolo, tipo: TIPO_PEDIDO[r.tipo] ?? r.tipo, prazo: v.data.prazo, mensagem: v.data.mensagem, nome: r.parte.nome, quem: { nome: user.name ?? null, email: user.email } });
      email_enviado = c.env.RESEND_API_KEY ? await sendEmail(c, r.parte.email, m.assunto, m, { from: remetente('n.privacy', cliente), replyTo: user.email }) : false;
    } catch (e) { registraErro(c, e); }
    if (!email_enviado) console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_encaminhamento_email_falhou', encaminhamento: r.id }));
    return c.json({ ok: true, id: r.id, email_enviado }, 201);
  } catch (e) { return erro500(c, 'Falha ao encaminhar o pedido', e); }
});

titularPedidosApp.put('/:id/encaminhamentos/:encId', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: registrar o retorno do ponto focal é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, encaminhamentoAtualizarSchema);
    if (!v.success) return v.response;
    const r = await atualizarEncaminhamento(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.req.param('encId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o encaminhamento', e); }
});

// Rascunho de IA da resposta: nada é gravado; enviar continua sendo o PUT acima.
titularPedidosApp.post('/:id/rascunho', async (c) => {
  try {
    const r = await rascunharResposta(c.env, c.req.param('projectId')!, c.req.param('id'), c.get('user'), (e) => registraErro(c, e));
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gerar o rascunho da resposta', e); }
});

// Tratativas do atendimento (migration 0096): quem já responde o pedido registra os passos (comunicação, encaminhamento, evidência).
// Escrita é de quem tem acesso de escrita a titular (equipe e org_admin pelo allow-list de auth.ts); org_user, client e o agente só leem.
titularPedidosApp.get('/:id/tratativas', async (c) => {
  const t = await listarTratativas(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return t ? c.json(t) : c.json({ error: 'Pedido não encontrado' }, 404);
});

titularPedidosApp.post('/:id/tratativas', async (c) => {
  try {
    const v = await validateBody(c, tratativaSchema);
    if (!v.success) return v.response;
    const r = await adicionarTratativa(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a tratativa', e); }
});

// ─── Portal público de solicitações: o link que o cliente publica (migration 0096) ───────────────
// Só leitura e gravação de quem já gere os pedidos do titular (equipe e org_admin pelo allow-list); o agente roda como client e não escreve.
export const titularPortalApp = new Hono<Ctx>();

// O link público é uma credencial de portador: gerá-lo ou desativá-lo é ato de PESSOA (equipe da consultoria ou org_admin do
// projeto), nunca de chave de API nem do agente. Chave e agente entram como papel `client` (write-guard os deixa escrever), então
// a checagem positiva por papel os recusa: sem ela, uma chave `write`/`admin` giraria ou derrubaria o link do cliente.
const podeGerirPortal = (u: { role?: string; agente_decisao?: unknown } | undefined) => ehEquipeNess(u) || u?.role === 'org_admin';

titularPortalApp.get('/', async (c) => {
  const p = await lerPortal(c.env.DB, c.req.param('projectId')!);
  return c.json(p ?? { ativo: false, criado_por: null, created_at: null });
});

titularPortalApp.post('/', async (c) => {
  try {
    if (!podeGerirPortal(c.get('user'))) return c.json({ error: 'Forbidden: o link do portal é gerado pela equipe da consultoria ou pelo org_admin, não por chave de API nem pelo agente' }, 403);
    const { token } = await gerarPortal(c.env.DB, c.req.param('projectId')!, c.get('user').email);
    return c.json({ ok: true, url: `${appUrl(c.env)}/solicitacao#${token}` }, 201);
  } catch (e) { return erro500(c, 'Falha ao gerar o link do portal', e); }
});

titularPortalApp.post('/desativar', async (c) => {
  try {
    if (!podeGerirPortal(c.get('user'))) return c.json({ error: 'Forbidden: o portal é desativado pela equipe da consultoria ou pelo org_admin, não por chave de API nem pelo agente' }, 403);
    const ok = await desativarPortal(c.env.DB, c.req.param('projectId')!, c.get('user').email);
    return ok ? c.json({ ok: true }) : c.json({ error: 'O portal já estava desativado ou nunca foi gerado' }, 409);
  } catch (e) { return erro500(c, 'Falha ao desativar o portal', e); }
});

// ─── Incidente ───────────────────────────────────────────────────────────────────────────────────
export const incidentesApp = new Hono<Ctx>();

incidentesApp.get('/', async (c) => c.json(await listarIncidentes(c.env.DB, c.req.param('projectId')!)));

incidentesApp.get('/:id', async (c) => {
  const i = await lerIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return i ? c.json(i) : c.json({ error: 'Incidente não encontrado' }, 404);
});

incidentesApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, incidenteCriarSchema);
    if (!v.success) return v.response;
    const r = await criarIncidente(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, protocolo: r.protocolo, prazo_anpd_em: r.prazo_anpd_em, prazo_titular_em: r.prazo_titular_em }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o incidente', e); }
});

// Corrigir o registro (não a ciência: os prazos contam dela e ficaram congelados).
incidentesApp.put('/:id', async (c) => {
  try {
    const v = await validateBody(c, incidenteAtualizarSchema);
    if (!v.success) return v.response;
    const r = await atualizarIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao alterar o incidente', e); }
});

// Evidências do incidente (0098). Trilha só com o nome da ação, nunca o nome do arquivo.
incidentesApp.get('/:id/anexos', async (c) => {
  try {
    const r = await listarAnexosIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
    return r ? c.json({ anexos: r }) : c.json({ error: 'Incidente não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar os anexos', e); }
});

incidentesApp.post('/:id/anexos', async (c) => {
  try {
    // Recusa pelo tamanho declarado antes de ler o corpo; o limite exato é conferido sobre o arquivo.
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_ANEXO + 1024) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const corpo = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const arq = corpo['file'];
    if (!(arq instanceof File)) return c.json({ error: 'Envie um arquivo PDF ou DOC (máx. 5MB) válido' }, 400);
    if (arq.size > MAX_ANEXO) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const projectId = c.req.param('projectId')!;
    const r = await guardarAnexoIncidente(c.env, projectId, c.req.param('id'), c.get('user').email, { name: arq.name, bytes: await arq.arrayBuffer() });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'incidente.anexo', c.get('user').email, `Incidente ${c.req.param('id')}: evidência anexada`, '', '', projectId, { tipo: 'incidente', id: c.req.param('id')! });
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao anexar o arquivo', e); }
});

incidentesApp.get('/:id/anexos/:anexoId', async (c) => {
  try {
    const r = await baixarAnexoIncidente(c.env, c.req.param('projectId')!, c.req.param('id'), c.req.param('anexoId'));
    return r ?? c.json({ error: 'Anexo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao baixar o anexo', e); }
});

incidentesApp.delete('/:id/anexos/:anexoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const r = await apagarAnexoIncidente(c.env, projectId, c.req.param('id'), c.req.param('anexoId'));
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'incidente.anexo', c.get('user').email, `Incidente ${c.req.param('id')}: evidência removida`, '', '', projectId, { tipo: 'incidente', id: c.req.param('id')! });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao apagar o anexo', e); }
});

// Análises do incidente (fatia 3): várias, cada uma com autor; só o autor altera a sua.
incidentesApp.get('/:id/analises', async (c) => {
  try {
    const r = await listarAnalises(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r ? c.json({ analises: r }) : c.json({ error: 'Incidente não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar as análises', e); }
});

incidentesApp.post('/:id/analises', async (c) => {
  try {
    const v = await validateBody(c, incidenteAnaliseSchema);
    if (!v.success) return v.response;
    const r = await criarAnalise(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data.texto);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a análise', e); }
});

incidentesApp.put('/:id/analises/:analiseId', async (c) => {
  try {
    const v = await validateBody(c, incidenteAnaliseSchema);
    if (!v.success) return v.response;
    const r = await atualizarAnalise(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.req.param('analiseId'), c.get('user').email, v.data.texto);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao alterar a análise', e); }
});

// Post mortem (fatia 5): as 14 perguntas do legado; só depois do encerramento, e responder não reabre o incidente.
incidentesApp.get('/:id/postmortem', async (c) => {
  try {
    const r = await lerPostmortem(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
    return r ? c.json(r) : c.json({ error: 'Incidente não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler o post mortem', e); }
});

incidentesApp.put('/:id/postmortem', async (c) => {
  try {
    const v = await validateBody(c, incidentePostmortemSchema);
    if (!v.success) return v.response;
    const r = await salvarPostmortem(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data.respostas);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gravar o post mortem', e); }
});

// Histórico (fatia 3): a trilha do incidente, sem texto livre nem justificativa; CSV no formato pt-BR das exportações (fora do agente).
incidentesApp.get('/:id/historico', async (c) => {
  try {
    const r = await lerHistoricoIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
    return r ? c.json({ historico: r }) : c.json({ error: 'Incidente não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler o histórico do incidente', e); }
});

incidentesApp.get('/:id/historico/csv', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const r = await lerHistoricoIncidente(c.env.DB, projectId, c.req.param('id'), 500);
    if (!r) return c.json({ error: 'Incidente não encontrado' }, 404);
    await logAudit(c.env.DB, 'exportacao.csv', c.get('user').email, `Exportação CSV do histórico do incidente: ${r.length} linhas`, '', '', projectId);
    return new Response(montarCsv(['Data', 'Evento', 'Detalhe', 'Quem'], r.map((l) => [dataHoraBr(l.data), l.evento, l.detalhe ?? '', l.nome])), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="historico-incidente.csv"', 'Cache-Control': 'no-store' },
    });
  } catch (e) { return erro500(c, 'Falha ao exportar o histórico do incidente', e); }
});

// Ações corretivas do incidente (fatia 4): a mesma corrective_actions da CAPA, ligada por incidente_id, nos dois módulos.
incidentesApp.get('/:id/acoes', async (c) => {
  try {
    const r = await listarAcoesDoIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
    return r ? c.json({ acoes: r }) : c.json({ error: 'Incidente não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar as ações do incidente', e); }
});

incidentesApp.post('/:id/acoes', async (c) => {
  try {
    const v = await validateBody(c, incidenteAcaoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarAcaoDoIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao criar a ação do incidente', e); }
});

incidentesApp.put('/:id/acoes/:acaoId', async (c) => {
  try {
    const v = await validateBody(c, incidenteAcaoAtualizarSchema);
    if (!v.success) return v.response;
    // Concluir ação é decisão do consultor, como na CAPA e na atividade: o agente só pela ferramenta.
    if (c.get('user')?.agente === true && !c.get('user')?.agente_decisao && v.data.status === 'Closed') return c.json({ error: 'Forbidden: concluir ação é decisão do consultor: use niso_concluir_acao' }, 403);
    const r = await atualizarAcaoDoIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.req.param('acaoId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao alterar a ação do incidente', e); }
});

// Anexos da ação: a mesma acao_anexos do gap (PDF/DOC até 5 MB, tipo pelo conteúdo), dona pelo incidente_id. Fora do agente MCP.
const donoIncidente = (c: { req: { param: (k: string) => string | undefined } }) => ({ coluna: 'incidente_id' as const, id: c.req.param('id')! });
incidentesApp.get('/:id/acoes/:acaoId/anexos', async (c) => {
  try {
    const r = await listarAnexos(c.env.DB, c.req.param('projectId')!, donoIncidente(c), c.req.param('acaoId'));
    return r ? c.json({ anexos: r }) : c.json({ error: 'Ação não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar os anexos', e); }
});

incidentesApp.post('/:id/acoes/:acaoId/anexos', async (c) => {
  try {
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_ANEXO + 1024) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const corpo = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const arq = corpo['file'];
    if (!(arq instanceof File)) return c.json({ error: 'Envie um arquivo PDF ou DOC (máx. 5MB) válido' }, 400);
    if (arq.size > MAX_ANEXO) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const projectId = c.req.param('projectId')!;
    const r = await guardarAnexo(c.env, projectId, donoIncidente(c), c.req.param('acaoId'), c.get('user').email, { name: arq.name, bytes: await arq.arrayBuffer() });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'incidente.acao', c.get('user').email, `Incidente ${c.req.param('id')}: anexo da ação corretiva`, '', '', projectId, { tipo: 'incidente', id: c.req.param('id')! });
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao anexar o arquivo', e); }
});

incidentesApp.get('/:id/acoes/:acaoId/anexos/:anexoId', async (c) => {
  try {
    const r = await baixarAnexo(c.env, c.req.param('projectId')!, donoIncidente(c), c.req.param('acaoId'), c.req.param('anexoId'));
    return r ?? c.json({ error: 'Anexo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao baixar o anexo', e); }
});

incidentesApp.delete('/:id/acoes/:acaoId/anexos/:anexoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const ok = await apagarAnexo(c.env, projectId, donoIncidente(c), c.req.param('acaoId'), c.req.param('anexoId'));
    if (ok) await logAudit(c.env.DB, 'incidente.acao', c.get('user').email, `Incidente ${c.req.param('id')}: anexo da ação corretiva removido`, '', '', projectId, { tipo: 'incidente', id: c.req.param('id')! });
    return ok ? c.json({ ok: true }) : c.json({ error: 'Anexo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao apagar o anexo', e); }
});

incidentesApp.put('/:id/risco', async (c) => {
  try {
    const v = await validateBody(c, incidenteRiscoSchema);
    if (!v.success) return v.response;
    const r = await avaliarRisco(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao avaliar o risco do incidente', e); }
});

incidentesApp.post('/:id/comunicacoes', async (c) => {
  try {
    const v = await validateBody(c, incidenteComunicacaoSchema);
    if (!v.success) return v.response;
    const r = await registrarComunicacao(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a comunicação', e); }
});

// Rascunho de IA da comunicação (faixa n.privacy, ver SUBROTAS_PRIVACY): nada é gravado; registrar a comunicação é a rota acima.
incidentesApp.post('/:id/rascunho-comunicacao', async (c) => {
  try {
    const v = await validateBody(c, incidenteRascunhoSchema);
    if (!v.success) return v.response;
    const r = await rascunharComunicacao(c.env, c.req.param('projectId')!, c.req.param('id'), v.data.destino, c.get('user'), (e) => registraErro(c, e));
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gerar o rascunho da comunicação', e); }
});

// Encerrar é da equipe da consultoria (decisão do dono, 15/10): o `org_admin` registra, avalia e comunica, mas não encerra.
// O agente MCP encerra só pela decisão confirmada (`niso_encerrar_incidente`), e o CHECK da 0058 continua valendo para SQL direto.
incidentesApp.post('/:id/encerrar', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'Encerrar o incidente é feito pela equipe da consultoria' }, 403);
    // Quem registrou não encerra: precisa de outra pessoa (decisão 6).
    const inc = await c.env.DB.prepare('SELECT criado_por FROM incidentes WHERE id = ? AND project_id = ?').bind(c.req.param('id'), c.req.param('projectId')).first<{ criado_por: string | null }>();
    // Compara a CONTA real: o agente tem rótulo "agente de X (...)" no e-mail e grava assim em criado_por (legado e novo).
    const u = c.get('user');
    const conta = (u.agente ? u.agente_conta ?? '' : u.email ?? '').toLowerCase();
    const dono = (inc?.criado_por ?? '').toLowerCase().replace(/^agente (?:auditor )?de (.+?) \(.*\)$/, '$1');
    if (dono && dono === conta) {
      return c.json({ error: 'Quem registrou o incidente não o encerra. Peça a outra pessoa.' }, 403);
    }
    const r = await encerrarIncidente(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao encerrar o incidente', e); }
});

// ─── Consentimento ───────────────────────────────────────────────────────────────────────────────
export const consentimentosApp = new Hono<Ctx>();

consentimentosApp.get('/', async (c) => c.json(await listarConsentimentos(c.env.DB, c.req.param('projectId')!, c.req.query('ropa_id') || undefined)));

consentimentosApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, consentimentoCriarSchema);
    if (!v.success) return v.response;
    const r = await registrarConsentimento(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o consentimento', e); }
});

consentimentosApp.post('/:id/revogar', async (c) => {
  try {
    const r = await revogarConsentimento(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao revogar o consentimento', e); }
});
