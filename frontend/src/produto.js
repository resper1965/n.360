import { S } from './state.js';
import { podeEditarOt } from './ot-comum.js';
import { api } from './api.js';
import { showToast, openModal, escapeHTML, renderEmptyState } from './ui.js';
import { filtroValido } from './filtro-painel.js';

/** A pessoa é de organização direta (`org_tipo` do /auth/me, lido do banco): só escolhe textos; quem autoriza é o servidor. */
export const orgDireta = () => S.user?.org_tipo === 'direta';

// O n.360 é a plataforma-mãe; n.iso, n.privacy e n.ot são módulos dele sobre o mesmo cadastro (decisão de 11/10/2026; n.ot em
// 30/10/2026). Tudo responde em n360.ness.com.br e o CAMINHO decide a casca: /iso… → n.iso, /privacy… → n.privacy, /ot… → n.ot,
// o resto → o início do n.360. A trava
// de verdade é do servidor (403 sem o módulo do projeto); aqui só se mostra o produto certo e os projetos que o têm.

export const PRODUTOS = {
    n360: { nome: '360', titulo: 'n.360 | ness.', inicio: 'inicio' },
    iso: { nome: 'iso', titulo: 'n.iso | ness. Agentic GRC', inicio: 'dashboard' },
    privacy: { nome: 'privacy', titulo: 'n.privacy | ness. Privacidade', inicio: 'encarregado' },
    ot: { nome: 'ot', titulo: 'n.ot | ness. ARCiber', inicio: 'ot' },
};
const MODULOS = ['iso', 'privacy', 'ot'];

/** Telas que só existem no n.iso e só no n.privacy. O resto (cadastro, sistema) aparece nos dois e no início do n.360. */
export const SO_ISO = ['nav-dashboard', 'nav-comercial', 'nav-leads', 'nav-assessments', 'nav-proposals', 'nav-catalogo', 'nav-config', 'nav-project',
    'nav-soa', 'nav-stakeholders', 'nav-context', 'nav-assets', 'nav-risks', 'nav-vendors', 'nav-acknowledgments', 'nav-audits', 'nav-capa',
    'nav-incidentes', 'nav-mgmt'];
export const SO_PRIVACY = ['nav-encarregado', 'nav-empresas', 'nav-importacao', 'nav-requisitos', 'nav-referencia-juridica', 'nav-sistemas', 'nav-terceiros', 'nav-avaliacoes-terceiros', 'nav-questionarios-fornecedor', 'nav-titulares', 'nav-dados-titular',
    'nav-parceiros', 'nav-documentos-arquivo', 'nav-titular', 'nav-incidentes-privacy', 'nav-consentimentos', 'nav-mapa-de-risco', 'nav-lia', 'nav-gaps'];
/**
 * O n.ot tem uma tela só (`views/ot.js`); o menu dele são as subtelas (`window.otTela`). `nav-ot` não é mais item de menu (o n.ot abre
 * pelo "Abrir no n.ot" da linha do projeto no Início), mas fica aqui: é o que diz que a tela `ot` é do n.ot (`produtoDaTela`).
 */
