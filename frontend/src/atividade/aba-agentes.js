import { api } from '../api.js';
import { escapeHTML, confirmar, showToast } from '../ui.js';
import { url, lista, novoAutosave, gravarAgora, campo, faixaSalvo } from './estado.js';

// Aba Agentes de Tratamento: quem é controlador e operador, a transferência internacional e os operadores e destinatários.
// Transferências e partes usam as rotas e as funções de sempre (tratamento-ligacoes.js); a tela só as mostra aqui.

const PAPEIS_PARTE = { operador: 'Operador', cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Destinatário', responsavel: 'Responsável' };
// O seletor liga só os parceiros escolhidos na etapa Compartilhamento Externo desta atividade (o servidor recusa pessoa nesses papéis).
const PAPEIS_DE_PARCEIRO = ['operador', 'cocontrolador', 'suboperador', 'terceiro'];
const args = (...v) => escapeHTML(JSON.stringify(v));

function blocoTransferencias(pid, rid, lig, partes, editavel, simSelecionado) {
    const transf = lista(lig.transferencias);
    if (!simSelecionado) {
        return transf.length ? `<p class="at-nota" id="at-transf-gravadas">Há ${transf.length} ${transf.length === 1 ? 'transferência registrada' : 'transferências registradas'}. Elas continuam gravadas; marque "Sim" para vê-las e editá-las.</p>` : '';
    }
    const orgs = partes.filter((p) => p.tipo === 'organizacao' || !p.tipo);
    return `<div id="at-transf">
        ${campo({ id: 'at-salvaguarda', rotulo: 'Salvaguarda da transferência', tipo: 'textarea', max: 500, valor: '', travado: !editavel,
            ajuda: 'Como a empresa garante a proteção dos dados enviados ao exterior, por exemplo cláusulas contratuais padrão.' })}
        <h3 class="at-sub">Transferências registradas</h3>
        ${transf.length ? `<ul class="at-lista" id="at-transf-lista">${transf.map((t) => `<li><span>${escapeHTML(t.pais)}${t.destinatario ? `, ${escapeHTML(t.destinatario)}` : ''}${t.mecanismo ? `, ${escapeHTML(t.mecanismo)}` : ''}</span>
            ${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-action="atRemoverTransferencia" data-args='${args(pid, rid, t.id)}' aria-label="Remover a transferência para ${escapeHTML(t.pais)}">Remover</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="at-nota">Nenhuma transferência registrada. Registre o país de destino de cada envio de dados ao exterior.</p>'}
        ${editavel ? `<div class="at-linha-form">
            <div class="form-group"><label class="form-label" for="tl-pais">País</label><input class="form-input" id="tl-pais" maxlength="100"></div>
            <div class="form-group"><label class="form-label" for="tl-dest">Destinatário</label><select class="form-input" id="tl-dest"><option value="">Não informado</option>${orgs.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="tl-mec">Mecanismo</label><input class="form-input" id="tl-mec" maxlength="300"></div>
            <button type="button" class="btn btn-sm" data-action="adicionarTransferenciaTratamento" data-args='${args(pid, rid)}'>Adicionar transferência</button></div>` : ''}
    </div>`;
}

function blocoPartes(pid, rid, lig, parceiros, editavel, parceirosFalhou = false) {
    const ligadas = lista(lig.partes);
    // Dado antigo: pessoa ligada num papel de organização. O servidor não liga mais assim; a parte pode virar organização na ficha dela.
    const pessoas = ligadas.filter((p) => p.tipo === 'pessoa' && PAPEIS_DE_PARCEIRO.includes(p.papel));
    const aviso = pessoas.length ? `<div class="at-nota" id="at-partes-pessoas" role="status">Operador, cocontrolador, suboperador e destinatário são organizações.
        ${pessoas.length === 1 ? 'Esta parte está cadastrada como pessoa' : 'Estas partes estão cadastradas como pessoa'}; abra o cadastro para mudar o tipo para organização:
        <ul>${pessoas.map((p) => `<li>${escapeHTML(p.nome)} <button type="button" class="btn btn-ghost btn-sm" data-action="openParteModal" data-args='${args(pid, p.parte_id)}' aria-label="Abrir o cadastro de ${escapeHTML(p.nome)}">Abrir cadastro</button></li>`).join('')}</ul></div>` : '';
    return `<h3 class="at-sub">Operadores e destinatários</h3>${aviso}
        ${ligadas.length ? `<ul class="at-lista" id="at-partes-lista">${ligadas.map((p) => `<li><span>${escapeHTML(p.nome)}, ${escapeHTML(PAPEIS_PARTE[p.papel] || p.papel)}</span>
            ${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-action="removerParteTratamento" data-args='${args(pid, rid, p.parte_id, p.vinculo_id)}' aria-label="Remover ${escapeHTML(p.nome)}">Remover</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="at-nota">Nenhum parceiro ligado. Ligue aqui as empresas que tratam os dados em nome da sua, ou que os recebem.</p>'}
        ${editavel && parceiros.length ? `<div class="at-linha-form">
            <div class="form-group"><label class="form-label" for="tl-parte">Parceiro</label><select class="form-input" id="tl-parte">${parceiros.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="tl-papel">Papel</label><select class="form-input" id="tl-papel">${PAPEIS_DE_PARCEIRO.map((v) => `<option value="${v}">${PAPEIS_PARTE[v]}</option>`).join('')}</select></div>
            <button type="button" class="btn btn-sm" data-action="adicionarParteTratamento" data-args='${args(pid, rid)}'>Ligar parceiro</button></div>`
            : parceirosFalhou ? '<p class="re-erro" role="alert">Não foi possível carregar os parceiros desta atividade. Abra a aba de novo para tentar outra vez.</p>'
            : (editavel ? '<p class="at-nota">Nenhum parceiro escolhido nesta atividade. Escolha os parceiros na aba Tratamento de Dados, etapa Compartilhamento Externo, para ligá-los aqui.</p>' : '')}`;
}

// Órgãos públicos destinatários (0097): um por linha, com a obrigação legal; o servidor regrava o texto da aprovação.
function blocoOrgaos(r, editavel, falhou) {
    if (falhou) return '<p class="re-erro" role="alert">Não foi possível carregar os órgãos públicos. Abra a aba de novo para tentar outra vez.</p>';
    const orgaos = lista(r.orgaos);
    return `${r.texto_anterior ? `<p class="at-nota" id="at-orgaos-anterior">Registrado antes em texto livre: ${escapeHTML(r.texto_anterior)}. Cadastre cada órgão abaixo; o primeiro cadastro substitui este texto.</p>` : ''}
        ${orgaos.length ? `<ul class="at-lista" id="at-orgaos-lista">${orgaos.map((o) => `<li><span>${escapeHTML(o.nome)}${o.obrigacao_legal ? `, ${escapeHTML(o.obrigacao_legal)}` : ''}</span>
            ${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-orgao-remover="${escapeHTML(o.id)}" aria-label="Remover ${escapeHTML(o.nome)}">Remover</button>` : ''}</li>`).join('')}</ul>`
            : (r.texto_anterior ? '' : '<p class="at-nota">Nenhum órgão público cadastrado.</p>')}
        ${editavel ? `<div class="at-linha-form">
            <div class="form-group"><label class="form-label" for="at-orgao-nome">Órgão</label><input class="form-input" id="at-orgao-nome" maxlength="200"></div>
            <div class="form-group"><label class="form-label" for="at-orgao-obrigacao">Obrigação legal</label><input class="form-input" id="at-orgao-obrigacao" maxlength="500"></div>
            <button type="button" class="btn btn-sm" id="at-orgao-adicionar">Adicionar órgão</button></div>` : ''}`;
}

window.atRemoverTransferencia = async function (pid, rid, id) {
    if (!(await confirmar('Remover esta transferência internacional?', { rotulo: 'Remover', perigo: true }))) return;
    await window.removerTransferenciaTratamento(pid, rid, id);
};

export async function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid, registro = {}, editavel } = ctx;
    let lig = {};
    let partes = [];
    try { lig = (await api('GET', url(pid, rid, '/ligacoes'))) || {}; } catch (e) { /* sem ligações: a aba abre só com os papéis */ }
    let orgaos = {};
    let orgaosFalhou = false;
    try { orgaos = (await api('GET', url(pid, rid, '/orgaos-publicos'))) || {}; } catch (e) { orgaosFalhou = true; }
    let parceiros = [];
    let parceirosFalhou = false;
    if (editavel) {
        // Sem as partes não há como saber quais parceiros valem: avisa como a falha das etapas, nunca "nenhum parceiro".
        try { partes = lista(await api('GET', `/api/v1/projects/${pid}/partes?status=ativa`)); } catch (e) { parceirosFalhou = true; }
        try {
            const etapas = lista((await api('GET', url(pid, rid, '/etapas')))?.etapas);
            // Só organização ativa: a etapa pode ter recebido outra parte pela API, e o servidor recusa pessoa nesses papéis.
            const orgs = new Set(partes.filter((p) => p.tipo === 'organizacao').map((p) => p.id));
            parceiros = lista(etapas.find((e) => e.etapa === 'compartilhamento_externo')?.parceiros).filter((p) => orgs.has(p.id));
        } catch (e) { parceirosFalhou = true; }
    }
    const trava = editavel ? '' : ' disabled';
    const sim = !!registro.international_transfers;
    painel.innerHTML = `<div class="at-aba-corpo">
        ${faixaSalvo()}
        <fieldset class="at-grupo" role="group" aria-labelledby="at-papeis-t"><legend class="at-grupo-titulo" id="at-papeis-t">Responsabilidade pelo tratamento</legend>
            <p class="at-ajuda">Marque os dois papéis se a empresa decide sobre os dados e também trata dados em nome de outra.</p>
            <label class="re-opcao"><input type="checkbox" id="at-controlador"${registro.papel_controlador ? ' checked' : ''}${trava}><span class="re-opcao-texto">Controlador dos Dados</span></label>
            <label class="re-opcao"><input type="checkbox" id="at-operador"${registro.papel_operador ? ' checked' : ''}${trava}><span class="re-opcao-texto">Operador dos Dados</span></label></fieldset>
        <fieldset class="at-grupo" role="radiogroup" aria-labelledby="at-intl-t"><legend class="at-grupo-titulo" id="at-intl-t">Existe transferência internacional dos dados pessoais?</legend>
            <label class="re-opcao"><input type="radio" name="at-intl" value="0"${sim ? '' : ' checked'}${trava}><span class="re-opcao-texto">Não</span></label>
            <label class="re-opcao"><input type="radio" name="at-intl" value="1"${sim ? ' checked' : ''}${trava}><span class="re-opcao-texto">Sim</span></label></fieldset>
        <div id="at-transf-bloco">${blocoTransferencias(pid, rid, lig, partes, editavel, sim)}</div>
        ${blocoPartes(pid, rid, lig, parceiros, editavel, parceirosFalhou)}
        <h3 class="at-sub">Órgãos públicos destinatários</h3>
        <p class="at-ajuda">Órgãos públicos que recebem os dados, em geral para cumprimento de obrigação legal. Os demais destinatários devem ser cadastrados em Parceiros.</p>
        <div id="at-orgaos">${blocoOrgaos(orgaos, editavel, orgaosFalhou)}</div>
    </div>`;
    const status = painel.querySelector('#at-salvo');
    const salv = painel.querySelector('#at-salvaguarda');
    if (salv) salv.value = registro.transfer_safeguards || '';
    if (!editavel) return;

    const papel = (id, campoApi) => painel.querySelector(id).addEventListener('change', (e) => gravarAgora({ pid, rid, rota: '/agentes', corpo: { [campoApi]: e.target.checked }, status }));
    papel('#at-controlador', 'papel_controlador');
    papel('#at-operador', 'papel_operador');
    painel.querySelectorAll('input[name="at-intl"]').forEach((r) => r.addEventListener('change', async (e) => {
        const valor = e.target.value === '1';
        if (!(await gravarAgora({ pid, rid, rota: '/agentes', corpo: { international_transfers: valor }, status }))) return;
        registro.international_transfers = valor ? 1 : 0;
        painel.querySelector('#at-transf-bloco').innerHTML = blocoTransferencias(pid, rid, lig, partes, editavel, valor);
        const s = painel.querySelector('#at-salvaguarda');
        if (s) { s.value = registro.transfer_safeguards || ''; ligarSalvaguarda(s); }
    }));
    const salvo = novoAutosave({ pid, rid, rota: '/agentes', status });
    function ligarSalvaguarda(el) { el.addEventListener('input', () => { registro.transfer_safeguards = el.value; salvo.agendar('transfer_safeguards', el.value); }); }
    if (salv) ligarSalvaguarda(salv);
    const caixaOrgaos = painel.querySelector('#at-orgaos');
    async function recarregarOrgaos() {
        try { orgaos = (await api('GET', url(pid, rid, '/orgaos-publicos'))) || {}; orgaosFalhou = false; } catch (e) { orgaosFalhou = true; }
        caixaOrgaos.innerHTML = blocoOrgaos(orgaos, editavel, orgaosFalhou);
    }
    caixaOrgaos.addEventListener('click', async (e) => {
        const remover = e.target.closest('[data-orgao-remover]');
        if (remover) {
            if (!(await confirmar('Remover este órgão público?', { rotulo: 'Remover', perigo: true }))) return;
            try { await api('DELETE', url(pid, rid, `/orgaos-publicos/${remover.dataset.orgaoRemover}`)); } catch (err) { showToast((err && err.message) || 'Não foi possível remover.', 'error'); return; }
            await recarregarOrgaos();
            return;
        }
        if (!e.target.closest('#at-orgao-adicionar')) return;
        const nome = caixaOrgaos.querySelector('#at-orgao-nome').value.trim();
        if (!nome) { showToast('Informe o nome do órgão.', 'error'); return; }
        if (orgaos.texto_anterior && !(await confirmar('O texto registrado antes será substituído pela lista de órgãos. Continuar?', { rotulo: 'Continuar' }))) return;
        const obrigacao = caixaOrgaos.querySelector('#at-orgao-obrigacao').value.trim();
        try { await api('POST', url(pid, rid, '/orgaos-publicos'), { nome, obrigacao_legal: obrigacao || null }); } catch (err) { showToast((err && err.message) || 'Não foi possível adicionar.', 'error'); return; }
        await recarregarOrgaos();
    });
    painel.addEventListener('focusout', () => { salvo.esvaziar(); });
}
