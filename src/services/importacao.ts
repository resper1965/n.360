import { logAudit } from '../helpers';
import { log, resumoErro } from '../observability';
import { ImportacaoAgent, type TipoArquivo, type TipoExtraido } from '../agents/importacao';
import {
  OBRIGATORIOS_AVALIACAO, OBRIGATORIOS_DOCUMENTO, OBRIGATORIOS_ROPA, OBRIGATORIOS_TERCEIRO, avaliacaoPropostaSchema, documentoPropostoSchema,
  terceiroPropostoSchema, tratamentoPropostoSchema, type AvaliacaoProposta, type DocumentoProposto, type TerceiroProposto, type TratamentoProposto,
} from '../schemas/importacao';
import { chave, stmtInserirTratamento, validarTratamento } from './tratamentos-importar';
import { lerLigacoes, stmtsLigacao } from './tratamentos';
import { stmtsCriarAtivo } from './itens';
import { criarDpiaDoTratamento, ehLegitimoInteresse, lerLia, salvarLia } from './lia';
import { criarDocumento } from './documentos';
import { definirTipo, ligarDocumento, registrarAvaliacao } from './terceiros';

/**
 * Importação de programa de privacidade (n.privacy, fatias 1 a 3; spec docs/superpowers/specs/2026-10-11-importacao-privacy-design.md).
 * Lote → arquivos (R2 `STORAGE`, chave `importacoes/<projeto>/<lote>/<arquivo>`) → o agente classifica e, se for inventário, lista
 * de terceiros, documento ou avaliação, propõe os itens (`entidade` tratamento, terceiro, documento, dpia ou lia) → uma pessoa revisa
 * → `confirmar` grava os aceitos.
 */

export const MAX_ARQUIVOS = 50;
export const MAX_BYTES = 20 * 1024 * 1024;
/**
 * Teto do texto convertido: 200.000 caracteres = até ~50 blocos, uma chamada da tela por bloco. Mantido: com um bloco por chamada o
 * limite deixou de ser o tempo de uma requisição, mas um inventário maior que isso é sinal de arquivo errado (ou de vários juntos).
 */
export const MAX_TEXTO = 200_000;
/** Um bloco por chamada; ~4.000 caracteres de entrada deixam a resposta (até 8.192 tokens) sem truncar. */
export const BLOCO = 4_000;

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
type LinhaItem = { id: string; entidade: Entidade; dados: string; faltando: string; decisao: string; [k: string]: unknown };

/**
 * Entidade proposta por tipo de arquivo; tipo fora daqui fica `aguardando` (fatia 4). Avaliação é `dpia` ou `lia` item a item (o campo
 * `tipo` da resposta do modelo decide); `dpia` aqui só marca que o tipo é extraído.
 */
type Entidade = 'tratamento' | 'terceiro' | 'documento' | 'dpia' | 'lia';
const ENTIDADE_DO_TIPO: Partial<Record<TipoArquivo, Entidade>> = { inventario: 'tratamento', terceiros: 'terceiro', documento: 'documento', avaliacao: 'dpia' };
const ESQUEMA = {
  tratamento: tratamentoPropostoSchema, terceiro: terceiroPropostoSchema, documento: documentoPropostoSchema, dpia: avaliacaoPropostaSchema, lia: avaliacaoPropostaSchema,
};
const OBRIGATORIOS: Record<Entidade, readonly string[]> = {
  tratamento: OBRIGATORIOS_ROPA, terceiro: OBRIGATORIOS_TERCEIRO, documento: OBRIGATORIOS_DOCUMENTO, dpia: OBRIGATORIOS_AVALIACAO, lia: OBRIGATORIOS_AVALIACAO,
};
/** O nome que decide a duplicata: finalidade do tratamento, nome do terceiro, título do documento, tratamento avaliado. */
const CAMPO_NOME: Record<Entidade, string> = { tratamento: 'finalidade', terceiro: 'nome', documento: 'titulo', dpia: 'tratamento', lia: 'tratamento' };
const nomeDe = (entidade: Entidade, d: Record<string, unknown>) => String(d[CAMPO_NOME[entidade]] ?? '');

const nf = (error: string): Falha => ({ ok: false, status: 404, error });

async function loteDoProjeto(db: D1Database, projectId: string, id: string): Promise<Lote | null> {
  return db.prepare('SELECT id, project_id, status FROM importacoes WHERE id = ? AND project_id = ?').bind(id, projectId).first<Lote>();
}
/** Lote que não aceita mudança: cancelado, ou com uma confirmação gravando (a trava de `confirmarLote`). */
const cancelado = (l: Lote): Falha | null =>
  l.status === 'cancelada' ? { ok: false, status: 409, error: 'Lote cancelado' }
    : l.status === 'gravando' ? { ok: false, status: 409, error: 'Importação em gravação' } : null;
/** Condição SQL de quem muda o lote: nunca sobrescreve a trava de gravação nem o cancelamento. */
const LIVRE = `status NOT IN ('gravando', 'cancelada')`;
const emGravacao: Falha = { ok: false, status: 409, error: 'Importação em gravação' };

const faltandoDe = (entidade: Entidade, d: Record<string, unknown>) => OBRIGATORIOS[entidade].filter((k) => !String(d[k] ?? '').trim());

/**
 * Registros já cadastrados, por nome normalizado: tratamentos do RoPA, partes organização ATIVAS (a inativa não é duplicata),
 * documentos pelo título, DPIA e LIA pela finalidade do tratamento a que estão ligadas.
 */
