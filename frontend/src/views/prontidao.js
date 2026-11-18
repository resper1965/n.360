import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, showToast } from '../ui.js';
import { filtroValido } from '../filtro-painel.js';

// Prontidão para a certificação (Onda 2 do diagnóstico de 15/10/2026): uma tela que responde "estou pronto para o estágio 1?".
// Tudo vem de GET /projects/:id/prontidao (src/services/prontidao.ts): o veredito, os critérios com a cláusula, o que falta em
// ordem e o que depende do cliente. Aqui só se desenha; todo texto do servidor passa por escapeHTML. Ocupa a tela que era o
// "Acompanhamento de Certificação" (o estágio escolhido à mão num select saiu: o estágio agora é calculado).

const e = (v) => escapeHTML(String(v ?? ''));
const args = (...v) => escapeHTML(JSON.stringify(v));
const estado = (tom, texto) => `<span class="pn-estado pn-${e(tom)}">${e(texto)}</span>`;
const SITUACAO = { atendido: ['ok', 'Atendido'], pendente: ['semana', 'Pendente'], nao_se_aplica: ['plano', 'Não se aplica'] };
const ehEquipe = () => typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();

/** Telas a que um critério pode levar (o destino vem do servidor como dado; fora da lista, o botão não faz nada). */
const TELAS = new Set(['context', 'stakeholders', 'governance', 'documentos', 'risks', 'soa', 'metrics', 'evidence', 'training', 'audits',
    'management-review', 'capa']);

function itemQueFalta(c) {
    const destrava = c.destrava_pendentes > 0 ? ` Resolver este destrava ${c.destrava_pendentes === 1 ? 'outro item' : `outros ${c.destrava_pendentes} itens`}.` : '';
    return `<li><div><div class="pn-meta">Cláusula ${e(c.requisito)}</div>${c.numero ? `<div class="pt-numero pn-num">${e(c.numero)}</div>` : ''}</div>
        <div><div class="pn-tx">${e(c.titulo)}</div><div class="pn-cx">${e(c.motivo)}${e(destrava)}</div></div>
        <button type="button" class="btn btn-sm" data-action="prontidaoAbrir" data-args='${args(c.tela, c.filtro || null)}' aria-label="${e(`${c.acao}: ${c.titulo}`)}">${e(c.acao)}</button></li>`;
}

function quadroEstagio(d, n) {
    const lista = (Array.isArray(d.faltam) ? d.faltam : []).filter((c) => c.estagio === n);
    const nome = n === 1 ? 'Estágio 1 (documentação)' : 'Estágio 2 (operação)';
    const corpo = lista.length ? `<ul class="pn-grupo">${lista.map(itemQueFalta).join('')}</ul>`
        : `<p class="pn-vazio-tx">Nenhum critério verificável pendente para o estágio ${n}.</p>`;
    return `<section class="pn-quadro" aria-labelledby="pt-e${n}"><header><h2 id="pt-e${n}">O que falta: ${nome}</h2><span class="pn-meta pn-num">${lista.length}</span></header>${corpo}</section>`;
}

function quadroCliente(d) {
    const cliente = d.visao === 'cliente';
    const lista = Array.isArray(d.do_cliente) ? d.do_cliente : [];
    const titulo = cliente ? 'O que depende de você' : 'O que o cliente precisa decidir ou fornecer';
    const corpo = lista.length ? `<ul class="pn-grupo pt-cliente">${lista.map((c) => `<li><div><div class="pn-tx">${e(c.cliente)}</div><div class="pn-cx">${e(c.titulo)} (cláusula ${e(c.requisito)})</div></div>
            ${cliente ? `<button type="button" class="btn btn-sm" data-action="prontidaoAbrir" data-args='${args(c.tela, c.filtro || null)}' aria-label="${e(`${c.acao}: ${c.cliente}`)}">${e(c.acao)}</button>` : ''}</li>`).join('')}</ul>`
        : `<p class="pn-vazio-tx">${cliente ? 'Nada pendente depende de você agora.' : 'Nenhuma pendência depende de decisão ou envio do cliente.'}</p>`;
    return `<section class="pn-quadro" aria-labelledby="pt-cli"><header><h2 id="pt-cli">${titulo}</h2></header>${corpo}</section>`;
}

function tabelaCriterios(d) {
    const lista = Array.isArray(d.criterios) ? d.criterios : [];
    return `<section class="pn-quadro" aria-labelledby="pt-todos"><header><h2 id="pt-todos">Todos os critérios</h2></header>
        <table class="pn-tabela"><thead><tr><th scope="col">Critério</th><th scope="col">Cláusula</th><th scope="col">Estágio</th><th scope="col">Situação</th><th scope="col" class="n">Número</th></tr></thead>
        <tbody>${lista.map((c) => { const [tom, rotulo] = SITUACAO[c.situacao] || SITUACAO.pendente; return `<tr><td class="pn-tx">${e(c.titulo)}</td><td>${e(c.requisito)}</td><td>${e(c.estagio)}</td>
            <td>${estado(tom, rotulo)}</td><td class="n">${e(c.numero || '')}</td></tr>`; }).join('')}</tbody></table></section>`;
}

