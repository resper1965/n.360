import { escapeHTML, STATUS_DA_FASE } from '../ui.js';
import { textoDoEstado } from './estado.js';

const arg = (...a) => escapeHTML(JSON.stringify(a));

function htmlDaFase(ind, n, estado, porPasso, atual, faseAberta) {
    const f = ind.fase(n);
    const situacao = estado ? (STATUS_DA_FASE[estado.situacao] || estado.situacao) : '';
    const motivo = estado && estado.situacao === 'blocked'
        ? `<span class="bancada-motivo">${escapeHTML(estado.bloqueio ? `${estado.bloqueio.motivo} (responsável: ${estado.bloqueio.responsavel})` : 'Bloqueada antes desta trilha, sem motivo registrado')}</span>`
        : '';
    const passos = n === faseAberta
        ? ind.passosDaFase(n).map((p) => {
            const l = porPasso.get(p.id) || { estado: 'nao_iniciado' };
            return `<button type="button" class="bancada-passo" data-passo="${p.id}" data-action="bancadaIrParaPasso" data-args='${arg(p.id)}' aria-label="${escapeHTML(`${p.titulo}, ${textoDoEstado(l)}`)}"${p.id === atual ? ' aria-current="step"' : ''}>${escapeHTML(p.titulo)}<span class="bancada-estado">${escapeHTML(textoDoEstado(l))}</span></button>`;
        }).join('')
        : '';
    return `<button type="button" class="bancada-fase" data-fase="${n}" aria-expanded="${n === faseAberta}" data-action="bancadaAbrirFase" data-args='${arg(n)}'>Fase ${n} · ${escapeHTML(f ? f.titulo : '')}<span class="bancada-estado">${escapeHTML(situacao)}</span></button>${motivo}${passos}`;
}

/** Coluna da esquerda. `abertura` = { etapa, fase } escolhidos pela pessoa; sem eles, abre a etapa e a fase do passo atual. */
export function htmlDaTrilha(ind, bancada, atual, abertura = {}) {
    const porPasso = new Map(bancada.passos.map((l) => [l.id, l]));
    const porFase = new Map(bancada.fases.map((f) => [f.numero, f]));
    const faseDoAtual = atual && ind.passo(atual) ? ind.passo(atual).fase : null;
    const faseAberta = abertura.fase ?? faseDoAtual;
    const etapaAberta = abertura.etapa ?? (faseAberta !== null && ind.fase(faseAberta) ? ind.fase(faseAberta).etapa : null);
    const etapas = ind.cat.etapas.map((e) => {
        const aberta = e.id === etapaAberta;
        const feitas = e.fases.filter((n) => (porFase.get(n) || {}).situacao === 'completed').length;
        const fases = aberta ? e.fases.map((n) => htmlDaFase(ind, n, porFase.get(n), porPasso, atual, faseAberta)).join('') : '';
        return `<section>
            <button type="button" class="bancada-etapa" data-etapa="${e.id}" aria-expanded="${aberta}" data-action="bancadaAbrirEtapa" data-args='${arg(e.id)}'>${escapeHTML(e.nome)}<span class="bancada-estado">${feitas} de ${e.fases.length} fases concluídas</span></button>
            <progress class="bancada-progresso" max="${e.fases.length}" value="${feitas}" aria-label="Fases concluídas da etapa"></progress>${fases}</section>`;
    }).join('');
    return `<nav class="bancada-trilha" aria-label="Trilha da jornada" data-action-keydown="bancadaTeclaTrilha" data-arg-event>${etapas}</nav>`;
}
