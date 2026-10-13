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
        expect(el('c').textContent).toContain('Aceitar os 2 de confiança alta');
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
        expect(nav.closest('#group-implantacao')).not.toBeNull();
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
        expect(f.mock.calls.filter(([, o]) => o?.method === 'POST' && o.body instanceof FormData)).toHaveLength(1);
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

describe('processar: tempo, sessão', () => {
    const timeout = () => { const e = new Error('TimeoutError'); e.name = 'TimeoutError'; return e; };

    it('processar usa 150 s; timeout com o arquivo já processado segue para o próximo', async () => {
        const espia = vi.spyOn(AbortSignal, 'timeout');
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'um.csv', status: 'pendente' }, { id: 'a2', nome: 'dois.csv', status: 'pendente' }] });
        const f = await abrirLote(det, { [`POST ${B}/l1/arquivos/a2/processar`]: () => { det.arquivos[1].status = 'processado'; return { ok: true }; } });
        const base = f.getMockImplementation();
        f.mockImplementation(async (u, o = {}) => {
            if (o.method === 'POST' && u.includes('/a1/processar')) { det.arquivos[0].status = 'processado'; throw timeout(); }
            return base(u, o);
        });
        await clica('importacaoProcessar');
        await espera();
        expect(espia).toHaveBeenCalledWith(150000);
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toHaveLength(2);
        expect(el('importacao-msg').textContent).toBe('Processamento concluído.');
    });

    it('timeout com o arquivo ainda pendente: para e pede para aguardar, sem registrar falha', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'grande.pdf', status: 'pendente' }, { id: 'a2', nome: 'dois.csv', status: 'pendente' }] });
        const f = await abrirLote(det, {});
        const base = f.getMockImplementation();
        f.mockImplementation(async (u, o = {}) => { if (o.method === 'POST' && u.includes('/processar')) throw timeout(); return base(u, o); });
        await clica('importacaoProcessar');
        await espera();
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toHaveLength(1);
        const m = el('importacao-msg').textContent;
        expect(m).toBe('O arquivo grande.pdf ainda está em processamento; aguarde e clique em Processar de novo.');
        expect(m).not.toContain('Falhas');
    });

    it('401 ao processar para o laço e não recarrega', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'um.csv', status: 'pendente' }, { id: 'a2', nome: 'dois.csv', status: 'pendente' }] });
        const f = await abrirLote(det, { [`POST ${B}/l1/arquivos/a1/processar`]: [{ error: 'Unauthorized' }, 401] });
        const antes = f.mock.calls.length;
        await clica('importacaoProcessar');
        await espera();
        expect(f.mock.calls.slice(antes).map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`)).toEqual([`POST ${B}/l1/arquivos/a1/processar`]);
    });

    it('chama processar de novo enquanto restantes > 0, mostrando "bloco X de Y"', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'inv.csv', status: 'pendente' }, { id: 'a2', nome: 'b.csv', status: 'pendente' }] });
        const restantes = [3, 2, 1, 0];
        const vistas = [];
        const f = await abrirLote(det, {
            [`POST ${B}/l1/arquivos/a1/processar`]: () => {
                vistas.push(el('importacao-msg').textContent);
                const r = restantes.shift();
                if (r === 0) det.arquivos[0].status = 'processado';
                return { ok: true, arquivo: { id: 'a1', status: r ? 'pendente' : 'processado', bloco_atual: 3 - r, blocos_total: 3 }, restantes: r };
            },
            [`POST ${B}/l1/arquivos/a2/processar`]: () => { det.arquivos[1].status = 'processado'; return { ok: true, arquivo: { id: 'a2', status: 'processado' }, restantes: 0 }; },
        });
        await clica('importacaoProcessar');
        await espera();
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toEqual([...Array(4).fill(`POST ${B}/l1/arquivos/a1/processar`), `POST ${B}/l1/arquivos/a2/processar`]);
        expect(vistas[1]).toContain('bloco 1 de 3');
        expect(vistas[3]).toContain('bloco 3 de 3');
        expect(el('importacao-msg').textContent).toBe('Processamento concluído.');
    });

    it('arquivo que volta em erro no meio não é chamado de novo', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'inv.csv', status: 'pendente' }] });
        const f = await abrirLote(det, { [`POST ${B}/l1/arquivos/a1/processar`]: { ok: true, arquivo: { id: 'a1', status: 'erro', bloco_atual: 1, blocos_total: 3 }, restantes: 2 } });
        await clica('importacaoProcessar');
        await espera();
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toHaveLength(1);
    });

    it('"Confirmar importação" fica desabilitado com o lote em processamento ou em gravação', async () => {
        for (const status of ['processando', 'gravando']) {
            await abrirLote(LOTE({ lote: { id: 'l1', status }, itens: [item('i1', { decisao: 'aceito' })] }));
            expect(document.querySelector('[data-action="importacaoConfirmar"]').disabled, status).toBe(true);
            await window.importacaoVoltar();
        }
        await abrirLote(LOTE({ lote: { id: 'l1', status: 'em_revisao' }, itens: [item('i1', { decisao: 'aceito' })] }));
        expect(document.querySelector('[data-action="importacaoConfirmar"]').disabled).toBe(false);
    });

    it('lote preso em processamento há mais de 10 minutos: Confirmar e Processar voltam a valer', async () => {
        const fmt = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 19).replace('T', ' ');
        const det = (updated_at) => LOTE({ lote: { id: 'l1', status: 'processando', updated_at }, arquivos: [{ id: 'a1', nome: 'um.csv', status: 'pendente' }], itens: [item('i1', { decisao: 'aceito' })] });
        await abrirLote(det(fmt(2 * 60000)));
        expect(document.querySelector('[data-action="importacaoConfirmar"]').disabled).toBe(true);
        await window.importacaoVoltar();
        await abrirLote(det(fmt(11 * 60000)));
        expect(document.querySelector('[data-action="importacaoConfirmar"]').disabled).toBe(false);
        expect(document.querySelector('[data-action="importacaoProcessar"]').disabled).toBe(false);
    });

    it('409 ao processar (lote em gravação) para o laço e mostra o motivo', async () => {
        const det = LOTE({ arquivos: [{ id: 'a1', nome: 'um.csv', status: 'pendente' }, { id: 'a2', nome: 'dois.csv', status: 'pendente' }] });
        const f = await abrirLote(det, { [`POST ${B}/l1/arquivos/a1/processar`]: [{ error: 'Importação em gravação' }, 409] });
        await clica('importacaoProcessar');
        await espera();
        expect(chamadas(f).filter((c) => c.includes('/processar'))).toHaveLength(1);
        expect(el('importacao-msg').textContent).toContain('Importação em gravação');
    });

    it('401 ao confirmar não chama de novo nem recarrega', async () => {
        const det = LOTE({ itens: [item('i1', { decisao: 'aceito' })] });
        const f = await abrirLote(det, { [`POST ${B}/l1/confirmar`]: [{ error: 'Unauthorized' }, 401] });
        const antes = f.mock.calls.length;
        await clica('importacaoConfirmar');
        await espera();
        expect(f.mock.calls.length - antes).toBe(1);
    });
});

describe('terceiros (fatia 2): aba própria na revisão', () => {
    const terc = (id, extra = {}) => ({
        id, entidade: 'terceiro', arquivo_id: 'a2', origem: 'linha do fornecedor', confianca: 'alta', faltando: [], duplicata_de: null, decisao: 'pendente', motivo: null,
        dados: { nome: `Fornecedor ${id}`, tipo: 'medio', cnpj: '00.000.000/0001-00', contato: 'dpo@fornecedor.example', dpa: 'DPA Fornecedor', tratamentos: ['Folha'], ultima_avaliacao: { resultado: 'com_ressalvas', valido_ate: '2027-06-30', metodo: 'questionário' } },
        ...extra,
    });

    it('abas por entidade com contagem; a de terceiros mostra tipo, avaliação, DPA, tratamentos e o link da duplicata', async () => {
        await abrirLote(LOTE({ itens: [item('i1'), terc('t1'), terc('t2', { duplicata_de: 'pa1', decisao: 'descartado' })] }));
        const t0 = el('c').textContent;
        expect(t0).toContain('Tratamentos (1)');
        expect(t0).toContain('Terceiros (2)');
        expect(t0).toContain('Finalidade i1');
        expect(t0).not.toContain('Fornecedor t1');
        await clica('importacaoAba', ['terceiro']);
        const t = el('c').textContent;
        expect(t).not.toContain('Finalidade i1');
        expect(t).toContain('Fornecedor t1');
        expect(t).toContain('Tipo: Médio');
        expect(t).toContain('Aprovado com ressalvas até 2027-06-30');
        expect(t).toContain('DPA Fornecedor');
        expect(t).toContain('Folha');
        expect(t).toContain('Já existe');
        expect(el('c').querySelector('[data-action="navigate"][data-args=\'["terceiros"]\']')).not.toBeNull();
        // "aceitar todos de confiança alta" vale para a aba aberta
        expect(t).toContain('Aceitar os 1 de confiança alta');
    });

    it('editar terceiro abre o formulário dele e envia os dados no formato do esquema', async () => {
        const det = LOTE({ itens: [terc('t1')] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/t1`]: { ok: true } });
        await clica('importacaoAba', ['terceiro']);
        await clica('importacaoEditar', ['t1']);
        expect(el('imp-nome').value).toBe('Fornecedor t1');
        expect(el('imp-tipo').value).toBe('medio');
        expect(el('imp-tratamentos').value).toBe('Folha');
        expect(el('imp-aval_valido_ate').value).toBe('2027-06-30');
        el('imp-tipo').value = 'critico';
        el('imp-cnpj').value = '';
        el('imp-tratamentos').value = 'Folha, Benefícios';
        await clica('importacaoSalvarItem', ['t1']);
        await espera();
        const put = f.mock.calls.find(([, o]) => o?.method === 'PUT');
        expect(JSON.parse(put[1].body)).toEqual({ dados: {
            nome: 'Fornecedor t1', tipo: 'critico', cnpj: null, contato: 'dpo@fornecedor.example', dpa: 'DPA Fornecedor', tratamentos: ['Folha', 'Benefícios'],
            ultima_avaliacao: { resultado: 'com_ressalvas', valido_ate: '2027-06-30', metodo: 'questionário' },
        } });
    });

    it('sem resultado ou validade, a avaliação vai nula; sem nome não salva', async () => {
        const det = LOTE({ itens: [terc('t1', { dados: { nome: 'Sem avaliação' } })] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/t1`]: { ok: true } });
        await clica('importacaoAba', ['terceiro']);
        await clica('importacaoEditar', ['t1']);
        el('imp-aval_resultado').value = 'aprovado';
        await clica('importacaoSalvarItem', ['t1']);
        await espera();
        expect(JSON.parse(f.mock.calls.find(([, o]) => o?.method === 'PUT')[1].body).dados).toMatchObject({ nome: 'Sem avaliação', tipo: null, ultima_avaliacao: null });
        await clica('importacaoEditar', ['t1']);
        el('imp-nome').value = ' ';
        await clica('importacaoSalvarItem', ['t1']);
        expect(el('imp-erro').textContent).toContain('nome');
    });

    it('o resultado da confirmação mostra o nome do terceiro e o aviso', async () => {
        const det = LOTE({ itens: [terc('t1', { decisao: 'aceito' })] });
        await abrirLote(det, { [`POST ${B}/l1/confirmar`]: { ok: true, resultados: [{ item_id: 't1', decisao: 'gravado', registro_id: 'pa1', aviso: 'avaliação vencida (2020-01-01) não registrada' }], restantes: 0 } });
        await clica('importacaoConfirmar');
        await espera();
        const t = el('c').textContent;
        expect(t).toContain('Fornecedor t1');
        expect(t).toContain('avaliação vencida (2020-01-01) não registrada');
    });

    it('texto do terceiro com HTML não vira elemento', async () => {
        const mal = '<img src=x onerror="window.__xss2=1">';
        await abrirLote(LOTE({ itens: [terc('t1', { dados: { nome: mal, tipo: mal, cnpj: mal, contato: mal, dpa: mal, tratamentos: [mal], ultima_avaliacao: { resultado: mal, valido_ate: mal, metodo: mal } }, origem: mal, motivo: mal })] }));
        await clica('importacaoAba', ['terceiro']);
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').textContent).toContain(mal);
        await clica('importacaoEditar', ['t1']);
        expect(el('imp-nome').value).toBe(mal);
        expect(document.querySelector('img')).toBeNull();
        expect(window.__xss2).toBeUndefined();
    });
});

describe('documentos e avaliações (fatia 3): abas próprias na revisão', () => {
    const base = { arquivo_id: 'a3', origem: 'trecho do arquivo', confianca: 'alta', faltando: [], duplicata_de: null, decisao: 'pendente', motivo: null };
    const docu = (id, extra = {}) => ({ id, entidade: 'documento', ...base, dados: { titulo: `Política ${id}`, tipo: 'politica', resumo: `Resumo ${id}` }, ...extra });
    const aval = (id, entidade, extra = {}) => ({ id, entidade, ...base, dados: { tratamento: `Tratamento ${id}`, conclusao: `Conclusão ${id}`, riscos: ['Vazamento', 'Acesso indevido'] }, ...extra });

    it('abas Documentos e Avaliações com contagem; documento com tipo e resumo; avaliação com DPIA/LIA, tratamento, conclusão e riscos', async () => {
        await abrirLote(LOTE({ itens: [item('i1'), docu('d1'), docu('d2', { duplicata_de: 'doc9', decisao: 'descartado' }), aval('v1', 'dpia'), aval('v2', 'lia')] }));
        const t0 = el('c').textContent;
        expect(t0).toContain('Documentos (2)');
        expect(t0).toContain('Avaliações (2)');
        await clica('importacaoAba', ['documento']);
        let t = el('c').textContent;
        expect(t).not.toContain('Finalidade i1');
        expect(t).toContain('Política d1');
        expect(t).toContain('Tipo: Política');
        expect(t).toContain('Resumo d1');
        expect(t).toContain('Já existe');
        expect(el('c').querySelector('[data-action="navigate"][data-args=\'["documentos"]\']')).not.toBeNull();
        expect(t).toContain('rascunho');
        await clica('importacaoAba', ['avaliacao']);
        t = el('c').textContent;
        expect(t).toContain('DPIA');
        expect(t).toContain('LIA');
        expect(t).toContain('Tratamento v1');
        expect(t).toContain('Conclusão v1');
        expect(t).toContain('Vazamento');
        expect(t).toContain('Aceitar os 2 de confiança alta');
    });

    it('editar documento e avaliação envia os dados no formato do esquema; sem título ou tratamento não salva', async () => {
        const det = LOTE({ itens: [docu('d1'), aval('v1', 'lia')] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/d1`]: { ok: true }, [`PUT ${B}/l1/itens/v1`]: { ok: true } });
        await clica('importacaoAba', ['documento']);
        await clica('importacaoEditar', ['d1']);
        expect(el('imp-titulo').value).toBe('Política d1');
        expect(el('imp-tipo').value).toBe('politica');
        el('imp-tipo').value = 'norma';
        el('imp-resumo').value = '';
        await clica('importacaoSalvarItem', ['d1']);
        await espera();
        const puts = () => f.mock.calls.filter(([, o]) => o?.method === 'PUT').map(([, o]) => JSON.parse(o.body));
        expect(puts()[0]).toEqual({ dados: { titulo: 'Política d1', tipo: 'norma', resumo: null } });

        await clica('importacaoAba', ['avaliacao']);
        await clica('importacaoEditar', ['v1']);
        expect(el('imp-tratamento').value).toBe('Tratamento v1');
        expect(el('imp-riscos').value).toBe('Vazamento\nAcesso indevido');
        el('imp-riscos').value = 'Vazamento\n\n Perfilamento ';
        await clica('importacaoSalvarItem', ['v1']);
        await espera();
        expect(puts()[1]).toEqual({ dados: { tratamento: 'Tratamento v1', conclusao: 'Conclusão v1', riscos: ['Vazamento', 'Perfilamento'] } });

        await clica('importacaoEditar', ['v1']);
        el('imp-tratamento').value = ' ';
        await clica('importacaoSalvarItem', ['v1']);
        expect(el('imp-erro').textContent).toContain('tratamento');
        await clica('importacaoAba', ['documento']);
        await clica('importacaoEditar', ['d1']);
        el('imp-titulo').value = '';
        await clica('importacaoSalvarItem', ['d1']);
        expect(el('imp-erro').textContent).toContain('título');
    });

    it('o resultado da confirmação mostra o título do documento e o tratamento da avaliação', async () => {
        const det = LOTE({ itens: [docu('d1', { decisao: 'aceito' }), aval('v1', 'dpia', { decisao: 'aceito' })] });
        await abrirLote(det, { [`POST ${B}/l1/confirmar`]: { ok: true, resultados: [
            { item_id: 'd1', decisao: 'gravado', registro_id: 'doc1', aviso: 'o arquivo original não foi guardado como evidência; anexe-o à mão' },
            { item_id: 'v1', decisao: 'recusado', motivo: 'tratamento "Tratamento v1" não encontrado no RoPA deste projeto' },
        ], restantes: 0 } });
        await clica('importacaoConfirmar');
        await espera();
        const t = el('c').textContent;
        expect(t).toContain('Política d1');
        expect(t).toContain('não foi guardado como evidência');
        expect(t).toContain('não encontrado no RoPA');
    });

    it('texto de documento e avaliação com HTML não vira elemento', async () => {
        const mal = '<img src=x onerror="window.__xss3=1">';
        await abrirLote(LOTE({ itens: [
            docu('d1', { dados: { titulo: mal, tipo: mal, resumo: mal }, origem: mal, motivo: mal }),
            aval('v1', 'dpia', { dados: { tratamento: mal, conclusao: mal, riscos: [mal] }, origem: mal }),
        ] }));
        await clica('importacaoAba', ['documento']);
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').textContent).toContain(mal);
        await clica('importacaoEditar', ['d1']);
        expect(el('imp-titulo').value).toBe(mal);
        await clica('importacaoAba', ['avaliacao']);
        expect(el('c').querySelector('img')).toBeNull();
        await clica('importacaoEditar', ['v1']);
        expect(el('imp-tratamento').value).toBe(mal);
        expect(document.querySelector('img')).toBeNull();
        expect(window.__xss3).toBeUndefined();
    });
});

