import { S } from '../state.js';
import { rotuloDe } from '../rotulos.js';
import { api, baixarArquivo } from '../api.js';
import { escapeHTML, showToast, formatarData } from '../ui.js';
import { nivelDaNota } from '../nivel-risco.js';
import { abrirTratarRisco, ESTRATEGIA_ROTULO, tratado } from '../atividade/aba-riscos.js';
import { podeEditar } from './partes.js';
import { montarLista, colunasDe } from '../lista.js';

// Mapa de risco do n.privacy (F2): matriz 5x5 de probabilidade por impacto sobre os riscos das atividades de tratamento
// (`GET /projects/:id/ropa/riscos-mapa`). O registro é o mesmo da matriz do n.iso; aqui entram só os riscos com atividade.
// Cada célula diz por TEXTO o nível e quantos riscos tem (a cor só reforça). Todo texto vindo do servidor é escapado.
// Desde a spec 2026-10-19 a tela é a Gestão de Riscos do legado: a vista em lista é a padrão ("Lista | Mapa"; o mapa fica no
// endereço, `?vista=mapa`), com filtros Motivo, Área, Risco e Status pelo componente de lista e "Tratar Risco" (o modal da aba Riscos da atividade).

// Mesma faixa de nível do servidor, compartilhada com a matriz do n.iso (grc.js).
export { nivelDaNota };
export const NIVEIS = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Critical: 'Crítico' };
// Escala do nível: verde, âmbar claro, âmbar, vermelho. O ciano é da marca (interação e foco), não de nível.
const COR = { Low: 'var(--success)', Medium: 'var(--warning-ink)', High: 'var(--warning)', Critical: 'var(--danger)' };

const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const vistaDoEndereco = () => (new URLSearchParams(window.location.search).get('vista') === 'mapa' ? 'mapa' : 'lista');
let estado = { projeto: null, riscos: [], celula: null, alvo: null, tela: null, partes: null };
// Os status reais do risco, com o rótulo único da tela (rotulos.js).
const STATUS = ['Open', 'Mitigated', 'Accepted', 'Closed'].map((v) => [v, rotuloDe('', v)]);
const areasDe = (r) => String(r.area || '').split(', ').filter(Boolean);

const plural = (n) => `${n} ${n === 1 ? 'risco' : 'riscos'}`;
const rotuloNivel = (n) => escapeHTML(NIVEIS[n] || n || '—');

function celula(p, i) {
    const lista = estado.riscos.filter((r) => r.probability === p && r.impact === i);
    const nivel = nivelDaNota(p, i);
    const escolhida = estado.celula && estado.celula[0] === p && estado.celula[1] === i;
    const rotulo = `Probabilidade ${p}, impacto ${i}: nível ${NIVEIS[nivel]}, ${plural(lista.length)}`;
    return `<button type="button" class="btn mapa-celula" data-action="mapaCelula" data-args='${args(p, i)}' aria-pressed="${escolhida ? 'true' : 'false'}"
        aria-label="${escapeHTML(rotulo)}" title="${escapeHTML(rotulo)}"
        style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:64px; border-radius:0; background:var(--surface-2);
            border:${escolhida ? '2px solid var(--accent)' : '1px solid var(--border)'}; border-top:3px solid ${COR[nivel]}">
        <strong style="font-size:1.1rem">${lista.length}</strong> <span style="font-size:0.75rem; color:var(--text-dim)">${NIVEIS[nivel]}</span></button>`;
}

function listaDaCelula(projectId) {
    if (!estado.celula) return '<p style="color:var(--text-dim)">Escolha uma célula para ver os riscos dela.</p>';
    const [p, i] = estado.celula;
    const lista = estado.riscos.filter((r) => r.probability === p && r.impact === i);
    const titulo = `<h3 style="margin:1.5rem 0 0.5rem">Probabilidade ${p}, impacto ${i}: ${plural(lista.length)}</h3>`;
    return titulo + window.renderDataTable(['Ameaça', 'Atividade', 'Nível', 'Residual', 'Ações'], lista.map((r) => [
        escapeHTML(r.threat),
        escapeHTML(r.atividade || '—'),
        rotuloNivel(r.risk_level),
        r.residual_level ? rotuloNivel(r.residual_level) : '—',
        `<button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(projectId, r.ropa_id, 'riscos')}'>Abrir a atividade</button>`,
    ]), { emptyState: 'Nenhum risco nesta célula.' });
}

