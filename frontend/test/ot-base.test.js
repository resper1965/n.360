// n.ot, cabeçalho do site (spec 2026-11-12 E3): próximo passo por situação, quem vê aprovar/devolver, POSTs da base.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { cabecalhoDoSite, proximoPasso } from '../src/views/ot-base.js';

const B = '/api/v1/projects/p9/ot';
const sit = (proximo_passo, extra = {}) => ({ fase: 'em_levantamento', base_aprovada_em: null, rascunhos: 0, lote_em_revisao_id: null, proximo_passo, ...extra });
const render = (s, papeis) => { document.body.innerHTML = `<div id="c">${cabecalhoDoSite(s, 's1', papeis)}</div>`; return document.getElementById('c'); };
const EQ = { gestor: false, editar: true };
const GE = { gestor: true, editar: true };

describe('cabeçalho do site', () => {
    beforeEach(() => { S.user = { id: 'u1', role: 'org_admin' }; S.activeProject = { id: 'p9' }; });
    afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

    it.each([
        ['comecar', {}, 'Comece o levantamento', 'otNovoLevantamentoDoSite'],
        ['revisar', { rascunhos: 3 }, 'Revise 3 achados', 'otSiteSub'],
        ['revisar', { rascunhos: 0 }, 'Defina as zonas dos níveis 2, 3 e 4', 'otSiteSub'],
        ['aguardar_lote', { lote_em_revisao_id: 'k1' }, 'Aguardando o Gestor decidir o lote', 'otIrParaLote'],
        ['pedir_base', {}, 'Tudo aprovado: peça a aprovação da base', 'otPedirBase'],
        ['aguardar_base', {}, 'Aguardando o Gestor aprovar a base', 'otAprovarBase'],
        ['em_operacao', { base_aprovada_em: '2026-11-10 12:00:00' }, 'Em operação', 'otSiteModo'],
    ])('%s: texto e um só primário', (passo, extra, texto, acao) => {
        const c = render(sit(passo, extra), GE);
        expect(c.textContent).toContain(texto);
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(c.querySelector('.btn-primary').getAttribute('data-action')).toBe(acao);
    });

    it('revisar com 1 achado fica no singular; Revisar abre a aba certa', () => {
        expect(proximoPasso(sit('revisar', { rascunhos: 1 }), 's1', EQ).texto).toBe('Revise 1 achado');
        expect(JSON.parse(render(sit('revisar', { rascunhos: 2 }), EQ).querySelector('.btn-primary').getAttribute('data-args'))).toEqual(['aprovacao']);
    });

    it('aguardar_base: o Gestor vê aprovar e devolver; os demais só o texto', () => {
        const g = render(sit('aguardar_base'), GE);
        expect([...g.querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['otAprovarBase', 'otDevolverBase']);
        const outro = render(sit('aguardar_base'), EQ);
        expect(outro.querySelectorAll('button')).toHaveLength(0);
        expect(outro.textContent).toContain('Aguardando o Gestor aprovar a base');
    });

    it('régua marca a etapa atual e escapa o que vem da API', () => {
        const c = render(sit('pedir_base'), EQ);
        expect(c.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
        expect(c.querySelector('[aria-current="step"]').textContent).toContain('Revisar e aprovar');
        expect(render(sit('em_operacao', { base_aprovada_em: '2026-11-10 12:00:00' }), EQ).textContent).toContain('Em operação desde 10/11/2026');
        expect(render(null, EQ).textContent).toContain('Não foi possível carregar a situação do site.');
    });

    it('aprovar pede a declaração e faz o POST com { declaracao: true }', async () => {
        const f = vi.fn(async () => resposta({ ok: true }));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        const p = window.otAprovarBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar')).not.toBeNull());
        expect(document.querySelector('.confirmar').textContent).toContain('Confirmo que este inventário representa o site');
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        const [url, opts] = f.mock.calls[0];
        expect(new URL(url, 'http://x').pathname).toBe(`${B}/sites/s1/base/aprovar`);
        expect(JSON.parse(opts.body)).toEqual({ declaracao: true });
    });

    it('aprovar cancelado não chama a API; devolver manda o motivo; 409 mostra a mensagem', async () => {
        const f = vi.fn(async (url) => (String(url).endsWith('/devolver') ? resposta({ error: 'Base não está em aprovação' }, 409) : resposta({ ok: true })));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        let p = window.otAprovarBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar')).not.toBeNull());
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
        expect(f).not.toHaveBeenCalled();
        p = window.otDevolverBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar input')).not.toBeNull());
        document.querySelector('.confirmar input').value = 'Falta a zona 3';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ motivo: 'Falta a zona 3' });
        expect(document.body.textContent).toContain('Base não está em aprovação');
    });

    it('pedir aprovação confirma e faz o POST', async () => {
        const f = vi.fn(async () => resposta({ ok: true }));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        const p = window.otPedirBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar')).not.toBeNull());
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(new URL(f.mock.calls[0][0], 'http://x').pathname).toBe(`${B}/sites/s1/base/pedir`);
    });
});
