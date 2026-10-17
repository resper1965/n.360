import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { validateBody } from '../schemas';
import { gapCriarSchema, gapAtualizarSchema, gapsNaoAplicavelSchema, situacaoSchema } from '../schemas/ropa-abas';
import { carregarConferencia } from '../services/ropa-abas/conferencia';
import { montarFicha } from '../services/ropa-abas/ficha';
import { transicionar, registrarSecaoS } from '../services/ropa-abas/situacao';
import { listarGaps, criarGap, atualizarGap, apagarGap, definirGapsNaoAplicavel } from '../services/ropa-abas/gaps';
import { guardarAnexo, listarAnexos, baixarAnexo, apagarAnexo, MAX_ANEXO } from '../services/ropa-abas/anexos';
import { exigirEditavel } from '../services/ropa-abas/comum';
import { montarRelatorio } from '../services/ropa-abas/relatorio';
import { motivosDeRisco } from '../services/riscos-atividade';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
/** /api/v1/projects/:projectId/ropa/:recordId/...: a ficha em abas (spec 2026-10-16). Parâmetros `:projectId` e `:recordId`. */
export const ropaAbasApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();
/** /api/v1/projects/:projectId/catalogos/:tipo (PR2). */
export const catalogosApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// A: escopo, agentes, medidas, base-juridica, logs
// S: ficha, situacao, conferencia, gaps, relatorio
const ids = (c: { req: { param: (n: string) => string | undefined } }) => ({ projectId: c.req.param('projectId')!, recordId: c.req.param('recordId')! });
const ipDe = (c: { req: { header: (n: string) => string | undefined } }) => c.req.header('CF-Connecting-IP') ?? '';
const quem = (c: { get: (k: 'user') => { email?: string } | undefined }) => c.get('user')?.email || 'system';

ropaAbasApp.get('/ficha', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const f = await montarFicha(c.env.DB, projectId, recordId, c.get('user')!);
    return f ? c.json(f) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ler a ficha', e); }
});

ropaAbasApp.get('/conferencia', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const r = await carregarConferencia(c.env.DB, projectId, recordId);
    return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao conferir a atividade', e); }
});

// Situação: enviar para revisão, reabrir, cancelar, reativar. Aprovar NÃO está aqui (é o pedido de aprovação, src/services/pedidos.ts).
ropaAbasApp.post('/situacao', async (c) => {
  try {
    const v = await validateBody(c, situacaoSchema);
    if (!v.success) return v.response;
    const { projectId, recordId } = ids(c);
    const r = await transicionar(c.env.DB, projectId, recordId, c.get('user')!, v.data, ipDe(c));
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json({ ok: true, de: r.de, para: r.para });
  } catch (e) { return erro500(c, 'Falha ao mudar a situação', e); }
});

ropaAbasApp.get('/relatorio', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const html = await montarRelatorio(c.env.DB, projectId, recordId);
    return html ? c.html(html) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao gerar o relatório da atividade', e); }
});

// PR1: os motivos já usados nos riscos deste projeto (vazio no projeto novo). A PR2 redireciona ao catálogo `motivos-risco`.
ropaAbasApp.get('/riscos/motivos', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const ok = await c.env.DB.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(recordId, projectId).first();
    return ok ? c.json({ motivos: await motivosDeRisco(c.env.DB, projectId) }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar os motivos', e); }
});

ropaAbasApp.get('/gaps', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const r = await listarGaps(c.env.DB, projectId, recordId);
    return r ? c.json({ ok: true, ...r }) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar os gaps', e); }
});

ropaAbasApp.post('/gaps', async (c) => {
  try {
    const v = await validateBody(c, gapCriarSchema);
    if (!v.success) return v.response;
    const { projectId, recordId } = ids(c);
    const r = await criarGap(c.env.DB, projectId, recordId, quem(c), v.data);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar o gap', e); }
});

// Antes de `/gaps/:id`: o Hono casa na ordem, e "nao-aplicavel" viraria id.
ropaAbasApp.put('/gaps/nao-aplicavel', async (c) => {
  try {
    const v = await validateBody(c, gapsNaoAplicavelSchema);
    if (!v.success) return v.response;
    const { projectId, recordId } = ids(c);
    const r = await definirGapsNaoAplicavel(c.env.DB, projectId, recordId, quem(c), v.data.valor);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao gravar o Não Aplicável dos gaps', e); }
});

ropaAbasApp.put('/gaps/:id', async (c) => {
  try {
    const v = await validateBody(c, gapAtualizarSchema);
    if (!v.success) return v.response;
    const { projectId, recordId } = ids(c);
    const r = await atualizarGap(c.env.DB, projectId, recordId, c.req.param('id')!, quem(c), v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o gap', e); }
});

ropaAbasApp.delete('/gaps/:id', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const r = await apagarGap(c.env, projectId, recordId, c.req.param('id')!, quem(c));
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao apagar o gap', e); }
});

ropaAbasApp.get('/gaps/:id/anexos', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const r = await listarAnexos(c.env.DB, projectId, recordId, c.req.param('id')!);
    return r ? c.json({ ok: true, anexos: r }) : c.json({ error: 'Gap não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao listar os anexos', e); }
});

ropaAbasApp.post('/gaps/:id/anexos', async (c) => {
  try {
    // Recusa pelo tamanho declarado antes de ler o corpo; o limite exato é conferido sobre o arquivo.
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_ANEXO + 1024) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const { projectId, recordId } = ids(c);
    const ed = await exigirEditavel(c.env.DB, projectId, recordId);
    if (!ed.ok) return c.json({ error: ed.error }, ed.status);
    const corpo = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const arq = corpo['file'];
    if (!(arq instanceof File)) return c.json({ error: 'Envie um arquivo PDF ou DOC (máx. 5MB) válido' }, 400);
    if (arq.size > MAX_ANEXO) return c.json({ error: 'Máximo de 5 MB por arquivo' }, 413);
    const r = await guardarAnexo(c.env, projectId, recordId, c.req.param('id')!, quem(c), { name: arq.name, bytes: await arq.arrayBuffer() });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await registrarSecaoS(c.env.DB, quem(c), projectId, recordId, 'Controle de GAPS', 'Anexo');
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao anexar o arquivo', e); }
});

ropaAbasApp.get('/gaps/:id/anexos/:anexoId', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const r = await baixarAnexo(c.env, projectId, recordId, c.req.param('id')!, c.req.param('anexoId')!);
    return r ?? c.json({ error: 'Anexo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao baixar o anexo', e); }
});

ropaAbasApp.delete('/gaps/:id/anexos/:anexoId', async (c) => {
  try {
    const { projectId, recordId } = ids(c);
    const ed = await exigirEditavel(c.env.DB, projectId, recordId);
    if (!ed.ok) return c.json({ error: ed.error }, ed.status);
    const ok = await apagarAnexo(c.env, projectId, recordId, c.req.param('id')!, c.req.param('anexoId')!);
    if (ok) await registrarSecaoS(c.env.DB, quem(c), projectId, recordId, 'Controle de GAPS', 'Anexo');
    return ok ? c.json({ ok: true }) : c.json({ error: 'Anexo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao apagar o anexo', e); }
});
// A2: etapas, catalogos
// D2: etapas/:etapa/rascunho
