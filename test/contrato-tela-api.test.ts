import { describe, it, expect } from 'vitest';
import app from '../src/index';

/**
 * Contrato tela↔API (fatia de jornada, P1). Toda chamada do frontend a /api/v1 precisa casar
 * com uma rota registrada no app. Os testes de frontend dublam `api()`/`fetch` com o formato
 * que a TELA espera, então rota inexistente ou caminho errado passava neles e só aparecia como
 * 404 em produção (o questionário de autoatendimento chamava /public/assessment, a rota é
 * /assessments/public). Lado da tela: o fonte, via `?raw` (o workerd não tem node:fs). Lado do
 * servidor: `app.routes`, como em test/trilha-exclusao.test.ts.
 */
const FONTES = import.meta.glob(
  ['../frontend/src/**/*.js', '../frontend/public/**/*.{js,html}', '../frontend/login.html', '!../frontend/public/marked.min.js'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

type Chamada = { onde: string; metodo: string | null; caminho: string };

// Literal que começa em /api/v1: template (com `${...}` dentro, inclusive `${API_BASE}` na
// frente) ou string entre aspas simples/duplas.
const LITERAL = /`(?:\$\{API_BASE\})?(\/api\/v1(?:[^`$]|\$(?!\{)|\$\{[^}]*\})*)`|(['"])(\/api\/v1[^'"\n]*)\2/g;

/** Extrai as chamadas de um fonte: `${x}` e `'.../' + x` viram `:p`; query string sai. */
export function chamadasDoFonte(arquivo: string, src: string): Chamada[] {
  const out: Chamada[] = [];
  for (const m of src.matchAll(LITERAL)) {
    const inicio = m.index ?? 0;
    // A definição do auxiliar `url` (ficha da atividade) não é chamada: os usos dele são lidos no fim.
    if (/\burl\s*=\s*\([^)]*\)\s*=>\s*$/.test(src.slice(Math.max(0, inicio - 60), inicio))) continue;
    const antes = src.slice(Math.max(0, inicio - 40), inicio);
    let metodo = /api\(\s*'([A-Z]+)'\s*,\s*$/.exec(antes)?.[1] ?? null;
    // public/auditor.js e public/homologacao.js: chamar(caminho) faz sempre POST (conferido em teste próprio abaixo).
    if (!metodo && /frontend\/public\/(auditor|homologacao)\.js$/.test(arquivo) &&/\bchamar\(\s*$/.test(antes)) metodo = 'POST';
    if (!metodo && /fetch\(\s*(?:API_BASE\s*\+\s*)?$/.test(antes)) {
      // fetch sem `method:` é GET (padrão do fetch); o init vem logo depois do literal.
      const depois = src.slice(inicio + m[0].length, inicio + m[0].length + 200).split('fetch(')[0];
      metodo = /method:\s*['"]([A-Z]+)['"]/.exec(depois)?.[1] ?? 'GET';
    }
    let caminho: string;
    if (m[1] !== undefined) {
      const cru = m[1];
      // `${x}` logo depois de `/` é segmento; em outro lugar (`readiness-check${q}`) é sufixo/query.
      caminho = cru.replace(/\$\{[^}]*\}/g, (_x: string, pos: number) => (cru[pos - 1] === '/' ? ':p' : ''));
    } else {
      caminho = m[3];
    }
    // Concatenação: '/a/' + id + '/b' → /a/:p/b. Expressão depois de literal sem `/` final é
    // sufixo (ex.: '/api/v1/funil' + consulta) e não vira segmento.
    let resto = src.slice(inicio + m[0].length, inicio + m[0].length + 120);
    for (;;) {
      const expr = /^\s*\+\s*(?![`'"])[\w$.]+(?:\([^)]*\))?/.exec(resto);
      if (!expr) break;
      if (caminho.endsWith('/')) caminho += ':p';
      resto = resto.slice(expr[0].length);
      const lit = /^\s*\+\s*(['"])([^'"]*)\1/.exec(resto);
      if (!lit) break;
      caminho += lit[2];
      resto = resto.slice(lit[0].length);
    }
    caminho = caminho.split('?')[0];
    if (caminho.endsWith('/')) caminho += ':p';
    out.push({ onde: `${arquivo}:${src.slice(0, inicio).split('\n').length}`, metodo, caminho });
  }
  // Ficha da atividade (frontend/src/atividade/): `url(pid, rid, '/sufixo')` ou `url(ctx, '/sufixo')` monta
  // /api/v1/projects/:p/ropa/:p + sufixo. O sufixo tem de ser literal (senão a chamada some deste teste).
  if (/\burl\s*=\s*\([^)]*\)\s*=>\s*`\/api\/v1\/projects\/\$\{[^}]*\}\/ropa\/\$\{[^}]*\}\$\{/.test(src)) {
    for (const m of src.matchAll(/(?<![\w$.])url\(([^()]*)\)/g)) {
      const inicio = m.index ?? 0;
      const args = m[1].split(',').map((x) => x.trim());
      const suf = /^(['`])(.*)\1$/.exec(args[args.length - 1]);
      const sufixo = suf ? suf[2].replace(/\$\{[^}]*\}/g, (_x: string, pos: number) => (suf[2][pos - 1] === '/' ? ':p' : '')) : '';
      const antes = src.slice(Math.max(0, inicio - 40), inicio);
      const metodo = /api\(\s*'([A-Z]+)'\s*,\s*$/.exec(antes)?.[1] ?? (/fetch\(/.test(antes) ? 'GET' : null);
      out.push({ onde: `${arquivo}:${src.slice(0, inicio).split('\n').length}`, metodo, caminho: `/api/v1/projects/:p/ropa/:p${sufixo}` });
    }
  }
  return out;
}

