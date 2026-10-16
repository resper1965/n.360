import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { validateBody } from '../schemas';
import { copilotoCampoSchema, copilotoConversaSchema } from '../schemas/passos';
import { erro500 } from '../helpers';
import { passoPorId } from '../data/passos/catalogo';
import { escreverDaConversa, podePedirCopilotoDoPasso, rascunharCampo } from '../services/copiloto-passo';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
const aindaNao = (c: { json: (b: unknown, s: 501) => Response }) => c.json({ error: 'Ainda não implementado' }, 501);
const NEGADO = 'O copiloto é pedido pela equipe da consultoria ou pelo administrador do cliente';

/**
 * /api/v1/projects/:projectId/passos/:itemId/copiloto: rascunho de IA da trilha (spec 2026-10-15, seção 8). O modelo só PROPÕE:
 * nenhuma rota daqui grava resposta ou progresso. O agente MCP é recusado antes (`FORA_DO_AGENTE`, src/middleware/agente.ts).
 */
export const projectCopilotoApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();

projectCopilotoApp.post('/rascunhar-campo', async (c) => {
  try {
    if (!podePedirCopilotoDoPasso(c.get('user'))) return c.json({ error: NEGADO }, 403);
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, copilotoCampoSchema);
    if (!v.success) return v.response;
    const r = await rascunharCampo(c.env as never, c.req.param('projectId')!, passo, v.data.campo, v.data.instrucao, c.get('user'));
    if ('erro' in r) return c.json({ error: r.erro }, r.status);
    return c.json('indisponivel' in r ? r : { ok: true, ...r });
  } catch (e) { return erro500(c, 'Falha no copiloto do passo', e); }
});
projectCopilotoApp.post('/da-conversa', async (c) => {
  try {
    if (!podePedirCopilotoDoPasso(c.get('user'))) return c.json({ error: NEGADO }, 403);
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, copilotoConversaSchema);
    if (!v.success) return v.response;
    const r = await escreverDaConversa(c.env as never, c.req.param('projectId')!, passo, v.data.conversa, c.get('user'));
    return c.json('indisponivel' in r ? r : { ok: true, ...r });
  } catch (e) { return erro500(c, 'Falha no copiloto do passo', e); }
});
projectCopilotoApp.post('/revisao', aindaNao);
