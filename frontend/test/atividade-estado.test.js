import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S } from '../src/state.js';
import { servir, P, B, FICHA, REGISTRO, prepararDom } from './helpers-atividade.js';
import { carregarFicha, carregarRegistro, abaDoEndereco, gravarAbaNoEndereco, podeEditar, podeEscrever, novoAutosave, esvaziarTudo, limparAutosaves, url } from '../src/atividade/estado.js';

beforeEach(() => { prepararDom(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); limparAutosaves(); });

describe('leitura', () => {
    it('carregarFicha chama GET /ficha e guarda em S.atividadeFicha', async () => {
        const f = servir({ [`GET ${B}/ficha`]: FICHA() });
        const ficha = await carregarFicha('p9', 'r1');
        expect(new URL(f.mock.calls[0][0]).pathname).toBe(`${B}/ficha`);
        expect(S.atividadeFicha).toBe(ficha);
        expect(ficha.registro.nome).toBe('Desligamento de colaborador (exemplo)');
    });

    it('carregarRegistro acha a linha do projeto pela lista (a ficha não traz volume nem papéis)', async () => {
        servir({ [`GET ${P}/ropa`]: { ok: true, records: [REGISTRO({ id: 'outro' }), REGISTRO()] } });
        expect((await carregarRegistro('p9', 'r1')).volume_mensal).toBe('N/A');
        servir({ [`GET ${P}/ropa`]: { ok: true, records: [] } });
        expect(await carregarRegistro('p9', 'r1')).toBeNull();
    });
});

describe('endereço', () => {
    it('lê ?aba=, valida contra as nove abas e cai em escopo', () => {
        expect(abaDoEndereco({ search: '?tela=ropa-atividade&aba=riscos' })).toBe('riscos');
        expect(abaDoEndereco({ search: '?aba=inexistente' })).toBe('escopo');
        expect(abaDoEndereco({ search: '' })).toBe('escopo');
    });

    it('gravarAbaNoEndereco troca o endereço sem empilhar histórico', () => {
        const antes = window.history.length;
        gravarAbaNoEndereco('gaps');
        gravarAbaNoEndereco('logs');
        expect(new URLSearchParams(window.location.search).get('aba')).toBe('logs');
        expect(window.history.length).toBe(antes);
    });
});

describe('quem escreve', () => {
    it('equipe e administrador do cliente escrevem; cliente comum não; cancelada ninguém', () => {
        const ativa = FICHA();
        const cancelada = FICHA((f) => { f.situacao.codigo = 'cancelada'; return f; });
        S.user = { role: 'consultor' };
        expect(podeEditar()).toBe(true);
        expect(podeEscrever(ativa)).toBe(true);
        expect(podeEscrever(cancelada)).toBe(false);
        S.user = { role: 'org_admin' };
        expect(podeEscrever(ativa)).toBe(true);
        S.user = { role: 'org_user' };
        expect(podeEscrever(ativa)).toBe(false);
        S.user = null;
        expect(podeEscrever(ativa)).toBe(false);
    });
});

describe('autosave', () => {
    it('um PUT por rajada, "Salvo às HH:MM" no status; esvaziarTudo grava o pendente na hora', async () => {
        const f = servir({ [`PUT ${B}/escopo`]: { ok: true } });
        const status = document.createElement('p');
        const a = novoAutosave({ pid: 'p9', rid: 'r1', status });
        a.agendar('volume_mensal', 'a');
        a.agendar('volume_mensal', 'ab');
        await esvaziarTudo();
        const puts = f.mock.calls.filter(([u, o]) => o?.method === 'PUT');
        expect(puts).toHaveLength(1);
        expect(JSON.parse(puts[0][1].body)).toEqual({ volume_mensal: 'ab' });
        expect(status.textContent).toMatch(/^Salvo às \d{2}:\d{2}$/);
    });

    it('409 mostra a mensagem do servidor e não repete', async () => {
        const f = vi.fn(async () => ({ status: 409, ok: false, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Atividade cancelada: reative para editar' }), text: async () => '' }));
        vi.stubGlobal('fetch', f);
        const status = document.createElement('p');
        const a = novoAutosave({ pid: 'p9', rid: 'r1', status });
        a.agendar('finalidade', 'x');
        await esvaziarTudo();
        expect(status.textContent).toBe('Atividade cancelada: reative para editar');
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('url monta o caminho da atividade', () => { expect(url('p9', 'r1', '/ficha')).toBe(`${B}/ficha`); });
});
