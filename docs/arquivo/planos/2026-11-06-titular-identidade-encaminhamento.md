# Pedido do titular: identidade e encaminhamento a ponto focal. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** registrar como a identidade do titular foi conferida e encaminhar o pedido a uma pessoa do cadastro, com e-mail, prazo, retorno e aviso de prazo.

**Architecture:** migration 0104 aditiva (4 colunas em `titular_pedidos` e a tabela `titular_pedido_encaminhamentos`); regras em dois
serviços novos (`titular-identidade.ts`, `titular-encaminhamentos.ts`) chamados por rotas novas em `titularPedidosApp`
(`src/routes/titular.ts`); fonte nova nos avisos de prazo; tela no modal do pedido (`frontend/src/views/titular.js`).

**Tech Stack:** Cloudflare Workers (Hono), D1, zod, vitest com `cloudflare:test` (D1 real), jsdom no frontend.

**Spec:** `docs/superpowers/specs/2026-11-06-titular-identidade-encaminhamento-design.md`

## Global Constraints

- Texto de UI, erro e comentário em português; sem itálico, sem emoji; um `.btn-primary` por tela; nada de `style=` novo (catraca).
- Identidade é **só registro**: nenhuma rota recusa responder sem ela.
- Gravam identidade e encaminhamento: equipe da consultoria (`ehEquipeNess`) e o `org_admin` do projeto; chave de API e agente MCP
  recusados (403 explícito na rota e entrada em `FORA_DO_AGENTE`).
- O e-mail do encaminhamento nunca leva nome, contato, descrição nem resposta do titular.
- Trilha (`logAudit`) nunca leva observação, mensagem nem retorno.
- `identidade_obs` até 500 caracteres, recusa `temPii` e sequência de 7+ dígitos (com `.`, `-` ou espaço no meio).
- Encaminhamento: `mensagem` 1 a 2000, `retorno` 1 a 5000, `prazo` AAAA-MM-DD >= hoje de São Paulo.
- Migration nova muda `schema.sql` e `migrations/0104_*.sql`; produção só com backup e o "sim" do dono.

---

### Task 1: migration 0104

**Files:**
- Create: `migrations/0104_titular_identidade_encaminhamento.sql`
- Modify: `schema.sql` (colunas no `CREATE TABLE titular_pedidos`; tabela, índice e gatilhos novos logo depois de `titular_pedido_tratativas`)
- Test: `test/migration-0104.test.ts`

**Interfaces:** Produces as colunas `identidade_metodo|obs|por|em` e a tabela `titular_pedido_encaminhamentos` (colunas da spec).

- [ ] **Step 1: teste que falha**

