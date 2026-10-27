/**
 * SLO de produção medido dentro do Worker (spec 2026-10-27-slo-no-worker).
 *
 * Mesma consulta e mesmos tetos de `scripts/slo.mjs` (o workflow `slo.yml` depende do GitHub Actions, que
 * pode ficar parado por cobrança; a vigilância não pode depender disso). Os tetos são testados contra o script
 * em `test/slo.test.ts`: se um mudar, o outro precisa mudar junto.
 */

export type MedidaSlo = {
  total: number;
  erros5xx: number;
  /** Requisições fora das rotas de IA: é o denominador do p95. */
  totalSemIa: number;
  p95Ms: number;
  p99Ms: number;
};

export const TETOS = {
  /** 5xx sobre o total, em 24 h. */
  taxa5xxMax: 0.01,
  /** p95 em 24 h, SEM as rotas de IA (o modelo é que demora; misturar faria o p95 subir com a adoção, não com a degradação). */
  p95MaxMs: 800,
  /** Abaixo disto, p95 é ruído: uma requisição lenta domina a distribuição. */
  volumeMinimoP95: 20,
  rotasDeIa: ['/chat', '/generate', '/evaluate', '/ingest'],
} as const;

/** Frases de violação; vazia quando está dentro dos tetos. `erros5xx > 0` junto da taxa: zero erro nunca alerta. */
export function avaliarSlo(m: MedidaSlo): string[] {
  const violacoes: string[] = [];
  const taxa = m.total > 0 ? m.erros5xx / m.total : 0;
  if (m.erros5xx > 0 && taxa > TETOS.taxa5xxMax) {
    violacoes.push(
      `Taxa de 5xx em ${(taxa * 100).toFixed(2)}% nas últimas 24h (${m.erros5xx} de ${m.total}), acima do teto de ${(TETOS.taxa5xxMax * 100).toFixed(0)}%.`
    );
  }
  if (m.totalSemIa >= TETOS.volumeMinimoP95 && m.p95Ms > TETOS.p95MaxMs) {
    violacoes.push(
      `p95 de latência em ${m.p95Ms.toFixed(0)} ms nas últimas 24h (fora das rotas de IA), acima do teto de ${TETOS.p95MaxMs} ms. p99: ${m.p99Ms.toFixed(0)} ms.`
    );
  }
  return violacoes;
}
