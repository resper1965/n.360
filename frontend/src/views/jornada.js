import { S } from '../state.js';
import { escapeHTML } from '../ui.js';
import { renderBancada } from './bancada.js';
import { renderProntidao } from './prontidao.js';

// Jornada (onda 4): o plano de trabalho (a Bancada) e a prontidão para certificar na mesma tela, em duas abas. A rota
// GET /projects/:id/prontidao fica (lida pela aba, pela Bancada, pela onda 2 e pelos testes). `S.jornadaAba` é posto pelo navigate.
const ABAS = [['trabalho', 'Plano de trabalho'], ['prontidao', 'Prontidão para certificar']];

export async function renderJornada(c, h, a) {
    const aba = S.jornadaAba === 'prontidao' ? 'prontidao' : 'trabalho';
    c.innerHTML = `<div class="jornada-abas" role="tablist" aria-label="Jornada">${ABAS.map(([id, rotulo]) =>
        `<button type="button" role="tab" id="jornada-aba-${id}" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}" aria-controls="jornada-painel" class="btn btn-sm${id === aba ? ' btn-primary' : ''}" data-action="jornadaAba" data-args='${escapeHTML(JSON.stringify([id]))}'>${rotulo}</button>`).join('')}</div>
        <div id="jornada-painel" role="tabpanel" aria-labelledby="jornada-aba-${aba}"></div>`;
    const painel = c.querySelector('#jornada-painel');
    if (aba === 'prontidao') await renderProntidao(painel, h, a); else await renderBancada(painel, h, a);
}

/** Trocar de aba só redesenha (não é navegação: o filtro do painel e o projeto ficam). */
window.jornadaAba = (aba) => { S.jornadaAba = aba === 'prontidao' ? 'prontidao' : 'trabalho'; if (typeof window.render === 'function') window.render(); };

/** Setas e Home/End movem entre as abas (padrão WAI-ARIA de tablist). */
document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t.getAttribute('role') !== 'tab' || !t.closest('.jornada-abas')) return;
    const abas = [...t.closest('.jornada-abas').querySelectorAll('[role=tab]')];
    const i = abas.indexOf(t);
    const j = e.key === 'ArrowRight' ? (i + 1) % abas.length : e.key === 'ArrowLeft' ? (i - 1 + abas.length) % abas.length : e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    abas[j].click();
    setTimeout(() => document.getElementById(abas[j].id)?.focus(), 0);
});

// Substitui o `window.renderProjectDetail = renderBancada` de bancada.js (que fica para os testes que montam só a Bancada).
window.renderProjectDetail = renderJornada;
