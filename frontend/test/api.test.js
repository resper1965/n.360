// Testes de `src/api.js` — a camada por onde passa TODA chamada ao backend.
// Ela decide tres coisas de consequencia alta e nenhuma delas era coberta:
//   1. quando deslogar o usuario (401);
//   2. qual mensagem de erro chega na tela;
//   3. qual pedaco do envelope `{ ok:true, X:[...] }` a view enxerga.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, API_BASE, abrirRelatorio } from '../src/api.js';
import { S } from '../src/state.js';

/** Resposta minima com a superficie que `api()` consome de fetch. */
function resposta(corpo, { status = 200, contentType = 'application/json' } = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
        json: async () => corpo,
        text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    };
}

/** Erro de rede com o `name` que `api()` discrimina. */
function erroDeRede(nome) {
    const e = new Error(nome);
    e.name = nome;
    return e;
}

describe('api()', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        S.token = null;
        delete window.doLogout;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        S.token = null;
        vi.restoreAllMocks();
    });

    describe('montagem da requisicao', () => {
        it('aponta para 127.0.0.1:8787 quando roda em localhost', () => {
            // O jsdom serve a pagina em localhost, entao este teste fixa o
            // comportamento de desenvolvimento: API separada do estatico.
            expect(API_BASE).toBe('http://127.0.0.1:8787');
        });

        it('nao manda Authorization quando nao ha token', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('GET', '/api/v1/leads');
            const [, opcoes] = fetchMock.mock.calls[0];
            expect(opcoes.headers.Authorization).toBeUndefined();
            expect(opcoes.headers['Content-Type']).toBe('application/json');
        });

        it('manda Bearer quando ha token no estado', async () => {
            S.token = 'tok-123';
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('GET', '/api/v1/leads');
            const [, opcoes] = fetchMock.mock.calls[0];
            expect(opcoes.headers.Authorization).toBe('Bearer tok-123');
        });

        it('serializa o corpo e preserva o metodo', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('POST', '/api/v1/leads', { nome: 'ness.' });
            const [url, opcoes] = fetchMock.mock.calls[0];
            expect(url).toBe(API_BASE + '/api/v1/leads');
            expect(opcoes.method).toBe('POST');
            expect(opcoes.body).toBe('{"nome":"ness."}');
        });

        it('nao envia corpo quando nao ha corpo', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true }));
            await api('DELETE', '/api/v1/leads/1');
            expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
        });
    });

    describe('desembrulho do envelope { ok:true, X:[...] }', () => {
        it('devolve o array direto quando o envelope tem exatamente um array', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, risks: [{ id: 'r1' }, { id: 'r2' }] }));
            const r = await api('GET', '/api/v1/projects/p1/risks');
            expect(Array.isArray(r)).toBe(true);
            expect(r).toHaveLength(2);
        });

        it('devolve o objeto inteiro quando o envelope nao tem array', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, ativo: true, codigos_recuperacao_restantes: 8 }));
            const r = await api('GET', '/api/v1/auth/mfa/status');
            expect(r.ativo).toBe(true);
            expect(r.codigos_recuperacao_restantes).toBe(8);
        });

        it('array vazio no envelope tambem e desembrulhado', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: true, controls: [] }));
            expect(await api('GET', '/api/v1/projects/p1/controls')).toEqual([]);
        });

        // Antes a lista era devolvida e o resto sumia sem erro: a tela de entrevistas lia
        // `questions` e recebia `interviews`; a análise de lacunas recebia `gaps` e mostrava 0%.
        it('devolve o envelope inteiro quando ha lista E outros campos (mfa.ts:90)', async () => {
            fetchMock.mockResolvedValue(
                resposta({ ok: true, recovery_codes: ['a', 'b'], aviso: 'Guarde agora' })
            );
            const r = await api('POST', '/api/v1/auth/mfa/activate', { codigo: '123456' });
            expect(r).toEqual({ ok: true, recovery_codes: ['a', 'b'], aviso: 'Guarde agora' });
        });

        it('devolve o envelope inteiro quando ha duas listas (platform.ts:547)', async () => {
            const p = { id: 'p1' };
            fetchMock.mockResolvedValue(resposta({ ok: true, portfolio: [p], projects: [p] }));
            const r = await api('GET', '/api/v1/portfolio');
            expect(r.portfolio).toEqual([p]);
            expect(r.projects).toEqual([p]);
        });

        it('nao desembrulha quando `ok` nao e exatamente true', async () => {
            fetchMock.mockResolvedValue(resposta({ ok: 1, risks: [{ id: 'r1' }] }));
            const r = await api('GET', '/api/v1/projects/p1/risks');
            expect(Array.isArray(r)).toBe(false);
            expect(r.risks).toHaveLength(1);
        });

        it('array cru (sem envelope) passa intacto', async () => {
            fetchMock.mockResolvedValue(resposta([{ id: 'l1' }]));
            expect(await api('GET', '/api/v1/leads')).toEqual([{ id: 'l1' }]);
        });
    });

    describe('traducao de erro', () => {
        it('usa o campo `error` do corpo', async () => {
            fetchMock.mockResolvedValue(resposta({ error: 'Projeto nao encontrado' }, { status: 404 }));
            await expect(api('GET', '/api/v1/projects/x')).rejects.toThrow('Projeto nao encontrado');
        });

        it('junta as mensagens de `details` quando nao ha `error`', async () => {
            fetchMock.mockResolvedValue(
                resposta(
                    { details: [{ message: 'email obrigatorio' }, { message: 'senha obrigatoria' }] },
                    { status: 400 }
                )
            );
            await expect(api('POST', '/api/v1/auth/login', {})).rejects.toThrow(
                'email obrigatorio, senha obrigatoria'
            );
        });

        it('corpo que nao explica nada vira mensagem em portugues pelo status, sem codigo HTTP', async () => {
            fetchMock.mockResolvedValue(resposta({}, { status: 500 }));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow('O servidor não conseguiu concluir a operação. Tente de novo em instantes.');
            fetchMock.mockResolvedValue(resposta({ error: 'Internal Server Error' }, { status: 500 }));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow('O servidor não conseguiu concluir a operação.');
            fetchMock.mockResolvedValue(resposta({ error: 'Forbidden' }, { status: 403 }));
            await expect(api('GET', '/api/v1/leads')).rejects.toMatchObject({ message: 'Você não tem permissão para esta ação.', status: 403 });
            fetchMock.mockResolvedValue(resposta({ error: 'Not Found' }, { status: 404 }));
            await expect(api('GET', '/api/v1/leads')).rejects.toThrow(/não foi encontrado/);
        });

        it('status de erro vence o desembrulho do envelope', async () => {
            fetchMock.mockResolvedValue(
                resposta({ ok: true, risks: [], error: 'Sem acesso ao projeto' }, { status: 403 })
            );
            await expect(api('GET', '/api/v1/projects/p1/risks')).rejects.toThrow('Sem acesso ao projeto');
        });

        it('resposta que nao e JSON vira erro explicito, nao parse quebrado', async () => {
            fetchMock.mockResolvedValue(
                resposta('<!DOCTYPE html><html>...', { status: 502, contentType: 'text/html' })
            );
            const erro = await api('GET', '/api/v1/leads').catch((e) => e);
            expect(erro.message).toBe('O servidor respondeu de um jeito inesperado. Tente de novo em instantes.');
            expect(erro.status).toBe(502);
            expect(erro.codigo).toBe('formato');
            // O detalhe técnico fica no console, não na tela.
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('502'));
        });

        it('timeout de 30s vira mensagem com o caminho chamado', async () => {
            fetchMock.mockRejectedValue(erroDeRede('TimeoutError'));
            await expect(api('GET', '/api/v1/leads')).rejects.toMatchObject({
                message: 'O servidor demorou a responder. Tente de novo em instantes.', codigo: 'tempo' });
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('/api/v1/leads (30s)'));
        });

        it('timeoutMs por chamada vale no lugar dos 30s, não vira cabeçalho e não muda o padrão', async () => {
            const espia = vi.spyOn(AbortSignal, 'timeout');
            fetchMock.mockResolvedValue(resposta({ ok: true, x: 1 }));
            await api('POST', '/api/v1/leads', undefined, { timeoutMs: 150000, 'X-Operacao': 'op1' });
            expect(espia).toHaveBeenLastCalledWith(150000);
            const h = fetchMock.mock.calls.at(-1)[1].headers;
            expect(h['X-Operacao']).toBe('op1');
            expect(h.timeoutMs).toBeUndefined();
            await api('GET', '/api/v1/leads');
            expect(espia).toHaveBeenLastCalledWith(30000);
            fetchMock.mockRejectedValue(erroDeRede('TimeoutError'));
            await expect(api('POST', '/api/v1/leads', undefined, { timeoutMs: 150000 })).rejects.toMatchObject({ codigo: 'tempo' });
            expect(console.error).toHaveBeenLastCalledWith(expect.stringContaining('(150s)'));
            espia.mockRestore();
        });

        it('abort vira "Requisicao cancelada"', async () => {
            fetchMock.mockRejectedValue(erroDeRede('AbortError'));
            await expect(api('GET', '/api/v1/leads')).rejects.toMatchObject({ message: 'A operação foi cancelada.', codigo: 'cancelado' });
        });

        it('qualquer outra falha de fetch vira a mensagem de conexao, sem o caminho chamado', async () => {
            fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
            await expect(api('GET', '/api/v1/leads')).rejects.toMatchObject({
                message: 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.', codigo: 'rede' });
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GET /api/v1/leads'));
        });
    });

    describe('401 e logout automatico', () => {
        it('desloga em 401 de rota comum', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Unauthorized' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('Sua sessão terminou. Entre de novo para continuar.');
            expect(window.doLogout).toHaveBeenCalledTimes(1);
        });

        it('nao desloga em 401 do proprio login', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Credenciais invalidas' }, { status: 401 }));
            await expect(api('POST', '/api/v1/auth/login', {})).rejects.toThrow('Credenciais invalidas');
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        // Invariante do AGENTS.md: 401 nas rotas de MFA e resposta ESPERADA a
        // erro do usuario. Sem a isencao, errar um digito destruia a sessao.
        it.each([
            '/api/v1/auth/mfa/verify',
            '/api/v1/auth/mfa/activate',
            '/api/v1/auth/mfa/setup',
            '/api/v1/auth/mfa/disable',
        ])('nao desloga em 401 de %s e propaga a mensagem do servidor', async (rota) => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Codigo invalido' }, { status: 401 }));
            await expect(api('POST', rota, { codigo: '000000' })).rejects.toThrow('Codigo invalido');
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        // F7: trocar a propria senha pede a senha ATUAL; errar e 401 esperado, nao sessao morta.
        it('nao desloga em 401 de /auth/change-password e propaga "Senha atual incorreta"', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Senha atual incorreta' }, { status: 401 }));
            await expect(api('POST', '/api/v1/auth/change-password', { oldPassword: 'x', newPassword: 'y' }))
                .rejects.toThrow('Senha atual incorreta');
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        it('nao quebra quando window.doLogout ainda nao foi registrado', async () => {
            fetchMock.mockResolvedValue(resposta({ error: 'Unauthorized' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('Sua sessão terminou. Entre de novo para continuar.');
        });

        // Expirar por inatividade NAO e sessao invalida: o usuario continua
        // sendo quem era e pode ter edicao aberta na tela.
        it('401 por INATIVIDADE reautentica no lugar, sem deslogar', async () => {
            window.doLogout = vi.fn();
            window.pedirReautenticacao = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'expirou', expired: 'inactivity' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('inatividade');
            expect(window.pedirReautenticacao).toHaveBeenCalledTimes(1);
            expect(window.doLogout).not.toHaveBeenCalled();
        });

        it('sem a tela de reautenticacao registrada, cai no logout de sempre', async () => {
            window.doLogout = vi.fn();
            delete window.pedirReautenticacao;
            fetchMock.mockResolvedValue(resposta({ error: 'expirou', expired: 'inactivity' }, { status: 401 }));
            await expect(api('GET', '/api/v1/projects')).rejects.toThrow('Sua sessão terminou. Entre de novo para continuar.');
            expect(window.doLogout).toHaveBeenCalledTimes(1);
        });

        it('403 nao desloga (falta de permissao nao e sessao expirada)', async () => {
            window.doLogout = vi.fn();
            fetchMock.mockResolvedValue(resposta({ error: 'Somente leitura' }, { status: 403 }));
            await expect(api('POST', '/api/v1/projects', {})).rejects.toThrow('Somente leitura');
            expect(window.doLogout).not.toHaveBeenCalled();
        });
    });
});

describe('abrirRelatorio()', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('busca com o cabeçalho da sessão e abre o blob; o token nunca vai na URL', async () => {
        const f = vi.fn(async () => resposta('<html>relatório</html>', { contentType: 'text/html' }));
        vi.stubGlobal('fetch', f);
        const abre = vi.fn(() => ({}));
        vi.stubGlobal('open', abre);
        URL.createObjectURL = vi.fn(() => 'blob:relatorio');
        URL.revokeObjectURL = vi.fn();
        S.token = 'tok-sessao';
        await abrirRelatorio('/api/v1/projects/p1/controls/A.5.1/policy/report');
        expect(f.mock.calls[0][0]).toBe(API_BASE + '/api/v1/projects/p1/controls/A.5.1/policy/report');
        expect(f.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok-sessao' });
        expect(abre).toHaveBeenCalledWith('blob:relatorio', '_blank');
    });

    it('erro do servidor e pop-up bloqueado viram mensagem', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: 'x' }, { status: 403 })));
        await expect(abrirRelatorio('/r')).rejects.toThrow('Não foi possível gerar o relatório (erro 403)');
        vi.stubGlobal('fetch', vi.fn(async () => resposta('<html></html>', { contentType: 'text/html' })));
        vi.stubGlobal('open', vi.fn(() => null));
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        await expect(abrirRelatorio('/r')).rejects.toThrow('bloqueou a nova janela');
    });
});