```ts
// test/migration-0104.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import mig from '../migrations/0104_titular_identidade_encaminhamento.sql?raw';

describe('migration 0104: identidade e encaminhamento do pedido do titular', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m4a', 'A', 'LGPD', 'Controller', 'Active', 'org_ness'), ('m4b', 'B', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, recebido_em) VALUES ('m4p', 'm4a', 'PT-2026-0001', 'acesso', '2026-10-01')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('m4pa', 'm4a', 'pessoa', 'Ponto Focal', 'pf@exemplo.invalid'), ('m4pb', 'm4b', 'pessoa', 'Alheio', 'x@exemplo.invalid')`),
    ]);
  });
  it('colunas e tabela; o resto da migration é repetível; listas fechadas e gatilho de projeto', async () => {
    await execSql(mig.replace(/ALTER TABLE [^;]*;/g, ''));
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name LIKE 'identidade_%'`).all()).results;
    expect(cols).toHaveLength(4);
    await expect(env.DB.prepare(`UPDATE titular_pedidos SET identidade_metodo = 'telepatia' WHERE id = 'm4p'`).run()).rejects.toThrow();
    const ins = (parte: string, status = 'aguardando') => env.DB.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, status, enviado_por) VALUES (?, 'm4p', 'm4a', ?, '2026-12-01', 'Ver dados', ?, 'a@ness.lat')`).bind(`e-${parte}-${status}`, parte, status).run();
    await ins('m4pa');
    await expect(ins('m4pb')).rejects.toThrow(/outro projeto/);
    await expect(ins('m4pa', 'perdido')).rejects.toThrow();
    await expect(env.DB.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, status, enviado_por) VALUES ('e-r', 'm4p', 'm4a', 'm4pa', '2026-12-01', 'x', 'respondido', 'a')`).run()).rejects.toThrow();
  });
});
```

- [ ] **Step 2:** `npx vitest run test/migration-0104.test.ts` falha (arquivo da migration não existe).
- [ ] **Step 3: migration e schema**

```sql
-- 0104_titular_identidade_encaminhamento.sql — conferência de identidade e encaminhamento a ponto focal do pedido do titular
-- (spec 2026-11-06-titular-identidade-encaminhamento-design). Aditiva: os ALTER rodam uma vez pelo runner; o resto é repetível.
-- Verificar: SELECT name FROM pragma_table_info('titular_pedidos') WHERE name LIKE 'identidade_%'; -- 4 linhas
--            SELECT name FROM sqlite_master WHERE name IN ('titular_pedido_encaminhamentos','titular_encaminhamentos_do_projeto'); -- 2 linhas
ALTER TABLE titular_pedidos ADD COLUMN identidade_metodo TEXT CHECK (identidade_metodo IN ('documento_foto', 'dados_cadastrais', 'canal_autenticado', 'presencial', 'outro'));
ALTER TABLE titular_pedidos ADD COLUMN identidade_obs TEXT CHECK (length(identidade_obs) <= 500);
ALTER TABLE titular_pedidos ADD COLUMN identidade_por TEXT;
ALTER TABLE titular_pedidos ADD COLUMN identidade_em TEXT;
CREATE TABLE IF NOT EXISTS titular_pedido_encaminhamentos (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES titular_pedidos(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parte_id TEXT NOT NULL REFERENCES partes(id),
    prazo TEXT NOT NULL,
    mensagem TEXT NOT NULL CHECK (length(mensagem) BETWEEN 1 AND 2000),
    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'respondido', 'cancelado')),
    retorno TEXT CHECK (length(retorno) <= 5000),
    enviado_por TEXT NOT NULL,
    enviado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retorno_por TEXT,
    retorno_em DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (status <> 'respondido' OR (retorno IS NOT NULL AND length(retorno) >= 1))
);
CREATE INDEX IF NOT EXISTS idx_titular_encaminhamentos_pedido ON titular_pedido_encaminhamentos(pedido_id, created_at);
CREATE INDEX IF NOT EXISTS idx_titular_encaminhamentos_prazo ON titular_pedido_encaminhamentos(project_id, status, prazo);
CREATE TRIGGER IF NOT EXISTS titular_encaminhamentos_do_projeto BEFORE INSERT ON titular_pedido_encaminhamentos
WHEN NOT EXISTS (SELECT 1 FROM titular_pedidos t WHERE t.id = NEW.pedido_id AND t.project_id IS NEW.project_id)
  OR NOT EXISTS (SELECT 1 FROM partes p WHERE p.id = NEW.parte_id AND p.project_id IS NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'pedido ou pessoa de outro projeto');
END;
```

  No `schema.sql`: as quatro colunas entram no `CREATE TABLE titular_pedidos` (antes do `UNIQUE`), e o bloco da tabela, dos dois índices
  e do gatilho vai logo depois do índice `idx_titular_tratativas_pedido`.
- [ ] **Step 4:** o teste passa; `npx vitest run test/migration-0058.test.ts test/schema-contract.test.ts` continua verde.
- [ ] **Step 5:** commit `feat(privacy): migration 0104, identidade e encaminhamento do pedido do titular`.

### Task 2: conferência de identidade (backend)

**Files:**
- Create: `src/services/titular-identidade.ts`
- Modify: `src/services/titular-pedidos.ts` (`COLS`, tipo `Pedido`, nome de quem conferiu na leitura), `src/schemas/nucleo.ts`,
  `src/routes/titular.ts`, `src/middleware/agente.ts` (`FORA_DO_AGENTE`), `src/openapi.ts` (registrar o PUT; `npm run openapi`)
- Test: `test/titular-identidade.test.ts`

**Interfaces:**
- Produces: `METODOS_IDENTIDADE` (lista), `titularIdentidadeSchema = { metodo: enum | null, observacao?: string | null }` estrito,
  `salvarIdentidade(db, projectId, pedidoId, ator, d): Promise<{ok:true} | {ok:false,status:400|404,error}>`,
  rota `PUT /api/v1/projects/:projectId/titular-pedidos/:id/identidade`, campos `identidade_*` e `identidade_por_nome` no GET.

- [ ] **Step 1: teste que falha** (`test/titular-identidade.test.ts`, no molde de `test/incidente-postmortem.test.ts`: projeto com
  privacy, consultor `ana`, `org_user` `cliente`, chave de API não é preciso; agente via `sessionFor({ ..., agente: true })` se o helper
  aceitar, senão pela checagem da rota). Casos:
  - `PUT` com `{ metodo: 'documento_foto', observacao: 'Conferido por vídeo' }` → 200; GET traz método, observação, `identidade_por` = e-mail e `identidade_em` preenchido.
  - regravar com `{ metodo: 'presencial' }` troca o método e limpa a observação; `{ metodo: null }` limpa as quatro colunas.
  - 400: método fora da lista, campo extra, observação com `123.456.789-09`, com `e@x.com`, com `RG 12 345 678`, com 501 caracteres.
  - 404: pedido de outro projeto. 403: `org_user`.
  - trilha `titular_pedido.identidade` com o protocolo e o método, sem a observação.
- [ ] **Step 2:** roda e falha (rota inexistente, 404).
- [ ] **Step 3: código**

```ts
// src/services/titular-identidade.ts
import { logAudit } from '../helpers';
import { temPii } from './rascunhos-privacy';

/** Conferência de identidade do titular (spec 2026-11-06): só registro; nunca trava responder. Quem e quando vêm da sessão. */
export const METODOS_IDENTIDADE = ['documento_foto', 'dados_cadastrais', 'canal_autenticado', 'presencial', 'outro'] as const;
export type MetodoIdentidade = (typeof METODOS_IDENTIDADE)[number];
type Falha = { ok: false; status: 400 | 404; error: string };

/** Número de documento não entra na observação: 7+ dígitos seguidos, com ponto, hífen ou espaço no meio. */
export const temNumeroDeDocumento = (t: string) => /\d(?:[.\- ]?\d){6,}/.test(t) || temPii(t);

export async function salvarIdentidade(db: D1Database, projectId: string, pedidoId: string, ator: string,
  d: { metodo: MetodoIdentidade | null; observacao?: string | null }): Promise<Falha | { ok: true }> {
  const obs = d.metodo ? d.observacao?.trim() || null : null;
  if (obs && temNumeroDeDocumento(obs)) return { ok: false, status: 400, error: 'A observação não aceita número de documento, CPF, e-mail nem telefone' };
  const p = await db.prepare('SELECT protocolo FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(pedidoId, projectId).first<{ protocolo: string }>();
  if (!p) return { ok: false, status: 404, error: 'Pedido não encontrado' };
  await db.prepare(`UPDATE titular_pedidos SET identidade_metodo = ?, identidade_obs = ?, identidade_por = ?, identidade_em = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?`).bind(d.metodo, obs, d.metodo ? ator : null, d.metodo ? new Date().toISOString() : null, pedidoId, projectId).run();
  await logAudit(db, 'titular_pedido.identidade', ator, `Pedido ${p.protocolo}: ${d.metodo ?? 'conferência removida'}`, '', '', projectId);
  return { ok: true };
}
```

  Esquema (`src/schemas/nucleo.ts`): `titularIdentidadeSchema = z.object({ metodo: z.enum(METODOS_IDENTIDADE).nullable(), observacao: z.string().max(500).nullish() }).strict()`.
  `titular-pedidos.ts`: acrescentar `identidade_metodo, identidade_obs, identidade_por, identidade_em` a `COLS` e ao tipo `Pedido`, e em
  `listarPedidos`/`lerPedido` trocar `FROM titular_pedidos` por um `LEFT JOIN users u ON lower(u.email) = lower(identidade_por)` com
  `NULLIF(u.name, '') AS identidade_por_nome` (prefixar as colunas de `COLS` com `t.`).
  Rota em `src/routes/titular.ts`, depois do `PUT /:id`:

```ts
// Conferência de identidade (spec 2026-11-06): pessoa da equipe ou o org_admin do projeto; chave de API e agente, não.
const podeAtender = (u: { role?: string } | undefined) => ehEquipeNess(u) || u?.role === 'org_admin';
titularPedidosApp.put('/:id/identidade', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: a conferência de identidade é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, titularIdentidadeSchema);
    if (!v.success) return v.response;
    const r = await salvarIdentidade(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao registrar a conferência de identidade', e); }
});
```

  `FORA_DO_AGENTE` (`src/middleware/agente.ts`): `[/^\/api\/v1\/projects\/[^/]+\/titular-pedidos\/[^/]+\/(identidade|encaminhamentos(\/[^/]+)?)$/, 'identidade e encaminhamento do pedido do titular são atos de pessoa, pela interface']`.
- [ ] **Step 4:** o teste passa; `npx vitest run test/modulos-produto.test.ts test/contrato test/openapi test/agente` verde.
- [ ] **Step 5:** commit `feat(privacy): conferência de identidade do pedido do titular`.

### Task 3: encaminhamento a ponto focal (backend)

**Files:**
- Create: `src/services/titular-encaminhamentos.ts`
- Modify: `src/services/emails.ts` (`emailEncaminhamentoTitular`), `scripts/emails-amostra.mjs`, `src/schemas/nucleo.ts`,
  `src/routes/titular.ts`, `src/openapi.ts`
- Test: `test/titular-encaminhamentos.test.ts`, `test/emails-marca.test.ts` (amostra nova, se o teste listar os e-mails)

**Interfaces:**
- Consumes: `podeAtender` da Task 2.
- Produces: `encaminhamentoCriarSchema = { parte_id, prazo, mensagem }`, `encaminhamentoAtualizarSchema = { status: 'respondido', retorno } | { status: 'cancelado' }`,
  `listarEncaminhamentos(db, projectId, pedidoId)`, `criarEncaminhamento(db, projectId, pedidoId, ator, d)` →
  `{ ok: true, id, parte: { nome, email }, protocolo, tipo }`, `atualizarEncaminhamento(db, projectId, pedidoId, encId, ator, d)`,
  rotas `GET|POST .../titular-pedidos/:id/encaminhamentos` e `PUT .../encaminhamentos/:encId`.

- [ ] **Step 1: teste que falha.** Casos:
  - `POST` com pessoa ativa com e-mail, prazo `diaMaisSP(3)` e mensagem → 201 com `email_enviado` (sem `RESEND_API_KEY` no teste: `false`);
    o pedido ganha uma tratativa `encaminhamento` com "Encaminhado a <nome>, prazo dd/mm/aaaa" e sem a mensagem.
  - 400: parte organização, parte sem e-mail, parte inativa, parte de outro projeto (a busca no serviço devolve 400), prazo ontem,
    data inválida, mensagem vazia, campo extra.
  - 409: pedido `respondido` (atualizar o pedido antes por SQL).
  - `GET` lista com `parte_nome` e `situacao` (`no_prazo`; com prazo de hoje, `vence_hoje`; com prazo passado gravado por SQL,
    `atrasado`; respondido, `encerrado`).
  - `PUT` `{ status: 'respondido', retorno: 'Dados localizados' }` → 200, grava `retorno_por/em`; de novo → 409; `{ status: 'cancelado' }`
    em outro → 200; `{ status: 'respondido' }` sem retorno → 400.
  - 403 para `org_user`; trilha `titular_pedido.encaminhamento` sem mensagem nem retorno.
  - E-mail sem dado do titular: chamar `emailEncaminhamentoTitular({ protocolo: 'PT-2026-0001', tipo: 'Acesso aos dados', prazo: '2026-12-01', mensagem: 'Localizar registros', nome: 'Ponto Focal', quem: { nome: 'Ana', email: 'ana@ness.lat' } })` e conferir que `html` e `text` têm protocolo, tipo, `01/12/2026` e a mensagem.
- [ ] **Step 2:** roda e falha.
- [ ] **Step 3: código**

```ts
// src/services/titular-encaminhamentos.ts
import { genId, logAudit } from '../helpers';
import { hojeEmSaoPaulo } from './hoje';

/** Encaminhamento do pedido do titular a uma pessoa do cadastro (spec 2026-11-06). O ponto focal responde por fora; o DPO registra. */
type Falha = { ok: false; status: 400 | 404 | 409; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const ABERTOS = ['recebido', 'em_andamento'];
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export type SituacaoEncaminhamento = 'no_prazo' | 'vence_hoje' | 'atrasado' | 'encerrado';
export const situacaoDoEncaminhamento = (e: { status: string; prazo: string }, hoje = hojeEmSaoPaulo()): SituacaoEncaminhamento =>
  e.status !== 'aguardando' ? 'encerrado' : e.prazo < hoje ? 'atrasado' : e.prazo === hoje ? 'vence_hoje' : 'no_prazo';

const pedido = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT protocolo, tipo, status FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(id, projectId).first<{ protocolo: string; tipo: string; status: string }>();

export async function listarEncaminhamentos(db: D1Database, projectId: string, pedidoId: string) {
  if (!(await pedido(db, projectId, pedidoId))) return null;
  const { results } = await db.prepare(
    `SELECT e.id, e.parte_id, p.nome AS parte_nome, e.prazo, e.mensagem, e.status, e.retorno, e.enviado_por, e.enviado_em, e.retorno_por, e.retorno_em
       FROM titular_pedido_encaminhamentos e JOIN partes p ON p.id = e.parte_id
      WHERE e.pedido_id = ? AND e.project_id = ? ORDER BY e.created_at, e.rowid`
  ).bind(pedidoId, projectId).all<{ status: string; prazo: string } & Record<string, unknown>>();
  return results.map((e) => ({ ...e, situacao: situacaoDoEncaminhamento(e) }));
}

export async function criarEncaminhamento(db: D1Database, projectId: string, pedidoId: string, ator: string, d: { parte_id: string; prazo: string; mensagem: string }) {
  const p = await pedido(db, projectId, pedidoId);
  if (!p) return falha(404, 'Pedido não encontrado');
  if (!ABERTOS.includes(p.status)) return falha(409, 'Só pedido em aberto pode ser encaminhado');
  if (!ehData(d.prazo) || d.prazo < hojeEmSaoPaulo()) return falha(400, 'O prazo é uma data de hoje em diante');
  const parte = await db.prepare(`SELECT nome, email FROM partes WHERE id = ? AND project_id = ? AND tipo = 'pessoa' AND status = 'ativa' AND trim(COALESCE(email, '')) <> ''`)
    .bind(d.parte_id, projectId).first<{ nome: string; email: string }>();
  if (!parte) return falha(400, 'Escolha uma pessoa ativa do cadastro, com e-mail');
  const id = genId();
  await db.batch([
    db.prepare(`INSERT INTO titular_pedido_encaminhamentos (id, pedido_id, project_id, parte_id, prazo, mensagem, enviado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, pedidoId, projectId, d.parte_id, d.prazo, d.mensagem, ator),
    db.prepare(`INSERT INTO titular_pedido_tratativas (id, pedido_id, project_id, tipo, texto, autor) VALUES (?, ?, ?, 'encaminhamento', ?, ?)`)
      .bind(genId(), pedidoId, projectId, `Encaminhado a ${parte.nome}, prazo ${dataBr(d.prazo)}`, ator),
  ]);
  await logAudit(db, 'titular_pedido.encaminhamento', ator, `Pedido ${p.protocolo}: encaminhado (parte ${d.parte_id})`, '', '', projectId);
  return { ok: true as const, id, parte, protocolo: p.protocolo, tipo: p.tipo };
}

