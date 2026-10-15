// Prontidão para a certificação (Onda 2 do diagnóstico de 15/10/2026). api() REAL; só o fetch é dublado, com o corpo de
// GET /projects/:id/prontidao (src/services/prontidao.ts, prontidaoDoProjeto).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

import { S } from '../src/state.js';
import '../src/ui.js';
import { renderProntidao } from '../src/views/prontidao.js';

const crit = (id, estagio, situacao, extra = {}) => ({
    id, estagio, requisito: '4.3', titulo: `Critério ${id}`, tela: 'context', acao: `Resolver ${id}`, destrava: [], destrava_pendentes: 0,
    situacao, motivo: `Motivo de ${id}`, numero: '', ...extra,
});
const PENDENTES = [
    crit('escopo', 1, 'pendente', { destrava_pendentes: 2, cliente: 'Confirmar os limites do escopo do SGSI' }),
    crit('acoes_vencidas', 2, 'pendente', { requisito: '10.2', tela: 'capa', filtro: 'vencidas', acao: 'Ver as ações vencidas', numero: '2 vencidas', titulo: 'Nenhuma ação corretiva vencida' }),
];
const RESPOSTA = (extra = {}) => ({
    gerado_em: '2026-10-15T14:32:00Z', visao: 'equipe',
    veredito: { tom: 'semana', rotulo: 'Estágio 1 pendente', frase: 'Falta 1 item para o estágio 1.', apoio: 'Pré-avaliação pelos dados do n.iso. Não substitui a auditoria interna nem a decisão do organismo certificador.' },
    estagios: [{ estagio: 1, pronto: false, faltam: 1 }, { estagio: 2, pronto: false, faltam: 1 }],
    indicador: { implementados: 31, aplicaveis: 90, texto: '31 de 90 controles aplicáveis implementados' },
    criterios: [...PENDENTES, crit('riscos', 1, 'atendido', { requisito: '6.1.2', numero: '12 riscos' }), crit('nc_tratadas', 2, 'nao_se_aplica', { requisito: '10.2' })],
    faltam: PENDENTES,
    do_cliente: [PENDENTES[0]],
    numeros: { controles: { implementados: 31, aplicaveis: 90 }, riscos: 12, evidencias: 40, fases: { concluidas: 11, total: 41 } },
    certificacao: { id: 'cert1', data_estagio1: '2026-12-02', data_estagio2: null, estagio1: '02/12/2026', estagio1_aprovado: false, estagio2: null, estagio2_aprovado: false, organismo: 'Organismo <b>X</b>' },
    ...extra,
});
const el = (id) => document.getElementById(id);
const abrir = async () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    await renderProntidao(el('c'), el('h'), el('a'));
};

beforeEach(() => {
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor' };
    S.activeProject = { id: 'p9', client_name: 'Exemplo' }; S.projects = [S.activeProject];
    window.navigate = vi.fn();
    window.ehEquipeNess = () => ['consultor', 'platform_admin'].includes(S.user && S.user.role);
});
afterEach(() => vi.unstubAllGlobals());

describe('renderProntidao', () => {
    it('a frase-veredito, a ressalva e o indicador único vêm do servidor; nada de "conforme"', async () => {
        servir({ 'GET /api/v1/projects/p9/prontidao': RESPOSTA() });
        await abrir();
        expect(el('h').textContent).toBe('Prontidão para a certificação');
        expect(el('c').querySelector('.pn-frase').textContent).toBe('Falta 1 item para o estágio 1.');
        expect(el('c').textContent).toContain('Não substitui a auditoria interna');
        expect(el('c').textContent).toContain('31 de 90 controles aplicáveis implementados');
        expect(el('c').textContent).toContain('Estágio 1 marcado para 02/12/2026');
        // Texto do servidor escapado: a marcação aparece como texto, não vira elemento.
        expect(el('c').textContent).toContain('organismo: Organismo <b>X</b>');
        expect(el('c').textContent).not.toMatch(/\bconforme\b/i);
    });

    it('o que falta, por estágio, com cláusula, motivo, número e uma ação de nome único que leva à tela com o filtro', async () => {
        servir({ 'GET /api/v1/projects/p9/prontidao': RESPOSTA() });
        await abrir();
        const botoes = [...el('c').querySelectorAll('[data-action="prontidaoAbrir"]')];
        const nomes = botoes.map((b) => b.getAttribute('aria-label'));
        expect(new Set(nomes).size).toBe(nomes.length);
        expect(nomes).toContain('Ver as ações vencidas: Nenhuma ação corretiva vencida');
        const e2 = el('c').querySelector('#pt-e2');
        expect(e2.closest('section').textContent).toContain('Cláusula 10.2');
        expect(e2.closest('section').textContent).toContain('2 vencidas');
        const acoes = botoes.find((b) => b.getAttribute('aria-label').startsWith('Ver as ações vencidas'));
        window.prontidaoAbrir(...JSON.parse(acoes.dataset.args));
        expect(window.navigate).toHaveBeenCalledWith('capa', { filtroPainel: { tela: 'capa', aba: null, filtro: 'vencidas' } });
        window.prontidaoAbrir('telaQueNaoExiste', null);
        expect(window.navigate).toHaveBeenCalledTimes(1);
    });

    it('a tabela de todos os critérios diz a situação em texto (atendido, pendente, não se aplica)', async () => {
        servir({ 'GET /api/v1/projects/p9/prontidao': RESPOSTA() });
        await abrir();
        const tabela = el('c').querySelector('table.pn-tabela');
        expect(tabela.textContent).toContain('Atendido');
        expect(tabela.textContent).toContain('Pendente');
        expect(tabela.textContent).toContain('Não se aplica');
    });

    it('equipe vê o que o cliente precisa decidir e registra as datas; cliente vê "o que depende de você" e não edita datas', async () => {
        servir({ 'GET /api/v1/projects/p9/prontidao': RESPOSTA() });
        await abrir();
        expect(el('c').textContent).toContain('O que o cliente precisa decidir ou fornecer');
        expect(el('c').querySelector('[data-action="salvarDatasCertificacao"]')).not.toBeNull();
        S.user = { id: 'u2', role: 'org_user' };
        servir({ 'GET /api/v1/projects/p9/prontidao': RESPOSTA({ visao: 'cliente' }) });
        await abrir();
        expect(el('c').textContent).toContain('O que depende de você');
        expect(el('c').textContent).toContain('Confirmar os limites do escopo do SGSI');
        expect(el('c').querySelector('[data-action="salvarDatasCertificacao"]')).toBeNull();
    });

    it('falha de carga não vira tela vazia: erro com "Tentar de novo"', async () => {
        servir({});
        await abrir();
        expect(el('c').textContent).toContain('Não foi possível calcular a prontidão');
        expect(el('c').querySelector('[data-action="render"]')).not.toBeNull();
    });
});
