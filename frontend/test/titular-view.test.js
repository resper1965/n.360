// Tela Titular e incidentes (fatia 7): pedidos, incidentes, consentimentos e prazos legais. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import '../src/ui.js';
import '../src/views/titular.js';

const B = '/api/v1/projects/p9';
const PEDIDOS = [
    { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', recebido_em: '2026-10-01', prazo_em: '2026-10-16T00:00:00.000Z', status: 'recebido', situacao_prazo: 'no_prazo' },
    { id: 'b', protocolo: 'PT-2026-0002', tipo: 'correcao', canal: 'outro', recebido_em: '2026-10-02', prazo_em: null, status: 'em_andamento', situacao_prazo: 'sem_prazo' },
    { id: 'c', protocolo: 'PT-2026-0003', tipo: 'oposicao', canal: 'outro', recebido_em: '2026-09-01', prazo_em: '2026-09-16', status: 'recebido', situacao_prazo: 'atrasado' },
];
const INCIDENTES = [{ id: 'i1', protocolo: 'IN-2026-0001', titulo: 'Acesso <b>indevido</b>', ciencia_em: '2026-10-01T10:00:00Z', risco_titular: 'relevante', status: 'avaliado', prazo_anpd_em: '2026-10-04T10:00:00.000Z', prazo_titular_em: null, comunicacao_anpd_em: null, comunicacao_titular_em: null, situacao_anpd: 'atrasado', situacao_titular: 'sem_prazo' }];
const CONSENT = [
    { id: 'k1', ropa_id: 'r1', tratamento: 'Marketing <i>x</i>', titular_ref: 'ref-001', finalidade: 'E-mail', versao_aviso: 'Aviso v3', obtido_em: '2026-10-01', revogado_em: null, vigente: true },
    { id: 'k2', ropa_id: 'r1', tratamento: 'Marketing', titular_ref: 'ref-002', finalidade: 'E-mail', versao_aviso: 'Aviso v2', obtido_em: '2026-09-01', revogado_em: '2026-10-05T10:00:00Z', vigente: false },
];
const PARAMS = [
    { chave: 'titular.resposta', descricao: 'Prazo de resposta ao pedido do titular', definido: true, valor: 15, unidade: 'dias_corridos', fonte: 'Fonte <b>X</b>', revisado_em: '2026-10-01', revisado_por: 'Dra. Teste' },
    { chave: 'incidente.comunicacao_anpd', descricao: 'Prazo de comunicação do incidente à ANPD', definido: false },
];
const rotas = (extra = {}) => ({
    [`GET ${B}/titular-pedidos`]: PEDIDOS, [`GET ${B}/incidentes`]: INCIDENTES, [`GET ${B}/consentimentos`]: CONSENT,
    'GET /api/v1/parametros-legais': PARAMS, [`GET ${B}/ropa`]: [{ id: 'r1', processing_purpose: 'Marketing' }], ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

async function abrir(aba, extra = {}) {
    S.titularAba = aba;
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.renderTitular(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    history.replaceState(null, '', '/privacy');
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('abas', () => {
    it('mostra as quatro abas e abre em Pedidos; trocar de aba guarda a escolha e redesenha', async () => {
        await abrir(undefined);
        const abas = [...el('c').querySelectorAll('[data-action="escolherAbaTitular"]')];
        // contagem nas abas, com o atrasado em --danger; role=tab e a ativa marcada por aria-selected (sem preenchimento)
        expect(abas.map((b) => b.textContent)).toEqual(['Pedidos do titular (3 · 1 atrasado)', 'Incidentes (1 · 1 atrasado)', 'Consentimentos', 'Prazos legais']);
        expect(abas[1].querySelector('span span').getAttribute('style')).toContain('var(--danger)');
        expect(el('c').querySelector('[role="tablist"]')).not.toBeNull();
        expect(abas.map((b) => b.getAttribute('role'))).toEqual(['tab', 'tab', 'tab', 'tab']);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
        expect(abas[0].className).not.toContain('btn-primary');
        window.escolherAbaTitular('incidentes');
        expect(S.titularAba).toBe('incidentes');
        expect(window.render).toHaveBeenCalled();
    });
    it('sem projeto ativo: estado vazio', async () => {
        S.activeProject = null; S.projects = [];
        await abrir('pedidos');
        expect(el('c').textContent).toContain('Sem projeto ativo');
    });
});

describe('pedidos', () => {
    it('lista protocolo, tipo, prazo ("Não calculado" quando não há) e a situação do prazo', async () => {
        await abrir('pedidos');
        const t = el('c').textContent;
        expect(t).toContain('PT-2026-0001');
        expect(t).toContain('Acesso aos dados');
        expect(t).toContain('16/10/2026');
        expect(t).toContain('Não calculado');
        expect(t).toContain('No prazo');
        expect(t).toContain('Prazo não calculado');
        expect(t).toContain('Atrasado');
        expect(el('a').querySelector('[data-action="abrirNovoPedidoTitular"]')).not.toBeNull();
    });
    it('papel só de leitura não tem o botão de registrar', async () => {
        S.user = { role: 'org_user' };
        await abrir('pedidos');
        expect(el('a').innerHTML).toBe('');
    });
    it('registrar manda tipo, canal, contato e, só se preenchida, a data; mostra o protocolo e o prazo', async () => {
        const f = await abrir('pedidos', { [`POST ${B}/titular-pedidos`]: { ok: true, id: 'n', protocolo: 'PT-2026-0004', prazo_em: '2026-10-25T00:00:00.000Z' } });
        window.abrirNovoPedidoTitular('p9');
        el('pt-tipo').value = 'portabilidade'; el('pt-canal').value = 'email'; el('pt-nome').value = ' Fulano '; el('pt-desc').value = '';
        await window.salvarNovoPedidoTitular('p9');
        expect(corpoDe(f, `POST ${B}/titular-pedidos`)).toEqual({ tipo: 'portabilidade', canal: 'email', titular_nome: 'Fulano', titular_contato: null, descricao: null });
        expect(document.body.textContent).toContain('PT-2026-0004');
        expect(document.body.textContent).toContain('25/10/2026');
    });
    it('abrir o pedido mostra descrição e resposta escapadas; responder manda status e texto; respondido trava a resposta', async () => {
        const base = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: 'Ana <b>x</b>', titular_contato: null, descricao: 'Quero <i>meus</i> dados', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: null };
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos/a`]: { ...base, status: 'recebido' }, [`PUT ${B}/titular-pedidos/a`]: { ok: true } });
        await window.abrirPedidoTitular('p9', 'a');
        const m = el('modal-content');
        expect(m.textContent).toContain('Ana <b>x</b>');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
        el('pt-status').value = 'respondido'; el('pt-resp').value = ' Segue o relatório. ';
        await window.salvarPedidoTitular('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a`)).toEqual({ status: 'respondido', resposta_texto: 'Segue o relatório.' });
        servir(rotas({ [`GET ${B}/titular-pedidos/a`]: { ...base, status: 'respondido', resposta_texto: 'Segue.' } }));
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('pt-resp').disabled).toBe(true);
    });
});

describe('dados do titular a partir do pedido', () => {
    const PED = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: 'Ana', titular_contato: 'ana@exemplo.com', descricao: '', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: null, status: 'recebido' };
    const DS = `${B}/data-subject`;
    const LOC = { ok: true, encontrado: true, total_registros: 3, ocorrencias: [{ tabela: 'stakeholders', registros: [{}, {}, {}] }] };
    const botao = (nome) => el('modal-content').querySelector(`[data-action="${nome}"]`);
    const abrirPed = async (pedido, extra = {}) => {
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos/a`]: pedido, ...extra });
        await window.abrirPedidoTitular('p9', 'a');
        return f;
    };

    it('com contato: Localizar dados consulta pelo contato e mostra o total; acesso não oferece eliminar', async () => {
        const f = await abrirPed(PED, { [`GET ${DS}`]: LOC });
        expect(botao('eliminarDadosDoTitular')).toBeNull();
        await window.localizarDadosDoTitular('p9', 'a');
        const u = f.mock.calls.map(([x]) => x).find((x) => x.includes('/data-subject'));
        expect(u).toContain('identificador=ana%40exemplo.com');
        expect(el('modal-content').textContent).toContain('3 registro(s)');
    });
    it('sem contato não há busca', async () => {
        await abrirPed({ ...PED, titular_contato: null });
        expect(botao('localizarDadosDoTitular')).toBeNull();
    });
    it('eliminação: pedido de eliminação oferece o botão; confirma na janela com justificativa pré-preenchida e manda pedido_id', async () => {
        const f = await abrirPed({ ...PED, tipo: 'anonimizacao_bloqueio_eliminacao' }, { [`POST ${DS}/erase`]: { ok: true, total: 3 } });
        expect(botao('localizarDadosDoTitular')).not.toBeNull();
        await window.eliminarDadosDoTitular('p9', 'a');
        expect(chamadas(f)).not.toContain(`POST ${DS}/erase`);
        expect(el('pt-elim-just').value).toBe('Pedido PT-2026-0001');
        await window.confirmarEliminacaoTitular('p9', 'a');
        expect(corpoDe(f, `POST ${DS}/erase`)).toEqual({ identificador: 'ana@exemplo.com', justificativa: 'Pedido PT-2026-0001', pedido_id: 'a' });
    });
    it('localizar, eliminar e confirmar usam o contato do pedido do id recebido, não o do último pedido aberto', async () => {
        const PB = { ...PED, id: 'b', protocolo: 'PT-2026-0002', tipo: 'anonimizacao_bloqueio_eliminacao', titular_contato: 'bruno@exemplo.com' };
        const f = await abrirPed(PED, { [`GET ${B}/titular-pedidos/b`]: PB, [`GET ${DS}`]: LOC, [`POST ${DS}/erase`]: { ok: true, total: 1 } });
        await window.localizarDadosDoTitular('p9', 'b');
        expect(f.mock.calls.map(([x]) => x).find((x) => x.includes('/data-subject'))).toContain('identificador=bruno%40exemplo.com');
        await window.abrirPedidoTitular('p9', 'a');
        await window.eliminarDadosDoTitular('p9', 'b');
        expect(el('pt-elim-just').value).toBe('Pedido PT-2026-0002');
        expect(el('pt-dados').textContent).toContain('bruno@exemplo.com');
        await window.abrirPedidoTitular('p9', 'a');
        el('pt-dados').innerHTML = '<input id="pt-elim-just" value="Pedido PT-2026-0002">';
        await window.confirmarEliminacaoTitular('p9', 'b');
        expect(corpoDe(f, `POST ${DS}/erase`)).toEqual({ identificador: 'bruno@exemplo.com', justificativa: 'Pedido PT-2026-0002', pedido_id: 'b' });
    });
    it('org_user não vê os botões', async () => {
        S.user = { role: 'org_user' };
        await abrirPed({ ...PED, tipo: 'anonimizacao_bloqueio_eliminacao' });
        expect(botao('localizarDadosDoTitular')).toBeNull();
        expect(botao('eliminarDadosDoTitular')).toBeNull();
    });
});

describe('incidentes', () => {
    it('lista com risco, situações de prazo e título escapado', async () => {
        await abrir('incidentes');
        const t = el('c').textContent;
        expect(t).toContain('IN-2026-0001');
        expect(t).toContain('Acesso <b>indevido</b>');
        expect(t).toContain('Relevante');
        expect(t).toContain('Atrasado');
        expect(el('c').querySelector('b')).toBeNull();
    });
    it('registrar exige título e ciência (sem eles não chama a API), mostra o protocolo e abre o incidente criado', async () => {
        const f = await abrir('incidentes', {
            [`POST ${B}/incidentes`]: { ok: true, id: 'n', protocolo: 'IN-2026-0002', prazo_anpd_em: null, prazo_titular_em: null },
            [`GET ${B}/incidentes/n`]: { ...INCIDENTES[0], id: 'n', protocolo: 'IN-2026-0002', titulo: 'Perda de notebook', prazo_anpd_em: null, situacao_anpd: 'sem_prazo' },
        });
        window.abrirNovoIncidente('p9');
        await window.salvarNovoIncidente('p9');
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes`);
        el('in-titulo').value = ' Perda de notebook '; el('in-ciencia').value = '2026-10-08';
        await window.salvarNovoIncidente('p9');
        expect(corpoDe(f, `POST ${B}/incidentes`)).toEqual({ titulo: 'Perda de notebook', descricao: null, ocorrido_em: null, ciencia_em: '2026-10-08' });
        expect(document.body.textContent).toContain('IN-2026-0002');
        expect(document.body.textContent).toContain('Prazos não calculados');
        expect(chamadas(f)).toContain(`GET ${B}/incidentes/n`);
        expect(el('modal-content').textContent).toContain('IN-2026-0002 — Perda de notebook');
        expect(el('in-faixa-anpd').textContent).toContain('Prazo da ANPD não calculado');
    });

    it('faixa fixa no topo: "Comunicar à ANPD até DD/MM (faltam N dias úteis)", em --warning com folga e --danger em cima da hora', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T12:00:00Z')); // segunda-feira
        try {
            await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-16T10:00:00.000Z', situacao_anpd: 'no_prazo' } });
            await window.abrirIncidente('p9', 'i1');
            const faixa = el('in-faixa-anpd');
            expect(faixa.textContent).toContain('Comunicar à ANPD até 16/10 (faltam 4 dias úteis)');
            expect(faixa.getAttribute('style')).toContain('var(--warning)');
            expect(el('modal-content').firstElementChild).toBe(faixa);
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-13T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).toContain('(falta 1 dia útil)');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger)');
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } })); // atrasado
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).toContain('Comunicação à ANPD atrasada: o prazo era 04/10');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger)');
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], comunicacao_anpd_em: '2026-10-03T09:00:00Z', situacao_anpd: 'comunicado' } }));
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).toContain('Comunicado à ANPD em 03/10, dentro do prazo.');
        } finally { vi.useRealTimers(); }
    });

    it('sem dia útil restante: nunca "faltam 0 dias úteis"; vence hoje ou venceu pela data', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-16T12:00:00Z')); // sexta-feira
        try {
            // prazo hoje, com o servidor ainda dizendo "no_prazo"
            await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-16T22:00:00.000Z', situacao_anpd: 'no_prazo' } });
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).toContain('Comunicar à ANPD até hoje, 16/10.');
            // prazo no sábado: nenhum dia útil antes dele
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-17T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).not.toContain('0 dias');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger)');
            // prazo ontem
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-15T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await window.abrirIncidente('p9', 'i1');
            expect(el('in-faixa-anpd').textContent).toContain('Comunicação à ANPD atrasada: o prazo era 15/10');
        } finally { vi.useRealTimers(); }
    });

    it('sem risco ao titular: nenhuma comunicação é a próxima ação e encerrar não fala da ANPD', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], risco_titular: 'sem_risco' } });
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelectorAll('.btn-primary').length).toBe(0);
        window.pedirEncerramentoIncidente(...JSON.parse(el('modal-content').querySelector('[data-action="pedirEncerramentoIncidente"]').getAttribute('data-args')));
        expect(el('in-encerrar').textContent).not.toContain('ANPD');
        expect(el('in-encerrar').textContent).toContain('Encerrar o incidente?');
    });

    it('o primário é a próxima comunicação devida; encerrar é ghost, no fim, e confirma na janela', async () => {
        const f = await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] }, [`POST ${B}/incidentes/i1/encerrar`]: { ok: true } });
        await window.abrirIncidente('p9', 'i1');
        const primarios = [...el('modal-content').querySelectorAll('.btn-primary')].map((b) => b.textContent);
        expect(primarios).toEqual(['Registrei a comunicação à ANPD']);
        const pedir = el('modal-content').querySelector('[data-action="pedirEncerramentoIncidente"]');
        expect(pedir.className).toContain('btn-ghost');
        expect(pedir.textContent).toBe('Encerrar incidente');
        const botoes = [...el('modal-content').querySelectorAll('button')];
        expect(botoes[botoes.length - 1]).toBe(pedir);
        window.pedirEncerramentoIncidente('p9', 'i1', false);
        expect(el('in-encerrar').textContent).toContain('A ANPD ainda não foi comunicada. Encerrar mesmo assim?');
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes/i1/encerrar`);
        expect(el('in-encerrar').querySelector('[data-action="encerrarIncidente"]')).not.toBeNull();
        await window.encerrarIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`POST ${B}/incidentes/i1/encerrar`);
        // ANPD comunicada: o primário passa a ser o titular, e a confirmação não fala da ANPD
        servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], comunicacao_anpd_em: '2026-10-03', situacao_anpd: 'comunicado' } }));
        await window.abrirIncidente('p9', 'i1');
        expect([...el('modal-content').querySelectorAll('.btn-primary')].map((b) => b.textContent)).toEqual(['Registrei a comunicação ao titular']);
        window.pedirEncerramentoIncidente('p9', 'i1', true);
        expect(el('in-encerrar').textContent).not.toContain('ANPD ainda não');
        window.cancelarEncerramentoIncidente();
        expect(el('in-encerrar').textContent).toBe('');
    });
    it('abrir mostra prazos e ações; avaliar, comunicar e encerrar chamam as rotas certas', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`PUT ${B}/incidentes/i1/risco`]: { ok: true }, [`POST ${B}/incidentes/i1/comunicacoes`]: { ok: true }, [`POST ${B}/incidentes/i1/encerrar`]: { ok: true },
        });
        await window.abrirIncidente('p9', 'i1');
        expect(el('in-prazos').textContent).toContain('prazo não calculado');
        el('in-risco').value = 'baixo'; el('in-aval').value = ' pouco dado ';
        await window.avaliarRiscoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/risco`)).toEqual({ risco_titular: 'baixo', avaliacao_texto: 'pouco dado' });
        await window.registrarComunicacaoIncidente('p9', 'i1', 'anpd');
        expect(corpoDe(f, `POST ${B}/incidentes/i1/comunicacoes`)).toEqual({ destino: 'anpd' });
        await window.encerrarIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`POST ${B}/incidentes/i1/encerrar`);
    });
    it('incidente encerrado e papel de leitura não têm ações', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], status: 'encerrado' } });
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="encerrarIncidente"], [data-action="pedirEncerramentoIncidente"]')).toBeNull();
        S.user = { role: 'org_user' };
        servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } }));
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="encerrarIncidente"], [data-action="pedirEncerramentoIncidente"]')).toBeNull();
    });
    it('erro de regra do servidor (409 no encerramento) vira aviso e não derruba a tela', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        await window.abrirIncidente('p9', 'i1');
        await window.encerrarIncidente('p9', 'i1'); // POST sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});

describe('aviso de prazos legais não cadastrados', () => {
    it('pedidos sem o prazo de resposta: aviso acima da tabela e atalho para a aba Prazos legais', async () => {
        await abrir('pedidos', { 'GET /api/v1/parametros-legais': [{ chave: 'titular.resposta', descricao: 'X', definido: false }] });
        const aviso = el('titular-aviso-prazos');
        expect(aviso.textContent).toContain('Prazos legais não cadastrados: novos pedidos ficarão sem prazo. Fale com o administrador.');
        expect(aviso.getAttribute('style')).toContain('var(--warning)');
        expect(JSON.parse(aviso.querySelector('[data-action="escolherAbaTitular"]').getAttribute('data-args'))).toEqual(['prazos']);
        expect(el('c').innerHTML.indexOf('titular-aviso-prazos')).toBeLessThan(el('c').innerHTML.indexOf('PT-2026-0001'));
    });
    it('com o prazo cadastrado não há aviso', async () => {
        await abrir('pedidos');
        expect(el('titular-aviso-prazos')).toBeNull();
    });
});

describe('consentimentos', () => {
    it('lista vigentes e revogados; só o vigente tem Revogar; aviso de pseudonimização; texto escapado', async () => {
        await abrir('consentimentos');
        const t = el('c').textContent;
        expect(t).toContain('Marketing <i>x</i>');
        expect(t).toContain('Vigente');
        expect(t).toContain('Revogado em 05/10/2026');
        expect(t).toContain('Não registre CPF');
        expect([...el('c').querySelectorAll('[data-action="revogarConsentimento"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[1])).toEqual(['k1']);
        expect(el('c').querySelector('i')).toBeNull();
    });
    it('registrar exige todos os campos e manda o tratamento escolhido; revogar chama a rota', async () => {
        const f = await abrir('consentimentos', { [`POST ${B}/consentimentos`]: { ok: true, id: 'n' }, [`POST ${B}/consentimentos/k1/revogar`]: { ok: true } });
        await window.abrirNovoConsentimento('p9');
        await window.salvarNovoConsentimento('p9');
        expect(chamadas(f)).not.toContain(`POST ${B}/consentimentos`);
        el('co-ref').value = 'ref-9'; el('co-fin').value = 'Newsletter'; el('co-aviso').value = 'Aviso v4'; el('co-data').value = '2026-10-08'; el('co-canal').value = '';
        await window.salvarNovoConsentimento('p9');
        expect(corpoDe(f, `POST ${B}/consentimentos`)).toEqual({ ropa_id: 'r1', canal: null, titular_ref: 'ref-9', finalidade: 'Newsletter', versao_aviso: 'Aviso v4', obtido_em: '2026-10-08' });
        await window.revogarConsentimento('p9', 'k1');
        expect(chamadas(f)).toContain(`POST ${B}/consentimentos/k1/revogar`);
    });
    it('sem tratamento cadastrado: avisa e não abre o formulário', async () => {
        await abrir('consentimentos', { [`GET ${B}/ropa`]: [] });
        await window.abrirNovoConsentimento('p9');
        expect(el('co-ref')).toBeNull();
        expect(document.body.textContent).toContain('Cadastre um tratamento');
    });
});

describe('prazos legais', () => {
    it('mostra o valor, a fonte e quem revisou, ou "Não definido"; só o administrador vê Editar/Definir', async () => {
        await abrir('prazos');
        const t = el('c').textContent;
        expect(t).toContain('15 dias corridos');
        expect(t).toContain('Fonte <b>X</b>');
        expect(t).toContain('01/10/2026 por Dra. Teste');
        expect(t).toContain('Não definido');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('[data-action="editarParametroLegal"]')).toBeNull();
        S.user = { role: 'platform_admin' };
        await abrir('prazos');
        expect([...el('c').querySelectorAll('[data-action="editarParametroLegal"]')].map((b) => b.textContent)).toEqual(['Editar', 'Definir']);
    });
    it('salvar exige valor, fonte, data e revisor; manda o corpo certo; remover chama o DELETE', async () => {
        S.user = { role: 'platform_admin' };
        const f = await abrir('prazos', { 'PUT /api/v1/parametros-legais/titular.resposta': { ok: true }, 'DELETE /api/v1/parametros-legais/titular.resposta': { ok: true } });
        window.editarParametroLegal('titular.resposta', 'Prazo de resposta', '', 'dias_corridos', '', '', '', true);
        await window.salvarParametroLegal('titular.resposta');
        expect(chamadas(f)).not.toContain('PUT /api/v1/parametros-legais/titular.resposta');
        el('pl-valor').value = '15'; el('pl-unidade').value = 'dias_uteis'; el('pl-fonte').value = ' Lei X, art. Y '; el('pl-rev-em').value = '2026-10-01'; el('pl-rev-por').value = ' Dra. Teste ';
        await window.salvarParametroLegal('titular.resposta');
        expect(corpoDe(f, 'PUT /api/v1/parametros-legais/titular.resposta')).toEqual({ valor: 15, unidade: 'dias_uteis', fonte: 'Lei X, art. Y', revisado_em: '2026-10-01', revisado_por: 'Dra. Teste' });
        await window.removerParametroLegal('titular.resposta');
        expect(chamadas(f)).toContain('DELETE /api/v1/parametros-legais/titular.resposta');
    });
});

describe('incidentes no n.iso', () => {
    beforeEach(() => { history.replaceState(null, '', '/iso'); });
    it('só a aba de incidentes, com título Incidentes; abrirIncidentesIso leva para ela', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso'] };
        await abrir('pedidos');
        expect(el('h').textContent).toBe('Incidentes');
        expect([...el('c').querySelectorAll('[data-action="escolherAbaTitular"]')].map((b) => b.textContent)).toEqual(['Incidentes (1 · 1 atrasado)']);
        expect(el('c').textContent).toContain('IN-2026-0001');
        S.titularAba = 'pedidos';
        window.abrirIncidentesIso();
        expect(S.titularAba).toBe('incidentes');
        expect(navigate).toHaveBeenCalledWith('titular');
    });
    it('na casca n.360 só a aba de incidentes (aviso de incidente não abre a aba do titular)', async () => {
        history.replaceState(null, '', '/');
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        await abrir('pedidos');
        expect([...el('c').querySelectorAll('[data-action="escolherAbaTitular"]')].map((b) => b.textContent)).toEqual(['Incidentes (1 · 1 atrasado)']);
    });
    it('a janela do incidente tem Abrir CAPA quando o projeto tem iso; criar envia incidente_id', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso'] };
        const f = await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], descricao: 'Notebook perdido' }, [`POST ${B}/capa`]: { ok: true, id: 'c1' } });
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="abrirCapaDoIncidente"]')).not.toBeNull();
        await window.abrirCapaDoIncidente('p9', 'i1');
        expect(corpoDe(f, `POST ${B}/capa`)).toEqual({ title: 'Incidente IN-2026-0001: Acesso <b>indevido</b>', description: 'Notebook perdido', incidente_id: 'i1' });
    });
    it('no n.privacy a janela não oferece CAPA e as quatro abas continuam', async () => {
        history.replaceState(null, '', '/privacy');
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        expect(el('c').querySelectorAll('[role="tab"][data-action="escolherAbaTitular"]').length).toBe(4);
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="abrirCapaDoIncidente"]')).toBeNull();
    });
});

