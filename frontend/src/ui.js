import { rotuloDe } from './rotulos.js';

export     function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            switch (m) { case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#39;'; }
        });
    }

/*
 * O modal único do app. Todo modal ganha o botão "Fechar" (texto visível, no topo), o papel de diálogo com nome (o
 * primeiro título do conteúdo), o foco ao abrir e de volta ao gatilho ao fechar, e o Tab preso dentro. Esc fecha.
 * Com campo alterado, o fechamento PEDIDO pela pessoa (Esc, "Fechar", "Cancelar", clique no fundo) pergunta na própria
 * janela antes de descartar; o fechamento de código (forceCloseModal() depois de salvar) não pergunta. A diferença vem
 * da delegação, que chama a ação com `this` = o elemento clicado (delegation.js); a chamada direta não tem elemento.
 */
let gatilhoModal = null;
let modalAlterado = false;
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const pedidoPelaPessoa = (quem) => typeof Element !== 'undefined' && quem instanceof Element;

export function openModal(html, extraClass) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    if (!overlay.classList.contains('open')) gatilhoModal = document.activeElement;
    modalAlterado = false;
    modal.classList.remove('modal-large'); // reset
    if (extraClass) modal.classList.add(extraClass);
    modal.querySelector(':scope > .modal-descartar')?.remove();
    modalContent.innerHTML = html;
    if (!modal.querySelector(':scope > .modal-fechar')) {
        modal.insertAdjacentHTML('afterbegin', '<button type="button" class="modal-fechar" data-action="forceCloseModal">Fechar</button>');
    }
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('tabindex', '-1');
    const titulo = modalContent.querySelector('.modal-title, h1, h2, h3');
    if (titulo) {
        if (!titulo.id) titulo.id = 'modal-titulo';
        modal.setAttribute('aria-labelledby', titulo.id);
    } else modal.removeAttribute('aria-labelledby');
    overlay.classList.add('open');
    const auto = modalContent.querySelector('[autofocus]');
    (auto || modal).focus();
}

function fecharDeFato() {
    // Optional chaining porque o handler global de Esc chama isto em toda tecla: fora do shell (ou num teste) os
    // elementos podem não existir e a exceção matava o resto da cascata de Esc.
    const overlay = document.getElementById('modal-overlay');
    const estavaAberto = !!overlay?.classList.contains('open');
    overlay?.classList.remove('open');
    const modal = document.getElementById('modal');
    modal?.classList.remove('modal-large');
    modal?.querySelector(':scope > .modal-descartar')?.remove();
    modalAlterado = false;
    if (window.activePreviewUrl) {
        window.URL.revokeObjectURL(window.activePreviewUrl);
        window.activePreviewUrl = null;
    }
    if (estavaAberto && gatilhoModal && gatilhoModal.isConnected && typeof gatilhoModal.focus === 'function') gatilhoModal.focus();
    if (estavaAberto) gatilhoModal = null;
}

/** "Descartar o que foi digitado?" dentro do próprio modal, no topo, com o foco em "Continuar editando". */
function perguntarDescarte() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    let faixa = modal.querySelector(':scope > .modal-descartar');
    if (!faixa) {
        modal.querySelector(':scope > .modal-fechar').insertAdjacentHTML('afterend', `<div class="modal-descartar" role="alertdialog" aria-labelledby="modal-descartar-texto">
            <p id="modal-descartar-texto">Descartar o que foi digitado?</p>
            <button type="button" class="btn" data-action="continuarEditandoModal">Continuar editando</button>
            <button type="button" class="btn btn-perigo" data-action="descartarModal">Descartar</button></div>`);
        faixa = modal.querySelector(':scope > .modal-descartar');
    }
    faixa.querySelector('[data-action="continuarEditandoModal"]').focus();
}

/** Fechar pedido pela pessoa: pergunta se há campo alterado. */
export function pedirFecharModal() {
    if (modalAlterado) perguntarDescarte();
    else fecharDeFato();
}

export function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    if (pedidoPelaPessoa(this)) pedirFecharModal();
    else fecharDeFato();
}

export function forceCloseModal() {
    if (pedidoPelaPessoa(this)) pedirFecharModal();
    else fecharDeFato();
}

