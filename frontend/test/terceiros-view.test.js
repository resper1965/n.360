// Tela Terceiros (fatia 6): lista, ficha, tipo, avaliação com validade, DPA ligado. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/terceiros.js';

const B = '/api/v1/projects/p9/terceiros';
const T = (id, extra = {}) => ({ id, nome: `Terceiro ${id}`, terceiro_tipo: 'medio', metodo: 'questionario', situacao: 'vigente', ultima_avaliacao: { resultado: 'aprovado', valido_ate: '2027-01-31', metodo: 'questionario' }, tratamentos: 2, documentos: 1, ...extra });
const LISTA = [T('a', { nome: 'Nuvem <b>Grande</b>' }), T('b', { situacao: 'vencida', ultima_avaliacao: { resultado: 'aprovado', valido_ate: '2025-01-01', metodo: 'questionario' } }), T('c', { terceiro_tipo: null, metodo: null, situacao: 'pendente', ultima_avaliacao: null, tratamentos: 0, documentos: 0 })];
const FICHA = (extra = {}) => ({
    ...T('a', { nome: 'Nuvem <b>Grande</b>' }),
    historico: [{ id: 'h1', metodo: 'questionario', resultado: 'aprovado', valido_ate: '2027-01-31', evidencia_url: 'https://trust.exemplo.com/x', observacao: null, avaliado_por: 'cons@ness.lat', created_at: '2026-10-01 10:00:00' },
        { id: 'h0', metodo: 'questionario', resultado: 'reprovado', valido_ate: '2026-12-01', evidencia_url: 'javascript:alert(1)', observacao: null, avaliado_por: 'x', created_at: '2026-09-01 10:00:00' }],
    documentos_ligados: [{ id: 'd1', titulo: 'DPA <i>Nuvem</i>', status: 'vigente', papel: 'dpa' }],
    suboperadores: [{ id: 's1', nome: 'Sub <b>x</b>' }],
    tratamentos_afetados: [{ id: 'r1', finalidade: 'Folha <b>y</b>' }],
    ...extra,
});
const rotas = (extra = {}) => ({
    [`GET ${B}`]: LISTA,
    [`GET ${B}/a`]: FICHA(),
    'GET /api/v1/projects/p9/documentos': [{ id: 'd1', titulo: 'DPA Nuvem' }, { id: 'd2', titulo: 'Contrato Mestre' }],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}${new URL(u, 'http://localhost').search}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

async function lista(extra = {}) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.renderTerceiros(el('c'), el('h'), el('a'));
    return f;
}
async function ficha(extra = {}) {
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.abrirTerceiro('p9', 'a');
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lista', () => {
    it('mostra tipo, método, situação, validade e contagens, tudo escapado, e avisa quantos estão vencidos', async () => {
        await lista();
        const t = el('c').textContent;
        expect(t).toContain('Nuvem <b>Grande</b>');
        expect(t).toContain('Médio');
        expect(t).toContain('Questionário');
        expect(t).toContain('Vigente');
        expect(t).toContain('Vencida');
        expect(t).toContain('Pendente');
        expect(t).toContain('31/01/2027');
        expect(t).toContain('1 terceiro com avaliação vencida');
        expect(el('c').querySelector('b')).toBeNull();
    });

    it('sem projeto ativo: estado vazio; sem terceiros: mensagem', async () => {
        S.activeProject = null; S.projects = [];
        await lista();
        expect(el('c').textContent).toContain('Sem projeto ativo');
        S.activeProject = { id: 'p9' };
        await lista({ [`GET ${B}`]: [] });
        expect(el('c').textContent).toContain('Nenhuma organização cadastrada');
        // a ponte para Partes é um link, não uma instrução de memória
        const vazio = el('c').querySelector('.empty-state');
        expect(JSON.parse(vazio.querySelector('[data-action="navigate"]').getAttribute('data-args'))).toEqual(['partes']);
        expect(vazio.querySelector('[data-action="openNovaParteModal"]')).not.toBeNull();
    });

    it('header tem "Cadastrar terceiro", que abre a nova parte já como organização', async () => {
        await lista();
        const b = el('a').querySelector('[data-action="openNovaParteModal"]');
        expect(b.textContent).toBe('Cadastrar terceiro');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'organizacao']);
        S.user = { role: 'org_user' };
        await lista();
        expect(el('a').innerHTML).toBe('');
    });
});

