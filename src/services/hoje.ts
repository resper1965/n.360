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