const SQL_EXISTENTES: Record<Entidade, string> = {
  tratamento: 'SELECT id, processing_purpose AS nome FROM ropa_records WHERE project_id = ?',
  terceiro: `SELECT id, nome FROM partes WHERE project_id = ? AND tipo = 'organizacao' AND status = 'ativa' ORDER BY created_at`,
  documento: 'SELECT id, titulo AS nome FROM documentos WHERE project_id = ? ORDER BY created_at',
  dpia: 'SELECT d.id, r.processing_purpose AS nome FROM dpia_assessments d JOIN ropa_records r ON r.id = d.ropa_id WHERE d.project_id = ? ORDER BY d.created_at',
  lia: 'SELECT l.id, r.processing_purpose AS nome FROM lia_assessments l JOIN ropa_records r ON r.id = l.ropa_id WHERE l.project_id = ?',
};
const existentes = (db: D1Database, projectId: string, entidade: Entidade) => mapaPorNome(db, SQL_EXISTENTES[entidade], projectId);

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
    db.prepare('SELECT id, nome, mime, tamanho, tipo, status, erro, modelo, bloco_atual, blocos_total, created_at FROM importacao_arquivos WHERE importacao_id = ? ORDER BY created_at, rowid').bind(id),
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
      env.DB.prepare(`UPDATE importacoes SET status = 'recebendo', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${LIVRE}`).bind(loteId),
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

/**
 * Blocos de até `max` caracteres, cortados SEMPRE em quebra de linha: nenhuma linha (de CSV, de tabela do Markdown) é partida; uma
 * linha maior que `max` vai inteira e sozinha.
 */
export function blocos(texto: string, max = BLOCO): string[] {
  const out: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    let q = resto.lastIndexOf('\n', max - 1);
    if (q < 0) q = resto.indexOf('\n', max);
    if (q < 0) break;
    const b = resto.slice(0, q + 1);
    if (b.trim()) out.push(b);
    resto = resto.slice(q + 1);
  }
  if (resto.trim()) out.push(resto);
  return out;
}

/** O texto em duas metades, cortado na quebra de linha mais perto do meio; [] se for uma linha só. */
function emDuas(texto: string): string[] {
  const meio = Math.floor(texto.length / 2);
  let q = texto.lastIndexOf('\n', meio);
  if (q <= 0) q = texto.indexOf('\n', meio);
  if (q <= 0 || q >= texto.trimEnd().length) return [];
  return [texto.slice(0, q + 1), texto.slice(q + 1)];
}

type Extraido = { itens: unknown[]; falhou: boolean; modelo: string };

/**
 * Extrai um bloco. Resposta fora do formato (em geral, JSON truncado no teto de tokens) divide o bloco ao meio e tenta cada metade uma
 * vez, até 2 níveis (no pior caso 7 chamadas ao modelo). O que não ler nem assim marca o bloco como falho; o lido nas outras partes fica.
 * IA fora do ar não divide: só multiplicaria as chamadas que falham.
 */
async function extrairComDivisao(agente: ImportacaoAgent, tipo: TipoExtraido, texto: string, nivel = 0): Promise<Extraido> {
  let r: { itens: unknown[] | null; modelo: string };
  try { r = await agente.extrair(tipo, texto); } catch (e) {
    console.error('importacao: IA indisponível', e);
    return { itens: [], falhou: true, modelo: '' };
  }
  if (r.itens) return { itens: r.itens, falhou: false, modelo: r.modelo };
  const metades = nivel < 2 ? emDuas(texto) : [];
  if (!metades.length) return { itens: [], falhou: true, modelo: r.modelo };
  const partes: Extraido[] = [];
  for (const m of metades) partes.push(await extrairComDivisao(agente, tipo, m, nivel + 1));
  return { itens: partes.flatMap((p) => p.itens), falhou: partes.some((p) => p.falhou), modelo: r.modelo };
}

const CONFIANCAS = new Set(['alta', 'media', 'baixa']);
/** Texto convertido, guardado ao lado do original para os passos seguintes (e apagado com ele no cancelamento). */
const TXT = (r2Key: string) => `${r2Key}.txt`;

type Arquivo = {
  id: string; nome: string; mime: string; r2_key: string; status: string; tipo: string | null; modelo: string | null;
  blocos_total: number | null; bloco_atual: number; blocos_falhos: string | null;
};

async function situacao(db: D1Database, id: string) {
  const arquivo = await db.prepare('SELECT id, status, tipo, erro, bloco_atual, blocos_total FROM importacao_arquivos WHERE id = ?').bind(id)
    .first<{ id: string; status: string; tipo: string | null; erro: string | null; bloco_atual: number; blocos_total: number | null }>();
  const restantes = arquivo?.status === 'pendente' && arquivo.blocos_total != null ? Math.max(0, arquivo.blocos_total - arquivo.bloco_atual) : 0;
  return { ok: true as const, arquivo, restantes };
}

/**
 * Processa EM PASSOS, um por chamada (a tela chama de novo enquanto `restantes` > 0). Primeira chamada: converte, classifica e, se for
 * inventário, guarda o texto em `<r2_key>.txt` e conta os blocos. Cada chamada seguinte extrai exatamente um bloco. Um arquivo
 * processado (ou `reprocessar`) recomeça do zero e substitui os itens ainda não gravados; um que parou no meio (Worker caiu, erro)
 * continua do bloco onde estava.
 *
 * O status do lote é acertado no `finally`, aconteça o que acontecer no meio. Se nem o `finally` rodar (o Worker morreu), o lote fica
 * `processando` e `updated_at` (renovado a cada chamada) diz há quanto tempo: depois de 10 minutos a confirmação o retoma.
 */
