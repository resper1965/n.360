// Painel do copiloto da Bancada (coluna da direita). O assistente só PROPÕE: nada é salvo aqui. Aceitar entrega o texto a
// `aoAceitar`, e quem grava (autosave) é a tela do passo. Três modos: "Rascunhar este campo", "Escrever a partir da conversa" e
// "Revisão de auditor" (esta só aponta o que o auditor questionaria; nunca é parecer de certificação).
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

/**
 * @param {object} p
 * @param {HTMLElement} p.el              contêiner `<aside>` da coluna
 * @param {string} p.projectId
 * @param {object} p.passo                Passo do catálogo (campos, titulo, ...)
 * @param {() => Record<string,string>} p.valoresAtuais   valores hoje na tela, por id de campo
 * @param {(campoId: string, valor: string) => void} p.aoAceitar   o painel pede; a tela grava (autosave) e mostra
 * @param {(campoId: string) => void} p.focarCampo   recebe o id do campo, `prova` ou `criterio:<tipo>` (pontos da revisão)
 * @param {boolean} p.podeUsar            false: papel sem direito ao copiloto (mostra a explicação)
 */
const MIN_CONVERSA = 20;
const MAX_CONVERSA = 8000;
const ROTULO_REVISAO = 'Revisão assistida; não é parecer de certificação';
const SEVERIDADE = { critico: 'Crítico', alto: 'Alto', medio: 'Médio' };

const vazio = () => ({ carregando: false, indisponivel: false, erro: '' });
let ctx = null;       // o que montarCopiloto recebeu
let proposta = null;  // modo 1: { campo, valor, fontes, avisos } à espera de Aceitar ou Descartar
let lote = null;      // modo 2: { propostas: [{ campo, valor }], naoEncontrado: [campoId], avisos }
let revisao = null;   // modo 3: { resumo, pontos }
let estado = { campo: vazio(), conversa: vazio(), revisao: vazio() };
let memo = { campo: '', instrucao: '', conversa: '' };   // o que a pessoa digitou, para sobreviver ao redesenho

const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const contagem = (n) => `${milhar(n)} de ${milhar(MAX_CONVERSA)}`;
const doDom = (id) => { const e = document.getElementById(id); return e ? e.value : null; };

function lembrar() {
    const campo = doDom('copiloto-campo'), instrucao = doDom('copiloto-instrucao'), conversa = doDom('copiloto-conversa');
    memo = { campo: campo ?? memo.campo, instrucao: instrucao ?? memo.instrucao, conversa: conversa ?? memo.conversa };
}

const avisoDe = (e) => {
    if (e.indisponivel) return '<p class="bancada-nota" role="status">O assistente não está disponível agora. Você pode escrever o campo normalmente.</p>';
    return e.erro ? `<p class="bancada-nota" role="alert">${escapeHTML(e.erro)}</p>` : '';
};

function blocoProposta(passo, atual, p, botoes, prefixo) {
    const campo = passo.campos.find((c) => c.id === p.campo);
    const tem = (atual[p.campo] || '').trim();
    return `<div class="bancada-proposta" role="group" aria-label="Proposta do assistente">
        <p class="rotulo">Proposta do assistente</p><p><strong>${escapeHTML(campo ? campo.rotulo : '')}</strong></p>
        <p>${escapeHTML(p.valor)}</p>
        ${(p.fontes || []).length ? `<p class="bancada-nota">Com base em: ${p.fontes.map((f) => escapeHTML(f.rotulo)).join(', ')}</p>` : ''}
        ${(p.avisos || []).map((a) => `<p class="bancada-nota">${escapeHTML(a)}</p>`).join('')}
        ${tem ? `<p class="bancada-nota">${prefixo}${escapeHTML(tem.slice(0, 200))}</p>` : ''}
        ${botoes}</div>`;
}

