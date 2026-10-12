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
        expect(irPara).toHaveBeenCalledWith('/iso?tela=soa');
        expect(globalThis.renderSoA).not.toHaveBeenCalled();
        irPara.mockClear();
        navigate('encarregado');
        expect(irPara).toHaveBeenCalledWith('/privacy?tela=encarregado');
        expect(globalThis.renderEncarregado).not.toHaveBeenCalled();
        irPara.mockClear();
        // o cliente pedindo "projects" cai em project-detail, que é do n.iso
        S.user = { role: 'org_admin' };
        navigate('projects');
        expect(irPara).toHaveBeenCalledWith('/iso?tela=project-detail');
    });
    it('tela dos dois módulos (cadastro) vai a um módulo que o projeto tem, levando o projeto', () => {
        ir('/');
        const SO_PRIV = { id: 'pp', modulos: ['privacy'] }, AMBOS = { id: 'pa', modulos: ['iso', 'privacy'] };
        S.projects = [SO_PRIV, AMBOS];
        navigate('documentos', { activeProject: SO_PRIV });
        expect(irPara).toHaveBeenLastCalledWith('/privacy?tela=documentos');
        expect(JSON.parse(localStorage.getItem('niso_activeProject')).id).toBe('pp');
        navigate('ropa', { currentProject: AMBOS });
        expect(irPara).toHaveBeenLastCalledWith('/iso?tela=ropa');
        // incidentes (aba da tela titular): o n.privacy se o projeto tem; projeto só n.iso vai ao n.iso
        S.titularAba = 'incidentes';
        navigate('titular', { activeProject: AMBOS });
        expect(irPara).toHaveBeenLastCalledWith('/privacy?tela=titular&aba=incidentes');
        navigate('titular', { activeProject: { id: 'pi', modulos: ['iso'] } });
        expect(irPara).toHaveBeenLastCalledWith('/iso?tela=titular&aba=incidentes');
        S.titularAba = 'pedidos';
    });
    it('o aviso em curso viaja limpo no sessionStorage, só quando sai para o módulo', () => {
        ir('/');
        sessionStorage.clear();
        S.avisoEmCurso = { id: 'n1', link: '/projects/p1/capa', title: 'CAPA vence', read: 0, extra: { x: 1 } };
        navigate('users');
        expect(sessionStorage.getItem('n360_aviso')).toBeNull();
        navigate('capa');
        expect(JSON.parse(sessionStorage.getItem('n360_aviso'))).toEqual({ link: '/projects/p1/capa', action_type: '', target_id: '', title: 'CAPA vence', message: '' });
        expect(S.avisoEmCurso).toBeNull();
    });
    it('tela dos dois módulos sem projeto (ou projeto sem nenhum dos módulos da pessoa) fica no início do portal', () => {
        ir('/');
        S.activeProject = null;
        S.user = { role: 'consultor', modulos: [] };
        navigate('documentos', { activeProject: { id: 'px', modulos: ['iso'] } });
        expect(irPara).not.toHaveBeenCalled();
        expect(S.view).toBe('inicio');
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