export async function processarArquivo(env: Env, projectId: string, loteId: string, arquivoId: string, ator: string, reprocessar = false) {
  const db = env.DB;
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const a = await db.prepare('SELECT * FROM importacao_arquivos WHERE id = ? AND importacao_id = ?').bind(arquivoId, loteId).first<Arquivo>();
  if (!a) return nf('Arquivo não encontrado');
  const inicio = await db.prepare(`UPDATE importacoes SET status = 'processando', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${LIVRE}`).bind(loteId).run();
  if (inicio.meta.changes !== 1) return emGravacao;

  try {
    const meio = a.blocos_total != null && a.bloco_atual < a.blocos_total && (a.status === 'pendente' || a.status === 'erro');
    if (meio && !reprocessar) await extrairBloco(env, projectId, loteId, a as Arquivo & { blocos_total: number }, ator);
    else await converter(env, projectId, loteId, a, ator);
  } catch (e) {
    console.error('importacao: falha ao processar', a.id, e);
    await db.prepare(`UPDATE importacao_arquivos SET status = 'erro', erro = 'falha ao processar o arquivo; processe de novo' WHERE id = ?`).bind(a.id).run();
  } finally {
    await db.prepare(
      `UPDATE importacoes SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN EXISTS (SELECT 1 FROM importacao_arquivos WHERE importacao_id = ?1 AND status = 'pendente') THEN 'recebendo' ELSE 'em_revisao' END WHERE id = ?1 AND ${LIVRE}`
    ).bind(loteId).run();
  }
  return situacao(db, a.id);
}

/** Primeiro passo: recomeça o arquivo, converte, classifica e, se for inventário ou lista de terceiros, deixa os blocos prontos. */
async function converter(env: Env, projectId: string, loteId: string, a: Arquivo, ator: string) {
  const db = env.DB;
  await db.batch([
    db.prepare(`DELETE FROM importacao_itens WHERE arquivo_id = ? AND decisao <> 'gravado'`).bind(a.id),
    db.prepare(`UPDATE importacao_arquivos SET status = 'pendente', tipo = NULL, erro = NULL, modelo = NULL, blocos_total = NULL, bloco_atual = 0, blocos_falhos = NULL WHERE id = ?`).bind(a.id),
  ]);
  await env.STORAGE.delete(TXT(a.r2_key));
  const fim = async (status: string, tipo: string | null, erro: string | null, modelo: string | null) => {
    await db.prepare('UPDATE importacao_arquivos SET status = ?, tipo = ?, erro = ?, modelo = ? WHERE id = ?').bind(status, tipo, erro, modelo, a.id).run();
    await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: ${status}${tipo ? ` (${tipo})` : ''}`, '', '', projectId);
  };

  const lido = await textoDoArquivo(env, a);
  if ('erro' in lido) return fim('erro', null, lido.erro, null);
  let r: { tipo: TipoArquivo; modelo: string };
  try { r = await new ImportacaoAgent(env.AI, db, env).classificar(lido.texto); } catch (e) {
    console.error('importacao: IA indisponível', e);
    return fim('erro', null, 'a IA não respondeu; processe de novo', null);
  }
  if (!ENTIDADE_DO_TIPO[r.tipo]) return fim('aguardando', r.tipo, null, r.modelo);
  // Documento: um item por arquivo, tirado do começo (título, tipo, resumo); o texto inteiro vai para a versão na gravação.
  const total = r.tipo === 'documento' ? 1 : blocos(lido.texto).length;
  await env.STORAGE.put(TXT(a.r2_key), lido.texto, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  // Um cancelamento entre a conversão e o put já apagou o lote: o texto (dado do cliente) não pode ficar órfão no R2.
  const vivo = await db.prepare(`SELECT 1 FROM importacao_arquivos a JOIN importacoes l ON l.id = a.importacao_id WHERE a.id = ? AND l.status <> 'cancelada'`).bind(a.id).first();
  if (!vivo) { await env.STORAGE.delete(TXT(a.r2_key)); return; }
  await db.prepare('UPDATE importacao_arquivos SET tipo = ?, modelo = ?, blocos_total = ? WHERE id = ?').bind(r.tipo, r.modelo, total, a.id).run();
  await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: ${r.tipo}, ${total} blocos a extrair`, '', '', projectId);
}