describe('ficha', () => {
  it('mostra método do tipo, histórico (link só http), DPA, suboperadores e tratamentos, tudo escapado', async () => {
        await ficha();
        const m = el('modal-content');
        expect(m.textContent).toContain('Nuvem <b>Grande</b>');
        expect(m.textContent).toContain('Questionário');
        expect(m.textContent).toContain('DPA <i>Nuvem</i>');
        expect(m.textContent).toContain('Sub <b>x</b>');
        expect(m.textContent).toContain('Folha <b>y</b>');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
        const links = [...el('tc-historico').querySelectorAll('a')].map((a) => a.getAttribute('href'));
        expect(links).toEqual(['https://trust.exemplo.com/x']); // javascript: ficou como texto
        expect(el('tc-historico').textContent).toContain('javascript:alert(1)');
    });

    it('sem tipo: não oferece nova avaliação; com tipo, oferece', async () => {
        await ficha({ [`GET ${B}/a`]: FICHA({ terceiro_tipo: null, metodo: null }) });
        expect(el('tc-nova')).toBeNull();
        expect(el('modal-content').textContent).toContain('Defina o tipo');
        await ficha();
        expect(el('tc-nova')).not.toBeNull();
    });

    it('papel só de leitura vê tudo sem formulários nem botões, e não busca a lista de documentos', async () => {
        S.user = { role: 'org_user' };
        const f = await ficha();
        const m = el('modal-content');
        expect(m.querySelector('input, select, button[data-action]')).toBeNull();
        expect(chamadas(f)).not.toContain('GET /api/v1/projects/p9/documentos');
    });
});

describe('adicionar parte existente', () => {
    it('só quem edita vê o botão; ele lista os candidatos (escapados) e tipificar chama o PUT do tipo', async () => {
        await lista();
        expect(JSON.parse(el('a').querySelector('[data-action="abrirAdicionarTerceiro"]').getAttribute('data-args'))).toEqual(['p9']);
        S.user = { role: 'org_user' };
        await lista();
        expect(el('a').querySelector('[data-action="abrirAdicionarTerceiro"]')).toBeNull();
        S.user = { role: 'consultor' };

        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir(rotas({ [`GET ${B}/candidatos`]: [{ id: 'anpd', nome: 'ANPD <b>x</b>' }], [`PUT ${B}/anpd/tipo`]: { ok: true } }));
        await window.abrirAdicionarTerceiro('p9');
        expect(el('tc-cand').textContent).toContain('ANPD <b>x</b>');
        expect(el('modal-content').querySelector('b')).toBeNull();
        el('tc-cand').value = 'anpd';
        el('tc-cand-tipo').value = 'critico';
        await window.adicionarTerceiro('p9');
        expect(corpoDe(f, `PUT ${B}/anpd/tipo`)).toEqual({ terceiro_tipo: 'critico' });
    });

    it('sem candidatos, diz que não há parte para adicionar', async () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        servir(rotas({ [`GET ${B}/candidatos`]: [] }));
        await window.abrirAdicionarTerceiro('p9');
        expect(el('modal-content').textContent).toContain('Nenhuma parte');
        expect(el('tc-cand')).toBeNull();
    });
});

