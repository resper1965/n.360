import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, registraErro } from '../helpers';
import { appUrl } from '../config/url';
import { lerParametros, removerParametro, salvarParametro } from '../services/parametros-legais';
import { atualizarPedido, criarPedido, lerPedido, listarPedidos, gerarPortal, lerPortal, desativarPortal, listarTratativas, adicionarTratativa } from '../services/titular-pedidos';
import { avaliarRisco, criarIncidente, encerrarIncidente, lerIncidente, listarIncidentes, registrarComunicacao } from '../services/incidentes';
import { listarConsentimentos, registrarConsentimento, revogarConsentimento } from '../services/consentimentos';
import { rascunharComunicacao, rascunharResposta } from '../services/rascunhos-privacy';
import {
  validateBody, consentimentoCriarSchema, incidenteComunicacaoSchema, incidenteCriarSchema, incidenteRascunhoSchema, incidenteRiscoSchema, parametroLegalSchema,
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