export const SO_OT = ['nav-ot', 'nav-ot-inicio', 'nav-ot-painel', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-fornecedores', 'nav-ot-acessos'];
/**
 * Conta e acessos (n.360, fatia 2): telas que só o n.360 mostra no menu, cada uma com o item dela. É também a lista
 * fechada do `?tela=` com que o rodapé de um módulo abre o n.360 (`telaPedida`).
 */
export const TELAS_DA_CONTA = { projects: 'nav-projects', users: 'nav-users', organizacoes: 'nav-organizacoes', 'identidade-org': 'nav-identidade', 'modelos-fornecedor': 'nav-modelos-fornecedor', 'api-keys': 'nav-api-keys', 'conectar-agente': 'nav-conectar-agente' };
export const SO_N360 = Object.values(TELAS_DA_CONTA);
/**
 * O n.360 é o hub, não um terceiro módulo: o menu dele tem só isto (a conta, os pedidos da pessoa, o acesso do projeto e a
 * trilha). Segurança do projeto mora em Conta e acessos, então também é só do n.360. Tela fora daqui leva ao módulo (router).
 */
export const NAV_DO_HUB = ['nav-inicio', 'nav-meus', ...SO_N360, 'nav-seguranca-projeto', 'nav-audit-trail'];
export const TELAS_DO_HUB = ['inicio', 'meus-pedidos', ...Object.keys(TELAS_DA_CONTA), 'seguranca-projeto', 'audit-trail', 'sem-acesso-produto'];
// Telas do n.iso sem item próprio no menu (abertas de dentro de outra tela ou por aviso).
const DO_ISO_SEM_ITEM = ['project-detail', 'controls', 'metrics', 'audit-execution', 'assessment-detail', 'management-review'];
// Do n.privacy sem item próprio: a ficha do fornecedor (aberta pela lista de Fornecedores).
const DO_PRIVACY_SEM_ITEM = ['terceiro', 'lia-ficha'];

/** O produto do caminho (vale igual em localhost). */
export function produtoAtual(loc = window.location) {
    const m = /^\/(iso|privacy|ot)(\/|$)/.exec(loc.pathname || '/');
    return m ? m[1] : 'n360';
}

// Domínios antigos → prefixo do módulo. O Worker já dá 308 no que passa por ele; isto cobre a raiz e o /login, que saem
// como arquivo estático antes do Worker.
const LEGADOS = { 'niso.ness.com.br': '/iso', 'n-iso.ness.com.br': '/iso', 'niso.ness.workers.dev': '/iso', 'nprivacy.ness.com.br': '/privacy' };

/**
 * Para onde ir quando o app abre num domínio antigo; null no n.360, em localhost, quando o endereço canônico é o próprio
 * host (APP_URL no niso: antes da troca ou na volta atrás) e quando o /health falha (fica onde está, sem laço). O destino
 * vem do servidor (`app_url` do /health da mesma origem), como no 308 do Worker. O fragmento segue (SSO e tokens vão nele).
 */
export async function destinoLegado(loc = window.location) {
    const host = String(loc.hostname || '').toLowerCase();
    const prefixo = LEGADOS[host];
    if (!prefixo) return null;
    let base;
    try {
        const r = await fetch('/health', { cache: 'no-store' });
        if (!r.ok) return null;
        base = new URL((await r.json()).app_url);
    } catch (e) { return null; }
    if (base.hostname === host) return null;
    const p = loc.pathname || '/';
    const resto = p === '/' || p === '/login' || p === '/login.html' ? '' : p === prefixo || p.startsWith(`${prefixo}/`) ? p.slice(prefixo.length) : p;
    return `${base.origin}${prefixo}${resto}${loc.search || ''}${loc.hash || ''}`;
}

/** A ficha do fornecedor (`?tela=terceiro&parte=&aba=`), a do RIPD (`?tela=ripd-ficha&dpia=&aba=`) e a da LIA (`?tela=lia-ficha&ropa=&aba=`) vivem no endereço; fora delas, esses parâmetros saem. */
export function limparFichaDoEndereco() {
    if (!['terceiro', 'ripd-ficha', 'lia-ficha', 'incidente-ficha'].includes(new URLSearchParams(window.location.search).get('tela'))) return;
    const u = new URL(window.location.href);
    for (const k of ['tela', 'parte', 'dpia', 'ropa', 'incidente', 'aba']) u.searchParams.delete(k);
    window.history.replaceState(null, '', u);
}

/** Navegação de página (um ponto só, para os testes dublarem: o jsdom não navega). `trocar` não deixa a página no histórico. */
export function irPara(url, trocar = false) {
    if (trocar) window.location.replace(url); else window.location.assign(url);
}

/** Os módulos de um projeto. Projeto sem a lista (resposta antiga) conta como só n.iso, o comportamento anterior. */
export const modulosDe = (p) => (Array.isArray(p && p.modulos) && p.modulos.length ? p.modulos : ['iso']);
/**
 * Os módulos da PESSOA (`S.user.modulos`, do /auth/me); platform_admin tem todos. Sem o campo (resposta antiga), null:
 * nada é filtrado, o comportamento anterior. A trava de verdade é do servidor.
 */
export const modulosDaPessoa = () => (S.user && S.user.role === 'platform_admin' ? MODULOS : S.user && Array.isArray(S.user.modulos) ? S.user.modulos : null);
/** Os módulos do projeto que a pessoa também tem. */
export const modulosVisiveis = (p) => { const meus = modulosDaPessoa(); return meus ? modulosDe(p).filter((m) => meus.includes(m)) : modulosDe(p); };
export const temProduto = (p, produto = produtoAtual()) => modulosVisiveis(p).includes(produto);
/** O projeto do id recebido (o modal pode ser de outro projeto que não o ativo); sem ele na lista, o ativo. */
export const projetoDoId = (projectId) => (S.projects || []).find((p) => p.id === projectId) || S.activeProject;

/** De qual produto é a tela (pelo item do menu); null quando aparece nos dois. */
export function produtoDaTela(tela) {
    if (SO_ISO.includes(`nav-${tela}`)) return 'iso';
    if (SO_PRIVACY.includes(`nav-${tela}`)) return 'privacy';
    if (SO_OT.includes(`nav-${tela}`)) return 'ot';
    return null;
}

/** O módulo de uma tela, para o hub: o do item do menu, ou o n.iso nas telas dele sem item; null nas do cadastro (dos dois). */
export const moduloDaTela = (tela) => (DO_ISO_SEM_ITEM.includes(tela) ? 'iso' : DO_PRIVACY_SEM_ITEM.includes(tela) ? 'privacy' : produtoDaTela(tela));

/** Caminho do produto na mesma origem: '/', '/iso', '/privacy' ou '/ot'. */
export const enderecoDoProduto = (produto) => (MODULOS.includes(produto) ? `/${produto}` : '/');

/** Para onde um aviso leva: a tela, ou o caminho do módulo quando a tela é só de outro. No n.360 navega: o router leva ao módulo. */
export function destinoDoAviso(tela, loc = window.location) {
    // Tela que saiu do menu (alias): o dono é o da tela que a substitui (o n.iso), e o endereço leva o nome antigo para a aba certa.
    const alias = aliasDaTela(tela);
    const dono = alias ? moduloDaTela(alias.tela) : produtoDaTela(tela);
    const aqui = produtoAtual(loc);
    return dono && aqui !== 'n360' && dono !== aqui ? { href: enderecoDoProduto(dono) + (alias ? `?tela=${encodeURIComponent(tela)}` : '') } : { navegar: tela };
}

/**
 * Telas dos módulos (as que o render desenha fora do hub): a lista fechada do `?tela=` com que o n.360 abre um módulo na tela
 * pedida (`pedidoDoHub`). Tela nova de módulo entra aqui; o teste confere que cada uma tem ramo no render.
 */
export const TELAS_DOS_MODULOS = ['dashboard', 'comercial', 'leads', 'assessments', 'proposals', 'assets', 'metrics', 'acknowledgments',
    'risks', 'vendors', 'partes', 'areas', 'sistemas', 'documentos', 'politica', 'organizar-politicas', 'requisitos', 'referencia-juridica', 'terceiros', 'terceiro', 'ripd-ficha', 'lia-ficha', 'incidente-ficha', 'avaliacoes-terceiros', 'questionarios-fornecedor', 'titulares', 'dados-titular', 'parceiros', 'empresas', 'documentos-arquivo', 'titular', 'encarregado', 'mapa-de-risco', 'gaps', 'lia', 'importacao',
    'training', 'ropa', 'ropa-atividade', 'dpia', 'audits', 'capa', 'evidence', 'controls', 'governance', 'ai-chat', 'settings', 'catalogo',
    'config-comercial', 'assessment-detail', 'project-detail', 'soa', 'stakeholders', 'context', 'audit-execution', 'management-review', 'ot'];
/**
 * Telas que saíram do menu e seguem valendo como endereço (link salvo, e-mail, aviso, `?tela=`): a tela que as substitui e, se
 * houver, a aba dela. Nunca 404 nem tela em branco (o `render` não desenha nada para tela sem ramo). Lista fechada;
 * `Object.hasOwn` barra `__proto__`/`constructor`.
 */
export const ALIAS_DE_TELA = { monitor: { tela: 'project-detail' }, certification: { tela: 'project-detail', jornadaAba: 'prontidao' } };
export const aliasDaTela = (tela) => (typeof tela === 'string' && Object.hasOwn(ALIAS_DE_TELA, tela) ? ALIAS_DE_TELA[tela] : null);
// O aviso do sino clicado no n.360, guardado para o módulo reabri-lo (modal da CAPA, linha do SoA, aba de incidentes, projeto).
const CHAVE_AVISO = 'n360_aviso';
// O filtro do painel (filtro-painel.js) que acompanha a tela: só a chave da lista fechada, no storage e não no endereço.
const CHAVE_FILTRO = 'n360_filtro';
const texto = (v) => (typeof v === 'string' ? v : '');
const avisoLimpo = (x) => (x && typeof x === 'object'
    ? { link: texto(x.link), action_type: texto(x.action_type), target_id: texto(x.target_id), title: texto(x.title), message: texto(x.message) } : null);
// Incidentes: a tela titular na aba de incidentes, que os dois módulos têm.
const ehIncidentes = (tela) => tela === 'titular' && S.titularAba === 'incidentes';

/**
 * Em qual módulo o n.360 abre a tela: o dono dela; nas que os dois têm (cadastro, incidentes), um que o projeto tem (o n.iso
 * primeiro; nos incidentes, o n.privacy). Null quando o projeto não tem nenhum dos dois: o hub fica no início.
 */
export function moduloPara(tela, proj) {
    const dono = ehIncidentes(tela) ? null : moduloDaTela(tela);
    if (dono) return dono;
    if (!TELAS_DOS_MODULOS.includes(tela) || !proj) return null;
    const tem = modulosVisiveis(proj);
    // O n.ot não tem tela do cadastro comum: só os dois primeiros abrem as telas compartilhadas.
    return (ehIncidentes(tela) ? ['privacy', 'iso'] : ['iso', 'privacy']).find((m) => tem.includes(m)) || null;
}

/** O endereço da tela no módulo, para sair do n.360; guarda o projeto (o state o hidrata de lá) e o aviso em curso, se houver. */
export function enderecoNoModulo(modulo, tela, proj) {
    const aviso = avisoLimpo(S.avisoEmCurso);
    S.avisoEmCurso = null;
    try {
        if (aviso) sessionStorage.setItem(CHAVE_AVISO, JSON.stringify(aviso));
        const f = S.filtroPainel && S.filtroPainel.tela === tela ? filtroValido(tela, S.filtroPainel.aba, S.filtroPainel.filtro) : null;
        if (f) sessionStorage.setItem(CHAVE_FILTRO, JSON.stringify(f)); else sessionStorage.removeItem(CHAVE_FILTRO);
        const p = proj && (S.projects || []).find((x) => x.id === proj.id);
        if (p) localStorage.setItem('niso_activeProject', JSON.stringify(p));
    } catch (e) { /* sem storage: o módulo abre a tela no projeto salvo */ }
    return `${enderecoDoProduto(modulo)}?tela=${encodeURIComponent(tela)}${ehIncidentes(tela) ? '&aba=incidentes' : ''}${alvoNoEndereco(tela)}`;
}

/** O passo ou a fase da Bancada que o n.360 leva ao módulo (`&fase=3&passo=p3_3`); só na tela da jornada. */
function alvoNoEndereco(tela) {
    const alvo = (tela === 'project-detail' || (aliasDaTela(tela) || {}).tela === 'project-detail') ? S.bancadaAlvo : null;
    if (!alvo) return '';
    const par = (k, v) => (v !== undefined && v !== null && v !== '' ? `&${k}=${encodeURIComponent(v)}` : '');
    return `${par('fase', alvo.fase)}${par('passo', alvo.passo)}`;
}

/**
 * O alvo da Bancada no endereço (`?fase=3&passo=p3_3`), lido no boot. Não tira nada do endereço: a própria Bancada o mantém em dia
 * a cada passo, então recarregar a página ou copiar o link volta ao mesmo passo. Null sem nenhum dos dois.
 */
export function alvoDaBancada(loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    const fase = q.get('fase');
    const passo = q.get('passo');
    return fase || passo ? { fase, passo } : null;
}

/**
 * O pedido do n.360 lido uma vez no boot do módulo: `?tela=` (lista fechada, tela deste módulo ou dos dois) e o aviso guardado.
 * Os parâmetros saem do endereço e o aviso do storage. Null fora de módulo, sem `?tela=` ou com tela que não vale aqui.
 */
export function pedidoDoHub(loc = window.location) {
    const produto = produtoAtual(loc);
    if (produto === 'n360') return null;
    let aviso = null;
    let filtro = null;
    try {
        const bruto = sessionStorage.getItem(CHAVE_AVISO);
        sessionStorage.removeItem(CHAVE_AVISO);
        aviso = bruto ? avisoLimpo(JSON.parse(bruto)) : null;
    } catch (e) { aviso = null; }
    try {
        const f = JSON.parse(sessionStorage.getItem(CHAVE_FILTRO) || 'null');
        sessionStorage.removeItem(CHAVE_FILTRO);
        filtro = f && typeof f === 'object' ? filtroValido(f.tela, f.aba, f.filtro) : null;
    } catch (e) { filtro = null; }
    const q = new URLSearchParams(loc.search || '');
    if (!q.has('tela')) return null;
    const tela = q.get('tela');
    const aba = q.get('aba') === 'incidentes' && tela === 'titular' ? 'incidentes' : null;
    // A ficha do fornecedor (?tela=terceiro&parte=&aba=) e a do RIPD (?tela=ripd-ficha&dpia=&aba=) vivem no endereço: recarregar volta a ela, na mesma aba.
    if (!['terceiro', 'ripd-ficha', 'lia-ficha', 'incidente-ficha'].includes(tela)) { q.delete('tela'); q.delete('aba'); }
    const resto = q.toString();
    history.replaceState(history.state, '', `${loc.pathname}${resto ? `?${resto}` : ''}${loc.hash || ''}`);
    if (aviso) return { aviso };
    // Tela que saiu (alias) vale pelo destino; devolve o nome pedido: o navigate resolve o alias (e a aba, quando há).
    const real = aliasDaTela(tela)?.tela ?? tela;
    const dono = moduloDaTela(real);
    return TELAS_DOS_MODULOS.includes(real) && (dono === null || dono === produto || aba) ? { tela, aba, ...(filtro && filtro.tela === tela ? { filtro } : {}) } : null;
}

const rotuloDoGrupo = (doc, grupo) => doc.querySelector(`.sidebar-label[data-args='["${grupo}"]']`);
/** Abre o grupo (sem fechar os outros) e acerta o rótulo; usado pela casca e pelo router (grupo do item ativo). */
export function abrirGrupo(grupo, doc = document) {
    if (!grupo || !grupo.classList.contains('sidebar-group')) return;
    grupo.classList.add('expanded');
    const rotulo = rotuloDoGrupo(doc, grupo.id);
    if (rotulo) { rotulo.classList.remove('collapsed'); rotulo.setAttribute('aria-expanded', 'true'); }
}

const marca = (produto) => `n<span style="color:var(--accent)">.</span><span class="brand-tail">${PRODUTOS[produto].nome}</span>`;

// Rótulos do n.privacy (revistos em 11/11/2026): o mapa guarda só o que difere por módulo; o n.iso mostra "Pessoas e parceiros".
export const ROTULOS_PRIVACY = {
    'nav-encarregado': 'Painel', 'nav-ropa': 'Atividades', 'nav-partes': 'Pessoas', 'nav-requisitos': 'Cobertura da LGPD',
    'nav-titular': 'Solicitações', 'nav-avaliacoes-terceiros': 'Avaliações', 'nav-questionarios-fornecedor': 'Questionários',
};

/**
 * Menu do n.privacy (só aqui, o n.iso e o n.360 não mudam). Parte da ordem do legado (spec 2026-10-19), revista em 11/11/2026: o
 * atendimento com prazo legal (Solicitações, Incidentes, Consentimentos) fica numa seção à vista, a Cobertura da LGPD abre o
 * Diagnóstico e Arquivos e Políticas ficam juntos; no "Mais" sobra o que é consulta ou configuração. Painel e Empresas no topo, sete
 * seções FIXAS e o Assistente no fim. O título de seção não é botão e não recolhe: tudo fica à vista. Os itens são os mesmos
 * `.sidebar-nav` de sempre, movidos para `ul`/`li`; os grupos de onde saíram ficam vazios e somem.
 */
export const SECOES_PRIVACY = [
    ['', ['nav-encarregado', 'nav-empresas']],
    ['Cadastros', ['nav-areas', 'nav-sistemas', 'nav-titulares', 'nav-dados-titular', 'nav-parceiros', 'nav-partes']],
    ['Mapeamento', ['nav-ropa', 'nav-dpia', 'nav-lia']],
    ['Diagnóstico', ['nav-requisitos', 'nav-gaps', 'nav-mapa-de-risco']],
    ['Fornecedores', ['nav-terceiros', 'nav-avaliacoes-terceiros', 'nav-questionarios-fornecedor']],
    ['Atendimento', ['nav-titular', 'nav-incidentes-privacy', 'nav-consentimentos']],
    ['Documentos', ['nav-documentos-arquivo', 'nav-documentos']],
    ['Mais', ['nav-referencia-juridica', 'nav-evidence', 'nav-training', 'nav-governance', 'nav-importacao']],
    ['', ['nav-ai']],
];
/** Fora do menu do n.privacy: Minhas aprovações e Trilha de auditoria vão para o menu de conta; Preços e margens é do comercial do n.iso. */
export const FORA_DO_MENU_PRIVACY = ['nav-meus', 'nav-audit-trail', 'nav-settings'];

function organizarMenuPrivacy(doc) {
    const ancora = doc.getElementById('nav-dashboard');
    if (ancora && !doc.getElementById('secoes-privacy')) {
        const caixa = doc.createElement('div');
        caixa.id = 'secoes-privacy';
        SECOES_PRIVACY.forEach(([titulo, ids], n) => {
            const ul = doc.createElement('ul');
            ul.className = 'sidebar-secao-lista';
            if (titulo) {
                const t = doc.createElement('div');
                t.className = 'sidebar-secao group-project-only';
                t.id = `secao-${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`;
                t.textContent = titulo;
                caixa.appendChild(t);
                ul.classList.add('group-project-only');
                ul.setAttribute('aria-labelledby', t.id);
            } else if (n) ul.classList.add('sidebar-secao-fim');
            for (const id of ids) {
                const el = doc.getElementById(id);
                if (!el) continue;
                const li = doc.createElement('li');
                li.appendChild(el);
                ul.appendChild(li);
            }
            caixa.appendChild(ul);
        });
        ancora.after(caixa);
    }
    for (const [id, rotulo] of Object.entries(ROTULOS_PRIVACY)) {
        const t = doc.querySelector(`#${id} .sidebar-nav-text`);
        if (t) t.textContent = rotulo;
    }
}

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
        if (produto === 'ot') {
            if (t) t.textContent = 'Segurança cibernética do ARCiber, pela rotina operacional RO-CB.BR.01 do ONS.';
            if (l) l.innerHTML = 'O ambiente onde sua empresa e a ness<span class="entry-dot">.</span> conduzem o levantamento e a conformidade de OT.';
        } else if (produto === 'privacy') {
            if (t) t.textContent = 'Privacidade e LGPD conduzidas, do inventário à resposta ao titular.';
            if (l) l.innerHTML = 'O ambiente onde sua empresa e a ness<span class="entry-dot">.</span> trabalham juntas: tratamentos, terceiros, pedidos do titular e incidentes em um só lugar.';
        } else {
            if (t) t.textContent = 'Segurança da informação e privacidade, num só lugar.';
            if (l) l.innerHTML = 'A plataforma onde sua empresa e a ness<span class="entry-dot">.</span> trabalham juntas. Os módulos n.iso (conformidade ISO 27001 e 27701) e n.privacy (LGPD) usam o mesmo cadastro.';
        }
        doc.querySelectorAll('.entry-section').forEach((s) => { s.hidden = true; });
        // O "conheça o n.iso" leva às seções escondidas acima, e o rodapé traz a versão do n.iso.
        const mais = doc.querySelector('.entry-more');
        if (mais) mais.hidden = true;
        doc.querySelectorAll('.login-sign-links').forEach((s) => { s.innerHTML = s.innerHTML.replace(/n\.iso \d+\.\d+\.\d+/, `n.${nome}`); });
    }
    // O Início é do n.360; nos módulos, a volta é o link "n.360" do rodapé.
    // Conta e acessos também: nos módulos, o rodapé leva a ela no n.360.
    // No n.360 (hub) fica só NAV_DO_HUB. Segurança do projeto está em Conta e acessos: nos módulos sai com o grupo.
    const doHub = new Set(NAV_DO_HUB);
    const esconder = produto === 'n360' ? (id) => !doHub.has(id)
        : produto === 'ot' ? (id) => !SO_OT.includes(id)
        : (id) => (produto === 'privacy' ? [...SO_ISO, ...FORA_DO_MENU_PRIVACY] : SO_PRIVACY).includes(id) || SO_OT.includes(id) || SO_N360.includes(id) || id === 'nav-inicio' || id === 'nav-seguranca-projeto';
    if (produto === 'privacy') organizarMenuPrivacy(doc);
    doc.querySelectorAll('.sidebar-nav[id^="nav-"]').forEach((n) => { if (esconder(n.id)) n.dataset.foraDoProduto = '1'; else delete n.dataset.foraDoProduto; });
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

