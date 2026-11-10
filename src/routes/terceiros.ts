import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, ehEquipeNess } from '../helpers';
import { definirTipo, desligarDocumento, lerCriticidades, lerTerceiro, ligarDocumento, listarCandidatos, listarTerceiros, registrarAvaliacao, registrarCriticidade, type PapelDocumento } from '../services/terceiros';
import { listarHomologacoes } from '../services/homologacao';
import { validateBody, avaliacaoTerceiroSchema, criticidadeTerceiroSchema, terceiroDocumentoSchema, terceiroTipoSchema } from '../schemas';

/**
 * Núcleo do n.privacy, fatia 6: terceiros tipificados. Montado em `/api/v1/projects/:projectId/terceiros`, então o
 * `projectAccessMiddleware` já cortou o projeto antes daqui. O tipo define o método; a situação é derivada da validade.
 * Tipo, criticidade e avaliação (decisão de 09/11/2026): a equipe da consultoria e o administrador do cliente (`org_admin`, preso ao
 * próprio projeto pelo `projectAccessMiddleware`); `org_user`, `client` e chave de API recebem 403. O questionário segue só da equipe.
 * O agente consultor grava pela ferramenta `niso_avaliar_fornecedor` (a porta o trata como equipe naquela rota).
 */
export const terceirosApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SO_EQUIPE = { error: 'Tipo, criticidade e avaliação do fornecedor são registrados pela equipe da consultoria ou pelo administrador do cliente' };
const podeAvaliar = (u: { role?: string; agente_decisao?: unknown } | undefined) => ehEquipeNess(u) || u?.role === 'org_admin';

// A lista traz o resumo do último questionário não cancelado (Data de envio e % respondido), o mesmo dado da ficha.
terceirosApp.get('/', async (c) => {
  const projectId = c.req.param('projectId')!;
  const [terceiros, homologacoes] = await Promise.all([listarTerceiros(c.env.DB, projectId), listarHomologacoes(c.env.DB, projectId)]);
  const ultima = new Map<string, (typeof homologacoes)[number]>();
  for (const h of homologacoes) if (h.status !== 'cancelada' && !ultima.has(h.parte_id)) ultima.set(h.parte_id, h); // ordenada da mais nova para a mais antiga
  return c.json(terceiros.map((t) => {
    const h = ultima.get(t.id);
    return { ...t, questionario: h ? { enviada_em: h.enviada_em, percentual: h.percentual, respondidas: h.respondidas, total: h.total } : null };
  }));
});

terceirosApp.get('/candidatos', async (c) => c.json(await listarCandidatos(c.env.DB, c.req.param('projectId')!)));

terceirosApp.get('/:parteId', async (c) => {
  const t = await lerTerceiro(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'));
  return t ? c.json(t) : c.json({ error: 'Terceiro não encontrado' }, 404);
});

terceirosApp.put('/:parteId/tipo', async (c) => {
  try {
    if (!podeAvaliar(c.get('user'))) return c.json(SO_EQUIPE, 403);
    const v = await validateBody(c, terceiroTipoSchema);
    if (!v.success) return v.response;
    const r = await definirTipo(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data.terceiro_tipo);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao definir o tipo do terceiro', e); }
});

terceirosApp.post('/:parteId/avaliacoes', async (c) => {
  try {
    if (!podeAvaliar(c.get('user'))) return c.json(SO_EQUIPE, 403);
    const v = await validateBody(c, avaliacaoTerceiroSchema);
    if (!v.success) return v.response;
    const r = await registrarAvaliacao(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, metodo: r.metodo }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a avaliação', e); }
});

terceirosApp.get('/:parteId/criticidades', async (c) => {
  const r = await lerCriticidades(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'));
  return r ? c.json(r) : c.json({ error: 'Terceiro não encontrado' }, 404);
});

terceirosApp.post('/:parteId/criticidades', async (c) => {
  try {
    if (!podeAvaliar(c.get('user'))) return c.json(SO_EQUIPE, 403);
    const v = await validateBody(c, criticidadeTerceiroSchema);
    if (!v.success) return v.response;
    const r = await registrarCriticidade(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, id: r.id, nivel: r.nivel, tipo: r.tipo }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a criticidade', e); }
});

terceirosApp.post('/:parteId/documentos', async (c) => {
  try {
    const v = await validateBody(c, terceiroDocumentoSchema);
    if (!v.success) return v.response;
    if (v.data.arquivo_id && c.get('user')?.agente) return c.json({ error: 'documento em arquivo é ligado pela interface; o agente só lê' }, 403);
    const r = await ligarDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, (v.data.arquivo_id ?? v.data.documento_id)!, v.data.papel, v.data.arquivo_id ? 'arquivo' : 'versionado');
    return r.ok ? c.json({ ok: true }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao ligar o documento', e); }
});

terceirosApp.delete('/:parteId/documentos/:documentoId', async (c) => {
  try {
    const papel = (c.req.query('papel') || 'dpa') as PapelDocumento;
    if (!['dpa', 'contrato', 'outro'].includes(papel)) return c.json({ error: 'papel deve ser dpa, contrato ou outro' }, 400);
    const arquivo = c.req.query('origem') === 'arquivo';
    if (arquivo && c.get('user')?.agente) return c.json({ error: 'documento em arquivo é desligado pela interface; o agente só lê' }, 403);
    const ok = await desligarDocumento(c.env.DB, c.req.param('projectId')!, c.req.param('parteId'), c.get('user').email, c.req.param('documentoId'), papel, arquivo ? 'arquivo' : 'versionado');
    return ok ? c.json({ ok: true }) : c.json({ error: 'Ligação não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao desligar o documento', e); }
});
