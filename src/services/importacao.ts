import { logAudit } from '../helpers';
import { normalizarNome } from './nomes';
import { log, resumoErro } from '../observability';
import { ImportacaoAgent, type TipoArquivo, type TipoExtraido } from '../agents/importacao';
import {
  OBRIGATORIOS_AVALIACAO, OBRIGATORIOS_CONSENTIMENTO, OBRIGATORIOS_DOCUMENTO, OBRIGATORIOS_INCIDENTE, OBRIGATORIOS_PEDIDO, OBRIGATORIOS_ROPA,
  OBRIGATORIOS_TERCEIRO, PSEUDONIMO, avaliacaoPropostaSchema, consentimentoPropostoSchema, documentoPropostoSchema, incidentePropostoSchema,
  pedidoPropostoSchema, terceiroPropostoSchema, tratamentoPropostoSchema, type ConsentimentoProposto,
  type IncidenteProposto, type PedidoProposto, type TerceiroProposto,
  OBRIGATORIOS_BASES, OBRIGATORIOS_CICLO, OBRIGATORIOS_GAP, OBRIGATORIOS_IMPACTO, OBRIGATORIOS_RISCO, basesPropostasSchema, cicloPropostoSchema,
  gapPropostoSchema, impactoPropostoSchema, riscoPropostoSchema,
} from '../schemas/importacao';
import { criarAcao, criarRisco } from './riscos-atividade';
import { lerImpacto, salvarImpacto, PERGUNTAS_IMPACTO, type RespostaImpacto } from './impacto';
import { lerCiclo, salvarCiclo } from './ciclo';
import { lerBases, salvarBases } from './bases';
import { itensDoModelo, modeloDoCsv, type Modelo } from './importacao-modelos';
import { montarCsv } from './exportacao';
import { chave, stmtInserirTratamento, validarTratamento } from './tratamentos-importar';
import { lerLigacoes, stmtsLigacao } from './tratamentos';
import { stmtsCriarAtivo } from './itens';
import { criarDpiaDoTratamento, ehLegitimoInteresse, lerLia, salvarLia } from './lia';
import { criarDocumento } from './documentos';
import { definirTipo, ligarDocumento, registrarAvaliacao } from './terceiros';
import { importarPedido } from './titular-pedidos';
import { importarIncidente } from './incidentes';
import { importarConsentimento } from './consentimentos';

/**
 * Importação de programa de privacidade (n.privacy, fatias 1 a 4; spec docs/superpowers/specs/2026-10-11-importacao-privacy-design.md).
 * Lote → arquivos (R2 `STORAGE`, chave `importacoes/<projeto>/<lote>/<arquivo>`) → o agente classifica e, se for inventário, lista
 * de terceiros, documento, avaliação ou histórico, propõe os itens (`entidade` tratamento, terceiro, documento, dpia, lia,
 * titular_pedido, incidente ou consentimento) → uma pessoa revisa → `confirmar` grava os aceitos.
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
type Env = { DB: D1Database; STORAGE: R2Bucket; AI: Ai; TOKEN_ENC_KEY?: string };
type Lote = { id: string; project_id: string; status: string };
type LinhaItem = { id: string; entidade: Entidade; dados: string; faltando: string; decisao: string; [k: string]: unknown };

/**
 * Entidade proposta por tipo de arquivo; tipo fora daqui (desconhecido) fica `aguardando`. Avaliação é `dpia` ou `lia` item a item (o
 * campo `tipo` da resposta do modelo decide); histórico é `titular_pedido`, `incidente` ou `consentimento` (o campo `registro`). A
 * entidade aqui só marca que o tipo é extraído.
 */
export type Entidade = 'tratamento' | 'terceiro' | 'documento' | 'dpia' | 'lia' | 'titular_pedido' | 'incidente' | 'consentimento'
  | 'risco' | 'gap' | 'impacto' | 'ciclo' | 'bases';
type EntidadeHistorico = 'titular_pedido' | 'incidente' | 'consentimento';
const ENTIDADE_DO_TIPO: Partial<Record<TipoArquivo, Entidade>> = { inventario: 'tratamento', terceiros: 'terceiro', documento: 'documento', avaliacao: 'dpia', historico: 'titular_pedido' };
const DO_REGISTRO: Record<string, EntidadeHistorico> = { pedido: 'titular_pedido', incidente: 'incidente', consentimento: 'consentimento' };
const ESQUEMA = {
  tratamento: tratamentoPropostoSchema, terceiro: terceiroPropostoSchema, documento: documentoPropostoSchema, dpia: avaliacaoPropostaSchema, lia: avaliacaoPropostaSchema,
  titular_pedido: pedidoPropostoSchema, incidente: incidentePropostoSchema, consentimento: consentimentoPropostoSchema,
  risco: riscoPropostoSchema, gap: gapPropostoSchema, impacto: impactoPropostoSchema, ciclo: cicloPropostoSchema, bases: basesPropostasSchema,
};
/** Entidades que um arquivo de avaliação pode trazer, item a item (o campo `tipo` da resposta do modelo decide). */
const DA_AVALIACAO = new Set<Entidade>(['dpia', 'lia', 'risco', 'gap', 'impacto', 'ciclo']);
/** Texto livre de risco e ação: pode citar alguém; e-mail, CPF e telefone viram `[dado pessoal]` antes de ser guardado. */
const TEXTO_LIVRE: Partial<Record<Entidade, string[]>> = { risco: ['ameaca', 'vulnerabilidade', 'plano'], gap: ['titulo', 'descricao', 'risco'] };
export async function semPii(entidade: Entidade, o: Record<string, unknown>) {
  for (const k of TEXTO_LIVRE[entidade] ?? []) if (typeof o[k] === 'string') o[k] = await mascararPii(o[k] as string, () => '[dado pessoal]');
  return o;
}
const OBRIGATORIOS: Record<Entidade, readonly string[]> = {
  tratamento: OBRIGATORIOS_ROPA, terceiro: OBRIGATORIOS_TERCEIRO, documento: OBRIGATORIOS_DOCUMENTO, dpia: OBRIGATORIOS_AVALIACAO, lia: OBRIGATORIOS_AVALIACAO,
  titular_pedido: OBRIGATORIOS_PEDIDO, incidente: OBRIGATORIOS_INCIDENTE, consentimento: OBRIGATORIOS_CONSENTIMENTO,
  risco: OBRIGATORIOS_RISCO, gap: OBRIGATORIOS_GAP, impacto: OBRIGATORIOS_IMPACTO, ciclo: OBRIGATORIOS_CICLO, bases: OBRIGATORIOS_BASES,
};
const campo = (k: string) => (d: Record<string, unknown>) => String(d[k] ?? '');
const protocoloDe = (d: Record<string, unknown>) => (d.protocolo ? `p ${d.protocolo}` : '');
/**
 * O nome que decide a duplicata: finalidade do tratamento, nome do terceiro, título do documento, tratamento avaliado; pedido pelo
 * protocolo de origem (sem ele, não há como saber); incidente pelo protocolo de origem, senão título e dia da ciência; consentimento
 * pelo pseudônimo, finalidade e data.
 */
