import { api } from '../api.js';
import { openModal, showToast, escapeHTML } from '../ui.js';

// Aprovação em lote em "Meus pedidos" (spec 2026-10-14). A tela só junta cliques e a senha: o servidor aplica a MESMA regra
// da aprovação individual a cada item. A caixa só libera depois de a pessoa abrir o pedido; o hash que ela viu ao abrir é
// o `hash_visto` do envio, e o servidor ignora o item cujo conteúdo mudou.

const vistos = new Map(); // id do pedido → hash que a pessoa viu ao abrir
const titulos = new Map(); // id → título, para o resumo
let areaAcoes = null;
let selecionadas = [];

const el = (id) => document.getElementById(id);
const caixas = () => [...document.querySelectorAll('input[data-pl]')];
const marcadas = () => caixas().filter((i) => i.checked && !i.disabled).map((i) => i.getAttribute('data-pl')).filter((id) => vistos.has(id));

function atualizarBotao() {
    if (!areaAcoes) return;
    if (!caixas().some((i) => !i.disabled)) { areaAcoes.innerHTML = ''; return; }
    areaAcoes.innerHTML = `<button class="btn btn-primary" data-action="abrirLoteAprovacao">Aprovar selecionados (${marcadas().length})</button>`;
}

/** Chamado por "Meus pedidos" ao desenhar a lista: guarda a área de ações e esquece o visto de pedido cujo conteúdo mudou. */
window.lotePedidosRender = function (a, pedidos) {
    areaAcoes = a;
    for (const p of pedidos) {
        titulos.set(p.id, p.titulo);
        if (vistos.has(p.id) && vistos.get(p.id) !== p.hash) vistos.delete(p.id);
    }
    atualizarBotao();
};

/** Chamado por `abrirPedido`: a pessoa abriu o pedido e viu este hash. */
window.lotePedidoVisto = function (id, hash) {
    vistos.set(id, hash);
    const caixa = caixas().find((i) => i.getAttribute('data-pl') === id);
    if (caixa) { caixa.disabled = false; caixa.removeAttribute('title'); }
    atualizarBotao();
};

document.addEventListener('change', (e) => {
    if (e.target && e.target.matches && e.target.matches('input[data-pl]')) atualizarBotao();
});

window.abrirLoteAprovacao = function () {
    selecionadas = marcadas();
    if (!selecionadas.length) { showToast('Marque ao menos um pedido (abra o pedido antes para poder marcá-lo)', 'error'); return; }
    const n = selecionadas.length;
    openModal(`
        <div style="padding:1.5rem 1.75rem;max-width:560px" id="lote-corpo">
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">Aprovar selecionados</h3>
            <p style="font-size:13px;color:var(--text);margin:0 0 12px">Você vai registrar a sua decisão em ${n} ${n === 1 ? 'item' : 'itens'}, cada um com a versão que abriu. Se um deles mudou, ele fica de fora e você vê o motivo.</p>
            <div class="form-group">
                <label class="form-label" for="lote-senha">Sua senha, para registrar as decisões</label>
                <input class="form-input" id="lote-senha" type="password" autocomplete="current-password">
            </div>
            <p class="login-error" id="lote-erro" role="alert" aria-live="polite"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="button" class="btn btn-primary" data-action="enviarLoteAprovacao">Aprovar</button>
            </div>
        </div>`);
    el('lote-senha').focus();
};

window.enviarLoteAprovacao = async function () {
    const campo = el('lote-senha');
    const erro = el('lote-erro');
    erro.textContent = '';
    const senha = campo.value;
    if (!senha) { erro.textContent = 'Informe a sua senha'; campo.focus(); return; }
    let r;
    try {
        r = await api('POST', '/api/v1/pedidos/lote', {
            senha,
            itens: selecionadas.map((id) => ({ tipo: 'pedido', id, hash_visto: vistos.get(id) })),
        });
    } catch (e) {
        erro.textContent = (e && e.message) || 'Não foi possível enviar o lote';
        return;
    }
    const resultados = Array.isArray(r && r.resultados) ? r.resultados : [];
    const ignorados = resultados.filter((x) => x.resultado === 'ignorado');
    // Sem campo de senha na tela depois do envio: o corpo é refeito só com o resumo.
    el('lote-corpo').innerHTML = `
        <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">Resultado</h3>
        <p style="font-size:14px;color:var(--text);margin:0 0 12px">${escapeHTML(String(r.aprovados))} de ${escapeHTML(String(resultados.length))} aprovado(s).</p>
        ${ignorados.length ? `<ul style="font-size:13px;margin:0 0 12px;padding-left:18px">${ignorados.map((x) =>
            `<li><strong>${escapeHTML(titulos.get(x.id) || x.id)}</strong>: ${escapeHTML(x.motivo || 'não aprovado')}</li>`).join('')}</ul>` : ''}
        <div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button></div>`;
    for (const x of resultados) if (x.resultado === 'aprovado') vistos.delete(x.id);
    if (typeof window.render === 'function') window.render();
};
