// Entrevista do RoPA (n.privacy): uma pergunta por vez, condicionais, "Não sei agora", obrigatórias, edição pré-preenchida,
// escape e o corpo que vai à API. api() REAL e delegação de eventos REAL; só o fetch é dublado, com o corpo de cada handler
// (src/routes/ropa.ts, src/routes/nucleo.ts). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/privacy.js';
import { montarPayload, motivosRipd, respostasDoRegistro, montarCiclo, montarBases } from '../src/views/ropa-entrevista.js';
import fonte from '../src/views/ropa-entrevista.js?raw';

initDelegation();

const P = '/api/v1/projects/p1';
const CATALOGO = [
    { id: 'lgpd:art7', pai_id: null }, { id: 'lgpd:art7:i', pai_id: 'lgpd:art7' }, { id: 'lgpd:art7:ii', pai_id: 'lgpd:art7' },
    { id: 'lgpd:art7:ix', pai_id: 'lgpd:art7' }, { id: 'lgpd:art11:ii-f', pai_id: 'lgpd:art11' },
];
const LIG = { aprovacao: { ciso: null, ceo: null }, lia: { exigida: false, existe: false, status: null }, dpias: [], dpia_pendente: false,
    terceiros_com_avaliacao_vencida: [], base_legal: null, itens: [{ id: 'i1', nome: 'Sistema de folha', tipo: 'sistema' }],
    departamentos: [{ id: 'd1', nome: 'Pessoas' }], partes: [], transferencias: [] };
