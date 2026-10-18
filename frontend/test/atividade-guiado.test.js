// Modo guiado (PR3): o painel é uma segunda porta para as mesmas abas. A pergunta vem do servidor, "Não sei agora" guarda só a
// lista de adiadas no navegador, o fim sugere gaps e riscos abrindo a aba, e a rota antiga da entrevista redireciona.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, navigateMock } = vi.hoisted(() => ({ apiMock: vi.fn(), navigateMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({ Authorization: 'Bearer tok' }) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: navigateMock }));

import { S } from '../src/state.js';
import { painelGuiado, adiadas, chaveDaPergunta, gravarModoNoEndereco, modoDoEndereco, focarCampo } from '../src/atividade/guiado.js';
import { PERGUNTAS_GUIADAS, textoDaPergunta } from '../src/atividade/perguntas.js';
import * as entrevista from '../src/views/ropa-entrevista.js';

const ficha = (proxima, abas = {}) => ({
    proxima_pergunta: proxima,
    abas: { gaps: { estado: 'vazio', resumo: '' }, riscos: { estado: 'vazio', resumo: '' }, ...abas },
});
const painel = (html) => { document.body.innerHTML = html; return document.querySelector('aside.at-guiado'); };

beforeEach(() => {
    apiMock.mockReset();
    navigateMock.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/privacy?tela=ropa-atividade');
    S.user = { role: 'org_admin' };
    S.atividade = null;
});

