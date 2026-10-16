// Catracas do sistema visual: o que já foi limpo não volta pela porta dos fundos.
// 1. Cor em hex nas views e em ui.js/globals.js/produto.js, e alfa colado em token (`${cor}20`): estado e marca saem de token (var(--success), var(--accent)...).
//    Fica de fora só o que precisa da cor literal porque renderiza FORA do CSS do app.
// 2. window.confirm/alert/prompt: bloqueiam a página, não seguem a marca e o prompt mostra senha em
//    claro. A pergunta é na própria tela (confirmar/pedirTexto em ui.js).
// 3. Estado vazio montado à mão: o único é renderEmptyState (ui.js).
// 4. style="" inline (onda 3, 15/10/2026): teto por arquivo; o número só desce. Raio inline só 0. Nada abaixo de 11px
//    (--fs-xs) nem peso fora da marca (300, 700) no CSS e nas telas.
import { describe, it, expect } from 'vitest';
import css from '../src/style.css?raw';

const FONTES = Object.fromEntries(Object.entries(
    import.meta.glob('../src/**/*.js', { query: '?raw', import: 'default', eager: true }),
).map(([k, v]) => [k.replace(/^\.\.\//, ''), v]));

const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Linhas com cor literal de propósito: o trecho que identifica a linha e o motivo.
const HEX_PERMITIDO = [
    ['src/views/project.js', "<style>body{font-family:'Segoe UI'", 'janela de impressão do dossiê: abre fora do CSS do app'],
    ['src/views/project.js', 'h2{color:#00ade8}', 'janela de impressão do dossiê'],
    ['src/views/project.js', ':root{--text:#111', 'janela de impressão do dossiê: tokens próprios, em papel'],
    ['src/views/security.js', 'style="background:#fff;padding:8px', 'QR do MFA: o leitor precisa de fundo branco'],
];
const HEX = /(?<!&)#[0-9a-fA-F]{3,8}\b/;

// Onde a cor de tela é montada: as views e os montadores compartilhados.
const COM_COR = (arq) => arq.startsWith('src/views/') || ['src/ui.js', 'src/globals.js', 'src/produto.js'].includes(arq);
// Sufixo de alfa colado num token (`${cor}20` com cor = 'var(--warning)') vira CSS inválido e o fundo some.
const ALFA_COLADO = /\}[0-9a-fA-F]{2}(?=[;"'\s,])|var\(--[\w-]+\)[0-9a-fA-F]/;

describe('catracas do sistema visual', () => {
    it('nenhuma cor em hex fora da lista de exceções', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            if (!COM_COR(arq)) continue;
            semComentario(src).split('\n').forEach((linha, i) => {
                if (!HEX.test(linha)) return;
                if (HEX_PERMITIDO.some(([a, trecho]) => a === arq && linha.includes(trecho))) return;
                achados.push(`${arq}:${i + 1} ${linha.trim().slice(0, 90)}`);
            });
        }
        expect(achados).toEqual([]);
    });

    it('nenhum sufixo de alfa colado em cor (use color-mix)', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            semComentario(src).split('\n').forEach((linha, i) => { if (ALFA_COLADO.test(linha)) achados.push(`${arq}:${i + 1}`); });
        }
        expect(achados).toEqual([]);
        expect(ALFA_COLADO.test('style="background:${levelColor(x)}20;"')).toBe(true);
        expect(ALFA_COLADO.test('background:var(--warning)20')).toBe(true);
        expect(ALFA_COLADO.test('border:1px solid ${lvlColor}33;text-transform')).toBe(true);
        expect(ALFA_COLADO.test('color-mix(in oklab, ${cor} 12%, transparent);')).toBe(false);
    });

    it('nenhum border-radius inline fora de 0 (sistema quadrado)', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            if (!COM_COR(arq)) continue;
            semComentario(src).split('\n').forEach((linha, i) => {
                for (const m of linha.matchAll(/border-radius:\s*([^;"'`]+)/g)) {
                    if (!['0', '0px', 'var(--radius)'].includes(m[1].trim())) achados.push(`${arq}:${i + 1}`);
                }
            });
        }
        expect(achados).toEqual([]);
    });

    it('a lista de exceções não guarda linha que já saiu', () => {
        for (const [arq, trecho] of HEX_PERMITIDO) expect(FONTES[arq]).toContain(trecho);
    });

    const DIALOGO = /(?<![.\w$])(?:(?:window|globalThis|self)\s*\.\s*)?(confirm|alert|prompt)\s*\(/g;
    it('nenhum confirm, alert ou prompt nativo no frontend', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            for (const m of semComentario(src).matchAll(DIALOGO)) achados.push(`${arq} ${m[0]}`);
        }
        expect(achados).toEqual([]);
        for (const amostra of ['confirm(1)', 'window.alert(1)', 'globalThis.prompt(1)', 'self.confirm(1)']) expect(amostra.match(DIALOGO)).not.toBeNull();
        for (const amostra of ['window.confirmar(1)', 'x.confirm(1)', 'confirmarContaAtiva(1)']) expect(amostra.match(DIALOGO)).toBeNull();
    });

    const VAZIO_A_MAO = /(?:class\s*=\s*["'`]|className\s*=\s*["'`]|classList\.add\(\s*["'`])[^"'`]*\bempty-state\b/;
    it('estado vazio só por renderEmptyState', () => {
        const achados = Object.entries(FONTES)
            .filter(([arq, src]) => arq !== 'src/ui.js' && VAZIO_A_MAO.test(semComentario(src)))
            .map(([arq]) => arq);
        expect(achados).toEqual([]);
        for (const amostra of ['<div class="empty-state">', "<div class='x empty-state'>", "el.className = 'empty-state'", "el.classList.add('empty-state')"]) expect(VAZIO_A_MAO.test(amostra)).toBe(true);
    });

    // Teto de style="" por arquivo, medido em 15/10/2026 depois da limpeza das quatro telas grandes (eram grc 309,
    // monitor 242, compliance 248, project 174). Baixou? Baixe o teto aqui. Subiu? Use as classes do fim de style.css.
    const TETO_STYLE = {
        'src/globals.js': 109, 'src/produto.js': 4, 'src/ui.js': 11, 'src/views/admin.js': 45, 'src/views/ai.js': 9,
        'src/views/aprovacao-lote.js': 21, 'src/views/auditor-acesso.js': 11, 'src/views/commercial.js': 27, 'src/views/compliance.js': 98,
        'src/views/dashboard.js': 26, 'src/views/documentos.js': 35, 'src/views/empresa.js': 37, 'src/views/encarregado.js': 3,
        'src/views/grc.js': 45, 'src/views/importacao.js': 45, 'src/views/mapa-de-risco.js': 11, 'src/views/meus-pedidos.js': 47,
        'src/views/monitor.js': 55, 'src/views/padronizar-nomes.js': 4, 'src/views/painel-graficos.js': 1, 'src/views/partes.js': 9,
        'src/views/ponto-de-partida.js': 8, 'src/views/privacy.js': 102, 'src/views/project.js': 50, 'src/views/requisitos.js': 4,
        'src/views/security.js': 41, 'src/views/seguranca-projeto.js': 19, 'src/views/terceiros.js': 43, 'src/views/titular.js': 27,
        'src/views/tratamento-ligacoes.js': 49, 'src/views/trocar-senha.js': 5,
    };
    it('style="" inline não passa do teto de cada arquivo', () => {
        const acima = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            const n = (src.match(/style=/g) || []).length;
            if (n > (TETO_STYLE[arq] ?? 0)) acima.push(`${arq}: ${n} > ${TETO_STYLE[arq] ?? 0}`);
        }
        expect(acima).toEqual([]);
    });

    const PEQUENA = /font-size:\s*(?:\d(?:\.\d+)?px|10(?:\.\d+)?px|0\.[0-6]\d*rem)|font:\s*\d{3}\s+(?:\d(?:\.\d+)?px|10(?:\.\d+)?px)/;
    const PESO_FORA = /font-weight:\s*(?:300|700|800|bold)\b/;
    it('nada abaixo de 11px nem peso fora da marca, no CSS e nas telas', () => {
        const achados = [];
        for (const [arq, src] of Object.entries({ ...FONTES, 'src/style.css': css })) {
            if (arq.startsWith('src/data/')) continue;
            semComentario(src).split('\n').forEach((linha, i) => {
                if (PEQUENA.test(linha) || PESO_FORA.test(linha)) achados.push(`${arq}:${i + 1} ${linha.trim().slice(0, 80)}`);
            });
        }
        expect(achados).toEqual([]);
        expect(PEQUENA.test('font-size:0.6rem')).toBe(true);
        expect(PEQUENA.test('font:500 9px/1 var(--font-mono)')).toBe(true);
        expect(PEQUENA.test('font-size:0.7rem')).toBe(false);
        expect(PEQUENA.test('font-size:12px')).toBe(false);
    });
});
