// Modal Ligações do tratamento (fatia 4.1/4.2): base legal, itens, departamentos, partes, transferências e diagrama.
// api() REAL; só o fetch é dublado, com o corpo de cada handler (src/routes/ropa.ts). A query string não entra na chave.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/tratamento-ligacoes.js';

const B = '/api/v1/projects/p9/ropa/r1';
const LIG = (extra = {}) => ({
    aprovacao: { ciso: null, ceo: null }, lia: { exigida: false, existe: false, status: null }, dpias: [], dpia_pendente: false, terceiros_com_avaliacao_vencida: [],
    base_legal: { id: 'lgpd:art7:i', referencia: 'art. 7, I', titulo: 'Base <b>x</b>' },
    itens: [{ id: 'it1', nome: 'ERP <i>x</i>', tipo: 'sistema' }],
    departamentos: [{ id: 'dp1', nome: 'RH' }],
    partes: [{ vinculo_id: 'v1', parte_id: 'pa1', nome: 'Operadora <b>y</b>', tipo: 'organizacao', papel: 'operador' }],
    transferencias: [{ id: 't1', pais: 'Chile', destinatario_parte_id: 'pa1', destinatario: 'Operadora <b>y</b>', mecanismo: 'cláusulas', observacao: null }],
    ...extra,
});
const rotas = (extra = {}) => ({
    [`GET ${B}/ligacoes`]: LIG(),
    [`GET ${B}/diagrama`]: { mermaid: 'flowchart LR\n  n0["Folha"]' },
    [`GET ${B}/lia`]: { lia: null },
    'GET /api/v1/projects/p9/assets': { ok: true, assets: [{ id: 'it1', name: 'ERP' }, { id: 'it2', name: 'Folha' }] },
    'GET /api/v1/projects/p9/departamentos': [{ id: 'dp1', nome: 'RH' }, { id: 'dp2', nome: 'TI' }],
    'GET /api/v1/projects/p9/partes': [{ id: 'pa1', nome: 'Operadora', status: 'ativa' }, { id: 'pa2', nome: 'Antiga', status: 'inativa' }],
    'GET /api/v1/requisitos': [
        { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Bases', pai_id: null },
        { id: 'lgpd:art7:i', fonte_id: 'lgpd', referencia: 'art. 7, I', titulo: 'Base <b>x</b>', pai_id: 'lgpd:art7' },
        { id: 'lgpd:art9', fonte_id: 'lgpd', referencia: 'art. 9', titulo: 'Acesso', pai_id: null },
    ],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

async function abrir(extra = {}) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir(rotas(extra));
    await window.openLigacoesTratamento('p9', 'r1');
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.ropa = [{ id: 'r1', processing_purpose: 'Folha de <b>pagamento</b>' }];
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('modal de ligações', () => {
    it('mostra base legal, itens, departamentos, partes e transferências, tudo escapado', async () => {
        await abrir();
        const m = el('modal-content');
        expect(m.textContent).toContain('Folha de <b>pagamento</b>');
        expect(m.textContent).toContain('art. 7, I — Base <b>x</b>');
        expect(m.textContent).toContain('Operadora <b>y</b>');
        expect(m.textContent).toContain('Operador');
        expect(m.textContent).toContain('Chile');
        expect(m.textContent).toContain('cláusulas');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
    });

    it('itens e departamentos: marcados vêm de ligações; só as bases do art. 7 e 11 entram no seletor; parte inativa fica de fora', async () => {
        await abrir();
        const marcado = (tipo) => [...document.querySelectorAll(`input[data-tl="${tipo}"]`)].map((i) => `${i.value}:${i.checked}`);
        expect(marcado('item')).toEqual(['it1:true', 'it2:false']);
        expect(marcado('depto')).toEqual(['dp1:true', 'dp2:false']);
        expect([...el('tl-base').querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'lgpd:art7:i']);
        expect([...el('tl-parte').querySelectorAll('option')].map((o) => o.value)).toEqual(['pa1']);
    });

    it('diagrama aparece como texto, sem virar HTML, e tem botão de copiar', async () => {
        await abrir({ [`GET ${B}/diagrama`]: { mermaid: 'flowchart LR\n  n0["<img src=x onerror=alert(1)>"]' } });
        expect(el('tl-diagrama').textContent).toContain('flowchart LR');
        expect(el('tl-diagrama').querySelector('img')).toBeNull();
        expect(document.querySelector('[data-action="copiarDiagramaTratamento"]')).not.toBeNull();
    });

    it('sem bases no catálogo: aviso no lugar do seletor', async () => {
        await abrir({ 'GET /api/v1/requisitos': [] });
        expect(el('tl-base')).toBeNull();
        expect(el('modal-content').textContent).toContain('ainda não tem as bases legais carregadas');
    });

    it('papel só de leitura vê as ligações, sem seletores nem botões, e não busca listas de edição', async () => {
        S.user = { role: 'org_user' };
        const f = await abrir();
        const m = el('modal-content');
        expect(m.textContent).toContain('ERP');
        expect(m.querySelector('input, select, [data-action="salvarItensTratamento"], [data-action="removerParteTratamento"]')).toBeNull();
        expect(chamadas(f)).not.toContain('GET /api/v1/projects/p9/assets');
    });
});

describe('ações', () => {
    it('salvar itens manda os marcados; salvar departamentos idem', async () => {
        const f = await abrir({ [`PUT ${B}/itens`]: { ok: true, total: 2 }, [`PUT ${B}/departamentos`]: { ok: true, total: 1 } });
        document.querySelector('input[data-tl="item"][value="it2"]').checked = true;
        await window.salvarItensTratamento('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/itens`)).toEqual({ itens: ['it1', 'it2'] });
        document.querySelector('input[data-tl="depto"][value="dp1"]').checked = false;
        await window.salvarDepartamentosTratamento('p9', 'r1');
        expect(corpoDe(f, `PUT ${B}/departamentos`)).toEqual({ departamentos: [] });
    });

    it('salvar base legal manda a finalidade (campo obrigatório) e a base; vazio desliga', async () => {
        const f = await abrir({ 'PUT /api/v1/ropa/r1': { ok: true } });
        el('tl-base').value = '';
        await window.salvarBaseLegalTratamento('p9', 'r1');
        expect(corpoDe(f, 'PUT /api/v1/ropa/r1')).toEqual({ processing_purpose: 'Folha de <b>pagamento</b>', base_legal_id: null });
    });

    it('salvar base do catálogo grava também o texto da hipótese (art. 7 e art. 11)', async () => {
        const f = await abrir({ 'PUT /api/v1/ropa/r1': { ok: true } });
        const sel = el('tl-base');
        sel.innerHTML += '<option value="lgpd:art11:ii-f">art. 11, II, f</option>';
        sel.value = 'lgpd:art11:ii-f';
        await window.salvarBaseLegalTratamento('p9', 'r1');
        expect(corpoDe(f, 'PUT /api/v1/ropa/r1')).toEqual({ processing_purpose: 'Folha de <b>pagamento</b>', base_legal_id: 'lgpd:art11:ii-f', legal_basis: 'Tutela da saúde (art. 11)' });
    });

    it('ligar parte usa o vínculo existente com alvo tratamento; remover chama o DELETE do vínculo', async () => {
        const f = await abrir({ 'POST /api/v1/projects/p9/partes/pa1/vinculos': { ok: true, id: 'v2' }, 'DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1': { ok: true } });
        el('tl-papel').value = 'suboperador';
        await window.adicionarParteTratamento('p9', 'r1');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/partes/pa1/vinculos')).toEqual({ papel: 'suboperador', alvo_tipo: 'tratamento', alvo_id: 'r1' });
        await window.removerParteTratamento('p9', 'r1', 'pa1', 'v1');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1');
    });

    it('transferência: país obrigatório (não envia sem ele); com país manda destinatário e mecanismo; remover chama o DELETE', async () => {
        const f = await abrir({ [`POST ${B}/transferencias`]: { ok: true, id: 't2' }, [`DELETE ${B}/transferencias/t1`]: { ok: true } });
        el('tl-pais').value = '  ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(chamadas(f)).not.toContain(`POST ${B}/transferencias`);
        el('tl-pais').value = ' Estados Unidos ';
        el('tl-dest').value = 'pa1';
        el('tl-mec').value = ' cláusulas-padrão ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(corpoDe(f, `POST ${B}/transferencias`)).toEqual({ pais: 'Estados Unidos', destinatario_parte_id: 'pa1', mecanismo: 'cláusulas-padrão' });
        await window.removerTransferenciaTratamento('p9', 'r1', 't1');
        expect(chamadas(f)).toContain(`DELETE ${B}/transferencias/t1`);
    });

    it('erro do servidor vira aviso e não derruba a tela', async () => {
        await abrir();
        await window.salvarItensTratamento('p9', 'r1'); // PUT sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
    });
});

describe('importação do RoPA por planilha', () => {
    const abrirImportar = () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        window.openImportarRopaModal('p9');
    };
    const arquivo = (texto) => {
        const f = new File([texto], 'ropa.csv', { type: 'text/csv' });
        Object.defineProperty(el('ri-arquivo'), 'files', { value: [f], configurable: true });
    };

    it('o modal explica o formato e oferece importar e baixar o modelo', () => {
        abrirImportar();
        expect(el('modal-content').textContent).toContain('finalidade');
        expect(document.querySelector('[data-action="enviarImportacaoRopa"]')).not.toBeNull();
        expect(document.querySelector('[data-action="baixarModeloRopa"]')).not.toBeNull();
    });

    it('sem arquivo não chama a API', async () => {
        const f = servir({});
        abrirImportar();
        await window.enviarImportacaoRopa('p9');
        expect(chamadas(f)).toEqual([]);
    });

    it('manda o texto do arquivo e mostra criados, existentes e recusadas (motivo escapado)', async () => {
        const f = servir({ 'POST /api/v1/projects/p9/ropa/importar': { ok: true, criados: 2, ja_existiam: 1, recusadas: [{ linha: 4, motivo: 'retention_period: <b>grande</b>' }] } });
        abrirImportar();
        arquivo('finalidade\nA\nB');
        await window.enviarImportacaoRopa('p9');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/ropa/importar')).toEqual({ csv: 'finalidade\nA\nB' });
        const rel = el('ri-relatorio');
        expect(rel.textContent).toContain('2 criados, 1 já existiam, 1 recusadas');
        expect(rel.textContent).toContain('retention_period: <b>grande</b>');
        expect(rel.querySelector('b')).toBeNull();
        expect(window.render).toHaveBeenCalled();
    });

    it('erro do servidor vira aviso e o relatório fica vazio', async () => {
        servir({}); // sem dublê: 404 do Worker, que api() lança como erro
        abrirImportar();
        arquivo('finalidade\nA');
        await window.enviarImportacaoRopa('p9');
        expect(el('ri-relatorio').innerHTML).toBe('');
    });
});

describe('avaliações: DPIA e LIA', () => {
    it('DPIA exigida e ausente: aviso e botão de criar; criar chama o POST e reabre', async () => {
        const f = await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpia_pendente: true }), [`POST ${B}/dpia`]: { ok: true, id: 'd1' } });
        expect(el('tl-avaliacoes').textContent).toContain('exigida por este registro e ainda não criada');
        await window.criarDpiaDoTratamento('p9', 'r1');
        expect(chamadas(f)).toContain(`POST ${B}/dpia`);
    });

    it('DPIA ligada: lista nome e situação (escapados), sem botão de criar', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'd1', nome: 'Folha <b>x</b>', status: 'Draft' }] }) });
        expect(el('tl-avaliacoes').textContent).toContain('Folha <b>x</b> (Draft)');
        expect(el('tl-avaliacoes').querySelector('b')).toBeNull();
        expect(document.querySelector('[data-action="criarDpiaDoTratamento"]')).toBeNull();
    });

    it('LIA exigida e ausente: avisa; salvar rascunho e concluir mandam os campos e o status certo', async () => {
        const f = await abrir({ [`GET ${B}/ligacoes`]: LIG({ lia: { exigida: true, existe: false, status: null } }), [`PUT ${B}/lia`]: { ok: true, id: 'l1' } });
        expect(el('tl-avaliacoes').textContent).toContain('exigida pela base legal');
        expect(el('tl-avaliacoes').textContent).toContain('ainda não feita');
        el('tl-lia-fin').value = ' Prevenir fraude ';
        el('tl-lia-con').value = 'prevalece';
        await window.salvarLiaTratamento('p9', 'r1', false);
        expect(corpoDe(f, `PUT ${B}/lia`)).toEqual({ finalidade_legitima: 'Prevenir fraude', necessidade: null, balanceamento: null, salvaguardas: null, conclusao: 'prevalece', status: 'rascunho' });
        el('tl-lia-fin').value = 'x'; el('tl-lia-nec').value = 'y'; el('tl-lia-bal').value = 'z';
        await window.salvarLiaTratamento('p9', 'r1', true);
        const puts = f.mock.calls.filter(([u, o]) => o?.method === 'PUT' && new URL(u, 'http://localhost').pathname === `${B}/lia`);
        expect(JSON.parse(puts.at(-1)[1].body).status).toBe('concluida');
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
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ lia: { exigida: true, existe: true, status: 'rascunho' } }) });
        expect(el('tl-avaliacoes').textContent).toContain('em rascunho');
        expect(el('tl-lia')).toBeNull();
        expect(document.querySelector('[data-action="criarDpiaDoTratamento"]')).toBeNull();
    });
});

