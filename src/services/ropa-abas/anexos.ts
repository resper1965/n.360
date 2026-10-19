import { genId } from '../../helpers';
import { falha, type Falha } from './comum';

export const MAX_ANEXO = 5 * 1024 * 1024;
export type TipoAnexo = 'pdf' | 'doc' | 'docx';
type Tipo = TipoAnexo;
const MAGIA: Record<Tipo, number[]> = { pdf: [0x25, 0x50, 0x44, 0x46], doc: [0xd0, 0xcf, 0x11, 0xe0], docx: [0x50, 0x4b, 0x03, 0x04] };
export const MIME_ANEXO: Record<Tipo, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

/** O tipo pelo CONTEÚDO (os primeiros bytes), conferido com a extensão: renomear um executável para .pdf não passa. */
export function tipoDoAnexo(nome: string, bytes: Uint8Array): Tipo | null {
  const ext = nome.toLowerCase().split('.').pop() as Tipo;
  const magia = Object.hasOwn(MAGIA, ext) ? MAGIA[ext] : undefined;
  if (!magia) return null;
  return magia.every((b, i) => bytes[i] === b) ? ext : null;
}

async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Env = { DB: D1Database; STORAGE: R2Bucket };
const DO_GAP = `FROM acao_anexos x JOIN corrective_actions a ON a.id = x.acao_id WHERE a.id = ? AND a.ropa_id = ? AND a.project_id = ? AND x.project_id = a.project_id`;

export async function guardarAnexo(env: Env, projectId: string, ropaId: string, acaoId: string, ator: string, arq: { name: string; bytes: ArrayBuffer }): Promise<Falha | { ok: true; id: string }> {
  if (arq.bytes.byteLength > MAX_ANEXO) return falha(400, 'Máximo de 5 MB por arquivo');
  const tipo = tipoDoAnexo(arq.name, new Uint8Array(arq.bytes.slice(0, 8)));
  if (!tipo) return falha(400, 'Envie um arquivo PDF ou DOC (máx. 5MB) válido');
  // O gap precisa ser desta atividade e deste projeto ANTES de tocar o R2 (sem objeto órfão nem pista de existência alheia).
  const acao = await env.DB.prepare('SELECT 1 FROM corrective_actions WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(acaoId, ropaId, projectId).first();
  if (!acao) return falha(404, 'Gap não encontrado');
  const id = genId();
  const chave = `acoes/${projectId}/${acaoId}/${id}`;
  await env.STORAGE.put(chave, arq.bytes, { httpMetadata: { contentType: MIME_ANEXO[tipo] } });
  try {
    await env.DB.prepare('INSERT INTO acao_anexos (id, project_id, acao_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, projectId, acaoId, arq.name.slice(0, 255), chave, await sha256Bytes(arq.bytes), tipo, arq.bytes.byteLength, ator).run();
  } catch (e) {
    await env.STORAGE.delete(chave).catch(() => undefined);
    throw e;
  }
  return { ok: true, id };
}

export type AnexoLido = { id: string; file_name: string; file_type: Tipo; file_size: number };

/** null: o gap não é desta atividade. */
export async function listarAnexos(db: D1Database, projectId: string, ropaId: string, acaoId: string): Promise<AnexoLido[] | null> {
  if (!(await db.prepare('SELECT 1 FROM corrective_actions WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(acaoId, ropaId, projectId).first())) return null;
  const { results } = await db.prepare(`SELECT x.id, x.file_name, x.file_type, x.file_size ${DO_GAP} ORDER BY x.created_at, x.rowid`).bind(acaoId, ropaId, projectId).all<AnexoLido>();
  return results;
}

export async function baixarAnexo(env: Env, projectId: string, ropaId: string, acaoId: string, anexoId: string): Promise<Response | null> {
  const l = await env.DB.prepare(`SELECT x.file_name, x.file_type, x.r2_key ${DO_GAP} AND x.id = ?`).bind(acaoId, ropaId, projectId, anexoId)
    .first<{ file_name: string; file_type: Tipo; r2_key: string }>();
  if (!l) return null;
  const obj = await env.STORAGE.get(l.r2_key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      'Content-Type': MIME_ANEXO[l.file_type] ?? 'application/octet-stream',
      // O nome do arquivo só entra no cabeçalho codificado.
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(l.file_name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function apagarAnexo(env: Env, projectId: string, ropaId: string, acaoId: string, anexoId: string): Promise<boolean> {
  const l = await env.DB.prepare(`SELECT x.r2_key ${DO_GAP} AND x.id = ?`).bind(acaoId, ropaId, projectId, anexoId).first<{ r2_key: string }>();
  if (!l) return false;
  await env.DB.prepare('DELETE FROM acao_anexos WHERE id = ? AND acao_id = ? AND project_id = ?').bind(anexoId, acaoId, projectId).run();
  await env.STORAGE.delete(l.r2_key).catch(() => undefined);
  return true;
}
