// Lista de LIAs do projeto (n.privacy, spec 2026-10-19): GET /projects/:id/ropa/lias. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/lia.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SO_PRIVACY, TELAS_DOS_MODULOS } from '../src/produto.js';

initDelegation();

// Corpo como o handler devolve (src/routes/ropa.ts, `lias`): { lias: [...] }.
const LIAS = [
    { ropa_id: 'r1', atividade: 'Atividade <b>Exemplo</b>', area: 'Gestão', status: 'concluida', conclusao: 'prevalece', concluida_por: 'cons@ness.lat', concluida_em: '2026-10-01T10:00:00Z' },
    { ropa_id: 'r2', atividade: 'Atividade Sem LIA', area: 'Comercial, Gestão', status: 'faltando', conclusao: null, concluida_por: null, concluida_em: null },
    { ropa_id: 'r3', atividade: 'Atividade Rascunho', status: 'rascunho', conclusao: null, concluida_por: null, concluida_em: null },
];
const el = (id) => document.getElementById(id);
const linhas = () => [...el('lia-lista').querySelectorAll('tbody tr')];

async function abrir(lias = LIAS) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    const f = servir({ 'GET /api/v1/projects/p9/ropa/lias': { lias } });
    await window.renderLia(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.abrirAtividade = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('LIA', () => {
    it('Word só na linha com LIA gravada', async () => {
        await abrir([{ ropa_id: 'r1', atividade: 'A', status: 'concluida' }, { ropa_id: 'r2', atividade: 'B', status: 'faltando' }]);
        const bs = el('lia-lista').querySelectorAll('[data-action="baixarWordLia"]');
        expect(bs.length).toBe(1);
        expect(JSON.parse(bs[0].dataset.args)).toEqual(['p9', 'r1']);
        expect(linhas()[0].contains(bs[0])).toBe(true);
    });
    it('colunas, situação em texto e conclusão resumida', async () => {
        await abrir();
        expect(el('h').textContent).toBe('LIA');
        expect([...el('c').querySelectorAll('thead th')].map((t) => t.textContent.trim())).toEqual(['Atividade', 'Área', 'Situação', 'Conclusão', 'Concluída em', 'Ações']);
        const t = linhas().map((l) => l.textContent);
        expect(t[0]).toContain('Concluída');
        expect(t[0]).toContain('O legítimo interesse prevalece');
        expect(t[0]).toContain('01/10/2026');
        expect(t[1]).toContain('Faltando');
        expect(t[2]).toContain('Rascunho');
        expect(el('c').querySelector('b')).toBeNull();
        expect(t[0]).toContain('Atividade <b>Exemplo</b>');
    });

    it('filtra por situação e "Abrir" leva à atividade na aba Base Jurídica', async () => {
        await abrir();
        expect(el('lia-contagem').textContent).toBe('3');
        expect([...el('lia-f-situacao').options].map((o) => o.textContent)).toEqual(['Todos', 'Faltando', 'Rascunho', 'Concluída']);
        el('lia-f-situacao').value = 'faltando';
        el('lia-f-situacao').dispatchEvent(new Event('change', { bubbles: true }));
        expect(linhas()).toHaveLength(1);
        expect(el('lia-contagem').textContent).toBe('1 de 3');
        const b = linhas()[0].querySelector('[data-action="abrirAtividade"]');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'r2', 'base_juridica']);
        b.click();
        expect(window.abrirAtividade).toHaveBeenCalledWith('p9', 'r2', 'base_juridica');
    });

    it('busca sem acento e filtro de área', async () => {
        await abrir();
        el('lia-busca').value = 'sem lia';
        el('lia-busca').dispatchEvent(new Event('input', { bubbles: true }));
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Atividade Sem LIA')]);
        el('lia-busca').value = '';
        el('lia-f-area').value = 'Comercial';
        el('lia-f-area').dispatchEvent(new Event('change', { bubbles: true }));
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Atividade Sem LIA')]);
    });

    it('vazio: nenhuma atividade de legítimo interesse', async () => {
        await abrir([]);
        expect(el('c').textContent).toContain('Nenhuma LIA');
        expect(el('c').querySelector('[data-action="navigate"]').getAttribute('data-args')).toBe('["ropa"]');
    });

    it('a tela está ligada', () => {
        expect(html).toContain(`id="nav-lia" data-action="navigate" data-args='["lia"]'`);
        expect(rota).toContain("S.view === 'lia') renderLia(");
        expect(main).toContain("import './views/lia.js';");
        expect(SO_PRIVACY).toContain('nav-lia');
        expect(TELAS_DOS_MODULOS).toContain('lia');
    });
});
