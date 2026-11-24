// Tela Titular e incidentes (fatia 7): pedidos, incidentes, consentimentos e prazos legais. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/titular.js';

initDelegation();
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

/** A ficha do incidente é página (fatia 3): abre pelo endereço (o navigate é dublado) e desenha em #c, na aba pedida. */
async function ficha(aba = 'registro', id = 'i1') {
    window.abrirIncidente('p9', id, aba);
    await window.renderIncidenteFicha(el('c'), el('h'), el('a'));
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
        // contagem nas abas, com o atrasado em --danger-ink (texto); role=tab e a ativa marcada por aria-selected (sem preenchimento)
        expect(abas.map((b) => b.textContent)).toEqual(['Pedidos do titular (3 · 1 atrasado)', 'Incidentes (1 · 1 atrasado)', 'Consentimentos', 'Prazos legais']);
        expect(abas[1].querySelector('span span').getAttribute('style')).toContain('var(--danger-ink)');
        expect(el('c').querySelector('[role="tablist"]')).not.toBeNull();
        expect(abas.map((b) => b.getAttribute('role'))).toEqual(['tab', 'tab', 'tab', 'tab']);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
        expect(abas[0].className).not.toContain('btn-primary');
        // pela navegação, para o item ativo do menu acompanhar a aba
        window.escolherAbaTitular('incidentes');
        expect(S.titularAba).toBe('incidentes');
        expect(navigate).toHaveBeenLastCalledWith('titular');
    });
    it('lista vazia: um primário só, o do cabeçalho (o do vazio é secundário)', async () => {
        await abrir('pedidos', { [`GET ${B}/titular-pedidos`]: [] });
        const primarios = [...document.querySelectorAll('#a .btn-primary, #c .btn-primary')].map((b) => b.textContent.trim());
        expect(primarios).toEqual(['+ Registrar pedido']);
        await abrir('incidentes', { [`GET ${B}/incidentes`]: [] });
        expect([...document.querySelectorAll('#a .btn-primary, #c .btn-primary')].map((b) => b.textContent.trim())).toEqual(['+ Registrar incidente']);
    });
    it('sem projeto ativo: estado vazio', async () => {
        S.activeProject = null; S.projects = [];
        await abrir('pedidos');
        expect(el('c').textContent).toContain('Sem projeto ativo');
    });
});

describe('pedidos', () => {
    it('Exportar CSV baixa pela rota do servidor, com o filtro da tela', async () => {
        const f = await abrir('pedidos');
        expect(el('c').querySelector('[data-action="listaExportar"]')).not.toBeNull();
        await window.listaExportar('pt');
        expect(chamadas(f)).toContain(`GET ${B}/export/pedidos-titular`);
    });
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
        // Só o "Canal do titular" (leitura) fica para quem não registra.
        expect([...el('a').querySelectorAll('button')].map((b) => b.dataset.action)).toEqual(['abrirCanalTitular']);
    });
    it('registrar manda tipo, canal, contato e, só se preenchida, a data; mostra o protocolo e o prazo', async () => {
        const f = await abrir('pedidos', { [`POST ${B}/titular-pedidos`]: { ok: true, id: 'n', protocolo: 'PT-2026-0004', prazo_em: '2026-10-25T00:00:00.000Z' } });
        window.abrirNovoPedidoTitular('p9');
        el('pt-tipo').value = 'portabilidade'; el('pt-canal').value = 'email'; el('pt-nome').value = ' Fulano '; el('pt-desc').value = '  ';
        // Sem descrição não registra (um clique no formulário em branco criava um pedido vazio).
        await window.salvarNovoPedidoTitular('p9');
        expect(chamadas(f)).not.toContain(`POST ${B}/titular-pedidos`);
        expect(document.body.textContent).toContain('Descreva o pedido antes de registrar.');
        el('pt-desc').value = ' Quer os dados em CSV ';
        await window.salvarNovoPedidoTitular('p9');
        expect(corpoDe(f, `POST ${B}/titular-pedidos`)).toEqual({ tipo: 'portabilidade', canal: 'email', titular_nome: 'Fulano', titular_contato: null, descricao: 'Quer os dados em CSV' });
        expect(document.body.textContent).toContain('PT-2026-0004');
        expect(document.body.textContent).toContain('25/10/2026');
    });
    it('abrir o pedido mostra descrição e resposta escapadas; responder manda status e texto; respondido trava a resposta', async () => {
        const base = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: 'Ana <b>x</b>', titular_contato: null, descricao: 'Quero <i>meus</i> dados', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: null, identidade_metodo: 'documento_foto' };
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
        // Respondido só vai para arquivado (o servidor recusa o resto): o seletor oferece só isso.
        expect([...el('pt-status').options].map((o) => o.value)).toEqual(['respondido', 'arquivado']);
    });
});