/**
 * Ninguém com projeto nenhum, em qualquer casca (S.totalProjetos, da lista inteira do loadProjects). A equipe da ness. vê o
 * caminho que o papel alcança: o funil comercial do n.iso (o projeto nasce da proposta aprovada) e as organizações; o
 * cliente sabe a quem pedir. Só o que mostrar: o servidor barra o resto.
 */
function semProjetoNenhum() {
    const id = 'sem-acesso-produto';
    const comercial = typeof window.comercialAtivo === 'function' && window.comercialAtivo();
    const doComercial = comercial && typeof window.ehComercial === 'function' && window.ehComercial();
    // O papel comercial não conduz projeto, mas o trabalho dele (o funil) começa sem projeto nenhum: vê o caminho, não "a quem pedir".
    if (!(typeof window.ehEquipeNess === 'function' && window.ehEquipeNess()) && !doComercial) {
        return renderEmptyState({ id, titulo: 'Você ainda não tem acesso a um projeto',
            texto: 'Peça à consultoria que conduz o trabalho, ou ao administrador da sua empresa, para incluir você no projeto.' });
    }
    const criaProjeto = S.user && ['platform_admin', 'consultoria_admin'].includes(S.user.role);
    const acao = [
        // Quem pode criar projeto: "Novo projeto" abre o assistente aqui mesmo (views/empresa.js), seja qual for a área comercial.
        criaProjeto ? '<button type="button" class="btn btn-primary" data-action="abrirNovoProjeto">Novo projeto</button>' : '',
        // Com a área comercial ligada, o funil é o caminho do comercial (primário) ou o alternativo de quem também cria (secundário).
        doComercial ? `<a class="btn ${criaProjeto ? 'btn-secondary' : 'btn-primary'}" href="${escapeHTML(enderecoDoProduto('iso'))}?tela=leads">Criar projeto</a>` : '',
        S.user && S.user.role === 'platform_admin' ? '<a class="btn btn-secondary" href="/?tela=organizacoes">Ver organizações</a>' : '',
    ].join('');
    return renderEmptyState({ id, titulo: 'Nenhum projeto ainda',
        texto: comercial ? 'O projeto nasce quando a proposta é aprovada, no funil comercial do n.iso: lead, diagnóstico e proposta.'
            : criaProjeto ? 'Crie o primeiro: o assistente pede a empresa, o programa e as pessoas.' : `Quem administra a ${orgDireta() ? 'organização' : 'consultoria'} cria o projeto e designa você nele.`, acao });
}

