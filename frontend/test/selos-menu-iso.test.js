// Selos do menu do n.iso: números do painel (modulos.iso.selos); zero esconde, atraso vira is-danger, o Painel soma os atrasados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import html from '../login.html?raw';
import { aplicarCasca } from '../src/produto.js';
import { aplicarSelos, atualizarSelos } from '../src/selos-menu.js';

const el = (id) => document.getElementById(id);
const montar = () => { history.replaceState(null, '', '/iso'); document.open(); document.write(html); document.close(); aplicarCasca('iso'); };

beforeEach(() => { apiMock.mockReset(); S.user = { id: 'u1', role: 'consultor' }; S.activeProject = { id: 'p1', modulos: ['iso'] }; S.view = 'risks'; montar(); });
afterEach(() => history.replaceState(null, '', '/'));

describe('selos do menu do n.iso', () => {
    it('número é o total a tratar; atraso vira is-danger; zero esconde; o Painel soma os atrasados', () => {
        aplicarSelos({ capa: { abertas: 3, vencidas: 1 }, evidencias: { em_analise: 0, ruins: 0 }, fornecedores: { pendentes: 1, vencidos: 2, reprovados: 1 } });
        expect(el('selo-iso-capa').textContent).toBe('3');
        expect(el('selo-iso-capa').classList.contains('is-danger')).toBe(true);
        expect(el('selo-iso-capa').getAttribute('aria-label')).toBe('3 ações corretivas abertas, 1 vencida');
        expect(el('selo-iso-evidencias').hidden).toBe(true);
        expect(el('selo-iso-fornecedores').textContent).toBe('4');
        expect(el('selo-iso-fornecedores').getAttribute('aria-label')).toBe('4 fornecedores sem avaliação em dia, 3 com avaliação vencida ou reprovada');
        expect(el('selo-iso-painel').textContent).toBe('4');
        expect(el('selo-iso-painel').getAttribute('aria-label')).toBe('4 itens atrasados');
    });
    it('evidência ruim no singular e no plural', () => {
        aplicarSelos({ evidencias: { em_analise: 0, ruins: 1 } });
        expect(el('selo-iso-evidencias').getAttribute('aria-label')).toBe('1 evidência a tratar, 1 vencida ou não conforme');
        aplicarSelos({ evidencias: { em_analise: 0, ruins: 2 } });
        expect(el('selo-iso-evidencias').getAttribute('aria-label')).toBe('2 evidências a tratar, 2 vencidas ou não conformes');
    });
    it('fora do painel busca modulos.iso.selos; falha mostra "?"', async () => {
        apiMock.mockResolvedValue({ modulos: { iso: { selos: { capa: { abertas: 2, vencidas: 0 } } } } });
        await atualizarSelos(document, true);
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/painel?modulo=iso');
        expect(el('selo-iso-capa').textContent).toBe('2');
        expect(el('selo-iso-painel').hidden).toBe(true);
        apiMock.mockRejectedValue(new Error('x'));
        await atualizarSelos(document, true);
        expect(el('selo-iso-capa').textContent).toBe('?');
    });
});
