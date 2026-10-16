import { TETO_CAMPO, type Campo, type Passo } from '../../data/passos/tipos';
import { chaveDoCampo } from '../../data/passos/catalogo';
import type { ContextoProjeto } from './contexto';

export type ValorDoCampo = { valor: string; atualizado_em: string | null; por: string | null; herdado: boolean };
export { chaveDoCampo };

/** Valida e normaliza um valor contra a definição do campo. `''` quer dizer "limpar o campo". */
export function validarValor(campo: Campo, bruto: unknown): { ok: true; valor: string } | { ok: false; erro: string } {
  if (bruto === null || bruto === undefined) return { ok: true, valor: '' };
  if (typeof bruto !== 'string') return { ok: false, erro: 'o valor deve ser texto' };
  const v = bruto.trim();
  if (v === '') return { ok: true, valor: '' };
  if (v.length > TETO_CAMPO[campo.tipo]) return { ok: false, erro: `passa de ${TETO_CAMPO[campo.tipo]} caracteres` };
  if (campo.tipo === 'escolha') return campo.opcoes!.includes(v) ? { ok: true, valor: v } : { ok: false, erro: 'opção fora da lista' };
  if (campo.tipo === 'multipla') {
    const partes = v.split('||').map((p) => p.trim()).filter(Boolean);
    return partes.length && partes.every((p) => campo.opcoes!.includes(p)) ? { ok: true, valor: partes.join('||') } : { ok: false, erro: 'opção fora da lista' };
  }
  if (campo.tipo === 'data') {
    const d = new Date(`${v}T00:00:00Z`);
    const valida = /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
    return valida ? { ok: true, valor: v } : { ok: false, erro: 'data inválida (use aaaa-mm-dd)' };
  }
  return { ok: true, valor: v };
}

function jsonDeNotes(notes: string | null | undefined): Record<string, unknown> | null {
  const t = (notes ?? '').trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try { const o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null; } catch { return null; }
}

/** Texto livre antigo de `notes` (o que NÃO é o JSON do assistente): mostrado só para leitura, spec seção 6. */
export function anotacaoAnterior(notes: string | null | undefined): string | null {
  const t = (notes ?? '').trim();
  return t && !jsonDeNotes(t) ? t : null;
}

/** Valores do passo, por id de campo: a linha de `project_phase_answers`, ou, na falta dela, o JSON antigo de `notes` (herdado). */
export function valoresDoPasso(passo: Passo, ctx: Pick<ContextoProjeto, 'respostas' | 'progresso'>): Record<string, ValorDoCampo> {
  const antigo = jsonDeNotes(ctx.progresso.get(passo.id)?.notes);
  const out: Record<string, ValorDoCampo> = {};
  for (const campo of passo.campos) {
    const linha = ctx.respostas.get(chaveDoCampo(passo, campo));
    if (linha && linha.valor.trim()) { out[campo.id] = { valor: linha.valor, atualizado_em: linha.atualizado_em, por: linha.por, herdado: false }; continue; }
    const h = antigo?.[campo.id];
    const r = typeof h === 'string' ? validarValor(campo, h) : null;
    if (r && r.ok && r.valor) out[campo.id] = { valor: r.valor, atualizado_em: null, por: null, herdado: true };
  }
  return out;
}
