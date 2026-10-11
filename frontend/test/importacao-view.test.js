// Tela Importar programa (n.privacy). api() REAL; só o fetch é dublado, com o corpo de cada handler (src/routes/importacao.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/importacao.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';

initDelegation();
const B = '/api/v1/projects/p9/importacoes';
const el = (id) => document.getElementById(id);
const clica = (acao, args) => { const b = [...document.querySelectorAll(`[data-action="${acao}"]`)].find((x) => !args || x.getAttribute('data-args') === JSON.stringify(args)); b.click(); return new Promise((r) => setTimeout(r, 0)); };
const espera = async (ms = 20) => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, ms)); };

const item = (id, extra = {}) => ({ id, arquivo_id: 'a1', dados: { finalidade: `Finalidade ${id}`, base_legal: 'Consentimento' }, origem: 'linha 3 da planilha', confianca: 'alta', faltando: ['categorias_dados'], duplicata_de: null, decisao: 'pendente', motivo: null, ...extra });
const LOTE = (over = {}) => ({ lote: { id: 'l1', status: 'recebendo' }, arquivos: [], itens: [], ...over });

/** Fetch com estado: `handlers` é { 'METHOD /path': (opts) => corpo | [corpo, status] }. */
function servidor(handlers) {
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        const h = handlers[k];
        if (!h) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = typeof h === 'function' ? h(opts) : h;
        return Array.isArray(r) ? resposta(r[0], r[1]) : resposta(r);
    });
    vi.stubGlobal('fetch', f);
    return f;
}
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);

async function abrirLista(handlers) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servidor(handlers);
    await window.renderImportacao(el('c'), el('h'), el('a'));
    return f;
}
// Abre o lote l1 a partir da lista e devolve o fetch.
async function abrirLote(det, extra = {}) {
    const f = await abrirLista({ [`GET ${B}`]: { lotes: [{ id: 'l1', status: 'recebendo', created_at: '2026-10-11', arquivos: 1, itens: 1 }] }, [`GET ${B}/l1`]: det, ...extra });
    await clica('importacaoAbrir', ['l1']);
    await espera();
    return f;
}

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; window.render = vi.fn(); history.replaceState(null, '', '/privacy'); });
afterEach(async () => { await window.importacaoVoltar?.().catch(() => {}); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lista e criação de lote', () => {
    it('lista os lotes e cria um novo, abrindo-o', async () => {
        const f = await abrirLista({
            [`GET ${B}`]: { lotes: [{ id: 'l1', status: 'em_revisao', created_at: '2026-10-10', arquivos: 2, itens: 5 }, { id: 'l0', status: 'cancelada', created_at: '2026-10-09', arquivos: 0, itens: 0 }] },
            [`POST ${B}`]: [{ ok: true, id: 'l2' }, 201],
            [`GET ${B}/l2`]: LOTE({ lote: { id: 'l2', status: 'recebendo' } }),
        });
        expect(el('c').textContent).toContain('Em revisão');
        expect(el('c').textContent).toContain('Cancelada');
        await clica('importacaoNovo');
        await espera();
        expect(chamadas(f)).toContain(`POST ${B}`);
        expect(chamadas(f)).toContain(`GET ${B}/l2`);
        expect(el('c').textContent).toContain('Arquivos');
    });
});

