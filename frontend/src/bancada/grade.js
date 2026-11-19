import { escapeHTML, STATUS_DA_FASE } from '../ui.js';

/**
 * A grade etapa × fase (saiu do Monitor na onda 4): uma linha por etapa do catálogo, um botão por fase com a situação em texto
 * (legenda, rótulo e dica), nunca só em cor. Clicar abre a fase na trilha (`bancadaAbrirFase`). `fases` vem de GET /bancada.
 */
export function htmlDaGrade(catalogo, fases) {
    const porFase = new Map((fases || []).map((f) => [f.numero, f]));
    const tituloDe = (n) => ((catalogo.fases || []).find((x) => x.numero === n) || {}).titulo || `Fase ${n}`;
    const etapas = (catalogo.etapas || []).map((etapa) => {
        const feitas = etapa.fases.filter((n) => (porFase.get(n) || {}).situacao === 'completed').length;
        const nos = etapa.fases.map((n) => {
            const f = porFase.get(n) || { numero: n, situacao: 'pending', bloqueio: null };
            const base = STATUS_DA_FASE[f.situacao] || f.situacao;
            const situacao = f.situacao === 'blocked' && f.bloqueio ? `${base}: ${f.bloqueio.motivo}, responsável ${f.bloqueio.responsavel}` : base;
            return `<button type="button" class="roadmap-node ${escapeHTML(String(f.situacao))}" aria-label="${escapeHTML(`Fase ${n}: ${tituloDe(n)} (${situacao})`)}" data-action="bancadaAbrirFase" data-args='${escapeHTML(JSON.stringify([n]))}'>${n}<span class="tooltip"><strong>Fase ${n}:</strong> ${escapeHTML(tituloDe(n))}<br>Situação: ${escapeHTML(situacao)}</span></button>`;
        }).join('');
        return `<div class="roadmap-j-card"><div class="roadmap-j-header"><div><div class="roadmap-j-name">${escapeHTML(etapa.nome)}</div><div class="roadmap-j-desc">${escapeHTML(etapa.resumo)}</div></div>
            <div class="roadmap-j-pct">${feitas} de ${etapa.fases.length} fases</div></div><div class="roadmap-nodes-row">${nos}</div></div>`;
    }).join('');
    const legenda = `<p class="roadmap-legenda">${Object.entries(STATUS_DA_FASE).map(([k, v]) => `<span><span class="roadmap-amostra ${k}" aria-hidden="true"></span>${escapeHTML(v)}</span>`).join('')}</p>`;
    return `<details class="bancada-grade"><summary>Fases por etapa</summary><div class="roadmap-container">${legenda}<div class="roadmap-grid">${etapas}</div></div></details>`;
}
