import { openModal, forceCloseModal, escapeHTML, renderEmptyState, showToast } from '../ui.js';
import { chave, formularioDeCriacao, TIPOS } from './catalogo-inline.js';

// Seletor GENÉRICO da aba Tratamento de Dados (um componente, cinco usos: ativos, áreas, parceiros, titulares e dados).
// Lista com busca (sem acento nem caixa), "Selecionar todos" (só o que está livre), Visualização de 1, 2 ou 3 colunas, itens já
// usados nesta etapa travados (texto, não só cor), "+ Criar" dentro do próprio modal e o rodapé Fechar / Gravar.
// Opções: titulo, ajuda, itens [{ id, nome, sensivel?, travado?, motivo? }], selecionados [ids], tipo (catálogo, para criar),
// pid, criarRotulo, buscaRotulo, todos (false esconde "Selecionar todos"), colunas (false esconde a Visualização), antes (html),
// extra (html no rodapé), vazio { titulo, texto }, pronto(sel, raiz), bloqueadoPor(raiz), aoMudar(controle), aoGravar(ids, raiz),
// rotuloGravar. Devolve { definir(ids), atualizar() }.

export function abrirSelecao(o) {
    const estado = { itens: o.itens.map((x) => ({ ...x })), sel: new Set(o.selecionados || []), colunas: 3, filtro: '' };
    estado.itens.filter((i) => i.travado).forEach((i) => estado.sel.add(i.id));
    const criarRotulo = o.criarRotulo || (o.tipo ? `+ Criar ${TIPOS[o.tipo].singular}` : '');

    openModal(`<h2 class="modal-title">${escapeHTML(o.titulo)}</h2>
        ${o.ajuda ? `<p class="at-ajuda">${escapeHTML(o.ajuda)}</p>` : ''}
        ${o.antes ? `<div class="es-antes">${o.antes}</div>` : ''}
        <div class="form-group"><label class="form-label" for="es-busca">${escapeHTML(o.buscaRotulo || 'Buscar')}</label>
            <input class="form-input" type="search" id="es-busca" data-es-busca autocomplete="off"></div>
        <div class="es-barra">
            ${o.todos === false ? '<span></span>' : '<label class="es-check"><input type="checkbox" data-es-todos><span>Selecionar todos</span></label>'}
            ${o.colunas === false ? '' : `<div class="es-visual" role="group" aria-label="Visualização"><span>Visualização</span>${[1, 2, 3].map((n) => `<button type="button" class="es-visual-botao" data-es-colunas="${n}" aria-pressed="${n === 3}" aria-label="${n} ${n === 1 ? 'coluna' : 'colunas'}">${n}</button>`).join('')}</div>`}
        </div>
        <div class="es-criar-area" data-es-criar-area></div>
        <div class="es-grade-area" data-es-grade></div>
        ${o.extra ? `<div class="es-extra">${o.extra}</div>` : ''}
        <div class="et-rodape">
            <div>${criarRotulo ? `<button type="button" class="btn" data-es-criar>${escapeHTML(criarRotulo)}</button>` : ''}</div>
            <div class="et-rodape-dir"><button type="button" class="btn" data-es-fechar data-action="forceCloseModal">Fechar</button>
                <button type="button" class="btn btn-primary" data-es-gravar disabled>${escapeHTML(o.rotuloGravar || 'Gravar')}</button></div>
        </div>`);

    const raiz = document.getElementById('modal-content');
    const grade = raiz.querySelector('[data-es-grade]');
    const criarArea = raiz.querySelector('[data-es-criar-area]');
    const gravar = raiz.querySelector('[data-es-gravar]');
    const bloqueado = () => !!(o.bloqueadoPor && o.bloqueadoPor(raiz));
    const visiveis = () => { const k = chave(estado.filtro); return estado.itens.filter((i) => !k || chave(i.nome).includes(k)); };
    const livres = () => visiveis().filter((i) => !i.travado && !bloqueado());
    const pronto = () => (o.pronto ? !!o.pronto(estado.sel, raiz) : estado.sel.size > 0);

    const celula = (i, off) => {
        const marcado = estado.sel.has(i.id);
        const travado = !!i.travado;
        return `<li class="es-celula"><label class="es-item${travado ? ' es-travado' : ''}">
            <input type="checkbox" data-es-item value="${escapeHTML(i.id)}"${marcado ? ' checked' : ''}${off || travado ? ' disabled' : ''}${travado ? ' aria-disabled="true"' : ''}>
            <span class="es-nome">${escapeHTML(i.nome)}</span>
            ${i.sensivel ? '<span class="es-selo">Dado sensível</span>' : ''}
            ${travado ? `<span class="es-selo es-selo-neutro">${escapeHTML(i.motivo || 'já usado nesta etapa')}</span>` : ''}
        </label></li>`;
    };

    function atualizar() {
        const off = bloqueado();
        if (off) estado.sel = new Set(estado.itens.filter((i) => i.travado).map((i) => i.id));
        if (!estado.itens.length) {
            grade.innerHTML = o.vazio ? renderEmptyState({ titulo: o.vazio.titulo, texto: o.vazio.texto, compacto: true }) : '';
        } else if (!visiveis().length) {
            grade.innerHTML = '<p class="at-nota" role="status">Nenhum item com esse nome.</p>';
        } else {
            grade.innerHTML = `<ul class="es-grade" data-colunas="${estado.colunas}">${visiveis().map((i) => celula(i, off)).join('')}</ul>`;
        }
        raiz.querySelectorAll('[data-es-colunas]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.esColunas) === estado.colunas)));
        const todos = raiz.querySelector('[data-es-todos]');
        if (todos) {
            const l = livres();
            todos.checked = l.length > 0 && l.every((i) => estado.sel.has(i.id));
            todos.disabled = l.length === 0;
        }
        gravar.disabled = !pronto();
    }

    function usar(existente) {
        if (!estado.itens.some((i) => i.id === existente.id)) estado.itens.push({ id: existente.id, nome: existente.nome, sensivel: false });
        estado.sel.add(existente.id);
        criarArea.innerHTML = '';
        atualizar();
    }

    raiz.addEventListener('input', (e) => {
        if (e.target.matches('[data-es-busca]')) { estado.filtro = e.target.value; atualizar(); }
    });
    raiz.addEventListener('change', (e) => {
        const t = e.target;
        if (t.matches('[data-es-item]')) {
            if (t.checked) estado.sel.add(t.value); else estado.sel.delete(t.value);
        } else if (t.matches('[data-es-todos]')) {
            livres().forEach((i) => (t.checked ? estado.sel.add(i.id) : estado.sel.delete(i.id)));
        } else if (t.closest('.es-antes, .es-extra')) {
            if (o.aoMudar) o.aoMudar(controle);
        }
        atualizar();
    });
    raiz.addEventListener('click', (e) => {
        const n = e.target.closest('[data-es-colunas]');
        if (n) { estado.colunas = Number(n.dataset.esColunas); atualizar(); return; }
        if (e.target.closest('[data-es-criar]') && o.tipo) {
            formularioDeCriacao(criarArea, {
                pid: o.pid, tipo: o.tipo, existentes: estado.itens,
                rotulo: `Criar ${TIPOS[o.tipo].singular}`,
                aoCriado: (item) => {
                    estado.itens.push(item);
                    estado.sel.add(item.id);
                    criarArea.innerHTML = '';
                    atualizar();
                },
                aoUsar: usar,
            });
        }
    });
    gravar.addEventListener('click', async () => {
        gravar.disabled = true;
        try {
            await o.aoGravar([...estado.sel], raiz);
            forceCloseModal();
        } catch (err) {
            showToast((err && err.message) || 'Não foi possível gravar. Tente de novo.', 'error');
            atualizar();
        }
    });

    const controle = {
        definir(ids) { estado.sel = new Set(ids); atualizar(); },
        atualizar,
    };
    atualizar();
    return controle;
}