describe('painel guiado', () => {
    it('é um aside rotulado por um h3, com a pergunta atual do servidor em linguagem simples', () => {
        const aside = painel(painelGuiado(ficha({ aba: 'escopo', campo: 'finalidade' }), 'r1'));
        expect(aside.getAttribute('aria-labelledby')).toBe('at-guiado-titulo');
        expect(aside.querySelector('h3#at-guiado-titulo').textContent).toBe('Entrevista guiada');
        expect(aside.querySelector('.at-guiado-pergunta').textContent).toBe('Qual atividade da empresa usa dados de pessoas?');
        expect(aside.textContent).toContain('Folha de pagamento');
    });

    it('"Continuar" é o único botão primário do painel', () => {
        const aside = painel(painelGuiado(ficha({ aba: 'escopo', campo: 'responsavel' }), 'r1'));
        const primarios = [...aside.querySelectorAll('.btn-primary')];
        expect(primarios.map((b) => b.textContent.trim())).toEqual(['Continuar']);
        expect([...aside.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Continuar', 'Não sei agora', 'Sair do guiado']);
    });

    it('o texto da ajuda é o da entrevista antiga (mesmo texto), e a pergunta de impacto cai no texto geral', () => {
        expect(PERGUNTAS_GUIADAS['escopo/finalidade'].ajuda).toBe('Cada atividade vira uma linha do inventário que a ANPD pode pedir (art. 37 da LGPD). Use o nome que a empresa usa no dia a dia.');
        expect(textoDaPergunta({ aba: 'impacto', campo: 'larga_escala' }).titulo).toBe('Responda a pergunta do teste de impacto');
        expect(textoDaPergunta({ aba: 'escopo', campo: 'inexistente' }).titulo).toBe('Responda este campo');
    });

    it('"Não sei agora" só guarda, no navegador, a lista de campos adiados (nenhum dado de resposta)', () => {
        const p = { aba: 'tratamento', campo: 'coleta.titulares' };
        expect(chaveDaPergunta(p)).toBe('tratamento/coleta.titulares');
        window.atGuiadoAdiar.call(null); // sem atividade aberta não faz nada
        expect(window.sessionStorage.length).toBe(0);
        S.atividade = { projectId: 'p1', ropaId: 'r1', ficha: ficha(p) };
        window.atRepintar = vi.fn();
        window.atGuiadoAdiar();
        expect(adiadas('r1')).toEqual(['tratamento/coleta.titulares']);
        expect(window.sessionStorage.length).toBe(1);
        expect(window.sessionStorage.key(0)).toBe('ra.adiadas.r1');
        expect(window.sessionStorage.getItem('ra.adiadas.r1')).toBe('["tratamento/coleta.titulares"]');
        const aside = painel(painelGuiado(ficha(p), 'r1'));
        expect(aside.textContent).toContain('Pergunta adiada nesta sessão.');
    });

    it('"Continuar" grava o pendente e volta à ficha; se a mesma pergunta voltar, pede a resposta', async () => {
        const p = { aba: 'escopo', campo: 'responsavel' };
        S.atividade = { projectId: 'p1', ropaId: 'r1', ficha: ficha(p) };
        window.atRepintar = vi.fn(async () => {});
        await window.atGuiadoContinuar();
        expect(S.atividade.avancou).toBe(true);
        expect(window.atRepintar).toHaveBeenCalledTimes(1);
        const aside = painel(painelGuiado(ficha(p), 'r1'));
        expect(aside.textContent).toContain('Responda o campo para continuar, ou use "Não sei agora".');
    });

    it('tudo respondido: "Tudo respondido" e as sugestões abrem a aba de gaps e de riscos (vazias), sem perguntar', () => {
        const aside = painel(painelGuiado(ficha(null, { gaps: { estado: 'vazio', resumo: '' }, riscos: { estado: 'feito', resumo: '2 riscos.' } }), 'r1'));
        expect(aside.querySelector('.at-guiado-pergunta').textContent).toBe('Tudo respondido.');
        const sugeridos = [...aside.querySelectorAll('button[data-action="atIrParaAba"]')];
        expect(sugeridos.map((b) => [b.dataset.aba, b.textContent])).toEqual([['gaps', 'Quer registrar os gaps agora?']]);
        expect(aside.querySelector('.btn-primary')).toBeNull();
    });

    it('"Sair do guiado" tira ?modo= e mantém o resto do endereço', async () => {
        window.history.replaceState(null, '', '/privacy?tela=ropa-atividade&aba=gaps&modo=guiado');
        expect(modoDoEndereco()).toBe(true);
        S.atividade = { projectId: 'p1', ropaId: 'r1', modo: 'guiado' };
        window.atRepintar = vi.fn(async () => {});
        await window.atGuiadoSair();
        expect(modoDoEndereco()).toBe(false);
        expect(new URL(window.location.href).searchParams.get('aba')).toBe('gaps');
        expect(S.atividade.modo).toBeNull();
        gravarModoNoEndereco(true);
        expect(new URL(window.location.href).searchParams.get('modo')).toBe('guiado');
    });

    it('focarCampo leva o foco ao primeiro campo da aba', () => {
        document.body.innerHTML = '<div id="corpo"><input id="campo-x"><select></select></div>';
        focarCampo(document.getElementById('corpo'));
        expect(document.activeElement.id).toBe('campo-x');
    });
});

describe('rota da entrevista antiga', () => {
    it('reexporta as permissões que a tela de RoPA usa', () => {
        expect(typeof entrevista.podeEntrevistar).toBe('function');
        expect(typeof entrevista.temAprovacao).toBe('function');
        expect(typeof entrevista.confirmaEdicaoAprovada).toBe('function');
        S.user = { role: 'org_user' };
        expect(entrevista.podeEntrevistar()).toBe(false);
        S.user = { role: 'consultor' };
        expect(entrevista.podeEntrevistar()).toBe(true);
    });

    it('abre a atividade em modo guiado e a rota antiga leva à atividade aberta', () => {
        entrevista.abrirNoGuiado('p1', 'r1');
        expect(S.atividade).toMatchObject({ projectId: 'p1', ropaId: 'r1', modo: 'guiado' });
        expect(navigateMock).toHaveBeenLastCalledWith('ropa-atividade');
        entrevista.renderRopaEntrevista();
        expect(navigateMock).toHaveBeenLastCalledWith('ropa-atividade');
        S.atividade = null;
        entrevista.renderRopaEntrevista();
        expect(navigateMock).toHaveBeenLastCalledWith('ropa');
    });
});