describe('terceiro com avaliação vencida', () => {
    it('avisa na seção de partes, com o nome escapado; sem vencido não aparece', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ terceiros_com_avaliacao_vencida: [{ parte_id: 'pa1', nome: 'Operadora <b>y</b>' }] }) });
        expect(el('tl-vencidos').textContent).toContain('Avaliação vencida: Operadora <b>y</b>');
        expect(el('tl-vencidos').querySelector('b')).toBeNull();
        await abrir();
        expect(el('tl-vencidos')).toBeNull();
    });
});

describe('sugestão da IA', () => {
    const SUG = { ok: true, sugestao: { base_legal: 'lgpd:art7:i', retencao: '5 anos <b>após</b>', dpia_requerido: true, justificativa: 'Porque <img src=x onerror=alert(1)>' } };

    it('Sugerir mostra a proposta editável, com o aviso de rascunho, tudo escapado; nada é gravado até Aplicar', async () => {
        const f = await abrir({ [`POST ${B}/sugestao`]: SUG, 'PUT /api/v1/ropa/r1': { ok: true } });
        await window.sugerirTratamento('p9', 'r1');
        const s = el('tl-sugestao');
        expect(s.textContent).toContain('Rascunho gerado por IA — revise antes de usar');
        expect(el('tl-sug-base').value).toBe('lgpd:art7:i');
        expect(el('tl-sug-ret').value).toBe('5 anos <b>após</b>');
        expect(el('tl-sug-dpia').checked).toBe(true);
        expect(el('tl-sug-just').textContent).toContain('<img src=x');
        expect(s.querySelector('img, b')).toBeNull();
        expect(chamadas(f)).not.toContain('PUT /api/v1/ropa/r1');
        el('tl-sug-ret').value = ' 2 anos ';
        await window.aplicarSugestaoTratamento('p9', 'r1');
        // o catálogo manda: o texto da hipótese sai do id, junto (a LIA, o PDF e os pedidos leem o texto)
        expect(corpoDe(f, 'PUT /api/v1/ropa/r1')).toEqual({ processing_purpose: 'Folha de <b>pagamento</b>', base_legal_id: 'lgpd:art7:i', legal_basis: 'Consentimento', retention_period: '2 anos', dpia_required: true });
    });

    it('org_admin vê Sugerir; org_user não; falha do servidor vira aviso', async () => {
        S.user = { role: 'org_admin' };
        await abrir();
        expect(el('modal-content').querySelector('[data-action="sugerirTratamento"]')).not.toBeNull();
        await window.sugerirTratamento('p9', 'r1'); // sem dublê: 404 do Worker
        expect(document.body.textContent).toContain('API route not found');
        S.user = { role: 'org_user' };
        await abrir();
        expect(el('modal-content').querySelector('[data-action="sugerirTratamento"]')).toBeNull();
    });
});

