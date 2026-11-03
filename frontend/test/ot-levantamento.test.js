// n.ot, L1 (descoberta operacional): a aba Levantamento sobre as rotas reais /roteiro e /levantamentos* de src/routes/ot.ts.
// api() REAL; só o fetch é dublado (mesmo arranque de ot-abas.test.js), com os corpos que os handlers devolvem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';

const B = '/api/v1/projects/p1/ot';
const el = (id) => document.getElementById(id);
const texto = () => el('c').textContent + el('a').textContent;

const LEV = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: 'usa TeamViewer',
    roteiro: { 'rot-01': { resposta: 'sim', nota: 'via 4G' } }, situacao: 'aberto', achados: 1 };
const ROTEIRO = { perguntas: [
    { id: 'rot-01', ordem: 1, texto: 'Algum equipamento desta sala é acessado de fora da empresa?', item_norma: '4.1.3', entidade_esperada: 'fluxo', tipos_sessao: ['entrevista', 'visita'] },
    { id: 'rot-09', ordem: 9, texto: 'Pergunta só de documento', item_norma: '4.3.1', entidade_esperada: 'ativo', tipos_sessao: ['documento'] }] };
const ACH = (extra = {}) => ({ id: 'a1', levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null,
    evidencia: 'notebook pessoal na IHM <b id="xss">x</b>', erros: [], dados: { nome: 'Notebook IHM', ip: '•••', mascarado: true }, ...extra });
