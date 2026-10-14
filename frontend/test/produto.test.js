// n.360 com os módulos n.iso e n.privacy (mesmo cadastro): casca pelo caminho (/, /iso, /privacy), redirecionamento dos
// domínios antigos, menu, projetos do produto, sem acesso, links entre módulos e o cartão de produtos do projeto. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import html from '../login.html?raw';
import { produtoAtual, destinoLegado, aplicarCasca, projetosDoProduto, temProduto, enderecoDoProduto, semAcesso, atualizarLinkCruzado, SO_ISO, SO_PRIVACY, SO_N360, TELAS_DA_CONTA, telaPedida, pedidoDoHub, TELAS_DOS_MODULOS, TELAS_DO_HUB } from '../src/produto.js';
import fonteRouter from '../src/router.js?raw';

const loc = (url) => { const u = new URL(url); return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin }; };
const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const visiveis = () => [...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
const montarApp = () => { document.open(); document.write(html); document.close(); };

beforeEach(() => { try { sessionStorage.clear(); } catch (e) { /* jsdom */ } S.user = { role: 'platform_admin' }; S.activeProject = null; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); ir('/'); });

describe('produtoAtual', () => {
    it('vem do caminho: /iso é n.iso, /privacy é n.privacy, o resto é o início do n.360', () => {
        expect(produtoAtual(loc('https://n360.ness.com.br/iso'))).toBe('iso');
        expect(produtoAtual(loc('https://n360.ness.com.br/iso/x'))).toBe('iso');
        expect(produtoAtual(loc('https://n360.ness.com.br/privacy'))).toBe('privacy');
        expect(produtoAtual(loc('https://n360.ness.com.br/privacy/a/b?c=1'))).toBe('privacy');
        expect(produtoAtual(loc('https://n360.ness.com.br/'))).toBe('n360');
        expect(produtoAtual(loc('https://n360.ness.com.br/login'))).toBe('n360');
        expect(produtoAtual(loc('https://n360.ness.com.br/isolado'))).toBe('n360');
    });
    it('localhost resolve igual, sem ?produto= nem sessionStorage', () => {
        expect(produtoAtual(loc('http://localhost:8787/privacy'))).toBe('privacy');
        expect(produtoAtual(loc('http://localhost:8787/login?produto=privacy'))).toBe('n360');
        ir('/iso');
        expect(produtoAtual()).toBe('iso');
    });
});

describe('destinoLegado', () => {
    // O destino vem do servidor (`app_url` do /health da mesma origem): com o APP_URL no niso (antes da troca ou na volta
    // atrás), o frontend não redireciona. Sem endereço do n.360 no bundle.
    const health = (app_url) => vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ok', app_url }) }));
    const N360 = 'https://n360.ness.com.br';

    it('niso e nprivacy levam ao módulo no app_url; raiz e /login viram só o prefixo', async () => {
        const f = health(N360);
        vi.stubGlobal('fetch', f);
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBe(`${N360}/iso`);
        expect(f).toHaveBeenCalledWith('/health', expect.anything());
        expect(await destinoLegado(loc('https://niso.ness.com.br/login'))).toBe(`${N360}/iso`);
        expect(await destinoLegado(loc('https://niso.ness.com.br/login.html'))).toBe(`${N360}/iso`);
        expect(await destinoLegado(loc('https://nprivacy.ness.com.br/'))).toBe(`${N360}/privacy`);
        expect(await destinoLegado(loc('https://nprivacy.ness.com.br/x?y=1'))).toBe(`${N360}/privacy/x?y=1`);
        expect(await destinoLegado(loc('https://niso.ness.com.br/iso/x'))).toBe(`${N360}/iso/x`);
    });
    it('os legados antigos vão ao n.iso; query e fragmento (token do SSO) seguem junto', async () => {
        vi.stubGlobal('fetch', health(`${N360}/`));
        expect(await destinoLegado(loc('https://n-iso.ness.com.br/'))).toBe(`${N360}/iso`);
        expect(await destinoLegado(loc('https://niso.ness.workers.dev/login?assessment=t#sso_token=abc'))).toBe(`${N360}/iso?assessment=t#sso_token=abc`);
    });
    it('APP_URL = niso: o niso não redireciona (sem laço)', async () => {
        vi.stubGlobal('fetch', health('https://niso.ness.com.br'));
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBeNull();
        // o outro domínio de módulo segue para onde o servidor manda
        expect(await destinoLegado(loc('https://nprivacy.ness.com.br/'))).toBe('https://niso.ness.com.br/privacy');
    });
    it('falha do /health (rede, status, JSON sem app_url) não redireciona: fica onde está', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ app_url: N360 }) })));
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBeNull();
        vi.stubGlobal('fetch', health(undefined));
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBeNull();
        vi.stubGlobal('fetch', health('não é url'));
        expect(await destinoLegado(loc('https://niso.ness.com.br/'))).toBeNull();
    });
    it('no n.360 e em localhost não redireciona nem consulta o /health', async () => {
        const f = health(N360);
        vi.stubGlobal('fetch', f);
        expect(await destinoLegado(loc(`${N360}/iso`))).toBeNull();
        expect(await destinoLegado(loc('http://localhost:8787/'))).toBeNull();
        expect(await destinoLegado()).toBeNull(); // jsdom: localhost
        expect(f).not.toHaveBeenCalled();
    });
});

