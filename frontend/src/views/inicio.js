import { S } from '../state.js';
import { escapeHTML } from '../ui.js';
import { modulosDe, enderecoDoProduto, irPara } from '../produto.js';
import { renderPontoDePartida } from './ponto-de-partida.js';

// Início do n.360: o projeto ativo, um cartão por módulo habilitado nele ("Abrir" vai ao caminho do módulo) e, abaixo, o
// ponto de partida com os dois lados. Quem só tem um módulo nem chega aqui (initApp leva direto a ele).
const MODULO = {
    iso: { nome: 'n.iso', linha: 'Conformidade ISO 27001 e 27701, do diagnóstico à certificação.' },
    privacy: { nome: 'n.privacy', linha: 'Privacidade e LGPD, do inventário à resposta ao titular.' },
};

export async function renderInicio(c, h, a) {
    if (h) h.textContent = 'n.360';
    if (a) a.innerHTML = '';
    if (!S.activeProject && Array.isArray(S.projects) && S.projects.length) {
        S.activeProject = S.projects[0];
        S.currentProject = S.projects[0];
        if (typeof window.updateActiveProjectWidget === 'function') window.updateActiveProjectWidget();
    }
    const p = S.activeProject;
    if (!p) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum projeto ainda</h3><p>Quando um projeto seu tiver um módulo habilitado, ele aparece aqui.</p></div>';
        return;
    }
    const cartoes = modulosDe(p).filter((m) => Object.hasOwn(MODULO, m)).map((m) => `<div class="card" style="padding:1.25rem;display:flex;flex-direction:column;gap:0.75rem">
            <h3 style="margin:0">${escapeHTML(MODULO[m].nome)}</h3>
            <p style="margin:0;color:var(--text-dim)">${escapeHTML(MODULO[m].linha)}</p>
            <div><button class="btn btn-primary btn-sm" data-action="abrirModulo" data-args='${escapeHTML(JSON.stringify([m]))}'>Abrir</button></div>
        </div>`).join('');
    c.innerHTML = `<div class="fade-in">
        <p style="margin:0 0 1rem;color:var(--text-dim)">Projeto: <strong>${escapeHTML(p.project_name || p.client_name || p.id)}</strong></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin-bottom:1.5rem">${cartoes}</div>
        <div id="inicio-ponto-de-partida"></div>
    </div>`;
    await renderPontoDePartida(c.querySelector('#inicio-ponto-de-partida'), p.id, 'n360');
}

/** "Abrir" do cartão: só os módulos conhecidos viram endereço (data-args é atributo do DOM). */
window.abrirModulo = function abrirModulo(m) {
    if (Object.hasOwn(MODULO, m)) irPara(enderecoDoProduto(m));
};

window.renderInicio = renderInicio;
