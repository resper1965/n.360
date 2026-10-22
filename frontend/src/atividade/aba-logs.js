import { api } from '../api.js';
import { escapeHTML, formatarData, renderEmptyState, showToast } from '../ui.js';
import { url, lista } from './estado.js';

// Aba Logs ROPA: a trilha da atividade por seção, só leitura, mais recente primeiro. O servidor não devolve texto livre.

const LIMITE = 50;
const cartao = (l) => `<li class="at-log"><p class="at-log-linha">${escapeHTML(l.secao)}: ${escapeHTML(l.evento)}</p>
    <p class="at-nota">Nome: ${escapeHTML(l.nome || '')}</p><p class="at-nota">Data: ${formatarData(l.data, { hora: true })}</p></li>`;

export async function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid } = ctx;
    const buscar = (antes) => api('GET', `${url(pid, rid, '/logs')}?limite=${LIMITE}${antes ? `&antes=${encodeURIComponent(antes)}` : ''}`).then(lista);
    let linhas;
    try { linhas = await buscar(); } catch (e) { painel.innerHTML = renderEmptyState({ titulo: 'Não foi possível carregar os registros', texto: (e && e.message) || 'Tente de novo em instantes.' }); return; }
    if (!linhas.length) { painel.innerHTML = renderEmptyState({ titulo: 'Nenhum registro ainda.', texto: 'Cada alteração feita nas abas desta atividade passa a aparecer aqui.' }); return; }
    painel.innerHTML = `<div class="at-aba-corpo"><ul class="at-lista-itens" id="at-logs">${linhas.map(cartao).join('')}</ul>
        <div class="at-acoes"><button type="button" class="btn btn-sm" id="at-logs-mais"${linhas.length < LIMITE ? ' hidden' : ''}>Carregar mais</button></div></div>`;
    const mais = painel.querySelector('#at-logs-mais');
    mais.addEventListener('click', async () => {
        let outras;
        try { outras = await buscar(linhas[linhas.length - 1].data); } catch (e) { showToast((e && e.message) || 'Não foi possível carregar mais registros.', 'error'); return; }
        linhas = linhas.concat(outras);
        painel.querySelector('#at-logs').insertAdjacentHTML('beforeend', outras.map(cartao).join(''));
        if (outras.length < LIMITE) mais.hidden = true;
    });
}
