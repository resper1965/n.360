// O modal único do app (openModal em ui.js): botão "Fechar" visível com nome acessível, foco no diálogo ao abrir e de
// volta ao gatilho ao fechar, Tab preso dentro, Esc fecha. Com campo alterado, Esc, "Fechar", "Cancelar" e o clique no
// fundo perguntam NA PRÓPRIA JANELA antes de descartar; o fechamento de código (depois de salvar) não pergunta.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDelegation } from '../src/delegation.js';
import { openModal, forceCloseModal } from '../src/ui.js';

const el = (id) => document.getElementById(id);
const aberto = () => el('modal-overlay').classList.contains('open');
const tecla = (alvo, key, extra = {}) => alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
const fechar = () => el('modal').querySelector('.modal-fechar');

beforeEach(() => {
    forceCloseModal();
    document.body.innerHTML = `<button id="gatilho">Abrir</button>
        <div class="modal-overlay" id="modal-overlay" data-action="closeModal" data-arg-event>
            <div class="modal" id="modal" data-action="__noop"><div id="modal-content"></div></div></div>`;
    initDelegation();
    window.__salvar = vi.fn(() => forceCloseModal());
    el('gatilho').focus();
});

const FORM = `<div class="modal-header"><span class="modal-title">Novo risco</span></div>
    <input class="form-input" id="campo"><button class="btn" data-action="forceCloseModal">Cancelar</button>
    <button class="btn btn-primary" data-action="__salvar">Salvar</button>`;

describe('modal único', () => {
    it('todo modal tem um "Fechar" visível com nome acessível, e o diálogo tem nome', () => {
        openModal('<p>sem cabeçalho</p>');
        expect(fechar()).toBeTruthy();
        expect(fechar().textContent.trim()).toBe('Fechar');
        openModal(FORM);
        expect(el('modal').querySelectorAll('.modal-fechar')).toHaveLength(1);
        expect(el('modal').getAttribute('role')).toBe('dialog');
        expect(el('modal').getAttribute('aria-modal')).toBe('true');
        const rotulo = document.getElementById(el('modal').getAttribute('aria-labelledby'));
        expect(rotulo.textContent).toBe('Novo risco');
    });

    it('o foco vai para o diálogo ao abrir e volta ao gatilho ao fechar', () => {
        openModal(FORM);
        expect(el('modal').contains(document.activeElement)).toBe(true);
        fechar().click();
        expect(aberto()).toBe(false);
        expect(document.activeElement).toBe(el('gatilho'));
    });

    it('Tab e Shift+Tab ficam presos dentro do modal', () => {
        openModal(FORM);
        const focaveis = [...el('modal').querySelectorAll('button, input')];
        focaveis.at(-1).focus();
        tecla(focaveis.at(-1), 'Tab');
        expect(document.activeElement).toBe(focaveis[0]);
        tecla(focaveis[0], 'Tab', { shiftKey: true });
        expect(document.activeElement).toBe(focaveis.at(-1));
    });

    it('sem nada digitado, Esc fecha', () => {
        openModal(FORM);
        tecla(document.activeElement, 'Escape');
        expect(aberto()).toBe(false);
    });

    it('com campo alterado, Esc pergunta na própria janela; "Continuar editando" mantém o texto', () => {
        openModal(FORM);
        el('campo').value = 'Ransomware';
        el('campo').dispatchEvent(new Event('input', { bubbles: true }));
        tecla(el('campo'), 'Escape');
        expect(aberto()).toBe(true);
        const pergunta = el('modal').querySelector('.modal-descartar');
        expect(pergunta.textContent).toContain('Descartar o que foi digitado?');
        expect(pergunta.contains(document.activeElement)).toBe(true);
        pergunta.querySelector('[data-action="continuarEditandoModal"]').click();
        expect(el('modal').querySelector('.modal-descartar')).toBeNull();
        expect(el('campo').value).toBe('Ransomware');
        expect(aberto()).toBe(true);
    });

    it('com campo alterado, "Fechar", "Cancelar" e o fundo perguntam; "Descartar" fecha', () => {
        for (const alvo of [() => fechar(), () => el('modal').querySelector('[data-action="forceCloseModal"]'), () => el('modal-overlay')]) {
            openModal(FORM);
            el('campo').dispatchEvent(new Event('input', { bubbles: true }));
            alvo().click();
            expect(aberto()).toBe(true);
            el('modal').querySelector('[data-action="descartarModal"]').click();
            expect(aberto()).toBe(false);
        }
    });

    it('o fechamento de código (depois de salvar) não pergunta', () => {
        openModal(FORM);
        el('campo').dispatchEvent(new Event('input', { bubbles: true }));
        el('modal').querySelector('[data-action="__salvar"]').click();
        expect(window.__salvar).toHaveBeenCalled();
        expect(aberto()).toBe(false);
    });

    it('abrir de novo zera o "alterado"', () => {
        openModal(FORM);
        el('campo').dispatchEvent(new Event('input', { bubbles: true }));
        openModal(FORM);
        tecla(document.activeElement, 'Escape');
        expect(aberto()).toBe(false);
    });
});
