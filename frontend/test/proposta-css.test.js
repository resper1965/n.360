// Guarda de CSS da página do cliente (public/proposta.css). O jsdom não faz cascata: classe sem
// regra passa nos testes de comportamento e a página sai crua. Os tokens e o comum (topo, botões,
// campos) vêm de publico.css, conferidos em publico-css.test.js.
import { describe, it, expect } from 'vitest';

// Sem `node:fs`: o Vite entrega o texto dos arquivos (padrão do repo).
const lido = (glob) => Object.values(glob)[0];
const css = lido(import.meta.glob('../public/proposta.css', { query: '?raw', import: 'default', eager: true }));
const html = lido(import.meta.glob('../public/proposta.html', { query: '?raw', import: 'default', eager: true }));
const js = lido(import.meta.glob('../public/proposta.js', { query: '?raw', import: 'default', eager: true }));

const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

describe('proposta.css', () => {
  it('toda classe pp-* do HTML e do script tem regra', () => {
    const usadas = new Set([
      ...[...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)),
      ...(js.match(/'pp-[a-z0-9-]+'/g) || []).map((s) => s.slice(1, -1)).filter((c) => /^pp-opcao-/.test(c)),
    ].filter((c) => c.startsWith('pp-')));
    expect(usadas.size).toBeGreaterThan(10);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css));
    expect(sem, 'classes sem regra no CSS').toEqual([]);
  });

  it('sem cópia de tokens: vêm de publico.css, que a página carrega antes da própria folha', () => {
    expect(semComentario(css)).not.toMatch(/:root/);
    expect(html.indexOf('href="/publico.css"')).toBeGreaterThan(-1);
    expect(html.indexOf('href="/publico.css"')).toBeLessThan(html.indexOf('href="/proposta.css"'));
  });

  it('sem itálico, sem accent como fundo de área, com a nota de responsividade', () => {
    expect(css).not.toMatch(/font-style:\s*italic/);
    // o accent preenche só o botão primário, que é o comum (.pub-btn-primario em publico.css)
    expect(css).not.toMatch(/background(-color)?:\s*var\(--accent\)/);
    expect(css).toMatch(/@media \(max-width: 600px\)/);
    expect(css).toMatch(/[Rr]esponsividade/);
  });
});
