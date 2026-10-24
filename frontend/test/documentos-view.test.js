// Tela Documentos (fatia 3.4): árvore política → norma → procedimento, revisão, aprovação por versão, versões e
// rascunho, ciências. api() REAL; só o fetch é dublado, com o corpo de cada handler (src/routes/documentos.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';
// O app carrega o marked por <script> (login.html): aqui o mesmo arquivo roda no escopo global.
import markedSrc from '../public/marked.min.js?raw';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/meus-pedidos.js';
import '../src/views/documentos.js';
import { hojeSP, emDiasSP } from '../src/hoje.js';

new Function(markedSrc)();
const HOJE = hojeSP();
const AMANHA = emDiasSP(1);
const ONTEM = emDiasSP(-1);

const doc = (id, extra = {}) => ({
    id, tipo: 'politica', titulo: `Documento ${id}`, pai_id: null, dono_parte_id: null, revisar_a_cada_meses: null, revisar_ate: null,
    status: 'vigente', versao_vigente: 1, tem_rascunho: false, aprovacao: { ciso: null, ceo: null }, ...extra,
});
const LISTA = [
    doc('p1', { titulo: 'Política de <b>Acesso</b>', revisar_ate: ONTEM, dono_parte_id: 'pa1', aprovacao: { ciso: { por: 'Cida', em: '2026-10-01' }, ceo: { por: 'Davi', em: '2026-10-02' } } }),
    doc('n1', { tipo: 'norma', titulo: 'Norma de Senhas', pai_id: 'p1', revisar_ate: AMANHA, aprovacao: { ciso: { por: 'Cida', em: '2026-10-01' }, ceo: null } }),
    doc('pr1', { tipo: 'procedimento', titulo: 'Procedimento de Reset', pai_id: 'n1', versao_vigente: null, status: 'rascunho', tem_rascunho: true }),
    doc('p2', { titulo: 'Política de Backup', tem_rascunho: true }),
];
const PARTES = [{ id: 'pa1', nome: 'Ana <i>Exemplo</i>', status: 'ativa' }];
const DETALHE = (extra = {}) => ({
    ...doc('p1', { titulo: 'Política de <b>Acesso</b>', revisar_a_cada_meses: 12, revisar_ate: HOJE, dono_parte_id: 'pa1', aprovacao: { ciso: { por: 'Cida', em: '2026-10-01' }, ceo: null } }),
    versoes: [
        { numero: 1, estado: 'substituida', origem: 'humano', hash: 'a'.repeat(64), texto: 'Texto v1', criado_por: 'cons@ness.lat', criado_em: '2026-09-01 10:00:00' },
        { numero: 2, estado: 'vigente', origem: 'humano', hash: 'b'.repeat(64), texto: '<img src=x onerror=alert(1)>', criado_por: 'cons@ness.lat', criado_em: '2026-10-01 10:00:00' },
        { numero: 3, estado: 'rascunho', origem: 'agente', hash: 'c'.repeat(64), texto: 'Proposta do agente', criado_por: 'agente de x@ness.lat (Cliente)', criado_em: '2026-10-09 10:00:00' },
    ],
    versao_vigente: 2, tem_rascunho: true, ...extra,
});
const EXCECOES = [
    { id: 'ex1', escopo: 'Equipe <b>X</b>', motivo: 'Migração <i>em curso</i>', vence_em: '2027-01-31', status: 'ativa', situacao: 'aprovada', aprovacao: { por: 'Cida Matriz', em: '2026-10-01', papel: 'ciso' } },
    { id: 'ex2', escopo: 'Filial', motivo: 'Obra', vence_em: '2026-12-01', status: 'ativa', situacao: 'sem_pedido', aprovacao: null },
    { id: 'ex3', escopo: 'Antiga', motivo: 'Fim', vence_em: '2026-01-01', status: 'revogada', situacao: 'revogada', aprovacao: null },
];
const CIENCIAS = [{ nome: 'Gil <b>x</b>', email: 'gil@cliente.com', numero: 2, canal: 'portal', em: '2026-10-05 09:00:00', atual: true }];

