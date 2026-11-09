import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, showToast } from '../ui.js';

// Modelos de avaliação de fornecedor (Conta e acessos, n.360; migration 0106, spec 2026-11-09-ciclo-avaliacao-fornecedor-design).
// A consultoria mantém um modelo por tipo: crítico, médio e pequeno são o questionário que vai ao fornecedor; o grande provedor é o
// roteiro de conferência do trust center. Os projetos herdam o modelo vivo. Edita o administrador da consultoria (`pode_editar` vem do
// servidor); o consultor só lê. Texto do servidor escapado.

export const TIPOS_MODELO = [['critico', 'Crítico'], ['medio', 'Médio'], ['pequeno', 'Pequeno'], ['grande_provedor', 'Grande provedor']];
const ORIGEM = { padrao: 'Padrão, a validar', consultoria: 'Da consultoria' };

const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

let estado = { aba: 'critico', dados: null };

function painel(m, editar) {
    const roteiro = m.tipo === 'grande_provedor';
    const prazo = editar
        ? `<div class="d-flex flex-wrap items-end gap-3 mb-4"><div class="form-group"><label class="form-label" for="mf-prazo">Validade máxima da avaliação (meses)</label>
            <input class="form-input" id="mf-prazo" type="number" min="1" max="60" value="${escapeHTML(String(m.prazo_meses))}"></div>
            <button class="btn btn-sm" data-action="salvarPrazoModelo" data-args='${args(m.tipo)}'>Salvar prazo</button></div>`
        : `<p>Validade máxima da avaliação: ${escapeHTML(String(m.prazo_meses))} meses.</p>`;
    const linhas = m.perguntas.map((p) => editar
        ? `<tr data-pergunta="${escapeHTML(p.id)}"><td><input class="form-input" id="mf-ordem-${escapeHTML(p.id)}" type="number" min="0" max="100000" step="10" value="${escapeHTML(String(p.ordem))}" aria-label="${escapeHTML(`Ordem: ${p.texto}`)}"></td>
            <td><input class="form-input" id="mf-tema-${escapeHTML(p.id)}" maxlength="80" value="${escapeHTML(p.tema)}" aria-label="Tema"></td>
            <td><input class="form-input" id="mf-texto-${escapeHTML(p.id)}" maxlength="500" value="${escapeHTML(p.texto)}" aria-label="${roteiro ? 'Item' : 'Pergunta'}"></td>
            <td><input type="checkbox" id="mf-ativa-${escapeHTML(p.id)}" ${p.ativa ? 'checked' : ''} aria-label="Ativa"></td>
            <td>${escapeHTML(ORIGEM[p.origem] || p.origem)}</td>
            <td><button class="btn btn-ghost btn-sm" data-action="salvarPerguntaModelo" data-args='${args(m.tipo, p.id)}' aria-label="${escapeHTML(`Salvar: ${p.texto}`)}">Salvar</button></td></tr>`
        : `<tr><td>${escapeHTML(String(p.ordem))}</td><td>${escapeHTML(p.tema)}</td><td>${escapeHTML(p.texto)}</td><td>${p.ativa ? 'Sim' : 'Não'}</td><td>${escapeHTML(ORIGEM[p.origem] || p.origem)}</td><td></td></tr>`).join('');
    const nova = editar ? `<h4>${roteiro ? 'Novo item' : 'Nova pergunta'}</h4>
        <div class="d-flex flex-wrap items-end gap-3"><div class="form-group"><label class="form-label" for="mf-novo-tema">Tema</label><input class="form-input" id="mf-novo-tema" maxlength="80"></div>
        <div class="form-group"><label class="form-label" for="mf-novo-texto">${roteiro ? 'Item' : 'Pergunta'}</label><input class="form-input" id="mf-novo-texto" maxlength="500"></div>
        <button class="btn btn-sm" data-action="criarPerguntaModelo" data-args='${args(m.tipo)}'>Adicionar</button></div>` : '';
    return `${m.a_validar ? '<p class="t-aviso">Este modelo ainda tem conteúdo padrão, genérico: revise e ajuste antes de usar com os clientes.</p>' : ''}
        <p class="t-dim">${roteiro
        ? 'Roteiro que a equipe confere no trust center do grande provedor. Não vai ao fornecedor.'
        : 'Questionário enviado aos fornecedores deste tipo em todos os projetos da consultoria. Um envio já feito guarda as perguntas da época. Pergunta não se apaga: desmarque "Ativa". A ordem crescente define a sequência.'}</p>
        ${prazo}
        <table class="data-table" id="mf-lista"><thead><tr><th>Ordem</th><th>Tema</th><th>${roteiro ? 'Item' : 'Pergunta'}</th><th>Ativa</th><th>Origem</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        ${nova}`;
}

