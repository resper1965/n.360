// n.ot, correções da crítica de UX de 01/11/2026 (.impeccable/critique/2026-11-01T15-16-59Z__frontend-src-views-ot-js.md):
// notas que não se perdem (P0), sessão que conduz a entrevista, entrada com próximo passo e confirmações com o conteúdo (P1).
// api() REAL; só o fetch é dublado, com os corpos de src/routes/ot.ts (mesmo arranque de ot-levantamento.test.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';

const B = '/api/v1/projects/p1/ot';
const el = (id) => document.getElementById(id);
const texto = () => el('c').textContent + el('a').textContent;
const pausa = () => new Promise((r) => setTimeout(r, 0));

const LEV = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer',
    roteiro: { 'rot-02': { resposta: 'nao' } }, situacao: 'aberto', achados: 1 };
const ROTEIRO = { perguntas: [
    { id: 'rot-01', ordem: 1, texto: 'Algum equipamento desta sala é acessado de fora da empresa?', item_norma: '4.1.3', entidade_esperada: 'fluxo', tipos_sessao: ['entrevista'] },
    { id: 'rot-02', ordem: 2, texto: 'Como é feita a troca de turno?', item_norma: '4.3.1', entidade_esperada: null, tipos_sessao: ['entrevista'] }] };
const ACH = (extra = {}) => ({ id: 'a1', levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null,
    evidencia: 'notebook pessoal na IHM', erros: [], dados: { nome: 'Notebook IHM', ip: '•••', mascarado: true }, ...extra });
const SITES = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte 230 kV' }] } };

let chamadas;
function servirOt(rotas, falhas = {}) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u, opts });
        if (k in falhas) return resposta(falhas[k][1], falhas[k][0]);
        return k in rotas ? resposta(typeof rotas[k] === 'function' ? rotas[k](u, opts) : rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
}
const redesenhar = () => window.renderOt(el('c'), el('h'), el('a'));
async function abrir(aba) { S.otAba = aba; await redesenhar(); }
const puts = () => chamadas.filter((x) => x.k === `PUT ${B}/levantamentos/l1`).map((x) => JSON.parse(x.opts.body));
const sessao = async (achados = [ACH()], extra = {}, falhas = {}) => {
    servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados }, [`GET ${B}/roteiro`]: ROTEIRO, [`PUT ${B}/levantamentos/l1`]: { ok: true },
        [`GET ${B}/zonas`]: { zonas: [] }, ...extra }, falhas);
    S.otLevantamento = 'l1';
    await abrir('levantamento');
};
const digitar = (t) => { el('lev-notas').value = t; el('lev-notas').dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['ot'] };
    S.otProjeto = 'p1'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null; S.otAba = null;
    // O render de verdade redesenha a tela a partir da API: é ele que apagava as notas.
    window.render = vi.fn(() => redesenhar());
    const { initDelegation } = await import('../src/delegation.js');
    initDelegation();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.querySelectorAll('.confirmar').forEach((x) => x.remove()); });

