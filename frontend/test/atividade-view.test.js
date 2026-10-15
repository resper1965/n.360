// Página da atividade (n.privacy, onda 2): as cinco etapas com o estado escrito, o próximo passo como única ação primária, o teste
// de impacto com o que a atividade já responde, RIPD e LIA, riscos e ações e a aprovação por pedido. api() REAL e delegação REAL;
// só o fetch é dublado, com o corpo de cada handler (src/routes/ropa.ts: GET /, /:id/ligacoes, /:id/impacto, /:id/ciclo, /:id/lia,
// /:id/riscos, /:id/acoes). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/meus-pedidos.js';
import '../src/views/privacy.js';
import { etapasDaAtividade, etapaDoProximoPasso } from '../src/views/atividade.js';
import fonte from '../src/views/atividade.js?raw';

initDelegation();

const P = '/api/v1/projects/p9';
const B = `${P}/ropa/r1`;
const REG = (extra = {}) => ({ id: 'r1', processing_purpose: 'Folha de <b>pagamento</b>', data_subjects: 'Colaboradores', data_categories: 'Identificação',
    legal_basis: 'Execução de contrato', dpia_required: 0, dados_sensiveis: 1, criancas_adolescentes: 0, status: 'Draft',
    aprovacao_pedido: { ciso: null, ceo: null }, ...extra });
const LIG = (extra = {}) => ({ aprovacao: { ciso: null, ceo: null }, aprovacao_anterior: null, pedidos_abertos: 0,
    lia: { exigida: false, existe: false, status: null, origem_mudou: false }, dpias: [], dpia_pendente: false, terceiros_com_avaliacao_vencida: [],
    base_legal: null, itens: [{ id: 'it1', nome: 'ERP', tipo: 'sistema' }], departamentos: [{ id: 'd1', nome: 'RH' }], partes: [], transferencias: [], ...extra });
const pergunta = (id, grupo, extra = {}) => ({ id, grupo, texto: `Pergunta ${id} <i>x</i>`, curto: `motivo ${id}`, resposta: null, da_atividade: null, ...extra });
const IMPACTO = (extra = {}) => ({
    perguntas: [pergunta('afeta_direitos', 'geral'), pergunta('larga_escala', 'geral'), pergunta('sensiveis', 'especifico', { da_atividade: 'sim' }),
        pergunta('legitimo_interesse', 'especifico', { resposta: 'sim', da_atividade: 'nao' })],
    recomendacao: { resultado: 'incompleto', motivos: [] }, finalizado_em: null, ...extra });
const CICLO = { etapas: [{ etapa: 'coleta', rotulo: 'Coleta', situacao: 'registrada' }, { etapa: 'eliminacao', rotulo: 'Eliminação', situacao: null }] };
const rotas = (extra = {}) => ({
    [`GET ${P}/ropa`]: { ok: true, records: [REG()] },
    [`GET ${B}/ligacoes`]: LIG(),
    [`GET ${B}/impacto`]: IMPACTO(),
    [`GET ${B}/ciclo`]: CICLO,
    [`GET ${B}/lia`]: { lia: null },
    [`GET ${B}/riscos`]: { riscos: [] },
    [`GET ${B}/acoes`]: { acoes: [] },
    [`GET ${P}/partes`]: [{ id: 'pa1', nome: 'Ana', status: 'ativa' }],
    [`PUT ${B}/impacto`]: { ok: true },
    [`POST ${B}/dpia`]: { ok: true, id: 'dp1' },
    [`GET ${P}/dpia`]: [{ id: 'dp1', system_name: 'Folha', status: 'Draft' }],
    ...extra,
});
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.filter(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave).pop();
    return c ? JSON.parse(c[1].body) : undefined;
};
const estados = () => [...el('c').querySelectorAll('.at-etapa')].map((li) => `${li.querySelector('.at-etapa-nome').textContent}: ${li.dataset.estado}`);

