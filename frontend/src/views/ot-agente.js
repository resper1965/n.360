import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, openModal, forceCloseModal, showToast, confirmar, formatarData } from '../ui.js';
import { mensagemDeErro, lista, semRepetir } from '../ot-comum.js';

// n.ot, L5 (plano 2026-11-04): o cartão "Agente de coleta" na aba Acessos e agente, sobre /ot/agente* (src/routes/ot.ts). Ligar é do
// Gestor ARCiber (pode_ligar); emitir e revogar, de quem vê o inventário completo (pode_emitir). A chave em claro vive só no modal
// que a mostra: nunca em variável de módulo, S ou storage, e o modal é esvaziado ao fechar.

const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const AVISO = 'Os arquivos passam pelo modelo do agente antes de chegar ao n.ot, sem a máscara do n.ot.';
const SITUACAO = { Active: ['success', 'Ativa'], Revoked: ['neutral', 'Revogada'], Vencida: ['warning', 'Vencida'] };

let ligado = false; // o estado que o interruptor mostra; o servidor é quem decide
let endpoint = ''; // do GET /agente (o POST não o devolve); não é segredo

/** HTML do cartão, ou '' para quem não liga nem emite (ou se a leitura falhar: a aba segue sem ele). */
export async function cartaoAgente(p) {
    let ag;
    try { ag = await api('GET', `/api/v1/projects/${p.id}/ot/agente`); } catch { return ''; }
    if (!ag || !(ag.pode_ligar || ag.pode_emitir)) return '';
    ligado = ag.ligado === true;
    endpoint = String(ag.endpoint || '');
    const estado = ligado ? 'Ligado' : 'Desligado';
    const interruptor = ag.pode_ligar
        ? `<button type="button" role="switch" class="btn btn-sm" aria-checked="${ligado}" aria-label="Agente de coleta" data-action="otAlternarAgente">${estado}</button>`
        : `${renderStatusBadge(ligado ? 'success' : 'neutral', estado)} <span class="org-dica">Só o Gestor ARCiber liga ou desliga.</span>`;
    let chaves = '';
    if (ag.pode_emitir) {
        let ks = [];
        try { ks = lista(await api('GET', `/api/v1/projects/${p.id}/ot/agente/chaves`), 'chaves'); } catch { /* sem a lista, o cartão segue com o estado */ }
        chaves = `<div class="d-flex gap-2 items-center mt-3"><h4>Chaves</h4>${ligado ? '<button class="btn btn-sm btn-primary" data-action="otEmitirChaveAgente">Emitir chave</button>' : ''}</div>
            ${renderDataTable(['Nome', 'Validade', 'Último uso', 'Situação', 'Ações'], ks.map((k) => [
            escapeHTML(k.nome), escapeHTML(formatarData(k.expira_em)), escapeHTML(k.ultimo_uso ? formatarData(k.ultimo_uso, { hora: true }) : 'Nunca'),
            renderStatusBadge(...(SITUACAO[k.status] || ['neutral', k.status || '—'])),
            k.status === 'Active' ? `<button class="btn btn-sm" data-action="otRevogarChaveAgente" data-args='${args(k.id)}' aria-label="${escapeHTML(`Revogar ${k.nome}`)}">Revogar</button>` : '—',
        ]), { emptyMessage: 'Nenhuma chave emitida.', emptyHint: ligado ? 'Emita uma chave para o agente de quem faz a coleta.' : 'Ligue o agente para emitir chaves.' })}`;
    }
    return `<section class="card mt-6" id="ot-agente" aria-labelledby="ot-agente-titulo">
        <h3 id="ot-agente-titulo">Agente de coleta</h3>
        <p class="org-header-intro">Um agente externo (Claude Code, Cursor) lê os arquivos na sua máquina e grava achados em rascunho aqui. Ele não lê o inventário e não envia para aprovação. <strong>${AVISO}</strong></p>
        <div class="d-flex gap-2 items-center mt-3">${interruptor}</div>${chaves}</section>`;
}

