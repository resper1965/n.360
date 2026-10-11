import { S } from './state.js';
import { api } from './api.js';
import { showToast, openModal, escapeHTML } from './ui.js';

// O n.360 é a plataforma-mãe; n.iso e n.privacy são módulos dele sobre o mesmo cadastro (decisão de 11/10/2026). Tudo responde
// em n360.ness.com.br e o CAMINHO decide a casca: /iso… → n.iso, /privacy… → n.privacy, o resto → o início do n.360. A trava
// de verdade é do servidor (403 sem o módulo do projeto); aqui só se mostra o produto certo e os projetos que o têm.

export const PRODUTOS = {
    n360: { nome: '360', titulo: 'n.360 | ness.', inicio: 'inicio' },
    iso: { nome: 'iso', titulo: 'n.iso | ness. Agentic GRC', inicio: 'dashboard' },
    privacy: { nome: 'privacy', titulo: 'n.privacy | ness. Privacidade', inicio: 'encarregado' },
};
const MODULOS = ['iso', 'privacy'];

/** Telas que só existem no n.iso e só no n.privacy. O resto (cadastro, sistema) aparece nos dois e no início do n.360. */
export const SO_ISO = ['nav-dashboard', 'nav-leads', 'nav-assessments', 'nav-proposals', 'nav-catalogo', 'nav-config', 'nav-project', 'nav-monitor',
    'nav-soa', 'nav-context', 'nav-risks', 'nav-vendors', 'nav-acknowledgments', 'nav-policies', 'nav-audits', 'nav-capa', 'nav-incidentes', 'nav-mgmt'];
export const SO_PRIVACY = ['nav-encarregado', 'nav-requisitos', 'nav-terceiros', 'nav-titular'];

/** O produto do caminho (vale igual em localhost). */
export function produtoAtual(loc = window.location) {
    const m = /^\/(iso|privacy)(\/|$)/.exec(loc.pathname || '/');
    return m ? m[1] : 'n360';
}

// Domínios antigos → prefixo do módulo no n.360. O Worker já dá 308 no que passa por ele; isto cobre a raiz e o /login,
// que saem como arquivo estático antes do Worker.
const CANONICO = 'https://n360.ness.com.br';
const LEGADOS = { 'niso.ness.com.br': '/iso', 'n-iso.ness.com.br': '/iso', 'niso.ness.workers.dev': '/iso', 'nprivacy.ness.com.br': '/privacy' };

/** Para onde ir quando o app abre num domínio antigo; null no n.360 e em localhost. O fragmento segue (SSO e tokens vão nele). */
export function destinoLegado(loc = window.location) {
    const prefixo = LEGADOS[String(loc.hostname || '').toLowerCase()];
    if (!prefixo) return null;
    const p = loc.pathname || '/';
    return `${CANONICO}${prefixo}${p === '/' || p === '/login' || p === '/login.html' ? '' : p}${loc.search || ''}${loc.hash || ''}`;
}

/** Navegação de página (um ponto só, para os testes dublarem: o jsdom não navega). `trocar` não deixa a página no histórico. */
export function irPara(url, trocar = false) {
    if (trocar) window.location.replace(url); else window.location.assign(url);
}

/** Os módulos de um projeto. Projeto sem a lista (resposta antiga) conta como só n.iso, o comportamento anterior. */
export const modulosDe = (p) => (Array.isArray(p && p.modulos) && p.modulos.length ? p.modulos : ['iso']);
export const temProduto = (p, produto = produtoAtual()) => modulosDe(p).includes(produto);
/** O projeto do id recebido (o modal pode ser de outro projeto que não o ativo); sem ele na lista, o ativo. */
export const projetoDoId = (projectId) => (S.projects || []).find((p) => p.id === projectId) || S.activeProject;

/** De qual produto é a tela (pelo item do menu); null quando aparece nos dois. */
export function produtoDaTela(tela) {
    if (SO_ISO.includes(`nav-${tela}`)) return 'iso';
    if (SO_PRIVACY.includes(`nav-${tela}`)) return 'privacy';
    return null;
}

/** Caminho do produto na mesma origem: '/', '/iso' ou '/privacy'. */
export const enderecoDoProduto = (produto) => (MODULOS.includes(produto) ? `/${produto}` : '/');

/** Para onde um aviso leva: a tela, ou o caminho do módulo quando a tela é só de outro. */
export function destinoDoAviso(tela, loc = window.location) {
    const dono = produtoDaTela(tela);
    return dono && dono !== produtoAtual(loc) ? { href: enderecoDoProduto(dono) } : { navegar: tela };
}

