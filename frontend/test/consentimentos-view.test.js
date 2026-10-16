// Consentimentos (n.privacy): resumo, filtros, ordem, estados, detalhe e revogação com confirmação. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/titular.js';
import { resumir, filtrar, ordenar, ehPseudonimo, historico } from '../src/views/consentimentos.js';

const B = '/api/v1/projects/p9';
const L = [
    { id: 'k1', ropa_id: 'r1', tratamento: 'Marketing <i>x</i>', titular_ref: 'ref-001', finalidade: 'E-mail', versao_aviso: 'Aviso v3', obtido_em: '2026-10-01', canal: 'Formulário', revogado_em: null, vigente: true, criado_por: 'ana@x.io', created_at: '2026-10-01T10:00:00Z' },
    { id: 'k2', ropa_id: 'r1', tratamento: 'Marketing <i>x</i>', titular_ref: 'ref-002', finalidade: 'E-mail', versao_aviso: 'Aviso v2', obtido_em: '2026-09-01', canal: null, revogado_em: '2026-10-05T10:00:00Z', revogado_por: 'ana@x.io', vigente: false },
    { id: 'k3', ropa_id: 'r2', tratamento: 'Cadastro', titular_ref: 'tit-0123456789abcdef', finalidade: 'Cadastro de cliente', versao_aviso: 'Aviso v1', obtido_em: '2026-09-15', canal: null, revogado_em: null, vigente: true },
    { id: 'k4', ropa_id: 'r2', tratamento: 'Cadastro', titular_ref: 'tit-fedcba9876543210', finalidade: 'Cadastro de cliente', versao_aviso: 'Aviso v1', obtido_em: '2026-08-01', canal: 'E-mail', revogado_em: '2026-09-20', revogado_por: null, vigente: false },
];
const el = (id) => document.getElementById(id);
const refs = () => [...el('c').querySelectorAll('tbody .co-ref')].map((n) => n.textContent);
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);

async function abrir(role = 'consultor', rotas = {}, lista = L) {
    S.user = { role };
    S.titularAba = 'consentimentos';
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    const f = servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [], [`GET ${B}/consentimentos`]: lista, [`GET ${B}/ropa`]: [{ id: 'r1', processing_purpose: 'Marketing' }], ...rotas });
    await window.renderTitular(el('c'), el('h'), el('a'));
    return f;
}
const digitar = (v) => { el('co-busca').value = v; window.buscarConsentimentos(v); };

