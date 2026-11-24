// O dia de hoje em São Paulo (AAAA-MM-DD): o mesmo dia que o servidor usa para prazo e vencimento (src/services/hoje.ts).
export function hojeSP(agora = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(agora).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
}

/** O dia de São Paulo daqui a `n` dias (negativo volta). */
export function emDiasSP(n, agora = new Date()) {
    const d = new Date(`${hojeSP(agora)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** O dia (AAAA-MM-DD) de uma data gravada, em São Paulo: a mesma regra de `diaEmSaoPaulo` (src/services/hoje.ts). Data pura ou
 *  meia-noite UTC exata é dia de calendário e fica como está; instante (sem fuso = UTC) vira o dia de São Paulo. */
export function diaSP(v) {
    const t = String(v || '').trim();
    if (!t) return '';
    if (!/[T ]\d{2}:\d{2}/.test(t) || /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?Z$/.test(t)) return t.slice(0, 10);
    const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t.replace(' ', 'T')}Z`);
    return Number.isNaN(d.getTime()) ? t.slice(0, 10) : hojeSP(d);
}