async function abrir(extra = {}) {
    const f = servir(rotas(extra));
    window.abrirAtividade('p9', 'r1');
    S.view = 'ropa-atividade';
    await window.renderAtividade(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('página da atividade', () => {
    it('título com a finalidade escapada, trilha com cinco etapas e o estado escrito; um único botão primário, o do próximo passo', async () => {
        await abrir();
        expect(el('h').textContent).toBe('Atividade: Folha de <b>pagamento</b>');
        expect(estados()).toEqual(['Dados da atividade: feito', 'Teste de impacto: pendente', 'RIPD ou LIA: pendente', 'Riscos e ações: pendente', 'Aprovação: pendente']);
        expect([...el('c').querySelectorAll('.at-etapa-estado')].map((x) => x.textContent)).toEqual(['Feito', 'Pendente, próximo passo', 'Pendente', 'Pendente', 'Pendente']);
        expect(el('c').querySelector('.at-etapa[aria-current="step"] .at-etapa-nome').textContent).toBe('Teste de impacto');
        const primarios = document.querySelectorAll('.btn-primary');
        expect(primarios).toHaveLength(1);
        expect(primarios[0].id).toBe('at-proximo-acao');
        expect(primarios[0].textContent).toBe('Responder o teste de impacto');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('i')).toBeNull();
    });

    it('teste de impacto: a proposta da atividade vem marcada para conferir; a resposta gravada vence e a divergência é avisada', async () => {
        await abrir();
        const sens = el('at-imp-sensiveis-sim');
        expect(sens.checked).toBe(true);
        expect(sens.closest('.at-pergunta').querySelector('.at-origem').textContent).toBe('Vindo da atividade: confira');
        const li = el('at-imp-legitimo_interesse-sim');
        expect(li.checked).toBe(true);
        expect(li.closest('.at-pergunta').querySelector('.at-origem')).toBeNull();
        expect(li.closest('.at-pergunta').textContent).toContain('A atividade registra Não');
        // uma recomendação só, a do servidor
        expect(el('c').querySelectorAll('#at-recomendacao')).toHaveLength(1);
        expect(el('at-recomendacao').textContent).toContain('incompleto');
    });

    it('salvar manda só o que difere do gravado, inclusive a proposta confirmada; finalizar manda finalizar', async () => {
        const f = await abrir();
        el('at-imp-larga_escala-nao').click();
        el('at-impacto').querySelector('button[type="submit"]').click();
        await vi.waitFor(() => expect(corpoDe(f, `PUT ${B}/impacto`)).toEqual({ respostas: { sensiveis: 'sim', larga_escala: 'nao' } }));
        await vi.waitFor(() => expect(window.render).toHaveBeenCalled());
        el('c').querySelector('[data-action="atFinalizarImpacto"]').click();
        await vi.waitFor(() => expect(corpoDe(f, `PUT ${B}/impacto`)).toMatchObject({ finalizar: true }));
        expect(fonte.match(/ropa\/\$\{rid\}\/impacto`, corpo/g)).toHaveLength(1);
    });

    it('recomendação do servidor em português, com os rótulos curtos; RIPD recomendado vira próximo passo "Criar o RIPD"', async () => {
        const f = await abrir({
            [`GET ${B}/impacto`]: IMPACTO({ finalizado_em: '2026-10-14T10:00:00Z', recomendacao: { resultado: 'recomendado', motivos: ['larga_escala', 'sensiveis'] } }),
        });
        expect(el('at-recomendacao').textContent).toBe('RIPD recomendado: motivo larga_escala; motivo sensiveis.');
        expect(estados()[1]).toBe('Teste de impacto: feito');
        expect(estados()[2]).toBe('RIPD: pendente');
        const acao = el('at-proximo-acao');
        expect(acao.textContent).toBe('Criar o RIPD a partir da atividade');
        acao.click();
        await vi.waitFor(() => expect(chamadas(f)).toContain(`POST ${B}/dpia`));
    });

    it('RIPD existente abre no detalhe dele (onde fica o pedido do RIPD); LIA exigida mostra o formulário sem botão primário', async () => {
        await abrir({
            [`GET ${B}/impacto`]: IMPACTO({ finalizado_em: '2026-10-14T10:00:00Z', recomendacao: { resultado: 'recomendado', motivos: ['larga_escala'] } }),
            [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'dp1', nome: 'RIPD <b>folha</b>', status: 'Under Review', origem_mudou: true }], lia: { exigida: true, existe: false, status: null, origem_mudou: false } }),
        });
        expect(estados()[2]).toBe('RIPD e LIA: pendente');
        const e3 = el('at-e3');
        expect(e3.textContent).toContain(window.traduzStatus('Under Review'));
        expect(e3.textContent).not.toContain('Under Review');
        expect(e3.textContent).toContain('A atividade mudou depois que esta avaliação nasceu');
        expect(el('tl-lia-fin')).not.toBeNull();
        expect(e3.querySelector('.btn-primary')).toBeNull();
        expect(el('at-proximo-acao').textContent).toBe('Fazer a LIA');
        window.openDPIADetailsModal = vi.fn();
        e3.querySelector('[data-action="atAbrirRipd"]').click();
        await vi.waitFor(() => expect(window.openDPIADetailsModal).toHaveBeenCalledWith('dp1'));
    });

    it('riscos e ações na etapa 4, com os formulários de sempre e sem botão primário', async () => {
        await abrir({ [`GET ${B}/riscos`]: { riscos: [{ id: 'k1', threat: 'Vazamento <b>x</b>', impact: 4, probability: 3, risk_level: 'High', status: 'Open' }] } });
        const e4 = el('at-e4');
        expect(estados()[3]).toBe('Riscos e ações: feito');
        expect(e4.textContent).toContain('Vazamento <b>x</b>');
        expect(el('tl-rk-ameaca')).not.toBeNull();
        expect(el('tl-ac-titulo')).not.toBeNull();
        expect(e4.querySelector('.btn-primary')).toBeNull();
    });

    it('aprovação: vigente diz quem e quando; mudou depois diz e pede de novo; aguardando não oferece pedir', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ aprovacao: { ciso: { por: 'Cida <b>M</b>', em: '2026-10-10 12:00:00' }, ceo: null } }) });
        expect(estados()[4]).toBe('Aprovação: feito');
        expect(el('at-aprovada').textContent).toBe('Encarregado (DPO): Cida <b>M</b>, em 10/10/2026.');

        await abrir({ [`GET ${B}/ligacoes`]: LIG({ aprovacao_anterior: { por: 'Cida', em: '2026-10-10 12:00:00' } }) });
        expect(estados()[4]).toBe('Aprovação: mudou');
        expect(el('at-e5').textContent).toContain('Aprovada por Cida em 10/10/2026, mas a atividade mudou depois');
        expect(el('at-e5').querySelector('[data-action="pedirAprovacaoTratamento"]').textContent).toBe('Pedir a aprovação de novo');

        await abrir({ [`GET ${B}/ligacoes`]: LIG({ pedidos_abertos: 1 }) });
        expect(estados()[4]).toBe('Aprovação: aguardando');
        expect(el('at-e5').querySelector('[data-action="pedirAprovacaoTratamento"]')).toBeNull();
    });

    it('vocabulário do n.privacy: sem Líder SGSI, DPIA, Under Review nem EXPIRED na página', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'dp1', nome: 'x', status: 'Under Review', origem_mudou: false }] }) });
        const t = el('c').textContent;
        for (const proibido of ['Líder SGSI', 'DPIA', 'Under Review', 'EXPIRED']) expect(t, proibido).not.toContain(proibido);
        expect(fonte).not.toMatch(/Líder SGSI|style=/);
    });

    it('cliente sem edição vê as etapas e o estado, sem formulário, e o próximo passo diz que é da consultoria', async () => {
        S.user = { role: 'org_user' };
        await abrir();
        expect(el('at-impacto').querySelectorAll('input:not([disabled])')).toHaveLength(0);
        expect(el('tl-rk-ameaca')).toBeNull();
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(0);
        expect(el('c').querySelector('.at-proximo').textContent).toContain('é da equipe da consultoria');
    });

    it('a linha do RoPA abre a página por um botão só ("Abrir"), no lugar de Detalhes, Continuar entrevista e Ligações', async () => {
        S.view = 'ropa';
        servir({ [`GET ${P}/ropa`]: { ok: true, records: [REG()] }, [`GET ${P}/encarregado`]: { tratamentos: { lia_pendente: 0 } } });
        await window.renderROPA(el('c'), el('h'), el('a'));
        const linha = el('c').querySelector('tbody tr');
        const botoes = [...linha.querySelectorAll('button')];
        expect(botoes.map((b) => b.textContent.trim())).toEqual(['Abrir']);
        expect(botoes[0].getAttribute('aria-label')).toBe('Abrir a atividade: Folha de <b>pagamento</b>');
        expect(JSON.parse(botoes[0].getAttribute('data-args'))).toEqual(['p9', 'r1']);
    });
});

describe('etapas (conta pura)', () => {
    const base = { registro: REG(), lig: LIG(), impacto: IMPACTO(), ciclo: CICLO.etapas, lia: null, riscos: [], acoes: [] };
    it('dados pendentes dizem o que falta; ciclo sem nenhuma etapa conta como falta', () => {
        const e = etapasDaAtividade({ ...base, registro: REG({ data_subjects: '', legal_basis: null }), ciclo: [{ etapa: 'coleta', situacao: null }] });
        expect(e[0]).toMatchObject({ estado: 'pendente', resumo: 'Falta: titulares, base legal, ciclo de vida.' });
        expect(etapaDoProximoPasso(e).id).toBe('dados');
    });
    it('teste dispensável e base sem legítimo interesse: RIPD ou LIA não se aplica', () => {
        const e = etapasDaAtividade({ ...base, impacto: IMPACTO({ finalizado_em: '2026-10-14', recomendacao: { resultado: 'dispensavel_a_confirmar', motivos: [] } }) });
        expect(e[2]).toMatchObject({ nome: 'RIPD ou LIA', estado: 'na' });
    });
    it('a assinatura direta antiga continua valendo como aprovação feita', () => {
        const e = etapasDaAtividade({ ...base, registro: REG({ ciso_approved_by: 'Cida', ciso_approved_at: '2026-01-01' }) });
        expect(e[4].estado).toBe('feito');
    });
    it('tudo feito: sem próximo passo', () => {
        const e = etapasDaAtividade({ ...base, impacto: IMPACTO({ finalizado_em: '2026-10-14', recomendacao: { resultado: 'dispensavel_a_confirmar', motivos: [] } }),
            riscos: [{ id: 'k1' }], lig: LIG({ aprovacao: { ciso: { por: 'C', em: '2026-10-10' }, ceo: null } }) });
        expect(e.map((x) => x.estado)).toEqual(['feito', 'feito', 'na', 'feito', 'feito']);
        expect(etapaDoProximoPasso(e)).toBeNull();
    });
});

// Vieram do modal de Ligações (test/tratamento-ligacoes-view.test.js): os formulários são os mesmos, agora nas etapas 3 e 4.
describe('etapa 3: RIPD e LIA', () => {
    it('RIPD exigido e ausente: diz isso e oferece criar; criar chama o POST e redesenha a página', async () => {
        const f = await abrir({ [`GET ${P}/ropa`]: { ok: true, records: [REG({ dpia_required: 1 })] } });
        expect(el('at-e3').textContent).toContain('a atividade exige e ele ainda não foi criado');
        await window.criarDpiaDoTratamento('p9', 'r1');
        expect(chamadas(f)).toContain(`POST ${B}/dpia`);
        expect(window.render).toHaveBeenCalled();
    });

    it('RIPD ligado: nome e situação em português, escapados, sem botão de criar', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'd1', nome: 'Folha <b>x</b>', status: 'Draft' }] }) });
        expect(el('at-e3').textContent).toContain('RIPD Folha <b>x</b>: Rascunho');
        expect(el('at-e3').querySelector('b')).toBeNull();
        expect(el('at-e3').querySelector('[data-action="criarDpiaDoTratamento"]')).toBeNull();
    });

    it('LIA exigida e ausente: salvar rascunho e concluir mandam os campos e o status certo; o Word só com LIA gravada', async () => {
        const lig = { [`GET ${B}/ligacoes`]: LIG({ lia: { exigida: true, existe: false, status: null } }), [`PUT ${B}/lia`]: { ok: true, id: 'l1' } };
        const f = await abrir(lig);
        expect(el('at-e3').textContent).toContain('a LIA é exigida');
        expect(el('at-e3').textContent).toContain('LIA: ainda não feita');
        expect(el('at-e3').querySelector('[data-action="baixarWordLia"]')).toBeNull();
        el('tl-lia-fin').value = ' Prevenir fraude ';
        el('tl-lia-con').value = 'prevalece';
        await window.salvarLiaTratamento('p9', 'r1', false);
        expect(corpoDe(f, `PUT ${B}/lia`)).toEqual({ finalidade_legitima: 'Prevenir fraude', necessidade: null, balanceamento: null, salvaguardas: null, conclusao: 'prevalece', status: 'rascunho' });
        el('tl-lia-fin').value = 'x'; el('tl-lia-nec').value = 'y'; el('tl-lia-bal').value = 'z';
        await window.salvarLiaTratamento('p9', 'r1', true);
        expect(corpoDe(f, `PUT ${B}/lia`).status).toBe('concluida');
        await abrir({ ...lig, [`GET ${B}/lia`]: { lia: { id: 'l1', status: 'rascunho', finalidade_legitima: 'x' } } });
        expect(JSON.parse(el('at-e3').querySelector('[data-action="baixarWordLia"]').getAttribute('data-args'))).toEqual(['p9', 'r1']);
    });

    it('LIA concluída: campos travados, texto escapado, só reabrir; reabrir manda status rascunho', async () => {
        const lia = { id: 'l1', finalidade_legitima: 'Fraude <b>x</b>', necessidade: 'n', balanceamento: 'b', salvaguardas: null, conclusao: 'prevalece', status: 'concluida' };
        const f = await abrir({ [`GET ${B}/ligacoes`]: LIG({ lia: { exigida: true, existe: true, status: 'concluida' } }), [`GET ${B}/lia`]: { lia }, [`PUT ${B}/lia`]: { ok: true } });
        expect(el('tl-lia-fin').disabled).toBe(true);
        expect(el('tl-lia-fin').value).toBe('Fraude <b>x</b>');
        expect(el('tl-lia').querySelector('b')).toBeNull();
        expect(document.querySelector('[data-action="salvarLiaTratamento"]')).toBeNull();
        await window.reabrirLiaTratamento('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/lia`)).toEqual({ status: 'rascunho' });
    });

    it('papel só de leitura vê o estado, sem formulário nem botão de criar', async () => {
        S.user = { role: 'org_user' };
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ lia: { exigida: true, existe: true, status: 'rascunho' } }), [`GET ${B}/lia`]: { lia: { id: 'l1', status: 'rascunho', finalidade_legitima: 'x' } } });
        expect(el('at-e3').textContent).toContain('LIA: em rascunho');
        expect(el('tl-lia')).toBeNull();
        expect(document.querySelector('[data-action="criarDpiaDoTratamento"]')).toBeNull();
    });

    it('selo "mudou na origem" no RIPD e na LIA; sem o selo, nada aparece', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({
            dpias: [{ id: 'd1', nome: 'RIPD da folha', status: 'Draft', origem_mudou: true }],
            lia: { exigida: true, existe: true, status: 'rascunho', origem_mudou: true },
        }) });
        expect(el('at-e3').querySelectorAll('.tl-origem')).toHaveLength(2);
        expect(el('at-e3').textContent).toContain('A atividade mudou depois que esta avaliação nasceu: revise.');
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'd1', nome: 'RIPD', status: 'Draft', origem_mudou: false }] }) });
        expect(el('at-e3').querySelector('.tl-origem')).toBeNull();
    });
});