/** Tela de quem entrou num módulo que nenhum projeto seu tem (ou no n.360 sem módulo em projeto nenhum). */
export function semAcesso(c, produto = produtoAtual()) {
    const nome = PRODUTOS[produto].nome;
    const h = document.getElementById('header-title');
    if (h) h.textContent = `n.${nome}`;
    if (S.totalProjetos === 0) { c.innerHTML = semProjetoNenhum(); return; }
    c.innerHTML = produto === 'n360'
        ? renderEmptyState({ id: 'sem-acesso-produto', titulo: 'Você ainda não tem acesso a nenhum módulo do n.360',
            texto: 'Nenhum projeto seu tem o n.iso ou o n.privacy habilitado. Fale com a ness. para contratar.' })
        : renderEmptyState({ id: 'sem-acesso-produto', titulo: `Você não tem acesso ao n.${nome}`,
            // O n.ot nunca é concedido automaticamente (P0-1): sem ele, o comum é faltar a concessão à pessoa, não o contrato.
            texto: produto === 'ot' ? 'O n.ot é concedido pessoa a pessoa, mesmo quando o projeto já tem o módulo. Peça a concessão a quem administra os usuários do seu projeto, ou volte ao n.360.'
                : 'Nenhum projeto seu tem este módulo habilitado. Fale com a ness. para contratar, ou volte ao n.360.',
            acao: `<a class="btn btn-primary" href="${escapeHTML(enderecoDoProduto('n360'))}">Abrir o n.360</a>` });
}

