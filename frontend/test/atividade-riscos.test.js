// Aba Riscos (pacote D, tarefa D4). api() REAL e delegação REAL; o fetch é dublado com o corpo de GET /riscos (src/services/riscos-atividade.ts,
// com idr e treatment_due_date da tarefa S4) e de GET /riscos/motivos (pares { nome, descricao_padrao } já usados no projeto). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';
import escalasBackend from '../../src/data/ropa-abas/escalas.ts?raw';
import fonteDaAba from '../src/atividade/aba-riscos.js?raw';

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montar, PROBABILIDADE, IMPACTO, NIVEL_ROTULO, ESTRATEGIA_ROTULO } from '../src/atividade/aba-riscos.js';

initDelegation();

const P = '/api/v1/projects/p9/ropa/r1';
const risco = (extra = {}) => ({ id: 'k1', idr: 1, threat: 'Acesso não autorizado (exemplo)', vulnerability: 'Descrição do risco (exemplo).', impact: 3, probability: 3, risk_level: 'Medium',
    treatment: 'Mitigate', treatment_due_date: null, residual_impact: null, residual_probability: null, residual_level: null, status: 'Open', ...extra });
const MOTIVOS = [{ nome: 'Acesso não autorizado (exemplo)', descricao_padrao: 'Não há garantia de que o acesso é limitado (exemplo).' }, { nome: 'Retenção prolongada (exemplo)', descricao_padrao: 'Dados guardados além do necessário (exemplo).' }];
const PARTES = [{ id: 'pa1', tipo: 'pessoa', nome: 'Pessoa Exemplo', status: 'ativa' }, { id: 'o1', tipo: 'organizacao', nome: 'Empresa Exemplo', status: 'ativa' }];
const el = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }
const sim = () => document.querySelector('.confirmar [data-confirmar="sim"]');
const digitar = (id, v) => { const c = el(id); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); };
const escolher = (id, v) => { const c = el(id); c.value = v; c.dispatchEvent(new Event('change', { bubbles: true })); };

function servidor(inicial, motivos = MOTIVOS) {
    const atual = clone(inicial);
    const reqs = [];
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        const corpo = opts.body ? JSON.parse(opts.body) : undefined;
        reqs.push({ k, corpo });
        if (k === `GET ${P}/riscos`) return resposta({ riscos: atual });
        if (k === `GET ${P}/riscos/motivos`) return resposta({ motivos });
        if (k === 'GET /api/v1/projects/p9/partes') return resposta(PARTES);
        if (k === `POST ${P}/riscos`) { atual.push(risco({ id: `k${atual.length + 1}`, idr: atual.length + 1, threat: corpo.threat, vulnerability: corpo.vulnerability, impact: corpo.impact, probability: corpo.probability })); return resposta({ ok: true, id: 'novo', risk_level: 'Medium' }, 201); }
        if (k.startsWith(`PUT ${P}/riscos/`)) { const r = atual.find((x) => k.endsWith(`/${x.id}`)); Object.assign(r, corpo); if (corpo.residual_impact && corpo.residual_probability) r.residual_level = 'Low'; return resposta({ ok: true }); }
        if (k.startsWith(`DELETE ${P}/riscos/`)) { atual.splice(atual.findIndex((x) => k.endsWith(`/${x.id}`)), 1); return resposta({ ok: true }); }
        return resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return { f, reqs, estado: () => atual };
}
async function abrir(inicial = [risco(), risco({ id: 'k2', idr: 2, threat: 'Ausência de rastreabilidade (exemplo)', risk_level: 'High', impact: 4, probability: 4 })], { editavel = true, motivos } = {}) {
    const srv = servidor(inicial, motivos);
    const recarregarFicha = vi.fn(async () => {});
    const aba = await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha });
    return { ...srv, painel: el('painel'), aba, recarregarFicha };
}
const escritas = (reqs) => reqs.filter((r) => !r.k.startsWith('GET'));
const botao = (rotulo) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === rotulo);

