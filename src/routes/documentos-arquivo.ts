import { Hono, type Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit } from '../helpers';
import { validateBody, documentoArquivoSchema } from '../schemas';
import {
  listarDocumentosArquivo, salvarDocumentoArquivo, excluirDocumentoArquivo, anexarArquivo, baixarArquivoDoDocumento, removerArquivo, MAX_DOCUMENTO_ARQUIVO,
} from '../services/documentos-arquivo';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;
/**
 * /api/v1/projects/:projectId/documentos-arquivo: os documentos do legado (spec 2026-10-19, frente B). Faixa `nucleo`
 * (`src/modulos.ts`); a escrita é da interface, fora do agente MCP (`FORA_DO_AGENTE`). O projeto já foi cortado pelo middleware.
 */
export const documentosArquivoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const pid = (c: C) => c.req.param('projectId')!;
const quem = (c: C) => c.get('user')?.email || 'system';
const trilha = (c: C, acao: string, detalhe: string) => logAudit(c.env.DB, `documento_arquivo.${acao}`, quem(c), detalhe, '', '', pid(c));

documentosArquivoApp.get('/', async (c) => {
  try {
    return c.json(await listarDocumentosArquivo(c.env.DB, pid(c), { q: c.req.query('q'), tipo: c.req.query('tipo'), status: c.req.query('status') }));
  } catch (e) { return erro500(c, 'Falha ao listar os documentos', e); }
});

documentosArquivoApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, documentoArquivoSchema);
    if (!v.success) return v.response;
    const r = await salvarDocumentoArquivo(c.env.DB, pid(c), null, quem(c), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await trilha(c, 'criado', `Documento ${v.data.nome} criado`);
    return c.json({ ok: true, id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o documento', e); }
});

documentosArquivoApp.put('/:id', async (c) => {
  try {
    const v = await validateBody(c, documentoArquivoSchema);
    if (!v.success) return v.response;
    const r = await salvarDocumentoArquivo(c.env.DB, pid(c), c.req.param('id'), quem(c), v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await trilha(c, 'atualizado', `Documento ${v.data.nome} atualizado`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o documento', e); }
});

documentosArquivoApp.delete('/:id', async (c) => {
  try {
    if (!(await excluirDocumentoArquivo(c.env, pid(c), c.req.param('id')))) return c.json({ error: 'Documento não encontrado' }, 404);
    await trilha(c, 'excluido', `Documento ${c.req.param('id')} excluído`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao excluir o documento', e); }
});

documentosArquivoApp.post('/:id/arquivo', async (c) => {
  try {
    // Recusa pelo tamanho declarado antes de ler o corpo; o limite exato é conferido sobre o arquivo.
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_DOCUMENTO_ARQUIVO + 1024) return c.json({ error: 'Máximo de 10 MB por arquivo' }, 413);
    const corpo = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const arq = corpo['file'];
    if (!(arq instanceof File)) return c.json({ error: 'Envie um arquivo PDF, DOC ou DOCX (máx. 10 MB) válido' }, 400);
    if (arq.size > MAX_DOCUMENTO_ARQUIVO) return c.json({ error: 'Máximo de 10 MB por arquivo' }, 413);
    const r = await anexarArquivo(c.env, pid(c), c.req.param('id'), { name: arq.name, bytes: await arq.arrayBuffer() });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await trilha(c, 'arquivo_anexado', `Arquivo ${arq.name.slice(0, 255)} anexado ao documento ${c.req.param('id')}`);
    return c.json({ ok: true }, 201);
  } catch (e) { return erro500(c, 'Falha ao anexar o arquivo', e); }
});

documentosArquivoApp.get('/:id/arquivo', async (c) => {
  try {
    return (await baixarArquivoDoDocumento(c.env, pid(c), c.req.param('id'))) ?? c.json({ error: 'Arquivo não encontrado' }, 404);
  } catch (e) { return erro500(c, 'Falha ao baixar o arquivo', e); }
});

documentosArquivoApp.delete('/:id/arquivo', async (c) => {
  try {
    if (!(await removerArquivo(c.env, pid(c), c.req.param('id')))) return c.json({ error: 'Arquivo não encontrado' }, 404);
    await trilha(c, 'arquivo_removido', `Arquivo removido do documento ${c.req.param('id')}`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o arquivo', e); }
});
