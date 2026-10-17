import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { validateBody } from '../schemas';
import { conferirPedidosDoDocumento } from './pedidos';
import { lerLogs, registrarSecao } from '../services/ropa-abas/logs';
import { salvarEscopo } from '../services/ropa-abas/escopo';
import { salvarAgentes } from '../services/ropa-abas/agentes';
import { listarMedidas, criarMedida, atualizarMedida, apagarMedida, controlesImplementados, sugestoesDeMedida } from '../services/ropa-abas/medidas';
import { salvarBaseJuridica, lerBaseJuridica } from '../services/ropa-abas/base-juridica';
import { atividadeDoProjeto } from '../services/ropa-abas/comum';
import { escopoSchema, agentesSchema, baseJuridicaSchema, medidaCriarSchema, medidaAtualizarSchema } from '../schemas/ropa-abas';
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
putAba('/agentes', agentesSchema, 'Agentes de Tratamento', 'Falha ao gravar os agentes de tratamento', salvarAgentes);

// Medidas de Segurança: nada aqui toca o conteúdo congelado, então nenhuma escrita chama conferirPedidosDoDocumento.
const NAO_ENCONTRADA = { error: 'Registro do RoPA não encontrado' };
ropaAbasApp.get('/medidas', async (c) => {
  try {
    const r = await listarMedidas(c.env.DB, c.req.param('projectId')!, c.req.param('recordId')!);
    return r ? c.json(r) : c.json(NAO_ENCONTRADA, 404);
  } catch (e) { return erro500(c, 'Falha ao listar as medidas', e); }
});
ropaAbasApp.get('/medidas/controles', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    if (!(await atividadeDoProjeto(c.env.DB, projectId, c.req.param('recordId')!))) return c.json(NAO_ENCONTRADA, 404);
    return c.json(await controlesImplementados(c.env.DB, projectId));
  } catch (e) { return erro500(c, 'Falha ao listar os controles implementados', e); }
});
ropaAbasApp.get('/medidas/sugestoes', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    if (!(await atividadeDoProjeto(c.env.DB, projectId, c.req.param('recordId')!))) return c.json(NAO_ENCONTRADA, 404);
    return c.json(await sugestoesDeMedida(c.env.DB, projectId));
  } catch (e) { return erro500(c, 'Falha ao listar as sugestões de medida', e); }
});
ropaAbasApp.post('/medidas', async (c) => {
  try {
    const v = await validateBody(c, medidaCriarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const recordId = c.req.param('recordId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await criarMedida(c.env.DB, projectId, recordId, ator, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await registrarSecao(c.env.DB, ator, projectId, recordId, 'Medidas de Segurança', 'Inclusão');
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a medida', e); }
});
ropaAbasApp.put('/medidas/:id', async (c) => {
  try {
    const v = await validateBody(c, medidaAtualizarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const recordId = c.req.param('recordId')!;
    const ator = c.get('user')?.email || 'system';
    const r = await atualizarMedida(c.env.DB, projectId, recordId, c.req.param('id')!, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await registrarSecao(c.env.DB, ator, projectId, recordId, 'Medidas de Segurança', 'Alteração');
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a medida', e); }
});
// Apagar é ato humano: o agente é recusado por FORA_DO_AGENTE (src/middleware/agente.ts).
ropaAbasApp.delete('/medidas/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const recordId = c.req.param('recordId')!;
    const r = await apagarMedida(c.env.DB, projectId, recordId, c.req.param('id')!);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await registrarSecao(c.env.DB, c.get('user')?.email || 'system', projectId, recordId, 'Medidas de Segurança', 'Exclusão');
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao apagar a medida', e); }
});
putAba('/base-juridica', baseJuridicaSchema, 'Base Jurídica', 'Falha ao gravar a base jurídica', salvarBaseJuridica);
ropaAbasApp.get('/base-juridica', async (c) => {
  try {
    const r = await lerBaseJuridica(c.env.DB, c.req.param('projectId')!, c.req.param('recordId')!);
    return r ? c.json({ ok: true, ...r }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler a base jurídica', e); }
});

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
