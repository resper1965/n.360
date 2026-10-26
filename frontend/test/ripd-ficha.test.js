// Página do RIPD em abas (spec 2026-10-26): Dados, Teste de Impacto, Conformidade, Armazenamento e Logs, com a aba no endereço.
// As perguntas gravam por campo, fora do hash; a sugestão da atividade aparece sem ser gravada. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock, navegarMock } = vi.hoisted(() => ({ apiMock: vi.fn(), navegarMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: navegarMock }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/privacy.js';
import '../src/views/ripd-ficha.js';

const el = (id) => document.getElementById(id);
const DPIA = { id: 'd1', system_name: '', atividade: 'Folha de pagamento ficticia', processing_name: 'Folha', status: 'Draft' };
const QUESTIONARIO = [
    { id: 'teste_impacto', rotulo: 'Teste de Impacto', perguntas: [
        { id: 'beneficios', texto: 'Benefícios', tipo: 'texto', resposta: null, da_atividade: null },
        { id: 'terceiros_operadores', texto: 'Existem terceiros (operadores) por parte das etapas de tratamento?', tipo: 'escolha', resposta: null, da_atividade: 'Operadores: Operadora Ficticia' }] },
    { id: 'conformidade', rotulo: 'Conformidade', perguntas: [
        { id: 'o_que_muda', texto: 'O que muda depois do projeto?', tipo: 'texto', resposta: 'Folha digital', da_atividade: null },
        { id: 'quantos_titulares', texto: 'Quantos titulares são afetados?', tipo: 'texto', resposta: null, da_atividade: 'cerca de 300 por mes' }] },
    { id: 'armazenamento', rotulo: 'Armazenamento', perguntas: [
        { id: 'territorio_nacional', texto: 'Os dados ficam em território nacional?', tipo: 'escolha', resposta: 'sim', da_atividade: null }] },
];
const LOGS = [{ evento: 'Aprovação revogada (reaberto)', nome: 'Ana', data: '2026-10-26 10:00:00' }, { evento: 'Criado', nome: 'Ana', data: '2026-10-25 09:00:00' }];

const abrir = async (aba, dpia = DPIA) => {
    apiMock.mockImplementation(async (m, u) => {
        if (m === 'GET' && u.endsWith('/dpia')) return [dpia];
        if (m === 'GET' && u.endsWith('/questionario')) return QUESTIONARIO;
        if (m === 'GET' && u.endsWith('/logs')) return LOGS;
        return { ok: true };
    });
    window.history.replaceState(null, '', `/?tela=ripd-ficha&dpia=d1&aba=${aba}`);
    await window.renderRipdFicha(el('c'), el('h'), el('a'));
};
const chamadas = (m) => apiMock.mock.calls.filter((c) => c[0] === m);

beforeEach(() => {
    apiMock.mockReset();
    navegarMock.mockReset();
    document.body.innerHTML = '<div id="h"></div><div id="a"></div><div id="c"></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    S.ripd = null;
    window.traduzStatus = (s) => s;
    window.render = vi.fn();
});

