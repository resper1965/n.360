import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';

/** n.OT (spec 2026-10-30-n-ot-modulo-n360-design). Faixa `ot` pelo segmento (`FAIXA_DO_SEGMENTO`): projeto E pessoa com o módulo. */
export const otApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Modelo de ameaças do n.OT, P0-2: o inventário de OT é dado sensível do ARCiber; chave de API e agente MCP ficam de fora
// (o agente também está em FORA_DO_AGENTE). Os sinais são os de middleware/auth.ts (`apikey:`) e middleware/agente.ts (`agente`).
otApp.use('*', async (c, next) => {
  const user = c.get('user');
  if (user.agente === true || user.id?.startsWith('apikey:')) {
    return c.json({ error: 'Forbidden: o n.OT não aceita chave de API nem agente — use a interface' }, 403);
  }
  await next();
});

interface Requisito { id: string; framework: string; codigo: string; titulo: string; descricao: string | null; categoria: string | null; versao: string; prazo_meses: number | null }

otApp.get('/requisitos', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, framework, codigo, titulo, descricao, categoria, versao, prazo_meses FROM ot_requisitos'
    ).all<Requisito>();
    // ordem natural (4.5.1 < 4.5.1.1 < 4.6.1): ORDER BY de texto poria 4.10 antes de 4.2
    results.sort((a, b) => a.framework.localeCompare(b.framework) || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    return c.json({ requisitos: results });
  } catch (e) {
    return erro500(c, 'Falha ao listar os requisitos do n.OT', e);
  }
});
