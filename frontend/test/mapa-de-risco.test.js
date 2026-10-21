// Mapa de risco do n.privacy (F2): matriz 5x5 sobre GET /projects/:id/ropa/riscos-mapa. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { nivelDaNota } from '../src/views/mapa-de-risco.js';
import html from '../login.html?raw';
import rota from '../src/router.js?raw';
import main from '../src/main.js?raw';
import { SECOES_PRIVACY, SO_PRIVACY } from '../src/produto.js';

initDelegation();

// Corpo como o handler devolve (src/routes/ropa.ts, `riscos-mapa`): { riscos: [...] }.
const R = (id, p, i, extra = {}) => ({ id, ropa_id: 'r1', threat: `Ameaça ${id}`, probability: p, impact: i, risk_level: nivelDaNota(p, i), residual_level: null, atividade: 'Folha de pagamento', ...extra });
const RISCOS = [
    R('a', 5, 5, { threat: 'Vazamento <b>grave</b>', atividade: 'Folha <i>x</i>' }),
    R('b', 5, 5, { residual_level: 'Medium' }),
    R('c', 1, 2),
    R('iso', 3, 3, { ropa_id: null }),
];
const el = (id) => document.getElementById(id);
const celula = (p, i) => document.querySelector(`[data-action="mapaCelula"][data-args='[${p},${i}]']`);