const ORDEM_DOS_LINKS = ['link-n360', 'link-conta', 'link-outro-produto'];
/** Link (no rodapé da barra, dentro de `.sidebar-crosslinks`) criado uma vez e reaproveitado, sempre na mesma ordem. */
function linkDaBarra(doc, id) {
    let el = doc.getElementById(id);
    if (el) return el;
    const sidebar = doc.getElementById('sidebar');
    if (!sidebar) return null;
    let caixa = sidebar.querySelector('.sidebar-crosslinks');
    if (!caixa) {
        caixa = doc.createElement('div');
        caixa.className = 'sidebar-crosslinks';
        sidebar.insertBefore(caixa, sidebar.querySelector(':scope > .sidebar-bottom'));
    }
    el = doc.createElement('a');
    el.id = id;
    el.className = 'sidebar-crosslink';
    const depois = [...caixa.children].find((a) => ORDEM_DOS_LINKS.indexOf(a.id) > ORDEM_DOS_LINKS.indexOf(id));
    caixa.insertBefore(el, depois || null);
    return el;
}

/** O item do menu está à mostra para o papel (o updateHeaderUser esconde por style.display). */
export const itemVisivel = (doc, id) => { const el = doc.getElementById(id); return !!el && el.style.display !== 'none'; };

/**
 * Num módulo: "n.360" de volta ao início, "Conta e acessos (n.360)" na primeira tela da conta que o papel vê e, quando o
 * projeto ativo tem os dois, o link para o outro módulo.
 */
