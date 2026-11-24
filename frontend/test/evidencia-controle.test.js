// A Central de Evidências não tinha como trocar o controle de uma evidência (o PUT existia sem
// tela) e lia `ai_status`, coluna que não existe: toda evidência aparecia "Não avaliado".
// Usa o api() real sobre um fetch dublado; formatos de src/routes/evidence.ts:345 ({ok, evidence})
// e src/routes/projects.ts:535 ({ok, controls}).
import { describe, it, expect, beforeEach } from 'vitest';
import { servir } from './servir-api.js';
import '../src/ui.js';
import '../src/views/compliance.js';
import { S } from '../src/state.js';

const EVIDENCIAS = [
    { id: 'ev-1', file_name: 'politica.pdf', control_id: null, evaluation_status: 'pending' },
    { id: 'ev-2', file_name: 'log.txt', control_id: 'ctl-1', control_ids: ['ctl-1', 'ctl-2'], evaluation_status: 'conforming' },
];
const CONTROLES = [{ id: 'ctl-1', title: 'A.5.1 — Políticas <img src=x onerror=alert(1)>' }, { id: 'ctl-2', title: 'A.5.2 — Papéis' }];
let f;

function tela() {
    return { c: document.createElement('div'), h: document.createElement('div'), a: document.createElement('div') };
}

beforeEach(() => {
    f = servir({
        'GET /api/v1/projects/p1/evidence': { ok: true, evidence: EVIDENCIAS },
        'GET /api/v1/projects/p1/controls': { ok: true, controls: CONTROLES },
        'GET /api/v1/evidence/ev-2/detail': { id: 'ev-2', file_name: 'log.txt', control_id: 'ctl-1', control_ids: ['ctl-1', 'ctl-2'] },
        'POST /api/v1/evidence/ev-1/controles': { ok: true },
        'DELETE /api/v1/evidence/ev-2/controles/ctl-2': { ok: true },
    });
    S.currentProject = { id: 'p1' };
    S.user = { role: 'consultor' };
});