window.continuarEditandoModal = function continuarEditandoModal() {
    document.querySelector('#modal > .modal-descartar')?.remove();
    const conteudo = document.getElementById('modal-content');
    (conteudo?.querySelector(FOCAVEIS) || document.getElementById('modal'))?.focus();
};
window.descartarModal = function descartarModal() { fecharDeFato(); };

if (typeof document !== 'undefined') {
    // Campo alterado dentro do modal (o que se perde ao fechar). `data-sem-rascunho` marca filtro/busca, que não conta.
    const marcar = (e) => {
        const t = e.target;
        if (t instanceof Element && t.closest('#modal-content') && !t.closest('[data-sem-rascunho]')) modalAlterado = true;
    };
    document.addEventListener('input', marcar, true);
    document.addEventListener('change', marcar, true);
    document.addEventListener('keydown', (e) => {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay || !overlay.classList.contains('open') || e.defaultPrevented) return;
        const modal = document.getElementById('modal');
        if (e.key === 'Escape') {
            // Com a pergunta aberta, Esc é "continuar editando".
            if (modal.querySelector(':scope > .modal-descartar')) window.continuarEditandoModal();
            else pedirFecharModal();
            e.preventDefault();
        } else if (e.key === 'Tab') {
            const f = [...modal.querySelectorAll(FOCAVEIS)].filter((x) => !x.closest('[hidden]'));
            if (!f.length) { e.preventDefault(); modal.focus(); return; }
            const i = f.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        }
    });
}

/**
 * Pergunta na própria tela, no lugar de window.confirm/prompt (bloqueiam a página, não seguem a
 * marca e o prompt mostra senha em claro). Camada própria acima do #modal: a janela que estava
 * aberta (com o que o usuário digitou) fica intacta embaixo. Esc e Cancelar respondem "não"; o Esc
 * não chega ao handler global, que fecharia a janela de baixo. O foco volta para onde estava.
 */
function perguntar(texto, { titulo = 'Confirmar', rotulo = 'Confirmar', perigo = false, campo = null, cancelar = true } = {}) {
    return new Promise((resolve) => {
        const antes = document.activeElement;
        const camada = document.createElement('div');
        camada.className = 'confirmar';
        camada.setAttribute('role', 'alertdialog');
        camada.setAttribute('aria-modal', 'true');
        camada.setAttribute('aria-labelledby', 'confirmar-titulo');
        camada.setAttribute('aria-describedby', 'confirmar-texto');
        camada.innerHTML = `<div class="confirmar-caixa">
            <h2 class="confirmar-titulo" id="confirmar-titulo">${escapeHTML(titulo)}</h2>
            <p class="confirmar-texto" id="confirmar-texto">${escapeHTML(texto)}</p>
            ${campo ? `<input class="form-input" type="${campo.tipo === 'password' ? 'password' : 'text'}" aria-labelledby="confirmar-texto"${campo.tipo === 'password' ? ' autocomplete="current-password"' : ''}>` : ''}
            <div class="confirmar-acoes">
                ${cancelar ? '<button type="button" class="btn" data-confirmar="nao">Cancelar</button>' : ''}
                <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-primary'}" data-confirmar="sim">${escapeHTML(rotulo)}</button>
            </div></div>`;
        const input = camada.querySelector('input');
        if (input) input.value = campo.padrao ?? '';
        // Esc em captura na window: com a camada aberta, nenhum handler do app (forceCloseModal) vê a tecla,
        // esteja o foco onde estiver.
        const esc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); fim(false); } };
        let aberta = true;
        const fim = (sim) => {
            if (!aberta) return;
            aberta = false;
            window.removeEventListener('keydown', esc, true);
            camada.remove();
            if (antes && typeof antes.focus === 'function') antes.focus();
            // Senha não se apara: espaço no começo ou no fim é parte dela.
            const valor = campo && sim ? (campo.tipo === 'password' ? input.value : input.value.trim()) : null;
            resolve(campo ? valor : sim);
        };
        window.addEventListener('keydown', esc, true);
        // Clicar no fundo não leva o foco para o body (ele sairia da camada).
        camada.addEventListener('mousedown', (e) => { if (e.target === camada) e.preventDefault(); });
        camada.addEventListener('click', (e) => {
            const b = e.target.closest('[data-confirmar]');
            if (b) { e.stopPropagation(); fim(b.dataset.confirmar === 'sim'); }
        });
        camada.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target === input) { e.preventDefault(); fim(true); }
            else if (e.key === 'Tab') {
                // Foco preso na camada: só os controles dela.
                const f = [...camada.querySelectorAll('input, button')];
                const i = f.indexOf(document.activeElement);
                const prox = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
                e.preventDefault(); f[prox].focus();
            }
        });
        document.body.appendChild(camada);
        (input || camada.querySelector('[data-confirmar="nao"]') || camada.querySelector('[data-confirmar="sim"]')).focus();
    });
}