/** Um passo: extrai o bloco `bloco_atual`, grava os itens e avança. No último, fecha o arquivo (com a nota dos blocos que falharam). */
async function extrairBloco(env: Env, projectId: string, loteId: string, a: Arquivo & { blocos_total: number }, ator: string) {
  const db = env.DB;
  const obj = await env.STORAGE.get(TXT(a.r2_key));
  if (!obj) {
    await db.prepare(`UPDATE importacao_arquivos SET status = 'erro', erro = 'texto convertido não encontrado; processe de novo', blocos_total = NULL WHERE id = ?`).bind(a.id).run();
    return;
  }
  const n = a.bloco_atual;
  const total = a.blocos_total;
  const tipo = a.tipo as TipoExtraido; // só os tipos de ENTIDADE_DO_TIPO chegam aqui (os outros param em `aguardando`)
  const r = await extrairComDivisao(new ImportacaoAgent(env.AI, db, env), tipo, blocos(await obj.text())[n] ?? '');
  const falhos = [...(a.blocos_falhos ? a.blocos_falhos.split(',') : []), ...(r.falhou ? [String(n + 1)] : [])];

  const mapas = new Map<Entidade, Map<string, string>>();
  const porNome = async (e: Entidade) => mapas.get(e) ?? mapas.set(e, await existentes(db, projectId, e)).get(e)!;
  // Um documento por arquivo: o que vier a mais na resposta é ignorado.
  const brutos = tipo === 'documento' ? r.itens.slice(0, 1) : r.itens;
  const stmts: D1PreparedStatement[] = [];
  for (const bruto of brutos) {
    const o = bruto && typeof bruto === 'object' ? { ...(bruto as Record<string, unknown>) } : {};
    const confianca = CONFIANCAS.has(String(o.confianca)) ? String(o.confianca) : 'baixa';
    const origem = typeof o.origem === 'string' ? o.origem.slice(0, 500) : null;
    let entidade = ENTIDADE_DO_TIPO[tipo]!;
    let recusa: string | null = null;
    if (tipo === 'avaliacao') {
      if (o.tipo === 'dpia' || o.tipo === 'lia') entidade = o.tipo; else recusa = 'tipo: informe dpia ou lia';
      delete o.tipo;
    }
    delete o.confianca;
    delete o.origem;
    const v = ESQUEMA[entidade].safeParse(o);
    if (recusa || !v.success) {
      const i = v.success ? null : v.error.issues[0];
      const motivo = recusa ?? `${i?.path.join('.') || 'item'}: ${i?.message ?? 'inválido'}`;
      stmts.push(stmtItem(db, loteId, a.id, projectId, n, entidade, {}, origem, confianca, [], null, 'recusado', motivo.slice(0, 300)));
      continue;
    }
    const dados = v.data as Record<string, unknown>;
    const dup = (await porNome(entidade)).get(chave(nomeDe(entidade, dados))) ?? null;
    stmts.push(stmtItem(db, loteId, a.id, projectId, n, entidade, dados, origem, confianca, faltandoDe(entidade, dados), dup, dup ? 'descartado' : 'pendente', null));
  }

  const ultimo = n + 1 >= total;
  let status = 'pendente';
  let erro: string | null = null;
  if (ultimo && falhos.length === total) {
    status = 'erro';
    erro = `a IA não leu ${total === 1 ? 'o arquivo' : `nenhum dos ${total} blocos`}; processe de novo`;
  } else if (ultimo) {
    status = 'processado';
    if (falhos.length) erro = `a IA não leu ${falhos.length === 1 ? 'o bloco' : 'os blocos'} ${falhos.join(', ')} de ${total}; processe de novo para tentar outra vez`;
  }
  // O avanço é condicional ao bloco lido: duas chamadas no mesmo bloco não gravam os itens duas vezes (os INSERTs têm a mesma guarda).
  await db.batch([
    ...stmts,
    db.prepare(`UPDATE importacao_arquivos SET bloco_atual = ?, status = ?, erro = ?, blocos_falhos = ?, modelo = COALESCE(?, modelo) WHERE id = ? AND bloco_atual = ?`)
      .bind(n + 1, status, erro, falhos.join(',') || null, r.modelo || null, a.id, n),
  ]);
  if (ultimo) await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: ${status} (${tipo}), ${total} blocos, ${falhos.length} com falha`, '', '', projectId);
}

function stmtItem(db: D1Database, loteId: string, arquivoId: string, projectId: string, bloco: number, entidade: Entidade, dados: Record<string, unknown>,
  origem: string | null, confianca: string, faltando: string[], duplicataDe: string | null, decisao: string, motivo: string | null) {
  return db.prepare(
    `INSERT INTO importacao_itens (id, importacao_id, arquivo_id, project_id, entidade, dados, origem, confianca, faltando, duplicata_de, decisao, motivo)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM importacao_arquivos WHERE id = ? AND bloco_atual = ?)`
  ).bind(crypto.randomUUID(), loteId, arquivoId, projectId, entidade, JSON.stringify(dados), origem, confianca, JSON.stringify(faltando), duplicataDe, decisao, motivo, arquivoId, bloco);
}

// ─── revisão ───────────────────────────────────────────────────────────────────────────────────────

export async function atualizarItem(db: D1Database, projectId: string, loteId: string, itemId: string,
  b: { dados?: TratamentoProposto | TerceiroProposto | DocumentoProposto | AvaliacaoProposta; decisao?: 'aceito' | 'descartado' | 'pendente' }): Promise<Falha | { ok: true; item: ReturnType<typeof itemLido> }> {
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const item = await db.prepare('SELECT * FROM importacao_itens WHERE id = ? AND importacao_id = ?').bind(itemId, loteId).first<LinhaItem>();
  if (!item) return nf('Item não encontrado');
  if (item.decisao === 'gravado') return { ok: false, status: 409, error: 'Item já gravado' };
  const esquema = ESQUEMA[item.entidade];
  // O corpo passou por um dos dois esquemas; aqui ele precisa ser o da entidade do item.
  const novos = b.dados ? esquema.safeParse(b.dados) : null;
  if (novos && !novos.success) return { ok: false, status: 400, error: `Os dados não são de um ${item.entidade}` };
  const dados = (novos?.data ?? JSON.parse(item.dados)) as Record<string, unknown>;
  // Recusado cujos dados corrigidos agora validam volta à revisão.
  const decisao = b.decisao ?? (novos && item.decisao === 'recusado' ? 'pendente' : item.decisao);
  if (decisao === 'aceito' && !esquema.safeParse(dados).success) return { ok: false, status: 400, error: 'Corrija os dados do item antes de aceitar' };
  let duplicata = item.duplicata_de as string | null;
  if (novos) duplicata = (await existentes(db, projectId, item.entidade)).get(chave(nomeDe(item.entidade, dados))) ?? null;
  const upd = await db.prepare(
    `UPDATE importacao_itens SET dados = ?, faltando = ?, duplicata_de = ?, decisao = ?, motivo = CASE WHEN ? = 'recusado' THEN motivo END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND decisao <> 'gravado' AND (SELECT status FROM importacoes WHERE id = ?) NOT IN ('gravando', 'cancelada')`
  ).bind(JSON.stringify(dados), JSON.stringify(faltandoDe(item.entidade, dados)), duplicata, decisao, decisao, itemId, loteId).run();
  if (upd.meta.changes !== 1) return emGravacao;
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

type Resultado = { item_id: string; decisao: 'gravado' | 'recusado'; registro_id?: string; motivo?: string; aviso?: string };

async function mapaPorNome(db: D1Database, sql: string, projectId: string) {
  const { results } = await db.prepare(sql).bind(projectId).all<{ id: string; nome: string }>();
  return new Map(results.map((r) => [chave(r.nome), r.id]));
}

/**
 * Itens gravados por chamada. Cada item custa ~10 consultas ao D1 (terceiro, ~17: os serviços de tipo, avaliação e DPA) e uma invocação do Worker tem teto de consultas: a resposta traz
 * `restantes` (itens ainda `aceito`) e a tela chama de novo até zerar.
 */
export const ITENS_POR_CONFIRMACAO = 30;

/**
 * Grava os aceitos. A trava é do lote, com status próprio (`gravando`, por UPDATE condicional): só uma confirmação por vez, e
 * processar, enviar, editar item e cancelar recebem 409 enquanto ela dura. Sem ela, duas chamadas simultâneas liam os mesmos aceitos
 * e gravavam cada tratamento duas vezes; e com o status compartilhado com o processamento, um `processar` soltava a trava.
 */
export async function confirmarLote(env: Env, projectId: string, loteId: string, ator: string): Promise<Falha | { ok: true; resultados: Resultado[]; restantes: number }> {
  const db = env.DB;
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  if (lote.status === 'cancelada') return { ok: false, status: 409, error: 'Lote cancelado' };
  const trava = await db.prepare(
    // ponytail: trava sem dono; a de uma gravação ou de um processamento interrompido (Worker caiu) é retomada depois de 10 minutos.
    `UPDATE importacoes SET status = 'gravando', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?
       AND (status IN ('recebendo', 'em_revisao', 'concluida') OR (status IN ('gravando', 'processando') AND updated_at < datetime('now', '-10 minutes')))`
  ).bind(loteId, projectId).run();
  if (trava.meta.changes !== 1) {
    const agora = await loteDoProjeto(db, projectId, loteId);
    return { ok: false, status: 409, error: agora?.status === 'processando' ? 'Importação em processamento' : 'Importação já em gravação' };
  }
  try {
    const resultados = await gravarAceitos(env, projectId, loteId, ator);
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM importacao_itens WHERE importacao_id = ? AND decisao = 'aceito'`).bind(loteId).first<{ n: number }>();
    return { ok: true, resultados, restantes: r?.n ?? 0 };
  } finally {
    await db.prepare(
      `UPDATE importacoes SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN EXISTS (SELECT 1 FROM importacao_itens WHERE importacao_id = ?1 AND decisao IN ('pendente', 'aceito')) THEN 'em_revisao' ELSE 'concluida' END WHERE id = ?1`
    ).bind(loteId).run();
  }
}