// `ALL` é middleware (`app.use`), não rota; `/*` é o catch-all de assets, que casaria tudo.
const ROTAS = app.routes
  .filter((r) => r.method !== 'ALL' && r.path !== '/*')
  .map((r) => ({ metodo: r.method, segmentos: r.path.replace(/(.)\/$/, '$1').split('/') }));

/** `:p` do frontend só casa com parâmetro da rota, nunca com segmento literal (ação dinâmica vai para TOLERADAS). */
function casa(metodo: string | null, caminho: string): boolean {
  const seg = caminho.split('/');
  return ROTAS.some((r) =>
    (metodo === null || r.metodo === metodo)
    && r.segmentos.length === seg.length
    && r.segmentos.every((s, i) => s.startsWith(':') || s === seg[i]));
}

const chave = (c: { metodo: string | null; caminho: string }) => `${c.metodo ?? '*'} ${c.caminho}`;

/**
 * Chamadas que não casam sozinhas, cada uma com o motivo. `expande` lista os caminhos reais que
 * o trecho dinâmico produz no fonte (cada um tem de casar uma rota). Entrada sem chamada
 * correspondente reprova: tolerância velha não fica para trás.
 */
const TOLERADAS: { chave: string; motivo: string; expande: string[] }[] = [
  { chave: 'POST /api/v1/servicos/:p/:p', motivo: 'catalogo.js mudarSituacao(id, acao)', expande: ['POST /api/v1/servicos/:p/arquivar', 'POST /api/v1/servicos/:p/reativar'] },
  { chave: 'POST /api/v1/pedidos/:p/:p', motivo: 'meus-pedidos.js enviarDecisao(id, acao)', expande: ['POST /api/v1/pedidos/:p/aprovar', 'POST /api/v1/pedidos/:p/recusar'] },
  { chave: 'POST /api/v1/public/pedidos/:p', motivo: 'public/politicas.js postLink(acao)', expande: ['POST /api/v1/public/pedidos/ver', 'POST /api/v1/public/pedidos/codigo', 'POST /api/v1/public/pedidos/ciencia'] },
  { chave: '* /api/v1/public/propostas/:p', motivo: "public/proposta.js: const API = '/api/v1/public/propostas/'; chamar(acao)", expande: ['POST /api/v1/public/propostas/ver', 'POST /api/v1/public/propostas/aceitar', 'POST /api/v1/public/propostas/ajuste', 'POST /api/v1/public/propostas/recusar'] },
  { chave: 'GET /api/v1/projects/:p/export/:p', motivo: 'monitor.js exportCSV(type)', expande: ['GET /api/v1/projects/:p/export/risks', 'GET /api/v1/projects/:p/export/vendors', 'GET /api/v1/projects/:p/export/training', 'GET /api/v1/projects/:p/export/assets'] },
  { chave: '* /api/v1/auth/mfa/:p', motivo: 'api.js: prefixo de startsWith que isenta o 401 do MFA; não é chamada', expande: ['POST /api/v1/auth/mfa/verify'] },
  { chave: '* /api/v1/projects/:p/ropa/:p', motivo: 'atividade/estado.js novoAutosave({ rota }): o sufixo vem do chamador (PUT)', expande: ['PUT /api/v1/projects/:p/ropa/:p/escopo', 'PUT /api/v1/projects/:p/ropa/:p/agentes', 'PUT /api/v1/projects/:p/ropa/:p/ciclo'] },
  { chave: 'PUT /api/v1/projects/:p/ropa/:p', motivo: 'atividade/estado.js gravarAgora({ rota }): idem', expande: ['PUT /api/v1/projects/:p/ropa/:p/agentes', 'PUT /api/v1/projects/:p/ropa/:p/ciclo'] },
  // Temporárias deste plano: cada tarefa que corrige a chamada apaga a entrada.
];