async function alternar() {
    const novo = !ligado;
    if (novo && !await confirmar(AVISO, { titulo: 'Ligar o agente de coleta', rotulo: 'Ligar' })) return;
    try {
        await api('PUT', `/api/v1/projects/${proj().id}/ot/agente`, { ligado: novo });
        showToast(novo ? 'Agente de coleta ligado.' : 'Agente de coleta desligado.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível alterar o agente de coleta.'); }
}
window.otAlternarAgente = () => semRepetir('otAlternarAgente', alternar);

window.otEmitirChaveAgente = () => {
    openModal(`<div class="modal-header"><span class="modal-title">Emitir chave do agente</span></div>
        <div class="form-group"><label class="form-label" for="ot-ag-nome">Nome</label><input class="form-input" id="ot-ag-nome" maxlength="100" placeholder="Ex.: notebook da coleta" autofocus></div>
        <div class="form-group"><label class="form-label" for="ot-ag-dias">Validade (dias)</label><input class="form-input" id="ot-ag-dias" type="number" min="1" max="30" value="7">
        <p class="org-dica">De 1 a 30 dias.</p></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarChaveAgente">Emitir</button></div>`);
};

async function emitir() {
    const nome = el('ot-ag-nome').value.trim();
    const dias = Number(el('ot-ag-dias').value);
    if (!nome) { showToast('Dê um nome à chave.', 'error'); return; }
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) { showToast('A validade vai de 1 a 30 dias.', 'error'); return; }
    let r;
    try { r = await api('POST', `/api/v1/projects/${proj().id}/ot/agente/chaves`, { nome, dias }); } catch (e) { falhou(e, 'Não foi possível emitir a chave.'); return; }
    const cmd = `claude mcp add --transport http n-ot-coleta ${endpoint} --header "Authorization: Bearer ${r.chave}"`;
    openModal(`<div class="modal-header"><span class="modal-title">Chave do agente</span></div>
        <p class="org-dica mb-3"><strong>Guarde agora: ela não aparece de novo.</strong> Vale até ${escapeHTML(formatarData(r.expira_em))}.</p>
        <label class="rotulo-campo" for="ot-ag-chave">Chave</label>
        <div class="ca-bloco"><input class="form-input f-mono" id="ot-ag-chave" readonly value="${escapeHTML(r.chave)}">
        <button class="btn" data-action="otCopiarChaveAgente">Copiar</button></div>
        <div class="rotulo-campo mt-3">Endpoint</div><p class="valor-campo f-mono">${escapeHTML(endpoint)}</p>
        <div class="rotulo-campo mt-3">Claude Code</div><pre class="ca-pre">${escapeHTML(cmd)}</pre>
        <div class="acoes-rodape"><button class="btn btn-primary" data-action="forceCloseModal">Fechar</button></div>`);
    r = null;
    apagarAoFechar();
    window.render();
}
window.otSalvarChaveAgente = () => semRepetir('otSalvarChaveAgente', emitir);

/** Fechar o modal por qualquer caminho (Fechar, Esc, fundo) apaga a chave do DOM. */
export function apagarAoFechar() {
    const ov = el('modal-overlay');
    const obs = new MutationObserver(() => {
        if (ov.classList.contains('open')) return;
        obs.disconnect();
        el('modal-content').innerHTML = '';
    });
    obs.observe(ov, { attributes: true, attributeFilter: ['class'] });
}

window.otCopiarChaveAgente = async () => {
    const campo = el('ot-ag-chave');
    if (!campo) return;
    try { await navigator.clipboard.writeText(campo.value); showToast('Chave copiada.', 'success'); } catch { campo.select(); showToast('Selecione a chave e copie com Ctrl+C.'); }
};

window.otRevogarChaveAgente = (id) => semRepetir('otRevogarChaveAgente', async () => {
    if (!await confirmar('Revogar esta chave? O agente que a usa deixa de gravar achados.', { titulo: 'Revogar chave', rotulo: 'Revogar', perigo: true })) return;
    try {
        await api('DELETE', `/api/v1/projects/${proj().id}/ot/agente/chaves/${encodeURIComponent(id)}`);
        showToast('Chave revogada.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível revogar a chave.'); }
});
