import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { validateBody } from '../schemas';
import { conferirPedidosDoDocumento } from './pedidos';
import { lerLogs, registrarSecao } from '../services/ropa-abas/logs';
import { salvarEscopo } from '../services/ropa-abas/escopo';
import { escopoSchema } from '../schemas/ropa-abas';
import type { Falha, Gravado } from '../services/ropa-abas/comum';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
/** /api/v1/projects/:projectId/ropa/:recordId/...: a ficha em abas (spec 2026-10-16). Parâmetros `:projectId` e `:recordId`. */
export const ropaAbasApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();
/** /api/v1/projects/:projectId/catalogos/:tipo (PR2). */
export const catalogosApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// A: escopo, agentes, medidas, base-juridica, logs
/**
 * PUT de aba que grava colunas da atividade: valida o corpo, deixa o serviço decidir (`Falha | Gravado`), registra a seção (só seção,
 * nunca o texto) e, se a escrita tocou o conteúdo congelado, confere os pedidos abertos.
 */
function putAba<T extends object>(caminho: string, schema: Parameters<typeof validateBody<T>>[1], secao: string, falhaMsg: string,
  salvar: (db: D1Database, projectId: string, recordId: string, ator: string, corpo: T) => Promise<Falha | Gravado>) {
  ropaAbasApp.put(caminho, async (c) => {
    try {
      const v = await validateBody(c, schema);
      if (!v.success) return v.response;
      const projectId = c.req.param('projectId')!;
      const recordId = c.req.param('recordId')!;
      const ator = c.get('user')?.email || 'system';
      const r = await salvar(c.env.DB, projectId, recordId, ator, v.data);
      if (!r.ok) return c.json({ error: r.error, ...(r.invalidos ? { invalidos: r.invalidos } : {}) }, r.status);
      if (Object.keys(v.data).length) await registrarSecao(c.env.DB, ator, projectId, recordId, secao, 'Alteração');
      if (r.mudouHash) await conferirPedidosDoDocumento(c, 'tratamento', recordId, projectId);
      return c.json({ ok: true, mudou_hash: r.mudouHash });
    } catch (e) { return erro500(c, falhaMsg, e); }
  });
}
putAba('/escopo', escopoSchema, 'Escopo', 'Falha ao gravar o escopo', salvarEscopo);

const LOGS_DATA = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
ropaAbasApp.get('/logs', async (c) => {
  try {
    const limite = c.req.query('limite');
    const antes = c.req.query('antes');
    if (limite !== undefined && !/^\d+$/.test(limite)) return c.json({ error: 'limite deve ser um inteiro de 1 a 200' }, 400);
    if (limite !== undefined && (Number(limite) < 1 || Number(limite) > 200)) return c.json({ error: 'limite deve ser um inteiro de 1 a 200' }, 400);
    if (antes !== undefined && !LOGS_DATA.test(antes)) return c.json({ error: 'antes deve estar no formato AAAA-MM-DD HH:MM:SS' }, 400);
    const r = await lerLogs(c.env.DB, c.req.param('projectId')!, c.req.param('recordId')!, { limite: limite ? Number(limite) : undefined, antes });
    return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler os logs da atividade', e); }
});
// S: ficha, situacao, conferencia, gaps, relatorio
// A2: etapas, catalogos
// D2: etapas/:etapa/rascunho