describe('envio e processamento', () => {
    it('envia cada arquivo numa requisição FormData com o token e mostra a falha de um', async () => {
        let n = 0;
        const f = await abrirLote(LOTE(), { [`POST ${B}/l1/arquivos`]: () => (++n === 2 ? [{ error: 'Tipo de arquivo não aceito' }, 400] : [{ ok: true, id: `a${n}` }, 201]) });
        const input = el('importacao-arquivos');
        const arqs = [new File(['x'], 'a.csv'), new File(['y'], 'b.exe'), new File(['z'], 'c.xlsx')];
        Object.defineProperty(input, 'files', { value: arqs });
        await clica('importacaoEnviar');
        await espera();
        const envios = f.mock.calls.filter(([u, o]) => o?.method === 'POST' && u.endsWith('/arquivos'));
        expect(envios).toHaveLength(3);
        for (const [, o] of envios) {
            expect(o.body).toBeInstanceOf(FormData);
            expect(o.body.get('file')).toBeInstanceOf(File);
            expect(o.headers.Authorization).toBe('Bearer tok');
            expect(o.headers['Content-Type']).toBeUndefined();
        }
        expect(envios.map(([, o]) => o.body.get('file').name)).toEqual(['a.csv', 'b.exe', 'c.xlsx']);
        expect(el('c').textContent).toContain('b.exe: Tipo de arquivo não aceito');
    });

    it('processa um arquivo por chamada, em sequência, mostrando situação e tipo detectado', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'inv.csv', status: 'pendente', tipo: null, erro: null }, { id: 'a2', nome: 'nota.pdf', status: 'pendente', tipo: null, erro: null }] });
        const f = await abrirLote(det, {
            [`POST ${B}/l1/arquivos/a1/processar`]: () => { det.arquivos[0] = { ...det.arquivos[0], status: 'processado', tipo: 'inventario' }; return { ok: true, arquivo: det.arquivos[0], itens: 0 }; },
            [`POST ${B}/l1/arquivos/a2/processar`]: () => { det.arquivos[1] = { ...det.arquivos[1], status: 'aguardando', tipo: 'desconhecido' }; return { ok: true, arquivo: det.arquivos[1], itens: 0 }; },
        });
        expect(el('c').textContent).toContain('Na fila');
        await clica('importacaoProcessar');
        await espera();
        const posts = chamadas(f).filter((c) => c.includes('/processar'));
        expect(posts).toEqual([`POST ${B}/l1/arquivos/a1/processar`, `POST ${B}/l1/arquivos/a2/processar`]);
        expect(el('c').textContent).toContain('Inventário de tratamentos');
        expect(el('c').textContent).toContain('Não reconhecido');
        expect(el('importacao-msg').textContent).toContain('Processamento concluído');
    });
});

describe('revisão', () => {
    it('mostra confiança, faltando, origem expansível e link da duplicata', async () => {
        await abrirLote(LOTE({ itens: [item('i1'), item('i2', { confianca: 'baixa', duplicata_de: 'r1', decisao: 'descartado' })] }));
        const t = el('c').textContent;
        expect(t).toContain('Finalidade i1');
        expect(t).toContain('Alta');
        expect(t).toContain('Baixa');
        expect(t).toContain('Categorias de dados');
        expect(t).toContain('Já existe');
        expect(el('c').querySelector('details summary').textContent).toBe('Origem');
        expect(el('c').querySelector('details').textContent).toContain('linha 3 da planilha');
        expect(el('c').querySelector('[data-action="navigate"][data-args=\'["ropa"]\']')).not.toBeNull();
    });

    it('aceitar e descartar mandam a decisão e recarregam', async () => {
        const det = LOTE({ itens: [item('i1')] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/i1`]: (o) => { det.itens[0].decisao = JSON.parse(o.body).decisao; return { ok: true }; } });
        await clica('importacaoDecidir', ['i1', 'aceito']);
        await espera();
        const put = f.mock.calls.find(([, o]) => o?.method === 'PUT');
        expect(JSON.parse(put[1].body)).toEqual({ decisao: 'aceito' });
        expect(el('c').textContent).toContain('Aceito');
        await clica('importacaoDecidir', ['i1', 'descartado']);
        await espera();
        expect(el('c').textContent).toContain('Descartado');
    });

    it('"aceitar todos de confiança alta" só pega pendentes de confiança alta e sem duplicata', async () => {
        const det = LOTE({ itens: [item('i1'), item('i2', { confianca: 'media' }), item('i3', { duplicata_de: 'r1' }), item('i4')] });
        const f = await abrirLote(det, {
            [`PUT ${B}/l1/itens/i1`]: () => { det.itens[0].decisao = 'aceito'; return { ok: true }; },
            [`PUT ${B}/l1/itens/i4`]: () => { det.itens[3].decisao = 'aceito'; return { ok: true }; },
        });
        expect(el('c').textContent).toContain('Aceitar todos de confiança alta (2)');
        await clica('importacaoAceitarAlta');
        await espera();
        expect(f.mock.calls.filter(([, o]) => o?.method === 'PUT').map(([u]) => u.split('/').pop())).toEqual(['i1', 'i4']);
        expect(el('importacao-msg').textContent).toContain('2 item(ns) aceito(s)');
    });

    it('editar abre o formulário com os campos e envia os dados corrigidos', async () => {
        const det = LOTE({ itens: [item('i1', { dados: { finalidade: 'Folha', sistemas: ['ERP'] } })] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/i1`]: { ok: true } });
        await clica('importacaoEditar', ['i1']);
        expect(el('imp-finalidade').value).toBe('Folha');
        expect(el('imp-sistemas').value).toBe('ERP');
        el('imp-retencao').value = '5 anos';
        el('imp-areas').value = 'RH, Financeiro';
        el('imp-dpia_requerido').value = 'true';
        await clica('importacaoSalvarItem', ['i1']);
        await espera();
        const put = f.mock.calls.find(([, o]) => o?.method === 'PUT');
        expect(JSON.parse(put[1].body)).toEqual({ dados: expect.objectContaining({ finalidade: 'Folha', retencao: '5 anos', base_legal: null, dpia_requerido: true, transferencia_internacional: null, sistemas: ['ERP'], areas: ['RH', 'Financeiro'], pessoas: [] }) });
    });
});