function quadroDatas(d, proj) {
    const cert = d.certificacao || {};
    return `<section class="pn-quadro" aria-labelledby="pt-datas"><header><h2 id="pt-datas">Datas da certificação</h2></header>
        <div class="pt-datas">
            <label>Estágio 1<input type="date" class="form-input" id="pt-data1" value="${e(cert.data_estagio1 || '')}"></label>
            <label>Estágio 2<input type="date" class="form-input" id="pt-data2" value="${e(cert.data_estagio2 || '')}"></label>
            <label>Organismo certificador<input type="text" class="form-input" id="pt-organismo" maxlength="200" value="${e(cert.organismo || '')}"></label>
        </div>
        <button type="button" class="btn btn-sm" data-action="salvarDatasCertificacao" data-args='${args(proj.id, cert.id || null)}'>Salvar as datas</button></section>`;
}

function linhaDatas(cert) {
    if (!cert) return '';
    const partes = [
        cert.estagio1 && `Estágio 1 ${cert.estagio1_aprovado ? 'aprovado' : 'marcado para'} ${cert.estagio1}`,
        cert.estagio2 && `Estágio 2 ${cert.estagio2_aprovado ? 'aprovado' : 'marcado para'} ${cert.estagio2}`,
        cert.organismo && `organismo: ${cert.organismo}`,
    ].filter(Boolean);
    return partes.length ? `<p class="pn-meta">${e(partes.join(' · '))}</p>` : '';
}

function desenhar(d, proj) {
    const v = d.veredito || { tom: 'plano', rotulo: 'Sem dados', frase: '', apoio: '' };
    return `<div class="pn">
        <section class="pn-saude" aria-labelledby="pt-veredito"><h2 id="pt-veredito" class="sr-only">Veredito</h2>${estado(v.tom, v.rotulo)}
            <p class="pn-frase">${e(v.frase)}</p><p class="pn-apoio">${e(v.apoio)}</p>
            <p class="pn-apoio"><strong class="pn-num">${e(d.indicador && d.indicador.texto)}</strong>. É o indicador de progresso do n.iso: o mesmo número no Painel e na Jornada.</p>
            ${linhaDatas(d.certificacao)}
            <details class="pn-regra"><summary>Como esta resposta é montada</summary>
                <p>Cada critério é verificável no cadastro do n.iso e cita a cláusula da ISO/IEC 27001:2022 de onde vem. <b>Estágio 1</b>: a
                informação documentada existe e está aprovada (escopo, contexto, partes interessadas, papéis, política, riscos e tratamento, SoA,
                objetivos, revisão dos documentos). <b>Estágio 2</b>: a operação tem registro (controles implementados e com evidência válida,
                conscientização, medição, auditoria interna, análise crítica, ações corretivas). "Pronto" quer dizer que nenhum critério verificável
                está pendente; o que só uma pessoa confere (imparcialidade do auditor interno, entradas da análise crítica, amostras da operação)
                fica para a pré-avaliação da consultoria. A lista começa pelo estágio 1 e, dentro dele, pelo que destrava mais itens.</p></details>
        </section>
        ${d.visao === 'cliente'
        // O cliente vê primeiro o que é dele; depois o que falta no programa e a lista inteira.
        ? `<div class="pn-col pt-uma">${quadroCliente(d)}${quadroEstagio(d, 1)}${quadroEstagio(d, 2)}${tabelaCriterios(d)}</div>`
        : `<div class="pn-cols">
            <div class="pn-col">${quadroEstagio(d, 1)}${quadroEstagio(d, 2)}</div>
            <div class="pn-col">${quadroCliente(d)}${ehEquipe() ? quadroDatas(d, proj) : ''}</div>
        </div><div class="pn-col pt-uma">${tabelaCriterios(d)}</div>`}</div>`;
}

export async function renderProntidao(c, h, a) {
    h.textContent = 'Prontidão para certificar'; // o item do menu saiu: o título não vem mais dele
    a.innerHTML = '';
    const proj = S.activeProject || (Array.isArray(S.projects) ? S.projects[0] : null);
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    c.innerHTML = '<div class="loading"></div>';
    let d;
    try { d = await api('GET', `/api/v1/projects/${proj.id}/prontidao`); } catch (err) { window.falhaDeCarga(c, a, 'Não foi possível calcular a prontidão do projeto.', err); return; }
    c.innerHTML = desenhar(d, proj);
}

window.prontidaoAbrir = function (tela, filtro) {
    if (!TELAS.has(tela) || typeof window.navigate !== 'function') return;
    const filtroPainel = filtro ? filtroValido(tela, null, filtro) : null;
    if (filtroPainel) window.navigate(tela, { filtroPainel }); else window.navigate(tela);
};

/** As datas do acompanhamento: atualiza o registro que existe (os outros campos ficam) ou cria o primeiro. */
window.salvarDatasCertificacao = async function (projectId, certId) {
    const val = (id) => (document.getElementById(id)?.value || '').trim() || null;
    const corpo = { stage1_date: val('pt-data1'), stage2_date: val('pt-data2'), registrar: val('pt-organismo') };
    try {
        if (certId) await api('PUT', `/api/v1/certification/${certId}`, corpo);
        else await api('POST', `/api/v1/projects/${projectId}/certification`, corpo);
        showToast('Datas da certificação salvas', 'success');
        if (typeof window.render === 'function') window.render();
    } catch (err) {
        showToast(`Não foi possível salvar as datas: ${err.message}`, 'error');
    }
};

window.renderProntidao = renderProntidao;
