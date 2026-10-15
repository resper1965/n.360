// RoPA e RIPD no n.privacy: base legal completa (art. 7 e art. 11), status em PT, riscos do tratamento à vista,
// estado vazio que ensina e sem cor fora dos tokens. api() dublado: o contrato é o mesmo de capa-ropa-responsavel.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost', cabecalhosAuth: () => ({ Authorization: 'Bearer tok-sessao' }) }));
vi.mock('../src/router.js', () => ({ render: vi.fn(), navigate: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/privacy.js';
import fonte from '../src/views/privacy.js?raw';

const el = (id) => document.getElementById(id);
let rotas;
beforeEach(() => {
    apiMock.mockReset();
    rotas = {};
    apiMock.mockImplementation((m, url) => Promise.resolve(m !== 'GET' ? { ok: true } : (Object.entries(rotas).find(([k]) => url.endsWith(k)) || [])[1] ?? []));
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    window.render = vi.fn();
});

const ART7 = ['Consentimento', 'Cumprimento de obrigação legal ou regulatória', 'Execução de políticas públicas', 'Estudos por órgão de pesquisa',
    'Execução de contrato ou procedimentos preliminares', 'Exercício regular de direitos', 'Proteção da vida ou incolumidade física', 'Tutela da saúde',
    'Legítimo interesse', 'Proteção do crédito'];
const ART11 = ['Consentimento específico e destacado', 'Obrigação legal ou regulatória', 'Políticas públicas', 'Estudos por órgão de pesquisa',
    'Exercício regular de direitos', 'Proteção da vida', 'Tutela da saúde', 'Prevenção à fraude e segurança do titular'];

describe('base legal do RoPA', () => {
    it('as 10 hipóteses do art. 7 e as 8 do art. 11, com acento, em optgroups', async () => {
        await window.openNewROPAModal('p1');
        const grupos = [...el('ropa-basis').querySelectorAll('optgroup')];
        expect(grupos.map((g) => g.label)).toEqual(['Art. 7 (dados pessoais)', 'Art. 11 (dados sensíveis)']);
        expect([...grupos[0].querySelectorAll('option')].map((o) => o.textContent)).toEqual(ART7);
        expect([...grupos[1].querySelectorAll('option')].map((o) => o.textContent)).toEqual(ART11);
        // valores distintos entre os dois artigos (os rótulos repetem: "Tutela da saúde" existe nos dois)
        const valores = [...el('ropa-basis').querySelectorAll('option')].map((o) => o.value).filter(Boolean);
        expect(new Set(valores).size).toBe(valores.length);
    });

    it('grava o texto da hipótese: legítimo interesse continua reconhecido pela regra da LIA (que procura "legitimo interesse")', async () => {
        await window.openNewROPAModal('p1');
        el('ropa-purpose').value = 'Prevenção a fraude';
        el('ropa-basis').value = 'Legítimo interesse';
        await window.createROPA('p1');
        const post = apiMock.mock.calls.find((c) => c[0] === 'POST');
        expect(post[2].legal_basis).toBe('Legítimo interesse');
        expect(post[2].legal_basis.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()).toContain('legitimo interesse');
    });

    it('valor antigo gravado sem acento aparece com o rótulo atual na lista e vem selecionado na edição', async () => {
        rotas['/ropa'] = [{ id: 'r1', project_id: 'p1', processing_purpose: 'Folha', legal_basis: 'Execucao contratual', status: 'Inactive' }];
        await window.renderROPA(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Execução de contrato ou procedimentos preliminares');
        expect(el('c').textContent).toContain('Inativo');
        await window.openEditROPAModal('r1');
        // selecionado o valor gravado (bruto), com o rótulo atual: salvar sem mexer não reescreve a base (e não reenvia pedidos)
        const sel = el('ropa-e-basis');
        expect(sel.value).toBe('Execucao contratual');
        expect(sel.selectedOptions[0].textContent).toBe('Execução de contrato ou procedimentos preliminares (valor antigo)');
        await window.updateROPA('r1');
        expect(apiMock.mock.calls.find((c) => c[0] === 'PUT')[2].legal_basis).toBe('Execucao contratual');
    });

    it('valor antigo trocado pelo usuário grava a hipótese nova', async () => {
        S.ropa = [{ id: 'r1', project_id: 'p1', processing_purpose: 'Folha', legal_basis: 'interesse legitimo' }];
        await window.openEditROPAModal('r1');
        el('ropa-e-basis').value = 'Legítimo interesse';
        await window.updateROPA('r1');
        expect(apiMock.mock.calls.find((c) => c[0] === 'PUT')[2].legal_basis).toBe('Legítimo interesse');
    });

    it('valor livre desconhecido (importado) não some: fica como opção selecionada', async () => {
        S.ropa = [{ id: 'r2', project_id: 'p1', processing_purpose: 'X', legal_basis: 'Art. 7, II (contrato <b>)' }];
        await window.openEditROPAModal('r2');
        expect(el('ropa-e-basis').value).toBe('Art. 7, II (contrato <b>)');
        expect(el('ropa-e-basis').querySelector('b')).toBeNull();
    });
});

describe('formulário do RoPA', () => {
    it('criação não oferece status (o POST grava sempre rascunho); edição tem status com rótulo em PT e valor em inglês', async () => {
        await window.openNewROPAModal('p1');
        expect(el('ropa-status')).toBeNull();
        expect(el('ropa-nasce-rascunho').textContent).toContain('rascunho');
        el('ropa-purpose').value = 'Folha';
        await window.createROPA('p1');
        expect(apiMock.mock.calls.find((c) => c[0] === 'POST')[2]).not.toHaveProperty('status');
        S.ropa = [{ id: 'r1', project_id: 'p1', processing_purpose: 'X', status: 'Draft' }];
        await window.openEditROPAModal('r1');
        expect([...el('ropa-e-status').options].map((o) => o.textContent)).toEqual(['Ativo', 'Inativo', 'Rascunho', 'Em revisão']);
        expect(el('ropa-e-status').value).toBe('Draft');
    });

    it('seção "Riscos do tratamento" logo após a base legal; salvaguarda só com transferência marcada', async () => {
        await window.openNewROPAModal('p1');
        const html = el('modal-content').innerHTML;
        expect(html.indexOf('ropa-basis')).toBeLessThan(html.indexOf('Riscos do tratamento'));
        expect(html.indexOf('Riscos do tratamento')).toBeLessThan(html.indexOf('ropa-retention'));
        expect(el('modal-content').textContent).toContain('Transferência internacional (arts. 33-36)');
        expect(el('modal-content').textContent).toContain('Exige RIPD');
        expect(el('ropa-safeguards').placeholder).toBe('Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)');
        const grupo = el('ropa-safeguards').closest('.form-group');
        expect(grupo.hidden).toBe(true);
        el('ropa-intl').checked = true;
        window.alternarSalvaguarda('ropa');
        expect(grupo.hidden).toBe(false);
    });

    it('dados sensíveis (art. 11) e crianças e adolescentes (art. 14): checkbox nos riscos, enviados na criação e na edição', async () => {
        await window.openNewROPAModal('p1');
        const riscos = el('modal-content').querySelector('fieldset').textContent;
        expect(riscos).toContain('Dados sensíveis (art. 11)');
        expect(riscos).toContain('Crianças e adolescentes (art. 14)');
        el('ropa-purpose').value = 'Prontuário';
        el('ropa-sensiveis').checked = true;
        await window.createROPA('p1');
        expect(apiMock.mock.calls.find((c) => c[0] === 'POST')[2]).toMatchObject({ dados_sensiveis: 1, criancas_adolescentes: 0 });

        S.ropa = [{ id: 'r9', project_id: 'p1', processing_purpose: 'Creche', dados_sensiveis: 0, criancas_adolescentes: 1 }];
        await window.openEditROPAModal('r9');
        expect(el('ropa-e-sensiveis').checked).toBe(false);
        expect(el('ropa-e-criancas').checked).toBe(true);
        el('ropa-e-sensiveis').checked = true;
        await window.updateROPA('r9');
        expect(apiMock.mock.calls.find((c) => c[0] === 'PUT')[2]).toMatchObject({ dados_sensiveis: 1, criancas_adolescentes: 1 });
    });

    it('cópia sem palavra sem acento nem hex de cor fora dos tokens', () => {
        for (const w of ['Retencao', 'Execucao', 'Obrigacao', 'Protecao', 'Transferencia', 'Destinatarios', 'Faca ', ' sao ', ' nao ', 'Cartao', 'descricao', 'Mitigacao', 'necessarios']) expect(fonte).not.toContain(w);
        expect(fonte).not.toMatch(/#34c759|#ffcc00|#ff3b30|#feca57/i);
    });
});

describe('correções P0 do RoPA', () => {
    it('base legal: o texto escolhido leva junto o id do catálogo quando ele está carregado', async () => {
        rotas['/requisitos?fonte=lgpd'] = [{ id: 'lgpd:art7:ix', pai_id: 'lgpd:art7' }];
        await window.openNewROPAModal('p1');
        el('ropa-purpose').value = 'Prevenção a fraude';
        el('ropa-basis').value = 'Legítimo interesse';
        await window.createROPA('p1');
        expect(apiMock.mock.calls.find((c) => c[0] === 'POST')[2]).toMatchObject({ legal_basis: 'Legítimo interesse', base_legal_id: 'lgpd:art7:ix' });
    });

    it('finalidade vazia e falha do servidor viram aviso, sem fechar o formulário em silêncio', async () => {
        await window.openNewROPAModal('p1');
        await window.createROPA('p1');
        expect(apiMock.mock.calls.some((c) => c[0] === 'POST')).toBe(false);
        expect(document.querySelector('.toast').textContent).toContain('Informe a finalidade');
        apiMock.mockImplementation((m) => (m === 'POST' ? Promise.reject(new Error('Falha simulada')) : Promise.resolve([])));
        el('ropa-purpose').value = 'Folha';
        await window.createROPA('p1');
        expect([...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' ')).toContain('Falha simulada');
        expect(el('ropa-purpose')).not.toBeNull();
    });

    it('editar registro aprovado pede confirmação antes do PUT; cancelar não grava', async () => {
        window.confirmar = vi.fn(async () => false);
        S.ropa = [{ id: 'r1', project_id: 'p1', processing_purpose: 'Folha', status: 'Approved' }];
        await window.openEditROPAModal('r1');
        await window.updateROPA('r1');
        expect(window.confirmar).toHaveBeenCalledTimes(1);
        expect(window.confirmar.mock.calls[0][0]).toContain('substitui o pedido de aprovação');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(false);
        window.confirmar = vi.fn(async () => true);
        await window.updateROPA('r1');
        expect(apiMock.mock.calls.some((c) => c[0] === 'PUT')).toBe(true);
        // sem aprovação nenhuma, não pergunta
        window.confirmar = vi.fn(async () => true);
        S.ropa = [{ id: 'r2', project_id: 'p1', processing_purpose: 'Cobrança', status: 'Draft', aprovacao_pedido: { ciso: null, ceo: null } }];
        await window.openEditROPAModal('r2');
        await window.updateROPA('r2');
        expect(window.confirmar).not.toHaveBeenCalled();
    });

    it('relatório do RoPA e do RIPD: busca com o cabeçalho da sessão e abre o blob; token nunca na URL', async () => {
        const f = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>relatório</html>' }));
        vi.stubGlobal('fetch', f);
        const abre = vi.fn(() => ({}));
        vi.stubGlobal('open', abre);
        URL.createObjectURL = vi.fn(() => 'blob:relatorio');
        URL.revokeObjectURL = vi.fn();
        S.token = 'tok-sessao';
        await window.openROPAReport('p1');
        await window.openDPIAReport('p1', 'd1');
        expect(f.mock.calls.map((c) => c[0])).toEqual(['http://localhost/api/v1/projects/p1/ropa/report', 'http://localhost/api/v1/projects/p1/dpia/d1/report']);
        expect(f.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok-sessao' });
        expect(abre).toHaveBeenCalledWith('blob:relatorio', '_blank');
        expect(fonte).not.toContain('token=');
        vi.unstubAllGlobals();
    });

    it('registro importado com risco não informado ganha o selo "Importado: revisar"', async () => {
        rotas['/ropa'] = [{ id: 'r1', project_id: 'p1', processing_purpose: 'Visitantes', nao_informado: ['criancas_adolescentes'] },
            { id: 'r2', project_id: 'p1', processing_purpose: 'Folha', nao_informado: [] }];
        await window.renderROPA(el('c'), el('h'), el('a'));
        const linhas = [...el('c').querySelectorAll('tbody tr')].map((tr) => tr.textContent);
        expect(linhas.find((t) => t.includes('Visitantes'))).toContain('Importado: revisar');
        expect(linhas.find((t) => t.includes('Folha'))).not.toContain('Importado');
        // cada linha oferece continuar a entrevista
        expect(el('c').querySelectorAll('[data-action="abrirRopaEntrevista"]')).toHaveLength(2);
        expect(el('a').querySelector('.btn-primary').textContent).toBe('Nova atividade (entrevista)');
    });
});

describe('lista do RoPA', () => {
    it('vazia: explica o art. 37 e oferece registrar e importar', async () => {
        await window.renderROPA(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toContain('RoPA');
        expect(el('c').textContent).toContain('O inventário de tratamentos (art. 37) está vazio.');
        const acoes = [...el('c').querySelectorAll('.empty-state [data-action]')].map((b) => b.getAttribute('data-action'));
        expect(acoes).toEqual(['abrirRopaEntrevista', 'openNewROPAModal', 'openImportarRopaModal']);
        // a entrevista é o botão principal; o formulário inteiro fica como edição avançada
        expect(el('c').querySelector('.empty-state [data-action="abrirRopaEntrevista"]').className).toContain('btn-primary');
        expect(el('c').querySelector('.empty-state [data-action="openNewROPAModal"]').textContent).toBe('Edição avançada');
    });

    it('legítimo interesse: botão "Base legal e LIA" e cartão de LIA pendente vindo da visão do encarregado', async () => {
        rotas['/ropa'] = [
            { id: 'r1', project_id: 'p1', processing_purpose: 'Fraude', legal_basis: 'Legítimo interesse', international_transfers: 1, transfer_safeguards: '' },
            { id: 'r2', project_id: 'p1', processing_purpose: 'Folha', legal_basis: 'Consentimento' },
        ];
        rotas['/encarregado'] = { tratamentos: { lia_pendente: 1 } };
        await window.renderROPA(el('c'), el('h'), el('a'));
        const botoes = [...el('c').querySelectorAll('[data-action="openLigacoesTratamento"]')].map((b) => b.textContent.trim());
        expect(botoes).toEqual(['Base legal e LIA', 'Ligações']);
        const card = [...el('c').querySelectorAll('.stat-card')].find((x) => x.textContent.includes('Legítimo interesse sem LIA'));
        expect(card.textContent).toContain('1');
        // transferência sem salvaguarda é aviso, não violação
        const transf = [...el('c').querySelectorAll('.stat-card')].find((x) => x.textContent.includes('Com transferência internacional'));
        expect(transf.innerHTML).toContain('var(--warning)');
        // o PDF é do projeto inteiro: sai da linha e vai para o header
        expect(el('c').querySelector('[data-action="openROPAReport"]')).toBeNull();
        expect(el('a').querySelector('[data-action="openROPAReport"]').textContent).toBe('Exportar RoPA (PDF)');
    });
});

describe('RIPD (DPIA)', () => {
    it('título, botão e status em PT', async () => {
        rotas['/dpia'] = [{ id: 'd1', system_name: 'CRM', status: 'Under Review' }];
        await window.renderDPIA(el('c'), el('h'), el('a'));
        expect(el('h').textContent).toBe('RIPD (DPIA)');
        expect(el('a').textContent).toContain('Novo RIPD');
        expect(el('c').textContent).toContain('Aguardando o encarregado');
        expect(el('c').textContent).not.toContain('CISO');
        window.openEditDPIAModal('d1');
        expect([...el('dpia-e-status').options].map((o) => [o.value, o.textContent])).toEqual([['Draft', 'Rascunho'], ['Under Review', 'Em revisão']]);
    });

    it('vazio com tratamentos marcados: diz quantos exigem RIPD e leva ao RoPA', async () => {
        rotas['/ropa'] = [{ id: 'r1', dpia_required: 1 }, { id: 'r2', dpia_required: 1 }, { id: 'r3', dpia_required: 0 }];
        await window.renderDPIA(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Nenhum RIPD. 2 tratamentos do RoPA estão marcados como "Exige RIPD".');
        expect(JSON.parse(el('c').querySelector('.empty-state [data-action="navigate"]').getAttribute('data-args'))).toEqual(['ropa']);
    });

    it('selo "mudou na origem" (F3): só no RIPD cujo tratamento mudou depois que ele nasceu', async () => {
        rotas['/dpia'] = [{ id: 'd1', system_name: 'CRM', status: 'Draft', origem_mudou: true }, { id: 'd2', system_name: 'ERP', status: 'Draft', origem_mudou: false }];
        await window.renderDPIA(el('c'), el('h'), el('a'));
        const linhas = [...el('c').querySelectorAll('tr')];
        expect(linhas.find((l) => l.textContent.includes('CRM')).textContent).toContain('RoPA mudou depois deste RIPD: revise');
        expect(linhas.find((l) => l.textContent.includes('ERP')).textContent).not.toContain('RoPA mudou');
    });

    it('vazio sem marcação: ensina a marcar', async () => {
        await window.renderDPIA(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Marque no RoPA os tratamentos de alto risco para saber onde o RIPD é exigido.');
    });
});

describe('Fornecedores (vendors) sem fornecedor', () => {
    it('o score médio é "—" em --text-dim, não "0/100" em vermelho', async () => {
        await import('../src/views/grc.js');
        rotas['/vendors'] = [];
        await window.renderVendors(el('c'), el('h'), el('a'));
        const card = [...el('c').querySelectorAll('.stat-card')].find((x) => x.textContent.includes('Trust Score'));
        expect(card.children[1].textContent).toBe('—');
        expect(card.children[1].getAttribute('style')).toContain('var(--text-dim)');
        expect(el('c').innerHTML).not.toContain('0/100');
    });
});