export async function atualizarEncaminhamento(db: D1Database, projectId: string, pedidoId: string, encId: string, ator: string,
  d: { status: 'respondido'; retorno: string } | { status: 'cancelado' }) {
  const p = await pedido(db, projectId, pedidoId);
  if (!p) return falha(404, 'Pedido não encontrado');
  const retorno = d.status === 'respondido' ? d.retorno : null;
  const r = await db.prepare(`UPDATE titular_pedido_encaminhamentos SET status = ?, retorno = ?, retorno_por = ?, retorno_em = CURRENT_TIMESTAMP
      WHERE id = ? AND pedido_id = ? AND project_id = ? AND status = 'aguardando'`).bind(d.status, retorno, ator, encId, pedidoId, projectId).run();
  if (!r.meta.changes) {
    const existe = await db.prepare('SELECT 1 FROM titular_pedido_encaminhamentos WHERE id = ? AND pedido_id = ? AND project_id = ?').bind(encId, pedidoId, projectId).first();
    return existe ? falha(409, 'Encaminhamento já respondido ou cancelado') : falha(404, 'Encaminhamento não encontrado');
  }
  await logAudit(db, 'titular_pedido.encaminhamento', ator, `Pedido ${p.protocolo}: encaminhamento ${d.status}`, '', '', projectId);
  return { ok: true as const };
}
```

  E-mail (`src/services/emails.ts`):

```ts
/** Encaminhamento de pedido do titular a um ponto focal (n.privacy). Nunca leva nome, contato, descrição nem resposta do titular. */
export function emailEncaminhamentoTitular(d: { protocolo: string; tipo: string; prazo: string; mensagem: string; nome: string | null; quem: Pessoa }): EmailComAssunto {
  const prazo = dataBr(d.prazo);
  return com(`Pedido de titular ${d.protocolo}: precisamos da sua ajuda até ${prazo}`, {
    produto: 'n.privacy',
    previa: `${d.tipo}. Prazo interno: ${prazo}.`,
    titulo: 'Pedido de titular de dados encaminhado a você',
    saudacao: ola(d.nome),
    paragrafos: [`Um pedido de titular de dados (${d.tipo}, protocolo ${d.protocolo}) precisa de informações da sua área.`, d.mensagem],
    quemPede: d.quem,
    acao: 'Responder a quem encaminhou, respondendo a este e-mail',
    prazo,
    motivo: 'você foi indicado como ponto focal para atender pedidos de titulares de dados.',
    contato: d.quem,
  });
}
```

  Rotas (`src/routes/titular.ts`, depois da identidade):

```ts
titularPedidosApp.get('/:id/encaminhamentos', async (c) => {
  const l = await listarEncaminhamentos(c.env.DB, c.req.param('projectId')!, c.req.param('id'));
  return l ? c.json({ encaminhamentos: l }) : c.json({ error: 'Pedido não encontrado' }, 404);
});

