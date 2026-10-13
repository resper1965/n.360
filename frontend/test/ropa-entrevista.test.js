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
import { montarPayload, motivosRipd, respostasDoRegistro } from '../src/views/ropa-entrevista.js';
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
        naoSei(); // origem
        marcar('i1'); proxima();
        marcar('sim'); proxima();
        digitar('Contabilidade externa'); proxima();
        marcar('5 anos (obrigação fiscal e contábil)'); proxima();
        naoSei(); // eliminação
        marcar('nao'); proxima(); // transferência
        naoSei(); // impacto
        expect(el('re-recomendacao').textContent).toContain('Nenhum gatilho');
        marcar('nao'); proxima(); // RIPD
        expect(titulo()).toBe('Confira o que você nos contou');
        expect(el('c').textContent).toContain('Folha de pagamento');
        // as perguntas sem coluna (volume, origem, eliminação, impacto) aparecem no resumo, mas não viram pendência
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
        expect(chamadas(f).filter((c) => c.startsWith('POST') || c.startsWith('PUT'))).toHaveLength(3);
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
        expect(titulo()).toBe('De onde vêm os dados?');
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
    it('sem catálogo vai só o texto; "Outro" entra pelo texto digitado; transferência sem mecanismo não inventa salvaguarda', () => {
        const b = montarPayload({ finalidade: 'Portaria com reconhecimento facial ou de outro tipo, controle de visitantes', titulares: ['Visitantes', '__outro'], titulares_outro: 'Prestadores',
            categorias: ['Imagem e voz'], sensiveis: ['Biometria'], base: 'Prevenção à fraude e segurança do titular (art. 11)',
            transferencia: 'sim', transf_destino: { pais: 'Irlanda', mecanismo: 'Ainda sem mecanismo definido' }, responsavel: '__outro', responsavel_outro: 'Gerente de segurança' }, c);
        expect(b).toEqual({ processing_purpose: 'Portaria com reconhecimento facial ou de outro tipo, controle de visitantes', owner: 'Gerente de segurança', owner_parte_id: null,
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
