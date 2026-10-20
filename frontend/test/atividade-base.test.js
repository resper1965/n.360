// Aba Base Jurídica (pacote D, tarefa D1). api() REAL e delegação REAL; só o fetch é dublado, com o corpo de
// contracts/ropa-abas/base-juridica.json e do catálogo de requisitos (GET /api/v1/requisitos?fonte=lgpd). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';
import contrato from '../../contracts/ropa-abas/base-juridica.json';
import fonteGdprBackend from '../../src/data/ropa-abas/gdpr.ts?raw';
import fonteDaAba from '../src/atividade/aba-base.js?raw';

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montar, BASES_GDPR } from '../src/atividade/aba-base.js';

initDelegation();

const P = '/api/v1/projects/p9/ropa/r1';
const CATALOGO = [
    { id: 'lgpd:art7:i', fonte_id: 'lgpd', referencia: 'LGPD art. 7º, I', titulo: 'Consentimento pelo titular', pai_id: 'lgpd:art7' },
    { id: 'lgpd:art7:ii', fonte_id: 'lgpd', referencia: 'LGPD art. 7º, II', titulo: 'Cumprimento de obrigação legal ou regulatória', pai_id: 'lgpd:art7' },
    { id: 'lgpd:art7:v', fonte_id: 'lgpd', referencia: 'LGPD art. 7º, V', titulo: 'Execução de contrato', pai_id: 'lgpd:art7' },
    { id: 'lgpd:art11:i', fonte_id: 'lgpd', referencia: 'LGPD art. 11, I', titulo: 'Consentimento específico e destacado', pai_id: 'lgpd:art11' },
    { id: 'lgpd:art11:ii-f', fonte_id: 'lgpd', referencia: 'LGPD art. 11, II, f', titulo: 'Tutela da saúde', pai_id: 'lgpd:art11' },
];
const el = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const SEM_PENDENCIA = () => { const d = clone(contrato); d.lgpd[1].finalidade = 'Executar o contrato (exemplo).'; d.lgpd[1].finalidade_pendente = false; return d; };

