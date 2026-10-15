export     function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            switch (m) { case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#39;'; }
        });
    }

export     function openModal(html, extraClass) {
        const modal = document.getElementById('modal');
        const modalContent = document.getElementById('modal-content');
        modal.classList.remove('modal-large'); // reset
        if (extraClass) modal.classList.add(extraClass);
        modalContent.innerHTML = html;
        document.getElementById('modal-overlay').classList.add('open');
    }

    export function closeModal(e) {
        if (e && e.target !== document.getElementById('modal-overlay')) return;
        document.getElementById('modal-overlay').classList.remove('open');
        document.getElementById('modal').classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
    }

    export function forceCloseModal() {
        // Optional chaining porque o handler global de Esc chama isto em toda
        // tecla: fora do shell (ou num teste) os elementos podem não existir e a
        // exceção matava o resto da cascata de Esc.
        document.getElementById('modal-overlay')?.classList.remove('open');
        document.getElementById('modal')?.classList.remove('modal-large');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        if (window.activePreviewUrl) {
            window.URL.revokeObjectURL(window.activePreviewUrl);
            window.activePreviewUrl = null;
        }
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

export function renderStatCards(statsArray) {
    if (!statsArray || !statsArray.length) return '';
    const cardsHtml = statsArray.map(s => {
        const color = s.color || 'var(--accent)';
        return `
            <div class="stat-card" style="background:var(--surface); border:1px solid var(--border); padding:1.25rem; flex:1; min-width:200px;">
                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); margin-bottom:0.5rem; font-weight:500;">${escapeHTML(s.label)}</div>
                <div style="font-size:1.75rem; font-weight:700; color:${color}; font-family:'Inter',sans-serif; line-height:1.2;">${escapeHTML(String(s.value))}</div>
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
const STATUS_DICT = {
    'implemented': 'Implementado',
    'not applicable': 'Não Aplicável',
    'approved': 'Aprovado',
    'compliant': 'Conforme',
    'missing': 'Pendente',
    'partial': 'Parcial',
    'conforming': 'Conforme',
    'non_conforming': 'Não Conforme',
    'draft': 'Rascunho',
    'under review': 'Em Revisão',
    'active': 'Ativo',
    'pending': 'Pendente',
    'open': 'Aberto',
    'closed': 'Fechado',
    'low': 'Baixo',
    'medium': 'Médio',
    'high': 'Alto',
    'critical': 'Crítico',
    'planned': 'Planejado',
    'completed': 'Concluído',
    'in_progress': 'Em Andamento',
    'in progress': 'Em Andamento',
    'na': 'N/A',
    'gap': 'Gap',
    // Faltavam: são valores que o backend grava e que apareciam em inglês.
    'treated': 'Tratado',
    'mitigate': 'Mitigar',
    'accept': 'Aceitar',
    'transfer': 'Transferir',
    'avoid': 'Evitar',
    'scheduled': 'Agendado',
    'very low': 'Muito Baixo',
    'rejected': 'Rejeitado',
    'revoked': 'Revogado',
    'inactive': 'Inativo'
};

/** Situação de uma fase da jornada (`project_phases.status`), em português. Jornada e Monitor usam a mesma. */
export const STATUS_DA_FASE = { pending: 'Não iniciada', in_progress: 'Em andamento', completed: 'Concluída', blocked: 'Bloqueada', skipped: 'Dispensada' };

/**
 * Traduz um valor de status/severidade para PT-BR. Valor desconhecido volta
 * COMO VEIO — melhor mostrar o termo cru do banco do que apagar a informação.
 */
export function traduzStatus(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const chave = valor.toString().toLowerCase().trim();
    return STATUS_DICT[chave] || valor;
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

    // Sem borda: o preenchimento por color-mix já separa a badge do fundo, e a
    // borda somava um terceiro tom de cinza em cada célula da tabela.
    const COLORS = {
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        neutral: 'var(--text-dim)'
    };
    const color = COLORS[type] || COLORS.neutral;
    const bStyle = `background:color-mix(in oklab, ${color} 16%, transparent); color:${color}; border:0; border-radius:0;`;
    return `<span class="badge" style="${bStyle} padding:1px 8px; font:500 10px/1.7 var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; display:inline-block;">${escapeHTML(text)}</span>`;
}

/**
 * Estado vazio único do app: o que falta (título), por que importa (texto, com a cláusula quando
 * houver) e a ação que o usuário pode tomar. Título e texto são texto (escapados); `acao` é HTML de
 * botão montado por quem chama. A aparência vive em `.empty-state` (style.css), nunca inline.
 */
export function renderEmptyState({ titulo = '', texto = '', acao = '', id = '', itens = [] } = {}) {
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
        return `<th scope="col"${sorted} style="text-align:${c.align}; position:sticky; top:0; z-index:3; background:var(--bg); padding:14px 10px 10px; color:var(--text-faint); font:500 9px/1 var(--font-mono); text-transform:uppercase; letter-spacing:0.16em; border-bottom:1px solid var(--border);${numCell(c)}">${escapeHTML(c.label)}</th>`;
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
    const item = (i) => `<button type="button" role="menuitem" tabindex="-1" class="mais-acoes-item${i.perigo ? ' perigo' : ''}" data-action="${escapeHTML(i.action)}" data-args='${escapeHTML(JSON.stringify(i.args || []))}'>${escapeHTML(i.rotulo)}</button>`;
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
window.showToast = showToast;
window.renderPageHeader = renderPageHeader;
window.renderStatCards = renderStatCards;
window.renderStatusBadge = renderStatusBadge;
window.traduzStatus = traduzStatus;
window.renderDataTable = renderDataTable;
window.renderEmptyState = renderEmptyState;
window.renderSemProjeto = renderSemProjeto;
window.renderErrorState = renderErrorState;
window.falhaDeCarga = falhaDeCarga;
window.markdownSeguro = markdownSeguro;
window.confirmar = confirmar;
window.pedirTexto = pedirTexto;
