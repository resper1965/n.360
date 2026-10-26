import { S } from '../state.js';
import { api } from '../api.js';
import { montarLista, colunasDe, consultaDe } from '../lista.js';
import { escapeHTML, formatarData, showToast, tituloDaTela } from '../ui.js';
import { STATUS, abrirGapDaAtividade, emAtraso } from '../atividade/aba-gaps.js';
import { podeEditar } from './partes.js';

// Gestão de GAPs do projeto (n.privacy, spec 2026-10-19): a lista do legado sobre `GET /projects/:id/ropa/gaps` (as ações das
// atividades, o mesmo cadastro da aba Controle de GAPs). Busca, Status, contagem e exportar pelo componente de lista; "Em atraso" é derivado (prazo passado e não
// concluído). O Gap abre o modal "Controle de GAPs" da atividade, pelas rotas dela; a Atividade abre a ficha. Texto do servidor escapado.

const ROTULO_STATUS = Object.fromEntries(STATUS);
const ATRASO = 'atraso';
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];

export { emAtraso };
const rotuloStatus = (g) => (emAtraso(g) ? 'Em atraso' : ROTULO_STATUS[g.status] || g.status);

let daLista = null;

async function renderGaps(c, h, a) {
    h.textContent = tituloDaTela('nav-gaps', 'Gaps');
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
    const ed = podeEditar();
    c.innerHTML = '<div id="gp-lista"></div>';
    montarLista(el('gp-lista'), {
        id: 'gp',
        linhas: gaps,
        colunas: colunasDe(['Gap', 'Atividade', 'Área', 'Responsável', 'Prazo', 'Status'], (g) => [
            ed ? `<button type="button" class="btn btn-ghost btn-sm" data-action="gpAbrir" data-args='${args(g.ropa_id, g.id)}' aria-label="${escapeHTML(`Controle do gap: ${g.titulo}`)}">${escapeHTML(g.titulo)}</button>`
                : `<strong>${escapeHTML(g.titulo)}</strong>`,
            `<button type="button" class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(proj.id, g.ropa_id, 'gaps')}' aria-label="Abrir a atividade: ${escapeHTML(g.atividade || '')}">${escapeHTML(g.atividade || '—')}</button>`,
            escapeHTML(g.area || '—'),
            escapeHTML(g.responsavel || '—'),
            formatarData(g.prazo),
            emAtraso(g) ? window.renderStatusBadge('Em atraso', 'danger') : escapeHTML(rotuloStatus(g)),
        ]),
        busca: (g) => [g.titulo, g.atividade, g.area, g.responsavel].join(' '),
        buscaDica: 'Gap, atividade, área ou responsável',
        // O status é o que a coluna mostra: o gap aberto com prazo vencido está em "Em atraso".
        filtros: [{ chave: 'area', rotulo: 'Área', valor: (g) => String(g.area || '').split(', ').filter(Boolean) },
            { chave: 'status', rotulo: 'Status', valor: (g) => (emAtraso(g) ? ATRASO : g.status), opcoes: [...STATUS, [ATRASO, 'Em atraso']] }],
        // O arquivo sai com a busca e os filtros que a tela mostra (o servidor aplica a mesma regra).
        exportar: { caminho: (e) => `/api/v1/projects/${proj.id}/export/acoes-atividade${consultaDe({ q: e.q, area: e.filtros.area, status: e.filtros.status })}`, rotulo: 'Exportar' },
    });
}

window.renderGaps = renderGaps;

/** Abre o "Controle de GAPs" da atividade; ao gravar, a lista do projeto se refaz. */
window.gpAbrir = async function (ropaId, gapId) {
    if (!daLista) return;
    try { await abrirGapDaAtividade(daLista.projeto, ropaId, gapId, () => (typeof window.render === 'function' ? window.render() : undefined)); }
    catch (e) { showToast((e && e.message) || 'Não foi possível abrir o gap', 'error'); }
};