const CHAMADAS = Object.entries(FONTES).flatMap(([arq, src]) => chamadasDoFonte(arq.replace(/^\.\.\//, ''), src));

describe('contrato tela↔API', () => {
  it('o teste não olha o vazio: há chamadas e rotas, e caminho inventado não casa', () => {
    expect(CHAMADAS.length).toBeGreaterThan(250);
    expect(ROTAS.length).toBeGreaterThan(100);
    expect(casa('GET', '/api/v1/nao-existe')).toBe(false);
    expect(casa('GET', '/api/v1/projects/:p/risks')).toBe(true);
    expect(casa('POST', '/api/v1/servicos/:p/:p')).toBe(false);
  });

  it('a tela de importação tem as chamadas conferidas contra as rotas (nada fica fora por montar o caminho)', () => {
    const minhas = CHAMADAS.filter((c) => c.onde.includes('views/importacao.js')).map(chave);
    for (const k of ['GET /api/v1/projects/:p/importacoes', 'POST /api/v1/projects/:p/importacoes', 'GET /api/v1/projects/:p/importacoes/:p', 'DELETE /api/v1/projects/:p/importacoes/:p',
      'POST /api/v1/projects/:p/importacoes/:p/arquivos', 'POST /api/v1/projects/:p/importacoes/:p/arquivos/:p/processar', 'PUT /api/v1/projects/:p/importacoes/:p/itens/:p', 'POST /api/v1/projects/:p/importacoes/:p/confirmar',
      'GET /api/v1/projects/:p/importacoes/:p/reconciliacao']) {
      expect(minhas, k).toContain(k);
    }
  });

  it('normaliza as formas de caminho que o frontend usa', () => {
    const src = [
      "api('GET', `/api/v1/projects/${p.id}/readiness-check${comIA ? '?ai=1' : ''}`)",
      "api('POST', '/api/v1/leads/' + lead.id + '/enrich-cnpj', { cnpj })",
      "fetch(API_BASE + '/api/v1/public/x/' + encodeURIComponent(t))",
      'fetch(`${API_BASE}/api/v1/projects/${id}/evidence/${e}/download`)',
      "api('GET', '/api/v1/funil' + consulta)",
      'window.open(`/api/v1/projects/${p}/ropa/report?token=${S.token}`)',
      "fetch(`/api/v1/public/y/${a}`, { method: 'POST', body })",
    ].join('\n');
    expect(chamadasDoFonte('f.js', src).map(chave)).toEqual([
      'GET /api/v1/projects/:p/readiness-check',
      'POST /api/v1/leads/:p/enrich-cnpj',
      'GET /api/v1/public/x/:p',
      'GET /api/v1/projects/:p/evidence/:p/download',
      'GET /api/v1/funil',
      '* /api/v1/projects/:p/ropa/report',
      'POST /api/v1/public/y/:p',
    ]);
  });

  it('nenhuma chamada monta o caminho fora de um literal /api/v1 (senão escaparia deste teste)', () => {
    // Cada uma destas recebe literais /api/v1 que o extrator já pega na origem.
    const PERMITIDAS = [
      'frontend/public/auditor.js: fetch(caminho',
      'frontend/public/homologacao.js: fetch(caminho',
      'frontend/public/proposta.js: fetch(API + acao',
      'frontend/src/api.js: fetch(API_BASE + p',
      // baixarArquivo(`/api/v1/...`) (F4): CSV e Word; o literal está em cada chamada e o token vai no cabeçalho.
      'frontend/src/api.js: fetch(API_BASE + p',
      // /health fica fora de /api/v1 por desenho: o domínio antigo pergunta o endereço canônico (n.360, fatia 1).
      // Ficha da atividade: o `rota`/`caminho` dos autosaves vem dos chamadores (literais), tolerado acima.
      "frontend/src/atividade/estado.js: api('PUT', caminho || url(pid",
      'frontend/src/produto.js: fetch(\'/health\'',
      // Relatórios do RoPA e do RIPD: abrirRelatorio(`/api/v1/...`) recebe o literal; o fetch leva o token no cabeçalho, não na URL.
      'frontend/src/views/privacy.js: fetch(API_BASE + caminho',
      'frontend/src/views/propostas.js: api(\'GET\', caminho',
      'frontend/src/views/propostas.js: fetch(API_BASE + caminho',
    ];
    const DINAMICA = /\b(?:api\(\s*'[A-Z]+'\s*,|fetch\()\s*(?!\s)(?!(?:API_BASE\s*\+\s*|`\$\{API_BASE\}\$\{|`\$\{)?url\()(?!(?:API_BASE\s*\+\s*)?['"`](?:\$\{API_BASE\})?\/api\/v1)[^,)\n]*/g;
    const achadas = Object.entries(FONTES)
      .flatMap(([arq, src]) => [...src.matchAll(DINAMICA)].map((m) => `${arq.replace(/^\.\.\//, '')}: ${m[0].trim()}`))
      .sort();
    expect(achadas).toEqual(PERMITIDAS);
  });

  it('public/auditor.js: chamar() recebe o caminho literal, e as cinco chamadas são vistas, todas POST', () => {
    expect(CHAMADAS.filter((c) => c.onde.startsWith('frontend/public/auditor.js:')).map(chave)).toEqual([
      'POST /api/v1/public/auditor/ver',
      'POST /api/v1/public/auditor/evidencia',
      'POST /api/v1/public/auditor/pedidos',
      'POST /api/v1/public/auditor/notas',
      'POST /api/v1/public/auditor/notas/criar',
    ]);
    const src = FONTES['../frontend/public/auditor.js'];
    // toda chamada (fora a definição) começa pelo literal do prefixo, e chamar() faz POST
    const usos = [...src.matchAll(/(?<!function )\bchamar\(\s*(.{0,40})/g)].map((m) => m[1]);
    expect(usos.length).toBe(5);
    for (const u of usos) expect(u.startsWith("'/api/v1/public/auditor/"), u).toBe(true);
    expect(/async function chamar[\s\S]*?method:\s*'POST'/.test(src)).toBe(true);
  });

  it('public/homologacao.js: chamar() recebe o caminho literal, e as três chamadas são vistas, todas POST', () => {
    expect(CHAMADAS.filter((c) => c.onde.startsWith('frontend/public/homologacao.js:')).map(chave)).toEqual([
      'POST /api/v1/public/homologacao/ver',
      'POST /api/v1/public/homologacao/salvar',
      'POST /api/v1/public/homologacao/enviar',
    ]);
    expect(/async function chamar[\s\S]*?method:\s*'POST'/.test(FONTES['../frontend/public/homologacao.js'])).toBe(true);
  });

  it('toda chamada do frontend tem rota (ou tolerância com motivo)', () => {
    const toleradas = new Set(TOLERADAS.map((t) => t.chave));
    const orfas = CHAMADAS.filter((c) => !casa(c.metodo, c.caminho) && !toleradas.has(chave(c)));
    expect(orfas.map((c) => `${chave(c)} @ ${c.onde}`), 'chamada sem rota no backend').toEqual([]);
  });

  it('toda tolerância ainda tem chamada, e cada expansão casa uma rota', () => {
    for (const t of TOLERADAS) {
      expect(CHAMADAS.some((c) => chave(c) === t.chave && !casa(c.metodo, c.caminho)), `tolerância velha: ${t.chave}`).toBe(true);
      for (const e of t.expande) {
        const [metodo, caminho] = e.split(' ');
        expect(casa(metodo, caminho), `expansão sem rota: ${e}`).toBe(true);
      }
    }
  });
});