describe('confirmar', () => {
    it('chama de novo enquanto restantes > 0, acumula os resultados e mostra o motivo da recusa', async () => {
        const det = LOTE({ itens: [item('i1', { decisao: 'aceito' }), item('i2', { decisao: 'aceito' }), item('i3', { decisao: 'aceito' })] });
        const rodadas = [
            { ok: true, resultados: [{ item_id: 'i1', decisao: 'gravado', registro_id: 'r1' }, { item_id: 'i2', decisao: 'recusado', motivo: 'já existe tratamento com essa finalidade' }], restantes: 1 },
            { ok: true, resultados: [{ item_id: 'i3', decisao: 'gravado', registro_id: 'r3' }], restantes: 0 },
        ];
        const f = await abrirLote(det, { [`POST ${B}/l1/confirmar`]: () => rodadas.shift() });
        await clica('importacaoConfirmar');
        await espera();
        expect(chamadas(f).filter((c) => c.endsWith('/confirmar'))).toHaveLength(2);
        const t = el('c').textContent;
        expect(t).toContain('Resultado da importação');
        expect(t).toContain('Finalidade i1');
        expect(t).toContain('já existe tratamento com essa finalidade');
        expect(t).toContain('2 gravado(s), 1 recusado(s)');
    });

    it('409 de gravação em curso: mostra a mensagem, mantém os resultados e deixa tentar de novo', async () => {
        const det = LOTE({ itens: [item('i1', { decisao: 'aceito' })] });
        let n = 0;
        await abrirLote(det, { [`POST ${B}/l1/confirmar`]: () => (++n === 1 ? [{ error: 'Importação já em gravação' }, 409] : { ok: true, resultados: [{ item_id: 'i1', decisao: 'gravado' }], restantes: 0 }) });
        await clica('importacaoConfirmar');
        await espera();
        expect(el('importacao-msg').textContent).toContain('Importação já em gravação');
        expect(document.querySelector('[data-action="importacaoConfirmar"]').disabled).toBe(false);
        await clica('importacaoConfirmar');
        await espera();
        expect(el('importacao-msg').textContent).toContain('1 gravado(s)');
    });
});

describe('cancelar', () => {
    it('pede confirmação na própria janela (sem confirm()) e só então apaga', async () => {
        const conf = vi.spyOn(window, 'confirm');
        const f = await abrirLote(LOTE(), { [`DELETE ${B}/l1`]: { ok: true } });
        await clica('importacaoCancelar');
        expect(el('c').textContent).toContain('Cancelar o lote apaga os arquivos');
        expect(chamadas(f)).not.toContain(`DELETE ${B}/l1`);
        await clica('importacaoCancelarNao');
        expect(el('c').textContent).not.toContain('Cancelar o lote apaga os arquivos');
        await clica('importacaoCancelar');
        await clica('importacaoCancelarSim');
        await espera();
        expect(chamadas(f)).toContain(`DELETE ${B}/l1`);
        expect(conf).not.toHaveBeenCalled();
    });
});