beforeEach(() => {
    S.token = 'tok'; S.activeProject = { id: 'p9' }; S.consentimentosFiltro = null;
    history.replaceState(null, '', '/privacy');
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('regras da lista', () => {
    it('resumo conta vigentes, revogados e vigentes sem canal', () => {
        expect(resumir(L)).toEqual({ total: 4, vigentes: 2, revogados: 2, sem_canal: 1 });
        expect(resumir([])).toEqual({ total: 0, vigentes: 0, revogados: 0, sem_canal: 0 });
    });
    it('filtra por situação, tratamento e busca sem acento nem caixa', () => {
        expect(filtrar(L, { situacao: 'vigente' }).map((x) => x.id)).toEqual(['k1', 'k3']);
        expect(filtrar(L, { situacao: 'revogado', ropa: 'r2' }).map((x) => x.id)).toEqual(['k4']);
        expect(filtrar(L, { busca: 'FORMULARIO' }).map((x) => x.id)).toEqual(['k1']);
        expect(filtrar(L, { busca: 'tit-0123' }).map((x) => x.id)).toEqual(['k3']);
        expect(filtrar(L, { busca: 'nada disso' })).toEqual([]);
    });
    it('ordena vigente primeiro (mais recente antes) e revogado depois (revogação mais recente antes)', () => {
        expect(ordenar(L).map((x) => x.id)).toEqual(['k1', 'k3', 'k2', 'k4']);
    });
    it('reconhece o pseudônimo da importação e monta o histórico em ordem', () => {
        expect(ehPseudonimo('tit-0123456789abcdef')).toBe(true);
        expect(ehPseudonimo('ref-001')).toBe(false);
        expect(historico(L[1]).map((h) => h.texto.split(' ')[0])).toEqual(['Consentimento', 'Revogado']);
        expect(historico(L[3]).pop().texto).toContain('histórico importado');
    });
});

describe('tela', () => {
    it('mostra resumo, tabela ordenada, tratamento escapado e selos com texto', async () => {
        await abrir();
        const t = el('c').textContent;
        expect(el('c').querySelector('.co-resumo').textContent).toContain('Vigentes');
        expect(refs()).toEqual(['ref-001', 'tit-0123456789abcdef', 'ref-002', 'tit-fedcba9876543210']);
        expect(t).toContain('Marketing <i>x</i>');
        expect(el('c').querySelector('i')).toBeNull();
        expect(t).toContain('Vigente');
        expect(t).toContain('Revogado');
        expect(t).toContain('Canal não informado');
        expect(t).toContain('Pseudônimo do histórico importado');
        expect(t).toContain('Revogar não apaga');
        expect(el('c').querySelectorAll('th[scope="col"]').length).toBe(7);
    });
    it('filtra por situação, busca e tratamento, e "limpar filtros" volta tudo', async () => {
        await abrir();
        window.filtrarConsentimentos('situacao', 'revogado');
        expect(refs()).toEqual(['ref-002', 'tit-fedcba9876543210']);
        expect(el('c').querySelector('[data-action="filtrarConsentimentos"][aria-pressed="true"]').textContent).toContain('Revogados');
        window.filtrarConsentimentosTratamento('r2');
        expect(refs()).toEqual(['tit-fedcba9876543210']);
        expect(el('co-contagem').textContent).toBe('1 de 4 consentimentos');
        digitar('inexistente');
        expect(el('c').textContent).toContain('Nenhum consentimento com estes filtros');
        window.limparFiltrosConsentimentos();
        expect(refs().length).toBe(4);
        expect(el('co-busca').value).toBe('');
    });
    it('o filtro sobrevive a um redesenho da tela', async () => {
        await abrir();
        window.filtrarConsentimentos('situacao', 'vigente');
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(refs()).toEqual(['ref-001', 'tit-0123456789abcdef']);
    });
    it('um primário só no cabeçalho; ações da linha são secundárias e têm nome com o registro', async () => {
        await abrir();
        expect(el('a').querySelectorAll('.btn-primary').length).toBe(1);
        expect(el('c').querySelector('.btn-primary')).toBeNull();
        const rev = el('c').querySelector('[data-action="revogarConsentimento"]');
        expect(rev.getAttribute('aria-label')).toBe('Revogar o consentimento de ref-001, Marketing <i>x</i>');
        expect(el('c').querySelectorAll('[data-action="revogarConsentimento"]').length).toBe(2);
    });
    it('sem permissão de escrita: só leitura, sem botão morto', async () => {
        await abrir('org_user');
        expect(el('a').innerHTML).toBe('');
        expect(el('c').querySelector('[data-action="revogarConsentimento"]')).toBeNull();
        expect(el('c').querySelector('[data-action="abrirConsentimento"]')).not.toBeNull();
    });
    it('vazio: explica o que é e leva a Tratamentos e a Importar histórico; sem escrita, não oferece registrar', async () => {
        await abrir('consultor', {}, []);
        expect(el('c').textContent).toContain('prova de que o titular concordou');
        const acoes = [...el('c').querySelectorAll('.empty-action [data-action]')].map((b) => b.getAttribute('data-action') + b.getAttribute('data-args'));
        expect(acoes).toEqual(['abrirNovoConsentimento["p9"]', 'navigate["ropa"]', 'navigate["importacao"]']);
        await abrir('org_user', {}, []);
        expect(el('c').querySelector('[data-action="abrirNovoConsentimento"]')).toBeNull();
        expect(el('c').querySelector('[data-action="navigate"][data-args=\'["importacao"]\']')).toBeNull();
        expect(el('c').textContent).toContain('equipe da consultoria');
    });
    it('erro de carga: mensagem com "Tentar de novo", nunca o vazio', async () => {
        S.titularAba = 'consentimentos';
        document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
        S.user = { role: 'consultor' };
        servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [] });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await window.renderTitular(el('c'), el('h'), el('a'));
        expect(el('c').querySelector('.error-state')).not.toBeNull();
        expect(el('c').textContent).toContain('Tentar de novo');
        expect(el('c').textContent).not.toContain('Nenhum consentimento registrado');
        expect(el('a').innerHTML).toBe('');
    });
});

describe('detalhe e revogação', () => {
    it('detalhe mostra os campos e o histórico; revogado não oferece Revogar', async () => {
        await abrir();
        window.abrirConsentimento('p9', 'k2');
        const m = el('modal-content');
        expect(m.textContent).toContain('ref-002');
        expect(m.textContent).toContain('Revogado por ana@x.io');
        expect(m.querySelector('[data-action="revogarConsentimento"]')).toBeNull();
        window.abrirConsentimento('p9', 'k1');
        expect(el('modal-content').querySelector('[data-action="revogarConsentimento"]')).not.toBeNull();
        expect(el('modal-content').querySelector('i')).toBeNull();
    });
    it('revogar pergunta antes, diz que o registro fica, e só chama a rota com o "sim"', async () => {
        const f = await abrir('consultor', { [`POST ${B}/consentimentos/k1/revogar`]: { ok: true } });
        const confirmar = vi.spyOn(window, 'confirmar').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        await window.revogarConsentimento('p9', 'k1');
        expect(chamadas(f)).not.toContain(`POST ${B}/consentimentos/k1/revogar`);
        await window.revogarConsentimento('p9', 'k1');
        expect(chamadas(f)).toContain(`POST ${B}/consentimentos/k1/revogar`);
        expect(confirmar.mock.calls[0][0]).toContain('não é apagado');
        expect(confirmar.mock.calls[0][1]).toMatchObject({ perigo: true, rotulo: 'Revogar' });
        expect(window.render).toHaveBeenCalled();
    });
});
