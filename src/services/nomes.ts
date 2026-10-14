/**
 * Padronização de nome (pessoa, organização, departamento, ativo). Pura e idempotente; as regras estão em
 * docs/superpowers/specs/2026-10-14-normalizacao-de-nomes-design.md. Sigla e abreviatura vivem aqui, em código:
 * ampliar a lista é um PR, não dado por projeto.
 */

const SIGLAS = new Set([
  'ti', 'tic', 'rh', 'dpo', 'ciso', 'ceo', 'cfo', 'cto', 'cio', 'coo', 'lgpd', 'gdpr', 'anpd', 'sgsi', 'isms', 'iso', 'erp', 'crm',
  'sap', 'sac', 'sla', 'pmo', 'csirt', 'dpia', 'ripd', 'ropa', 'rpa', 'capa', 'api', 'vpn', 'soc', 'pf', 'pj', 'cpf', 'cnpj', 'ia',
  'qa', 'bi', 'lan', 'wan', 'cctv',
]);

/** Só as sem ambiguidade; `ger.`, `adm.`, `dir.` e `coord.` ficam como digitadas. */
const ABREVIATURAS: Record<string, string> = {
  depto: 'Departamento', dpto: 'Departamento', dept: 'Departamento', mkt: 'Marketing', infra: 'Infraestrutura', ltda: 'Ltda.',
};

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'a', 'o']);

const maiusculoNasPartes = (s: string) => s.replace(/(^|[-'’/])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

function palavra(w: string, i: number, tudoMaiusculo: boolean): string {
  const [, pre, core, pos] = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
  if (!core) return w;
  const chave = core.toLowerCase();
  if (/^\p{L}$/u.test(core) && pos.startsWith('.')) return pre + core.toUpperCase() + pos; // inicial: "A."
  if (ABREVIATURAS[chave]) return pre + ABREVIATURAS[chave] + pos.replace(/^\./, '');
  if (SIGLAS.has(chave)) return pre + core.toUpperCase() + pos;
  if (i > 0 && CONECTORES.has(chave)) return pre + chave + pos;
  const resto = core.slice(1);
  if (resto !== resto.toLowerCase() && core !== core.toUpperCase()) return w; // maiúscula no meio: McDonald, iPhone, D'Ávila
  if (core === core.toUpperCase() && /\d/.test(core)) return w; // código: PC-001
  if (core === core.toUpperCase() && core.length >= 2 && !tudoMaiusculo) return w; // sigla ou marca: SAP
  return pre + maiusculoNasPartes(chave) + pos;
}

export function normalizarNome(texto: string): string {
  const t = texto.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const partes = t.split(/(\s|\/)/);
  const nPalavras = partes.filter((p) => p && p !== ' ' && p !== '/').length;
  const tudoMaiusculo = /\p{L}/u.test(t) && t === t.toUpperCase() && (nPalavras > 1 || t.length > 4);
  let i = 0;
  return partes.map((p) => (!p || p === ' ' || p === '/' ? p : palavra(p, i++, tudoMaiusculo))).join('');
}

/** Para achar duplicata (`TI` e `ti`, `João` e `Joao`); nunca é gravada. */
export const chaveNome = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
