// Casca (onda 1): menu de cada produto, rodapé de links entre módulos, teclado na barra lateral e rodapé da entrada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import html from '../login.html?raw';
import css from '../src/style.css?raw';
import { aplicarCasca, atualizarLinkCruzado, SO_N360 } from '../src/produto.js';

const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const montarApp = () => { document.open(); document.write(html); document.close(); };
const visiveis = () => [...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
const rotuloDe = (grupo) => document.querySelector(`.sidebar-label[data-args='["${grupo}"]']`);

beforeEach(() => { S.user = { role: 'platform_admin' }; S.activeProject = null; });
afterEach(() => ir('/'));

describe('n.360: menu de hub', () => {
    it('só Início, Meus pedidos, Conta e acessos, Segurança do projeto e Trilha de Logs', () => {
        montarApp();
        aplicarCasca('n360');
        expect(new Set(visiveis())).toEqual(new Set(['nav-inicio', 'nav-meus', ...SO_N360, 'nav-seguranca-projeto', 'nav-audit-trail']));
    });
    it('grupo que ficou vazio some com o rótulo', () => {
        montarApp();
        aplicarCasca('n360');
        for (const g of ['group-sales', 'group-impl', 'group-ops', 'group-privacy', 'group-provas', 'group-implantacao', 'group-intel']) {
            expect(el(g).dataset.foraDoProduto, g).toBe('1');
            expect(rotuloDe(g).dataset.foraDoProduto, g).toBe('1');
        }
        expect(el('group-system-config').dataset.foraDoProduto).toBe('');
    });
});

describe('Segurança do projeto', () => {
    it('um item só, em Conta e acessos, logo depois de Organizações', () => {
        montarApp();
        expect(document.querySelectorAll('#nav-seguranca-projeto').length).toBe(1);
        expect(el('nav-seguranca-projeto').parentElement.id).toBe('group-conta');
        expect(el('nav-organizacoes').nextElementSibling.id).toBe('nav-seguranca-projeto');
    });
});

describe('n.privacy: menu', () => {
    it('Importar programa fica fora do menu operacional, em Implantação (recolhido, depois de Privacidade)', () => {
        montarApp();
        aplicarCasca('privacy');
        expect(el('group-privacy').contains(el('nav-importacao'))).toBe(false);
        expect(el('nav-importacao').parentElement.id).toBe('group-implantacao');
        expect(el('group-implantacao').dataset.foraDoProduto).toBe('');
        expect(el('group-implantacao').classList.contains('expanded')).toBe(false);
        const r = rotuloDe('group-implantacao');
        expect([r.getAttribute('role'), r.getAttribute('tabindex'), r.getAttribute('aria-expanded'), r.dataset.action]).toEqual(['button', '0', 'false', 'toggleGroup']);
        expect(r.previousElementSibling).toBe(el('group-provas'));
        expect(el('group-implantacao').nextElementSibling).toBe(rotuloDe('group-intel'));
    });
    it('n.iso não mostra Implantação', () => {
        montarApp();
        aplicarCasca('iso');
        expect(el('group-implantacao').dataset.foraDoProduto).toBe('1');
        expect(rotuloDe('group-implantacao').dataset.foraDoProduto).toBe('1');
    });
    it('por área de trabalho: painel e filas em destaque no primeiro nível, depois Mapear e avaliar, Governança e provas e Implantação', () => {
        montarApp();
        aplicarCasca('privacy');
        const lista = el('nav-dashboard').parentElement;
        const topo = [...lista.children].filter((n) => n.matches('.sidebar-nav') && n.dataset.foraDoProduto !== '1').map((n) => n.id);
        expect(topo).toEqual(['nav-meus', 'nav-encarregado', 'nav-titular', 'nav-terceiros', 'nav-incidentes-privacy', 'nav-ai']);
        const ids = (g) => [...el(g).querySelectorAll('.sidebar-nav')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
        expect(ids('group-privacy')).toEqual(['nav-ropa', 'nav-dpia', 'nav-requisitos']);
        expect(ids('group-provas')).toEqual(['nav-documentos', 'nav-evidence', 'nav-partes', 'nav-governance', 'nav-training']);
        expect(rotuloDe('group-privacy').textContent).toBe('Mapear e avaliar');
        expect(rotuloDe('group-provas').textContent).toBe('Governança e provas');
        expect(el('group-ops').dataset.foraDoProduto).toBe('1');
        const ordem = [...lista.children].map((n) => n.id).filter((i) => ['group-privacy', 'group-provas', 'group-implantacao'].includes(i));
        expect(ordem).toEqual(['group-privacy', 'group-provas', 'group-implantacao']);
        expect(el('group-privacy').classList.contains('expanded')).toBe(true);
        expect(rotuloDe('group-privacy').getAttribute('aria-expanded')).toBe('true');
        expect(el('group-provas').classList.contains('expanded')).toBe(false);
    });
    it('rótulos e destaque: DSAR, Terceiros e Incidentes têm selo; ids, rotas e ações não mudam', () => {
        montarApp();
        aplicarCasca('privacy');
        const texto = (id) => el(id).querySelector('.sidebar-nav-text').textContent.trim();
        expect(texto('nav-titular')).toBe('Direitos do titular (DSAR)');
        expect(texto('nav-terceiros')).toBe('Terceiros (risco de fornecedores)');
        expect(texto('nav-ropa')).toBe('RoPA');
        expect(texto('nav-dpia')).toBe('RIPD (DPIA)');
        expect(texto('nav-incidentes-privacy')).toBe('Incidentes');
        for (const [id, selo] of [['nav-titular', 'selo-titular'], ['nav-terceiros', 'selo-terceiros'], ['nav-incidentes-privacy', 'selo-incidentes']]) {
            expect(el(id).classList.contains('sidebar-nav-destaque'), id).toBe(true);
            expect(el(id).contains(el(selo)), selo).toBe(true);
            expect(el(selo).hidden, selo).toBe(true);
        }
        expect(el('nav-encarregado').classList.contains('sidebar-nav-destaque')).toBe(false);
        expect(JSON.parse(el('nav-ropa').getAttribute('data-args'))).toEqual(['ropa']);
        expect(JSON.parse(el('nav-terceiros').getAttribute('data-args'))).toEqual(['terceiros']);
    });
    it('os itens de primeiro nível seguem o projeto: sem projeto somem junto com os grupos', () => {
        montarApp();
        for (const id of ['nav-encarregado', 'nav-titular', 'nav-terceiros', 'nav-incidentes-privacy', 'group-provas']) {
            expect(el(id).classList.contains('group-project-only'), id).toBe(true);
            expect(el(id).style.display, id).toBe('none');
        }
    });
    it('Governança e Inteligência de um item só não viram grupo; o assistente se chama Assistente', () => {
        montarApp();
        aplicarCasca('privacy');
        expect(el('group-impl').dataset.foraDoProduto).toBe('1');
        expect(rotuloDe('group-impl').dataset.foraDoProduto).toBe('1');
        expect(el('group-intel').dataset.foraDoProduto).toBe('1');
        expect(rotuloDe('group-intel').dataset.foraDoProduto).toBe('1');
        expect(visiveis()).toContain('nav-ai');
        expect(el('nav-ai').textContent.trim()).toBe('Assistente');
        expect(el('nav-ai').closest('.sidebar-group')).toBeNull();
    });
    it('Incidentes abre a tela do titular na aba de incidentes; Partes Interessadas, Ativos e Fornecedores ficam fora', () => {
        montarApp();
        aplicarCasca('privacy');
        expect(el('nav-incidentes-privacy').getAttribute('data-action')).toBe('abrirAbaTitular');
        expect(JSON.parse(el('nav-incidentes-privacy').getAttribute('data-args'))).toEqual(['incidentes']);
        expect(JSON.parse(el('nav-titular').getAttribute('data-args'))).toEqual(['pedidos']);
        for (const id of ['nav-stakeholders', 'nav-assets', 'nav-vendors']) expect(visiveis(), id).not.toContain(id);
    });
    it('no n.iso o menu continua com Governança no grupo e sem o item de incidentes do n.privacy', () => {
        montarApp();
        aplicarCasca('iso');
        expect(rotuloDe('group-privacy').textContent).toBe('Privacidade');
        expect(el('nav-ropa').textContent.trim()).toBe('ROPA');
        expect(el('nav-dpia').textContent.trim()).toBe('DPIA / RIPD');
        expect(el('group-provas').dataset.foraDoProduto).toBe('1');
        expect(el('nav-governance').parentElement.id).toBe('group-impl');
        expect(visiveis()).not.toContain('nav-incidentes-privacy');
        expect(visiveis()).toContain('nav-assets');
    });
});

describe('menu: AI Assistant virou Assistente', () => {
    it('em qualquer produto', () => {
        expect(html).not.toContain('AI Assistant');
    });
});

describe('teclado na barra lateral', () => {
    it('todo item e todo rótulo de grupo recebe foco e tem papel', () => {
        montarApp();
        for (const n of document.querySelectorAll('.sidebar-nav[id^="nav-"]')) {
            expect(n.getAttribute('tabindex'), n.id).toBe('0');
            expect(n.getAttribute('role'), n.id).toBe('link');
        }
        for (const l of document.querySelectorAll('.sidebar-label')) {
            expect(l.getAttribute('tabindex'), l.textContent).toBe('0');
            expect(l.getAttribute('role')).toBe('button');
        }
    });
});

describe('rodapé de links entre módulos', () => {
    it('num contêiner próprio, com classe e sem estilo inline', () => {
        montarApp();
        ir('/iso');
        aplicarCasca('iso');
        el('nav-users').style.display = '';
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        atualizarLinkCruzado();
        const caixa = document.querySelector('#sidebar .sidebar-crosslinks');
        expect(caixa).not.toBeNull();
        const links = [...caixa.querySelectorAll('a')];
        expect(links.map((a) => a.id)).toEqual(['link-n360', 'link-conta', 'link-outro-produto']);
        for (const a of links) {
            expect(a.className).toBe('sidebar-crosslink');
            expect(a.getAttribute('style')).toBeNull();
        }
        expect(document.querySelectorAll('.sidebar-crosslinks').length).toBe(1);
        // no n.360 o contêiner some junto
        ir('/');
        atualizarLinkCruzado();
        expect(document.querySelector('.sidebar-crosslinks')).toBeNull();
    });
    it('CSS: contêiner com fio de borda e link discreto', () => {
        expect(css).toMatch(/\.sidebar-crosslinks\s*\{[^}]*border-top:\s*1px solid var\(--border\)/);
        expect(css).toMatch(/\.sidebar-crosslink\s*\{[^}]*font-size:\s*13px[^}]*\}/);
        expect(css).toMatch(/\.sidebar-crosslink:hover\s*\{[^}]*color:\s*var\(--text\)/);
    });
});

