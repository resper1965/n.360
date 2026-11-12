// n.ot, L1 (descoberta operacional): a aba Levantamento sobre as rotas reais /roteiro e /levantamentos* de src/routes/ot.ts.
// api() REAL; só o fetch é dublado (mesmo arranque de ot-abas.test.js), com os corpos que os handlers devolvem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { desenhar } from './ot-abrir.js';
import { hojeSP } from '../src/hoje.js';

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
    await desenhar(aba);
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
    it('lista os levantamentos com tipo, função e turno, sem nome de pessoa', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        expect(texto()).toContain('Entrevista');
        expect(texto()).toContain('Operador · turno B');
        expect(texto()).toContain('SE Norte');
    });

    it('detalhe mostra roteiro do tipo do levantamento, achados escapados e confronto só quando a API manda', async () => {
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

    it('enviar para aprovação manda só os achados marcados e abre o lote de aprovação criado', async () => {
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
        expect([S.otTela, S.otSite, S.otSub, S.otLote]).toEqual(['site', 's1', 'aprovacao', 'lote-9']);
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

    it('o técnico vê registrar, notas, roteiro, encerrar e enviar, mas não reabrir', async () => {
        S.user = { id: 'u', role: 'org_user' };
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        await detalhe();
        for (const acao of ['otNovoAchado', 'otEnviarAchados', 'otResponderRoteiro', 'otDescartarAchado', 'otEncerrarLevantamento']) {
            expect(document.querySelector(`[data-action="${acao}"]`), acao).not.toBeNull();
        }
        expect(el('lev-notas').readOnly).toBe(false);
        expect(el('ach-sel-a1')).not.toBeNull();
        await detalhe([ACH()], { [`GET ${B}/levantamentos/l1`]: { levantamento: { ...LEV, situacao: 'encerrado' }, achados: [ACH()] } });
        expect(document.querySelector('[data-action="otEncerrarLevantamento"]')).toBeNull();
    });

    it('o cliente não vê os botões de registrar, responder ou enviar', async () => {
        S.user = { id: 'u', role: 'client' };
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [LEV] }, ...SITES });
        await abrir('levantamento');
        await detalhe();
        for (const acao of ['otNovoAchado', 'otEnviarAchados', 'otResponderRoteiro', 'otSalvarNotas', 'otDescartarAchado', 'otEncerrarLevantamento']) {
            expect(document.querySelector(`[data-action="${acao}"]`), acao).toBeNull();
        }
        expect(el('ach-sel-a1')).toBeNull();
    });

    it('trocar de projeto ou de aba volta à lista de levantamentos', async () => {
        S.otLevantamento = 'l1';
        await window.otTela('site', 's1');
        expect(S.otLevantamento).toBeNull();
        S.otLevantamento = 'l1'; S.otProjeto = S.activeProject.id;
        S.activeProject = { id: 'p2', modulos: ['ot'] };
        servirOt({});
        await window.renderOt(el('c'), el('h'), el('a'));
        expect(S.otLevantamento).toBeNull();
    });
});

