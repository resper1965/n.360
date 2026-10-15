// As quatro páginas públicas (políticas, auditor, homologação, proposta) dividem public/publico.css. O jsdom não faz
// cascata: classe sem regra passa nos testes de comportamento e a página sai crua. E os tokens são cópia dos do app:
// se o :root de style.css mudar, a cópia tem de acompanhar. Aqui também ficam as regras de marca que valem para as
// quatro: título da aba, theme-color, idioma, fontes, sem estilo inline, sem raio, blur, gradiente nem itálico.
import { describe, it, expect } from 'vitest';

const lido = (glob) => Object.values(glob)[0];
const CSS = lido(import.meta.glob('../public/publico.css', { query: '?raw', import: 'default', eager: true }));
const APP = lido(import.meta.glob('../src/style.css', { query: '?raw', import: 'default', eager: true }));
const PAGINAS = ['politicas', 'auditor', 'homologacao', 'proposta'];
const HTML = import.meta.glob('../public/{politicas,auditor,homologacao,proposta}.html', { query: '?raw', import: 'default', eager: true });
const JS = import.meta.glob('../public/{politicas,auditor,homologacao,proposta}.js', { query: '?raw', import: 'default', eager: true });
const FOLHAS = import.meta.glob('../public/{publico,politicas,auditor,homologacao,proposta}.css', { query: '?raw', import: 'default', eager: true });
const html = (p) => HTML[`../public/${p}.html`];

const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = (bruto, texto = semComentario(bruto)) => Object.fromEntries([...texto.slice(texto.indexOf(':root'), texto.indexOf('}', texto.indexOf(':root'))).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

describe('publico.css', () => {
  it('os tokens são os do :root de style.css', () => {
    const daqui = tokens(CSS);
    const dele = tokens(APP);
    expect(Object.keys(daqui).length).toBeGreaterThan(15);
    expect(Object.entries(daqui).filter(([k, v]) => dele[k] !== v)).toEqual([]);
  });

  it('toda classe pub-* das quatro páginas e dos scripts tem regra', () => {
    const fontes = [...Object.values(HTML), ...Object.values(JS)].join('\n');
    const usadas = new Set([...fontes.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('pub-')));
    expect(usadas.size).toBeGreaterThan(25);
    const sem = [...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(CSS));
    expect(sem, 'classes sem regra em publico.css').toEqual([]);
  });

  it('o portal de políticas: toda classe pol-* e policy-item tem regra em politicas.css', () => {
    const css = FOLHAS['../public/politicas.css'];
    const fontes = html('politicas') + JS['../public/politicas.js'];
    const usadas = new Set([...fontes.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(pol-|policy-)/.test(c)));
    expect(usadas.size).toBeGreaterThan(15);
    expect([...usadas].filter((cl) => !new RegExp('\\.' + cl + '(?![a-z0-9-])').test(css))).toEqual([]);
  });

  it('responsiva: corte de celular e prefers-reduced-motion', () => {
    expect(CSS).toMatch(/@media \(max-width: 600px\)/);
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(CSS).toMatch(/:focus-visible/);
  });

  it('nas cinco folhas: quadrado, sem itálico, sem blur nem gradiente; accent de fundo só no botão primário', () => {
    for (const [arq, bruto] of Object.entries(FOLHAS)) {
      const css = semComentario(bruto);
      expect([...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim()).filter((v) => !['0', 'var(--radius)'].includes(v)), arq).toEqual([]);
      expect(css, arq).not.toMatch(/font-style:\s*italic/);
      expect(css, arq).not.toMatch(/backdrop-filter|blur\(|gradient\(/);
      const comFundoAccent = css.split('}').filter((r) => /background(-color)?:\s*var\(--accent\)/.test(r)).map((r) => r.trim().split('{')[0].trim());
      expect(comFundoAccent, arq).toEqual(arq.endsWith('publico.css') ? ['.pub-btn-primario'] : []);
      if (!arq.endsWith('publico.css')) expect(css, `${arq} copia tokens`).not.toMatch(/:root/);
    }
  });
});

describe('as quatro páginas', () => {
  for (const p of PAGINAS) {
    it(`${p}.html: marca no título e no topo, metadados, fontes e folhas comuns, nada inline`, () => {
      const h = html(p);
      expect(h).toMatch(/<html lang="pt-BR">/);
      expect(h).toMatch(/<title>[^<]+\| n\.360 · ness\.<\/title>/);
      expect(h).not.toMatch(/n\.iso/);
      expect(h).toContain('<meta name="theme-color" content="#0b1326">');
      expect(h).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(h).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
      expect(h).toMatch(/fonts\.googleapis\.com\/css2\?family=Montserrat:wght@500;600&family=Inter:[^"]+&family=JetBrains\+Mono/);
      // a comum antes da própria: a da página só acrescenta
      expect(h.indexOf('href="/publico.css"')).toBeGreaterThan(-1);
      expect(h.indexOf('href="/publico.css"')).toBeLessThan(h.indexOf(`href="/${p}.css"`));
      expect(h).not.toMatch(/<style\b/i);
      expect(h).not.toMatch(/\sstyle=/i);
      expect(h).not.toMatch(/\son[a-z]+\s*=/i);
      // topo com o produto e a ness., o ponto em accent; rodapé com a assinatura
      expect(h).toContain('<span class="pub-marca-produto">n<span class="dot">.</span>360</span>');
      expect(h).toContain('<span class="pub-marca-ness">ness<span class="dot">.</span></span>');
      expect(h).toContain('class="pub-rodape"');
    });

    it(`${p}.js: sem estilo inline nem diálogo nativo`, () => {
      const js = semComentario(JS[`../public/${p}.js`]).replace(/(^|[^:])\/\/.*$/gm, '$1');
      // estilo em atributo, ou visibilidade por .style (a altura do iframe da proposta, medida em tempo de execução, pode)
      expect(js).not.toMatch(/\sstyle="|\.style\.(opacity|display|color|background)/);
      expect(js).not.toMatch(/(?<![.\w$])(?:window\.)?(confirm|alert|prompt)\s*\(/);
    });
  }
});
