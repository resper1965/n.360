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

const semHora = (t) => !/[T ]\d{2}:\d{2}/.test(String(t).trim());
/** O dia (AAAA-MM-DD) de uma data gravada, em São Paulo: a mesma regra de `diaEmSaoPaulo` (src/services/hoje.ts). Data sem hora e
 *  meia-noite UTC exata são dia de calendário; instante (sem fuso = UTC) vira o dia de São Paulo. `base`: a data de onde o prazo foi
 *  contado (para a ciência, ela mesma); com hora, a meia-noite UTC também é instante. */
export function diaSP(v, base) {
    const t = String(v || '').trim();
    if (!t) return '';
    if (semHora(t) || (!(base && !semHora(base)) && /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?Z$/.test(t))) return t.slice(0, 10);
    const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t.replace(' ', 'T')}Z`);
    return Number.isNaN(d.getTime()) ? t.slice(0, 10) : hojeSP(d);
}

// Espelho de `ehFeriadoNacional` (src/services/parametros-legais.ts); test/titular-registros.test.ts compara as duas dia a dia.
// shortcut: só feriados nacionais; ponto facultativo e local ficam de fora até o jurídico confirmar
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(Date.UTC(ano, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
/** Feriado nacional (AAAA-MM-DD): os fixos e a Sexta-feira Santa (Páscoa − 2 dias). */
export function ehFeriadoNacional(dia) {
    if (FERIADOS_FIXOS.includes(dia.slice(5, 10))) return true;
    const sexta = pascoa(Number(dia.slice(0, 4)));
    sexta.setUTCDate(sexta.getUTCDate() - 2);
    return sexta.toISOString().slice(0, 10) === dia.slice(0, 10);
}