// L4 (de-para): corpos de src/routes/ot-depara.ts (proposta 200, aplicar 201, texto 201/422, teto 429).
describe('importar arquivo no levantamento de documento', () => {
    const DOC = { ...LEV, tipo: 'documento', documento_titulo: 'Inventário 2023' };
    const P = `${B}/levantamentos/l1/depara`;
    const abrirDoc = async (extra = {}, lev = DOC, achados = []) => {
        servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: lev, achados }, [`GET ${B}/roteiro`]: ROTEIRO, ...extra });
        window.otAbrirLevantamento('l1');
        await abrir('levantamento');
    };
    const escolher = (nome, conteudo = 'x') => {
        const f = new File([conteudo], nome);
        Object.defineProperty(el('lev-imp-arquivo'), 'files', { value: [f] });
        return f;
    };
    const PROPOSTA = { cabecalho: ['Hostname <b id="xss2">', 'End. IP', 'Obs'], mapeamento: { 0: 'nome', 1: 'ip' }, origem: 'perfil',
        perfil: { id: 'pf1', nome: 'Export <i id="xss3">SCADA</i>', fonte: 'SCADA' }, aviso: 'Revise as colunas.', linhas: 12 };
    const fdDe = (k) => chamadas.find((x) => x.k === k).opts.body;

    it('botão só em documento aberto para quem pode criar lote', async () => {
        await abrirDoc();
        expect(document.querySelector('[data-action="otImportarArquivo"]')).not.toBeNull();
        await abrirDoc({}, { ...DOC, situacao: 'encerrado' });
        expect(document.querySelector('[data-action="otImportarArquivo"]')).toBeNull();
        await abrirDoc({}, LEV);
        expect(document.querySelector('[data-action="otImportarArquivo"]')).toBeNull();
    });

    it('modal avisa que o arquivo não fica guardado; a proposta preenche os selects e o selo, com texto escapado', async () => {
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: PROPOSTA });
        window.otImportarArquivo();
        expect(el('lev-imp-arquivo').accept).toBe('.csv,.xlsx,.txt,.docx,.json');
        expect(el('modal-content').textContent).toContain('O arquivo é lido e descartado; não fica guardado. IP, MAC e dados pessoais são mascarados antes da IA.');
        const f = escolher('a.csv');
        await window.otLerArquivo();
        expect(fdDe(`POST ${P}/planilha/proposta`).get('file')).toBe(f);
        expect([el('lev-map-0').value, el('lev-map-1').value, el('lev-map-2').value]).toEqual(['nome', 'ip', '']);
        expect([...el('lev-map-2').options].map((o) => o.textContent)).toContain('Ignorar');
        expect([...el('lev-map-2').options].map((o) => o.textContent)).toContain('Endereço MAC');
        const m = el('modal-content').textContent;
        expect(m).toContain('Perfil salvo: Export <i id="xss3">SCADA</i>');
        expect(m).toContain('Revise as colunas.');
        expect(m).toContain('12 linhas');
        expect(m).toContain('Hostname <b id="xss2">');
        expect(el('xss2')).toBeNull(); expect(el('xss3')).toBeNull();
        for (const [origem, selo] of [['ia', 'Sugerido pela IA'], ['cabecalho', 'Pelo nome da coluna'], ['nozomi', 'Perfil Nozomi (export de ativos)']]) {
            await abrirDoc({ [`POST ${P}/planilha/proposta`]: { ...PROPOSTA, origem, perfil: undefined, aviso: undefined } });
            window.otImportarArquivo(); escolher('a.xlsx');
            await window.otLerArquivo();
            expect(el('modal-content').textContent).toContain(selo);
        }
    });

    it('aplicar reenvia o mesmo arquivo e só as colunas não ignoradas, com o perfil; toast e redesenho', async () => {
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: PROPOSTA, [`POST ${P}/planilha/aplicar`]: { criados: 12, com_aviso: 2, macs_gateway: 3, perfil_id: 'pf1' } });
        window.otImportarArquivo();
        const f = escolher('a.csv');
        await window.otLerArquivo();
        el('lev-map-1').value = '';
        el('lev-map-2').value = 'mac';
        el('lev-imp-perfil').checked = true;
        el('lev-imp-perfil-nome').value = 'Export SCADA';
        el('lev-imp-perfil-fonte').value = 'SCADA';
        await window.otAplicarDepara();
        const fd = fdDe(`POST ${P}/planilha/aplicar`);
        expect(fd.get('file')).toBe(f);
        expect(JSON.parse(fd.get('mapeamento'))).toEqual({ 0: 'nome', 2: 'mac' });
        expect([fd.get('perfil_nome'), fd.get('perfil_fonte')]).toEqual(['Export SCADA', 'SCADA']);
        expect(document.body.textContent).toContain('12 achados criados (2 com aviso). 3 MACs de roteador ignorados.');
        expect(window.render).toHaveBeenCalled();
    });

    it('campo repetido bloqueia o envio; sem perfil marcado, nome e fonte não vão', async () => {
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: PROPOSTA, [`POST ${P}/planilha/aplicar`]: { criados: 1, com_aviso: 0, macs_gateway: 0 } });
        window.otImportarArquivo(); escolher('a.csv');
        await window.otLerArquivo();
        el('lev-map-2').value = 'nome';
        await window.otAplicarDepara();
        expect(chamadas.some((x) => x.k === `POST ${P}/planilha/aplicar`)).toBe(false);
        expect(document.body.textContent).toContain('"Nome" está em mais de uma coluna');
        el('lev-map-2').value = '';
        await window.otAplicarDepara();
        const fd = fdDe(`POST ${P}/planilha/aplicar`);
        expect(fd.has('perfil_nome')).toBe(false);
    });

    it('TXT pede confirmação e mostra as contagens; 422 manda registrar à mão; 429 fala do limite por hora', async () => {
        await abrirDoc({ [`POST ${P}/texto`]: { criados: 3, com_aviso: 1, descartados: 2, trechos_pulados: 4 } });
        window.otImportarArquivo(); escolher('ata.txt');
        const p = window.otLerArquivo();
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('.confirmar').textContent).toContain('A IA vai ler o texto mascarado e sugerir achados. Revise cada um antes de enviar para aprovação.');
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(fdDe(`POST ${P}/texto`).get('file').name).toBe('ata.txt');
        expect(document.body.textContent).toContain('3 achados sugeridos pela IA. 2 descartados por evidência ausente. 4 trechos pulados por endereço sem máscara');

        const falha = async (status, corpo) => {
            servirOt({});
            vi.stubGlobal('fetch', vi.fn(async () => resposta(corpo, status)));
            window.otImportarArquivo(); escolher('ata.docx');
            const q = window.otLerArquivo();
            await new Promise((r) => setTimeout(r, 0));
            document.querySelector('[data-confirmar="sim"]').click();
            await q;
        };
        await falha(422, { error: 'A IA não está disponível agora' });
        expect(document.body.textContent).toContain('A IA não está disponível agora. Registre os achados à mão.');
        await falha(429, { error: 'Limite por hora atingido: ...', codigo: 'teto_por_hora' });
        expect(document.body.textContent).toContain('Limite por hora do de-para atingido; tente mais tarde.');
    });

    it('clique duplo não repete proposta, aplicar ou texto; o botão fica ocupado e volta depois do erro', async () => {
        const conta = (k) => chamadas.filter((x) => x.k === k).length;
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: PROPOSTA, [`POST ${P}/planilha/aplicar`]: { criados: 1, com_aviso: 0 } });
        window.otImportarArquivo(); escolher('a.csv');
        const p1 = window.otLerArquivo();
        const b = document.querySelector('[data-action="otLerArquivo"]');
        expect([b.disabled, b.getAttribute('aria-busy')]).toEqual([true, 'true']);
        await Promise.all([p1, window.otLerArquivo()]);
        expect(conta(`POST ${P}/planilha/proposta`)).toBe(1);
        await Promise.all([window.otAplicarDepara(), window.otAplicarDepara()]);
        expect(conta(`POST ${P}/planilha/aplicar`)).toBe(1);

        await abrirDoc({ [`POST ${P}/texto`]: { criados: 1, com_aviso: 0, descartados: 1, trechos_pulados: 1 } });
        window.otImportarArquivo(); escolher('ata.txt');
        const t1 = window.otLerArquivo();
        const t2 = window.otLerArquivo();
        await new Promise((r) => setTimeout(r, 0));
        document.querySelector('[data-confirmar="sim"]').click();
        await Promise.all([t1, t2]);
        expect(conta(`POST ${P}/texto`)).toBe(1);
        // Singular nas contagens.
        expect(document.body.textContent).toContain('1 achado sugerido pela IA. 1 descartado por evidência ausente. 1 trecho pulado por endereço sem máscara.');

        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'x', codigo: 'teto_por_hora' }, 429)));
        window.otImportarArquivo(); escolher('a.csv');
        await window.otLerArquivo();
        expect(document.querySelector('[data-action="otLerArquivo"]').disabled).toBe(false);
    });

    it('proposta de 1 linha e 1 achado criado no singular; fechar o modal solta o arquivo', async () => {
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: { ...PROPOSTA, linhas: 1 }, [`POST ${P}/planilha/aplicar`]: { criados: 1, com_aviso: 0 } });
        el('modal-overlay').classList.add('open');
        window.otImportarArquivo(); escolher('a.csv');
        await window.otLerArquivo();
        expect(el('modal-content').textContent).toContain('1 linha');
        expect(el('modal-content').textContent).not.toContain('1 linhas');
        window.forceCloseModal();
        await new Promise((r) => setTimeout(r, 0));
        await window.otAplicarDepara(); // sem arquivo guardado: nada vai
        expect(chamadas.some((x) => x.k === `POST ${P}/planilha/aplicar`)).toBe(false);
        window.otImportarArquivo(); escolher('a.csv');
        await window.otLerArquivo();
        await window.otAplicarDepara();
        expect(document.body.textContent).toContain('1 achado criado (0 com aviso).');
    });

    it('fechar o modal durante a proposta descarta a resposta: o mapeamento não reabre', async () => {
        await abrirDoc({ [`POST ${P}/planilha/proposta`]: PROPOSTA });
        el('modal-overlay').classList.add('open');
        window.otImportarArquivo(); escolher('a.csv');
        const lendo = window.otLerArquivo();
        window.forceCloseModal();
        await lendo;
        expect(chamadas.some((x) => x.k === `POST ${P}/planilha/proposta`)).toBe(true);
        expect(el('modal-content').textContent).not.toContain('Importar planilha');
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
        await window.otAplicarDepara();
        expect(chamadas.some((x) => x.k === `POST ${P}/planilha/aplicar`)).toBe(false);
    });

    // L3 (sensor de rede): src/routes/ot-depara.ts POST …/depara/rede; o .json só é oferecido a quem vê o inventário completo.
    const RESUMO = { formato: 'n.ot-resumo-rede/1', gerado_em: '2026-11-04T12:00:00Z', periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T00:00:00Z' },
        ativos: [{ ip: '10.1.1.10' }, { ip: '10.1.1.11' }], conexoes: [{ origem: '10.1.1.20', destino: '10.1.1.10' }] };
    const KS = { ativos_novos: 2, ativos_conhecidos: 1, macs_completados: 1, fluxos_criados: 3, fluxos_pendentes: 4, nao_importados: 0, pendentes_nao_importados: 0 };

    it('resumo de rede: modal com período e totais, aviso e "Criar achados"; envia o arquivo e mostra o resumo com plurais', async () => {
        await abrirDoc({ [`POST ${P}/rede`]: KS });
        window.otImportarArquivo();
        expect(el('lev-imp-arquivo').accept).toBe('.csv,.xlsx,.txt,.docx,.json');
        const f = escolher('resumo.json', JSON.stringify(RESUMO));
        await window.otLerArquivo();
        const m = el('modal-content').textContent;
        expect(m).toContain('IP e MAC entram cifrados; o arquivo não fica guardado.');
        expect(m).toContain('01/11/2026');
        expect(m).toContain('03/11/2026');
        expect(m).toContain('2 ativos');
        expect(m).toContain('1 conexão');
        expect(chamadas.some((x) => x.k === `POST ${P}/rede`)).toBe(false);
        await window.otImportarRede();
        expect(fdDe(`POST ${P}/rede`).get('file')).toBe(f);
        const t = document.body.textContent;
        expect(t).toContain('2 ativos novos');
        expect(t).toContain('1 MAC completado');
        expect(t).toContain('3 fluxos criados');
        expect(t).toContain('1 ativo já estava no inventário');
        expect(t).toContain('4 fluxos aguardando ativo');
        expect(t).not.toContain('Contradiz');
        expect(window.render).toHaveBeenCalled();
    });

    it('resumo de rede: JSON de outro formato é recusado na tela, sem ir à API; o 403 mostra a mensagem do servidor', async () => {
        await abrirDoc({}, DOC);
        window.otImportarArquivo(); escolher('outro.json', JSON.stringify({ formato: 'x', ativos: [], conexoes: [] }));
        await window.otLerArquivo();
        expect(document.body.textContent).toContain('Arquivo não é um resumo de rede do n.ot');
        window.otImportarArquivo(); escolher('quebrado.json', '{');
        await window.otLerArquivo();
        window.otImportarArquivo();
        const grande = escolher('grande.json', JSON.stringify(RESUMO));
        Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 });
        grande.text = vi.fn();
        await window.otLerArquivo();
        expect(document.body.textContent).toContain('Resumo acima de 5 MB');
        expect(grande.text).not.toHaveBeenCalled();
        expect(chamadas.some((x) => x.k.startsWith('POST'))).toBe(false);
        servirOt({ [`GET ${B}/levantamentos/l1`]: { levantamento: DOC, achados: [] }, [`GET ${B}/roteiro`]: ROTEIRO });
        const f = vi.fn(async () => resposta({ error: 'Importar o resumo de rede exige ver o inventário completo (Gestor ARCiber ou consultoria designada)' }, 403));
        vi.stubGlobal('fetch', f);
        window.otImportarArquivo(); escolher('resumo.json', JSON.stringify(RESUMO));
        await window.otLerArquivo();
        await window.otImportarRede();
        expect(document.body.textContent).toContain('exige ver o inventário completo');
    });

    it('resumo de rede não é oferecido a quem edita sem ver o inventário completo (platform_admin)', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        await abrirDoc({ [`POST ${P}/rede`]: KS });
        window.otImportarArquivo();
        expect(el('lev-imp-arquivo').accept).toBe('.csv,.xlsx,.txt,.docx');
        escolher('resumo.json', JSON.stringify(RESUMO));
        await window.otLerArquivo();
        expect(document.body.textContent).toContain('Use CSV, XLSX, TXT ou DOCX.');
        expect(el('modal-content').textContent).not.toContain('IP e MAC entram cifrados');
    });

    it('achado do sensor de rede mostra o selo "Sensor de rede"', async () => {
        await abrirDoc({}, DOC, [ACH(), ACH({ id: 'a4', evidencia: 'Sensor de rede (Zeek): 5321 conexões entre 01/11 e 03/11', dados: { nome: 'Ativo 10.1.1.10' } })]);
        const linha = (nome) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(nome));
        expect(linha('Notebook IHM').textContent).not.toContain('Sensor de rede');
        expect(linha('Ativo 10.1.1.10').querySelector('.badge').textContent).toBe('Sensor de rede');
    });

    it('achado com origem ia mostra o selo "Sugerido pela IA" junto do nome', async () => {
        await abrirDoc({}, DOC, [ACH(), ACH({ id: 'a2', origem: 'ia', dados: { nome: 'CLP sugerido' } })]);
        const linha = (nome) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(nome));
        expect(linha('Notebook IHM').textContent).not.toContain('Sugerido pela IA');
        expect(linha('CLP sugerido').querySelector('.badge').textContent).toBe('Sugerido pela IA');
    });

    it('achado com origem agente mostra o selo "Enviado pelo agente" junto do nome', async () => {
        await abrirDoc({}, DOC, [ACH(), ACH({ id: 'a3', origem: 'agente', dados: { nome: 'RTU do agente' } })]);
        const linha = (nome) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(nome));
        expect(linha('Notebook IHM').textContent).not.toContain('Enviado pelo agente');
        expect(linha('RTU do agente').querySelector('.badge').textContent).toBe('Enviado pelo agente');
    });
});

