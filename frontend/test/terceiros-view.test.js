// Fornecedores (n.privacy): lista com filtros e a ficha em página própria, em abas. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { navigate } from '../src/router.js';
import '../src/ui.js';
import '../src/views/terceiros.js';

const B = '/api/v1/projects/p9/terceiros';
const T = (id, extra = {}) => ({ id, nome: `Terceiro ${id}`, terceiro_tipo: 'medio', metodo: 'questionario', pode_questionario: true, situacao: 'vigente', ultima_avaliacao: { resultado: 'aprovado', valido_ate: '2027-01-31', metodo: 'questionario' }, tratamentos: 2, documentos: 1, nivel: 'medio', dpa: true, atividades: 2, pendencias: [], ...extra });
const LISTA = [
    T('a', { nome: 'Nuvem <b>Grande</b>', questionario: { enviada_em: '2026-10-05 09:00:00', percentual: 80, respondidas: 8, total: 10 } }),
    T('b', { situacao: 'vencida', nivel: 'alto', dpa: false, pendencias: ['Avaliação', 'DPA'], ultima_avaliacao: { resultado: 'aprovado', valido_ate: '2025-01-01', metodo: 'questionario' } }),
    T('c', { terceiro_tipo: null, metodo: null, pode_questionario: false, situacao: 'pendente', ultima_avaliacao: null, tratamentos: 0, documentos: 0, nivel: null, dpa: false, atividades: 0, pendencias: ['Tipo', 'Criticidade', 'Avaliação', 'DPA'] }),
];
const SEGURANCA = { id: 'v1', name: 'Nuvem <b>Grande</b>', category: 'Nuvem', status: 'Active', has_iso27001: 1, has_iso27701: 0, has_soc2: 0, has_mfa: 1, has_encryption: 0, has_backup: 0, has_incident_plan: 0, has_pentest: 0, dpa_signed: 0, trust_center_url: 'https://trust.exemplo.com', dpa_url: null, attached_certifications: 'PCI-DSS', notes: 'Obs <i>x</i>' };
const FICHA = (extra = {}) => ({
    ...T('a', { nome: 'Nuvem <b>Grande</b>' }),
    email: 'contato@fornecedor.exemplo',
    seguranca: SEGURANCA,
    historico: [{ id: 'h1', metodo: 'questionario', resultado: 'aprovado', valido_ate: '2027-01-31', evidencia_url: 'https://trust.exemplo.com/x', observacao: 'Sem <b>ressalva</b>', avaliado_por: 'cons@ness.lat', created_at: '2026-10-01 10:00:00' },
        { id: 'h0', metodo: 'questionario', resultado: 'reprovado', valido_ate: '2026-12-01', evidencia_url: 'javascript:alert(1)', observacao: null, avaliado_por: 'x', created_at: '2026-09-01 10:00:00' }],
    documentos_ligados: [{ id: 'd1', titulo: 'DPA <i>Nuvem</i>', status: 'vigente', papel: 'dpa' }],
    suboperadores: [{ id: 's1', nome: 'Sub <b>x</b>' }],
    tratamentos_afetados: [{ id: 'r1', finalidade: 'Folha <b>y</b>', origem: 'vinculo' }, { id: 'r2', finalidade: 'Cobrança', origem: 'compartilhamento_externo' }],
    ...extra,
});
const rotas = (extra = {}) => ({
    [`GET ${B}`]: LISTA,
    [`GET ${B}/a`]: FICHA(),
    [`GET ${B}/a/criticidades`]: { atual: null, historico: [] },
    'GET /api/v1/projects/p9/documentos': [{ id: 'd1', titulo: 'DPA Nuvem' }, { id: 'd2', titulo: 'Contrato Mestre' }],
    'GET /api/v1/projects/p9/documentos-arquivo': [{ id: 'ar1', nome: 'DPA <b>assinado</b>' }],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}${new URL(u, 'http://localhost').search}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.findLast(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);
const PALCO = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';

async function lista(extra = {}) {
    document.body.innerHTML = PALCO;
    const f = servir(rotas(extra));
    await window.renderTerceiros(el('c'), el('h'), el('a'));
    return f;
}
async function ficha(extra = {}, aba = '') {
    document.body.innerHTML = PALCO;
    history.replaceState(null, '', `/privacy?tela=terceiro&parte=a${aba ? `&aba=${aba}` : ''}`);
    const f = servir(rotas(extra));
    await window.renderTerceiro(el('c'), el('h'), el('a'));
    return f;
}
const linhas = () => [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.textContent);

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.terceiro = null;
    window.render = vi.fn();
    navigate.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('lista', () => {
    it('título Fornecedores e as colunas da spec; nível, DPA e atividades, tudo escapado; avisa quantos estão vencidos', async () => {
        await lista();
        expect(el('h').textContent).toBe('Fornecedores');
        expect([...el('c').querySelectorAll('thead th')].map((th) => th.textContent.trim()))
            .toEqual(['Fornecedor', 'CNPJ', 'Criticidade', 'Tipo', 'Avaliação', 'Vale até', 'Data de envio', '% do questionário', 'DPA', 'Situação do TPRM', 'Atividades', 'Ações']);
        const [a, b, c] = linhas();
        expect(a).toContain('Nuvem <b>Grande</b>');
        expect(a).toContain('05/10/2026');
        expect(a).toContain('80%');
        expect(b).not.toContain('%');
        expect(a).toContain('Médio');
        expect(a).toContain('Vigente');
        expect(a).toContain('31/01/2027');
        expect(a).toContain('Sim');
        expect(b).toContain('Alto');
        expect(b).toContain('Vencida');
        expect(b).toContain('Não');
        expect(c).toContain('Não avaliada');
        expect(c).toContain('Pendente');
        expect(el('c').textContent).toContain('1 fornecedor com avaliação vencida');
        expect(el('c').querySelector('tbody b')).toBeNull();
    });

    it('busca pelo nome, sem acento e sem ir ao servidor', async () => {
        const f = await lista();
        const antes = f.mock.calls.length;
        window.listaBuscar('tc', 'NUVEM');
        expect(linhas()).toHaveLength(1);
        window.listaBuscar('tc', 'zzz');
        expect(el('c').textContent).toContain('Nada encontrado com a busca ou o filtro');
        expect(f.mock.calls.length).toBe(antes);
    });

    it('coluna Situação do TPRM: Completo ou Falta: ...; filtro Pendência na própria tela', async () => {
        const f = await lista();
        const [a, b, c] = linhas();
        expect(a).toContain('Completo');
        expect(b).toContain('Falta: Avaliação, DPA');
        expect(c).toContain('Falta: Tipo, Criticidade, Avaliação, DPA');
        const antes = f.mock.calls.length;
        const filtra = (v) => { window.listaFiltrar('tc', 'pendencia', v); return linhas(); };
        expect([...el('tc-f-pendencia').options].map((o) => o.textContent))
            .toEqual(['Todos', 'Completos', 'Com pendência', 'Falta Tipo', 'Falta Criticidade', 'Falta Avaliação', 'Falta DPA']);
        expect(filtra('completo')).toHaveLength(1);
        expect(filtra('pendente')).toHaveLength(2);
        expect(filtra('DPA')).toHaveLength(2);
        expect(filtra('Tipo')[0]).toContain('Terceiro c');
        expect(filtra('Criticidade')).toHaveLength(1);
        expect(f.mock.calls.length).toBe(antes);
        expect(el('tc-f-pendencia').getAttribute('data-action-change')).toBe('listaFiltrar');
    });

    it('filtros de criticidade e de situação, na própria tela e sem servidor', async () => {
        const f = await lista();
        const antes = f.mock.calls.length;
        expect(el('tc-contagem').textContent).toBe('3');
        expect(el('c').querySelector('.tc-filtros')).toBeNull();
        window.listaFiltrar('tc', 'nivel', 'nao_avaliada');
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0]).toContain('Terceiro c');
        expect(el('tc-contagem').textContent).toBe('1 de 3');
        window.listaFiltrar('tc', 'nivel', '');
        window.listaFiltrar('tc', 'situacao', 'vencida');
        expect(linhas()).toHaveLength(1);
        expect(linhas()[0]).toContain('Terceiro b');
        window.listaFiltrar('tc', 'nivel', 'baixo');
        expect(el('c').textContent).toContain('Nada encontrado com a busca ou o filtro.');
        expect(f.mock.calls.length).toBe(antes);
        expect([...el('tc-f-nivel').options].map((o) => o.value)).toEqual(['', 'alto', 'medio', 'baixo', 'nao_avaliada']);
        expect([...el('tc-f-situacao').options].map((o) => o.value)).toEqual(['', 'pendente', 'vigente', 'vencida', 'reprovada']);
        expect(el('tc-f-nivel').getAttribute('data-action-change')).toBe('listaFiltrar');
    });

    it('sem projeto ativo: estado vazio; sem fornecedores: mensagem com a ponte para Partes', async () => {
        S.activeProject = null; S.projects = [];
        await lista();
        expect(el('c').textContent).toContain('Sem projeto ativo');
        S.activeProject = { id: 'p9' };
        await lista({ [`GET ${B}`]: [] });
        expect(el('c').textContent).toContain('Nenhuma organização cadastrada');
        const vazio = el('c').querySelector('.empty-state');
        expect(JSON.parse(vazio.querySelector('[data-action="importarPartes"]').getAttribute('data-args'))).toEqual(['p9']);
        expect(vazio.querySelector('[data-action="openNovaParteModal"]')).not.toBeNull();
    });

    it('header tem "Cadastrar fornecedor", que abre a nova parte já como organização; quem só lê não vê botões', async () => {
        await lista();
        const b = el('a').querySelector('[data-action="openNovaParteModal"]');
        expect(b.textContent).toBe('Cadastrar fornecedor');
        expect(JSON.parse(b.getAttribute('data-args'))).toEqual(['p9', 'organizacao']);
        S.user = { role: 'org_user' };
        await lista();
        expect(el('a').innerHTML).toBe('');
    });

    it('Abrir leva à ficha em página própria, com a parte no endereço', async () => {
        await lista();
        const abrir = el('c').querySelector('[data-action="abrirTerceiro"]');
        expect(JSON.parse(abrir.getAttribute('data-args'))).toEqual(['p9', 'a']);
        await window.abrirTerceiro('p9', 'a');
        expect(navigate).toHaveBeenCalledWith('terceiro');
        const q = new URLSearchParams(window.location.search);
        expect([q.get('tela'), q.get('parte'), q.get('aba')]).toEqual(['terceiro', 'a', 'cadastro']);
        expect(S.terceiro).toEqual({ projectId: 'p9', parteId: 'a' });
    });
});

