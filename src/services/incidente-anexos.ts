import { genId } from '../helpers';
import { MAX_ANEXO, MIME_ANEXO, sha256Bytes, tipoDoAnexo, type TipoAnexo } from './ropa-abas/anexos';

/** Evidências do incidente (0098): PDF/DOC/DOCX até 5 MB, tipo conferido pelo conteúdo, a mesma regra dos anexos do gap. */
type Env = { DB: D1Database; STORAGE: R2Bucket };
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
export { MAX_ANEXO };

/** O incidente deste projeto e se aceita mudança; conferido ANTES de tocar o R2 (sem objeto órfão nem pista de existência alheia). */
async function editavel(db: D1Database, projectId: string, id: string): Promise<Falha | null> {
  const i = await db.prepare('SELECT status FROM incidentes WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ status: string }>();
  if (!i) return falha(404, 'Incidente não encontrado');
  return i.status === 'encerrado' ? falha(409, 'Incidente encerrado não muda') : null;
}

export async function guardarAnexoIncidente(env: Env, projectId: string, id: string, ator: string, arq: { name: string; bytes: ArrayBuffer }): Promise<Falha | { ok: true; id: string }> {
  if (arq.bytes.byteLength > MAX_ANEXO) return falha(400, 'Máximo de 5 MB por arquivo');
  const tipo = tipoDoAnexo(arq.name, new Uint8Array(arq.bytes.slice(0, 8)));
  if (!tipo) return falha(400, 'Envie um arquivo PDF ou DOC (máx. 5MB) válido');
  const recusa = await editavel(env.DB, projectId, id);
  if (recusa) return recusa;
  const anexo = genId();
  const chave = `incidentes/${projectId}/${id}/${anexo}`;
  await env.STORAGE.put(chave, arq.bytes, { httpMetadata: { contentType: MIME_ANEXO[tipo] } });
  try {
    await env.DB.prepare('INSERT INTO incidente_anexos (id, project_id, incidente_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(anexo, projectId, id, arq.name.slice(0, 255), chave, await sha256Bytes(arq.bytes), tipo, arq.bytes.byteLength, ator).run();
  } catch (e) {
    await env.STORAGE.delete(chave).catch(() => undefined);
    throw e;
  }
  return { ok: true, id: anexo };
}

/** null: o incidente não é deste projeto. */
export async function listarAnexosIncidente(db: D1Database, projectId: string, id: string) {
  if (!(await db.prepare('SELECT 1 FROM incidentes WHERE id = ? AND project_id = ?').bind(id, projectId).first())) return null;
  return (await db.prepare('SELECT id, file_name, file_type, file_size, uploaded_by, created_at FROM incidente_anexos WHERE incidente_id = ? AND project_id = ? ORDER BY created_at, rowid')
    .bind(id, projectId).all<{ id: string; file_name: string; file_type: TipoAnexo; file_size: number; uploaded_by: string; created_at: string }>()).results;
}

export async function baixarAnexoIncidente(env: Env, projectId: string, id: string, anexo: string): Promise<Response | null> {
  const l = await env.DB.prepare('SELECT file_name, file_type, r2_key FROM incidente_anexos WHERE id = ? AND incidente_id = ? AND project_id = ?')
    .bind(anexo, id, projectId).first<{ file_name: string; file_type: TipoAnexo; r2_key: string }>();
  const obj = l ? await env.STORAGE.get(l.r2_key) : null;
  if (!l || !obj) return null;
  return new Response(obj.body, {
    headers: {
      'Content-Type': MIME_ANEXO[l.file_type] ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(l.file_name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function apagarAnexoIncidente(env: Env, projectId: string, id: string, anexo: string): Promise<Falha | { ok: true }> {
  const recusa = await editavel(env.DB, projectId, id);
  if (recusa) return recusa;
  const l = await env.DB.prepare('SELECT r2_key FROM incidente_anexos WHERE id = ? AND incidente_id = ? AND project_id = ?').bind(anexo, id, projectId).first<{ r2_key: string }>();
  if (!l) return falha(404, 'Anexo não encontrado');
  await env.DB.prepare('DELETE FROM incidente_anexos WHERE id = ? AND incidente_id = ? AND project_id = ?').bind(anexo, id, projectId).run();
  await env.STORAGE.delete(l.r2_key).catch(() => undefined);
  return { ok: true };
}
