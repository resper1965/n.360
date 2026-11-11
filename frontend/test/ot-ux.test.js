// n.ot, correções da crítica de UX de 01/11/2026 (.impeccable/critique/2026-11-01T15-16-59Z__frontend-src-views-ot-js.md):
// notas que não se perdem (P0), sessão que conduz a entrevista, entrada com próximo passo e confirmações com o conteúdo (P1).
// api() REAL; só o fetch é dublado, com os corpos de src/routes/ot.ts (mesmo arranque de ot-levantamento.test.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { desenhar } from './ot-abrir.js';
import { montarDesvios } from '../src/views/ot-desvios.js';

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
const redesenhar = () => desenhar();
async function abrir(aba) { await desenhar(aba); }
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
    S.otProjeto = 'p1'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null;
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
        const ordem = [...m.querySelectorAll('textarea, input, select')].map((x) => x.id || x.name);
        // L2: entre a evidência e o nome, a escolha Ativo | Fluxo (Ativo marcado).
        expect(ordem.slice(0, 4)).toEqual(['lev-evidencia', 'ach-entidade', 'ach-entidade', 'ot-f-nome']);
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
    const BASE = { ...SITES, [`GET ${B}/zonas`]: { zonas: [] }, [`GET ${B}/ativos`]: { ativos: [] } };

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

    it('enviar para aprovação fica desabilitado até marcar um achado e confirma com a contagem e os nomes', async () => {
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

describe('rodada de correção 1: notas em fila, por sessão e por projeto', () => {
    // fetch com PUT de notas que só responde quando o teste manda (gravações sobrepostas).
    function servirComPutPendente(extra = {}) {
        const pendentes = [];
        let noAr = 0; let maxNoAr = 0;
        const base = { [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados: [] }, [`GET ${B}/roteiro`]: ROTEIRO, ...extra };
        chamadas = [];
        vi.stubGlobal('fetch', vi.fn((url, opts = {}) => {
            const u = new URL(url, 'http://localhost');
            const k = `${opts.method || 'GET'} ${u.pathname}`;
            chamadas.push({ k, url: u, opts });
            if (k === `PUT ${B}/levantamentos/l1`) {
                noAr++; maxNoAr = Math.max(maxNoAr, noAr);
                return new Promise((ok) => pendentes.push(() => { noAr--; ok(resposta({ ok: true })); }));
            }
            return Promise.resolve(k in base ? resposta(base[k]) : resposta({ error: `API route not found: ${k}` }, 404));
        }));
        return { pendentes, max: () => maxNoAr };
    }

    it('três gravações sobrepostas saem uma de cada vez, e a última levada é o texto mais novo', async () => {
        await sessao([]);
        const f = servirComPutPendente();
        digitar('a');
        const g1 = window.otSalvarNotas();
        await pausa();
        digitar('ab');
        const g2 = window.otSalvarNotas();
        digitar('abc');
        const g3 = window.otSalvarNotas();
        for (let i = 0; i < 5; i++) { await pausa(); f.pendentes.splice(0).forEach((r) => r()); }
        await Promise.all([g1, g2, g3]);
        const enviados = puts().map((b) => b.notas);
        expect(enviados.at(-1)).toBe('abc');
        expect(f.max()).toBe(1);
        expect(el('lev-notas-status').textContent).toMatch(/^Salvo às/);
    });

    it('trocar de projeto com notas pendentes grava no projeto em que foram digitadas', async () => {
        await sessao([]);
        digitar('nota do projeto p1');
        S.activeProject = { id: 'p2', modulos: ['ot'] };
        servirOt({ [`PUT ${B}/levantamentos/l1`]: { ok: true } });
        await window.renderOt(el('c'), el('h'), el('a')); // a casca vê o projeto novo
        expect(chamadas.filter((x) => x.k.startsWith('PUT')).map((x) => x.k)).toEqual([`PUT ${B}/levantamentos/l1`]);
        expect(puts()).toEqual([{ notas: 'nota do projeto p1' }]);
    });

    it('o tempo de espera que vence depois da troca de projeto ainda grava no projeto de origem', async () => {
        await sessao([]);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        digitar('digitada em p1');
        S.activeProject = { id: 'p2', modulos: ['ot'] };
        await vi.advanceTimersByTimeAsync(1600);
        expect(chamadas.filter((x) => x.k.startsWith('PUT')).map((x) => x.k)).toEqual([`PUT ${B}/levantamentos/l1`]);
    });

    it('texto recusado (400) não é reenviado sem mudar, e fica com a sessão dele ao abrir outra e voltar', async () => {
        const L2 = { ...LEV, id: 'l2', notas: 'notas da l2' };
        const recusa = [400, { error: 'Payload inválido', details: [{ path: 'notas', message: 'Não informe IP nem MAC em campo de texto livre' }] }];
        await sessao([], { [`GET ${B}/levantamentos/l2`]: { levantamento: L2, achados: [] } }, { [`PUT ${B}/levantamentos/l1`]: recusa });
        digitar('IHM em 10.0.0.1');
        await window.otSalvarNotas();
        expect(el('lev-notas-status').textContent).toBe('Não informe IP nem MAC em campo de texto livre. O texto continua aqui: corrija e saia do campo.');
        await redesenhar();
        await window.otSalvarNotas();
        expect(puts()).toHaveLength(1);
        S.otLevantamento = 'l2';
        await redesenhar();
        expect(el('lev-notas').value).toBe('notas da l2');
        S.otLevantamento = 'l1';
        await redesenhar();
        expect(el('lev-notas').value).toBe('IHM em 10.0.0.1');
        expect(el('lev-notas-status').textContent).toContain('Não informe IP nem MAC');
        expect(puts()).toHaveLength(1);
    });

    it('fechar a página com notas pendentes manda o PUT com keepalive e o cabeçalho de autenticação', async () => {
        await sessao([]);
        digitar('nota antes de fechar');
        window.dispatchEvent(new Event('pagehide'));
        const put = chamadas.find((x) => x.k === `PUT ${B}/levantamentos/l1`);
        expect(put.opts.keepalive).toBe(true);
        expect(put.opts.headers.Authorization).toBe('Bearer tok');
        expect(JSON.parse(put.opts.body)).toEqual({ notas: 'nota antes de fechar' });
        await window.otSalvarNotas(); // esvazia para o próximo teste
    });

    it('fechar a página: os corpos com keepalive somam no máximo 64 KB; o que não cabe não é mandado', async () => {
        const L2 = { ...LEV, id: 'l2', notas: '' };
        const PUT1 = `PUT ${B}/levantamentos/l1`, PUT2 = `PUT ${B}/levantamentos/l2`;
        await sessao([], { [`GET ${B}/levantamentos/l2`]: { levantamento: L2, achados: [] } }, { [PUT1]: [500, { error: 'x' }], [PUT2]: [500, { error: 'x' }] });
        digitar('a'.repeat(40000));
        S.otLevantamento = 'l2';
        await redesenhar(); // a l1 falhou e segue pendente
        digitar('b'.repeat(40000));
        chamadas.length = 0;
        window.dispatchEvent(new Event('pagehide'));
        const vivos = chamadas.filter((x) => x.opts.keepalive);
        expect(vivos).toHaveLength(1);
        expect(vivos.reduce((n, x) => n + new TextEncoder().encode(x.opts.body).length, 0)).toBeLessThanOrEqual(64 * 1024);
        servirOt({ [PUT1]: { ok: true }, [PUT2]: { ok: true }, [`GET ${B}/levantamentos/l2`]: { levantamento: L2, achados: [] }, [`GET ${B}/roteiro`]: ROTEIRO });
        await window.otSalvarNotas(); // esvazia para o próximo teste
    });
});

describe('E1 T6: saídas diretas no lugar de texto sem link', () => {
    const ACESSOS = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }] }, [`GET ${B}/acessos`]: { acessos: [] }, 'GET /api/v1/users': [] };
    const abrirModal = async (usersVisivel) => {
        document.body.insertAdjacentHTML('beforeend', `<a id="nav-users" style="display:${usersVisivel ? '' : 'none'}"></a>`);
        servirOt(ACESSOS);
        await abrir('acessos');
        window.otNovoAcesso();
    };
    afterEach(() => document.getElementById('nav-users')?.remove());

    it('modal sem técnico: link para Usuários quando nav-users está visível', async () => {
        await abrirModal(true);
        expect(document.querySelector('#modal-content a.btn[href$="?tela=users"]')).not.toBeNull();
    });
    it('modal sem técnico: sem o link quando nav-users está escondido', async () => {
        await abrirModal(false);
        expect(document.querySelector('#modal-content a[href$="?tela=users"]')).toBeNull();
        expect(el('modal-content').textContent).toContain('tela Usuários');
    });
    it('Fluxos sem site: botão Cadastrar site leva à tela de sites', async () => {
        servirOt({ ...SITES, [`GET ${B}/sites`]: { sites: [] }, [`GET ${B}/zonas`]: { zonas: [] }, [`GET ${B}/ativos`]: { ativos: [] }, [`GET ${B}/fluxos`]: { fluxos: [] } });
        await abrir('fluxos');
        const b = document.querySelector('#c button.btn[data-action="otTela"]');
        expect(b.textContent).toBe('Cadastrar site');
        expect(JSON.parse(b.dataset.args)).toEqual(['sites']);
    });
    it('Assessment: linha da governança com link só quando o hub abre a tela', async () => {
        const REQ = { [`GET ${B}/requisitos`]: { requisitos: [{ codigo: '4.2.1', titulo: 'x', prazo_meses: 3 }] } };
        servirOt(REQ); S.activeProject = { id: 'p1', modulos: ['ot'] };
        await abrir('catalogo');
        expect(el('c').textContent).toContain('4.2.1');
        expect(document.querySelector('#c a[href$="?tela=governance"]')).toBeNull();
        S.activeProject = { id: 'p1', modulos: ['ot', 'iso'] };
        await abrir('catalogo');
        expect(document.querySelector('#c a[href$="?tela=governance"]')).not.toBeNull();
    });
    const desvios = async (sensores, falha) => {
        servirOt({ [`GET ${B}/sites`]: { sites: [] }, [`GET ${B}/desvios`]: { desvios: [] }, [`GET ${B}/sites/s1/sensores`]: { sensores } },
            falha ? { [`GET ${B}/sites/s1/sensores`]: [500, { error: 'x' }] } : {});
        S.user = { id: 'u', role: 'consultor' };
        await montarDesvios(el('c'), el('a'), S.activeProject, { siteFixo: 's1' });
    };
    beforeEach(() => { S.otDesvioFiltro = null; });
    it('Desvios vazio sem sonda: aviso e botão para Acessos', async () => {
        await desvios([]);
        expect(el('c').textContent).toContain('Sem vigilância de rede neste site');
        expect(JSON.parse(document.querySelector('#c button[data-action="otTela"]').dataset.args)).toEqual(['acessos']);
    });
    it('Desvios vazio com sonda ou com falha: texto neutro', async () => {
        await desvios([{ id: 'k1' }]);
        expect(el('c').textContent).toContain('Nenhum desvio aberto');
        await desvios([], true);
        expect(el('c').textContent).toContain('Nenhum desvio aberto');
        expect(el('c').textContent).not.toContain('Sem vigilância');
    });
    it('Desvios vazio com filtro diferente de aberto: "neste recorte" e sem chamar sensores', async () => {
        S.otDesvioFiltro = { situacao: 'tratado', site_id: '', tipo: '' };
        await desvios([]);
        expect(el('c').textContent).toContain('Nenhum desvio neste recorte.');
        expect(chamadas.some((x) => x.k.endsWith('/sensores'))).toBe(false);
        S.otDesvioFiltro = null;
    });
});