async function gravarAceitos(env: Env, projectId: string, loteId: string, ator: string): Promise<Resultado[]> {
  const db = env.DB;
  // Tratamentos primeiro, depois documentos, depois o resto: terceiro, DPIA e LIA da mesma confirmação ligam aos tratamentos e
  // documentos (DPA) que acabaram de ser gravados.
  const { results: aceitos } = await db.prepare(`SELECT * FROM importacao_itens WHERE importacao_id = ? AND decisao = 'aceito' ORDER BY CASE entidade WHEN 'tratamento' THEN 0 WHEN 'documento' THEN 1 ELSE 2 END, created_at, rowid LIMIT ?`)
    .bind(loteId, ITENS_POR_CONFIRMACAO).all<LinhaItem>();
  const { results: catalogo } = await db.prepare(
    `SELECT id, titulo FROM requisitos WHERE pai_id IN ('lgpd:art7', 'lgpd:art11') ORDER BY CASE pai_id WHEN 'lgpd:art7' THEN 0 ELSE 1 END, rowid`
  ).all<{ id: string; titulo: string }>();
  const finalidades = await mapaPorNome(db, 'SELECT id, processing_purpose AS nome FROM ropa_records WHERE project_id = ?', projectId);
  const itens = await mapaPorNome(db, `SELECT id, nome FROM itens WHERE project_id = ? AND status = 'ativo' ORDER BY created_at`, projectId);
  const deptos = await mapaPorNome(db, 'SELECT id, nome FROM departamentos WHERE project_id = ? ORDER BY created_at', projectId);
  const pessoas = await mapaPorNome(db, `SELECT id, nome FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY created_at`, projectId);
  const orgs = await existentes(db, projectId, 'terceiro');
  const documentos = await mapaPorNome(db, 'SELECT id, titulo AS nome FROM documentos WHERE project_id = ? ORDER BY created_at', projectId);

  const resultados: Resultado[] = [];
  const recusar = async (id: string, motivo: string) => {
    await db.prepare(`UPDATE importacao_itens SET decisao = 'recusado', motivo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND decisao = 'aceito'`).bind(motivo, id).run();
    resultados.push({ item_id: id, decisao: 'recusado', motivo });
  };

  for (const item of aceitos) {
    if (item.entidade === 'terceiro') {
      const r = await gravarTerceiro(db, projectId, loteId, ator, item, { orgs, finalidades, documentos });
      if (r.decisao === 'recusado') await recusar(item.id, r.motivo!); else resultados.push(r);
      continue;
    }
    if (item.entidade !== 'tratamento') {
      let r: Resultado;
      try {
        r = item.entidade === 'documento' ? await gravarDocumento(env, projectId, loteId, ator, item, documentos)
          : await gravarAvaliacao(db, projectId, loteId, ator, item, finalidades);
      } catch (e) {
        log('error', { msg: 'importacao_gravar_item', item: item.id, entidade: item.entidade, erro: resumoErro(e) });
        // A falha pode ter vindo depois de o serviço criar o registro (a trilha dele, por exemplo): não mandar repetir às cegas.
        r = recusado(item, `falha ao gravar; confira em ${ONDE[item.entidade as keyof typeof ONDE]} se o registro foi criado antes de tentar de novo`);
      }
      if (r.decisao === 'recusado') await recusar(item.id, r.motivo!); else resultados.push(r);
      continue;
    }
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

  return resultados;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Grava um terceiro aceito (fatia 2). A parte organização casa por nome normalizado (a que existe é reaproveitada, nunca duplicada);
 * criação da parte, vínculos com os tratamentos já cadastrados (por finalidade normalizada, papel `operador`) e a marca `gravado` vão
 * numa transação. Tipo, avaliação e DPA vêm depois pelos serviços de terceiros, cada um com a sua trilha: o que falhar ali não desfaz
 * a parte, vira `aviso` no resultado para a pessoa completar na ficha do terceiro.
 */
async function gravarTerceiro(db: D1Database, projectId: string, loteId: string, ator: string, item: LinhaItem,
  mapas: { orgs: Map<string, string>; finalidades: Map<string, string>; documentos: Map<string, string> }): Promise<Resultado> {
  const p = terceiroPropostoSchema.safeParse(JSON.parse(item.dados));
  const k = p.success ? chave(p.data.nome) : '';
  if (!p.success || !k) return { item_id: item.id, decisao: 'recusado', motivo: 'dados do item inválidos' };
  const d = p.data;
  const avisos: string[] = [];
  const existente = mapas.orgs.get(k);
  const parteId = existente ?? crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];
  if (!existente) {
    stmts.push(db.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, 'organizacao', ?, ?)`)
      .bind(parteId, projectId, d.nome, d.contato && EMAIL.test(d.contato) ? d.contato : null));
  }
  if (d.contato && !EMAIL.test(d.contato)) avisos.push(`contato "${d.contato}" não é e-mail; não foi gravado`);
  const faltam: string[] = [];
  for (const f of new Set(d.tratamentos ?? [])) {
    const rid = mapas.finalidades.get(chave(f));
    if (!rid) { faltam.push(f); continue; }
    stmts.push(db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'operador', 'tratamento', ?)`)
      .bind(crypto.randomUUID(), projectId, parteId, rid));
  }
  if (faltam.length) avisos.push(`tratamentos não encontrados no RoPA: ${faltam.join(', ')}`);
  stmts.push(db.prepare(`UPDATE importacao_itens SET decisao = 'gravado', registro_id = ?, motivo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND decisao = 'aceito'`)
    .bind(parteId, item.id));
  try {
    await db.batch(stmts);
  } catch (e) {
    console.error('importacao: falha ao gravar terceiro', item.id, e);
    return { item_id: item.id, decisao: 'recusado', motivo: 'falha ao gravar o registro; tente de novo' };
  }
  mapas.orgs.set(k, parteId);
  await logAudit(db, 'importacao.gravada', ator, `Lote ${loteId}: item ${item.id} gravado como terceiro ${parteId}${existente ? ' (parte existente)' : ''}`, '', '', projectId);

  try {
    await completarTerceiro(db, projectId, loteId, ator, parteId, d, mapas.documentos, avisos);
  } catch (e) {
    // A parte já está gravada (e o item, `gravado`): a falha daqui não a desfaz nem trava o lote; a pessoa completa na ficha.
    log('error', { msg: 'importacao_terceiro_completar', item: item.id, erro: resumoErro(e) });
    avisos.push('falha ao completar tipo/avaliação/DPA; complete na ficha');
  }

  return { item_id: item.id, decisao: 'gravado', registro_id: parteId, ...(avisos.length ? { aviso: avisos.join('; ') } : {}) };
}

