// Catracas do sistema visual: o que já foi limpo não volta pela porta dos fundos.
// 1. Cor em hex nas views e em ui.js/globals.js/produto.js, e alfa colado em token (`${cor}20`): estado e marca saem de token (var(--success), var(--accent)...).
//    Fica de fora só o que precisa da cor literal porque renderiza FORA do CSS do app.
// 2. window.confirm/alert/prompt: bloqueiam a página, não seguem a marca e o prompt mostra senha em
//    claro. A pergunta é na própria tela (confirmar/pedirTexto em ui.js).
// 3. Estado vazio montado à mão: o único é renderEmptyState (ui.js).
import { describe, it, expect } from 'vitest';

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
const ALFA_COLADO = /\)\}[0-9a-fA-F]{2}(?=[;"'\s])|var\(--[\w-]+\)[0-9a-fA-F]/;

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
        expect(ALFA_COLADO.test('color-mix(in oklab, ${cor} 12%, transparent);')).toBe(false);
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
});
