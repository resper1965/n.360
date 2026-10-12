// Tela Encarregado (fatia 8): só leitura. api() REAL; só o fetch é dublado, com o corpo do handler (src/routes/encarregado.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/encarregado.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';

const VISAO = (extra = {}) => ({
    gerado_em: '2026-10-09T12:00:00Z',
    prioridades: [
        { nivel: 'alta', texto: '2 pedidos do titular atrasados', tela: 'titular' },
        { nivel: 'media', texto: '1 documento <b>com</b> revisão vencida', tela: 'documentos' },
    ],
    pedidos_titular: { abertos: 3, atrasados: 2, vencem_em_7_dias: 1, sem_prazo: 0, itens: [] },
    incidentes: { abertos: 1, comunicacoes_atrasadas: 0, comunicacoes_pendentes: 1, sem_avaliacao_de_risco: 0, itens: [] },
    tratamentos: { total: 6, sem_base_legal: 1, dpia_pendente: 1, lia_pendente: 0, sem_responsavel: 0, com_terceiro_vencido: 0 },
    terceiros: { total: 4, sem_tipo: 0, pendentes: 1, vencidos: 1, reprovados: 0 },
    documentos: { revisao_vencida: 1 },
    evidencias: { vencidas: 0, vencem_em_7_dias: 2 },
    lgpd: { carregada: true, total: 20, cobertos: 12, parciais: 3, lacunas: 5 },
    prazos_legais: { nao_definidos: [] },
    encarregados: [{ id: 'pe1', nome: 'Rita Exemplo', email: 'rita@cliente.com' }],
    ...extra,
});
const el = (id) => document.getElementById(id);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);

async function abrir(visao = VISAO()) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    servir({ 'GET /api/v1/projects/p9/encarregado': visao });
    await window.renderEncarregado(el('c'), el('h'), el('a'));
}

beforeEach(() => { S.token = 'tok'; S.user = { role: 'consultor' }; S.activeProject = { id: 'p9' }; window.render = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('tela do encarregado', () => {
    it('mostra os cartões e a lista "O que fazer" com o nível, o texto escapado e o botão da tela de destino', async () => {
        await abrir();
        const t = el('c').textContent;
        expect(t).toContain('Pedidos do titular');
        expect(t).toContain('2 atrasados');
        expect(t).toContain('Terceiros vencidos');
        expect(t).toContain('12/20');
        expect(t).toContain('2 pedidos do titular atrasados');
        expect(t).toContain('Alta');
        expect(t).toContain('Média');
        expect(t).toContain('1 documento <b>com</b> revisão vencida');
        expect(el('c').querySelector('b')).toBeNull();
        expect([...el('c').querySelectorAll('[data-action="navigate"]')].map((b) => JSON.parse(b.getAttribute('data-args'))[0])).toEqual(['titular', 'documentos']);
    });

    it('catálogo da LGPD ainda não carregado: sem cartão LGPD (o banner e a prioridade já dizem), sem número inventado', async () => {
        await abrir(VISAO({ lgpd: { carregada: false } }));
        expect(el('c').textContent).not.toContain('LGPD coberta');
        expect([...el('c').querySelectorAll('.stat-card')].map((x) => x.textContent)).not.toContainEqual(expect.stringContaining('LGPD'));
        expect(el('c').textContent).not.toContain('/0');
    });

    it('sem nenhuma pendência: não afirma estar em dia, só que nada foi calculado do que está cadastrado', async () => {
        await abrir(VISAO({ prioridades: [] }));
        expect(el('c').textContent).toContain('Nenhuma pendência calculada a partir do que está cadastrado.');
        expect(el('c').textContent).not.toContain('em dia');
    });

    it('título "Painel do encarregado"; zero sai em var(--text), cor só quando há alerta', async () => {
        await abrir(VISAO({ incidentes: { abertos: 0, comunicacoes_atrasadas: 0 }, evidencias: { vencidas: 0, vencem_em_7_dias: 0 } }));
        expect(el('h').textContent).toBe('Painel do encarregado');
        const valor = (rotulo) => [...el('c').querySelectorAll('.stat-card')].find((x) => x.textContent.includes(rotulo)).children[1].getAttribute('style');
        expect(valor('Incidentes abertos')).toContain('color:var(--text)');
        expect(valor('Evidências vencidas')).toContain('color:var(--text)');
        expect(valor('Pedidos do titular')).toContain('color:var(--danger)');
        expect(valor('Tratamentos com pendência')).toContain('color:var(--warning)');
        expect(el('c').innerHTML).not.toMatch(/#34c759|#ffcc00/i);
    });

    it('ordem: "O que fazer" vem antes dos cartões', async () => {
        await abrir();
        const html = el('c').innerHTML;
        expect(html.indexOf('O que fazer')).toBeLessThan(html.indexOf('stat-strip'));
    });

    it('sem projeto ativo: estado vazio, sem chamar a API', async () => {
        S.activeProject = null; S.projects = [];
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        const f = servir({});
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Sem projeto ativo');
        expect(chamadas(f)).toEqual([]);
    });

    it('falha do servidor: mensagem, não tela quebrada', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        servir({}); // 404 do Worker
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Não foi possível montar a visão');
    });

    it('mostra o encarregado indicado no topo', async () => {
        await abrir();
        expect(el('c').textContent).toContain('Encarregado: Rita Exemplo');
    });

    it('sem encarregado: botão de indicar lista as pessoas e envia o vínculo ao confirmar', async () => {
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        const f = servir({
            'GET /api/v1/projects/p9/encarregado': VISAO({ encarregados: [] }),
            'GET /api/v1/projects/p9/partes': [{ id: 'pe7', nome: 'Rita <b>Exemplo</b>', tipo: 'pessoa' }],
            'POST /api/v1/projects/p9/partes/pe7/vinculos': { id: 'v1' },
        });
        await window.renderEncarregado(el('c'), el('h'), el('a'));
        // o alerta vem primeiro, com o artigo e o botão primário
        const alerta = el('c').querySelector('#alerta-encarregado');
        expect(alerta.textContent).toContain('Nenhum encarregado indicado. A LGPD exige a indicação (art. 41).');
        expect(el('c').innerHTML.indexOf('alerta-encarregado')).toBeLessThan(el('c').innerHTML.indexOf('O que fazer'));
        const botao = alerta.querySelector('[data-action="abrirIndicarEncarregado"]');
        expect(botao.className).toContain('btn-primary');
        expect(botao.textContent).toBe('Indicar encarregado');
        await window.abrirIndicarEncarregado('p9');
        const sel = document.getElementById('encarregado-parte');
        expect(sel.options.length).toBe(1);
        expect(sel.querySelector('b')).toBeNull();
        sel.value = 'pe7';
        await window.indicarEncarregado('p9');
        const post = f.mock.calls.find(([u, o]) => o?.method === 'POST');
        expect(new URL(post[0], 'http://localhost').pathname).toBe('/api/v1/projects/p9/partes/pe7/vinculos');
        expect(JSON.parse(post[1].body)).toEqual({ papel: 'encarregado', alvo_tipo: 'projeto', alvo_id: 'p9' });
    });
});
