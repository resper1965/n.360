# Consulta pública do pedido do titular pelo protocolo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o titular que abriu o pedido pelo portal `/solicitacao` consulta a situação e as datas com protocolo + código de acompanhamento.

**Architecture:** coluna `titular_pedidos.acompanhamento_hash` (migration 0105, só o SHA-256). O código nasce em `abrirPedidoPortal`, volta
uma vez na resposta e no e-mail; `POST /api/v1/public/titular-pedidos/consultar` acha o pedido pelo hash e confere o protocolo. A página
pública ganha a área de consulta, que abre sem o token do portal.

**Tech Stack:** Cloudflare Workers (Hono), D1, zod, vitest com D1 real (`cloudflare:test`), página pública em JS clássico (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-06-titular-consulta-protocolo-design.md`

## Global Constraints

- Só o SHA-256 do código no banco; o código não volta por nenhuma rota depois da abertura.
- Código: 16 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, CSPRNG sem viés de módulo, grupos de 4 com hífen (`K7QM-3XRP-9WTD-H2FN`).
- Falha da consulta (código desconhecido, formato do código, protocolo que não confere): o MESMO 404 `{ error: 'Protocolo ou código não conferem' }`.
- Resposta da consulta: só `protocolo, tipo, status, recebido_em, prazo_em, respondido_em`.
- A consulta não depende do portal estar ativo. Sem trilha por consulta.
- Página pública: script clássico, sem handler nem `<script>` inline (CSP); fragmento sai da barra (`history.replaceState`).
- Texto em português; datas na tela em dd/mm/aaaa.
- Migration só em produção com backup e o "sim" do dono.

---

### Task 1: migration 0105

**Files:**
- Create: `migrations/0105_titular_acompanhamento.sql`
- Modify: `schema.sql` (tabela `titular_pedidos` e índice logo depois de `idx_titular_pedidos_projeto`)
- Test: `test/migration-0105.test.ts`

**Interfaces:** Produces: coluna `titular_pedidos.acompanhamento_hash TEXT` e índice único parcial `idx_titular_pedidos_acompanhamento`.

- [ ] **Step 1: teste**

```ts
// test/migration-0105.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import mig from '../migrations/0105_titular_acompanhamento.sql?raw';

describe('migration 0105: código de acompanhamento do pedido do titular', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m5a', 'A', 'LGPD', 'Controller', 'Active', 'org_ness')`).run();
  });
  it('coluna e índice único parcial; o índice é repetível', async () => {
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name = 'acompanhamento_hash'`).all()).results;
    expect(cols).toHaveLength(1);
    const ins = (id: string, prot: string, h: string | null) => env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em, acompanhamento_hash) VALUES (?, 'm5a', ?, 'acesso', '2026-11-01', ?)`).bind(id, prot, h).run();
    await ins('m5p1', 'PT-2026-0001', null);
    await ins('m5p2', 'PT-2026-0002', null); // vários sem código
    await ins('m5p3', 'PT-2026-0003', 'abc');
    await expect(ins('m5p4', 'PT-2026-0004', 'abc')).rejects.toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/migration-0105.test.ts` → FAIL (arquivo da migration não existe).
- [ ] **Step 3: migration e schema**

```sql
-- 0105_titular_acompanhamento.sql — código de acompanhamento do pedido do titular (spec 2026-11-06-titular-consulta-protocolo-design).
-- Aditiva: o ALTER roda uma vez pelo runner; o índice é repetível. Só o SHA-256 do código; pedido sem código não é consultável.
-- Verificar: SELECT name FROM pragma_table_info('titular_pedidos') WHERE name = 'acompanhamento_hash'; -- 1 linha
--            SELECT name FROM sqlite_master WHERE name = 'idx_titular_pedidos_acompanhamento'; -- 1 linha
ALTER TABLE titular_pedidos ADD COLUMN acompanhamento_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_titular_pedidos_acompanhamento ON titular_pedidos(acompanhamento_hash) WHERE acompanhamento_hash IS NOT NULL;
```

No `schema.sql`, depois de `identidade_em TEXT,`:

```sql
    -- Consulta pública (migration 0105): só o SHA-256 do código de acompanhamento gerado na abertura pelo portal.
    acompanhamento_hash TEXT,
```

e depois de `CREATE INDEX IF NOT EXISTS idx_titular_pedidos_projeto ...;`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_titular_pedidos_acompanhamento ON titular_pedidos(acompanhamento_hash) WHERE acompanhamento_hash IS NOT NULL;
```

- [ ] **Step 4:** `npx vitest run test/migration-0105.test.ts test/migration-0058.test.ts test/migrations-consistencia.test.ts test/schema-contract.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(privacy): migration 0105, código de acompanhamento do pedido do titular`.

### Task 2: código, consulta e rota pública

**Files:**
- Modify: `src/services/titular-pedidos.ts` (`criarPedido`, `abrirPedidoPortal`; novas `gerarCodigoAcompanhamento`, `normalizarCodigo`, `consultarPedidoPortal`)
- Modify: `src/schemas/nucleo.ts` (`portalConsultarSchema`, logo depois de `portalAbrirSchema`; exportado pelo índice de `src/schemas`)
- Modify: `src/routes/public-titular.ts` (`/abrir` devolve `codigo`; nova `/consultar`)
- Modify: `src/openapi.ts` (registro do corpo) e `npm run openapi`
- Test: `test/titular-consulta.test.ts`

**Interfaces:**
- Consumes: coluna da Task 1.
- Produces: `gerarCodigoAcompanhamento(): string`; `normalizarCodigo(s: string): string | null`;
  `abrirPedidoPortal(...)` → `{ ok: true; id; protocolo; prazo_em; codigo: string }`;
  `consultarPedidoPortal(db, protocolo, codigo)` → `ConsultaPublica | null`, com
  `type ConsultaPublica = { protocolo: string; tipo: string; status: string; recebido_em: string; prazo_em: string | null; respondido_em: string | null }`;
  resposta 201 de `/abrir`: `{ ok: true, protocolo, codigo }` (a Task 3 usa `codigo` no e-mail; a Task 4, na tela).

- [ ] **Step 1: teste de integração**

```ts
// test/titular-consulta.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { gerarCodigoAcompanhamento, normalizarCodigo } from '../src/services/titular-pedidos';

/** Consulta pública do pedido do titular (migration 0105, spec 2026-11-06-titular-consulta-protocolo). */
const P = 'tc-proj', Q = 'tc-outro';
const post = (caminho: string, corpo: unknown, h: Record<string, string> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(corpo) }), workerEnv());
const abrir = (token: string, ip = '10.0.0.1') => post('/api/v1/public/titular-pedidos/abrir',
  { token, tipo: 'acesso', titular_nome: 'Fulano', titular_contato: 'fulano@exemplo.com', descricao: 'Quero acesso.' }, { 'CF-Connecting-IP': ip });
const consultar = (corpo: unknown, ip = '10.0.0.2') => post('/api/v1/public/titular-pedidos/consultar', corpo, { 'CF-Connecting-IP': ip });

let consultor: Record<string, string>;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, Q),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('tc-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc1', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor'), ('g-tc2', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P, Q),
  ]);
  for (const p of [P, Q]) await habilitarPrivacy(p);
  await concederModulos(['tc-cons'], ['privacy']);
  consultor = await sessionFor({ id: 'tc-cons', email: 'cons@ness.teste', role: 'consultor' });
  for (const p of [P, Q]) {
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${p}/titular-portal`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor }, body: '{}' }), workerEnv());
    tokens[p] = ((await r.json()) as { url: string }).url.split('#')[1];
  }
});