/** Sim/não na própria tela. Resolve true ou false. `perigo` pinta o botão de confirmar em --danger. */
export function confirmar(texto, opcoes = {}) { return perguntar(texto, opcoes); }

/** Texto na própria tela. Resolve o texto (aparado, menos senha), ou null se cancelou. `tipo: 'password'` esconde o que se digita. */
export function pedirTexto(texto, { padrao = '', tipo = 'text', ...opcoes } = {}) {
    return perguntar(texto, { titulo: opcoes.titulo || 'Informe', rotulo: opcoes.rotulo || 'Continuar', ...opcoes, campo: { padrao, tipo } });
}

export const TOAST_MS = 4200;

// A região de anúncio é PERMANENTE e vazia: leitor de tela só anuncia mudança
// de conteúdo numa região que já estava montada. Criar a região junto da
// mensagem (como antes) não anuncia nada. O shell traz `#live-region` no HTML;
// aqui só há o resgate para páginas que não a tenham.
function liveRegion() {
        let el = document.getElementById('live-region');
        if (!el) {
            el = document.createElement('div');
            el.id = 'live-region';
            el.className = 'sr-only';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        return el;
    }

export     function showToast(message, type = 'info', onUndo) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        // textContent, nao innerHTML: dos 116 pontos que chamam showToast nenhum
        // passa HTML, e varios interpolam `${e.message}` — texto que vem do
        // servidor e pode ecoar entrada do usuario. Corrigir aqui vale por todos.
        const label = document.createElement('span');
        label.className = 'toast-text';
        label.textContent = message;
        toast.appendChild(label);

        let timer;
        const dismiss = () => { clearTimeout(timer); toast.remove(); };

        // Toda ação em lote e toda edição imediata passa por aqui: o desfazer é
        // a janela pré-commit, não um delete na trilha.
        if (typeof onUndo === 'function') {
            const undo = document.createElement('button');
            undo.type = 'button';
            undo.className = 'toast-undo';
            undo.textContent = 'Desfazer';
            undo.addEventListener('click', () => { dismiss(); onUndo(); });
            toast.appendChild(undo);
        }

        document.body.appendChild(toast);
        liveRegion().textContent = message;
        timer = setTimeout(dismiss, TOAST_MS);
        return toast;
    }



// O título nomeia A TELA (SoA, Riscos, Dashboard), nunca o cliente, e a banda
// não carrega subtítulo: contexto de tenant vive no seletor da sidebar e
// contexto de registro é a primeira linha DO CONTEÚDO. A assinatura fica como
// estava por compatibilidade; o `subtitle` sai da banda e desce para o kicker.
export function renderPageHeader(title, subtitle = '', actionsHtml = '') {
    return `
        <div class="page-header">
            <div class="page-header-band">
                <h1 class="page-title">${escapeHTML(title)}</h1>
                ${actionsHtml ? `<div class="header-actions-group">${actionsHtml}</div>` : ''}
            </div>
            ${subtitle ? `<p class="page-kicker">${escapeHTML(subtitle)}</p>` : ''}
        </div>
    `;
}

/**
 * O título da tela É o rótulo do item de menu que a abre (lido do próprio menu, que a casca do módulo já ajustou:
 * "Pessoas, áreas e sistemas" no n.privacy, "Partes" no n.iso). Fora do shell (teste, menu ausente) vale o padrão.
 */
