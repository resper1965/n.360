import { genId } from '../helpers';
import { tipoDoAnexo, MIME_ANEXO, type TipoAnexo } from './ropa-abas/anexos';
import { falha, type Falha } from './ropa-abas/comum';
import type { DocumentoArquivo } from '../schemas';
import { partesComDpaDoArquivo, recalcularIndice } from './terceiros';

/**
 * Documentos do legado (spec 2026-10-19, frente B; tabela `documentos_arquivo`, migration 0081): um arquivo (PDF/DOC/DOCX) com
 * metadados, por projeto. Não é o documento versionado (políticas, `documentos`). Arquivo no R2 `STORAGE`, chave
 * `documentos-arquivo/<project_id>/<id>/<nome>`; o tipo é conferido pelo conteúdo, como nos anexos do gap.
 */
export const MAX_DOCUMENTO_ARQUIVO = 10 * 1024 * 1024;

type Env = { DB: D1Database; STORAGE: R2Bucket };
export type FiltroDocumentos = { q?: string; tipo?: string; status?: string };

// r2_key fica no servidor: a tela só precisa saber se há arquivo (arquivo_nome).
const COLUNAS = `d.id, d.nome, d.tipo, d.status, d.vencimento, d.sem_vencimento, d.responsavel_parte_id, pa.nome AS responsavel_nome,
  d.arquivo_nome, d.arquivo_tipo, d.criado_por, d.created_at, d.updated_at`;

export async function listarDocumentosArquivo(db: D1Database, projectId: string, f: FiltroDocumentos) {
  const onde = ['d.project_id = ?'];
  const args: unknown[] = [projectId];
  if (f.tipo) { onde.push('d.tipo = ?'); args.push(f.tipo); }
  if (f.status) { onde.push('d.status = ?'); args.push(f.status); }
  if (f.q?.trim()) { onde.push("d.nome LIKE ? ESCAPE '\\'"); args.push(`%${f.q.trim().replace(/[\\%_]/g, (x) => `\\${x}`)}%`); }
  const { results } = await db.prepare(`SELECT ${COLUNAS} FROM documentos_arquivo d
      LEFT JOIN partes pa ON pa.id = d.responsavel_parte_id AND pa.project_id = d.project_id
     WHERE ${onde.join(' AND ')} ORDER BY d.nome COLLATE NOCASE, d.id`).bind(...args).all();
  return results;
}

async function responsavelValido(db: D1Database, projectId: string, parteId: string | null | undefined): Promise<boolean> {
  if (!parteId) return true;
  return !!(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(parteId, projectId).first());
}

