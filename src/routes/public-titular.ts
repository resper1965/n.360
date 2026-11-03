// Portal público de solicitações do titular (spec 2026-11-03). Sem sessão, na internet: a credencial é o token do link, que chega
// no CORPO (nunca no caminho nem na query). Token desconhecido ou portal desligado: o MESMO 404. O projeto vem do token, não do corpo.
// Montado antes do authMiddleware (index.ts); molde de public-homologacao.ts.
import { Hono } from 'hono';
import type { Bindings } from '../index';
import { rateLimitD1, erro500 } from '../helpers';
import { validateBody, portalAbrirSchema } from '../schemas';
import { portalDoToken, abrirPedidoPortal } from '../services/titular-pedidos';

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
    return r.ok ? c.json({ ok: true, protocolo: r.protocolo }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a solicitação', e); }
});