const NOME: Record<Entidade, (d: Record<string, unknown>) => string> = {
  tratamento: campo('finalidade'), terceiro: campo('nome'), documento: campo('titulo'), dpia: campo('tratamento'), lia: campo('tratamento'),
  titular_pedido: protocoloDe,
  incidente: (d) => protocoloDe(d) || `t ${d.titulo} ${String(d.ciencia_em ?? '').slice(0, 10)}`,
  consentimento: (d) => `${d.titular_ref} ${d.finalidade} ${d.obtido_em}`,
  // F6: risco por (atividade, ameaça), ação por (atividade, título), ciclo por (atividade, etapa), teste de impacto pela atividade;
  // bases nunca são duplicata (a gravação só acrescenta o que falta).
  risco: (d) => `${d.atividade} ${d.ameaca}`,
  gap: (d) => `${d.atividade} ${d.titulo}`,
  impacto: campo('atividade'),
  ciclo: (d) => `${d.atividade} ${d.etapa}`,
  bases: () => '',
};
const nomeDe = (entidade: Entidade, d: Record<string, unknown>) => NOME[entidade](d);
/** Id do registro já cadastrado com o mesmo nome normalizado; nome vazio (pedido sem protocolo) nunca é duplicata. */
const duplicataDe = (mapa: Map<string, string>, entidade: Entidade, d: Record<string, unknown>) => {
  const k = chave(nomeDe(entidade, d));
  return k ? mapa.get(k) ?? null : null;
};

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

/** Protocolo de origem gravado pela importação: a primeira linha da descrição, `Protocolo original: <x>` (20 caracteres de prefixo). */
const PROTOCOLO_ORIGINAL = `'p ' || substr(descricao, 21, CASE WHEN instr(descricao, char(10)) > 0 THEN instr(descricao, char(10)) - 21 ELSE length(descricao) END)`;
/**
 * Registros já cadastrados, por nome normalizado: tratamentos do RoPA, partes organização ATIVAS (a inativa não é duplicata),
 * documentos pelo título, DPIA e LIA pela finalidade do tratamento a que estão ligadas; histórico pelas chaves de `NOME`.
 */
const SQL_EXISTENTES: Record<Entidade, string> = {
  tratamento: 'SELECT id, processing_purpose AS nome FROM ropa_records WHERE project_id = ?',
  terceiro: `SELECT id, nome FROM partes WHERE project_id = ? AND tipo = 'organizacao' AND status = 'ativa' ORDER BY created_at`,
  documento: 'SELECT id, titulo AS nome FROM documentos WHERE project_id = ? ORDER BY created_at',
  dpia: 'SELECT d.id, r.processing_purpose AS nome FROM dpia_assessments d JOIN ropa_records r ON r.id = d.ropa_id WHERE d.project_id = ? ORDER BY d.created_at',
  lia: 'SELECT l.id, r.processing_purpose AS nome FROM lia_assessments l JOIN ropa_records r ON r.id = l.ropa_id WHERE l.project_id = ?',
  titular_pedido: `SELECT id, ${PROTOCOLO_ORIGINAL} AS nome FROM titular_pedidos WHERE project_id = ? AND descricao LIKE 'Protocolo original: %' ORDER BY created_at`,
  incidente: `SELECT id, 't ' || titulo || ' ' || substr(ciencia_em, 1, 10) AS nome FROM incidentes WHERE project_id = ?1
    UNION ALL SELECT id, ${PROTOCOLO_ORIGINAL} FROM incidentes WHERE project_id = ?1 AND descricao LIKE 'Protocolo original: %'`,
  consentimento: `SELECT id, titular_ref || ' ' || finalidade || ' ' || substr(obtido_em, 1, 10) AS nome FROM consentimentos WHERE project_id = ? ORDER BY created_at`,
  risco: `SELECT r.id, a.processing_purpose || ' ' || r.threat AS nome FROM risks r JOIN ropa_records a ON a.id = r.ropa_id AND a.project_id = r.project_id WHERE r.project_id = ? ORDER BY r.created_at`,
  gap: `SELECT ca.id, a.processing_purpose || ' ' || ca.title AS nome FROM corrective_actions ca JOIN ropa_records a ON a.id = ca.ropa_id AND a.project_id = ca.project_id WHERE ca.project_id = ? ORDER BY ca.created_at`,
  impacto: `SELECT DISTINCT a.id, a.processing_purpose AS nome FROM tratamento_impacto t JOIN ropa_records a ON a.id = t.ropa_id AND a.project_id = t.project_id WHERE t.project_id = ?`,
  ciclo: `SELECT a.id, a.processing_purpose || ' ' || c.etapa AS nome FROM tratamento_ciclo c JOIN ropa_records a ON a.id = c.ropa_id AND a.project_id = c.project_id WHERE c.project_id = ?`,
  bases: `SELECT id, '' AS nome FROM ropa_records WHERE project_id = ? AND 0`,
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

// ─── dado pessoal ──────────────────────────────────────────────────────────────────────────────────

/**
 * E-mail, CPF e telefone (BR; com DDD entre parênteses ou seguido de separador, ou celular 9XXXX-XXXX: número solto de 10 dígitos,
 * intervalo de anos e protocolo com hífen não são telefone; E.164 `+55` seguido de 10 ou 11 dígitos é), com o valor normalizado (e-mail em minúsculas, CPF e telefone só dígitos, telefone sem o 55) para que o
 * mesmo titular escrito de jeitos diferentes dê o mesmo pseudônimo. Ordem importa: e-mail antes (tem dígitos), CPF antes do telefone
 * (11 dígitos soltos são tratados como CPF; o pseudônimo é o mesmo porque a normalização é a mesma).
 * ponytail: só esses três por regex; nome, endereço e outros identificadores não são detectáveis assim (o prompt proíbe devolvê-los,
 * o esquema não tem campo para eles e uma pessoa revisa).
 */
/** Telefone BR pela regra acima. Também a do rascunho de IA (`rascunhos-privacy.ts`): uma regra só para o que vai ao modelo. */
export const TELEFONE = /(?:(?:\+55\s?)?(?:\(\d{2}\)\s?|\b\d{2}[\s.-])9?\d{4}[\s.-]?\d{4}|\b9\d{4}-\d{4}|\+55\d{10,11})\b/g;
const PII: [RegExp, (s: string) => string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (s) => s.toLowerCase()],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (s) => s.replace(/\D/g, '')],
  [TELEFONE, (s) => s.replace(/\D/g, '').slice(-11)],
];