const marca = (produto) => `n<span style="color:var(--accent)">.</span><span class="brand-tail">${PRODUTOS[produto].nome}</span>`;

/** Aplica a casca do produto ao documento: título, marcas, menu. Idempotente. */
export function aplicarCasca(produto = produtoAtual(), doc = document) {
    const nome = PRODUTOS[produto].nome;
    doc.documentElement.dataset.produto = produto;
    doc.title = PRODUTOS[produto].titulo;
    const logo = doc.getElementById('sidebar-logo-mark');
    if (logo) logo.innerHTML = marca(produto);
    doc.querySelectorAll('.entry-mark, .login-brand-logo').forEach((el) => { el.innerHTML = `n<span>.</span>${nome}`; });
    if (produto !== 'iso') {
        const t = doc.querySelector('.entry-title');
        const l = doc.querySelector('.entry-lede');
        if (produto === 'privacy') {
            if (t) t.textContent = 'Privacidade e LGPD conduzidas, do inventário à resposta ao titular.';
            if (l) l.innerHTML = 'O ambiente onde sua organização e a ness<span class="entry-dot">.</span> trabalham juntas: tratamentos, terceiros, pedidos do titular e incidentes em um só lugar.';
        } else {
            if (t) t.textContent = 'Segurança da informação e privacidade, num só lugar.';
            if (l) l.innerHTML = 'A plataforma onde sua organização e a ness<span class="entry-dot">.</span> trabalham juntas. Os módulos n.iso (conformidade ISO 27001 e 27701) e n.privacy (LGPD) usam o mesmo cadastro.';
        }
        doc.querySelectorAll('.entry-section').forEach((s) => { s.hidden = true; });
        // O "conheça o n.iso" leva às seções escondidas acima, e o rodapé traz a versão do n.iso.
        const mais = doc.querySelector('.entry-more');
        if (mais) mais.hidden = true;
        doc.querySelectorAll('.login-sign-links').forEach((s) => { s.innerHTML = s.innerHTML.replace(/n\.iso \d+\.\d+\.\d+/, `n.${nome}`); });
    }
    const esconder = new Set(produto === 'privacy' ? SO_ISO : produto === 'iso' ? SO_PRIVACY : [...SO_ISO, ...SO_PRIVACY]);
    doc.querySelectorAll('.sidebar-nav[id^="nav-"]').forEach((n) => { if (esconder.has(n.id)) n.dataset.foraDoProduto = '1'; else delete n.dataset.foraDoProduto; });
    // Grupo sem nenhum item do produto some inteiro (rótulo e grupo).
    doc.querySelectorAll('.sidebar-group').forEach((g) => {
        const vazio = [...g.querySelectorAll('.sidebar-nav[id^="nav-"]')].every((n) => n.dataset.foraDoProduto === '1');
        const rotulo = g.previousElementSibling && g.previousElementSibling.classList.contains('sidebar-label') ? g.previousElementSibling : null;
        g.dataset.foraDoProduto = vazio ? '1' : '';
        if (rotulo) rotulo.dataset.foraDoProduto = vazio ? '1' : '';
    });
    const rotuloPriv = doc.querySelector('[data-args=\'["group-privacy"]\']');
    if (rotuloPriv) { rotuloPriv.textContent = 'Privacidade'; rotuloPriv.removeAttribute('aria-label'); }
    const rotuloOps = doc.querySelector('[data-args=\'["group-ops"]\']');
    if (rotuloOps) rotuloOps.textContent = produto === 'iso' ? 'Operacional' : 'Cadastro';
    const rotuloImpl = doc.querySelector('[data-args=\'["group-impl"]\']');
    if (rotuloImpl) rotuloImpl.textContent = produto === 'iso' ? 'Implementação' : 'Governança';
}

/** Só os projetos que têm o módulo do caminho; no início do n.360, todos. */
export const projetosDoProduto = (lista, produto = produtoAtual()) => (!Array.isArray(lista) ? [] : produto === 'n360' ? lista : lista.filter((p) => temProduto(p, produto)));