export function tituloDaTela(navId, padrao) {
    const t = typeof document !== 'undefined' && document.querySelector(`#${navId} .sidebar-nav-text`);
    return (t && t.textContent.trim()) || padrao;
}

export function renderStatCards(statsArray) {
    if (!statsArray || !statsArray.length) return '';
    const cardsHtml = statsArray.map(s => {
        const color = s.color || 'var(--accent)';
        return `
            <div class="stat-card" style="background:var(--surface); border:1px solid var(--border); padding:1.25rem; flex:1; min-width:200px;">
                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); margin-bottom:0.5rem; font-weight:500;">${escapeHTML(s.label)}</div>
                <div style="font-size:1.75rem; font-weight:600; color:${color}; font-family:'Inter',sans-serif; line-height:1.2;">${escapeHTML(String(s.value))}</div>
                ${s.subtext ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.4rem;">${escapeHTML(s.subtext)}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="stat-strip" style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">${cardsHtml}</div>`;
}

/**
 * Vocabulário de status/severidade: o banco guarda em inglês, a interface é
 * PT-BR (decisão registrada no AGENTS.md).
 *
 * Vive fora do `renderStatusBadge` porque nem toda tela usa badge — a lista de
 * riscos e a de controles pintam o valor com estilo próprio e, por não passarem
 * por aqui, mostravam "High", "Medium", "Completed" e "In Progress" crus ao
 * usuário. Uma tabela só, para as duas formas de exibir não divergirem.
 */
/** Situação de uma fase da jornada (`project_phases.status`), em português. Jornada e Monitor usam a mesma. */
export const STATUS_DA_FASE = { pending: 'Não iniciada', in_progress: 'Em andamento', completed: 'Concluída', blocked: 'Bloqueada', skipped: 'Dispensada' };

/**
 * Traduz um valor de status/severidade para PT-BR pelo mapa geral de `rotulos.js` (a tabela única). Valor
 * desconhecido volta COMO VEIO. Para um valor cujo rótulo depende do domínio, use `rotuloDe(dominio, valor)`.
 */
export function traduzStatus(valor) { return rotuloDe('', valor); }

/**
 * Data na tela, sempre dd/mm/aaaa (e hh:mm com `{ hora: true }`). Aceita o que o banco devolve: "2026-10-15",
 * "2026-10-15 10:15:00" (UTC do SQLite, sem fuso), ISO com Z, Date ou milissegundos. Data só de dia não passa por
 * fuso (não vira o dia anterior em Brasília), nem a meia-noite UTC exata ("2026-10-16T00:00:00.000Z", como os prazos
 * são gravados); data com hora é convertida para o fuso do navegador. Vazio vira
 * `vazio` ('—'); texto que não é data volta como veio.
 */
export function formatarData(valor, { hora = false, vazio = '—' } = {}) {
    if (valor === null || valor === undefined || valor === '') return vazio;
    const dd = (n) => String(n).padStart(2, '0');
    if (typeof valor === 'string') {
        const s = valor.trim();
        // Meia-noite UTC exata é um dia gravado como instante (os prazos legais): não passa por fuso.
        const soDia = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?Z)?$/.exec(s);
        if (soDia) return `${soDia[3]}/${soDia[2]}/${soDia[1]}`;
        // "AAAA-MM-DD HH:MM:SS" do SQLite é UTC sem marca de fuso.
        const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
        valor = /^\d{4}-\d{2}-\d{2}T/.test(sqlite) ? new Date(sqlite) : null;
        if (!valor) return s;
    }
    const d = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(d.getTime())) return vazio;
    const dia = `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
    return hora ? `${dia} ${dd(d.getHours())}:${dd(d.getMinutes())}` : dia;
}

export function renderStatusBadge(arg1, arg2) {
    const knownTypes = ['success', 'warning', 'danger', 'info', 'neutral'];
    let type;
    let text = '';

    if (knownTypes.includes(arg1)) {
        type = arg1;
        text = arg2 || '';
    } else if (knownTypes.includes(arg2)) {
        type = arg2;
        text = arg1 || '';
    } else {
        type = 'neutral';
        text = arg1 || arg2 || '';
    }


    text = traduzStatus(text);
    // Uma família de selo: a aparência vive em `.badge` e `.selo-<tipo>` (style.css), nunca inline. O tipo é semântico;
    // o ciano da marca não é cor de estado (`--info` é neutro claro, o accent fica para o que se clica).
    return `<span class="badge selo-${type}">${escapeHTML(text)}</span>`;
}

/**
 * Estado vazio único do app: o que falta (título), por que importa (texto, com a cláusula quando
 * houver) e a ação que o usuário pode tomar. Título e texto são texto (escapados); `acao` é HTML de
 * botão montado por quem chama. A aparência vive em `.empty-state` (style.css), nunca inline.
 */
export function renderEmptyState({ titulo = '', texto = '', acao = '', id = '', itens = [], compacto = false } = {}) {
    // `compacto`: o vazio de uma seção dentro de cartão, modal ou ficha (uma linha, sem moldura). Mesmo padrão: o que falta,
    // o que fazer (texto) e a ação.
    if (compacto) {
        return `<div class="empty-state empty-state-compacto"${id ? ` id="${escapeHTML(id)}"` : ''}><p>${escapeHTML(titulo)}${texto ? ` <span class="empty-hint">${escapeHTML(texto)}</span>` : ''}</p>${acao ? `<div class="empty-action">${acao}</div>` : ''}</div>`;
    }
    // `itens`: lista curta de texto (o que a cláusula pede, o que costuma existir); cada um pode trazer a própria ação (HTML).
    const lista = itens.length ? `<ul class="empty-list">${itens.map((it) => {
        const { texto: t, acao: ac } = typeof it === 'string' ? { texto: it } : it;
        return `<li><span>${escapeHTML(t)}</span>${ac || ''}</li>`;
    }).join('')}</ul>` : '';
    return `<div class="empty-state fade-in"${id ? ` id="${escapeHTML(id)}"` : ''}>`
        + (titulo ? `<h3>${escapeHTML(titulo)}</h3>` : '')
        + (texto ? `<p class="empty-hint">${escapeHTML(texto)}</p>` : '')
        + lista
        + (acao ? `<div class="empty-action">${acao}</div>` : '')
        + '</div>';
}

const TEXTO_FALHA = 'Nada foi apagado nem alterado: a falha foi ao buscar os dados. Tente de novo; se continuar, avise o suporte da ness.';
const TEXTO_SEM_ACESSO = 'O seu acesso não alcança estes dados neste projeto. Se precisar deles, fale com quem administra o projeto.';

/**
 * Estado de erro único do app: a carga falhou, e isso NUNCA se mostra como o estado vazio (o vazio diria "não há riscos"
 * quando há). `mensagem` diz o que não carregou, em linguagem do usuário; o detalhe técnico fica no console. "Tentar de
 * novo" é `data-action` (padrão `render`, que refaz a tela atual). Com `erro.status === 403` não há o que tentar de novo.
 */
export function renderErrorState(mensagem, { texto = '', acao = 'render', args = null, erro = null } = {}) {
    const semAcesso = !!erro && erro.status === 403;
    const botao = semAcesso || !acao ? ''
        : `<div class="empty-action"><button type="button" class="btn btn-primary" data-action="${escapeHTML(acao)}"${args ? ` data-args='${escapeHTML(JSON.stringify(args))}'` : ''}>Tentar de novo</button></div>`;
    return `<div class="error-state" role="alert"><h3>${escapeHTML(mensagem)}</h3>`
        + `<p>${escapeHTML(semAcesso ? TEXTO_SEM_ACESSO : (texto || TEXTO_FALHA))}</p>${botao}</div>`;
}

/** A carga principal da tela falhou: limpa as ações do cabeçalho ("Novo…" sobre dado que não carregou) e mostra o erro. */
export function falhaDeCarga(c, a, mensagem, erro, opcoes = {}) {
    console.error(mensagem, erro);
    if (a) a.innerHTML = '';
    c.innerHTML = renderErrorState(mensagem, { ...opcoes, erro });
}

// Markdown vindo do servidor (descrição de controle, texto de política, evidência .md) vira HTML só por aqui: o `marked`
// (frontend/public/marked.min.js) não sanitiza, então o resultado passa por uma lista fechada de tags e atributos.
const MD_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'DEL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'CODE', 'PRE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A']);
const MD_FORA = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA',
    'BUTTON', 'SELECT', 'LINK', 'META', 'BASE', 'TEMPLATE', 'NOSCRIPT', 'VIDEO', 'AUDIO', 'SOURCE']);
export function markdownSeguro(texto) {
    const t = String(texto ?? '');
    if (!window.marked) return escapeHTML(t).replace(/\n/g, '<br>');
    // <template>: o conteúdo é inerte (nada carrega nem executa) enquanto é limpo.
    const tpl = document.createElement('template');
    tpl.innerHTML = window.marked.parse(t);
    const limpar = (no) => {
        for (const el of [...no.children]) {
            if (MD_FORA.has(el.tagName)) { el.remove(); continue; }
            limpar(el);
            const href = el.tagName === 'A' ? (el.getAttribute('href') || '').trim() : '';
            const linkSeguro = /^(https?:|mailto:)/i.test(href);
            // Tag fora da lista e link sem endereço seguro (javascript:, data:) viram só o texto.
            if (!MD_TAGS.has(el.tagName) || (el.tagName === 'A' && !linkSeguro)) { el.replaceWith(...el.childNodes); continue; }
            for (const at of [...el.attributes]) el.removeAttribute(at.name);
            if (el.tagName === 'A') {
                el.setAttribute('href', href);
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
            }
        }
    };
    limpar(tpl.content);
    return tpl.innerHTML;
}

/** O vazio de "nenhum projeto escolhido", repetido em quase toda tela de projeto. */
export function renderSemProjeto(texto = 'Selecione um projeto para continuar.') {
    return renderEmptyState({ titulo: 'Sem projeto ativo', texto,
        acao: '<button class="btn btn-primary" data-action="openActiveProjectModal">Selecionar projeto</button>' });
}

export function renderDataTable(columns, rows, options = {}) {
    const emptyMessage = options.emptyState || options.emptyMessage || 'Nenhum registro encontrado.';
    if (!rows || rows.length === 0) {
        // emptyHint é texto (a obrigação ou o próximo passo); emptyAction é HTML de botão montado por quem chama.
        return renderEmptyState({ titulo: emptyMessage, texto: options.emptyHint, acao: options.emptyAction, itens: options.emptyItens });
    }

    // Normalize column headers. `numeric` liga tabular-nums; alinhar à direita
    // já é sinal suficiente de coluna numérica nas 19 chamadas existentes, então
    // vale por padrão — assim CMMI, Aplic. e contagens alinham sem tocar as views.
    const cols = columns.map(c => {
        if (typeof c === 'string') return { label: c, align: 'left', numeric: false };
        return {
            label: c.label || '',
            align: c.align || 'left',
            key: c.key,
            render: c.render,
            sort: c.sort,
            numeric: c.numeric !== undefined ? c.numeric : c.align === 'right'
        };
    });

    const numCell = c => (c.numeric ? ' font-variant-numeric:tabular-nums;' : '');

    // Cabeçalho sticky. `top:0` e não `var(--hdr-h)`: aqui quem rola é
    // `.content`, que já começa ABAIXO da banda de título — descontar 64px de
    // novo abriria uma faixa por onde as linhas passariam. O fundo opaco e o
    // z-index valem para TODA th, inclusive a de seleção: uma th sem essa base
    // vira buraco transparente no cabeçalho fixo.
    const ths = cols.map(c => {
        const sorted = c.sort ? ` aria-sort="${escapeHTML(c.sort)}"` : '';
        return `<th scope="col"${sorted} style="text-align:${c.align}; position:sticky; top:0; z-index:3; background:var(--bg); padding:14px 10px 10px; color:var(--text-faint); font:500 var(--fs-xs)/1 var(--font-mono); text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid var(--border);${numCell(c)}">${escapeHTML(c.label)}</th>`;
    }).join('');

    const pad = options.dense ? '7px 10px' : '12px 10px';
    const td = (align, extra) => `text-align:${align}; padding:${pad}; border-bottom:1px solid var(--border); font-size:13px; color:var(--text-2);${extra}`;

    // O hover saiu do onmouseenter/onmouseleave inline e virou CSS
    // (.table-container tbody tr:hover): 19 tabelas deixam de carregar dois
    // handlers por linha.
    const trs = rows.map(r => {
        let tds = '';
        if (Array.isArray(r)) {
            // Row is an array of cell HTML strings
            tds = r.map((cellVal, idx) => {
                const c = cols[idx] || { align: 'left', numeric: false };
                return `<td style="${td(c.align, numCell(c))}">${cellVal ?? ''}</td>`;
            }).join('');
        } else {
            // Row is an object
            tds = cols.map(c => {
                const val = c.render ? c.render(r) : escapeHTML(String(r[c.key] ?? ''));
                return `<td style="${td(c.align, numCell(c))}">${val}</td>`;
            }).join('');
        }
        return `<tr>${tds}</tr>`;
    }).join('');

    return `
        <div class="table-container" style="border:1px solid var(--border);">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead><tr>${ths}</tr></thead>
                <tbody>${trs}</tbody>
            </table>
        </div>
    `;
}

/**
 * Abas de tela: `abas` = [[valor, rótuloHtml], ...]. O rótulo já é HTML (pode trazer contagem colorida):
 * quem chama escapa o que vier do servidor. A aba ativa é sublinhado accent sem preenchimento (classes
 * `.abas`/`.aba` de style.css), para não competir com o botão primário do header.
 */
export function renderAbas(abas, ativa, action) {
    return `<div class="abas" role="tablist" style="margin-bottom:1rem">${abas.map(([v, rotulo]) =>
        `<button type="button" role="tab" class="aba" aria-selected="${v === ativa}" tabindex="${v === ativa ? 0 : -1}" data-action="${escapeHTML(action)}" data-args='${escapeHTML(JSON.stringify([v]))}'><span>${rotulo}</span></button>`).join('')}</div>`;
}

/**
 * "Mais ações": o menu das ações secundárias de um cabeçalho ou de uma linha de tabela. Regra do sistema (DESIGN.md):
 * no máximo um `.btn-primary` por tela; acima de três secundárias, elas vêm para cá. `itens` = [{ rotulo, action,
 * args, perigo }] (falsy é ignorado); o destrutivo (`perigo`) vai por último, depois de um separador. `nome` dá ao
 * botão um nome único na linha ("Mais ações: Ana Prado"). Padrão de botão de menu do WAI-ARIA: setas, Home/End,
 * Esc fecha e devolve o foco ao botão, Tab fecha. A ação do item corre pela delegação (data-action).
 */
let maisAcoesSeq = 0;
export function renderMaisAcoes(itens, { rotulo = 'Mais ações', nome = '' } = {}) {
    const lista = (itens || []).filter(Boolean);
    if (!lista.length) return '';
    const id = `mais-acoes-${++maisAcoesSeq}`;
    const comuns = lista.filter((i) => !i.perigo);
    const perigosos = lista.filter((i) => i.perigo);
    // `desabilitado`: o item fica à vista e esmaecido, com o motivo em texto (`motivo`), e não faz nada (sem data-action). Segue
    // focável (aria-disabled, não disabled) para quem navega por teclado ler o motivo. `sub` é a linha de apoio do item.
    const item = (i) => {
        const sub = i.desabilitado ? i.motivo : i.sub;
        const corpo = `${escapeHTML(i.rotulo)}${sub ? `<span class="mais-acoes-sub">${escapeHTML(sub)}</span>` : ''}`;
        const classe = `mais-acoes-item${i.perigo ? ' perigo' : ''}`;
        if (i.desabilitado) return `<button type="button" role="menuitem" tabindex="-1" class="${classe} desabilitado" aria-disabled="true"${i.motivo ? ` title="${escapeHTML(i.motivo)}"` : ''}>${corpo}</button>`;
        return `<button type="button" role="menuitem" tabindex="-1" class="${classe}" data-action="${escapeHTML(i.action)}" data-args='${escapeHTML(JSON.stringify(i.args || []))}'>${corpo}</button>`;
    };
    return `<div class="mais-acoes"><button type="button" class="btn mais-acoes-botao" id="${id}-botao" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}"${nome ? ` aria-label="${escapeHTML(`${rotulo}: ${nome}`)}"` : ''} data-action="alternarMaisAcoes" data-arg-el>${escapeHTML(rotulo)}</button>`
        + `<div class="mais-acoes-lista" id="${id}" role="menu" aria-labelledby="${id}-botao" hidden>${comuns.map(item).join('')}`
        + `${comuns.length && perigosos.length ? '<div role="separator" class="mais-acoes-sep"></div>' : ''}${perigosos.map(item).join('')}</div></div>`;
}