async function abrir(riscos = RISCOS, extra = {}) {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir({ 'GET /api/v1/projects/p9/ropa/riscos-mapa': { riscos }, ...extra });
    await window.renderMapaDeRisco(el('c'), el('h'), el('a'));
    return f;
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    window.abrirAtividade = vi.fn();
    history.replaceState(null, '', '/privacy?vista=mapa');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('mapa de risco', () => {
    it('a faixa de nível é a do servidor (riskLevel)', () => {
        expect([nivelDaNota(1, 5), nivelDaNota(2, 3), nivelDaNota(3, 4), nivelDaNota(4, 4), nivelDaNota(4, 5), nivelDaNota(5, 5)])
            .toEqual(['Low', 'Medium', 'Medium', 'High', 'High', 'Critical']);
    });

    it('soma os riscos por célula e diz o nível por texto, não só por cor', async () => {
        await abrir();
        expect(document.querySelectorAll('[data-action="mapaCelula"]').length).toBe(25);
        expect(celula(5, 5).getAttribute('aria-label')).toBe('Probabilidade 5, impacto 5: nível Crítico, 2 riscos');
        expect(celula(5, 5).textContent.replace(/\s+/g, ' ').trim()).toBe('2 Crítico');
        expect(celula(1, 2).getAttribute('aria-label')).toBe('Probabilidade 1, impacto 2: nível Baixo, 1 risco');
        expect(celula(4, 4).textContent).toContain('Alto');
    });

    it('risco sem atividade (só do n.iso) não aparece no mapa', async () => {
        await abrir();
        expect(celula(3, 3).getAttribute('aria-label')).toContain('0 riscos');
        expect(el('c').textContent).toContain('3 riscos de atividades de tratamento');
    });

    it('clicar na célula lista os riscos dela e abre a atividade; clicar de novo fecha', async () => {
        await abrir();
        celula(5, 5).click();
        expect(celula(5, 5).getAttribute('aria-pressed')).toBe('true');
        const lista = el('mapa-lista');
        expect(lista.textContent).toContain('Probabilidade 5, impacto 5: 2 riscos');
        expect(lista.textContent).toContain('Médio');
        const abrirAtv = lista.querySelector('[data-action="abrirAtividade"]');
        expect(JSON.parse(abrirAtv.getAttribute('data-args'))).toEqual(['p9', 'r1', 'riscos']);
        abrirAtv.click();
        expect(window.abrirAtividade).toHaveBeenCalledWith('p9', 'r1', 'riscos');
        celula(5, 5).click();
        expect(el('mapa-lista').textContent).toContain('Escolha uma célula');
    });

    it('escapa o texto vindo do servidor', async () => {
        await abrir();
        celula(5, 5).click();
        expect(el('mapa-lista').innerHTML).not.toContain('<b>grave</b>');
        expect(el('mapa-lista').innerHTML).toContain('&lt;b&gt;grave&lt;/b&gt;');
        expect(el('mapa-lista').querySelector('i')).toBeNull();
    });

    it('nenhum link leva ao n.iso (matriz, CAPA); sem riscos, o vazio leva aos tratamentos', async () => {
        await abrir();
        celula(5, 5).click();
        const html = el('c').innerHTML + el('a').innerHTML;
        expect(html).not.toMatch(/"(risks|capa)"|\/iso/);
        await abrir([]);
        expect(el('c').textContent).toContain('Nenhum risco nas atividades de tratamento');
        expect(el('c').querySelector('[data-action="navigate"]').getAttribute('data-args')).toBe('["ropa"]');
    });

    it('a tela está ligada: item no menu do n.privacy (Diagnóstico), rota no router e módulo no main', () => {
        expect(html).toContain(`id="nav-mapa-de-risco" data-action="navigate" data-args='["mapa-de-risco"]'`);
        expect(rota).toContain("S.view === 'mapa-de-risco') renderMapaDeRisco(");
        expect(main).toContain("import './views/mapa-de-risco.js';");
        expect(SECOES_PRIVACY.find(([t]) => t === 'Diagnóstico')[1]).toContain('nav-mapa-de-risco');
        expect(SO_PRIVACY).toContain('nav-mapa-de-risco');
    });

    it('um literal de rota por chamada', async () => {
        const f = await abrir();
        expect(f.mock.calls.map(([u]) => new URL(u, 'http://localhost').pathname)).toEqual(['/api/v1/projects/p9/ropa/riscos-mapa']);
    });
});

const emDias = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
describe('Gestão de Riscos (lista, a vista padrão)', () => {
    beforeEach(() => history.replaceState(null, '', '/privacy'));
    const LISTA = [
        R('a', 5, 5, { atividade: 'Atividade Exemplo', area: 'Jurídico, Recursos Humanos', vulnerabilidade: 'Senha <b>fraca</b>', threat: 'Vazamento', treatment: 'Mitigate',
            plano: 'Ativar MFA', owner_parte_id: 'pa1', status: 'Open', prazo: emDias(-2), responsavel: 'Responsável Exemplo', idr: 1 }),
        R('b', 1, 2, { ropa_id: 'r2', atividade: 'Outra Atividade', area: 'Jurídico', threat: 'Retenção', treatment: 'Accept', status: 'Closed', prazo: '2026-01-10' }),
        R('c', 3, 3, { atividade: 'Atividade Exemplo', area: null, threat: 'Vazamento', status: 'Accepted' }),
    ];
    const linhas = () => [...el('mapa-lista').querySelectorAll('tbody tr')];
    const filtrar = (id, v) => { el(id).value = v; el(id).dispatchEvent(new Event('change', { bubbles: true })); };

    it('abre em lista; Mapa | Lista guarda a escolha no endereço', async () => {
        await abrir(LISTA);
        expect(el('h').textContent).toBe('Gestão de Riscos');
        const vista = (v) => el('c').querySelector(`[data-action="mapaVista"][data-args='["${v}"]']`);
        expect(vista('lista').getAttribute('aria-pressed')).toBe('true');
        expect(el('mapa-grade')).toBeNull();
        expect(linhas()).toHaveLength(3);
        vista('mapa').click();
        expect(new URLSearchParams(window.location.search).get('vista')).toBe('mapa');
        expect(el('mapa-grade')).not.toBeNull();
        // recarregar volta ao mapa
        await abrir(LISTA);
        expect(el('mapa-grade')).not.toBeNull();
        el('c').querySelector(`[data-action="mapaVista"][data-args='["lista"]']`).click();
        expect(new URLSearchParams(window.location.search).has('vista')).toBe(false);
        expect(el('mapa-grade')).toBeNull();
    });

    it('colunas do legado; Status com o rótulo único (Aberto, Concluído, Aceito); texto escapado', async () => {
        await abrir(LISTA);
        expect([...el('mapa-lista').querySelectorAll('thead th')].map((t) => t.textContent.trim()))
            .toEqual(['Atividade', 'Motivo', 'Risco', 'Responsável', 'Prazo', 'Status', 'Ações']);
        const [a, b, c] = linhas().map((l) => l.textContent);
        for (const x of ['Atividade Exemplo', 'Vazamento', 'Crítico', 'Responsável Exemplo', 'Aberto']) expect(a).toContain(x);
        expect(b).toContain('Concluído');
        expect(b).toContain('10/01/2026');
        expect(c).toContain('Aceito'); // o status real, sem dobrar Aceito em Aberto
        expect(el('mapa-lista').querySelector('tbody b')).toBeNull();
    });

    it('filtros Motivo, Área, Risco e Status refazem a tabela sem ir ao servidor', async () => {
        const f = await abrir(LISTA);
        expect([...el('mr-f-motivo').options].map((o) => o.textContent)).toEqual(['Todos', 'Retenção', 'Vazamento']);
        expect([...el('mr-f-area').options].map((o) => o.textContent)).toEqual(['Todos', 'Jurídico', 'Recursos Humanos']);
        expect(el('mr-contagem').textContent).toBe('3');
        filtrar('mr-f-motivo', 'Vazamento');
        expect(linhas()).toHaveLength(2);
        expect(el('mr-contagem').textContent).toBe('2 de 3');
        filtrar('mr-f-area', 'Recursos Humanos');
        expect(linhas()).toHaveLength(1);
        filtrar('mr-f-motivo', '');
        filtrar('mr-f-area', 'Jurídico');
        expect(linhas()).toHaveLength(2);
        filtrar('mr-f-area', '');
        filtrar('mr-f-nivel', 'Low');
        expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Retenção')]);
        filtrar('mr-f-nivel', '');
        filtrar('mr-f-status', 'Closed');
        expect(linhas()).toHaveLength(1);
        filtrar('mr-f-status', 'Open');
        expect(linhas()).toHaveLength(1);
        filtrar('mr-f-status', 'Accepted');
        expect(linhas()).toHaveLength(1);
        expect([...el('mr-f-status').options].map((o) => o.textContent)).toEqual(['Todos', 'Aberto', 'Mitigado', 'Aceito', 'Concluído']);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('"Tratar Risco" abre o modal da atividade com o risco da linha e grava pela rota da atividade', async () => {
        const f = await abrir(LISTA, {
            'GET /api/v1/projects/p9/partes': [{ id: 'pa1', tipo: 'pessoa', nome: 'Responsável Exemplo', status: 'ativa' }],
            'PUT /api/v1/projects/p9/ropa/r1/riscos/a': { ok: true, risk_level: 'Critical' },
        });
        const b = linhas()[0].querySelector('[data-action="mapaTratar"]');
        expect(b.textContent.trim()).toBe('Tratar Risco');
        await window.mapaTratar('a');
        expect(el('modal-content').querySelector('h2').textContent).toBe('Tratar Risco 01');
        expect(el('at-rk-p-risco').textContent).toContain('Senha <b>fraca</b>');
        expect(el('at-rk-estr').value).toBe('Mitigate');
        expect(el('at-rk-plano').value).toBe('Ativar MFA');
        expect(el('at-rk-resp').value).toBe('pa1');
        expect(el('at-rk-prazo').value).toBe(emDias(-2));
        el('at-rk-status').value = 'Closed';
        el('at-rk-status').dispatchEvent(new Event('change', { bubbles: true }));
        await window.atRiscoTratarGravar();
        const put = f.mock.calls.find(([, o]) => o && o.method === 'PUT');
        expect(new URL(put[0], 'http://localhost').pathname).toBe('/api/v1/projects/p9/ropa/r1/riscos/a');
        expect(JSON.parse(put[1].body)).toMatchObject({ treatment: 'Mitigate', treatment_plan: 'Ativar MFA', owner_parte_id: 'pa1', status: 'Closed' });
    });

    it('Exportar CSV: na lista, pelo componente; no mapa, no cabeçalho e só a célula escolhida', async () => {
        const f = await abrir(LISTA, { 'GET /api/v1/projects/p9/export/riscos-atividade': 'csv' });
        expect(el('a').querySelector('[data-action="exportarCsvRiscos"]')).toBeNull();
        expect(JSON.parse(el('c').querySelector('[data-action="listaExportar"]').getAttribute('data-args'))).toEqual(['mr']);
        await window.listaExportar('mr');
        el('c').querySelector(`[data-action="mapaVista"][data-args='["mapa"]']`).click();
        expect(el('c').querySelector('[data-action="listaExportar"]')).toBeNull();
        expect(el('a').querySelector('[data-action="exportarCsvRiscos"]')).not.toBeNull();
        celula(5, 5).click();
        await window.exportarCsvRiscos();
        expect(f.mock.calls.map(([u]) => { const x = new URL(u, 'http://localhost'); return x.pathname + x.search; }).filter((u) => u.includes('/export/')))
            .toEqual(['/api/v1/projects/p9/export/riscos-atividade', '/api/v1/projects/p9/export/riscos-atividade?probabilidade=5&impacto=5']);
    });

    it('quem só lê não vê "Tratar Risco"; "Abrir" leva à atividade na aba Riscos', async () => {
        S.user = { role: 'org_user' };
        await abrir(LISTA);
        expect(el('mapa-lista').querySelector('[data-action="mapaTratar"]')).toBeNull();
        linhas()[1].querySelector('[data-action="abrirAtividade"]').click();
        expect(window.abrirAtividade).toHaveBeenCalledWith('p9', 'r2', 'riscos');
    });
});
