// Casca (onda 1): o n.360 é o hub e não desenha tela de módulo; no n.privacy a tela de fornecedores (ISO) vira Terceiros;
// o grupo do item ativo abre sozinho. irPara dublado (o jsdom não navega).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/produto.js', async (original) => {
    const real = await original();
    return { ...real, irPara: vi.fn() };
});

import { navigate } from '../src/router.js';
import { S } from '../src/state.js';
import { irPara, aplicarCasca } from '../src/produto.js';
import html from '../login.html?raw';

const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const VIEWS = ['renderInicio', 'renderUsers', 'renderSoA', 'renderROPA', 'renderVendors', 'renderTerceiros', 'renderEncarregado', 'renderAuditTrail',
    'renderSegurancaProjeto', 'renderMeusPedidos', 'renderProjects', 'renderProjectDetail', 'renderRisks', 'renderTitular', 'updateActiveProjectWidget', 'updateHeaderUser'];

beforeEach(() => {
    document.open(); document.write(html); document.close();
    for (const nome of VIEWS) globalThis[nome] = vi.fn();
    irPara.mockClear();
    S.user = { role: 'platform_admin' };
    S.view = null;
});
afterEach(() => ir('/'));

describe('n.360 é o hub', () => {
    it('tela do hub abre no portal', () => {
        ir('/');
        for (const t of ['inicio', 'users', 'audit-trail', 'seguranca-projeto', 'meus-pedidos', 'projects']) {
            navigate(t);
            expect(S.view, t).toBe(t);
        }
        expect(irPara).not.toHaveBeenCalled();
    });
    it('tela de um módulo leva ao módulo, sem desenhar no portal', () => {
        ir('/');
        navigate('soa');
        expect(irPara).toHaveBeenCalledWith('/iso');
        expect(globalThis.renderSoA).not.toHaveBeenCalled();
        irPara.mockClear();
        navigate('encarregado');
        expect(irPara).toHaveBeenCalledWith('/privacy');
        expect(globalThis.renderEncarregado).not.toHaveBeenCalled();
        irPara.mockClear();
        // o cliente pedindo "projects" cai em project-detail, que é do n.iso
        S.user = { role: 'org_admin' };
        navigate('projects');
        expect(irPara).toHaveBeenCalledWith('/iso');
    });
    it('tela dos dois módulos (cadastro) volta ao início do portal', () => {
        ir('/');
        navigate('ropa');
        expect(irPara).not.toHaveBeenCalled();
        expect(S.view).toBe('inicio');
        expect(globalThis.renderROPA).not.toHaveBeenCalled();
        expect(globalThis.renderInicio).toHaveBeenCalled();
    });
    it('nos módulos nada muda', () => {
        ir('/iso');
        navigate('soa');
        expect(S.view).toBe('soa');
        expect(irPara).not.toHaveBeenCalled();
    });
});

describe('n.privacy', () => {
    it('vendors (tela ISO) vira terceiros', () => {
        ir('/privacy');
        navigate('vendors');
        expect(S.view).toBe('terceiros');
        expect(globalThis.renderVendors).not.toHaveBeenCalled();
        expect(globalThis.renderTerceiros).toHaveBeenCalled();
        expect(el('nav-terceiros').classList.contains('active')).toBe(true);
    });
    it('incidentes tem item próprio: a aba de incidentes destaca o item Incidentes', () => {
        ir('/privacy');
        S.titularAba = 'incidentes';
        navigate('titular');
        expect(el('nav-incidentes-privacy').getAttribute('aria-current')).toBe('page');
        S.titularAba = 'pedidos';
        navigate('titular');
        expect(el('nav-titular').getAttribute('aria-current')).toBe('page');
    });
});

describe('grupo do item ativo', () => {
    it('abre sozinho, com aria-expanded', () => {
        ir('/iso');
        aplicarCasca('iso');
        expect(el('group-ops').classList.contains('expanded')).toBe(false);
        navigate('risks');
        expect(el('group-ops').classList.contains('expanded')).toBe(true);
        const rotulo = document.querySelector('.sidebar-label[data-args=\'["group-ops"]\']');
        expect(rotulo.getAttribute('aria-expanded')).toBe('true');
        expect(rotulo.classList.contains('collapsed')).toBe(false);
    });
});