/** Fetch dublado com estado: o PUT altera o que o GET devolve, como o servidor. */
function servidor(inicial, extra = {}) {
    let atual = clone(inicial);
    const puts = [];
    const f = vi.fn(async (url, opts = {}) => {
        const caminho = new URL(url, 'http://localhost').pathname + (new URL(url, 'http://localhost').search || '');
        const k = `${opts.method || 'GET'} ${caminho}`;
        if (k === `GET ${P}/base-juridica`) return resposta(atual);
        if (k === 'GET /api/v1/requisitos?fonte=lgpd') return resposta(CATALOGO);
        if (k === `PUT ${P}/base-juridica`) {
            const corpo = JSON.parse(opts.body);
            puts.push(corpo);
            if ('previsao_legal' in corpo) atual.previsao_legal = corpo.previsao_legal;
            if (corpo.lgpd) atual.lgpd = corpo.lgpd.map((x, i) => ({ ...x, referencia: x.requisito_id, titulo: x.requisito_id, principal: i === 0, finalidade_pendente: false }));
            if (corpo.art11) atual.art11 = { nao_aplicavel: corpo.art11.nao_aplicavel, incisos: corpo.art11.incisos.map((x) => ({ ...x, referencia: x.requisito_id, titulo: x.requisito_id, principal: false, finalidade_pendente: false })) };
            if (corpo.gdpr) atual.gdpr = corpo.gdpr.map((g) => ({ ...g, rotulo: BASES_GDPR.find((b) => b[0] === g.base)[1] }));
            return resposta({ ok: true, mudou_hash: false });
        }
        if (k in extra) return resposta(extra[k]);
        return resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return { f, puts, estado: () => atual };
}

async function abrir(inicial = contrato, { editavel = true, extra = {} } = {}) {
    const srv = servidor(inicial, extra);
    const recarregarFicha = vi.fn(async () => {});
    const painel = el('painel');
    const aba = await montar(painel, { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha });
    return { ...srv, painel, aba, recarregarFicha };
}
const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');

beforeEach(() => {
    document.body.innerHTML = '<div id="painel"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aba Base Jurídica', () => {
    it('blocos na ordem do legado, com referência, Principal, finalidade pendente e Não Aplicável', async () => {
        const { painel } = await abrir();
        expect([...painel.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Previsão Legal', 'Base Legal (Dados Pessoais)', 'Base Legal (Dados Sensíveis)', 'Base Legal GDPR']);
        expect(el('at-base-previsao').value).toBe('Consolidação das Leis do Trabalho (exemplo)');
        const itens = [...painel.querySelectorAll('[data-requisito]')];
        expect(itens).toHaveLength(2);
        expect(itens[0].textContent).toContain('LGPD art. 7º, II');
        expect(itens[0].textContent).toContain('Principal');
        expect(itens[0].textContent).toContain('Finalidade: Cumprir a obrigação de registro (exemplo).');
        expect(itens[1].textContent).toContain('Falta a finalidade');
        expect(itens[1].textContent).not.toContain('Principal');
        expect([...itens[1].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Preencher', 'Remover']);
        // art. 11 Não Aplicável: marcada e o + Adicionar Inciso desse bloco desabilitado
        expect(el('at-base-art11-na').checked).toBe(true);
        const botoes = [...painel.querySelectorAll('button')].filter((b) => b.textContent === '+ Adicionar Inciso');
        expect(botoes.map((b) => b.disabled)).toEqual([false, true, false]);
        // GDPR gravado
        expect(painel.querySelector('[data-gdpr="contrato"]').textContent).toContain('Executar o contrato (exemplo).');
        // nenhum primário na aba
        expect(painel.querySelector('.btn-primary')).toBeNull();
    });

    it('estados vazios explicam o que é cada bloco e o texto anterior só aparece como leitura', async () => {
        const vazio = { ok: true, previsao_legal: null, lgpd: [], art11: { nao_aplicavel: false, incisos: [] }, gdpr: [], lia_exigida: false, base_gdpr_texto_anterior: 'Legitimate interest (texto antigo)', legal_basis_texto: 'Execução de contrato' };
        const { painel } = await abrir(vazio);
        expect(painel.textContent).toContain('Nenhum inciso registrado.');
        expect(painel.textContent).toContain('hipótese do art. 7º da LGPD');
        expect(painel.textContent).toContain('Nenhuma base do GDPR registrada.');
        expect(painel.textContent).toContain('Texto anterior: Legitimate interest (texto antigo)');
        expect(painel.textContent).toContain('Texto anterior: Execução de contrato');
    });

    it('previsão legal grava com autosave (800 ms, uma rajada, um PUT) e mostra "Salvo às"', async () => {
        const { puts, painel } = await abrir();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const campo = el('at-base-previsao');
        campo.value = 'CLT'; campo.dispatchEvent(new Event('input', { bubbles: true }));
        campo.value = 'CLT art. 477'; campo.dispatchEvent(new Event('input', { bubbles: true }));
        expect(puts).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(800);
        vi.useRealTimers();
        await esperar(() => puts.length === 1);
        expect(puts).toEqual([{ previsao_legal: 'CLT art. 477' }]);
        await esperar(() => /Salvo às \d{2}:\d{2}/.test(painel.textContent));
        expect(el('at-base-salvo').getAttribute('role')).toBe('status');
        expect(el('at-base-salvo').textContent).toMatch(/Salvo às \d{2}:\d{2}/);
    });

    it('modal Base Legal: incisos do art. 7º, já usado travado com texto, Finalidade obrigatória, Gravar só com o mínimo', async () => {
        const { painel, puts, recarregarFicha } = await abrir(SEM_PENDENCIA());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Adicionar Inciso').click();
        const modal = el('modal-content');
        expect(modal.querySelector('h2').textContent).toBe('Base Legal');
        const caixas = [...modal.querySelectorAll('input[type="checkbox"]')];
        expect(caixas.map((c) => c.value)).toEqual(['lgpd:art7:i', 'lgpd:art7:ii', 'lgpd:art7:v']); // art. 11 não entra aqui
        const usada = caixas.find((c) => c.value === 'lgpd:art7:ii');
        expect(usada.checked && usada.disabled && usada.getAttribute('aria-disabled') === 'true').toBe(true);
        expect(usada.closest('label').textContent).toContain('já usado');
        const gravar = el('at-base-gravar');
        expect(gravar.disabled).toBe(true);
        expect(gravar.classList.contains('btn-primary')).toBe(true);
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
        // marcar abre a Finalidade, obrigatória e nomeada
        const nova = caixas.find((c) => c.value === 'lgpd:art7:i');
        nova.checked = true; nova.dispatchEvent(new Event('change', { bubbles: true }));
        const fin = modal.querySelector('textarea');
        expect(fin.required).toBe(true);
        expect(modal.querySelector(`label[for="${fin.id}"]`).textContent).toContain('obrigatório');
        expect(gravar.disabled).toBe(true); // base marcada, finalidade vazia
        fin.value = 'Obter o consentimento (exemplo).'; fin.dispatchEvent(new Event('input', { bubbles: true }));
        expect(gravar.disabled).toBe(false);
        // desmarcar volta a desabilitar
        nova.checked = false; nova.dispatchEvent(new Event('change', { bubbles: true }));
        expect(gravar.disabled).toBe(true);
        nova.checked = true; nova.dispatchEvent(new Event('change', { bubbles: true }));
        const fin2 = modal.querySelector('textarea');
        fin2.value = 'Obter o consentimento (exemplo).'; fin2.dispatchEvent(new Event('input', { bubbles: true }));
        gravar.click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ lgpd: [
            { requisito_id: 'lgpd:art7:ii', finalidade: 'Cumprir a obrigação de registro (exemplo).' },
            { requisito_id: 'lgpd:art7:v', finalidade: 'Executar o contrato (exemplo).' },
            { requisito_id: 'lgpd:art7:i', finalidade: 'Obter o consentimento (exemplo).' }] });
        await esperar(() => !el('modal-overlay').classList.contains('open') && recarregarFicha.mock.calls.length > 0);
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
        expect(recarregarFicha).toHaveBeenCalled();
    });

    it('com finalidade pendente de outro inciso, o modal avisa e não deixa gravar (o servidor recusaria a lista)', async () => {
        const { painel } = await abrir(); // art7:v está sem finalidade
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Adicionar Inciso').click();
        expect(el('modal-content').textContent).toContain('Antes de adicionar, preencha a finalidade de: LGPD art. 7º, V');
        const nova = [...el('modal-content').querySelectorAll('input[type="checkbox"]')].find((c) => c.value === 'lgpd:art7:i');
        nova.checked = true; nova.dispatchEvent(new Event('change', { bubbles: true }));
        const fin = el('modal-content').querySelector('textarea');
        fin.value = 'Obter o consentimento (exemplo).'; fin.dispatchEvent(new Event('input', { bubbles: true }));
        expect(el('at-base-gravar').disabled).toBe(true);
    });

    it('Preencher abre só a finalidade do inciso e grava a lista com ela', async () => {
        const { painel, puts } = await abrir();
        [...painel.querySelectorAll('[data-requisito="lgpd:art7:v"] button')].find((b) => b.textContent === 'Preencher').click();
        const fin = el('at-base-fin-unica');
        expect(fin.required).toBe(true);
        expect(document.activeElement).toBe(fin);
        fin.value = 'Executar o contrato (exemplo).'; fin.dispatchEvent(new Event('input', { bubbles: true }));
        el('at-base-gravar').click();
        await esperar(() => puts.length === 1);
        expect(puts[0].lgpd.map((x) => x.requisito_id)).toEqual(['lgpd:art7:ii', 'lgpd:art7:v']);
        expect(puts[0].lgpd[1].finalidade).toBe('Executar o contrato (exemplo).');
        await esperar(() => !painel.textContent.includes('Falta a finalidade'));
        expect(painel.textContent).not.toContain('Falta a finalidade');
    });

    it('art. 11: o modal lista só o art. 11; Não Aplicável com incisos pede confirmação e os remove; sem incisos desmarca', async () => {
        const com11 = SEM_PENDENCIA();
        com11.art11 = { nao_aplicavel: false, incisos: [{ requisito_id: 'lgpd:art11:i', referencia: 'LGPD art. 11, I', titulo: 'Consentimento específico e destacado', finalidade: 'Dado de saúde (exemplo).', principal: false, finalidade_pendente: false }] };
        const { painel, puts } = await abrir(com11);
        const add11 = [...painel.querySelectorAll('button')].filter((b) => b.textContent === '+ Adicionar Inciso')[1];
        add11.click();
        expect([...el('modal-content').querySelectorAll('input[type="checkbox"]')].map((c) => c.value)).toEqual(['lgpd:art11:i', 'lgpd:art11:ii-f']);
        el('modal-overlay').classList.remove('open');
        const na = el('at-base-art11-na');
        na.checked = true; na.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => !!sim());
        expect(document.querySelector('.confirmar-texto').textContent).toContain('1 incisos do art. 11');
        sim().click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ art11: { nao_aplicavel: true, incisos: [] } });
        await esperar(() => el('at-base-art11-na') && el('at-base-art11-na').checked);
        const botoes = [...painel.querySelectorAll('button')].filter((b) => b.textContent === '+ Adicionar Inciso');
        expect(botoes[1].disabled).toBe(true);
        // desmarcar: sem incisos, sem pergunta
        el('at-base-art11-na').checked = false; el('at-base-art11-na').dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => puts.length === 2);
        expect(puts[1]).toEqual({ art11: { nao_aplicavel: false, incisos: [] } });
    });

    it('Não Aplicável cancelado na pergunta não grava e a caixa volta', async () => {
        const com11 = SEM_PENDENCIA();
        com11.art11 = { nao_aplicavel: false, incisos: [{ requisito_id: 'lgpd:art11:i', referencia: 'a', titulo: 'b', finalidade: 'Dado de saúde (exemplo).', principal: false, finalidade_pendente: false }] };
        const { puts } = await abrir(com11);
        const na = el('at-base-art11-na');
        na.checked = true; na.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => !!document.querySelector('.confirmar [data-confirmar="nao"]'));
        document.querySelector('.confirmar [data-confirmar="nao"]').click();
        await tudo();
        expect(puts).toHaveLength(0);
        expect(na.checked).toBe(false);
    });

    it('GDPR: as seis bases com rótulo e texto, usada travada, Confirmar só com marca e finalidade', async () => {
        const { painel, puts } = await abrir(SEM_PENDENCIA());
        [...painel.querySelectorAll('button')].filter((b) => b.textContent === '+ Adicionar Inciso')[2].click();
        const modal = el('modal-content');
        expect(modal.querySelector('h2').textContent).toBe('Base Legal GDPR');
        const caixas = [...modal.querySelectorAll('input[type="checkbox"]')];
        expect(caixas.map((c) => c.value)).toEqual(['consentimento', 'contrato', 'interesses_legitimos', 'interesses_vitais', 'obrigacao_legal', 'tarefa_publica']);
        expect(caixas.find((c) => c.value === 'contrato').disabled).toBe(true);
        expect(modal.textContent).toContain('Uma razão genuína e legítima');
        const botao = el('at-base-gravar');
        expect(botao.textContent).toBe('Confirmar');
        expect(botao.disabled).toBe(true);
        const c = caixas.find((x) => x.value === 'obrigacao_legal');
        c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
        expect(botao.disabled).toBe(true);
        const fin = modal.querySelector('textarea');
        fin.value = 'Cumprir a lei (exemplo).'; fin.dispatchEvent(new Event('input', { bubbles: true }));
        expect(botao.disabled).toBe(false);
        botao.click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ gdpr: [{ base: 'contrato', finalidade: 'Executar o contrato (exemplo).' }, { base: 'obrigacao_legal', finalidade: 'Cumprir a lei (exemplo).' }] });
    });

    it('remover pede confirmação e manda a lista sem o inciso', async () => {
        const { painel, puts } = await abrir(SEM_PENDENCIA());
        painel.querySelector('[data-requisito="lgpd:art7:v"] button[aria-label^="Remover"]').click();
        await esperar(() => !!sim());
        sim().click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: 'Cumprir a obrigação de registro (exemplo).' }] });
    });

    it('LIA gravada mostra "Baixar Word" com o projeto e a atividade', async () => {
        const li = { ...SEM_PENDENCIA(), lia_exigida: true };
        const { painel } = await abrir(li, { extra: { [`GET ${P}/lia`]: { lia: { status: 'rascunho', finalidade_legitima: 'x' } } } });
        const b = painel.querySelector('[data-action="baixarWordLia"]');
        expect(b).not.toBeNull();
        expect(b.textContent).toBe('Baixar Word');
        expect(JSON.parse(b.dataset.args)).toEqual(['p9', 'r1']);
    });
    it('sem LIA gravada não há botão de Word', async () => {
        const { painel } = await abrir({ ...SEM_PENDENCIA(), lia_exigida: true }, { extra: { [`GET ${P}/lia`]: { lia: null } } });
        expect(painel.querySelector('[data-action="baixarWordLia"]')).toBeNull();
    });
    it('LIA aparece no fim quando exigida, sem botão primário', async () => {
        const li = { ...SEM_PENDENCIA(), lia_exigida: true };
        const { painel } = await abrir(li, { extra: { [`GET ${P}/lia`]: { lia: null } } });
        expect(painel.querySelector('#tl-lia')).not.toBeNull();
        expect(painel.querySelector('.btn-primary')).toBeNull();
        const h3 = [...painel.querySelectorAll('h3')].pop();
        expect(h3.textContent).toContain('LIA');
    });

    it('somente leitura (atividade cancelada ou papel sem edição): nada a editar', async () => {
        const { painel } = await abrir(contrato, { editavel: false });
        expect(el('at-base-previsao').disabled).toBe(true);
        expect(el('at-base-art11-na').disabled).toBe(true);
        expect([...painel.querySelectorAll('button')]).toHaveLength(0);
    });

    it('esvaziar() devolve a promessa para a casca gravar o pendente antes de trocar de aba', async () => {
        const { aba } = await abrir();
        await expect(aba.esvaziar()).resolves.toBeUndefined();
    });

    it('texto do servidor é escapado e o módulo não tem style= nem handler inline', async () => {
        const mau = SEM_PENDENCIA();
        mau.lgpd[0].finalidade = '<img src=x onerror=alert(1)>';
        const { painel } = await abrir(mau);
        expect(painel.querySelector('img')).toBeNull();
        expect(painel.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(fonteDaAba).not.toMatch(/style=/);
        expect(fonteDaAba).not.toMatch(/\son(click|change|input)=/);
    });

    it('as seis bases do GDPR da aba são as do backend (src/data/ropa-abas/gdpr.ts)', () => {
        const doBackend = [...fonteGdprBackend.matchAll(/^\s*(\w+): \{ rotulo: '([^']+)', texto: '([^']+)' \}/gm)].map((m) => [m[1], m[2], m[3]]);
        expect(doBackend).toHaveLength(6);
        expect(BASES_GDPR).toEqual(doBackend);
    });
});
