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
import { initDelegation } from '../src/delegation.js';
initDelegation();

const semOt = (fn) => async (m, u, b) => { if (/\/ot(\/|$|\?)/.test(String(u))) throw new Error(`chamou ${u}`); return fn(m, u, b); };
const abrirOriginal = window.abrirNovoProjeto;
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
    window.abrirNovoProjeto = abrirOriginal;
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
        apiMock.mockImplementation(semOt(async (m) => { if (m === 'POST') await trava; return { id: 'x' }; }));
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

describe('Primeiros passos', () => {
    const ETAPAS = (m, texto, extra = {}) => ({ [m]: { etapa: 'comecar', feitos: 0, total: 1, etapas: [], proximo: { texto, ...extra } } });
    it('um "Começar" por módulo que o servidor mandou, com o próximo passo; sem o ot no programa, nada do n.ot', async () => {
        await criarAte5(['iso', 'privacy', 'ot']);
        apiMock.mockImplementation(semOt(async (m, url) => (url === '/api/v1/projects/novo/painel'
            ? { programa: { etapas: { ...ETAPAS('iso', 'Carregar as fases da jornada', { tela: 'project-detail' }), ...ETAPAS('privacy', 'Partida', { tela: 'importacao' }) } } } : {})));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        const linhas = [...document.querySelectorAll('.np-primeiros li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
        expect(linhas).toEqual(['n.iso Carregar as fases da jornada Começar', 'n.privacy Partida Começar']);
        expect(document.getElementById('np-passo').textContent).not.toContain('n.ot');
    });
    it('com o ot (pessoa com o módulo), o n.ot também tem o primeiro passo; Começar entra no projeto e vai ao passo', async () => {
        await criarAte5(['iso', 'ot']);
        apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects/novo/painel'
            ? { programa: { etapas: { ...ETAPAS('ot', 'Cadastrar o primeiro site', { tela: 'ot', aba: 'sites' }) } } } : {}));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        window.painelAbrirProximo = vi.fn();
        S.projects = [{ id: 'novo' }];
        expect(document.querySelector('[data-action="novoProjetoComecar"]').dataset.args).toBe('["novo","ot"]');
        window.novoProjetoComecar('novo', 'ot');
        expect(window.painelAbrirProximo).toHaveBeenCalledWith('novo', 'ot', 'sites', null, null);
    });
    it('painel indisponível: oferece abrir o projeto em cada módulo do projeto', async () => {
        await criarAte5(['iso']);
        apiMock.mockImplementation(async () => { throw new Error('falhou'); });
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('[data-action="painelAbrirProjeto"]').dataset.args).toBe('["novo","iso"]');
    });
});

describe('organização criada leva ao assistente', () => {
    it('"Criar o primeiro projeto" escolhe a organização (X-Org-Id) e abre o assistente', async () => {
        await import('../src/views/organizacoes.js');
        S.user = { role: 'platform_admin' };
        window.__orgEscolher = vi.fn();
        window.abrirNovoProjeto = vi.fn();
        window.__orgPrimeiroProjeto('org_nova');
        expect(window.__orgEscolher).toHaveBeenCalledWith('org_nova');
        expect(window.abrirNovoProjeto).toHaveBeenCalled();
    });
    it('quem não é platform_admin não usa o atalho', async () => {
        await import('../src/views/organizacoes.js');
        S.user = { role: 'consultoria_admin' };
        window.abrirNovoProjeto = vi.fn();
        window.__orgPrimeiroProjeto('org_nova');
        expect(window.abrirNovoProjeto).not.toHaveBeenCalled();
    });
});

