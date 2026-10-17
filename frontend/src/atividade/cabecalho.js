import { api } from '../api.js';
import { url, lista, novoAutosave } from './estado.js';
import { showToast, openModal, escapeHTML, pedirTexto, forceCloseModal } from '../ui.js';

// O cabeçalho da atividade (legado: empresa, responsável, áreas, status e descrição, acima das abas). Sem botão "Salvar": a
// descrição grava sozinha; responsável, áreas e nome gravam ao confirmar a própria escolha.

const vazio = '<span class="at-vazio">Não informado</span>';

export function desenharCabecalho(ficha, editavel) {
    const r = ficha.registro;
    const s = ficha.situacao;
    const resp = r.responsavel ? escapeHTML(r.responsavel.nome) : vazio;
    const areas = lista(r.areas).length ? lista(r.areas).map((x) => escapeHTML(x.nome)).join(', ') : vazio;
    const trava = editavel ? '' : ' disabled';
    return `<section class="at-cabecalho" aria-label="Dados da atividade">
        <div class="at-cab-topo"><p class="at-nota">Nome da atividade: <strong>${escapeHTML(r.nome)}</strong></p>
            <button type="button" class="btn btn-sm" id="at-editar-nome" aria-label="Editar o nome da atividade"${trava}>Editar nome</button></div>
        <dl class="at-cab-grade">
            <div><dt>Empresa</dt><dd>${r.empresa ? escapeHTML(r.empresa) : vazio}</dd></div>
            <div><dt>Status</dt><dd><span class="at-selo" id="at-status" data-estado="${escapeHTML(s.codigo)}">${escapeHTML(s.rotulo)}${s.em_nova_revisao ? ', em nova revisão' : ''}</span>
                ${s.aprovacao_desatualizada ? ' <span class="at-selo" data-estado="mudou" id="at-desatualizada">Aprovação desatualizada</span>' : ''}</dd></div>
            <div><dt>Responsável</dt><dd>${resp} <button type="button" class="btn btn-sm" id="at-editar-responsavel" aria-label="Editar o responsável"${trava}>Editar</button></dd></div>
            <div><dt>Áreas</dt><dd>${areas} <button type="button" class="btn btn-sm" id="at-editar-areas" aria-label="Editar as áreas"${trava}>Editar</button></dd></div>
        </dl>
        <div class="form-group"><label class="form-label" for="at-descricao">Descrição da atividade</label>
            <textarea class="form-input" id="at-descricao" rows="4" maxlength="8000" aria-describedby="at-descricao-status"${trava}>${escapeHTML(r.descricao_atividade || '')}</textarea>
            <p class="at-salvo" id="at-descricao-status" role="status"></p></div>
    </section>`;
}

const gravar = (pid, rid, corpo) => api('PUT', url(pid, rid, '/escopo'), corpo);

/** Seletor em modal para responsável (uma pessoa) e áreas (várias): lista do cadastro, ou o vazio que explica, com o "+" ali mesmo. */
async function escolher({ pid, titulo, ajuda, vazioTexto, rotuloNovo, buscar, criar, multiplo, selecionados, aoConfirmar }) {
    let itens;
    try { itens = lista(await buscar()); } catch (e) { showToast((e && e.message) || 'Não foi possível carregar a lista.', 'error'); return; }
    const marcados = new Set(selecionados);
    const tipo = multiplo ? 'checkbox' : 'radio';
    const corpo = () => itens.length
        ? `<fieldset class="at-grupo"><legend class="at-nota">${escapeHTML(ajuda)}</legend>${itens.map((x) => `<label class="re-opcao">
            <input type="${tipo}" name="at-sel" value="${escapeHTML(x.id)}"${marcados.has(x.id) ? ' checked' : ''}><span class="re-opcao-texto">${escapeHTML(x.nome)}</span></label>`).join('')}
            ${multiplo ? '' : `<label class="re-opcao"><input type="radio" name="at-sel" value=""${marcados.size ? '' : ' checked'}><span class="re-opcao-texto">Sem responsável</span></label>`}</fieldset>`
        : `<p class="at-nota" id="at-sel-vazio">${escapeHTML(vazioTexto)}</p>`;
    openModal(`<h2 class="modal-title">${escapeHTML(titulo)}</h2>
        <div id="at-sel-lista">${corpo()}</div>
        <div class="form-group"><label class="form-label" for="at-sel-novo">${escapeHTML(rotuloNovo)}</label>
            <div class="at-acoes"><input class="form-input" id="at-sel-novo" maxlength="120"><button type="button" class="btn btn-sm" id="at-sel-criar">Criar</button></div></div>
        <div class="at-acoes"><button type="button" class="btn" data-action="forceCloseModal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="at-sel-confirmar">Confirmar</button></div>`);
    const raiz = document.getElementById('modal-content');
    const lerMarcados = () => [...raiz.querySelectorAll('input[name="at-sel"]:checked')].map((i) => i.value).filter(Boolean);
    raiz.querySelector('#at-sel-criar').addEventListener('click', async () => {
        const campo = raiz.querySelector('#at-sel-novo');
        const nome = campo.value.trim();
        if (!nome) { showToast('Informe o nome antes de criar.', 'error'); return; }
        try {
            const novo = await criar(nome);
            lerMarcados().forEach((id) => marcados.add(id));
            marcados.add(novo.id);
            itens = lista(await buscar());
            raiz.querySelector('#at-sel-lista').innerHTML = corpo();
            campo.value = '';
        } catch (e) { showToast((e && e.message) || 'Não foi possível criar.', 'error'); }
    });
    raiz.querySelector('#at-sel-confirmar').addEventListener('click', async () => {
        try { await aoConfirmar(lerMarcados()); } catch (e) { showToast((e && e.message) || 'Não foi possível gravar.', 'error'); return; }
        forceCloseModal();
    });
}