describe('Trazer dados', () => {
    const acoes = () => [...document.querySelectorAll('[data-action]')].map((x) => x.dataset.action);
    const P = `${B}/levantamentos/l9/depara`;
    const trazer = async (nome, rotas = {}) => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES, [`POST ${B}/levantamentos`]: { id: 'l9' }, ...rotas });
        await abrir('levantamento');
        window.otTrazerDados();
        const input = el('lev-trazer-arquivo');
        const f = new File(['nome,ip\nRTU,10.0.0.1\n'], nome);
        Object.defineProperty(input, 'files', { value: [f] });
        input.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(el('modal-content').textContent).not.toBe(''));
        return { input, f };
    };

    it('cria o levantamento documental de hoje com o nome do arquivo e abre o mapeamento da planilha', async () => {
        const PROPOSTA = { cabecalho: ['nome', 'ip'], mapeamento: { 0: 'nome', 1: 'ip' }, origem: 'cabecalho', linhas: 1 };
        const { f } = await trazer('inventario-2023.csv', { [`POST ${P}/planilha/proposta`]: PROPOSTA });
        expect(corpo(`POST ${B}/levantamentos`)).toEqual({ site_id: 's1', tipo: 'documento', realizado_em: hojeSP(), documento_titulo: 'inventario-2023.csv' });
        expect(S.otLevantamento).toBe('l9');
        expect(chamadas.find((x) => x.k === `POST ${P}/planilha/proposta`).opts.body.get('file')).toBe(f);
        expect(el('modal-content').textContent).toContain('Importar planilha');
    });

    it('extensão fora da lista ou arquivo acima de 5 MB: aviso e nenhum levantamento criado', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES, [`POST ${B}/levantamentos`]: { id: 'l9' } });
        await abrir('levantamento');
        for (const f of [new File(['x'], 'a.pdf'), Object.defineProperty(new File(['x'], 'g.csv'), 'size', { value: 6 * 1024 * 1024 })]) {
            window.otTrazerDados();
            const input = el('lev-trazer-arquivo');
            Object.defineProperty(input, 'files', { value: [f] });
            input.dispatchEvent(new Event('change'));
            await new Promise((r) => setTimeout(r, 0));
        }
        expect(chamadas.some((x) => x.k === `POST ${B}/levantamentos`)).toBe(false);
        expect(S.otLevantamento).toBeNull();
    });

    it('cancelar a confirmação da IA (txt/docx) não cria levantamento', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES, [`POST ${B}/levantamentos`]: { id: 'l9' } });
        await abrir('levantamento');
        window.otTrazerDados();
        const input = el('lev-trazer-arquivo');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'ata.txt')] });
        input.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('.confirmar').textContent).toContain('A IA vai ler o texto mascarado');
        document.querySelector('[data-confirmar="nao"]').click();
        await new Promise((r) => setTimeout(r, 0));
        expect(chamadas.some((x) => x.k === `POST ${B}/levantamentos`)).toBe(false);
    });

    it('o seletor aceita planilha e documento, e o resumo do sensor (json) só para quem aprova', async () => {
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES });
        await abrir('levantamento');
        window.otTrazerDados();
        expect(el('lev-trazer-arquivo').accept).toBe('.csv,.xlsx,.txt,.docx,.json');
        S.user = { id: 'u', role: 'org_user' };
        window.otTrazerDados();
        expect(el('lev-trazer-arquivo').accept).toBe('.csv,.xlsx,.txt,.docx');
    });

    it('o técnico vê "Novo levantamento" e "Trazer dados"; o cliente, nenhum', async () => {
        S.user = { id: 'u', role: 'org_user' };
        servirOt({ [`GET ${B}/levantamentos`]: { levantamentos: [] }, ...SITES });
        await abrir('levantamento');
        expect(acoes()).toEqual(expect.arrayContaining(['otNovoLevantamento', 'otTrazerDados']));
        expect(el('a').querySelectorAll('.btn-primary')).toHaveLength(1);
        S.user = { id: 'u', role: 'client' };
        await abrir('levantamento');
        expect(acoes()).not.toContain('otTrazerDados');
        expect(acoes()).not.toContain('otNovoLevantamento');
    });
});

describe('lote com fluxo', () => {
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
