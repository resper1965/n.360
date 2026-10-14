// Menu do n.privacy (alternativa A) com o globals.js de verdade: o menu de conta recebe Minhas aprovações e Trilha de logs só
// no n.privacy, seção sem item do papel some, e o acordeão do n.iso continua o mesmo. Preâmbulo de papeis-admin.test.js:
// globals.js roda initApp() no import.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

vi.mock('../src/api.js', () => ({ api: vi.fn(async () => []), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));

import { S } from '../src/state.js';
import { aplicarCasca } from '../src/produto.js';

const lido = (glob) => Object.values(glob)[0];
const html = lido(import.meta.glob('../login.html', { query: '?raw', import: 'default', eager: true }));
let corpo = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
for (let ant; ant !== corpo;) { ant = corpo; corpo = corpo.replace(/<script[\s\S]*?<\/script[^>]*>/gi, ''); }

beforeAll(async () => {
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} takeRecords() { return []; } });
    document.body.innerHTML = '<div id="login-overlay" class="hidden"></div>';
    await import('../src/globals.js');
});
afterEach(() => history.replaceState(null, '', '/'));

const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const rotuloDe = (grupo) => document.querySelector(`.sidebar-label[data-args='["${grupo}"]']`);

describe('n.iso: acordeão', () => {
    it('o acordeão do n.iso continua: abrir um grupo fecha o outro', async () => {
        document.body.innerHTML = corpo;
        aplicarCasca('iso');
        window.toggleGroup('group-ops');
        expect(el('group-ops').classList.contains('expanded')).toBe(true);
        expect(el('group-sales').classList.contains('expanded')).toBe(false);
        window.toggleGroup('group-privacy');
        expect(el('group-ops').classList.contains('expanded')).toBe(false);
        expect(rotuloDe('group-ops').getAttribute('aria-expanded')).toBe('false');
        expect(rotuloDe('group-privacy').getAttribute('aria-expanded')).toBe('true');
    });
});

describe('n.privacy: Minhas aprovações e Trilha de logs no menu de conta', () => {
    const montarComConta = async (role, caminho) => {
        ir(caminho);
        document.body.innerHTML = corpo;
        aplicarCasca(caminho === '/privacy' ? 'privacy' : caminho === '/iso' ? 'iso' : 'n360');
        S.user = { id: 'u', name: 'Pessoa Exemplo', email: 'p@exemplo.test', role };
        S.projects = [];
        window.updateHeaderUser();
        window.renderAccountMenu();
        return [...el('account-menu').querySelectorAll('.account-item-label')].map((n) => n.textContent);
    };
    it('consultor: os dois no menu de conta, levando às telas', async () => {
        const itens = await montarComConta('consultor', '/privacy');
        expect(itens.slice(0, 2)).toEqual(['Minhas aprovações', 'Trilha de logs']);
        expect(JSON.parse(el('conta-meus-pedidos').getAttribute('data-args'))).toEqual(['navigate', 'meus-pedidos']);
        expect(JSON.parse(el('conta-audit-trail').getAttribute('data-args'))).toEqual(['navigate', 'audit-trail']);
        expect(el('conta-meus-pedidos').getAttribute('data-action')).toBe('accountMenuAction');
        expect(el('conta-meus-pedidos').querySelector('.sidebar-selo')).toBeNull();
    });
    it('cliente: Minhas aprovações sem Trilha de logs; platform_admin: Trilha sem Minhas aprovações (a regra do papel é a de sempre)', async () => {
        expect(await montarComConta('org_user', '/privacy')).not.toContain('Trilha de logs');
        expect(await montarComConta('org_user', '/privacy')).toContain('Minhas aprovações');
        const admin = await montarComConta('platform_admin', '/privacy');
        expect(admin).toContain('Trilha de logs');
        expect(admin).not.toContain('Minhas aprovações');
    });
    it('no n.iso e no n.360 o menu de conta não muda (os dois continuam no menu lateral)', async () => {
        for (const caminho of ['/iso', '/']) {
            const itens = await montarComConta('consultor', caminho);
            expect(itens, caminho).not.toContain('Minhas aprovações');
            expect(itens, caminho).not.toContain('Trilha de logs');
        }
    });
    it('seção sem item do papel some com o título (comercial)', async () => {
        await montarComConta('comercial', '/privacy');
        for (const t of document.querySelectorAll('.sidebar-secao')) expect(t.dataset.semItem, t.textContent).toBe('1');
        // consultor com projeto: as quatro seções à vista (sem projeto, Responder some: os três itens dela seguem o projeto)
        await montarComConta('consultor', '/privacy');
        S.activeProject = { id: 'p', modulos: ['privacy'] };
        window.updateActiveProjectWidget();
        window.updateHeaderUser();
        for (const t of document.querySelectorAll('.sidebar-secao')) expect(t.dataset.semItem, t.textContent).toBe('');
        S.activeProject = null;
    });
});


describe('barra recolhida: dica com o nome do item ao passar e ao focar', () => {
    it.each(['/privacy', '/iso', '/'])('%s', (caminho) => {
        ir(caminho);
        document.body.innerHTML = corpo;
        aplicarCasca(caminho === '/privacy' ? 'privacy' : caminho === '/iso' ? 'iso' : 'n360');
        const item = caminho === '/' ? el('nav-inicio') : el('nav-ropa');
        const nome = item.querySelector('.sidebar-nav-text').textContent;
        const dica = el('sidebar-dica');
        item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(dica.hidden).toBe(true); // aberta, sem dica
        window.toggleSidebar();
        item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(dica.hidden).toBe(false);
        expect(dica.textContent).toBe(nome);
        item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(dica.hidden).toBe(true);
        item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(dica.hidden).toBe(false);
        window.toggleSidebar();
        expect(dica.hidden).toBe(true);
    });
});
