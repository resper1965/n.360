// Validade da evidência pelo n.iso (spec 3C, C4): coluna "Validade" na lista e "Definir validade" no menu da linha para quem edita
// evidência, sem o n.privacy (o pedaço de requisitos do modal continua só com ele). Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/globals.js';
import { initDelegation } from '../src/delegation.js';
import { emDiasSP } from '../src/hoje.js';
import { formatarData } from '../src/ui.js';
import '../src/views/monitor.js';
import '../src/views/compliance.js';

initDelegation();

const EM_DIA = emDiasSP(30);
const EVIDENCIAS = [
    { id: 'e1', file_name: 'backup.pdf', valido_ate: EM_DIA, evaluation_status: 'conforming', ciso_approved_by: 'a', ceo_approved_by: 'b' },
    { id: 'e2', file_name: 'mfa.png', valido_ate: emDiasSP(-1), evaluation_status: 'pending', ciso_approved_by: 'a', ceo_approved_by: 'b' },
    { id: 'e3', file_name: 'ata.docx', evaluation_status: 'pending', ciso_approved_by: 'a', ceo_approved_by: 'b' },
];

const montar = async (proj, role = 'consultor') => {
    S.user = { id: 'u1', role };
    S.activeProject = proj; S.currentProject = null; S.projects = [proj]; S.filtroPainel = null;
    apiMock.mockImplementation(async (m, url) => (m === 'GET' && url.endsWith('/evidence') ? EVIDENCIAS
        : url.endsWith('/requisitos') && m === 'GET' ? { valido_ate: EM_DIA, requisitos: [] } : m === 'GET' ? [] : { ok: true }));
    await window.renderEvidence(...['c', 'h', 'a'].map((id) => document.getElementById(id)));
};
const linha = (nome) => [...document.querySelectorAll('#c tbody tr')].find((tr) => tr.textContent.includes(nome));
const itemDoMenu = (nome, rotulo) => [...linha(nome).querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === rotulo);

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    apiMock.mockReset();
    history.replaceState(null, '', '/iso');
});

describe('validade da evidência no n.iso', () => {
    it('coluna Validade: data, vencida marcada e "Sem validade"', async () => {
        await montar({ id: 'p1', modulos: ['iso'] });
        expect([...document.querySelectorAll('#c thead th')].map((th) => th.textContent)).toContain('Validade');
        expect(linha('backup.pdf').textContent).toContain(formatarData(EM_DIA));
        expect(linha('mfa.png').textContent).toContain('Vencida');
        expect(linha('ata.docx').textContent).toContain('Sem validade');
    });

    it('sem o n.privacy: "Definir validade" abre o modal só com a validade e grava pela rota do núcleo', async () => {
        await montar({ id: 'p1', modulos: ['iso'] });
        expect(itemDoMenu('backup.pdf', 'Requisitos e validade')).toBeUndefined();
        itemDoMenu('backup.pdf', 'Definir validade').click();
        await vi.waitFor(() => expect(document.getElementById('ev-valido-ate')).not.toBeNull());
        expect(document.getElementById('ev-valido-ate').value).toBe(EM_DIA);
        expect(document.getElementById('ev-requisitos')).toBeNull();
        expect(apiMock.mock.calls.some(([, url]) => url.includes('/requisitos'))).toBe(false);
        document.getElementById('ev-valido-ate').value = '2027-05-31';
        await window.salvarValidadeEvidencia('p1', 'e1');
        expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/projects/p1/evidence/e1/validade', { valido_ate: '2027-05-31' });
    });

    it('quem não edita evidência (org_user) não vê a ação sem o n.privacy', async () => {
        await montar({ id: 'p1', modulos: ['iso'] }, 'org_user');
        expect(itemDoMenu('backup.pdf', 'Definir validade')).toBeUndefined();
    });

    it('com o n.privacy, o modal segue com os requisitos', async () => {
        await montar({ id: 'p1', modulos: ['iso', 'privacy'] });
        itemDoMenu('backup.pdf', 'Requisitos e validade').click();
        await vi.waitFor(() => expect(document.getElementById('ev-requisitos')).not.toBeNull());
        expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/evidence/e1/requisitos');
    });
});
