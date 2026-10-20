import { S } from '../state.js';
import { api, baixarArquivo } from '../api.js';
import { escapeHTML, formatarData, showToast } from '../ui.js';
import { STATUS, abrirGapDaAtividade } from '../atividade/aba-gaps.js';
import { podeEditar } from './partes.js';

// Gestão de GAPs do projeto (n.privacy, spec 2026-10-19): a lista do legado sobre `GET /projects/:id/ropa/gaps` (as ações das
// atividades, o mesmo cadastro da aba Controle de GAPs). Busca e Status filtram na tela; "Em atraso" é derivado (prazo passado e não
// concluído). O Gap abre o modal "Controle de GAPs" da atividade, pelas rotas dela; a Atividade abre a ficha. Texto do servidor escapado.

const ROTULO_STATUS = Object.fromEntries(STATUS);
const ATRASO = 'atraso';
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Prazo antes de hoje (AAAA-MM-DD) e gap não concluído. */
export const emAtraso = (g) => g.status !== 'Closed' && !!g.prazo && String(g.prazo).slice(0, 10) < new Date().toISOString().slice(0, 10);
const rotuloStatus = (g) => (emAtraso(g) ? 'Em atraso' : ROTULO_STATUS[g.status] || g.status);

let daLista = null;

async function renderGaps(c, h, a) {
    h.textContent = 'Gestão de GAPs';
    a.innerHTML = '';
    daLista = null;
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    let gaps;
    try { gaps = (await api('GET', `/api/v1/projects/${proj.id}/ropa/gaps`)).gaps; } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os gaps.', e); return; }
    gaps = Array.isArray(gaps) ? gaps : [];
    if (!gaps.length) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum gap registrado',
            texto: 'Os gaps nascem na aba Controle de GAPs de cada atividade de tratamento.',
            acao: `<button class="btn" data-action="navigate" data-args='${args('ropa')}'>Abrir os tratamentos</button>` });
        return;
    }
    daLista = { projeto: proj.id, gaps };
    a.innerHTML = '<button class="btn" data-action="exportarGaps">Exportar</button>';
    const opcoes = [...STATUS, [ATRASO, 'Em atraso']].map(([v, r]) => `<option value="${escapeHTML(v)}">${escapeHTML(r)}</option>`).join('');
    const areas = [...new Set(gaps.flatMap((g) => String(g.area || '').split(', ').filter(Boolean)))].sort((x, y) => x.localeCompare(y, 'pt-BR'))
        .map((n) => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    c.innerHTML = `<div class="co-controles">
            <label class="co-campo"><span class="co-campo-rotulo">Buscar</span>
                <input class="form-input" type="search" id="gp-busca" maxlength="120" placeholder="Gap, atividade, área ou responsável" data-action-input="filtrarGaps"></label>
            <label class="co-campo"><span class="co-campo-rotulo">Área</span>
                <select class="form-select" id="gp-filtro-area" data-action-change="filtrarGaps"><option value="">Todas</option>${areas}</select></label>
            <label class="co-campo"><span class="co-campo-rotulo">Status</span>
                <select class="form-select" id="gp-filtro-status" data-action-change="filtrarGaps"><option value="">Todos</option>${opcoes}</select></label>
        </div><div id="gp-lista"></div>`;
    desenhar();
}

function desenhar() {
    const alvo = el('gp-lista');
    if (!daLista || !alvo) return;
    const status = el('gp-filtro-status').value;
    const busca = chave(el('gp-busca').value.trim());
    const area = el('gp-filtro-area').value;
    const ed = podeEditar();
    const itens = daLista.gaps.filter((g) => (!status || (status === ATRASO ? emAtraso(g) : g.status === status))
        && (!area || String(g.area || '').split(', ').includes(area))
        && (!busca || [g.titulo, g.atividade, g.area, g.responsavel].some((t) => chave(t).includes(busca))));
    alvo.innerHTML = window.renderDataTable(['Gap', 'Atividade', 'Área', 'Responsável', 'Prazo', 'Status'], itens.map((g) => [
        ed ? `<button type="button" class="btn btn-ghost btn-sm" data-action="gpAbrir" data-args='${args(g.ropa_id, g.id)}' aria-label="${escapeHTML(`Controle do gap: ${g.titulo}`)}">${escapeHTML(g.titulo)}</button>`
            : `<strong>${escapeHTML(g.titulo)}</strong>`,
        `<button type="button" class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(daLista.projeto, g.ropa_id, 'gaps')}' aria-label="Abrir a atividade: ${escapeHTML(g.atividade || '')}">${escapeHTML(g.atividade || '—')}</button>`,
        escapeHTML(g.area || '—'),
        escapeHTML(g.responsavel || '—'),
        escapeHTML(formatarData(g.prazo)),
        emAtraso(g) ? window.renderStatusBadge('Em atraso', 'danger') : escapeHTML(rotuloStatus(g)),
    ]), { emptyState: 'Nenhum gap com estes filtros.', emptyHint: 'Limpe a busca e os filtros para ver todos.' });
}

window.filtrarGaps = desenhar;
window.renderGaps = renderGaps;

/** Abre o "Controle de GAPs" da atividade; ao gravar, a lista do projeto se refaz. */
window.gpAbrir = async function (ropaId, gapId) {
    if (!daLista) return;
    try { await abrirGapDaAtividade(daLista.projeto, ropaId, gapId, () => (typeof window.render === 'function' ? window.render() : undefined)); }
    catch (e) { showToast((e && e.message) || 'Não foi possível abrir o gap', 'error'); }
};

window.exportarGaps = () => (daLista ? baixarArquivo(`/api/v1/projects/${daLista.projeto}/export/acoes-atividade`)
    .catch((e) => showToast((e && e.message) || 'Não foi possível baixar o arquivo', 'error')) : undefined);