export function atualizarLinkCruzado(doc = document) {
    const produto = produtoAtual();
    const tirar = (id) => {
        const el = doc.getElementById(id);
        if (!el) return;
        const caixa = el.parentElement;
        el.remove();
        if (caixa && caixa.classList.contains('sidebar-crosslinks') && !caixa.children.length) caixa.remove();
    };
    if (produto === 'n360') { ORDEM_DOS_LINKS.forEach(tirar); return; }
    const volta = linkDaBarra(doc, 'link-n360');
    if (volta) { volta.href = enderecoDoProduto('n360'); volta.textContent = 'n.360'; }
    const tela = Object.keys(TELAS_DA_CONTA).find((t) => itemVisivel(doc, TELAS_DA_CONTA[t]));
    if (!tela) tirar('link-conta');
    else {
        const conta = linkDaBarra(doc, 'link-conta');
        if (conta) { conta.href = `${enderecoDoProduto('n360')}?tela=${tela}`; conta.textContent = 'Conta e acessos (n.360)'; }
    }
    const outro = produto === 'iso' ? 'privacy' : 'iso';
    const mostrar = S.activeProject && temProduto(S.activeProject, outro) && temProduto(S.activeProject, produto);
    if (!mostrar) { tirar('link-outro-produto'); return; }
    const el = linkDaBarra(doc, 'link-outro-produto');
    if (!el) return;
    el.href = enderecoDoProduto(outro);
    el.textContent = `Abrir este projeto no n.${outro}`;
}

