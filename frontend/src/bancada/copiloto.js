// Painel do copiloto da Bancada (coluna da direita). O assistente só PROPÕE: nada é salvo aqui. Aceitar entrega o texto a
// `aoAceitar`, e quem grava (autosave) é a tela do passo. Modo 1: "Rascunhar este campo".
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

/**
 * @param {object} p
 * @param {HTMLElement} p.el              contêiner `<aside>` da coluna
 * @param {string} p.projectId
 * @param {object} p.passo                Passo do catálogo (campos, titulo, ...)
 * @param {() => Record<string,string>} p.valoresAtuais   valores hoje na tela, por id de campo
 * @param {(campoId: string, valor: string) => void} p.aoAceitar   o painel pede; a tela grava (autosave) e mostra
 * @param {(campoId: string) => void} p.focarCampo
 * @param {boolean} p.podeUsar            false: papel sem direito ao copiloto (mostra a explicação)
 */
let ctx = null;       // o que montarCopiloto recebeu
let proposta = null;  // { campo, valor, fontes, avisos } à espera de Aceitar ou Descartar
let estado = { carregando: false, indisponivel: false, erro: '' };

function desenhar() {
    const { el, passo, podeUsar, valoresAtuais } = ctx;
    if (!podeUsar) {
        el.innerHTML = '<h2 class="bancada-copiloto-titulo">Assistente</h2><p class="bancada-nota">O assistente é pedido pela equipe da consultoria ou pelo administrador do cliente.</p>';
        return;
    }
    const campos = passo.campos.filter((c) => !c.semIA);
    const atual = valoresAtuais();
    const opcoes = campos.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.rotulo)}</option>`).join('');
    let bloco = '';
    if (estado.indisponivel) bloco = '<p class="bancada-nota" role="status">O assistente não está disponível agora. Você pode escrever o campo normalmente.</p>';
    else if (estado.erro) bloco = `<p class="bancada-nota" role="alert">${escapeHTML(estado.erro)}</p>`;
    if (proposta) {
        const campo = passo.campos.find((c) => c.id === proposta.campo);
        const tem = (atual[proposta.campo] || '').trim();
        bloco += `<div class="bancada-proposta" role="group" aria-label="Proposta do assistente">
            <p class="rotulo">Proposta do assistente</p><p><strong>${escapeHTML(campo ? campo.rotulo : '')}</strong></p>
            <p>${escapeHTML(proposta.valor)}</p>
            ${proposta.fontes.length ? `<p class="bancada-nota">Com base em: ${proposta.fontes.map((f) => escapeHTML(f.rotulo)).join(', ')}</p>` : ''}
            ${proposta.avisos.map((a) => `<p class="bancada-nota">${escapeHTML(a)}</p>`).join('')}
            ${tem ? `<p class="bancada-nota">Aceitar substitui o texto atual: ${escapeHTML(tem.slice(0, 200))}</p>` : ''}
            <button type="button" class="btn" data-action="bancadaCopilotoAceitar">Aceitar</button>
            <button type="button" class="btn" data-action="bancadaCopilotoDescartar">Descartar</button></div>`;
    }
    el.innerHTML = `<h2 class="bancada-copiloto-titulo">Assistente</h2>
        <p class="bancada-nota">Ele só propõe. Nada é salvo nem concluído sem você aceitar.</p>
        <label for="copiloto-campo" class="rotulo-campo">Campo</label><select id="copiloto-campo" class="form-select">${opcoes}</select>
        <label for="copiloto-instrucao" class="rotulo-campo">Instrução (opcional)</label><input id="copiloto-instrucao" class="form-input" maxlength="500" placeholder="Ex.: mais curto">
        <p><button type="button" class="btn" data-action="bancadaCopilotoRascunhar"${estado.carregando ? ' disabled' : ''}>${estado.carregando ? 'Pensando...' : 'Rascunhar este campo'}</button></p>${bloco}`;
}

export function montarCopiloto(p) {
    ctx = p; proposta = null; estado = { carregando: false, indisponivel: false, erro: '' };
    desenhar();
}

window.bancadaCopilotoRascunhar = async () => {
    const campo = document.getElementById('copiloto-campo').value;
    const instrucao = document.getElementById('copiloto-instrucao').value.trim();
    estado = { carregando: true, indisponivel: false, erro: '' }; proposta = null; desenhar();
    try {
        const r = await api('POST', `/api/v1/projects/${ctx.projectId}/passos/${ctx.passo.id}/copiloto/rascunhar-campo`, { campo, ...(instrucao ? { instrucao } : {}) }, { timeoutMs: 60000 });
        if (r.indisponivel) estado = { carregando: false, indisponivel: true, erro: '' };
        else if (r.proposta) { proposta = { ...r.proposta, avisos: r.avisos || [] }; estado = { carregando: false, indisponivel: false, erro: '' }; }
        else estado = { carregando: false, indisponivel: false, erro: (r.avisos || [])[0] || 'O assistente não conseguiu uma proposta. Escreva você.' };
    } catch (e) { estado = { carregando: false, indisponivel: false, erro: e.message }; }
    desenhar();
};
window.bancadaCopilotoAceitar = () => { if (!proposta) return; const { campo, valor } = proposta; proposta = null; desenhar(); ctx.aoAceitar(campo, valor); };
window.bancadaCopilotoDescartar = () => { proposta = null; desenhar(); };
