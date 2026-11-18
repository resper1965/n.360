import { describe, it, expect } from 'vitest';
import { TELAS } from '../src/data/passos/tipos';

// Onda 4: "Onde isto vive" de um passo aponta telas do router. Tela que saiu do menu (certification) continua válida como alias
// (frontend/src/produto.js, ALIAS_DE_TELA); este teste falha se um destino do catálogo não tiver ramo no render nem alias.
// Lado da tela pelo fonte `?raw`, como test/contrato-tela-api.test.ts:12-15 (o workerd não tem node:fs).
const router = Object.values(import.meta.glob('../frontend/src/router.js', { query: '?raw', import: 'default', eager: true }))[0] as string;
const produto = Object.values(import.meta.glob('../frontend/src/produto.js', { query: '?raw', import: 'default', eager: true }))[0] as string;
const alias = /export const ALIAS_DE_TELA = \{([^;]*)\};/.exec(produto)?.[1] ?? '';

describe('destinos do catálogo de passos', () => {
  it('o teste lê os dois fontes', () => {
    expect(router).toContain("S.view === 'project-detail'");
    expect(alias).toContain('certification:');
  });
  it.each(TELAS)('%s tem ramo no render ou alias', (t) => {
    expect(router.includes(`S.view === '${t}'`) || alias.includes(`${t}:`), t).toBe(true);
  });
});