describe('Primeiros passos: designação pendente e telas fechadas', () => {
    const semDesignar = async () => {
        await criarAte5(['iso']);
        digitar('np-p0-nome', 'Pessoa <b>X</b>'); digitar('np-p0-email', 'x@exemplo.lat');
        apiMock.mockImplementation(async (m, u) => { if (/governance$/.test(u)) throw new Error('Falha interna'); return { id: 'x' }; });
        await window.novoProjetoConvidar();
    };
    it('"Continuar sem designar" avança e o passo 6 avisa quem não foi designado (escapado)', async () => {
        await semDesignar();
        apiMock.mockImplementation(async () => ({ programa: { etapas: {} } }));
        document.querySelector("button[data-action=novoProjetoIr][data-args=\"[6]\"]:not(.btn-primary)").click();
        await new Promise((r) => setTimeout(r, 0));
        expect($('np-titulo').textContent).toBe('Novo projeto — Primeiros passos');
        const t = $('np-passo').textContent;
        expect(t).toContain('foi convidado(a) mas não foi designado(a) ao projeto e não consegue vê-lo. Designe em Governança.');
        expect($('np-passo').innerHTML).not.toContain('<b>X</b>');
    });
    it('"Pular" com convidado não designado mostra o mesmo aviso; sem pendência, nenhum', async () => {
        await semDesignar();
        apiMock.mockImplementation(async () => ({ programa: { etapas: {} } }));
        window.novoProjetoIr(6);
        expect($('np-passo').textContent).toContain('Designe em Governança.');
        await criarAte5(['iso']);
        window.novoProjetoIr(6);
        expect($('np-passo').textContent).not.toContain('Designe em Governança.');
    });
    it('tela fora da lista fechada: o item sai sem botão Começar', async () => {
        await criarAte5(['iso']);
        apiMock.mockImplementation(async () => ({ programa: { etapas: { iso: { etapa: 'comecar', proximo: { texto: 'Algo', tela: 'admin-secreta' } } } } }));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        expect($('np-passo').textContent).toContain('Algo');
        expect(document.querySelector('[data-action="novoProjetoComecar"]')).toBeNull();
    });
});


describe('Primeiros passos: resposta tardia e projeto fora da lista', () => {
    const painel = (u) => /\/painel$/.test(u);
    const etapas = (texto) => ({ programa: { etapas: { iso: { etapa: 'comecar', proximo: { texto, tela: 'project-detail' } } } } });
    const adiado = () => { let ok; const p = new Promise((r) => { ok = r; }); return [p, ok]; };
    it('(a) assistente fechado antes da resposta: não lança nem escreve', async () => {
        await criarAte5(['iso']);
        const [p, ok] = adiado();
        apiMock.mockImplementation(async (m, u) => (painel(u) ? p : {}));
        window.novoProjetoIr(6);
        window.novoProjetoFechar();
        const antes = document.body.innerHTML;
        ok(etapas('Tarde')); await new Promise((r) => setTimeout(r, 0));
        expect(document.body.innerHTML).toBe(antes);
        expect(document.body.textContent).not.toContain('Tarde');
    });
    it('(b) outro assistente/projeto aberto no meio: a resposta de A não toca B, e B busca e mostra os seus', async () => {
        await criarAte5(['iso']);
        const [pA, okA] = adiado();
        apiMock.mockImplementation(async (m, u) => (painel(u) ? pA : {}));
        window.novoProjetoIr(6);
        window.novoProjetoFechar();
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        window.abrirNovoProjeto();
        digitar('emp-razao_social', 'B Ltda');
        window.novoProjetoIr(2); window.novoProjetoIr(3); window.novoProjetoIr(4);
        apiMock.mockImplementation(async (m, u) => (m === 'POST' && u === '/api/v1/projects' ? { id: 'outro', modulos: ['iso'] } : painel(u) ? etapas('Passo de B') : {}));
        await window.criarNovoProjeto();
        window.novoProjetoIr(6);
        okA(etapas('Passo de A')); await new Promise((r) => setTimeout(r, 0));
        expect($('np-passo').textContent).toContain('Passo de B');
        expect($('np-passo').textContent).not.toContain('Passo de A');
        expect(document.querySelector('[data-action="novoProjetoComecar"]').dataset.args).toBe('["outro","iso"]');
    });
    it('Começar com o projeto fora de S.projects: mostra mensagem e não fecha o assistente', async () => {
        await criarAte5(['iso']);
        apiMock.mockImplementation(async (m, u) => (painel(u) ? etapas('X') : {}));
        window.novoProjetoIr(6);
        await new Promise((r) => setTimeout(r, 0));
        S.projects = [];
        window.painelAbrirProximo = vi.fn();
        window.novoProjetoComecar('novo', 'iso');
        expect($('np-erro').textContent).toMatch(/Não foi possível abrir o projeto/);
        expect(window.painelAbrirProximo).not.toHaveBeenCalled();
    });
});