/** O que cada módulo é, numa linha: no início do n.360, a escolha não depende de conhecer o nome. */
export const DESCRICAO_DO_MODULO = { iso: 'ISO 27001 e 27701: controles, riscos e auditoria', privacy: 'LGPD: tratamentos, titulares, incidentes e fornecedores', ot: 'ARCiber: requisitos da RO-CB.BR.01 do ONS' };

/** Os itens do menu do n.ot: só dentro do /ot, com o projeto ativo E a pessoa com o módulo (a trava de verdade é do servidor, P0-1). */
export function atualizarItemOt(doc = document) {
    const dentro = produtoAtual() === 'ot' && !!(S.activeProject && modulosVisiveis(S.activeProject).includes('ot'));
    for (const id of ['secao-ot-organizacao', 'nav-ot-inicio', 'nav-ot-painel', 'nav-ot-sites', 'nav-ot-assessment', 'nav-ot-relatorios', 'nav-ot-fornecedores']) { const n = doc.getElementById(id); if (n) n.hidden = !dentro; }
    const ac = doc.getElementById('nav-ot-acessos');
    if (ac) ac.hidden = !(dentro && podeEditarOt());
}

/**
 * No Painel de um módulo, ao lado do título do cabeçalho: um link por módulo que a pessoa vê no projeto ativo, o atual marcado.
 * Só no Painel (decisão do dono, 19/10/2026: em toda tela confundia); nas outras, a troca é pelo link do rodapé do menu. Com um
 * módulo só, ou no início do n.360 (que já tem uma linha por módulo), fica escondido.
 */
