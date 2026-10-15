// "Novo RIPD" (n.privacy): escolhe a atividade do RoPA primeiro e cria pelo tratamento (POST .../ropa/:rid/dpia), que herda
// finalidade, titulares, categorias, base legal, retenção e o teste de impacto; nada disso é perguntado de novo. Sem atividade, o
// formulário à mão continua. api() dublado com o corpo das rotas (src/routes/ropa.ts e src/routes/projects.ts). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import { render as renderTela } from '../src/router.js';
import '../src/ui.js';
import '../src/views/privacy.js';

const el = (id) => document.getElementById(id);
const REGISTROS = [{ id: 'r1', processing_purpose: 'Folha <b>de pagamento</b>' }, { id: 'r2', processing_purpose: 'Cobrança' }];
beforeEach(() => {
    apiMock.mockReset();
    renderTela.mockClear();
    // api() real já desembrulha `{ ok, records }` na lista: o dublê devolve o que a tela recebe de verdade.
    apiMock.mockImplementation((m, url) => Promise.resolve(m === 'GET' && url.endsWith('/ropa') ? REGISTROS : { ok: true, id: 'dp1' }));
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    window.render = vi.fn();
});
const escolher = (v) => { el('dpia-ropa').value = v; el('dpia-ropa').dispatchEvent(new Event('change', { bubbles: true })); window.novoRipdAtividade(v); };

describe('Novo RIPD a partir da atividade', () => {
    it('lista as atividades escapadas; com uma escolhida, esconde os campos já informados e cria pelo tratamento', async () => {
        await window.openNewDPIAModal('p1');
        const opcoes = [...el('dpia-ropa').querySelectorAll('option')].map((o) => o.textContent);
        expect(opcoes).toContain('Folha <b>de pagamento</b>');
        expect(el('dpia-ropa').querySelector('b')).toBeNull();
        escolher('r1');
        expect(el('dpia-manual').hidden).toBe(true);
        await window.createDPIA('p1');
        const posts = apiMock.mock.calls.filter((c) => c[0] === 'POST');
        expect(posts.map((c) => c[1])).toEqual(['/api/v1/projects/p1/ropa/r1/dpia']);
        expect(posts[0][2]).toBeUndefined();
    });

    it('sem atividade, o formulário à mão segue como antes', async () => {
        await window.openNewDPIAModal('p1');
        escolher('');
        expect(el('dpia-manual').hidden).toBe(false);
        el('dpia-system').value = 'Sistema X';
        await window.createDPIA('p1');
        const post = apiMock.mock.calls.find((c) => c[0] === 'POST');
        expect(post[1]).toBe('/api/v1/projects/p1/dpia');
        expect(post[2].system_name).toBe('Sistema X');
    });

    it('sem atividade e sem nome: o erro aparece no campo e o modal não fecha', async () => {
        await window.openNewDPIAModal('p1');
        escolher('');
        await window.createDPIA('p1');
        expect(apiMock.mock.calls.some((c) => c[0] === 'POST')).toBe(false);
        expect(el('dpia-system').getAttribute('aria-invalid')).toBe('true');
        expect(el('dpia-system-erro').textContent).toMatch(/Informe o sistema ou processo/);
        expect(el('dpia-system').getAttribute('aria-describedby')).toBe('dpia-system-erro');
        expect(el('modal-content').textContent).toMatch(/Novo RIPD/);
        expect(renderTela).not.toHaveBeenCalled();
        el('dpia-system').value = 'Sistema X';
        await window.createDPIA('p1');
        expect(apiMock.mock.calls.some((c) => c[0] === 'POST')).toBe(true);
    });

    it('a atividade já tem RIPD (409): avisa, fecha e recarrega a lista', async () => {
        apiMock.mockImplementation((m, url) => (m === 'GET' ? Promise.resolve(REGISTROS)
            : Promise.reject(Object.assign(new Error('Este tratamento já tem RIPD'), { status: 409, body: { id: 'dp9' } }))));
        await window.openNewDPIAModal('p1');
        escolher('r2');
        await window.createDPIA('p1');
        expect(document.querySelector('.toast').textContent).toMatch(/já tem RIPD/);
        expect(renderTela).toHaveBeenCalled();
    });

    it('projeto sem n.privacy: só o formulário à mão, sem ler o RoPA pela sub-rota do n.privacy', async () => {
        S.activeProject = { id: 'p1', modulos: ['iso'] };
        S.projects = [S.activeProject];
        await window.openNewDPIAModal('p1');
        expect(el('dpia-ropa')).toBeNull();
        expect(el('dpia-manual').hidden).toBe(false);
    });
});