describe('ações', () => {
    it('salvar tipo manda o valor (vazio vira null)', async () => {
        const f = await ficha({ [`PUT ${B}/a/tipo`]: { ok: true } });
        el('tc-tipo-sel').value = 'critico';
        await window.salvarTipoTerceiro('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/a/tipo`)).toEqual({ terceiro_tipo: 'critico' });
        el('tc-tipo-sel').value = '';
        await window.salvarTipoTerceiro('p9', 'a');
        const puts = f.mock.calls.filter(([u, o]) => o?.method === 'PUT');
        expect(JSON.parse(puts.at(-1)[1].body)).toEqual({ terceiro_tipo: null });
    });

    it('registrar avaliação exige a validade (sem ela não chama a API) e manda resultado, validade, link e observação', async () => {
        const f = await ficha({ [`POST ${B}/a/avaliacoes`]: { ok: true, id: 'x', metodo: 'questionario' } });
        el('tc-val').value = '';
        await window.registrarAvaliacaoTerceiro('p9', 'a');
        expect(chamadas(f).some((k) => k.startsWith(`POST ${B}/a/avaliacoes`))).toBe(false);
        el('tc-res').value = 'com_ressalvas'; el('tc-val').value = '2027-03-31'; el('tc-url').value = ' https://x.exemplo.com '; el('tc-obs').value = '';
        await window.registrarAvaliacaoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/avaliacoes`)).toEqual({ resultado: 'com_ressalvas', valido_ate: '2027-03-31', evidencia_url: 'https://x.exemplo.com', observacao: null });
    });

    it('ligar documento manda id e papel; desligar chama o DELETE com o papel na query', async () => {
        const f = await ficha({ [`POST ${B}/a/documentos`]: { ok: true }, [`DELETE ${B}/a/documentos/d1`]: { ok: true } });
        el('tc-doc').value = 'd2'; el('tc-doc-papel').value = 'contrato';
        await window.ligarDocumentoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/documentos`)).toEqual({ documento_id: 'd2', papel: 'contrato' });
        await window.desligarDocumentoTerceiro('p9', 'a', 'd1', 'dpa');
        expect(chamadas(f)).toContain(`DELETE ${B}/a/documentos/d1?papel=dpa`);
    });

    it('erro do servidor vira aviso e não derruba a tela', async () => {
        await ficha();
        el('tc-val').value = '2027-03-31';
        await window.registrarAvaliacaoTerceiro('p9', 'a'); // POST sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});

describe('homologação por questionário (F5)', () => {
    const H = '/api/v1/projects/p9/homologacoes';
    const HOMOLOGACOES = [
        { id: 'h1', status: 'respondida', expirada: false, percentual: 75, respondidas: 9, total: 12, expira_em: '2026-11-01 10:00:00', resultado: null, created_at: '2026-10-15 10:00:00' },
        { id: 'h0', status: 'aberta', expirada: true, percentual: 0, respondidas: 0, total: 12, expira_em: '2026-10-01 10:00:00', resultado: null, created_at: '2026-09-15 10:00:00' },
    ];
    const DETALHE = {
        id: 'h1', parte_nome: 'Nuvem <b>Grande</b>', status: 'respondida', expirada: false, percentual: 50, respondidas: 1, total: 2, enviada_em: '2026-10-16 10:00:00',
        perguntas: [{ id: 'q1', tema: 'Segurança', texto: 'Há <i>política</i>?', resposta: 'parcial', justificativa: 'Em <b>revisão</b>' }, { id: 'q2', tema: 'DPA', texto: 'Assina DPA?', resposta: null, justificativa: null }],
    };

    it('a ficha de terceiro por questionário lista os envios com situação e %, e oferece "Homologar" a quem edita', async () => {
        const f = await ficha({ [`GET ${H}`]: HOMOLOGACOES });
        expect(chamadas(f)).toContain(`GET ${H}?parte_id=a`);
        const s = el('tc-homologacao');
        expect(s.textContent).toContain('Respondida');
        expect(s.textContent).toContain('75% (9 de 12)');
        expect(s.textContent).toContain('Link vencido');
        expect(s.querySelector('[data-action="criarHomologacaoTerceiro"]')).not.toBeNull();
    });

    it('terceiro de outro método não mostra a seção nem busca homologações', async () => {
        const f = await ficha({ [`GET ${B}/a`]: FICHA({ terceiro_tipo: 'critico', metodo: 'auditoria' }) });
        expect(el('tc-homologacao')).toBeNull();
        expect(chamadas(f).some((k) => k.startsWith(`GET ${H}`))).toBe(false);
    });

    it('homologar manda terceiro, prazo e e-mail (se houver) e mostra o link uma vez', async () => {
        const f = await ficha({ [`GET ${H}`]: [], [`POST ${H}`]: { id: 'h2', url: 'https://n360.ness.com.br/homologacao#abc', expira_em: '2026-10-30 10:00:00', email_enviado: false } });
        el('tc-hm-dias').value = '61';
        await window.criarHomologacaoTerceiro('p9', 'a');
        expect(chamadas(f).some((k) => k === `POST ${H}`)).toBe(false);
        el('tc-hm-dias').value = '10';
        el('tc-hm-email').value = 'contato@fornecedor.exemplo';
        await window.criarHomologacaoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${H}`)).toEqual({ parte_id: 'a', dias: 10, email: 'contato@fornecedor.exemplo' });
        expect(el('tc-hm-url').value).toBe('https://n360.ness.com.br/homologacao#abc');
    });

    it('revisar mostra as respostas escapadas; concluir exige validade e manda resultado, validade e observação', async () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir(rotas({ [`GET ${H}/h1`]: DETALHE, [`POST ${H}/h1/concluir`]: { ok: true, avaliacao_id: 'av1' }, [`GET ${H}`]: [] }));
        await window.revisarHomologacao('p9', 'a', 'h1');
        const m = el('modal-content');
        expect(m.textContent).toContain('Nuvem <b>Grande</b>');
        expect(m.textContent).toContain('Há <i>política</i>?');
        expect(m.textContent).toContain('Parcial');
        expect(m.textContent).toContain('Sem resposta');
        expect(m.querySelector('b, i')).toBeNull();
        el('tc-hm-val').value = '';
        await window.concluirHomologacao('p9', 'a', 'h1');
        expect(chamadas(f)).not.toContain(`POST ${H}/h1/concluir`);
        el('tc-hm-res').value = 'com_ressalvas'; el('tc-hm-val').value = '2027-10-15'; el('tc-hm-obs').value = 'Falta DPA';
        await window.concluirHomologacao('p9', 'a', 'h1');
        expect(corpoDe(f, `POST ${H}/h1/concluir`)).toEqual({ resultado: 'com_ressalvas', valido_ate: '2027-10-15', observacao: 'Falta DPA' });
    });

    it('perguntas do questionário: botão só para quem edita; avisa o modelo a validar; salvar e adicionar chamam a API', async () => {
        await lista();
        expect(JSON.parse(el('a').querySelector('[data-action="abrirPerguntasHomologacao"]').getAttribute('data-args'))).toEqual(['p9']);
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir(rotas({
            [`GET ${H}/perguntas`]: { a_validar: true, perguntas: [{ id: 'q1', tema: 'Segurança', texto: 'Há <b>política</b>?', ordem: 10, ativa: 1, origem: 'padrao' }] },
            [`PUT ${H}/perguntas/q1`]: { ok: true }, [`POST ${H}/perguntas`]: { id: 'q2' },
        }));
        await window.abrirPerguntasHomologacao('p9');
        expect(el('modal-content').textContent).toContain('modelo genérico');
        expect(el('modal-content').querySelector('b')).toBeNull();
        document.querySelector('tr[data-pergunta="q1"] [data-campo="ativa"]').checked = false;
        await window.salvarPerguntaHomologacao('p9', 'q1');
        expect(corpoDe(f, `PUT ${H}/perguntas/q1`)).toEqual({ tema: 'Segurança', texto: 'Há <b>política</b>?', ativa: false });
        el('tc-hp-tema').value = 'Continuidade'; el('tc-hp-texto').value = 'Há plano testado?';
        await window.criarPerguntaHomologacao('p9');
        expect(corpoDe(f, `POST ${H}/perguntas`)).toEqual({ tema: 'Continuidade', texto: 'Há plano testado?' });
    });
});
