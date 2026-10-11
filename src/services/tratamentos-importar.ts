import { logAudit } from '../helpers';
import { ropaSchema } from '../schemas';

/**
 * Núcleo do n.privacy, fatia 4.4: importação do RoPA por planilha (CSV). Cria registros em `Draft`, devolve o relatório
 * das linhas recusadas e nunca cria nada se o arquivo inteiro for inválido. Reimportar não duplica: a chave é a finalidade
 * (sem acento, caixa ou espaço sobrando) dentro do projeto.
 */

export const MAX_LINHAS = 500;
const LOTE = 50; // ponytail: teto de statements por batch do D1

/** CSV mínimo (RFC 4180): campo entre aspas, aspas dobradas, quebra de linha dentro do campo. Delimitador `;` ou `,`. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  const fechaCampo = () => { linha.push(campo); campo = ''; };
  const fechaLinha = () => { fechaCampo(); if (linha.some((c) => c.trim() !== '')) linhas.push(linha); linha = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"' && campo === '') aspas = true;
    else if (ch === delim) fechaCampo();
    else if (ch === '\n') fechaLinha();
    else if (ch !== '\r') campo += ch;
  }
  if (campo !== '' || linha.length) fechaLinha();
  return linhas;
}

/** Normaliza nome para comparar (sem acento, caixa nem pontuação). Também a chave de duplicata da importação de programa. */
export const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const COLUNAS: Record<string, string> = {
  finalidade: 'processing_purpose', finalidade_do_tratamento: 'processing_purpose', processing_purpose: 'processing_purpose',
  categorias: 'data_categories', categorias_de_dados: 'data_categories', categorias_dados: 'data_categories', data_categories: 'data_categories',
  titulares: 'data_subjects', data_subjects: 'data_subjects',
  base_legal: 'legal_basis', legal_basis: 'legal_basis',
  retencao: 'retention_period', prazo_de_retencao: 'retention_period', retention_period: 'retention_period',
  destinatarios: 'recipients', compartilhamento: 'recipients', recipients: 'recipients',
  transferencia_internacional: 'international_transfers', international_transfers: 'international_transfers',
  salvaguardas: 'transfer_safeguards', transfer_safeguards: 'transfer_safeguards',
  dpia_requerido: 'dpia_required', dpia_required: 'dpia_required',
  responsavel: 'owner', owner: 'owner',
};
const BOOLEANAS = new Set(['international_transfers', 'dpia_required']);

const simNao = (v: string): 0 | 1 | null => {
  const k = chave(v);
  if (['sim', 's', '1', 'true', 'x', 'yes'].includes(k)) return 1;
  if (['', 'nao', 'n', '0', 'false', 'no'].includes(k)) return 0;
  return null;
};

export type TratamentoValido = { processing_purpose: string } & Record<string, unknown>;

/**
 * Valida e mapeia UM tratamento: chaves em qualquer forma aceita pela planilha (`Finalidade`, `base_legal`, `processing_purpose`…),
 * valores em texto (a planilha) ou booleano (a importação de programa). Usada pela planilha e pela importação de programa.
 */
export function validarTratamento(entrada: Record<string, unknown>): { ok: true; data: TratamentoValido } | { ok: false; motivo: string } {
  const campos: Record<string, unknown> = {};
  for (const [k, bruto] of Object.entries(entrada)) {
    const c = COLUNAS[chave(k)];
    if (!c) continue;
    const v = typeof bruto === 'string' ? bruto.trim() : bruto;
    if (BOOLEANAS.has(c)) campos[c] = typeof v === 'string' ? (simNao(v) ?? v) : v;
    else if (v !== '' && v !== null && v !== undefined) campos[c] = v;
  }
  for (const c of BOOLEANAS) if (typeof campos[c] === 'string') return { ok: false, motivo: `${c === 'dpia_required' ? 'dpia_requerido' : 'transferencia_internacional'} aceita sim ou não` };
  const ok = ropaSchema.safeParse(campos);
  if (!ok.success) return { ok: false, motivo: `${String(ok.error.issues[0]?.path[0] ?? 'linha')}: ${ok.error.issues[0]?.message ?? 'inválido'}` };
  return { ok: true, data: ok.data as TratamentoValido };
}

/** O INSERT do tratamento em `Draft`, o mesmo para a planilha e a importação de programa. */
export function stmtInserirTratamento(db: D1Database, id: string, projectId: string, b: TratamentoValido, agora: string, baseLegalId: string | null = null): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO ropa_records (id, project_id, processing_purpose, data_categories, data_subjects, legal_basis, retention_period, recipients, international_transfers, transfer_safeguards, dpia_required, status, owner, base_legal_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`
  ).bind(id, projectId, b.processing_purpose, b.data_categories ?? null, b.data_subjects ?? null, b.legal_basis ?? null,
    b.retention_period ?? null, b.recipients ?? null, b.international_transfers ? 1 : 0, b.transfer_safeguards ?? null, b.dpia_required ? 1 : 0, b.owner ?? null,
    baseLegalId, agora, agora);
}

export type ImportacaoRopa = { criados: number; ja_existiam: number; recusadas: { linha: number; motivo: string }[] };
export type FalhaImportacao = { ok: false; status: 400; error: string };

export async function importarTratamentos(db: D1Database, projectId: string, ator: string, csv: string): Promise<FalhaImportacao | ({ ok: true } & ImportacaoRopa)> {
  const tabela = lerCsv(csv);
  if (tabela.length < 2) return { ok: false, status: 400, error: 'A planilha precisa do cabeçalho e de ao menos uma linha de dados' };
  const colunas = tabela[0].map((h) => COLUNAS[chave(h)] ?? null);
  if (!colunas.includes('processing_purpose')) return { ok: false, status: 400, error: 'O cabeçalho precisa da coluna "finalidade"' };
  const dados = tabela.slice(1);
  if (dados.length > MAX_LINHAS) return { ok: false, status: 400, error: `Até ${MAX_LINHAS} linhas por importação; esta tem ${dados.length}` };

  const { results } = await db.prepare('SELECT processing_purpose AS p FROM ropa_records WHERE project_id = ?').bind(projectId).all<{ p: string }>();
  const vistas = new Set(results.map((r) => chave(r.p)));
  const recusadas: ImportacaoRopa['recusadas'] = [];
  const novas: TratamentoValido[] = [];
  let jaExistiam = 0;

  dados.forEach((celulas, i) => {
    const numero = i + 2; // linha da planilha (o cabeçalho é a 1)
    const entrada: Record<string, unknown> = {};
    colunas.forEach((c, j) => { if (c) entrada[c] = celulas[j] ?? ''; });
    const v = validarTratamento(entrada);
    if (!v.ok) { recusadas.push({ linha: numero, motivo: v.motivo }); return; }
    const k = chave(v.data.processing_purpose);
    if (vistas.has(k)) { jaExistiam++; return; }
    vistas.add(k);
    novas.push(v.data);
  });

  const agora = new Date().toISOString();
  for (let i = 0; i < novas.length; i += LOTE) {
    await db.batch(novas.slice(i, i + LOTE).map((b) => stmtInserirTratamento(db, crypto.randomUUID(), projectId, b, agora)));
  }
  await logAudit(db, 'ropa.importar', ator, `Importação do RoPA: ${novas.length} criados, ${jaExistiam} já existiam, ${recusadas.length} recusadas`, '', '', projectId);
  return { ok: true, criados: novas.length, ja_existiam: jaExistiam, recusadas };
}
