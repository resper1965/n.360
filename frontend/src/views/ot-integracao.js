import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, openModal, showToast, confirmar } from '../ui.js';
import { mensagemDeErro, lista, semRepetir } from '../ot-comum.js';
import { apagarAoFechar } from './ot-agente.js';

// n.ot, E4 T5: cartão "Integração ness.OS" na aba Acessos e sondas. Reaproveita as rotas de webhooks do n.360 (src/routes/integrations.ts):
// a lista é de todo membro e nunca traz o segredo; ele sai UMA vez, na criação. Cadastrar, testar e remover são do Gestor ARCiber (org_admin);
// o servidor ainda exige ver o inventário completo para assinar ot.desvio. O teste usa a rota genérica: o corpo não é o do ot.desvio.

const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const ehGestor = () => S.user?.role === 'org_admin';
const temDesvio = (w) => String(w.events || '').split(',').some((e) => e.trim() === 'ot.desvio');

/** HTML do cartão, ou '' se a leitura falhar (a aba segue sem ele). */
export async function cartaoIntegracao(p) {
    let ws;
    try { ws = lista(await api('GET', `/api/v1/projects/${p.id}/webhooks`), 'webhooks').filter(temDesvio); } catch { return ''; }
    const g = ehGestor();
    const acoes = (w) => (g ? `<button class="btn btn-sm" data-action="otTestarWebhook" data-args='${args(w.id)}'>Enviar teste</button>
        <button class="btn btn-sm" data-action="otRemoverWebhook" data-args='${args(w.id)}'>Remover</button>` : '—');
    return `<section class="card mt-6" id="ot-integracao" aria-labelledby="ot-integracao-titulo">
        <h3 id="ot-integracao-titulo">Integração ness.OS</h3>
        <p class="org-header-intro">O n.ot avisa o ness.OS por webhook a cada desvio de rede. Ligue o webhook depois de aprovar a base do site: antes disso não há desvio.</p>
        ${g ? '<div class="d-flex gap-2 items-center mt-3"><button class="btn" data-action="otCadastrarWebhook">Cadastrar webhook do ness.OS</button></div>' : ''}
        ${renderDataTable(['URL', 'Situação', 'Falhas', 'Ações'], ws.map((w) => [
        escapeHTML(w.url), renderStatusBadge(w.status === 'Active' ? 'success' : 'neutral', w.status === 'Active' ? 'Ativo' : 'Inativo'), escapeHTML(String(w.failure_count ?? 0)), acoes(w),
    ]), { emptyMessage: 'Nenhum webhook do ness.OS.', emptyHint: g ? 'Cadastre a URL https:// do ness.OS.' : 'O Gestor ARCiber cadastra o webhook.' })}</section>`;
}

window.otCadastrarWebhook = () => {
    openModal(`<div class="modal-header"><span class="modal-title">Cadastrar webhook do ness.OS</span></div>
        <div class="form-group"><label class="form-label" for="ot-wh-url">URL (https://)</label><input class="form-input" id="ot-wh-url" type="url" placeholder="https://" autofocus></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn" data-action="otSalvarWebhook">Cadastrar</button></div>`);
};

async function salvar() {
    const url = el('ot-wh-url').value.trim();
    if (!/^https:\/\/\S+$/i.test(url)) { showToast('Informe uma URL que comece com https://.', 'error'); return; }
    let r;
    try { r = await api('POST', `/api/v1/projects/${proj().id}/webhooks`, { url, events: 'ot.desvio' }); } catch (e) { falhou(e, 'Não foi possível cadastrar o webhook.'); return; }
    openModal(`<div class="modal-header"><span class="modal-title">Segredo do webhook</span></div>
        <p class="org-dica mb-3"><strong>Guarde agora: ele não aparece de novo.</strong> O ness.OS usa o segredo para conferir a assinatura de cada envio.</p>
        <label class="rotulo-campo" for="ot-wh-segredo">Segredo</label>
        <input class="form-input f-mono" id="ot-wh-segredo" readonly value="${escapeHTML(r.secret)}">
        <div class="acoes-rodape"><button class="btn" data-action="forceCloseModal">Fechar</button></div>`);
    r = null;
    apagarAoFechar();
    window.render();
}
window.otSalvarWebhook = () => semRepetir('otSalvarWebhook', salvar);

window.otTestarWebhook = (id) => semRepetir('otTestarWebhook', async () => {
    try {
        const r = await api('POST', `/api/v1/webhooks/test/${encodeURIComponent(id)}`);
        showToast(`Teste enviado (resposta ${r.status}).`, 'success'); window.render();
    } catch (e) { falhou(e, 'O teste falhou: confira a URL e o destino.'); }
});

window.otRemoverWebhook = (id) => semRepetir('otRemoverWebhook', async () => {
    if (!await confirmar('Remover este webhook? O ness.OS deixa de receber os desvios.', { titulo: 'Remover webhook', rotulo: 'Remover', perigo: true })) return;
    try {
        await api('DELETE', `/api/v1/webhooks/${encodeURIComponent(id)}`);
        showToast('Webhook removido.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível remover o webhook.'); }
});
