import { api } from '../api.js';
import { S } from '../state.js';
import { openModal, showToast, escapeHTML } from '../ui.js';

// Aprovação em lote em "Minhas aprovações" (spec 2026-10-14). A tela só junta cliques e a senha: o servidor aplica a MESMA regra
// da aprovação individual a cada item. A caixa só libera depois de a pessoa abrir o pedido; o hash que ela viu ao abrir é
// o `hash_visto` do envio, e o servidor ignora o item cujo conteúdo mudou. O modal lista o que será assinado, separando
// aprovação de ciência, e o resultado leva de volta ao pedido que ficou de fora.

const vistos = new Map(); // id do pedido → hash que a pessoa viu ao abrir
const dados = new Map(); // id → { titulo, tipo, papel, projeto }, para a lista do modal e o resultado
let areaAcoes = null;
let selecionadas = [];

const TIPOS = { dpia: 'RIPD (DPIA)', politica: 'Política', documento: 'Documento', excecao: 'Exceção a documento', tratamento: 'Atividade de tratamento' };
const COMO = { ciso: 'como Líder SGSI / DPO', ceo: 'como Direção Executiva' };

const el = (id) => document.getElementById(id);
const args = (...v) => escapeHTML(JSON.stringify(v));
const caixas = () => [...document.querySelectorAll('input[data-pl]')];
const marcadas = () => caixas().filter((i) => i.checked && !i.disabled).map((i) => i.getAttribute('data-pl')).filter((id) => vistos.has(id));
const ehCiencia = (id) => (dados.get(id) || {}).papel === 'ciente';
const separar = (ids) => ({ aprovar: ids.filter((id) => !ehCiencia(id)), ciencia: ids.filter(ehCiencia) });
const titulo = (id) => (dados.get(id) || {}).titulo || id;

/** "Aprovar 2 e dar ciência de 1", "Aprovar 2", "Dar ciência de 1". */
function rotuloDoEnvio({ aprovar, ciencia }) {
    if (aprovar.length && ciencia.length) return `Aprovar ${aprovar.length} e dar ciência de ${ciencia.length}`;
    return aprovar.length ? `Aprovar ${aprovar.length}` : `Dar ciência de ${ciencia.length}`;
}

function atualizarBotao() {
    if (!areaAcoes) return;
    if (!caixas().some((i) => !i.disabled)) { areaAcoes.innerHTML = ''; return; }
    const ids = marcadas();
    const { aprovar, ciencia } = separar(ids);
    const verbo = aprovar.length && ciencia.length ? 'Aprovar e dar ciência' : ciencia.length ? 'Dar ciência dos selecionados' : 'Aprovar selecionados';
    areaAcoes.innerHTML = `<button class="btn btn-primary" data-action="abrirLoteAprovacao">${verbo} (${ids.length})</button>`;
}

/** Chamado por "Minhas aprovações" ao desenhar a lista: guarda a área de ações e esquece o visto de pedido cujo conteúdo mudou. */
window.lotePedidosRender = function (a, pedidos) {
    areaAcoes = a;
    const projetos = Array.isArray(S.projects) ? S.projects : [];
    for (const p of pedidos) {
        const proj = projetos.find((x) => x.id === p.project_id);
        dados.set(p.id, { titulo: p.titulo, tipo: p.tipo, papel: p.papel_exigido, projeto: proj ? proj.client_name || proj.project_name || '' : '' });
        if (vistos.has(p.id) && vistos.get(p.id) !== p.hash) vistos.delete(p.id);
    }
    atualizarBotao();
};

/** Chamado por `abrirPedido`: a pessoa abriu o pedido e viu este hash. A caixa libera e o motivo visível sai. */
window.lotePedidoVisto = function (id, hash) {
    vistos.set(id, hash);
    const caixa = caixas().find((i) => i.getAttribute('data-pl') === id);
    if (caixa) {
        caixa.disabled = false;
        const motivo = caixa.getAttribute('aria-describedby') && el(caixa.getAttribute('aria-describedby'));
        if (motivo) motivo.remove();
        caixa.removeAttribute('aria-describedby');
    }
    atualizarBotao();
};

document.addEventListener('change', (e) => {
    if (e.target && e.target.matches && e.target.matches('input[data-pl]')) atualizarBotao();
});

function itemDoLote(id) {
    const d = dados.get(id) || {};
    const onde = [d.projeto, COMO[d.papel]].filter(Boolean).join(' · ');
    return `<li style="margin:0 0 6px"><strong>${escapeHTML(TIPOS[d.tipo] || 'Pedido')}: ${escapeHTML(d.titulo || id)}</strong>
        ${onde ? `<span style="display:block;font-size:12px;color:var(--text-dim)">${escapeHTML(onde)}</span>` : ''}</li>`;
}