/** Troca cada e-mail, CPF e telefone do texto por `troca(valor normalizado)`. Uma passada por padrão, sobre marcadores: o que entra não é casado de novo. */
export async function mascararPii(texto: string, troca: (valor: string) => string | Promise<string>): Promise<string> {
  const valores: string[] = [];
  let t = texto.replace(/\u0001/g, '');
  for (const [re, normalizar] of PII) t = t.replace(re, (m) => `\u0001${valores.push(normalizar(m)) - 1}\u0001`);
  const trocas = await Promise.all(valores.map((v) => troca(v)));
  return t.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => trocas[Number(i)]);
}

/**
 * Pseudônimo do titular: `tit-` + 16 hex do HMAC-SHA256 com uma subchave própria (HMAC da `TOKEN_ENC_KEY` sobre `SUBCHAVE_TITULAR`:
 * a chave de cifra não é usada direto para outra finalidade), separado por projeto. O mesmo
 * valor no mesmo projeto dá sempre o mesmo pseudônimo (a duplicata do consentimento depende disso); sem a chave não se reverte nem se
 * testa CPF por força bruta. Sem a chave, FALHA: o histórico não vai ao modelo sem pseudonimizar.
 * ponytail: trocar a chave muda os pseudônimos novos (os já gravados ficam); se a chave precisar girar, guardar uma chave própria.
 */