function fecharMaisAcoes(devolverFoco = false) {
    document.querySelectorAll('.mais-acoes-lista:not([hidden])').forEach((l) => {
        l.hidden = true;
        const b = document.getElementById(l.getAttribute('aria-labelledby'));
        if (b) { b.setAttribute('aria-expanded', 'false'); if (devolverFoco) b.focus(); }
    });
}

// A lista é `position: fixed` junto do botão: dentro de tabela com rolagem horizontal ela não fica cortada.
function abrirMaisAcoes(botao, ultimo = false) {
    const lista = document.getElementById(botao.getAttribute('aria-controls'));
    if (!lista) return;
    fecharMaisAcoes();
    lista.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    const r = botao.getBoundingClientRect();
    const alto = lista.offsetHeight;
    const acima = r.bottom + 4 + alto > window.innerHeight && r.top - 4 - alto > 0;
    lista.style.top = `${acima ? r.top - 4 - alto : r.bottom + 4}px`;
    lista.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    const todos = lista.querySelectorAll('[role="menuitem"]');
    const alvo = ultimo ? todos[todos.length - 1] : todos[0];
    if (alvo) alvo.focus();
}

window.alternarMaisAcoes = function alternarMaisAcoes(botao) {
    if (botao.getAttribute('aria-expanded') === 'true') fecharMaisAcoes();
    else abrirMaisAcoes(botao);
};

