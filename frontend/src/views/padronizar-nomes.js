import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';

// Padronizar nomes (spec 2026-10-14): o servidor lista antes → depois e recalcula o nome novo ao aplicar;
// aqui só se mostra, se marca e se manda "qual linha e qual nome eu vi". Todo texto vindo do servidor é escapado.

const ROTULO = { partes: 'Parte', departamentos: 'Departamento', itens: 'Ativo/item' };
const args = (...v) => escapeHTML(JSON.stringify(v));
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
// ponytail: as marcadas ficam no DOM (data-pn), não em estado; a lista é refeita do servidor a cada abertura.
let ultima = [];
let ultimasDuplicatas = [];

window.abrirPadronizarNomes = async function (projectId) {
    let r;
    try { r = await api('GET', `/api/v1/projects/${projectId}/padronizar-nomes`); } catch (e) { falha(e, 'Não foi possível listar os nomes'); return; }
    const propostas = Array.isArray(r && r.propostas) ? r.propostas : [];
    const duplicatas = Array.isArray(r && r.duplicatas) ? r.duplicatas : [];
    ultima = propostas;
    ultimasDuplicatas = duplicatas;
    const linhas = propostas.map((p) => `<tr>
        <td><input type="checkbox" data-pn="${escapeHTML(p.id)}" aria-label="Aplicar a ${escapeHTML(p.antes)}" ${p.conflito ? 'disabled' : 'checked'}></td>
        <td>${escapeHTML(ROTULO[p.tabela] || p.tabela)}</td><td>${escapeHTML(p.antes)}</td><td>${escapeHTML(p.depois)}</td>
        <td>${p.conflito ? 'Já existe um igual: una à mão' : ''}</td></tr>`).join('');
    // Parte e item duplicados podem ser mesclados (D5): escolhe-se o que FICA, vê-se a prévia do que muda e confirma-se. Departamento segue à mão.
    const dupLi = (d, i) => `<li>${escapeHTML(ROTULO[d.tabela] || d.tabela)}: ${escapeHTML((d.nomes || []).join(', '))}${Array.isArray(d.registros) && d.registros.length > 1
        ? ` <label>Manter <select class="form-input" id="pn-manter-${i}">${d.registros.map((x) => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.nome)}</option>`).join('')}</select></label>
            <button class="btn btn-ghost btn-sm" data-action="previaMesclar" data-args='${args(projectId, i)}'>Mesclar</button>` : ''}</li>`;
    const dups = duplicatas.length
        ? `<h4 style="margin:1.25rem 0 0.5rem">Possíveis duplicatas</h4><ul>${duplicatas.map(dupLi).join('')}</ul>` : '';
    openModal(`
        <h3>Padronizar nomes</h3>
        ${propostas.length
            ? `<p style="color:var(--text-dim)">Caixa, siglas e abreviaturas comuns. Nada é unido sozinho.</p>
               <table class="data-table"><thead><tr><th></th><th>Tipo</th><th>Antes</th><th>Depois</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
               <button class="btn btn-primary" data-action="aplicarPadronizarNomes" data-args='${args(projectId)}' style="margin-top:1rem">Aplicar selecionados</button>`
            : '<p style="color:var(--text-dim)">Todos os nomes já estão no padrão.</p>'}
        ${dups}
    `, 'modal-large');
};

window.aplicarPadronizarNomes = async function (projectId) {
    const marcadas = new Set([...document.querySelectorAll('input[data-pn]:checked')].map((i) => i.getAttribute('data-pn')));
    const itens = ultima.filter((p) => marcadas.has(p.id)).map((p) => ({ tabela: p.tabela, id: p.id, antes: p.antes }));
    if (!itens.length) { showToast('Marque ao menos um nome', 'error'); return; }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/padronizar-nomes`, { itens });
        const ign = (r.ignorados || []).length;
        showToast(`${r.aplicados} nome(s) padronizado(s)${ign ? `; ${ign} ignorado(s)` : ''}.`, ign ? 'warning' : 'success');
        closeModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível padronizar os nomes'); }
};

window.previaMesclar = async function (projectId, i) {
    const d = ultimasDuplicatas[i];
    const sel = document.getElementById(`pn-manter-${i}`);
    if (!d || !sel) return;
    const manter = sel.value;
    const remover = d.registros.find((x) => x.id !== manter);
    if (!remover) return;
    let p;
    try { p = await api('POST', `/api/v1/projects/${projectId}/mesclar`, { tabela: d.tabela, manter, remover: remover.id }); } catch (e) { falha(e, 'Não foi possível calcular a mesclagem'); return; }
    const efeitos = Array.isArray(p.efeitos) ? p.efeitos : [];
    const avisos = Array.isArray(p.avisos) ? p.avisos : [];
    openModal(`
        <h3>Mesclar ${escapeHTML(ROTULO[d.tabela] || d.tabela)}</h3>
        <p>Fica: <strong>${escapeHTML(p.manter.nome)}</strong>. Sai (fica inativo): <strong>${escapeHTML(p.remover.nome)}</strong>.</p>
        ${efeitos.length ? `<p>O que passa para o que fica:</p><ul>${efeitos.map((e) => `<li>${escapeHTML(e.rotulo)}: ${escapeHTML(String(e.n))}</li>`).join('')}</ul>` : '<p class="t-dim">Nada aponta para o duplicado; ele só é inativado.</p>'}
        ${p.tratamentos ? `<p class="t-dim">${escapeHTML(String(p.tratamentos))} atividade(s) de tratamento mudam; se estavam em aprovação, a aprovação é refeita.</p>` : ''}
        ${avisos.map((a) => `<p class="t-perigo">${escapeHTML(a)}</p>`).join('')}
        <button class="btn btn-primary" data-action="confirmarMesclar" data-args='${args(projectId, d.tabela, manter, remover.id)}'>Confirmar mesclagem</button>
        <button class="btn btn-ghost" data-action="abrirPadronizarNomes" data-args='${args(projectId)}'>Voltar</button>
    `);
};

window.confirmarMesclar = async function (projectId, tabela, manter, remover) {
    try {
        await api('POST', `/api/v1/projects/${projectId}/mesclar`, { tabela, manter, remover, confirmar: true });
        showToast('Cadastros mesclados.', 'success');
        closeModal();
        window.render();
    } catch (e) { falha(e, 'Não foi possível mesclar os cadastros'); }
};