const grupo = (id, rotulo, explica, ids) => (ids.length ? `<section id="${id}" style="margin:0 0 12px">
    <h4 style="font-family:var(--font-head);font-weight:600;font-size:14px;margin:0 0 4px">${rotulo} (${ids.length})</h4>
    <p style="font-size:12px;color:var(--text-dim);margin:0 0 6px">${explica}</p>
    <ul style="font-size:13px;margin:0;padding-left:18px">${ids.map(itemDoLote).join('')}</ul></section>` : '');

window.abrirLoteAprovacao = function () {
    selecionadas = marcadas();
    if (!selecionadas.length) { showToast('Marque ao menos um pedido (abra o pedido antes para poder marcá-lo)', 'error'); return; }
    const partes = separar(selecionadas);
    const tituloModal = partes.aprovar.length && partes.ciencia.length ? 'Aprovar e dar ciência' : partes.aprovar.length ? 'Aprovar selecionados' : 'Dar ciência dos selecionados';
    const resumo = partes.aprovar.length && partes.ciencia.length ? `aprovar ${partes.aprovar.length} e dar ciência de ${partes.ciencia.length}`
        : partes.aprovar.length ? `aprovar ${partes.aprovar.length}` : `dar ciência de ${partes.ciencia.length}`;
    openModal(`
        <div style="padding:1.5rem 1.75rem;max-width:620px" id="lote-corpo">
            <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">${tituloModal}</h3>
            <p style="font-size:13px;color:var(--text);margin:0 0 12px">Você vai ${resumo}, cada um na versão que abriu. Se um deles mudou depois disso, ele fica de fora e você vê o motivo.</p>
            <div style="max-height:40vh;overflow:auto;border:1px solid var(--border);padding:12px 14px;margin:0 0 12px">
                ${grupo('lote-aprovar', 'Aprovar', 'Aprovar registra a sua aprovação do conteúdo como está, no papel indicado. Vale como assinatura.', partes.aprovar)}
                ${grupo('lote-ciencia', 'Dar ciência', 'Dar ciência registra que você leu o conteúdo. Não é aprovação.', partes.ciencia)}
            </div>
            <div class="form-group">
                <label class="form-label" for="lote-senha">Sua senha, para registrar as decisões</label>
                <input class="form-input" id="lote-senha" type="password" autocomplete="current-password">
            </div>
            <p class="login-error" id="lote-erro" role="alert" aria-live="polite"></p>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="button" class="btn btn-primary" data-action="enviarLoteAprovacao">${rotuloDoEnvio(partes)}</button>
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
    const feitos = resultados.filter((x) => x.resultado === 'aprovado');
    const ignorados = resultados.filter((x) => x.resultado !== 'aprovado');
    const total = resultados.length;
    // Sem campo de senha na tela depois do envio: o corpo é refeito só com o resumo.
    el('lote-corpo').innerHTML = `
        <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">Resultado</h3>
        <p style="font-size:14px;color:var(--text);margin:0 0 12px">${feitos.length} de ${total} ${total === 1 ? 'decisão registrada' : 'decisões registradas'}.</p>
        ${feitos.length ? `<ul id="lote-feitos" style="font-size:13px;margin:0 0 12px;padding-left:18px">${feitos.map((x) =>
            `<li><strong>${escapeHTML(titulo(x.id))}</strong>: ${ehCiencia(x.id) ? 'Ciência registrada' : 'Aprovado'}</li>`).join('')}</ul>` : ''}
        ${ignorados.length ? `<section id="lote-fora" style="margin:0 0 12px">
            <h4 style="font-family:var(--font-head);font-weight:600;font-size:14px;margin:0 0 4px">Ficaram de fora</h4>
            <p style="font-size:12px;color:var(--text-dim);margin:0 0 6px">Abra o pedido, leia a versão atual e decida de novo.</p>
            <ul style="font-size:13px;margin:0;padding-left:18px">${ignorados.map((x) => `<li style="margin:0 0 8px"><strong>${escapeHTML(titulo(x.id))}</strong>: ${escapeHTML(x.motivo || 'não registrado')}
                <button type="button" class="btn btn-sm" style="margin-left:8px" data-action="abrirPedido" data-args='${args(x.id)}'>Abrir o pedido</button></li>`).join('')}</ul></section>` : ''}
        <div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-secondary" data-action="forceCloseModal">Fechar</button></div>`;
    for (const x of feitos) vistos.delete(x.id);
    if (typeof window.invalidarInicio === 'function') window.invalidarInicio(); // o Início guarda a lista por 60 s
    if (typeof window.render === 'function') window.render();
};