const alternador = (vista) => `<div class="co-controles" role="group" aria-label="Vista">${[['lista', 'Lista'], ['mapa', 'Mapa']].map(([v, r]) =>
    `<button type="button" class="btn btn-sm" data-action="mapaVista" data-args='${args(v)}' aria-pressed="${vista === v}">${r}</button>`).join('')}</div>`;

const distintos = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((x) => [x, x]);

/** A vista Lista: o componente de lista, com os filtros Motivo, Área, Risco e Status e o CSV de todos os riscos das atividades. */
function montarVistaLista(alvo) {
    const r = estado.riscos;
    const ed = podeEditar();
    montarLista(alvo, {
        id: 'mr',
        linhas: r,
        colunas: colunasDe(['Atividade', 'Motivo', 'Risco', 'Estratégia', 'Responsável', 'Prazo', 'Status', 'Ações'], (x) => [
            escapeHTML(x.atividade || '—'),
            `<strong>${escapeHTML(x.threat)}</strong>`,
            rotuloNivel(x.risk_level),
            tratado({ ...x, treatment_due_date: x.prazo }) ? escapeHTML(ESTRATEGIA_ROTULO[x.treatment] || x.treatment || '—') : '—',
            escapeHTML(x.responsavel || '—'),
            formatarData(x.prazo),
            escapeHTML(rotuloDe('', x.status)),
            `<div class="acoes-linha">${ed ? `<button class="btn btn-sm" data-action="mapaTratar" data-args='${args(x.id)}' aria-label="${escapeHTML(`Tratar Risco: ${x.threat}`)}">Tratar Risco</button>` : ''}
                <button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(estado.projeto, x.ropa_id, 'riscos')}' aria-label="Abrir a atividade: ${escapeHTML(x.atividade || '')}">Abrir</button></div>`,
        ]),
        filtros: [
            { chave: 'motivo', rotulo: 'Motivo', valor: (x) => x.threat, opcoes: distintos(r.map((x) => x.threat)) },
            // Um risco pode ser de mais de uma área ("RH, Jurídico"): entra em cada uma.
            { chave: 'area', rotulo: 'Área', valor: areasDe, opcoes: distintos(r.flatMap(areasDe)) },
            { chave: 'nivel', rotulo: 'Risco', valor: (x) => x.risk_level, opcoes: Object.entries(NIVEIS) },
            { chave: 'status', rotulo: 'Status', valor: (x) => x.status, opcoes: STATUS },
        ],
        exportar: { caminho: `/api/v1/projects/${estado.projeto}/export/riscos-atividade` },
    });
}

