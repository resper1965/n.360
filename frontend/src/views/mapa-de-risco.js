import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

// Mapa de risco do n.privacy (F2): matriz 5x5 de probabilidade por impacto sobre os riscos das atividades de tratamento
// (`GET /projects/:id/ropa/riscos-mapa`). O registro é o mesmo da matriz do n.iso; aqui entram só os riscos com atividade.
// Cada célula diz por TEXTO o nível e quantos riscos tem (a cor só reforça). Todo texto vindo do servidor é escapado.

/** Mesma faixa de nível do servidor (`riskLevel`, src/services/riscos-atividade.ts), para os dois módulos dizerem o mesmo. */
export function nivelDaNota(probabilidade, impacto) {
    const s = probabilidade * impacto;
    return s <= 5 ? 'Low' : s <= 12 ? 'Medium' : s <= 20 ? 'High' : 'Critical';
}
export const NIVEIS = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Critical: 'Crítico' };
const COR = { Low: 'var(--success)', Medium: 'var(--info)', High: 'var(--warning)', Critical: 'var(--danger)' };

const args = (...v) => escapeHTML(JSON.stringify(v));
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
let estado = { projeto: null, riscos: [], celula: null, alvo: null };

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
            border:${escolhida ? '2px solid var(--accent)' : '1px solid var(--border)'}; border-left:4px solid ${COR[nivel]}">
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
        `<button class="btn btn-ghost btn-sm" data-action="openLigacoesTratamento" data-args='${args(projectId, r.ropa_id)}'>Abrir a atividade</button>`,
    ]), { emptyState: 'Nenhum risco nesta célula.' });
}

function desenhar() {
    const { alvo, projeto } = estado;
    if (!alvo) return;
    const porNivel = Object.keys(NIVEIS).reverse().map((n) => `${NIVEIS[n]}: ${estado.riscos.filter((r) => r.risk_level === n).length}`).join(' · ');
    let grade = '<div aria-hidden="true"></div>';
    for (let i = 1; i <= 5; i++) grade += `<div style="text-align:center; color:var(--text-dim); font-size:0.8rem">${i}</div>`;
    for (let p = 5; p >= 1; p--) {
        grade += `<div style="display:flex; align-items:center; justify-content:flex-end; padding-right:0.5rem; color:var(--text-dim); font-size:0.8rem">${p}</div>`;
        for (let i = 1; i <= 5; i++) grade += celula(p, i);
    }
    alvo.innerHTML = `<div class="card" style="max-width:640px">
            <div class="card-label">Probabilidade (linhas) por impacto (colunas)</div>
            <p style="color:var(--text-dim); margin:0.25rem 0 0.75rem">${escapeHTML(String(estado.riscos.length))} riscos de atividades de tratamento. ${escapeHTML(porNivel)}.</p>
            <div id="mapa-grade" role="group" aria-label="Matriz de risco" style="display:grid; grid-template-columns:2rem repeat(5, 1fr); gap:4px">${grade}</div>
            <p style="color:var(--text-dim); font-size:0.8rem; margin:0.5rem 0 0">Impacto de 1 a 5 da esquerda para a direita; probabilidade de 5 a 1 de cima para baixo.</p>
        </div>
        <div id="mapa-lista">${listaDaCelula(projeto)}</div>`;
}

async function renderMapaDeRisco(c, h, a) {
    h.textContent = 'Mapa de risco';
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
    estado = { projeto: proj.id, riscos, celula: estado.projeto === proj.id ? estado.celula : null, alvo: c };
    if (!riscos.length) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum risco nas atividades de tratamento',
            texto: 'Registre os riscos de cada atividade nas Ligações do tratamento, na tela de Tratamentos (RoPA).',
            acao: `<button class="btn btn-primary" data-action="navigate" data-args='${args('ropa')}'>Abrir os tratamentos</button>` });
        return;
    }
    desenhar();
}

window.mapaCelula = function (p, i) {
    estado.celula = estado.celula && estado.celula[0] === p && estado.celula[1] === i ? null : [p, i];
    desenhar();
};

window.renderMapaDeRisco = renderMapaDeRisco;