describe('identidade e encaminhamento do pedido', () => {
    const PED = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'email', titular_nome: 'Ana', titular_contato: null, descricao: 'x', recebido_em: '2026-10-01', prazo_em: null, situacao_prazo: 'sem_prazo', resposta_texto: null, status: 'recebido', identidade_metodo: null };
    const ENC = { id: 'e1', parte_nome: 'Ponto <b>Focal</b>', prazo: '2026-12-01', mensagem: 'Ver registros', status: 'aguardando', retorno: null, situacao: 'no_prazo' };
    const rotasPed = (pedido = PED, encs = [ENC]) => ({
        [`GET ${B}/titular-pedidos/a`]: pedido, [`GET ${B}/titular-pedidos/a/tratativas`]: [], [`GET ${B}/titular-pedidos/a/encaminhamentos`]: { encaminhamentos: encs },
        [`PUT ${B}/titular-pedidos/a/identidade`]: { ok: true }, [`PUT ${B}/titular-pedidos/a`]: { ok: true },
        [`GET ${B}/partes`]: [{ id: 'pf', nome: 'Ponto Focal', email: 'pf@exemplo.invalid', tipo: 'pessoa' }, { id: 'sem', nome: 'Sem Email', email: null, tipo: 'pessoa' }],
        [`POST ${B}/titular-pedidos/a/encaminhamentos`]: { ok: true, id: 'e2', email_enviado: false },
        [`PUT ${B}/titular-pedidos/a/encaminhamentos/e1`]: { ok: true },
    });
    it('sem conferência: diz que não foi conferida; registrar manda método e observação; conferida mostra quem e quando', async () => {
        const f = await abrir('pedidos', rotasPed());
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('pt-identidade-box').textContent).toContain('Identidade não conferida');
        el('pt-id-metodo').value = 'presencial'; el('pt-id-obs').value = ' Atendido no balcão ';
        await window.salvarIdentidadeTitular('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a/identidade`)).toEqual({ metodo: 'presencial', observacao: 'Atendido no balcão' });
        servir(rotas(rotasPed({ ...PED, identidade_metodo: 'presencial', identidade_obs: 'Balcão', identidade_por_nome: 'Ana Exemplo', identidade_em: '2026-11-06T13:00:00Z' })));
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('pt-identidade-box').textContent).toContain('Presencial');
        expect(el('pt-identidade-box').textContent).toContain('Conferida por Ana Exemplo em 06/11/2026');
    });
    it('responder sem conferência pede confirmação; recusar não grava, aceitar grava', async () => {
        const f = await abrir('pedidos', rotasPed());
        await window.abrirPedidoTitular('p9', 'a');
        el('pt-status').value = 'respondido'; el('pt-resp').value = 'Resposta';
        let salvar = window.salvarPedidoTitular('p9', 'a');
        await vi.waitFor(() => expect(document.querySelector('[data-confirmar="nao"]')).not.toBeNull());
        expect(document.body.textContent).toContain('Identidade não conferida. Responder mesmo assim?');
        document.querySelector('[data-confirmar="nao"]').click();
        await salvar;
        expect(chamadas(f)).not.toContain(`PUT ${B}/titular-pedidos/a`);
        salvar = window.salvarPedidoTitular('p9', 'a');
        await vi.waitFor(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
        document.querySelector('[data-confirmar="sim"]').click();
        await salvar;
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a`)).toEqual({ status: 'respondido', resposta_texto: 'Resposta' });
    });
    it('lista: pedido aberto sem conferência tem o selo; respondido não', async () => {
        await abrir('pedidos', { [`GET ${B}/titular-pedidos`]: [{ ...PED }, { ...PED, id: 'r', protocolo: 'PT-2026-0009', status: 'respondido', situacao_prazo: 'encerrado' }] });
        const linhas = [...el('c').querySelectorAll('tbody tr')];
        expect(linhas.find((l) => l.textContent.includes('PT-2026-0001')).textContent).toContain('Identidade não conferida');
        expect(linhas.find((l) => l.textContent.includes('PT-2026-0009')).textContent).not.toContain('Identidade não conferida');
    });
    it('encaminhamentos: lista escapada; encaminhar só oferece pessoa com e-mail e avisa e-mail não enviado; retorno e cancelar', async () => {
        const f = await abrir('pedidos', rotasPed());
        await window.abrirPedidoTitular('p9', 'a');
        await vi.waitFor(() => expect(el('pt-encaminhamentos-box').textContent).toContain('Ver registros'));
        expect(el('pt-encaminhamentos-box').querySelector('b')).toBeNull();
        await window.abrirEncaminhar('p9', 'a');
        expect([...el('pt-enc-parte').options].map((o) => o.value)).toEqual(['pf']);
        el('pt-enc-prazo').value = '2026-12-10'; el('pt-enc-msg').value = ' Localizar ponto ';
        await window.salvarEncaminhamento('p9', 'a');
        expect(corpoDe(f, `POST ${B}/titular-pedidos/a/encaminhamentos`)).toEqual({ parte_id: 'pf', prazo: '2026-12-10', mensagem: 'Localizar ponto' });
        expect(document.body.textContent).toContain('o e-mail não foi enviado');
        el('pt-enc-ret-e1').value = ' Feito ';
        await window.registrarRetornoEncaminhamento('p9', 'a', 'e1');
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a/encaminhamentos/e1`)).toEqual({ status: 'respondido', retorno: 'Feito' });
    });
    it('cancelar encaminhamento pede confirmação', async () => {
        const f = await abrir('pedidos', rotasPed());
        await window.abrirPedidoTitular('p9', 'a');
        await vi.waitFor(() => expect(el('pt-encaminhamentos-box').textContent).toContain('Ver registros'));
        const cancelar = window.cancelarEncaminhamento('p9', 'a', 'e1');
        await vi.waitFor(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
        document.querySelector('[data-confirmar="sim"]').click();
        await cancelar;
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/a/encaminhamentos/e1`)).toEqual({ status: 'cancelado' });
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
        // Depois de registrar, abre a ficha do incidente criado (página com abas).
        expect(navigate).toHaveBeenLastCalledWith('incidente-ficha');
        expect(new URLSearchParams(window.location.search).get('incidente')).toBe('n');
        await window.renderIncidenteFicha(el('c'), el('h'), el('a'));
        expect(chamadas(f)).toContain(`GET ${B}/incidentes/n`);
        expect(el('h').textContent).toBe('IN-2026-0002 — Perda de notebook');
        expect(el('in-faixa-anpd').textContent).toContain('Prazo da ANPD não calculado');
    });

    it('ficha do incidente: bloco n.ot só com o módulo ot (pessoa e projeto); sem ele, nenhuma chamada a /ot/referencias', async () => {
        const rota = { [`GET ${B}/incidentes/i1`]: INCIDENTES[0], [`GET ${B}/ot/referencias`]: { referencias: [] }, [`GET ${B}/ot/sites`]: { sites: [] } };
        let f = await abrir('incidentes', rota); // pessoa sem a lista de módulos: falha fechado
        await ficha();
        expect(el('ot-vinculo')).toBeNull();
        expect(chamadas(f).some((c) => c.includes('/ot/'))).toBe(false);
        S.user = { role: 'consultor', modulos: ['iso', 'ot'] }; S.activeProject = { id: 'p9', modulos: ['iso'] };
        f = await abrir('incidentes', rota); await ficha();
        expect(el('ot-vinculo')).toBeNull();
        expect(chamadas(f).some((c) => c.includes('/ot/'))).toBe(false);
        S.activeProject = { id: 'p9', modulos: ['iso', 'ot'] };
        f = await abrir('incidentes', rota); await ficha();
        await vi.waitFor(() => expect(el('ot-vinculo').textContent).toContain('Vínculo com o n.ot'));
        expect(chamadas(f)).toContain(`GET ${B}/ot/referencias`);
    });

    it('faixa fixa no topo: "Comunicar à ANPD até DD/MM (faltam N dias úteis)", em --warning com folga e --danger em cima da hora', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T12:00:00Z')); // segunda-feira
        try {
            await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-16T10:00:00.000Z', situacao_anpd: 'no_prazo' } });
            await ficha();
            const faixa = el('in-faixa-anpd');
            expect(faixa.textContent).toContain('Comunicar à ANPD até 16/10 (faltam 4 dias úteis)');
            expect(faixa.getAttribute('style')).toContain('var(--warning)');
            expect(el('c').querySelector('.tc').firstElementChild).toBe(faixa);
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-13T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await ficha();
            expect(el('in-faixa-anpd').textContent).toContain('(falta 1 dia útil)');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger)');
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } })); // atrasado
            await ficha();
            expect(el('in-faixa-anpd').textContent).toContain('Comunicação à ANPD atrasada: o prazo era 04/10');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger-ink)');
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], comunicacao_anpd_em: '2026-10-03T09:00:00Z', situacao_anpd: 'comunicado' } }));
            await ficha();
            expect(el('in-faixa-anpd').textContent).toContain('Comunicado à ANPD em 03/10, dentro do prazo.');
        } finally { vi.useRealTimers(); }
    });

    it('sem dia útil restante: nunca "faltam 0 dias úteis"; vence hoje ou venceu pela data', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-16T12:00:00Z')); // sexta-feira
        try {
            // prazo hoje, com o servidor ainda dizendo "no_prazo"
            await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-16T22:00:00.000Z', situacao_anpd: 'no_prazo' } });
            await ficha();
            expect(el('in-faixa-anpd').textContent).toContain('Comunicar à ANPD até hoje, 16/10.');
            // prazo no sábado: nenhum dia útil antes dele
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-17T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await ficha();
            expect(el('in-faixa-anpd').textContent).not.toContain('0 dias');
            expect(el('in-faixa-anpd').getAttribute('style')).toContain('var(--danger)');
            // prazo ontem
            servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], prazo_anpd_em: '2026-10-15T10:00:00.000Z', situacao_anpd: 'no_prazo' } }));
            await ficha();
            expect(el('in-faixa-anpd').textContent).toContain('Comunicação à ANPD atrasada: o prazo era 15/10');
        } finally { vi.useRealTimers(); }
    });

    it('risco baixo: comunicação "Não exigida" em tom neutro na lista, na ficha e na faixa; sem primário e encerrar não fala da ANPD', async () => {
        const baixo = { ...INCIDENTES[0], risco_titular: 'baixo', situacao_anpd: 'nao_exigida', situacao_titular: 'nao_exigida' };
        await abrir('incidentes', { [`GET ${B}/incidentes`]: [baixo], [`GET ${B}/incidentes/i1`]: baixo });
        expect(el('c').textContent).toContain('Não exigida');
        expect(el('c').textContent).not.toContain('Atrasado');
        await ficha();
        const faixa = el('in-faixa-anpd');
        expect(faixa.textContent).toContain('Comunicação à ANPD: não exigida');
        expect(faixa.getAttribute('style')).not.toMatch(/danger|warning/);
        expect(el('in-prazos').textContent).toContain('ANPD: Não exigida');
        expect(el('c').querySelectorAll('.btn-primary').length).toBe(0);
        window.pedirEncerramentoIncidente(...JSON.parse(el('c').querySelector('[data-action="pedirEncerramentoIncidente"]').getAttribute('data-args')));
        expect(el('in-encerrar').textContent).not.toContain('ANPD');
        await ficha('comunicacao');
        expect(el('c').querySelectorAll('.btn-primary').length).toBe(0);
    });

    it('sem risco ao titular: nenhuma comunicação é a próxima ação e encerrar não fala da ANPD', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], risco_titular: 'sem_risco', situacao_anpd: 'nao_exigida', situacao_titular: 'nao_exigida' } });
        await ficha('comunicacao');
        expect(el('c').querySelectorAll('.btn-primary').length).toBe(0);
        await ficha();
        expect(el('c').querySelectorAll('.btn-primary').length).toBe(0);
        window.pedirEncerramentoIncidente(...JSON.parse(el('c').querySelector('[data-action="pedirEncerramentoIncidente"]').getAttribute('data-args')));
        expect(el('in-encerrar').textContent).not.toContain('ANPD');
        expect(el('in-encerrar').textContent).toContain('Encerrar o incidente?');
    });

    it('o primário é a próxima comunicação devida; encerrar é ghost, no fim, e confirma na janela', async () => {
        const f = await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] }, [`POST ${B}/incidentes/i1/encerrar`]: { ok: true } });
        await ficha('comunicacao');
        const primarios = [...el('c').querySelectorAll('.btn-primary')].map((b) => b.textContent);
        expect(primarios).toEqual(['Registrei a comunicação à ANPD']);
        await ficha();
        const pedir = el('c').querySelector('[data-action="pedirEncerramentoIncidente"]');
        expect(pedir.className).toContain('btn-ghost');
        expect(pedir.textContent).toBe('Encerrar incidente');
        const botoes = [...el('c').querySelectorAll('button')];
        expect(botoes[botoes.length - 1]).toBe(pedir);
        // Risco relevante sem ANPD e risco não avaliado: o servidor recusa, então a tela diz o que falta e não oferece encerrar.
        window.pedirEncerramentoIncidente('p9', 'i1', false, 'relevante');
        expect(el('in-encerrar').textContent).toContain('só encerra depois de registrada a comunicação à ANPD');
        expect(el('in-encerrar').querySelector('[data-action="encerrarIncidente"]')).toBeNull();
        window.pedirEncerramentoIncidente('p9', 'i1', false, null);
        expect(el('in-encerrar').textContent).toContain('Avalie o risco ao titular antes de encerrar.');
        window.pedirEncerramentoIncidente('p9', 'i1', false, 'baixo');
        expect(el('in-encerrar').textContent).toContain('A ANPD ainda não foi comunicada. Encerrar mesmo assim?');
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes/i1/encerrar`);
        expect(el('in-encerrar').querySelector('[data-action="encerrarIncidente"]')).not.toBeNull();
        await window.encerrarIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`POST ${B}/incidentes/i1/encerrar`);
        // ANPD comunicada: o primário passa a ser o titular, e a confirmação não fala da ANPD
        servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], comunicacao_anpd_em: '2026-10-03', situacao_anpd: 'comunicado' } }));
        await ficha('comunicacao');
        expect([...el('c').querySelectorAll('.btn-primary')].map((b) => b.textContent)).toEqual(['Registrei a comunicação ao titular']);
        await ficha();
        window.pedirEncerramentoIncidente('p9', 'i1', true, 'relevante');
        expect(el('in-encerrar').textContent).not.toContain('ANPD ainda não');
        window.cancelarEncerramentoIncidente();
        expect(el('in-encerrar').textContent).toBe('');
    });
    it('abrir mostra prazos e ações; avaliar, comunicar e encerrar chamam as rotas certas', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`PUT ${B}/incidentes/i1/risco`]: { ok: true }, [`POST ${B}/incidentes/i1/comunicacoes`]: { ok: true }, [`POST ${B}/incidentes/i1/encerrar`]: { ok: true },
        });
        await ficha();
        expect(el('in-prazos').textContent).toContain('prazo não calculado');
        el('in-risco').value = 'baixo'; el('in-aval').value = ' pouco dado ';
        await window.avaliarRiscoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/risco`)).toEqual({ risco_titular: 'baixo', avaliacao_texto: 'pouco dado' });
        // Registrar a comunicação pede confirmação na janela e manda a data escolhida (hoje vem preenchido).
        await ficha('comunicacao');
        el('in-com-data').value = '2026-10-03';
        // Canal e protocolo da ANPD vêm com a comunicação à ANPD.
        expect([...el('in-com-canal').options].map((o) => o.textContent)).toEqual(['Não informado', 'Peticionamento eletrônico (SEI)', 'Formulário da ANPD', 'E-mail', 'Outro']);
        el('in-com-canal').value = 'sei'; el('in-com-prot').value = ' 00000.000001/2026-01 ';
        const registro = window.registrarComunicacaoIncidente('p9', 'i1', 'anpd');
        await vi.waitFor(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull());
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes/i1/comunicacoes`);
        expect(document.body.textContent).toContain('Registrar a comunicação à ANPD em 03/10/2026?');
        document.querySelector('[data-confirmar="sim"]').click();
        await registro;
        expect(corpoDe(f, `POST ${B}/incidentes/i1/comunicacoes`)).toEqual({ destino: 'anpd', em: '2026-10-03', anpd_canal: 'sei', anpd_protocolo: '00000.000001/2026-01' });
        await window.encerrarIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`POST ${B}/incidentes/i1/encerrar`);
    });
    it('editar registro manda os campos do legado, as áreas e os titulares × dados (nunca a ciência)', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], descricao: 'Antes', severidade: 'media', comprometimento: ['integridade'], criterios_risco: [], areas: [{ id: 'd1', nome: 'TI' }],
                dados: [{ titular_id: 't1', titular: 'Clientes', dado_id: 'x1', dado: 'E-mail', sensivel: 0 }] },
            [`GET ${B}/incidentes/i1/anexos`]: { anexos: [{ id: 'a1', file_name: 'laudo.pdf', file_type: 'pdf', file_size: 10 }] },
            [`GET ${B}/departamentos`]: [{ id: 'd1', nome: 'TI', status: 'ativo' }, { id: 'd2', nome: 'Comercial', status: 'ativo' }],
            [`GET ${B}/partes`]: [{ id: 'p1', nome: 'Ana', tipo: 'pessoa' }, { id: 'o1', nome: 'Empresa', tipo: 'organizacao' }],
            [`GET ${B}/catalogos/titulares`]: [{ id: 't1', nome: 'Clientes', status: 'ativo' }],
            [`GET ${B}/catalogos/dados`]: [{ id: 'x1', nome: 'E-mail', status: 'ativo' }, { id: 'x2', nome: 'Saúde', status: 'ativo' }],
            [`PUT ${B}/incidentes/i1`]: { ok: true },
        });
        await ficha();
        expect(el('in-registro').textContent).toContain('Severidade: Média');
        expect(el('in-registro').textContent).toContain('Clientes: E-mail');
        await vi.waitFor(() => expect(el('in-anexos').textContent).toContain('laudo.pdf'));
        el('c').querySelector('[data-action="editarIncidente"]').click();
        await vi.waitFor(() => expect(el('in-ed-titulo')).not.toBeNull());
        expect(el('in-ed-desc').value).toBe('Antes');
        // O responsável é uma pessoa do cadastro; organização não aparece.
        expect([...el('in-ed-resp').options].map((o) => o.textContent)).toEqual(['Não definido', 'Ana']);
        el('in-ed-titulo').value = '  '; await window.salvarEdicaoIncidente('p9', 'i1');
        expect(chamadas(f)).not.toContain(`PUT ${B}/incidentes/i1`);
        el('in-ed-titulo').value = 'Acesso indevido corrigido'; el('in-ed-desc').value = ''; el('in-ed-ocorrido').value = '2026-09-30';
        el('in-ed-tipo').value = 'vazamento'; el('in-ed-qtd').value = '40'; el('in-ed-resp').value = 'p1';
        document.querySelector('input[name="in-ed-area"][value="d2"]').click();
        document.querySelector('input[name="in-ed-crit"][value="sensiveis"]').click();
        el('in-ed-dado').value = 'x2'; window.adicionarDadoIncidente();
        expect(el('in-ed-dados-lista').textContent).toContain('Clientes: Saúde');
        await window.salvarEdicaoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1`)).toEqual({
            titulo: 'Acesso indevido corrigido', descricao: null, origem_alerta: null, severidade: 'media', tipo: 'vazamento', comprometimento: ['integridade'],
            ocorrido_em: '2026-09-30', responsavel_parte_id: 'p1', titulares_estimados: 40, criterios_risco: ['sensiveis'], anpd_justificativa: null,
            areas: ['d1', 'd2'], dados: [{ titular_id: 't1', dado_id: 'x1' }, { titular_id: 't1', dado_id: 'x2' }],
        });
        // Sem a comunicação à ANPD registrada, canal e protocolo não aparecem nem vão no corpo.
        expect(el('in-ed-canal')).toBeNull();
    });
    it('comunicação à ANPD registrada: o resumo mostra o protocolo interno, o canal e o nº; a edição corrige canal, protocolo e justificativa', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], areas: [], dados: [], comunicacao_anpd_em: '2026-10-03', anpd_protocolo_interno: 'IN-2026-0001-COM01', anpd_canal: 'formulario_anpd', anpd_protocolo: null, anpd_justificativa: null },
            [`GET ${B}/departamentos`]: [], [`PUT ${B}/incidentes/i1`]: { ok: true },
        });
        await ficha();
        const resumo = el('in-registro').textContent;
        expect(resumo).toContain('Comunicação à ANPD: IN-2026-0001-COM01, enviada em 03/10/2026');
        expect(resumo).toContain('Canal: Formulário da ANPD');
        expect(resumo).toContain('Nº do protocolo na ANPD: não informado');
        expect(el('in-com-canal')).toBeNull(); // já comunicada: não se registra de novo
        await window.editarIncidente('p9', 'i1');
        el('in-ed-canal').value = 'email'; el('in-ed-prot').value = '00000.000009/2026-01'; el('in-ed-just').value = ' Enviado no 4º dia útil (exemplo). ';
        await window.salvarEdicaoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1`)).toMatchObject({ anpd_canal: 'email', anpd_protocolo: '00000.000009/2026-01', anpd_justificativa: 'Enviado no 4º dia útil (exemplo).' });
    });
    it('sem o catálogo do n.privacy, a edição não mexe nos titulares × dados', async () => {
        const f = await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], areas: [], dados: [] }, [`GET ${B}/departamentos`]: [], [`PUT ${B}/incidentes/i1`]: { ok: true } });
        await window.editarIncidente('p9', 'i1');
        expect(el('modal-content').textContent).toContain('vêm do catálogo do n.privacy');
        await window.salvarEdicaoIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1`)).not.toHaveProperty('dados');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1`)).toHaveProperty('areas', []);
    });
    it('incidente encerrado e papel de leitura não têm ações', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], status: 'encerrado' } });
        await ficha();
        expect(el('c').querySelector('[data-action="encerrarIncidente"], [data-action="pedirEncerramentoIncidente"]')).toBeNull();
        S.user = { role: 'org_user' };
        servir(rotas({ [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } }));
        await ficha();
        expect(el('c').querySelector('[data-action="encerrarIncidente"], [data-action="pedirEncerramentoIncidente"]')).toBeNull();
    });
    it('erro de regra do servidor (409 no encerramento) vira aviso e não derruba a tela', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        await ficha();
        await window.encerrarIncidente('p9', 'i1'); // POST sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});

describe('ficha do incidente (página com abas)', () => {
    it('seis abas no endereço; Registro é a padrão; trocar de aba grava no endereço e redesenha', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        await ficha();
        const abas = [...el('c').querySelectorAll('[role="tab"]')];
        expect(abas.map((b) => b.textContent)).toEqual(['Registro', 'Análise', 'Ações corretivas', 'Comunicação', 'Post mortem', 'Histórico']);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
        expect(new URLSearchParams(window.location.search).get('tela')).toBe('incidente-ficha');
        expect(el('h').textContent).toBe('IN-2026-0001 — Acesso <b>indevido</b>'); // textContent: escapado
        expect(el('a').querySelector('[data-action="incidenteVoltar"]')).not.toBeNull();
        expect(el('a').querySelector('[data-action="baixarIncidenteWord"]').getAttribute('data-args')).toBe(JSON.stringify(['p9', 'i1']));
        await window.incidenteIrParaAba(null, 'historico');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('historico');
        expect(el('in-aba-historico').getAttribute('aria-selected')).toBe('true');
        window.incidenteVoltar();
        expect(navigate).toHaveBeenLastCalledWith('titular');
        expect(S.titularAba).toBe('incidentes');
        expect(new URLSearchParams(window.location.search).get('incidente')).toBeNull();
    });
    it('Análise: lista com autor; só a do autor é editável; registra nova e altera a própria', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`GET ${B}/incidentes/i1/analises`]: { analises: [
                { id: 'n1', autor: 'eu@ness.lat', autor_nome: 'Eu', texto: 'Minha <b>análise</b>', created_at: '2026-10-02 10:00:00', updated_at: '2026-10-02 10:00:00', pode_editar: true },
                { id: 'n2', autor: 'outra@ness.lat', autor_nome: 'Outra', texto: 'Dela', created_at: '2026-10-03 10:00:00', updated_at: '2026-10-03 10:00:00', pode_editar: false }] },
            [`POST ${B}/incidentes/i1/analises`]: { ok: true, id: 'n3' }, [`PUT ${B}/incidentes/i1/analises/n1`]: { ok: true },
        });
        await ficha('analise');
        await vi.waitFor(() => expect(el('in-analises').textContent).toContain('Outra'));
        expect(el('in-an-n1').value).toBe('Minha <b>análise</b>');
        expect(el('in-an-n2')).toBeNull();
        expect(el('in-analises').querySelector('b')).toBeNull();
        el('in-an-nova').value = '  '; await window.salvarAnaliseIncidente('p9', 'i1', null);
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes/i1/analises`);
        el('in-an-nova').value = ' Nova análise (exemplo) '; await window.salvarAnaliseIncidente('p9', 'i1', null);
        expect(corpoDe(f, `POST ${B}/incidentes/i1/analises`)).toEqual({ texto: 'Nova análise (exemplo)' });
        el('in-an-n1').value = 'Corrigida'; await window.salvarAnaliseIncidente('p9', 'i1', 'n1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/analises/n1`)).toEqual({ texto: 'Corrigida' });
    });
    it('Post mortem: fechado antes do encerramento; depois, as perguntas numeradas e o envio de todas (branco vira null)', async () => {
        await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`GET ${B}/incidentes/i1/postmortem`]: { aberto: false, perguntas: [] },
        });
        await ficha('postmortem');
        await vi.waitFor(() => expect(el('in-postmortem').textContent).toContain('abre depois do encerramento'));
        expect(el('in-postmortem').querySelector('textarea')).toBeNull();
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0], status: 'encerrado' },
            [`GET ${B}/incidentes/i1/postmortem`]: { aberto: true, perguntas: [
                { id: 'resposta_equipe', texto: 'Como a <b>equipe</b> respondeu?', resposta: 'Bem' }, { id: 'melhorar', texto: 'O que melhorar?', resposta: null }] },
            [`PUT ${B}/incidentes/i1/postmortem`]: { ok: true },
        });
        await ficha('postmortem');
        await vi.waitFor(() => expect(el('in-pm-melhorar')).not.toBeNull());
        expect(el('in-postmortem').querySelectorAll('ol > li')).toHaveLength(2);
        expect(el('in-postmortem').querySelector('b')).toBeNull();
        expect(el('in-pm-resposta_equipe').value).toBe('Bem');
        el('in-pm-resposta_equipe').value = '  ';
        el('in-pm-melhorar').value = ' Treinar o plantão ';
        await window.salvarPostmortemIncidente('p9', 'i1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/postmortem`)).toEqual({ respostas: { resposta_equipe: null, melhorar: 'Treinar o plantão' } });
    });
    it('Histórico: eventos com detalhe, quem e quando; Exportar CSV baixa pela rota do servidor', async () => {
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`GET ${B}/incidentes/i1/historico`]: { historico: [{ evento: 'Registro alterado', detalhe: 'severidade', nome: 'Ana', data: '2026-10-02 10:00:00' }, { evento: 'Registrado', detalhe: null, nome: 'Ana', data: '2026-10-01 10:00:00' }] },
        });
        await ficha('historico');
        await vi.waitFor(() => expect(el('in-historico').textContent).toContain('Registro alterado: severidade'));
        expect(el('in-historico').textContent).toContain('Registrado');
        expect(el('in-historico').querySelector('[data-action="exportarHistoricoIncidente"]')).not.toBeNull();
        await window.exportarHistoricoIncidente('p9', 'i1');
        expect(chamadas(f)).toContain(`GET ${B}/incidentes/i1/historico/csv`);
        await window.baixarIncidenteWord('p9', 'i1');
        expect(chamadas(f)).toContain(`GET ${B}/incidentes/i1/docx`);
    });
});

