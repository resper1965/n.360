// Assistente "Novo projeto" e "Dados da empresa" (migration 0071). CNPJs fabricados com dígito válido, de nenhuma empresa.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/project.js';
import { cnpjValido, mascaraCnpj, mascaraCep } from '../src/views/empresa.js';

const CNPJ = '12345000000102';
const PROPOSTA = {
    ok: true, cnpj: CNPJ, existente: null,
    proposta: { cnpj: CNPJ, razao_social: 'TETA <img src=x onerror=alert(1)> LTDA', nome_fantasia: 'TETA', situacao_cadastral: 'BAIXADA', cep: '01310100', municipio: 'CIDADE FICTICIA', uf: 'SP' },
};

const $ = (id) => document.getElementById(id);
const clicar = async (sel) => { document.querySelector(sel).click(); await new Promise((r) => setTimeout(r, 0)); };
async function lista(user) {
    S.user = user;
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    await window.renderProjects($('c'), $('h'), $('a'));
}
const digitar = (id, valor) => { const el = $(id); el.value = valor; return el; };

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url) => (url === '/api/v1/projects' ? [{ id: 'p1', client_name: 'Alfa', modulos: ['iso'] }] : {}));
    window.render = vi.fn();
    window.loadProjects = vi.fn();
    window.openProjectDetail = vi.fn();
});
afterEach(() => { document.body.innerHTML = ''; });

describe('CNPJ: máscara e dígito verificador', () => {
    it('mascara e valida', () => {
        expect(mascaraCnpj('12345000000102')).toBe('12.345.000/0001-02');
        expect(mascaraCnpj('12.345')).toBe('12.345');
        expect(mascaraCep('01310100')).toBe('01310-100');
        expect(cnpjValido(CNPJ)).toBe(true);
        expect(cnpjValido('12345000000103')).toBe(false);
        expect(cnpjValido('00000000000000')).toBe(false);
    });
});

describe('botão Novo projeto', () => {
    it('platform_admin e consultoria_admin veem; consultor, comercial e cliente não', async () => {
        for (const role of ['platform_admin', 'consultoria_admin']) {
            await lista({ role, modulos: ['iso', 'privacy'] });
            expect($('a').querySelector('[data-action="abrirNovoProjeto"]'), role).not.toBeNull();
        }
        for (const role of ['consultor', 'comercial', 'org_admin', 'org_user']) {
            await lista({ role });
            expect($('a').querySelector('[data-action="abrirNovoProjeto"]'), role).toBeNull();
        }
    });
    it('cada linha tem "Dados da empresa" para ver os dados', async () => {
        await lista({ role: 'org_user' });
        expect(JSON.parse(document.querySelector('[data-action="abrirDadosEmpresa"]').getAttribute('data-args'))).toEqual(['p1']);
    });
});