describe('P0: notas da sessão nunca se perdem', () => {
    it('salvam sozinhas depois de 1,5 s sem digitar, com "Salvo às HH:MM" num role="status"', async () => {
        await sessao();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        digitar('rádio 4G no painel');
        await vi.advanceTimersByTimeAsync(1000);
        expect(puts()).toEqual([]);
        await vi.advanceTimersByTimeAsync(600);
        expect(puts()).toEqual([{ notas: 'rádio 4G no painel' }]);
        const st = el('lev-notas-status');
        expect(st.getAttribute('role')).toBe('status');
        expect(st.textContent).toMatch(/^Salvo às \d{2}:\d{2}$/);
    });

    it('salvam ao sair do campo', async () => {
        await sessao();
        digitar('nota ao sair');
        el('lev-notas').dispatchEvent(new Event('blur'));
        await pausa(); await pausa();
        expect(puts()).toEqual([{ notas: 'nota ao sair' }]);
    });

    it('responder o roteiro grava antes as notas pendentes, e o redesenho não apaga o texto', async () => {
        await sessao();
        digitar('texto digitado e não salvo');
        await window.otResponderRoteiro('rot-02', 'sim');
        await pausa();
        expect(puts()[0]).toEqual({ notas: 'texto digitado e não salvo' });
        expect(puts()[1]).toHaveProperty('roteiro');
        // O GET devolve as notas antigas (dublê fixo), mas a tela guarda o que a pessoa escreveu.
        expect(el('lev-notas').value).toBe('texto digitado e não salvo');
    });

    it('servidor recusa (400, IP ou PII): a mensagem aparece no status e o texto fica, mesmo depois de registrar um achado', async () => {
        await sessao([ACH()], { [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] } },
            { [`PUT ${B}/levantamentos/l1`]: [400, { error: 'Payload inválido', details: [{ path: 'notas', message: 'Não informe IP nem MAC em campo de texto livre' }] }] });
        digitar('IHM em 10.0.0.1');
        el('lev-notas').dispatchEvent(new Event('blur'));
        await pausa(); await pausa();
        expect(el('lev-notas-status').textContent).toContain('Não informe IP nem MAC');
        await window.otNovoAchado();
        el('lev-evidencia').value = 'visto no rack';
        el('ot-f-nome').value = 'Switch';
        await window.otSalvarAchado();
        await pausa();
        expect(el('lev-notas').value).toBe('IHM em 10.0.0.1');
        expect(el('lev-notas-status').textContent).toContain('Não informe IP nem MAC');
    });

    it('falha de rede: "Não foi possível salvar. Tente de novo." com o botão de tentar, que grava', async () => {
        await sessao([], {}, { [`PUT ${B}/levantamentos/l1`]: [503, { error: 'Service Unavailable' }] });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        digitar('nota');
        el('lev-notas').dispatchEvent(new Event('blur'));
        await pausa(); await pausa();
        expect(el('lev-notas-status').textContent).toBe('Não foi possível salvar. Tente de novo.');
        const tentar = el('c').querySelector('[data-action="otSalvarNotas"]');
        expect(tentar.textContent).toBe('Tentar de novo');
        servirOt({ [`PUT ${B}/levantamentos/l1`]: { ok: true } });
        await window.otSalvarNotas();
        expect(puts()).toEqual([{ notas: 'nota' }]);
        expect(el('lev-notas-status').textContent).toMatch(/^Salvo às/);
    });
});

describe('P1a: a sessão conduz a entrevista', () => {
    it('a resposta escolhida fica marcada (aria-pressed) e há estilo para isso que não é só cor', async () => {
        await sessao();
        const marcado = el('c').querySelector('[data-action="otResponderRoteiro"][aria-pressed="true"]');
        expect(marcado.textContent).toBe('Não');
        const css = Object.values(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }))[0];
        const regra = css.match(/\.ot-resposta\s+\.btn\[aria-pressed="true"\]\s*\{([^}]*)\}/);
        expect(regra, 'regra .ot-resposta .btn[aria-pressed="true"]').toBeTruthy();
        expect(regra[1]).toMatch(/border|font-weight/);
    });

    it('"Sim" numa pergunta que espera um achado abre o registro com a pergunta na evidência; "Não" não abre', async () => {
        await sessao();
        await window.otResponderRoteiro('rot-01', 'nao');
        expect(el('lev-evidencia')).toBeNull();
        await window.otResponderRoteiro('rot-02', 'sim');
        expect(el('lev-evidencia')).toBeNull();
        await window.otResponderRoteiro('rot-01', 'sim');
        expect(el('lev-evidencia').value).toContain('Algum equipamento desta sala é acessado de fora da empresa?');
    });

    it('o achado pede evidência e nome primeiro; o resto do 4.3.1 fica em "Detalhes do ativo (opcional)"', async () => {
        await sessao();
        await window.otNovoAchado();
        const m = el('modal-content');
        const ordem = [...m.querySelectorAll('textarea, input, select')].map((x) => x.id);
        expect(ordem.slice(0, 2)).toEqual(['lev-evidencia', 'ot-f-nome']);
        const det = m.querySelector('details');
        expect(det.querySelector('summary').textContent).toBe('Detalhes do ativo (opcional)');
        expect(det.querySelector('#ot-f-categoria')).toBeTruthy();
        expect(det.querySelector('#ot-f-ip')).toBeTruthy();
        expect(det.querySelector('#ot-f-nome')).toBeNull();
    });

    it('avisos do achado e erros do lote com o rótulo do campo, nunca a chave', async () => {
        await sessao([ACH({ erros: [{ campo: 'categoria_arciber', motivo: 'falta' }, { campo: 'protocolos_portas', motivo: 'valor inválido' }] })]);
        expect(texto()).toContain('Categoria ARCiber: falta');
        expect(texto()).toContain('Protocolos e portas: valor inválido');
        expect(texto()).not.toMatch(/categoria_arciber|protocolos_portas/);
    });
});