/** Tela de quem entrou num módulo que nenhum projeto seu tem (ou no n.360 sem módulo em projeto nenhum). */
export function semAcesso(c, produto = produtoAtual()) {
    const nome = PRODUTOS[produto].nome;
    const h = document.getElementById('header-title');
    if (h) h.textContent = `n.${nome}`;
    c.innerHTML = produto === 'n360'
        ? `<div class="empty-state fade-in" id="sem-acesso-produto"><h3>Você ainda não tem acesso a nenhum módulo do n.360</h3>
        <p>Nenhum projeto seu tem o n.iso ou o n.privacy habilitado. Fale com a ness. para contratar.</p></div>`
        : `<div class="empty-state fade-in" id="sem-acesso-produto"><h3>Você não tem acesso ao n.${escapeHTML(nome)}</h3>
        <p>Nenhum projeto seu tem este módulo habilitado. Fale com a ness. para contratar, ou volte ao n.360.</p>
        <a class="btn btn-primary" style="margin-top:1rem" href="${escapeHTML(enderecoDoProduto('n360'))}">Abrir o n.360</a></div>`;
}

/** Link (no rodapé da barra) criado uma vez e reaproveitado. */
function linkDaBarra(doc, id) {
    let el = doc.getElementById(id);
    if (el) return el;
    const sidebar = doc.getElementById('sidebar');
    if (!sidebar) return null;
    el = doc.createElement('a');
    el.id = id;
    el.className = 'sidebar-nav';
    el.style.cssText = 'display:block;margin:0.5rem 1rem;font-size:0.8rem';
    sidebar.appendChild(el);
    return el;
}

/** Num módulo: "n.360" de volta ao início e, quando o projeto ativo tem os dois, o link para o outro módulo. */
export function atualizarLinkCruzado(doc = document) {
    const produto = produtoAtual();
    const tirar = (id) => { const el = doc.getElementById(id); if (el) el.remove(); };
    if (produto === 'n360') { tirar('link-n360'); tirar('link-outro-produto'); return; }
    const volta = linkDaBarra(doc, 'link-n360');
    if (volta) { volta.href = enderecoDoProduto('n360'); volta.textContent = 'n.360'; }
    const outro = produto === 'privacy' ? 'iso' : 'privacy';
    const mostrar = S.activeProject && temProduto(S.activeProject, outro) && temProduto(S.activeProject, produto);
    if (!mostrar) { tirar('link-outro-produto'); return; }
    const el = linkDaBarra(doc, 'link-outro-produto');
    if (!el) return;
    el.href = enderecoDoProduto(outro);
    el.textContent = `Abrir este projeto no n.${outro}`;
}

// ─── Produtos do projeto (habilitar e desligar) ─────────────────────────────────────────────────────────

const podeGerir = () => !!S.user && ['platform_admin', 'consultoria_admin'].includes(S.user.role);

window.abrirProdutosDoProjeto = async function (projectId) {
    let estado;
    try { estado = await api('GET', `/api/v1/projects/${projectId}/modulos`); } catch (e) { showToast((e && e.message) || 'Não foi possível ler os produtos', 'error'); return; }
    const hab = Array.isArray(estado.habilitados) ? estado.habilitados : [];
    const contr = Array.isArray(estado.contratados) ? estado.contratados : [];
    const linha = (m) => {
        const ligado = hab.includes(m);
        const pode = podeGerir() && (ligado || contr.includes(m));
        return `<tr><td><strong>n.${m}</strong></td><td>${ligado ? 'Habilitado' : 'Desligado'}${contr.includes(m) ? '' : ' · não contratado pela organização'}</td>
            <td style="text-align:right">${pode ? `<button class="btn btn-sm ${ligado ? 'btn-ghost' : 'btn-primary'}" data-action="alternarProdutoDoProjeto" data-args='${escapeHTML(JSON.stringify([projectId, m, !ligado]))}'>${ligado ? 'Desligar' : 'Habilitar'}</button>` : ''}</td></tr>`;
    };
    openModal(`<h3>Produtos do projeto</h3>
        <p style="color:var(--text-dim)">Os dois produtos usam o mesmo cadastro (partes, itens, documentos, RoPA, DPIA, evidências). Desligar um produto não apaga dado: ele volta ao religar.</p>
        <table class="data-table" id="produtos-do-projeto"><tbody>${linha('iso')}${linha('privacy')}</tbody></table>`);
};

window.alternarProdutoDoProjeto = async function (projectId, modulo, habilitar) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/modulos/${modulo}`, { habilitado: habilitar });
        showToast(`n.${modulo} ${habilitar ? 'habilitado' : 'desligado'} neste projeto.`, 'success');
        if (typeof window.loadProjects === 'function') await window.loadProjects();
        await window.abrirProdutosDoProjeto(projectId);
    } catch (e) { showToast((e && e.message) || 'Não foi possível alterar o produto', 'error'); }
};

window.temProduto = temProduto;
window.produtoAtual = produtoAtual;
window.projetosDoProduto = projetosDoProduto;
