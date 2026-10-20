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