function secaoCampo(passo, atual) {
    const campos = passo.campos.filter((c) => !c.semIA);
    const opcoes = campos.map((c) => `<option value="${escapeHTML(c.id)}"${c.id === memo.campo ? ' selected' : ''}>${escapeHTML(c.rotulo)}</option>`).join('');
    const botoes = `<button type="button" class="btn" data-action="bancadaCopilotoAceitar">Aceitar</button>
        <button type="button" class="btn" data-action="bancadaCopilotoDescartar">Descartar</button>`;
    const e = estado.campo;
    return `<label for="copiloto-campo" class="rotulo-campo">Campo</label><select id="copiloto-campo" class="form-select">${opcoes}</select>
        <label for="copiloto-instrucao" class="rotulo-campo">Instrução (opcional)</label><input id="copiloto-instrucao" class="form-input" maxlength="500" placeholder="Ex.: mais curto" value="${escapeHTML(memo.instrucao)}">
        <p><button type="button" class="btn" data-action="bancadaCopilotoRascunhar"${e.carregando ? ' disabled' : ''}>${e.carregando ? 'Pensando...' : 'Rascunhar este campo'}</button></p>${avisoDe(e)}
        ${proposta ? blocoProposta(passo, atual, proposta, botoes, 'Aceitar substitui o texto atual: ') : ''}`;
}

function secaoConversa(passo, atual) {
    const e = estado.conversa;
    let resultado = '';
    if (lote) {
        const rotulo = (id) => (passo.campos.find((c) => c.id === id) || {}).rotulo || id;
        resultado = lote.propostas.map((p) => blocoProposta(passo, atual, { campo: p.campo, valor: p.valor }, `
            <button type="button" class="btn" data-action="bancadaCopilotoAceitarUma" data-args='${escapeHTML(JSON.stringify([p.campo]))}' aria-label="Aceitar a proposta para ${escapeHTML(rotulo(p.campo))}">Aceitar</button>
            <button type="button" class="btn" data-action="bancadaCopilotoDescartarUma" data-args='${escapeHTML(JSON.stringify([p.campo]))}' aria-label="Descartar a proposta para ${escapeHTML(rotulo(p.campo))}">Descartar</button>`, 'Substitui o texto atual: ')).join('');
        if (!lote.propostas.length) resultado += '<p class="bancada-nota">O assistente não encontrou nada na conversa para este passo.</p>';
        if (lote.propostas.length > 1) {
            resultado += `<p><button type="button" class="btn" data-action="bancadaCopilotoAceitarTodas">Aceitar todas</button>
                <button type="button" class="btn" data-action="bancadaCopilotoDescartarTodas">Descartar todas</button></p>`;
        }
        if (lote.naoEncontrado.length) resultado += `<p class="bancada-nota">O cliente não falou de: ${lote.naoEncontrado.map((id) => escapeHTML(rotulo(id))).join(', ')}</p>`;
        resultado += lote.avisos.map((a) => `<p class="bancada-nota">${escapeHTML(a)}</p>`).join('');
    }
    return `<label for="copiloto-conversa" class="rotulo-campo">O que o cliente disse</label>
        <textarea id="copiloto-conversa" class="form-input" rows="6" data-action-input="bancadaCopilotoContar" aria-describedby="copiloto-contador">${escapeHTML(memo.conversa)}</textarea>
        <p class="bancada-nota"><span id="copiloto-contador">${contagem(memo.conversa.length)}</span> (de ${MIN_CONVERSA} a ${milhar(MAX_CONVERSA)} caracteres)</p>
        <p><button type="button" class="btn" data-action="bancadaCopilotoConversa"${e.carregando ? ' disabled' : ''}>${e.carregando ? 'Pensando...' : 'Escrever a partir da conversa'}</button></p>${avisoDe(e)}${resultado}`;
}

