import { api } from '../api.js';
import { escapeHTML, confirmar } from '../ui.js';
import { url, lista, novoAutosave, gravarAgora, campo, faixaSalvo } from './estado.js';

// Aba Agentes de Tratamento: quem é controlador e operador, a transferência internacional e os operadores e destinatários.
// Transferências e partes usam as rotas e as funções de sempre (tratamento-ligacoes.js); a tela só as mostra aqui.

const PAPEIS_PARTE = { operador: 'Operador', cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Destinatário', responsavel: 'Responsável' };
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

function blocoPartes(pid, rid, lig, partes, editavel, registro) {
    const ligadas = lista(lig.partes);
    return `<h3 class="at-sub">Operadores e destinatários</h3>
        ${ligadas.length ? `<ul class="at-lista" id="at-partes-lista">${ligadas.map((p) => `<li><span>${escapeHTML(p.nome)}, ${escapeHTML(PAPEIS_PARTE[p.papel] || p.papel)}</span>
            ${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-action="removerParteTratamento" data-args='${args(pid, rid, p.parte_id, p.vinculo_id)}' aria-label="Remover ${escapeHTML(p.nome)}">Remover</button>` : ''}</li>`).join('')}</ul>`
            : '<p class="at-nota">Nenhuma parte ligada. Ligue aqui as empresas que tratam os dados em nome da sua, ou que os recebem.</p>'}
        ${editavel && partes.length ? `<div class="at-linha-form">
            <div class="form-group"><label class="form-label" for="tl-parte">Parte</label><select class="form-input" id="tl-parte">${partes.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="tl-papel">Papel</label><select class="form-input" id="tl-papel">${Object.entries(PAPEIS_PARTE).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <button type="button" class="btn btn-sm" data-action="adicionarParteTratamento" data-args='${args(pid, rid)}'>Ligar parte</button></div>`
            : (editavel ? '<p class="at-nota">Nenhuma parte cadastrada ainda. Cadastre as empresas em Pessoas, áreas e sistemas para ligá-las aqui.</p>' : '')}
        ${campo({ id: 'at-destinatarios', rotulo: 'Outros destinatários (texto livre)', tipo: 'textarea', max: 2000, valor: registro.recipients || '', travado: !editavel,
            ajuda: 'Quem mais recebe os dados e não está cadastrado como parte.' })}`;
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
    if (editavel) { try { partes = lista(await api('GET', `/api/v1/projects/${pid}/partes?status=ativa`)); } catch (e) { /* sem seletor */ } }
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
        ${blocoPartes(pid, rid, lig, partes, editavel, registro)}
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
    // Destinatários em texto: a rota do registro (PUT /api/v1/ropa/:id), que também confere o pedido de aprovação aberto.
    const dest = painel.querySelector('#at-destinatarios');
    const salvoDest = novoAutosave({ pid, rid, caminho: `/api/v1/ropa/${rid}`, status });
    dest.addEventListener('input', () => salvoDest.agendar('recipients', dest.value));
    painel.addEventListener('focusout', () => { salvo.esvaziar(); salvoDest.esvaziar(); });
}
