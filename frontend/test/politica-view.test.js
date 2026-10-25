// Página da política (PR2 das políticas temáticas): texto inteiro, seções com progresso, geração em sequência e
// "Nova política" pelo catálogo de temas. api() REAL; só o fetch é dublado (rotas de src/routes/politicas.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';
import markedSrc from '../public/marked.min.js?raw';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/router.js', () => ({ navigate, render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/documentos.js';
import '../src/views/politica.js';

new Function(markedSrc)();
const TEXTO = '# POL-CRY-001 Criptografia\n\n## 1. Objetivo\n\nProteger.\n\n## 2. Escopo\n\n> Seção a gerar.\n';
const DOC = { id: 'd1', tipo: 'politica', titulo: 'POL-CRY-001 Criptografia', status: 'rascunho', versoes: [{ numero: 1, estado: 'rascunho', texto: TEXTO, hash: 'h' }] };
const P = '/api/v1/projects/p1';
const rotas = (extra = {}) => ({
    [`GET ${P}/documentos/d1`]: DOC,
    [`GET ${P}/documentos/d1/requisitos`]: [{ id: 'r1', fonte_id: 'iso27001:2022', referencia: 'A.8.24', titulo: 'Uso de criptografia' }],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const el = (id) => document.getElementById(id);

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['iso'] };
    S.politica = { projectId: 'p1', id: 'd1' };
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('página da política', () => {
    it('mostra o texto inteiro, as seções e gera só as que faltam, em sequência', async () => {
        const f = servir(rotas({ [`POST ${P}/documentos/d1/secoes/2/gerar`]: { secao: { n: 2, titulo: 'Escopo', corpo: 'Toda a empresa.', situacao: 'pronta' }, cortada: false } }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toBe('POL-CRY-001 Criptografia');
        expect(el('pol-texto').querySelector('h2')).not.toBeNull();
        expect(el('pol-secoes').textContent).toContain('1 de 2 seções prontas');
        expect(el('c').textContent).toContain('A.8.24');
        expect(el('a').querySelectorAll('.btn-primary').length).toBe(1);
        expect(el('a').querySelector('[data-action="gerarSecoesPendentes"]')).not.toBeNull();
        await window.gerarSecoesPendentes('p1', 'd1');
        expect(chamadas(f)).toContain(`POST ${P}/documentos/d1/secoes/2/gerar`);
        expect(chamadas(f).some((u) => u.endsWith('/secoes/1/gerar'))).toBe(false);
    });

    it('seção marcada como incompleta conta como pendente; texto e título do servidor não viram HTML', async () => {
        const texto = '## 1. Objetivo\n\nSeção incompleta: falta.\n\n## 2. <b>Escopo</b>\n\nPronto.\n';
        servir(rotas({ [`GET ${P}/documentos/d1`]: { ...DOC, titulo: 'T <i>x</i>', versoes: [{ numero: 1, estado: 'vigente', texto }] } }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('pol-secoes').textContent).toContain('1 de 2 seções prontas');
        expect(el('c').textContent).toContain('incompleta');
        expect(el('c').querySelector('aside b')).toBeNull();
    });

    it('erro numa seção avisa o servidor e segue para a próxima', async () => {
        const texto = '## 1. A\n\n> Seção a gerar.\n\n## 2. B\n\n> Seção a gerar.\n';
        const f = servir(rotas({
            [`GET ${P}/documentos/d1`]: { ...DOC, versoes: [{ numero: 1, estado: 'rascunho', texto }] },
            [`POST ${P}/documentos/d1/secoes/2/gerar`]: { secao: { n: 2 }, cortada: false },
        }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        await window.gerarSecoesPendentes('p1', 'd1');
        expect(chamadas(f)).toContain(`POST ${P}/documentos/d1/secoes/1/gerar`);
        expect(chamadas(f)).toContain(`POST ${P}/documentos/d1/secoes/2/gerar`);
        expect(document.querySelector('.toast').textContent).toContain('API route not found');
    });

    it('org_user não vê os botões de gerar', async () => {
        S.user = { role: 'org_user' };
        servir(rotas());
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('a').querySelector('[data-action="gerarSecoesPendentes"]')).toBeNull();
        expect(el('c').querySelector('[data-action="gerarSecao"]')).toBeNull();
    });

    it('429 para a fila com um aviso só; 422 mostra o motivo', async () => {
        const texto = '## 1. A\r\n\r\n\r\n## 2. B\r\n\r\n> Seção a gerar.\r\n';
        const err = (status, body) => ({ status, ok: false, headers: { get: () => 'application/json' }, json: async () => body, text: async () => '{}' });
        const f = vi.fn(async (u, o) => (o?.method === 'POST'
            ? (u.includes('/secoes/1/') ? err(422, { error: 'A resposta da IA foi recusada', motivo: 'marcador de modelo' }) : err(429, { error: 'Limite' }))
            : { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => (u.endsWith('/requisitos') ? [] : { ...DOC, versoes: [{ numero: 1, estado: 'rascunho', texto }] }), text: async () => '{}' }));
        vi.stubGlobal('fetch', f);
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('pol-secoes').textContent).toContain('0 de 2 seções prontas');
        await window.gerarSecao('p1', 'd1', 1);
        expect(document.body.textContent).toContain('marcador de modelo');
        await window.gerarSecoesPendentes('p1', 'd1');
        const posts = f.mock.calls.filter(([, o]) => o?.method === 'POST').length;
        expect(posts).toBe(3); // 1 do gerarSecao + fila 1 (422, segue) e 2 (429, para)
        expect([...document.querySelectorAll('.toast')].filter((t) => t.textContent.includes('Limite de geração atingido')).length).toBe(1);
    });

    it('abrirPolitica guarda a política e navega', () => {
        window.abrirPolitica('p1', 'd1');
        expect(S.politica).toEqual({ projectId: 'p1', id: 'd1' });
        expect(navigate).toHaveBeenCalledWith('politica');
    });
});

describe('controles cobertos editáveis', () => {
    const CAT = [{ id: 'r1', referencia: 'A.8.24', titulo: 'Uso de criptografia' }, { id: 'r2', referencia: 'A.5.15', titulo: 'Controle de acesso' }];
    const put = (f) => f.mock.calls.find(([, o]) => o?.method === 'PUT');

    it('"×" desliga mandando o conjunto sem aquele id', async () => {
        const f = servir(rotas({ 'GET /api/v1/requisitos': CAT, [`PUT ${P}/documentos/d1/requisitos`]: {} }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        const x = el('c').querySelector('[data-action="desligarRequisitoPolitica"]');
        expect(x.getAttribute('aria-label')).toBe('Desligar A.8.24');
        await window.desligarRequisitoPolitica('p1', 'd1', 'r1');
        expect(JSON.parse(put(f)[1].body)).toEqual({ requisitos: [] });
        expect(window.render).toHaveBeenCalled();
    });

    it('"Ligar" manda o conjunto com o novo; o seletor não oferece os já ligados', async () => {
        const f = servir(rotas({ 'GET /api/v1/requisitos': CAT, [`PUT ${P}/documentos/d1/requisitos`]: {} }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        const sel = el('pol-req-add');
        expect([...sel.options].map((o) => o.value)).toEqual(['', 'r2']);
        sel.value = 'r2';
        await window.ligarRequisitoPolitica('p1', 'd1');
        expect(JSON.parse(put(f)[1].body)).toEqual({ requisitos: ['r1', 'r2'] });
    });

    it('sem rascunho ou com papel de leitura, nenhum botão', async () => {
        servir(rotas({ 'GET /api/v1/requisitos': CAT, [`GET ${P}/documentos/d1`]: { ...DOC, versoes: [{ numero: 1, estado: 'vigente', texto: TEXTO }] } }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('c').querySelector('[data-action="desligarRequisitoPolitica"], [data-action="ligarRequisitoPolitica"]')).toBeNull();
        S.user = { role: 'org_user' };
        servir(rotas({ 'GET /api/v1/requisitos': CAT }));
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('c').querySelector('[data-action="desligarRequisitoPolitica"], [data-action="ligarRequisitoPolitica"]')).toBeNull();
    });

    it('GET dos requisitos falho: sem seletor (o PUT substituiria os que existem)', async () => {
        servir({ [`GET ${P}/documentos/d1`]: DOC, 'GET /api/v1/requisitos': CAT });
        await window.renderPolitica(el('c'), el('h'), el('a'));
        expect(el('pol-req-add')).toBeNull();
    });
});

describe('Nova política', () => {
    it('lista o catálogo e marca o tema que já existe', async () => {
        servir({
            [`GET ${P}/politicas/temas`]: { temas: [{ codigo: 'POL-IAM', titulo: 'Controle de Acesso', controles: ['A.5.15'], documento_id: 'd9' }, { codigo: 'POL-CRY', titulo: 'Criptografia', controles: ['A.8.24'], documento_id: null }] },
            'GET /api/v1/requisitos': [{ id: 'r1', referencia: 'A.8.24', titulo: 'Criptografia' }],
        });
        await window.openNovaPoliticaModal('p1');
        const modal = document.querySelector('#modal-content');
        expect(modal.textContent).toContain('Já existe');
        expect(modal.querySelector('[data-args*="POL-CRY"]')).not.toBeNull();
        expect(modal.querySelector('[data-action="abrirPolitica"][data-args*="d9"]')).not.toBeNull();
    });

    it('criar por tema abre a política; no 409 abre a que já existe', async () => {
        const f = servir({ [`GET ${P}/politicas/temas`]: { temas: [] }, 'GET /api/v1/requisitos': [], [`POST ${P}/politicas`]: { id: 'd5' } });
        await window.criarPoliticaDoTema('p1', 'POL-CRY');
        expect(JSON.parse(f.mock.calls.find(([, o]) => o?.method === 'POST')[1].body)).toEqual({ tema: 'POL-CRY' });
        expect(S.politica.id).toBe('d5');
    });

    it('no 409 abre a política que já existe', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 409, ok: false, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Já existe', id: 'd7' }), text: async () => '{}' })));
        await window.criarPoliticaDoTema('p1', 'POL-IAM');
        expect(S.politica.id).toBe('d7');
    });
});