function secaoRevisao(passo) {
    const e = estado.revisao;
    let resultado = '';
    if (revisao) {
        const alvo = (a) => {
            if (a.tipo === 'campo') return `Campo: ${(passo.campos.find((c) => c.id === a.id) || {}).rotulo || a.id}`;
            if (a.tipo === 'prova') return 'Prova';
            return `Critério: ${((passo.concluidoQuando || []).find((c) => c.tipo === a.id) || {}).rotulo || a.id}`;
        };
        const ir = { campo: 'Ir ao campo', prova: 'Ir à prova', criterio: 'Ir ao critério' };
        resultado = `${revisao.resumo ? `<p>${escapeHTML(revisao.resumo)}</p>` : ''}
            ${revisao.pontos.length ? `<ul class="bancada-pontos">${revisao.pontos.map((p) => `<li>
                <p><strong>${SEVERIDADE[p.severidade] || SEVERIDADE.medio}</strong> · ${escapeHTML(alvo(p.alvo))}</p>
                <p>${escapeHTML(p.o_que_o_auditor_questionaria)}</p>
                ${p.por_que ? `<p class="bancada-nota">${escapeHTML(p.por_que)}</p>` : ''}
                <button type="button" class="btn" data-action="bancadaCopilotoIrAo" data-args='${escapeHTML(JSON.stringify([p.alvo.tipo, p.alvo.id]))}'>${ir[p.alvo.tipo]}</button></li>`).join('')}</ul>`
                : '<p class="bancada-nota">Nenhum ponto apontado.</p>'}`;
    }
    return `<p><button type="button" class="btn" data-action="bancadaCopilotoRevisao"${e.carregando ? ' disabled' : ''}>${e.carregando ? 'Pensando...' : 'Revisão de auditor'}</button></p>
        <p class="bancada-nota">${ROTULO_REVISAO}</p>${avisoDe(e)}${resultado}`;
}

function desenhar() {
    const { el, passo, podeUsar, valoresAtuais } = ctx;
    if (!podeUsar) {
        el.innerHTML = '<h2 class="bancada-copiloto-titulo">Assistente</h2><p class="bancada-nota">O assistente é pedido pela equipe da consultoria ou pelo administrador do cliente.</p>';
        return;
    }
    lembrar();
    const atual = valoresAtuais();
    el.innerHTML = `<h2 class="bancada-copiloto-titulo">Assistente</h2>
        <p class="bancada-nota">Ele só propõe. Nada é salvo nem concluído sem você aceitar.</p>
        <div role="group" aria-label="Rascunhar um campo">${secaoCampo(passo, atual)}</div>
        <div role="group" aria-label="Escrever a partir da conversa">${secaoConversa(passo, atual)}</div>
        <div role="group" aria-label="Revisão de auditor">${secaoRevisao(passo)}</div>`;
}

export function montarCopiloto(p) {
    ctx = p; proposta = null; lote = null; revisao = null;
    estado = { campo: vazio(), conversa: vazio(), revisao: vazio() };
    memo = { campo: '', instrucao: '', conversa: '' };
    desenhar();
}

const doModelo = () => ctx.passo.campos.filter((c) => !c.semIA).map((c) => c.id);

window.bancadaCopilotoRascunhar = async () => {
    lembrar();
    const campo = document.getElementById('copiloto-campo').value;
    const instrucao = document.getElementById('copiloto-instrucao').value.trim();
    estado.campo = { ...vazio(), carregando: true }; proposta = null; desenhar();
    try {
        const r = await api('POST', `/api/v1/projects/${ctx.projectId}/passos/${ctx.passo.id}/copiloto/rascunhar-campo`, { campo, ...(instrucao ? { instrucao } : {}) }, { timeoutMs: 60000 });
        if (r.indisponivel) estado.campo = { ...vazio(), indisponivel: true };
        else if (r.proposta) { proposta = { ...r.proposta, avisos: r.avisos || [] }; estado.campo = vazio(); }
        else estado.campo = { ...vazio(), erro: (r.avisos || [])[0] || 'O assistente não conseguiu uma proposta. Escreva você.' };
    } catch (e) { estado.campo = { ...vazio(), erro: e.message }; }
    desenhar();
};
window.bancadaCopilotoAceitar = () => { if (!proposta) return; const { campo, valor } = proposta; proposta = null; desenhar(); ctx.aoAceitar(campo, valor); };
window.bancadaCopilotoDescartar = () => { proposta = null; desenhar(); };

