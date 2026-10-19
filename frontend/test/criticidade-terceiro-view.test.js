// Aba Criticidade da ficha do fornecedor (spec 2026-10-18 e 2026-10-19). api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/terceiros.js';

const B = '/api/v1/projects/p9/terceiros';
const FICHA = { id: 'a', nome: 'Nuvem Grande', terceiro_tipo: 'pequeno', metodo: 'questionario', situacao: 'pendente', ultima_avaliacao: null, tratamentos: 0, documentos: 0, nivel: null, dpa: false, atividades: 0,
    email: null, seguranca: null, historico: [], documentos_ligados: [], suboperadores: [], tratamentos_afetados: [] };
const CRIT_VAZIO = { atual: null, historico: [] };
const CRIT_ALTO = {
    atual: { id: 'c2', impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'alto', nivel: 'alto', avaliado_por: 'cons@ness.lat', created_at: '2026-10-18 10:00:00' },
    historico: [
        { id: 'c2', impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'alto', nivel: 'alto', avaliado_por: 'cons@ness.lat', created_at: '2026-10-18 10:00:00' },
        { id: 'c1', impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo', nivel: 'baixo', avaliado_por: 'cons@ness.lat', created_at: '2026-09-01 10:00:00' },
    ],
};
const rotas = (extra = {}) => ({
    [`GET ${B}/a`]: FICHA,
    [`GET ${B}/a/criticidades`]: CRIT_VAZIO,
    'GET /api/v1/projects/p9/documentos': [],
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);
const ficha = async (extra = {}) => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    history.replaceState(null, '', '/privacy?tela=terceiro&parte=a&aba=criticidade');
    const f = servir(rotas(extra));
    await window.renderTerceiro(el('c'), el('h'), el('a'));
    return f;
};
const marcar = (chave, valor) => { document.querySelector(`input[name="tc-crit-${chave}"][value="${valor}"]`).checked = true; };
const marcarTudo = () => {
    marcar('impacto', 'baixo'); marcar('exclusividade', 'varias_alternativas'); marcar('risco_financeiro', 'baixo');
    marcar('conformidade', 'sem_regulamentacao'); marcar('risco_reputacional', 'baixo');
};

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.terceiro = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('bloco de criticidade', () => {
    it('sem avaliação: diz isso, explica e tem o botão Confirmar avaliação', async () => {
        await ficha();
        const bloco = el('tc-crit').textContent;
        expect(bloco).toContain('Sem avaliação de criticidade');
        expect(bloco).toContain('Confirmar avaliação');
        expect(document.querySelectorAll('input[type="radio"][name^="tc-crit-"]').length).toBe(14);
    });

    it('as perguntas trazem os rótulos do legado em português', async () => {
        await ficha();
        const bloco = el('tc-crit').textContent;
        for (const t of ['Impacto no Negócio', 'Exclusividade e Alternativas', 'Risco Financeiro', 'Conformidade', 'Risco Reputacional',
            'Alto (interrupção total ou significativa)', 'Poucas alternativas (existem, com dificuldades técnicas ou financeiras)',
            'Não há Regulamentação Específica no setor de atuação', 'Baixo (risco mínimo)']) expect(bloco).toContain(t);
    });

    it('cada critério traz a pergunta do legado, ligada ao grupo', async () => {
        await ficha();
        const perguntas = ['Qual o impacto da falha deste fornecedor nas operações da empresa?', 'Quão fácil é substituir este fornecedor?',
            'Qual o nível de risco financeiro deste fornecedor?', 'Quanto à conformidade regulatória:', 'Falhas deste fornecedor poderiam causar danos à imagem da empresa?'];
        const grupos = [...el('tc-crit').querySelectorAll('fieldset')];
        expect(grupos.map((g) => document.getElementById(g.getAttribute('aria-describedby')).textContent.trim())).toEqual(perguntas);
    });

    it('incompleto não grava e avisa qual falta', async () => {
        const f = await ficha();
        marcarTudo();
        document.querySelector('input[name="tc-crit-impacto"]:checked').checked = false;
        await window.confirmarCriticidadeTerceiro('p9', 'a');
        expect(chamadas(f).some((k) => k.startsWith('POST'))).toBe(false);
        expect(document.body.textContent).toContain('Responda');
    });

    it('confirmar envia as cinco respostas e nunca o nível', async () => {
        const f = await ficha({ [`POST ${B}/a/criticidades`]: { ok: true, id: 'c1', nivel: 'baixo', tipo: 'pequeno' } });
        marcarTudo();
        await window.confirmarCriticidadeTerceiro('p9', 'a');
        expect(corpoDe(f, `POST ${B}/a/criticidades`)).toEqual({ impacto: 'baixo', exclusividade: 'varias_alternativas', risco_financeiro: 'baixo', conformidade: 'sem_regulamentacao', risco_reputacional: 'baixo' });
    });

    it('com avaliação: mostra o nível em texto (não só cor), o tipo e o método, e o histórico', async () => {
        await ficha({ [`GET ${B}/a/criticidades`]: CRIT_ALTO, [`GET ${B}/a`]: { ...FICHA, terceiro_tipo: 'critico', metodo: 'auditoria' } });
        const bloco = el('tc-crit').textContent;
        expect(bloco).toContain('Nível atual: Alto');
        expect(bloco).toContain('Crítico');
        expect(bloco).toContain('Auditoria');
        expect(el('tc-crit-historico').querySelectorAll('tbody tr').length).toBe(2);
    });

    it('o histórico mostra as cinco respostas de cada linha, em texto', async () => {
        await ficha({ [`GET ${B}/a/criticidades`]: CRIT_ALTO });
        const [recente] = el('tc-crit-historico').querySelectorAll('tbody tr');
        for (const t of ['Baixo (impacto mínimo ou inexistente)', 'Várias alternativas (fácil de substituir)', 'Baixo (financeiramente sólido)',
            'Não há Regulamentação Específica no setor de atuação', 'Alto (relação direta de reconhecimento da marca entre as empresas)']) expect(recente.textContent).toContain(t);
    });

    it('confirmar repinta a aba com o nível novo', async () => {
        const f = await ficha({ [`POST ${B}/a/criticidades`]: { ok: true, id: 'c2', nivel: 'alto', tipo: 'critico' } });
        marcarTudo();
        f.mockClear();
        await window.confirmarCriticidadeTerceiro('p9', 'a');
        expect(chamadas(f)).toContain(`GET ${B}/a/criticidades`);
        expect(el('tc-crit')).not.toBeNull();
    });

    it('grande provedor: avisa que a avaliação não troca o tipo', async () => {
        await ficha({ [`GET ${B}/a`]: { ...FICHA, terceiro_tipo: 'grande_provedor', metodo: 'trust_center' } });
        expect(el('tc-crit').textContent).toContain('Grande provedor é mantido');
    });

    it('quem só lê não vê as perguntas', async () => {
        S.user = { role: 'org_user' };
        await ficha({ [`GET ${B}/a/criticidades`]: CRIT_ALTO });
        expect(document.querySelectorAll('input[name^="tc-crit-"]').length).toBe(0);
        expect(el('tc-crit').textContent).toContain('Nível atual: Alto');
    });
});