// F2: riscos e ações da atividade, nas sub-rotas do n.privacy (src/routes/ropa.ts: { riscos } e { acoes }). Mesmo cadastro do n.iso.
describe('riscos e ações da atividade', () => {
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
        expect(el('modal-content').querySelector('b, i')).toBeNull();
    });

    it('o formulário novo já vem com o sistema ligado à atividade e o responsável dela (pré-preenchimento)', async () => {
        S.ropa = [{ id: 'r1', processing_purpose: 'Folha', owner_parte_id: 'pa1' }];
        await comRiscos();
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
        expect(el('modal-content').querySelector('[data-action="apagarRiscoAtividade"]')).toBeNull();
        S.user = { role: 'consultor' };
        await comRiscos();
        const destinos = [...el('modal-content').querySelectorAll('[data-action="navigate"]')].map((b) => b.getAttribute('data-args'));
        expect(destinos.filter((d) => /risks|capa|soa/.test(d))).toEqual([]);
        expect(el('modal-content').innerHTML).not.toMatch(/\/iso\b/);
    });

    it('sub-rota indisponível (projeto sem o n.privacy) não impede abrir as ligações', async () => {
        await abrir();
        expect(el('tl-riscos').textContent).toContain('Nenhum risco registrado');
        expect(el('tl-acoes').textContent).toContain('Nenhuma ação registrada');
    });
});

describe('selo "mudou na origem" (F3)', () => {
    it('avisa na DPIA e na LIA que o tratamento mudou depois que nasceram; sem o selo, nada aparece', async () => {
        await abrir({ [`GET ${B}/ligacoes`]: LIG({
            dpias: [{ id: 'd1', nome: 'RIPD da folha', status: 'Draft', origem_mudou: true }],
            lia: { exigida: true, existe: true, status: 'rascunho', origem_mudou: true },
        }) });
        const av = el('tl-avaliacoes');
        expect(av.querySelectorAll('.tl-origem')).toHaveLength(2);
        expect(av.textContent).toContain('O tratamento mudou depois que esta avaliação nasceu: revise.');
        await abrir({ [`GET ${B}/ligacoes`]: LIG({ dpias: [{ id: 'd1', nome: 'RIPD', status: 'Draft', origem_mudou: false }] }) });
        expect(el('tl-avaliacoes').querySelector('.tl-origem')).toBeNull();
    });
});
