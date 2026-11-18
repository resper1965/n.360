// Onboarding encadeado (onda 4, PR5): projeto criado → "Pessoas e acessos" (convites e módulos por pessoa; ot nunca marcado, P0-1;
// organização direta sem conta de cliente) → "Primeiros passos" (Task 16).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import '../src/views/empresa.js';

const $ = (id) => document.getElementById(id);
const digitar = (id, v) => { $(id).value = v; };
async function criarAte5(modulosDoProjeto = ['iso', 'ot']) {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    window.abrirNovoProjeto();
    digitar('emp-razao_social', 'Fictícia Ltda');
    window.novoProjetoIr(2); window.novoProjetoIr(3); window.novoProjetoIr(4);
    apiMock.mockImplementation(async (m, url) => (m === 'POST' && url === '/api/v1/projects' ? { id: 'novo', modulos: modulosDoProjeto } : m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
    await window.criarNovoProjeto();
}

beforeEach(() => {
    apiMock.mockReset();
    S.user = { role: 'consultoria_admin', org_tipo: 'consultoria', modulos: ['iso', 'privacy', 'ot'] };
    window.render = vi.fn(); window.loadProjects = vi.fn(); window.openProjectDetail = vi.fn();
    delete window.tipoOrgAtuacao;
});
afterEach(() => { document.body.innerHTML = ''; });

describe('Pessoas e acessos', () => {
    it('depois de criar, o assistente segue para "Pessoas e acessos" (não abre o projeto ainda)', async () => {
        await criarAte5();
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        expect(window.openProjectDetail).not.toHaveBeenCalled();
    });
    it('P0-1: a caixa do n.ot nunca nasce marcada; as outras do projeto, sim', async () => {
        await criarAte5(['iso', 'privacy', 'ot']);
        const caixas = Object.fromEntries([...document.querySelectorAll('input[name="np-p0-modulo"]')].map((x) => [x.value, x.checked]));
        expect(caixas).toEqual({ iso: true, privacy: true, ot: false });
        window.novoProjetoMaisPessoa();
        expect(document.querySelector('input[name="np-p1-modulo"][value="ot"]').checked).toBe(false);
    });
    it('convidar sem mexer nas caixas manda os módulos marcados, sem o ot; consultor também é designado no projeto', async () => {
        await criarAte5(['iso', 'ot']);
        digitar('np-p0-nome', 'Pessoa Fictícia'); digitar('np-p0-email', 'pessoa@exemplo.lat');
        apiMock.mockClear();
        apiMock.mockImplementation(async (m) => (m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
        await window.novoProjetoConvidar();
        const posts = apiMock.mock.calls.filter(([m]) => m === 'POST');
        expect(posts[0]).toEqual(['POST', '/api/v1/users', { name: 'Pessoa Fictícia', email: 'pessoa@exemplo.lat', role: 'consultor', client_project_id: null, modulos: ['iso'] }]);
        expect(posts[1]).toEqual(['POST', '/api/v1/projects/novo/governance', { name: 'Pessoa Fictícia', email: 'pessoa@exemplo.lat', role_category: 'consultor', job_title: 'Consultor' }]);
    });
    it('consultoria: oferece equipe e cliente; o cliente vai preso ao projeto novo e sem designação', async () => {
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor', 'org_admin', 'org_user']);
        digitar('np-p0-nome', 'Gestora'); digitar('np-p0-email', 'g@cliente.lat'); $('np-p0-papel').value = 'org_admin';
        apiMock.mockClear();
        apiMock.mockImplementation(async (m) => (m === 'GET' ? { programa: { etapas: {} } } : { id: 'x' }));
        await window.novoProjetoConvidar();
        const posts = apiMock.mock.calls.filter(([m]) => m === 'POST');
        expect(posts).toEqual([['POST', '/api/v1/users', { name: 'Gestora', email: 'g@cliente.lat', role: 'org_admin', client_project_id: 'novo', modulos: ['iso'] }]]);
    });
    it('organização direta: só equipe (sem conta de cliente, onda 1); o platform_admin atuando nela também', async () => {
        S.user = { role: 'consultoria_admin', org_tipo: 'direta', modulos: ['iso', 'privacy', 'ot'] };
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor']);
        S.user = { role: 'platform_admin' };
        window.tipoOrgAtuacao = () => 'direta';
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor']);
    });
    it('erro de um convite fica na linha e o passo não avança; sem nenhum módulo marcado, não convida', async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'A'); digitar('np-p0-email', 'a@exemplo.lat');
        document.querySelector('input[name="np-p0-modulo"][value="iso"]').checked = false;
        apiMock.mockClear();
        await window.novoProjetoConvidar();
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
        expect($('np-p0-erro').textContent).toMatch(/módulo/);
        document.querySelector('input[name="np-p0-modulo"][value="iso"]').checked = true;
        apiMock.mockImplementation(async (m) => { if (m === 'POST') { const e = new Error('Email já cadastrado'); e.status = 400; throw e; } return {}; });
        await window.novoProjetoConvidar();
        expect($('np-p0-erro').textContent).toBe('Email já cadastrado');
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
    });
    it('Pular segue sem convidar; voltar a um passo antes da criação não é possível', async () => {
        await criarAte5(['iso']);
        window.novoProjetoIr(4);
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        apiMock.mockClear();
        window.novoProjetoIr(6);
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
        expect($('np-titulo').textContent).toBe('Novo projeto — Primeiros passos');
    });
});

describe('Pessoas e acessos: proteções extras', () => {
    it('duplo clique em Convidar manda um convite só; o passo nunca chama /ot', async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'A'); digitar('np-p0-email', 'a@exemplo.lat');
        apiMock.mockClear();
        let solta; const trava = new Promise((r) => { solta = r; });
        apiMock.mockImplementation(async (m) => { if (m === 'POST') await trava; return { id: 'x' }; });
        const a = window.novoProjetoConvidar(); const b = window.novoProjetoConvidar();
        solta(); await Promise.all([a, b]);
        const posts = apiMock.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/v1/users');
        expect(posts).toHaveLength(1);
        expect(apiMock.mock.calls.every(([, u]) => !/\/ot/.test(u))).toBe(true);
    });
    it('não oferece o n.ot a quem convida sem ter o n.ot (teto espelhado)', async () => {
        S.user = { role: 'consultoria_admin', org_tipo: 'consultoria', modulos: ['iso'] };
        await criarAte5(['iso', 'ot']);
        expect([...document.querySelectorAll('input[name="np-p0-modulo"]')].map((x) => x.value)).toEqual(['iso']);
    });
    it('o n.ot oferecido vem explicado e desmarcado', async () => {
        await criarAte5(['iso', 'ot']);
        expect($('np-passo').textContent).toMatch(/n\.ot nunca vem marcado/);
        expect(document.querySelector('input[name="np-p0-modulo"][value="ot"]').checked).toBe(false);
    });
});

