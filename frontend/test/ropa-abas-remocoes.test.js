// PR3, pacote R: o que a ficha em abas substituiu não existe mais como tela. A entrevista em passos e o modal de Ligações
// redirecionam para a ficha; o que chama a API fica (a API não muda). Router real; produto.js dublado só em irPara.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/produto.js', async (original) => {
    const real = await original();
    return { ...real, irPara: vi.fn() };
});

import { navigate } from '../src/router.js';
import { S } from '../src/state.js';
import html from '../login.html?raw';
import routerFonte from '../src/router.js?raw';
import ligacoesFonte from '../src/views/tratamento-ligacoes.js?raw';

const VIEWS = ['renderROPA', 'renderAtividade', 'renderInicio', 'updateActiveProjectWidget', 'updateHeaderUser'];

beforeEach(() => {
    document.open(); document.write(html); document.close();
    for (const nome of VIEWS) globalThis[nome] = vi.fn();
    history.replaceState(null, '', '/privacy');
    S.user = { role: 'consultor' };
    S.view = null;
    S.ropaEntrevista = null;
    S.atividade = null;
});
afterEach(() => { history.replaceState(null, '', '/'); });

describe('entrevista em passos: o endereço antigo cai na ficha em abas', () => {
    it('com atividade gravada, abre a ficha no modo guiado e leva a atividade', () => {
        S.ropaEntrevista = { projectId: 'p1', recordId: 'r1' };
        navigate('ropa-entrevista');
        expect(S.view).toBe('ropa-atividade');
        expect(S.atividade).toEqual({ projectId: 'p1', ropaId: 'r1' });
        expect(new URL(window.location.href).searchParams.get('modo')).toBe('guiado');
    });
    it('sem atividade gravada (Nova atividade ainda sem registro), volta à lista do RoPA', () => {
        S.ropaEntrevista = { projectId: 'p1', recordId: null };
        navigate('ropa-entrevista');
        expect(S.view).toBe('ropa');
        expect(S.atividade).toBeNull();
    });
    it('o router não tem mais ramo da entrevista em passos', () => {
        expect(routerFonte).not.toContain('renderRopaEntrevista');
        expect(routerFonte).not.toContain("'ropa-entrevista') renderRopaEntrevista");
    });
});

describe('modal de Ligações saiu: a API continua, a tela é a aba', () => {
    const SAIU = ['openLigacoesTratamento', 'sugerirTratamento', 'aplicarSugestaoTratamento', 'salvarItensTratamento',
        'salvarDepartamentosTratamento', 'salvarBaseLegalTratamento', 'copiarDiagramaTratamento', 'salvarRiscoAtividade',
        'salvarAcaoAtividade', 'atualizarTratamento'];
    it('as funções só do modal não existem no código nem no navegador', async () => {
        await import('../src/views/tratamento-ligacoes.js');
        for (const nome of SAIU) {
            expect(ligacoesFonte, nome).not.toMatch(new RegExp(`window\.${nome}\b`));
            expect(window[nome], nome).toBeUndefined();
        }
    });
    it('o que as abas usam continua exportado e no navegador', async () => {
        const m = await import('../src/views/tratamento-ligacoes.js');
        expect(typeof m.formularioLia).toBe('function');
        expect(typeof m.podeEditar).toBe('function');
        for (const nome of ['adicionarParteTratamento', 'removerParteTratamento', 'adicionarTransferenciaTratamento',
            'removerTransferenciaTratamento', 'salvarLiaTratamento', 'openImportarRopaModal', 'enviarImportacaoRopa', 'baixarModeloRopa']) {
            expect(typeof window[nome], nome).toBe('function');
        }
    });
});

describe('consentimento abre o tratamento na ficha, não no modal', () => {
    it('abrirTratamentoDoConsentimento chama abrirAtividade', async () => {
        globalThis.abrirAtividade = vi.fn();
        await import('../src/ui.js');
        await import('../src/views/consentimentos.js');
        window.abrirTratamentoDoConsentimento('p1', 'r1');
        expect(globalThis.abrirAtividade).toHaveBeenCalledWith('p1', 'r1');
    });
});