export function atualizarSeletorDeModulo(doc = document) {
    const caixa = doc.querySelector('.header-left');
    if (!caixa) return;
    let nav = doc.getElementById('modulo-seletor');
    if (!nav) {
        nav = doc.createElement('nav');
        nav.id = 'modulo-seletor';
        nav.className = 'modulo-seletor';
        nav.setAttribute('aria-label', 'Módulo');
        caixa.appendChild(nav);
    }
    const produto = produtoAtual();
    const mods = S.activeProject ? MODULOS.filter((m) => modulosVisiveis(S.activeProject).includes(m)) : [];
    nav.hidden = produto === 'n360' || mods.length < 2 || S.view !== PRODUTOS[produto].inicio;
    nav.replaceChildren(...(nav.hidden ? [] : mods.map((m) => {
        const a = doc.createElement('a');
        a.href = enderecoDoProduto(m);
        a.textContent = `n.${m}`;
        if (m === produto) a.setAttribute('aria-current', 'page');
        return a;
    })));
}

/**
 * O `?tela=` com que o rodapé de um módulo abre o n.360, lido uma vez no boot. Só no n.360; sai do endereço (o resto da
 * query e o fragmento ficam); só vale tela da lista fechada cujo item o papel vê, ou `meus-pedidos` (link do e-mail de aprovação).
 * Fora disso, null: a entrada normal.
 */
export function telaPedida(loc = window.location, doc = document) {
    if (produtoAtual(loc) !== 'n360') return null;
    const q = new URLSearchParams(loc.search || '');
    if (!q.has('tela')) return null;
    const tela = q.get('tela');
    q.delete('tela');
    const resto = q.toString();
    history.replaceState(history.state, '', `${loc.pathname}${resto ? `?${resto}` : ''}${loc.hash || ''}`);
    // "Minhas aprovações" é de todo papel logado: é o destino do e-mail de pedido de aprovação.
    if (tela === 'meus-pedidos') return tela;
    return Object.hasOwn(TELAS_DA_CONTA, tela) && itemVisivel(doc, TELAS_DA_CONTA[tela]) ? tela : null;
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
        return `<tr><td><strong>n.${m}</strong></td><td>${ligado ? 'Habilitado' : 'Desligado'}${contr.includes(m) ? '' : orgDireta() ? ' · não contratado' : ' · não contratado pela consultoria'}</td>
            <td style="text-align:right">${pode ? `<button class="btn btn-sm ${ligado ? 'btn-ghost' : 'btn-primary'}" data-action="alternarProdutoDoProjeto" data-args='${escapeHTML(JSON.stringify([projectId, m, !ligado]))}'>${ligado ? 'Desligar' : 'Habilitar'}</button>` : ''}</td></tr>`;
    };
    openModal(`<h3>Produtos do projeto</h3>
        <p style="color:var(--text-dim)">Os produtos usam o mesmo cadastro (partes, itens, documentos, RoPA, DPIA, evidências). Desligar um produto não apaga dado: ele volta ao religar.</p>
        <p id="produtos-aviso-pessoas" style="color:var(--text-dim)">${orgDireta() ? 'Cada pessoa da equipe precisa receber o módulo na tela Usuários.' : 'Os usuários do cliente deste projeto recebem o módulo; a equipe da consultoria precisa recebê-lo na tela Usuários.'}</p>
        <p id="produtos-aviso-ot" class="org-dica">O n.ot é a exceção: não é concedido automaticamente a ninguém, nem ao cliente; dê o módulo a cada pessoa na tela Usuários.</p>
        <table class="data-table" id="produtos-do-projeto"><tbody>${MODULOS.map(linha).join('')}</tbody></table>`);
};

window.alternarProdutoDoProjeto = async function (projectId, modulo, habilitar) {
    try {
        const r = await api('PUT', `/api/v1/projects/${projectId}/modulos/${modulo}`, { habilitado: habilitar });
        // Ligar o n.privacy traz o que o n.iso já tem (partes e documentos); ponte que falhou volta como aviso.
        const imp = r && r.importados;
        showToast(imp
            ? `n.${modulo} habilitado. Trouxemos ${imp.partes} pessoas e organizações e ${imp.documentos} documentos do n.iso.`
            : `n.${modulo} ${habilitar ? 'habilitado' : 'desligado'} neste projeto.`, 'success');
        for (const aviso of (r && r.avisos) || []) showToast(aviso, 'warning');
        if (typeof window.loadProjects === 'function') await window.loadProjects();
        await window.abrirProdutosDoProjeto(projectId);
    } catch (e) { showToast((e && e.message) || 'Não foi possível alterar o produto', 'error'); }
};

window.temProduto = temProduto;
window.produtoAtual = produtoAtual;
window.projetosDoProduto = projetosDoProduto;
