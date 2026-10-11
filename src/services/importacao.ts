import { logAudit } from '../helpers';
import { ImportacaoAgent, type TipoArquivo } from '../agents/importacao';
import { OBRIGATORIOS_ROPA, tratamentoPropostoSchema, type TratamentoProposto } from '../schemas/importacao';
import { chave, stmtInserirTratamento, validarTratamento } from './tratamentos-importar';
import { stmtsLigacao } from './tratamentos';
import { stmtsCriarAtivo } from './itens';
import { ehLegitimoInteresse } from './lia';

/**
 * Importação de programa de privacidade (n.privacy, fatia 1; spec docs/superpowers/specs/2026-10-11-importacao-privacy-design.md).
 * Lote → arquivos (R2 `STORAGE`, chave `importacoes/<projeto>/<lote>/<arquivo>`) → o agente classifica e, se for inventário,
 * propõe tratamentos → uma pessoa revisa → `confirmar` grava os aceitos no RoPA, um item por transação.
 */

export const MAX_ARQUIVOS = 50;
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_TEXTO = 200_000;
const BLOCO = 12_000;

/** Extensão aceita → MIME gravado. O MIME do navegador não decide nada (CSV chega como `application/vnd.ms-excel` no Windows). */
const MIME_DA_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  xml: 'application/xml',
};
const LIDOS_DIRETO = new Set(['text/csv', 'application/json']);

type Falha = { ok: false; status: 400 | 404 | 409; error: string };
type Env = { DB: D1Database; STORAGE: R2Bucket; AI: Ai };
type Lote = { id: string; project_id: string; status: string };
type LinhaItem = { id: string; dados: string; faltando: string; decisao: string; [k: string]: unknown };

const nf = (error: string): Falha => ({ ok: false, status: 404, error });

