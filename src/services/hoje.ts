/** O dia de hoje em São Paulo (AAAA-MM-DD). Todo prazo e vencimento do produto conta neste dia, não em UTC. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(agora).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** O dia de São Paulo daqui a `dias` dias (negativo volta). */
export function diaMaisSP(dias: number, agora: Date = new Date()): string {
  const d = new Date(`${hojeEmSaoPaulo(agora)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** O dia (AAAA-MM-DD) de uma data gravada, em São Paulo. Data pura ou meia-noite UTC exata é dia de calendário (prazo) e fica como
 *  está; instante (`toISOString`, ou o `datetime` do SQLite, em UTC) vira o dia de São Paulo. A mesma regra de `dataHoraBr`. */
export function diaEmSaoPaulo(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!/[T ]\d{2}:\d{2}/.test(t) || /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?Z$/.test(t)) return t.slice(0, 10);
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : hojeEmSaoPaulo(d);
}