describe('assistente', () => {
    beforeEach(async () => { await lista({ role: 'consultoria_admin', modulos: ['iso', 'privacy'] }); window.abrirNovoProjeto(); });

    it('passo 1: máscara no campo, aviso de dígito errado e foco no primeiro campo', () => {
        expect(document.activeElement.id).toBe('emp-cnpj');
        window.mascararCnpjCampo(digitar('emp-cnpj', '12345000000103'));
        expect($('emp-cnpj').value).toBe('12.345.000/0001-03');
        expect($('emp-cnpj-msg').textContent).toContain('inválido');
        window.novoProjetoIr(2);
        expect($('np-erro').textContent).toMatch(/razão social/);
        digitar('emp-razao_social', 'Fictícia');
        window.novoProjetoIr(2);
        expect($('np-erro').textContent).toMatch(/CNPJ inválido/);
        expect($('np-erro').getAttribute('aria-live')).toBe('assertive');
    });

    it('a consulta PROPÕE dados editáveis, avisa situação não ativa e não interpreta HTML', async () => {
        apiMock.mockImplementation(async (m, url) => (url.includes('consulta-cnpj') ? PROPOSTA : {}));
        window.mascararCnpjCampo(digitar('emp-cnpj', CNPJ));
        await window.buscarDadosDoCnpj();
        expect(apiMock).toHaveBeenCalledWith('GET', `/api/v1/projects/consulta-cnpj/${CNPJ}`);
        expect($('emp-razao_social').value).toBe('TETA <img src=x onerror=alert(1)> LTDA');
        expect($('emp-razao_social').disabled).toBe(false);
        expect($('emp-cep').value).toBe('01310-100');
        expect($('emp-consulta').textContent).toContain('BAIXADA');
        expect(document.querySelector('#modal-content img')).toBeNull();
        digitar('emp-razao_social', 'Teta Corrigida');
        window.novoProjetoIr(2);
        expect($('np-titulo').textContent).toContain('Programa');
    });

    it('consulta de CNPJ fora do ar: mensagem fixa, campos seguem editáveis e o passo avança', async () => {
        apiMock.mockImplementation(async (m, url) => { if (url.includes('consulta-cnpj')) throw new Error('502 BrasilAPI'); return {}; });
        window.mascararCnpjCampo(digitar('emp-cnpj', CNPJ));
        await window.buscarDadosDoCnpj();
        expect($('emp-consulta').textContent).toBe('A consulta de CNPJ está indisponível. Preencha os dados à mão.');
        expect($('emp-razao_social').disabled).toBe(false);
        digitar('emp-razao_social', 'Teta à mão');
        window.novoProjetoIr(2);
        expect($('np-titulo').textContent).toContain('Programa');
    });

    it('sair do campo com CNPJ válido consulta uma vez; CNPJ já usado na organização oferece abrir', async () => {
        apiMock.mockImplementation(async (m, url) => (url.includes('consulta-cnpj') ? { ...PROPOSTA, existente: { id: 'p9', nome: '<b>Gama</b>' } } : {}));
        window.mascararCnpjCampo(digitar('emp-cnpj', CNPJ));
        await window.cnpjSaiuDoCampo($('emp-cnpj'));
        await window.cnpjSaiuDoCampo($('emp-cnpj'));
        expect(apiMock.mock.calls.filter(([, u]) => u.includes('consulta-cnpj'))).toHaveLength(1);
        expect($('emp-consulta').textContent).toContain('Já existe: <b>Gama</b>');
        expect($('emp-consulta').querySelector('b')).toBeNull();
        expect(JSON.parse($('emp-consulta').querySelector('[data-action="abrirProjetoExistente"]').getAttribute('data-args'))).toEqual(['p9']);
    });

    it('empresa sem CNPJ: documento alternativo e país', () => {
        const caixa = $('emp-sem-cnpj');
        caixa.checked = true;
        window.alternarSemCnpj(caixa);
        expect($('emp-bloco-cnpj').style.display).toBe('none');
        expect(document.activeElement.id).toBe('emp-documento_alternativo');
        digitar('emp-documento_alternativo', 'EIN 00-0000000');
        digitar('emp-pais', 'Estados Unidos');
        digitar('emp-razao_social', 'Fictícia Inc.');
        window.novoProjetoIr(2);
        expect($('np-titulo').textContent).toContain('Programa');
    });

    it('fluxo completo: cria com empresa, programa e pessoas e vai ao projeto novo', async () => {
        window.mascararCnpjCampo(digitar('emp-cnpj', CNPJ));
        digitar('emp-razao_social', 'Teta Fictícia Ltda');
        digitar('emp-nome_fantasia', 'Teta');
        window.novoProjetoIr(2);
        digitar('np-nome', 'SGSI 2027');
        window.novoProjetoIr(3);
        digitar('np-rep-nome', 'Pessoa Fictícia');
        digitar('np-rep-cargo', 'Diretora');
        digitar('np-dpo-nome', 'Encarregado Fictício');
        digitar('np-dpo-email', 'dpo@teta.exemplo');
        window.novoProjetoIr(4);
        expect($('np-passo').textContent).toContain('12.345.000/0001-02');
        expect(document.activeElement.id).toBe('np-titulo');
        apiMock.mockImplementation(async (m, url) => (m === 'POST' ? { id: 'novo', modulos: ['iso', 'privacy'] } : []));
        await window.criarNovoProjeto();
        const [, , corpo] = apiMock.mock.calls.find(([m]) => m === 'POST');
        expect(corpo).toMatchObject({
            client_name: 'Teta', project_name: 'SGSI 2027', org_role: 'Controller', modulos: ['iso', 'privacy'],
            empresa: { cnpj: CNPJ, razao_social: 'Teta Fictícia Ltda', pais: 'BR' },
            pessoas: { representante: { nome: 'Pessoa Fictícia', cargo: 'Diretora' }, dpo: { nome: 'Encarregado Fictício', email: 'dpo@teta.exemplo' } },
        });
        expect(window.openProjectDetail).toHaveBeenCalledWith('novo');
    });

    it('limite do plano (409): a mensagem da API aparece no passo e o botão volta', async () => {
        digitar('emp-razao_social', 'Fictícia');
        window.novoProjetoIr(2); window.novoProjetoIr(3); window.novoProjetoIr(4);
        apiMock.mockImplementation(async (m) => { if (m === 'POST') { const e = new Error('Limite de projetos do plano atingido'); e.status = 409; e.body = { error: e.message }; throw e; } return []; });
        await window.criarNovoProjeto();
        expect($('np-erro').textContent).toBe('Limite de projetos do plano atingido');
        expect($('np-criar').disabled).toBe(false);
    });

    it('CNPJ duplicado ao criar (409 com o projeto): "Já existe ... Abrir?", com o nome escapado', async () => {
        digitar('emp-razao_social', 'Fictícia');
        window.novoProjetoIr(2); window.novoProjetoIr(3); window.novoProjetoIr(4);
        apiMock.mockImplementation(async (m) => { if (m === 'POST') { const e = new Error('dup'); e.status = 409; e.body = { projeto_existente: { id: 'p9', nome: '<i>Gama</i>' } }; throw e; } return []; });
        await window.criarNovoProjeto();
        expect($('np-erro').textContent).toContain('Já existe: <i>Gama</i>');
        expect($('np-erro').querySelector('i')).toBeNull();
    });

    it('módulos: só os da pessoa; sem nenhum marcado não segue', () => {
        S.user = { role: 'consultoria_admin', modulos: ['privacy'] };
        window.abrirNovoProjeto();
        digitar('emp-razao_social', 'Fictícia');
        window.novoProjetoIr(2);
        expect([...document.querySelectorAll('input[name=np-modulo]')].map((x) => x.value)).toEqual(['privacy']);
        document.querySelector('input[name=np-modulo]').checked = false;
        window.novoProjetoIr(3);
        expect($('np-erro').textContent).toMatch(/módulo/);
    });
});