export const SUBCHAVE_TITULAR = 'n.iso/importacao/titular_ref/v1';
export function pseudonimizador(segredo: string | undefined, projectId: string): (valor: string) => Promise<string> {
  if (!segredo) throw new Error('TOKEN_ENC_KEY ausente: sem pseudonimização o histórico não vai ao modelo');
  const enc = new TextEncoder();
  const hmac = (chave: ArrayBuffer | Uint8Array) => crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const k = hmac(enc.encode(segredo)).then((mestra) => crypto.subtle.sign('HMAC', mestra, enc.encode(SUBCHAVE_TITULAR))).then(hmac);
  const cache = new Map<string, Promise<string>>();
  return (valor) => {
    let t = cache.get(valor);
    if (!t) {
      t = k.then((chaveHmac) => crypto.subtle.sign('HMAC', chaveHmac, enc.encode(`titular_ref:${projectId}:${valor}`)))
        .then((sig) => `tit-${[...new Uint8Array(sig).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
      cache.set(valor, t);
    }
    return t;
  };
}

/** `titular_ref` devolvido pelo modelo: o pseudônimo copiado do texto fica; qualquer outra coisa (código interno, ou um nome) vira pseudônimo. */
async function refPseudonima(pseud: (v: string) => Promise<string>, ref: string): Promise<string> {
  const t = (await mascararPii(ref.trim(), pseud)).trim();
  return PSEUDONIMO.test(t) ? t : pseud(`ref:${chave(ref)}`);
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
  // F6: CSV com o cabeçalho de um modelo não vai à IA (o caminho da migração do legado não depende de a IA acertar).
  const modelo = a.mime === 'text/csv' ? modeloDoCsv(lido.texto) : null;
  if (modelo) return propostosDoModelo(db, projectId, loteId, a, ator, modelo, lido.texto);
  let r: { tipo: TipoArquivo; modelo: string };
  // A classificação não precisa de quem é o titular: e-mail, CPF e telefone não saem para o modelo.
  try { r = await new ImportacaoAgent(env.AI, db, env).classificar(await mascararPii(lido.texto, () => '[dado pessoal]')); } catch (e) {
    console.error('importacao: IA indisponível', e);
    return fim('erro', null, 'a IA não respondeu; processe de novo', null);
  }
  if (!ENTIDADE_DO_TIPO[r.tipo]) return fim('aguardando', r.tipo, null, r.modelo);
  if (r.tipo === 'historico' && !env.TOKEN_ENC_KEY) return fim('erro', r.tipo, 'chave de pseudonimização (TOKEN_ENC_KEY) não configurada: o histórico não vai à IA sem ela', r.modelo);
  // Documento: um item por arquivo, tirado do começo (título, tipo, resumo); o texto inteiro vai para a versão na gravação.
  const total = r.tipo === 'documento' ? 1 : blocos(lido.texto).length;
  await env.STORAGE.put(TXT(a.r2_key), lido.texto, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  // Um cancelamento entre a conversão e o put já apagou o lote: o texto (dado do cliente) não pode ficar órfão no R2.
  const vivo = await db.prepare(`SELECT 1 FROM importacao_arquivos a JOIN importacoes l ON l.id = a.importacao_id WHERE a.id = ? AND l.status <> 'cancelada'`).bind(a.id).first();
  if (!vivo) { await env.STORAGE.delete(TXT(a.r2_key)); return; }
  await db.prepare('UPDATE importacao_arquivos SET tipo = ?, modelo = ?, blocos_total = ? WHERE id = ?').bind(r.tipo, r.modelo, total, a.id).run();
  await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: ${r.tipo}, ${total} blocos a extrair`, '', '', projectId);
}

/**
 * Modelo de CSV (F6): cada linha vira um item de confiança alta, validado pelo esquema estrito da entidade, SEM IA. A linha inválida
 * vira item `recusado` com o número do registro e o campo; a duplicata nasce `descartado`. `origem` é só "registro N do modelo X",
 * nunca o texto da linha. O arquivo fecha num passo (`blocos_total` = 1) e o nome do modelo fica em `modelo`.
 */
async function propostosDoModelo(db: D1Database, projectId: string, loteId: string, a: Arquivo, ator: string, m: Modelo, texto: string) {
  const existentesDaEntidade = await existentes(db, projectId, m.entidade);
  const stmts: D1PreparedStatement[] = [];
  let recusados = 0;
  for (const { linha, dados: bruto } of itensDoModelo(texto, m)) {
    const origem = `registro ${linha} do modelo ${m.nome}`;
    const v = ESQUEMA[m.entidade].safeParse(await semPii(m.entidade, bruto));
    if (!v.success) {
      const i = v.error.issues[0];
      recusados++;
      stmts.push(stmtItem(db, loteId, a.id, projectId, 0, m.entidade, {}, origem, 'alta', [], null, 'recusado', `registro ${linha}: ${i?.path.join('.') || 'linha'}: ${i?.message ?? 'inválido'}`.slice(0, 300)));
      continue;
    }
    const dados = v.data as Record<string, unknown>;
    const dup = duplicataDe(existentesDaEntidade, m.entidade, dados);
    stmts.push(stmtItem(db, loteId, a.id, projectId, 0, m.entidade, dados, origem, 'alta', faltandoDe(m.entidade, dados), dup, dup ? 'descartado' : 'pendente', null));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.prepare(`UPDATE importacao_arquivos SET status = 'processado', tipo = ?, modelo = ?, erro = NULL, blocos_total = 1, bloco_atual = 1 WHERE id = ? AND bloco_atual = 0`)
    .bind(m.tipo, `modelo CSV: ${m.nome}`, a.id).run();
  await logAudit(db, 'importacao.processada', ator, `Arquivo ${a.id} do lote ${loteId}: modelo CSV ${m.nome}, ${stmts.length} registros, ${recusados} recusados`, '', '', projectId);
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
  let texto = blocos(await obj.text())[n] ?? '';
  // Histórico: e-mail, CPF e telefone viram pseudônimo ANTES do modelo; ele só vê (e só devolve) `tit-...`.
  const pseud = tipo === 'historico' ? pseudonimizador(env.TOKEN_ENC_KEY, projectId) : null;
  if (pseud) texto = await mascararPii(texto, pseud);
  // Avaliação (RIPD, LIA, riscos, plano de ação): quem é o titular não importa; e-mail, CPF e telefone não saem para o modelo.
  else if (tipo === 'avaliacao') texto = await mascararPii(texto, () => '[dado pessoal]');
  const r = await extrairComDivisao(new ImportacaoAgent(env.AI, db, env), tipo, texto);
  const falhos = [...(a.blocos_falhos ? a.blocos_falhos.split(',') : []), ...(r.falhou ? [String(n + 1)] : [])];

  const mapas = new Map<Entidade, Map<string, string>>();
  const porNome = async (e: Entidade) => mapas.get(e) ?? mapas.set(e, await existentes(db, projectId, e)).get(e)!;
  // Um documento por arquivo: o que vier a mais na resposta é ignorado.
  const brutos = tipo === 'documento' ? r.itens.slice(0, 1) : r.itens;
  const stmts: D1PreparedStatement[] = [];
  for (const bruto of brutos) {
    const o = bruto && typeof bruto === 'object' ? { ...(bruto as Record<string, unknown>) } : {};
    const confianca = CONFIANCAS.has(String(o.confianca)) ? String(o.confianca) : 'baixa';
    let origem = typeof o.origem === 'string' ? o.origem.slice(0, 500) : null;
    let entidade = ENTIDADE_DO_TIPO[tipo]!;
    let recusa: string | null = null;
    if (tipo === 'avaliacao') {
      if (DA_AVALIACAO.has(o.tipo as Entidade)) entidade = o.tipo as Entidade; else recusa = 'tipo: informe dpia, lia, risco, gap, impacto ou ciclo';
      delete o.tipo;
    }
    if (pseud) {
      // O trecho de origem repetiria o texto do registro (dado pessoal que a regex não pega, como nome): não é guardado.
      origem = null;
      const e = DO_REGISTRO[String(o.registro)];
      if (e) entidade = e; else recusa = 'registro: informe pedido, incidente ou consentimento';
      delete o.registro;
      if (typeof o.titular_ref === 'string' && o.titular_ref.trim()) o.titular_ref = await refPseudonima(pseud, o.titular_ref);
    }
    delete o.confianca;
    delete o.origem;
    await semPii(entidade, o);
    const v = ESQUEMA[entidade].safeParse(o);
    if (recusa || !v.success) {
      const i = v.success ? null : v.error.issues[0];
      const motivo = recusa ?? `${i?.path.join('.') || 'item'}: ${i?.message ?? 'inválido'}`;
      stmts.push(stmtItem(db, loteId, a.id, projectId, n, entidade, {}, origem, confianca, [], null, 'recusado', motivo.slice(0, 300)));
      continue;
    }
    const dados = v.data as Record<string, unknown>;
    const dup = duplicataDe(await porNome(entidade), entidade, dados);
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
  b: { dados?: Record<string, unknown>; decisao?: 'aceito' | 'descartado' | 'pendente' }): Promise<Falha | { ok: true; item: ReturnType<typeof itemLido> }> {
  const lote = await loteDoProjeto(db, projectId, loteId);
  if (!lote) return nf('Lote não encontrado');
  const c = cancelado(lote);
  if (c) return c;
  const item = await db.prepare('SELECT * FROM importacao_itens WHERE id = ? AND importacao_id = ?').bind(itemId, loteId).first<LinhaItem>();
  if (!item) return nf('Item não encontrado');
  if (item.decisao === 'gravado') return { ok: false, status: 409, error: 'Item já gravado' };
  const esquema = ESQUEMA[item.entidade];
  // O corpo passou por um dos dois esquemas; aqui ele precisa ser o da entidade do item.
  const novos = b.dados ? esquema.safeParse(await semPii(item.entidade, { ...b.dados })) : null;
  if (novos && !novos.success) return { ok: false, status: 400, error: `Os dados não são de um ${item.entidade}` };
  const dados = (novos?.data ?? JSON.parse(item.dados)) as Record<string, unknown>;
  // Recusado cujos dados corrigidos agora validam volta à revisão.
  const decisao = b.decisao ?? (novos && item.decisao === 'recusado' ? 'pendente' : item.decisao);
  if (decisao === 'aceito' && !esquema.safeParse(dados).success) return { ok: false, status: 400, error: 'Corrija os dados do item antes de aceitar' };
  let duplicata = item.duplicata_de as string | null;
  if (novos) duplicata = duplicataDe(await existentes(db, projectId, item.entidade), item.entidade, dados);
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
  // Tratamentos primeiro (criam os sistemas, áreas e pessoas), depois documentos, depois riscos, ações, teste de impacto, ciclo e
  // bases (a ação acha o risco gravado antes), depois o resto na ordem de chegada: terceiro, DPIA, LIA e histórico ligam ao que acabou
  // de ser gravado (a DPIA herda o teste de impacto e o ciclo da mesma confirmação).
  const { results: aceitos } = await db.prepare(`SELECT * FROM importacao_itens WHERE importacao_id = ? AND decisao = 'aceito'
    ORDER BY CASE WHEN entidade = 'tratamento' THEN 0 WHEN entidade = 'documento' THEN 1 WHEN entidade = 'risco' THEN 2 WHEN entidade = 'gap' THEN 3
      WHEN entidade IN ('impacto', 'ciclo', 'bases') THEN 4 ELSE 5 END, created_at, rowid LIMIT ?`)
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

  const jaGravados = new Map<Entidade, Map<string, string>>();
  const gravadosDe = async (e: Entidade) => jaGravados.get(e) ?? jaGravados.set(e, await existentes(db, projectId, e)).get(e)!;

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
        const ctx = { finalidades, pessoas, itens, catalogo, loteId, gravados: await gravadosDe(item.entidade) };
        r = item.entidade === 'documento' ? await gravarDocumento(env, projectId, loteId, ator, item, documentos)
          : item.entidade === 'dpia' || item.entidade === 'lia' ? await gravarAvaliacao(db, projectId, loteId, ator, item, finalidades)
            : GRAVAR_DA_ATIVIDADE[item.entidade] ? await GRAVAR_DA_ATIVIDADE[item.entidade]!(db, projectId, ator, item, ctx)
              : await gravarHistorico(db, projectId, loteId, ator, item, finalidades, ctx.gravados);
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
    const areas = resolver(d.areas, deptos, (id, nome) => [db.prepare('INSERT INTO departamentos (id, project_id, nome) VALUES (?, ?, ?)').bind(id, projectId, normalizarNome(nome))]);
    const gente = resolver(d.pessoas, pessoas, (id, nome) => [db.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES (?, ?, 'pessoa', ?)`).bind(id, projectId, normalizarNome(nome))]);
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

 // O aviso fica no item, para o relatório de reconciliação contar depois (a resposta some com a tela).
  const comAviso = resultados.filter((r) => r.aviso);
  if (comAviso.length) {
    await db.batch(comAviso.map((r) => db.prepare('UPDATE importacao_itens SET aviso = ? WHERE id = ?').bind(r.aviso!.slice(0, 1000), r.item_id)));
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
      .bind(parteId, projectId, normalizarNome(d.nome), d.contato && EMAIL.test(d.contato) ? d.contato : null));
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
/** Onde a pessoa confere o registro criado (documento, DPIA, LIA, histórico). */
const ONDE = {
  documento: 'Documentos', dpia: 'DPIA', lia: 'LIA do tratamento', titular_pedido: 'Pedidos do titular', incidente: 'Incidentes', consentimento: 'Consentimentos',
  risco: 'Riscos da atividade', gap: 'Ações da atividade', impacto: 'Teste de impacto da atividade', ciclo: 'Ciclo de vida da atividade',
  bases: 'Bases legais da atividade',
} as const;
const FEMININO = new Set(['DPIA', 'LIA', 'ação']);

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
    return recusado(item, `${rotulo} ${registroId} ${FEMININO.has(rotulo) ? 'criada' : 'criado'}; confira em ${ONDE[entidade]} antes de tentar de novo`);
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
    const balanceamento = [d.balanceamento, conclusao, riscos && `Riscos apontados no documento importado:\n${riscos}`].filter(Boolean).join('\n\n') || null;
    // F6: as seções da LIA do legado vão cada uma para o seu campo; a conclusão (prevalece ou não) continua de uma pessoa.
    const r = await salvarLia(db, projectId, ropaId, ator, {
      balanceamento, status: 'rascunho', finalidade_legitima: d.finalidade_legitima ?? undefined, necessidade: d.necessidade ?? undefined,
      salvaguardas: d.salvaguardas ?? undefined,
    });
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
  // F6: necessidade e medidas do RIPD do legado entram DEPOIS do que a DPIA herdou do tratamento (nada herdado se perde).
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (texto) { sets.push('risks_identified = ?'); binds.push(texto); }
  const anexar = (col: string, v: string | null | undefined) => {
    if (!v) return;
    sets.push(`${col} = trim(COALESCE(${col}, '') || char(10) || char(10) || ?)`);
    binds.push(`No documento importado (lote ${loteId}): ${v}`);
  };
  anexar('necessity_proportionality', d.necessidade);
  anexar('mitigation_measures', d.medidas);
  if (d.risco_residual) { sets.push('residual_risk_level = ?'); binds.push(RESIDUAL_DPIA[d.risco_residual]); }
  if (sets.length) {
    try {
      await db.prepare(`UPDATE dpia_assessments SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`).bind(...binds, r.id, projectId).run();
    } catch (e) {
      log('error', { msg: 'importacao_dpia_completar', item: item.id, erro: resumoErro(e) });
      avisos.push('riscos e conclusão não foram copiados para a DPIA (nem as seções do arquivo); complete na DPIA');
    }
  }
  return fecharItem(db, projectId, loteId, ator, item, r.id, 'DPIA', avisos);
}

const RESIDUAL_DPIA = { baixo: 'Low', medio: 'Medium', alto: 'High' } as const;

/** Descrição do registro importado; a primeira linha é o protocolo de origem (é por ela que a duplicata é achada, `PROTOCOLO_ORIGINAL`). */
const descricaoImportada = (loteId: string, protocolo: string | null | undefined, extra: string[] = []) =>
  [protocolo ? `Protocolo original: ${protocolo}` : null, `Importado do histórico no lote ${loteId}.`, ...extra].filter(Boolean).join('\n');

const JA_EXISTE: Record<EntidadeHistorico, string> = {
  titular_pedido: 'já existe pedido com esse protocolo de origem neste projeto',
  incidente: 'já existe incidente com esse protocolo de origem (ou título e data) neste projeto',
  consentimento: 'já existe consentimento desse titular para essa finalidade nessa data neste projeto',
};

/**
 * Grava um registro do histórico (fatia 4) pela função "importar histórico" do serviço dele: datas e status do registro de origem,
 * protocolo do sistema gerado como na criação, protocolo de origem na descrição, prazo do parâmetro para o registro aberto (o que já
 * venceu aparece atrasado; `avisos-prazo.ts` não avisa o atraso na semana da importação). Consentimento exige o tratamento do RoPA de mesma finalidade normalizada.
 */
async function gravarHistorico(db: D1Database, projectId: string, loteId: string, ator: string, item: LinhaItem, finalidades: Map<string, string>,
  gravados: Map<string, string>): Promise<Resultado> {
  const entidade = item.entidade as EntidadeHistorico;
  const p = ESQUEMA[entidade].safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const k = chave(nomeDe(entidade, p.data as Record<string, unknown>));
  if (k && gravados.has(k)) return recusado(item, JA_EXISTE[entidade]);
  const avisos: string[] = [];
  let r: { ok: false; error: string } | { ok: true; id: string };
  let rotulo: string;
  if (entidade === 'titular_pedido') {
    const d = p.data as PedidoProposto;
    rotulo = 'pedido';
    const x = await importarPedido(db, projectId, ator, {
      tipo: d.tipo, canal: d.canal, recebido_em: d.recebido_em, status: d.status, respondido_em: d.respondido_em,
      descricao: descricaoImportada(loteId, d.protocolo, d.titular_ref ? [`Titular (pseudônimo): ${d.titular_ref}`] : []),
    });
    if (x.ok && x.prazo_vencido) avisos.push(`prazo de resposta (${x.prazo_vencido.slice(0, 10)}) já vencido: o pedido aparece atrasado; o aviso de atraso começa na semana que vem`);
    r = x;
  } else if (entidade === 'incidente') {
    const d = p.data as IncidenteProposto;
    rotulo = 'incidente';
    const x = await importarIncidente(db, projectId, ator, {
      titulo: d.titulo, descricao: descricaoImportada(loteId, d.protocolo), ciencia_em: d.ciencia_em, risco_titular: d.risco_titular,
      comunicacao_anpd_em: d.comunicacao_anpd_em, comunicacao_titular_em: d.comunicacao_titular_em, status: d.status,
    });
    if (x.ok && x.prazos_vencidos.length) avisos.push(`prazo de comunicação já vencido (${x.prazos_vencidos.join('; ')}): aparece atrasado; o aviso de atraso começa na semana que vem`);
    r = x;
  } else {
    const d = p.data as ConsentimentoProposto;
    rotulo = 'consentimento';
    const ropaId = finalidades.get(chave(d.tratamento));
    if (!ropaId) return recusado(item, `tratamento "${d.tratamento}" não encontrado no RoPA deste projeto`);
    if (!d.versao_aviso) avisos.push('versão do aviso não informada no registro de origem');
    r = await importarConsentimento(db, projectId, ator, {
      ropa_id: ropaId, titular_ref: d.titular_ref, finalidade: d.finalidade, versao_aviso: d.versao_aviso || 'não informada no registro de origem',
      obtido_em: d.obtido_em, canal: d.canal, revogado_em: d.revogado_em,
    });
  }
  if (!r.ok) return recusado(item, r.error);
  if (k) gravados.set(k, r.id);
  return fecharItem(db, projectId, loteId, ator, item, r.id, rotulo, avisos);
}

// ─── F6: o que é da atividade (riscos, ações, teste de impacto, ciclo, bases) ─────────────────────

type CtxAtividade = {
  finalidades: Map<string, string>; pessoas: Map<string, string>; itens: Map<string, string>;
  catalogo: { id: string; titulo: string }[]; loteId: string; gravados: Map<string, string>;
};
type Gravar = (db: D1Database, projectId: string, ator: string, item: LinhaItem, ctx: CtxAtividade) => Promise<Resultado>;

const semAtividade = (item: LinhaItem, nome: string) => recusado(item, `atividade "${nome}" não encontrada no RoPA deste projeto`);
/** Pessoa das partes pelo nome normalizado; sem ela, aviso (a importação não cria pessoa sozinha). */
function pessoaDe(ctx: CtxAtividade, nome: string | null | undefined, avisos: string[]) {
  if (!nome) return null;
  const id = ctx.pessoas.get(chave(nome));
  if (!id) avisos.push(`responsável "${nome}" não está nas partes do projeto; ligue na tela da atividade`);
  return id ?? null;
}
const NOTA_DO_NIVEL = { baixo: 2, medio: 3, alto: 4, critico: 5 } as const;
const ESTRATEGIA = { mitigar: 'Mitigate', aceitar: 'Accept', evitar: 'Avoid', transferir: 'Transfer' } as const;
// `aceito` do legado entra aberto: aceitar o risco é ato de uma pessoa no n.360 (o aceite gravaria quem confirmou a importação).
const STATUS_RISCO = { aberto: 'Open', mitigado: 'Mitigated', aceito: 'Open', fechado: 'Closed' } as const;
const STATUS_ACAO = { aberto: 'Open', em_andamento: 'In Progress', concluido: 'Closed' } as const;

/**
 * Risco da atividade (F6), pelo `criarRisco` da F2: notas 1 a 5 ou, sem elas, o nível do legado (2, 3, 4 ou 5 nas duas, com aviso).
 * O prazo do risco vira uma ação ligada a ele (decisão D3: um prazo só, o da ação). Ativo e responsável por nome; sem eles, aviso.
 */
const gravarRisco: Gravar = async (db, projectId, ator, item, ctx) => {
  const p = riscoPropostoSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const ropaId = ctx.finalidades.get(chave(d.atividade));
  if (!ropaId) return semAtividade(item, d.atividade);
  const k = chave(nomeDe('risco', d));
  if (ctx.gravados.has(k)) return recusado(item, 'já existe risco com essa ameaça nesta atividade');
  const avisos: string[] = [];
  let impacto = d.impacto ?? null;
  let prob = d.probabilidade ?? null;
  if (!impacto || !prob) {
    const n = d.nivel ? NOTA_DO_NIVEL[d.nivel] : 3;
    impacto ??= n;
    prob ??= n;
    avisos.push(d.nivel ? `impacto e probabilidade derivados do nível ${d.nivel}` : 'impacto ou probabilidade não informados; gravado 3 até a revisão');
  }
  let assetId: string | null = null;
  if (d.ativo) {
    assetId = ctx.itens.get(chave(d.ativo)) ?? null;
    if (!assetId) avisos.push(`ativo "${d.ativo}" não está nos itens do projeto; risco gravado sem ele`);
  }
  const owner = pessoaDe(ctx, d.responsavel, avisos);
  if (d.status === 'aceito') avisos.push('o aceite do risco não foi importado: aceitar é ato de uma pessoa, na tela da atividade');
  const r = await criarRisco(db, projectId, ropaId, ator, {
    threat: d.ameaca, vulnerability: d.vulnerabilidade ?? null, asset_id: assetId, impact: impacto, probability: prob,
    treatment: d.estrategia ? ESTRATEGIA[d.estrategia] : 'Mitigate', treatment_plan: d.plano ?? null,
    residual_impact: d.impacto_residual ?? null, residual_probability: d.probabilidade_residual ?? null, owner_parte_id: owner,
    status: d.status ? STATUS_RISCO[d.status] : 'Open',
  });
  if (!r.ok) return recusado(item, r.error);
  ctx.gravados.set(k, r.id);
  if (d.prazo) {
    try {
      const a = await criarAcao(db, projectId, ropaId, { title: `Tratar o risco: ${d.ameaca}`.slice(0, 500), due_date: d.prazo, assigned_to_parte_id: owner, risk_id: r.id });
      if (!a.ok) avisos.push(`a ação do prazo não foi criada: ${a.error}`);
    } catch (e) {
      log('error', { msg: 'importacao_risco_prazo', item: item.id, erro: resumoErro(e) });
      avisos.push('a ação do prazo não foi criada; crie na tela da atividade');
    }
  }
  return fecharItem(db, projectId, ctx.loteId, ator, item, r.id, 'risco', avisos);
};

/** Ação (gap) da atividade (F6), pelo `criarAcao` da F2; o risco citado é procurado pela ameaça entre os riscos da MESMA atividade. */
const gravarGap: Gravar = async (db, projectId, ator, item, ctx) => {
  const p = gapPropostoSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const ropaId = ctx.finalidades.get(chave(d.atividade));
  if (!ropaId) return semAtividade(item, d.atividade);
  const k = chave(nomeDe('gap', d));
  if (ctx.gravados.has(k)) return recusado(item, 'já existe ação com esse título nesta atividade');
  const avisos: string[] = [];
  let riskId: string | null = null;
  if (d.risco) {
    const alvo = chave(d.risco);
    const { results } = await db.prepare('SELECT id, threat FROM risks WHERE ropa_id = ? AND project_id = ? ORDER BY created_at')
      .bind(ropaId, projectId).all<{ id: string; threat: string }>();
    riskId = results.find((x) => chave(x.threat) === alvo)?.id ?? null;
    if (!riskId) avisos.push('o risco citado não está entre os riscos desta atividade; ação gravada sem ele');
  }
  const owner = pessoaDe(ctx, d.responsavel, avisos);
  const r = await criarAcao(db, projectId, ropaId, {
    title: d.titulo, description: d.descricao ?? null, due_date: d.prazo ?? null, assigned_to_parte_id: owner, risk_id: riskId,
    status: d.status ? STATUS_ACAO[d.status] : 'Open',
  });
  if (!r.ok) return recusado(item, r.error);
  ctx.gravados.set(k, r.id);
  return fecharItem(db, projectId, ctx.loteId, ator, item, r.id, 'ação', avisos);
};

/** Teste de impacto (F6): grava só as perguntas ainda sem resposta na atividade; o que já está gravado vence. Não finaliza o teste. */
const gravarImpacto: Gravar = async (db, projectId, ator, item, ctx) => {
  const p = impactoPropostoSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data as Record<string, string | null | undefined>;
  const nome = String(d.atividade);
  const ropaId = ctx.finalidades.get(chave(nome));
  if (!ropaId) return semAtividade(item, nome);
  const atual = await lerImpacto(db, projectId, ropaId);
  const respostas: Record<string, RespostaImpacto> = {};
  let mantidas = 0;
  for (const q of PERGUNTAS_IMPACTO) {
    const v = d[q.id] as RespostaImpacto | null | undefined;
    if (!v) continue;
    if (atual?.perguntas.find((x) => x.id === q.id)?.resposta) mantidas++; else respostas[q.id] = v;
  }
  if (!Object.keys(respostas).length) {
    return recusado(item, mantidas ? 'nada a gravar: as perguntas do arquivo já estavam respondidas na atividade (mantidas)' : 'nada a gravar: nenhuma resposta no item');
  }
  const r = await salvarImpacto(db, projectId, ropaId, ator, { respostas });
  if (!r.ok) return recusado(item, r.error);
  return fecharItem(db, projectId, ctx.loteId, ator, item, ropaId, 'teste de impacto da atividade',
    mantidas ? [`${mantidas} resposta(s) já gravada(s) na atividade foram mantidas`] : []);
};

/** Uma etapa do ciclo de vida (F6): só a etapa ainda sem registro; o sistema por nome de item (sem ele, aviso). */
const gravarCiclo: Gravar = async (db, projectId, ator, item, ctx) => {
  const p = cicloPropostoSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const ropaId = ctx.finalidades.get(chave(d.atividade));
  if (!ropaId) return semAtividade(item, d.atividade);
  const atual = await lerCiclo(db, projectId, ropaId);
  if (atual?.find((e) => e.etapa === d.etapa)?.situacao) return recusado(item, 'etapa já registrada nesta atividade (mantida)');
  const avisos: string[] = [];
  let itemId: string | null = null;
  if (d.item && d.situacao === 'nao_aplicavel') avisos.push('etapa que não se aplica fica sem sistema; o sistema do arquivo foi ignorado');
  else if (d.item) {
    itemId = ctx.itens.get(chave(d.item)) ?? null;
    if (!itemId) avisos.push(`sistema "${d.item}" não está nos itens do projeto; etapa gravada sem ele`);
  }
  const r = await salvarCiclo(db, projectId, ropaId, ator, [{ etapa: d.etapa, situacao: d.situacao, item_id: itemId, descricao: d.descricao ?? null }]);
  if (!r.ok) return recusado(item, r.error);
  return fecharItem(db, projectId, ctx.loteId, ator, item, ropaId, 'ciclo de vida da atividade', avisos);
};

/**
 * Bases adicionais e GDPR (F6): só ACRESCENTA. Texto casado com o catálogo como na fatia 1 (ou o id do requisito); o que não casar vira
 * aviso; a principal e as já gravadas são puladas; a base do GDPR só entra se a atividade não tiver uma.
 */
const gravarBases: Gravar = async (db, projectId, ator, item, ctx) => {
  const p = basesPropostasSchema.safeParse(JSON.parse(item.dados));
  if (!p.success) return recusado(item, 'dados do item inválidos');
  const d = p.data;
  const ropaId = ctx.finalidades.get(chave(d.atividade));
  const atual = ropaId ? await lerBases(db, projectId, ropaId) : null;
  if (!ropaId || !atual) return semAtividade(item, d.atividade);
  const avisos: string[] = [];
  const ja = new Set(atual.adicionais.map((a) => a.requisito_id));
  const novas: string[] = [];
  for (const t of d.adicionais ?? []) {
    const id = ctx.catalogo.some((c) => c.id === t) ? t : casarBaseLegal(t, ctx.catalogo);
    if (!id) { avisos.push(`base "${t}" não casou com o catálogo; registre na tela da atividade`); continue; }
    if (id === atual.principal?.id || ja.has(id)) continue;
    ja.add(id);
    novas.push(id);
  }
  let gdpr: string | undefined;
  if (d.base_gdpr) {
    if (!atual.base_gdpr) gdpr = d.base_gdpr;
    else if (chave(atual.base_gdpr) !== chave(d.base_gdpr)) avisos.push('a base do GDPR já gravada na atividade foi mantida');
  }
  if (!novas.length && gdpr === undefined) {
    return recusado(item, `nada a gravar: ${avisos.length ? avisos.join('; ') : 'as bases do arquivo já estavam na atividade'}`);
  }
  const r = await salvarBases(db, projectId, ropaId, {
    ...(novas.length ? { adicionais: [...atual.adicionais.map((a) => ({ requisito_id: a.requisito_id, observacao: a.observacao })),
      ...novas.map((id) => ({ requisito_id: id, observacao: `Importada no lote ${ctx.loteId}` }))] } : {}),
    ...(gdpr !== undefined ? { base_gdpr: gdpr } : {}),
  });
  if (!r.ok) return recusado(item, r.error);
  return fecharItem(db, projectId, ctx.loteId, ator, item, ropaId, 'bases legais da atividade', avisos);
};

const GRAVAR_DA_ATIVIDADE: Partial<Record<Entidade, Gravar>> = { risco: gravarRisco, gap: gravarGap, impacto: gravarImpacto, ciclo: gravarCiclo, bases: gravarBases };

// ─── reconciliação (F6) ────────────────────────────────────────────────────────────────────────────

export const ROTULO_ENTIDADE: Record<Entidade, string> = {
  tratamento: 'Tratamentos', terceiro: 'Terceiros', documento: 'Documentos', dpia: 'RIPD', lia: 'LIA', risco: 'Riscos', gap: 'Ações (gaps)',
  impacto: 'Teste de impacto', ciclo: 'Ciclo de vida', bases: 'Bases legais', titular_pedido: 'Pedidos do titular', incidente: 'Incidentes',
  consentimento: 'Consentimentos',
};
const ORDEM_ENTIDADES = Object.keys(ROTULO_ENTIDADE) as Entidade[];

/**
 * Motivo ou aviso sem dado: o que está entre aspas (nome de atividade, de pessoa, de sistema), ids, datas, número de registro e
 * e-mail, CPF ou telefone saem; sobra a regra ("atividade "..." não encontrada"), que agrupa e conta.
 */
export async function motivoGenerico(t: string): Promise<string> {
  const s = await mascararPii(t, () => '[dado pessoal]');
  return s.replace(/"[^"]*"/g, '"..."')
    .replace(/\b(?=[0-9a-z-]*\d)[0-9a-z-]{16,}\b/gi, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?/g, '<data>')
    .replace(/registro \d+/g, 'registro <n>')
    .trim();
}

type Numeros = { propostos: number; pendentes: number; aceitos: number; gravados: number; recusados: number; descartados: number; duplicatas: number; com_aviso: number };
export type Reconciliacao = {
  lote: { id: string; status: string; created_at: string; updated_at: string };
  entidades: ({ entidade: Entidade; rotulo: string } & Numeros)[];
  totais: Numeros;
  motivos: { entidade: Entidade; rotulo: string; tipo: 'recusa' | 'aviso'; motivo: string; quantidade: number }[];
  /** Nenhum item pendente, aceito sem gravar ou recusado sem decisão: o critério do roteiro de virada para seguir. */
  sem_pendencia: boolean;
};
const CAMPO_DA_DECISAO: Record<string, keyof Numeros> = { pendente: 'pendentes', aceito: 'aceitos', gravado: 'gravados', recusado: 'recusados', descartado: 'descartados' };

/** O relatório de reconciliação do lote: só contagens e motivos genéricos, nenhum dado de registro. null = lote não é do projeto. */
export async function reconciliacao(db: D1Database, projectId: string, loteId: string): Promise<Reconciliacao | null> {
  const lote = await db.prepare('SELECT id, status, created_at, updated_at FROM importacoes WHERE id = ? AND project_id = ?')
    .bind(loteId, projectId).first<Reconciliacao['lote']>();
  if (!lote) return null;
  const { results } = await db.prepare('SELECT entidade, decisao, motivo, aviso, duplicata_de FROM importacao_itens WHERE importacao_id = ? AND project_id = ?')
    .bind(loteId, projectId).all<{ entidade: Entidade; decisao: string; motivo: string | null; aviso: string | null; duplicata_de: string | null }>();
  const zero = (): Numeros => ({ propostos: 0, pendentes: 0, aceitos: 0, gravados: 0, recusados: 0, descartados: 0, duplicatas: 0, com_aviso: 0 });
  const por = new Map<Entidade, Numeros>();
  const totais = zero();
  const motivos = new Map<string, Reconciliacao['motivos'][number]>();
  const conta = async (entidade: Entidade, tipo: 'recusa' | 'aviso', texto: string) => {
    const motivo = await motivoGenerico(texto);
    const k = `${entidade}|${tipo}|${motivo}`;
    const m = motivos.get(k) ?? { entidade, rotulo: ROTULO_ENTIDADE[entidade], tipo, motivo, quantidade: 0 };
    m.quantidade++;
    motivos.set(k, m);
  };
  for (const r of results) {
    const c = por.get(r.entidade) ?? por.set(r.entidade, zero()).get(r.entidade)!;
    for (const alvo of [c, totais]) {
      alvo.propostos++;
      if (CAMPO_DA_DECISAO[r.decisao]) alvo[CAMPO_DA_DECISAO[r.decisao]]++;
      if (r.duplicata_de) alvo.duplicatas++;
      if (r.aviso) alvo.com_aviso++;
    }
    if (r.decisao === 'recusado') await conta(r.entidade, 'recusa', r.motivo || 'sem motivo registrado');
    for (const a of r.aviso ? r.aviso.split('; ') : []) await conta(r.entidade, 'aviso', a);
  }
  return {
    lote,
    entidades: ORDEM_ENTIDADES.filter((e) => por.has(e)).map((e) => ({ entidade: e, rotulo: ROTULO_ENTIDADE[e], ...por.get(e)! })),
    totais,
    motivos: [...motivos.values()].sort((a, b) => ORDEM_ENTIDADES.indexOf(a.entidade) - ORDEM_ENTIDADES.indexOf(b.entidade) || b.quantidade - a.quantidade),
    sem_pendencia: totais.pendentes + totais.aceitos + totais.recusados === 0,
  };
}

/** O relatório em CSV (BOM, `;`, fórmula neutralizada, como a exportação da F4), com a coluna para a contagem do inventário do legado. */
export function reconciliacaoEmCsv(r: Reconciliacao): string {
  const cab = ['Entidade', 'No legado (preencher)', 'Propostos', 'Pendentes', 'Aceitos sem gravar', 'Gravados', 'Recusados', 'Descartados', 'Duplicatas', 'Com aviso'];
  const linha = (rotulo: string, c: Numeros) => [rotulo, '', c.propostos, c.pendentes, c.aceitos, c.gravados, c.recusados, c.descartados, c.duplicatas, c.com_aviso];
  const resumo = montarCsv(cab, [...r.entidades.map((c) => linha(c.rotulo, c)), linha('Total', r.totais)]);
  const detalhe = montarCsv(['Entidade', 'Tipo', 'Motivo', 'Quantidade'], r.motivos.map((m) => [m.rotulo, m.tipo === 'recusa' ? 'Recusa' : 'Aviso', m.motivo, m.quantidade]));
  return `${resumo}\r\n${detalhe.slice(1)}`; // o detalhe sem o segundo BOM
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
