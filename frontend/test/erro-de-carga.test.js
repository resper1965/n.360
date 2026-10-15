// Erro nunca vira vazio: com a API falhando, cada tela mostra o estado de erro (renderErrorState) com "Tentar de novo",
// nunca o estado vazio ("Nenhum risco registrado") nem a ação de criar ("+ Novo risco") sobre dado que não carregou.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { renderErrorState, falhaDeCarga } from '../src/ui.js';
import '../src/globals.js';
import '../src/views/grc.js';
import '../src/views/monitor.js';
import '../src/views/compliance.js';
import '../src/views/privacy.js';
import '../src/views/terceiros.js';
import '../src/views/titular.js';
import '../src/views/partes.js';
import '../src/views/documentos.js';
import '../src/views/requisitos.js';
import '../src/views/admin.js';
import '../src/views/commercial.js';
import '../src/views/dashboard.js';
import '../src/views/project.js';
import { renderPainel } from '../src/views/painel.js';

const falha = (status = 500) => Object.assign(new Error('Internal Server Error'), { status });
const PROJ = { id: 'p1', client_name: 'Cliente Ficticio', modulos: ['iso', 'privacy'] };
const tela = () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return ['c', 'h', 'a'].map((id) => document.getElementById(id));
};
const CRIAR = /Novo|Nova|Registrar|Cadastrar|Enviar evid/;

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockRejectedValue(falha());
    S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = PROJ;
    S.currentProject = PROJ;
    S.projects = [PROJ];
    S.controls = [];
    S.activeAuditId = 'au1';
    S.titularAba = null;
    history.replaceState(null, '', '/privacy');
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

const confere = (c, a, { semAcoes = true } = {}) => {
    const erro = c.querySelector('.error-state');
    expect(erro, c.innerHTML.slice(0, 300)).not.toBeNull();
    expect(erro.getAttribute('role')).toBe('alert');
    const botao = erro.querySelector('button[data-action]');
    expect(botao.textContent).toBe('Tentar de novo');
    expect(c.querySelector('.empty-state')).toBeNull();
    // Nada técnico na tela: nem a mensagem crua do servidor, nem código HTTP, nem caminho de API.
    expect(c.textContent).not.toMatch(/Internal Server Error|HTTP|\/api\/|500/);
    if (semAcoes) expect(a.textContent).not.toMatch(CRIAR);
};

const TELAS = [
    'renderRisks', 'renderVendors', 'renderTraining', 'renderCAPA', 'renderAudits', 'renderMonitor', 'renderPortfolio',
    'renderCertification', 'renderMetrics', 'renderGovernance', 'renderContext', 'renderStakeholders', 'renderManagementReview',
    'renderAssets', 'renderEvidence', 'renderPoliciesDashboard', 'renderAcknowledgments', 'renderROPA', 'renderDPIA',
    'renderTerceiros', 'renderPartes', 'renderDocumentos', 'renderRequisitos', 'renderUsers', 'renderAuditTrail', 'renderApiKeys',
    'renderLeads', 'renderAssessments', 'renderComercial', 'renderProjects',
];

describe('estado de erro nas telas', () => {
    it.each(TELAS)('%s: falha da carga mostra o erro com "Tentar de novo", sem vazio nem "Novo"', async (nome) => {
        if (nome === 'renderApiKeys') S.user = { id: 'u0', role: 'platform_admin' };
        const [c, h, a] = tela();
        await window[nome](c, h, a);
        confere(c, a);
        expect(c.querySelector('.error-state button').dataset.action).toBe('render');
    });

    it('Executar auditoria e Jornada: o erro aparece e o "Voltar" do cabeçalho fica', async () => {
        for (const nome of ['renderAuditExecution', 'renderProjectDetail']) {
            const [c, h, a] = tela();
            await window[nome](c, h, a);
            confere(c, a);
            expect(a.textContent).toMatch(/Voltar/);
        }
    });

    it('Controles: falha ao carregar o catálogo não vira "Carregar catálogo"; tentar de novo recarrega', async () => {
        await window.loadControls();
        expect(S.controlesErro).toBeTruthy();
        const [c, h, a] = tela();
        window.renderControls(c, h, a);
        confere(c, a);
        expect(c.textContent).not.toMatch(/Carregar catálogo/);
        expect(c.querySelector('.error-state button').dataset.action).toBe('recarregarControles');
        apiMock.mockResolvedValue([]);
        window.render = vi.fn();
        await window.recarregarControles();
        expect(S.controlesErro).toBeNull();
        expect(window.render).toHaveBeenCalled();
    });

    it.each(['pedidos', 'incidentes', 'consentimentos', 'prazos'])('Titular, aba %s: erro com "Tentar de novo" e as abas continuam', async (aba) => {
        S.titularAba = aba;
        const [c, h, a] = tela();
        await window.renderTitular(c, h, a);
        confere(c, a);
        expect(c.querySelector('[role="tablist"]')).not.toBeNull();
        expect(c.textContent).toMatch(/prazos continuam correndo/);
    });

    it('Titular: a aba aberta carregou e a outra falhou: lista normal, só sem a contagem da outra', async () => {
        apiMock.mockImplementation(async (m, url) => {
            if (url.endsWith('/incidentes')) throw falha();
            if (url.endsWith('/titular-pedidos')) return [{ id: 'x', protocolo: 'PT-2026-0001', tipo: 'acesso', situacao_prazo: 'no_prazo', status: 'recebido' }];
            return [];
        });
        S.titularAba = 'pedidos';
        const [c, h, a] = tela();
        await window.renderTitular(c, h, a);
        expect(c.querySelector('.error-state')).toBeNull();
        expect(c.textContent).toMatch(/PT-2026-0001/);
        expect(a.textContent).toMatch(/Registrar pedido/);
    });

    it.each(['iso', 'privacy', 'n360'])('Painel (%s): erro com "Tentar de novo"', async (entrada) => {
        S.painel = {};
        const [c, h, a] = tela();
        await renderPainel(c, h, a, entrada);
        confere(c, a);
    });
});

describe('renderErrorState', () => {
    it('escapa a mensagem, usa render por padrão e aceita outra ação com argumentos', () => {
        document.body.innerHTML = renderErrorState('Falhou <b>x</b>');
        expect(document.querySelector('h3').textContent).toBe('Falhou <b>x</b>');
        expect(document.querySelector('b')).toBeNull();
        expect(document.querySelector('button').dataset.action).toBe('render');
        document.body.innerHTML = renderErrorState('Falhou', { acao: 'abrir', args: ['p"1'] });
        expect(JSON.parse(document.querySelector('button').dataset.args)).toEqual(['p"1']);
    });

    it('403 diz que o acesso não alcança e não oferece "Tentar de novo"', () => {
        document.body.innerHTML = renderErrorState('Não foi possível carregar os riscos.', { erro: falha(403) });
        expect(document.querySelector('button')).toBeNull();
        expect(document.body.textContent).toMatch(/acesso não alcança/);
    });

    it('falhaDeCarga limpa as ações do cabeçalho e manda o detalhe só para o console', () => {
        const [c, , a] = tela();
        a.innerHTML = '<button>+ Novo risco</button>';
        falhaDeCarga(c, a, 'Não foi possível carregar os riscos.', falha());
        expect(a.innerHTML).toBe('');
        expect(console.error).toHaveBeenCalled();
        confere(c, a);
    });
});
