import { S } from '../state.js';
import { escapeHTML } from '../ui.js';
import { ABAS } from './contrato.js';
import { esvaziarTudo } from './estado.js';
import { textoDaPergunta } from './perguntas.js';

// Modo guiado: um PAINEL sobre as mesmas abas (spec 14). Não tem formulário nem estado de entrevista: a pergunta vem do servidor
// (`ficha.proxima_pergunta`), a resposta é o campo da aba, gravado pelo autosave de sempre. "Não sei agora" guarda só a lista de
// perguntas adiadas nesta sessão do navegador (chave `ra.adiadas.<ropaId>`), nenhum dado.

const MODO = 'guiado';
let tentativa = null; // chave da pergunta em que "Continuar" foi apertado: se a mesma voltar, o campo ainda não foi respondido.

export const modoDoEndereco = (loc = window.location) => new URLSearchParams(loc.search).get('modo') === MODO;

export function gravarModoNoEndereco(ativo) {
    const u = new URL(window.location.href);
    if (ativo) u.searchParams.set('modo', MODO);
    else u.searchParams.delete('modo');
    window.history.replaceState(null, '', u);
}

export const chaveDaPergunta = (p) => `${p.aba}/${p.campo}`;
const chaveAdiadas = (ropaId) => `ra.adiadas.${ropaId}`;

export function adiadas(ropaId) {
    try {
        const v = JSON.parse(window.sessionStorage.getItem(chaveAdiadas(ropaId)) || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

function adiar(ropaId, chave) {
    try {
        const lista = adiadas(ropaId);
        if (!lista.includes(chave)) lista.push(chave);
        window.sessionStorage.setItem(chaveAdiadas(ropaId), JSON.stringify(lista));
    } catch (e) { /* sem sessionStorage a adiada vale só nesta tela */ }
}

const rotuloDaAba = (id) => (ABAS.find((a) => a.id === id) || { rotulo: id }).rotulo;

/** O painel à direita da ficha. `null` do servidor: tudo respondido, e as sugestões (gaps e riscos) abrem as abas, não perguntam. */
export function painelGuiado(ficha, ropaId) {
    const p = ficha.proxima_pergunta;
    if (!p) return painelFim(ficha);
    const chave = chaveDaPergunta(p);
    const t = textoDaPergunta(p);
    const avisos = [];
    if (tentativa === chave) avisos.push('Responda o campo para continuar, ou use "Não sei agora".');
    if (adiadas(ropaId).includes(chave)) avisos.push('Pergunta adiada nesta sessão.');
    tentativa = null;
    return `<aside class="at-guiado" aria-labelledby="at-guiado-titulo">
        <h3 class="at-guiado-titulo" id="at-guiado-titulo">Entrevista guiada</h3>
        <p class="at-guiado-pergunta">${escapeHTML(t.titulo)}</p>
        ${t.ajuda ? `<p class="at-guiado-ajuda">${escapeHTML(t.ajuda)}</p>` : ''}
        ${t.exemplos && t.exemplos.length ? `<p class="at-guiado-exemplos">Exemplos: ${t.exemplos.map(escapeHTML).join('; ')}.</p>` : ''}
        <p class="at-guiado-onde">A resposta vai no campo da aba <strong>${escapeHTML(rotuloDaAba(p.aba))}</strong>.</p>
        ${avisos.map((a) => `<p class="at-guiado-aviso" role="status">${escapeHTML(a)}</p>`).join('')}
        <div class="at-guiado-acoes">
            <button type="button" class="btn btn-primary" data-action="atGuiadoContinuar">Continuar</button>
            <button type="button" class="btn" data-action="atGuiadoAdiar">Não sei agora</button>
            <button type="button" class="btn btn-ghost" data-action="atGuiadoSair">Sair do guiado</button>
        </div>
    </aside>`;
}

// Tudo respondido: as sugestões abrem a aba. Gap e risco nunca viram pergunta do guiado (spec 14).
function painelFim(ficha) {
    const sugestoes = [['gaps', 'Quer registrar os gaps agora?'], ['riscos', 'Quer registrar os riscos agora?']]
        .filter(([aba]) => ficha.abas && ficha.abas[aba] && ficha.abas[aba].estado === 'vazio');
    return `<aside class="at-guiado" aria-labelledby="at-guiado-titulo">
        <h3 class="at-guiado-titulo" id="at-guiado-titulo">Entrevista guiada</h3>
        <p class="at-guiado-pergunta">Tudo respondido.</p>
        <div class="at-guiado-acoes">
            ${sugestoes.map(([aba, rotulo]) => `<button type="button" class="btn" data-action="atIrParaAba" data-aba="${aba}">${escapeHTML(rotulo)}</button>`).join('')}
            <button type="button" class="btn btn-ghost" data-action="atGuiadoSair">Sair do guiado</button>
        </div>
    </aside>`;
}

/** O foco vai ao primeiro campo da aba (o painel não tem campo próprio). */
export function focarCampo(corpo) {
    const campo = corpo && corpo.querySelector('input:not([type="hidden"]), select, textarea');
    if (campo) campo.focus();
}

// Continuar: grava o que estiver pendente e volta à ficha, que traz a pergunta seguinte. A aba muda sozinha para ela.
window.atGuiadoContinuar = async function () {
    const pedido = S.atividade;
    if (!pedido || typeof window.atRepintar !== 'function') return;
    const ficha = pedido.ficha;
    tentativa = ficha && ficha.proxima_pergunta ? chaveDaPergunta(ficha.proxima_pergunta) : null;
    pedido.avancou = true;
    await esvaziarTudo();
    await window.atRepintar();
};

// Não sei agora: a pergunta fica adiada no navegador e o painel avisa. Não grava nada no servidor.
window.atGuiadoAdiar = function () {
    const pedido = S.atividade;
    const ficha = pedido && pedido.ficha;
    if (!pedido || !ficha || !ficha.proxima_pergunta) return;
    adiar(pedido.ropaId, chaveDaPergunta(ficha.proxima_pergunta));
    if (typeof window.atRepintar === 'function') window.atRepintar();
};

// Sair do guiado: tira `?modo=` e mantém tudo (as abas continuam do mesmo jeito).
window.atGuiadoSair = async function () {
    await esvaziarTudo();
    gravarModoNoEndereco(false);
    if (S.atividade) S.atividade.modo = null;
    if (typeof window.atRepintar === 'function') await window.atRepintar();
};