describe('header', () => {
    it('fechar do painel de contexto: some recolhido, rótulo acessível e sem letra solta', () => {
        montarApp();
        const b = document.querySelector('.toggle-context');
        expect(b.getAttribute('aria-label')).toBe('Fechar painel');
        expect(b.textContent.trim()).not.toBe('x');
        expect(css).toMatch(/\.context-panel\.collapsed \.toggle-context\s*\{\s*display:\s*none/);
        expect(css).toMatch(/\.context-panel\s*\{[^}]*position:\s*relative/);
    });
    it('seletor de organização só aparece com duas ou mais opções', () => {
        expect(css).toMatch(/\.org-seletor:not\(:has\(option \+ option\)\)\s*\{\s*display:\s*none/);
    });
    it('etiqueta de módulos do projeto em linha própria, abaixo do nome', () => {
        expect(css).toMatch(/\.tenant-face\s*\{[^}]*flex-wrap:\s*wrap/);
        expect(css).toMatch(/\.tenant-norm\s*\{[^}]*flex-basis:\s*100%/);
    });
    it('rótulo de grupo: 11px, espaçamento .08em, cor --text-dim', () => {
        expect(css).toMatch(/\.sidebar-label\s*\{[^}]*font-size:\s*11px[^}]*letter-spacing:\s*0?\.08em[^}]*color:\s*var\(--text-dim\)/);
    });
});

describe('pedidos do portal', () => {
    it('Configurações é a tabela de preços: o menu diz "Preços e margens"', () => {
        montarApp();
        expect(el('nav-settings').textContent.trim()).toBe('Preços e margens');
    });
    it('tabela de Organizações quadrada e respiro entre as ações do header', () => {
        expect(css).toMatch(/\.org-tabela-caixa\s*\{[^}]*border-radius:\s*0;/);
        expect(css).toMatch(/\.header-actions\s*\{[^}]*gap:\s*0\.75rem/);
    });
    it('entrada escondida também sai da tela (visibility), não só fica transparente', () => {
        expect(css).toMatch(/#login-overlay\.hidden\s*\{[^}]*visibility:\s*hidden/);
    });
});

describe('rodapé da entrada', () => {
    it('sem os links de privacidade e termos (eram as políticas do cliente); texto em 12px', () => {
        montarApp();
        expect(document.querySelector('.login-sign-links a, .entry-foot a')).toBeNull();
        expect(css).toMatch(/\.login-sign-links\s*\{[^}]*font-size:\s*12px/);
    });
});