describe('página do RIPD', () => {
    it('tem as cinco abas, na ordem, e a aba do endereço fica selecionada', async () => {
        await abrir('conformidade');
        const abas = [...el('c').querySelectorAll('[role="tab"]')];
        expect(abas.map((b) => b.textContent)).toEqual(['Dados', 'Teste de Impacto', 'Conformidade', 'Armazenamento', 'Logs']);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false']);
    });

    it('o título usa a finalidade da atividade quando o sistema está vazio', async () => {
        await abrir('dados');
        expect(el('h').textContent).toBe('Folha de pagamento ficticia');
        await abrir('dados', { ...DPIA, system_name: 'CRM' });
        expect(el('h').textContent).toBe('CRM');
    });

    it('abrirRipd grava tela, RIPD e aba no endereço e navega; trocar de aba mantém o RIPD', async () => {
        window.abrirRipd('p1', 'd1');
        const q = new URLSearchParams(window.location.search);
        expect([q.get('tela'), q.get('dpia'), q.get('aba')]).toEqual(['ripd-ficha', 'd1', 'dados']);
        expect(navegarMock).toHaveBeenCalledWith('ripd-ficha');
        await abrir('dados');
        await window.ripdIrParaAba(null, 'logs');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('logs');
        expect(new URLSearchParams(window.location.search).get('dpia')).toBe('d1');
    });

    it('Dados traz os campos que antes só a API editava e avisa que mudar derruba a aprovação de RIPD aprovado', async () => {
        await abrir('dados', { ...DPIA, status: 'Approved', dpo_signature: 'Ana' });
        for (const campo of ['technical_measures', 'residual_risk_level', 'dpo_recommendations', 'data_category_risk']) expect(el(`rf-${campo}`)).not.toBeNull();
        expect(el('rf-aviso-hash').textContent).toContain('derruba a aprovação');
    });

    it('Revogar aprovação só aparece para platform_admin e org_admin', async () => {
        for (const [papel, ve] of [['platform_admin', true], ['org_admin', true], ['consultor', false], ['client', false]]) {
            S.user = { role: papel };
            await abrir('dados', { ...DPIA, status: 'Approved', dpo_signature: 'Ana' });
            expect(el('c').querySelectorAll('[data-action="revogarDPIA"]').length, papel).toBe(ve ? 1 : 0);
        }
    });
});

describe('abas de perguntas', () => {
    it('mostram as respostas gravadas e a sugestão da atividade SEM gravar', async () => {
        await abrir('conformidade');
        expect(el('rf-p-o_que_muda').value).toBe('Folha digital');
        expect(el('rf-p-quantos_titulares').value).toBe('');
        expect(el('c').textContent).toContain('A atividade já indica: cerca de 300 por mes');
        expect(chamadas('PUT')).toHaveLength(0);
        // Com resposta, a sugestão some.
        expect(el('rf-p-o_que_muda').closest('.at-pergunta').textContent).not.toContain('A atividade já indica');
    });

    it('a aba Teste de Impacto traz operadores como sugestão e a escolha em sim, não e não sei', async () => {
        await abrir('teste_impacto');
        expect(el('c').textContent).toContain('A atividade já indica: Operadores: Operadora Ficticia');
        expect([...el('c').querySelectorAll('input[name="rf-p-terceiros_operadores"]')].map((i) => i.value)).toEqual(['sim', 'nao', 'nao_sei']);
        expect(chamadas('PUT')).toHaveLength(0);
    });

    it('autosave: texto grava a pergunta, e vazio apaga, em PUT .../questionario', async () => {
        await abrir('conformidade');
        window.ripdResponder('o_que_muda', 'Tudo digital');
        await vi.waitFor(() => expect(chamadas('PUT')).toHaveLength(1));
        expect(chamadas('PUT')[0].slice(1)).toEqual(['/api/v1/projects/p1/dpia/d1/questionario', { respostas: { o_que_muda: 'Tudo digital' } }]);
        await vi.waitFor(() => expect(el('rf-st-o_que_muda').textContent).toBe('Salvo.'));
        window.ripdResponder('o_que_muda', '');
        await vi.waitFor(() => expect(chamadas('PUT')).toHaveLength(2));
        expect(chamadas('PUT')[1][2]).toEqual({ respostas: { o_que_muda: null } });
    });

    it('erro do servidor aparece no próprio campo, sem derrubar a tela', async () => {
        await abrir('conformidade');
        apiMock.mockRejectedValueOnce(new Error('Pergunta desconhecida: x'));
        await window.ripdResponder('o_que_muda', 'x');
        expect(el('rf-st-o_que_muda').textContent).toContain('Pergunta desconhecida');
    });

    it('sem permissão de edição os campos ficam desabilitados', async () => {
        S.user = { role: 'client' };
        await abrir('armazenamento');
        expect(el('c').querySelector('input[type="radio"]').disabled).toBe(true);
    });
});

describe('aba Logs', () => {
    it('lista a linha do tempo do RIPD, só evento, nome e data', async () => {
        await abrir('logs');
        const txt = el('c').textContent;
        expect(txt).toContain('Aprovação revogada (reaberto)');
        expect(txt).toContain('Criado');
        expect(el('c').querySelectorAll('.at-log').length).toBe(2);
    });
});