/** Depois da transação: tipo, avaliação, DPA e CNPJ, pelos serviços de terceiros. O que não der vira aviso. */
async function completarTerceiro(db: D1Database, projectId: string, loteId: string, ator: string, parteId: string, d: TerceiroProposto,
  documentos: Map<string, string>, avisos: string[]) {
  // O tipo de uma parte que já tem tipo não é trocado pelo arquivo: quem tipificou à mão decide.
  const atual = (await db.prepare('SELECT terceiro_tipo FROM partes WHERE id = ?').bind(parteId).first<{ terceiro_tipo: string | null }>())?.terceiro_tipo ?? null;
  let tipo = atual;
  if (d.tipo && !atual) {
    const r = await definirTipo(db, projectId, parteId, ator, d.tipo);
    if (r.ok) tipo = d.tipo; else avisos.push(`tipo não definido: ${r.error}`);
  } else if (d.tipo && atual !== d.tipo) avisos.push(`tipo mantido como ${atual} (o arquivo diz ${d.tipo})`);

  const av = d.ultima_avaliacao;
  if (av) {
    if (av.valido_ate < new Date().toISOString().slice(0, 10)) avisos.push(`avaliação vencida (${av.valido_ate}) não registrada`);
    else if (!tipo) avisos.push('avaliação não registrada: o terceiro está sem tipo');
    else if (!(await db.prepare('SELECT 1 FROM avaliacoes_terceiro WHERE parte_id = ? AND resultado = ? AND valido_ate = ?').bind(parteId, av.resultado, av.valido_ate).first())) {
      const r = await registrarAvaliacao(db, projectId, parteId, ator, {
        resultado: av.resultado, valido_ate: av.valido_ate, observacao: `Importada no lote ${loteId}${av.metodo ? `; método no arquivo: ${av.metodo}` : ''}`,
      });
      if (!r.ok) avisos.push(`avaliação não registrada: ${r.error}`);
    }
  }

  if (d.dpa) {
    const doc = documentos.get(chave(d.dpa));
    if (!doc) avisos.push(`DPA "${d.dpa}" não está nos documentos do projeto`);
    else {
      const r = await ligarDocumento(db, projectId, parteId, ator, doc, 'dpa');
      if (!r.ok && r.status !== 409) avisos.push(`DPA não ligado: ${r.error}`);
    }
  }

  // CNPJ no perfil de fornecedor (criado pelo tipo); a anotação não se repete numa reimportação. Sem tipo não há perfil: avisa.
  if (d.cnpj) {
    if (!tipo) avisos.push(`CNPJ ${d.cnpj} não anotado: o terceiro está sem tipo (sem perfil de fornecedor)`);
    else {
      const nota = `CNPJ: ${d.cnpj}`;
      await db.prepare(`UPDATE vendors SET notes = CASE WHEN COALESCE(notes, '') = '' THEN ?1 ELSE notes || char(10) || ?1 END
        WHERE parte_id = ?2 AND project_id = ?3 AND instr(COALESCE(notes, ''), ?1) = 0`).bind(nota, parteId, projectId).run();
    }
  }
}