titularPedidosApp.post('/:id/encaminhamentos', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: encaminhar o pedido do titular é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, encaminhamentoCriarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const user = c.get('user');
    const r = await criarEncaminhamento(c.env.DB, projectId, c.req.param('id'), user.email, v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    let email_enviado = false;
    try {
      const cliente = (await c.env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<string>('client_name')) ?? '';
      const m = emailEncaminhamentoTitular({ protocolo: r.protocolo, tipo: TIPO_PEDIDO[r.tipo] ?? r.tipo, prazo: v.data.prazo, mensagem: v.data.mensagem, nome: r.parte.nome, quem: { nome: user.name ?? null, email: user.email } });
      email_enviado = c.env.RESEND_API_KEY ? await sendEmail(c, r.parte.email, m.assunto, m, { from: remetente('n.privacy', cliente), replyTo: user.email }) : false;
    } catch (e) { registraErro(c, e); }
    if (!email_enviado) console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_encaminhamento_email_falhou', encaminhamento: r.id }));
    return c.json({ ok: true, id: r.id, email_enviado }, 201);
  } catch (e) { return erro500(c, 'Falha ao encaminhar o pedido', e); }
});

titularPedidosApp.put('/:id/encaminhamentos/:encId', async (c) => {
  try {
    if (!podeAtender(c.get('user'))) return c.json({ error: 'Forbidden: registrar o retorno do ponto focal é ato de pessoa, pela interface' }, 403);
    const v = await validateBody(c, encaminhamentoAtualizarSchema);
    if (!v.success) return v.response;
    const r = await atualizarEncaminhamento(c.env.DB, c.req.param('projectId')!, c.req.param('id'), c.req.param('encId'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao atualizar o encaminhamento', e); }
});
```

  `TIPO_PEDIDO` vem de `src/services/exportacao.ts` (rótulos); `sendEmail` e `registraErro` de `src/helpers.ts`; `remetente` de
  `src/services/email-layout.ts`. Esquemas:
  `encaminhamentoCriarSchema = z.object({ parte_id: z.string().min(1).max(64), prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mensagem: z.string().trim().min(1).max(2000) }).strict()`;
  `encaminhamentoAtualizarSchema = z.discriminatedUnion('status', [z.object({ status: z.literal('respondido'), retorno: z.string().trim().min(1).max(5000) }).strict(), z.object({ status: z.literal('cancelado') }).strict()])`.
  Amostra: acrescentar `emailEncaminhamentoTitular` ao `scripts/emails-amostra.mjs` com dados fictícios e rodar `node scripts/emails-amostra.mjs`.
- [ ] **Step 4:** testes verdes, mais `test/emails-marca.test.ts`, contratos (faixa, tela↔API, agente, openapi).
- [ ] **Step 5:** commit `feat(privacy): encaminhamento do pedido do titular a ponto focal`.

### Task 4: aviso de prazo do encaminhamento

**Files:** Modify `src/services/avisos-prazo.ts`; Test `test/avisos-prazo-encaminhamento.test.ts`.

- [ ] **Step 1: teste que falha.** Pedido aberto com dois encaminhamentos `aguardando` (prazo hoje e prazo há 3 dias), um `respondido`
  vencido e um `aguardando` com prazo daqui a 7 dias. `itensDoDia(db, hoje)` traz, da fonte `encaminhamento_titular`, o D0 e o atraso;
  não traz o respondido nem D-7. `tituloDoAviso` dá "Encaminhamento do pedido PT-2026-0001 a Ponto Focal vence hoje".
- [ ] **Step 2:** falha.
- [ ] **Step 3: código.** Acrescentar `'encaminhamento_titular'` ao tipo `Fonte`, ao `ROTULO` ("Encaminhamento"), à `TELA` (`/titular`),
  à `FAIXA_DA_FONTE` (`privacy`) e à condição de `tituloDoAviso` que usa `quando`, e a consulta:

```ts
  encaminhamento_titular: `SELECT e.id AS item_id, e.project_id, e.prazo AS vence_em,
      'Encaminhamento do pedido ' || t.protocolo || ' a ' || pa.nome AS titulo, NULL AS responsavel, date(e.created_at, '-3 hours') AS criado_em
    FROM titular_pedido_encaminhamentos e JOIN titular_pedidos t ON t.id = e.pedido_id JOIN partes pa ON pa.id = e.parte_id
      JOIN projects p ON p.id = e.project_id
    WHERE e.status = 'aguardando'`,
```

  Em `itensDoDia`, logo depois de calcular o marco: `if (fonte === 'encaminhamento_titular' && marco === 'D-7') continue; // prazo interno é curto`.
- [ ] **Step 4:** verde, mais `test/avisos-prazo*.test.ts`.
- [ ] **Step 5:** commit `feat(privacy): aviso de prazo do encaminhamento ao ponto focal`.

### Task 5: tela

**Files:** Modify `frontend/src/views/titular.js`; Test `frontend/test/titular-view.test.js`.

- [ ] **Step 1: testes que falham** (no `describe('pedidos')`):
  - abrir o pedido sem conferência mostra "Identidade não conferida" e "Registrar conferência"; preencher método e salvar faz
    `PUT .../identidade` com `{ metodo, observacao }`; com conferência mostra "Conferida por <nome> em <data>".
  - salvar o pedido com status `respondido` sem conferência pede confirmação (`confirmar` dublado): recusar não chama o `PUT`; aceitar chama.
  - lista: pedido aberto sem conferência tem o selo "Identidade não conferida"; respondido não tem.
  - seção "Encaminhamentos": lista com pessoa, prazo e situação; "Encaminhar" abre o formulário com as pessoas de
    `GET .../partes?tipo=pessoa&status=ativa` que têm e-mail; salvar faz `POST .../encaminhamentos` com `{ parte_id, prazo, mensagem }`;
    com `email_enviado: false` mostra o aviso "E-mail não enviado"; "Registrar retorno" faz `PUT .../encaminhamentos/<id>` com
    `{ status: 'respondido', retorno }`; "Cancelar" pede confirmação e manda `{ status: 'cancelado' }`.
- [ ] **Step 2:** falham.
- [ ] **Step 3: código.** Em `abrirPedidoTitular`, dois contêineres antes de `pt-tratativas-box`: `<div id="pt-identidade-box"></div>`
  e `<div id="pt-encaminhamentos-box"></div>`, preenchidos por `montarIdentidade(projectId, p, editar)` (síncrona, dados do próprio
  pedido) e `carregarEncaminhamentos(projectId, id, editar)` (busca a lista). Constantes `METODOS_IDENTIDADE` (rótulos:
  "Documento com foto", "Dados cadastrais conferidos", "Canal autenticado do cliente", "Presencial", "Outro") e
  `SITUACAO_ENCAMINHAMENTO` (selo pelo mesmo `selo()` dos prazos). Ações: `salvarIdentidadeTitular`, `abrirEncaminhar`,
  `salvarEncaminhamento`, `registrarRetornoEncaminhamento`, `cancelarEncaminhamento`. `salvarPedidoTitular` passa a ser `async`:
  se `status === 'respondido'` e `!pedidoAberto.identidade_metodo`, `await confirmar('Identidade não conferida. Responder mesmo assim?', { rotulo: 'Responder' })`
  antes do `PUT`. Na lista de pedidos, a coluna Situação ganha o selo "Identidade não conferida" quando `!p.identidade_metodo` e o
  status é `recebido` ou `em_andamento`. Sem `style=` novo: usar `at-nota`, `et-lista`, `et-linha`, `form-group`, `mt-2`.
- [ ] **Step 4:** `cd frontend && npx vitest run test/titular-view.test.js` verde; `npx vitest run test/contrato-tela-api.test.ts` verde (chamadas `api()` com caminho literal `/api/v1/...`).
- [ ] **Step 5:** commit `feat(privacy): identidade e encaminhamento na tela do pedido do titular`.

### Task 6: documentação, portão e produção

- [ ] AGENTS.md (parágrafo do titular: identidade e encaminhamento, migration 0104, última migration), CHANGELOG, `migrations/README.md`
  (entrada 0104, contagem e última), spec (situação), `docs/estado-2026-11-05.md` (decisão 5 feita), `docs/roteiro-aceite.md` (passos na seção 8).
- [ ] `GATE_SEM_STATUS=1 bash scripts/ci/gate.sh` verde; PR em rascunho; revisão do Codex tratada.
- [ ] Com o "sim" do dono: backup (`npx wrangler d1 export niso-db --remote --output <scratchpad>`), `npx wrangler d1 migrations apply niso-db --remote`,
  conferência pelas duas consultas da migration, merge no SHA do portão, `/health` com o SHA e a sonda do login.