beforeEach(() => {
    document.body.innerHTML = '<div id="painel"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aba Riscos', () => {
    it('tabela IDR, Motivo, Risco, Estratégia, Risco residual, Prazo, Ações; IDR com dois dígitos e nível em texto', async () => {
        const { painel } = await abrir();
        expect([...painel.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['IDR', 'Motivo', 'Risco', 'Estratégia', 'Risco residual', 'Prazo', 'Ações']);
        const linhas = [...painel.querySelectorAll('tbody tr')];
        expect(linhas).toHaveLength(2);
        const c1 = [...linhas[0].querySelectorAll('td')].map((t) => t.textContent.trim());
        expect(c1.slice(0, 3)).toEqual(['01', 'Acesso não autorizado (exemplo)', 'Médio']);
        expect(linhas[1].querySelectorAll('td')[2].textContent.trim()).toBe('Alto');
        expect(linhas[0].querySelector('.badge').textContent).toBe('Médio'); // nível é texto, não só cor
        // risco ainda não tratado: estratégia, residual e prazo vazios, como no legado
        expect(c1.slice(3, 6)).toEqual(['—', '—', '—']);
        expect(painel.querySelector('.btn-primary')).toBeNull();
    });

    it('risco tratado mostra estratégia em português, residual em texto e prazo dd/mm/aaaa; ordena por IDR', async () => {
        const { painel } = await abrir([risco({ id: 'k2', idr: 2 }), risco({ treatment: 'Accept', residual_impact: 2, residual_probability: 2, residual_level: 'Low', treatment_due_date: '2026-12-01' })]);
        const linhas = [...painel.querySelectorAll('tbody tr')];
        expect(linhas[0].querySelector('td').textContent).toBe('01');
        const c = [...linhas[0].querySelectorAll('td')].map((t) => t.textContent.trim());
        expect(c.slice(3, 6)).toEqual(['Aceitar', 'Baixo', '01/12/2026']);
    });

    it('cada linha tem UMA ação à vista, "Tratar", e Editar e Excluir (perigo, por último) no menu Mais ações', async () => {
        const { painel } = await abrir();
        const linha = painel.querySelector('tbody tr');
        const visiveis = [...linha.querySelectorAll(':scope > td:last-child .acoes-linha > button, :scope > td:last-child .mais-acoes-botao')].map((b) => b.textContent);
        expect(visiveis).toEqual(['Tratar', 'Mais ações']);
        const itens = [...linha.querySelectorAll('[role="menuitem"]')];
        expect(itens.map((i) => i.textContent)).toEqual(['Editar', 'Excluir']);
        expect(itens[1].classList.contains('perigo')).toBe(true);
        expect(linha.querySelector('.mais-acoes-botao').getAttribute('aria-label')).toBe('Mais ações: 01 Acesso não autorizado (exemplo)');
    });

    it('estado vazio explica o que é um risco e oferece "+ Registrar Risco"', async () => {
        const { painel } = await abrir([]);
        expect(painel.textContent).toContain('Nenhum risco registrado.');
        expect(painel.textContent).toContain('chance de algo dar errado com os dados desta atividade');
        expect(painel.querySelectorAll('button')).toHaveLength(1);
        expect(botao('+ Registrar Risco')).toBeTruthy();
    });

    it('"+ Registrar Risco" abre "Análise de Riscos": Risco "a calcular..." até as duas notas, Adicionar só com Motivo, Probabilidade e Impacto', async () => {
        await abrir([], { motivos: [] });
        botao('+ Registrar Risco').click();
        const modal = el('modal-content');
        expect(modal.querySelector('h2').textContent).toBe('Análise de Riscos');
        expect(el('at-rk-nivel').textContent).toBe('a calcular...');
        expect(el('at-rk-nivel').getAttribute('role')).toBe('status');
        expect(modal.textContent).toContain('Este projeto ainda não tem motivos de risco');
        expect(el('at-rk-gravar').textContent).toBe('Adicionar');
        expect(el('at-rk-gravar').disabled).toBe(true);
        expect(el('at-rk-restaurar').disabled).toBe(true);
        expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
        for (const id of ['at-rk-motivo', 'at-rk-prob', 'at-rk-imp']) {
            expect(document.querySelector(`label[for="${id}"]`).textContent).toContain('obrigatório');
            expect(el(id).getAttribute('aria-required')).toBe('true');
        }
        expect([...el('at-rk-prob').options].map((o) => o.textContent)).toEqual(['Selecione uma opção', ...PROBABILIDADE.map((p) => p[1])]);
        digitar('at-rk-motivo', 'Motivo novo (exemplo)');
        escolher('at-rk-prob', '4');
        expect(el('at-rk-nivel').textContent).toBe('a calcular...');
        expect(el('at-rk-gravar').disabled).toBe(true);
        escolher('at-rk-imp', '4');
        expect(el('at-rk-nivel').textContent).toBe('Alto'); // 4 x 4 = 16, a mesma faixa do servidor
        expect(el('at-rk-gravar').disabled).toBe(false);
        escolher('at-rk-prob', '1'); escolher('at-rk-imp', '2');
        expect(el('at-rk-nivel').textContent).toBe('Baixo');
        escolher('at-rk-prob', '5'); escolher('at-rk-imp', '5');
        expect(el('at-rk-nivel').textContent).toBe('Crítico');
    });

    it('motivo já usado preenche a descrição padrão; Restaurar volta a ela; descrição editada não é sobrescrita', async () => {
        await abrir([]);
        botao('+ Registrar Risco').click();
        const opcoes = [...el('at-rk-motivos').options].map((o) => o.value);
        expect(opcoes).toEqual(MOTIVOS.map((m) => m.nome));
        digitar('at-rk-motivo', 'Acesso não autorizado (exemplo)');
        expect(el('at-rk-desc').value).toBe('Não há garantia de que o acesso é limitado (exemplo).');
        expect(el('at-rk-restaurar').disabled).toBe(false);
        digitar('at-rk-desc', 'Texto que a pessoa escreveu.');
        digitar('at-rk-motivo', 'Acesso não autorizado (exemplo)'); // mesmo motivo de novo: não sobrescreve
        expect(el('at-rk-desc').value).toBe('Texto que a pessoa escreveu.');
        el('at-rk-restaurar').click();
        expect(el('at-rk-desc').value).toBe('Não há garantia de que o acesso é limitado (exemplo).');
        // motivo novo, sem padrão: Restaurar desabilitado
        digitar('at-rk-motivo', 'Outro motivo que não existe');
        expect(el('at-rk-restaurar').disabled).toBe(true);
    });

    it('Adicionar manda motivo, descrição, probabilidade e impacto; lista e ficha são atualizadas e o modal fecha', async () => {
        const { painel, reqs, recarregarFicha } = await abrir([]);
        botao('+ Registrar Risco').click();
        digitar('at-rk-motivo', 'Acesso não autorizado (exemplo)');
        escolher('at-rk-prob', '4'); escolher('at-rk-imp', '4');
        el('at-rk-gravar').click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0]).toEqual({ k: `POST ${P}/riscos`, corpo: { threat: 'Acesso não autorizado (exemplo)', vulnerability: 'Não há garantia de que o acesso é limitado (exemplo).', probability: 4, impact: 4 } });
        await esperar(() => painel.querySelector('tbody tr'));
        expect(painel.querySelector('tbody tr td').textContent).toBe('01');
        expect(el('modal-overlay').classList.contains('open')).toBe(false);
        expect(recarregarFicha).toHaveBeenCalled();
    });

    it('erro do servidor ao adicionar fica no modal, em texto, e o botão volta', async () => {
        const srv = await abrir([]);
        srv.f.mockImplementation(async (url, opts = {}) => {
            const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
            if (k === `POST ${P}/riscos`) return resposta({ error: 'Registro do RoPA não encontrado' }, 404);
            return resposta({ error: 'x' }, 404);
        });
        botao('+ Registrar Risco').click();
        digitar('at-rk-motivo', 'M'); escolher('at-rk-prob', '2'); escolher('at-rk-imp', '2');
        el('at-rk-gravar').click();
        await esperar(() => el('at-rk-erro').textContent !== '');
        expect(el('at-rk-erro').textContent).toBe('Registro do RoPA não encontrado');
        expect(el('at-rk-gravar').disabled).toBe(false);
        expect(el('modal-overlay').classList.contains('open')).toBe(true);
    });

    it('Editar abre a mesma análise preenchida com "Alterar" e grava por PUT', async () => {
        const { reqs } = await abrir();
        document.querySelector('tbody tr [role="menuitem"]').click(); // Editar do 01
        expect(el('at-rk-motivo').value).toBe('Acesso não autorizado (exemplo)');
        expect(el('at-rk-desc').value).toBe('Descrição do risco (exemplo).');
        expect(el('at-rk-prob').value).toBe('3');
        expect(el('at-rk-imp').value).toBe('3');
        expect(el('at-rk-nivel').textContent).toBe('Médio');
        expect(el('at-rk-gravar').textContent).toBe('Alterar');
        expect(el('at-rk-gravar').disabled).toBe(false);
        escolher('at-rk-prob', '5');
        el('at-rk-gravar').click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0].k).toBe(`PUT ${P}/riscos/k1`);
        expect(escritas(reqs)[0].corpo.probability).toBe(5);
    });

    it('Tratar Risco: abas Risco (só leitura), Tratamento (tudo obrigatório) e Risco residual (calculado, com Recalcular); grava por PUT', async () => {
        const { painel, reqs } = await abrir();
        botao('Tratar').click();
        const modal = el('modal-content');
        expect(modal.querySelector('h2').textContent).toBe('Tratar Risco 01');
        expect([...modal.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())).toEqual(['Risco', 'Tratamento', 'Risco residual']);
        // Risco: motivo, descrição, probabilidade e impacto, sem campo editável
        const risco = el('at-rk-p-risco');
        for (const t of ['Acesso não autorizado (exemplo)', 'Descrição do risco (exemplo).', 'Ocorrência possível', 'Impacto com efeitos moderados para titulares']) expect(risco.textContent).toContain(t);
        expect(risco.querySelector('input, select, textarea')).toBeNull();
        expect([...el('at-rk-estr').options].map((o) => o.textContent)).toEqual(['Selecione uma opção', 'Aceitar', 'Mitigar', 'Evitar', 'Transferir']);
        expect(el('at-rk-estr').value).toBe(''); // o padrão do servidor (Mitigar) não conta como escolha
        // só pessoas no Responsável
        expect([...el('at-rk-resp').options].map((o) => o.textContent)).toEqual(['Selecione uma pessoa', 'Pessoa Exemplo']);
        expect([...el('at-rk-status').options].map((o) => o.textContent)).toEqual(['Pendente', 'Concluído']);
        expect(el('at-rk-gravar').disabled).toBe(true);
        escolher('at-rk-estr', 'Mitigate');
        digitar('at-rk-plano', 'Revisar os acessos (exemplo)');
        escolher('at-rk-resp', 'pa1');
        expect(el('at-rk-gravar').disabled).toBe(true); // falta a data
        digitar('at-rk-prazo', '2026-12-01');
        expect(el('at-rk-gravar').disabled).toBe(false);
        expect(el('at-rk-residual').textContent).toBe('a calcular...');
        escolher('at-rk-rprob', '2');
        expect(el('at-rk-residual').textContent).toBe('a calcular...');
        el('at-rk-rimp').value = '2';
        botao('Recalcular').click();
        expect(el('at-rk-residual').textContent).toBe('Baixo');
        el('at-rk-gravar').click();
        await esperar(() => escritas(reqs).length === 1);
        // o status não muda (Pendente já era o do risco aberto): não vai no corpo
        expect(escritas(reqs)[0]).toEqual({ k: `PUT ${P}/riscos/k1`, corpo: { treatment: 'Mitigate', treatment_plan: 'Revisar os acessos (exemplo)', owner_parte_id: 'pa1',
            treatment_due_date: '2026-12-01', residual_probability: 2, residual_impact: 2 } });
        await esperar(() => painel.querySelector('tbody tr').textContent.includes('Mitigar'));
        const c = [...painel.querySelector('tbody tr').querySelectorAll('td')].map((t) => t.textContent.trim());
        expect(c.slice(3, 6)).toEqual(['Mitigar', 'Baixo', '01/12/2026']);
    });

    it('Tratar Risco: Concluído grava o status fechado do risco', async () => {
        const { reqs } = await abrir([risco({ treatment: 'Accept', treatment_plan: 'Aceito (exemplo)', owner_parte_id: 'pa1', treatment_due_date: '2026-11-01' })]);
        botao('Tratar').click();
        expect(el('at-rk-estr').value).toBe('Accept');
        expect(el('at-rk-plano').value).toBe('Aceito (exemplo)');
        expect(el('at-rk-resp').value).toBe('pa1');
        expect(el('at-rk-status').value).toBe('Open');
        escolher('at-rk-status', 'Closed');
        el('at-rk-gravar').click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0].corpo).toMatchObject({ status: 'Closed', treatment: 'Accept', owner_parte_id: 'pa1' });
    });

    it('Tratar com só uma das notas residuais é recusado na tela, em texto', async () => {
        const { reqs } = await abrir();
        botao('Tratar').click();
        escolher('at-rk-estr', 'Avoid'); digitar('at-rk-plano', 'Plano (exemplo)'); escolher('at-rk-resp', 'pa1'); digitar('at-rk-prazo', '2026-12-01');
        escolher('at-rk-rprob', '3');
        el('at-rk-gravar').click();
        await tudo();
        expect(el('at-rk-erro').textContent).toContain('probabilidade e o impacto residuais');
        expect(escritas(reqs)).toHaveLength(0);
    });

    it('Excluir pede confirmação e remove', async () => {
        const { painel, reqs } = await abrir();
        [...document.querySelectorAll('tbody tr')][0].querySelectorAll('[role="menuitem"]')[1].click();
        await esperar(() => !!sim());
        expect(document.querySelector('.confirmar-texto').textContent).toContain('01');
        sim().click();
        await esperar(() => escritas(reqs).length === 1);
        expect(escritas(reqs)[0].k).toBe(`DELETE ${P}/riscos/k1`);
        await esperar(() => painel.querySelectorAll('tbody tr').length === 1);
        expect(painel.querySelectorAll('tbody tr')).toHaveLength(1);
    });

    it('somente leitura: sem botões de ação nem de registro', async () => {
        const { painel } = await abrir(undefined, { editavel: false });
        expect(painel.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(painel.querySelectorAll('button')).toHaveLength(0);
    });

    it('erro de carga vira texto, não estado vazio', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'falhou' }, 500)));
        await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel: true });
        expect(el('painel').textContent).toContain('Não foi possível carregar os riscos.');
        expect(el('painel').textContent).not.toContain('Nenhum risco registrado.');
    });

    it('escalas, níveis e estratégias da aba são os do backend (src/data/ropa-abas/escalas.ts)', () => {
        const pares = (nome) => [...new RegExp(`${nome} = \\[([\\s\\S]*?)\\] as const`).exec(escalasBackend)[1].matchAll(/nota: (\d), rotulo: '([^']+)'/g)].map((m) => [Number(m[1]), m[2]]);
        expect(PROBABILIDADE).toEqual(pares('PROBABILIDADE'));
        expect(IMPACTO).toEqual(pares('IMPACTO'));
        const mapa = (nome) => Object.fromEntries([...new RegExp(`${nome} = \\{([^}]*)\\}`).exec(escalasBackend)[1].matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
        expect(NIVEL_ROTULO).toEqual(mapa('NIVEL_ROTULO'));
        expect(ESTRATEGIA_ROTULO).toEqual(mapa('ESTRATEGIA_ROTULO'));
    });

    it('texto do servidor é escapado e o módulo não tem style= nem handler inline', async () => {
        const { painel } = await abrir([risco({ threat: '<img src=x onerror=alert(1)>' })]);
        expect(painel.querySelector('img')).toBeNull();
        expect(painel.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(fonteDaAba).not.toMatch(/style=/);
        expect(fonteDaAba).not.toMatch(/\son(click|change|input|submit)=/);
    });
});
