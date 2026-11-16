// Selos de vencimento do menu do n.privacy: carregam depois do menu, mostram "?" na falha e respeitam papel e projeto.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import html from '../login.html?raw';
import css from '../src/style.css?raw';
import { aplicarCasca } from '../src/produto.js';
import { atualizarSelos } from '../src/selos-menu.js';

const el = (id) => document.getElementById(id);
const PROJ = { id: 'p1', modulos: ['privacy'] };
const VISAO = {
    pedidos_titular: { exigem_atencao: 3, atrasados: 1 },
    terceiros: { com_pendencia: 2, vencidos: 0, reprovados: 0 },
    incidentes: { comunicacoes_pendentes: 1, comunicacoes_atrasadas: 0 },
};
const montar = () => { history.replaceState(null, '', '/privacy'); document.open(); document.write(html); document.close(); aplicarCasca('privacy'); };

beforeEach(() => { apiMock.mockReset(); S.user = { id: 'u1', role: 'consultor' }; S.activeProject = PROJ; montar(); });
afterEach(() => history.replaceState(null, '', '/'));

describe('selos do menu do n.privacy', () => {
    it('o número é o total a tratar; o atraso vira fundo cheio (is-danger) e entra no texto para leitor de tela', async () => {
        apiMock.mockResolvedValue(VISAO);
        await atualizarSelos(document, true);
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/encarregado');
        expect(el('selo-titular').textContent).toBe('3');
        expect(el('selo-titular').getAttribute('aria-label')).toBe('3 pedidos vencidos ou a vencer em 7 dias, 1 atrasado');
        expect(el('selo-titular').classList.contains('is-danger')).toBe(true);
        expect(el('selo-terceiros').getAttribute('aria-label')).toBe('2 fornecedores sem avaliação, vencida ou reprovada');
        expect(el('selo-terceiros').classList.contains('is-danger')).toBe(false);
        expect(el('selo-incidentes').getAttribute('aria-label')).toBe('1 comunicação de incidente pendente');
    });
    it('Painel: selo só com atraso, com a soma dos atrasados das filas', async () => {
        apiMock.mockResolvedValue({ pedidos_titular: { exigem_atencao: 3, atrasados: 1 }, terceiros: { com_pendencia: 2, vencidos: 1, reprovados: 1 },
            incidentes: { comunicacoes_pendentes: 2, comunicacoes_atrasadas: 2 } });
        await atualizarSelos(document, true);
        expect(el('selo-painel').hidden).toBe(false);
        expect(el('selo-painel').textContent).toBe('5');
        expect(el('selo-painel').getAttribute('aria-label')).toBe('5 itens atrasados');
        expect(el('selo-painel').classList.contains('is-danger')).toBe(true);
        expect(el('selo-incidentes').getAttribute('aria-label')).toBe('2 comunicações de incidente pendentes, 2 atrasadas');
        expect(el('selo-terceiros').getAttribute('aria-label')).toBe('2 fornecedores sem avaliação, vencida ou reprovada, 2 com avaliação vencida ou reprovada');
        apiMock.mockResolvedValue({ pedidos_titular: { exigem_atencao: 3, atrasados: 0 }, terceiros: { com_pendencia: 2 }, incidentes: {} });
        await atualizarSelos(document, true);
        expect(el('selo-painel').hidden).toBe(true);
        expect(el('selo-titular').classList.contains('is-danger')).toBe(false);
    });
    it('CSS: pendente com contorno âmbar, atraso com fundo --danger e número em --accent-ink; sem selo em Minhas aprovações', () => {
        expect(css).toMatch(/\.sidebar-selo\s*\{[^}]*color:\s*var\(--warning\)[^}]*border:\s*1px solid currentColor/);
        expect(css).toMatch(/\.sidebar-selo\.is-danger\s*\{[^}]*background:\s*var\(--danger\)[^}]*color:\s*var\(--accent-ink\)/);
        expect(el('nav-meus').querySelector('.sidebar-selo')).toBeNull();
    });
    it('zero não mostra selo', async () => {
        apiMock.mockResolvedValue({ pedidos_titular: { exigem_atencao: 0 }, terceiros: {}, incidentes: { comunicacoes_pendentes: 0 } });
        await atualizarSelos(document, true);
        for (const id of ['selo-painel', 'selo-titular', 'selo-terceiros', 'selo-incidentes']) expect(el(id).hidden, id).toBe(true);
    });
    it('falha não some em silêncio: sem exceção, o número antigo sai e as filas mostram "?" com o motivo', async () => {
        apiMock.mockResolvedValueOnce(VISAO);
        await atualizarSelos(document, true);
        expect(el('selo-titular').hidden).toBe(false);
        apiMock.mockRejectedValueOnce(new Error('Falha de rede'));
        await expect(atualizarSelos(document, true)).resolves.toBeUndefined();
        for (const id of ['selo-titular', 'selo-terceiros', 'selo-incidentes']) {
            expect(el(id).hidden, id).toBe(false);
            expect(el(id).textContent).toBe('?');
            expect(el(id).getAttribute('aria-label')).toMatch(/Não foi possível conferir/);
            expect(el(id).classList.contains('is-danger')).toBe(false);
        }
        expect(el('selo-painel').hidden).toBe(true);
        apiMock.mockResolvedValueOnce(VISAO);
        await atualizarSelos(document, true);
        expect(el('selo-titular').textContent).toBe('3');
        expect(el('selo-titular').classList.contains('is-falha')).toBe(false);
        expect(el('selo-titular').hasAttribute('title')).toBe(false);
    });
    it('sem chamada para papel sem acesso à visão, sem projeto ou projeto sem o n.privacy', async () => {
        for (const [user, proj] of [[{ id: 'u2', role: 'stakeholder' }, PROJ], [{ id: 'u3', role: 'comercial' }, PROJ], [S.user, null], [S.user, { id: 'p2', modulos: ['iso'] }]]) {
            S.user = user; S.activeProject = proj;
            await atualizarSelos(document, true);
        }
        expect(apiMock).not.toHaveBeenCalled();
    });
    it('o cliente, que lê a visão, também recebe os selos', async () => {
        S.user = { id: 'u4', role: 'org_user' };
        apiMock.mockResolvedValue(VISAO);
        await atualizarSelos(document, true);
        expect(el('selo-titular').hidden).toBe(false);
    });
    it('não repete a chamada para o mesmo projeto e recarrega ao trocar de projeto', async () => {
        apiMock.mockResolvedValue(VISAO);
        await atualizarSelos();
        await atualizarSelos();
        expect(apiMock).toHaveBeenCalledTimes(1);
        S.activeProject = { id: 'p3', modulos: ['privacy'] };
        await atualizarSelos();
        expect(apiMock).toHaveBeenCalledTimes(2);
        await atualizarSelos(document, true);
        expect(apiMock).toHaveBeenCalledTimes(3);
    });
    it('resposta de um projeto antigo não sobrescreve a do projeto atual', async () => {
        let soltar;
        apiMock.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
        const velha = atualizarSelos(document, true);
        apiMock.mockResolvedValueOnce({ pedidos_titular: { exigem_atencao: 0 }, terceiros: {}, incidentes: {} });
        await atualizarSelos(document, true);
        soltar(VISAO);
        await velha;
        expect(el('selo-titular').hidden).toBe(true);
    });
});
