// Página pública do questionário de homologação (public/homologacao.html + homologacao.js + homologacao.css). O que importa:
// (1) o token sai do fragmento, some da barra e só viaja no CORPO; nunca em URL nem no console;
// (2) as perguntas saem por tema, escapadas, com a resposta gravada marcada;
// (3) salvar manda só as marcadas; o % acompanha a marcação; enviar pede confirmação NA PÁGINA (sem window.confirm),
//     lista o que falta e encerra dizendo o que acontece depois; link inválido mostra o mesmo aviso;
// (4) nada inline no HTML (CSP script-src 'self'); toda classe hq-* tem regra; quadrado (tokens: publico-css.test.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const HTML = lido(import.meta.glob('../public/homologacao.html', { query: '?raw', import: 'default', eager: true }));
const JS = lido(import.meta.glob('../public/homologacao.js', { query: '?raw', import: 'default', eager: true }));
const CSS = lido(import.meta.glob('../public/homologacao.css', { query: '?raw', import: 'default', eager: true }));

const TOKEN = 'c'.repeat(64);
const VER = {
    cliente: 'Cliente Alfa', fornecedor: 'Fornecedor <b>Beta</b>', expira_em: '2026-11-06 12:00:00',
    perguntas: [
        { id: 'q1', tema: 'Segurança', texto: 'Há política <script>x</script>?' },
        { id: 'q2', tema: 'Segurança', texto: 'Há criptografia?' },
        { id: 'q3', tema: 'Incidentes', texto: 'Há processo?' },
    ],
    respostas: { q1: { resposta: 'parcial', justificativa: 'Em revisão' } },
    respondidas: 1, total: 3, percentual: 33,
};
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const espera = () => new Promise((r) => setTimeout(r, 20));
const $ = (id) => document.getElementById(id);

let fetchMock;
let consoles;
function servidor(rotas) {
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, o = {}) => {
        const r = rotas[String(url).replace(/^https?:\/\/[^/]+/, '')];
        if (r === undefined) return json({ error: 'sem rota' }, 500);
        return typeof r === 'function' ? r(o) : r;
    });
}
const corpos = (fim) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(fim)).map(([, o]) => JSON.parse(o.body));

async function abre(hash = '#' + TOKEN) {
    document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
    history.replaceState(null, '', '/homologacao' + hash);
    window.homologacaoPublica.iniciar();
    await espera();
}

beforeEach(async () => {
    try { sessionStorage.clear(); } catch { /* sem storage */ }
    await import('../public/homologacao.js');
    consoles = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
});

afterEach(() => {
    for (const c of consoles) expect(JSON.stringify(c.mock.calls)).not.toContain(TOKEN);
    for (const [u] of fetchMock?.mock.calls || []) expect(String(u)).not.toContain(TOKEN);
    expect(location.href).not.toContain(TOKEN);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('HTML da página', () => {
    it('sem script, handler nem estilo inline; script e CSS próprios; fora de busca e sem Referer', () => {
        expect(HTML).not.toMatch(/\son[a-z]+\s*=/i);
        const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)];
        expect(scripts).toHaveLength(1);
        expect(scripts[0][1]).toContain('src="/homologacao.js"');
        expect(scripts[0][2].trim()).toBe('');
        expect(HTML).not.toMatch(/<style\b/i);
        expect(HTML).not.toMatch(/\sstyle=/i);
        expect(HTML).toContain('href="/publico.css"');
        expect(HTML).toContain('href="/homologacao.css"');
        expect(HTML).toContain('<meta name="robots" content="noindex, nofollow">');
        expect(HTML).toContain('<meta name="referrer" content="no-referrer">');
    });
});

describe('abrir o link', () => {
    it('o token sai do fragmento, some da barra e só vai no corpo; perguntas por tema, escapadas, com a resposta gravada', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json(VER) });
        await abre();
        expect(location.hash).toBe('');
        expect(corpos('/ver')).toEqual([{ token: TOKEN }]);
        expect($('hq-fornecedor').textContent).toBe('Fornecedor <b>Beta</b>');
        expect($('hq-percentual').textContent).toBe('33% (1 de 3 perguntas)');
        expect([...document.querySelectorAll('.hq-tema-titulo')].map((h) => h.textContent)).toEqual(['Segurança', 'Incidentes']);
        expect(document.querySelector('script:not([src])')).toBeNull();
        expect($('hq-perguntas').textContent).toContain('<script>x</script>');
        const q1 = document.querySelector('fieldset[data-pergunta="q1"]');
        expect(q1.querySelector('input:checked').value).toBe('parcial');
        expect(q1.querySelector('textarea').value).toBe('Em revisão');
    });

    it('sem token, ou token que o servidor recusa: o mesmo aviso de link inválido', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json({ error: 'Link inválido ou expirado' }, 404) });
        await abre('');
        expect($('hq-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect(fetchMock.mock.calls).toHaveLength(0);
        await abre();
        expect($('hq-estado-titulo').textContent).toBe('Link inválido ou expirado');
        expect($('hq-conteudo').hidden).toBe(true);
    });
});