if (typeof document !== 'undefined') {
    // Clique fora fecha; clique num item também (a delegação, em captura, já chamou a ação).
    document.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t || !t.closest('.mais-acoes') || t.closest('.mais-acoes-item')) fecharMaisAcoes();
    });
    document.addEventListener('keydown', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.matches('.mais-acoes-botao') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            abrirMaisAcoes(t, e.key === 'ArrowUp');
            return;
        }
        const lista = t.closest('.mais-acoes-lista');
        if (!lista) return;
        const todos = [...lista.querySelectorAll('[role="menuitem"]')];
        const i = todos.indexOf(t);
        const ir = { ArrowDown: (i + 1) % todos.length, ArrowUp: (i - 1 + todos.length) % todos.length, Home: 0, End: todos.length - 1 }[e.key];
        if (ir !== undefined) { e.preventDefault(); todos[ir].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); fecharMaisAcoes(true); }
        else if (e.key === 'Tab') fecharMaisAcoes();
    });
    const fecharAoRolar = (e) => { if (!(e.target instanceof Element && e.target.closest('.mais-acoes-lista'))) fecharMaisAcoes(); };
    document.addEventListener('scroll', fecharAoRolar, true);
    window.addEventListener('resize', () => fecharMaisAcoes());
}

window.escapeHTML = escapeHTML;
window.renderMaisAcoes = renderMaisAcoes;
window.renderAbas = renderAbas;
window.openModal = openModal;
window.closeModal = closeModal;
window.forceCloseModal = forceCloseModal;
window.pedirFecharModal = pedirFecharModal;
window.showToast = showToast;
window.renderPageHeader = renderPageHeader;
window.renderStatCards = renderStatCards;
window.tituloDaTela = tituloDaTela;
window.renderStatusBadge = renderStatusBadge;
window.traduzStatus = traduzStatus;
window.formatarData = formatarData;
window.renderDataTable = renderDataTable;
window.renderEmptyState = renderEmptyState;
window.renderSemProjeto = renderSemProjeto;
window.renderErrorState = renderErrorState;
window.falhaDeCarga = falhaDeCarga;
window.markdownSeguro = markdownSeguro;
window.confirmar = confirmar;
window.pedirTexto = pedirTexto;
