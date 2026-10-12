// Catracas do sistema visual: o que já foi limpo não volta pela porta dos fundos.
// 1. Cor em hex dentro de views/*.js: estado e marca saem de token (var(--success), var(--accent)...).
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

describe('catracas do sistema visual', () => {
    it('nenhuma cor em hex nas views fora da lista de exceções', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            if (!arq.startsWith('src/views/')) continue;
            semComentario(src).split('\n').forEach((linha, i) => {
                if (!HEX.test(linha)) return;
                if (HEX_PERMITIDO.some(([a, trecho]) => a === arq && linha.includes(trecho))) return;
                achados.push(`${arq}:${i + 1} ${linha.trim().slice(0, 90)}`);
            });
        }
        expect(achados).toEqual([]);
    });

    it('a lista de exceções não guarda linha que já saiu', () => {
        for (const [arq, trecho] of HEX_PERMITIDO) expect(FONTES[arq]).toContain(trecho);
    });

    it('nenhum window.confirm, alert ou prompt no frontend', () => {
        const achados = [];
        for (const [arq, src] of Object.entries(FONTES)) {
            const codigo = semComentario(src);
            for (const m of codigo.matchAll(/(?<![.\w$])(?:window\.)?(confirm|alert|prompt)\s*\(/g)) achados.push(`${arq} ${m[0]}`);
        }
        expect(achados).toEqual([]);
    });

    it('estado vazio só por renderEmptyState', () => {
        const achados = Object.entries(FONTES)
            .filter(([arq, src]) => arq !== 'src/ui.js' && /class="empty-state/.test(semComentario(src)))
            .map(([arq]) => arq);
        expect(achados).toEqual([]);
    });
});