window.bancadaCopilotoContar = () => {
    const t = document.getElementById('copiloto-conversa'), c = document.getElementById('copiloto-contador');
    if (!t || !c) return;
    memo.conversa = t.value;
    c.textContent = contagem(t.value.length);
};
window.bancadaCopilotoConversa = async () => {
    lembrar();
    const conversa = memo.conversa.trim();
    if (conversa.length < MIN_CONVERSA) { estado.conversa = { ...vazio(), erro: `Escreva pelo menos ${MIN_CONVERSA} caracteres do que o cliente disse.` }; desenhar(); return; }
    if (conversa.length > MAX_CONVERSA) { estado.conversa = { ...vazio(), erro: `A conversa passa de ${milhar(MAX_CONVERSA)} caracteres. Reduza o texto.` }; desenhar(); return; }
    estado.conversa = { ...vazio(), carregando: true }; lote = null; desenhar();
    try {
        const r = await api('POST', `/api/v1/projects/${ctx.projectId}/passos/${ctx.passo.id}/copiloto/da-conversa`, { conversa }, { timeoutMs: 60000 });
        if (r.indisponivel) estado.conversa = { ...vazio(), indisponivel: true };
        else {
            // Defesa em profundidade: só campo do passo que não é semIA, e só texto.
            const ids = doModelo(), props = r.propostas || {};
            lote = {
                propostas: ids.filter((id) => typeof props[id] === 'string' && props[id].trim()).map((id) => ({ campo: id, valor: props[id] })),
                naoEncontrado: (r.nao_encontrado || []).filter((id) => ids.includes(id)),
                avisos: r.avisos || [],
            };
            estado.conversa = vazio();
        }
    } catch (e) { estado.conversa = { ...vazio(), erro: e.message }; }
    desenhar();
};
window.bancadaCopilotoAceitarUma = (campo) => {
    const p = lote && lote.propostas.find((x) => x.campo === campo);
    if (!p) return;
    lote.propostas = lote.propostas.filter((x) => x.campo !== campo); desenhar(); ctx.aoAceitar(p.campo, p.valor);
};
window.bancadaCopilotoDescartarUma = (campo) => { if (!lote) return; lote.propostas = lote.propostas.filter((x) => x.campo !== campo); desenhar(); };
window.bancadaCopilotoAceitarTodas = () => {
    if (!lote) return;
    const todas = lote.propostas; lote = null; desenhar();
    todas.forEach((p) => ctx.aoAceitar(p.campo, p.valor));
};
window.bancadaCopilotoDescartarTodas = () => { lote = null; desenhar(); };

window.bancadaCopilotoRevisao = async () => {
    lembrar();
    estado.revisao = { ...vazio(), carregando: true }; revisao = null; desenhar();
    try {
        const r = await api('POST', `/api/v1/projects/${ctx.projectId}/passos/${ctx.passo.id}/copiloto/revisao`, {}, { timeoutMs: 60000 });
        if (r.indisponivel) estado.revisao = { ...vazio(), indisponivel: true };
        else {
            const ids = doModelo();
            const valido = (a) => a && ((a.tipo === 'campo' && ids.includes(a.id)) || a.tipo === 'prova' || a.tipo === 'criterio');
            revisao = { resumo: typeof r.resumo === 'string' ? r.resumo : '', pontos: (r.pontos || []).filter((p) => p && valido(p.alvo) && typeof p.o_que_o_auditor_questionaria === 'string') };
            estado.revisao = vazio();
        }
    } catch (e) { estado.revisao = { ...vazio(), erro: e.message }; }
    desenhar();
};
window.bancadaCopilotoIrAo = (tipo, id) => ctx.focarCampo(tipo === 'campo' ? id : tipo === 'prova' ? 'prova' : `criterio:${id}`);
