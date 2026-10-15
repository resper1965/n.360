// Nível de risco pela nota (probabilidade x impacto): a mesma faixa do servidor (`riskLevel`, src/services/riscos-atividade.ts),
// para a matriz do n.iso e o mapa do n.privacy dizerem o mesmo que o `risk_level` gravado.
export function nivelDoEscore(s) {
    return s <= 5 ? 'Low' : s <= 12 ? 'Medium' : s <= 20 ? 'High' : 'Critical';
}

export const nivelDaNota = (probabilidade, impacto) => nivelDoEscore(probabilidade * impacto);
