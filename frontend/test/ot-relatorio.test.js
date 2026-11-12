// n.ot, Relatórios (E5 Task 4): relatório de conformidade para imprimir e indicadores clicáveis. api() REAL, fetch dublado com os
// corpos de src/routes/ot.ts (GET /relatorio/conformidade, /indicadores, /conformidade, /sites).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarSaidas } from '../src/views/ot-saidas.js';
import { initDelegation } from '../src/delegation.js';

initDelegation();

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const SITES = { sites: [{ id: 's1', nome: 'SE Norte' }, { id: 's2', nome: 'SE Sul' }] };
const IND = { completude: { total: 4, completos: 3, percentual: 75, arciber: { total: 2, completos: 2 } }, sem_zona: 2, sem_ip: 1, sem_mac: 1,
    por_zona: [{ zona_id: 'z2', site_id: 's2', nome: 'Supervisão', nivel_purdue: 2, ativos: 3 }], fluxos_externos: { externos: 1, sem_vpn: 0 }, prazos: [] };
const REL = { projeto: 'Projeto <b id="xss1">X</b>', gerado_em: '2026-11-12T15:00:00.000Z', gerado_por: 'Ana', resumo: {},
    sites: [{ nome: 'SE Norte', fase: 'em_operacao', base_aprovada_em: '2026-10-01 12:00:00' }],
    itens: [
        { codigo: '4.1.1', titulo: 'Zonas', categoria: 'Rede', prazo: '2023-01-09', tipo: 'tecnico', situacao: 'nao_atende', por_site: [{ site_nome: 'SE Norte', situacao: 'nao_atende', evidencia: '1 de 1 site(s) sem zonas' }] },
        { codigo: '4.4.1', titulo: 'Firmware', categoria: 'Ativos', prazo: null, tipo: 'politica', situacao: 'parcial', justificativa: 'Falta <i id="xss2">p</i>', responsavel_nome: 'Ana',
            proxima_revisao: '2027-11-12', confirmado_por_nome: 'Gestor', confirmado_em: '2026-11-12 14:00:00', evidencias: [{ file_name: 'politica.pdf', valido_ate: '2027-03-01', vencida: false }] },
    ] };

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    S.token = 'tok'; S.user = { id: 'u1', role: 'consultor' }; S.activeProject = { id: 'p9', modulos: ['ot'] };
    window.render = vi.fn(); window.otTela = vi.fn(); window.print = vi.fn();
    servir({ [`GET ${B}/indicadores`]: IND, [`GET ${B}/conformidade`]: { resumo: {}, itens: [] }, [`GET ${B}/sites`]: SITES, [`GET ${B}/relatorio/conformidade`]: REL });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Relatórios: relatório de conformidade e indicadores clicáveis', () => {
    it('o botão abre o relatório com projeto, data, sites e itens; Imprimir chama window.print', async () => {
        await montarSaidas(el('c'), el('a'), S.activeProject);
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(el('a').querySelector('.btn-primary').textContent).toBe('Relatório de conformidade');
        await window.otRelatorioConformidade();
        await pausa();
        const t = el('c').textContent;
        for (const x of ['Projeto', '12/11/2026', 'Ana', 'SE Norte', '01/10/2026', 'Em operação', '4.1.1', 'Não atende', '1 de 1 site(s) sem zonas', '4.4.1', 'Parcial', 'politica.pdf', '01/03/2027', 'Gestor', '12/11/2027']) expect(t).toContain(x);
        expect(el('xss1')).toBeNull(); expect(el('xss2')).toBeNull();
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
        const imprimir = document.querySelector('.btn-primary');
        expect(imprimir.textContent).toBe('Imprimir / Salvar PDF');
        imprimir.click();
        expect(window.print).toHaveBeenCalled();
        expect(el('c').innerHTML).toContain('@media print');
    });

    it('"Ativos sem zona" leva à Base de cada site com o filtro sem zona; a zona leva à Base filtrada por ela', async () => {
        await montarSaidas(el('c'), el('a'), S.activeProject);
        el('c').querySelector('[data-action="otIrBase"][data-args*="s2"][data-args*="sem"]').click();
        expect(window.otTela).toHaveBeenLastCalledWith('site', 's2', 'projeto', { otSub: 'base', otZona: 'sem' });
        el('c').querySelector('[data-action="otIrBase"][data-args*="z2"]').click();
        expect(window.otTela).toHaveBeenLastCalledWith('site', 's2', 'projeto', { otSub: 'base', otZona: 'z2' });
        expect(el('c').querySelectorAll('[data-action="otIrBase"]')).toHaveLength(3); // dois sites + uma zona; sem IP/MAC e VPN não têm destino
    });
});