describe('Pessoas e acessos: falha da designação e e-mail', () => {
    const governanca = (m, u) => m === 'POST' && /governance$/.test(u);
    it('convite ok + designação 500: diz o que falhou, não avança; o retry repete só a designação e avança', async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'A'); digitar('np-p0-email', 'a@exemplo.lat');
        apiMock.mockClear();
        apiMock.mockImplementation(async (m, u) => { if (governanca(m, u)) { const e = new Error('Falha interna'); e.status = 500; throw e; } return { id: 'x' }; });
        await window.novoProjetoConvidar();
        expect($('np-p0-erro').textContent).toBe('Convite enviado, mas a designação falhou: Falha interna. Tente de novo ou designe em Governança.');
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        expect($('np-p0-nome').disabled).toBe(true);
        expect(document.querySelector('[data-action="novoProjetoIr"][data-args="[6]"]').textContent).toBeTruthy();
        expect(document.body.textContent).toContain('Continuar sem designar');
        apiMock.mockImplementation(async () => ({ id: 'x' }));
        await window.novoProjetoConvidar();
        const posts = apiMock.mock.calls.filter(([m]) => m === 'POST');
        expect(posts.filter(([, u]) => u === '/api/v1/users')).toHaveLength(1);
        expect(posts.filter(([m, u]) => governanca(m, u))).toHaveLength(2);
        expect($('np-titulo').textContent).toBe('Novo projeto — Primeiros passos');
    });
    it('emailEnviado:false não diz "Convite enviado"', async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'A'); digitar('np-p0-email', 'a@exemplo.lat'); $('np-p0-papel').value = 'org_user';
        apiMock.mockImplementation(async () => ({ id: 'x', emailEnviado: false }));
        await window.novoProjetoConvidar();
        expect($('np-p0-erro').textContent).toMatch(/e-mail não foi enviado: reenvie o convite em Usuários/);
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        apiMock.mockClear();
        await window.novoProjetoConvidar();
        expect(apiMock.mock.calls.filter(([m]) => m === 'POST')).toEqual([]);
        expect($('np-titulo').textContent).toBe('Novo projeto — Primeiros passos');
    });
    it('platform_admin sem o tipo da organização carregado: só equipe (falha fechada)', async () => {
        S.user = { role: 'platform_admin' };
        window.tipoOrgAtuacao = () => null;
        await criarAte5(['iso']);
        expect([...$('np-p0-papel').options].map((o) => o.value)).toEqual(['consultor']);
    });
});