describe('código de acompanhamento', () => {
  it('formato, alfabeto sem ambíguos e normalização', () => {
    const c = gerarCodigoAcompanhamento();
    expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
    expect(gerarCodigoAcompanhamento()).not.toBe(c);
    expect(normalizarCodigo(c.toLowerCase().replace(/-/g, ' '))).toBe(c);
    expect(normalizarCodigo('K7QM3XRP9WTDH2F')).toBeNull(); // 15
    expect(normalizarCodigo('O7QM-3XRP-9WTD-H2FN')).toBeNull(); // O fora do alfabeto
  });
});

describe('abrir e consultar', () => {
  let protocolo = '', codigo = '', protocoloQ = '', codigoQ = '';

  it('a abertura devolve o código e grava só o hash', async () => {
    const r = await abrir(tokens[P]);
    expect(r.status, await r.clone().text()).toBe(201);
    ({ protocolo, codigo } = await r.json() as { protocolo: string; codigo: string });
    expect(codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}$/);
    const linha = await env.DB.prepare('SELECT * FROM titular_pedidos WHERE project_id = ? AND protocolo = ?').bind(P, protocolo).first<Record<string, unknown>>();
    expect(linha!.acompanhamento_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(linha)).not.toContain(codigo);
    const q = await (await abrir(tokens[Q])).json() as { protocolo: string; codigo: string };
    ({ protocolo: protocoloQ, codigo: codigoQ } = q);
    expect(protocoloQ).toBe(protocolo); // protocolo se repete entre projetos: o código decide
  });

  it('a consulta certa devolve só situação e datas', async () => {
    const r = await consultar({ protocolo, codigo });
    expect(r.status, await r.clone().text()).toBe(200);
    const d = await r.json() as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(['prazo_em', 'protocolo', 'recebido_em', 'respondido_em', 'status', 'tipo']);
    expect(d).toMatchObject({ protocolo, tipo: 'acesso', status: 'recebido', respondido_em: null });
  });

  it('código em minúsculas, sem hífen e protocolo em minúsculas também consultam', async () => {
    const r = await consultar({ protocolo: protocolo.toLowerCase(), codigo: codigo.toLowerCase().replace(/-/g, '') });
    expect(r.status).toBe(200);
  });

  it('código errado, código de outro pedido e formato de código inválido: o mesmo 404', async () => {
    const errado = codigo.slice(0, -1) + (codigo.endsWith('2') ? '3' : '2');
    const respostas = await Promise.all([
      consultar({ protocolo, codigo: errado }),
      consultar({ protocolo: 'PT-2026-9999', codigo: codigoQ }),
      consultar({ protocolo, codigo: 'nada-a-ver' }),
    ]);
    for (const r of respostas) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: 'Protocolo ou código não conferem' });
    }
    // o código do outro projeto com o mesmo número de protocolo devolve o pedido DELE, nunca o deste
    const outro = await (await consultar({ protocolo, codigo: codigoQ })).json() as { protocolo: string };
    expect(outro.protocolo).toBe(protocoloQ);
  });

  it('campo a mais ou protocolo fora do formato: 400', async () => {
    expect((await consultar({ protocolo, codigo, projeto: P })).status).toBe(400);
    expect((await consultar({ protocolo: 'XX-1', codigo })).status).toBe(400);
  });

  it('a situação acompanha o atendimento; o texto da resposta não sai', async () => {
    const id = (await env.DB.prepare('SELECT id FROM titular_pedidos WHERE project_id = ? AND protocolo = ?').bind(P, protocolo).first<{ id: string }>())!.id;
    await env.DB.prepare(`UPDATE titular_pedidos SET status = 'respondido', respondido_em = '2026-11-06', resposta_texto = 'Segredo da resposta' WHERE id = ?`).bind(id).run();
    const r = await consultar({ protocolo, codigo });
    const d = await r.json() as Record<string, unknown>;
    expect(d).toMatchObject({ status: 'respondido', respondido_em: '2026-11-06' });
    expect(JSON.stringify(d)).not.toContain('Segredo');
  });

  it('portal desligado: a consulta continua', async () => {
    await env.DB.prepare('UPDATE titular_portais SET ativo = 0 WHERE project_id = ?').bind(P).run();
    expect((await consultar({ protocolo, codigo })).status).toBe(200);
  });

  it('pedido sem código (registrado pelo DPO) não é consultável', async () => {
    const r = await app.fetch(new Request(`http://localhost/api/v1/projects/${Q}/titular-pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor }, body: JSON.stringify({ tipo: 'acesso', canal: 'email' }) }), workerEnv());
    expect(r.status, await r.clone().text()).toBe(201);
    const linha = await env.DB.prepare(`SELECT acompanhamento_hash FROM titular_pedidos WHERE project_id = ? AND canal = 'email'`).bind(Q).first<{ acompanhamento_hash: string | null }>();
    expect(linha!.acompanhamento_hash).toBeNull();
  });

  it('limite por IP: 429', async () => {
    let ultimo = 0;
    for (let i = 0; i < 31; i++) ultimo = (await consultar({ protocolo, codigo: 'nada-a-ver' }, '10.9.9.9')).status;
    expect(ultimo).toBe(429);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/titular-consulta.test.ts` → FAIL (`gerarCodigoAcompanhamento` não existe).
- [ ] **Step 3: serviço** (`src/services/titular-pedidos.ts`)

`criarPedido` ganha o 5º parâmetro opcional `acompanhamentoHash: string | null = null` e o INSERT grava a coluna:

```ts
export async function criarPedido(db: D1Database, projectId: string, ator: string, d: NovoPedido, acompanhamentoHash: string | null = null): Promise<...mesmo tipo...> {
  ...
    `INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, prazo_em, responsavel_parte_id, criado_por, acompanhamento_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, protocolo, d.tipo, d.canal ?? 'outro', d.titular_nome ?? null, d.titular_contato ?? null, d.descricao ?? null, recebido, prazo, d.responsavel_parte_id ?? null, ator, acompanhamentoHash).run());
```

Junto do portal:

```ts
// Código de acompanhamento (migration 0105): 16 símbolos sem ambíguos (0/O, 1/I/L), ~79 bits; só o SHA-256 vai ao banco.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const agrupar = (s: string) => s.match(/.{4}/g)!.join('-');

export function gerarCodigoAcompanhamento(): string {
  let s = '';
  const byte = new Uint8Array(1);
  while (s.length < 16) {
    crypto.getRandomValues(byte);
    if (byte[0] < 248) s += ALFABETO[byte[0] % 31]; // 248 = 31 * 8: sem viés de módulo
  }
  return agrupar(s);
}

/** O código como digitado (minúsculas, espaço, hífen) no formato canônico; null se não pode ser um código. */
export function normalizarCodigo(s: string): string | null {
  const limpo = s.toUpperCase().replace(/[\s-]/g, '');
  return limpo.length === 16 && [...limpo].every((ch) => ALFABETO.includes(ch)) ? agrupar(limpo) : null;
}

export async function abrirPedidoPortal(db: D1Database, projectId: string, d: AberturaPortal): Promise<Falha | { ok: true; id: string; protocolo: string; prazo_em: string | null; codigo: string }> {
  const codigo = gerarCodigoAcompanhamento();
  const r = await criarPedido(db, projectId, 'sistema:portal', { tipo: d.tipo, canal: 'formulario', titular_nome: d.titular_nome, titular_contato: d.titular_contato, descricao: d.descricao }, await sha256Hex(codigo));
  return r.ok ? { ...r, codigo } : r;
}

export type ConsultaPublica = { protocolo: string; tipo: string; status: string; recebido_em: string; prazo_em: string | null; respondido_em: string | null };

/** Consulta pública: acha pelo hash do código e confere o protocolo. null para qualquer falha (a rota dá o mesmo 404). */
export async function consultarPedidoPortal(db: D1Database, protocolo: string, codigo: string): Promise<ConsultaPublica | null> {
  const canonico = normalizarCodigo(codigo);
  if (!canonico) return null;
  const p = await db.prepare('SELECT protocolo, tipo, status, recebido_em, prazo_em, respondido_em FROM titular_pedidos WHERE acompanhamento_hash = ?')
    .bind(await sha256Hex(canonico)).first<ConsultaPublica>();
  return p && p.protocolo === protocolo.toUpperCase() ? p : null;
}
```

- [ ] **Step 4: esquema** (`src/schemas/nucleo.ts`, depois de `portalAbrirSchema`; conferir que `src/schemas/index.ts` reexporta `nucleo`)

```ts
/** Consulta pública do pedido (migration 0105): protocolo PT-AAAA-NNNN (maiúscula ou minúscula) e o código de acompanhamento. */
export const portalConsultarSchema = z.object({
  protocolo: z.string().trim().max(20).regex(/^PT-\d{4}-\d+$/i, 'Protocolo no formato PT-AAAA-NNNN'),
  codigo: z.string().trim().min(1).max(40),
}).strict();
```

- [ ] **Step 5: rota** (`src/routes/public-titular.ts`): importar `portalConsultarSchema` e `consultarPedidoPortal`; em `/abrir` responder
  `c.json({ ok: true, protocolo: r.protocolo, codigo: r.codigo }, 201)`; e:

```ts
/** Consulta pública do andamento: protocolo + código de acompanhamento no corpo. Não depende do link do portal (o código é a credencial). */
publicTitularApp.post('/consultar', async (c) => {
  try {
    const v = await validateBody(c, portalConsultarSchema);
    if (!v.success) return v.response;
    const p = await consultarPedidoPortal(c.env.DB, v.data.protocolo, v.data.codigo);
    if (!p) return c.json({ error: 'Protocolo ou código não conferem' }, 404);
    return c.json(p);
  } catch (e) { return erro500(c, 'Falha ao consultar a solicitação', e); }
});
```

Atualizar o comentário do topo do arquivo: a consulta não usa o token do portal.

- [ ] **Step 6: openapi**: em `src/openapi.ts`, logo depois da linha de `/abrir`:

```ts
  { metodo: 'POST', caminho: '/api/v1/public/titular-pedidos/consultar', schema: portalConsultarSchema, nome: 'portalConsultarSchema' },
```

(e o import de `portalConsultarSchema`); depois `npm run openapi`.

- [ ] **Step 7:** `npx vitest run test/titular-consulta.test.ts test/titular-portal.test.ts test/openapi*.test.ts test/validation-contract.test.ts` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 8:** commit `feat(privacy): consulta pública do pedido do titular pelo protocolo e código`.

### Task 3: e-mail do protocolo com o código e o link

**Files:**
- Modify: `src/services/emails.ts` (`emailProtocoloTitular`)
- Modify: `src/routes/public-titular.ts` (passa `codigo` e `link`; importar `appUrl` de `../config/url`)
- Modify: `scripts/emails-amostra.mjs` (só a linha `protocolo-titular`) e regenerar só `docs/design/emails/protocolo-titular.*`
- Test: `test/emails-marca.test.ts` (o caso existente do protocolo)

**Interfaces:** Consumes: `codigo` de `abrirPedidoPortal` (Task 2). Produces: `emailProtocoloTitular(d: { protocolo: string; codigo: string; link: string })`.

- [ ] **Step 1: teste** — trocar o caso existente:

```ts
  it('protocolo do titular: protocolo, código e o link de acompanhamento', () => {
    const link = 'https://n360.ness.com.br/solicitacao#acompanhar=PT-2026-0042.K7QM-3XRP-9WTD-H2FN';
    const m = emailProtocoloTitular({ protocolo: 'PT-2026-0042', codigo: 'K7QM-3XRP-9WTD-H2FN', link });
    expect(m.assunto).toContain('PT-2026-0042');
    for (const s of [m.html, m.text]) {
      expect(s).toContain('PT-2026-0042');
      expect(s).toContain('K7QM-3XRP-9WTD-H2FN');
      expect(s).toContain(link);
    }
  });
```

E, em `test/titular-consulta.test.ts`, nada de e-mail real (sem `RESEND_API_KEY` o envio é pulado).

- [ ] **Step 2:** `npx vitest run test/emails-marca.test.ts` → FAIL.
- [ ] **Step 3: e-mail**

```ts
export function emailProtocoloTitular(d: { protocolo: string; codigo: string; link: string }): EmailComAssunto {
  return com(`Recebemos sua solicitação — protocolo ${d.protocolo}`, {
    previa: `Sua solicitação foi recebida. Guarde o protocolo ${d.protocolo} e o código de acompanhamento.`,
    titulo: 'Solicitação recebida',
    saudacao: ola(null),
    paragrafos: [
      'Recebemos sua solicitação sobre seus dados pessoais.',
      `Protocolo: ${d.protocolo}. Código de acompanhamento: ${d.codigo}.`,
      'Com os dois você acompanha a situação do atendimento. A resposta chega por e-mail.',
    ],
    botao: { rotulo: 'Acompanhar a solicitação', url: d.link },
    notas: ['Não compartilhe o código: quem o tiver vê a situação do seu pedido.', 'Se você não fez esta solicitação, ignore este e-mail.'],
    motivo: 'você abriu uma solicitação sobre seus dados pessoais no portal desta organização.',
  });
}
```

Na rota `/abrir`:

```ts
      const link = `${appUrl(c.env)}/solicitacao#acompanhar=${r.protocolo}.${r.codigo}`;
      const m = emailProtocoloTitular({ protocolo: r.protocolo, codigo: r.codigo, link });
```

- [ ] **Step 4:** amostra: `'protocolo-titular': m.emailProtocoloTitular({ protocolo: 'PT-2026-0001', codigo: 'K7QM-3XRP-9WTD-H2FN', link: 'https://n360.ness.com.br/solicitacao#acompanhar=PT-2026-0001.K7QM-3XRP-9WTD-H2FN' }),`;
  rodar o gerador conforme o cabeçalho de `scripts/emails-amostra.mjs`, depois `git checkout -- docs/design/emails` e `git add` só
  `docs/design/emails/protocolo-titular.*` (o gerador reescreve todas as amostras com a data do dia).
- [ ] **Step 5:** `npx vitest run test/emails-marca.test.ts test/titular-consulta.test.ts test/titular-portal.test.ts` → PASS.
- [ ] **Step 6:** commit `feat(privacy): e-mail do protocolo leva o código e o link de acompanhamento`.

### Task 4: página `/solicitacao` com a área de consulta

**Files:**
- Modify: `frontend/public/solicitacao.html`, `frontend/public/solicitacao.js`, `frontend/public/solicitacao.css`
- Test: `frontend/test/solicitacao-consulta.test.js`

**Interfaces:** Consumes: `POST /api/v1/public/titular-pedidos/consultar` → `ConsultaPublica` ou 404 `{ error }`; `/abrir` → `{ protocolo, codigo }`.
Produces: `window.solicitacaoPublica = { iniciar }` (gancho de teste, como `homologacaoPublica`).

- [ ] **Step 1: teste jsdom**

```js
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
```

- [ ] **Step 2:** `cd frontend && npx vitest run test/solicitacao-consulta.test.js` → FAIL.
- [ ] **Step 3: HTML** — no `<form id="sl-form">`, depois da `sl-nota`:

```html
      <p class="sl-nota"><button class="pub-btn pub-btn-contorno pub-btn-pequeno" id="sl-ir-consulta" type="button">Acompanhar uma solicitação</button></p>
```

na seção `sl-estado`, depois do texto:

```html
      <p><button class="pub-btn pub-btn-contorno pub-btn-pequeno" id="sl-ir-consulta-estado" type="button">Acompanhar uma solicitação</button></p>
```

na seção `sl-ok`, depois de `sl-protocolo`:

```html
      <p class="pub-estado-texto">Código de acompanhamento (também enviado ao seu e-mail):</p>
      <p class="sl-protocolo" id="sl-codigo"></p>
      <p class="pub-texto-dim">Guarde o protocolo e o código. Com os dois você acompanha a situação nesta página.</p>
```

e uma seção nova depois de `sl-ok`:

```html
    <form id="sl-consulta" novalidate hidden>
      <h1 class="pub-titulo" tabindex="-1" id="sl-c-titulo">Acompanhar uma solicitação</h1>
      <p class="pub-texto">Informe o protocolo e o código de acompanhamento que você recebeu ao abrir a solicitação.</p>
      <div class="pub-campo">
        <label class="pub-rotulo" for="sl-c-protocolo">Protocolo</label>
        <input class="pub-input" id="sl-c-protocolo" type="text" maxlength="20" autocomplete="off" placeholder="PT-2026-0001" required>
      </div>
      <div class="pub-campo">
        <label class="pub-rotulo" for="sl-c-codigo">Código de acompanhamento</label>
        <input class="pub-input" id="sl-c-codigo" type="text" maxlength="40" autocomplete="off" spellcheck="false" required>
      </div>
      <p class="pub-erro" id="sl-c-erro" role="alert"></p>
      <button class="pub-btn pub-btn-primario" id="sl-c-enviar" type="submit">Consultar</button>
      <dl class="sl-resultado" id="sl-c-resultado" role="status" aria-live="polite" hidden></dl>
    </form>
```

- [ ] **Step 4: CSS** (`solicitacao.css`):

```css
.sl-resultado { margin: 24px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; }
.sl-resultado dt { color: var(--text-dim); }
.sl-resultado dd { margin: 0; }
```

- [ ] **Step 5: JS** (`solicitacao.js`):
  - `estado()` e `mostrarFormulario()` também escondem `sl-consulta`; o `enviar` preenche `$('sl-codigo').textContent = dados.codigo || ''`.
  - Rótulos:

```js
    const SITUACAO = { recebido: 'Recebida', em_andamento: 'Em andamento', respondido: 'Respondida', negado: 'Negada', arquivado: 'Arquivada' };
    const ROTULO_TIPO = Object.fromEntries(TIPOS);
    const data = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : 'Não definido');
```

  - Funções:

```js
    function mostrarConsulta(protocolo, codigo) {
        for (const id of ['sl-form', 'sl-estado', 'sl-ok']) $(id).hidden = true;
        $('sl-consulta').hidden = false;
        if (protocolo) $('sl-c-protocolo').value = protocolo;
        if (codigo) $('sl-c-codigo').value = codigo;
        $('sl-c-titulo').focus();
    }

    function linha(dl, rotulo, valor) {
        const dt = document.createElement('dt');
        dt.textContent = rotulo;
        const dd = document.createElement('dd');
        dd.textContent = valor;
        dl.append(dt, dd);
    }

    async function consultar(ev) {
        if (ev) ev.preventDefault();
        const erro = $('sl-c-erro');
        const res = $('sl-c-resultado');
        const botao = $('sl-c-enviar');
        erro.textContent = '';
        res.hidden = true;
        const corpo = { protocolo: $('sl-c-protocolo').value.trim().toUpperCase(), codigo: $('sl-c-codigo').value.trim() };
        if (!corpo.protocolo || !corpo.codigo) { erro.textContent = 'Informe o protocolo e o código de acompanhamento.'; return; }
        botao.disabled = true;
        let r;
        try {
            r = await fetch('/api/v1/public/titular-pedidos/consultar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'omit', cache: 'no-store',
            });
        } catch {
            botao.disabled = false;
            erro.textContent = 'Não foi possível consultar agora. Verifique sua conexão e tente de novo.';
            return;
        }
        botao.disabled = false;
        let d = {};
        try { d = await r.json(); } catch { /* corpo não-JSON */ }
        if (!r.ok) { erro.textContent = (d && d.error) || 'Não foi possível consultar. Tente de novo.'; return; }
        res.innerHTML = '';
        linha(res, 'Protocolo', d.protocolo);
        linha(res, 'Situação', SITUACAO[d.status] || d.status);
        linha(res, 'Tipo', ROTULO_TIPO[d.tipo] || d.tipo);
        linha(res, 'Aberta em', data(d.recebido_em));
        linha(res, 'Prazo', data(d.prazo_em));
        if (d.respondido_em) linha(res, 'Concluída em', data(d.respondido_em));
        res.hidden = false;
    }
