// Aba Teste de Impacto (pacote D, tarefa D3). api() REAL e delegação REAL; o fetch é dublado com o corpo de GET /impacto
// (src/services/impacto.ts, lerImpacto, com a pergunta alto_risco da tarefa A6) e de GET /ligacoes (dpias). Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';
import fonteDaAba from '../src/atividade/aba-impacto.js?raw';

import { S } from '../src/state.js';
import '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import { montar } from '../src/atividade/aba-impacto.js';

initDelegation();

const P = '/api/v1/projects/p9/ropa/r1';
const q = (id, grupo, extra = {}) => ({ id, grupo, texto: `Pergunta ${id}?`, curto: `motivo ${id}`, resposta: null, da_atividade: null, ...extra });
const ESPECIFICAS = ['sensiveis', 'vulneraveis', 'finalidade_distinta', 'compartilhamento_novo', 'monitoramento', 'perfilizacao', 'combinacao', 'transferencia', 'tecnologia_inovadora', 'decisao_automatizada', 'legitimo_interesse'];
const IMPACTO = (extra = {}) => ({
    perguntas: [q('alto_risco', 'alto_risco'), q('afeta_direitos', 'geral'), q('larga_escala', 'geral'), ...ESPECIFICAS.map((id) => q(id, 'especifico'))],
    recomendacao: { resultado: 'incompleto', motivos: [] }, finalizado_em: null, ...extra });
const el = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const tudo = () => new Promise((ok) => setTimeout(ok, 0));
async function esperar(cond) { for (let i = 0; i < 40 && !cond(); i++) await tudo(); }