describe('ficha: abas', () => {
    const ABAS = ['Cadastro', 'Criticidade', 'Avaliações', 'Segurança', 'Documentos', 'Atividades de tratamento', 'Suboperadores'];

    it('sete abas na ordem, WAI-ARIA, a ativa vem do endereço (sem ela, Cadastro)', async () => {
        await ficha();
        const abas = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
        expect(abas.map((b) => b.textContent.trim())).toEqual(ABAS);
        expect(abas.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false']);
        expect(el('tc-painel').getAttribute('role')).toBe('tabpanel');
        await ficha({}, 'documentos');
        expect(document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim()).toBe('Documentos');
        await ficha({}, 'inexistente');
        expect(document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim()).toBe('Cadastro');
    });

    it('a ficha mostra a linha Situação do TPRM no topo', async () => {
        await ficha();
        expect(el('tc-tprm').textContent).toBe('Situação do TPRM: Completo');
        await ficha({ [`GET ${B}/a`]: FICHA({ pendencias: ['Tipo', 'DPA'] }) });
        expect(el('tc-tprm').textContent).toBe('Situação do TPRM: Falta: Tipo, DPA');
    });

    it('trocar de aba grava a aba no endereço e repinta', async () => {
        await ficha();
        await window.tcIrParaAba({}, 'seguranca');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('seguranca');
        expect(document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim()).toBe('Segurança');
    });

    it('seta para a direita vai para a próxima aba', async () => {
        await ficha();
        await window.tcTeclaAba({ key: 'ArrowRight', preventDefault() {} }, 'cadastro');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('criticidade');
    });

    it('Cadastro: nome e e-mail só leitura com o link para Pessoas, e o tipo editável', async () => {
        const f = await ficha({ [`PUT ${B}/a/tipo`]: { ok: true } });
        const p = el('tc-painel');
        expect(p.textContent).toContain('Nuvem <b>Grande</b>');
        expect(p.textContent).toContain('contato@fornecedor.exemplo');
        expect(p.querySelector('b')).toBeNull();
        expect(JSON.parse(p.querySelector('[data-action="openParteModal"]').getAttribute('data-args'))).toEqual(['p9', 'a']);
        expect(p.querySelector('input')).toBeNull();
        el('tc-tipo-sel').value = 'critico';
        await window.salvarTipoTerceiro('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/a/tipo`)).toEqual({ terceiro_tipo: 'critico' });
        el('tc-tipo-sel').value = '';
        await window.salvarTipoTerceiro('p9', 'a');
        expect(corpoDe(f, `PUT ${B}/a/tipo`)).toEqual({ terceiro_tipo: null });
    });

    it('D4: Cadastro mostra o CNPJ com máscara e o responsável (escapado); adicionar e remover chamam o vínculo do núcleo', async () => {
        const PESSOAS = [{ id: 'pe1', nome: 'Ana <i>Responsável</i>' }, { id: 'pe2', nome: 'Beto Exemplo' }];
        const f = await ficha({
            [`GET ${B}/a`]: FICHA({ cnpj: '11222333000181', responsaveis: [{ id: 'pe1', nome: 'Ana <i>Responsável</i>', email: 'ana@exemplo.com', vinculo_id: 'v1' }] }),
            'GET /api/v1/projects/p9/partes': PESSOAS,
            'POST /api/v1/projects/p9/partes/pe2/vinculos': { ok: true },
            'DELETE /api/v1/projects/p9/partes/pe1/vinculos/v1': { ok: true },
        });
        const p = el('tc-painel');
        expect(p.textContent).toContain('11.222.333/0001-81');
        expect(el('tc-resp').textContent).toContain('Ana <i>Responsável</i>');
        expect(el('tc-resp').querySelector('i')).toBeNull();
        expect([...el('tc-resp-sel').options].map((o) => o.value)).toEqual(['pe2']); // quem já é responsável não repete
        el('tc-resp-sel').value = 'pe2';
        await window.adicionarResponsavelTerceiro('p9', 'a');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/partes/pe2/vinculos')).toEqual({ papel: 'responsavel', alvo_tipo: 'parte', alvo_id: 'a' });
        await window.removerResponsavelTerceiro('p9', 'pe1', 'v1');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/partes/pe1/vinculos/v1');
    });

    it('D4: a lista mostra o CNPJ com máscara, ou traço', async () => {
        await lista({ [`GET ${B}`]: [T('a', { cnpj: '11222333000181' }), T('b', { cnpj: null })] });
        const celulas = [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.children[1].textContent.trim());
        expect(celulas).toEqual(['11.222.333/0001-81', '—']);
    });

    it('Avaliações: histórico com a observação (link só http), nova avaliação só com tipo', async () => {
        await ficha({}, 'avaliacoes');
        expect(el('tc-historico').textContent).toContain('Sem <b>ressalva</b>');
        expect([...el('tc-historico').querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['https://trust.exemplo.com/x']);
        expect(el('tc-historico').textContent).toContain('javascript:alert(1)');
        expect(el('tc-nova')).not.toBeNull();
        await ficha({ [`GET ${B}/a`]: FICHA({ terceiro_tipo: null, metodo: null }) }, 'avaliacoes');
        expect(el('tc-nova')).toBeNull();
        expect(el('tc-painel').textContent).toContain('Defina o tipo');
    });

    it('registrar avaliação exige a validade e manda resultado, validade, link e observação', async () => {
        const f = await ficha({ [`POST ${B}/a/avaliacoes`]: { ok: true, id: 'x', metodo: 'questionario' } }, 'avaliacoes');
        el('tc-val').value = '';
        await window.registrarAvaliacaoTerceiro('p9', 'a');
        expect(chamadas(f).some((k) => k.startsWith(`POST ${B}/a/avaliacoes`))).toBe(false);
        el('tc-res').value = 'com_ressalvas'; el('tc-val').value = '2027-03-31'; el('tc-url').value = ' https://x.exemplo.com '; el('tc-obs').value = '';
        await window.registrarAvaliacaoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/avaliacoes`)).toEqual({ resultado: 'com_ressalvas', valido_ate: '2027-03-31', evidencia_url: 'https://x.exemplo.com', observacao: null });
    });

    it('erro do servidor vira aviso e não derruba a tela', async () => {
        await ficha({}, 'avaliacoes');
        el('tc-val').value = '2027-03-31';
        await window.registrarAvaliacaoTerceiro('p9', 'a'); // POST sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
        expect(el('tc-painel')).not.toBeNull();
    });

    it('Segurança: o perfil de vendors, salvo pelo PUT /api/v1/vendors/:id com os campos do perfil', async () => {
        const f = await ficha({ 'PUT /api/v1/vendors/v1': { ok: true } }, 'seguranca');
        const p = el('tc-painel');
        expect(el('tc-seg-iso27001').checked).toBe(true);
        expect(el('tc-seg-mfa').checked).toBe(true);
        expect(el('tc-seg-pentest').checked).toBe(false);
        expect(el('tc-seg-notas').value).toBe('Obs <i>x</i>');
        expect(p.querySelector('i')).toBeNull();
        el('tc-seg-pentest').checked = true;
        // DPA é o documento ligado (fonte única, 20/10/2026): o perfil não tem mais "DPA assinado" nem link editáveis
        expect(el('tc-seg-dpa')).toBeNull();
        expect(el('tc-seg-dpa-url')).toBeNull();
        await window.salvarSegurancaTerceiro('p9', 'a', 'v1');
        expect(corpoDe(f, 'PUT /api/v1/vendors/v1')).toEqual({
            name: 'Nuvem <b>Grande</b>', category: 'Nuvem', status: 'Active',
            has_iso27001: 1, has_iso27701: 0, has_soc2: 0, has_mfa: 1, has_encryption: 0, has_backup: 0, has_incident_plan: 0, has_pentest: 1,
            trust_center_url: 'https://trust.exemplo.com', attached_certifications: 'PCI-DSS', notes: 'Obs <i>x</i>',
        });
    });

    it('Segurança: DPA declarado no perfil antigo e nenhum documento DPA ligado aparece só leitura, com o link antigo', async () => {
        const legado = { ...SEGURANCA, dpa_signed: 1, dpa_url: 'https://dpa.exemplo.com' };
        await ficha({ [`GET ${B}/a`]: FICHA({ dpa: false, seguranca: legado }) }, 'seguranca');
        expect(el('tc-painel').textContent).toContain('DPA declarado, sem documento (link antigo): https://dpa.exemplo.com');
        await ficha({ [`GET ${B}/a`]: FICHA({ seguranca: legado }) }, 'seguranca');
        expect(el('tc-painel').textContent).not.toContain('DPA declarado');
    });

    it('Segurança sem perfil: "Sem perfil de segurança" e nada mais', async () => {
        await ficha({ [`GET ${B}/a`]: FICHA({ seguranca: null }) }, 'seguranca');
        expect(el('tc-painel').textContent).toContain('Sem perfil de segurança');
        expect(el('tc-painel').querySelector('input, button')).toBeNull();
    });

    it('Documentos: DPA e contratos com a situação; ligar e desligar', async () => {
        const f = await ficha({ [`POST ${B}/a/documentos`]: { ok: true }, [`DELETE ${B}/a/documentos/d1`]: { ok: true } }, 'documentos');
        expect(el('tc-docs').textContent).toContain('DPA <i>Nuvem</i>');
        expect(el('tc-docs').textContent).toContain('Vigente');
        el('tc-doc').value = 'doc:d2'; el('tc-doc-papel').value = 'contrato';
        await window.ligarDocumentoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/documentos`)).toEqual({ documento_id: 'd2', papel: 'contrato' });
        await window.desligarDocumentoTerceiro('p9', 'a', 'd1', 'dpa', '');
        expect(chamadas(f)).toContain(`DELETE ${B}/a/documentos/d1?papel=dpa`);
    });

    it('Documentos: o arquivo aparece na lista de ligar (escapado), liga com arquivo_id e desliga com origem=arquivo', async () => {
        const f = await ficha({ [`POST ${B}/a/documentos`]: { ok: true }, [`DELETE ${B}/a/documentos/ar1`]: { ok: true } }, 'documentos');
        const op = [...el('tc-doc').options].map((o) => [o.value, o.textContent]);
        expect(op).toContainEqual(['arquivo:ar1', 'DPA <b>assinado</b> (arquivo)']);
        expect(el('tc-doc').querySelector('b')).toBeNull();
        el('tc-doc').value = 'arquivo:ar1'; el('tc-doc-papel').value = 'dpa';
        await window.ligarDocumentoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/documentos`)).toEqual({ arquivo_id: 'ar1', papel: 'dpa' });
        await window.desligarDocumentoTerceiro('p9', 'a', 'ar1', 'dpa', 'arquivo');
        expect(chamadas(f)).toContain(`DELETE ${B}/a/documentos/ar1?papel=dpa&origem=arquivo`);
    });

    it('Atividades: as duas origens, com o rótulo e o link para a atividade', async () => {
        await ficha({}, 'atividades');
        const t = el('tc-trat');
        expect(t.textContent).toContain('Folha <b>y</b>');
        expect(t.textContent).toContain('Vínculo');
        expect(t.textContent).toContain('Compartilhamento externo');
        expect(t.querySelector('b')).toBeNull();
        expect([...t.querySelectorAll('[data-action="abrirAtividade"]')].map((b) => JSON.parse(b.getAttribute('data-args')))).toEqual([['p9', 'r1'], ['p9', 'r2']]);
    });

    it('Suboperadores: a lista escapada', async () => {
        await ficha({}, 'suboperadores');
        expect(el('tc-subs').textContent).toContain('Sub <b>x</b>');
        expect(el('tc-subs').querySelector('b')).toBeNull();
    });

    it('papel só de leitura vê as abas sem formulários e não busca a lista de documentos', async () => {
        S.user = { role: 'org_user' };
        for (const aba of ['cadastro', 'avaliacoes', 'seguranca', 'documentos']) {
            const f = await ficha({}, aba);
            expect(el('tc-painel').querySelector('input, select, button[data-action]'), aba).toBeNull();
            expect(chamadas(f)).not.toContain('GET /api/v1/projects/p9/documentos');
        }
    });

    it('Voltar aos fornecedores tira a ficha do endereço e volta à lista', async () => {
        await ficha({}, 'documentos');
        window.tcVoltar();
        expect(new URLSearchParams(window.location.search).has('parte')).toBe(false);
        expect(navigate).toHaveBeenCalledWith('terceiros');
    });
});

describe('adicionar parte existente', () => {
    it('só quem edita vê o botão; ele lista os candidatos (escapados) e tipificar chama o PUT do tipo', async () => {
        await lista();
        expect(JSON.parse(el('a').querySelector('[data-action="abrirAdicionarTerceiro"]').getAttribute('data-args'))).toEqual(['p9']);
        S.user = { role: 'org_user' };
        await lista();
        expect(el('a').querySelector('[data-action="abrirAdicionarTerceiro"]')).toBeNull();
        S.user = { role: 'consultor' };

        document.body.innerHTML = PALCO;
        const f = servir(rotas({ [`GET ${B}/candidatos`]: [{ id: 'anpd', nome: 'ANPD <b>x</b>' }], [`PUT ${B}/anpd/tipo`]: { ok: true } }));
        await window.abrirAdicionarTerceiro('p9');
        expect(el('tc-cand').textContent).toContain('ANPD <b>x</b>');
        expect(el('modal-content').querySelector('b')).toBeNull();
        el('tc-cand').value = 'anpd';
        el('tc-cand-tipo').value = 'critico';
        await window.adicionarTerceiro('p9');
        expect(corpoDe(f, `PUT ${B}/anpd/tipo`)).toEqual({ terceiro_tipo: 'critico' });
    });

    it('sem candidatos, diz que não há parte para adicionar', async () => {
        document.body.innerHTML = PALCO;
        servir(rotas({ [`GET ${B}/candidatos`]: [] }));
        await window.abrirAdicionarTerceiro('p9');
        expect(el('modal-content').textContent).toContain('Nenhuma parte');
        expect(el('tc-cand')).toBeNull();
    });
});

describe('homologação por questionário (F5), na aba Avaliações', () => {
    const H = '/api/v1/projects/p9/homologacoes';
    const HOMOLOGACOES = [
        { id: 'h1', status: 'respondida', expirada: false, percentual: 75, respondidas: 9, total: 12, expira_em: '2026-11-01 10:00:00', resultado: null, created_at: '2026-10-15 10:00:00' },
        { id: 'h0', status: 'aberta', expirada: true, percentual: 0, respondidas: 0, total: 12, expira_em: '2026-10-01 10:00:00', resultado: null, created_at: '2026-09-15 10:00:00' },
    ];
    const DETALHE = {
        id: 'h1', parte_nome: 'Nuvem <b>Grande</b>', status: 'respondida', expirada: false, percentual: 50, respondidas: 1, total: 2, enviada_em: '2026-10-16 10:00:00',
        perguntas: [{ id: 'q1', tema: 'Segurança', texto: 'Há <i>política</i>?', resposta: 'parcial', justificativa: 'Em <b>revisão</b>' }, { id: 'q2', tema: 'DPA', texto: 'Assina DPA?', resposta: null, justificativa: null }],
    };

    it('lista os envios com situação e %, e oferece "Homologar" a quem edita', async () => {
        const f = await ficha({ [`GET ${H}`]: HOMOLOGACOES }, 'avaliacoes');
        expect(chamadas(f)).toContain(`GET ${H}?parte_id=a`);
        const s = el('tc-homologacao');
        expect(s.textContent).toContain('Respondida');
        expect(s.textContent).toContain('75% (9 de 12)');
        expect(s.textContent).toContain('Link vencido');
        expect(s.querySelector('[data-action="criarHomologacaoTerceiro"]')).not.toBeNull();
    });

    it('grande provedor (trust center) não mostra a seção nem busca homologações', async () => {
        const f = await ficha({ [`GET ${B}/a`]: FICHA({ terceiro_tipo: 'grande_provedor', metodo: 'trust_center', pode_questionario: false }) }, 'avaliacoes');
        expect(el('tc-homologacao')).toBeNull();
        expect(chamadas(f).some((k) => k.startsWith(`GET ${H}`))).toBe(false);
    });

    it('#12 fornecedor crítico mostra a seção de questionário (método formal segue auditoria)', async () => {
        const f = await ficha({ [`GET ${B}/a`]: FICHA({ terceiro_tipo: 'critico', metodo: 'auditoria', pode_questionario: true }), [`GET ${H}`]: [] }, 'avaliacoes');
        expect(el('tc-homologacao')).not.toBeNull();
        expect(chamadas(f).some((k) => k.startsWith(`GET ${H}`))).toBe(true);
    });

    it('homologar manda fornecedor, prazo e e-mail (se houver) e mostra o link uma vez', async () => {
        const f = await ficha({ [`GET ${H}`]: [], [`POST ${H}`]: { id: 'h2', url: 'https://n360.ness.com.br/homologacao#abc', expira_em: '2026-10-30 10:00:00', email_enviado: false } }, 'avaliacoes');
        el('tc-hm-dias').value = '61';
        await window.criarHomologacaoTerceiro('p9', 'a');
        expect(chamadas(f).some((k) => k === `POST ${H}`)).toBe(false);
        el('tc-hm-dias').value = '10';
        el('tc-hm-email').value = 'contato@fornecedor.exemplo';
        await window.criarHomologacaoTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${H}`)).toEqual({ parte_id: 'a', dias: 10, email: 'contato@fornecedor.exemplo' });
        expect(el('tc-hm-url').value).toBe('https://n360.ness.com.br/homologacao#abc');
    });

    it('revisar mostra as respostas escapadas; concluir exige validade e manda resultado, validade e observação', async () => {
        document.body.innerHTML = PALCO;
        const f = servir(rotas({ [`GET ${H}/h1`]: DETALHE, [`POST ${H}/h1/concluir`]: { ok: true, avaliacao_id: 'av1' }, [`GET ${H}`]: [] }));
        await window.revisarHomologacao('p9', 'a', 'h1');
        const m = el('modal-content');
        expect(m.textContent).toContain('Nuvem <b>Grande</b>');
        expect(m.textContent).toContain('Há <i>política</i>?');
        expect(m.textContent).toContain('Parcial');
        expect(m.textContent).toContain('Sem resposta');
        expect(m.querySelector('b, i')).toBeNull();
        el('tc-hm-val').value = '';
        await window.concluirHomologacao('p9', 'a', 'h1');
        expect(chamadas(f)).not.toContain(`POST ${H}/h1/concluir`);
        el('tc-hm-res').value = 'com_ressalvas'; el('tc-hm-val').value = '2027-10-15'; el('tc-hm-obs').value = 'Falta DPA';
        await window.concluirHomologacao('p9', 'a', 'h1');
        expect(corpoDe(f, `POST ${H}/h1/concluir`)).toEqual({ resultado: 'com_ressalvas', valido_ate: '2027-10-15', observacao: 'Falta DPA' });
    });

    it('as perguntas do questionário saíram da lista: moram em Fornecedores > Questionários', async () => {
        await lista();
        expect(el('a').querySelector('[data-action="abrirPerguntasHomologacao"]')).toBeNull();
        expect(window.abrirPerguntasHomologacao).toBeUndefined();
    });
});