const recusado = (item: LinhaItem, motivo: string): Resultado => ({ item_id: item.id, decisao: 'recusado', motivo });
const marcarGravado = (db: D1Database, itemId: string, registroId: string) =>
  db.prepare(`UPDATE importacao_itens SET decisao = 'gravado', registro_id = ?, motivo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND decisao = 'aceito'`)
    .bind(registroId, itemId).run();
const gravado = (item: LinhaItem, registroId: string, avisos: string[]): Resultado =>
  ({ item_id: item.id, decisao: 'gravado', registro_id: registroId, ...(avisos.length ? { aviso: avisos.join('; ') } : {}) });
/** Onde a pessoa confere o registro criado (documento, DPIA, LIA). */
const ONDE = { documento: 'Documentos', dpia: 'DPIA', lia: 'LIA do tratamento' } as const;

/**
 * Depois que o serviço criou o registro, o item NUNCA volta como recusado sem dizer qual registro existe: a marca `gravado` que falha
 * vira `recusado` com o id criado (uma nova confirmação recusaria por duplicata, ou criaria outro); a trilha da importação que falha
 * vira aviso.
 */
async function fecharItem(db: D1Database, projectId: string, loteId: string, ator: string, item: LinhaItem, registroId: string, rotulo: string, avisos: string[]): Promise<Resultado> {
  const entidade = item.entidade as keyof typeof ONDE;
  try {
    await marcarGravado(db, item.id, registroId);
  } catch (e) {
    log('error', { msg: 'importacao_marcar_gravado', item: item.id, registro: registroId, erro: resumoErro(e) });
    return recusado(item, `${rotulo} ${registroId} ${rotulo === 'documento' ? 'criado' : 'criada'}; confira em ${ONDE[entidade]} antes de tentar de novo`);
  }
  try {
    await logAudit(db, 'importacao.gravada', ator, `Lote ${loteId}: item ${item.id} gravado como ${rotulo} ${registroId}`, '', '', projectId);
  } catch (e) {
    log('error', { msg: 'importacao_trilha', item: item.id, registro: registroId, erro: resumoErro(e) });
    avisos.push('a trilha da importação não foi registrada');
  }
  return gravado(item, registroId, avisos);
}

/**
 * Grava um documento aceito (fatia 3) pelo serviço de documentos: nasce em RASCUNHO (nunca publicado: publicar é ato de uma pessoa
 * na tela do documento), com o texto convertido do arquivo como versão 1 em rascunho. Título igual (normalizado) a um documento do
 * projeto recusa. Depois, o arquivo original vira evidência ligada ao documento; se isso falhar, o documento fica e vira aviso.
 */
async function gravarDocumento(env: Env, projectId: string, loteId: string, ator: string, item: LinhaItem, documentos: Map<string, string>): Promise<Resultado> {
  const db = env.DB;
  const p = documentoPropostoSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const k = chave(d.titulo);
  if (documentos.has(k)) return recusado(item, 'já existe documento com esse título neste projeto');
  const a = await db.prepare('SELECT nome, mime, r2_key FROM importacao_arquivos WHERE id = ?').bind(item.arquivo_id).first<{ nome: string; mime: string; r2_key: string }>();
  const txt = a ? await env.STORAGE.get(TXT(a.r2_key)) : null;
  if (!a || !txt) return recusado(item, 'texto do arquivo não encontrado; processe o arquivo de novo');
  const avisos: string[] = d.tipo ? [] : ['tipo não informado; gravado como política'];
  const c = await criarDocumento(db, projectId, ator, { tipo: d.tipo ?? 'politica', titulo: d.titulo, texto: await txt.text() });
  if (!c.ok) return recusado(item, c.error);
  documentos.set(k, c.id);
  try {
    await guardarOriginal(env, projectId, loteId, ator, c.id, a, avisos);
  } catch (e) {
    log('error', { msg: 'importacao_documento_original', item: item.id, erro: resumoErro(e) });
    avisos.push('o arquivo original não foi guardado como evidência; anexe-o à mão');
  }
  return fecharItem(db, projectId, loteId, ator, item, c.id, 'documento', avisos);
}

/**
 * Cópia do arquivo original em `evidence/<projeto>/` (o da importação some quando o lote é cancelado), com a linha de evidência ligada ao
 * documento. Sem a linha, o objeto copiado é apagado (mesma compensação do upload de evidência).
 */
