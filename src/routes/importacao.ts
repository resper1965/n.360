import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, ehEquipeNess, logAudit } from '../helpers';
import { validateBody, importacaoItemSchema, importacaoItensDecidirSchema } from '../schemas';
import { atualizarItem, cancelarLote, confirmarLote, criarLote, enviarArquivo, lerLote, listarLotes, processarArquivo, reconciliacao, reconciliacaoEmCsv } from '../services/importacao';

/**
 * Importação de programa de privacidade (n.privacy, fatia 1). Montado em `/api/v1/projects/:projectId/importacoes` (faixa
 * `privacy`), então o `projectAccessMiddleware` já cortou projeto e produto. Aqui o corte é de PAPEL: só a equipe da consultoria.
 */
export const importacaoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

importacaoApp.use('*', async (c, next) => {
  if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'A importação de programa é feita pela equipe da consultoria' }, 403);
  await next();
});

const ator = (c: { get: (k: 'user') => { email?: string } | undefined }) => c.get('user')?.email || 'system';

importacaoApp.post('/', async (c) => {
  try {
    return c.json({ ok: true, id: await criarLote(c.env.DB, c.req.param('projectId')!, ator(c)) }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o lote de importação', e); }
});

importacaoApp.get('/', async (c) => c.json({ lotes: await listarLotes(c.env.DB, c.req.param('projectId')!) }));

importacaoApp.get('/:id', async (c) => {
  const l = await lerLote(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return l ? c.json(l) : c.json({ error: 'Lote não encontrado' }, 404);
});

// F6: o relatório de reconciliação do lote (critério de aceite da virada do legado). Só contagens e motivos genéricos.
importacaoApp.get('/:id/reconciliacao', async (c) => {
  try {
    const r = await reconciliacao(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
    return r ? c.json(r) : c.json({ error: 'Lote não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao montar a reconciliação', e); }
});

importacaoApp.get('/:id/reconciliacao/csv', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const r = await reconciliacao(c.env.DB, projectId, c.req.param('id'));
    if (!r) return c.json({ error: 'Lote não encontrado' }, 404);
    await logAudit(c.env.DB, 'importacao.reconciliacao', ator(c),
      `Reconciliação do lote ${r.lote.id} exportada: ${r.totais.propostos} propostos, ${r.totais.gravados} gravados, ${r.totais.recusados} recusados`, '', '', projectId);
    return new Response(reconciliacaoEmCsv(r), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reconciliacao-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) { return erro500(c, 'Falha ao exportar a reconciliação', e); }
});

importacaoApp.post('/:id/arquivos', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'Envie o arquivo no campo "file"' }, 400);
    const r = await enviarArquivo(c.env, c.req.param('projectId')!, c.req.param('id'), ator(c), file);
    return r.ok ? c.json({ ok: true, id: r.id }, 201) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao enviar o arquivo', e); }
});

importacaoApp.post('/:id/arquivos/:aid/processar', async (c) => {
  try {
    const r = await processarArquivo(c.env, c.req.param('projectId')!, c.req.param('id'), c.req.param('aid'), ator(c), c.req.query('reprocessar') === '1');
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao processar o arquivo', e); }
});

importacaoApp.put('/:id/itens/:iid', async (c) => {
  try {
    const v = await validateBody(c, importacaoItemSchema);
    if (!v.success) return v.response;
    const r = await atualizarItem(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.req.param('iid'), v.data);
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o item', e); }
});

importacaoApp.post('/:id/itens/decidir', async (c) => {
  try {
    const v = await validateBody(c, importacaoItensDecidirSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const lote = c.req.param('id');
    const resultados: { id: string; resultado: 'ok' | 'ignorado'; motivo?: string }[] = [];
    for (const id of v.data.ids) {
      const r = await atualizarItem(c.env.DB, projectId, lote, id, { decisao: v.data.decisao });
      if (r.ok) resultados.push({ id, resultado: 'ok' });
      else if (r.status === 404 && r.error === 'Lote não encontrado') return c.json({ error: r.error }, 404);
      else resultados.push({ id, resultado: 'ignorado', motivo: r.error });
    }
    return c.json({ ok: true, aplicados: resultados.filter((x) => x.resultado === 'ok').length, resultados });
  } catch (e) { return erro500(c, 'Falha ao decidir os itens', e); }
});

importacaoApp.post('/:id/confirmar', async (c) => {
  try {
    const r = await confirmarLote(c.env, c.req.param('projectId')!, c.req.param('id'), ator(c));
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao confirmar a importação', e); }
});

importacaoApp.delete('/:id', async (c) => {
  try {
    const r = await cancelarLote(c.env, c.req.param('projectId')!, c.req.param('id'), ator(c));
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao cancelar o lote', e); }
});
