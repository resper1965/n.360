import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderEmptyState, falhaDeCarga, showToast, confirmar } from '../ui.js';
import { modulosDaPessoa, modulosDe } from '../produto.js';
import { temOtNoProjeto } from '../ot-vinculo.js';
import { podeEditarOt, mensagemDeErro, lista, opcoes, nomeDe, semRepetir } from '../ot-comum.js';

// Fornecedores do n.ot (onda 3, tarefa 8): quem integra, fabrica ou acessa remotamente, sobre o cadastro de terceiros. Satélite de
// /ot/fornecedores: sem o módulo ot (pessoa E projeto) nada é desenhado nem chamado. As perguntas de OT entram no questionário do
// projeto, que é do n.privacy: sem ele, só o aviso e nenhuma chamada à rota de perguntas.
const PAPEIS = { integrador: 'Integrador', fabricante: 'Fabricante', acesso_remoto: 'Acesso remoto' };
const AVISO_PRIVACY = 'Habilite o n.privacy para avaliar fornecedores';
const proj = () => S.activeProject;
const base = () => `/api/v1/projects/${proj().id}/ot/fornecedores`;
export const temPrivacyNoProjeto = (p) => { const meus = modulosDaPessoa(); return !!meus && meus.includes('privacy') && modulosDe(p).includes('privacy'); };
const rotuloFluxo = (f) => [f.protocolo && `${f.protocolo}${f.porta ? `:${f.porta}` : ''}`, f.finalidade].filter(Boolean).join(' · ') || 'Fluxo';

let D = { sites: [], fluxos: [] };

export async function montarFornecedoresOt(c, a, p) {
    a.innerHTML = '';
    if (!temOtNoProjeto(p.id)) { c.innerHTML = ''; return; } // falha fechada: sem o módulo, nem nó nem chamada
    const edita = podeEditarOt();
    let forn, partes = [];
    try {
        const [f, s, fx, pa] = await Promise.all([api('GET', base()), api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/fluxos`),
            edita ? api('GET', `/api/v1/projects/${p.id}/partes?tipo=organizacao&status=ativa`) : []]);
        forn = lista(f, 'fornecedores'); D = { sites: lista(s, 'sites'), fluxos: lista(fx, 'fluxos') }; partes = Array.isArray(pa) ? pa : [];
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os fornecedores do n.ot.', e); return; }
    const privacy = temPrivacyNoProjeto(p);
    const nomeFluxo = (id) => { const f = D.fluxos.find((x) => x.id === id); return f ? rotuloFluxo(f) : '—'; };
    const perguntas = !edita || !forn.length ? '' : privacy
        ? `<button class="btn" data-action="otFornPerguntas" data-args='${escapeHTML(JSON.stringify([forn[0].id]))}'>Gerar perguntas de OT para o projeto</button>`
        : `<p class="org-dica">${AVISO_PRIVACY}</p>`;
    const form = !edita ? '' : `<div class="d-flex gap-2 items-center flex-wrap">
        <label class="form-label" for="ot-forn-parte">Fornecedor</label><select class="form-input" id="ot-forn-parte">${opcoes(partes.map((x) => [x.id, x.nome]))}</select>
        <label class="form-label" for="ot-forn-papel">Papel</label><select class="form-input" id="ot-forn-papel">${opcoes(Object.entries(PAPEIS))}</select>
        <label class="form-label" for="ot-forn-site">Site</label><select class="form-input" id="ot-forn-site">${opcoes([['', '—'], ...D.sites.map((s) => [s.id, s.nome])])}</select>
        <label class="form-label" for="ot-forn-fluxo">Fluxo</label><select class="form-input" id="ot-forn-fluxo">${opcoes([['', '—'], ...D.fluxos.map((f) => [f.id, rotuloFluxo(f)])])}</select>
        <button class="btn btn-primary btn-sm" data-action="otFornVincular">Vincular</button></div>`;
    c.innerHTML = `<p class="org-header-intro">Fornecedores que integram, fabricam ou acessam remotamente o ambiente. O cadastro e a avaliação são os de terceiros; aqui fica o papel, o site e o fluxo.</p>
        ${forn.length ? renderDataTable(['Fornecedor', 'Papel', 'Site', 'Fluxo', ...(edita ? ['Ações'] : [])], forn.map((f) => [
        escapeHTML(f.parte_nome), escapeHTML(PAPEIS[f.papel] || f.papel), escapeHTML(nomeDe(D.sites, f.site_efetivo_id)), escapeHTML(f.ot_fluxo_id ? nomeFluxo(f.ot_fluxo_id) : '—'),
        ...(edita ? [`<button class="btn btn-ghost btn-sm" data-action="otFornRemover" data-args='${escapeHTML(JSON.stringify([f.id]))}' aria-label="${escapeHTML(`Remover ${f.parte_nome}`)}">Remover</button>`] : []),
    ])) : renderEmptyState({ titulo: 'Nenhum fornecedor de OT', texto: edita ? 'Vincule um fornecedor do cadastro de terceiros a um site ou fluxo.' : 'Ainda não há fornecedor vinculado.', compacto: true })}
        ${form}${perguntas}`;
}

const mudou = (acao, fazer, falha, ok) => semRepetir(acao, async () => {
    if (!temOtNoProjeto(proj().id)) return;
    try { await fazer(); if (ok) showToast(ok, 'success'); } catch (e) { if (e?.status !== 404) { showToast(mensagemDeErro(e, falha), 'error'); return; } }
    window.render();
});
window.otFornVincular = () => {
    const v = (id) => document.getElementById(id)?.value || '';
    const corpo = { parte_id: v('ot-forn-parte'), papel: v('ot-forn-papel') };
    if (v('ot-forn-site')) corpo.ot_site_id = v('ot-forn-site');
    if (v('ot-forn-fluxo')) corpo.ot_fluxo_id = v('ot-forn-fluxo');
    if (!corpo.parte_id) return showToast('Escolha o fornecedor.', 'error');
    if (!corpo.ot_site_id && !corpo.ot_fluxo_id) return showToast('Escolha um site ou um fluxo.', 'error');
    return mudou('otFornVincular', () => api('POST', base(), corpo), 'Não foi possível vincular o fornecedor.', 'Fornecedor vinculado.');
};
window.otFornRemover = async (id) => {
    if (!temOtNoProjeto(proj().id) || !await confirmar('Remover este vínculo? O fornecedor continua no cadastro de terceiros.', { titulo: 'Remover vínculo', rotulo: 'Remover', perigo: true })) return;
    return mudou('otFornRemover', () => api('DELETE', `${base()}/${encodeURIComponent(id)}`), 'Não foi possível remover o vínculo.');
};
window.otFornPerguntas = (id) => semRepetir('otFornPerguntas', async () => {
    if (!temOtNoProjeto(proj().id) || !temPrivacyNoProjeto(proj())) return; // sem o n.privacy a rota não é chamada
    try {
        const r = await api('POST', `${base()}/${encodeURIComponent(id)}/perguntas-padrao`);
        showToast(r?.criadas ? 'Perguntas de OT adicionadas ao questionário do projeto.' : 'As perguntas de OT já estão no questionário do projeto.', 'success');
    } catch (e) { showToast(mensagemDeErro(e, 'Não foi possível gerar as perguntas de OT.'), 'error'); }
});