describe('P1b: entrada com próximo passo', () => {
    const LOTES = (xs) => ({ [`GET ${B}/lotes`]: { lotes: xs } });
    const lote = (id, status, criado_por = 'u-tec') => ({ id, site_id: 's1', fonte: 'planilha', status, criado_por, created_at: '2026-10-30 10:00:00', itens: 1, com_erro: 0, gravados: 0 });
    const abas = () => [...el('c').querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    const ativa = () => el('c').querySelector('[role="tab"][aria-selected="true"]').textContent.trim();
    const BASE = { ...SITES, [`GET ${B}/zonas`]: { zonas: [] }, [`GET ${B}/ativos`]: { ativos: [] } };

    it('as abas mostram quantos lotes esperam revisão e quantos levantamentos estão abertos', async () => {
        servirOt({ ...BASE, ...LOTES([lote('x1', 'em_revisao'), lote('x2', 'em_revisao'), lote('x3', 'concluido')]),
            [`GET ${B}/levantamentos`]: { levantamentos: [LEV, { ...LEV, id: 'l2', situacao: 'encerrado' }] } });
        await abrir('inventario');
        expect(abas()).toContain('Coleta · 2 em revisão');
        expect(abas()).toContain('Levantamento · 1 aberto');
    });

    it('sem aba escolhida: quem aprova e tem lote de outra pessoa em revisão cai na Coleta; senão no Inventário', async () => {
        servirOt({ ...BASE, ...LOTES([lote('x1', 'em_revisao')]), [`GET ${B}/levantamentos`]: { levantamentos: [] } });
        S.otAba = null;
        await redesenhar();
        expect(ativa()).toMatch(/^Coleta/);
        S.otAba = null;
        S.user = { id: 'u-tec', role: 'org_user' };
        await redesenhar();
        expect(ativa()).toBe('Inventário');
        S.otAba = null;
        S.user = { id: 'u-tec', role: 'org_admin' };
        await redesenhar();
        expect(ativa()).toBe('Inventário');
        S.user = { id: 'u-consultor', role: 'consultor' };
        window.otAba('saidas');
        await pausa();
        expect(ativa()).toBe('Saídas');
    });

    it('inventário vazio: o vazio traz a ação "Cadastrar o primeiro site", única principal da tela', async () => {
        servirOt({ ...BASE, [`GET ${B}/sites`]: { sites: [] } });
        await abrir('inventario');
        const prim = [...document.querySelectorAll('#a .btn-primary, #c .btn-primary')];
        expect(prim.map((b) => b.textContent)).toEqual(['Cadastrar o primeiro site']);
        expect(prim[0].closest('.empty-state')).toBeTruthy();
        expect(prim[0].getAttribute('data-action')).toBe('otNovoSite');
    });
});

describe('P1c: confirmações de alto risco com o conteúdo', () => {
    const LOTE = { id: 'x1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', motivo: null, created_at: '2026-10-30 10:00:00' };
    const ITEM = (id, linha, extra = {}) => ({ id, linha, decisao: 'pendente', motivo: null, erros: [], possivel_duplicata: false, duplicata_de: null,
        dados: { nome: `Item ${linha}`, ip: '10.0.0.5', mascarado: false }, ...extra });
    const ITENS = [ITEM('i1', 2, { possivel_duplicata: true, duplicata_de: 'a1' }), ITEM('i2', 3, { erros: [{ campo: 'mac', motivo: 'MAC inválido' }] }), ITEM('i3', 4), ITEM('i4', 5)];
    const coleta = (itens = ITENS) => ({ ...SITES, [`GET ${B}/lotes`]: { lotes: [] }, [`GET ${B}/lotes/x1`]: { lote: LOTE, itens } });

    it('aprovar diz quantos entram como novos, quantos mesclam e quantos são recusados', async () => {
        servirOt(coleta());
        S.otLote = 'x1';
        await abrir('coleta');
        const p = window.otAprovarLote('x1');
        await pausa();
        expect(document.querySelector('.confirmar-texto').textContent).toContain('4 itens: 2 entram como novos, 1 mescla em ativo existente, 1 recusado por erro');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
    });

    it('sem a duplicata (quem não vê completo), a contagem é sem erro e com erro', async () => {
        const semDup = ITENS.map(({ possivel_duplicata: _p, duplicata_de: _d, ...i }) => i);
        servirOt(coleta(semDup));
        S.otLote = 'x1';
        await abrir('coleta');
        const p = window.otAprovarLote('x1');
        await pausa();
        expect(document.querySelector('.confirmar-texto').textContent).toContain('4 itens: 3 sem erro, 1 com erro');
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
    });

    it('a duplicata diz de qual ativo, pelo nome já carregado no inventário, ou "ativo existente"', async () => {
        servirOt(coleta());
        S.otLote = 'x1';
        await abrir('coleta');
        expect(texto()).toContain('Possível duplicata de ativo existente');
        servirOt({ ...coleta(), [`GET ${B}/zonas`]: { zonas: [] }, [`GET ${B}/ativos`]: { ativos: [{ id: 'a1', site_id: 's1', nome: 'RTU-01', ip: '•••', mac: null }] } });
        await abrir('inventario');
        S.otLote = 'x1';
        await abrir('coleta');
        expect(texto()).toContain('Possível duplicata de RTU-01');
        await sessao([ACH({ confronto: 'confirma', alvo_id: 'a1' })]);
        expect(texto()).toContain('Confirma RTU-01');
    });

    it('a justificativa da exportação nomeia o site e o formato e diz que IP/MAC seguem o papel', async () => {
        servirOt({ ...SITES, [`GET ${B}/indicadores`]: {}, [`GET ${B}/conformidade`]: {} });
        await abrir('saidas');
        el('ot-exp-site').value = 's1';
        const p = window.otExportar('csv');
        await pausa();
        expect(document.querySelector('.confirmar-titulo').textContent).toBe('Exportar SE Norte 230 kV (CSV)');
        expect(document.querySelector('.confirmar-texto').textContent).toMatch(/IP e MAC.*seu papel/);
        document.querySelector('[data-confirmar="nao"]').click();
        await p;
    });

    it('enviar ao lote fica desabilitado até marcar um achado e confirma com a contagem e os nomes', async () => {
        await sessao([ACH(), ACH({ id: 'a2', dados: { nome: 'Switch rack 2' } })], { [`POST ${B}/levantamentos/l1/enviar`]: { id: 'lote-9', itens: 2, com_erro: 0, status: 'em_revisao' } });
        const botao = el('a').querySelector('[data-action="otEnviarAchados"]');
        expect(botao.disabled).toBe(true);
        expect(el('lev-envio-dica').textContent).toContain('Marque');
        expect(botao.getAttribute('aria-describedby')).toBe('lev-envio-dica');
        for (const id of ['ach-sel-a1', 'ach-sel-a2']) { el(id).checked = true; el(id).dispatchEvent(new Event('change', { bubbles: true })); }
        expect(botao.disabled).toBe(false);
        const p = window.otEnviarAchados();
        await pausa();
        const t = document.querySelector('.confirmar-texto').textContent;
        expect(t).toContain('2 achados');
        expect(t).toContain('Notebook IHM');
        expect(t).toContain('Switch rack 2');
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/levantamentos/l1/enviar`).opts.body)).toEqual({ achados: ['a1', 'a2'] });
    });
});