const rotasBase = (extra = {}) => ({
    [`GET ${P}/partes`]: [{ id: 'pe1', nome: 'Ana <b>Exemplo</b>', tipo: 'pessoa', status: 'ativa' }],
    [`GET ${P}/departamentos`]: [{ id: 'd1', nome: 'Pessoas' }, { id: 'd2', nome: 'Financeiro' }],
    [`GET ${P}/assets`]: { ok: true, assets: [{ id: 'i1', name: 'Sistema de folha' }] },
    'GET /api/v1/requisitos': CATALOGO,
    [`GET ${P}/ropa`]: { ok: true, records: S.ropa || [] },
    [`POST ${P}/ropa`]: { ok: true, id: 'novo1' },
    'PUT /api/v1/ropa/novo1': { ok: true },
    'PUT /api/v1/ropa/r1': { ok: true },
    [`PUT ${P}/ropa/novo1/departamentos`]: { ok: true, total: 1 },
    [`PUT ${P}/ropa/novo1/itens`]: { ok: true, total: 1 },
    [`PUT ${P}/ropa/novo1/ciclo`]: { ok: true },
    [`PUT ${P}/ropa/novo1/bases`]: { ok: true },
    [`GET ${P}/ropa/r1/ligacoes`]: LIG,
    [`GET ${P}/ropa/r1/lia`]: { lia: null },
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);
const titulo = () => el('re-titulo').textContent;
const opcoes = () => [...el('c').querySelectorAll('.re-opcao input')];

/** Abre a entrevista como a tela faz: abrirRopaEntrevista (navigate dublado) e o render da view. */
async function abrir(recordId, rotas = {}) {
    const f = servir(rotasBase(rotas));
    window.abrirRopaEntrevista('p1', recordId);
    S.view = 'ropa-entrevista';
    await window.renderRopaEntrevista(el('c'), el('h'), el('a'));
    return f;
}
function digitar(v) { const i = el('re-campo'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }
function marcar(...valores) { for (const v of valores) opcoes().find((i) => i.value === v).click(); }
function proxima() { el('c').querySelector('.re-pergunta button[type="submit"]').click(); }
function naoSei() { el('c').querySelector('[data-action="reNaoSei"]').click(); }
/** Rascunho guardado na aba: a entrevista retoma nele (é também como os testes pulam direto para uma pergunta). */
const rascunho = (passo, respostas, recordId = null) => sessionStorage.setItem(`ropa-entrevista:p1:${recordId || 'nova'}`, JSON.stringify({ passo, respostas, recordId }));

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    try { sessionStorage.clear(); } catch (e) { /* jsdom */ }
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    S.ropa = [];
    window.render = vi.fn();
    window.confirmar = vi.fn(async () => true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fluxo feliz de uma atividade nova', () => {
    it('pergunta a pergunta até o resumo; salva rascunho com o corpo certo e liga áreas e sistemas', async () => {
        const f = await abrir();
        expect(el('h').textContent).toBe('Entrevista do RoPA: nova atividade');
        expect(titulo()).toBe('Qual atividade da empresa usa dados de pessoas?');
        expect(document.activeElement).toBe(el('re-titulo'));
        expect(el('c').querySelector('progress').getAttribute('value')).toBe('0');
        // exemplo clicável preenche o campo
        el('c').querySelector('.re-exemplos .chip').click();
        expect(el('re-campo').value).toBe('Folha de pagamento');
        proxima();
        expect(titulo()).toBe('Em uma frase, para que essa atividade serve?');
        expect(document.activeElement).toBe(el('re-titulo'));
        digitar('Pagar salários e recolher encargos'); proxima();
        expect(titulo()).toBe('Quem responde por essa atividade na empresa?');
        marcar('pe1'); proxima();
        marcar('d1'); proxima();
        expect(titulo()).toBe('De quem são os dados que a atividade usa?');
        marcar('Colaboradores'); proxima();
        marcar('nao'); proxima();
        naoSei(); // volume
        marcar('Identificação', 'Financeiro'); proxima();
        marcar('__nenhum'); proxima();
        naoSei(); // decisão automática
        expect(titulo()).toContain('motivos');
        marcar('lei'); proxima();
        // o motivo marcou a hipótese; a pessoa confirma
        expect(titulo()).toBe('Confirme a hipótese legal');
        expect(opcoes().find((i) => i.checked).value).toBe('Cumprimento de obrigação legal ou regulatória');
        expect(opcoes()).toHaveLength(10);
        proxima();
        // outras bases: o catálogo sem a principal escolhida; nenhuma marcada segue em frente
        expect(titulo()).toContain('outra hipótese legal');
        expect(opcoes().map((i) => i.value)).toEqual(['lgpd:art7:i', 'lgpd:art7:ix', 'lgpd:art11:ii-f']);
        proxima();
        expect(titulo()).toContain('GDPR');
        proxima();
        marcar('A própria pessoa'); proxima(); // origem: vira a descrição da coleta
        marcar('i1'); proxima();
        marcar('sim'); proxima();
        digitar('Contabilidade externa'); proxima();
        marcar('5 anos (obrigação fiscal e contábil)'); proxima();
        marcar('Exclusão do sistema'); proxima(); // eliminação: vira a descrição da etapa de eliminação
        marcar('nao'); proxima(); // transferência
        naoSei(); // impacto
        expect(el('re-recomendacao').textContent).toContain('Nenhum gatilho');
        marcar('nao'); proxima(); // RIPD
        expect(titulo()).toBe('Confira o que você nos contou');
        expect(el('c').textContent).toContain('Folha de pagamento');
        // as perguntas sem coluna (volume, decisão automática, impacto) aparecem no resumo, mas não viram pendência
        expect(el('c').textContent).toContain('Não sei agora');
        expect(el('c').querySelector('.re-pendencias')).toBeNull();
        expect(el('c').textContent).toContain('Nenhuma pendência nas respostas.');

        await window.reSalvar();
        expect(corpoDe(f, `POST ${P}/ropa`)).toEqual({
            processing_purpose: 'Folha de pagamento: Pagar salários e recolher encargos',
            owner_parte_id: 'pe1', owner: 'Ana <b>Exemplo</b>',
            data_subjects: 'Colaboradores', data_categories: 'Identificação, Financeiro',
            dados_sensiveis: 0, criancas_adolescentes: 0,
            legal_basis: 'Cumprimento de obrigação legal ou regulatória', base_legal_id: 'lgpd:art7:ii',
            recipients: 'Contabilidade externa', retention_period: '5 anos (obrigação fiscal e contábil)',
            international_transfers: 0, dpia_required: 0,
        });
        expect(corpoDe(f, `PUT ${P}/ropa/novo1/departamentos`)).toEqual({ departamentos: ['d1'] });
        expect(corpoDe(f, `PUT ${P}/ropa/novo1/itens`)).toEqual({ itens: ['i1'] });
        expect(corpoDe(f, `PUT ${P}/ropa/novo1/ciclo`)).toEqual({ etapas: [
            { etapa: 'coleta', situacao: 'registrada', descricao: 'A própria pessoa' },
            { etapa: 'eliminacao', situacao: 'registrada', descricao: 'Exclusão do sistema' },
        ] });
        // sem outra base nem GDPR, nada vai para .../bases
        expect(chamadas(f).filter((c) => c.startsWith('POST') || c.startsWith('PUT'))).toHaveLength(4);
        expect(titulo()).toBe('Atividade salva');
        expect(el('c').textContent).toContain('entrou no inventário como rascunho');
        // o rascunho da aba some depois de salvar
        expect(sessionStorage.getItem('ropa-entrevista:p1:nova')).toBeNull();
    });

    it('Voltar retorna à pergunta anterior sem perder a resposta; o rascunho fica na sessionStorage', async () => {
        await abrir();
        digitar('Cobrança'); proxima();
        digitar('Cobrar clientes em atraso'); proxima();
        el('c').querySelector('[data-action="reVoltar"]').click();
        expect(el('re-campo').value).toBe('Cobrar clientes em atraso');
        const salvo = JSON.parse(sessionStorage.getItem('ropa-entrevista:p1:nova'));
        expect(salvo.respostas).toMatchObject({ finalidade: 'Cobrança', para_que: 'Cobrar clientes em atraso' });
        // Esc não apaga nada
        el('re-campo').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(el('re-campo').value).toBe('Cobrar clientes em atraso');
        // sair e voltar retoma na mesma pergunta
        await abrir();
        expect(titulo()).toBe('Em uma frase, para que essa atividade serve?');
        expect(el('re-campo').value).toBe('Cobrar clientes em atraso');
    });

    it('Enter no campo avança (submit do formulário)', async () => {
        await abrir();
        digitar('Canal de denúncias');
        el('c').querySelector('form.re-pergunta').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(titulo()).toBe('Em uma frase, para que essa atividade serve?');
    });
});

describe('obrigatórias: finalidade, titulares e categorias', () => {
    it('sem resposta não avança, avisa na região viva e não oferece "Não sei agora"', async () => {
        await abrir();
        expect(el('c').querySelector('[data-action="reNaoSei"]')).toBeNull();
        proxima();
        expect(titulo()).toBe('Qual atividade da empresa usa dados de pessoas?');
        expect(el('re-erro').getAttribute('aria-live')).toBe('polite');
        expect(el('re-erro').textContent).toContain('obrigatória');
        digitar('ab'); proxima();
        expect(el('re-erro').textContent).toContain('pelo menos 3 letras');
    });

    it('titulares e categorias pedem ao menos uma opção ("Outro" vazio não conta)', async () => {
        rascunho('titulares', { finalidade: 'Recrutamento e seleção' });
        await abrir();
        proxima();
        expect(el('re-erro').textContent).toBe('Marque ao menos uma opção para seguir.');
        marcar('__outro'); proxima();
        expect(el('re-erro').textContent).toBe('Marque ao menos uma opção para seguir.');
        el('re-outro').value = 'Estagiários'; el('re-outro').dispatchEvent(new Event('input', { bubbles: true }));
        proxima();
        expect(titulo()).toContain('crianças');
    });

    it('salvar sem as três barra no cliente e não chama a API', async () => {
        rascunho('resumo', { finalidade: 'Marketing e newsletter', titulares: ['Clientes pessoa física'] });
        const f = await abrir();
        await window.reSalvar();
        expect(el('re-erro').textContent).toBe('Antes de salvar, responda: Tipos de dado.');
        expect(chamadas(f).some((c) => c.startsWith('POST') || c.startsWith('PUT'))).toBe(false);
    });
});

describe('perguntas condicionais', () => {
    const basico = { finalidade: 'Saúde ocupacional', titulares: ['Colaboradores'], categorias: ['Identificação'] };

    it('dado sensível: aviso do art. 11, base só do art. 11, recomendação de RIPD', async () => {
        rascunho('sensiveis', { ...basico });
        await abrir();
        expect(el('c').textContent).not.toContain('Art. 11 da LGPD');
        marcar('Saúde');
        expect(el('c').querySelector('.re-aviso').textContent).toContain('Art. 11 da LGPD');
        // foco volta à opção marcada depois do redesenho
        expect(document.activeElement.value).toBe('Saúde');
        proxima(); naoSei(); // decisão automática
        marcar('interesse');
        expect(el('c').textContent).not.toContain('não serve de base legal'); // aviso só aparece na base
        proxima();
        const bases = opcoes().map((i) => i.value);
        expect(bases).toHaveLength(8);
        expect(bases.every((b) => b.endsWith('(art. 11)'))).toBe(true);
        expect(el('c').textContent).toContain('não serve de base legal');
        expect(motivosRipd({ sensiveis: ['Saúde'] })).toEqual(['há dado sensível']);
    });

    it('base do art. 7 gravada com dado sensível não avança', async () => {
        rascunho('base', { ...basico, sensiveis: ['Saúde'], base: 'Consentimento' });
        await abrir();
        proxima();
        expect(titulo()).toBe('Confirme a hipótese legal');
        expect(el('re-erro').textContent).toContain('art. 11');
    });

    it('crianças: "Sim" mostra o aviso do art. 14', async () => {
        rascunho('criancas', { ...basico });
        await abrir();
        marcar('sim');
        expect(el('c').textContent).toContain('Art. 14 da LGPD');
    });

    it('consentimento abre a pergunta de como é colhido; legítimo interesse abre a LIA', async () => {
        rascunho('base', { ...basico, sensiveis: ['__nenhum'], base: 'Consentimento' });
        await abrir();
        proxima();
        expect(titulo()).toBe('Como o consentimento é pedido e guardado?');
        rascunho('base', { ...basico, sensiveis: ['__nenhum'], base: 'Legítimo interesse' });
        await abrir();
        proxima();
        expect(titulo()).toContain('legítimo interesse (LIA)');
        expect(el('re-sub-conclusao')).not.toBeNull();
        rascunho('base', { ...basico, sensiveis: ['__nenhum'], base: 'Proteção do crédito' });
        await abrir();
        proxima();
        // sem consentimento nem LIA, segue para as outras bases (F3)
        expect(titulo()).toContain('outra hipótese legal');
    });

    it('salvaguarda só com transferência internacional', async () => {
        rascunho('transferencia', { ...basico });
        await abrir();
        marcar('nao'); proxima();
        expect(titulo()).toContain('vazassem');
        rascunho('transferencia', { ...basico });
        await abrir();
        marcar('sim'); proxima();
        expect(titulo()).toBe('Para qual país, e com qual proteção?');
        expect([...el('re-sub-mecanismo').options].map((o) => o.textContent)).toContain('Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)');
    });

    it('RIPD: recomenda com o motivo; "Sim" oferece criar o RIPD agora', async () => {
        rascunho('ripd', { ...basico, criancas: 'sim', volume: '100mil+' });
        await abrir();
        expect(titulo()).toContain('RIPD (DPIA)');
        expect(el('re-recomendacao').textContent).toBe('Recomendamos Sim porque há dados de crianças ou adolescentes, são mais de 10 mil pessoas.');
        marcar('sim'); proxima();
        expect(titulo()).toBe('Quer criar o RIPD agora, a partir desta atividade?');
    });

    it('"Alterar" no resumo volta ao bloco e, ao terminar o bloco, retorna ao resumo', async () => {
        rascunho('resumo', { ...basico, criancas: 'nao' });
        await abrir();
        el('c').querySelector('[data-action="reAlterar"][data-args=\'["B"]\']').click();
        expect(titulo()).toBe('De quem são os dados que a atividade usa?');
        proxima(); proxima(); naoSei();
        expect(titulo()).toBe('Confira o que você nos contou');
    });
});

describe('teste de impacto (bloco I, catálogo e recomendação do servidor)', () => {
    const REG = { id: 'r1', project_id: 'p1', processing_purpose: 'Folha', data_subjects: 'Colaboradores', data_categories: 'Identificação',
        dados_sensiveis: 0, criancas_adolescentes: 0, international_transfers: 0, dpia_required: 0, status: 'Draft', nao_informado: [], aprovacao_pedido: { ciso: null, ceo: null } };
    // Corpo de GET /projects/:p/ropa/:rid/impacto (src/routes/ropa.ts, lerImpacto de src/services/impacto.ts). Textos fictícios.
    const IMPACTO = {
        perguntas: [
            { id: 'larga_escala', grupo: 'geral', texto: 'Larga escala <b>texto do servidor</b>?', resposta: 'sim' },
            { id: 'sensiveis', grupo: 'especifico', texto: 'Dados sensíveis?', resposta: 'sim' },
            { id: 'monitoramento', grupo: 'especifico', texto: 'Monitoramento sistemático?', resposta: null },
        ],
        recomendacao: { resultado: 'recomendado', motivos: ['larga_escala', 'sensiveis'] }, finalizado_em: null,
    };
    const abrirComImpacto = (extra = {}) => { S.ropa = [REG]; return abrir('r1', { [`GET ${P}/ropa/r1/impacto`]: IMPACTO, [`PUT ${P}/ropa/r1/impacto`]: { ok: true }, ...extra }); };
    const irAoBlocoI = () => el('c').querySelector('[data-action="reAlterar"][data-args=\'["I"]\']').click();
    const radio = (pergunta, v) => el(`re-imp-${pergunta}-${v}`);

    it('o resumo mostra a recomendação do servidor; as respostas gravadas vêm marcadas e o texto do servidor vem escapado', async () => {
        await abrirComImpacto();
        expect(el('re-impacto').textContent).toContain('RIPD recomendado: larga escala, sensiveis');
        irAoBlocoI();
        expect(titulo()).toContain('Teste de impacto');
        expect(radio('larga_escala', 'sim').checked).toBe(true);
        expect(radio('sensiveis', 'sim').checked).toBe(true);
        expect(['sim', 'nao', 'nao_sei'].some((v) => radio('monitoramento', v).checked)).toBe(false);
        expect(el('c').textContent).toContain('Larga escala <b>texto do servidor</b>?');
        expect(el('c').querySelector('.re-impacto b')).toBeNull();
    });

    it('responder grava pelo PUT do teste só o que mudou; "Não sei agora" vai como nao_sei', async () => {
        const f = await abrirComImpacto();
        irAoBlocoI();
        radio('monitoramento', 'nao_sei').click();
        radio('sensiveis', 'nao').click();
        proxima();
        expect(titulo()).toBe('Confira o que você nos contou');
        await window.reSalvar();
        expect(corpoDe(f, `PUT ${P}/ropa/r1/impacto`)).toEqual({ respostas: { sensiveis: 'nao', monitoramento: 'nao_sei' } });
        expect(fonte.match(/ropa\/\$\{id\}\/impacto/g)).toHaveLength(1);
    });

    it('sem mudança no teste, nada é gravado nele', async () => {
        const f = await abrirComImpacto();
        await window.reSalvar();
        expect(chamadas(f)).not.toContain(`PUT ${P}/ropa/r1/impacto`);
    });

    it('incompleto aparece como tal; com o RIPD recomendado, "Abrir o RIPD" cria pelo tratamento', async () => {
        await abrirComImpacto({ [`GET ${P}/ropa/r1/impacto`]: { ...IMPACTO, recomendacao: { resultado: 'incompleto', motivos: [] } } });
        expect(el('re-impacto').textContent).toContain('incompleto');
        expect(el('c').querySelector('[data-action="reAbrirRipd"]')).toBeNull();
        const f = await abrirComImpacto({ [`POST ${P}/ropa/r1/dpia`]: { ok: true, id: 'dp1' } });
        el('c').querySelector('[data-action="reAbrirRipd"]').click();
        await vi.waitFor(() => expect(chamadas(f)).toContain(`POST ${P}/ropa/r1/dpia`));
    });

    it('atividade sem o teste no servidor (nova) não mostra o bloco I', async () => {
        rascunho('resumo', { finalidade: 'Cobrança', titulares: ['Clientes pessoa física'], categorias: ['Financeiro'] });
        await abrir();
        expect(el('re-impacto')).toBeNull();
        expect(el('c').querySelector('[data-action="reAlterar"][data-args=\'["I"]\']')).toBeNull();
    });

    it('"Finalizar teste de impacto" é botão humano: grava finalizar (com o que mudou) e relê; finalizado, vira "Reabrir"', async () => {
        let lido = IMPACTO;
        const f = await abrirComImpacto();
        f.mockImplementation(async (url, opts = {}) => {
            const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
            if (k === `GET ${P}/ropa/r1/impacto`) return resposta(lido);
            if (k === `PUT ${P}/ropa/r1/impacto`) {
                const b = JSON.parse(opts.body);
                lido = { ...lido, perguntas: lido.perguntas.map((q) => (b.respostas[q.id] ? { ...q, resposta: b.respostas[q.id] } : q)), finalizado_em: b.finalizar ? '2026-10-14T12:00:00.000Z' : null };
                return resposta({ ok: true });
            }
            return resposta({ error: 'não dublado' }, 404);
        });
        irAoBlocoI();
        radio('monitoramento', 'nao').click();
        el('c').querySelector('[data-action="reFinalizarImpacto"]').click();
        await vi.waitFor(() => expect(el('re-impacto-final').textContent).toContain('finalizado em 14/10/2026'));
        expect(corpoDe(f, `PUT ${P}/ropa/r1/impacto`)).toEqual({ respostas: { monitoramento: 'nao' }, finalizar: true });
        f.mockClear();
        el('c').querySelector('[data-action="reFinalizarImpacto"]').click();
        await vi.waitFor(() => expect(el('re-impacto-final').textContent).toContain('Finalizar teste de impacto'));
        expect(corpoDe(f, `PUT ${P}/ropa/r1/impacto`)).toEqual({ respostas: {}, finalizar: false });
    });

    it('quem não entrevista (cliente comum) não vê o botão de finalizar', async () => {
        S.user = { role: 'org_user' };
        await abrirComImpacto();
        expect(el('c').querySelector('[data-action="reFinalizarImpacto"]')).toBeNull();
    });
});

describe('riscos da atividade na entrevista (F2): só leitura', () => {
    const REG = { id: 'r1', project_id: 'p1', processing_purpose: 'Folha', data_subjects: 'Colaboradores', data_categories: 'Identificação',
        dados_sensiveis: 0, criancas_adolescentes: 0, international_transfers: 0, dpia_required: 0, status: 'Draft', nao_informado: [], aprovacao_pedido: { ciso: null, ceo: null } };
    // Corpo de GET /projects/:p/ropa/:rid/riscos (src/routes/ropa.ts): { riscos: [...] }.
    const RISCOS = { riscos: [{ id: 'k1', threat: 'Acesso <b>indevido</b>', risk_level: 'High', residual_level: 'Low' }] };

    it('na pergunta de impacto do bloco H, mostra os riscos já registrados, escapados, e leva às ligações; nada é perguntado nem gravado', async () => {
        S.ropa = [REG];
        rascunho('impacto', {}, 'r1');
        const f = await abrir('r1', { [`GET ${P}/ropa/r1/riscos`]: RISCOS });
        const bloco = el('re-riscos');
        expect(bloco.textContent).toContain('Acesso <b>indevido</b> (nível Alto, residual Baixo)');
        expect(bloco.querySelector('b')).toBeNull();
        expect(JSON.parse(bloco.querySelector('[data-action="openLigacoesTratamento"]').getAttribute('data-args'))).toEqual(['p1', 'r1']);
        expect(chamadas(f).filter((c) => !c.startsWith('GET'))).toEqual([]);
    });

    it('sem risco registrado, diz isso; atividade nova não mostra o bloco', async () => {
        S.ropa = [REG];
        rascunho('impacto', {}, 'r1');
        await abrir('r1', { [`GET ${P}/ropa/r1/riscos`]: { riscos: [] } });
        expect(el('re-riscos').textContent).toContain('Nenhum risco registrado');
        rascunho('impacto', {});
        await abrir();
        expect(el('re-riscos')).toBeNull();
    });
});

describe('"Não sei agora"', () => {
    it('grava vazio (fica fora do corpo) e vira pendência no resumo', async () => {
        rascunho('retencao', { finalidade: 'Cobrança', titulares: ['Clientes pessoa física'], categorias: ['Financeiro'] });
        await abrir();
        naoSei();
        expect(titulo()).toBe('Como o dado é eliminado ao fim do prazo?');
        el('c').querySelector('[data-action="reVoltar"]').click();
        expect(opcoes().some((i) => i.checked)).toBe(false);
        rascunho('resumo', { finalidade: 'Cobrança', titulares: ['Clientes pessoa física'], categorias: ['Financeiro'], retencao: '__nao_sei' });
        const f = await abrir();
        expect(el('c').querySelector('.re-pendencias').textContent).toContain('Sem resposta: Retenção');
        expect(el('c').textContent).toContain('Não sei agora');
        await window.reSalvar();
        const corpo = corpoDe(f, `POST ${P}/ropa`);
        expect(corpo).not.toHaveProperty('retention_period');
        expect(corpo).not.toHaveProperty('legal_basis');
        expect(corpo).not.toHaveProperty('status');
    });
});

describe('edição de um registro existente', () => {
    const REG = { id: 'r1', project_id: 'p1', processing_purpose: 'Atendimento ao cliente <script>x</script>', data_subjects: 'Clientes pessoa física, Parceiros diversos',
        data_categories: 'Identificação, Contato, Saúde', legal_basis: 'Execucao contratual', dados_sensiveis: 1, criancas_adolescentes: 0,
        international_transfers: 1, transfer_safeguards: 'Normas corporativas globais', retention_period: '2 anos após o fim do contrato', recipients: 'Provedor de nuvem',
        dpia_required: 1, owner_parte_id: 'pe1', status: 'Draft', nao_informado: [], aprovacao_pedido: { ciso: null, ceo: null } };

    it('abre no resumo, pré-preenchida, com tudo escapado; salvar faz PUT sem status', async () => {
        S.ropa = [REG];
        const f = await abrir('r1');
        expect(el('h').textContent).toBe('Entrevista do RoPA: revisar atividade');
        expect(titulo()).toBe('Confira o que você nos contou');
        const texto = el('c').textContent;
        expect(texto).toContain('Atendimento ao cliente <script>x</script>');
        expect(el('c').querySelector('script')).toBeNull();
        expect(el('c').querySelector('b')).toBeNull();
        expect(texto).toContain('Ana <b>Exemplo</b>');
        expect(texto).toContain('Clientes pessoa física, Parceiros diversos');
        expect(texto).toContain('Execução de contrato ou procedimentos preliminares');
        expect(texto).toContain('2 anos após o fim do contrato');
        // o registro tem sensível com base do art. 7: o resumo aponta
        expect(texto).toContain('Base legal do art. 7 com dado sensível');
        await window.reSalvar();
        const corpo = corpoDe(f, 'PUT /api/v1/ropa/r1');
        expect(corpo).toMatchObject({ processing_purpose: REG.processing_purpose, data_subjects: 'Clientes pessoa física, Parceiros diversos',
            data_categories: 'Identificação, Contato, Saúde', dados_sensiveis: 1, international_transfers: 1, transfer_safeguards: 'Normas corporativas globais',
            retention_period: '2 anos após o fim do contrato', dpia_required: 1, owner_parte_id: 'pe1' });
        expect(corpo).not.toHaveProperty('status');
        // ligações não mudaram: nada de PUT de áreas e itens (substituiria o pedido de aprovação à toa)
        expect(chamadas(f)).not.toContain(`PUT ${P}/ropa/r1/departamentos`);
        expect(window.confirmar).not.toHaveBeenCalled();
    });

    it('registro aprovado: faixa de aviso e confirmar() antes de gravar; cancelar não grava', async () => {
        S.ropa = [{ ...REG, status: 'Approved' }];
        window.confirmar = vi.fn(async () => false);
        const f = await abrir('r1');
        expect(el('c').querySelector('.re-faixa').textContent).toContain('substitui o pedido de aprovação');
        await window.reSalvar();
        expect(window.confirmar).toHaveBeenCalledTimes(1);
        expect(chamadas(f)).not.toContain('PUT /api/v1/ropa/r1');
    });

    it('importado sem os riscos: crianças e transferência ficam sem resposta, não "Não"', () => {
        const r = respostasDoRegistro({ ...REG, dados_sensiveis: 0, international_transfers: 0, nao_informado: ['criancas_adolescentes', 'international_transfers'] },
            { pessoas: [], ligacoes: null, lia: null });
        expect(r).not.toHaveProperty('criancas');
        expect(r).not.toHaveProperty('transferencia');
        expect(r.sensiveis).toEqual(['__nenhum']);
    });
});

describe('sugestão de IA (base legal e retenção)', () => {
    const SUG = { ok: true, sugestao: { base_legal: 'lgpd:art7:i', retencao: '3 anos <i>após</i>', dpia_requerido: false, justificativa: 'Porque <img src=x>' } };

    it('só como proposta: cria o rascunho para a IA ler, mostra o aviso e aplica ao clicar', async () => {
        S.user = { role: 'org_admin' };
        rascunho('base', { finalidade: 'Newsletter', titulares: ['Clientes pessoa física'], categorias: ['Contato'], sensiveis: ['__nenhum'] });
        const f = await abrir(undefined, { [`POST ${P}/ropa/novo1/sugestao`]: SUG });
        el('c').querySelector('[data-action="reSugerir"]').click();
        await vi.waitFor(() => expect(el('c').querySelector('.re-sugestao strong')).not.toBeNull());
        expect(chamadas(f)).toEqual(expect.arrayContaining([`POST ${P}/ropa`, `POST ${P}/ropa/novo1/sugestao`]));
        expect(el('c').querySelector('.re-sugestao').textContent).toContain('Rascunho gerado por IA');
        expect(el('c').querySelector('.re-sugestao img')).toBeNull();
        expect(opcoes().some((i) => i.checked)).toBe(false);
        el('c').querySelector('[data-action="reUsarSugestao"]').click();
        expect(opcoes().find((i) => i.checked).value).toBe('Consentimento');
        // a partir daqui a atividade existe: salvar é PUT
        await window.reSalvar();
        expect(corpoDe(f, 'PUT /api/v1/ropa/novo1')).toMatchObject({ legal_basis: 'Consentimento', base_legal_id: 'lgpd:art7:i' });
    });

    it('nunca em sensíveis, crianças nem salvaguarda', () => {
        for (const id of ['sensiveis', 'criancas', 'transf_destino']) {
            const bloco = fonte.slice(fonte.indexOf(`{ id: '${id}'`), fonte.indexOf('{ id: ', fonte.indexOf(`{ id: '${id}'`) + 5));
            expect(bloco, id).not.toContain('sugerir');
        }
    });

    it('org_user não responde a entrevista', async () => {
        S.user = { role: 'org_user' };
        window.abrirRopaEntrevista('p1');
        expect(document.querySelector('.toast').textContent).toContain('equipe da consultoria');
    });
});

describe('montarPayload', () => {
    const c = { pessoas: [], catalogo: new Set() };
    it('sem catálogo vai só o texto; "Outro" entra pelo texto digitado; transferência sem mecanismo não inventa salvaguarda; responsável só em texto não é regravado', () => {
        const b = montarPayload({ finalidade: 'Portaria com reconhecimento facial ou de outro tipo, controle de visitantes', titulares: ['Visitantes', '__outro'], titulares_outro: 'Prestadores',
            categorias: ['Imagem e voz'], sensiveis: ['Biometria'], base: 'Prevenção à fraude e segurança do titular (art. 11)',
            transferencia: 'sim', transf_destino: { pais: 'Irlanda', mecanismo: 'Ainda sem mecanismo definido' }, responsavel_texto: 'Gerente de segurança' }, c);
        expect(b).toEqual({ processing_purpose: 'Portaria com reconhecimento facial ou de outro tipo, controle de visitantes',
            data_subjects: 'Visitantes, Prestadores', data_categories: 'Imagem e voz, Biometria', dados_sensiveis: 1,
            legal_basis: 'Prevenção à fraude e segurança do titular (art. 11)', international_transfers: 1, transfer_safeguards: null });
    });
});

describe('ligações no fim e cópia', () => {
    it('transferência com país, LIA e RIPD vão nas rotas de ligação; 409 do RIPD vira "já existia"', async () => {
        rascunho('resumo', { finalidade: 'Prevenção a fraude', titulares: ['Clientes pessoa física'], categorias: ['Acesso e uso'], sensiveis: ['__nenhum'],
            base: 'Legítimo interesse', lia: { finalidade_legitima: 'Evitar fraude', necessidade: 'Sem os registros não há como detectar', balanceamento: 'Esperado pelo cliente', conclusao: 'prevalece' },
            transferencia: 'sim', transf_destino: { pais: 'Irlanda', mecanismo: 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)' }, ripd: 'sim', criar_ripd: 'sim' });
        const f = await abrir(undefined, {
            [`POST ${P}/ropa/novo1/transferencias`]: { ok: true, id: 't1' },
            [`PUT ${P}/ropa/novo1/lia`]: { ok: true, id: 'l1' },
        });
        const base = f.getMockImplementation();
        f.mockImplementation(async (url, o = {}) => (o.method === 'POST' && url.endsWith('/ropa/novo1/dpia') ? resposta({ error: 'já existe', id: 'dp1' }, 409) : base(url, o)));
        await window.reSalvar();
        expect(corpoDe(f, `POST ${P}/ropa/novo1/transferencias`)).toEqual({ pais: 'Irlanda', mecanismo: 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)' });
        expect(corpoDe(f, `PUT ${P}/ropa/novo1/lia`)).toMatchObject({ status: 'concluida', conclusao: 'prevalece', salvaguardas: null });
        expect(corpoDe(f, `POST ${P}/ropa`)).toMatchObject({ legal_basis: 'Legítimo interesse', base_legal_id: 'lgpd:art7:ix', transfer_safeguards: 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)' });
        expect(el('c').textContent).toContain('O RIPD desta atividade já existia.');
        expect(el('c').querySelector('[role="alert"]')).toBeNull();
    });

    it('sem emoji, sem hex, sem diálogo nativo e sem handler inline', () => {
        expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(fonte).not.toMatch(/\son[a-z]+=/);
        expect(fonte).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
        expect(fonte).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\(/);
    });
});

describe('cadastrar durante a entrevista (pessoa, área, sistema)', () => {
    const basico = { finalidade: 'Folha de pagamento', titulares: ['Colaboradores'], categorias: ['Financeiro'] };
    const preencher = (id, v) => { const i = el(id); i.value = v; i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    const abrirCadastro = () => el('c').querySelector('[data-action="reCadastroAbrir"]').click();
    const salvarCadastro = () => el('c').querySelector('[data-action="reCadastrar"]').click();
    const marcado = () => opcoes().filter((i) => i.checked).map((i) => i.value);
    /** Reabre a entrevista no resumo com o rascunho da aba (como quem sai e volta), e o servidor já devolvendo o que foi criado. */
    async function noResumo(rotas) {
        const g = JSON.parse(sessionStorage.getItem('ropa-entrevista:p1:nova'));
        sessionStorage.setItem('ropa-entrevista:p1:nova', JSON.stringify({ ...g, passo: 'resumo' }));
        return abrir(undefined, rotas);
    }

    it('áreas e sistemas aparecem mesmo com o cadastro vazio, com "Cadastrar agora"', async () => {
        rascunho('responsavel', { ...basico });
        await abrir(undefined, { [`GET ${P}/departamentos`]: [], [`GET ${P}/assets`]: { ok: true, assets: [] } });
        proxima();
        expect(titulo()).toBe('Qual área executa a atividade?');
        expect(el('c').textContent).toContain('Nada cadastrado neste projeto ainda.');
        expect(el('re-busca')).toBeNull();
        expect(el('c').querySelector('[data-action="reCadastroAbrir"]').textContent).toContain('Cadastrar agora');
        rascunho('origem', { ...basico });
        await abrir(undefined, { [`GET ${P}/assets`]: { ok: true, assets: [] } });
        naoSei();
        expect(titulo()).toBe('Em quais sistemas ou arquivos esses dados passam?');
        expect(el('c').querySelector('[data-action="reCadastroAbrir"]')).not.toBeNull();
    });

    it('área: POST no cadastro de departamentos, entra marcada, fica no rascunho, aparece no resumo e é ligada ao salvar', async () => {
        rascunho('areas', { ...basico, areas: ['d1'] });
        const f = await abrir(undefined, { [`POST ${P}/departamentos`]: { ok: true, id: 'd9' } }); // nucleo.ts:93
        abrirCadastro();
        expect(document.activeElement).toBe(el('re-cad-nome'));
        preencher('re-cad-nome', 'Jurídico');
        salvarCadastro();
        await vi.waitFor(() => expect(el('re-cad-nome')).toBeNull());
        expect(corpoDe(f, `POST ${P}/departamentos`)).toEqual({ nome: 'Jurídico' });
        expect(marcado()).toEqual(['d1', 'd9']);
        expect(document.activeElement.value).toBe('d9');
        expect(titulo()).toBe('Qual área executa a atividade?');
        expect(JSON.parse(sessionStorage.getItem('ropa-entrevista:p1:nova')).respostas.areas).toEqual(['d1', 'd9']);
        const g = await noResumo({ [`GET ${P}/departamentos`]: [{ id: 'd1', nome: 'Pessoas' }, { id: 'd9', nome: 'Jurídico' }] });
        expect(el('re-criados').textContent).toBe('Cadastrados durante a entrevista: Área Jurídico.');
        expect(el('c').textContent).toContain('Pessoas, Jurídico');
        await window.reSalvar();
        expect(corpoDe(g, `PUT ${P}/ropa/novo1/departamentos`)).toEqual({ departamentos: ['d1', 'd9'] });
    });

    it('sistema: POST no inventário com nome e tipo, entra marcado; Enter no nome salva', async () => {
        rascunho('sistemas', { ...basico });
        const f = await abrir(undefined, { [`POST ${P}/assets`]: { ok: true, id: 'i9' } }); // project-assets.ts:25
        abrirCadastro();
        preencher('re-cad-nome', 'Planilha de benefícios');
        preencher('re-cad-categoria', 'Informacao');
        el('re-cad-nome').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(marcado()).toEqual(['i9']));
        expect(corpoDe(f, `POST ${P}/assets`)).toEqual({ name: 'Planilha de benefícios', category: 'Informacao' });
        expect(el('c').textContent).toContain('arquivo ou base');
        expect(titulo()).toBe('Em quais sistemas ou arquivos esses dados passam?');
    });

    it('pessoa: POST de parte tipo pessoa com e-mail, entra escolhida e vira o owner_parte_id', async () => {
        rascunho('responsavel', { ...basico });
        const f = await abrir(undefined, { [`POST ${P}/partes`]: { ok: true, id: 'pe9' } }); // nucleo.ts:149
        abrirCadastro();
        preencher('re-cad-nome', 'Bruno Fictício');
        preencher('re-cad-email', 'bruno@exemplo.com');
        salvarCadastro();
        await vi.waitFor(() => expect(marcado()).toEqual(['pe9']));
        expect(corpoDe(f, `POST ${P}/partes`)).toEqual({ tipo: 'pessoa', nome: 'Bruno Fictício', email: 'bruno@exemplo.com' });
        const g = await noResumo({ [`GET ${P}/partes`]: [{ id: 'pe9', nome: 'Bruno Fictício', email: 'bruno@exemplo.com' }] });
        expect(el('re-criados').textContent).toBe('Cadastrados durante a entrevista: Pessoa Bruno Fictício.');
        await window.reSalvar();
        expect(corpoDe(g, `POST ${P}/ropa`)).toMatchObject({ owner_parte_id: 'pe9', owner: 'Bruno Fictício' });
    });

    it('erro da API aparece na região viva da pergunta e o que foi digitado fica', async () => {
        rascunho('areas', { ...basico });
        const f = await abrir();
        const base = f.getMockImplementation();
        f.mockImplementation(async (url, o = {}) => (o.method === 'POST' && url.endsWith('/departamentos')
            ? resposta({ error: 'Já existe um departamento com esse nome neste projeto' }, 409) : base(url, o)));
        abrirCadastro();
        preencher('re-cad-nome', 'Jurídico');
        salvarCadastro();
        await vi.waitFor(() => expect(el('re-erro').textContent).toContain('Já existe um departamento com esse nome'));
        expect(el('re-erro').getAttribute('aria-live')).toBe('polite');
        expect(el('re-cad-nome').value).toBe('Jurídico');
        expect(marcado()).toEqual([]);
        // com o cadastro aberto, Próxima não pula
        proxima();
        expect(el('re-erro').textContent).toBe('Salve ou cancele o cadastro aberto antes de seguir.');
        expect(titulo()).toBe('Qual área executa a atividade?');
    });

    it('anti-duplicata: parecido oferece o existente; nome igual é recusado sem chamar a API', async () => {
        rascunho('sistemas', { ...basico });
        const f = await abrir();
        abrirCadastro();
        preencher('re-cad-nome', 'Payroll');
        expect(el('re-similares').textContent).toContain('Já existe: Sistema de folha');
        expect(el('re-similares').textContent).toContain('sinônimo');
        preencher('re-cad-nome', 'folha');
        expect(el('re-similares').textContent).toContain('Já existe com este nome: Sistema de folha');
        salvarCadastro();
        expect(el('re-erro').textContent).toBe('Já existe com este nome: Sistema de folha. Use o existente.');
        expect(chamadas(f)).not.toContain(`POST ${P}/assets`);
        el('re-similares').querySelector('[data-action="reUsarExistente"]').click();
        expect(marcado()).toEqual(['i1']);
        expect(el('re-cad-nome')).toBeNull();
    });

    it('pessoa com e-mail de alguém já cadastrado: oferece usar a pessoa existente; o nome vem escapado', async () => {
        rascunho('responsavel', { ...basico });
        const f = await abrir(undefined, { [`GET ${P}/partes`]: [{ id: 'pe1', nome: 'Ana <b>Exemplo</b>', email: 'ana@exemplo.com' }] });
        abrirCadastro();
        preencher('re-cad-nome', 'A. Fulana');
        preencher('re-cad-email', 'ANA@exemplo.com');
        expect(el('re-similares').textContent).toContain('Já existe uma pessoa com este e-mail: Ana <b>Exemplo</b> (ana@exemplo.com)');
        expect(el('re-similares').querySelector('b')).toBeNull();
        el('re-similares').querySelector('[data-action="reUsarExistente"]').click();
        expect(marcado()).toEqual(['pe1']);
        expect(chamadas(f)).not.toContain(`POST ${P}/partes`);
    });

    it('busca filtra a lista na hora, sem acento nem caixa', async () => {
        rascunho('areas', { ...basico });
        await abrir();
        preencher('re-busca', 'FINAN');
        const naLista = [...el('c').querySelectorAll('.re-opcao')].filter((l) => !l.hidden).map((l) => l.textContent.trim());
        expect(naLista).toEqual(['Financeiro']);
        preencher('re-busca', 'xyz');
        expect(el('re-busca-vazia').textContent).toBe('Nada na lista com esse nome.');
        // o que foi buscado vira o nome no "Cadastrar agora"
        abrirCadastro();
        expect(el('re-cad-nome').value).toBe('xyz');
    });

    it('quem não cria o cadastro vê a lista e a busca, sem o botão', async () => {
        S.user = { role: 'org_admin' };
        rascunho('areas', { ...basico });
        await abrir();
        expect(el('re-busca')).not.toBeNull();
        expect(el('c').querySelector('[data-action="reCadastroAbrir"]')).toBeNull();
        expect(el('c').textContent).toContain('Peça a quem administra o cadastro.');
    });

    it('o administrador da consultoria também vê o "Cadastrar agora"', async () => {
        S.user = { role: 'consultoria_admin' };
        rascunho('areas', { ...basico });
        await abrir();
        expect(el('c').querySelector('[data-action="reCadastroAbrir"]')).not.toBeNull();
        expect(el('c').textContent).not.toContain('Peça a quem administra o cadastro.');
    });

    it('registro antigo só com owner em texto: mostra o texto, pede a pessoa e não regrava o owner', async () => {
        S.ropa = [{ id: 'r1', project_id: 'p1', processing_purpose: 'Portaria', data_subjects: 'Visitantes', data_categories: 'Identificação',
            owner: 'Gerente <img src=x>', owner_parte_id: null, status: 'Draft', nao_informado: [], aprovacao_pedido: { ciso: null, ceo: null } }];
        const f = await abrir('r1');
        expect(el('c').textContent).toContain('Gerente <img src=x> (só texto, sem cadastro)');
        expect(el('c').querySelector('.re-pendencias').textContent).toContain('Responsável só em texto');
        expect(el('c').querySelector('img')).toBeNull();
        window.reAlterar('A'); proxima(); // finalidade -> responsável
        expect(titulo()).toBe('Quem responde por essa atividade na empresa?');
        expect(el('c').textContent).toContain('Hoje o responsável está só em texto');
        abrirCadastro();
        expect(el('re-cad-nome').value).toBe('Gerente <img src=x>');
        window.reCadastroFechar();
        await window.reSalvar();
        const corpo = corpoDe(f, 'PUT /api/v1/ropa/r1');
        expect(corpo).not.toHaveProperty('owner');
        expect(corpo).not.toHaveProperty('owner_parte_id');
    });

    it('rascunho guardado com a antiga "Outra pessoa" vira texto à espera da pessoa', async () => {
        rascunho('resumo', { ...basico, responsavel: '__outro', responsavel_outro: 'Coordenação' });
        const f = await abrir();
        expect(el('c').textContent).toContain('Coordenação (só texto, sem cadastro)');
        await window.reSalvar();
        expect(corpoDe(f, `POST ${P}/ropa`)).not.toHaveProperty('owner');
    });
});

describe('parecidos por significado (servidor) no "Cadastrar agora"', () => {
    const basico = { finalidade: 'Folha de pagamento', titulares: ['Colaboradores'], categorias: ['Financeiro'] };
    const SIM = `POST ${P}/similares`;
    const preencher = (id, v) => { const i = el(id); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
    const abrirCadastro = () => el('c').querySelector('[data-action="reCadastroAbrir"]').click();
    const marcado = () => opcoes().filter((i) => i.checked).map((i) => i.value);
    const pedidos = (f) => f.mock.calls.filter(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === SIM).map(([, o]) => JSON.parse(o.body));
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
    afterEach(() => { vi.useRealTimers(); });

    it('sistema: depois de 600 ms sem digitar, pergunta ao servidor e oferece o existente; "Usar este" marca', async () => {
        rascunho('sistemas', { ...basico });
        // src/routes/similares.ts: { resultados: [{ id, nome, score }] }
        const f = await abrir(undefined, { [SIM]: { resultados: [{ id: 'i1', nome: 'Sistema de folha', score: 0.91 }] } });
        abrirCadastro();
        preencher('re-cad-nome', 'contracheque');
        expect(el('re-similares-busca').textContent).toBe('buscando parecidos…');
        expect(el('re-similares-busca').getAttribute('aria-live')).toBe('polite');
        await vi.advanceTimersByTimeAsync(599);
        expect(pedidos(f)).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        await vi.waitFor(() => expect(el('re-similares').textContent).toContain('Já existe: Sistema de folha (item; parecido por significado). Usar este?'));
        expect(pedidos(f)).toEqual([{ tipo: 'item', nome: 'contracheque' }]);
        expect(el('re-similares-busca').textContent).toBe('');
        el('re-similares').querySelector('[data-action="reUsarExistente"]').click();
        expect(marcado()).toEqual(['i1']);
    });

    it('debounce: digitação seguida vira uma chamada só, com o último nome; área manda tipo area', async () => {
        rascunho('areas', { ...basico });
        const f = await abrir(undefined, { [SIM]: { resultados: [] } });
        abrirCadastro();
        for (const v of ['cont', 'contra', 'contracheque']) { preencher('re-cad-nome', v); await vi.advanceTimersByTimeAsync(300); }
        await vi.advanceTimersByTimeAsync(600);
        expect(pedidos(f)).toEqual([{ tipo: 'area', nome: 'contracheque' }]);
        expect(el('re-similares').textContent).toBe('');
    });

    it('resposta de um nome superado não sobrescreve a do nome atual', async () => {
        rascunho('sistemas', { ...basico });
        const f = await abrir();
        const base = f.getMockImplementation();
        const pendentes = [];
        f.mockImplementation((url, o = {}) => (o.method === 'POST' && url.endsWith('/similares')
            ? new Promise((ok) => pendentes.push({ nome: JSON.parse(o.body).nome, ok })) : base(url, o)));
        abrirCadastro();
        preencher('re-cad-nome', 'contracheque');
        await vi.advanceTimersByTimeAsync(600);
        preencher('re-cad-nome', 'controle de portaria');
        await vi.advanceTimersByTimeAsync(600);
        expect(pendentes.map((x) => x.nome)).toEqual(['contracheque', 'controle de portaria']);
        pendentes[1].ok(resposta({ resultados: [] }));
        await vi.waitFor(() => expect(el('re-similares-busca').textContent).toBe(''));
        pendentes[0].ok(resposta({ resultados: [{ id: 'i1', nome: 'Sistema de folha', score: 0.9 }] }));
        await vi.advanceTimersByTimeAsync(0);
        expect(el('re-similares').textContent).toBe('');
    });

    it('erro ou indisponível: silêncio, sem aviso nem toast', async () => {
        rascunho('sistemas', { ...basico });
        const f = await abrir(undefined, { [SIM]: { resultados: [], indisponivel: true } });
        abrirCadastro();
        preencher('re-cad-nome', 'contracheque');
        await vi.advanceTimersByTimeAsync(600);
        await vi.waitFor(() => expect(el('re-similares-busca').textContent).toBe(''));
        expect(el('re-similares').textContent).toBe('');
        const base = f.getMockImplementation();
        f.mockImplementation(async (url, o = {}) => (o.method === 'POST' && url.endsWith('/similares') ? resposta({ error: 'Limite' }, 429) : base(url, o)));
        preencher('re-cad-nome', 'controle de portaria');
        await vi.advanceTimersByTimeAsync(600);
        await vi.waitFor(() => expect(el('re-similares-busca').textContent).toBe(''));
        expect(el('re-similares').textContent).toBe('');
        expect(el('re-erro').textContent).toBe('');
        expect(document.querySelector('.toast')).toBeNull();
    });

    it('não pergunta ao servidor para pessoa, nome curto, quando a regra já achou ou com o cadastro fechado', async () => {
        rascunho('responsavel', { ...basico });
        let f = await abrir(undefined, { [SIM]: { resultados: [] } });
        abrirCadastro();
        preencher('re-cad-nome', 'Bruno Fictício');
        await vi.advanceTimersByTimeAsync(1000);
        expect(el('re-similares-busca')).toBeNull();
        expect(pedidos(f)).toEqual([]);
        rascunho('sistemas', { ...basico });
        f = await abrir(undefined, { [SIM]: { resultados: [] } });
        abrirCadastro();
        preencher('re-cad-nome', 'abc');
        await vi.advanceTimersByTimeAsync(1000);
        preencher('re-cad-nome', 'Payroll'); // a regra acha "Sistema de folha" por sinônimo
        await vi.advanceTimersByTimeAsync(1000);
        expect(el('re-similares').textContent).toContain('sinônimo');
        expect(pedidos(f)).toEqual([]);
        preencher('re-cad-nome', 'contracheque');
        window.reCadastroFechar();
        await vi.advanceTimersByTimeAsync(1000);
        expect(pedidos(f)).toEqual([]);
    });
});

describe('ciclo de vida e outras bases (F3): lê o que está gravado e grava só o que mudou', () => {
    const REG = { id: 'r1', project_id: 'p1', processing_purpose: 'Folha', data_subjects: 'Colaboradores', data_categories: 'Identificação',
        legal_basis: 'Cumprimento de obrigação legal ou regulatória', base_legal_id: 'lgpd:art7:ii',
        dados_sensiveis: 0, criancas_adolescentes: 0, international_transfers: 0, dpia_required: 0, status: 'Draft', nao_informado: [], aprovacao_pedido: { ciso: null, ceo: null } };
    // Corpo de GET .../ciclo (lerCiclo, src/services/ciclo.ts) e de GET .../bases (lerBases, src/services/bases.ts). Textos fictícios.
    const etapa = (e, rotulo, x = {}) => ({ etapa: e, rotulo, situacao: null, item_id: null, item_nome: null, descricao: null, ...x });
    const CICLO = { etapas: [
        etapa('coleta', 'Coleta <b>x</b>', { situacao: 'registrada', item_id: 'i1', descricao: 'A própria pessoa, Fonte pública' }),
        etapa('uso', 'Uso'), etapa('compartilhamento_interno', 'Compartilhamento interno'),
        etapa('compartilhamento_externo', 'Compartilhamento externo', { situacao: 'nao_aplicavel' }),
        etapa('armazenamento', 'Armazenamento'),
        etapa('eliminacao', 'Eliminação', { situacao: 'registrada', descricao: 'Anonimização' }),
    ] };
    const BASES = { principal: { id: 'lgpd:art7:ii' }, adicionais: [{ requisito_id: 'lgpd:art7:i', referencia: 'art. 7, I', titulo: 'Consentimento', observacao: 'Só o benefício opcional' }], base_gdpr: 'Art. 6(1)(c) <i>x</i>' };
    const abrirF3 = (extra = {}) => {
        S.ropa = [REG];
        return abrir('r1', { [`GET ${P}/ropa/r1/ciclo`]: CICLO, [`GET ${P}/ropa/r1/bases`]: BASES,
            [`PUT ${P}/ropa/r1/ciclo`]: { ok: true }, [`PUT ${P}/ropa/r1/bases`]: { ok: true }, ...extra });
    };
    const alterar = (bloco) => el('c').querySelector(`[data-action="reAlterar"][data-args='["${bloco}"]']`).click();

    it('o resumo mostra o que está gravado (escapado) e salvar sem mexer não regrava ciclo nem bases', async () => {
        const f = await abrirF3();
        const texto = el('c').textContent;
        expect(texto).toContain('A própria pessoa, Fonte pública');
        expect(texto).toContain('3 de 6 etapas respondidas');
        expect(texto).toContain('Anonimização');
        expect(texto).toContain('Consentimento');
        expect(texto).toContain('Art. 6(1)(c) <i>x</i>');
        expect(el('c').querySelector('i')).toBeNull();
        expect(el('c').textContent).not.toContain('Sem resposta: Origem');
        await window.reSalvar();
        expect(chamadas(f)).not.toContain(`PUT ${P}/ropa/r1/ciclo`);
        expect(chamadas(f)).not.toContain(`PUT ${P}/ropa/r1/bases`);
    });

    it('as etapas vêm do servidor, com a seleção gravada; mudar uma etapa grava o ciclo com as descrições de origem e eliminação', async () => {
        const f = await abrirF3();
        alterar('E');
        expect(titulo()).toBe('De onde vêm os dados?');
        expect(opcoes().filter((i) => i.checked).map((i) => i.value)).toEqual(['A própria pessoa', 'Fonte pública']);
        proxima(); proxima(); // origem, sistemas
        expect(titulo()).toContain('Em cada etapa da vida do dado');
        expect(el('c').querySelector('label[for="re-ciclo-coleta"]').textContent).toBe('Coleta <b>x</b>');
        expect(el('re-ciclo-coleta').value).toBe('i1');
        expect(el('re-ciclo-compartilhamento_externo').value).toBe('__nao_aplicavel');
        expect(el('re-ciclo-uso').value).toBe('');
        const uso = el('re-ciclo-uso');
        uso.value = '__registrada';
        uso.dispatchEvent(new Event('change', { bubbles: true }));
        proxima();
        await window.reSalvar();
        expect(corpoDe(f, `PUT ${P}/ropa/r1/ciclo`)).toEqual({ etapas: [
            { etapa: 'coleta', situacao: 'registrada', item_id: 'i1', descricao: 'A própria pessoa, Fonte pública' },
            { etapa: 'compartilhamento_externo', situacao: 'nao_aplicavel' },
            { etapa: 'eliminacao', situacao: 'registrada', item_id: null, descricao: 'Anonimização' },
            { etapa: 'uso', situacao: 'registrada', item_id: null },
        ] });
        expect(chamadas(f)).not.toContain(`PUT ${P}/ropa/r1/bases`);
    });

    it('as outras bases vêm marcadas, sem a principal; marcar mais uma grava o conjunto e o GDPR, mantendo a observação', async () => {
        const f = await abrirF3();
        alterar('D');
        while (!titulo().includes('outra hipótese legal')) proxima();
        expect(opcoes().map((i) => i.value)).not.toContain('lgpd:art7:ii');
        expect(opcoes().find((i) => i.value === 'lgpd:art7:i').checked).toBe(true);
        marcar('lgpd:art7:ix'); proxima();
        expect(el('re-campo').value).toBe('Art. 6(1)(c) <i>x</i>');
        digitar('Art. 6(1)(c)'); proxima();
        await window.reSalvar();
        expect(corpoDe(f, `PUT ${P}/ropa/r1/bases`)).toEqual({
            adicionais: [{ requisito_id: 'lgpd:art7:i', observacao: 'Só o benefício opcional' }, { requisito_id: 'lgpd:art7:ix', observacao: null }],
            base_gdpr: 'Art. 6(1)(c)',
        });
    });

    it('origem e eliminação fora das opções não são reescritas; "Ainda não definimos" não grava; a principal não vira adicional', () => {
        const ctx0 = { pessoas: [], ligacoes: null, lia: null, impacto: null, bases: null,
            ciclo: [etapa('coleta', 'Coleta', { situacao: 'registrada', descricao: 'Planilha do parceiro' }), etapa('eliminacao', 'Eliminação', { situacao: 'registrada', descricao: 'Texto livre' })] };
        const r = respostasDoRegistro(REG, ctx0);
        expect(r).not.toHaveProperty('origem');
        expect(r).not.toHaveProperty('eliminacao');
        expect(montarCiclo(r)).toEqual([{ etapa: 'coleta', situacao: 'registrada', item_id: null }, { etapa: 'eliminacao', situacao: 'registrada', item_id: null }]);
        expect(montarCiclo({ eliminacao: 'Ainda não definimos' })).toEqual([]);
        expect(montarBases({ base: 'Cumprimento de obrigação legal ou regulatória', bases_adicionais: ['lgpd:art7:ii', 'lgpd:art7:i'] }, { bases: null }))
            .toEqual({ adicionais: [{ requisito_id: 'lgpd:art7:i', observacao: null }] });
    });
});