describe('texto da API sai como texto', () => {
    it('nome de arquivo, origem, motivo, dados e mensagem de erro com HTML não viram elemento', async () => {
        const mal = '<img src=x onerror="window.__xss=1">';
        await abrirLote(LOTE({
            arquivos: [{ id: 'a1', nome: `${mal}.csv`, status: 'erro', tipo: mal, erro: mal }],
            itens: [item('i1', { dados: { finalidade: mal, base_legal: mal, sistemas: [mal] }, origem: mal, motivo: mal, faltando: [mal], decisao: 'recusado' })],
        }));
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').textContent).toContain(mal);
        await clica('importacaoEditar', ['i1']);
        expect(el('imp-finalidade').value).toBe(mal);
        expect(document.querySelector('img')).toBeNull();
        expect(window.__xss).toBeUndefined();
    });
});

describe('menu e rota', () => {
    it('item nav-importacao no grupo Privacidade, só no n.privacy, e o roteador chama a tela', () => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nav = doc.getElementById('nav-importacao');
        expect(nav.textContent.trim()).toBe('Importar programa');
        expect(nav.getAttribute('data-args')).toBe('["importacao"]');
        expect(nav.closest('#group-privacy')).not.toBeNull();
        expect(rota).toContain("S.view === 'importacao'");
        expect(main).toContain("./views/importacao.js");
    });
});

describe('correções da revisão', () => {
    it('falha ao processar um arquivo é registrada e aparece na mensagem final; timeout/rede para o laço', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'um.csv', status: 'pendente' }, { id: 'a2', nome: 'dois.csv', status: 'pendente' }, { id: 'a3', nome: 'tres.csv', status: 'pendente' }] });
        const f = await abrirLote(det, {
            [`POST ${B}/l1/arquivos/a1/processar`]: [{ error: 'Falha ao processar o arquivo' }, 500],
            [`POST ${B}/l1/arquivos/a2/processar`]: () => { throw new Error('rede'); },
        });
        await clica('importacaoProcessar');
        await espera();
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toHaveLength(2);
        const m = el('importacao-msg').textContent;
        expect(m).toContain('um.csv: Falha ao processar o arquivo');
        expect(m).toContain('dois.csv');
        expect(m).not.toContain('Processamento concluído');
    });

    it('durante o envio os botões ficam desabilitados', async () => {
        let solta;
        const f = await abrirLote(LOTE(), { [`POST ${B}/l1/arquivos`]: () => new Promise((r) => { solta = r; }).then(() => [{ ok: true, id: 'a1' }, 201]) });
        Object.defineProperty(el('importacao-arquivos'), 'files', { value: [new File(['x'], 'a.csv')] });
        await clica('importacaoEnviar');
        expect(document.querySelector('[data-action="importacaoEnviar"]').disabled).toBe(true);
        solta();
        await espera();
        expect(document.querySelector('[data-action="importacaoEnviar"]').disabled).toBe(false);
        expect(f).toBeDefined();
    });

    it('primeira chamada de confirmar falha: não mostra a seção de resultado', async () => {
        const det = LOTE({ itens: [item('i1', { decisao: 'aceito' })] });
        await abrirLote(det, { [`POST ${B}/l1/confirmar`]: [{ error: 'Importação em gravação' }, 409] });
        await clica('importacaoConfirmar');
        await espera();
        expect(el('c').textContent).not.toContain('Resultado da importação');
        expect(el('importacao-msg').textContent).toContain('Importação em gravação');
    });

    it('confirmar para quando a rodada volta sem resultados mesmo com restantes > 0', async () => {
        const det = LOTE({ itens: [item('i1', { decisao: 'aceito' })] });
        const f = await abrirLote(det, { [`POST ${B}/l1/confirmar`]: { ok: true, resultados: [], restantes: 3 } });
        await clica('importacaoConfirmar');
        await espera();
        expect(chamadas(f).filter((c) => c.endsWith('/confirmar'))).toHaveLength(1);
    });

    it('aspas e apóstrofo no id não quebram o data-args; < e " nos valores de lista do formulário ficam no valor', async () => {
        const id = `i'1"<x>`;
        const det = LOTE({ itens: [item(id, { dados: { finalidade: 'F', sistemas: ['A"<b>', "O'Neil"] } })] });
        await abrirLote(det);
        const b = [...document.querySelectorAll('[data-action="importacaoEditar"]')][0];
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual([id]);
        await clica('importacaoEditar', [id]);
        expect(el('imp-sistemas').value).toBe(`A"<b>, O'Neil`);
        expect(document.querySelector('#modal-content b')).toBeNull();
    });
});
