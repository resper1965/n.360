import { api } from '../api.js';
import { showToast, openModal, escapeHTML, renderEmptyState, confirmar, forceCloseModal } from '../ui.js';
import { url, lista, campo, faixaSalvo } from './estado.js';

// Aba Medidas de Segurança: lista (Medida, Status, Descrição) e o modal "+ Medidas de Segurança". O catálogo nasce vazio: o campo Medida
// é texto livre, com sugestões só do que o próprio projeto já usou. No n.iso, a medida pode nascer de um controle implementado.

export const STATUS_MEDIDA = [['ativa', 'Ativa'], ['em_implantacao', 'Em implantação'], ['planejada', 'Planejada']];
const ROTULO_STATUS = Object.fromEntries(STATUS_MEDIDA);

const linha = (m, editavel) => `<li class="at-item" data-id="${escapeHTML(m.id)}">
    <div><p class="at-item-titulo">Medida: ${escapeHTML(m.medida)}</p>
        <p class="at-nota">Status: ${escapeHTML(ROTULO_STATUS[m.status] || m.status)}${m.descricao ? `. ${escapeHTML(m.descricao)}` : ''}</p>
        ${m.controle ? `<p class="at-nota">Ligada ao controle: ${escapeHTML(m.controle.titulo)}.</p>` : ''}
        ${m.controle_deixou_de_estar_implementado ? '<p class="at-nota"><strong>O controle deixou de estar implementado: revise esta medida.</strong></p>' : ''}</div>
    ${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-excluir="${escapeHTML(m.id)}" aria-label="Excluir a medida ${escapeHTML(m.medida)}">Excluir</button>` : ''}</li>`;

export async function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid, editavel, ficha } = ctx;
    let medidas;
    try { medidas = lista(await api('GET', url(pid, rid, '/medidas'))); } catch (e) { painel.innerHTML = renderEmptyState({ titulo: 'Não foi possível carregar as medidas', texto: (e && e.message) || 'Tente de novo em instantes.' }); return; }

    const novo = '<button type="button" class="btn btn-sm" id="at-nova-medida">+ Medidas de Segurança</button>';
    painel.innerHTML = `<div class="at-aba-corpo">${faixaSalvo()}${editavel && medidas.length ? `<div class="at-acoes">${novo}</div>` : ''}
        ${medidas.length ? `<ul class="at-lista-itens" id="at-medidas">${medidas.map((m) => linha(m, editavel)).join('')}</ul>`
            : renderEmptyState({ titulo: 'Nenhuma medida de segurança registrada',
                texto: 'Uma medida de segurança é um controle técnico ou organizacional que protege os dados desta atividade, como controle de acesso, criptografia ou treinamento da equipe.',
                acao: editavel ? '<button type="button" class="btn btn-sm" id="at-nova-medida">Adicionar a primeira medida</button>' : '' })}
    </div>`;

    painel.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmar('Excluir esta medida de segurança?', { rotulo: 'Excluir', perigo: true }))) return;
        try { await api('DELETE', url(pid, rid, `/medidas/${b.dataset.excluir}`)); } catch (e) { showToast((e && e.message) || 'Não foi possível excluir.', 'error'); return; }
        await montar(painel, ctx);
    }));
    const abrir = painel.querySelector('#at-nova-medida');
    if (abrir) abrir.addEventListener('click', () => abrirModal({ pid, rid, ficha, aoGravar: () => montar(painel, ctx) }));
}

async function abrirModal({ pid, rid, ficha, aoGravar }) {
    const comIso = !!(ficha && ficha.modulos && ficha.modulos.iso);
    let sugestoes = []; let controles = [];
    try { sugestoes = lista(await api('GET', url(pid, rid, '/medidas/sugestoes'))); } catch (e) { /* sem sugestões */ }
    if (comIso) { try { controles = lista(await api('GET', url(pid, rid, '/medidas/controles'))); } catch (e) { /* sem controles */ } }
    const nomeDe = (s) => (typeof s === 'string' ? s : s && (s.medida || s.nome)) || '';
    openModal(`<h2 class="modal-title">Medidas de Segurança</h2>
        ${comIso ? `<div class="form-group"><label class="form-label" for="at-m-controle">Ligar a um controle implementado</label>
            <select class="form-input" id="at-m-controle" aria-describedby="at-m-controle-ajuda"><option value="">Não ligar a um controle</option>${controles.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.titulo)}</option>`).join('')}</select>
            <p class="at-ajuda" id="at-m-controle-ajuda">${controles.length ? 'Ao escolher, a medida e o status vêm do controle.' : 'Nenhum controle está implementado neste projeto ainda.'}</p></div>` : ''}
        <div class="form-group"><label class="form-label" for="at-m-medida">Medida (obrigatório)</label>
            <input class="form-input" id="at-m-medida" maxlength="200" list="at-m-sugestoes" autocomplete="off" aria-describedby="at-m-medida-ajuda">
            <datalist id="at-m-sugestoes">${sugestoes.map((s) => `<option value="${escapeHTML(nomeDe(s))}"></option>`).join('')}</datalist>
            <p class="at-ajuda" id="at-m-medida-ajuda">Descreva a medida em poucas palavras${sugestoes.length ? ' ou escolha uma já usada neste projeto' : ''}.</p></div>
        ${campo({ id: 'at-m-status', rotulo: 'Status', obrigatorio: true, tipo: 'select', opcoes: [['', 'Selecione o status'], ...STATUS_MEDIDA], valor: '' })}
        ${campo({ id: 'at-m-descricao', rotulo: 'Descrição', tipo: 'textarea', max: 2000, ajuda: 'Opcional. Explique como a medida funciona na prática.' })}
        <div class="at-acoes"><button type="button" class="btn" data-action="forceCloseModal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="at-m-adicionar" disabled>Adicionar</button></div>`);
    const raiz = document.getElementById('modal-content');
    const medida = raiz.querySelector('#at-m-medida');
    const status = raiz.querySelector('#at-m-status');
    const botao = raiz.querySelector('#at-m-adicionar');
    const ctl = raiz.querySelector('#at-m-controle');
    const atualizar = () => { botao.disabled = !(medida.value.trim() && status.value); };
    medida.addEventListener('input', atualizar);
    status.addEventListener('change', atualizar);
    if (ctl) ctl.addEventListener('change', () => {
        const c = controles.find((x) => x.id === ctl.value);
        medida.disabled = status.disabled = !!c;
        if (c) { medida.value = c.titulo; status.value = 'ativa'; }
        atualizar();
    });
    botao.addEventListener('click', async () => {
        const corpo = { medida: medida.value.trim(), status: status.value };
        const d = raiz.querySelector('#at-m-descricao').value.trim();
        if (d) corpo.descricao = d;
        if (ctl && ctl.value) corpo.controle_id = ctl.value;
        botao.disabled = true;
        try { await api('POST', url(pid, rid, '/medidas'), corpo); } catch (e) { showToast((e && e.message) || 'Não foi possível adicionar a medida.', 'error'); botao.disabled = false; return; }
        forceCloseModal();
        await aoGravar();
    });
}
