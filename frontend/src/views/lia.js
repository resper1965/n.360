import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, formatarData } from '../ui.js';

// LIA do projeto (n.privacy, spec 2026-10-19): `GET /projects/:id/ropa/lias`, as LIAs gravadas e as atividades de legítimo interesse
// ainda sem LIA ("Faltando"). Só leitura; a LIA se faz na aba Base Jurídica da atividade. Texto do servidor escapado.

const SITUACOES = [['faltando', 'Faltando'], ['rascunho', 'Rascunho'], ['concluida', 'Concluída']];
const ROTULO = Object.fromEntries(SITUACOES);
const TOM = { faltando: 'danger', rascunho: 'warning', concluida: 'success' };
const CONCLUSAO = { prevalece: 'O legítimo interesse prevalece', nao_prevalece: 'O legítimo interesse não prevalece' };
const args = (...v) => escapeHTML(JSON.stringify(v));
const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const el = (id) => document.getElementById(id);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];

let daLista = null;

async function renderLia(c, h, a) {
    h.textContent = 'LIA';
    a.innerHTML = '';
    daLista = null;
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
    daLista = { projeto: proj.id, lias };
    const areas = [...new Set(lias.flatMap((l) => String(l.area || '').split(', ').filter(Boolean)))].sort((x, y) => x.localeCompare(y, 'pt-BR'))
        .map((n) => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    c.innerHTML = `<div class="co-controles">
            <label class="co-campo"><span class="co-campo-rotulo">Buscar</span><input class="form-input" type="search" id="lia-busca" maxlength="120" placeholder="Atividade" data-action-input="filtrarLias"></label>
            <label class="co-campo"><span class="co-campo-rotulo">Área</span><select class="form-select" id="lia-filtro-area" data-action-change="filtrarLias"><option value="">Todas</option>${areas}</select></label>
            <label class="co-campo"><span class="co-campo-rotulo">Situação</span>
            <select class="form-select" id="lia-filtro-situacao" data-action-change="filtrarLias"><option value="">Todas</option>
            ${SITUACOES.map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label></div><div id="lia-lista"></div>`;
    desenhar();
}

function desenhar() {
    const alvo = el('lia-lista');
    if (!daLista || !alvo) return;
    const sit = el('lia-filtro-situacao').value;
    const busca = chave(el('lia-busca').value.trim());
    const area = el('lia-filtro-area').value;
    const itens = daLista.lias.filter((l) => (!sit || l.status === sit) && (!busca || chave(l.atividade).includes(busca))
        && (!area || String(l.area || '').split(', ').includes(area)));
    alvo.innerHTML = window.renderDataTable(['Atividade', 'Área', 'Situação', 'Conclusão', 'Concluída em', 'Ações'], itens.map((l) => [
        `<strong>${escapeHTML(l.atividade)}</strong>`,
        escapeHTML(l.area || '—'),
        window.renderStatusBadge(ROTULO[l.status] || l.status, TOM[l.status] || 'neutral'),
        escapeHTML(CONCLUSAO[l.conclusao] || '—'),
        escapeHTML(formatarData(l.concluida_em)),
        `<button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(daLista.projeto, l.ropa_id, 'base_juridica')}' aria-label="Abrir a atividade: ${escapeHTML(l.atividade)}">Abrir</button>`
            + (l.status !== 'faltando' ? ` <button class="btn btn-ghost btn-sm" data-action="baixarWordLia" data-args='${args(daLista.projeto, l.ropa_id)}' aria-label="Baixar o Word da LIA: ${escapeHTML(l.atividade)}">Word</button>` : ''),
    ]), { emptyState: 'Nenhuma LIA com este filtro.', emptyHint: 'Limpe o filtro para ver todas.' });
}
window.filtrarLias = desenhar;
window.renderLia = renderLia;
