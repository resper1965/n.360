import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, showToast } from '../ui.js';

// Questionários de fornecedor do projeto (n.privacy > Fornecedores; migration 0106, spec 2026-11-09-ciclo-avaliacao-fornecedor-design).
// O questionário de cada tipo é o modelo VIVO da consultoria (só leitura aqui, com "Usar neste projeto" para desligar uma pergunta)
// mais as perguntas próprias do projeto. O envio congela o que estiver valendo. A equipe edita; o administrador do cliente só vê.

const TIPOS = [['critico', 'Crítico'], ['medio', 'Médio'], ['pequeno', 'Pequeno']];

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

let estado = { aba: 'medio', dados: null, projeto: null };

function blocoModelo(perguntas, editar) {
    const linhas = perguntas.map((p) => `<tr><td>${escapeHTML(p.tema)}</td><td>${escapeHTML(p.texto)}</td>
        <td>${!p.ativa ? 'Desativada no modelo' : editar
            ? `<input type="checkbox" id="qf-usar-${escapeHTML(p.id)}" ${p.usada ? 'checked' : ''} aria-label="${escapeHTML(`Usar neste projeto: ${p.texto}`)}"
                data-action="usarPerguntaModelo" data-args='${args(p.id)}'>`
            : (p.usada ? 'Sim' : 'Não')}</td></tr>`).join('');
    return `<h3>Do modelo da consultoria</h3>
        <table class="data-table" id="qf-modelo"><thead><tr><th>Tema</th><th>Pergunta</th><th>Usar neste projeto</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function blocoProjeto(perguntas, editar, tipo) {
    const linhas = perguntas.map((p) => editar
        ? `<tr><td><input class="form-input" id="qf-tema-${escapeHTML(p.id)}" maxlength="80" value="${escapeHTML(p.tema)}" aria-label="Tema"></td>
            <td><input class="form-input" id="qf-texto-${escapeHTML(p.id)}" maxlength="500" value="${escapeHTML(p.texto)}" aria-label="Pergunta"></td>
            <td>${p.tipo ? 'Este tipo' : 'Todos os tipos'}</td>
            <td><input type="checkbox" id="qf-ativa-${escapeHTML(p.id)}" ${p.ativa ? 'checked' : ''} aria-label="Ativa"></td>
            <td><button class="btn btn-ghost btn-sm" data-action="salvarPerguntaProjeto" data-args='${args(p.id)}' aria-label="${escapeHTML(`Salvar: ${p.texto}`)}">Salvar</button></td></tr>`
        : `<tr><td>${escapeHTML(p.tema)}</td><td>${escapeHTML(p.texto)}</td><td>${p.tipo ? 'Este tipo' : 'Todos os tipos'}</td><td>${p.ativa ? 'Sim' : 'Não'}</td><td></td></tr>`).join('');
    const nova = editar ? `<h4>Nova pergunta deste projeto</h4>
        <div class="d-flex flex-wrap items-end gap-3"><div class="form-group"><label class="form-label" for="qf-novo-tema">Tema</label><input class="form-input" id="qf-novo-tema" maxlength="80"></div>
        <div class="form-group"><label class="form-label" for="qf-novo-texto">Pergunta</label><input class="form-input" id="qf-novo-texto" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="qf-novo-tipo">Vale para</label><select class="form-input" id="qf-novo-tipo">
            <option value="${escapeHTML(tipo)}">Este tipo</option><option value="">Todos os tipos</option></select></div>
        <button class="btn btn-sm" data-action="criarPerguntaProjeto">Adicionar</button></div>` : '';
    return `<h3>Deste projeto</h3>
        ${perguntas.length ? `<table class="data-table" id="qf-projeto"><thead><tr><th>Tema</th><th>Pergunta</th><th>Vale para</th><th>Ativa</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
        : '<p class="t-dim">Nenhuma pergunta própria do projeto.</p>'}
        ${nova}`;
}

function desenhar(c) {
    const { dados, aba } = estado;
    const editar = podeEditar();
    const doModelo = dados.perguntas.filter((p) => p.fonte === 'modelo');
    const doProjeto = dados.perguntas.filter((p) => p.fonte === 'projeto');
    c.innerHTML = `<p class="t-dim mb-4">O tipo do fornecedor escolhe o questionário. As perguntas do modelo vêm da consultoria e mudam para todos os
        clientes quando ela atualiza o modelo; aqui você só escolhe se usa cada uma neste projeto. Um envio já feito guarda as perguntas da época.
        O grande provedor não recebe questionário: a equipe confere o trust center pelo roteiro, na ficha do fornecedor.</p>
        <div class="at-abas" role="tablist" aria-label="Tipos de fornecedor">${TIPOS.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="qf-aba-${id}" aria-controls="qf-painel" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}"
                data-action="questionariosAba" data-action-keydown="questionariosTecla" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" id="qf-painel" aria-labelledby="qf-aba-${aba}" tabindex="0">
            ${dados.a_validar ? '<p class="t-aviso">O modelo da consultoria para este tipo ainda tem conteúdo padrão, a validar.</p>' : ''}
            <p>Validade máxima da avaliação deste tipo: ${escapeHTML(String(dados.prazo_meses))} meses.</p>
            ${blocoModelo(doModelo, editar)}
            ${blocoProjeto(doProjeto, editar, aba)}
        </div>`;
}

async function carregar() {
    estado.dados = await api('GET', `/api/v1/projects/${estado.projeto}/homologacoes/perguntas?tipo=${estado.aba}`);
}

const redesenhar = async () => {
    try { await carregar(); } catch (e) { falha(e, 'Não foi possível recarregar o questionário'); return; }
    const c = document.getElementById('content');
    if (c) desenhar(c);
};

window.renderQuestionariosFornecedor = async function (c, h, a) {
    h.textContent = 'Questionários';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    estado.projeto = proj.id;
    try { await carregar(); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar o questionário.', e); return; }
    desenhar(c);
};

async function irParaAba(tipo) {
    estado.aba = tipo;
    await redesenhar();
    const botao = el(`qf-aba-${tipo}`);
    if (botao) botao.focus();
}
// Clique e teclado passam pela delegação com o evento primeiro (`data-arg-event`); setas, Home e End trocam de aba.
window.questionariosAba = (_e, tipo) => irParaAba(tipo);
window.questionariosTecla = function (e, atual) {
    const i = TIPOS.findIndex(([x]) => x === atual);
    const n = TIPOS.length;
    const proxima = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima === undefined) return undefined;
    e.preventDefault();
    return irParaAba(TIPOS[proxima][0]);
};

window.usarPerguntaModelo = async function (id) {
    const caixa = el(`qf-usar-${id}`);
    if (!caixa) return;
    try { await api('PUT', `/api/v1/projects/${estado.projeto}/homologacoes/perguntas/modelo/${id}`, { ativa: caixa.checked }); }
    catch (e) { caixa.checked = !caixa.checked; falha(e, 'Não foi possível ajustar a pergunta'); return; }
    showToast(caixa.checked ? 'Pergunta usada neste projeto.' : 'Pergunta fora deste projeto.', 'success');
};

window.salvarPerguntaProjeto = async function (id) {
    const corpo = { tema: el(`qf-tema-${id}`).value.trim(), texto: el(`qf-texto-${id}`).value.trim(), ativa: el(`qf-ativa-${id}`).checked };
    if (!corpo.tema || !corpo.texto) { showToast('Informe o tema e a pergunta.', 'error'); return; }
    try { await api('PUT', `/api/v1/projects/${estado.projeto}/homologacoes/perguntas/${id}`, corpo); } catch (e) { falha(e, 'Não foi possível salvar a pergunta'); return; }
    showToast('Pergunta salva.', 'success');
    await redesenhar();
};

window.criarPerguntaProjeto = async function () {
    const tema = el('qf-novo-tema').value.trim();
    const texto = el('qf-novo-texto').value.trim();
    const tipo = el('qf-novo-tipo').value || null;
    if (!tema || !texto) { showToast('Informe o tema e a pergunta.', 'error'); return; }
    try { await api('POST', `/api/v1/projects/${estado.projeto}/homologacoes/perguntas`, { tema, texto, tipo }); } catch (e) { falha(e, 'Não foi possível adicionar a pergunta'); return; }
    showToast('Pergunta adicionada.', 'success');
    await redesenhar();
};
