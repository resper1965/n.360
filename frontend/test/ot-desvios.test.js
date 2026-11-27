// n.ot, aba Desvios (Task 5): lista, filtros, tratar, aceitar e o cartão "Achados da sonda para revisar". api() REAL, fetch dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { emDiasSP } from '../src/hoje.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { desenhar } from './ot-abrir.js';
import { permissoesPeloPapel } from './ot-abrir.js';

// GET /ot/permissoes: a tela lê do servidor (spec 2026-11-26 §6); aqui, a resposta que o servidor daria ao papel do teste.
beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const DESVIOS = { desvios: [
    { id: 'd1', site_id: 's1', site_nome: 'SE Norte', tipo: 'fluxo', situacao: 'aberto', protocolo: 'modbus', porta: 502, externo: true, origem: { ativo: 'CLP <b id="xss">1</b>', zona: 'Supervisão' },
        destino: { ativo: 'Host externo', zona: 'Externa' }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-08T10:00:00Z', ocorrencias: 4, aceito_ate: null, nota: null, achado_id: 'a1', achado_levantamento_id: 'lv7' },
    { id: 'd2', site_id: 's1', site_nome: 'SE Norte', tipo: 'ativo', situacao: 'tratado', fabricante: 'Siemens', origem: { ativo: 'IED 7', zona: 'Supervisão' }, primeira_vez: '2026-11-02T10:00:00Z',
        ultima_vez: '2026-11-03T10:00:00Z', ocorrencias: 1, aceito_ate: null, nota: 'Cadastrado', achado_id: null }] };
let chamadas;
function servir(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, q: u.search, opts });
        const kq = k + u.search; // rota com a query exata (a contagem) vence a do caminho
        if (!(kq in rotas) && !(k in rotas)) return resposta({ error: `API route not found: ${k}` }, 404);
        const r = kq in rotas ? rotas[kq] : rotas[k];
        return Array.isArray(r) ? resposta(r[1], r[0]) : resposta(r);
    }));
}
const CONTAGEM = `GET ${B}/desvios?situacao=aberto&contagem=1`;
const BASE = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }] }, [`GET ${B}/desvios`]: DESVIOS, [CONTAGEM]: { total: 2 } };
async function abrir(aba, rotas = {}) {
    servir({ ...BASE, ...rotas });
    await desenhar(aba);
}
beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor' }; S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otProjeto = 'p9'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null; S.otDesvioFiltro = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('aba Desvios', () => {
    it('lista escapada, situação em texto, filtros pedem ao servidor e o ativo mostra o fabricante', async () => {
        await abrir('desvios');
        expect(el('xss')).toBeNull();
        const t = el('c').textContent;
        expect(t).toContain('Aberto'); expect(t).toContain('Tratado'); expect(t).toContain('modbus:502 · externo'); expect(t).toContain('Siemens'); expect(t).toContain('Cadastrado');
        expect(chamadas.some((c) => c.k === `GET ${B}/desvios` && c.q === '?situacao=aberto')).toBe(true);
        el('des-f-tipo').value = 'ativo';
        window.otFiltrarDesvios('tipo');
        expect(S.otDesvioFiltro).toEqual({ situacao: 'aberto', site_id: '', tipo: 'ativo' });
    });

    it('uma ação principal por tela e ações por papel: consultor trata, só o Gestor aceita', async () => {
        await abrir('desvios');
        expect(document.querySelectorAll('#c .btn-primary')).toHaveLength(0);
        expect(el('c').querySelector('[data-action="otTratarDesvio"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="otAceitarDesvio"]')).toBeNull();
        expect(el('c').querySelectorAll('[data-action="otVerAchadoDesvio"]')).toHaveLength(1);
        S.user.role = 'org_admin';
        await abrir('desvios');
        expect(el('c').querySelector('[data-action="otAceitarDesvio"]')).not.toBeNull();
        expect(el('c').querySelectorAll('[data-action="otTratarDesvio"]')).toHaveLength(1); // o tratado não tem ação
    });

    it('Tratar exige nota e envia', async () => {
        await abrir('desvios', { [`POST ${B}/desvios/d1/tratar`]: { ok: true } });
        window.otTratarDesvio('d1');
        await window.otSalvarTratar('d1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('des-nota').value = ' Regra criada ';
        await window.otSalvarTratar('d1');
        expect(JSON.parse(chamadas.find((c) => c.k.startsWith('POST')).opts.body)).toEqual({ nota: 'Regra criada' });
    });

    it('409: fecha o modal, avisa e redesenha a lista', async () => {
        await abrir('desvios', { [`POST ${B}/desvios/d1/tratar`]: [409, { error: 'Só desvio aberto pode ser tratado ou aceito' }] });
        window.otTratarDesvio('d1');
        el('modal-overlay').classList.add('open');
        el('des-nota').value = 'x';
        await window.otSalvarTratar('d1');
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
        expect(document.body.textContent).toContain('Este desvio já não está aberto.');
        expect(window.render).toHaveBeenCalled();
    });

    it('Aceitar avisa da exceção 5.1.1, limita a data a 90 dias e exige justificativa e prazo', async () => {
        S.user.role = 'org_admin';
        await abrir('desvios', { [`POST ${B}/desvios/d1/aceitar`]: { ok: true } });
        window.otAceitarDesvio('d1');
        expect(el('modal-content').textContent).toContain('Não substitui a exceção formal 5.1.1');
        expect(el('des-ate').max).toBe(emDiasSP(90));
        await window.otSalvarAceite('d1');
        el('des-just').value = 'Janela de manutenção';
        await window.otSalvarAceite('d1');
        expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        el('des-ate').value = el('des-ate').max;
        await window.otSalvarAceite('d1');
        expect(JSON.parse(chamadas.find((c) => c.k.startsWith('POST')).opts.body)).toEqual({ justificativa: 'Janela de manutenção', ate: el('des-ate').max });
    });

    describe('Criar ação corretiva', () => {
        const ROTA = `POST ${B}/desvios/d1/acao`;
        it('só no desvio aberto e para quem edita o n.ot', async () => {
            await abrir('desvios');
            expect(el('c').querySelectorAll('[data-action="otCriarAcaoDesvio"]')).toHaveLength(1); // d2 está tratado
            S.user.role = 'org_user';
            await abrir('desvios');
            expect(el('c').querySelector('[data-action="otCriarAcaoDesvio"]')).toBeNull();
        });
        it('segue o servidor (GET /ot/permissoes): admin direto Gestor vê Aceitar; sem o n.iso no projeto, não vê Criar ação corretiva', async () => {
            S.user = { id: 'u1', role: 'consultoria_admin' };
            S.otPermissoes = { projeto: 'p9', gestor: true, editar: true, aprovar_lote: true, acao_corretiva: false, leitor: false };
            await abrir('desvios');
            const linha = el('c').querySelector('[data-action="otAceitarDesvio"]')?.closest('tr');
            expect(linha?.textContent).toContain('Aceitar temporariamente');
            expect(el('c').querySelector('[data-action="otCriarAcaoDesvio"]')).toBeNull();
            expect(el('c').querySelector('[data-action="otTratarDesvio"]')).not.toBeNull();
        });
        it('formulário com ajuda, envia título, responsável e prazo; sucesso mostra Ação criada com o link', async () => {
            await abrir('desvios', { [ROTA]: [201, { ok: true, acao_id: 'a77', ja_existia: false }] });
            window.otCriarAcaoDesvio('d1');
            expect(el('modal-content').textContent).toContain('Não use IP, e-mail nem o nome de ativos');
            await window.otSalvarAcaoDesvio('d1');
            expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
            el('des-acao-titulo').value = ' Revisar regra '; el('des-acao-resp').value = 'Ana'; el('des-acao-prazo').value = emDiasSP(5);
            await window.otSalvarAcaoDesvio('d1');
            expect(JSON.parse(chamadas.find((c) => c.k === ROTA).opts.body)).toEqual({ titulo: 'Revisar regra', assigned_to: 'Ana', prazo: emDiasSP(5) });
            expect(el('modal-content').textContent).toContain('Ação criada');
            expect(JSON.parse(el('modal-content').querySelector('[data-action="otAbrirAcaoCriada"]').getAttribute('data-args'))).toEqual(['a77']);
        });
        it('Ver a ação só abre o detalhe depois de ler a lista (carga lenta) e nunca com registro vazio', async () => {
            const { navigate } = await import('../src/router.js');
            let solta; const lenta = new Promise((r) => { solta = r; });
            await abrir('desvios', { [`GET ${B.replace('/ot', '')}/capa`]: [200, []] });
            window.openCAPADetailsModal = vi.fn();
            vi.stubGlobal('fetch', vi.fn(async () => { await lenta; return resposta([{ id: 'a77', title: 'X' }]); }));
            const p = window.otAbrirAcaoCriada('a77');
            await pausa(); await pausa();
            expect(window.openCAPADetailsModal).not.toHaveBeenCalled();
            solta(); await p;
            expect(S.capa.map((x) => x.id)).toEqual(['a77']);
            expect(window.openCAPADetailsModal).toHaveBeenCalledWith('a77');
            expect(navigate).toHaveBeenCalledWith('capa');
            // ação que a lista não traz: não abre
            window.openCAPADetailsModal.mockClear();
            vi.stubGlobal('fetch', vi.fn(async () => resposta([])));
            await window.otAbrirAcaoCriada('zzz');
            expect(window.openCAPADetailsModal).not.toHaveBeenCalled();
        });
        it('200 ja_existia também é sucesso', async () => {
            await abrir('desvios', { [ROTA]: [200, { ok: true, acao_id: 'a1', ja_existia: true }] });
            window.otCriarAcaoDesvio('d1');
            el('des-acao-titulo').value = 'Revisar regra'; el('des-acao-resp').value = 'Ana';
            await window.otSalvarAcaoDesvio('d1');
            expect(el('modal-content').textContent).toContain('Ação criada');
        });
        it.each([[409, 'Habilite o n.iso no projeto para criar ações corretivas.'], [400, 'Título cita dado sensível'], [403, 'Forbidden: sem permissão']])('%i mostra a mensagem do servidor', async (st, msg) => {
            await abrir('desvios', { [ROTA]: [st, { error: msg }] });
            window.otCriarAcaoDesvio('d1');
            el('des-acao-titulo').value = 'Revisar regra'; el('des-acao-resp').value = 'Ana';
            await window.otSalvarAcaoDesvio('d1');
            expect(el('des-acao-erro').textContent).toContain(msg.replace(/^Forbidden: /, ''));
            expect(el('modal-content').textContent).not.toContain('Ação criada');
        });
    });

    it('Ver achado leva à aba Levantamento', async () => {
        await abrir('desvios');
        const botao = el('c').querySelector('[data-action="otVerAchadoDesvio"]');
        await window.otVerAchadoDesvio(...JSON.parse(botao.getAttribute('data-args')));
        expect([S.otTela, S.otSub]).toEqual(['site', 'levantar']);
        expect(S.otLevantamento).toBe('lv7');
    });

    describe('Regularizar', () => {
        const sem = { id: 'd3', site_id: 's1', site_nome: 'SE Norte', tipo: 'ativo', situacao: 'aberto', origem: { ativo: 'X' }, ocorrencias: 1, achado_id: null };
        const sim = async () => { await vi.waitFor(() => expect(document.querySelector('[data-confirmar="sim"]')).not.toBeNull()); document.querySelector('[data-confirmar="sim"]').click(); };
        it('com achado: confirma, envia o achado e abre o lote; sem achado: só a dica', async () => {
            await abrir('desvios', { [`GET ${B}/desvios`]: { desvios: [...DESVIOS.desvios, sem] }, [`POST ${B}/sites/s1/enviar`]: { id: 'l5' } });
            const bs = el('c').querySelectorAll('[data-action="otRegularizarDesvio"]');
            expect(bs).toHaveLength(1);
            expect(bs[0].classList.contains('btn-primary')).toBe(false);
            expect(el('c').textContent).toContain('Sem achado ligado: registre num levantamento pontual.');
            window.otIrParaLote = vi.fn();
            const p = window.otRegularizarDesvio(...JSON.parse(bs[0].getAttribute('data-args')));
            await sim(); await p;
            expect(JSON.parse(chamadas.find((c) => c.k === `POST ${B}/sites/s1/enviar`).opts.body)).toEqual({ achados: ['a1'] });
            expect(window.otIrParaLote).toHaveBeenCalledWith('s1', 'l5');
        });
        it('técnico e cliente não veem o botão', async () => {
            for (const role of ['org_user', 'client']) { S.user.role = role; await abrir('desvios'); expect(el('c').querySelector('[data-action="otRegularizarDesvio"]')).toBeNull(); }
        });
        it('cancelar a confirmação não envia nada', async () => {
            await abrir('desvios');
            const p = window.otRegularizarDesvio('s1', 'a1');
            await vi.waitFor(() => expect(document.querySelector('[data-confirmar="nao"]')).not.toBeNull());
            document.querySelector('[data-confirmar="nao"]').click(); await p;
            expect(chamadas.some((c) => c.k.startsWith('POST'))).toBe(false);
        });
        it('409: toast e redesenho', async () => {
            await abrir('desvios', { [`POST ${B}/sites/s1/enviar`]: [409, { error: 'Achado já em lote' }] });
            const p = window.otRegularizarDesvio('s1', 'a1');
            await sim(); await p;
            expect(document.body.textContent).toContain('Achado já em lote');
            expect(window.render).toHaveBeenCalled();
        });
    });
});