const rotas = (extra = {}) => ({
    'GET /api/v1/projects/p9/documentos': LISTA,
    'GET /api/v1/projects/p9/partes': PARTES,
    'GET /api/v1/projects/p9/documentos/cobertura': { aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} },
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const espera = () => new Promise((r) => setTimeout(r, 0));
const el = (id) => document.getElementById(id);

async function abrirLista() {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    await window.renderDocumentos(el('c'), el('h'), el('a'));
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lista', () => {
    it('monta a árvore (filhos recuados sob o pai), com tipo, situação, versão, revisão, dono e aprovação', async () => {
        servir(rotas());
        await abrirLista();
        const linhas = [...el('c').querySelectorAll('tbody tr')];
        expect(linhas.map((l) => l.querySelector('td').textContent.trim())).toEqual([
            'Política de <b>Acesso</b>', 'Norma de Senhas', 'Procedimento de Reset', 'Política de Backup',
        ]);
        // recuo cresce com o nível
        const recuo = (i) => parseInt(linhas[i].querySelector('td [data-nivel]').getAttribute('data-nivel'), 10);
        expect([0, 1, 2, 3].map(recuo)).toEqual([0, 1, 2, 0]);
        const t = el('c').textContent;
        expect(t).toContain('Revisão vencida'); // p1: revisar_ate ontem
        expect(t).toContain('Ana <i>Exemplo</i>'); // dono, como texto
        expect(t).toContain('Rascunho pendente');
        expect(t).toMatch(/Líder SGSI e Direção/); // p1 aprovado pelos dois
        expect(t).toMatch(/Só Líder SGSI/); // n1 só o CISO
    });

    it('com busca ativa a lista fica plana, sem recuo; limpar a busca volta a árvore', async () => {
        servir(rotas());
        await abrirLista();
        const recuos = () => [...el('c').querySelectorAll('tbody td [data-nivel]')].map((s) => s.getAttribute('data-nivel'));
        window.listaBuscar('documentos', 'e');
        expect(recuos().length).toBeGreaterThan(1);
        expect(new Set(recuos())).toEqual(new Set(['0']));
        expect([...el('c').querySelectorAll('tbody td [data-nivel]')].every((s) => s.style.paddingLeft === '0px')).toBe(true);
        window.listaBuscar('documentos', '');
        expect(recuos()).toEqual(['0', '1', '2', '0']);
    });

    it('título, dono e texto do servidor nunca viram HTML', async () => {
        servir(rotas());
        await abrirLista();
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('i')).toBeNull();
    });

    it('papel de escrita vê os botões; papel só de leitura, não', async () => {
        servir(rotas());
        await abrirLista();
        expect([...el('a').querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['importarDocumentos', 'openNovoDocumentoModal', 'openNovaPoliticaModal']);
        expect(el('a').querySelector('.btn-primary').getAttribute('data-action')).toBe('openNovaPoliticaModal');
        S.user = { role: 'org_user' };
        await abrirLista();
        expect(el('a').innerHTML).toBe('');
    });

    it('sem projeto ativo: estado vazio; sem documentos: mensagem', async () => {
        S.activeProject = null; S.projects = [];
        servir(rotas());
        await abrirLista();
        expect(el('c').textContent).toContain('Sem projeto ativo');
        S.activeProject = { id: 'p9' };
        servir(rotas({ 'GET /api/v1/projects/p9/documentos': [] }));
        await abrirLista();
        expect(el('c').textContent).toContain('Nenhum documento');
    });

    it('importar chama a rota e avisa o resumo', async () => {
        const f = servir(rotas({ 'POST /api/v1/projects/p9/documentos/importar': { ok: true, criados: 4, ja_existiam: 0, versoes: 9, ignorados_nao_aplicavel: 1, ignorados_sem_texto: 0 } }));
        await abrirLista();
        await window.importarDocumentos('p9');
        expect(chamadas(f)).toContain('POST /api/v1/projects/p9/documentos/importar');
        expect(document.querySelector('.toast').textContent).toContain('4 criados');
    });
});