/** Cria (id nulo) ou substitui os metadados. Responsável de outro projeto é 400 (a FK do banco não sabe de projeto). */
export async function salvarDocumentoArquivo(db: D1Database, projectId: string, id: string | null, ator: string, d: DocumentoArquivo): Promise<Falha | { ok: true; id: string }> {
  if (!(await responsavelValido(db, projectId, d.responsavel_parte_id))) return falha(400, 'Responsável não encontrado neste projeto');
  const vals = [d.nome, d.tipo, d.status, d.sem_vencimento ? null : d.vencimento ?? null, d.sem_vencimento ? 1 : 0, d.responsavel_parte_id ?? null];
  if (!id) {
    const novo = genId();
    await db.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, vencimento, sem_vencimento, responsavel_parte_id, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(novo, projectId, ...vals, ator).run();
    return { ok: true, id: novo };
  }
  const r = await db.prepare(`UPDATE documentos_arquivo SET nome = ?, tipo = ?, status = ?, vencimento = ?, sem_vencimento = ?, responsavel_parte_id = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(...vals, id, projectId).run();
  if (!r.meta.changes) return falha(404, 'Documento não encontrado');
  await reindexar(db, await partesComDpaDoArquivo(db, id));
  return { ok: true, id };
}

/** O DPA do fornecedor depende de o arquivo estar publicado e anexado (`SQL_ARQUIVO_VALE`): mexer nisso refaz o índice de confiança dele. */
const reindexar = async (db: D1Database, partes: string[]) => { for (const p of partes) await recalcularIndice(db, p); };

const chaveDo = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT r2_key FROM documentos_arquivo WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ r2_key: string | null }>();

export async function excluirDocumentoArquivo(env: Env, projectId: string, id: string): Promise<boolean> {
  const l = await chaveDo(env.DB, projectId, id);
  if (!l) return false;
  const partes = await partesComDpaDoArquivo(env.DB, id);
  await env.DB.prepare('DELETE FROM documentos_arquivo WHERE id = ? AND project_id = ?').bind(id, projectId).run();
  await reindexar(env.DB, partes);
  if (l.r2_key) await env.STORAGE.delete(l.r2_key).catch(() => undefined);
  return true;
}

/** Anexa ou troca o arquivo. O documento precisa ser do projeto ANTES de tocar o R2; o objeto anterior sai depois da troca gravada. */
export async function anexarArquivo(env: Env, projectId: string, id: string, arq: { name: string; bytes: ArrayBuffer }): Promise<Falha | { ok: true }> {
  if (arq.bytes.byteLength > MAX_DOCUMENTO_ARQUIVO) return falha(400, 'Máximo de 10 MB por arquivo');
  const tipo = tipoDoAnexo(arq.name, new Uint8Array(arq.bytes.slice(0, 8)));
  if (!tipo) return falha(400, 'Envie um arquivo PDF, DOC ou DOCX (máx. 10 MB) válido');
  const antes = await chaveDo(env.DB, projectId, id);
  if (!antes) return falha(404, 'Documento não encontrado');
  const nome = arq.name.slice(0, 255);
  const chave = `documentos-arquivo/${projectId}/${id}/${nome.replace(/[/\\]/g, '_')}`;
  await env.STORAGE.put(chave, arq.bytes, { httpMetadata: { contentType: MIME_ANEXO[tipo] } });
  try {
    await env.DB.prepare(`UPDATE documentos_arquivo SET r2_key = ?, arquivo_nome = ?, arquivo_tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`)
      .bind(chave, nome, tipo, id, projectId).run();
  } catch (e) {
    if (chave !== antes.r2_key) await env.STORAGE.delete(chave).catch(() => undefined);
    throw e;
  }
  if (antes.r2_key && antes.r2_key !== chave) await env.STORAGE.delete(antes.r2_key).catch(() => undefined);
  await reindexar(env.DB, await partesComDpaDoArquivo(env.DB, id));
  return { ok: true };
}

export async function baixarArquivoDoDocumento(env: Env, projectId: string, id: string): Promise<Response | null> {
  const l = await env.DB.prepare('SELECT r2_key, arquivo_nome, arquivo_tipo FROM documentos_arquivo WHERE id = ? AND project_id = ? AND r2_key IS NOT NULL')
    .bind(id, projectId).first<{ r2_key: string; arquivo_nome: string; arquivo_tipo: TipoAnexo }>();
  if (!l) return null;
  const obj = await env.STORAGE.get(l.r2_key);
  if (!obj) return null;
  // O nome vai codificado; o `filename="..."` só com ASCII seguro, para o baixarArquivo do frontend achar o nome.
  const ascii = l.arquivo_nome.replace(/[^A-Za-z0-9._ -]/g, '_');
  return new Response(obj.body, {
    headers: {
      'Content-Type': MIME_ANEXO[l.arquivo_tipo] ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(l.arquivo_nome)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function removerArquivo(env: Env, projectId: string, id: string): Promise<boolean> {
  const l = await chaveDo(env.DB, projectId, id);
  if (!l?.r2_key) return false;
  await env.DB.prepare(`UPDATE documentos_arquivo SET r2_key = NULL, arquivo_nome = NULL, arquivo_tipo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`)
    .bind(id, projectId).run();
  await env.STORAGE.delete(l.r2_key).catch(() => undefined);
  await reindexar(env.DB, await partesComDpaDoArquivo(env.DB, id));
  return true;
}