describe('cartão Achados da sonda para revisar', () => {
    it('mantém a linha de desvios mesmo se só os pontos falharem', async () => {
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: { levantamentos: [] }, [`GET ${B}/sites/s1/sensores`]: { sensores: [{ id: 'z1', nome: 'S', saude: 'em_dia', ultimo_envio: new Date().toISOString(), credenciais: [] }] },
            [`GET ${B}/sensores/pontos`]: [500, { error: 'x' }] });
        await vi.waitFor(() => expect(el('ot-cartoes-coleta')).not.toBeNull());
        expect(el('ot-cartoes-coleta').textContent).toContain('2 desvios abertos');
    });

    it('ganha a linha "N desvios abertos"', async () => {
        await abrir('levantamento', { [`GET ${B}/levantamentos`]: { levantamentos: [] }, [`GET ${B}/sites/s1/sensores`]: { sensores: [{ id: 'z1', nome: 'S', saude: 'em_dia', ultimo_envio: new Date().toISOString(), credenciais: [] }] },
            [`GET ${B}/sensores/pontos`]: { ativos: 1, fluxos: 2 } });
        await vi.waitFor(() => expect(el('ot-cartoes-coleta')).not.toBeNull());
        expect(el('ot-cartoes-coleta').textContent).toContain('2 desvios abertos');
        // contagem pelo modo só-número: a lista completa (que decifra e grava ver_sensivel) não é pedida
        expect(chamadas.filter((c) => c.k === `GET ${B}/desvios`).every((c) => c.q === '?situacao=aberto&contagem=1')).toBe(true);
    });
});
