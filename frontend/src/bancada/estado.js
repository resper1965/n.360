// Estado puro da Bancada: índice do catálogo, vizinhança dos passos, leitura do endereço e rótulos. Sem DOM.
export const ROTULO_ESTADO = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', bloqueado: 'Bloqueado', concluido: 'Concluído' };

export function indexarCatalogo(cat) {
    const passos = [...cat.passos].sort((a, b) => a.fase - b.fase || a.ordem - b.ordem);
    const porId = new Map(passos.map((p) => [p.id, p]));
    const fases = new Map(cat.fases.map((f) => [f.numero, f]));
    const etapas = new Map(cat.etapas.map((e) => [e.id, e]));
    const ordem = passos.map((p) => p.id);
    return {
        cat, ordem, passos,
        passo: (id) => porId.get(id) || null,
        fase: (n) => fases.get(n) || null,
        etapa: (id) => etapas.get(id) || null,
        faseDe: (id) => fases.get(porId.get(id)?.fase) || null,
        passosDaFase: (n) => passos.filter((p) => p.fase === n),
    };
}

export function vizinhos(ind, id) {
    const i = ind.ordem.indexOf(id);
    return { anterior: i > 0 ? ind.ordem[i - 1] : null, proximo: i >= 0 && i < ind.ordem.length - 1 ? ind.ordem[i + 1] : null };
}

export function posicaoNaFase(ind, id) {
    const p = ind.passo(id);
    const doGrupo = ind.passosDaFase(p.fase);
    return { n: doGrupo.findIndex((x) => x.id === id) + 1, total: doGrupo.length };
}

/** O alvo bruto do endereço (`{ fase, passo }`, de `alvoDaBancada`) vira o id do passo a abrir. O passo vale; só a fase leva ao primeiro passo aberto dela. */
export function resolverAlvo(ind, banc, bruto) {
    if (bruto && bruto.passo && ind.passo(bruto.passo)) return bruto.passo;
    if (bruto && bruto.fase !== undefined && bruto.fase !== null && bruto.fase !== '') {
        const doGrupo = ind.passosDaFase(Number(bruto.fase));
        const aberto = doGrupo.find((p) => (banc.passos.find((l) => l.id === p.id) || {}).estado !== 'concluido');
        if (doGrupo.length) return (aberto || doGrupo[0]).id;
    }
    return (banc.continuar && banc.continuar.passo) || ind.ordem[0] || null;
}

export function textoDoEstado(l) {
    if (l.estado === 'bloqueado') return `Bloqueado: ${l.bloqueio?.motivo || 'sem motivo registrado'}`;
    if (l.estado === 'concluido' && l.concluido_por_excecao) return 'Concluído com justificativa registrada';
    return ROTULO_ESTADO[l.estado] || l.estado;
}