async function loteDoProjeto(db: D1Database, projectId: string, id: string): Promise<Lote | null> {
  return db.prepare('SELECT id, project_id, status FROM importacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first<Lote>();
}
const cancelado = (l: Lote): Falha | null => (l.status === 'cancelada' ? { ok: false, status: 409, error: 'Lote cancelado' } : null);

const faltandoDe = (d: Partial<TratamentoProposto>) => OBRIGATORIOS_ROPA.filter((k) => !String(d[k] ?? '').trim());

const itemLido = (i: LinhaItem) => ({ ...i, dados: JSON.parse(i.dados) as Record<string, unknown>, faltando: JSON.parse(i.faltando) as string[] });

// ─── lote ──────────────────────────────────────────────────────────────────────────────────────────

export async function criarLote(db: D1Database, projectId: string, ator: string) {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO importacoes (id, project_id, criado_por) VALUES (?, ?, ?)').bind(id, projectId, ator).run();
  await logAudit(db, 'importacao.criada', ator, `Lote de importação ${id} criado`, '', '', projectId);
  return id;
}

export async function listarLotes(db: D1Database, projectId: string) {
  const { results } = await db.prepare(
    `SELECT l.*, (SELECT COUNT(*) FROM importacao_arquivos a WHERE a.importacao_id = l.id) AS arquivos,
            (SELECT COUNT(*) FROM importacao_itens i WHERE i.importacao_id = l.id) AS itens
       FROM importacoes l WHERE l.project_id = ? ORDER BY l.created_at DESC, l.rowid DESC`
  ).bind(projectId).all();
  return results;
}

export async function lerLote(db: D1Database, projectId: string, id: string) {
  const lote = await db.prepare('SELECT * FROM importacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first();
  if (!lote) return null;
  const [arquivos, itens] = await db.batch([
    db.prepare('SELECT id, nome, mime, tamanho, tipo, status, erro, modelo, created_at FROM importacao_arquivos WHERE importacao_id = ? ORDER BY created_at, rowid').bind(id),
    db.prepare('SELECT * FROM importacao_itens WHERE importacao_id = ? ORDER BY created_at, rowid').bind(id),
  ]);
  return { lote, arquivos: arquivos.results, itens: (itens.results as LinhaItem[]).map(itemLido) };
}

// ─── envio ─────────────────────────────────────────────────────────────────────────────────────────

export async function enviarArquivo(env: Env, projectId: string, loteId: string, ator: string, file: File): Promise<Falha | { ok: true; id: string }> {
  const lote = await loteDoProjeto(env.DB, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const mime = file.name.includes('.') ? MIME_DA_EXTENSAO[ext] : undefined;
  if (!mime) return { ok: false, status: 400, error: 'Tipo de arquivo não aceito (pdf, docx, xlsx, xls, ods, csv, json, html ou xml)' };
  if (file.size === 0) return { ok: false, status: 400, error: 'Arquivo vazio' };
  if (file.size > MAX_BYTES) return { ok: false, status: 400, error: 'Arquivo acima de 20 MB' };
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM importacao_arquivos WHERE importacao_id = ?').bind(loteId).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_ARQUIVOS) return { ok: false, status: 400, error: `Até ${MAX_ARQUIVOS} arquivos por lote` };

  const id = crypto.randomUUID();
  const r2Key = `importacoes/${projectId}/${loteId}/${id}`;
  await env.STORAGE.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO importacao_arquivos (id, importacao_id, project_id, nome, mime, tamanho, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, loteId, projectId, file.name.slice(0, 255), mime, file.size, r2Key),
      env.DB.prepare(`UPDATE importacoes SET status = 'recebendo', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(loteId),
    ]);
  } catch (e) {
    // Sem a linha, o objeto seria órfão (mesma compensação do upload de evidência).
    await env.STORAGE.delete(r2Key).catch(() => undefined);
    throw e;
  }
  await logAudit(env.DB, 'importacao.arquivo', ator, `Arquivo ${id} enviado ao lote ${loteId}`, '', '', projectId);
  return { ok: true, id };
}

// ─── processar ─────────────────────────────────────────────────────────────────────────────────────

/** Texto do arquivo, ou o motivo de não haver. JSON e CSV são lidos direto; o resto passa por `toMarkdown`. */
async function textoDoArquivo(env: Env, a: { nome: string; mime: string; r2_key: string }): Promise<{ texto: string } | { erro: string }> {
  const obj = await env.STORAGE.get(a.r2_key);
  if (!obj) return { erro: 'arquivo não encontrado no armazenamento' };
  let texto: string;
  if (LIDOS_DIRETO.has(a.mime)) texto = await obj.text();
  else {
    const r = await env.AI.toMarkdown({ name: a.nome, blob: new Blob([await obj.arrayBuffer()], { type: a.mime }) });
    if (r.format === 'error') return { erro: `conversão falhou: ${String(r.error).slice(0, 300)}` };
    texto = r.data;
  }
  if (texto.length > MAX_TEXTO) return { erro: 'arquivo grande demais para leitura' };
  if (!texto.trim()) return { erro: 'arquivo sem texto legível' };
  return { texto };
}

/** Blocos de até ~12.000 caracteres, cortados em quebra de linha quando dá. */
export function blocos(texto: string, max = BLOCO): string[] {
  const out: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    const quebra = resto.lastIndexOf('\n', max);
    const corte = quebra > max / 2 ? quebra + 1 : max;
    out.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  if (resto.trim()) out.push(resto);
  return out;
}

const CONFIANCAS = new Set(['alta', 'media', 'baixa']);

export async function processarArquivo(env: Env, projectId: string, loteId: string, arquivoId: string, ator: string) {
  const db = env.DB;
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const a = await db.prepare('SELECT id, nome, mime, r2_key FROM importacao_arquivos WHERE id = ? AND importacao_id = ?')
    .bind(arquivoId, loteId).first<{ id: string; nome: string; mime: string; r2_key: string }>();
  if (!a) return nf('Arquivo não encontrado');
  await db.prepare(`UPDATE importacoes SET status = 'processando', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(loteId).run();

  const fim = async (status: string, tipo: string | null, erro: string | null, modelo: string | null, itens: D1PreparedStatement[] = []) => {
    await db.batch([
      // Reprocessar substitui o que ainda não virou registro.
      db.prepare(`DELETE FROM importacao_itens WHERE arquivo_id = ? AND decisao <> 'gravado'`).bind(a.id),
      ...itens,
      db.prepare('UPDATE importacao_arquivos SET status = ?, tipo = ?, erro = ?, modelo = ? WHERE id = ?').bind(status, tipo, erro, modelo, a.id),
      db.prepare(
        `UPDATE importacoes SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN EXISTS (SELECT 1 FROM importacao_arquivos WHERE importacao_id = ?1 AND status = 'pendente') THEN 'processando' ELSE 'em_revisao' END WHERE id = ?1`
      ).bind(loteId),
    ]);
    await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: ${status}${tipo ? ` (${tipo})` : ''}, ${itens.length} itens`, '', '', projectId);
    return { ok: true as const, arquivo: { id: a.id, status, tipo, erro }, itens: itens.length };
  };

  const lido = await textoDoArquivo(env, a);
  if ('erro' in lido) return fim('erro', null, lido.erro, null);

  const agente = new ImportacaoAgent(env.AI, db, env);
  let tipo: TipoArquivo = 'desconhecido';
  let modelo = '';
  const propostos: unknown[] = [];
  try {
    ({ tipo, modelo } = await agente.classificar(lido.texto));
    if (tipo !== 'inventario') return fim('aguardando', tipo, null, modelo);
    for (const b of blocos(lido.texto)) {
      const r = await agente.extrairTratamentos(b);
      if (!r.tratamentos) return fim('erro', tipo, 'a IA respondeu fora do formato; processe de novo', r.modelo);
      propostos.push(...r.tratamentos);
    }
  } catch (e) {
    console.error('importacao: IA indisponível', e);
    return fim('erro', null, 'a IA não respondeu; processe de novo', null);
  }

  const { results: existentes } = await db.prepare('SELECT id, processing_purpose AS p FROM ropa_records WHERE project_id = ?').bind(projectId).all<{ id: string; p: string }>();
  const porFinalidade = new Map(existentes.map((r) => [chave(r.p), r.id]));
  const stmts = propostos.map((bruto) => {
    const o = bruto && typeof bruto === 'object' ? { ...(bruto as Record<string, unknown>) } : {};
    const confianca = CONFIANCAS.has(String(o.confianca)) ? String(o.confianca) : 'baixa';
    const origem = typeof o.origem === 'string' ? o.origem.slice(0, 500) : null;
    delete o.confianca;
    delete o.origem;
    const v = tratamentoPropostoSchema.safeParse(o);
    if (!v.success) {
      const i = v.error.issues[0];
      const motivo = `${i?.path.join('.') || 'item'}: ${i?.message ?? 'inválido'}`.slice(0, 300);
      return stmtItem(db, loteId, a.id, projectId, {}, origem, confianca, [], null, 'recusado', motivo);
    }
    const dup = porFinalidade.get(chave(v.data.finalidade)) ?? null;
    return stmtItem(db, loteId, a.id, projectId, v.data, origem, confianca, faltandoDe(v.data), dup, dup ? 'descartado' : 'pendente', null);
  });
  return fim('processado', tipo, null, modelo, stmts);
}

function stmtItem(db: D1Database, loteId: string, arquivoId: string, projectId: string, dados: Partial<TratamentoProposto>, origem: string | null,
  confianca: string, faltando: string[], duplicataDe: string | null, decisao: string, motivo: string | null) {
  return db.prepare(
    `INSERT INTO importacao_itens (id, importacao_id, arquivo_id, project_id, dados, origem, confianca, faltando, duplicata_de, decisao, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), loteId, arquivoId, projectId, JSON.stringify(dados), origem, confianca, JSON.stringify(faltando), duplicataDe, decisao, motivo);
}

// ─── revisão ───────────────────────────────────────────────────────────────────────────────────────

export async function atualizarItem(db: D1Database, projectId: string, loteId: string, itemId: string,
  b: { dados?: TratamentoProposto; decisao?: 'aceito' | 'descartado' | 'pendente' }): Promise<Falha | { ok: true; item: ReturnType<typeof itemLido> }> {
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const item = await db.prepare('SELECT * FROM importacao_itens WHERE id = ? AND importacao_id = ?').bind(itemId, loteId).first<LinhaItem>();
  if (!item) return nf('Item não encontrado');
  if (item.decisao === 'gravado') return { ok: false, status: 409, error: 'Item já gravado no RoPA' };
  const dados = b.dados ?? (JSON.parse(item.dados) as Partial<TratamentoProposto>);
  const decisao = b.decisao ?? item.decisao;
  if (decisao === 'aceito' && !tratamentoPropostoSchema.safeParse(dados).success) return { ok: false, status: 400, error: 'Corrija os dados do item antes de aceitar' };
  let duplicata = item.duplicata_de as string | null;
  if (b.dados) {
    const { results } = await db.prepare('SELECT id, processing_purpose AS p FROM ropa_records WHERE project_id = ?').bind(projectId).all<{ id: string; p: string }>();
    duplicata = results.find((r) => chave(r.p) === chave(b.dados!.finalidade))?.id ?? null;
  }
  await db.prepare(
    `UPDATE importacao_itens SET dados = ?, faltando = ?, duplicata_de = ?, decisao = ?, motivo = CASE WHEN ? = 'recusado' THEN motivo END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND decisao <> 'gravado'`
  ).bind(JSON.stringify(dados), JSON.stringify(faltandoDe(dados)), duplicata, decisao, decisao, itemId).run();
  const novo = await db.prepare('SELECT * FROM importacao_itens WHERE id = ?').bind(itemId).first<LinhaItem>();
  return { ok: true, item: itemLido(novo!) };
}

// ─── confirmar ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Base legal do catálogo pelo texto: "legítimo interesse" vai ao art. 7º, IX; senão o primeiro inciso (art. 7º antes do 11) cujo
 * título normalizado contém o texto, ou é contido nele. Sem catálogo, null (o texto fica em `legal_basis`).
 */
export function casarBaseLegal(texto: string | null | undefined, catalogo: { id: string; titulo: string }[]): string | null {
  const t = chave(texto ?? '');
  if (t.length < 5 || !catalogo.length) return null;
  if (ehLegitimoInteresse(texto)) return catalogo.find((r) => r.id === 'lgpd:art7:ix')?.id ?? null;
  return catalogo.find((r) => { const k = chave(r.titulo); return k.includes(t) || t.includes(k); })?.id ?? null;
}

type Resultado = { item_id: string; decisao: 'gravado' | 'recusado'; registro_id?: string; motivo?: string };

async function mapaPorNome(db: D1Database, sql: string, projectId: string) {
  const { results } = await db.prepare(sql).bind(projectId).all<{ id: string; nome: string }>();
  return new Map(results.map((r) => [chave(r.nome), r.id]));
}

export async function confirmarLote(db: D1Database, projectId: string, loteId: string, ator: string): Promise<Falha | { ok: true; resultados: Resultado[] }> {
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const { results: aceitos } = await db.prepare(`SELECT * FROM importacao_itens WHERE importacao_id = ? AND decisao = 'aceito' ORDER BY created_at, rowid`)
    .bind(loteId).all<LinhaItem>();
  const { results: catalogo } = await db.prepare(
    `SELECT id, titulo FROM requisitos WHERE pai_id IN ('lgpd:art7', 'lgpd:art11') ORDER BY CASE pai_id WHEN 'lgpd:art7' THEN 0 ELSE 1 END, rowid`
  ).all<{ id: string; titulo: string }>();
  const finalidades = await mapaPorNome(db, 'SELECT id, processing_purpose AS nome FROM ropa_records WHERE project_id = ?', projectId);
  const itens = await mapaPorNome(db, `SELECT id, nome FROM itens WHERE project_id = ? AND status = 'ativo' ORDER BY created_at`, projectId);
  const deptos = await mapaPorNome(db, 'SELECT id, nome FROM departamentos WHERE project_id = ? ORDER BY created_at', projectId);
  const pessoas = await mapaPorNome(db, `SELECT id, nome FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY created_at`, projectId);

  const resultados: Resultado[] = [];
  const recusar = async (id: string, motivo: string) => {
    await db.prepare(`UPDATE importacao_itens SET decisao = 'recusado', motivo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND decisao = 'aceito'`).bind(motivo, id).run();
    resultados.push({ item_id: id, decisao: 'recusado', motivo });
  };

  for (const item of aceitos) {
    const p = tratamentoPropostoSchema.safeParse(JSON.parse(item.dados));
    const v = p.success ? validarTratamento(p.data) : null;
    if (!p.success || !v?.ok) { await recusar(item.id, v && !v.ok ? v.motivo : 'dados do item inválidos'); continue; }
    const d = p.data;
    const k = chave(d.finalidade);
    if (finalidades.has(k)) { await recusar(item.id, 'já existe tratamento com essa finalidade neste projeto'); continue; }

    const rid = crypto.randomUUID();
    const agora = new Date().toISOString();
    const stmts: D1PreparedStatement[] = [stmtInserirTratamento(db, rid, projectId, v.data, agora, casarBaseLegal(d.base_legal, catalogo))];
    const novos: [Map<string, string>, string, string][] = [];
    // Casa por nome normalizado; o que não casa é criado na mesma transação (o revisor viu a lista na tela).
    const resolver = (nomes: string[] | undefined, mapa: Map<string, string>, criar: (id: string, nome: string) => D1PreparedStatement[]) => {
      const ids = new Map<string, string>();
      for (const nome of nomes ?? []) {
        const n = chave(nome);
        if (!n || ids.has(n)) continue;
        let id = mapa.get(n);
        if (!id) { id = crypto.randomUUID(); stmts.push(...criar(id, nome)); novos.push([mapa, n, id]); }
        ids.set(n, id);
      }
      return [...ids.values()];
    };
    const sistemas = resolver(d.sistemas, itens, (id, nome) => stmtsCriarAtivo(db, projectId, { name: nome, category: 'Software' }, id));
    const areas = resolver(d.areas, deptos, (id, nome) => [db.prepare('INSERT INTO departamentos (id, project_id, nome) VALUES (?, ?, ?)').bind(id, projectId, nome)]);
    const gente = resolver(d.pessoas, pessoas, (id, nome) => [db.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES (?, ?, 'pessoa', ?)`).bind(id, projectId, nome)]);
    if (sistemas.length) stmts.push(...stmtsLigacao(db, projectId, rid, 'itens', sistemas));
    if (areas.length) stmts.push(...stmtsLigacao(db, projectId, rid, 'departamentos', areas));
    for (const parte of gente) {
      stmts.push(db.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'responsavel', 'tratamento', ?)`)
        .bind(crypto.randomUUID(), projectId, parte, rid));
    }
    stmts.push(db.prepare(`UPDATE importacao_itens SET decisao = 'gravado', registro_id = ?, motivo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND decisao = 'aceito'`)
      .bind(rid, item.id));
    try {
      await db.batch(stmts); // um item, uma transação: a falha dele não desfaz os outros
    } catch (e) {
      console.error('importacao: falha ao gravar item', item.id, e);
      await recusar(item.id, 'falha ao gravar o registro; tente de novo');
      continue;
    }
    finalidades.set(k, rid);
    for (const [mapa, n, id] of novos) mapa.set(n, id);
    resultados.push({ item_id: item.id, decisao: 'gravado', registro_id: rid });
    await logAudit(db, 'importacao.gravada', ator, `Lote ${loteId}: item ${item.id} gravado como tratamento ${rid}`, '', '', projectId);
  }

  await db.prepare(
    `UPDATE importacoes SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN EXISTS (SELECT 1 FROM importacao_itens WHERE importacao_id = ?1 AND decisao IN ('pendente', 'aceito')) THEN 'em_revisao' ELSE 'concluida' END WHERE id = ?1`
  ).bind(loteId).run();
  return { ok: true, resultados };
}

// ─── cancelar ──────────────────────────────────────────────────────────────────────────────────────

/** Apaga os arquivos (R2 e linhas) e os itens; o lote fica `cancelada`. Registros já gravados no RoPA ficam. */
export async function cancelarLote(env: Env, projectId: string, loteId: string, ator: string): Promise<Falha | { ok: true }> {
  const lote = await loteDoProjeto(env.DB, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const { results } = await env.DB.prepare('SELECT r2_key FROM importacao_arquivos WHERE importacao_id = ?').bind(loteId).all<{ r2_key: string }>();
  if (results.length) await env.STORAGE.delete(results.map((r) => r.r2_key));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM importacao_itens WHERE importacao_id = ?').bind(loteId),
    env.DB.prepare('DELETE FROM importacao_arquivos WHERE importacao_id = ?').bind(loteId),
    env.DB.prepare(`UPDATE importacoes SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(loteId),
  ]);
  await logAudit(env.DB, 'importacao.cancelada', ator, `Lote ${loteId} cancelado: ${results.length} arquivos apagados`, '', '', projectId);
  return { ok: true };
}
