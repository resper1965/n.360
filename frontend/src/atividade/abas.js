import { ABAS } from './contrato.js';
import { escapeHTML } from '../ui.js';

const ESTADO = { feito: 'feito', pendente: 'pendente', na: 'não se aplica', vazio: 'vazio' };

/**
 * A faixa de abas (WAI-ARIA tabs, ativação automática). O estado vai ESCRITO no rótulo e no `aria-label`, nunca só em cor.
 * Clique e teclado passam pela delegação; o id da aba vai em `data-aba` (a delegação chama a função com `this` = o botão).
 */
export function desenharAbas(ficha, ativa) {
    return `<div class="at-abas" role="tablist" aria-label="Abas da atividade">${ABAS.map((a) => {
        const est = ficha.abas[a.id] || { estado: 'vazio', resumo: '' };
        const texto = ESTADO[est.estado] || est.estado;
        return `<button type="button" role="tab" class="at-aba" id="at-aba-${a.id}" aria-controls="at-painel" aria-selected="${a.id === ativa}" tabindex="${a.id === ativa ? 0 : -1}"
            aria-label="${escapeHTML(`${a.rotulo}, ${texto}`)}" data-aba="${a.id}" data-estado="${escapeHTML(est.estado)}" title="${escapeHTML(est.resumo || '')}"
            data-action="atIrParaAba" data-action-keydown="atTeclaAba" data-arg-event>
            <span>${escapeHTML(a.rotulo)}</span><span class="at-aba-estado">${escapeHTML(texto)}</span></button>`;
    }).join('')}</div>`;
}

/** Próxima aba para a tecla (setas, Home, End); null se a tecla não é de navegação. A seta passa da última para a primeira. */
export function abaParaTecla(ativa, tecla) {
    const i = ABAS.findIndex((a) => a.id === ativa);
    const n = ABAS.length;
    if (tecla === 'ArrowRight') return ABAS[(i + 1) % n].id;
    if (tecla === 'ArrowLeft') return ABAS[(i + n - 1) % n].id;
    if (tecla === 'Home') return ABAS[0].id;
    if (tecla === 'End') return ABAS[n - 1].id;
    return null;
}
