import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';
import { pendenciasDoPapel, montarInicio } from '../src/views/ot-inicio.js';
import { S } from '../src/state.js';
import '../src/ui.js';

const sites = { s1: 'SE Norte' };
const base = { lotes: [], desvios: [], rascunhosPorSite: {}, sondas: [], sites };

describe('pendenciasDoPapel', () => {
    it('created_at do SQLite (UTC sem Z) não adianta o prazo em um dia', () => {
        const lotes = [{ id: 'l1', status: 'em_revisao', criado_por: 'u2', site_id: 's1', created_at: '2026-11-11 01:00:00' }];
        expect(pendenciasDoPapel({ ...base, lotes }, { id: 'u1', podeAprovar: true, podeEditar: false })[0].texto).toContain('decidir até 17/11');
    });
    it('quem aprova vê o lote dos outros, não o próprio', () => {
        const lotes = [{ id: 'l1', status: 'em_revisao', criado_por: 'u2', site_id: 's1', created_at: '2026-11-10T12:00:00Z' },
            { id: 'l2', status: 'em_revisao', criado_por: 'u1', site_id: 's1', created_at: '2026-11-10T12:00:00Z' }];
        const p = pendenciasDoPapel({ ...base, lotes }, { id: 'u1', podeAprovar: true, podeEditar: true });
        expect(p.filter((x) => x.tipo === 'lote').map((x) => x.acao.lote)).toEqual(['l1']);
        expect(p[0].acao).toMatchObject({ tela: 'site', site: 's1', modo: 'projeto' });
        expect(p[0].texto).toBe('Lote de aprovação em SE Norte: decidir até 17/11');
    });
    it('desvios abertos agrupam por site e levam ao modo operação', () => {
        const desvios = [{ site_id: 's1' }, { site_id: 's1' }];
        const p = pendenciasDoPapel({ ...base, desvios }, { id: 'u1', podeAprovar: true, podeEditar: false });
        expect(p).toEqual([expect.objectContaining({ tipo: 'desvio', texto: '2 desvios abertos em SE Norte', acao: { tela: 'site', site: 's1', modo: 'operacao' } })]);
    });
    it('consultor vê rascunhos e sonda parada; técnico só a recusa do próprio lote', () => {
        const dados = { ...base, rascunhosPorSite: { s1: 3 }, sondas: [{ nome: 'S-1', site_id: 's1', situacao: 'parada' }],
            lotes: [{ id: 'l3', status: 'rejeitado', criado_por: 'u9', site_id: 's1', created_at: '2026-11-01T00:00:00Z' }] };
        expect(pendenciasDoPapel(dados, { id: 'u1', podeAprovar: false, podeEditar: true }).map((x) => x.tipo)).toEqual(['rascunho', 'sonda']);
        expect(pendenciasDoPapel(dados, { id: 'u9', podeAprovar: false, podeEditar: false }).map((x) => x.tipo)).toEqual(['recusado']);
    });
    it('a API traz a situação da sonda em `saude`; atrasada vira "atrasada"', () => {
        const p = pendenciasDoPapel({ ...base, sondas: [{ nome: 'S-2', site_id: 's1', saude: 'atrasada' }, { nome: 'S-3', site_id: 's1', saude: 'em_dia' }] }, { id: 'u1', podeAprovar: false, podeEditar: true });
        expect(p.map((x) => x.texto)).toEqual(['Sonda S-2 atrasada em SE Norte']);
    });
    it('nada pendente devolve lista vazia', () => {
        expect(pendenciasDoPapel(base, { id: 'u1', podeAprovar: true, podeEditar: true })).toEqual([]);
    });
});

describe('montarInicio', () => {
    const B = '/api/v1/projects/p9/ot';
    const ORIGEM = {
        [`GET ${B}/lotes`]: { lotes: [{ id: 'l1', status: 'em_revisao', criado_por: 'u2', site_id: 's1', created_at: '2026-11-10T12:00:00Z' }] },
        [`GET ${B}/levantamentos`]: { levantamentos: [{ id: 'v1', site_id: 's1', situacao: 'aberto', achados: 2 }, { id: 'v2', site_id: 's1', situacao: 'encerrado', achados: 9 }] },
        [`GET ${B}/desvios`]: { desvios: [{ site_id: 's1' }] },
        [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE <b>Norte</b>', ativos: 4 }] },
        [`GET ${B}/sensores/pontos`]: { ativos: 1, fluxos: 2 },
        [`GET ${B}/sites/s1/sensores`]: { sensores: [{ id: 'z', nome: 'S-1', saude: 'parada' }] },
        [`GET ${B}/conformidade`]: { resumo: { nao_atende: 1, evidencia_no_inventario: 2, sem_evidencia: 3 } },
    };
    let urls;
    let rotas;
    beforeEach(() => {
        S.user = { id: 'u1', role: 'org_admin' };
        document.body.innerHTML = '<div id="c"></div>';
        urls = [];
        rotas = { ...ORIGEM };
        vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
            const u = new URL(url, 'http://localhost');
            urls.push(u.pathname + u.search);
            const r = rotas[`${opts.method || 'GET'} ${u.pathname}`];
            return r ? resposta(r) : resposta({ error: 'x' }, 404);
        }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('desenha espera, sites escapados e postura, sem botão primário', async () => {
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).toContain('Espera por você');
        expect(c.textContent).toContain('Lote de aprovação em SE <b>Norte</b>');
        expect(c.querySelector('b')).toBeNull();
        expect(c.textContent).toContain('2 achados em rascunho em SE <b>Norte</b>'); // só o levantamento não encerrado
        expect(c.querySelector('.btn-primary')).toBeNull();
        expect(c.querySelector('[data-action="otTela"][data-args*="assessment"]')).not.toBeNull();
    });
    it('linha da sonda vem de /sensores/pontos e o botão do lote usa otIrParaLote', async () => {
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).toContain('3 achados da sonda para revisar');
        expect(c.querySelector('[data-action="otIrParaLote"]')).not.toBeNull();
        expect(c.querySelector('[data-action="otAbrirLote"]')).toBeNull();
    });
    it('sites que falham: aviso, sem primário e sem "Cadastre o primeiro site"', async () => {
        delete rotas[`GET ${B}/sites`];
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).toContain('Não foi possível carregar os sites.');
        expect(c.querySelector('.btn-primary')).toBeNull();
        expect(c.textContent).not.toContain('Cadastre o primeiro site');
    });
    it('lotes que falham: aviso no lugar de "Nada esperando"', async () => {
        delete rotas[`GET ${B}/lotes`]; rotas[`GET ${B}/desvios`] = { desvios: [] };
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).toContain('Não foi possível carregar tudo o que espera por você.');
        expect(c.textContent).not.toContain('Nada esperando por você agora.');
    });
    it('consultoria_admin não vê lote para aprovar', async () => {
        S.user = { id: 'u1', role: 'consultoria_admin' };
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).not.toContain('Lote de aprovação em');
    });
    it('sem site e sem permissão de edição: só o texto, sem botão', async () => {
        S.user = { id: 'u1', role: 'org_user' };
        rotas[`GET ${B}/sites`] = { sites: [] };
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.textContent).toContain('Cadastre o primeiro site');
        expect(c.querySelector('.btn-primary')).toBeNull();
    });
    it('sem site: empty state com o único primário', async () => {
        rotas[`GET ${B}/sites`] = { sites: [] };
        const c = document.getElementById('c');
        await montarInicio(c, null, { id: 'p9' });
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(c.textContent).toContain('Cadastre o primeiro site');
    });
});
