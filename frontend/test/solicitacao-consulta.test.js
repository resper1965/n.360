// Página pública do titular (public/solicitacao.*): consulta do andamento com protocolo + código (spec 2026-11-06-titular-consulta-protocolo).
// (1) a consulta abre SEM o token do portal; (2) #acompanhar=<protocolo>.<código> preenche, consulta e sai da barra;
// (3) a confirmação da abertura mostra o protocolo E o código; (4) erro do servidor aparece na página; nada inline no HTML.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const HTML = lido(import.meta.glob('../public/solicitacao.html', { query: '?raw', import: 'default', eager: true }));
const CSS = lido(import.meta.glob('../public/solicitacao.css', { query: '?raw', import: 'default', eager: true }));
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 20));
const $ = (id) => document.getElementById(id);
const CODIGO = 'K7QM-3XRP-9WTD-H2FN';
const CONSULTA = { protocolo: 'PT-2026-0007', tipo: 'acesso', status: 'em_andamento', recebido_em: '2026-11-01', prazo_em: '2026-11-16T00:00:00.000Z', respondido_em: null };

let fetchMock;
function servidor(rotas) {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const r = rotas[String(url).replace(/^https?:\/\/[^/]+/, '')];
        return r === undefined ? json({ error: 'sem rota' }, 500) : (typeof r === 'function' ? r() : r);
    });
}
const corpos = (fim) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(fim)).map(([, o]) => JSON.parse(o.body));
async function abre(hash = '') {
    document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
    history.replaceState(null, '', '/solicitacao' + hash);
    window.solicitacaoPublica.iniciar();
    await espera();
}

beforeEach(async () => {
    try { sessionStorage.clear(); } catch { /* sem storage */ }
    await import('../public/solicitacao.js');
});
afterEach(() => vi.restoreAllMocks());

describe('consulta do andamento', () => {
    it('sem token: o aviso oferece a consulta, que abre e consulta', async () => {
        servidor({ '/api/v1/public/titular-pedidos/consultar': json(CONSULTA) });
        await abre();
        expect($('sl-form').hidden).toBe(true);
        $('sl-ir-consulta-estado').click();
        expect($('sl-consulta').hidden).toBe(false);
        $('sl-c-protocolo').value = 'pt-2026-0007';
        $('sl-c-codigo').value = 'k7qm 3xrp 9wtd h2fn';
        $('sl-consulta').dispatchEvent(new Event('submit', { cancelable: true }));
        await espera();
        expect(corpos('/consultar')).toEqual([{ protocolo: 'PT-2026-0007', codigo: 'k7qm 3xrp 9wtd h2fn' }]);
        const txt = $('sl-c-resultado').textContent;
        expect(txt).toContain('Em andamento');
        expect(txt).toContain('Acesso aos meus dados');
        expect(txt).toContain('01/11/2026');
        expect(txt).toContain('16/11/2026');
    });

    it('#acompanhar= preenche, consulta sozinho e sai da barra; não vira token do portal', async () => {
        servidor({ '/api/v1/public/titular-pedidos/consultar': json(CONSULTA) });
        await abre(`#acompanhar=PT-2026-0007.${CODIGO}`);
        expect(location.hash).toBe('');
        expect(corpos('/consultar')).toEqual([{ protocolo: 'PT-2026-0007', codigo: CODIGO }]);
        expect($('sl-c-resultado').hidden).toBe(false);
        expect(sessionStorage.getItem('solicitacao-token')).toBeNull();
    });

    it('404 do servidor: a mensagem aparece e o resultado some', async () => {
        servidor({ '/api/v1/public/titular-pedidos/consultar': json({ error: 'Protocolo ou código não conferem' }, 404) });
        await abre(`#acompanhar=PT-2026-0007.${CODIGO}`);
        expect($('sl-c-erro').textContent).toBe('Protocolo ou código não conferem');
        expect($('sl-c-resultado').hidden).toBe(true);
    });

    it('com token: o formulário tem o caminho para a consulta', async () => {
        await abre('#' + 'a'.repeat(64));
        expect($('sl-form').hidden).toBe(false);
        $('sl-ir-consulta').click();
        expect($('sl-consulta').hidden).toBe(false);
        expect($('sl-form').hidden).toBe(true);
    });

    it('a confirmação da abertura mostra o protocolo e o código', async () => {
        servidor({ '/api/v1/public/titular-pedidos/abrir': json({ ok: true, protocolo: 'PT-2026-0007', codigo: CODIGO }, 201) });
        await abre('#' + 'a'.repeat(64));
        $('sl-nome').value = 'Fulano';
        $('sl-contato').value = 'fulano@exemplo.com';
        $('sl-descricao').value = 'Quero acesso.';
        $('sl-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await espera();
        expect($('sl-protocolo').textContent).toBe('PT-2026-0007');
        expect($('sl-codigo').textContent).toBe(CODIGO);
    });

    it('nada inline; as classes sl-* novas têm regra', () => {
        expect(HTML).not.toMatch(/\son[a-z]+=/i);
        expect(HTML).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
        for (const cls of new Set([...HTML.matchAll(/class="[^"]*\b(sl-[a-z-]+)/g)].map((m) => m[1]))) expect(CSS, cls).toContain('.' + cls);
    });
});
