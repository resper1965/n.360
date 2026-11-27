// n.ot, site em Operação (spec 2026-11-26 §5, PR8): Desvios, Saúde da coleta, Inventário, Mudanças e Revalidação. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarSite } from '../src/views/ot-site.js';
import { permissoesPeloPapel } from './ot-abrir.js';

beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const texto = () => el('c').textContent;
const acoes = () => [...el('c').querySelectorAll('[data-action]'), ...el('a').querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));
const SITE = { id: 's1', nome: 'SE Norte Exemplo', tipo: 'subestacao', criticidade: 'alta', localizacao: null, status: 'ativo' };
const SIT = { fase: 'em_operacao', area: 'operacao', etapa: null, falta: [], base_aprovada_em: '2026-10-01 12:00:00', revalidar_em: '2026-12-20', proximo_passo: 'em_operacao', rascunhos: 0, lotes_em_revisao: 0 };
const lote = (id, site_id, status, created_at, itens = 2) => ({ id, site_id, fonte: 'manual', status, created_at, itens, com_erro: 0, gravados: 0 });
const LOTES = [lote('antes', 's1', 'concluido', '2026-09-20 10:00:00'), lote('aberto', 's1', 'em_revisao', '2026-10-05 10:00:00', 3), lote('feito', 's1', 'concluido', '2026-10-10 10:00:00'),
    lote('recusado', 's1', 'rejeitado', '2026-10-12 10:00:00'), lote('outro', 's2', 'em_revisao', '2026-10-06 10:00:00')];
const ativo = (id, nome, extra = {}) => ({ id, site_id: 's1', zona_id: null, nome, no_arciber: true, ultima_verificacao_em: '2026-11-01 10:00:00', verificado_por: 'u1', mascarado: true, ip: '•••', mac: '••', protocolos_portas: [], ...extra });

let chamadas;
function servir(extra = {}, sit = SIT) {
    chamadas = [];
    const rotas = { [`GET ${B}/sites`]: { sites: [SITE] }, [`GET ${B}/sites/s1/situacao`]: sit, [`GET ${B}/lotes`]: { lotes: LOTES }, [`GET ${B}/zonas`]: { zonas: [] },
        [`GET ${B}/ativos`]: { ativos: [] }, [`GET ${B}/fluxos`]: { fluxos: [] }, [`GET ${B}/desvios`]: { desvios: [] }, ...extra };
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u });
        return k in rotas ? resposta(typeof rotas[k] === 'function' ? rotas[k](u, opts) : rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
}
const ir = (sub, o = {}) => montarSite(el('c'), el('a'), S.activeProject, { site: 's1', sub, ...o });
const abas = () => [...el('c').querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
const linhas = (titulo) => { const h = [...el('c').querySelectorAll('h3')].find((x) => x.textContent.startsWith(titulo)); return [...h.nextElementSibling.querySelectorAll('tbody tr')]; };

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok'; S.user = { id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin' }; S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otSite = null; S.otLote = null; S.otLevantamento = null; S.otSub = null; S.otDesvioFiltro = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });

describe('site em Operação', () => {
    it('cinco abas, Desvios primeiro; sem Implantação/Operação; a aba do endereço vale', async () => {
        servir();
        await ir(null);
        expect(abas()).toEqual(['Desvios', 'Saúde da coleta', 'Inventário', 'Mudanças', 'Revalidação']);
        expect(S.otSub).toBe('desvios');
        expect(texto()).not.toMatch(/Modo projeto|Modo operação/);
        await ir('revalidacao');
        expect(S.otSub).toBe('revalidacao');
        await ir('zzz');
        expect(S.otSub).toBe('desvios');
    });

    it('Inventário só leitura: ativos e fluxos, sem Registrar, Propor nem Remover', async () => {
        servir({ [`GET ${B}/ativos`]: { ativos: [ativo('a1', 'RTU-01')] } });
        await ir('inventario');
        expect(texto()).toContain('RTU-01');
        expect(texto()).toContain('Fluxos');
        for (const a of ['otRegistrarAtivo', 'otRegistrarFluxo', 'otProporAlteracao', 'otProporRemocao', 'otRemover', 'otNovaZona', 'otEditarZona', 'otRascunhoIa']) expect(acoes()).not.toContain(a);
        expect(texto()).not.toContain('Propor');
    });

    it('Mudanças: só do site e depois da base, abertas, concluídas e recusadas (7 dias); uma consulta de lotes; Registrar mudança', async () => {
        servir();
        await ir('mudancas');
        expect(chamadas.filter((x) => x.k === `GET ${B}/lotes`)).toHaveLength(1);
        expect(linhas('Abertas')).toHaveLength(1);
        expect(linhas('Concluídas')).toHaveLength(1);
        expect(linhas('Recusadas')).toHaveLength(1);
        expect(linhas('Abertas')[0].textContent).toContain('3');
        expect(el('c').querySelectorAll('[data-action="otAbrirLote"]')).toHaveLength(3); // 'antes' (da base) e 'outro' (de s2) não entram
        expect(texto()).toContain('sai desta lista em 7 dias');
        const reg = el('c').querySelector('[data-action="otRegistrarMudanca"]');
        expect(JSON.parse(reg.getAttribute('data-args'))).toEqual(['s1']);
        expect(el('c').querySelectorAll('.btn-primary')).toHaveLength(0);
    });

    it('Mudanças: um lote pedido abre o detalhe dentro de Mudanças', async () => {
        servir({ [`GET ${B}/lotes/aberto`]: { lote: { ...LOTES[1], criado_por: 'u1' }, itens: [] } });
        S.otLote = 'aberto';
        await ir('mudancas');
        expect(S.otSub).toBe('mudancas');
        expect(chamadas.some((x) => x.k === `GET ${B}/lotes/aberto`)).toBe(true);
    });

    it('Mudanças: falha da consulta mostra erro com "Tentar de novo", sem lista', async () => {
        servir({ [`GET ${B}/lotes`]: () => { throw new Error('x'); } });
        await ir('mudancas');
        expect(texto()).toContain('Não foi possível carregar as mudanças do site.');
        expect(texto()).toContain('Tentar de novo');
    });

    it('Revalidação para quem vê completo: prazo, ativos do ARCiber vencidos ou a vencer em 60 dias, e Nova visita', async () => {
        const velho = ativo('a1', 'RTU-VELHO', { ultima_verificacao_em: '2024-11-01 10:00:00' });       // venceu em 11/2026
        const logo = ativo('a2', 'RTU-LOGO', { ultima_verificacao_em: '2024-12-20 10:00:00' });         // vence em 20/12/2026: dentro de 60 dias
        const longe = ativo('a3', 'RTU-LONGE', { ultima_verificacao_em: '2026-11-01 10:00:00' });       // vence em 2028
        const fora = ativo('a4', 'IHM-FORA', { ultima_verificacao_em: '2024-01-01 10:00:00', no_arciber: false });
        const nunca = ativo('a5', 'RTU-NUNCA', { ultima_verificacao_em: null, verificado_por: null });
        servir({ [`GET ${B}/ativos`]: { ativos: [velho, logo, longe, fora, nunca] } });
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
        try { await ir('revalidacao'); } finally { vi.useRealTimers(); }
        expect(texto()).toContain('Revalidar até 20/12/2026');
        expect(texto()).toContain('RTU-VELHO'); expect(texto()).toContain('RTU-LOGO'); expect(texto()).toContain('RTU-NUNCA'); expect(texto()).toContain('Nunca verificado');
        expect(texto()).not.toContain('RTU-LONGE'); expect(texto()).not.toContain('IHM-FORA');
        expect(chamadas.filter((x) => x.k === `GET ${B}/ativos`)).toHaveLength(1);
        expect(chamadas.find((x) => x.k === `GET ${B}/ativos`).url.search).toBe('?site_id=s1');
        expect(acoes()).toContain('otNovoLevantamentoDoSite');
        expect(texto()).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    });

    it.each([['técnico', { id: 'u-tec', role: 'org_user' }], ['platform_admin', { id: 'u-pa', role: 'platform_admin' }]])('Revalidação para %s: só a data, nenhuma lista e nenhuma chamada a /ot/ativos', async (_n, user) => {
        S.user = user;
        servir({ [`GET ${B}/ativos`]: () => { throw new Error('não deveria chamar'); } });
        await ir('revalidacao');
        expect(texto()).toContain('Revalidar até 20/12/2026');
        expect(el('c').querySelector('table')).toBeNull();
        expect(chamadas.some((x) => x.k === `GET ${B}/ativos`)).toBe(false);
    });

    it('Gestor vê "Abrir obra"; quem não é Gestor, não', async () => {
        servir();
        await ir('desvios');
        expect(acoes()).toContain('otObra');
        S.user = { id: 'u-c', role: 'consultoria_admin' };
        await ir('desvios');
        expect(acoes()).not.toContain('otObra');
    });

    it('situação que falha: falha fechada, sem abas', async () => {
        servir({ [`GET ${B}/sites/s1/situacao`]: () => { throw new Error('x'); } });
        await ir('mudancas');
        expect(texto()).toContain('Tentar de novo');
        expect(el('c').querySelector('[role="tab"]')).toBeNull();
    });
});
