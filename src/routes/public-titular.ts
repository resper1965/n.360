// Portal público de solicitações do titular (spec 2026-11-03). Sem sessão, na internet: a credencial é o token do link, que chega
// no CORPO (nunca no caminho nem na query). Token desconhecido ou portal desligado: o MESMO 404. O projeto vem do token, não do corpo.
// A consulta do andamento (spec 2026-11-06, migration 0105) não usa o token: a credencial é protocolo + código de acompanhamento.
// Montado antes do authMiddleware (index.ts); molde de public-homologacao.ts.
import { Hono } from 'hono';
import type { Bindings } from '../index';
import { rateLimitD1, erro500, enviarEmail } from '../helpers';
import { validateBody, portalAbrirSchema, portalConsultarSchema } from '../schemas';
import { portalDoToken, abrirPedidoPortal, consultarPedidoPortal } from '../services/titular-pedidos';
import { emailProtocoloTitular } from '../services/emails';
import { remetente } from '../services/email-layout';
import { log } from '../observability';

export const publicTitularApp = new Hono<{ Bindings: Bindings }>();

const INVALIDO = { error: 'Link inválido ou indisponível' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
const MAX_POR_IP = 30;
const MAX_POR_PROJETO = 60;

publicTitularApp.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'sem-ip';
  if (!(await rateLimitD1(c.env.DB, `titular-portal:ip:${ip}`, MAX_POR_IP, JANELA_SEG))) {
    return c.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
  }
  await next();
});

/** Recebe uma solicitação do titular e devolve só o número de protocolo (o retorno ao titular). */
publicTitularApp.post('/abrir', async (c) => {
  try {
    const v = await validateBody(c, portalAbrirSchema);
    if (!v.success) return v.response;
    const portal = await portalDoToken(c.env.DB, v.data.token);
    if (!portal) return c.json(INVALIDO, 404);
    if (!(await rateLimitD1(c.env.DB, `titular-portal:proj:${portal.project_id}`, MAX_POR_PROJETO, JANELA_SEG))) {
      return c.json({ error: 'Muitas solicitações neste momento. Tente novamente mais tarde.' }, 429);
    }
    const r = await abrirPedidoPortal(c.env.DB, portal.project_id, {
      tipo: v.data.tipo, titular_nome: v.data.titular_nome, titular_contato: v.data.titular_contato, descricao: v.data.descricao,
    });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // Retorno ao titular com o protocolo, best-effort: sem RESEND ou com falha de envio, o pedido já está criado e o protocolo vai na resposta.
    try {
      const m = emailProtocoloTitular({ protocolo: r.protocolo });
      await enviarEmail(c.env, v.data.titular_contato, m.assunto, m, { from: remetente('n.privacy') });
    } catch (e) {
      log('warn', { msg: 'titular_portal_email_falhou', projeto: portal.project_id, erro: e instanceof Error ? e.message : String(e) });
    }
    return c.json({ ok: true, protocolo: r.protocolo, codigo: r.codigo }, 201);
  } catch (e) { return erro500(c, 'Falha ao registrar a solicitação', e); }
});

/** Consulta pública do andamento: protocolo + código de acompanhamento no corpo. Não depende do link do portal (o código é a credencial). */
publicTitularApp.post('/consultar', async (c) => {
  try {
    const v = await validateBody(c, portalConsultarSchema);
    if (!v.success) return v.response;
    const p = await consultarPedidoPortal(c.env.DB, v.data.protocolo, v.data.codigo);
    if (!p) return c.json({ error: 'Protocolo ou código não conferem' }, 404);
    return c.json(p);
  } catch (e) { return erro500(c, 'Falha ao consultar a solicitação', e); }
});