describe('aviso de prazos legais não cadastrados', () => {
    it('pedidos sem o prazo de resposta: aviso acima da tabela e atalho para a aba Prazos legais', async () => {
        await abrir('pedidos', { 'GET /api/v1/parametros-legais': [{ chave: 'titular.resposta', descricao: 'X', definido: false }] });
        const aviso = el('titular-aviso-prazos');
        expect(aviso.textContent).toContain('Prazos legais não cadastrados: novos pedidos ficarão sem prazo. Fale com o administrador.');
        expect(aviso.getAttribute('style')).toContain('var(--warning-ink)');
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
        expect(t).toContain('sem CPF');
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
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        await window.revogarConsentimento('p9', 'k1');
        expect(chamadas(f)).toContain(`POST ${B}/consentimentos/k1/revogar`);
    });
    it('sem tratamento cadastrado: avisa e não abre o formulário', async () => {
        await abrir('consentimentos', { [`GET ${B}/ropa`]: [] });
        await window.abrirNovoConsentimento('p9');
        expect(el('co-ref')).toBeNull();
        expect(document.body.textContent).toContain('Cadastre o tratamento');
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
    it('ações corretivas nos dois módulos: lista com protocolo -PA, "Nenhuma ação" e cria pela janela, sem CAPA', async () => {
        history.replaceState(null, '', '/privacy');
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`GET ${B}/incidentes/i1/acoes`]: { acoes: [] },
            [`GET ${B}/partes`]: [{ id: 'p1', nome: 'Ana', tipo: 'pessoa' }, { id: 'o1', nome: 'Empresa', tipo: 'organizacao' }],
            [`POST ${B}/incidentes/i1/acoes`]: { ok: true, id: 'a1' },
        });
        expect(el('c').querySelectorAll('[role="tab"][data-action="escolherAbaTitular"]').length).toBe(4);
        await ficha('acoes');
        expect(el('c').querySelector('[data-action="abrirCapaDoIncidente"]')).toBeNull();
        await vi.waitFor(() => expect(el('in-acoes').textContent).toContain('Nenhuma ação.'));
        await window.abrirAcaoIncidente('p9', 'i1', null);
        expect([...el('in-ac-trat').options].map((o) => o.textContent)).toEqual(['Não informado', 'Contenção', 'Correção', 'Aperfeiçoamento']);
        expect([...el('in-ac-resp').options].map((o) => o.textContent)).toEqual(['Não definido', 'Ana']);
        expect(el('in-ac-status')).toBeNull(); // nasce aberta
        el('in-ac-titulo').value = '  '; await window.salvarAcaoIncidente('p9', 'i1', null);
        expect(chamadas(f)).not.toContain(`POST ${B}/incidentes/i1/acoes`);
        el('in-ac-titulo').value = 'Isolar o servidor'; el('in-ac-trat').value = 'contencao'; el('in-ac-resp').value = 'p1';
        await window.salvarAcaoIncidente('p9', 'i1', null);
        expect(corpoDe(f, `POST ${B}/incidentes/i1/acoes`)).toEqual({ title: 'Isolar o servidor', description: null, tratamento: 'contencao', assigned_to_parte_id: 'p1', due_date: null });
    });
    it('ação existente: a lista mostra protocolo, tratamento, status, prazo e responsável; abrir edita o status e mostra os anexos', async () => {
        const ACAO = { id: 'a1', protocolo: 'IN-2026-0001-PA01', title: 'Isolar <b>o</b> servidor', tratamento: 'contencao', status: 'Open', due_date: '2026-12-01', assigned_to_parte_id: 'p1', assigned_to_parte_nome: 'Ana' };
        const f = await abrir('incidentes', {
            [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] },
            [`GET ${B}/incidentes/i1/acoes`]: { acoes: [ACAO] },
            [`GET ${B}/partes`]: [{ id: 'p1', nome: 'Ana', tipo: 'pessoa' }],
            [`GET ${B}/incidentes/i1/acoes/a1/anexos`]: { anexos: [{ id: 'x1', file_name: 'plano.pdf' }] },
            [`PUT ${B}/incidentes/i1/acoes/a1`]: { ok: true },
        });
        await ficha('acoes');
        await vi.waitFor(() => expect(el('in-acoes').textContent).toContain('IN-2026-0001-PA01'));
        expect(el('in-acoes').textContent).toContain('Contenção · Aberto · prazo 01/12/2026 · Ana');
        expect(el('in-acoes').innerHTML).not.toContain('<b>o</b>'); // escapado
        await window.abrirAcaoIncidente('p9', 'i1', 'a1');
        await vi.waitFor(() => expect(el('in-ac-anexos').textContent).toContain('plano.pdf'));
        el('in-ac-status').value = 'Closed';
        await window.salvarAcaoIncidente('p9', 'i1', 'a1');
        expect(corpoDe(f, `PUT ${B}/incidentes/i1/acoes/a1`)).toMatchObject({ status: 'Closed', tratamento: 'contencao', due_date: '2026-12-01' });
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
        await ficha('comunicacao');
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
        await ficha('comunicacao');
        expect(el('c').querySelectorAll('[data-action="rascunhoComunicacaoIncidente"]').length).toBe(2);
        await window.abrirPedidoTitular('p9', 'a');
        expect(el('modal-content').querySelector('[data-action="rascunhoRespostaTitular"]')).not.toBeNull();
        S.user = { role: 'org_user' };
        await ficha('comunicacao');
        expect(el('c').querySelector('[data-action="rascunhoComunicacaoIncidente"]')).toBeNull();
        S.user = { role: 'consultor' };
        history.replaceState(null, '', '/iso');
        await ficha('comunicacao');
        expect(el('c').querySelector('[data-action="rascunhoComunicacaoIncidente"]')).toBeNull();
    });
});