describe('criar e abrir', () => {
    it('criar manda tipo, título, texto, pai, dono e periodicidade; vazio não envia', async () => {
        const f = servir(rotas({ 'POST /api/v1/projects/p9/documentos': { ok: true, id: 'novo' } }));
        await abrirLista();
        await window.openNovoDocumentoModal('p9');
        el('doc-novo-titulo').value = '   ';
        await window.criarDocumentoNovo('p9');
        expect(chamadas(f).some((k) => k === 'POST /api/v1/projects/p9/documentos')).toBe(false);
        el('doc-novo-tipo').value = 'norma';
        el('doc-novo-titulo').value = ' Norma Nova ';
        el('doc-novo-texto').value = 'Corpo da norma';
        el('doc-novo-pai').value = 'p1';
        el('doc-novo-dono').value = 'pa1';
        el('doc-novo-meses').value = '6';
        await window.criarDocumentoNovo('p9');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/documentos')).toEqual({ tipo: 'norma', titulo: 'Norma Nova', texto: 'Corpo da norma', pai_id: 'p1', dono_parte_id: 'pa1', revisar_a_cada_meses: 6 });
    });

    it('o detalhe mostra versões, rascunho do agente, ciências e aprovação, tudo escapado', async () => {
        servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': DETALHE(),
            'GET /api/v1/projects/p9/documentos/p1/ciencias': CIENCIAS,
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        const m = el('modal-content');
        expect(m.textContent).toContain('Versão 2');
        expect(m.textContent).toContain('Rascunho do agente aguardando revisão');
        expect(m.textContent).toContain('Proposta do agente');
        expect(m.textContent).toContain('portal');
        expect(m.textContent).toContain('Líder SGSI');
        expect(m.querySelector('img')).toBeNull(); // texto da versão é texto
        expect(m.querySelector('b')).toBeNull();
        expect(JSON.parse(m.querySelector('[data-action="publicarVersaoDocumento"]').getAttribute('data-args'))).toEqual(['p9', 'p1', 3, 'c'.repeat(64)]);
    });

    it('papel só de leitura abre o detalhe sem botões de escrita', async () => {
        S.user = { role: 'org_user' };
        servir(rotas({ 'GET /api/v1/projects/p9/documentos/p1': DETALHE(), 'GET /api/v1/projects/p9/documentos/p1/ciencias': [] }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        const acoes = [...el('modal-content').querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));
        expect(acoes.filter((a) => a !== 'forceCloseModal')).toEqual([]);
    });
});

describe('ações do detalhe', () => {
    const abrirDetalhe = async (extra = {}, detalhe = DETALHE()) => {
        const f = servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': detalhe,
            'GET /api/v1/projects/p9/documentos/p1/ciencias': CIENCIAS,
            'GET /api/v1/projects/p9/documentos/p1/excecoes': EXCECOES,
            ...extra,
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        return f;
    };

    it('salvar metadados manda PUT com os campos do formulário', async () => {
        const f = await abrirDetalhe({ 'PUT /api/v1/projects/p9/documentos/p1': { ok: true } });
        el('doc-e-titulo').value = 'Título editado';
        el('doc-e-tipo').value = 'politica';
        el('doc-e-pai').value = '';
        el('doc-e-dono').value = 'pa1';
        el('doc-e-meses').value = '24';
        await window.salvarMetadadosDocumento('p9', 'p1');
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/documentos/p1')).toEqual({ titulo: 'Título editado', tipo: 'politica', pai_id: null, dono_parte_id: 'pa1', revisar_a_cada_meses: 24 });
    });

    it('erro do servidor aparece no aviso e o modal não fecha', async () => {
        const f = await abrirDetalhe();
        el('doc-e-titulo').value = 'X';
        await window.salvarMetadadosDocumento('p9', 'p1'); // sem rota de PUT: 404 do Worker
        expect(document.querySelector('.toast-error')).not.toBeNull();
        expect(el('doc-e-titulo')).not.toBeNull();
        expect(chamadas(f).filter((k) => k.startsWith('GET /api/v1/projects/p9/documentos/p1'))).toHaveLength(4); // abriu uma vez (detalhe + ciências + exceções + requisitos)
    });

    it('nova versão (rascunho), publicar, descartar e marcar revisado chamam as rotas certas', async () => {
        const f = await abrirDetalhe({
            'POST /api/v1/projects/p9/documentos/p1/versoes': { ok: true, numero: 3 },
            'POST /api/v1/projects/p9/documentos/p1/versoes/3/publicar': { ok: true, numero: 3 },
            'DELETE /api/v1/projects/p9/documentos/p1/rascunho': { ok: true },
            'POST /api/v1/projects/p9/documentos/p1/revisar': { ok: true },
        });
        el('doc-e-texto').value = 'Texto novo do documento';
        await window.salvarRascunhoDocumento('p9', 'p1');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/documentos/p1/versoes')).toEqual({ texto: 'Texto novo do documento', origem: 'humano' });
        await window.publicarVersaoDocumento('p9', 'p1', 3);
        await window.descartarRascunhoDocumento('p9', 'p1');
        await window.marcarDocumentoRevisado('p9', 'p1');
        const c = chamadas(f);
        expect(c).toContain('POST /api/v1/projects/p9/documentos/p1/versoes/3/publicar');
        expect(c).toContain('DELETE /api/v1/projects/p9/documentos/p1/rascunho');
        expect(c).toContain('POST /api/v1/projects/p9/documentos/p1/revisar');
    });

    it('excluir: só o platform_admin vê o botão, e só em documento que nunca foi publicado; confirma e chama o DELETE', async () => {
        const rascunho = DETALHE({ status: 'rascunho', versoes: [{ numero: 1, estado: 'rascunho', origem: 'humano', hash: 'a'.repeat(64), texto: 'x', criado_por: 'a', criado_em: '2026-10-01 10:00:00' }] });
        S.user = { role: 'consultor' };
        await abrirDetalhe({}, rascunho);
        expect(document.querySelector('[data-action="excluirDocumento"]')).toBeNull();
        S.user = { role: 'platform_admin' };
        await abrirDetalhe({}, DETALHE());
        expect(document.querySelector('[data-action="excluirDocumento"]')).toBeNull(); // vigente: aposenta, não exclui
        const f = await abrirDetalhe({ 'DELETE /api/v1/projects/p9/documentos/p1': { ok: true } }, rascunho);
        expect(JSON.parse(document.querySelector('[data-action="excluirDocumento"]').getAttribute('data-args'))).toEqual(['p9', 'p1']);
        window.confirmar = vi.fn().mockResolvedValue(false);
        await window.excluirDocumento('p9', 'p1');
        expect(chamadas(f)).not.toContain('DELETE /api/v1/projects/p9/documentos/p1');
        window.confirmar = vi.fn().mockResolvedValue(true);
        await window.excluirDocumento('p9', 'p1');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/documentos/p1');
    });

    it('aposentar e reativar mandam o status; texto vazio não vira rascunho', async () => {
        const f = await abrirDetalhe({ 'PUT /api/v1/projects/p9/documentos/p1': { ok: true } });
        await window.mudarStatusDocumento('p9', 'p1', 'obsoleto');
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/documentos/p1')).toEqual({ status: 'obsoleto' });
        el('doc-e-texto').value = '   ';
        await window.salvarRascunhoDocumento('p9', 'p1');
        expect(chamadas(f).some((k) => k === 'POST /api/v1/projects/p9/documentos/p1/versoes')).toBe(false);
    });

    it('ações do documento: uma à vista (pedir aprovação), o resto no "Mais ações"; aposentar por último, separado', async () => {
        S.user = { role: 'consultor' };
        await abrirDetalhe();
        const caixa = el('modal-content').querySelector('.doc-acoes');
        const visiveis = [...caixa.querySelectorAll('button')].filter((b) => !b.closest('[role="menu"]'));
        expect(visiveis.map((b) => b.textContent.trim())).toEqual(['Pedir aprovação', 'Mais ações']);
        const itens = [...caixa.querySelectorAll('[role="menuitem"]')];
        expect(itens.map((b) => b.textContent.trim())).toEqual(['Marcar como revisado', 'Pedir ciência por link', 'Aposentar']);
        expect(itens[2].classList.contains('perigo')).toBe(true);
        expect(caixa.querySelector('[role="separator"]').nextElementSibling).toBe(itens[2]);
    });

    it('pedir aprovação abre o pedido de documento; só quem pede vê o botão', async () => {
        await abrirDetalhe();
        window.abrirPedidoAprovacao = vi.fn();
        const botao = el('modal-content').querySelector('[data-action="pedirAprovacaoDocumento"]');
        expect(botao).not.toBeNull();
        window.pedirAprovacaoDocumento('p9', 'p1');
        expect(window.abrirPedidoAprovacao).toHaveBeenCalledWith('p9', 'documento', 'p1');
    });
});

describe('exceções ao documento', () => {
    const abrir = async (extra = {}) => {
        const f = servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': DETALHE(),
            'GET /api/v1/projects/p9/documentos/p1/ciencias': [],
            'GET /api/v1/projects/p9/documentos/p1/excecoes': EXCECOES,
            ...extra,
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        return f;
    };
    const secao = () => el('doc-excecoes');

    it('lista escopo, motivo, prazo, situação e quem aprovou, tudo escapado', async () => {
        await abrir();
        const t = secao().textContent;
        expect(t).toContain('Equipe <b>X</b>');
        expect(t).toContain('Migração <i>em curso</i>');
        expect(t).toContain('31/01/2027');
        expect(t).toContain('Aprovada');
        expect(t).toContain('Cida Matriz');
        expect(t).toContain('Sem pedido de aprovação');
        expect(t).toContain('Revogada');
        expect(secao().querySelector('b')).toBeNull();
        expect(secao().querySelector('i')).toBeNull();
    });

    it('só a exceção ativa tem Pedir aprovação e Revogar; a revogada não tem botão', async () => {
        await abrir();
        const argsDe = (a) => [...secao().querySelectorAll(`[data-action="${a}"]`)].map((b) => JSON.parse(b.getAttribute('data-args')).at(-1));
        expect(argsDe('pedirAprovacaoExcecao')).toEqual(['ex1', 'ex2']);
        expect(argsDe('revogarExcecaoDocumento')).toEqual(['ex1', 'ex2']);
    });

    it('nova exceção manda escopo, motivo e prazo; campo vazio não envia', async () => {
        const f = await abrir({ 'POST /api/v1/projects/p9/documentos/p1/excecoes': { ok: true, id: 'ex9' } });
        el('doc-exc-escopo').value = '  ';
        await window.criarExcecaoDocumento('p9', 'p1');
        expect(chamadas(f).some((k) => k === 'POST /api/v1/projects/p9/documentos/p1/excecoes')).toBe(false);
        el('doc-exc-escopo').value = ' Equipe de suporte ';
        el('doc-exc-motivo').value = 'Migração';
        el('doc-exc-vence').value = '2027-03-31';
        await window.criarExcecaoDocumento('p9', 'p1');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/documentos/p1/excecoes')).toEqual({ escopo: 'Equipe de suporte', motivo: 'Migração', vence_em: '2027-03-31' });
    });

    it('revogar chama a rota; pedir aprovação abre o pedido de exceção', async () => {
        const f = await abrir({ 'POST /api/v1/projects/p9/documentos/p1/excecoes/ex2/revogar': { ok: true } });
        await window.revogarExcecaoDocumento('p9', 'p1', 'ex2');
        expect(chamadas(f)).toContain('POST /api/v1/projects/p9/documentos/p1/excecoes/ex2/revogar');
        window.abrirPedidoAprovacao = vi.fn();
        window.pedirAprovacaoExcecao('p9', 'ex1');
        expect(window.abrirPedidoAprovacao).toHaveBeenCalledWith('p9', 'excecao', 'ex1');
    });

    it('papel só de leitura vê a lista, sem formulário nem botões', async () => {
        S.user = { role: 'org_user' };
        await abrir();
        expect(secao().textContent).toContain('Equipe <b>X</b>');
        expect(secao().querySelector('[data-action]')).toBeNull();
        expect(el('doc-exc-escopo')).toBeNull();
    });

    it('documento sem exceção: mensagem', async () => {
        await abrir({ 'GET /api/v1/projects/p9/documentos/p1/excecoes': [] });
        expect(secao().textContent).toContain('Nenhuma exceção');
    });
});

describe('requisitos do documento', () => {
    const CATALOGO = [
        { id: 'lgpd:art37', fonte_id: 'lgpd', referencia: 'art. 37', titulo: 'Registro <b>das</b> operações', pai_id: null, papel: null },
        { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, papel: null },
    ];
    const abrir = async (extra = {}) => {
        const f = servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': DETALHE(),
            'GET /api/v1/projects/p9/documentos/p1/ciencias': [],
            'GET /api/v1/projects/p9/documentos/p1/excecoes': [],
            'GET /api/v1/projects/p9/documentos/p1/requisitos': [{ id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança' }],
            'GET /api/v1/requisitos': CATALOGO,
            ...extra,
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        return f;
    };
    const secao = () => el('doc-requisitos');

    it('lista os requisitos ligados e oferece só os que faltam, tudo escapado', async () => {
        await abrir();
        expect(secao().textContent).toContain('lgpd art. 46');
        const opcoes = [...el('doc-req-add').querySelectorAll('option')].map((o) => o.value);
        expect(opcoes).toEqual(['', 'lgpd:art37']);
        expect(el('doc-req-add').textContent).toContain('Registro <b>das</b> operações');
        expect(secao().querySelector('b')).toBeNull();
    });

    it('ligar manda o conjunto atual mais o escolhido; sem escolha não envia', async () => {
        const f = await abrir({ 'PUT /api/v1/projects/p9/documentos/p1/requisitos': { ok: true, total: 2 } });
        await window.ligarRequisitoDocumento('p9', 'p1');
        expect(chamadas(f)).not.toContain('PUT /api/v1/projects/p9/documentos/p1/requisitos');
        el('doc-req-add').value = 'lgpd:art37';
        await window.ligarRequisitoDocumento('p9', 'p1');
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/documentos/p1/requisitos')).toEqual({ requisitos: ['lgpd:art46', 'lgpd:art37'] });
    });

    it('desligar manda o conjunto sem o requisito', async () => {
        const f = await abrir({ 'PUT /api/v1/projects/p9/documentos/p1/requisitos': { ok: true, total: 0 } });
        await window.desligarRequisitoDocumento('p9', 'p1', 'lgpd:art46');
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/documentos/p1/requisitos')).toEqual({ requisitos: [] });
    });

    it('papel só de leitura vê os requisitos, sem seletor nem botões, e não busca o catálogo', async () => {
        S.user = { role: 'org_user' };
        const f = await abrir();
        expect(secao().textContent).toContain('lgpd art. 46');
        expect(secao().querySelector('[data-action]')).toBeNull();
        expect(el('doc-req-add')).toBeNull();
        expect(chamadas(f)).not.toContain('GET /api/v1/requisitos');
    });

    it('documento sem requisito: mensagem', async () => {
        await abrir({ 'GET /api/v1/projects/p9/documentos/p1/requisitos': [] });
        expect(secao().textContent).toContain('Nenhum requisito ligado');
    });
});

describe('n.privacy: documentos que um programa LGPD costuma ter', () => {
    const noPrivacy = async (fn) => { history.replaceState(null, '', '/privacy'); try { await fn(); } finally { history.replaceState(null, '', '/'); } };
    const ROTULOS = [
        'Política de privacidade (aviso aos titulares — LGPD art. 9)',
        'Procedimento de atendimento ao titular (art. 18)',
        'Plano de resposta a incidente (arts. 48 e 50, §2º, I, g; Res. CD/ANPD 15/2024)',
        'Política de retenção e descarte (arts. 15 e 16)',
    ];

    it('lista vazia: os quatro, cada um com "Criar" que abre o novo documento com tipo e título', () => noPrivacy(async () => {
        servir(rotas({ 'GET /api/v1/projects/p9/documentos': [] }));
        await abrirLista();
        const lis = [...el('c').querySelectorAll('.empty-state .empty-list li')];
        expect(lis.map((li) => li.querySelector('span').textContent)).toEqual(ROTULOS);
        expect(el('c').textContent).toContain('costuma');
        const botao = lis[2].querySelector('button[data-action="openNovoDocumentoModal"]');
        expect(botao.textContent).toBe('Criar');
        window.openNovoDocumentoModal(...JSON.parse(botao.getAttribute('data-args')));
        expect(el('doc-novo-tipo').value).toBe('procedimento');
        expect(el('doc-novo-titulo').value).toBe('Plano de resposta a incidente');
    }));

    it('papel só de leitura vê a lista sem "Criar"', () => noPrivacy(async () => {
        S.user = { role: 'org_user' };
        servir(rotas({ 'GET /api/v1/projects/p9/documentos': [] }));
        await abrirLista();
        expect(el('c').querySelectorAll('.empty-list li').length).toBe(4);
        expect(el('c').querySelector('.empty-list button')).toBeNull();
    }));

    it('com documentos: aviso dos que faltam, casando título sem acento nem caixa', () => noPrivacy(async () => {
        servir(rotas({ 'GET /api/v1/projects/p9/documentos': [
            ...LISTA, doc('x1', { titulo: 'POLITICA DE PRIVACIDADE e cookies' }), doc('x2', { tipo: 'procedimento', titulo: 'Plano de Resposta a Incidentes' }),
        ] }));
        await abrirLista();
        const aviso = el('docs-lgpd-faltando');
        expect(aviso.textContent).toContain('Procedimento de atendimento ao titular');
        expect(aviso.textContent).toContain('Política de retenção e descarte');
        expect(aviso.textContent).not.toContain('Política de privacidade');
        expect(aviso.textContent).not.toContain('Plano de resposta');
        expect(el('c').querySelectorAll('tbody tr').length).toBe(6);
    }));

    it('fora do n.privacy: nada disso', async () => {
        servir(rotas({ 'GET /api/v1/projects/p9/documentos': [] }));
        await abrirLista();
        expect(el('c').querySelector('.empty-list')).toBeNull();
        servir(rotas());
        await abrirLista();
        expect(el('docs-lgpd-faltando')).toBeNull();
    });
});

describe('cobertura e texto inteiro (políticas temáticas)', () => {
    it('mostra o indicador de cobertura e os controles sem política', async () => {
        servir(rotas({
            'GET /api/v1/projects/p9/documentos/cobertura': { aplicaveis: 3, cobertos: 2, sem_cobertura: [{ id: 'cc-24', title: 'A.5.24 <b>Incidentes</b>' }], por_controle: {}, por_documento: { p1: 7 } },
        }));
        await abrirLista();
        expect(el('docs-cobertura').textContent).toContain('2 de 3 controles aplicáveis cobertos por política vigente');
        expect(el('docs-sem-cobertura').textContent).toContain('A.5.24 <b>Incidentes</b>');
        expect(el('docs-sem-cobertura').querySelector('b')).toBeNull();
        expect([...el('c').querySelectorAll('thead th')].map((t) => t.textContent)).toContain('Controles');
        expect(el('c').querySelector('tbody tr').textContent).toContain('7');
        expect(el('c').querySelector('#docs-cobertura').textContent).toContain('2 de ');
    });

    it('abre o documento com o texto inteiro renderizado, sem caixa de rolagem', async () => {
        const longo = '# Política\n\n' + Array.from({ length: 80 }, (_, i) => `## ${i}. Seção\n\nTexto da seção ${i}.`).join('\n\n');
        servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': DETALHE({ versoes: [{ numero: 1, estado: 'vigente', origem: 'humano', hash: 'a'.repeat(64), texto: longo }] }),
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        const corpo = el('doc-texto-vigente');
        expect(corpo.querySelector('h2')).not.toBeNull();
        expect(corpo.textContent).toContain('Texto da seção 79');
        expect(corpo.getAttribute('style') || '').not.toMatch(/max-height/);
    });

    it('mostra os requisitos também em projeto só com n.iso', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso'] };
        servir(rotas({
            'GET /api/v1/projects/p9/documentos/p1': DETALHE(),
            'GET /api/v1/projects/p9/documentos/p1/requisitos': [{ id: 'rq-a515', fonte_id: 'iso27001:2022', referencia: 'A.5.15', titulo: 'Controle de acesso' }],
        }));
        await abrirLista();
        await window.openDocumentoModal('p9', 'p1');
        expect(el('doc-requisitos').textContent).toContain('A.5.15');
    });
});
