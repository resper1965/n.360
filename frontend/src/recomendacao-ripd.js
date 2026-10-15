// A recomendação de RIPD em texto, a partir do teste de impacto como o SERVIDOR o calculou (GET .../ropa/:id/impacto,
// src/services/impacto.ts). Uma recomendação só, uma origem só: a tela não calcula outra. Os motivos são os rótulos curtos que o
// servidor manda em cada pergunta ("há dados sensíveis"); sem rótulo, o id volta como veio.

/** Texto da recomendação, ou vazio sem teste. */
export function textoRecomendacao(impacto) {
    const rec = impacto && impacto.recomendacao;
    if (!rec) return '';
    if (rec.resultado === 'recomendado') {
        const curto = Object.fromEntries((Array.isArray(impacto.perguntas) ? impacto.perguntas : []).map((p) => [p.id, p.curto || p.id]));
        return `RIPD recomendado: ${(Array.isArray(rec.motivos) ? rec.motivos : []).map((m) => curto[m] || m).join('; ')}.`;
    }
    if (rec.resultado === 'dispensavel_a_confirmar') return 'RIPD dispensável pelo teste de impacto, a confirmar por uma pessoa.';
    return 'Teste de impacto incompleto: a recomendação sai quando as perguntas estiverem respondidas.';
}