describe('o cliente age: administrador do cliente registra e responde', () => {
    const PED = { id: 'c', protocolo: 'PT-2026-0003', tipo: 'oposicao', canal: 'outro', titular_nome: null, titular_contato: null, descricao: '', recebido_em: '2026-09-01', prazo_em: '2026-09-16', situacao_prazo: 'atrasado', resposta_texto: null, status: 'recebido' };
    beforeEach(() => { S.user = { role: 'org_admin' }; });

    it('pedidos: tem Registrar pedido; o atrasado tem "Responder" na linha e a ação primária no cabeçalho', async () => {
        await abrir('pedidos');
        expect(el('a').querySelector('[data-action="abrirNovoPedidoTitular"]')).not.toBeNull();
        const linhas = [...el('c').querySelectorAll('[data-action="abrirPedidoTitular"]')];
        expect(linhas.map((b) => b.textContent)).toEqual(['Abrir', 'Abrir', 'Responder']);
        expect(linhas[2].className).not.toContain('btn-primary');
        // Uma ação principal: com pedido atrasado, responder vence registrar um novo (que fica secundário). Fica no cabeçalho,
        // à vista mesmo com a linha escondida pela busca.
        const primarios = document.querySelectorAll('#a .btn-primary, #c .btn-primary');
        expect(primarios).toHaveLength(1);
        expect(primarios[0].closest('#a')).not.toBeNull();
        expect(primarios[0].getAttribute('data-action')).toBe('abrirPedidoTitular');
        expect(JSON.parse(primarios[0].getAttribute('data-args'))).toEqual(['p9', 'c']);
        expect(primarios[0].textContent).toBe('Responder PT-2026-0003');
        expect(el('a').querySelector('[data-action="abrirNovoPedidoTitular"]').className).not.toContain('btn-primary');
        // O filtro esconde a linha do atrasado; a ação principal continua na tela.
        const status = el('pt-f-status');
        status.value = 'em_andamento';
        status.dispatchEvent(new Event('change', { bubbles: true }));
        expect([...el('c').querySelectorAll('[data-action="abrirPedidoTitular"]')].map((b) => b.textContent)).toEqual(['Abrir']);
        expect(document.querySelectorAll('#a .btn-primary, #c .btn-primary')).toHaveLength(1);
    });
    it('org_user vê o atrasado só com Abrir', async () => {
        S.user = { role: 'org_user' };
        await abrir('pedidos');
        const linhas = [...el('c').querySelectorAll('[data-action="abrirPedidoTitular"]')];
        expect(linhas.map((b) => b.textContent)).toEqual(['Abrir', 'Abrir', 'Abrir']);
    });
    it('o pedido abre com status e resposta; o rascunho gerado vai para a resposta e é salvo pelo PUT', async () => {
        // Identidade conferida: responder não pede confirmação (o caso sem conferência está em "identidade e encaminhamento do pedido").
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos/c`]: { ...PED, identidade_metodo: 'documento_foto' }, [`POST ${B}/titular-pedidos/c/rascunho`]: { ok: true, texto: 'Prezado titular' }, [`PUT ${B}/titular-pedidos/c`]: { ok: true } });
        await window.abrirPedidoTitular('p9', 'c');
        expect(el('pt-status')).not.toBeNull();
        await window.rascunhoRespostaTitular('p9', 'c');
        expect(el('modal-content').querySelector('[data-action="usarRascunhoTitular"]')).not.toBeNull();
        window.usarRascunhoTitular();
        el('pt-status').value = 'respondido';
        await window.salvarPedidoTitular('p9', 'c');
        expect(corpoDe(f, `PUT ${B}/titular-pedidos/c`)).toEqual({ status: 'respondido', resposta_texto: 'Prezado titular' });
    });
    it('incidentes: registra, avalia e registra comunicação; encerrar segue só com a equipe', async () => {
        await abrir('incidentes', { [`GET ${B}/incidentes/i1`]: { ...INCIDENTES[0] } });
        expect(el('a').querySelector('[data-action="abrirNovoIncidente"]')).not.toBeNull();
        await ficha();
        expect(el('c').querySelector('[data-action="avaliarRiscoIncidente"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="pedirEncerramentoIncidente"]')).toBeNull();
        await ficha('comunicacao');
        expect(el('c').querySelector('[data-action="registrarComunicacaoIncidente"]')).not.toBeNull();
    });
    it('consentimento continua com a equipe: sem registrar nem revogar', async () => {
        await abrir('consentimentos');
        expect(el('a').innerHTML).toBe('');
        expect(el('c').querySelector('[data-action="revogarConsentimento"]')).toBeNull();
    });
});

describe('pedidos: colunas e filtros da lista (spec 2026-10-19)', () => {
    const linhas = () => [...el('pt-lista').querySelectorAll('tbody tr')];
    const filtrar = (id, v) => { el(id).value = v; el(id).dispatchEvent(new Event('change', { bubbles: true })); };
    it('mostra Canal e Respondido em', async () => {
        await abrir('pedidos', { [`GET ${B}/titular-pedidos`]: [...PEDIDOS, { ...PEDIDOS[0], id: 'd', protocolo: 'PT-2026-0004', status: 'respondido', respondido_em: '2026-10-05T12:00:00Z', situacao_prazo: 'encerrado' }] });
        const cab = [...el('pt-lista').querySelectorAll('thead th')].map((t) => t.textContent.trim());
        expect(cab).toEqual(['Protocolo', 'Titular', 'Tipo', 'Canal', 'Recebido em', 'Prazo', 'Respondido em', 'Situação', 'Status', 'Ações']);
        expect(linhas()[0].textContent).toContain('E-mail');
        expect(linhas()[3].textContent).toContain('05/10/2026');
    });
    it('filtra por tipo e por status sem ir ao servidor', async () => {
        const f = await abrir('pedidos');
        const antes = f.mock.calls.length;
        expect(el('pt-contagem').textContent).toBe(String(PEDIDOS.length));
        filtrar('pt-f-tipo', 'correcao');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('PT-2026-0002')]);
        expect(el('pt-contagem').textContent).toBe(`1 de ${PEDIDOS.length}`);
        filtrar('pt-f-tipo', '');
        filtrar('pt-f-status', 'recebido');
        expect(linhas()).toHaveLength(2);
        filtrar('pt-f-status', 'negado');
        expect(el('pt-lista').textContent).toContain('Nada encontrado com a busca ou o filtro');
        expect(f.mock.calls.length).toBe(antes);
    });
    it('busca por protocolo ou nome do titular, sem acento, na tela', async () => {
        const f = await abrir('pedidos', { [`GET ${B}/titular-pedidos`]: [{ ...PEDIDOS[0], titular_nome: 'José Exemplo' }, ...PEDIDOS.slice(1).map((p) => ({ ...p, titular_nome: 'Maria Teste' }))] });
        const antes = f.mock.calls.length;
        const busca = (v) => { el('pt-busca').value = v; el('pt-busca').dispatchEvent(new Event('input', { bubbles: true })); };
        busca('jose');
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0].textContent).toContain('José Exemplo');
        busca(PEDIDOS[1].protocolo.toLowerCase());
        expect(linhas()[0].textContent).toContain(PEDIDOS[1].protocolo);
        busca('zzz');
        expect(el('pt-lista').textContent).toContain('Nada encontrado com a busca ou o filtro');
        expect(f.mock.calls.length).toBe(antes);
    });
});

describe('portal público e tratativas (#14)', () => {
    const esperarEl = async (id) => { for (let i = 0; i < 30 && !el(id); i++) await new Promise((r) => setTimeout(r, 5)); };

    it('a aba de pedidos traz o botão "Link do portal" para quem registra', async () => {
        await abrir('pedidos');
        expect(el('a').textContent).toContain('Link do portal');
    });

    it('gerar o link mostra a URL uma vez', async () => {
        const f = servir({ [`GET ${B}/titular-portal`]: { ativo: false, criado_por: null, created_at: null }, [`POST ${B}/titular-portal`]: { ok: true, url: 'https://n360.ness.com.br/solicitacao#tok-abc' } });
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        await window.abrirPortalTitular('p9');
        expect(el('modal-content').textContent).toContain('Gerar link');
        await window.gerarPortalTitular('p9');
        expect(el('pt-portal-url').value).toBe('https://n360.ness.com.br/solicitacao#tok-abc');
        expect(chamadas(f)).toContain(`POST ${B}/titular-portal`);
        expect(el('pt-portal-estado').textContent).toContain('Copie o link abaixo');
        const escrever = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
        await window.copiarLinkPortal();
        expect(escrever).toHaveBeenCalledWith('https://n360.ness.com.br/solicitacao#tok-abc');
    });

    it('abrir um pedido carrega as tratativas e registra uma nova', async () => {
        const PED = { id: 'a', protocolo: 'PT-2026-0001', tipo: 'acesso', canal: 'formulario', recebido_em: '2026-10-01', prazo_em: null, status: 'recebido', situacao_prazo: 'sem_prazo', titular_nome: 'Fulano', titular_contato: 'f@e.com', descricao: 'Quero acesso' };
        const f = servir({
            [`GET ${B}/titular-pedidos/a`]: PED,
            [`GET ${B}/titular-pedidos/a/tratativas`]: [{ id: 't1', tipo: 'encaminhamento', texto: 'Ao RH', autor: 'x', created_at: '2026-10-02 10:00:00' }],
            [`POST ${B}/titular-pedidos/a/tratativas`]: { ok: true, id: 't2' },
        });
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        await window.abrirPedidoTitular('p9', 'a');
        await esperarEl('pt-trat-texto');
        expect(el('pt-tratativas-box').textContent).toContain('Encaminhamento a ponto focal');
        el('pt-trat-texto').value = 'Nova tratativa';
        el('pt-trat-tipo').value = 'nota';
        await window.salvarTratativa('p9', 'a');
        expect(corpoDe(f, `POST ${B}/titular-pedidos/a/tratativas`)).toEqual({ tipo: 'nota', texto: 'Nova tratativa' });
    });
});