describe('Dados da empresa', () => {
    const EMPRESA = { project_id: 'p1', cnpj: CNPJ, razao_social: 'Alfa <script>x</script>', pais: 'BR', representante_nome: 'Pessoa Fictícia' };
    beforeEach(() => { document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; });

    it('leitura para quem não edita: campos desligados, sem salvar, sem buscar', async () => {
        S.user = { role: 'org_user' };
        apiMock.mockImplementation(async (m, url) => (url.endsWith('/empresa') ? { empresa: EMPRESA, pode_editar: false } : []));
        await window.abrirDadosEmpresa('p1');
        expect($('emp-razao_social').disabled).toBe(true);
        expect($('emp-razao_social').value).toBe('Alfa <script>x</script>');
        expect(document.querySelector('[data-action="salvarDadosEmpresa"]')).toBeNull();
        expect(document.querySelector('[data-action="buscarDadosDoCnpj"]')).toBeNull();
        expect(document.querySelector('#modal-content script')).toBeNull();
    });

    it('edita, mostra o histórico e grava pelo PUT', async () => {
        S.user = { role: 'consultoria_admin' };
        apiMock.mockImplementation(async (m, url) => {
            if (url.endsWith('/empresa') && m === 'GET') return { empresa: EMPRESA, pode_editar: true };
            if (url.endsWith('/audit-trail')) return [{ action: 'empresa.atualizada', actor: 'cadm@x.lat', created_at: '2026-10-14T10:00:00', details: 'Cadastro da empresa do projeto p1: telefone' }, { action: 'outra', details: 'x' }];
            return { ok: true };
        });
        await window.abrirDadosEmpresa('p1');
        expect($('emp-cnpj').value).toBe('12.345.000/0001-02');
        expect($('modal-content').textContent).toContain('cadm@x.lat');
        expect($('emp-representante_nome').value).toBe('Pessoa Fictícia');
        digitar('emp-telefone', '1130000000');
        await window.salvarDadosEmpresa('p1');
        const put = apiMock.mock.calls.find(([m]) => m === 'PUT');
        expect(put[1]).toBe('/api/v1/projects/p1/empresa');
        expect(put[2]).toMatchObject({ cnpj: CNPJ, telefone: '1130000000', representante_nome: 'Pessoa Fictícia' });
    });
});
