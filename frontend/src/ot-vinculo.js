import { S } from './state.js';
import { api } from './api.js';
import { escapeHTML, showToast } from './ui.js';
import { modulosDaPessoa, modulosDe } from './produto.js';
import { mensagemDeErro, podeEditarOt, lista, opcoes, semRepetir } from './ot-comum.js';

// Bloco "Vínculo com o n.ot" nos detalhes de risco, ação e incidente. Satélite: o núcleo não lê o n.ot. A autorização é do servidor
// (/ot/referencias); aqui o bloco só nasce, e só pede, para quem tem o módulo ot E o projeto o tem. Sem saber os módulos da pessoa: oculto.
const CAMPO = { risk: 'risk_id', acao: 'acao_id', incidente: 'incidente_id' };
const doProjeto = (pid) => (S.projects || []).find((p) => p.id === pid) || S.activeProject;
export const temOtNoProjeto = (pid) => { const meus = modulosDaPessoa(); return !!meus && meus.includes('ot') && modulosDe(doProjeto(pid)).includes('ot'); };

/** O ponto de montagem; vazio (nenhum nó, nenhuma chamada depois) sem o módulo. */
export const vinculoOtHTML = (pid) => (temOtNoProjeto(pid) ? '<div id="ot-vinculo" class="mt-4"></div>' : '');

let alvo = null; // { pid, tipo, id }

async function pintar() {
    const c = document.getElementById('ot-vinculo');
    if (!c || !alvo) return;
    const { pid, tipo, id } = alvo;
    let refs, sites;
    try {
        [refs, sites] = await Promise.all([api('GET', `/api/v1/projects/${pid}/ot/referencias?${CAMPO[tipo]}=${encodeURIComponent(id)}`), api('GET', `/api/v1/projects/${pid}/ot/sites`)]);
    } catch (e) { c.innerHTML = `<p class="org-dica" role="alert">${escapeHTML(mensagemDeErro(e, 'Não foi possível carregar o vínculo com o n.ot.'))}</p>`; return; }
    sites = lista(sites, 'sites');
    const nome = (r) => (sites.find((s) => s.id === r.ot_site_id) || {}).nome || (r.ot_site_id ? 'Site' : r.ot_ativo_id ? 'Ativo' : 'Desvio');
    const edita = podeEditarOt();
    const livres = sites.filter((s) => !lista(refs, 'referencias').some((r) => r.ot_site_id === s.id)); // já vinculados não repetem
    const itens = lista(refs, 'referencias').map((r) => `<li class="d-flex gap-2 items-center">${escapeHTML(nome(r))}${edita && !r.ot_desvio_id ? ` <button class="btn btn-ghost btn-sm" data-action="otRemoverReferencia" data-args='${escapeHTML(JSON.stringify([r.id]))}' aria-label="${escapeHTML(`Remover vínculo com ${nome(r)}`)}">Remover</button>` : ''}</li>`).join('');
    c.innerHTML = `<h4 class="mb-2">Vínculo com o n.ot</h4>${itens ? `<ul class="at-lista">${itens}</ul>` : '<p class="org-dica">Nenhum site do n.ot vinculado.</p>'}
        ${edita && livres.length ? `<div class="d-flex gap-2 items-center"><label class="form-label" for="ot-vinculo-site">Site</label><select class="form-input" id="ot-vinculo-site">${opcoes(livres.map((s) => [s.id, s.nome]))}</select>
        <button class="btn btn-sm" data-action="otAdicionarReferencia">Vincular</button></div>` : ''}`;
}

export function montarVinculoOt(tipo, id, pid) {
    if (!temOtNoProjeto(pid)) return; // sem o módulo, nenhuma chamada a /ot/referencias
    alvo = { pid, tipo, id };
    return pintar();
}

const mudou = (acao, fazer, falha) => semRepetir(acao, async () => {
    try { await fazer(); } catch (e) { if (e?.status !== 404) { showToast(mensagemDeErro(e, falha), 'error'); return; } } // 404: já removida, só atualiza
    await pintar();
});
window.otAdicionarReferencia = () => {
    const site = document.getElementById('ot-vinculo-site')?.value;
    if (!alvo || !site) return;
    const a = alvo; // o alvo de quando o botão foi apertado
    return mudou('otAdicionarReferencia', () => api('POST', `/api/v1/projects/${a.pid}/ot/referencias`, { [CAMPO[a.tipo]]: a.id, ot_site_id: site }), 'Não foi possível criar o vínculo.');
};
window.otRemoverReferencia = (rid) => alvo && mudou('otRemoverReferencia', () => api('DELETE', `/api/v1/projects/${alvo.pid}/ot/referencias/${encodeURIComponent(rid)}`), 'Não foi possível remover o vínculo.');
