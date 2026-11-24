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

/** O dia de São Paulo daqui a `meses` meses: o mesmo dia do calendário (29/02 + 12 meses vira 01/03). */
export function mesesMaisSP(meses: number, agora: Date = new Date()): string {
  const d = new Date(`${hojeEmSaoPaulo(agora)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

const semHora = (t: string) => !/[T ]\d{2}:\d{2}/.test(t.trim());
/**
 * O dia (AAAA-MM-DD) de uma data gravada, em São Paulo. Só a data sem hora é dia de calendário e fica como está; instante (`toISOString`,
 * ou o `datetime` do SQLite, em UTC), inclusive a meia-noite UTC exata (21h de Brasília), vira o dia de São Paulo. `base`: a data de onde
 * o prazo foi contado. Contado de uma data sem hora, `somarPrazo` grava o prazo à meia-noite UTC e esse é o dia dele (o dado já gravado).
 */
export function diaEmSaoPaulo(v: string | null, base?: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (semHora(t) || (base && semHora(base) && /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?Z$/.test(t))) return t.slice(0, 10);
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : hojeEmSaoPaulo(d);
}

/**
 * `diaEmSaoPaulo` em SQL, para comparar e agrupar prazos no banco pela mesma regra do TypeScript: data sem hora fica como está (e a
 * meia-noite UTC exata do prazo contado de `base` sem hora); instante vira o dia de São Paulo (`'-3 hours'`: sem horário de verão desde
 * 2019, o mesmo atalho de avisos-prazo.ts).
 */
const sqlSemHora = (c: string) => `${c} NOT GLOB '*[T ][0-9][0-9]:[0-9][0-9]*'`;
export const sqlDiaSP = (c: string, base?: string) => `(CASE WHEN ${sqlSemHora(c)}${base ? ` OR (${sqlSemHora(base)} AND (${c} GLOB '????-??-??T00:00Z' OR ${c} GLOB '????-??-??T00:00:00Z'
  OR (${c} GLOB '????-??-??T00:00:00.?*Z' AND rtrim(substr(${c}, 21, length(${c}) - 21), '0') = '')))` : ''} THEN substr(${c}, 1, 10) ELSE date(${c}, '-3 hours') END)`;

/** AAAA-MM do mês de `dia` (AAAA-MM-DD) recuado `n` meses (n >= 0). Conta pelo calendário, sem o dia: 31/03 menos 1 mês é fevereiro. */
export const mesesAtras = (dia: string, n: number) => {
  const t = Number(dia.slice(0, 4)) * 12 + Number(dia.slice(5, 7)) - 1 - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
