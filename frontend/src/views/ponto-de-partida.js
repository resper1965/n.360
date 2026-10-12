import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

// Painel "ponto de partida": o que o outro produto já entregou neste projeto. Só lê /ponto-de-partida (faixa núcleo).
const n = (v) => escapeHTML(String(v ?? 0));

async function renderPontoDePartida(c, projectId, produto) {
    let v;
    try { v = await api('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/ponto-de-partida`); } catch (e) { c.innerHTML = ''; return; }
    const cad = v.cadastro || {};
    const lgpd = (Array.isArray(v.cobertura) ? v.cobertura : []).find((f) => f.fonte === 'lgpd');
    const blocoPrivacy = () => `<p style="margin:0 0 0.5rem">${lgpd ? `Cobertura LGPD: ${n(lgpd.cobertos)} de ${n(lgpd.total)}` : 'Cobertura LGPD: catálogo ainda não carregado'}</p>
            <p style="margin:0;color:var(--text-dim);font-size:0.85rem">Já no cadastro: ${n(cad.tratamentos)} tratamentos, ${n(cad.documentos_vigentes)} documentos vigentes, ${n(cad.evidencias_validas)} evidências válidas, ${n(cad.itens)} itens, ${n(cad.treinamentos_concluidos)} treinamentos concluídos.</p>`;
    const blocoIso = () => {
        const lista = Array.isArray(v.iso_ajudados) ? v.iso_ajudados : [];
        return lista.length
            ? `<h4 style="margin:0 0 0.5rem">A privacidade já adianta estes controles</h4><ul style="margin:0;padding-left:1.2rem">${lista.map((i) =>
                `<li>${escapeHTML(i.referencia)} — ${escapeHTML(i.titulo)} <span style="color:var(--text-dim)">(LGPD/ANPD: ${(i.por || []).map(escapeHTML).join(', ')})</span></li>`).join('')}</ul>`
            : '<p style="margin:0;color:var(--text-dim)">Nenhum controle ISO adiantado pela privacidade ainda. Documentos e evidências ligados à LGPD e mapeamentos validados aparecem aqui.</p>';
    };
    // No início do n.360 aparecem os dois lados; em cada módulo, o que o outro já entregou.
    const corpo = produto === 'privacy' ? blocoPrivacy() : produto === 'n360' ? `${blocoPrivacy()}<div style="margin-top:1rem">${blocoIso()}</div>` : blocoIso();
    c.innerHTML = `<div class="card fade-in" style="margin-bottom:1.5rem;padding:1.25rem">${corpo}</div>`;
}

window.renderPontoDePartida = renderPontoDePartida;
export { renderPontoDePartida };
