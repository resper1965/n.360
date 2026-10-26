import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { validateBody } from '../schemas';
import { ripdQuestionarioSchema } from '../schemas/ropa-abas';
import { lerQuestionario, salvarQuestionario, lerLogsRipd } from '../services/ripd-questionario';

/** /api/v1/projects/:projectId/dpia/:dpiaId/...: questionário e logs do RIPD (migration 0083). Faixa `nucleo`, como `/dpia`. */
export const ripdQuestionarioApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

ripdQuestionarioApp.get('/questionario', async (c) => {
  try {
    const r = await lerQuestionario(c.env.DB, c.req.param('projectId')!, c.req.param('dpiaId')!);
    return r ? c.json({ ok: true, ...r }) : c.json({ error: 'RIPD não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler o questionário do RIPD', e); }
});

ripdQuestionarioApp.put('/questionario', async (c) => {
  try {
    const valid = await validateBody(c, ripdQuestionarioSchema);
    if (!valid.success) return valid.response;
    const r = await salvarQuestionario(c.env.DB, c.req.param('projectId')!, c.req.param('dpiaId')!, c.get('user')?.email || 'system', valid.data.respostas);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gravar o questionário do RIPD', e); }
});

ripdQuestionarioApp.get('/logs', async (c) => {
  try {
    const r = await lerLogsRipd(c.env.DB, c.req.param('projectId')!, c.req.param('dpiaId')!);
    return r ? c.json({ ok: true, logs: r }) : c.json({ error: 'RIPD não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler os logs do RIPD', e); }
});