/** Liga os controles do cabeçalho. `ctx` = { projectId, ropaId, ficha, editavel, recarregarFicha }. */
export function montarCabecalho(raiz, ctx) {
    const { projectId: pid, ropaId: rid, ficha, editavel, recarregarFicha } = ctx;
    const ligar = (id, fn) => { const b = raiz.querySelector(id); if (b) b.addEventListener('click', fn); };

    const area = raiz.querySelector('#at-descricao');
    if (area && editavel) {
        const salvo = novoAutosave({ pid, rid, status: raiz.querySelector('#at-descricao-status') });
        area.addEventListener('input', () => salvo.agendar('descricao_atividade', area.value));
        area.addEventListener('blur', () => salvo.esvaziar());
    }

    ligar('#at-editar-nome', async () => {
        const nome = await pedirTexto('Nome da atividade', { padrao: ficha.registro.nome, titulo: 'Editar o nome da atividade', rotulo: 'Salvar nome' });
        if (nome === null || !nome || nome === ficha.registro.nome) return;
        try { await gravar(pid, rid, { nome }); } catch (e) { showToast((e && e.message) || 'Não foi possível gravar o nome.', 'error'); return; }
        await recarregarFicha();
    });

    ligar('#at-editar-responsavel', () => escolher({
        pid, titulo: 'Responsável pela atividade', ajuda: 'Escolha a pessoa responsável pela atividade.', multiplo: false,
        vazioTexto: 'Nenhuma pessoa cadastrada neste projeto. Crie a primeira abaixo para indicar o responsável.', rotuloNovo: 'Nova pessoa',
        buscar: async () => lista(await api('GET', `/api/v1/projects/${pid}/partes?tipo=pessoa&status=ativa`)),
        criar: async (nome) => { const r = await api('POST', `/api/v1/projects/${pid}/partes`, { tipo: 'pessoa', nome }); return { id: r.id }; },
        selecionados: ficha.registro.responsavel ? [ficha.registro.responsavel.id] : [],
        aoConfirmar: async (ids) => { await gravar(pid, rid, { owner_parte_id: ids[0] || null }); await recarregarFicha(); },
    }));

    ligar('#at-editar-areas', () => escolher({
        pid, titulo: 'Áreas da atividade', ajuda: 'Marque as áreas da empresa que participam desta atividade.', multiplo: true,
        vazioTexto: 'Nenhuma área cadastrada neste projeto. Uma área é um setor da empresa, como Recursos Humanos. Crie a primeira abaixo.', rotuloNovo: 'Nova área',
        buscar: async () => lista(await api('GET', `/api/v1/projects/${pid}/departamentos`)).filter((d) => d.status !== 'inativa' && d.status !== 'inativo'),
        criar: async (nome) => { const r = await api('POST', `/api/v1/projects/${pid}/departamentos`, { nome }); return { id: r.id }; },
        selecionados: lista(ficha.registro.areas).map((a) => a.id),
        aoConfirmar: async (ids) => { await gravar(pid, rid, { areas_ids: ids }); await recarregarFicha(); },
    }));
}
