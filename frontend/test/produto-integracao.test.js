// Telas compartilhadas não chamam a faixa do produto que o projeto não tem (spec de integração dos produtos).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/produto.js';
import '../src/views/privacy.js';
import '../src/views/documentos.js';
import '../src/views/compliance.js';
import { produtoDaTela, destinoDoAviso } from '../src/produto.js';

const el = (id) => document.getElementById(id);
const espera = () => new Promise((r) => setTimeout(r, 0));
const caminho = (u) => new URL(u, 'http://localhost').pathname;
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${caminho(u)}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${caminho(u)}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const montar = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; };

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.projects = [];
    window.render = vi.fn();
    montar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('produtoDaTela e destinoDoAviso', () => {
    it('diz de quem é a tela', () => {
        expect(produtoDaTela('capa')).toBe('iso');
        expect(produtoDaTela('terceiros')).toBe('privacy');
        expect(produtoDaTela('documentos')).toBeNull();
    });
    it('aviso de tela do outro produto leva ao domínio dele; o resto navega', () => {
        const loc = { hostname: 'nprivacy.ness.com.br', search: '', origin: 'https://nprivacy.ness.com.br' };
        expect(destinoDoAviso('capa', loc)).toEqual({ href: 'https://niso.ness.com.br/' });
        expect(destinoDoAviso('documentos', loc)).toEqual({ navegar: 'documentos' });
        expect(destinoDoAviso('terceiros', loc)).toEqual({ navegar: 'terceiros' });
    });
});

describe('RoPA', () => {
    const REG = [{ id: 'r1', processing_purpose: 'Folha', status: 'Active' }];
    for (const [modulos, tem] of [[['iso'], false], [['iso', 'privacy'], true]]) {
        it(`com ${modulos.join('+')} ${tem ? 'mostra' : 'esconde'} importar e ligações`, async () => {
            S.activeProject = { id: 'p9', modulos };
            servir({ 'GET /api/v1/projects/p9/ropa': REG });
            await window.renderROPA(el('c'), el('h'), el('a'));
            expect(!!document.querySelector('[data-action="openImportarRopaModal"]')).toBe(tem);
            expect(!!document.querySelector('[data-action="openLigacoesTratamento"]')).toBe(tem);
        });
    }
});

describe('Documento', () => {
    const DOC = { id: 'd1', tipo: 'politica', titulo: 'Doc', status: 'vigente', versoes: [], aprovacao: {} };
    const rotas = {
        'GET /api/v1/projects/p9/documentos/d1': DOC,
        'GET /api/v1/projects/p9/documentos/d1/ciencias': [],
        'GET /api/v1/projects/p9/documentos/d1/excecoes': [],
        'GET /api/v1/projects/p9/documentos/d1/requisitos': [],
        'GET /api/v1/requisitos': [],
    };
    it('sem n.privacy não monta requisitos nem chama a faixa', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso'] };
        const f = servir(rotas);
        await window.openDocumentoModal('p9', 'd1');
        expect(el('doc-requisitos')).toBeNull();
        expect(chamadas(f).some((c) => c.includes('/requisitos'))).toBe(false);
    });
    it('com n.privacy monta a seção', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        servir(rotas);
        await window.openDocumentoModal('p9', 'd1');
        expect(el('doc-requisitos')).not.toBeNull();
    });
});

describe('Upload de evidência', () => {
    it('campo de controle ISO só com n.iso', () => {
        S.activeProject = { id: 'p9', modulos: ['privacy'] };
        window.openEvidenceUploadModal('p9');
        expect(el('ev-control-id')).toBeNull();
        S.activeProject = { id: 'p9', modulos: ['iso'] };
        window.openEvidenceUploadModal('p9');
        expect(el('ev-control-id')).not.toBeNull();
    });
});

describe('Requisitos e validade da evidência', () => {
    const CAT = [
        { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança' },
        { id: 'lgpd:art37', fonte_id: 'lgpd', referencia: 'art. 37', titulo: 'Registro' },
    ];
    const rotas = () => ({
        'GET /api/v1/projects/p9/evidence/e1/requisitos': { valido_ate: '2027-01-31', requisitos: [CAT[0]] },
        'GET /api/v1/requisitos': CAT,
        'PUT /api/v1/projects/p9/evidence/e1/requisitos': { ok: true },
        'PUT /api/v1/projects/p9/evidence/e1/validade': { ok: true },
    });
    it('mostra, liga e salva a validade', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        const f = servir(rotas());
        await window.abrirRequisitosEvidencia('p9', 'e1');
        expect(document.body.textContent).toContain('lgpd art. 46');
        expect(el('ev-valido-ate').value).toBe('2027-01-31');
        el('ev-req-add').value = 'lgpd:art37';
        await window.salvarRequisitosEvidencia('p9', 'e1');
        await espera();
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/evidence/e1/requisitos')).toEqual({ requisitos: ['lgpd:art46', 'lgpd:art37'] });
    });
    it('validade vazia envia null', async () => {
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy'] };
        const f = servir(rotas());
        await window.abrirRequisitosEvidencia('p9', 'e1');
        el('ev-valido-ate').value = '';
        await window.salvarValidadeEvidencia('p9', 'e1');
        expect(corpoDe(f, 'PUT /api/v1/projects/p9/evidence/e1/validade')).toEqual({ valido_ate: null });
    });
});
