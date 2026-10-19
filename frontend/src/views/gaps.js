import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, formatarData } from '../ui.js';
import { STATUS } from '../atividade/aba-gaps.js';

// Gaps do projeto (n.privacy, spec 2026-10-19): a lista do legado, sobre `GET /projects/:id/ropa/gaps` (as ações das atividades,
// o mesmo cadastro da aba Controle de GAPs). Só leitura; os filtros refazem a tabela sem ir ao servidor. Texto do servidor escapado.

const ROTULO_STATUS = Object.fromEntries(STATUS);
const PRAZOS = [['vencido', 'Vencido'], ['7', 'Próximos 7 dias'], ['30', 'Próximos 30 dias'], ['sem_prazo', 'Sem prazo']];
const SEM_RESPONSAVEL = '__sem__';
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const opcoes = (pares) => pares.map(([v, r]) => `<option value="${escapeHTML(v)}">${escapeHTML(r)}</option>`).join('');
const select = (id, rotulo, pares, todos) => `<label class="co-campo"><span class="co-campo-rotulo">${rotulo}</span>
    <select class="form-select" id="${id}" data-action-change="filtrarGaps"><option value="">${todos}</option>${opcoes(pares)}</select></label>`;

/** Dias corridos de hoje até o prazo (AAAA-MM-DD); null sem prazo. */
const diasAte = (prazo) => {
    const d = prazo ? Date.parse(String(prazo).slice(0, 10)) : NaN;
    return Number.isNaN(d) ? null : Math.round((d - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
};
/** Faixa da tela: vencido e "próximos N dias" valem só para gap aberto (concluído com prazo passado não está vencido). */
export function naFaixa(g, faixa) {
    if (!faixa) return true;
    const dias = diasAte(g.prazo);
    if (faixa === 'sem_prazo') return dias === null;
    if (g.status === 'Closed' || dias === null) return false;
    return faixa === 'vencido' ? dias < 0 : dias >= 0 && dias <= Number(faixa);
}

let daLista = null;

async function renderGaps(c, h, a) {
    h.textContent = 'Gaps';
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
    const responsaveis = [...new Set(gaps.map((g) => g.responsavel).filter(Boolean))].sort().map((r) => [r, r]);
    c.innerHTML = `<div class="co-controles">
            ${select('gp-filtro-status', 'Status', STATUS, 'Todos')}
            ${select('gp-filtro-responsavel', 'Responsável', [...responsaveis, [SEM_RESPONSAVEL, 'Sem responsável']], 'Todos')}
            ${select('gp-filtro-prazo', 'Prazo', PRAZOS, 'Todos')}
        </div><div id="gp-lista"></div>`;
    desenhar();
}

function desenhar() {
    const alvo = el('gp-lista');
    if (!daLista || !alvo) return;
    const status = el('gp-filtro-status').value;
    const resp = el('gp-filtro-responsavel').value;
    const prazo = el('gp-filtro-prazo').value;
    const itens = daLista.gaps.filter((g) => (!status || g.status === status)
        && (!resp || (resp === SEM_RESPONSAVEL ? !g.responsavel : g.responsavel === resp)) && naFaixa(g, prazo));
    alvo.innerHTML = window.renderDataTable(['Atividade', 'Gap', 'Recomendação', 'Plano', 'Responsável', 'Prazo', 'Status', 'Anexos', 'Ações'], itens.map((g) => [
        escapeHTML(g.atividade || '—'),
        `<strong>${escapeHTML(g.titulo)}</strong>`,
        escapeHTML(g.recomendacao || '—'),
        escapeHTML(g.plano || '—'),
        escapeHTML(g.responsavel || '—'),
        escapeHTML(formatarData(g.prazo)),
        escapeHTML(ROTULO_STATUS[g.status] || g.status),
        escapeHTML(String(g.anexos ?? 0)),
        `<button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(daLista.projeto, g.ropa_id, 'gaps')}' aria-label="Abrir a atividade: ${escapeHTML(g.atividade || '')}">Abrir</button>`,
    ]), { emptyState: 'Nenhum gap com estes filtros.', emptyHint: 'Limpe os filtros para ver todos.' });
}
window.filtrarGaps = desenhar;
window.renderGaps = renderGaps;