describe('salvar e enviar', () => {
    it('salvar manda só as marcadas, com a justificativa, e atualiza o %', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json(VER), '/api/v1/public/homologacao/salvar': json({ ok: true, respondidas: 2, total: 3, percentual: 67 }) });
        await abre();
        document.querySelector('fieldset[data-pergunta="q2"] input[value="sim"]').checked = true;
        $('hq-salvar').click();
        await espera();
        expect(corpos('/salvar')).toEqual([{ token: TOKEN, respostas: { q1: { resposta: 'parcial', justificativa: 'Em revisão' }, q2: { resposta: 'sim' } } }]);
        expect($('hq-percentual').textContent).toBe('67% (2 de 3 perguntas)');
        expect($('hq-msg').textContent).toBe('Rascunho salvo.');
    });

    it('o % acompanha a marcação, antes de salvar', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json(VER) });
        await abre();
        const sim = document.querySelector('fieldset[data-pergunta="q2"] input[value="sim"]');
        sim.checked = true;
        sim.dispatchEvent(new Event('change', { bubbles: true }));
        expect($('hq-percentual').textContent).toBe('67% (2 de 3 perguntas)');
        expect($('hq-progresso').textContent).toBe('2 de 3 respondidas');
    });

    it('enviar confirma na página: lista o que falta com um botão para cada; voltar não envia; enviar encerra e diz o que vem depois', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json(VER), '/api/v1/public/homologacao/enviar': json({ ok: true, respondidas: 1, total: 3, percentual: 33 }) });
        await abre();
        const confirmar = vi.spyOn(window, 'confirm');
        $('hq-enviar').click();
        await espera();
        expect(confirmar).not.toHaveBeenCalled();
        expect($('hq-confirma').hidden).toBe(false);
        expect($('hq-confirma-titulo').textContent).toBe('Faltam 2 perguntas sem resposta');
        expect([...document.querySelectorAll('#hq-faltam button')].map((b) => b.textContent)).toEqual(['Pergunta 2', 'Pergunta 3']);
        expect(document.querySelector('#hq-faltam a')).toBeNull(); // âncora poria #hq-p-N no endereço e o F5 o leria como token
        expect(corpos('/enviar')).toEqual([]);
        document.querySelector('#hq-faltam button').click();
        expect($('hq-confirma').hidden).toBe(true);
        expect(document.activeElement).toBe(document.querySelector('#hq-p-1 input'));
        expect(location.hash).toBe('');
        $('hq-enviar').click();
        $('hq-confirma-voltar').click();
        expect(corpos('/enviar')).toEqual([]);
        $('hq-enviar').click();
        $('hq-confirma-enviar').click();
        await espera();
        expect(corpos('/enviar')).toHaveLength(1);
        expect($('hq-estado-titulo').textContent).toBe('Respostas enviadas');
        expect($('hq-estado-texto').textContent).toContain('para Cliente Alfa');
        expect($('hq-estado-texto').textContent).toContain('1 de 3 perguntas respondidas');
        expect($('hq-estado-texto').textContent).toContain('vai revisar');
        expect($('hq-conteudo').hidden).toBe(true);
    });

    it('tudo respondido: a confirmação diz isso e o botão é "Enviar agora"', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json({ ...VER, respostas: { q1: { resposta: 'sim' }, q2: { resposta: 'nao' }, q3: { resposta: 'na' } } }) });
        await abre();
        $('hq-enviar').click();
        expect($('hq-confirma-titulo').textContent).toBe('Enviar as respostas?');
        expect($('hq-faltam').children).toHaveLength(0);
        expect($('hq-confirma-enviar').textContent).toBe('Enviar agora');
    });

    it('falha ao salvar não perde o que está na tela', async () => {
        servidor({ '/api/v1/public/homologacao/ver': json(VER), '/api/v1/public/homologacao/salvar': json({ error: 'x' }, 400) });
        await abre();
        $('hq-salvar').click();
        await espera();
        expect($('hq-aviso').textContent).toContain('Não foi possível salvar');
        expect($('hq-conteudo').hidden).toBe(false);
    });
});

describe('homologacao.css', () => {
    it('toda classe hq-* do HTML e do script tem regra', () => {
        const usadas = new Set([...HTML.matchAll(/class="([^"]*)"/g), ...JS.matchAll(/class="([^"]*)"/g)]
            .flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('hq-')));
        expect(usadas.size).toBeGreaterThan(15);
        const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(CSS));
        expect(sem, 'classes sem regra no CSS').toEqual([]);
    });

    it('sem cópia de tokens (vêm de publico.css), quadrado, sem itálico e sem accent como fundo', () => {
        expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/:root/);
        expect([...CSS.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((v) => v !== '0')).toEqual([]);
        expect(CSS).not.toMatch(/font-style:\s*italic/);
        expect(CSS).not.toMatch(/background(-color)?:\s*var\(--accent\)/);
    });
});
