// Copiloto da entrevista do RoPA (etapa 3): descrição livre → proposta que a pessoa revisa pergunta a pergunta. api() REAL e
// delegação REAL; só o fetch é dublado, com o corpo de src/routes/ropa.ts (POST /ropa/copiloto, services/copiloto-ropa.ts).
// Dados fictícios. O teste de "indisponível" fica por último: depois dele o bloco some nesta sessão (é o comportamento).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/privacy.js';
import '../src/views/ropa-entrevista.js';

initDelegation();

const P = '/api/v1/projects/p1';
const COP = `POST ${P}/ropa/copiloto`;
const CATALOGO = [{ id: 'lgpd:art7', pai_id: null }, { id: 'lgpd:art7:i', pai_id: 'lgpd:art7' }, { id: 'lgpd:art7:ii', pai_id: 'lgpd:art7' }];
const PROPOSTA = {
    proposta: {
        finalidade: 'Folha de pagamento: pagar salários e recolher encargos', titulares: ['Colaboradores'], categorias_de_dados: ['Identificação', 'Financeiro'],
        destinatarios: 'Banco', retencao: '5 anos (obrigação fiscal e contábil)', base_legal_id: 'lgpd:art7:ii', base_legal_motivo: 'Obrigação trabalhista.',
        sistemas_ids: ['i1', 'i-inexistente'], areas_ids: ['d1'], sistemas_novos: ['Totvs RM'],
    },
    perguntas_a_confirmar: ['Responsável: escolha a pessoa no cadastro. O assistente não propõe pessoas.', 'Dados sensíveis (art. 11 da LGPD): responda você. O assistente não propõe.'],
    avisos: ['O texto cita "dependentes": responda você a pergunta sobre crianças e adolescentes (art. 14).'],
};
const rotas = (extra = {}) => ({
    [`GET ${P}/partes`]: [{ id: 'pe1', nome: 'Ana Exemplo', tipo: 'pessoa', status: 'ativa' }],
    [`GET ${P}/departamentos`]: [{ id: 'd1', nome: 'Departamento Pessoal' }],
    [`GET ${P}/assets`]: { ok: true, assets: [{ id: 'i1', name: 'Sistema de folha', category: 'Software' }] },
    'GET /api/v1/requisitos': CATALOGO,
    [`GET ${P}/ropa`]: { ok: true, records: [] },
    [`POST ${P}/ropa`]: { ok: true, id: 'novo1' },
    [`PUT ${P}/ropa/novo1/departamentos`]: { ok: true, total: 1 },
    [`PUT ${P}/ropa/novo1/itens`]: { ok: true, total: 1 },
    [`POST ${P}/assets`]: { ok: true, id: 'i2' },
    [`POST ${P}/similares`]: { resultados: [] },
    [COP]: PROPOSTA,
    ...extra,
});
const el = (id) => document.getElementById(id);
const metodos = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const escritas = (f) => metodos(f).filter((m) => !m.startsWith('GET') && m !== COP && !m.endsWith('/similares'));
const titulo = () => el('re-titulo').textContent;
const proxima = () => el('c').querySelector('.re-pergunta button[type="submit"]').click();
const descrever = (v) => { const t = el('re-cop-texto'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); };
const clicar = (acao) => el('c').querySelector(`[data-action="${acao}"]`).click();

async function abrir(extra, recordId) {
    const f = servir(rotas(extra));
    window.abrirRopaEntrevista('p1', recordId);
    S.view = 'ropa-entrevista';
    await window.renderRopaEntrevista(el('c'), el('h'), el('a'));
    return f;
}
async function pedir(f, texto = 'Fazemos a folha de pagamento no sistema Totvs e enviamos o arquivo ao banco.') {
    descrever(texto);
    clicar('reCopilotoPedir');
    await vi.waitFor(() => expect(metodos(f)).toContain(COP));
    await vi.waitFor(() => expect(el('c').querySelector('[data-action="reCopilotoPedir"]')).toBeNull());
}

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

describe('copiloto: onde aparece', () => {
    it('na atividade nova, acima da primeira pergunta, com contador; "Prefiro responder uma a uma" fecha', async () => {
        await abrir();
        expect(el('re-cop-titulo').textContent).toBe('Descreva a atividade com suas palavras');
        expect(titulo()).toBe('Qual atividade da empresa usa dados de pessoas?');
        descrever('abc');
        expect(el('re-cop-contador').textContent).toBe('3 de 2000 caracteres (mínimo 20)');
        clicar('reCopilotoFechar');
        expect(el('re-cop-titulo')).toBeNull();
        expect(titulo()).toBe('Qual atividade da empresa usa dados de pessoas?');
    });

    it('não aparece na revisão de uma atividade existente', async () => {
        S.ropa = [{ id: 'r1', processing_purpose: 'Cobrança', data_subjects: 'Colaboradores', data_categories: 'Contato' }];
        await abrir({ [`GET ${P}/ropa/r1/ligacoes`]: { itens: [], departamentos: [], dpias: [], transferencias: [] }, [`GET ${P}/ropa/r1/lia`]: { lia: null } }, 'r1');
        expect(el('re-cop-titulo')).toBeNull();
        expect(el('c').querySelector('.re-copiloto')).toBeNull();
    });

    it('descrição curta não chama o servidor', async () => {
        const f = await abrir();
        descrever('curta');
        clicar('reCopilotoPedir');
        expect(el('re-cop-erro').textContent).toContain('pelo menos 20 caracteres');
        expect(metodos(f)).not.toContain(COP);
    });
});

