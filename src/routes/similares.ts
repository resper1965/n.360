import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { validateBody, similaresSchema } from '../schemas';
import { buscarSimilares, podePedirSimilares } from '../services/similares';

/**
 * Parecidos por significado (embeddings do Workers AI) para o "Cadastrar agora" da entrevista do RoPA. Montado em
 * `/api/v1/projects/:projectId/similares` (faixa `nucleo`): o `projectAccessMiddleware` já cortou o projeto; o limite por
 * usuário é do `rateLimitMiddleware`. Nada é gravado. Fora do agente MCP (FORA_DO_AGENTE): é recurso de IA da tela.
 */
export const similaresApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

similaresApp.post('/', async (c) => {
  try {
    if (!podePedirSimilares(c.get('user'))) return c.json({ error: 'Busca de parecidos é da equipe da consultoria, no cadastro da entrevista' }, 403);
    const v = await validateBody(c, similaresSchema);
    if (!v.success) return v.response;
    return c.json(await buscarSimilares(c.env as unknown as Parameters<typeof buscarSimilares>[0], c.req.param('projectId')!, v.data.tipo, v.data.nome));
  } catch (e) { return erro500(c, 'Falha ao buscar parecidos', e); }
});