describe('projetos do produto', () => {
    const P = [{ id: 'a', modulos: ['iso'] }, { id: 'b', modulos: ['privacy'] }, { id: 'c', modulos: ['iso', 'privacy'] }, { id: 'd' }];
    it('cada domínio lista só os projetos com o seu produto; sem a lista (resposta antiga) conta como n.iso', () => {
        expect(projetosDoProduto(P, 'iso').map((p) => p.id)).toEqual(['a', 'c', 'd']);
        expect(projetosDoProduto(P, 'privacy').map((p) => p.id)).toEqual(['b', 'c']);
        expect(projetosDoProduto(null, 'iso')).toEqual([]);
        expect(projetosDoProduto(P, 'n360').map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(temProduto({ modulos: [] }, 'iso')).toBe(true);
    });
});

describe('casca', () => {
    it('n.privacy: título, marca, texto de entrada e menu só com as telas do produto e o cadastro', () => {
        montarApp();
        aplicarCasca('privacy');
        expect(document.title).toBe('n.privacy | ness. Privacidade');
        expect(el('sidebar-logo-mark').textContent).toBe('n.privacy');
        expect(document.querySelector('.entry-mark').textContent).toBe('n.privacy');
        expect(document.querySelector('.entry-title').textContent).toContain('Privacidade e LGPD');
        const v = visiveis();
        for (const id of SO_PRIVACY) expect(v, id).toContain(id);
        for (const id of SO_ISO) expect(v, id).not.toContain(id);
        for (const id of ['nav-partes', 'nav-documentos', 'nav-evidence', 'nav-ropa', 'nav-dpia']) expect(v, id).toContain(id);
        // o grupo comercial inteiro some (rótulo também)
        expect(el('group-sales').dataset.foraDoProduto).toBe('1');
        expect(el('label-group-sales').dataset.foraDoProduto).toBe('1');
        // as seções fixas substituem os grupos: o de privacidade fica vazio e some
        expect(el('group-privacy').dataset.foraDoProduto).toBe('1');
        // a entrada do n.privacy não fala do n.iso: sem o "conheça o n.iso" e sem a versão do n.iso nos rodapés
        expect(document.querySelector('.entry-more').hidden).toBe(true);
        const rodapes = [...document.querySelectorAll('.login-sign-links')].map((s) => s.textContent);
        expect(rodapes.length).toBeGreaterThan(0);
        for (const r of rodapes) expect(r).not.toContain('n.iso');
        expect(rodapes.filter((r) => r.includes('n.privacy')).length).toBe((html.match(/n\.iso \d+\.\d+\.\d+/g) || []).length);
        // os links "privacidade · termos" apontavam para o portal de políticas do CLIENTE: saíram (test/casca-menu.test.js)
        expect(document.querySelector('.login-sign-links a')).toBeNull();
    });
    it('n.iso: igual ao de sempre, sem as telas exclusivas do n.privacy, e com RoPA e DPIA', () => {
        montarApp();
        aplicarCasca('iso');
        expect(document.title).toBe('n.iso | ness. Agentic GRC');
        expect(el('sidebar-logo-mark').textContent).toBe('n.iso');
        const v = visiveis();
        for (const id of SO_PRIVACY) expect(v, id).not.toContain(id);
        for (const id of [...SO_ISO, 'nav-ropa', 'nav-dpia']) expect(v, id).toContain(id);
        expect(el('group-sales').dataset.foraDoProduto).toBe('');
        expect(document.querySelectorAll('.entry-section:not([hidden])').length).toBeGreaterThan(0);
    });
    it('n.360: título, marca, entrada da plataforma; menu de hub (Início, conta, segurança do projeto, trilha)', () => {
        montarApp();
        aplicarCasca('n360');
        expect(document.title).toBe('n.360 | ness.');
        expect(el('sidebar-logo-mark').textContent).toBe('n.360');
        expect(document.querySelector('.entry-mark').textContent).toBe('n.360');
        expect(document.querySelector('.login-brand-logo').textContent).toBe('n.360');
        expect(document.querySelector('.entry-lede').textContent).toContain('n.iso');
        expect(document.querySelector('.entry-lede').textContent).toContain('n.privacy');
        const v = visiveis();
        for (const id of [...SO_ISO, ...SO_PRIVACY]) expect(v, id).not.toContain(id);
        for (const id of ['nav-inicio', 'nav-projects', 'nav-seguranca-projeto', 'nav-audit-trail']) expect(v, id).toContain(id);
        // o cadastro (dos dois módulos) não é do hub: abre-se no módulo
        for (const id of ['nav-partes', 'nav-documentos', 'nav-evidence', 'nav-ropa', 'nav-dpia', 'nav-settings']) expect(v, id).not.toContain(id);
        expect(document.querySelector('.entry-more').hidden).toBe(true);
        expect(document.querySelectorAll('.entry-section:not([hidden])').length).toBe(0);
        const rodapes = [...document.querySelectorAll('.login-sign-links')].map((s) => s.textContent);
        for (const r of rodapes) expect(r).not.toMatch(/n\.iso|n\.privacy/);
        expect(rodapes.filter((r) => r.includes('n.360')).length).toBe((html.match(/n\.iso \d+\.\d+\.\d+/g) || []).length);
    });
    it('o item Início só aparece no n.360; nos módulos a volta é o link n.360 do rodapé', () => {
        montarApp();
        aplicarCasca('n360');
        expect(visiveis()).toContain('nav-inicio');
        expect(JSON.parse(el('nav-inicio').getAttribute('data-args'))).toEqual(['inicio']);
        for (const p of ['iso', 'privacy']) {
            montarApp();
            aplicarCasca(p);
            expect(visiveis(), p).not.toContain('nav-inicio');
        }
        // idempotente: voltar ao n.360 mostra de novo
        aplicarCasca('n360');
        expect(visiveis()).toContain('nav-inicio');
    });
    it('todo item do menu é de um produto, do outro ou dos dois (nenhum id inventado nas listas)', () => {
        montarApp();
        const ids = new Set([...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].map((n) => n.id));
        for (const id of [...SO_ISO, ...SO_PRIVACY, ...SO_N360]) expect(ids.has(id), id).toBe(true);
    });
});

describe('conta e acessos', () => {
    const CONTA = ['nav-projects', 'nav-users', 'nav-organizacoes', 'nav-api-keys', 'nav-conectar-agente'];
    it('no n.360 o grupo "Conta e acessos" traz projetos, usuários, organizações, chaves de API e conectar agente', () => {
        montarApp();
        aplicarCasca('n360');
        expect(SO_N360).toEqual(CONTA);
        const v = visiveis();
        for (const id of CONTA) expect(v, id).toContain(id);
        const grupo = el('group-conta');
        // Segurança do projeto (SSO/SCIM do projeto) mora em Conta e acessos, logo depois de Organizações
        expect([...grupo.querySelectorAll('.sidebar-nav')].map((n) => n.id)).toEqual(['nav-projects', 'nav-users', 'nav-organizacoes', 'nav-seguranca-projeto', 'nav-api-keys', 'nav-conectar-agente']);
        expect(grupo.dataset.foraDoProduto).toBe('');
        expect(el('label-group-conta').textContent).toBe('Conta e acessos');
        expect(el('nav-api-keys').textContent.trim()).toBe('Chaves de API');
        // cada item navega para a tela da lista fechada
        for (const id of CONTA) expect(TELAS_DA_CONTA[JSON.parse(el(id).getAttribute('data-args'))[0]], id).toBe(id);
        expect(v).toContain('nav-seguranca-projeto');
    });
    it('nos módulos os itens da conta somem, com o grupo e o rótulo (Segurança do projeto junto)', () => {
        for (const p of ['iso', 'privacy']) {
            montarApp();
            aplicarCasca(p);
            const v = visiveis();
            for (const id of CONTA) expect(v, `${p} ${id}`).not.toContain(id);
            expect(el('group-conta').dataset.foraDoProduto, p).toBe('1');
            expect(el('label-group-conta').dataset.foraDoProduto, p).toBe('1');
            expect(v, p).not.toContain('nav-seguranca-projeto');
        }
    });
    it('no módulo, o rodapé leva a "Conta e acessos (n.360)" na primeira tela que o papel vê', () => {
        montarApp();
        ir('/iso');
        aplicarCasca('iso');
        // papel que vê usuários (o updateHeaderUser deixa display vazio)
        el('nav-users').style.display = '';
        atualizarLinkCruzado();
        expect(el('link-conta').textContent).toBe('Conta e acessos (n.360)');
        expect(el('link-conta').getAttribute('href')).toBe('/?tela=projects');
        el('nav-projects').style.display = 'none';
        atualizarLinkCruzado();
        expect(el('link-conta').getAttribute('href')).toBe('/?tela=users');
        expect(document.querySelectorAll('#link-conta').length).toBe(1);
        // papel sem nenhum item da conta: sem o link
        el('nav-users').style.display = 'none';
        atualizarLinkCruzado();
        expect(el('link-conta')).toBeNull();
    });
    it('no n.360 não há link de conta (o grupo está no menu)', () => {
        montarApp();
        ir('/');
        aplicarCasca('n360');
        atualizarLinkCruzado();
        expect(el('link-conta')).toBeNull();
    });
});

describe('telaPedida (?tela= no boot do n.360)', () => {
    const montar = () => {
        document.body.innerHTML = Object.values(TELAS_DA_CONTA).map((id) => `<div class="sidebar-nav" id="${id}"></div>`).join('');
    };
    it('aceita só a lista fechada e tira o parâmetro do endereço, sem mexer no resto', () => {
        montar();
        for (const t of ['projects', 'users', 'organizacoes', 'api-keys', 'conectar-agente']) {
            ir(`/?tela=${t}&x=1#frag`);
            expect(telaPedida(), t).toBe(t);
            expect(location.pathname + location.search + location.hash).toBe('/?x=1#frag');
        }
        expect(Object.keys(TELAS_DA_CONTA)).toEqual(['projects', 'users', 'organizacoes', 'api-keys', 'conectar-agente']);
    });
    it('valor fora da lista é ignorado (e sai do endereço do mesmo jeito)', () => {
        montar();
        for (const t of ['soa', 'settings', 'constructor', '__proto__', 'javascript:alert(1)', '']) {
            ir(`/?tela=${encodeURIComponent(t)}`);
            expect(telaPedida(), t).toBeNull();
            expect(location.search).toBe('');
        }
        ir('/');
        expect(telaPedida()).toBeNull();
    });
    it('item que o papel não vê não abre', () => {
        montar();
        el('nav-api-keys').style.display = 'none';
        ir('/?tela=api-keys');
        expect(telaPedida()).toBeNull();
    });
    it('só no n.360: no módulo o parâmetro fica onde está', () => {
        montar();
        ir('/iso?tela=users');
        expect(telaPedida()).toBeNull();
        expect(location.search).toBe('?tela=users');
    });
});

describe('pedidoDoHub (?tela= e aviso no boot do módulo)', () => {
    it('toda tela da lista fechada tem ramo no render e nenhuma é do hub', () => {
        for (const t of TELAS_DOS_MODULOS) {
            expect(fonteRouter, t).toContain(`S.view === '${t}'`);
            expect(TELAS_DO_HUB, t).not.toContain(t);
        }
    });
    it('tela deste módulo ou dos dois: aceita e tira tela e aba do endereço, sem mexer no resto', () => {
        ir('/iso?tela=capa&x=1#f');
        expect(pedidoDoHub()).toEqual({ tela: 'capa', aba: null });
        expect(location.pathname + location.search + location.hash).toBe('/iso?x=1#f');
        ir('/privacy?tela=documentos');
        expect(pedidoDoHub()).toEqual({ tela: 'documentos', aba: null });
        // incidentes: a tela titular vale no n.iso com a aba de incidentes
        ir('/iso?tela=titular&aba=incidentes');
        expect(pedidoDoHub()).toEqual({ tela: 'titular', aba: 'incidentes' });
        expect(location.search).toBe('');
    });
    it('tela desconhecida, do hub, ou só do outro módulo é ignorada (e sai do endereço)', () => {
        for (const [c, t] of [['/iso', 'constructor'], ['/iso', '__proto__'], ['/iso', 'javascript:alert(1)'], ['/iso', 'users'], ['/iso', 'encarregado'], ['/privacy', 'soa'], ['/iso', 'titular'], ['/iso', '']]) {
            ir(`${c}?tela=${encodeURIComponent(t)}`);
            expect(pedidoDoHub(), `${c} ${t}`).toBeNull();
            expect(location.search).toBe('');
        }
    });
    it('o aviso guardado é lido uma vez, limpo, e só com ?tela=; no n.360 nada é lido', () => {
        sessionStorage.setItem('n360_aviso', JSON.stringify({ link: '/projects/p1/capa', target_id: 7, title: '<b>x</b>' }));
        ir('/?tela=capa');
        expect(pedidoDoHub()).toBeNull();
        expect(sessionStorage.getItem('n360_aviso')).not.toBeNull();
        ir('/iso?tela=capa');
        expect(pedidoDoHub()).toEqual({ aviso: { link: '/projects/p1/capa', action_type: '', target_id: '', title: '<b>x</b>', message: '' } });
        expect(sessionStorage.getItem('n360_aviso')).toBeNull();
        ir('/iso?tela=capa');
        expect(pedidoDoHub()).toEqual({ tela: 'capa', aba: null });
        sessionStorage.setItem('n360_aviso', 'não é json');
        ir('/iso?tela=soa');
        expect(pedidoDoHub()).toEqual({ tela: 'soa', aba: null });
        sessionStorage.setItem('n360_aviso', JSON.stringify({ link: '/x' }));
        ir('/iso');
        expect(pedidoDoHub()).toBeNull();
        expect(sessionStorage.getItem('n360_aviso')).toBeNull();
    });
});

describe('sem acesso e links entre módulos', () => {
    it('módulo sem projeto: mensagem e volta ao n.360', () => {
        document.body.innerHTML = '<div id="c"></div>';
        semAcesso(el('c'), 'privacy');
        expect(el('c').textContent).toContain('Você não tem acesso ao n.privacy');
        expect(el('c').querySelector('a').getAttribute('href')).toBe('/');
        expect(el('c').querySelector('a').textContent).toBe('Abrir o n.360');
    });
    it('n.360 sem módulo em projeto nenhum: texto próprio, sem link', () => {
        document.body.innerHTML = '<h1 id="header-title"></h1><div id="c"></div>';
        semAcesso(el('c'), 'n360');
        expect(el('header-title').textContent).toBe('n.360');
        expect(el('c').textContent).toContain('nenhum módulo do n.360');
        expect(el('c').querySelector('a')).toBeNull();
    });
    it('ninguém com projeto nenhum: equipe da ness. tem o caminho para criar; cliente sabe a quem pedir', () => {
        document.body.innerHTML = '<div id="c"></div>';
        const antes = [window.ehEquipeNess, window.ehComercial];
        window.ehEquipeNess = () => ['consultor', 'consultant', 'platform_admin', 'consultoria_admin'].includes(S.user.role);
        window.ehComercial = () => ['platform_admin', 'comercial', 'consultoria_admin'].includes(S.user.role);
        S.totalProjetos = 0;
        try {
            S.user = { role: 'platform_admin' };
            semAcesso(el('c'), 'privacy');
            expect(el('c').querySelector('h3').textContent).toBe('Nenhum projeto ainda');
            const links = [...el('c').querySelectorAll('.empty-action a')];
            expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Criar projeto', '/iso?tela=leads'], ['Ver organizações', '/?tela=organizacoes']]);
            expect(links[0].className).toContain('btn-primary');
            // consultor: não abre o funil comercial nem as organizações; fica o texto
            S.user = { role: 'consultor' };
            semAcesso(el('c'), 'n360');
            expect(el('c').querySelector('h3').textContent).toBe('Nenhum projeto ainda');
            expect(el('c').querySelector('a')).toBeNull();
            S.user = { role: 'org_user' };
            semAcesso(el('c'), 'iso');
            expect(el('c').querySelector('h3').textContent).toBe('Você ainda não tem acesso a um projeto');
            expect(el('c').textContent).toMatch(/consultoria|administrador/);
            expect(el('c').querySelector('a, button')).toBeNull();
        } finally { delete S.totalProjetos; [window.ehEquipeNess, window.ehComercial] = antes; }
    });
    it('num módulo: "n.360" volta ao início; o link para o outro módulo só quando o projeto tem os dois', () => {
        document.body.innerHTML = '<nav id="sidebar"></nav>';
        ir('/iso');
        S.activeProject = { id: 'a', modulos: ['iso'] };
        atualizarLinkCruzado();
        expect(el('link-n360').getAttribute('href')).toBe('/');
        expect(el('link-n360').textContent).toBe('n.360');
        expect(el('link-outro-produto')).toBeNull();
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        atualizarLinkCruzado();
        expect(el('link-outro-produto').textContent).toBe('Abrir este projeto no n.privacy');
        expect(el('link-outro-produto').getAttribute('href')).toBe('/privacy');
        expect(document.querySelectorAll('#link-n360').length).toBe(1);
        S.activeProject = { id: 'a', modulos: ['iso'] };
        atualizarLinkCruzado();
        expect(el('link-outro-produto')).toBeNull();
    });
    it('no início do n.360 não há link de módulo nem de volta', () => {
        document.body.innerHTML = '<nav id="sidebar"></nav>';
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        atualizarLinkCruzado();
        expect(el('link-n360')).toBeNull();
        expect(el('link-outro-produto')).toBeNull();
    });
    it('endereço de cada produto é um caminho da mesma origem', () => {
        expect(enderecoDoProduto('n360')).toBe('/');
        expect(enderecoDoProduto('iso')).toBe('/iso');
        expect(enderecoDoProduto('privacy')).toBe('/privacy');
    });
});

describe('produtos do projeto', () => {
    const abrir = async (estado, extra = {}) => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir({ 'GET /api/v1/projects/p9/modulos': estado, 'GET /api/v1/projects': [], ...extra });
        await window.abrirProdutosDoProjeto('p9');
        return f;
    };
    const acoes = () => [...document.querySelectorAll('[data-action="alternarProdutoDoProjeto"]')].map((b) => JSON.parse(b.getAttribute('data-args')).slice(1));

    it('mostra os dois produtos; habilita o contratado e desliga o ligado; o não contratado não tem botão', async () => {
        await abrir({ habilitados: ['iso'], contratados: ['iso'] });
        expect(el('produtos-do-projeto').textContent).toContain('não contratado pela organização');
        expect(acoes()).toEqual([['iso', false]]);
        await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] });
        expect(acoes()).toEqual([['iso', false], ['privacy', true]]);
    });
    it('quem não administra só vê', async () => {
        S.user = { role: 'consultor' };
        await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] });
        expect(acoes()).toEqual([]);
    });
    it('alternar manda o PUT certo e recarrega', async () => {
        const f = await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] }, { 'PUT /api/v1/projects/p9/modulos/privacy': { ok: true } });
        await window.alternarProdutoDoProjeto('p9', 'privacy', true);
        const c = f.mock.calls.find(([u, o]) => o?.method === 'PUT');
        expect(new URL(c[0], 'http://x').pathname).toBe('/api/v1/projects/p9/modulos/privacy');
        expect(JSON.parse(c[1].body)).toEqual({ habilitado: true });
    });
    const toasts = () => [...document.querySelectorAll('.toast')].map((t) => [t.className, t.textContent]);
    it('ligar o n.privacy diz o que veio do n.iso e mostra o aviso de ponte que falhou', async () => {
        await abrir({ habilitados: ['iso'], contratados: ['iso', 'privacy'] }, {
            'PUT /api/v1/projects/p9/modulos/privacy': { ok: true, importados: { partes: 4, documentos: 2 }, avisos: ['Não foi possível conciliar os responsáveis; refaça.'] },
        });
        await window.alternarProdutoDoProjeto('p9', 'privacy', true);
        expect(toasts()).toEqual([
            ['toast toast-success', 'n.privacy habilitado. Trouxemos 4 pessoas e organizações e 2 documentos do n.iso.'],
            ['toast toast-warning', 'Não foi possível conciliar os responsáveis; refaça.'],
        ]);
    });
    it('sem importados (n.iso, ou desligar) o toast é o de sempre', async () => {
        await abrir({ habilitados: ['iso', 'privacy'], contratados: ['iso', 'privacy'] }, { 'PUT /api/v1/projects/p9/modulos/privacy': { ok: true } });
        await window.alternarProdutoDoProjeto('p9', 'privacy', false);
        expect(toasts()).toEqual([['toast toast-success', 'n.privacy desligado neste projeto.']]);
    });
});
