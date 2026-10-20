import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, formatarData } from '../ui.js';
import { hojeSP } from '../hoje.js';

// Avaliações de fornecedores (n.privacy, spec 2026-10-20): a FILA de reavaliação da rotina de TPRM, sobre a mesma lista de
// `GET /projects/:id/terceiros`. Só agrupa e ordena por urgência (críticos primeiro); a situação e o método vêm do servidor.
// "Abrir" leva à ficha na aba Avaliações. Texto do servidor escapado.

const NIVEIS = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
const TIPOS = { grande_provedor: 'Grande provedor', medio: 'Médio', pequeno: 'Pequeno', critico: 'Crítico' };
const METODOS = { trust_center: 'Trust center', questionario: 'Questionário', auditoria: 'Auditoria' };
const ORDEM_NIVEL = { alto: 0, medio: 1, baixo: 2 };
const GRUPOS = [['vencida', 'Vencidas'], ['vence', 'Vencem em 30 dias'], ['pendente', 'Sem avaliação'], ['reprovada', 'Reprovadas'], ['vigente', 'Em dia']];
const JANELA_DIAS = 30;

const args = (...v) => escapeHTML(JSON.stringify(v));
const lista = (r) => (Array.isArray(r) ? r : []);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const DIA = 86_400_000;

/** Dias de hoje até `valido_ate` (negativo = vencida); null sem avaliação. */
const diasAte = (t) => (t.ultima_avaliacao && t.ultima_avaliacao.valido_ate
    ? Math.round((Date.parse(`${String(t.ultima_avaliacao.valido_ate).slice(0, 10)}T00:00:00Z`) - Date.parse(`${hojeSP()}T00:00:00Z`)) / DIA) : null);

/** O grupo da fila: vigente com validade em até 30 dias vira "vence". */
const grupoDe = (t) => (t.situacao === 'vigente' && (diasAte(t) ?? Infinity) <= JANELA_DIAS ? 'vence' : t.situacao);

const urgencia = (a, b) => (ORDEM_NIVEL[a.nivel] ?? 3) - (ORDEM_NIVEL[b.nivel] ?? 3) || (diasAte(a) ?? -Infinity) - (diasAte(b) ?? -Infinity) || a.nome.localeCompare(b.nome, 'pt-BR');

async function renderAvaliacoesTerceiros(c, h, a) {
    h.textContent = 'Avaliações de fornecedores';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    let terceiros;
    try { terceiros = lista(await api('GET', `/api/v1/projects/${proj.id}/terceiros`)); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as avaliações.', e); return; }
    if (!terceiros.length) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum fornecedor para avaliar',
            texto: 'O tipo do fornecedor define o método de avaliação.',
            acao: `<ul class="av-metodos"><li>Grande provedor: trust center.</li><li>Médio: questionário.</li><li>Pequeno: questionário (enxuto).</li><li>Crítico: auditoria.</li></ul>
                <p><button class="btn" data-action="navigate" data-args='${args('terceiros')}'>Abrir os fornecedores</button></p>` });
        return;
    }
    const porGrupo = Object.fromEntries(GRUPOS.map(([k]) => [k, []]));
    for (const t of terceiros) (porGrupo[grupoDe(t)] || porGrupo.pendente).push(t);
    c.innerHTML = GRUPOS.filter(([k]) => porGrupo[k].length).map(([k, rotulo]) => {
        const linhas = porGrupo[k].sort(urgencia).map((t) => {
            const d = diasAte(t);
            return [`<strong>${escapeHTML(t.nome)}</strong>`, escapeHTML(NIVEIS[t.nivel] || 'Não avaliada'), escapeHTML(TIPOS[t.terceiro_tipo] || '—'),
                escapeHTML(METODOS[t.metodo] || '—'), escapeHTML(t.ultima_avaliacao ? formatarData(t.ultima_avaliacao.valido_ate) : '—'), escapeHTML(d === null ? '—' : String(d)),
                `<button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(proj.id, t.id, 'avaliacoes')}' aria-label="${escapeHTML(`Abrir ${t.nome}`)}">Abrir</button>`];
        });
        return `<section class="av-grupo" id="av-${k}"><h3>${escapeHTML(rotulo)} (${porGrupo[k].length})</h3>${window.renderDataTable(
            ['Fornecedor', 'Criticidade', 'Tipo', 'Método', 'Vale até', 'Dias', 'Ações'], linhas)}</section>`;
    }).join('');
}

window.renderAvaliacoesTerceiros = renderAvaliacoesTerceiros;
