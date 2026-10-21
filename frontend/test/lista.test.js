// O componente de lista (frente 3A): busca, filtros, contagem, "Carregar mais", exportar e o chip do Painel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { baixarArquivo } = vi.hoisted(() => ({ baixarArquivo: vi.fn(async () => {}) }));
vi.mock('../src/api.js', () => ({ baixarArquivo, api: vi.fn() }));
import { S } from '../src/state.js';
import * as ui from '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montarLista } from '../src/lista.js';

const linhas = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, nome: i === 0 ? 'Ação' : `Item ${i}`, status: i % 2 ? 'Open' : 'Closed' }));
const colunas = [{ label: 'Nome', key: 'nome' }, { label: 'Status', render: (l) => l.status }];
const linhasDaTabela = () => [...document.querySelectorAll('#alvo tbody tr')];
const contagem = () => document.querySelector('#alvo .co-contagem').textContent;
const digitar = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
const mais = () => document.querySelector('#alvo [data-action="listaMais"]');

beforeEach(() => {
    initDelegation();
    document.body.innerHTML = '<div id="alvo"></div>';
    S.filtroPainel = null;
    baixarArquivo.mockClear();
});

const montar = (extra = {}) => montarLista(document.getElementById('alvo'), {
    id: 'tl', colunas, linhas, busca: (l) => l.nome,
    filtros: [{ chave: 'status', rotulo: 'Status', valor: (l) => l.status }],
    vazio: { titulo: 'Nada aqui' }, ...extra,
});

describe('montarLista', () => {
    it('mostra 25, conta e carrega mais', () => {
        montar();
        expect(linhasDaTabela()).toHaveLength(25);
        expect(contagem()).toBe('30');
        expect(mais().textContent).toContain('5 restantes');
        mais().click();
        expect(linhasDaTabela()).toHaveLength(30);
        expect(mais()).toBeNull();
    });

    it('busca sem acento e sem caixa', () => {
        montar();
        digitar('#tl-busca', 'ACAO');
        expect(linhasDaTabela().map((tr) => tr.textContent)).toEqual([expect.stringContaining('Ação')]);
        expect(contagem()).toBe('1 de 30');
    });

    it('digitar na busca mantém o mesmo campo (o foco não se perde)', () => {
        montar();
        const campo = document.getElementById('tl-busca');
        campo.focus();
        digitar('#tl-busca', 'item');
        expect(document.getElementById('tl-busca')).toBe(campo);
        expect(document.activeElement).toBe(campo);
    });

    it('filtro com opções tiradas dos dados, pelo rótulo', () => {
        montar();
        const opcoes = [...document.querySelectorAll('#tl-f-status option')].map((o) => o.textContent);
        expect(opcoes).toEqual(['Todos', 'Aberto', 'Concluído']);
        escolher('#tl-f-status', 'Closed');
        expect(linhasDaTabela()).toHaveLength(15);
        expect(contagem()).toBe('15 de 30');
    });

    it('filtro com opções fixas usa as opções dadas', () => {
        montar({ filtros: [{ chave: 'status', rotulo: 'Status', valor: (l) => l.status, opcoes: [['Open', 'Em aberto']] }] });
        expect([...document.querySelectorAll('#tl-f-status option')].map((o) => o.textContent)).toEqual(['Todos', 'Em aberto']);
    });

    it('mudar busca ou filtro volta ao começo', () => {
        montar();
        mais().click();
        expect(linhasDaTabela()).toHaveLength(30);
        escolher('#tl-f-status', '');
        expect(linhasDaTabela()).toHaveLength(25);
    });

    it('vazio pela renderEmptyState; sem resultado da busca, outra mensagem', () => {
        montar({ linhas: [] });
        expect(document.querySelector('#alvo .empty-state').textContent).toContain('Nada aqui');
        document.body.innerHTML = '<div id="alvo"></div>';
        montar();
        digitar('#tl-busca', 'zzz');
        expect(document.querySelector('#alvo .empty-state').textContent).toContain('Nada encontrado');
    });

    it('exportar chama baixarArquivo e avisa o erro', async () => {
        const toast = vi.spyOn(ui, 'showToast').mockImplementation(() => {});
        baixarArquivo.mockRejectedValueOnce(new Error('Sem permissão'));
        montar({ exportar: { caminho: '/api/v1/projects/p1/export/risks' } });
        document.querySelector('#alvo [data-action="listaExportar"]').click();
        await new Promise((r) => setTimeout(r, 0));
        expect(baixarArquivo).toHaveBeenCalledWith('/api/v1/projects/p1/export/risks');
        expect(toast).toHaveBeenCalledWith('Sem permissão', 'error');
        toast.mockRestore();
    });

    it('chip do Painel filtra antes da busca', () => {
        S.filtroPainel = { tela: 'capa', aba: null, filtro: 'vencidas' };
        const acoes = [
            { id: 'a', nome: 'Vencida', status: 'Open', due_date: '2000-01-01' },
            { id: 'b', nome: 'Em dia', status: 'Open', due_date: '2999-01-01' },
        ];
        montar({ linhas: acoes, filtroPainel: { tela: 'capa' } });
        expect(document.querySelector('#alvo .filtro-painel').textContent).toContain('vencidas');
        expect(linhasDaTabela()).toHaveLength(1);
        expect(contagem()).toBe('1 de 2');
    });

    it('atualizar troca as linhas mantendo busca e filtro', () => {
        const l = montar();
        digitar('#tl-busca', 'item 1');
        l.atualizar([{ id: 'n', nome: 'Item 100', status: 'Open' }, { id: 'm', nome: 'Outro', status: 'Open' }]);
        expect(linhasDaTabela()).toHaveLength(1);
    });
});
