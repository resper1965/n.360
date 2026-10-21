// Aba Controle de GAPs (pacote D, tarefa D2). api() REAL e delegação REAL; o fetch é dublado com o corpo de contracts/ropa-abas/gap.json
// (GET /gaps) e das rotas de escrita da spec 8.1 (POST/PUT/DELETE /gaps, PUT /gaps/nao-aplicavel, POST /gaps/:id/anexos). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';
import contrato from '../../contracts/ropa-abas/gap.json';
import fonteDaAba from '../src/atividade/aba-gaps.js?raw';

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montar } from '../src/atividade/aba-gaps.js';

initDelegation();

const P = '/api/v1/projects/p9/ropa/r1';
const PARTES = [{ id: 'pt-1', nome: 'Responsável exemplo', status: 'ativa', tipo: 'pessoa' }, { id: 'pt-2', nome: 'Empresa exemplo', status: 'ativa', tipo: 'organizacao' }];
const el = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');
const digitar = (id, v) => { const c = el(id); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (id, v) => { const c = el(id); c.value = v; c.dispatchEvent(new Event('change', { bubbles: true })); };
const arquivo = (nome, bytes = 1024) => new File([new Uint8Array(bytes)], nome);
function anexar(...arqs) {
    const input = el('at-gap-arquivo');
    Object.defineProperty(input, 'files', { value: arqs, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function servidor(inicial, { falharAnexo = null } = {}) {
    const atual = clone(inicial);
    const reqs = [];
    const f = vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        reqs.push({ k, corpo: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
        if (k === `GET ${P}/gaps`) return resposta(atual);
        if (k === '/api/v1/projects/p9/partes' || k === 'GET /api/v1/projects/p9/partes') return resposta(PARTES);
        if (k === `POST ${P}/gaps`) {
            const c = JSON.parse(opts.body);
            atual.gaps.push({ id: 'g2', gap: c.gap, recomendacao: c.recomendacao, plano_acao: c.plano_acao, responsavel: { id: c.responsavel_parte_id, nome: 'Responsável exemplo' }, prazo: c.prazo, status: c.status, anexos: [] });
            return resposta({ ok: true, id: 'g2' }, 201);
        }
        if (k === `PUT ${P}/gaps/g1`) { const c = JSON.parse(opts.body); Object.assign(atual.gaps[0], { gap: c.gap, status: c.status }); return resposta({ ok: true }); }
        if (k === `DELETE ${P}/gaps/g1`) { atual.gaps = []; return resposta({ ok: true }); }
        if (k === `PUT ${P}/gaps/nao-aplicavel`) { atual.nao_aplicavel = JSON.parse(opts.body).valor; return resposta({ ok: true }); }
        if (k === `POST ${P}/gaps/g2/anexos` || k === `POST ${P}/gaps/g1/anexos`) {
            const nome = opts.body.get('file').name;
            if (falharAnexo && nome === falharAnexo) return resposta({ error: 'Envie um arquivo PDF ou DOC (máx. 5MB) válido' }, 400);
            return resposta({ ok: true, id: 'an9' }, 201);
        }
        if (k === `DELETE ${P}/gaps/g1/anexos/an1`) return resposta({ ok: true });
        return resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return { f, reqs, estado: () => atual };
}
async function abrir(inicial = contrato, { editavel = true, ...o } = {}) {
    const srv = servidor(inicial, o);
    const recarregarFicha = vi.fn(async () => {});
    const aba = await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha });
    return { ...srv, painel: el('painel'), aba, recarregarFicha };
}
const vazio = () => ({ ok: true, gaps: [], nao_aplicavel: false });
const escritas = (reqs) => reqs.filter((r) => !r.k.startsWith('GET'));

beforeEach(() => {
    document.body.innerHTML = '<div id="painel"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aba Controle de GAPs', () => {
    it('lista "Gap / Responsável / Status" com status em português, anexos contados e Não Aplicável desabilitado quando há gaps', async () => {
        const { painel } = await abrir();
        const li = painel.querySelector('[data-gap="g1"]');
        expect(li.textContent).toContain('Gap: Ausência de exclusão dos dados após a finalidade (exemplo)');
        expect(li.textContent).toContain('Responsável: Responsável exemplo');
        expect(li.textContent).toContain('Status: Aberto');
        expect(li.textContent).toContain('1 anexo');
        expect(el('at-gap-na').disabled).toBe(true);
        expect(painel.textContent).toContain('Há gaps registrados');
        expect(painel.querySelector('.btn-primary')).toBeNull();
    });

    it('estado vazio explica o que é um gap; Não Aplicável desabilita o + Gaps e o vazio muda de texto', async () => {
        const { painel, reqs } = await abrir(vazio());
        expect(painel.textContent).toContain('Nenhum gap registrado.');
        expect(painel.textContent).toContain('lacuna entre o que a atividade faz e o que a lei ou a norma pede');
        const na = el('at-gap-na');
        expect(na.disabled).toBe(false);
        na.checked = true; na.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => reqs.some((r) => r.k === `PUT ${P}/gaps/nao-aplicavel`));
        expect(reqs.find((r) => r.k === `PUT ${P}/gaps/nao-aplicavel`).corpo).toEqual({ valor: true });
        await esperar(() => painel.textContent.includes('Atividade marcada como sem gaps.'));
        const mais = [...painel.querySelectorAll('button')].filter((b) => b.textContent === '+ Gaps');
        expect(mais.length).toBeGreaterThan(0);
        expect(mais.every((b) => b.disabled)).toBe(true);
    });

    it('Não Aplicável recusado pelo servidor (409) desfaz a caixa e mostra a mensagem do servidor', async () => {
        const srv = await abrir(vazio());
        srv.f.mockImplementation(async (url, opts = {}) => {
            const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
            if (k === `PUT ${P}/gaps/nao-aplicavel`) return resposta({ error: 'Há gaps registrados: apague-os antes de marcar Não Aplicável' }, 409);
            return resposta({ error: 'x' }, 404);
        });
        const na = el('at-gap-na');
        na.checked = true; na.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => na.checked === false);
        expect(na.checked).toBe(false);
        await esperar(() => document.body.textContent.includes('apague-os'));
        expect(document.body.textContent).toContain('apague-os antes de marcar Não Aplicável');
    });

    it('"+ Gaps" abre o modal com três sub-abas (Gap, Plano de Ação, Anexo); setas movem entre elas; o único primário é o Confirmar', async () => {
        const { painel } = await abrir(vazio());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        const modal = el('modal-content');
        expect(modal.querySelector('h2').textContent).toBe('Controle de GAPs');
        const abas = [...modal.querySelectorAll('[role="tablist"] [role="tab"]')];
        expect(abas.map((a) => a.textContent)).toEqual(['Gap', 'Plano de Ação', 'Anexo']);
        expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
        expect(abas.map((a) => a.tabIndex)).toEqual([0, -1, -1]);
        expect(el('at-gap-p-plano').hidden).toBe(true);
        abas[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(document.activeElement).toBe(abas[1]);
        expect(el('at-gap-p-plano').hidden).toBe(false);
        abas[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        expect(el('at-gap-p-anexo').hidden).toBe(false);
        abas[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(abas[0].getAttribute('aria-selected')).toBe('true'); // da última volta à primeira
        abas[1].click();
        expect(el('at-gap-p-plano').hidden).toBe(false);
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
        expect(document.querySelector('.btn-primary').textContent).toBe('Confirmar');
        expect(modal.querySelector('input[type="file"]').getAttribute('accept')).toBe('.pdf,.doc,.docx');
        expect(modal.textContent).toContain('PDF ou DOC (máx. 5MB)');
    });

    it('Confirmar só habilita com GAP e Responsável; Status nasce Aberto; só pessoas no seletor; obrigatórios escritos no rótulo', async () => {
        const { painel } = await abrir(vazio());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        const botao = el('at-gap-confirmar');
        expect(botao.disabled).toBe(true);
        expect(el('at-gap-status').value).toBe('Open');
        expect([...el('at-gap-status').options].map((o) => o.textContent)).toEqual(['Aberto', 'Em andamento', 'Concluído']);
        expect([...el('at-gap-resp').options].map((o) => o.textContent)).toEqual(['Selecione uma pessoa', 'Responsável exemplo']);
        for (const id of ['at-gap-gap', 'at-gap-resp', 'at-gap-status']) {
            expect(document.querySelector(`label[for="${id}"]`).textContent).toContain('obrigatório');
            expect(el(id).getAttribute('aria-required')).toBe('true');
        }
        digitar('at-gap-gap', 'Login genérico (exemplo)');
        expect(botao.disabled).toBe(true);
        escolher('at-gap-resp', 'pt-1');
        expect(botao.disabled).toBe(false);
        digitar('at-gap-gap', '   ');
        expect(botao.disabled).toBe(true);
    });

    it('Confirmar grava o gap (POST) com os campos das três sub-abas, fecha o modal e atualiza a lista e a ficha', async () => {
        const { painel, reqs, recarregarFicha } = await abrir(vazio());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        digitar('at-gap-gap', 'Login genérico (exemplo)');
        digitar('at-gap-rec', 'Usar login pessoal.');
        digitar('at-gap-plano', 'Criar contas individuais.');
        escolher('at-gap-resp', 'pt-1');
        digitar('at-gap-prazo', '2026-12-01');
        escolher('at-gap-status', 'In Progress');
        el('at-gap-confirmar').click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0]).toEqual({ k: `POST ${P}/gaps`, corpo: { gap: 'Login genérico (exemplo)', recomendacao: 'Usar login pessoal.', plano_acao: 'Criar contas individuais.', responsavel_parte_id: 'pt-1', prazo: '2026-12-01', status: 'In Progress' } });
        await esperar(() => !el('modal-overlay').classList.contains('open'));
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
        expect(painel.querySelector('[data-gap="g2"]').textContent).toContain('Status: Em andamento');
        expect(recarregarFicha).toHaveBeenCalled();
    });

    it('editar abre o mesmo modal preenchido e grava por PUT; campos opcionais vazios vão como nulos', async () => {
        const { painel, reqs } = await abrir();
        painel.querySelector('[data-gap="g1"] button[aria-label^="Editar"]').click();
        expect(el('at-gap-gap').value).toBe('Ausência de exclusão dos dados após a finalidade (exemplo)');
        expect(el('at-gap-resp').value).toBe('pt-1');
        expect(el('at-gap-prazo').value).toBe('2026-12-01');
        expect(el('at-gap-status').value).toBe('Open');
        expect(el('at-gap-confirmar').disabled).toBe(false);
        expect(el('at-gap-anexos').textContent).toContain('plano.pdf');
        escolher('at-gap-status', 'Closed');
        el('at-gap-confirmar').click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0].k).toBe(`PUT ${P}/gaps/g1`);
        expect(escritas(reqs)[0].corpo).toMatchObject({ status: 'Closed', recomendacao: null, plano_acao: null });
    });

    it('anexo: recusa antes de enviar o que passa de 5 MB e o tipo errado; o aceito só sobe depois de o gap existir', async () => {
        const { painel, reqs } = await abrir(vazio());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        digitar('at-gap-gap', 'Gap (exemplo)'); escolher('at-gap-resp', 'pt-1');
        anexar(arquivo('grande.pdf', 5 * 1024 * 1024 + 1));
        expect(el('at-gap-anexo-erro').textContent).toContain('O arquivo passa de 5 MB');
        anexar(arquivo('planilha.xlsx'));
        expect(el('at-gap-anexo-erro').textContent).toContain('PDF ou DOC');
        expect(el('at-gap-anexos').textContent).not.toContain('grande.pdf');
        anexar(arquivo('plano.pdf'));
        expect(el('at-gap-anexo-erro').textContent).toBe('');
        expect(el('at-gap-anexos').textContent).toContain('plano.pdf');
        expect(escritas(reqs)).toHaveLength(0); // nada enviado antes do Confirmar
        el('at-gap-confirmar').click();
        await esperar(() => escritas(reqs).length === 2);
        expect(escritas(reqs).map((r) => r.k)).toEqual([`POST ${P}/gaps`, `POST ${P}/gaps/g2/anexos`]);
        await esperar(() => !el('modal-overlay').classList.contains('open'));
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
    });

    it('anexo recusado pelo servidor: o gap fica salvo, o modal fica na aba Anexo com o motivo de cada arquivo', async () => {
        const { painel, reqs } = await abrir(vazio(), { falharAnexo: 'falso.pdf' });
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        digitar('at-gap-gap', 'Gap (exemplo)'); escolher('at-gap-resp', 'pt-1');
        anexar(arquivo('plano.pdf'), arquivo('falso.pdf'));
        el('at-gap-confirmar').click();
        await esperar(() => escritas(reqs).length === 3 && el('at-gap-erro').textContent !== '');
        expect(el('modal-overlay').classList.contains('open')).toBe(true);
        expect(el('at-gap-erro').textContent).toContain('O gap foi salvo, mas um arquivo não foi enviado');
        expect(el('at-gap-p-anexo').hidden).toBe(false);
        const linha = el('at-gap-anexos').querySelector('[data-novo]');
        expect(linha.textContent).toContain('falso.pdf');
        expect(linha.textContent).toContain('Envie um arquivo PDF ou DOC');
        expect(el('at-gap-anexos').textContent).not.toContain('plano.pdf (1 KB) Será');
        expect(painel.querySelector('[data-gap="g2"]')).not.toBeNull();
    });

    it('Limpar esvazia (com confirmação se há texto)', async () => {
        const { painel } = await abrir(vazio());
        [...painel.querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        digitar('at-gap-gap', 'Gap (exemplo)'); escolher('at-gap-resp', 'pt-1');
        document.querySelector('[data-action="atGapLimpar"]').click();
        await esperar(() => !!sim());
        sim().click();
        await esperar(() => el('at-gap-gap').value === '');
        expect(el('at-gap-gap').value).toBe('');
        expect(el('at-gap-resp').value).toBe('');
        expect(el('at-gap-confirmar').disabled).toBe(true);
        // sem texto, não pergunta
        document.querySelector('[data-action="atGapLimpar"]').click();
        await tudo();
        expect(sim()).toBeNull();
    });

    it('remover gap e remover anexo pedem confirmação', async () => {
        const { painel, reqs } = await abrir();
        painel.querySelector('[data-gap="g1"] button[aria-label^="Remover"]').click();
        await esperar(() => !!sim());
        sim().click();
        await esperar(() => reqs.some((r) => r.k === `DELETE ${P}/gaps/g1`));
        await esperar(() => painel.textContent.includes('Nenhum gap registrado.'));
        expect(painel.textContent).toContain('Nenhum gap registrado.');
    });

    it('remover anexo salvo no modal de edição', async () => {
        const { painel, reqs } = await abrir();
        painel.querySelector('[data-gap="g1"] button[aria-label^="Editar"]').click();
        document.querySelector('[data-anexo="an1"] button[aria-label^="Remover"]').click();
        await esperar(() => !!sim());
        sim().click();
        await esperar(() => reqs.some((r) => r.k === `DELETE ${P}/gaps/g1/anexos/an1`));
        expect(reqs.some((r) => r.k === `DELETE ${P}/gaps/g1/anexos/an1`)).toBe(true);
    });

    it('sem pessoas cadastradas o seletor explica onde cadastrar; somente leitura não tem botões nem caixas', async () => {
        const srv = servidor(vazio());
        srv.f.mockImplementation(async (url, opts = {}) => {
            const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
            if (k === `GET ${P}/gaps`) return resposta(vazio());
            if (k === 'GET /api/v1/projects/p9/partes') return resposta([]);
            return resposta({ error: 'x' }, 404);
        });
        await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel: true });
        [...el('painel').querySelectorAll('button')].find((b) => b.textContent === '+ Gaps').click();
        expect(el('modal-content').textContent).toContain('Nenhuma pessoa cadastrada ainda');
        document.getElementById('modal-overlay').classList.remove('open');
        const ro = await abrir(contrato, { editavel: false });
        expect(ro.painel.querySelectorAll('button')).toHaveLength(0);
        expect(ro.painel.querySelector('#at-gap-na')).toBeNull();
    });

    it('texto do servidor é escapado e o módulo não tem style= nem handler inline', async () => {
        const mau = clone(contrato);
        mau.gaps[0].gap = '<img src=x onerror=alert(1)>';
        const { painel } = await abrir(mau);
        expect(painel.querySelector('img')).toBeNull();
        expect(painel.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(fonteDaAba).not.toMatch(/style=/);
        expect(fonteDaAba).not.toMatch(/\son(click|change|input|submit)=/);
    });
});
