import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, formatarData } from '../ui.js';
import { montarLista, colunasDe } from '../lista.js';

// LIA do projeto (n.privacy, spec 2026-10-19): `GET /projects/:id/ropa/lias`, as LIAs gravadas e as atividades de legítimo interesse
// ainda sem LIA ("Faltando"). Só leitura; a LIA tem ficha própria (12 perguntas em abas), aberta daqui ou da aba Base Jurídica da atividade. Texto do servidor escapado.

const SITUACOES = [['faltando', 'Faltando'], ['rascunho', 'Rascunho'], ['concluida', 'Concluída']];
const ROTULO = Object.fromEntries(SITUACOES);
const TOM = { faltando: 'danger', rascunho: 'warning', concluida: 'success' };
const CONCLUSAO = { prevalece: 'O legítimo interesse prevalece', nao_prevalece: 'O legítimo interesse não prevalece' };
const args = (...v) => escapeHTML(JSON.stringify(v));
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];

async function renderLia(c, h, a) {
    h.textContent = 'LIA';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    let lias;
    try { lias = (await api('GET', `/api/v1/projects/${proj.id}/ropa/lias`)).lias; } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as LIAs.', e); return; }
    lias = Array.isArray(lias) ? lias : [];
    if (!lias.length) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhuma LIA no projeto',
            texto: 'A LIA é exigida nas atividades com base no legítimo interesse. Ela é feita na aba Base Jurídica de cada atividade.',
            acao: `<button class="btn" data-action="navigate" data-args='${args('ropa')}'>Abrir os tratamentos</button>` });
        return;
    }
    c.innerHTML = '<div id="lia-lista"></div>';
    montarLista(c.querySelector('#lia-lista'), {
        id: 'lia',
        linhas: lias,
        colunas: colunasDe(['Atividade', 'Área', 'Situação', 'Conclusão', 'Concluída em', 'Ações'], (l) => [
            `<strong>${escapeHTML(l.atividade)}</strong>`,
            escapeHTML(l.area || '—'),
            window.renderStatusBadge(ROTULO[l.status] || l.status, TOM[l.status] || 'neutral'),
            escapeHTML(CONCLUSAO[l.conclusao] || '—'),
            formatarData(l.concluida_em),
            `<button class="btn btn-ghost btn-sm" data-action="abrirLia" data-args='${args(proj.id, l.ropa_id)}' aria-label="Abrir a LIA: ${escapeHTML(l.atividade)}">Abrir</button>`
                + ` <button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(proj.id, l.ropa_id, 'base_juridica')}' aria-label="Abrir a atividade: ${escapeHTML(l.atividade)}">Atividade</button>`
                + (l.status !== 'faltando' ? ` <button class="btn btn-ghost btn-sm" data-action="baixarWordLia" data-args='${args(proj.id, l.ropa_id)}' aria-label="Baixar o Word da LIA: ${escapeHTML(l.atividade)}">Word</button>` : ''),
        ]),
        busca: (l) => l.atividade,
        buscaDica: 'Atividade',
        filtros: [{ chave: 'area', rotulo: 'Área', valor: (l) => String(l.area || '').split(', ').filter(Boolean) },
            { chave: 'situacao', rotulo: 'Situação', valor: (l) => l.status, opcoes: SITUACOES }],
    });
}
window.renderLia = renderLia;