describe('rascunhos de IA no n.privacy', () => {
    const PED = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: null, titular_contato: null, descricao: '', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: 'minha resposta', status: 'recebido' };
    const AVISO = 'Rascunho gerado por IA — revise antes de usar';

    it('pedido: Rascunho mostra o texto editável e escapado, sem tocar na resposta; Usar copia; Salvar continua o PUT', async () => {
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos/a`]: PED, [`POST ${B}/titular-pedidos/a/rascunho`]: { ok: true, texto: 'Prezado <b>titular</b>' }, [`PUT ${B}/titular-pedidos/a`]: { ok: true } });
        await window.abrirPedidoTitular('p9', 'a');
        await window.rascunhoRespostaTitular('p9', 'a');
        expect(el('pt-rascunho').textContent).toContain(AVISO);
        expect(el('pt-rascunho-texto').value).toBe('Prezado <b>titular</b>');
        expect(el('pt-rascunho').querySelector('b')).toBeNull();
        expect(el('pt-resp').value).toBe('minha resposta');
        expect(chamadas(f)).not.toContain(`PUT ${B}/titular-pedidos/a`);
        window.usarRascunhoTitular();
        expect(el('pt-resp').value).toBe('Prezado <b>titular</b>');
    });

    it('incidente: rascunho para a ANPD manda o destino, lista o que tem e o que falta, texto editável e escapado', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`POST ${B}/incidentes/i1/rascunho-comunicacao`]: { ok: true, texto: 'À ANPD <script>x</script>', presentes: ['Data da ciência'], faltando: ['Número de titulares <i>afetados</i>'] },
        });
        await window.abrirIncidente('p9', 'i1');
        await window.rascunhoComunicacaoIncidente('p9', 'i1', 'anpd');
        expect(corpoDe(f, `POST ${B}/incidentes/i1/rascunho-comunicacao`)).toEqual({ destino: 'anpd' });
        expect(el('in-rascunho-tem').textContent).toContain('Data da ciência');
        expect(el('in-rascunho-falta').textContent).toContain('Número de titulares <i>afetados</i>');
        expect(el('in-rascunho').textContent).toContain(AVISO);
        expect(el('in-rascunho-texto').value).toBe('À ANPD <script>x</script>');
        expect(el('in-rascunho').querySelector('i, script')).toBeNull();
    });

    it('org_admin vê os botões de rascunho; org_user e a casca n.iso não', async () => {
        S.user = { role: 'org_admin' };
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] }, [`GET ${B}/titular-pedidos/a`]: PED });
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelectorAll('[data-action="rascunhoComunicacaoIncidente"]').length).toBe(2);
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('modal-content').querySelector('[data-action="rascunhoRespostaTitular"]')).not.toBeNull();
        S.user = { role: 'org_user' };
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="rascunhoComunicacaoIncidente"]')).toBeNull();
        S.user = { role: 'consultor' };
        history.replaceState(null, '', '/iso');
        await window.abrirIncidente('p9', 'i1');
        expect(el('modal-content').querySelector('[data-action="rascunhoComunicacaoIncidente"]')).toBeNull();
    });
});
