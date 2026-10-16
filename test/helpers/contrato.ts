/** Mesmas chaves em todos os níveis (arrays: o formato do primeiro elemento), ignorando valores. */
export function formaDe(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [formaDe(v[0])] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, formaDe(x)]));
  return v === null ? null : typeof v;
}
