// Tela "Organizar políticas" (PR3 das políticas temáticas): políticas por controle, controles sem política, incorporar
// e promover. api() REAL; só o fetch é dublado (rotas de src/routes/politicas.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/router.js', () => ({ navigate, render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/documentos.js';
import '../src/views/politica.js';
import '../src/views/organizar-politicas.js';

const P = '/api/v1/projects/p1';
const ORG = {
    por_controle: [{ id: 'c1', titulo: 'Política A.8.24 <b>x</b>', status: 'vigente', controle_id: 'k1', controle: 'A.8.24 Criptografia', requisito_id: 'r1' }],
    tematicas: [{ id: 't1', titulo: 'POL-CRY Criptografia', status: 'vigente' }],
    sem_cobertura: [{ id: 'k2', title: 'A.5.1 Políticas', requisito_id: 'iso27001:2022:A.5.1' }, { id: 'k3', title: 'Fora do catálogo', requisito_id: null }],
};
const rotas = (extra = {}) => ({
    [`GET ${P}/politicas/organizar`]: ORG,
    [`GET ${P}/politicas/temas`]: { temas: [{ codigo: 'POL-GOV', titulo: 'Governança', controles: ['A.5.1'], documento_id: null }, { codigo: 'POL-CRY', titulo: 'Cripto', controles: ['A.5.1'], documento_id: 'x' }] },
    [`GET ${P}/documentos/cobertura`]: { aplicaveis: 10, cobertos: 4, sem_cobertura: [], por_controle: {}, por_documento: {} },
    'GET /api/v1/requisitos': [{ id: 'r1', referencia: 'A.8.24', titulo: 'Criptografia' }, { id: 'r2', referencia: 'A.5.1', titulo: 'Políticas' }],
    ...extra,
});
const corpo = (f, k) => JSON.parse(f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === k)[1].body);
const el = (id) => document.getElementById(id);

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p1', modulos: ['iso'] };
    window.ehEquipeNess = () => ['consultor', 'platform_admin', 'consultoria_admin', 'consultant'].includes(S.user.role);
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Organizar políticas', () => {
    it('mostra a cobertura, as políticas por controle e os controles sem política, sem HTML do servidor', async () => {
        servir(rotas());
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('4 de 10');
        expect(el('c').textContent).toContain('A.8.24 Criptografia');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').textContent).toContain('A.5.1 Políticas');
        expect(el('c').querySelector('[data-action="abrirIncorporar"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="abrirPromover"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="abrirLigarControle"]')).not.toBeNull();
        expect(el('c').querySelector('[data-action="openNovaPoliticaModal"]')).not.toBeNull();
        expect(document.querySelectorAll('.btn-primary').length).toBe(0);
    });

    it('Incorporar envia origem e destino e recarrega', async () => {
        const f = servir(rotas({ [`POST ${P}/politicas/organizar/incorporar`]: { ok: true, requisitos: 1 } }));
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        window.abrirIncorporar('p1', 'c1');
        el('org-destino').value = 't1';
        await window.incorporarPolitica('p1', 'c1');
        expect(corpo(f, `POST ${P}/politicas/organizar/incorporar`)).toEqual({ origem: 'c1', destino: 't1' });
        expect(window.render).toHaveBeenCalled();
    });

    it('Promover envia o título e os requisitos, com o do controle pré-marcado', async () => {
        const f = servir(rotas({ [`POST ${P}/documentos/c1/promover`]: { ok: true } }));
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        await window.abrirPromover('p1', 'c1');
        expect(el('org-titulo').value).toBe('Política A.8.24 <b>x</b>');
        expect([...el('org-reqs').selectedOptions].map((o) => o.value)).toEqual(['r1']);
        await window.promoverPolitica('p1', 'c1');
        expect(corpo(f, `POST ${P}/documentos/c1/promover`)).toEqual({ titulo: 'Política A.8.24 <b>x</b>', requisitos: ['r1'] });
    });

    it('Ligar a uma política soma o requisito do controle aos que a temática já tem', async () => {
        const f = servir(rotas({
            [`GET ${P}/documentos/t1/requisitos`]: [{ id: 'r1' }],
            [`PUT ${P}/documentos/t1/requisitos`]: { ok: true },
        }));
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        window.abrirLigarControle('p1', 'k2');
        el('org-destino').value = 't1';
        await window.ligarControle('p1', 'k2');
        expect(corpo(f, `PUT ${P}/documentos/t1/requisitos`)).toEqual({ requisitos: ['r1', 'iso27001:2022:A.5.1'] });
    });

    it('erro no POST: toast, modal aberto e sem recarga', async () => {
        servir(rotas());
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        window.abrirIncorporar('p1', 'c1');
        el('org-destino').value = 't1';
        await window.incorporarPolitica('p1', 'c1');
        expect(document.querySelector('.toast').textContent).toContain('API route not found');
        expect(window.render).not.toHaveBeenCalled();
        expect(el('org-destino')).not.toBeNull();
    });

    it('controle sem requisito: motivo visível e sem botão de ligar; com requisito, sugere o tema livre', async () => {
        servir(rotas());
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Controle fora do catálogo de requisitos');
        expect(el('c').querySelectorAll('[data-action="abrirLigarControle"]').length).toBe(1);
        const botoes = [...el('c').querySelectorAll('[data-action="openNovaPoliticaModal"]')].map((b) => JSON.parse(b.getAttribute('data-args')));
        expect(botoes).toEqual([['p1', 'POL-GOV'], ['p1', null]]);
    });

    it('Nova política abre com o tema sugerido marcado', async () => {
        servir(rotas());
        await window.openNovaPoliticaModal('p1', 'POL-GOV');
        expect(document.querySelector('#pol-sugerido').textContent).toContain('POL-GOV');
    });

    it('sem temáticas, Incorporar fica desabilitado com o motivo em texto', async () => {
        servir(rotas({ [`GET ${P}/politicas/organizar`]: { ...ORG, tematicas: [] } }));
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        expect(el('c').querySelector('[data-action="abrirIncorporar"]')).toBeNull();
        expect(el('c').textContent).toContain('Crie uma política temática');
        expect(el('c').textContent).toContain('Incorporar indisponível');
    });

    it('sem nada a organizar, mostra o vazio', async () => {
        servir(rotas({ [`GET ${P}/politicas/organizar`]: { por_controle: [], tematicas: [], sem_cobertura: [] } }));
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        expect(el('c').textContent).toContain('Não há políticas por controle a organizar.');
    });

    it('quem não é da equipe não chama a rota', async () => {
        S.user = { role: 'client' };
        const f = servir(rotas());
        await window.renderOrganizarPoliticas(el('c'), el('h'), el('a'));
        expect(f).not.toHaveBeenCalled();
        expect(el('c').textContent).toContain('Só a equipe da consultoria organiza políticas.');
    });
});

describe('Documentos: menu Mais', () => {
    const doc = async () => {
        servir({ [`GET ${P}/documentos`]: [], [`GET ${P}/partes`]: [], [`GET ${P}/documentos/cobertura`]: { aplicaveis: 0 } });
        await window.renderDocumentos(el('c'), el('h'), el('a'));
    };
    it('oferece Organizar políticas à equipe', async () => {
        await doc();
        expect(el('a').querySelector('[data-action="abrirOrganizarPoliticas"]')).not.toBeNull();
    });
    it('não oferece a quem não é da equipe', async () => {
        S.user = { role: 'org_admin' };
        await doc();
        expect(el('a').querySelector('[data-action="abrirOrganizarPoliticas"]')).toBeNull();
    });
    it('abrirOrganizarPoliticas navega', () => {
        window.abrirOrganizarPoliticas();
        expect(navigate).toHaveBeenCalledWith('organizar-politicas');
    });
});