// F2: riscos e ações da atividade, nas sub-rotas do n.privacy (src/routes/ropa.ts: { riscos } e { acoes }). Mesmo cadastro do n.iso.
describe('etapa 4: riscos e ações', () => {
    const RISCOS = { riscos: [{ id: 'k1', threat: 'Acesso <b>indevido</b>', asset: 'ERP', asset_id: 'it1', vulnerability: null, impact: 4, probability: 4, risk_level: 'High',
        residual_impact: 2, residual_probability: 2, residual_level: 'Low', treatment: 'Mitigate', treatment_plan: 'MFA', status: 'Open', owner_parte_id: 'pa1' }] };
    const ACOES = { acoes: [{ id: 'a1', title: 'Revisar <i>acessos</i>', due_date: '2026-11-30', assigned_to_parte_nome: 'Operadora', risco_ameaca: 'Acesso indevido', risk_id: 'k1', status: 'Open', description: null, assigned_to_parte_id: 'pa1' }] };
    const comRiscos = (extra = {}) => abrir({ [`GET ${B}/riscos`]: RISCOS, [`GET ${B}/acoes`]: ACOES, ...extra });

    it('lista o que existe, com nível por texto, tudo escapado', async () => {
        await comRiscos();
        const r = el('tl-riscos');
        expect(r.textContent).toContain('Acesso <b>indevido</b>');
        expect(r.textContent).toContain('4 x 4');
        expect(r.textContent).toContain('Alto');
        expect(r.textContent).toContain('Baixo');
        expect(el('tl-acoes').textContent).toContain('Revisar <i>acessos</i>');
        expect(el('tl-acoes').textContent).toContain('30/11/2026');
        expect(el('at-e4').querySelector('b, i')).toBeNull();
        expect(el('at-e4').textContent).toContain('1 risco, 1 ação aberta.');
    });

    it('o formulário novo já vem com o sistema ligado à atividade e o responsável dela (pré-preenchimento)', async () => {
        await comRiscos({ [`GET ${P}/ropa`]: { ok: true, records: [REG({ owner_parte_id: 'pa1' })] } });
        expect(el('tl-rk-ativo').value).toBe('it1');
        expect([...el('tl-rk-ativo').querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'it1']);
        expect(el('tl-rk-resp').value).toBe('pa1');
        expect(el('tl-ac-resp').value).toBe('pa1');
        expect([...el('tl-ac-risco').querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'k1']);
    });

    it('registrar risco faz POST com as notas em número; editar preenche o formulário e faz PUT', async () => {
        const f = await comRiscos({ [`POST ${B}/riscos`]: { ok: true, id: 'k2', risk_level: 'Medium' }, [`PUT ${B}/riscos/k1`]: { ok: true, risk_level: 'Low' } });
        el('tl-rk-ameaca').value = ' Vazamento ';
        el('tl-rk-imp').value = '2';
        el('tl-rk-rimp').value = '1';
        el('tl-rk-rprob').value = '2';
        await window.salvarRiscoAtividade('p9', 'r1');
        expect(corpoDe(f, `POST ${B}/riscos`)).toEqual({ threat: 'Vazamento', vulnerability: null, asset_id: 'it1', impact: 2, probability: 3, treatment: 'Mitigate',
            treatment_plan: null, residual_impact: 1, residual_probability: 2, owner_parte_id: null, status: 'Open' });
        expect(window.render).toHaveBeenCalled();
        window.editarRiscoAtividade('k1');
        expect(el('tl-rk-ameaca').value).toBe('Acesso <b>indevido</b>');
        expect(el('tl-rk-titulo').textContent).toBe('Editar risco');
        el('tl-rk-status').value = 'Accepted';
        await window.salvarRiscoAtividade('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/riscos/k1`)).toMatchObject({ threat: 'Acesso <b>indevido</b>', impact: 4, probability: 4, residual_impact: 2, status: 'Accepted', owner_parte_id: 'pa1' });
    });

    it('sem ameaça não envia; apagar pede confirmação na linha antes do DELETE', async () => {
        const f = await comRiscos({ [`DELETE ${B}/riscos/k1`]: { ok: true } });
        await window.salvarRiscoAtividade('p9', 'r1');
        expect(chamadas(f)).not.toContain(`POST ${B}/riscos`);
        window.apagarRiscoAtividade('p9', 'r1', 'k1', false);
        expect(chamadas(f)).not.toContain(`DELETE ${B}/riscos/k1`);
        const confirmar = el('tl-riscos').querySelector('[data-action="apagarRiscoAtividade"]');
        expect(confirmar.textContent).toBe('Confirmar exclusão');
        expect(JSON.parse(confirmar.getAttribute('data-args'))).toEqual(['p9', 'r1', 'k1', true]);
        await window.apagarRiscoAtividade('p9', 'r1', 'k1', true);
        expect(chamadas(f)).toContain(`DELETE ${B}/riscos/k1`);
    });

    it('ação: registrar com o risco da atividade, concluir e editar', async () => {
        const f = await comRiscos({ [`POST ${B}/acoes`]: { ok: true, id: 'a2' }, [`PUT ${B}/acoes/a1`]: { ok: true } });
        el('tl-ac-titulo').value = 'Treinar a equipe';
        el('tl-ac-prazo').value = '2026-12-15';
        el('tl-ac-risco').value = 'k1';
        await window.salvarAcaoAtividade('p9', 'r1');
        expect(corpoDe(f, `POST ${B}/acoes`)).toEqual({ title: 'Treinar a equipe', description: null, due_date: '2026-12-15', assigned_to_parte_id: null, risk_id: 'k1', status: 'Open' });
        await window.concluirAcaoAtividade('p9', 'r1', 'a1');
        expect(corpoDe(f, `PUT ${B}/acoes/a1`)).toEqual({ status: 'Closed' });
        window.editarAcaoAtividade('a1');
        expect(el('tl-ac-prazo').value).toBe('2026-11-30');
        expect(el('tl-ac-risco').value).toBe('k1');
    });

    it('cliente sem edição só lê; nenhum botão leva ao n.iso (matriz de riscos, CAPA)', async () => {
        S.user = { role: 'org_user' };
        await comRiscos();
        expect(el('tl-riscos').textContent).toContain('Acesso <b>indevido</b>');
        expect(el('tl-rk-ameaca')).toBeNull();
        expect(el('c').querySelector('[data-action="apagarRiscoAtividade"]')).toBeNull();
        S.user = { role: 'consultor' };
        await comRiscos();
        const destinos = [...el('c').querySelectorAll('[data-action="navigate"]')].map((b) => b.getAttribute('data-args'));
        expect(destinos.filter((d) => /risks|capa|soa/.test(d))).toEqual([]);
        expect(el('c').innerHTML).not.toMatch(/\/iso\b/);
    });

    it('sub-rota indisponível não impede abrir a página', async () => {
        const r = rotas();
        delete r[`GET ${B}/riscos`]; delete r[`GET ${B}/acoes`]; delete r[`GET ${B}/impacto`];
        servir(r);
        window.abrirAtividade('p9', 'r1');
        S.view = 'ropa-atividade';
        await window.renderAtividade(el('c'), el('h'), el('a'));
        expect(el('tl-riscos').textContent).toContain('Nenhum risco registrado');
        expect(el('tl-acoes').textContent).toContain('Nenhuma ação registrada');
        expect(el('at-e2').textContent).toContain('Não foi possível ler o teste.');
    });
});