describe('copiloto: proposta', () => {
    it('preenche, marca com selo, mostra avisos e o que confirmar; nada é gravado antes do Salvar', async () => {
        const f = await abrir();
        await pedir(f);
        expect(f.mock.calls.find(([u, o]) => o?.method === 'POST' && u.endsWith('/ropa/copiloto'))[1].body)
            .toBe(JSON.stringify({ descricao: 'Fazemos a folha de pagamento no sistema Totvs e enviamos o arquivo ao banco.' }));
        // Painel antes de começar: avisos e perguntas, foco no título do painel.
        expect(el('re-cop-titulo').textContent).toMatch(/pré-preencheu \d+ respostas/);
        expect(document.activeElement).toBe(el('re-cop-titulo'));
        expect(el('c').textContent).toContain('O texto cita "dependentes"');
        expect(el('c').textContent).toContain('Responsável: escolha a pessoa no cadastro');
        clicar('reCopilotoComecar');
        expect(el('re-cop-titulo')).toBeNull();
        expect(document.activeElement).toBe(el('re-titulo'));
        // Primeira pergunta: preenchida e com selo.
        expect(el('re-campo').value).toBe('Folha de pagamento: pagar salários e recolher encargos');
        expect(el('re-selo').textContent).toBe('Proposta do assistente: confira');
        expect(el('re-selo').getAttribute('aria-label')).toContain('Proposta do assistente');
        proxima(); // finalidade > 40 letras: "para que" some; vai ao responsável, que o copiloto nunca preenche
        expect(titulo()).toBe('Quem responde por essa atividade na empresa?');
        expect(el('re-selo')).toBeNull();
        proxima();
        expect(titulo()).toBe('Qual área executa a atividade?');
        expect(el('re-selo')).not.toBeNull();
        expect([...el('c').querySelectorAll('.re-opcao input:checked')].map((i) => i.value)).toEqual(['d1']);
        expect(escritas(f)).toEqual([]);
    });

    it('selo some quando a pessoa altera a resposta', async () => {
        const f = await abrir();
        await pedir(f);
        clicar('reCopilotoComecar');
        const i = el('re-campo');
        i.value = 'Folha de pagamento';
        i.dispatchEvent(new Event('input', { bubbles: true }));
        expect(el('re-selo')).toBeNull();
        proxima(); // "para que" volta a aparecer: finalidade curta
        proxima(); // responsável
        proxima(); // áreas: ainda proposta
        expect(el('re-selo')).not.toBeNull();
        el('c').querySelector('.re-opcao input[value="d1"]').click();
        expect(el('re-selo')).toBeNull();
    });

    it('resumo leva o selo nas propostas e o Salvar grava só no fim, com o que ficou', async () => {
        const f = await abrir();
        await pedir(f);
        clicar('reCopilotoComecar');
        sessionStorage.clear();
        // Pula para o resumo como a tela faz ao "Alterar" a partir dele.
        window.reAlterar('A');
        while (el('re-titulo').textContent !== 'Confira o que você nos contou') {
            const nao = el('c').querySelector('[data-action="reNaoSei"]');
            if (nao) nao.click(); else proxima();
        }
        const dd = [...el('c').querySelectorAll('.re-respostas dd')];
        const comSelo = dd.filter((d) => d.querySelector('.re-selo')).map((d) => d.previousElementSibling.textContent);
        expect(comSelo).toEqual(expect.arrayContaining(['Atividade', 'Titulares', 'Tipos de dado', 'Base legal', 'Para quem', 'Retenção', 'Sistemas e arquivos']));
        expect(comSelo).not.toContain('Dados sensíveis');
        expect(comSelo).not.toContain('Crianças ou adolescentes');
        expect(comSelo).not.toContain('Transferência internacional');
        expect(escritas(f)).toEqual([]);
        await window.reSalvar();
        const corpo = JSON.parse(f.mock.calls.find(([u, o]) => o?.method === 'POST' && u.endsWith(`${P}/ropa`))[1].body);
        expect(corpo).toMatchObject({ processing_purpose: 'Folha de pagamento: pagar salários e recolher encargos', data_subjects: 'Colaboradores',
            data_categories: 'Identificação, Financeiro', recipients: 'Banco', retention_period: '5 anos (obrigação fiscal e contábil)',
            legal_basis: 'Cumprimento de obrigação legal ou regulatória', base_legal_id: 'lgpd:art7:ii' });
        expect(corpo).not.toHaveProperty('dados_sensiveis');
        expect(corpo).not.toHaveProperty('criancas_adolescentes');
        expect(corpo).not.toHaveProperty('international_transfers');
        expect(JSON.parse(f.mock.calls.find(([u, o]) => o?.method === 'PUT' && u.endsWith('/itens'))[1].body)).toEqual({ itens: ['i1'] });
    });

    it('HTML na proposta é texto: escapado no campo, no painel e nas sugestões de cadastro', async () => {
        const mal = '<img src=x onerror="window.__xss=1">';
        const f = await abrir({ [COP]: { proposta: { finalidade: `Folha ${mal}`, sistemas_novos: [mal], destinatarios: mal }, perguntas_a_confirmar: [mal], avisos: [mal] } });
        await pedir(f);
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').textContent).toContain(mal);
        clicar('reCopilotoComecar');
        expect(el('re-campo').value).toBe(`Folha ${mal}`);
        window.reAlterar('E');
        while (el('re-titulo').textContent !== 'Em quais sistemas ou arquivos esses dados passam?') proxima();
        expect(el('c').querySelector('img')).toBeNull();
        expect(el('c').querySelector('.re-cop-novos').textContent).toContain(`Cadastrar ${mal}?`);
        expect(window.__xss).toBeUndefined();
    });

    it('"Cadastrar X?" abre o cadastro preenchido, espera a checagem por significado e só então cria', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            const f = await abrir();
            await pedir(f);
            clicar('reCopilotoComecar');
            window.reAlterar('E');
            while (el('re-titulo').textContent !== 'Em quais sistemas ou arquivos esses dados passam?') proxima();
            const sug = el('c').querySelector('.re-cop-novos [data-action="reCadastroAbrir"]');
            expect(sug.textContent).toBe('Cadastrar Totvs RM?');
            sug.click();
            expect(el('re-cad-nome').value).toBe('Totvs RM');
            expect(el('re-similares-busca').textContent).toBe('buscando parecidos…');
            clicar('reCadastrar');
            expect(el('re-erro').textContent).toContain('Aguarde a busca de parecidos');
            expect(metodos(f)).not.toContain(`POST ${P}/assets`);
            await vi.advanceTimersByTimeAsync(600);
            await vi.waitFor(() => expect(el('re-similares-busca').textContent).toBe(''));
            expect(metodos(f)).toContain(`POST ${P}/similares`);
            clicar('reCadastrar');
            await vi.waitFor(() => expect(metodos(f)).toContain(`POST ${P}/assets`));
            await vi.waitFor(() => expect([...el('c').querySelectorAll('.re-opcao input:checked')].map((i) => i.value)).toEqual(['i1', 'i2']));
            // Resolvido: a sugestão sai da lista.
            expect(el('re-cad-nome')).toBeNull();
            expect(el('c').querySelector('.re-cop-novos')).toBeNull();
        } finally { vi.useRealTimers(); }
    });

    it('erro do servidor: mensagem clara, a descrição fica e a entrevista segue', async () => {
        const f = await abrir();
        f.mockImplementation(async (url, o = {}) => ({ status: 500, ok: false, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Falha no copiloto da entrevista' }), text: async () => '' }));
        descrever('Fazemos a folha de pagamento no sistema Totvs e enviamos o arquivo ao banco.');
        clicar('reCopilotoPedir');
        await vi.waitFor(() => expect(el('re-cop-erro').textContent).toContain('Não foi possível falar com o assistente'));
        expect(el('re-cop-texto').value).toContain('folha de pagamento');
        expect(el('re-selo')).toBeNull();
        expect(titulo()).toBe('Qual atividade da empresa usa dados de pessoas?');
    });

    it('indisponível: o bloco some com uma nota, a entrevista segue e não volta numa nova atividade', async () => {
        const f = await abrir({ [COP]: { indisponivel: true } });
        await pedir(f);
        expect(el('re-cop-texto')).toBeNull();
        expect(el('c').textContent).toContain('O assistente não está disponível agora');
        expect(el('re-campo').value).toBe('');
        expect(el('re-selo')).toBeNull();
        expect(escritas(f)).toEqual([]);
        await abrir({ [COP]: { indisponivel: true } });
        expect(el('c').querySelector('.re-copiloto')).toBeNull();
        expect(el('c').textContent).not.toContain('O assistente não está disponível agora');
    });
});
