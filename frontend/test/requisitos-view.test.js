// Tela Requisitos (fatia 2): fontes, requisitos, cobertura da LGPD e equivalências. api() REAL; só o fetch é dublado,
// com o corpo de cada handler (src/routes/requisitos.ts). A query string não entra na chave do dublê.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/requisitos.js';

const FONTES = [
    { id: 'iso27001:2022', nome: 'ISO/IEC 27001:2022', versao: '2022', vigente_desde: null, requisitos: 93 },
    { id: 'lgpd', nome: 'Lei Geral de Proteção de Dados (Lei 13.709/2018)', versao: '2018', vigente_desde: null, requisitos: 3 },
    { id: 'gdpr', nome: 'GDPR', versao: '2016', vigente_desde: null, requisitos: 0 },
];
const LGPD = [
    { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Bases <b>legais</b>', pai_id: null, papel: null },
    { id: 'lgpd:art37', fonte_id: 'lgpd', referencia: 'art. 37', titulo: 'Registro', pai_id: null, papel: null },
    { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, papel: null },
];
const LACUNAS = {
    fonte: 'lgpd',
    resumo: { total: 3, cobertos: 1, parciais: 1, lacunas: 1 },
    itens: [
        { requisito_id: 'lgpd:art7', referencia: 'art. 7', titulo: 'Bases', pai_id: null, situacao: 'lacuna', origens: [] },
        { requisito_id: 'lgpd:art37', referencia: 'art. 37', titulo: 'Registro', pai_id: null, situacao: 'parcial', origens: [{ tipo: 'controle', id: 'c1', titulo: 'A.5.2 — <i>x</i>', status: 'Implemented', mapeamento: 'parcial' }] },
        { requisito_id: 'lgpd:art46', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, situacao: 'coberto', origens: [{ tipo: 'documento', id: 'd1', titulo: 'Política de <b>Acesso</b>' }, { tipo: 'evidencia', id: 'e1', titulo: 'x.pdf' }] },
    ],
};
const rotas = (extra = {}) => ({
    'GET /api/v1/requisitos/fontes': FONTES,
    'GET /api/v1/requisitos': LGPD,
    'GET /api/v1/projects/p9/requisitos/lacunas': LACUNAS,
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const el = (id) => document.getElementById(id);

async function abrir() {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    await window.renderRequisitos(el('c'), el('h'), el('a'));
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.fonteRequisitos = undefined;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lista', () => {
    it('abre na primeira fonte com requisitos (a ISO tem 93 e vem primeiro), sem coluna de cobertura', async () => {
        const f = servir(rotas({ 'GET /api/v1/requisitos': [{ id: 'iso27001:2022:A.5.1', fonte_id: 'iso27001:2022', referencia: 'A.5.1', titulo: 'Políticas', pai_id: null, papel: null }] }));
        await abrir();
        expect(el('req-fonte').value).toBe('iso27001:2022');
        expect(el('c').textContent).toContain('A.5.1');
        expect(el('c').textContent).not.toContain('Cobertura');
        expect(chamadas(f).some((k) => k.includes('/lacunas'))).toBe(false);
    });

    it('na LGPD mostra a cobertura do projeto, o resumo e a origem, tudo escapado', async () => {
        S.fonteRequisitos = 'lgpd';
        servir(rotas());
        await abrir();
        const t = el('c').textContent;
        expect(t).toContain('1 cobertos');
        expect(t).toContain('Lacuna');
        expect(t).toContain('Parcial');
        expect(t).toContain('Coberto');
        expect(t).toContain('Documento: Política de <b>Acesso</b>');
        expect(t).toContain('Evidência: x.pdf');
        expect(t).not.toContain('Evidência ainda não entra na conta');
        expect(t).toContain('Controle: A.5.2 — <i>x</i>');
        expect(t).toContain('Bases <b>legais</b>');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('i')).toBeNull();
    });

    it('fonte sem requisitos carregados: aviso, sem tabela', async () => {
        S.fonteRequisitos = 'gdpr';
        servir(rotas({ 'GET /api/v1/requisitos/fontes': FONTES.map((x) => ({ ...x, requisitos: x.id === 'gdpr' ? 0 : 0 })) }));
        await abrir();
        expect(el('c').textContent).toContain('Catálogo ainda não carregado');
        expect(el('c').querySelector('table')).toBeNull();
    });

    it('catálogo vazio: sem seletor de fonte; o admin tem o primário de carregar e os demais sabem a quem pedir', async () => {
        history.replaceState(null, '', '/privacy');
        try {
            const vazias = FONTES.map((x) => ({ ...x, requisitos: 0 }));
            S.user = { role: 'platform_admin' };
            servir(rotas({ 'GET /api/v1/requisitos/fontes': vazias }));
            await abrir();
            expect(el('req-fonte')).toBeNull();
            const carregar = el('c').querySelector('.empty-state [data-action="semearRequisitos"]');
            expect(carregar.className).toContain('btn-primary');
            expect(carregar.textContent).toBe('Carregar catálogo LGPD/ANPD');
            S.user = { role: 'consultor' };
            servir(rotas({ 'GET /api/v1/requisitos/fontes': vazias }));
            await abrir();
            expect(el('c').querySelector('[data-action="semearRequisitos"]')).toBeNull();
            expect(el('c').textContent).toContain('O catálogo é carregado pelo administrador da plataforma. Peça a ele para habilitar os requisitos da LGPD e da ANPD.');
        } finally { history.replaceState(null, '', '/'); }
    });

    it('trocar a fonte no seletor guarda a escolha e redesenha', async () => {
        servir(rotas());
        await abrir();
        window.escolherFonteRequisitos('lgpd');
        expect(S.fonteRequisitos).toBe('lgpd');
        expect(window.render).toHaveBeenCalled();
    });

    it('só o administrador da plataforma vê Carregar catálogo', async () => {
        servir(rotas());
        S.user = { role: 'platform_admin' };
        await abrir();
        expect(el('a').querySelector('[data-action="semearRequisitos"]').textContent).toBe('Carregar catálogo');
        S.user = { role: 'consultor' };
        await abrir();
        expect(el('a').innerHTML).toBe('');
    });

    it('sem projeto ativo a LGPD aparece sem cobertura, e a lista não quebra', async () => {
        S.fonteRequisitos = 'lgpd'; S.activeProject = null; S.projects = [];
        servir(rotas());
        await abrir();
        expect(el('c').textContent).toContain('art. 37');
        expect(el('c').textContent).not.toContain('Cobertura');
    });
});

describe('ações', () => {
    it('carregar catálogo chama o seed e avisa quantos', async () => {
        const f = servir(rotas({ 'POST /api/v1/requisitos/semear': { ok: true, fontes: 4, requisitos: 160, controles_ligados: 12 } }));
        await window.semearRequisitos();
        expect(chamadas(f)).toContain('POST /api/v1/requisitos/semear');
        expect(document.body.textContent).toContain('160 requisitos criados, 12 controles ligados');
    });

    it('abrir requisito mostra as equivalências; proposto com selo, validado com quem e quando; tudo escapado', async () => {
        servir(rotas({
            'GET /api/v1/requisitos/lgpd%3Aart37': {
                ...LGPD[1],
                mapeamentos: [
                    { de_id: 'iso27001:2022:A.5.2', para_id: 'lgpd:art37', tipo: 'parcial', estado: 'validado_juridico', validado_por: 'Dra. <b>X</b>', validado_em: '2026-10-01', nota: 'nota <i>n</i>' },
                    { de_id: 'lgpd:art37', para_id: 'iso27701:2025:A.1.2.6', tipo: 'equivalente', estado: 'proposto', validado_por: null, validado_em: null, nota: null },
                ],
            },
        }));
        await abrir();
        await window.abrirRequisito('lgpd:art37');
        const m = el('modal-content');
        expect(m.textContent).toContain('iso27001:2022:A.5.2');
        expect(m.textContent).toContain('iso27701:2025:A.1.2.6');
        expect(m.textContent).toContain('Validado por Dra. <b>X</b> em 01/10/2026');
        expect(m.textContent).toContain('Proposto');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
    });

    it('requisito sem equivalência: mensagem', async () => {
        servir(rotas({ 'GET /api/v1/requisitos/lgpd%3Aart7': { ...LGPD[0], mapeamentos: [] } }));
        await abrir();
        await window.abrirRequisito('lgpd:art7');
        expect(el('modal-content').textContent).toContain('Nenhuma equivalência registrada');
    });
});

describe('validação dos mapeamentos', () => {
    const MAP = { de_id: 'lgpd:art37', para_id: 'iso27701:2025:A.1.2.6', tipo: 'equivalente', estado: 'proposto', validado_por: null, validado_em: null, nota: null };
    const REQ = { ...LGPD[1], mapeamentos: [MAP] };
    const GET = 'GET /api/v1/requisitos/lgpd%3Aart37';
    const corpos = (f, m) => f.mock.calls.filter(([, o]) => o?.method === m);

    it('administrador vê validar e recusar no proposto; org_user não', async () => {
        servir(rotas({ [GET]: REQ }));
        S.user = { role: 'platform_admin', name: 'Ana Jurídico' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').querySelector('[data-action="validarMapeamento"]')).not.toBeNull();
        expect(el('modal-content').querySelector('[data-action="recusarMapeamento"]')).not.toBeNull();
        S.user = { role: 'org_user' };
        await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').querySelector('[data-action="validarMapeamento"]')).toBeNull();
        expect(el('modal-content').querySelector('[data-action="recusarMapeamento"]')).toBeNull();
    });

    it('validar envia PUT com validador e data de hoje e reabre', async () => {
        const f = servir(rotas({ [GET]: REQ, 'PUT /api/v1/requisitos/mapeamentos': { ok: true } }));
        S.user = { role: 'platform_admin', name: 'Ana Jurídico' };
        await abrir();
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-11T01:30:00Z'));
        try { await window.validarMapeamento(MAP.de_id, MAP.para_id, 'equivalente', 'lgpd:art37', 'nota <b>jurídica</b>'); } finally { vi.useRealTimers(); }
        const [[, o]] = corpos(f, 'PUT');
        expect(JSON.parse(o.body)).toEqual({ de_id: MAP.de_id, para_id: MAP.para_id, tipo: 'equivalente', estado: 'validado_juridico', validado_por: 'Ana Jurídico', validado_em: '2026-10-10', nota: 'nota <b>jurídica</b>' });
        expect(chamadas(f).filter((k) => k === `GET ${new URL('/api/v1/requisitos/lgpd%3Aart37', 'http://localhost').pathname}`).length).toBe(1);
    });

    it('recusar só apaga depois de Confirmar recusa', async () => {
        const f = servir(rotas({ [GET]: REQ, 'DELETE /api/v1/requisitos/mapeamentos': { ok: true } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir();
        await window.recusarMapeamento(MAP.de_id, MAP.para_id, 'lgpd:art37');
        expect(corpos(f, 'DELETE').length).toBe(0);
        const b = [...el('modal-content').querySelectorAll('button')].find((x) => x.textContent === 'Confirmar recusa');
        expect(b).toBeTruthy();
        await window[b.dataset.action](...JSON.parse(b.dataset.args));
        const [[u]] = corpos(f, 'DELETE');
        expect(new URL(u, 'http://localhost').searchParams.get('de')).toBe(MAP.de_id);
        expect(new URL(u, 'http://localhost').searchParams.get('para')).toBe(MAP.para_id);
    });

    it('o botão Validar leva a nota do mapeamento; reabrir a janela descarta a recusa pendente', async () => {
        servir(rotas({ [GET]: { ...REQ, mapeamentos: [{ ...MAP, nota: 'n1' }] } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(JSON.parse(el('modal-content').querySelector('[data-action="validarMapeamento"]').dataset.args)[4]).toBe('n1');
        await window.recusarMapeamento(MAP.de_id, MAP.para_id, 'lgpd:art37');
        expect(el('modal-content').textContent).toContain('Confirmar recusa');
        await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').textContent).not.toContain('Confirmar recusa');
    });

    it('validado mostra quem e quando (DD/MM/AAAA) e nenhum botão', async () => {
        servir(rotas({ [GET]: { ...REQ, mapeamentos: [{ ...MAP, estado: 'validado_juridico', validado_por: 'Ana', validado_em: '2026-10-01' }] } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').textContent).toContain('Validado por Ana em 01/10/2026');
        expect(el('modal-content').querySelector('button[data-action$="Mapeamento"]')).toBeNull();
    });
});
