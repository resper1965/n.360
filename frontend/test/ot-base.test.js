// n.ot, cabeçalho do site (spec 2026-11-12 E3): próximo passo por situação, quem vê aprovar/devolver, POSTs da base.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { emDiasSP } from '../src/hoje.js';
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

    it('o técnico (criar sem editar) tem "Novo levantamento" em comecar; o cliente, não', () => {
        const sit = { proximo_passo: 'comecar' };
        expect(proximoPasso(sit, 's1', { gestor: false, editar: false, criar: true }).acao).toContain('otNovoLevantamentoDoSite');
        expect(proximoPasso(sit, 's1', { gestor: false, editar: false, criar: false }).acao).toBe('');
    });

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
        window.otTela = vi.fn();
        const p = window.otAprovarBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar')).not.toBeNull());
        expect(document.querySelector('.confirmar').textContent).toContain('Confirmo que este inventário representa o site');
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        const [url, opts] = f.mock.calls[0];
        expect(new URL(url, 'http://x').pathname).toBe(`${B}/sites/s1/base/aprovar`);
        expect(JSON.parse(opts.body)).toEqual({ declaracao: true });
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'operacao'); // aprovada, abre em operação
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

    it('devolver com motivo curto ou vazio avisa e não chama a API', async () => {
        const f = vi.fn(async () => resposta({ ok: true }));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        const p = window.otDevolverBase('s1');
        await vi.waitFor(() => expect(document.querySelector('.confirmar input')).not.toBeNull());
        document.querySelector('.confirmar input').value = ' a ';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(f).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('ao menos 3 caracteres');
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

    it('em obra: selo com a justificativa no title; só o Gestor vê Renovar, e só antes de renovar; um só primário', () => {
        const em = (renovada) => sit('comecar', { fase: 'em_obra', obra: { ate: '2026-12-05', renovada, justificativa: 'Troca "do" <b>switch</b>' } });
        const g = render(em(false), GE);
        expect(g.textContent).toContain('Obra em andamento até 05/12');
        expect(g.querySelector('.badge').getAttribute('title')).toBe('Troca "do" <b>switch</b>');
        expect(g.querySelector('[data-args*="renovar"]').textContent).toBe('Renovar obra');
        expect(g.querySelector('[data-args*="renovar"]').classList.contains('btn-primary')).toBe(false);
        expect(g.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(render(em(true), GE).textContent).not.toContain('Renovar obra');
        expect(render(em(false), EQ).textContent).not.toContain('Renovar obra');
    });
    it('Abrir obra só em operação e só para o Gestor; revalidar mostra o prazo e Novo levantamento', () => {
        const op = sit('em_operacao', { fase: 'em_operacao', obra: null });
        expect(render(op, GE).textContent).toContain('Abrir obra');
        expect(render(op, EQ).textContent).not.toContain('Abrir obra');
        const r = render(sit('revalidar', { fase: 'em_operacao', obra: null, revalidar_em: '2026-12-20' }), { ...GE, criar: true });
        expect(r.textContent).toContain('Revalide o inventário até 20/12');
        expect(r.querySelector('.btn-primary').textContent).toBe('Novo levantamento');
        expect(r.querySelectorAll('.btn-primary')).toHaveLength(1);
    });
    it('datas fora da faixa: nada é enviado (abrir: hoje e +91; renovar: antes do fim e além de fim+90)', async () => {
        const f = vi.fn(async () => resposta({ ok: true }));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const tenta = async (quem, atual, ate) => {
            window.otObra(quem, 's1', atual);
            document.getElementById('obra-just').value = 'x';
            document.getElementById('obra-ate').value = ate;
            await window.otSalvarObra(quem, 's1', atual);
        };
        await tenta('abrir', undefined, emDiasSP(0));
        await tenta('abrir', undefined, emDiasSP(91));
        await tenta('renovar', '2026-12-05', '2026-12-05');
        await tenta('renovar', '2026-12-05', '2026-12-04');
        await tenta('renovar', '2026-12-05', '2027-03-06'); // fim + 91
        expect(f).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('A data deve ficar entre');
        window.otObra('renovar', 's1', '2026-12-05');
        expect(document.getElementById('obra-ate').min).toBe('2026-12-06');
        expect(document.getElementById('obra-ate').max).toBe('2027-03-05');
        await tenta('renovar', '2026-12-05', '2027-03-05'); // fim + 90 passa
        expect(f).toHaveBeenCalledTimes(1);
    });
    it('Abrir obra pede data e justificativa e envia o corpo certo', async () => {
        const f = vi.fn(async () => resposta({ ok: true }));
        vi.stubGlobal('fetch', f);
        window.render = vi.fn();
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        window.otObra('abrir', 's1');
        expect(document.body.textContent).toContain('Durante a obra os desvios são registrados sem alerta.');
        await window.otSalvarObra('abrir', 's1');
        expect(f).not.toHaveBeenCalled(); // vazio: avisa
        document.getElementById('obra-just').value = ' Troca do switch ';
        document.getElementById('obra-ate').value = emDiasSP(10);
        await window.otSalvarObra('abrir', 's1');
        expect(new URL(f.mock.calls[0][0], 'http://x').pathname).toBe(`${B}/sites/s1/obra/abrir`);
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ justificativa: 'Troca do switch', ate: emDiasSP(10) });
        window.otObra('renovar', 's1', '2026-12-05');
        document.getElementById('obra-just').value = 'Atraso';
        document.getElementById('obra-ate').value = '2026-12-20';
        await window.otSalvarObra('renovar', 's1', '2026-12-05');
        expect(new URL(f.mock.calls[1][0], 'http://x').pathname).toBe(`${B}/sites/s1/obra/renovar`);
    });
});