describe('Central de Evidências', () => {
    it('a coluna mostra todos os controles ligados (N:N) e o status traduzido', async () => {
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        const celulas = [...c.querySelectorAll('tbody tr')].map((tr) => tr.children[1].textContent.trim());
        expect(celulas).toEqual(['—', 'A.5.1 — Políticas <img src=x onerror=alert(1)>; A.5.2 — Papéis']);
        expect(c.querySelector('tbody select')).toBeNull();
        expect(c.querySelector('img')).toBeNull();
        expect(c.textContent).toContain('Conforme');
        expect(c.textContent).toContain('Pendente');
    });

    it('linha: uma ação à vista, o próximo passo da evidência, e o resto no "Mais ações"', async () => {
        f = servir({
            'GET /api/v1/projects/p1/evidence': { ok: true, evidence: [
                { id: 'ev-1', file_name: 'politica.pdf', file_hash: 'abc' },
                { id: 'ev-2', file_name: 'log.txt', file_hash: 'def', ciso_approved_by: 'Ana' },
                { id: 'ev-3', file_name: 'ata.pdf', file_hash: 'ghi', ciso_approved_by: 'Ana', ceo_approved_by: 'Bia' },
            ] },
            'GET /api/v1/projects/p1/controls': { ok: true, controls: [] },
        });
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        const linhas = [...c.querySelectorAll('tbody tr')];
        const visiveis = (tr) => [...tr.querySelectorAll('td:last-child button')].filter((b) => !b.closest('[role="menu"]'));
        expect(linhas.map((tr) => visiveis(tr).map((b) => b.textContent.trim()))).toEqual([
            ['Revisar (Líder SGSI)', 'Mais ações'], ['Assinar CEO', 'Mais ações'], ['Baixar', 'Mais ações']]);
        expect(visiveis(linhas[0])[0].getAttribute('aria-label')).toBe('Revisar (Líder SGSI): politica.pdf');
        const menu = (tr) => [...tr.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim());
        // "Definir validade" (spec 3C, C4): o projeto do teste é só do n.iso
        expect(menu(linhas[0])).toEqual(['Assinar CEO', 'Baixar', 'Avaliar com IA', 'Ligar a controles', 'Definir validade']);
        expect(menu(linhas[2])).toEqual(['Avaliar com IA', 'Ligar a controles', 'Definir validade']);
        expect(c.querySelectorAll('.btn-primary')).toHaveLength(0);
    });

    it('cliente vê os controles, sem a ação de ligar', async () => {
        S.user = { role: 'org_user' };
        const { c, h, a } = tela();
        await window.renderEvidence(c, h, a);
        expect(c.querySelector('[data-action="abrirControlesEvidencia"]')).toBeNull();
        expect(c.textContent).toContain('A.5.2');
    });

    it('a janela marca os controles ligados; marcar liga (POST), desmarcar desliga (DELETE)', async () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        await window.abrirControlesEvidencia('p1', 'ev-2');
        const caixas = [...document.querySelectorAll('#modal-content input[type="checkbox"]')];
        expect(caixas.map((x) => x.checked)).toEqual([true, true]);
        expect(document.querySelector('#modal-content img')).toBeNull();
        const um = document.createElement('input'); um.type = 'checkbox'; um.checked = true;
        await window.alternarControleEvidencia('ev-1', 'ctl-1', um);
        const dois = document.createElement('input'); dois.type = 'checkbox'; dois.checked = false;
        await window.alternarControleEvidencia('ev-2', 'ctl-2', dois);
        const escritas = f.mock.calls.filter(([, o]) => o && o.method && o.method !== 'GET').map(([u, o]) => [o.method, String(u).replace(/^.*\/api/, '/api'), o.body ? JSON.parse(o.body) : null]);
        expect(escritas).toEqual([
            ['POST', '/api/v1/evidence/ev-1/controles', { control_id: 'ctl-1' }],
            ['DELETE', '/api/v1/evidence/ev-2/controles/ctl-2', null],
        ]);
    });

    it('falha ao ligar devolve a caixa ao estado anterior', async () => {
        f = servir({}); // sem dublê: o POST volta 404, como o Worker
        const caixa = document.createElement('input'); caixa.type = 'checkbox'; caixa.checked = true;
        await window.alternarControleEvidencia('ev-1', 'ctl-x', caixa);
        expect(caixa.checked).toBe(false);
    });

    it('ligar redesenha a lista; rótulos do Líder SGSI', async () => {
        document.body.innerHTML = '<div id="main-content"></div><div id="header-title"></div><div id="header-actions"></div>';
        S.view = 'evidence';
        const caixa = document.createElement('input'); caixa.type = 'checkbox'; caixa.checked = true;
        await window.alternarControleEvidencia('ev-1', 'ctl-1', caixa);
        const c = document.getElementById('main-content');
        expect(c.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(c.textContent).toContain('Revisar (Líder SGSI)');
        expect(c.textContent).toContain('Revisadas (Líder SGSI)');
        expect(c.textContent).not.toContain('DPO');
        S.view = undefined;
    });

    it('upload do modal usa {ok,id,sha256} e o nome do arquivo escolhido, e relista', async () => {
        document.body.innerHTML = '<div id="main-content"></div><div id="header-title"></div><div id="header-actions"></div>'
            + '<input type="file" id="ev-file"><input id="ev-control-id"><div id="ev-msg"></div><button id="btn-ev-upload"></button>';
        S.view = 'evidence';
        const sha = 'ab'.repeat(32);
        const f2 = servir({
            'POST /api/v1/projects/p1/evidence/upload': { ok: true, id: 'ev-9', sha256: sha },
            'GET /api/v1/projects/p1/evidence': { ok: true, evidence: EVIDENCIAS },
            'GET /api/v1/projects/p1/controls': { ok: true, controls: CONTROLES },
        });
        const input = document.getElementById('ev-file');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'laudo.pdf')], configurable: true });
        await window.doEvidenceUpload('p1');
        expect(document.getElementById('ev-msg').textContent).toBe(`Evidência enviada: laudo.pdf (SHA-256: ${sha.substring(0, 16)}...)`);
        expect(f2.mock.calls.some(([u, o]) => (o?.method || 'GET') === 'GET' && String(u).endsWith('/evidence'))).toBe(true);
        expect(document.getElementById('main-content').querySelectorAll('tbody tr').length).toBe(2);
        S.view = undefined;
    });
});