function desenhar(c) {
    const { dados, aba } = estado;
    const m = dados.modelos.find((x) => x.tipo === aba) || dados.modelos[0];
    c.innerHTML = `<p class="t-dim mb-4">O tipo do fornecedor escolhe o modelo. Cada projeto herda o modelo e pode desligar perguntas ou acrescentar as próprias, em Fornecedores &gt; Questionários.</p>
        <div class="at-abas" role="tablist" aria-label="Tipos de fornecedor">${TIPOS_MODELO.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="mf-aba-${id}" aria-controls="mf-painel" aria-selected="${id === m.tipo}" tabindex="${id === m.tipo ? 0 : -1}"
                data-action="modelosFornecedorAba" data-action-keydown="modelosFornecedorTecla" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" id="mf-painel" aria-labelledby="mf-aba-${m.tipo}" tabindex="0">${painel(m, !!dados.pode_editar)}</div>`;
}

async function carregar() {
    estado.dados = await api('GET', '/api/v1/fornecedor-modelos');
}

window.renderModelosFornecedor = async function (c, h, a) {
    h.textContent = 'Modelos de avaliação de fornecedor';
    a.innerHTML = '';
    try { await carregar(); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os modelos de fornecedor.', e); return; }
    desenhar(c);
};

const redesenhar = async () => {
    try { await carregar(); } catch (e) { falha(e, 'Não foi possível recarregar os modelos'); return; }
    const c = document.getElementById('content');
    if (c) desenhar(c);
};

function irParaAba(tipo) {
    estado.aba = tipo;
    const c = document.getElementById('content');
    if (c && estado.dados) desenhar(c);
    const botao = el(`mf-aba-${tipo}`);
    if (botao) botao.focus();
}
// Clique e teclado passam pela delegação com o evento primeiro (`data-arg-event`); setas, Home e End trocam de aba.
window.modelosFornecedorAba = (_e, tipo) => irParaAba(tipo);
window.modelosFornecedorTecla = function (e, atual) {
    const i = TIPOS_MODELO.findIndex(([x]) => x === atual);
    const n = TIPOS_MODELO.length;
    const proxima = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima === undefined) return;
    e.preventDefault();
    irParaAba(TIPOS_MODELO[proxima][0]);
};

window.salvarPrazoModelo = async function (tipo) {
    const prazo = Number(el('mf-prazo').value);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 60) { showToast('Informe um prazo entre 1 e 60 meses.', 'error'); return; }
    try { await api('PUT', `/api/v1/fornecedor-modelos/${tipo}`, { prazo_meses: prazo }); } catch (e) { falha(e, 'Não foi possível salvar o prazo'); return; }
    showToast('Prazo salvo.', 'success');
    await redesenhar();
};

window.salvarPerguntaModelo = async function (tipo, id) {
    const corpo = { tema: el(`mf-tema-${id}`).value.trim(), texto: el(`mf-texto-${id}`).value.trim(), ativa: el(`mf-ativa-${id}`).checked, ordem: Number(el(`mf-ordem-${id}`).value) };
    if (!corpo.tema || !corpo.texto) { showToast('Informe o tema e o texto.', 'error'); return; }
    if (!Number.isInteger(corpo.ordem) || corpo.ordem < 0 || corpo.ordem > 100000) { showToast('A ordem é um número inteiro de 0 a 100000.', 'error'); return; }
    try { await api('PUT', `/api/v1/fornecedor-modelos/${tipo}/perguntas/${id}`, corpo); } catch (e) { falha(e, 'Não foi possível salvar a pergunta'); return; }
    showToast('Pergunta salva.', 'success');
    await redesenhar();
};

window.criarPerguntaModelo = async function (tipo) {
    const tema = el('mf-novo-tema').value.trim();
    const texto = el('mf-novo-texto').value.trim();
    if (!tema || !texto) { showToast('Informe o tema e o texto.', 'error'); return; }
    try { await api('POST', `/api/v1/fornecedor-modelos/${tipo}/perguntas`, { tema, texto }); } catch (e) { falha(e, 'Não foi possível adicionar a pergunta'); return; }
    showToast('Pergunta adicionada.', 'success');
    await redesenhar();
};

export const _estadoModelos = () => estado;
