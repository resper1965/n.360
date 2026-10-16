// "Mais ações": o menu das ações secundárias (onda 2 do diagnóstico de 15/10). Uma ação principal à vista; o resto aqui,
// com o padrão de botão de menu do WAI-ARIA: aria-haspopup/aria-expanded, setas, Home/End, Esc devolve o foco ao botão.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { renderMaisAcoes } from '../src/ui.js';
import { initDelegation } from '../src/delegation.js';

beforeAll(() => initDelegation());

const tecla = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const itens = () => [...document.querySelectorAll('.mais-acoes-lista [role="menuitem"]')];
const botao = () => document.querySelector('.mais-acoes-botao');
const lista = () => document.querySelector('.mais-acoes-lista');

beforeEach(() => {
    window.__acaoA = vi.fn();
    window.__acaoPerigo = vi.fn();
    document.body.innerHTML = `<main>${renderMaisAcoes([
        { rotulo: 'Exportar CSV', action: '__acaoA', args: ['p1'] },
        null,
        { rotulo: 'Excluir definitivamente', action: '__acaoPerigo', args: ['u1'], perigo: true },
        { rotulo: 'Importar <planilha>', action: '__acaoA', args: ['x"y'] },
    ], { nome: 'Ana & Cia' })}</main><button id="fora">fora</button>`;
});

describe('renderMaisAcoes', () => {
    it('sem itens, não desenha nada', () => {
        expect(renderMaisAcoes([])).toBe('');
        expect(renderMaisAcoes([null, false])).toBe('');
    });

    it('botão de menu acessível, lista fechada, itens escapados e o destrutivo por último, separado', () => {
        const b = botao();
        expect(b.getAttribute('aria-haspopup')).toBe('menu');
        expect(b.getAttribute('aria-expanded')).toBe('false');
        expect(b.getAttribute('aria-controls')).toBe(lista().id);
        expect(b.getAttribute('aria-label')).toBe('Mais ações: Ana & Cia');
        expect(b.classList.contains('btn-primary')).toBe(false);
        expect(lista().getAttribute('role')).toBe('menu');
        expect(lista().hidden).toBe(true);
        expect(itens().map((i) => i.textContent)).toEqual(['Exportar CSV', 'Importar <planilha>', 'Excluir definitivamente']);
        expect(itens().every((i) => i.getAttribute('tabindex') === '-1')).toBe(true);
        expect(JSON.parse(itens()[1].getAttribute('data-args'))).toEqual(['x"y']);
        const sep = lista().querySelector('[role="separator"]');
        expect(sep.nextElementSibling).toBe(itens()[2]);
        expect(itens()[2].classList.contains('perigo')).toBe(true);
    });

    it('ids únicos entre menus da mesma tela', () => {
        const a = renderMaisAcoes([{ rotulo: 'X', action: 'x' }]);
        const b = renderMaisAcoes([{ rotulo: 'X', action: 'x' }]);
        expect(a.match(/id="([^"]+)"/)[1]).not.toBe(b.match(/id="([^"]+)"/)[1]);
    });
});

describe('item desabilitado e linha de apoio', () => {
    it('fica à vista com o motivo em texto, focável, aria-disabled e sem ação; o motivo vale mais que o apoio', () => {
        window.__acaoD = vi.fn();
        document.body.innerHTML = renderMaisAcoes([
            { rotulo: 'Reabrir', sub: 'Volta à análise.', action: '__acaoD', desabilitado: true, motivo: 'A atividade não está aprovada.' },
            { rotulo: 'Imprimir', sub: 'Gera a versão para impressão.', action: '__acaoD' },
        ], { rotulo: 'Ações' });
        const [off, on] = itens();
        expect(off.getAttribute('aria-disabled')).toBe('true');
        expect(off.hasAttribute('data-action')).toBe(false);
        expect(off.getAttribute('title')).toBe('A atividade não está aprovada.');
        expect(off.querySelector('.mais-acoes-sub').textContent).toBe('A atividade não está aprovada.');
        expect(on.querySelector('.mais-acoes-sub').textContent).toBe('Gera a versão para impressão.');
        botao().click();
        off.click();
        expect(window.__acaoD).not.toHaveBeenCalled();
        on.click();
        expect(window.__acaoD).toHaveBeenCalledTimes(1);
    });
});

describe('comportamento', () => {
    it('clique abre, marca aria-expanded e leva o foco ao primeiro item', () => {
        botao().click();
        expect(lista().hidden).toBe(false);
        expect(botao().getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(itens()[0]);
        botao().click();
        expect(lista().hidden).toBe(true);
    });

    it('setas, Home e End percorrem os itens em ciclo', () => {
        botao().click();
        tecla(document.activeElement, 'ArrowDown');
        expect(document.activeElement).toBe(itens()[1]);
        tecla(document.activeElement, 'End');
        expect(document.activeElement).toBe(itens()[2]);
        tecla(document.activeElement, 'ArrowDown');
        expect(document.activeElement).toBe(itens()[0]);
        tecla(document.activeElement, 'ArrowUp');
        expect(document.activeElement).toBe(itens()[2]);
        tecla(document.activeElement, 'Home');
        expect(document.activeElement).toBe(itens()[0]);
    });

    it('seta para baixo no botão fechado abre o menu', () => {
        botao().focus();
        tecla(botao(), 'ArrowDown');
        expect(lista().hidden).toBe(false);
        expect(document.activeElement).toBe(itens()[0]);
    });

    it('Esc fecha e devolve o foco ao botão', () => {
        botao().click();
        tecla(document.activeElement, 'Escape');
        expect(lista().hidden).toBe(true);
        expect(botao().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(botao());
    });

    it('escolher um item chama a ação com os argumentos e fecha o menu', () => {
        botao().click();
        itens()[0].click();
        expect(window.__acaoA).toHaveBeenCalledWith('p1');
        expect(lista().hidden).toBe(true);
    });

    it('clique fora fecha', () => {
        botao().click();
        document.getElementById('fora').click();
        expect(lista().hidden).toBe(true);
        expect(botao().getAttribute('aria-expanded')).toBe('false');
    });

    it('abrir um menu fecha o outro', () => {
        document.body.insertAdjacentHTML('beforeend', renderMaisAcoes([{ rotulo: 'Outro', action: '__acaoA' }]));
        const [b1, b2] = document.querySelectorAll('.mais-acoes-botao');
        b1.click();
        b2.click();
        const [l1, l2] = document.querySelectorAll('.mais-acoes-lista');
        expect(l1.hidden).toBe(true);
        expect(l2.hidden).toBe(false);
    });
});