describe('histórico operacional (fatia 4): aba própria na revisão', () => {
    const base = { arquivo_id: 'a4', origem: null, confianca: 'alta', faltando: [], duplicata_de: null, decisao: 'pendente', motivo: null };
    const REF = 'tit-0123456789abcdef';
    const ped = (id, extra = {}) => ({ id, entidade: 'titular_pedido', ...base, dados: { tipo: 'acesso', canal: 'email', recebido_em: '2026-01-10', status: 'respondido', respondido_em: '2026-01-20', protocolo: `ANT-${id}`, titular_ref: REF }, ...extra });
    const inc = (id, extra = {}) => ({ id, entidade: 'incidente', ...base, dados: { titulo: `Incidente ${id}`, protocolo: `INC-${id}`, ciencia_em: '2026-02-01', risco_titular: 'relevante', comunicacao_anpd_em: '2026-02-03', status: 'encerrado' }, ...extra });
    const con = (id, extra = {}) => ({ id, entidade: 'consentimento', ...base, dados: { tratamento: `Tratamento ${id}`, titular_ref: REF, finalidade: `Finalidade ${id}`, obtido_em: '2025-05-05', revogado_em: null, versao_aviso: 'v1' }, ...extra });

    it('aba Histórico com contagem; pedido, incidente e consentimento com selo, datas e protocolo de origem; aviso de pseudônimo e de prazo', async () => {
        await abrirLote(LOTE({ itens: [item('i1'), ped('p1'), inc('n1', { duplicata_de: 'inc9', decisao: 'descartado' }), con('c1')] }));
        expect(el('c').textContent).toContain('Histórico (3)');
        await clica('importacaoAba', ['historico']);
        const t = el('c').textContent;
        expect(t).not.toContain('Finalidade i1');
        expect(t).toContain('Pedido');
        expect(t).toContain('Acesso aos dados');
        expect(t).toContain('ANT-p1');
        expect(t).toContain('2026-01-10');
        expect(t).toContain('Respondido');
        expect(t).toContain('Incidente n1');
        expect(t).toContain('Relevante');
        expect(t).toContain('Encerrado');
        expect(t).toContain('Consentimento');
        expect(t).toContain('Tratamento c1');
        expect(t).toContain(REF);
        expect(t).toContain('pseudônimo');
        expect(t).toContain('prazo');
        expect(t).toContain('Já existe');
        expect(el('c').querySelector('[data-action="navigate"][data-args=\'["titular"]\']')).not.toBeNull();
    });

    it('editar pedido, incidente e consentimento envia os dados no formato do esquema, preservando o pseudônimo', async () => {
        const det = LOTE({ itens: [ped('p1'), inc('n1'), con('c1')] });
        const f = await abrirLote(det, { [`PUT ${B}/l1/itens/p1`]: { ok: true }, [`PUT ${B}/l1/itens/n1`]: { ok: true }, [`PUT ${B}/l1/itens/c1`]: { ok: true } });
        const puts = () => f.mock.calls.filter(([, o]) => o?.method === 'PUT').map(([, o]) => JSON.parse(o.body));
        await clica('importacaoAba', ['historico']);

        await clica('importacaoEditar', ['p1']);
        expect(el('imp-tipo').value).toBe('acesso');
        expect(el('imp-titular_ref')).toBeNull();
        el('imp-status').value = 'arquivado';
        el('imp-respondido_em').value = '';
        await clica('importacaoSalvarItem', ['p1']);
        await espera();
        expect(puts()[0]).toEqual({ dados: { tipo: 'acesso', canal: 'email', recebido_em: '2026-01-10', status: 'arquivado', respondido_em: null, protocolo: 'ANT-p1', titular_ref: REF } });

        await clica('importacaoEditar', ['n1']);
        el('imp-risco_titular').value = 'baixo';
        el('imp-comunicacao_anpd_em').value = '';
        await clica('importacaoSalvarItem', ['n1']);
        await espera();
        expect(puts()[1]).toEqual({ dados: { titulo: 'Incidente n1', protocolo: 'INC-n1', ciencia_em: '2026-02-01', risco_titular: 'baixo', comunicacao_anpd_em: null, comunicacao_titular_em: null, status: 'encerrado' } });

        await clica('importacaoEditar', ['c1']);
        el('imp-revogado_em').value = '2026-03-03';
        await clica('importacaoSalvarItem', ['c1']);
        await espera();
        expect(puts()[2]).toEqual({ dados: { tratamento: 'Tratamento c1', titular_ref: REF, finalidade: 'Finalidade c1', obtido_em: '2025-05-05', revogado_em: '2026-03-03', versao_aviso: 'v1', canal: null } });

        await clica('importacaoEditar', ['n1']);
        el('imp-titulo').value = ' ';
        await clica('importacaoSalvarItem', ['n1']);
        expect(el('imp-erro').textContent).toContain('obrigatório');
    });

    it('o resultado da confirmação nomeia pedido, incidente e consentimento e mostra o aviso', async () => {
        const det = LOTE({ itens: [ped('p1', { decisao: 'aceito' }), inc('n1', { decisao: 'aceito' }), con('c1', { decisao: 'aceito' })] });
        await abrirLote(det, { [`POST ${B}/l1/confirmar`]: { ok: true, resultados: [
            { item_id: 'p1', decisao: 'gravado', registro_id: 'tp1', aviso: 'prazo de resposta (2026-01-25) já vencido: o pedido aparece atrasado; o aviso de atraso começa na semana que vem' },
            { item_id: 'n1', decisao: 'gravado', registro_id: 'in1' },
            { item_id: 'c1', decisao: 'recusado', motivo: 'tratamento "Tratamento c1" não encontrado no RoPA deste projeto' },
        ], restantes: 0 } });
        await clica('importacaoConfirmar');
        await espera();
        const t = el('c').textContent;
        expect(t).toContain('ANT-p1');
        expect(t).toContain('Incidente n1');
        expect(t).toContain('Tratamento c1');
        expect(t).toContain('já vencido');
    });

    it('texto do histórico com HTML não vira elemento', async () => {
        const mal = '<img src=x onerror="window.__xss4=1">';
        await abrirLote(LOTE({ itens: [
            ped('p1', { dados: { tipo: mal, canal: mal, recebido_em: mal, status: mal, protocolo: mal, titular_ref: mal }, motivo: mal }),
            inc('n1', { dados: { titulo: mal, protocolo: mal, ciencia_em: mal, risco_titular: mal, status: mal } }),
            con('c1', { dados: { tratamento: mal, titular_ref: mal, finalidade: mal, obtido_em: mal, versao_aviso: mal } }),
        ] }));
        await clica('importacaoAba', ['historico']);
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').textContent).toContain(mal);
        await clica('importacaoEditar', ['n1']);
        expect(el('imp-titulo').value).toBe(mal);
        await clica('importacaoEditar', ['c1']);
        expect(el('imp-tratamento').value).toBe(mal);
        expect(document.querySelector('img')).toBeNull();
        expect(window.__xss4).toBeUndefined();
    });
});
