import { S } from '../state.js';
import { api, baixarArquivo } from '../api.js';
import { showToast, openModal, escapeHTML, confirmar } from '../ui.js';

// Ferramentas que as abas da atividade usam (views/atividade.js e src/atividade/): a LIA (formulário e ações), partes e
// transferências, o RIPD, o Word da LIA, o pedido de aprovação e a importação de planilha. O modal de Ligações saiu (PR3 do
// RoPA em abas): cada bloco vive na aba dele. Toda regra é do servidor; aqui só se mostra e se chama. Texto do servidor é escapado.


/** Quem edita ligações, riscos, ações e a LIA (o servidor decide de novo). */
export const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
// Selo "mudou na origem" (F3): a atividade mudou depois que o RIPD/LIA nasceu dela. Só aviso; nada é invalidado.
export const ORIGEM_MUDOU = 'A atividade mudou depois que esta avaliação nasceu: revise.';
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Depois de gravar: a página da atividade se redesenha; a aba que gravou continua na tela. */
async function atualizar() {
    if (S.view === 'ropa-atividade' || S.view === 'lia-ficha') window.render();
}

async function acao(projectId, ropaId, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await atualizar();
    } catch (e) { falha(e, padrao); }
}

const CONCLUSOES = { prevalece: 'O interesse do controlador prevalece', nao_prevalece: 'Os direitos do titular prevalecem' };
const campoLia = (id, rotulo, valor, travado) => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><textarea class="form-input" id="${id}" rows="2" maxlength="5000" ${travado ? 'disabled' : ''}>${escapeHTML(valor || '')}</textarea></div>`;

/**
 * Formulário da LIA: rascunho salva, concluir exige o conjunto, concluída só reabre. Texto sempre escapado. `primaria` falso tira o
 * destaque do Concluir: na página da atividade a única ação primária é o próximo passo.
 */
export function formularioLia(lia, projectId, ropaId, primaria = true) {
    const travado = !!lia && lia.status === 'concluida';
    return `<div id="tl-lia">
        ${campoLia('tl-lia-fin', 'Finalidade legítima', lia && lia.finalidade_legitima, travado)}
        ${campoLia('tl-lia-nec', 'Necessidade', lia && lia.necessidade, travado)}
        ${campoLia('tl-lia-bal', 'Balanceamento com os direitos do titular', lia && lia.balanceamento, travado)}
        ${campoLia('tl-lia-sal', 'Salvaguardas', lia && lia.salvaguardas, travado)}
        <div class="form-group"><label class="form-label" for="tl-lia-con">Conclusão</label>
            <select class="form-input" id="tl-lia-con" ${travado ? 'disabled' : ''}><option value="">— sem conclusão —</option>${Object.entries(CONCLUSOES).map(([v, r]) =>
                `<option value="${v}" ${lia && lia.conclusao === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
            ${travado ? `<button class="btn btn-sm" data-action="reabrirLiaTratamento" data-args='${args(projectId, ropaId)}'>Reabrir para editar</button>`
                : `<button class="btn btn-sm" data-action="salvarLiaTratamento" data-args='${args(projectId, ropaId, false)}'>Salvar rascunho</button>
                   <button class="btn ${primaria ? 'btn-primary ' : ''}btn-sm" data-action="salvarLiaTratamento" data-args='${args(projectId, ropaId, true)}'>Concluir</button>`}
            ${lia ? `<button class="btn btn-sm" data-action="baixarWordLia" data-args='${args(projectId, ropaId)}'>Baixar Word</button>` : ''}
        </div></div>`;
}

window.pedirAprovacaoTratamento = (projectId, ropaId) => window.abrirPedidoAprovacao(projectId, 'tratamento', ropaId);

// O RIPD nasce da atividade (herda o que já foi informado); 409 = já existia, e a página mostra o existente.
window.criarDpiaDoTratamento = (projectId, ropaId) => acao(projectId, ropaId, async () => {
    try { await api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/dpia`); } catch (e) { if (e.status !== 409) throw e; }
}, 'Não foi possível criar o RIPD', 'RIPD criado como rascunho, já com o que a atividade informa.');

// Word da LIA (F4), pelo caminho autenticado de api.js.
window.baixarWordLia = (projectId, ropaId) => baixarArquivo(`/api/v1/projects/${projectId}/ropa/${ropaId}/lia/docx`)
    .catch((e) => showToast(e.message || 'Não foi possível baixar o Word', 'error'));

window.salvarLiaTratamento = (projectId, ropaId, concluir) => acao(projectId, ropaId, () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`, {
    finalidade_legitima: el('tl-lia-fin').value.trim() || null, necessidade: el('tl-lia-nec').value.trim() || null,
    balanceamento: el('tl-lia-bal').value.trim() || null, salvaguardas: el('tl-lia-sal').value.trim() || null,
    conclusao: el('tl-lia-con').value || null, status: concluir ? 'concluida' : 'rascunho',
}), 'Não foi possível salvar a LIA', concluir ? 'LIA concluída.' : 'LIA salva.');

window.reabrirLiaTratamento = async (projectId, ropaId) => {
    if (!(await confirmar('Confirma a reabertura do formulário?', { titulo: 'Reabrir a LIA', rotulo: 'Reabrir' }))) return;
    return acao(projectId, ropaId,
        () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`, { status: 'rascunho' }), 'Não foi possível reabrir a LIA', 'LIA reaberta.');
};

window.adicionarParteTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('POST', `/api/v1/projects/${projectId}/partes/${el('tl-parte').value}/vinculos`, { papel: el('tl-papel').value, alvo_tipo: 'tratamento', alvo_id: ropaId }),
    'Não foi possível ligar a parte', 'Parte ligada.');

window.removerParteTratamento = (projectId, ropaId, parteId, vinculoId) => acao(projectId, ropaId,
    () => api('DELETE', `/api/v1/projects/${projectId}/partes/${parteId}/vinculos/${vinculoId}`), 'Não foi possível remover a parte', 'Parte removida.');

window.adicionarTransferenciaTratamento = function (projectId, ropaId) {
    const pais = el('tl-pais').value.trim();
    if (!pais) { showToast('Informe o país', 'error'); return; }
    return acao(projectId, ropaId, () => api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/transferencias`, {
        pais, destinatario_parte_id: el('tl-dest').value || null, mecanismo: el('tl-mec').value.trim() || null,
    }), 'Não foi possível registrar a transferência', 'Transferência registrada.');
};

window.removerTransferenciaTratamento = (projectId, ropaId, id) => acao(projectId, ropaId,
    () => api('DELETE', `/api/v1/projects/${projectId}/ropa/${ropaId}/transferencias/${id}`), 'Não foi possível remover a transferência', 'Transferência removida.');

// ─── Importação por planilha (fatia 4.4) ─────────────────────────────────────────────────────────────

const MODELO_CSV = 'finalidade;categorias de dados;titulares;base legal;retencao;destinatarios;transferencia internacional;salvaguardas;dpia requerido;responsavel\n'
    + 'Folha de pagamento;Dados financeiros;Colaboradores;Obrigação legal;5 anos;Contabilidade;nao;;nao;DPO\n';

window.openImportarRopaModal = function (projectId) {
    openModal(`
        <h3>Importar RoPA por planilha</h3>
        <p style="color:var(--text-dim)">Arquivo CSV com cabeçalho. Só a coluna <strong>finalidade</strong> é obrigatória. Os registros entram como rascunho; o que já existe (mesma finalidade) é pulado, então repetir a importação não duplica.</p>
        <div class="form-group"><label class="form-label" for="ri-arquivo">Arquivo CSV</label><input class="form-input" id="ri-arquivo" type="file" accept=".csv,text/csv"></div>
        <div style="display:flex; gap:0.5rem">
            <button class="btn btn-primary btn-sm" data-action="enviarImportacaoRopa" data-args='${args(projectId)}'>Importar</button>
            <button class="btn btn-ghost btn-sm" data-action="baixarModeloRopa">Baixar modelo</button>
        </div>
        <div id="ri-relatorio" style="margin-top:1rem"></div>
    `);
};

window.baixarModeloRopa = function () {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo-ropa.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window.enviarImportacaoRopa = async function (projectId) {
    const arq = el('ri-arquivo').files && el('ri-arquivo').files[0];
    if (!arq) { showToast('Escolha o arquivo CSV', 'error'); return; }
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/ropa/importar`, { csv: await arq.text() }); } catch (e) { falha(e, 'Não foi possível importar a planilha'); return; }
    const recusadas = lista(r.recusadas);
    el('ri-relatorio').innerHTML = `<p><strong>${escapeHTML(String(r.criados))}</strong> criados, <strong>${escapeHTML(String(r.ja_existiam))}</strong> já existiam, <strong>${escapeHTML(String(recusadas.length))}</strong> recusadas.</p>`
        + (recusadas.length ? `<table class="data-table"><thead><tr><th>Linha</th><th>Motivo</th></tr></thead><tbody>${recusadas.map((x) => `<tr><td>${escapeHTML(String(x.linha))}</td><td>${escapeHTML(x.motivo)}</td></tr>`).join('')}</tbody></table>` : '');
    if (r.criados) window.render();
};