async function guardarOriginal(env: Env, projectId: string, loteId: string, ator: string, documentoId: string, a: { nome: string; mime: string; r2_key: string }, avisos: string[]) {
  const obj = await env.STORAGE.get(a.r2_key);
  if (!obj) throw new Error('arquivo original não encontrado no armazenamento');
  const bytes = await obj.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID();
  const r2Key = `evidence/${projectId}/${id}-${a.nome}`;
  await env.STORAGE.put(r2Key, bytes, { httpMetadata: { contentType: a.mime } });
  try {
    await env.DB.prepare(
      `INSERT INTO evidence (id, project_id, control_id, documento_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, evaluation_notes, uploaded_by, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))`
    ).bind(id, projectId, documentoId, a.nome, bytes.byteLength, a.mime, r2Key, hash, `Arquivo original do documento, importado no lote ${loteId}`, ator).run();
  } catch (e) {
    await env.STORAGE.delete(r2Key).catch(() => undefined);
    throw e;
  }
  // A evidência já está guardada: falha só da trilha não pode virar "original não guardado".
  try {
    await logAudit(env.DB, 'evidence.uploaded', ator, `Evidência ${a.nome} (SHA-256: ${hash.slice(0, 8)}...) guardada como original do documento ${documentoId}`, '', '', projectId);
  } catch (e) {
    log('error', { msg: 'importacao_trilha_evidencia', documento: documentoId, erro: resumoErro(e) });
    avisos.push('a trilha da evidência do arquivo original não foi registrada');
  }
}

/**
 * Grava uma DPIA ou LIA aceita (fatia 3), ligada ao tratamento do RoPA de mesma finalidade normalizada (sem ele, recusa). DPIA: a
 * do tratamento (`criarDpiaDoTratamento`, `Draft`), com a conclusão (marcada como do arquivo) e os riscos copiados depois para
 * `risks_identified` (a falha disso vira aviso). Parecer e recomendações do DPO ficam vazios: são do encarregado, não do arquivo.
 * LIA: rascunho (`salvarLia`), com a conclusão e os riscos do arquivo no balanceamento; concluir (prevalece ou não) é de uma pessoa.
 * Já existe DPIA/LIA no tratamento: recusa, o arquivo não sobrescreve.
 */
async function gravarAvaliacao(db: D1Database, projectId: string, loteId: string, ator: string, item: LinhaItem, finalidades: Map<string, string>): Promise<Resultado> {
  const p = avaliacaoPropostaSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const ropaId = finalidades.get(chave(d.tratamento));
  if (!ropaId) return recusado(item, `tratamento "${d.tratamento}" não encontrado no RoPA deste projeto`);
  const conclusao = d.conclusao ? `Conclusão no documento importado (lote ${loteId}): ${d.conclusao}` : '';
  const riscos = (d.riscos ?? []).map((r) => `- ${r}`).join('\n');

  if (item.entidade === 'lia') {
    if (await lerLia(db, projectId, ropaId)) return recusado(item, 'já existe LIA para este tratamento');
    const balanceamento = [conclusao, riscos && `Riscos apontados no documento importado:\n${riscos}`].filter(Boolean).join('\n\n') || null;
    const r = await salvarLia(db, projectId, ropaId, ator, { balanceamento, status: 'rascunho' });
    if (!r.ok) return recusado(item, r.error);
    return fecharItem(db, projectId, loteId, ator, item, r.id, 'LIA', []);
  }

  const lig = await lerLigacoes(db, projectId, ropaId);
  if (!lig) return recusado(item, `tratamento "${d.tratamento}" não encontrado no RoPA deste projeto`);
  const r = await criarDpiaDoTratamento(db, projectId, ropaId, ator, lig);
  if (!r.ok) return recusado(item, r.status === 409 ? 'já existe DPIA ligada a este tratamento' : r.error);
  const avisos: string[] = [];
  // `dpo_opinion` e `dpo_recommendations` ficam nulos: o relatório os imprime como parecer do encarregado e a tela espera o dele.
  const texto = [conclusao, riscos && `Riscos apontados no documento importado:\n${riscos}`].filter(Boolean).join('\n\n');
  if (texto) {
    try {
      await db.prepare('UPDATE dpia_assessments SET risks_identified = ? WHERE id = ? AND project_id = ?').bind(texto, r.id, projectId).run();
    } catch (e) {
      log('error', { msg: 'importacao_dpia_completar', item: item.id, erro: resumoErro(e) });
      avisos.push('riscos e conclusão não foram copiados para a DPIA; complete na DPIA');
    }
  }
  return fecharItem(db, projectId, loteId, ator, item, r.id, 'DPIA', avisos);
}

// ─── cancelar ──────────────────────────────────────────────────────────────────────────────────────

/** Apaga os arquivos (R2 e linhas) e os itens; o lote fica `cancelada`. Registros já gravados no RoPA ficam. */
export async function cancelarLote(env: Env, projectId: string, loteId: string, ator: string): Promise<Falha | { ok: true }> {
  const lote = await loteDoProjeto(env.DB, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  // Marca cancelada ANTES de apagar, e nunca por cima de uma gravação em curso.
  const marca = await env.DB.prepare(`UPDATE importacoes SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'gravando'`).bind(loteId).run();
  if (marca.meta.changes !== 1) return emGravacao;
  const { results } = await env.DB.prepare('SELECT r2_key FROM importacao_arquivos WHERE importacao_id = ?').bind(loteId).all<{ r2_key: string }>();
  if (results.length) await env.STORAGE.delete(results.flatMap((r) => [r.r2_key, TXT(r.r2_key)]));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM importacao_itens WHERE importacao_id = ?').bind(loteId),
    env.DB.prepare('DELETE FROM importacao_arquivos WHERE importacao_id = ?').bind(loteId),
  ]);
  await logAudit(env.DB, 'importacao.cancelada', ator, `Lote ${loteId} cancelado: ${results.length} arquivos apagados`, '', '', projectId);
  return { ok: true };
}
