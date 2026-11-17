// Bloco "Vínculo com o n.ot" nos detalhes de risco, ação e incidente. A propriedade que importa: sem o módulo ot (pessoa E projeto),
// nenhuma chamada a /ot/referencias e nenhum bloco. `api` dublado FALHA se a rota for chamada.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://localhost' }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import '../src/ui.js';
import '../src/views/grc.js';
import { S } from '../src/state.js';

const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const REFS = { referencias: [{ id: 'r1', ot_site_id: 's1', risk_id: 'k1' }, { id: 'r2', ot_site_id: 's9' }] };
const SITES = { sites: [{ id: 's1', nome: 'SE <b id="xss">Norte</b>' }, { id: 's2', nome: 'Usina' }] };
let chamadas;
function servir({ ot }) {
    chamadas = [];
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url, corpo) => {
        chamadas.push([m, url, corpo]);
        if (/\/ot\/referencias/.test(url) && !ot) throw new Error(`chamou ${url} sem o módulo ot`);
        if (m === 'GET' && /\/ot\/referencias/.test(url)) return REFS;
        if (/\/ot\/sites$/.test(url)) return SITES;
        if (m === 'POST' || m === 'DELETE') return { ok: true };
        return [];
    });
}
const cenario = (pessoa, projeto, role = 'consultor') => {
    S.user = { id: 'u1', role, modulos: pessoa };
    S.activeProject = { id: 'p1', modulos: projeto };
    S.projects = [S.activeProject];
    S.risks = [{ id: 'k1', asset: 'A', threat: 'T', probability: 2, impact: 3 }];
    S.capa = [{ id: 'c1', title: 'CAPA' }];
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
};
beforeEach(() => cenario(['iso', 'ot'], ['iso', 'ot']));
const nenhumaOt = () => expect(chamadas.filter(([, u]) => /\/ot\//.test(u))).toEqual([]);

describe.each([['risco', () => window.openRiskDetailsModal('k1'), 'risk_id=k1'], ['ação', () => window.openCAPADetailsModal('c1'), 'acao_id=c1']])('detalhe de %s', (_n, abrir, q) => {
    it.each([
        ['pessoa sem ot', ['iso'], ['iso', 'ot']],
        ['projeto sem ot', ['iso', 'ot'], ['iso']],
        ['projeto sem lista (resposta antiga)', ['iso', 'ot'], undefined],
        ['módulos da pessoa desconhecidos (falha fechado)', undefined, ['iso', 'ot']],
    ])('%s: sem bloco e sem chamada a /ot', async (_c, pessoa, projeto) => {
        cenario(pessoa, projeto); servir({ ot: false });
        await abrir(); await pausa();
        expect(el('ot-vinculo')).toBeNull();
        expect(document.body.textContent).not.toContain('n.ot');
        nenhumaOt();
    });

    it('com o módulo: lista escapada, pede só o item aberto, cria e remove', async () => {
        servir({ ot: true });
        await abrir(); await vi.waitFor(() => expect(el('ot-vinculo').textContent).toContain('Vínculo com o n.ot'));
        expect(chamadas.some(([m, u]) => m === 'GET' && u.includes(`/ot/referencias?${q}`))).toBe(true);
        expect(el('xss')).toBeNull(); // nome do site escapado
        expect(el('ot-vinculo').textContent).toContain('SE <b id="xss">Norte</b>');
        el('ot-vinculo-site').value = 's2';
        await window.otAdicionarReferencia();
        expect(chamadas.find(([m]) => m === 'POST')[2]).toEqual({ [q.split('=')[0]]: q.split('=')[1], ot_site_id: 's2' });
        await window.otRemoverReferencia('r1');
        expect(chamadas.some(([m, u]) => m === 'DELETE' && u.endsWith('/ot/referencias/r1'))).toBe(true);
    });

    it('técnico vê o vínculo mas não cria nem remove', async () => {
        cenario(['iso', 'ot'], ['iso', 'ot'], 'org_user'); servir({ ot: true });
        await abrir(); await vi.waitFor(() => expect(el('ot-vinculo').textContent).toContain('Vínculo'));
        expect(el('ot-vinculo').querySelector('button')).toBeNull();
    });
});