/** O PUT grava as respostas e recalcula a recomendação como o servidor faz (aqui, só o mínimo que o teste precisa). */
function servidor(inicial, { dpias = [], puts422 = null, falhaResposta = null } = {}) {
    const atual = clone(inicial);
    const puts = [];
    const f = vi.fn(async (url, opts = {}) => {
        const k = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
        if (k === `GET ${P}/impacto`) return resposta(atual);
        if (k === `GET ${P}/ligacoes`) return resposta({ dpias });
        if (k === `PUT ${P}/impacto`) {
            const c = JSON.parse(opts.body);
            puts.push(c);
            if (puts422 && c.finalizar) return resposta({ error: puts422 }, 400);
            if (falhaResposta && c.finalizar === undefined) return resposta({ error: falhaResposta }, 500);
            for (const [id, v] of Object.entries(c.respostas)) atual.perguntas.find((p) => p.id === id).resposta = v;
            if (c.finalizar !== undefined) atual.finalizado_em = c.finalizar ? '2026-10-16T12:00:00.000Z' : null;
            const sim = (g) => atual.perguntas.some((p) => p.grupo === g && p.resposta === 'sim');
            atual.recomendacao = sim('geral') && sim('especifico') ? { resultado: 'recomendado', motivos: atual.perguntas.filter((p) => p.resposta === 'sim').map((p) => p.id) } : { resultado: 'incompleto', motivos: [] };
            return resposta({ ok: true });
        }
        if (k === `POST ${P}/dpia`) { dpias.push({ id: 'dp1', nome: 'RIPD exemplo', status: 'Draft' }); return resposta({ ok: true, id: 'dp1' }, 201); }
        if (k === '/api/v1/projects/p9/dpia' || k === 'GET /api/v1/projects/p9/dpia') return resposta([{ id: 'dp1', system_name: 'RIPD exemplo', status: 'Draft' }]);
        return resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return { f, puts, estado: () => atual };
}
async function abrir(inicial = IMPACTO(), { editavel = true, ...o } = {}) {
    const srv = servidor(inicial, o);
    const recarregarFicha = vi.fn(async () => {});
    const aba = await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel, recarregarFicha });
    return { ...srv, painel: el('painel'), aba, recarregarFicha };
}
const radio = (id, v) => el(`at-imp-${id}-${v}`);
const marcar = (id, v) => { const r = radio(id, v); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => {
    document.body.innerHTML = '<div id="painel"></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aba Teste de Impacto', () => {
    it('1 de alto risco, 2 gerais e 11 específicos, na ordem, cada um com Sim, Não e Não sei agora', async () => {
        const { painel } = await abrir();
        const grupos = [...painel.querySelectorAll('fieldset.at-grupo > legend')].map((l) => l.textContent);
        expect(grupos).toEqual(['A atividade pode gerar alto risco ao titular de dados?', 'Critério Geral', 'Critério Específico']);
        const geral = [...painel.querySelectorAll('fieldset.at-grupo')][1];
        expect([...geral.querySelectorAll('.at-pergunta-texto')].map((p) => p.textContent)).toEqual(['Pergunta afeta_direitos?', 'Pergunta larga_escala?']);
        const esp = [...painel.querySelectorAll('fieldset.at-grupo')][2];
        expect([...esp.querySelectorAll('.at-pergunta-texto')].map((p) => p.textContent)).toEqual(ESPECIFICAS.map((id) => `Pergunta ${id}?`));
        expect(esp.querySelectorAll('.at-pergunta')).toHaveLength(11);
        const um = esp.querySelector('.at-pergunta');
        expect([...um.querySelectorAll('.re-opcao-texto')].map((t) => t.textContent)).toEqual(['Sim', 'Não', 'Não sei agora']);
        expect(um.getAttribute('role')).toBe('radiogroup');
        expect(um.getAttribute('aria-labelledby')).toBe(um.querySelector('.at-pergunta-texto').id);
        expect(el('at-imp-alto').closest('label').textContent).toContain('Sim, há alto risco para o titular.');
        expect(painel.querySelector('.btn-primary')).toBeNull();
        expect(painel.textContent).toContain('0 de 14 respondidas.');
    });

    it('marcar uma resposta grava na hora só ela, relê a recomendação do servidor e mantém o foco', async () => {
        const { puts, recarregarFicha } = await abrir();
        expect(el('at-recomendacao').textContent).toContain('incompleto');
        marcar('afeta_direitos', 'sim');
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ respostas: { afeta_direitos: 'sim' } });
        await esperar(() => radio('afeta_direitos', 'sim').checked && document.activeElement === radio('afeta_direitos', 'sim'));
        expect(document.activeElement).toBe(radio('afeta_direitos', 'sim'));
        expect(recarregarFicha).toHaveBeenCalled();
        marcar('sensiveis', 'sim');
        await esperar(() => puts.length === 2);
        await esperar(() => el('at-recomendacao').textContent.includes('RIPD recomendado'));
        expect(el('at-recomendacao').textContent).toBe('RIPD recomendado: motivo afeta_direitos; motivo sensiveis.');
        expect(el('at-recomendacao').getAttribute('role')).toBe('status');
        expect(document.querySelector('#painel').textContent).toContain('2 de 14 respondidas.');
    });

    it('alto risco: uma marca; marcar manda sim e desmarcar manda não', async () => {
        const { puts } = await abrir();
        const c = el('at-imp-alto');
        c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ respostas: { alto_risco: 'sim' } });
        await esperar(() => el('at-imp-alto').checked);
        el('at-imp-alto').checked = false; el('at-imp-alto').dispatchEvent(new Event('change', { bubbles: true }));
        await esperar(() => puts.length === 2);
        expect(puts[1]).toEqual({ respostas: { alto_risco: 'nao' } });
    });

    it('o que a atividade já sabe vem como proposta, nunca marcado nem gravado sozinho; confirmar grava', async () => {
        const imp = IMPACTO();
        imp.perguntas.find((p) => p.id === 'sensiveis').da_atividade = 'sim';
        imp.perguntas.find((p) => p.id === 'legitimo_interesse').resposta = 'sim';
        imp.perguntas.find((p) => p.id === 'legitimo_interesse').da_atividade = 'nao';
        const { puts, painel } = await abrir(imp);
        const bloco = radio('sensiveis', 'sim').closest('.at-pergunta');
        expect(bloco.textContent).toContain('A atividade já indica: Sim. Confirme.');
        expect(radio('sensiveis', 'sim').checked).toBe(false); // proposta não é marcada
        expect(puts).toHaveLength(0);
        // divergência com o gravado: avisa, mantém o gravado
        const li = radio('legitimo_interesse', 'sim');
        expect(li.checked).toBe(true);
        expect(li.closest('.at-pergunta').textContent).toContain('A atividade registra Não. Confira a resposta.');
        bloco.querySelector('button').click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ respostas: { sensiveis: 'sim' } });
        await esperar(() => radio('sensiveis', 'sim').checked);
        expect(painel.textContent).not.toContain('A atividade já indica: Sim. Confirme.');
    });

    it('finalizar: alternância com role switch e aria-checked; envia finalizar true e o erro do servidor aparece em texto', async () => {
        const { puts, painel } = await abrir(IMPACTO(), { puts422: 'Responda as 13 perguntas antes de finalizar o teste' });
        const sw = el('at-imp-final');
        expect(sw.getAttribute('role')).toBe('switch');
        expect(sw.getAttribute('aria-checked')).toBe('false');
        // o rótulo diz a ação; o nome acessível e o aria-checked dizem o estado
        expect(sw.textContent).toBe('Finalizar o teste de impacto');
        // a validação fica no fim da aba, depois da recomendação de RIPD
        expect(el('at-recomendacao').compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sw.getAttribute('aria-label')).toBe('Teste de impacto finalizado');
        sw.click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ respostas: {}, finalizar: true });
        // o erro da validação aparece junto do botão, no fim da aba
        await esperar(() => el('at-imp-erro-final').textContent !== '');
        expect(el('at-imp-erro-final').textContent).toBe('Responda as 13 perguntas antes de finalizar o teste');
        expect(el('at-imp-erro-final').getAttribute('role')).toBe('alert');
        expect(el('at-imp-erro').textContent).toBe('');
        expect(el('at-imp-final').getAttribute('aria-checked')).toBe('false');
        expect(painel.querySelectorAll('input:disabled')).toHaveLength(0);
    });

    it('falha ao gravar uma resposta: o erro aparece no topo da aba, perto das perguntas, não no fim', async () => {
        const { painel } = await abrir(IMPACTO(), { falhaResposta: 'Não foi possível gravar a resposta' });
        marcar('sensiveis', 'sim');
        await esperar(() => el('at-imp-erro').textContent !== '');
        expect(el('at-imp-erro').textContent).toBe('Não foi possível gravar a resposta');
        expect(el('at-imp-erro').compareDocumentPosition(painel.querySelector('fieldset')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(el('at-imp-erro-final').textContent).toBe('');
    });

    it('teste finalizado: perguntas desabilitadas, data escrita e "Reabrir o teste" manda finalizar false', async () => {
        const { puts, painel } = await abrir(IMPACTO({ finalizado_em: '2026-10-16T12:00:00.000Z' }));
        expect(el('at-imp-final').getAttribute('aria-checked')).toBe('true');
        expect(painel.textContent).toContain('Finalizado em 16/10/2026');
        expect([...painel.querySelectorAll('input')].every((i) => i.disabled)).toBe(true);
        expect([...painel.querySelectorAll('button')].filter((b) => b.textContent === 'Reabrir o teste')).toHaveLength(1);
        const reabrir = el('at-imp-final');
        expect(reabrir.textContent).toBe('Reabrir o teste');
        reabrir.click();
        await esperar(() => puts.length === 1);
        expect(puts[0]).toEqual({ respostas: {}, finalizar: false });
        await esperar(() => !painel.querySelector('input:disabled'));
        expect(painel.querySelectorAll('input:disabled')).toHaveLength(0);
        expect(el('at-imp-final').getAttribute('aria-checked')).toBe('false');
    });

    it('RIPD: botão secundário "Criar o RIPD a partir da atividade" cria (POST) e passa a mostrar "Abrir o RIPD"', async () => {
        const { painel, f } = await abrir();
        const criar = [...painel.querySelectorAll('button')].find((b) => b.textContent === 'Criar o RIPD a partir da atividade');
        expect(criar.classList.contains('btn-primary')).toBe(false);
        criar.click();
        await esperar(() => [...painel.querySelectorAll('button')].some((b) => b.textContent === 'Abrir o RIPD'));
        expect(f.mock.calls.some(([u, o]) => o?.method === 'POST' && u.endsWith(`${P}/dpia`))).toBe(true);
        expect([...painel.querySelectorAll('button')].some((b) => b.textContent === 'Criar o RIPD a partir da atividade')).toBe(false);
    });

    it('RIPD já existente: só "Abrir o RIPD", que abre o detalhe com a lista carregada', async () => {
        const { painel } = await abrir(IMPACTO(), { dpias: [{ id: 'dp1', nome: 'RIPD exemplo', status: 'Draft' }] });
        window.openDPIADetailsModal = vi.fn();
        [...painel.querySelectorAll('button')].find((b) => b.textContent === 'Abrir o RIPD').click();
        await esperar(() => window.openDPIADetailsModal.mock.calls.length === 1);
        expect(window.openDPIADetailsModal).toHaveBeenCalledWith('dp1');
        expect([...painel.querySelectorAll('button')].some((b) => b.textContent === 'Criar o RIPD a partir da atividade')).toBe(false);
    });

    it('somente leitura (atividade cancelada ou sem permissão): tudo desabilitado e sem botões de ação', async () => {
        const imp = IMPACTO();
        imp.perguntas.find((p) => p.id === 'sensiveis').da_atividade = 'sim';
        const { painel } = await abrir(imp, { editavel: false });
        expect([...painel.querySelectorAll('input')].every((i) => i.disabled)).toBe(true);
        expect(el('at-imp-final').disabled).toBe(true);
        expect([...painel.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t !== 'Finalizar o teste de impacto')).toEqual([]);
        expect(painel.textContent).toContain('A atividade já indica: Sim.');
    });

    it('sem a pergunta alto_risco no servidor a seção some; erro de carga vira texto, não vazio', async () => {
        const sem = IMPACTO();
        sem.perguntas = sem.perguntas.filter((p) => p.id !== 'alto_risco');
        const { painel } = await abrir(sem);
        expect(el('at-imp-alto')).toBeNull();
        expect(painel.textContent).toContain('0 de 13 respondidas.');
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'falhou' }, 500)));
        await montar(el('painel'), { projectId: 'p9', ropaId: 'r1', ficha: {}, editavel: true });
        expect(el('painel').textContent).toContain('Não foi possível carregar o teste de impacto.');
    });

    it('texto do servidor é escapado e o módulo não tem style= nem handler inline', async () => {
        const mau = IMPACTO();
        mau.perguntas[1].texto = '<img src=x onerror=alert(1)>';
        const { painel } = await abrir(mau);
        expect(painel.querySelector('img')).toBeNull();
        expect(painel.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(fonteDaAba).not.toMatch(/style=/);
        expect(fonteDaAba).not.toMatch(/\son(click|change|input|submit)=/);
    });
});