function desenhar() {
    const { alvo, projeto, tela } = estado;
    if (!alvo) return;
    const lista = vistaDoEndereco() === 'lista';
    // Na lista o CSV é do componente; no mapa fica no cabeçalho e exporta o que a tela mostra (com célula escolhida, só ela).
    if (tela) tela[2].innerHTML = lista ? '' : '<button class="btn" data-action="exportarCsvRiscos">Exportar CSV</button>';
    if (lista) {
        alvo.innerHTML = `${alternador('lista')}<div id="mapa-lista"></div>`;
        montarVistaLista(el('mapa-lista'));
        return;
    }
    const porNivel = Object.keys(NIVEIS).reverse().map((n) => `${NIVEIS[n]}: ${estado.riscos.filter((r) => r.risk_level === n).length}`).join(' · ');
    let grade = '<div aria-hidden="true"></div>';
    for (let i = 1; i <= 5; i++) grade += `<div style="text-align:center; color:var(--text-dim); font-size:0.8rem">${i}</div>`;
    for (let p = 5; p >= 1; p--) {
        grade += `<div style="display:flex; align-items:center; justify-content:flex-end; padding-right:0.5rem; color:var(--text-dim); font-size:0.8rem">${p}</div>`;
        for (let i = 1; i <= 5; i++) grade += celula(p, i);
    }
    alvo.innerHTML = `${alternador('mapa')}<div class="card" style="max-width:640px">
            <div class="card-label">Probabilidade (linhas) por impacto (colunas)</div>
            <p style="color:var(--text-dim); margin:0.25rem 0 0.75rem">${escapeHTML(String(estado.riscos.length))} riscos de atividades de tratamento. ${escapeHTML(porNivel)}.</p>
            <div id="mapa-grade" role="group" aria-label="Matriz de risco" style="display:grid; grid-template-columns:2rem repeat(5, 1fr); gap:4px">${grade}</div>
            <p style="color:var(--text-dim); font-size:0.8rem; margin:0.5rem 0 0">Impacto de 1 a 5 da esquerda para a direita; probabilidade de 5 a 1 de cima para baixo.</p>
        </div>
        <div id="mapa-lista">${listaDaCelula(projeto)}</div>`;
}

async function renderMapaDeRisco(c, h, a) {
    h.textContent = 'Gestão de Riscos';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    let riscos = [];
    try { riscos = (await api('GET', `/api/v1/projects/${proj.id}/ropa/riscos-mapa`)).riscos; } catch (e) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível montar o mapa de risco', texto: 'Tente de novo em instantes.' });
        return;
    }
    // Só risco com atividade: o que é só do n.iso fica na matriz dele.
    riscos = (Array.isArray(riscos) ? riscos : []).filter((r) => r && r.ropa_id);
    estado = { projeto: proj.id, riscos, celula: estado.projeto === proj.id ? estado.celula : null, alvo: c, tela: [c, h, a], partes: estado.projeto === proj.id ? estado.partes : null };
    if (!riscos.length) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum risco nas atividades de tratamento',
            texto: 'Registre os riscos de cada atividade nas Ligações do tratamento, na tela de Tratamentos (RoPA).',
            acao: `<button class="btn btn-primary" data-action="navigate" data-args='${args('ropa')}'>Abrir os tratamentos</button>` });
        return;
    }
    desenhar();
}

window.exportarCsvRiscos = function () {
    const q = estado.celula ? `?probabilidade=${estado.celula[0]}&impacto=${estado.celula[1]}` : '';
    return baixarArquivo(`/api/v1/projects/${estado.projeto}/export/riscos-atividade${q}`)
        .catch((e) => showToast(e.message || 'Não foi possível baixar o arquivo', 'error'));
};

/** "Lista | Mapa": `replaceState`, recarregar volta à mesma vista. */
window.mapaVista = function (vista) {
    const u = new URL(window.location.href);
    if (vista === 'mapa') u.searchParams.set('vista', 'mapa'); else u.searchParams.delete('vista');
    window.history.replaceState(null, '', u);
    desenhar();
};

/** "Tratar Risco": o modal da aba Riscos da atividade, com o risco da linha; ao gravar, a lista se refaz. */
window.mapaTratar = async function (id) {
    const r = estado.riscos.find((x) => x.id === id);
    if (!r) return;
    if (!estado.partes) {
        try { const p = await api('GET', `/api/v1/projects/${estado.projeto}/partes`); estado.partes = Array.isArray(p) ? p : []; }
        catch (e) { showToast((e && e.message) || 'Não foi possível carregar as pessoas', 'error'); return; }
    }
    abrirTratarRisco({ projectId: estado.projeto, partes: estado.partes, aoGravar: () => renderMapaDeRisco(...estado.tela), risco: {
        ...r, vulnerability: r.vulnerabilidade, treatment_plan: r.plano, treatment_due_date: r.prazo } });
};

window.mapaCelula = function (p, i) {
    estado.celula = estado.celula && estado.celula[0] === p && estado.celula[1] === i ? null : [p, i];
    desenhar();
};

window.renderMapaDeRisco = renderMapaDeRisco;