const SITES = { [`GET ${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] } };

let chamadas;
function servirOt(rotas) {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u, opts });
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
}
async function abrir(aba) {
    S.otAba = aba;
    await window.renderOt(el('c'), el('h'), el('a'));
}
const detalhe = async (achados = [ACH()], extra = {}) => {
    servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados }, [`GET ${B}/roteiro`]: ROTEIRO, ...extra });
    window.otAbrirLevantamento('l1');
    await abrir('levantamento');
};
const corpo = (k) => JSON.parse(chamadas.find((x) => x.k === k).opts.body);

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-consultor', role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['ot'] };
    S.otProjeto = 'p1'; S.otSite = null; S.otZona = null; S.otLote = null; S.otLevantamento = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('aba Levantamento', () => {
    it('lista as sessões com tipo, função e turno, sem nome de pessoa', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        expect(texto()).toContain('Entrevista');
        expect(texto()).toContain('Operador · turno B');
        expect(texto()).toContain('SE Norte');
    });

    it('detalhe mostra roteiro do tipo da sessão, achados escapados e confronto só quando a API manda', async () => {
        await detalhe();
        expect(texto()).toContain('acessado de fora da empresa');
        expect(texto()).not.toContain('Pergunta só de documento');
        expect(texto()).toContain('notebook pessoal na IHM');
        expect(el('xss')).toBeNull();
        expect(el('lev-notas').value).toBe('usa TeamViewer');
        expect(texto()).not.toMatch(/Novo no inventário|Confirma ativo/);
        await detalhe([ACH({ confronto: 'novo', alvo_id: null })]);
        expect(texto()).toContain('Novo no inventário');
    });

    it('responder o roteiro manda o objeto inteiro, mantendo a nota; notas vão por PUT', async () => {
        await detalhe([], { [`PUT ${B}/levantamentos/l1`]: { ok: true } });
        await window.otResponderRoteiro('rot-01', 'nao');
        expect(corpo(`PUT ${B}/levantamentos/l1`)).toEqual({ roteiro: { 'rot-01': { resposta: 'nao', nota: 'via 4G' } } });
        el('lev-notas').value = 'nova nota';
        chamadas.length = 0;
        await window.otSalvarNotas();
        expect(corpo(`PUT ${B}/levantamentos/l1`)).toEqual({ notas: 'nova nota' });
    });

    it('enviar ao lote manda só os achados marcados e abre a Coleta no lote criado', async () => {
        await detalhe([ACH(), ACH({ id: 'a2' }), ACH({ id: 'a3', situacao: 'enviado', lote_id: 'x' })],
            { [`POST ${B}/levantamentos/l1/enviar`]: { id: 'lote-9', itens: 1, com_erro: 0, status: 'em_revisao' } });
        expect(el('ach-sel-a3')).toBeNull();
        el('ach-sel-a1').checked = true;
        const p = window.otEnviarAchados();
        await new Promise((r) => setTimeout(r, 0));
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(corpo(`POST ${B}/levantamentos/l1/enviar`)).toEqual({ achados: ['a1'] });
        expect(S.otLote).toBe('lote-9');
        expect(S.otLevantamento).toBeNull();
        expect(S.otAba).toBe('coleta');
    });

    it('registrar achado manda os campos do ativo e a evidência; descartar marca a situação', async () => {
        await detalhe([ACH()], { [`GET ${B}/zonas`]: { zonas: [] }, [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] },
            [`PUT ${B}/levantamentos/l1/achados/a1`]: { ok: true } });
        await window.otNovoAchado();
        el('ot-f-nome').value = 'Switch';
        el('ot-f-ip').value = '10.0.0.1';
        el('lev-evidencia').value = 'visto no rack';
        await window.otSalvarAchado();
        const b = corpo(`POST ${B}/levantamentos/l1/achados`);
        expect(b.evidencia).toBe('visto no rack');
        expect(b.dados).toMatchObject({ nome: 'Switch', ip: '10.0.0.1' });
        await window.otDescartarAchado('a1');
        expect(corpo(`PUT ${B}/levantamentos/l1/achados/a1`)).toEqual({ situacao: 'descartado' });
    });

    // Nomes das pontas vêm de GET /levantamentos/:id (nomes_pontas, ativos_do_site); /ativos nunca é chamado (decifraria IP/MAC).
    const PONTAS = { [`GET ${B}/zonas`]: { zonas: [{ id: 'z1', nome: 'Supervisão', nivel_purdue: 2 }] } };
    const NOMES = { nomes_pontas: { at1: 'CLP 1' }, ativos_do_site: [{ id: 'at1', nome: 'CLP 1' }] };
    const detalheFluxo = (achados, extra) => {
        servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: LEV, achados, ...NOMES }, [`GET ${B}/roteiro`]: ROTEIRO, ...PONTAS, ...extra });
        window.otAbrirLevantamento('l1');
        return abrir('levantamento');
    };
    const FLUXO = (extra = {}) => ACH({ id: 'f1', entidade: 'fluxo', evidencia: 'acesso remoto',
        dados: { origem_ativo_id: 'at1', destino_zona_id: 'zx', protocolo: 'RDP', porta: 3389, externo: true, via_vpn: false }, ...extra });

    it('achado de fluxo: "Sim" numa pergunta de fluxo abre com Fluxo marcado e salvar manda entidade, pontas e pergunta', async () => {
        await detalheFluxo([], { [`PUT ${B}/levantamentos/l1`]: { ok: true }, [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] } });
        await window.otResponderRoteiro('rot-01', 'sim');
        const radios = [...document.querySelectorAll('input[name="ach-entidade"]')];
        expect(radios.map((r) => r.value)).toEqual(['ativo', 'fluxo']);
        expect(radios[1].checked).toBe(true);
        expect(el('lev-ach-fluxo').hidden).toBe(false);
        expect(el('lev-ach-ativo').hidden).toBe(true);
        expect([...el('lev-fx-origem').querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Ativos', 'Zonas']);
        expect(el('lev-fx-origem').textContent).toContain('Fora da empresa');
        el('lev-fx-origem').value = 'a:at1';
        el('lev-fx-destino').value = 'z:z1';
        el('lev-fx-protocolo').value = 'Modbus';
        el('lev-fx-porta').value = '502';
        el('lev-fx-direcao').value = 'bidirecional';
        el('lev-fx-finalidade').value = 'telemetria';
        el('lev-fx-externo').value = 'sim';
        el('lev-fx-vpn').value = 'nao';
        el('lev-evidencia').value = 'relatado';
        await window.otSalvarAchado();
        expect(corpo(`POST ${B}/levantamentos/l1/achados`)).toEqual({ entidade: 'fluxo', pergunta_id: 'rot-01', evidencia: 'relatado',
            dados: { origem_ativo_id: 'at1', destino_zona_id: 'z1', protocolo: 'Modbus', porta: 502, direcao: 'bidirecional', finalidade: 'telemetria', externo: true, via_vpn: false } });
        expect(chamadas.some((x) => x.k === `GET ${B}/ativos`)).toBe(false);
    });

    it('Externo e Via VPN nascem "Não informado" e, sem escolha, não vão ao servidor', async () => {
        await detalheFluxo([], { [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] } });
        await window.otNovoAchado('', null, 'fluxo');
        expect([...el('lev-fx-externo').options].map((o) => o.textContent)).toEqual(['Não informado', 'Sim', 'Não']);
        expect([el('lev-fx-externo').value, el('lev-fx-vpn').value]).toEqual(['', '']);
        el('lev-fx-origem').value = 'a:at1';
        el('lev-fx-destino').value = 'z:z1';
        el('lev-fx-protocolo').value = 'Modbus';
        el('lev-evidencia').value = 'relatado';
        await window.otSalvarAchado();
        const b = corpo(`POST ${B}/levantamentos/l1/achados`);
        expect(b.dados).toEqual({ origem_ativo_id: 'at1', destino_zona_id: 'z1', protocolo: 'Modbus' });
        expect(b.dados).not.toHaveProperty('externo');
        expect(b.dados).not.toHaveProperty('via_vpn');
    });

    it('"Fora da empresa" numa ponta marca externo e não envia a ponta; trocar para Ativo volta aos campos do ativo', async () => {
        await detalheFluxo([], { [`POST ${B}/levantamentos/l1/achados`]: { id: 'a9', erros: [] } });
        await window.otNovoAchado();
        expect(document.querySelector('input[name="ach-entidade"][value="ativo"]').checked).toBe(true);
        expect(el('lev-ach-fluxo').hidden).toBe(true);
        window.otEntidadeAchado('fluxo');
        el('lev-fx-origem').value = 'fora';
        window.otPontaFluxo('fora');
        expect(el('lev-fx-externo').value).toBe('sim');
        el('lev-fx-destino').value = 'a:at1';
        el('lev-evidencia').value = 'VPN do fornecedor';
        await window.otSalvarAchado();
        const b = corpo(`POST ${B}/levantamentos/l1/achados`);
        expect(b.dados).toEqual({ destino_ativo_id: 'at1', externo: true });
        expect(b).not.toHaveProperty('pergunta_id');
    });

    it('tabela mostra Tipo, a rota do fluxo e "Contradiz"; o envio conta ativos e fluxos', async () => {
        await detalheFluxo([ACH({ confronto: 'novo', alvo_id: null }), ACH({ id: 'a2', confronto: 'confirma', alvo_id: 'x' }), FLUXO({ confronto: 'contradiz', alvo_id: 'fl9' })]);
        expect(texto()).toContain('CLP 1 → ponta removida');
        expect(texto()).toContain('Fluxo');
        const c = [...document.querySelectorAll('#c .badge')].find((b) => b.textContent === 'Contradiz');
        expect(c.title).toBe('O inventário registra esse fluxo de outro jeito (externo ou VPN)');
        for (const id of ['a1', 'a2', 'f1']) el(`ach-sel-${id}`).checked = true;
        window.otEnviarAchados();
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('.confirmar').textContent).toContain('2 ativos e 1 fluxo');
    });

    it('novo levantamento de documento manda título, não função e turno', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES, [`POST ${B}/levantamentos`]: { id: 'l2' } });
        await abrir('levantamento');
        window.otNovoLevantamento();
        el('lev-f-tipo').value = 'documento';
        window.otTipoLevantamento('documento');
        expect(el('lev-f-pessoa').hidden).toBe(true);
        el('lev-f-funcao').value = 'Operador';
        el('lev-f-titulo').value = 'Inventário 2023';
        el('lev-f-data').value = '2026-11-01';
        await window.otCriarLevantamento();
        expect(corpo(`POST ${B}/levantamentos`)).toEqual({ site_id: 's1', tipo: 'documento', realizado_em: '2026-11-01', documento_titulo: 'Inventário 2023' });
        expect(S.otLevantamento).toBe('l2');
    });

    it('quem não edita o inventário não vê os botões de criar, registrar, responder ou enviar', async () => {
        S.user = { id: 'u', role: 'org_user' };
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        expect(document.querySelector('[data-action="otNovoLevantamento"]')).toBeNull();
        await detalhe();
        for (const acao of ['otNovoAchado', 'otEnviarAchados', 'otResponderRoteiro', 'otSalvarNotas', 'otDescartarAchado', 'otEncerrarLevantamento']) {
            expect(document.querySelector(`[data-action="${acao}"]`), acao).toBeNull();
        }
        expect(el('ach-sel-a1')).toBeNull();
    });

    it('trocar de projeto ou de aba volta à lista de sessões', async () => {
        S.otLevantamento = 'l1';
        window.otAba('coleta');
        expect(S.otLevantamento).toBeNull();
        S.otLevantamento = 'l1';
        S.activeProject = { id: 'p2', modulos: ['ot'] };
        servirOt({});
        await abrir('catalogo');
        expect(S.otLevantamento).toBeNull();
    });
});

describe('coleta ligada a um documento', () => {
    it('a planilha pode ser ligada a uma sessão documento do site escolhido', async () => {
        servirOt({ ...SITES, [`GET ${B}/lotes`]: { lotes: [] }, [`GET ${B}/levantamentos`]: { levantamentos: [LEV,
            { ...LEV, id: 'd1', tipo: 'documento', documento_titulo: 'Inventário 2023' }, { ...LEV, id: 'd2', site_id: 's2', tipo: 'documento', documento_titulo: 'Do outro site' }] },
        [`POST ${B}/lotes`]: { id: 'lote-1', itens: 1, com_erro: 0 } });
        await abrir('coleta');
        const ops = () => [...el('ot-lote-doc').options].map((o) => o.value);
        expect(ops()).toEqual(['', 'd1']);
        window.otLoteSite('s2');
        expect(ops()).toEqual(['', 'd2']);
        el('ot-lote-site').value = 's1';
        window.otLoteSite('s1');
        el('ot-lote-doc').value = 'd1';
        Object.defineProperty(el('ot-lote-arquivo'), 'files', { value: [new File(['nome\nx'], 'a.csv')] });
        await window.otEnviarPlanilha();
        const fd = chamadas.find((x) => x.k === `POST ${B}/lotes`).opts.body;
        expect(fd.get('levantamento_id')).toBe('d1');
    });
});

describe('coleta com fluxo', () => {
    it('item de fluxo mostra "Fluxo: origem → destino" e "—" em IP/MAC/Fabricante; não trava a aprovação', async () => {
        S.user = { id: 'u-gestor', role: 'org_admin' };
        S.otLote = 'lt1';
        servirOt({ ...SITES, [`GET ${B}/lotes`]: { lotes: [] }, [`GET ${B}/lotes/lt1`]: { lote: { id: 'lt1', site_id: 's1', fonte: 'manual', status: 'em_revisao', criado_por: 'u-outro', created_at: '2026-11-01 10:00:00' },
            itens: [{ id: 'i1', linha: 1, entidade: 'fluxo', dados: { origem_ativo_id: 'at1', externo: true, protocolo: 'RDP' }, erros: [], decisao: 'pendente', possivel_duplicata: false },
                { id: 'i2', linha: 2, entidade: 'fluxo', dados: { origem_ativo_id: 'at9', destino_zona_id: 'z1' }, erros: [], decisao: 'pendente', possivel_duplicata: true, duplicata_de: 'f7' }],
            nomes_pontas: { at1: 'CLP 1', z1: 'Supervisão' } } });
        await abrir('coleta');
        const linha = [...document.querySelectorAll('#c tbody tr')][0];
        const cel = [...linha.querySelectorAll('td')].map((t) => t.textContent);
        expect(cel[1]).toBe('Fluxo: CLP 1 → Fora da empresa');
        expect([cel[3], cel[4], cel[5], cel[7]]).toEqual(['—', '—', '—', '—']);
        const cel2 = [...[...document.querySelectorAll('#c tbody tr')][1].querySelectorAll('td')].map((t) => t.textContent);
        expect(cel2[1]).toBe('Fluxo: ponta removida → Supervisão');
        expect(cel2[7]).toBe('Atualiza fluxo existente');
        expect(chamadas.some((x) => x.k === `GET ${B}/ativos` || x.k === `GET ${B}/zonas`)).toBe(false);
        expect(document.querySelector('[data-action="otAprovarLote"]')).not.toBeNull();
    });
});