```

  - `iniciar()`:

```js
    function iniciar() {
        if (!$('sl-main')) return; // importado pelo teste antes de a página existir
        $('sl-consulta').addEventListener('submit', consultar);
        $('sl-ir-consulta').addEventListener('click', () => mostrarConsulta());
        $('sl-ir-consulta-estado').addEventListener('click', () => mostrarConsulta());
        const doHash = (location.hash || '').replace(/^#/, '').trim();
        if (doHash.startsWith('acompanhar=')) {
            // link do e-mail: <protocolo>.<código>; nunca vira o token do portal
            const [protocolo, codigo] = decodeURIComponent(doHash.slice('acompanhar='.length)).split('.');
            try { history.replaceState(null, '', location.pathname); } catch { /* ok */ }
            mostrarConsulta(protocolo, codigo);
            if (protocolo && codigo) consultar();
            return;
        }
        if (doHash) {
            token = doHash;
            guardar(token);
            try { history.replaceState(null, '', location.pathname); } catch { /* ok */ }
        } else {
            token = guardado();
        }
        if (!token) return estado(INVALIDO.titulo, 'Abra o link que a organização forneceu para enviar sua solicitação, ou acompanhe uma solicitação já aberta.');
        mostrarFormulario();
        $('sl-form').addEventListener('submit', enviar);
    }

    window.solicitacaoPublica = { iniciar };
```

  (o `estado()` já esconde form e ok; acrescentar `$('sl-consulta').hidden = true;` nele e em `mostrarFormulario`.)
- [ ] **Step 6:** `cd frontend && npx vitest run test/solicitacao-consulta.test.js test/recursos-existem.test.js test/publico-css.test.js` → PASS.
- [ ] **Step 7:** commit `feat(privacy): página do titular consulta o andamento pelo protocolo e código`.

### Task 5: documentação e gate

**Files:** `AGENTS.md` (parágrafo do portal do titular e "última a 0105"), `CHANGELOG.md`, `migrations/README.md` (0105, "pendente em
produção"; última 0105; 106 arquivos), `docs/estado-2026-11-05.md` (se lista os próximos passos do n.privacy), `docs/roteiro-aceite.md`
(passo novo na seção do portal: abrir, guardar código, consultar, e-mail com link), spec (Situação: construída).

- [ ] **Step 1:** atualizar os documentos (sem número sem comando).
- [ ] **Step 2:** `GATE_SEM_STATUS=1 bash scripts/ci/gate.sh` em segundo plano; nada de editar o repositório enquanto roda.
- [ ] **Step 3:** commit `docs(privacy): consulta pública do pedido do titular` e push; PR #565 pronto para revisão (Codex).
- [ ] **Step 4:** backup e `wrangler d1 migrations apply` só com o "sim" do dono; merge só com o OK do dono; depois `/health` e sonda de login.
