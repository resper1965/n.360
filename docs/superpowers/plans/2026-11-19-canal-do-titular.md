# Canal do titular no n.privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O canal do titular vira registro de primeira classe no n.privacy (uma linha por projeto: meios de contato, página de divulgação, responsável e conferência), visível em Solicitações, lido pelo painel e pelo agente, e contado no passo 1 da trilha ("Encarregado e canal"), sem regredir nenhuma proteção do portal, do n.ot nem do isolamento.

**Architecture:** Tabela nova `titular_canal` (migration `0117`, aditiva, a única do plano) com serviço `src/services/titular-canal.ts` (`lerCanal`, `salvarCanal`, `resumoDoCanal`) e rotas `GET|PUT /api/v1/projects/:projectId/titular-canal` (`titularCanalApp` em `src/routes/titular.ts`, faixa `privacy`). Grava quem gere o portal (`podeGerirPortal`); agente e chave de API só leem. O servidor recusa o link do portal (credencial de portador) em qualquer campo. `resumoDoCanal` entra na `visaoDoEncarregado` (prioridades do painel, MCP `niso_privacy_encarregado`) e no critério fechado `encarregado_e_canal` da trilha; ele tolera a tabela ausente (produção antes da `0117`).

**Tech Stack:** Cloudflare Worker (Hono) + D1, zod 4, vitest (`@cloudflare/vitest-pool-workers` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Spec:** `docs/superpowers/specs/2026-11-19-canal-do-titular-design.md` (aprovada pelo dono em 19/11/2026 com "siga"; todas as recomendações adotadas: decisões 1 a 8 pela coluna "Recomendação minha"). Toda referência arquivo:linha deste plano foi reconferida numa cópia de trabalho sobre `origin/main` `c0badf9` + commits de docs. Divergências entre a spec e o código estão em "Self-Review", item "Spec x código".

## Global Constraints

- **Os três números do cliente não mudam:** `test/onda2-numeros.test.ts` **nunca é editado** e roda verde em todo task que toca `src/services/encarregado.ts`, `src/services/painel*.ts` ou `src/services/programa.ts` (`git diff --stat c0badf9 -- test/onda2-numeros.test.ts` vazio em todo commit). `test/painel.test.ts` também não é editado (spec, "Não regridem") e roda verde.
- **P0 do n.ot:** nada aqui lê, grava ou referencia `ot_*`; a tabela nova não começa com `ot_`; nenhum arquivo `src/**/ot*`, `frontend/src/ot*` muda (`git diff --stat c0badf9 -- 'src/**/ot*' 'src/routes/ot*' 'frontend/src/ot*' 'frontend/src/views/ot*'` vazio em todo commit). Teste concreto: Task 2 (fonte do serviço sem `ot_`) e Task 4 (dublê de API que lança em qualquer chamada fora da lista, inclusive `/ot`).
- **Portal:** o banco continua sem o token; nenhum campo novo aceita o link `/solicitacao#...` nem URL dos hosts do app (422). O link nunca chega ao banco, à exportação, à trilha nem ao agente.
- **Nenhum PII de titular** no registro do canal. A trilha `titular.canal` leva só os NOMES dos campos mudados (teste no Task 2).
- **Atos do cliente** (responder, negar, arquivar, prazo, eliminação) seguem recusados ao agente (`src/middleware/agente.ts:113,126-127`; `src/routes/titular.ts:80-83`): nada aqui toca essas linhas.
- **Quem grava o canal:** a regra do portal, `podeGerirPortal` (`src/routes/titular.ts:168`: `ehEquipeNess(u) || u?.role === 'org_admin'`; `ehEquipeNess` inclui `consultoria_admin`, `src/helpers.ts:560,579-582`). `org_user` e `client` leem (o allow-list de só leitura de `src/middleware/auth.ts:394-422` já os barra no `PUT`). Agente e chave de API só leem: `PUT` em `FORA_DO_AGENTE` (`src/middleware/agente.ts:83-142`) e a recusa por papel na rota (chave e agente entram como `client`).
- **Isolamento multi-tenant:** a tabela nova entra em `VALOR_FIXO` de `test/contrato-isolamento-org.test.ts:219` **e** de `test/contrato-isolamento-topo.test.ts:233`. **Os dois seeders pulam tabela sem coluna `id`** (`contrato-isolamento-org.test.ts:272`, `contrato-isolamento-topo.test.ts:281`): por isso `titular_canal` tem `id TEXT PRIMARY KEY` e `project_id ... UNIQUE` (desvio consciente da DDL da spec, que punha `project_id` como chave primária). **Todo task que cria tabela ou rota roda as duas suítes** (lição da onda 3).
- **Testes que derrubam tabelas-pai** (`projects`, `partes`) precisam tolerar a FK nova: `test/migration-0039.test.ts` (derruba `projects`), `test/migration-0047.test.ts` (derruba `partes`), e as já ajustadas na onda 3 `test/migration-0073.test.ts`, `test/migration-0091.test.ts` rodam no Task 1.
- **Migration:** `schema.sql` e `migrations/0117_titular_canal.sql` com o mesmo bloco `CREATE TABLE` (teste de texto igual no Task 1, além de `test/migrations-consistencia.test.ts`); `migrations/README.md` marca a `0117` como **PENDENTE de aplicar**. Quem aplica é o dono (`db-migrate.yml`, com backup). **Nunca** escreva "aplicada" sem a evidência medida (`PRAGMA table_info(titular_canal)`).
- **Ordem de deploy (lição das migrations):** o código que lê `titular_canal` só vai a produção com a `0117` aplicada. O `deploy.yml` recusa publicar com migration pendente (`.github/workflows/deploy.yml:78-79`), e o `db-migrate.yml` só roda na `main` (`migrations/README.md:27-31`). Então: **ou** o dono aplica antes do merge do PR1 (`npx wrangler d1 migrations apply niso-db --remote`, com `npm run db:backup` antes), **ou** faz o merge, o deploy do merge recusa sozinho, o dono roda `db-migrate.yml` e depois *Deploy*. O texto do PR1 diz isso (Task 3). Além disso, `resumoDoCanal` (caminho do painel) tolera a tabela ausente (Task 2).
- **Portabilidade:** `titular_canal` é exportada (tem `project_id`; sem segredo: o link do portal nunca é gravado). Teste no Task 2.
- **Contrato:** `npm run openapi` (`package.json:14`) depois de mudar corpo de rota; commite `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (`test/openapi.test.ts` compara o versionado).
- **Skill e gerado juntos:** `agent-skills/implantacao-privacy/SKILL.md` e `src/mcp/skills-gerado.ts` (`npm run skills:gerar`, `package.json:15`) no mesmo commit; `test/agente-skills.test.ts:18` cobra a igualdade e `:138` o rótulo da tabela. **A skill não pode conter `site`/`sites`** (`test/agente-skills.test.ts:144`: `/n\.ot|\bsites?\b|desvio/i`): escreva "página pública".
- **Frontend:** `data-action` (delegação em `frontend/src/delegation.js`), nada de handler nem estilo inline novo (CSP; classes novas no fim de `frontend/src/style.css`), `escapeHTML` em todo dado do servidor, `<label for>` em todo campo, `semRepetir` (`frontend/src/ot-comum.js:178`, já usado fora do n.ot em `frontend/src/views/empresa.js:5`) em todo salvar, textos em português.
- **AGENTS.md sem acentos** quando editado; CHANGELOG, telas e skill com acentos.
- **Comandos:** backend `npx vitest run <arquivos>`; frontend `cd frontend && npx vitest run <arquivos>`; build `cd frontend && npm run build`; tipos `npx tsc --noEmit`; contrato `npm run openapi`; skills `npm run skills:gerar`; portão `bash scripts/ci/gate.sh` (só na máquina de quem mergeia).
- **Revisão em modelo forte (opus)** nos tasks marcados **[revisor opus]**: isolamento (Task 1), recusa do link do portal (Task 2), permissões e regras do agente (Task 3), agente lendo o canal (Task 5), a regra da trilha e a skill (Task 6).
- **Fora deste plano:** busca automática da página do cliente; vários canais por projeto; ligar `titular_pedidos.canal` ao registro; atributo "pequeno porte" (Res. CD/ANPD 2/2022, art. 11); canal e encarregado na página `/solicitacao`, no Word do RIPD e no relatório da atividade; periodicidade de reconferência; item novo na lista de quem começa (`src/services/painel.ts:283`); `token_hash`/`acompanhamento_hash` na portabilidade (achado lateral da spec).
- Quatro PRs, o de menor risco primeiro; **só o PR1 tem migration**: **PR1** = Tasks 1-3; **PR2** = Task 4; **PR3** = Tasks 5-7; **PR4 (opcional, decisão 7)** = Task 8. PR2, PR3 e PR4 partem da `main` com o PR1 mergeado.

## Preflight (antes do Task 1 e ao retomar)

- [ ] Cópia de trabalho do executor (não use a cópia principal enquanto houver portão rodando nela): `git status --short && git log --oneline -3`; árvore limpa; `git merge-base --is-ancestor c0badf9 HEAD` responde 0. Branch por PR: `git switch -c canal-titular-pr1 origin/main` (depois `-pr2`, `-pr3`, `-pr4`, cada uma da `origin/main` com o PR anterior mergeado).
- [ ] `ls migrations | tail -3`: a última é `0116_ot_fornecedores.sql` e `README.md`. Se já existir `0117_*` na `main`, pare e renumere com o dono (nunca renomeie migration aplicada).
- [ ] **Retomar (o contêiner pode reiniciar e matar o agente):** o estado está no git. `git log --oneline c0badf9..HEAD` lista os tasks feitos pelo assunto do commit (os assuntos estão no último passo de cada task). Comece pelo primeiro task cujo commit não aparece. Mudança não commitada: `git diff --stat`; se é do task em curso, continue dela; se não é, descarte só os caminhos daquele task (`git checkout -- <caminho>`), nunca `git checkout .`.
- [ ] **Higiene de commit:** `git add` só com os caminhos listados em **Files** do task; nunca `git add -A`/`git add .`; antes de commitar, `git diff --cached --stat` mostra só esses caminhos.
- [ ] **A suíte inteira do backend leva ~20 min no contêiner da nuvem:** rode só os arquivos do passo de verificação de cada task (já incluem os de isolamento e os afetados). A suíte inteira é do `gate.sh`, na entrega do PR. A do **frontend** inteira leva ~70 s: rode-a inteira nos tasks que tocam o frontend (`cd frontend && npx vitest run`).
- [ ] Ambiente: `node -v` (≥ 20); `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest` (se faltar: `npm ci` e `cd frontend && npm ci`).

## File Structure

- `migrations/0117_titular_canal.sql` (novo), `schema.sql` (fim do arquivo), `migrations/README.md` (Estado + seção `0117`).
- `src/schemas/nucleo.ts`: `titularCanalSchema`, `TitularCanalCorpo`.
- `src/services/titular-canal.ts` (novo): `CAMPOS_CANAL`, `MSG_LINK_DO_PORTAL`, `hostsDoApp`, `urlDoApp`, `lerCanal`, `salvarCanal`, `resumoDoCanal`, tipos `LinhaCanal`, `ResumoDoCanal`.
- `src/services/mesclar.ts`: uma linha em `TROCAR.partes`.
- `src/routes/titular.ts`: `titularCanalApp` (GET e PUT). `src/index.ts`: import e `app.route` (ao lado da linha 514). `src/modulos.ts:41`: faixa. `src/middleware/agente.ts`: entrada em `FORA_DO_AGENTE`. `src/openapi.ts`: entrada em `ROTAS_COM_SCHEMA`; `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts` (gerados).
- `frontend/src/views/titular.js`: botão "Canal do titular", `abrirCanalTitular`, `salvarCanalTitular`. `frontend/src/style.css`: `.tc-dica`, `.tc-leitura`.
- `src/services/encarregado.ts`: `canal` na visão e as duas prioridades. `src/services/painel.ts`: `canal_titular` na resposta. `frontend/src/views/painel.js`: "Canal do titular" na identidade.
- `src/data/programa.ts`, `src/services/programa.ts`: critério `encarregado_e_canal`, passo "Encarregado e canal".
- `agent-skills/implantacao-privacy/SKILL.md` + `src/mcp/skills-gerado.ts`; `mcp-server-niso/src/ferramentas.ts:485-487` (descrição).
- Opcional (PR4): `src/schemas/corpos.ts`, `src/services/empresas.ts`, `src/routes/projects.ts:388`, `frontend/src/views/empresa.js`.
- Testes novos: `test/migration-0117.test.ts`, `test/titular-canal.test.ts`, `test/titular-canal-sem-tabela.test.ts`, `frontend/test/titular-canal-view.test.js`. Editados: `test/contrato-isolamento-org.test.ts`, `test/contrato-isolamento-topo.test.ts`, `test/migration-0039.test.ts`, `test/migration-0047.test.ts`, `test/encarregado.test.ts`, `test/programa.test.ts`, `test/programa-rota.test.ts`, `test/agente-skills.test.ts`, `frontend/test/painel-view.test.js`, (PR4) `test/empresa.test.ts`, `frontend/test/novo-projeto.test.js`.

---

## PR1 — Modelo e API (migration 0117)

### Task 1: Tabela `titular_canal` (migration 0117), schema.sql e as suítes de isolamento **[revisor opus]**

**Files:**
- Create: `migrations/0117_titular_canal.sql`, `test/migration-0117.test.ts`
- Modify: `schema.sql` (fim do arquivo), `migrations/README.md:9-10` (Estado) e nova seção antes de `## 0116 — fornecedor de OT` (linha 781), `test/contrato-isolamento-org.test.ts:219-258` (`VALOR_FIXO`), `test/contrato-isolamento-topo.test.ts:233-270` (`VALOR_FIXO`), `test/migration-0047.test.ts:58-60`, `test/migration-0039.test.ts:13-19`

**Interfaces:**
- Consumes: nada de task anterior.
- Produces: tabela `titular_canal (id TEXT PK, project_id TEXT NOT NULL UNIQUE → projects CASCADE, email ≤200, telefone ≤40, formulario_url ≤500, divulgacao_url ≤500, responsavel_parte_id → partes SET NULL, conferido_em TEXT, conferido_por TEXT, atualizado_por TEXT, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`, 11 colunas nessa ordem.

- [ ] **Step 1: Escrever o teste que falha** — `test/migration-0117.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, execSql } from './helpers/d1';
import migration0117 from '../migrations/0117_titular_canal.sql?raw';

/** 0117 (canal do titular, spec 2026-11-19): migration e schema.sql criam a MESMA tabela; aditiva e repetível; CASCADE do projeto, SET NULL da parte. */
const definicao = async () =>
  ((await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'titular_canal'`).first<{ sql: string }>())?.sql ?? '')
    .replace(/\s+/g, ' ').trim();

describe('migration 0117 — canal do titular', () => {
  beforeAll(async () => { await applySchema(); });

  it('schema.sql e a migration criam a mesma tabela (texto igual, sem contar espaços); repetível', async () => {
    const doSchema = await definicao();
    expect(doSchema).toContain('CREATE TABLE');
    await execSql('DROP TABLE titular_canal;');
    await execSql(migration0117);
    await execSql(migration0117);
    expect(await definicao()).toBe(doSchema);
  });

  it('colunas na ordem, nenhuma de token ou hash (o link do portal nunca é gravado), nada ot_', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(titular_canal)').all<{ name: string }>();
    expect(results.map((c) => c.name)).toEqual(['id', 'project_id', 'email', 'telefone', 'formulario_url', 'divulgacao_url',
      'responsavel_parte_id', 'conferido_em', 'conferido_por', 'atualizado_por', 'updated_at']);
  });

  it('uma linha por projeto; tamanhos no CHECK; apagar a parte só limpa o responsável; apagar o projeto apaga o canal', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m117', 'C', 'ISO 27001', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('m117-p', 'm117', 'pessoa', 'Ana Exemplo')`),
      env.DB.prepare(`INSERT INTO titular_canal (id, project_id, email, responsavel_parte_id) VALUES ('m117-c', 'm117', 'privacidade@exemplo.com.br', 'm117-p')`),
    ]);
    await expect(env.DB.prepare(`INSERT INTO titular_canal (id, project_id) VALUES ('m117-c2', 'm117')`).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE titular_canal SET telefone = ? WHERE id = 'm117-c'`).bind('9'.repeat(41)).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE titular_canal SET divulgacao_url = ? WHERE id = 'm117-c'`).bind(`https://x.com/${'a'.repeat(490)}`).run()).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM partes WHERE id = 'm117-p'`).run();
    expect(await env.DB.prepare(`SELECT responsavel_parte_id AS r FROM titular_canal WHERE id = 'm117-c'`).first()).toEqual({ r: null });
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'm117'`).run();
    expect(await env.DB.prepare(`SELECT 1 FROM titular_canal WHERE id = 'm117-c'`).first()).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/migration-0117.test.ts` → FAIL (`Failed to resolve import "../migrations/0117_titular_canal.sql?raw"`).

- [ ] **Step 3: Implementar.** `migrations/0117_titular_canal.sql`:

```sql
-- 0117 — canal do titular (spec 2026-11-19-canal-do-titular-design). Aditiva e repetível. Uma linha por projeto: por onde o titular fala
-- com a empresa e a página pública onde canal e encarregado aparecem. Nunca guarda o link do portal (credencial; o serviço recusa).
-- `id` existe para as varreduras de isolamento (pulam tabela sem `id`); o UNIQUE de project_id garante uma linha por projeto.
-- Verificar depois de aplicar: PRAGMA table_info(titular_canal) → 11 colunas.
CREATE TABLE IF NOT EXISTS titular_canal (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT CHECK (email IS NULL OR length(email) <= 200),
    telefone TEXT CHECK (telefone IS NULL OR length(telefone) <= 40),
    formulario_url TEXT CHECK (formulario_url IS NULL OR length(formulario_url) <= 500),
    divulgacao_url TEXT CHECK (divulgacao_url IS NULL OR length(divulgacao_url) <= 500),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    conferido_em TEXT,
    conferido_por TEXT,
    atualizado_por TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

  No **fim** de `schema.sql` (depois de `partes` e `projects`: os seeders de isolamento semeiam na ordem do `sqlite_master`), acrescente uma linha de comentário `-- Canal do titular (migration 0117): uma linha por projeto; nunca o link do portal.` e, em seguida, o bloco `CREATE TABLE IF NOT EXISTS titular_canal (...)` copiado **byte a byte** da migration (do `CREATE` ao `);`).

  `migrations/README.md`, linhas 9-10: troque `**0116**` por `**0117**` e `São 117 arquivos` por `São 118 arquivos`. Antes de `## 0116 — fornecedor de OT (2026-11-17)` (linha 781), acrescente:

```markdown
## 0117 — canal do titular (2026-11-19)

Cria `titular_canal` (uma linha por projeto: `id`, `project_id` UNIQUE com CASCADE, `email`, `telefone`, `formulario_url` e `divulgacao_url` com CHECK de tamanho, `responsavel_parte_id` com SET NULL, `conferido_em`, `conferido_por`, `atualizado_por`, `updated_at`). Aditiva e repetível; sem índice além do UNIQUE. Spec `2026-11-19-canal-do-titular-design`. **Status: PENDENTE de aplicar.** Quem aplica é o dono, com backup antes (`npm run db:backup`): ou `npx wrangler d1 migrations apply niso-db --remote` antes do merge do PR1 do canal, ou o workflow manual `db-migrate.yml` logo depois do merge (o deploy do merge recusa sozinho com a migration pendente) e então *Deploy*. Conferir: `PRAGMA table_info(titular_canal)` mostra 11 colunas e `SELECT name FROM d1_migrations WHERE name = '0117_titular_canal.sql'` devolve 1 linha. Só troque este status para APLICADA com essa evidência medida, num commit separado.
```

  `test/contrato-isolamento-org.test.ts`, dentro de `VALOR_FIXO` (antes do `};` da linha 258):

```ts
  // Canal do titular (0117): todas as colunas são opcionais; o e-mail entra para a linha ter conteúdo a vazar na varredura
  titular_canal: { email: 'canal@varredura.teste' },
```

  `test/contrato-isolamento-topo.test.ts`, dentro de `VALOR_FIXO` (antes do `};` que fecha o objeto, perto da linha 270):

```ts
  // Canal do titular (0117): colunas opcionais; o e-mail carrega o id alheio, então vazar a linha aparece na varredura
  titular_canal: { email: (id: string) => `canal-${id}@varredura.teste` },
```

  `test/migration-0047.test.ts`, no `execSql` das linhas 58-63, logo depois de `DROP TABLE IF EXISTS titular_pedido_encaminhamentos;` acrescente `DROP TABLE IF EXISTS titular_canal;` e, no comentário da linha 57, troque `Tabelas da 0079, da 0098 e da 0104` por `Tabelas da 0079, da 0098, da 0104 e da 0117` (o banco anterior à 0047 não tem a tabela; ela aponta para `partes`). `test/migration-0039.test.ts`, no `execSql` das linhas 13-19, antes de `DROP TABLE IF EXISTS projects;` acrescente `DROP TABLE IF EXISTS titular_canal;` (o `applySchema()` da linha 39 a recria).

- [ ] **Step 4: Procurar outros testes que derrubam as tabelas-pai** — `grep -n "DROP TABLE\( IF EXISTS\)\? \(projects\|partes\)\b" test/*.ts`. Esperado: só `test/migration-0039.test.ts` e `test/migration-0047.test.ts` (já tratados). Se aparecer outro, acrescente nele `DROP TABLE IF EXISTS titular_canal;` antes da tabela-pai, no mesmo padrão.

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run test/migration-0117.test.ts test/migrations-consistencia.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/migration-0039.test.ts test/migration-0047.test.ts test/migration-0073.test.ts test/migration-0091.test.ts test/migration-0089.test.ts test/portabilidade.test.ts` → `Test Files  10 passed (10)`. `git diff --stat c0badf9 -- test/onda2-numeros.test.ts` → vazio.

- [ ] **Step 6: Mutação** — apague `UNIQUE` da coluna `project_id` só no `schema.sql`; `npx vitest run test/migration-0117.test.ts` cai em "texto igual" e em "uma linha por projeto". Restaure. Tire a entrada de `VALOR_FIXO` do `-topo` e rode `npx vitest run test/contrato-isolamento-topo.test.ts`: deve continuar verde (a entrada só acrescenta conteúdo); recoloque.

- [ ] **Step 7: Commit**

```bash
git add migrations/0117_titular_canal.sql schema.sql migrations/README.md test/migration-0117.test.ts \
  test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/migration-0047.test.ts test/migration-0039.test.ts
git commit -m "feat(privacy): tabela titular_canal (migration 0117, pendente de aplicar)"
```

### Task 2: Corpo validado e serviço do canal (recusa do link do portal, conferência, trilha, resumo à prova de migration pendente) **[revisor opus]**

**Files:**
- Create: `src/services/titular-canal.ts`, `test/titular-canal.test.ts`, `test/titular-canal-sem-tabela.test.ts`
- Modify: `src/schemas/nucleo.ts` (depois de `tratativaSchema`, linha 292), `src/services/mesclar.ts:31` (`TROCAR.partes`)

**Interfaces:**
- Consumes: tabela `titular_canal` (Task 1); `lerPortal(db, projectId)` (`src/services/titular-pedidos.ts:166`); `hojeEmSaoPaulo()` (`src/services/hoje.ts:2`); `appUrl`, `APP_URL_PADRAO`, `ORIGENS_EXTRAS`, `HOSTS_LEGADOS` (`src/config/url.ts`); `logAudit` (`src/helpers.ts:111`).
- Produces:
  - `titularCanalSchema` (zod, estrito) e `type TitularCanalCorpo = { email?: string | null; telefone?: string | null; formulario_url?: string | null; divulgacao_url?: string | null; responsavel_parte_id?: string | null; conferir?: true }`.
  - `CAMPOS_CANAL = ['email', 'telefone', 'formulario_url', 'divulgacao_url', 'responsavel_parte_id'] as const`; `MSG_LINK_DO_PORTAL: string`.
  - `hostsDoApp(env: { APP_URL?: string }): string[]`; `urlDoApp(url: string, hosts: readonly string[]): boolean`.
  - `type LinhaCanal = { id: string; project_id: string; email: string | null; telefone: string | null; formulario_url: string | null; divulgacao_url: string | null; responsavel_parte_id: string | null; responsavel_nome: string | null; conferido_em: string | null; conferido_por: string | null; atualizado_por: string | null; updated_at: string }`.
  - `lerCanal(db: D1Database, projectId: string): Promise<{ canal: LinhaCanal | null; portal_ativo: boolean }>`.
  - `salvarCanal(db: D1Database, projectId: string, ator: string, d: TitularCanalCorpo, hosts: readonly string[]): Promise<{ ok: true; campos: string[] } | { ok: false; status: 400 | 422; error: string }>`.
  - `type ResumoDoCanal = { meios: ('email' | 'telefone' | 'formulario')[]; portal_ativo: boolean; divulgado: boolean; conferido_em: string | null }`; `resumoDoCanal(db: D1Database, projectId: string): Promise<ResumoDoCanal>` (tabela ausente → vazio + log `titular_canal_ausente`).

- [ ] **Step 1: Escrever os testes que falham** — `test/titular-canal.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, workerEnv, habilitarPrivacy } from './helpers/d1';
import { salvarCanal, lerCanal, resumoDoCanal, hostsDoApp, MSG_LINK_DO_PORTAL } from '../src/services/titular-canal';
import { titularCanalSchema } from '../src/schemas';
import { exportarProjeto } from '../src/portabilidade';
import { mesclar } from '../src/services/mesclar';
import { gerarPortal } from '../src/services/titular-pedidos';
import { hojeEmSaoPaulo } from '../src/services/hoje';
import fonteDoServico from '../src/services/titular-canal.ts?raw';

/**
 * Canal do titular (migration 0117, spec 2026-11-19): uma linha por projeto, gravada por quem gere o portal. O link do portal
 * (`/solicitacao#<token>`, credencial de portador) nunca entra; a trilha leva só os nomes dos campos; sai na portabilidade.
 */
const P = 'tc-proj';
const OUTRO = 'tc-outro';
const HOSTS = hostsDoApp({});
const ATOR = 'cons@ness.teste';
const linha = () => env.DB.prepare('SELECT * FROM titular_canal WHERE project_id = ?').bind(P).first<Record<string, unknown>>();

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      (?1, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES
      ('tc-pa', ?1, 'pessoa', 'Ana Exemplo'), ('tc-pa2', ?1, 'pessoa', 'Ana Exemplo Dup'), ('tc-pb', ?2, 'pessoa', 'Bruno Outro')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
});

describe('corpo (titularCanalSchema)', () => {
  it('aceita e-mail, telefone e https; recusa o resto e campo do servidor (conferido_em)', () => {
    const ok = (x: unknown) => titularCanalSchema.safeParse(x).success;
    expect(ok({ email: 'privacidade@exemplo.com.br', telefone: '+55 11 4000-0000', formulario_url: 'https://exemplo.com.br/fale', divulgacao_url: null, conferir: true })).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ email: 'nao-e-email' })).toBe(false);
    expect(ok({ divulgacao_url: 'http://exemplo.com.br/privacidade' })).toBe(false);
    expect(ok({ formulario_url: 'javascript:alert(1)' })).toBe(false);
    expect(ok({ telefone: 'ligue já' })).toBe(false);
    expect(ok({ conferido_em: '2020-01-01' })).toBe(false);
    expect(ok({ conferir: false })).toBe(false);
  });
});

describe('salvarCanal', () => {
  it('grava, lê com o nome do responsável e devolve só os nomes dos campos mudados; ausente não mexe, null limpa', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', responsavel_parte_id: 'tc-pa' }, HOSTS))
      .toEqual({ ok: true, campos: ['email', 'telefone', 'responsavel_parte_id'] });
    const { canal, portal_ativo } = await lerCanal(env.DB, P);
    expect(canal).toMatchObject({ project_id: P, email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', formulario_url: null,
      responsavel_parte_id: 'tc-pa', responsavel_nome: 'Ana Exemplo', atualizado_por: ATOR, conferido_em: null });
    expect(portal_ativo).toBe(false);
    expect(await salvarCanal(env.DB, P, ATOR, { telefone: null }, HOSTS)).toEqual({ ok: true, campos: ['telefone'] });
    expect(await linha()).toMatchObject({ email: 'privacidade@exemplo.com.br', telefone: null });
  });

  it('o link do portal nunca entra: host do app ou caminho /solicitacao → 422 e nada gravado', async () => {
    const urls = ['https://n360.ness.com.br/solicitacao#tok-abc123', 'https://niso.ness.com.br/privacy', 'https://nprivacy.ness.com.br/x',
      'https://exemplo.com.br/solicitacao#tok-abc123', 'https://EXEMPLO.com.br/Solicitacao'];
    for (const url of urls) for (const campo of ['formulario_url', 'divulgacao_url'] as const) {
      expect(await salvarCanal(env.DB, P, ATOR, { [campo]: url }, HOSTS), `${campo} ${url}`).toEqual({ ok: false, status: 422, error: MSG_LINK_DO_PORTAL });
    }
    const { n } = (await env.DB.prepare(`SELECT count(*) AS n FROM titular_canal WHERE coalesce(formulario_url, '') || coalesce(divulgacao_url, '') LIKE '%solicitacao%'
      OR coalesce(formulario_url, '') || coalesce(divulgacao_url, '') LIKE '%ness.com.br%'`).first<{ n: number }>())!;
    expect(n).toBe(0);
    expect(hostsDoApp({ APP_URL: 'https://n360-homolog.exemplo.dev' })).toEqual(expect.arrayContaining(['n360-homolog.exemplo.dev', 'n360.ness.com.br']));
  });

  it('responsável de outro projeto ou inexistente: 400, nada muda', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'tc-pb' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    expect(await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'nao-existe' }, HOSTS)).toMatchObject({ ok: false, status: 400 });
    expect((await linha())!.responsavel_parte_id).toBe('tc-pa');
  });

  it('conferência: o servidor carimba dia e pessoa; sem página é 422; outro campo não mexe; trocar a página apaga a conferência', async () => {
    expect(await salvarCanal(env.DB, P, ATOR, { conferir: true }, HOSTS)).toMatchObject({ ok: false, status: 422 });
    expect(await salvarCanal(env.DB, P, ATOR, { divulgacao_url: 'https://exemplo.com.br/privacidade', conferir: true }, HOSTS))
      .toEqual({ ok: true, campos: ['divulgacao_url', 'conferencia'] });
    expect(await linha()).toMatchObject({ conferido_em: hojeEmSaoPaulo(), conferido_por: ATOR });
    await salvarCanal(env.DB, P, 'outra@ness.teste', { email: 'lgpd@exemplo.com.br' }, HOSTS);
    expect(await linha()).toMatchObject({ conferido_em: hojeEmSaoPaulo(), conferido_por: ATOR, atualizado_por: 'outra@ness.teste' });
    await salvarCanal(env.DB, P, ATOR, { divulgacao_url: 'https://exemplo.com.br/lgpd' }, HOSTS);
    expect(await linha()).toMatchObject({ conferido_em: null, conferido_por: null });
  });

  it('trilha titular.canal só com os NOMES dos campos, nunca o endereço', async () => {
    const { results } = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular.canal' AND project_id = ?`).bind(P).all<{ details: string }>();
    expect(results.length).toBeGreaterThanOrEqual(5);
    const texto = JSON.stringify(results);
    for (const v of ['privacidade@', 'lgpd@', '4000', 'exemplo.com.br/']) expect(texto, v).not.toContain(v);
    expect(texto).toContain('Canal do titular atualizado: email, telefone, responsavel_parte_id');
  });
});

describe('resumoDoCanal (painel e trilha)', () => {
  it('meios pelos campos preenchidos, divulgado pela página; o portal ativo conta à parte; projeto sem linha = vazio', async () => {
    await salvarCanal(env.DB, P, ATOR, { formulario_url: 'https://exemplo.com.br/fale', telefone: '11 4000-0000' }, HOSTS);
    expect(await resumoDoCanal(env.DB, P)).toEqual({ meios: ['email', 'telefone', 'formulario'], portal_ativo: false, divulgado: true, conferido_em: null });
    expect(await resumoDoCanal(env.DB, OUTRO)).toEqual({ meios: [], portal_ativo: false, divulgado: false, conferido_em: null });
    await gerarPortal(env.DB, OUTRO, ATOR);
    expect(await resumoDoCanal(env.DB, OUTRO)).toEqual({ meios: [], portal_ativo: true, divulgado: false, conferido_em: null });
  });
});

describe('portabilidade e mescla', () => {
  it('a exportação do projeto leva a linha do canal; a do outro projeto não', async () => {
    const a = await exportarProjeto(workerEnv(), P);
    expect(a.dados.titular_canal).toEqual([expect.objectContaining({ project_id: P, email: 'lgpd@exemplo.com.br' })]);
    const b = await exportarProjeto(workerEnv(), OUTRO);
    expect(b.dados.titular_canal).toEqual([]);
    expect(JSON.stringify(b)).not.toContain('lgpd@exemplo.com.br');
  });

  it('mesclar partes leva o responsável do canal para o cadastro que fica', async () => {
    await salvarCanal(env.DB, P, ATOR, { responsavel_parte_id: 'tc-pa2' }, HOSTS);
    const r = await mesclar(env.DB, 'partes', P, ATOR, 'tc-pa', 'tc-pa2');
    expect('ok' in r && r.efeitos).toEqual(expect.arrayContaining([{ rotulo: 'Responsável do canal do titular', n: 1 }]));
    expect((await linha())!.responsavel_parte_id).toBe('tc-pa');
  });
});

describe('P0 do n.ot', () => {
  it('o serviço não lê nem grava nada ot_ e não importa módulo do n.ot', () => {
    expect(fonteDoServico).not.toMatch(/\bot_|from '\.\/ot/);
  });
});
```

  `test/titular-canal-sem-tabela.test.ts` (arquivo próprio: o armazenamento do D1 é isolado por arquivo, então derrubar a tabela aqui não afeta os outros):

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { resumoDoCanal } from '../src/services/titular-canal';
import { gerarPortal } from '../src/services/titular-pedidos';

/** Produção antes da 0117 (deploy fora do workflow): o resumo não derruba o painel; o canal conta como não registrado. */
describe('resumoDoCanal sem a tabela titular_canal', () => {
  beforeAll(async () => {
    await applySchema();
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('st', 'C', 'ISO 27001', 'Controller', 'Active')`).run();
    await gerarPortal(env.DB, 'st', 'cons@ness.teste');
    await env.DB.prepare('DROP TABLE titular_canal').run();
  });

  it('devolve o canal vazio (com o portal), registra o aviso e não lança', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await resumoDoCanal(env.DB, 'st')).toEqual({ meios: [], portal_ativo: true, divulgado: false, conferido_em: null });
    expect(log.mock.calls.flat().join(' ')).toContain('titular_canal_ausente');
    log.mockRestore();
  });

  it('outro erro de banco continua subindo: só a tabela ausente é tolerada', async () => {
    const db = { prepare: (sql: string) => (sql.includes('titular_canal')
      ? { bind: () => ({ first: async () => { throw new Error('D1_ERROR: database is locked'); } }) }
      : env.DB.prepare(sql)) } as unknown as D1Database;
    await expect(resumoDoCanal(db, 'st')).rejects.toThrow('database is locked');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/titular-canal.test.ts test/titular-canal-sem-tabela.test.ts` → FAIL (`Failed to resolve import "../src/services/titular-canal"`).

- [ ] **Step 3: Implementar.** Em `src/schemas/nucleo.ts`, logo depois de `tratativaSchema` (linha 292):

```ts
/** Canal do titular (migration 0117). Campo ausente não mexe; `null` limpa. Só https; o link do portal é recusado no serviço (422). */
const urlHttps = z.string().trim().max(500).refine(
  (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } },
  'Use um endereço https:// completo',
);
export const titularCanalSchema = z.object({
  email: z.email().max(200).nullish(),
  telefone: z.string().trim().min(8).max(40).regex(/^[0-9+().\-\s]+$/, 'Telefone só com números, espaço, +, (, ), - e .').nullish(),
  formulario_url: urlHttps.nullish(),
  divulgacao_url: urlHttps.nullish(),
  responsavel_parte_id: z.string().min(1).max(64).nullish(),
  // "Conferi a página hoje": o servidor carimba o dia e quem conferiu (como a identidade do pedido, 0104).
  conferir: z.literal(true).optional(),
}).strict();
export type TitularCanalCorpo = z.output<typeof titularCanalSchema>;
```

  `src/services/titular-canal.ts`:

```ts
import { logAudit } from '../helpers';
import { appUrl, APP_URL_PADRAO, ORIGENS_EXTRAS, HOSTS_LEGADOS } from '../config/url';
import { hojeEmSaoPaulo } from './hoje';
import { lerPortal } from './titular-pedidos';
import type { TitularCanalCorpo } from '../schemas';

/**
 * Canal do titular (migration 0117, spec 2026-11-19): por onde o titular fala com a empresa (e-mail, telefone, formulário) e a página
 * pública onde canal e encarregado aparecem. Uma linha por projeto. O meio existe quando o campo está preenchido; tirar é limpar.
 */
export const CAMPOS_CANAL = ['email', 'telefone', 'formulario_url', 'divulgacao_url', 'responsavel_parte_id'] as const;
type CampoCanal = (typeof CAMPOS_CANAL)[number];
export type LinhaCanal = {
  id: string; project_id: string; email: string | null; telefone: string | null; formulario_url: string | null; divulgacao_url: string | null;
  responsavel_parte_id: string | null; responsavel_nome: string | null; conferido_em: string | null; conferido_por: string | null;
  atualizado_por: string | null; updated_at: string;
};
export type ResumoDoCanal = { meios: ('email' | 'telefone' | 'formulario')[]; portal_ativo: boolean; divulgado: boolean; conferido_em: string | null };
type Falha = { ok: false; status: 400 | 422; error: string };

export const MSG_LINK_DO_PORTAL = 'Este é o link do portal do n.360 (é a chave de acesso do formulário): não o grave aqui. O portal ativo já conta como formulário.';

/** Hosts que servem o app: o configurado, o padrão, os dos módulos e os legados. Endereço neles nunca é página do cliente. */
export const hostsDoApp = (env: { APP_URL?: string }): string[] =>
  [...new Set([appUrl(env), APP_URL_PADRAO, ...ORIGENS_EXTRAS, ...HOSTS_LEGADOS.map((h) => `https://${h}`)].map((u) => new URL(u).host.toLowerCase()))];

/** O link do portal (`<app>/solicitacao#<token>`) é credencial de portador: nem o host do app nem o caminho `/solicitacao` entram. */
export const urlDoApp = (url: string, hosts: readonly string[]): boolean => {
  const u = new URL(url);
  return hosts.includes(u.host.toLowerCase()) || u.pathname.toLowerCase().startsWith('/solicitacao');
};

export async function lerCanal(db: D1Database, projectId: string): Promise<{ canal: LinhaCanal | null; portal_ativo: boolean }> {
  const [canal, portal] = await Promise.all([
    db.prepare(`SELECT c.*, p.nome AS responsavel_nome FROM titular_canal c
                  LEFT JOIN partes p ON p.id = c.responsavel_parte_id AND p.project_id = c.project_id WHERE c.project_id = ?`)
      .bind(projectId).first<LinhaCanal>(),
    lerPortal(db, projectId),
  ]);
  return { canal: canal ?? null, portal_ativo: !!portal?.ativo };
}

export async function salvarCanal(db: D1Database, projectId: string, ator: string, d: TitularCanalCorpo, hosts: readonly string[]): Promise<Falha | { ok: true; campos: string[] }> {
  for (const k of ['formulario_url', 'divulgacao_url'] as const) {
    const v = d[k];
    if (v && urlDoApp(v, hosts)) return { ok: false, status: 422, error: MSG_LINK_DO_PORTAL };
  }
  if (d.responsavel_parte_id && !(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.responsavel_parte_id, projectId).first())) {
    return { ok: false, status: 400, error: 'responsavel_parte_id inexistente ou de outro projeto' };
  }
  const { canal: atual } = await lerCanal(db, projectId);
  const novo = Object.fromEntries(CAMPOS_CANAL.map((k) => [k, d[k] !== undefined ? d[k] : (atual?.[k] ?? null)])) as Record<CampoCanal, string | null>;
  const mudaram: string[] = CAMPOS_CANAL.filter((k) => (atual?.[k] ?? null) !== novo[k]);
  if (d.conferir && !novo.divulgacao_url) return { ok: false, status: 422, error: 'Registre a página de divulgação antes de conferir' };
  // A conferência é da página: trocar a página apaga a anterior.
  const trocouPagina = mudaram.includes('divulgacao_url');
  const conferidoEm = d.conferir ? hojeEmSaoPaulo() : trocouPagina ? null : (atual?.conferido_em ?? null);
  const conferidoPor = d.conferir ? ator : trocouPagina ? null : (atual?.conferido_por ?? null);
  await db.prepare(
    `INSERT INTO titular_canal (id, project_id, email, telefone, formulario_url, divulgacao_url, responsavel_parte_id, conferido_em, conferido_por, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET email = excluded.email, telefone = excluded.telefone, formulario_url = excluded.formulario_url,
       divulgacao_url = excluded.divulgacao_url, responsavel_parte_id = excluded.responsavel_parte_id, conferido_em = excluded.conferido_em,
       conferido_por = excluded.conferido_por, atualizado_por = excluded.atualizado_por, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), projectId, novo.email, novo.telefone, novo.formulario_url, novo.divulgacao_url, novo.responsavel_parte_id, conferidoEm, conferidoPor, ator).run();
  const campos = [...mudaram, ...(d.conferir ? ['conferencia'] : [])];
  // Só os NOMES dos campos: o endereço do canal (e-mail do encarregado, às vezes) não vai para a trilha.
  await logAudit(db, 'titular.canal', ator, `Canal do titular atualizado: ${campos.join(', ') || 'nada mudou'}`, '', '', projectId);
  return { ok: true, campos };
}

const MEIOS = [['email', 'email'], ['telefone', 'telefone'], ['formulario_url', 'formulario']] as const;

/** O que o painel e a trilha leem. Tabela ausente (produção antes da 0117): canal vazio e um aviso no log, nunca erro no painel. */
export async function resumoDoCanal(db: D1Database, projectId: string): Promise<ResumoDoCanal> {
  const portal_ativo = !!(await lerPortal(db, projectId))?.ativo;
  let c: Pick<LinhaCanal, 'email' | 'telefone' | 'formulario_url' | 'divulgacao_url' | 'conferido_em'> | null;
  try {
    c = await db.prepare('SELECT email, telefone, formulario_url, divulgacao_url, conferido_em FROM titular_canal WHERE project_id = ?')
      .bind(projectId).first();
  } catch (e) {
    if (!/no such table: titular_canal/i.test(String((e as Error)?.message ?? e))) throw e;
    console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_canal_ausente', projeto: projectId }));
    c = null;
  }
  return c
    ? { meios: MEIOS.filter(([k]) => !!c![k]).map(([, m]) => m), portal_ativo, divulgado: !!c.divulgacao_url, conferido_em: c.conferido_em }
    : { meios: [], portal_ativo, divulgado: false, conferido_em: null };
}
```

  `src/services/mesclar.ts`, em `TROCAR.partes`, depois da linha `{ rotulo: 'Responsável de incidente', tabela: 'incidentes', coluna: 'responsavel_parte_id' },` (linha 29):

```ts
    { rotulo: 'Responsável do canal do titular', tabela: 'titular_canal', coluna: 'responsavel_parte_id' },
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/titular-canal.test.ts test/titular-canal-sem-tabela.test.ts test/mesclar.test.ts test/documentos-arquivo-ligacoes.test.ts test/portabilidade.test.ts test/titular-portal.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts` → `Test Files  8 passed (8)`; `npx tsc --noEmit` → sem saída.
- [ ] **Step 5: Mutação** (cada uma derruba um teste; restaure depois de cada): (a) em `urlDoApp`, tire `|| u.pathname.toLowerCase().startsWith('/solicitacao')` → cai "o link do portal nunca entra" (caso `exemplo.com.br/solicitacao`); (b) em `salvarCanal`, troque `campos.join(', ')` por `JSON.stringify(novo)` → cai "trilha titular.canal só com os NOMES"; (c) em `resumoDoCanal`, tire o `if (!/no such table.../.test(...)) throw e;` → cai "outro erro de banco continua subindo"; (d) tire a linha nova de `TROCAR` → cai "mesclar partes".
- [ ] **Step 6: Commit**

```bash
git add src/schemas/nucleo.ts src/services/titular-canal.ts src/services/mesclar.ts test/titular-canal.test.ts test/titular-canal-sem-tabela.test.ts
git commit -m "feat(privacy): serviço do canal do titular (recusa o link do portal, conferência carimbada, trilha só com nomes)"
```

### Task 3: Rotas `GET|PUT /titular-canal`, faixa, agente fora da escrita, contrato e documentação do PR1 **[revisor opus]**

**Files:**
- Modify: `src/routes/titular.ts` (import das linhas 21-24; nova seção depois de `titularPortalApp.post('/desativar', ...)`, linha 189), `src/index.ts:59` (import) e `:514` (rota), `src/modulos.ts:41`, `src/middleware/agente.ts` (dentro de `FORA_DO_AGENTE`, depois da linha 127), `src/openapi.ts:134` (import) e `:410` (entrada), `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` (gerados), `test/titular-canal.test.ts` (acrescenta), `AGENTS.md` (depois do item "Quem grava", linha 549), `CHANGELOG.md:13` (nova seção)

**Interfaces:**
- Consumes: `lerCanal`, `salvarCanal`, `hostsDoApp`, `MSG_LINK_DO_PORTAL` (Task 2); `titularCanalSchema` (Task 2); `podeGerirPortal` (`src/routes/titular.ts:168`, mesmo arquivo: não precisa exportar).
- Produces: `export const titularCanalApp` (Hono). `GET /api/v1/projects/:projectId/titular-canal` → 200 `{ canal: LinhaCanal | null, portal_ativo: boolean }` para quem alcança o projeto com o n.privacy (inclusive agente e chave de leitura). `PUT` mesmo caminho, corpo `TitularCanalCorpo` → 200 `{ ok: true }`; 403 fora de `podeGerirPortal` e para o agente; 400 corpo inválido ou parte alheia; 422 link do portal ou conferir sem página. Faixa `'titular-canal': 'privacy'`.

- [ ] **Step 1: Escrever os testes que falham** — em `test/titular-canal.test.ts`, acrescente aos imports do topo:

```ts
import app from '../src/index';
import { sessionFor, concederModulos } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import { faixaDoCaminho } from '../src/modulos';
```

  (junte `sessionFor` e `concederModulos` ao import existente de `./helpers/d1`). Logo depois do `beforeAll` do topo (antes de `describe('corpo ...')`), acrescente as peças de requisição, num segundo `beforeAll` de nível de arquivo (roda depois do primeiro):

```ts
const ROTA = `/api/v1/projects/${P}/titular-canal`;
const AGENTE = { userId: 'tc-cons', email: 'cons@ness.teste', projectId: P, concessaoId: 'tc-conc' };
const requisicao = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) });
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) => app.fetch(requisicao(metodo, caminho, h, corpo), workerEnv());
const comoAgente = (metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(requisicao(metodo, caminho, { 'X-Agente-Confirmado': '1' }, corpo), { ...workerEnv(), AGENTE } as any);
const S: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('tc-cons', 'cons@ness.teste', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('tc-adm', 'adm@cliente.teste', 'x', 'Adm', 'org_admin', ?1, 'org_ness'),
      ('tc-usr', 'usr@cliente.teste', 'x', 'Usr', 'org_user', ?1, 'org_ness'),
      ('tc-cli', 'cli@cliente.teste', 'x', 'Cli', 'client', ?1, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc', ?, 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('tc-conc', 'tc-cons', ?, datetime('now', '+30 days'))`).bind(P),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('tc-kw', ?1, ?2, 'escrita', 'write', 'Active'), ('tc-kr', ?1, ?3, 'leitura', 'read', 'Active')`)
      .bind(P, await sha256Hex('tc-chave-escrita'), await sha256Hex('tc-chave-leitura')),
  ]);
  await habilitarPrivacy(P, OUTRO); // de novo: agora a conta do consultor existe e recebe o módulo
  await concederModulos(['tc-adm', 'tc-usr', 'tc-cli'], ['privacy']);
  S.cons = await sessionFor({ id: 'tc-cons', email: 'cons@ness.teste', role: 'consultor' });
  S.adm = await sessionFor({ id: 'tc-adm', email: 'adm@cliente.teste', role: 'org_admin', client_project_id: P });
  S.usr = await sessionFor({ id: 'tc-usr', email: 'usr@cliente.teste', role: 'org_user', client_project_id: P });
  S.cli = await sessionFor({ id: 'tc-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: P });
  S.chaveW = { 'X-API-Key': 'tc-chave-escrita' };
  S.chaveR = { 'X-API-Key': 'tc-chave-leitura' };
});
```

  No fim do arquivo:

```ts
describe('rotas GET|PUT /api/v1/projects/:id/titular-canal', () => {
  it('lê: equipe, org_admin, org_user, client, chave de leitura e o agente (200)', async () => {
    for (const [quem, h] of Object.entries({ cons: S.cons, adm: S.adm, usr: S.usr, cli: S.cli, chaveR: S.chaveR })) {
      const r = await chamar(h, 'GET', ROTA);
      expect(r.status, quem).toBe(200);
      expect(await r.json(), quem).toMatchObject({ canal: { project_id: P }, portal_ativo: false });
    }
    const ag = await comoAgente('GET', ROTA);
    expect(ag.status, await ag.clone().text()).toBe(200);
  });

  it('grava: equipe e org_admin (200); quem gravou fica em atualizado_por', async () => {
    expect((await chamar(S.cons, 'PUT', ROTA, { email: 'canal@exemplo.com.br' })).status).toBe(200);
    const r = await chamar(S.adm, 'PUT', ROTA, { telefone: '11 4000-0001' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await (await chamar(S.cli, 'GET', ROTA)).json()).toMatchObject({ canal: { email: 'canal@exemplo.com.br', telefone: '11 4000-0001', atualizado_por: 'adm@cliente.teste' } });
  });

  it('recusa a gravação (403) a org_user, client, chave de escrita, chave de leitura e ao agente; nada muda', async () => {
    for (const [quem, h] of Object.entries({ usr: S.usr, cli: S.cli, chaveW: S.chaveW, chaveR: S.chaveR })) {
      expect((await chamar(h, 'PUT', ROTA, { email: 'invasor@exemplo.com.br' })).status, quem).toBe(403);
    }
    const ag = await comoAgente('PUT', ROTA, { email: 'invasor@exemplo.com.br' });
    expect(ag.status).toBe(403);
    expect((await ag.json<{ error: string }>()).error).toContain('fora do alcance do agente');
    expect((await linha())!.email).toBe('canal@exemplo.com.br');
  });

  it('outro projeto: nem lê nem grava (403), e nenhuma linha nasce lá', async () => {
    const C = `/api/v1/projects/${OUTRO}/titular-canal`;
    for (const h of [S.cons, S.adm]) {
      expect((await chamar(h, 'GET', C)).status).toBe(403);
      expect((await chamar(h, 'PUT', C, { email: 'x@exemplo.com.br' })).status).toBe(403);
    }
    expect(await env.DB.prepare('SELECT 1 FROM titular_canal WHERE project_id = ?').bind(OUTRO).first()).toBeNull();
  });

  it('link do portal: 422 com a mensagem; http e campo do servidor: 400', async () => {
    const r = await chamar(S.cons, 'PUT', ROTA, { formulario_url: 'https://n360.ness.com.br/solicitacao#tok-abc123' });
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBe(MSG_LINK_DO_PORTAL);
    expect((await chamar(S.cons, 'PUT', ROTA, { divulgacao_url: 'http://exemplo.com.br/privacidade' })).status).toBe(400);
    expect((await chamar(S.cons, 'PUT', ROTA, { conferido_em: '2020-01-01' })).status).toBe(400);
  });

  it('faixa n.privacy: projeto só com o n.iso recusa (403)', async () => {
    expect(faixaDoCaminho('/api/v1/projects/x/titular-canal')).toBe('privacy');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('tc-iso', 'Só ISO', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-tc-iso', 'tc-iso', 'Cons', 'cons@ness.teste', 'consultor', 'Consultor')`),
    ]);
    expect((await chamar(S.cons, 'GET', '/api/v1/projects/tc-iso/titular-canal')).status).toBe(403);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/titular-canal.test.ts` → FAIL nos casos de rota (404 `API route not found` no lugar de 200/403).

- [ ] **Step 3: Implementar.**

  `src/routes/titular.ts`: no import de `../schemas` (linhas 21-24) acrescente `titularCanalSchema` ao fim da linha 23 (`titularPedidoAtualizarSchema, titularPedidoCriarSchema, tratativaSchema, titularCanalSchema,`). Junto dos imports de serviço (linha 13), acrescente `import { lerCanal, salvarCanal, hostsDoApp } from '../services/titular-canal';`. Depois do handler `titularPortalApp.post('/desativar', ...)` (termina na linha 189):

```ts
// ─── Canal do titular (migration 0117, spec 2026-11-19): por onde o titular fala com a empresa e onde isso está publicado ──────
// Grava quem gere o portal (`podeGerirPortal`); org_user e client leem (allow-list de só leitura de auth.ts); chave de API e agente
// só leem (o PUT está em FORA_DO_AGENTE e a chave entra como `client`). O link do portal é recusado no serviço (422).
export const titularCanalApp = new Hono<Ctx>();

titularCanalApp.get('/', async (c) => c.json(await lerCanal(c.env.DB, c.req.param('projectId')!)));

titularCanalApp.put('/', async (c) => {
  try {
    if (!podeGerirPortal(c.get('user'))) return c.json({ error: 'Forbidden: o canal do titular é registrado pela equipe da consultoria ou pelo org_admin, não por chave de API nem pelo agente' }, 403);
    const v = await validateBody(c, titularCanalSchema);
    if (!v.success) return v.response;
    const r = await salvarCanal(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data, hostsDoApp(c.env));
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar o canal do titular', e); }
});
```

  `src/index.ts:59`: `import { parametrosLegaisApp, titularPedidosApp, titularPortalApp, titularCanalApp, incidentesApp, consentimentosApp } from './routes/titular';`. Depois da linha 514: `app.route('/api/v1/projects/:projectId/titular-canal', titularCanalApp);`.

  `src/modulos.ts:41`: `'titular-pedidos': 'privacy', 'titular-portal': 'privacy', 'titular-canal': 'privacy',`.

  `src/middleware/agente.ts`, dentro de `FORA_DO_AGENTE`, logo depois da linha 127:

```ts
  // Canal do titular (0117): "conferido em" é afirmação de uma pessoa sobre a página do cliente; o agente lê o canal e não o grava.
  [/^\/api\/v1\/projects\/[^/]+\/titular-canal$/, 'o canal do titular é registrado por uma pessoa, pela interface; o agente só lê', ['PUT', 'POST', 'PATCH', 'DELETE']],
```

  `src/openapi.ts:134`: acrescente `titularCanalSchema,` depois de `tratativaSchema,`. Logo antes da linha 410 (`.../titular-pedidos/:id/identidade`):

```ts
  { metodo: 'PUT', caminho: '/api/v1/projects/:projectId/titular-canal', schema: titularCanalSchema, nome: 'titularCanalSchema' },
```

  Depois: `npm run openapi` → `git diff --stat` mostra `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` com o caminho `/titular-canal` novo (confira com `grep -c titular-canal docs/openapi.json`, esperado ≥ 1).

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/titular-canal.test.ts test/titular-portal.test.ts test/modulos-produto.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/contrato-writes-validados.test.ts test/contrato-isolamento-org.test.ts test/contrato-isolamento-topo.test.ts test/agente-paridade.test.ts test/cliente-titular-incidente.test.ts test/titular-consulta.test.ts test/onda2-numeros.test.ts` → `Test Files  12 passed (12)`. `npx tsc --noEmit` → sem saída. Se `contrato-isolamento-org` acusar `PUT /api/v1/projects/:projectId/titular-canal` como "400 não prova", acrescente em `CORPOS` (linha 80): `'PUT /api/v1/projects/:projectId/titular-canal': () => ({ email: 'varredura@exemplo.com.br' }),` e rode de novo.
- [ ] **Step 5: Mutação** (restaure depois de cada): (a) tire a linha nova de `FORA_DO_AGENTE` → cai "recusa a gravação ... ao agente" (o agente entra como `client` e a rota devolve 403 por papel, mas sem `fora do alcance do agente` na mensagem); (b) troque `if (!podeGerirPortal(...))` por `if (false)` → cai o mesmo teste para `chaveW`; (c) tire `'titular-canal': 'privacy'` → cai `test/modulos-produto.test.ts`.
- [ ] **Step 6: Documentação do PR1.**

  `AGENTS.md` (sem acentos), novo item logo depois do bloco "Quem grava (o cliente age, 15/10)" (termina na linha 549):

```markdown
- **Canal do titular (migration 0117, spec `docs/superpowers/specs/2026-11-19-canal-do-titular-design.md`):** `titular_canal`, uma linha por projeto (`id`, `project_id` UNIQUE, `email`, `telefone`, `formulario_url`, `divulgacao_url`, `responsavel_parte_id`, `conferido_em`/`conferido_por` carimbados pelo servidor com `conferir: true`; trocar a pagina de divulgacao apaga a conferencia). `GET|PUT /projects/:id/titular-canal` (`titularCanalApp` em `src/routes/titular.ts`, servico `src/services/titular-canal.ts`, faixa `privacy`). Grava quem gere o portal (`podeGerirPortal`: equipe e `org_admin`); `org_user` e `client` leem; chave de API e agente so leem (`PUT` em `FORA_DO_AGENTE`). O servidor recusa (422) URL dos hosts do app e qualquer caminho `/solicitacao`: o link do portal e credencial de portador e nunca entra no banco, na exportacao nem no agente. Trilha `titular.canal` so com os NOMES dos campos. Sai na portabilidade; `responsavel_parte_id` entra na mescla de partes. `resumoDoCanal` (`meios`, `portal_ativo`, `divulgado`, `conferido_em`) e a leitura do painel e da trilha e tolera a tabela ausente (log `titular_canal_ausente`). Contrato em `test/titular-canal.test.ts`.
```

  `CHANGELOG.md`, nova seção logo abaixo de `## [Não publicado]` (linha 13):

```markdown
### n.privacy: canal do titular (migração 0117, spec 2026-11-19)
- **Registro do canal do titular (API):** por projeto, o e-mail, o telefone e a página do formulário pelos quais o titular fala com a empresa, a página onde canal e encarregado estão publicados, o responsável e a data da última conferência. Gravam a equipe da consultoria e o administrador do cliente; os demais, a chave de API e o agente só leem. O link do portal de solicitações é recusado nesses campos.
- A migração 0117 é aplicada pelo dono (com backup antes); enquanto não for, o deploy recusa publicar.
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/titular.ts src/index.ts src/modulos.ts src/middleware/agente.ts src/openapi.ts docs/openapi.json mcp-server-niso/src/contrato-gerado.ts \
  test/titular-canal.test.ts AGENTS.md CHANGELOG.md
git commit -m "feat(privacy): rotas do canal do titular (grava quem gere o portal; agente e chave só leem)"
```

  (Se o Step 4 exigiu a entrada em `CORPOS`, inclua `test/contrato-isolamento-org.test.ts` no `git add`.)

**Entrega PR1:** `bash scripts/ci/gate.sh` (na máquina de quem mergeia); PR (rascunho) "canal do titular PR1: modelo e API (migração 0117)"; revisão em modelo forte dos Tasks 1, 2 e 3. Texto do PR, seção obrigatória:

```markdown
## Migração 0117 — ordem de deploy
Este PR traz a migração `0117_titular_canal.sql` (aditiva) e código que lê `titular_canal`. O código não pode rodar em produção sem a tabela.
1. Backup: `npm run db:backup`.
2. Aplicar a 0117 ANTES do código publicar: ou `npx wrangler d1 migrations apply niso-db --remote` antes do merge, ou merge → o deploy do merge recusa (migração pendente) → workflow manual `db-migrate.yml` → workflow *Deploy*.
3. Conferir: `PRAGMA table_info(titular_canal)` (11 colunas) e `npx wrangler d1 migrations list niso-db --remote` → "No migrations to apply".
4. Só então trocar a 0117 para APLICADA em `migrations/README.md`, num commit separado, com a evidência medida.
Rede de segurança: `resumoDoCanal` (painel) trata a tabela ausente como canal vazio; as rotas `/titular-canal` não.
```

---

## PR2 — Tela (sem migration)

### Task 4: Botão "Canal do titular" em Solicitações: formulário para quem grava, leitura para os demais

**Files:**
- Create: `frontend/test/titular-canal-view.test.js`
- Modify: `frontend/src/views/titular.js:1-11` (import), `:94-96` e `:123` (cabeçalho da aba Pedidos), nova seção depois de `window.desativarPortalTitular` (termina na linha 396), `frontend/src/style.css` (fim), `CHANGELOG.md` (seção do canal)

**Interfaces:**
- Consumes: `GET|PUT /api/v1/projects/:projectId/titular-canal` (Task 3: `{ canal: LinhaCanal | null, portal_ativo: boolean }`); `GET /api/v1/projects/:projectId/partes?tipo=pessoa&status=ativa` (como `frontend/src/views/encarregado.js:58`); `podeRegistrar`, `valorOuNulo`, `lista`, `args`, `el`, `dia`, `falha` (`frontend/src/views/titular.js:44-61`); `semRepetir(acao, fazer)` (`frontend/src/ot-comum.js:178`).
- Produces: `window.abrirCanalTitular(projectId)`, `window.salvarCanalTitular(projectId)`; botão `[data-action="abrirCanalTitular"]` no cabeçalho da aba Pedidos para **todos** os papéis.

- [ ] **Step 1: Escrever o teste que falha** — `frontend/test/titular-canal-view.test.js`:

```js
// Canal do titular (spec 2026-11-19, PR2): botão em Solicitações; formulário para quem grava, leitura para os demais. api() REAL; só o
// fetch é dublado, com os corpos de GET/PUT /projects/:id/titular-canal (src/routes/titular.ts, titularCanalApp) e GET /partes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir, resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import { formatarData } from '../src/ui.js';
import { initDelegation } from '../src/delegation.js';
import '../src/views/titular.js';

initDelegation();
const B = '/api/v1/projects/p9';
const CANAL = { canal: { id: 'c1', project_id: 'p9', email: 'privacidade@exemplo.com.br', telefone: '11 4000-0000', formulario_url: null,
    divulgacao_url: 'https://exemplo.com.br/<b>privacidade</b>', responsavel_parte_id: 'pa1', responsavel_nome: 'Ana <i>Exemplo</i>',
    conferido_em: '2026-11-10', conferido_por: 'cons@ness.lat', atualizado_por: 'cons@ness.lat', updated_at: '2026-11-10 10:00:00' }, portal_ativo: true };
const PARTES = [{ id: 'pa1', nome: 'Ana <i>Exemplo</i>' }, { id: 'pa2', nome: 'Bruno Exemplo' }];
const el = (id) => document.getElementById(id);
const chave = (u, o) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`;
/** Dublê ESTRITO: chamada fora de `rotas` (inclusive qualquer /ot) lança, em vez de devolver 404. */
const servirEstrito = (rotas) => {
    const f = servir(rotas);
    const base = f.getMockImplementation();
    f.mockImplementation(async (u, o) => { if (!(chave(u, o) in rotas)) throw new Error(`chamada inesperada: ${chave(u, o)}`); return base(u, o); });
    return f;
};
const montarModal = () => { document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>'; };
const ultimoToast = (tipo) => [...document.querySelectorAll(`.toast-${tipo} .toast-text`)].pop()?.textContent;

beforeEach(() => { S.token = 'tok'; S.activeProject = { id: 'p9' }; S.painel = {}; window.render = vi.fn(); history.replaceState(null, '', '/privacy'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

describe('botão "Canal do titular" em Solicitações', () => {
    it('aparece para quem grava e para quem só lê; "Link do portal" segue só para quem grava', async () => {
        for (const [role, portal] of [['consultor', true], ['org_admin', true], ['org_user', false], ['client', false]]) {
            S.user = { role }; S.titularAba = 'pedidos';
            montarModal();
            servir({ [`GET ${B}/titular-pedidos`]: [], [`GET ${B}/incidentes`]: [], 'GET /api/v1/parametros-legais': [] });
            await window.renderTitular(el('c'), el('h'), el('a'));
            const b = el('a').querySelector('[data-action="abrirCanalTitular"]');
            expect(b, role).not.toBeNull();
            expect(b.textContent).toBe('Canal do titular');
            expect(JSON.parse(b.dataset.args)).toEqual(['p9']);
            expect(!!el('a').querySelector('[data-action="abrirPortalTitular"]'), role).toBe(portal);
        }
    });
});

describe('formulário (quem grava)', () => {
    it('abre com os valores escapados, o responsável marcado, a dica, o aviso do portal e rótulos em todo campo; sem estilo nem handler inline', async () => {
        S.user = { role: 'consultor' }; montarModal();
        servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES });
        await window.abrirCanalTitular('p9');
        const m = el('modal-content');
        expect(el('tc-email').value).toBe('privacidade@exemplo.com.br');
        expect(el('tc-divulgacao_url').value).toBe('https://exemplo.com.br/<b>privacidade</b>');
        expect(el('tc-formulario_url').value).toBe('');
        expect(m.querySelector('b, i')).toBeNull();
        expect(el('tc-resp').value).toBe('pa1');
        expect(el('tc-email').getAttribute('aria-describedby')).toBe('tc-dica');
        expect(el('tc-dica').textContent).toContain('caixa institucional');
        expect(el('tc-portal').textContent).toContain('já conta como formulário');
        expect(el('tc-conferido').textContent).toContain(formatarData('2026-11-10'));
        for (const c of m.querySelectorAll('input, select')) expect(m.querySelector(`label[for="${c.id}"]`), c.id).not.toBeNull();
        expect(m.querySelector('[data-action="salvarCanalTitular"]').textContent).toBe('Salvar');
        expect(m.innerHTML).not.toMatch(/\sstyle=|\son[a-z]+=/i);
    });

    it('salvar manda os campos (vazio vira null) e "conferir" só marcado; invalida o painel guardado do projeto', async () => {
        S.user = { role: 'org_admin' }; montarModal();
        S.painel = { 'privacy|p9': {}, 'privacy|p8': {} };
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES, [`PUT ${B}/titular-canal`]: { ok: true } });
        await window.abrirCanalTitular('p9');
        el('tc-telefone').value = '   ';
        el('tc-formulario_url').value = 'https://exemplo.com.br/fale';
        el('tc-resp').value = 'pa2';
        el('tc-conferir').checked = true;
        await window.salvarCanalTitular('p9');
        const put = f.mock.calls.find(([u, o]) => chave(u, o) === `PUT ${B}/titular-canal`);
        expect(JSON.parse(put[1].body)).toEqual({ email: 'privacidade@exemplo.com.br', telefone: null, formulario_url: 'https://exemplo.com.br/fale',
            divulgacao_url: 'https://exemplo.com.br/<b>privacidade</b>', responsavel_parte_id: 'pa2', conferir: true });
        expect(Object.keys(S.painel)).toEqual(['privacy|p8']);
        expect(ultimoToast('success')).toBe('Canal do titular salvo.');
    });

    it('422 do servidor (link do portal): a mensagem do servidor aparece e o formulário fica aberto', async () => {
        S.user = { role: 'consultor' }; montarModal();
        const MSG = 'Este é o link do portal do n.360 (é a chave de acesso do formulário): não o grave aqui. O portal ativo já conta como formulário.';
        servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES });
        await window.abrirCanalTitular('p9');
        vi.stubGlobal('fetch', vi.fn(async () => resposta({ error: MSG }, 422)));
        await window.salvarCanalTitular('p9');
        expect(ultimoToast('error')).toBe(MSG);
        expect(el('tc-email')).not.toBeNull();
    });

    it('dois cliques em Salvar mandam um PUT só (semRepetir)', async () => {
        S.user = { role: 'consultor' }; montarModal();
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL, [`GET ${B}/partes`]: PARTES, [`PUT ${B}/titular-canal`]: { ok: true } });
        await window.abrirCanalTitular('p9');
        const base = f.getMockImplementation();
        let soltar;
        f.mockImplementation((u, o) => (chave(u, o) === `PUT ${B}/titular-canal` ? new Promise((r) => { soltar = () => r(resposta({ ok: true })); }) : base(u, o)));
        const a1 = window.salvarCanalTitular('p9');
        const a2 = window.salvarCanalTitular('p9');
        await new Promise((r) => setTimeout(r, 0));
        soltar();
        await Promise.all([a1, a2]);
        expect(f.mock.calls.filter(([u, o]) => chave(u, o) === `PUT ${B}/titular-canal`)).toHaveLength(1);
    });
});

describe('leitura (quem não grava)', () => {
    it('org_user vê os valores escapados, sem campos nem "Salvar", e não pede a lista de pessoas', async () => {
        S.user = { role: 'org_user' }; montarModal();
        const f = servirEstrito({ [`GET ${B}/titular-canal`]: CANAL });
        await window.abrirCanalTitular('p9');
        const m = el('modal-content');
        expect(m.querySelector('input, select, [data-action="salvarCanalTitular"]')).toBeNull();
        expect(m.querySelector('.tc-leitura').textContent).toContain('https://exemplo.com.br/<b>privacidade</b>');
        expect(m.textContent).toContain('Ana <i>Exemplo</i>');
        expect(m.querySelector('b, i')).toBeNull();
        expect(f.mock.calls.map(([u, o]) => chave(u, o))).toEqual([`GET ${B}/titular-canal`]);
    });

    it('sem canal registrado: "Não informado" nos quatro campos e no responsável', async () => {
        S.user = { role: 'client' }; montarModal();
        servirEstrito({ [`GET ${B}/titular-canal`]: { canal: null, portal_ativo: false } });
        await window.abrirCanalTitular('p9');
        expect([...el('modal-content').querySelectorAll('.tc-leitura .pn-falta')].map((x) => x.textContent)).toEqual(Array(5).fill('Não informado'));
        expect(el('tc-portal')).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/titular-canal-view.test.js` → FAIL (`window.abrirCanalTitular is not a function`; sem o botão no cabeçalho).

- [ ] **Step 3: Implementar.** `frontend/src/views/titular.js`, depois da linha 11: `import { semRepetir } from '../ot-comum.js';`. Depois da linha 95 (`const portalBtn = ...`):

```js
    // Canal do titular (0117): todos leem; quem registra os pedidos edita no mesmo botão.
    const canalBtn = ` <button class="btn" data-action="abrirCanalTitular" data-args='${args(proj.id)}'>Canal do titular</button>`;
```

  Linha 96: `a.innerHTML = aba === 'pedidos' ? novo('abrirNovoPedidoTitular', '+ Registrar pedido') + portalBtn + canalBtn`. Linha 123: `a.innerHTML = novo('abrirNovoPedidoTitular', '+ Registrar pedido', false) + portalBtn + canalBtn`. Depois de `window.desativarPortalTitular` (linha 396):

```js
// ─── Canal do titular (migration 0117, spec 2026-11-19): por onde o titular fala com a empresa e onde isso está publicado ──────
// Grava quem registra os pedidos (`podeRegistrar`, o espelho de `podeGerirPortal` do servidor); os demais leem. A regra é do servidor
// (recusa o link do portal, carimba a conferência): aqui só se mostra e se chama.
const CAMPOS_CANAL = [['email', 'E-mail do canal', 'email', 200], ['telefone', 'Telefone', 'tel', 40],
    ['formulario_url', 'Página do formulário (https://)', 'url', 500], ['divulgacao_url', 'Página de divulgação (https://)', 'url', 500]];

window.abrirCanalTitular = async function (projectId) {
    const grava = podeRegistrar();
    let r, partes;
    try {
        [r, partes] = await Promise.all([
            api('GET', `/api/v1/projects/${projectId}/titular-canal`),
            // Secundário: sem a lista de pessoas, o responsável fica "Ninguém indicado".
            grava ? api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`).catch(() => []) : [],
        ]);
    } catch (e) { falha(e, 'Não foi possível abrir o canal do titular'); return; }
    const c = (r && r.canal) || {};
    const portal = r && r.portal_ativo
        ? '<p id="tc-portal" class="tc-dica">O portal de solicitações do n.360 está ativo e já conta como formulário. Não cole o link dele aqui: o link é a chave de acesso do formulário.</p>' : '';
    const conferido = `<p id="tc-conferido">${c.conferido_em ? `Página de divulgação conferida em ${escapeHTML(dia(c.conferido_em))}.` : 'Página de divulgação nunca conferida.'}</p>`;
    if (!grava) {
        const valor = (v) => (v ? escapeHTML(v) : '<span class="pn-falta">Não informado</span>');
        openModal(`<h3>Canal do titular</h3>${portal}
            <dl class="tc-leitura">${CAMPOS_CANAL.map(([k, rotulo]) => `<dt>${escapeHTML(rotulo)}</dt><dd>${valor(c[k])}</dd>`).join('')}
                <dt>Responsável</dt><dd>${valor(c.responsavel_nome)}</dd></dl>${conferido}`);
        return;
    }
    const pessoas = lista(partes).map((p) => `<option value="${escapeHTML(p.id)}"${p.id === c.responsavel_parte_id ? ' selected' : ''}>${escapeHTML(p.nome)}</option>`).join('');
    openModal(`<h3>Canal do titular</h3>
        <p id="tc-dica" class="tc-dica">Basta um meio. Use uma caixa institucional (por exemplo, privacidade@empresa.com.br), não o e-mail pessoal do encarregado. A página de divulgação é onde o canal e o encarregado aparecem para o público, no site da empresa.</p>
        ${portal}
        ${CAMPOS_CANAL.map(([k, rotulo, tipo, max]) => `<div class="form-group"><label class="form-label" for="tc-${k}">${escapeHTML(rotulo)}</label>
            <input class="form-input" id="tc-${k}" type="${tipo}" maxlength="${max}" aria-describedby="tc-dica" value="${escapeHTML(c[k] || '')}"></div>`).join('')}
        <div class="form-group"><label class="form-label" for="tc-resp">Responsável (opcional)</label>
            <select class="form-input" id="tc-resp"><option value="">Ninguém indicado</option>${pessoas}</select></div>
        ${conferido}
        <div class="form-group"><input type="checkbox" id="tc-conferir"> <label for="tc-conferir">Conferi a página de divulgação hoje</label></div>
        <button class="btn btn-primary" data-action="salvarCanalTitular" data-args='${args(projectId)}'>Salvar</button>`);
};

window.salvarCanalTitular = (projectId) => semRepetir('salvarCanalTitular', async () => {
    const corpo = { email: valorOuNulo('tc-email'), telefone: valorOuNulo('tc-telefone'), formulario_url: valorOuNulo('tc-formulario_url'),
        divulgacao_url: valorOuNulo('tc-divulgacao_url'), responsavel_parte_id: el('tc-resp').value || null, ...(el('tc-conferir').checked ? { conferir: true } : {}) };
    try {
        await api('PUT', `/api/v1/projects/${projectId}/titular-canal`, corpo);
        // O painel guardado deste projeto já não vale: o canal entra no passo 1 da trilha e no "O que fazer" (padrão de encarregado.js).
        if (S.painel) for (const k of Object.keys(S.painel)) if (k.split('|')[1] === projectId) delete S.painel[k];
        showToast('Canal do titular salvo.', 'success');
        forceCloseModal();
    } catch (e) { falha(e, 'Não foi possível salvar o canal do titular'); }
});
```

  `frontend/src/style.css`, no fim:

```css
/* Canal do titular (spec 2026-11-19): dica do formulário e a leitura de quem não grava */
.tc-dica { color: var(--text-dim); font-size: 0.85rem; }
.tc-leitura dt { font-weight: 600; margin-top: 8px; }
.tc-leitura dd { margin: 0; }
```

  `CHANGELOG.md`, na seção "n.privacy: canal do titular", acrescente: `- **Botão "Canal do titular" em Solicitações**, ao lado de "Link do portal": quem registra os pedidos preenche e-mail, telefone, página do formulário, página de divulgação e responsável, e marca "Conferi a página de divulgação hoje"; os demais leem. A tela recomenda caixa institucional.`

- [ ] **Step 4: Rodar e ver passar** — `cd frontend && npx vitest run` (suíte inteira, ~70 s) → todos passam (inclusive `test/titular-view.test.js`); `cd frontend && npm run build` → `✓ built in`. Backend: `npx vitest run test/contrato-tela-api.test.ts` → PASS (o caminho `/titular-canal` casa com a rota do Task 3).
- [ ] **Step 5: Mutação** — troque `semRepetir('salvarCanalTitular', async () => {` por `(async () => {` (fechando com `})()`): cai "dois cliques"; troque `escapeHTML(c[k] || '')` por `c[k] || ''`: cai "valores escapados". Restaure.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/titular.js frontend/src/style.css frontend/test/titular-canal-view.test.js CHANGELOG.md
git commit -m "feat(privacy): botão Canal do titular em Solicitações (edita quem grava, os demais leem)"
```

**Entrega PR2:** `bash scripts/ci/gate.sh`; PR (rascunho) "canal do titular PR2: tela". Sem migration (depende do PR1 mergeado e da 0117 aplicada).

---

## PR3 — Trilha, painel e agente (sem migration)

### Task 5: Canal na visão do encarregado, as duas prioridades e o indicador no painel; o agente lê **[revisor opus]**

**Files:**
- Modify: `src/services/encarregado.ts:1-11` (import), `:45-51` (`Promise.all`), depois da `:152` (prioridades), `:186` (`return`); `src/services/painel.ts:506` (resposta); `mcp-server-niso/src/ferramentas.ts:486-487` (descrição); `test/encarregado.test.ts:13-22` (tipo `Visao`), `:53-58` (lista do projeto vazio) e um `describe` novo no fim; `test/titular-canal.test.ts` (acrescenta)

**Interfaces:**
- Consumes: `resumoDoCanal(db, projectId): Promise<ResumoDoCanal>` (Task 2); `exigido(contexto, acao, aba?, filtro?)` e `planejar(contexto, acao, filtro?)` (`src/services/encarregado.ts:150-151`).
- Produces: `visaoDoEncarregado(...)` devolve `canal: ResumoDoCanal` (logo depois de `encarregados`), sem endereço; prioridade **alta** `'Canal do titular não registrado'` (tela `titular`, `grupo: 'semana'`, `quando: 'Exigido'`, `acao: 'Registrar o canal'`, `aba: 'pedidos'`) quando `meios` vazio e portal inativo; **média** `'Canal sem página de divulgação ou nunca conferido'` (tela `titular`, `grupo: 'plano'`, `acao: 'Registrar a divulgação'`) quando há meio (ou portal) e falta página ou conferência. `GET /painel` com bloco privacy ganha `canal_titular: { registrado: boolean; divulgado: boolean }`. `VisaoDoEncarregado` (`src/services/programa.ts:73`) passa a ter `canal` (derivado do tipo de retorno; nada a declarar).

- [ ] **Step 1: Escrever os testes que falham.** `test/encarregado.test.ts`: no tipo `Visao` (linhas 13-22) acrescente `canal: { meios: string[]; portal_ativo: boolean; divulgado: boolean; conferido_em: string | null };`. Na lista das linhas 53-58, logo depois de `'alta: Nenhum encarregado indicado (LGPD, art. 41) -> encarregado',` acrescente `'alta: Canal do titular não registrado -> titular',`. No fim do arquivo:

```ts
describe('canal do titular (0117)', () => {
  const doCanal = async () => (await ver()).prioridades.filter((p) => p.texto.startsWith('Canal')) as unknown as Record<string, string>[];
  it('sem meio: alta e Exigido, para Solicitações; com meio e sem página: média; página nunca conferida: média; conferida: nenhuma', async () => {
    expect(await doCanal()).toEqual([expect.objectContaining({ nivel: 'alta', texto: 'Canal do titular não registrado', tela: 'titular',
      grupo: 'semana', quando: 'Exigido', acao: 'Registrar o canal', aba: 'pedidos' })]);
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email) VALUES ('tc1', 'e1', 'privacidade@exemplo.com.br')`).run();
    expect((await doCanal()).map((p) => `${p.nivel}: ${p.texto} -> ${p.tela}`)).toEqual(['media: Canal sem página de divulgação ou nunca conferido -> titular']);
    await db().prepare(`UPDATE titular_canal SET divulgacao_url = 'https://exemplo.com.br/privacidade' WHERE id = 'tc1'`).run();
    expect((await doCanal()).map((p) => p.nivel)).toEqual(['media']);
    await db().prepare(`UPDATE titular_canal SET conferido_em = '2026-11-19' WHERE id = 'tc1'`).run();
    expect(await doCanal()).toEqual([]);
    expect((await ver()).canal).toEqual({ meios: ['email'], portal_ativo: false, divulgado: true, conferido_em: '2026-11-19' });
  });
  it('só o portal ativo conta como meio (sem a alta), mas a página continua pedida', async () => {
    await db().prepare(`INSERT INTO titular_portais (project_id, token_hash, ativo) VALUES ('e1', 'h-e1', 1)`).run();
    const textos = (await ver()).prioridades.map((p) => p.texto);
    expect(textos).not.toContain('Canal do titular não registrado');
    expect(textos).toContain('Canal sem página de divulgação ou nunca conferido');
  });
  it('a visão não leva o endereço do canal, só o resumo; o outro projeto não conta', async () => {
    await db().prepare(`INSERT INTO titular_canal (id, project_id, email, divulgacao_url) VALUES ('tc2', 'e2', 'outro@exemplo.com.br', 'https://outro.exemplo/p')`).run();
    const v = await ver();
    expect(v.canal.meios).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('outro@exemplo.com.br');
  });
});
```

  Em `test/titular-canal.test.ts`, no fim:

```ts
describe('o canal na visão do encarregado, no painel e no agente (PR3)', () => {
  it('o agente lê o resumo do canal pelo GET /encarregado (o que niso_privacy_encarregado chama), sem endereço', async () => {
    const r = await comoAgente('GET', `/api/v1/projects/${P}/encarregado`);
    expect(r.status, await r.clone().text()).toBe(200);
    const v = await r.json<{ canal: unknown }>();
    expect(v.canal).toEqual(await resumoDoCanal(env.DB, P));
    expect(JSON.stringify(v.canal)).not.toContain('@');
  });
  it('o Painel do n.privacy diz se o canal está registrado; o do n.iso não fala do canal', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (?, 'iso', 'teste')`).bind(P).run();
    await concederModulos(['tc-cons'], ['iso', 'privacy']);
    const p = await (await chamar(S.cons, 'GET', `/api/v1/projects/${P}/painel?modulo=privacy`)).json<any>();
    expect(p.canal_titular).toEqual({ registrado: true, divulgado: true });
    const i = await (await chamar(S.cons, 'GET', `/api/v1/projects/${P}/painel?modulo=iso`)).json<any>();
    expect(i).not.toHaveProperty('canal_titular');
  });
  it('a descrição de niso_privacy_encarregado cita o canal do titular', () => {
    expect(TOOLS.find((t) => t.name === 'niso_privacy_encarregado')!.description).toContain('canal do titular');
  });
});
```

  (acrescente ao topo `import { TOOLS } from '../mcp-server-niso/src/ferramentas';`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/encarregado.test.ts test/titular-canal.test.ts` → FAIL (`canal` indefinido; prioridade ausente; `canal_titular` ausente; descrição sem "canal do titular").

- [ ] **Step 3: Implementar.** `src/services/encarregado.ts`: depois da linha 11, `import { resumoDoCanal } from './titular-canal';`. Linhas 45-51: o `Promise.all` passa a desestruturar `[pedidos, incidentes, terceiros, parametros, fontes, encarregados, canal]` e ganha, como último elemento, `resumoDoCanal(db, projectId),`. Logo depois da linha 152 (`p('alta', encarregados.length ? 0 : 1, ...)`):

```ts
  // Canal do titular (0117): decisão 3 da spec. Ao menos um meio (o portal ativo conta) é exigido; a página e a conferência, planejar.
  const temMeio = canal.meios.length > 0 || canal.portal_ativo;
  p('alta', temMeio ? 0 : 1, () => 'Canal do titular não registrado', 'titular',
    exigido('Novo no passo 1 da trilha: registre o e-mail, o telefone ou o formulário pelo qual o titular fala com a empresa (LGPD, art. 41)', 'Registrar o canal', 'pedidos'));
  p('media', temMeio && (!canal.divulgado || !canal.conferido_em) ? 1 : 0, () => 'Canal sem página de divulgação ou nunca conferido', 'titular',
    planejar('Registre a página onde o canal e o encarregado estão publicados e confira-a (Res. CD/ANPD 18/2024, arts. 8 e 9)', 'Registrar a divulgação'));
```

  Linha 186: `return { gerado_em: new Date().toISOString(), encarregados, canal, prioridades, ...secao };`.

  `src/services/painel.ts`, no objeto devolvido por `painelDoProjeto`, logo depois da linha 506 (`encarregados: ...`):

```ts
    // Canal do titular (0117): só o sim/não para a identidade do Painel do n.privacy; o resumo vem da mesma visão (nenhuma consulta a mais).
    ...(privacy ? { canal_titular: { registrado: privacy.visao.canal.meios.length > 0 || privacy.visao.canal.portal_ativo, divulgado: privacy.visao.canal.divulgado } } : {}),
```

  `mcp-server-niso/src/ferramentas.ts:486-487`, a descrição de `niso_privacy_encarregado` passa a:

```ts
      "n.privacy: o painel do encarregado: pedidos do titular, incidentes, tratamentos sem base, DPIA ou LIA, terceiros, documentos, evidências, cobertura LGPD, prazos legais não cadastrados, o canal do titular (`canal`: meios, portal ativo, página de divulgação, última conferência; registrar o canal é pela interface) e o 'o que fazer' em prioridades (alta, media). Comece por aqui. Só leitura.",
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/encarregado.test.ts test/titular-canal.test.ts test/dpo-encarregado.test.ts test/reavaliacao-fornecedor.test.ts test/tprm-correcoes.test.ts test/contrato-regra-unica.test.ts test/importacao.test.ts test/painel.test.ts test/onda2-numeros.test.ts test/programa.test.ts test/programa-rota.test.ts test/marco-programa.test.ts test/agente-privacy-ferramentas.test.ts test/contrato-mcp.test.ts test/contrato-isolamento-org.test.ts` → `Test Files  15 passed (15)` (inclui o desempenho do painel: mediana < 300 ms em `test/painel.test.ts`). `npx tsc --noEmit` → sem saída. `git diff --stat c0badf9 -- test/onda2-numeros.test.ts test/painel.test.ts` → vazio. Se `npm run openapi` mudar algo (não deve: a resposta não está no OpenAPI), commite junto.
- [ ] **Step 5: Mutação** — troque `canal.meios.length > 0 || canal.portal_ativo` por `canal.meios.length > 0` em `temMeio`: cai "só o portal ativo conta como meio"; restaure.
- [ ] **Step 6: Commit**

```bash
git add src/services/encarregado.ts src/services/painel.ts mcp-server-niso/src/ferramentas.ts test/encarregado.test.ts test/titular-canal.test.ts
git commit -m "feat(privacy): canal na visão do encarregado, prioridades do canal e indicador no painel"
```

### Task 6: Passo 1 da trilha "Encarregado e canal" (critério `encarregado_e_canal`); skill e gerado juntos **[revisor opus]**

**Files:**
- Modify: `src/data/programa.ts:27` (`CRITERIOS_PRIVACY`) e `:37` (passo), `src/services/programa.ts:79` (critério), `agent-skills/implantacao-privacy/SKILL.md:21` (tabela), `:38` (ordem de trabalho), `:47` (critério de pronto), `src/mcp/skills-gerado.ts` (gerado)
- Modify (testes): `test/programa.test.ts:91-95` (`visao`), `:101-102` (rótulos), `:110-111`, `:134` e novos casos; `test/programa-rota.test.ts:135`; `test/agente-skills.test.ts` (dentro de `describe('implantacao-privacy e a trilha da tela (onda 4)')`, linha 135)

**Interfaces:**
- Consumes: `VisaoDoEncarregado` com `canal: ResumoDoCanal` (Task 5).
- Produces: `CRITERIOS_PRIVACY = ['algum_cadastro', 'encarregado_e_canal', 'inventario_completo', 'bases_e_riscos', 'terceiros_em_dia', 'prazos_e_atrasos', 'cobertura_lgpd']`; passo `{ id: 'encarregado', ordem: 1, rotulo: 'Encarregado e canal', etapa: 'comecar', criterio: 'encarregado_e_canal', tela: 'titular', acao: 'Registrar o canal' }`; `criterioPrivacy('encarregado_e_canal', v) = v.encarregados.length > 0 && (v.canal.meios.length > 0 || v.canal.portal_ativo) && v.canal.divulgado` (`conferido_em` fora da regra). O id do passo (`encarregado`) não muda.

- [ ] **Step 1: Escrever os testes que falham.** `test/programa.test.ts`: no helper `visao` (linha 94), acrescente `canal: { meios: [], portal_ativo: false, divulgado: false, conferido_em: null },` antes de `...x`. Na linha 101, troque `['Encarregado', 'comecar']` por `['Encarregado e canal', 'comecar']`. No teste "encarregado e inventário completo" (linhas 109-114), acrescente ao objeto passado a `visao`: `canal: { meios: ['email'], portal_ativo: false, divulgado: true, conferido_em: null },`. Logo antes de `const casos` (linha 131), declare `const CANAL_OK = { meios: ['email'], portal_ativo: false, divulgado: true, conferido_em: null };` e troque a linha 134 por:

```ts
      ['encarregado_e_canal', { encarregados: [{}], canal: CANAL_OK }, { canal: CANAL_OK }],
      ['encarregado_e_canal', { encarregados: [{}], canal: CANAL_OK }, { encarregados: [{}], canal: { ...CANAL_OK, meios: [] } }],
      ['encarregado_e_canal', { encarregados: [{}], canal: CANAL_OK }, { encarregados: [{}], canal: { ...CANAL_OK, divulgado: false } }],
```

  No fim do `describe('trilha do n.privacy ...')`:

```ts
  it('passo 1 "Encarregado e canal": sem encarregado, sem meio, meio sem divulgação, tudo; e só o portal ativo', () => {
    const c = (canal: object, enc: object[] = [{}]) => criterioPrivacy('encarregado_e_canal',
      visao({ encarregados: enc, canal: { meios: [], portal_ativo: false, divulgado: false, conferido_em: null, ...canal } }));
    expect(c({ meios: ['email'], divulgado: true }, [])).toBe(false);
    expect(c({ divulgado: true })).toBe(false);
    expect(c({ meios: ['telefone'] })).toBe(false);
    expect(c({ meios: ['formulario'], divulgado: true })).toBe(true);
    expect(c({ portal_ativo: true, divulgado: true })).toBe(true);
    expect(c({ portal_ativo: true })).toBe(false);
    // "conferido em" não entra na regra (decisão 2 da onda 4: sem marca manual)
    expect(c({ meios: ['email'], divulgado: true, conferido_em: null })).toBe(true);
    expect(criterioPrivacy('encarregado', visao({ encarregados: [{}], canal: CANAL_DO_TESTE }))).toBe(false); // a chave antiga saiu da lista
  });
  it('o passo 1 leva a Solicitações com a ação "Registrar o canal"; o id não muda', () => {
    expect(PASSOS_PRIVACY.find((p) => p.ordem === 1)).toEqual({ id: 'encarregado', ordem: 1, rotulo: 'Encarregado e canal', etapa: 'comecar',
      criterio: 'encarregado_e_canal', tela: 'titular', acao: 'Registrar o canal' });
  });
```

  e, no topo do arquivo (depois do helper `visao`), `const CANAL_DO_TESTE = { meios: ['email'], portal_ativo: false, divulgado: true, conferido_em: null };`.

  `test/programa-rota.test.ts:135`: troque `'Encarregado',` por `'Encarregado e canal',` na lista de rótulos.

  `test/agente-skills.test.ts`, dentro de `describe('implantacao-privacy e a trilha da tela (onda 4)')`:

```ts
  it('etapa 1 lê o canal em niso_privacy_encarregado, manda registrar pela interface e nunca cita o link do portal', () => {
    expect(skill).toContain('| 1. Encarregado e canal |');
    expect(skill).toContain('`canal`');
    expect(skill).toContain('Registrar o canal é pela interface');
    expect(skill).not.toContain('/solicitacao');
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/programa.test.ts test/programa-rota.test.ts test/agente-skills.test.ts` → FAIL (rótulo antigo, `encarregado_e_canal` desconhecido cai no `default: false`, skill sem o texto novo).

- [ ] **Step 3: Implementar.** `src/data/programa.ts:27`: troque `'encarregado'` por `'encarregado_e_canal'` em `CRITERIOS_PRIVACY`. Linha 37:

```ts
  { id: 'encarregado', ordem: 1, rotulo: 'Encarregado e canal', etapa: 'comecar', criterio: 'encarregado_e_canal', tela: 'titular', acao: 'Registrar o canal' },
```

  `src/services/programa.ts:79`:

```ts
    // Passo 1 (spec 2026-11-19, decisão 2): encarregado indicado, ao menos um meio (o portal ativo conta como formulário) e a página de
    // divulgação. "Conferido em" fica fora (sem marca manual, decisão 2 da onda 4).
    case 'encarregado_e_canal': return v.encarregados.length > 0 && (v.canal.meios.length > 0 || v.canal.portal_ativo) && v.canal.divulgado;
```

  `agent-skills/implantacao-privacy/SKILL.md`, linha 21 (tabela):

```markdown
| 1. Encarregado e canal | `niso_privacy_encarregado` (`encarregados` e `canal`) | Nada: indicar o encarregado (Governança) e registrar o canal (Solicitações, "Canal do titular") são pela interface | Quem é o encarregado, o canal do titular e a página pública onde os dois aparecem |
```

  Linha 38 (ordem de trabalho):

```markdown
2. **Encarregado e canal do titular.** Sem encarregado designado, o primeiro pedido ao cliente é esse. A designação é feita na Governança, pela interface. Depois, leia o canal em `niso_privacy_encarregado` (`canal`: `meios`, `portal_ativo`, `divulgado`, `conferido_em`). Registrar o canal é pela interface (Solicitações, "Canal do titular"): peça ao cliente um e-mail ou telefone institucional e a página pública onde o canal e o encarregado aparecem. O portal de solicitações ativo conta como formulário; o link dele é a chave de acesso do formulário: nunca o grave nem o repita.
```

  Linha 47, no item **Programa pronto para operar**: troque `encarregado designado, prazos cadastrados` por `encarregado designado, canal do titular registrado com a página de divulgação, prazos cadastrados`. Confira que o texto novo não tem `site` (o teste da linha 144 recusa). Depois: `npm run skills:gerar`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/programa.test.ts test/programa-rota.test.ts test/agente-skills.test.ts test/encarregado.test.ts test/painel.test.ts test/onda2-numeros.test.ts test/contrato-mcp.test.ts test/agente-cadastro.test.ts` → `Test Files  8 passed (8)`; `npx tsc --noEmit` → sem saída; `cd frontend && npx vitest run test/painel-regua.test.js` → PASS (o fixture dele não depende do rótulo). `git diff --stat` mostra só os arquivos de **Files**.
- [ ] **Step 5: Mutação** (restaure cada uma): (a) tire `&& v.canal.divulgado` → caem "meio sem divulgação" e o caso de `casos`; (b) troque `|| v.canal.portal_ativo` por nada → cai "só o portal ativo"; (c) edite a skill sem rodar `npm run skills:gerar` → cai `test/agente-skills.test.ts:18`.
- [ ] **Step 6: Commit**

```bash
git add src/data/programa.ts src/services/programa.ts agent-skills/implantacao-privacy/SKILL.md src/mcp/skills-gerado.ts \
  test/programa.test.ts test/programa-rota.test.ts test/agente-skills.test.ts
git commit -m "feat(privacy): passo 1 da trilha vira Encarregado e canal; skill e gerado juntos"
```

### Task 7: "Canal do titular" na identidade do Painel e documentação do PR3 (como avisar a regressão)

**Files:**
- Modify: `frontend/src/views/painel.js:74,79` (`identidade`), `frontend/test/painel-view.test.js` (dentro de `describe('entrada do n.privacy')`), `CHANGELOG.md` (seção do canal), `AGENTS.md:631-634` (item "Jornada comum"), `docs/superpowers/specs/2026-11-19-canal-do-titular-design.md` (seção nova "Rulings da execução", no fim)

**Interfaces:**
- Consumes: `canal_titular: { registrado, divulgado }` do `GET /painel` (Task 5); `campo(rotulo, valor, falta)` (`frontend/src/views/painel.js:70`).
- Produces: linha "Canal do titular: Registrado | Não registrado" na identidade do Painel do n.privacy.

- [ ] **Step 1: Teste que falha** — em `frontend/test/painel-view.test.js`, dentro de `describe('entrada do n.privacy')`:

```js
    it('identidade: "Canal do titular" registrado ou não (canal_titular do servidor)', async () => {
        const valor = () => [...el('c').querySelectorAll('.pn-ident dt')].find((x) => x.textContent === 'Canal do titular').nextElementSibling.textContent;
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ canal_titular: { registrado: true, divulgado: false } }) });
        await abrir();
        expect(valor()).toBe('Registrado');
        S.painel = {};
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL() });
        await abrir();
        expect(valor()).toBe('Não registrado');
    });
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx vitest run test/painel-view.test.js` → FAIL (`Cannot read properties of undefined (reading 'nextElementSibling')`).
- [ ] **Step 3: Implementar** em `frontend/src/views/painel.js`: depois da linha 74 (`const encs = ...`), `const canal = d.canal_titular && d.canal_titular.registrado ? 'Registrado' : '';`. Na linha 79, troque `${'privacy' in (d.modulos || {}) ? campo('Encarregado', encs, 'Não indicado') : ''}` por `${'privacy' in (d.modulos || {}) ? campo('Encarregado', encs, 'Não indicado') + campo('Canal do titular', canal, 'Não registrado') : ''}`.
- [ ] **Step 4: Documentação (a regressão visível do passo 1).**

  `CHANGELOG.md`, no topo da seção "n.privacy: canal do titular":

```markdown
- **Muda para quem já usa:** o passo 1 da trilha do n.privacy passa a se chamar "Encarregado e canal" e só fica feito com o encarregado indicado, ao menos um meio de contato (e-mail, telefone ou formulário; o portal de solicitações ativo conta) e a página onde o canal e o encarregado estão publicados. Projetos que tinham o passo 1 feito só com o encarregado voltam a tê-lo por fazer, e o "O que fazer" do Painel do n.privacy ganha "Canal do titular não registrado" (Exigido) até o canal ser registrado em Solicitações → "Canal do titular". Nenhum dado foi migrado: basta registrar o canal. "Canal sem página de divulgação ou nunca conferido" entra em "Planejar". O Painel mostra "Canal do titular: Registrado/Não registrado".
```

  `AGENTS.md` (sem acentos), no item "Jornada comum", depois de `n.privacy pelas 7 etapas da skill \`implantacao-privacy\``: acrescente `(a etapa 1 e "Encarregado e canal", criterio \`encarregado_e_canal\`: encarregado + ao menos um meio de \`resumoDoCanal\` ou portal ativo + pagina de divulgacao; \`conferido_em\` fica fora; a visao do encarregado traz \`canal\` e as prioridades "Canal do titular nao registrado" (alta) e "Canal sem pagina de divulgacao ou nunca conferido" (media))`.

  Spec, seção nova no fim:

```markdown
## Rulings da execução

- `titular_canal` ganhou `id TEXT PRIMARY KEY` e `project_id ... UNIQUE` no lugar de `project_id` como chave: as varreduras de isolamento (`test/contrato-isolamento-org.test.ts`, `-topo`) pulam tabela sem `id`.
- `podeGerirPortal` não foi exportado: `titularCanalApp` mora no mesmo arquivo.
- Responsável de outro projeto: 400 (o mesmo de `titular_pedidos`); URL do app ou `/solicitacao`: 422 em qualquer host.
- Trocar a página de divulgação apaga a conferência anterior; conferir sem página é 422.
- O indicador "Canal do titular" do Painel saiu do PR2 para o PR3 (o dado `canal_titular` só existe com a visão do PR3).
- O passo 1 leva a Solicitações (`tela: 'titular'`) com "Registrar o canal"; o id do passo continua `encarregado`.
- A `0117` só vai a produção antes do código que a lê (deploy.yml recusa migration pendente); `resumoDoCanal` tolera a tabela ausente.
- (Preencha na execução: o que `npm run openapi` mudou; a mediana do desempenho do painel depois do PR3.)
```

- [ ] **Step 5: Rodar** — `cd frontend && npx vitest run` (suíte inteira) → todos passam; `cd frontend && npm run build` → `✓ built in`; `npx vitest run test/agente-skills.test.ts test/onda2-numeros.test.ts` → PASS.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/painel.js frontend/test/painel-view.test.js CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-11-19-canal-do-titular-design.md
git commit -m "feat(privacy): Canal do titular na identidade do Painel; CHANGELOG avisa a mudança do passo 1"
```

**Entrega PR3:** `bash scripts/ci/gate.sh`; PR (rascunho) "canal do titular PR3: trilha, painel e agente"; revisão em modelo forte dos Tasks 5 e 6. No texto do PR, copie o item "Muda para quem já usa" do CHANGELOG e peça ao dono para avisar os consultores antes do merge (todo projeto com encarregado e sem canal perde o passo 1 e ganha uma prioridade alta).

---

## PR4 (opcional, decisão 7) — Onboarding (sem migration, sem rota nova)

### Task 8: "E-mail do canal do titular" em Pessoas-chave do assistente

**Files:**
- Modify: `src/schemas/corpos.ts:75-78` (`pessoasChaveSchema`), `src/services/empresas.ts:96` (tipo `PessoasChave`) e `:103-125` (`gravacaoDasPessoas`), `src/routes/projects.ts:388` e logo depois do `batch` (linha 389), `frontend/src/views/empresa.js:320-329` (passo 3), `:340` (resumo), `:372` (guardar o passo), `:385` (estado inicial), `:409` (corpo), `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts` (gerados)
- Modify (testes): `test/empresa.test.ts` (dentro de `describe('POST /projects com empresa e pessoas-chave')`), `frontend/test/novo-projeto.test.js` (dentro de `describe('assistente')`)

**Interfaces:**
- Consumes: tabela `titular_canal` (Task 1).
- Produces: `pessoasChaveSchema` aceita `canal_titular?: { email: string }` (estrito, `z.email().max(200)`); `gravacaoDasPessoas(db, projectId, pessoas, ator?: string)` acrescenta o `INSERT INTO titular_canal` ao mesmo `batch` da criação; trilha `titular.canal` só com o nome do campo. Nenhuma rota nova (`test/onboarding-rotas.test.ts` fica verde sem edição).

- [ ] **Step 1: Testes que falham.** `test/empresa.test.ts`:

```ts
  it('canal do titular (opcional, só o e-mail) nasce na mesma criação; trilha sem o endereço; e-mail inválido é 400', async () => {
    const r = await chamar(cadm, 'POST', '/api/v1/projects', { project_name: 'Programa Ômega', standards: 'ISO 27001', org_role: 'Controller', modulos: ['iso', 'privacy'],
      empresa: { razao_social: 'Ômega Fictícia S.A.' }, pessoas: { dpo: { nome: 'Encarregado Ômega', email: 'dpo@omega.exemplo' }, canal_titular: { email: 'Privacidade@Omega.exemplo' } } });
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await r.json<any>();
    expect(await env.DB.prepare('SELECT email, atualizado_por FROM titular_canal WHERE project_id = ?').bind(id).first())
      .toEqual({ email: 'privacidade@omega.exemplo', atualizado_por: 'cadm@e.lat' });
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular.canal' AND project_id = ?`).bind(id).first<{ details: string }>();
    expect(log!.details).toBe('Canal do titular atualizado: email (criação do projeto)');
    expect((await chamar(cadm, 'POST', '/api/v1/projects', { empresa: { razao_social: 'Pi Fictícia' }, pessoas: { canal_titular: { email: 'nao-e-email' } } })).status).toBe(400);
  });
```

  `frontend/test/novo-projeto.test.js`, dentro de `describe('assistente')`:

```js
    it('com o n.privacy, "E-mail do canal do titular" vai em pessoas.canal_titular e aparece no resumo', async () => {
        digitar('emp-razao_social', 'Teta Fictícia Ltda');
        window.novoProjetoIr(2);
        window.novoProjetoIr(3);
        expect($('np-canal-email').getAttribute('aria-describedby')).toBe('np-canal-dica');
        expect(document.querySelector('label[for="np-canal-email"]')).not.toBeNull();
        digitar('np-dpo-nome', 'Encarregado Fictício');
        digitar('np-canal-email', 'privacidade@teta.exemplo');
        window.novoProjetoIr(4);
        expect($('np-passo').textContent).toContain('privacidade@teta.exemplo');
        apiMock.mockImplementation(async (m) => (m === 'POST' ? { id: 'novo', modulos: ['iso', 'privacy'] } : []));
        await window.criarNovoProjeto();
        const [, , corpo] = apiMock.mock.calls.find(([m]) => m === 'POST');
        expect(corpo.pessoas.canal_titular).toEqual({ email: 'privacidade@teta.exemplo' });
    });
    it('sem o n.privacy marcado, o passo 3 não oferece o canal', () => {
        digitar('emp-razao_social', 'Teta');
        window.novoProjetoIr(2);
        for (const c of document.querySelectorAll('input[name=np-modulo]')) c.checked = c.value === 'iso';
        window.novoProjetoIr(3);
        expect($('np-canal-email')).toBeNull();
    });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/empresa.test.ts` → FAIL (400 pelo `.strict()` do `pessoasChaveSchema`); `cd frontend && npx vitest run test/novo-projeto.test.js` → FAIL (`np-canal-email` inexistente).
- [ ] **Step 3: Implementar.** `src/schemas/corpos.ts`, dentro de `pessoasChaveSchema` (depois de `dpo`, linha 77): `canal_titular: z.object({ email: z.email().max(200) }).strict().optional(),`. `src/services/empresas.ts:96`: `export type PessoasChave = { representante?: { nome: string; cargo?: string | null }; dpo?: { nome: string; email?: string | null }; canal_titular?: { email: string } };`. `gravacaoDasPessoas` ganha `ator: string | null = null` como 4º parâmetro e, antes do `return stmts;` (linha 125):

```ts
  // Canal do titular (0117, decisão 7 da spec do canal): só o e-mail, na mesma transação da criação (sem chamada nova).
  if (pessoas?.canal_titular?.email) stmts.push(db.prepare('INSERT INTO titular_canal (id, project_id, email, atualizado_por) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), projectId, pessoas.canal_titular.email.trim().toLowerCase(), ator));
```

  `src/routes/projects.ts:388`: `...gravacaoDasPessoas(c.env.DB, id, body.pessoas, user.email),`; logo depois do `]);` do batch (linha 389): `if (body.pessoas?.canal_titular) await logAudit(c.env.DB, 'titular.canal', user.email, 'Canal do titular atualizado: email (criação do projeto)', '', '', id);`.

  `frontend/src/views/empresa.js`: linha 385, `dpo: { nome: '', email: '', canal_email: '' }`. No passo 3 (linha 321), depois de `const r = ..., d = ...;`, `const comPrivacy = W.programa.modulos.includes('privacy');`; dentro do grid do fieldset do DPO, depois do campo `np-dpo-email` (linha 328), acrescente:

```js
${comPrivacy ? `<div class="form-group"><label class="form-label" for="np-canal-email">E-mail do canal do titular (opcional)</label>
                <input class="form-input" id="np-canal-email" type="email" maxlength="200" aria-describedby="np-canal-dica" value="${escapeHTML(d.canal_email || '')}">
                <p id="np-canal-dica" class="tc-dica">Caixa institucional por onde o titular fala com a empresa (por exemplo, privacidade@empresa.com.br).</p></div>` : ''}
```

  Linha 372: `dpo: { nome: v('np-dpo-nome'), email: v('np-dpo-email'), canal_email: (document.getElementById('np-canal-email')?.value || '').trim() }`. Linha 340, depois da linha do DPO: `${p.modulos.includes('privacy') ? linha('Canal do titular', ps.dpo.canal_email) : ''}`. Linha 409, depois de `if (ps.dpo.nome) ...`: `if (ps.dpo.canal_email && p.modulos.includes('privacy')) pessoas.canal_titular = { email: ps.dpo.canal_email };`. Depois: `npm run openapi` (o corpo de `POST /projects` mudou).
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/empresa.test.ts test/onboarding-rotas.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/titular-canal.test.ts` → `Test Files  5 passed (5)`; `cd frontend && npx vitest run` → todos passam; `cd frontend && npm run build` → `✓ built in`; `npx tsc --noEmit` → sem saída.
- [ ] **Step 5: Commit** — `git add src/schemas/corpos.ts src/services/empresas.ts src/routes/projects.ts frontend/src/views/empresa.js docs/openapi.json mcp-server-niso/src/contrato-gerado.ts test/empresa.test.ts frontend/test/novo-projeto.test.js && git commit -m "feat(onboarding): e-mail do canal do titular em Pessoas-chave do assistente"`

**Entrega PR4:** `bash scripts/ci/gate.sh`; PR (rascunho) "canal do titular PR4: onboarding (opcional)". Uma linha no CHANGELOG da seção do canal: `- O assistente "Novo projeto" pede, opcionalmente, o e-mail do canal do titular em "Pessoas-chave" (só com o n.privacy).` (no mesmo commit, acrescentando `CHANGELOG.md` ao `git add`).

---

## Self-Review

- **Spec, decisões:** 1 (registro próprio, uma linha por projeto, `0117` aditiva): Task 1 (com `id` + `UNIQUE(project_id)`, ver abaixo). 2 (mesmo passo, rótulo "Encarregado e canal", `encarregado_e_canal`, conferência fora): Task 6 (quatro casos + portal + `conferido_em` fora). 3 (alta "Exigido" sem meio; média "Planejar" sem página ou nunca conferido; sem periodicidade): Task 5. 4 (grava quem gere o portal; `org_user`/`client` leem; agente e chave só leem, `PUT` em `FORA_DO_AGENTE`): Task 3 (seis perfis + agente + chaves). 5 (portal ativo conta como meio; link nunca gravado): Tasks 2, 3 (422) e 5/6 (`portal_ativo`). 6 (pequeno porte fora): nenhum task, por desenho; registrado em "Fora deste plano". 7 (campo opcional no assistente, sem chamada nova): Task 8. 8 (`/solicitacao` não muda): nenhum arquivo de `frontend/public` é tocado.
- **Spec, modelo e entrega:** validação no servidor (Task 2: e-mail, https, host do app, `/solicitacao`, parte do projeto, conferência carimbada); serviço `lerCanal`/`salvarCanal`/`resumoDoCanal` (Task 2); rotas e faixa (Task 3); visão do encarregado (Task 5); trilha (Task 6); portabilidade (Task 2, exportada e testada); mescla (Task 2); isolamento (Tasks 1 e 3, as duas suítes); `docs/openapi.json` e contrato MCP (Tasks 3 e 8); skill, gerado e descrição da ferramenta (Tasks 5 e 6); tela (Task 4); indicador no Painel (Tasks 5 e 7).
- **Spec, "Não regridem":** P0 do n.ot (Task 2 fonte sem `ot_`; Task 4 dublê estrito; constraint de `git diff` em `ot*`); atos do cliente (linhas não tocadas; `test/agente-paridade.test.ts` e `test/cliente-titular-incidente.test.ts` no Task 3); portal sem token (Tasks 1, 2, 3); nenhum PII de titular e trilha sem endereço (Task 2); `onda2-numeros` e `painel.test.ts` sem edição e verdes (Tasks 1, 3, 5, 6); rota classificada e varreduras (Task 3).
- **Restrições do pedido:** schema = migration (Task 1, teste de texto igual + `migrations-consistencia`); README `PENDENTE` (Task 1); ordem de deploy no texto do PR1 (Task 3) e leitura tolerante (Task 2, arquivo próprio); testes que derrubam `projects`/`partes` (Task 1, Steps 3-4); comunicação da regressão (Task 5: contexto da prioridade "Novo no passo 1 da trilha..."; Task 7: CHANGELOG "Muda para quem já usa" e texto do PR3, sem migração de dado).
- **Spec x código (divergências e o que não deu para conferir):** (1) a spec traz "Situação: rascunho... nenhuma decisão respondida" no cabeçalho, mas foi aprovada em 19/11 (o plano segue a aprovação); (2) a DDL da spec (`project_id TEXT PRIMARY KEY`, sem `id`) não entraria nas varreduras de isolamento, que pulam tabela sem `id` (`contrato-isolamento-org.test.ts:272`, `-topo:281`): plano usa `id` + `UNIQUE`; (3) "`podeGerirPortal` exportado": desnecessário, mesmo arquivo; (4) o PR2 da spec mostra "Canal: registrado" no Painel, mas o dado só existe com a visão do PR3: movido para o PR3; (5) "aplicar a 0117 antes do merge pelo `db-migrate.yml`" não é possível: o workflow só roda na `main` (`migrations/README.md:27-31`); o plano dá os dois caminhos reais; (6) a spec não lista `test/encarregado.test.ts:53-58` (lista exata das prioridades do projeto vazio), que precisa da linha nova (Task 5); (7) a skill não pode dizer "site" (`test/agente-skills.test.ts:144`); (8) refs aproximadas: `encarregado.js:74` é o comentário (o código está em `:75`), `portabilidade.ts:175-188` é `:177-190`, `AGENTS.md:544-549` e `:783-784` conferem pelo conteúdo; (9) status da parte alheia não estava na spec (plano: 400). Não conferido: texto oficial da LGPD e das resoluções (como a spec); o que `npm run openapi` muda (não rodado); nenhum teste foi executado ao escrever este plano.
- **Placeholders:** nenhum passo de código sem código. O único ponto condicional é a entrada em `CORPOS` do Task 3, Step 4, com a linha exata. "Rulings da execução" (Task 7) deixa duas medições para a execução, com o que medir.
- **Tipos:** `TitularCanalCorpo`, `LinhaCanal`, `ResumoDoCanal`, `lerCanal`, `salvarCanal(db, projectId, ator, d, hosts)`, `resumoDoCanal`, `hostsDoApp`, `MSG_LINK_DO_PORTAL` nascem no Task 2 e são usados com os mesmos nomes nos Tasks 3, 5 e no teste do Task 4 (mensagem); `{ canal, portal_ativo }` do GET (Task 3) é o que o Task 4 lê; `canal` da visão (Task 5) é o que `criterioPrivacy('encarregado_e_canal', v)` lê (Task 6); `canal_titular: { registrado, divulgado }` (Task 5) é o que `identidade` lê (Task 7).
- **Riscos para a revisão:** (1) mudança visível no dia do PR3 (passo 1 regride e entra uma alta em todo projeto sem canal; o tom do painel desses projetos passa de "Em dia" a "Atenção"); (2) `resumoDoCanal` engole só "no such table: titular_canal" (teste de que outro erro sobe); (3) a lista de hosts do app vem de `src/config/url.ts`: host novo do app precisa entrar lá para ser recusado; (4) a regra "trocar a página apaga a conferência" é do plano, não da spec (registrada em Rulings); (5) `semRepetir` usa uma trava global do módulo `ot-comum.js` (compartilhada com as outras telas que o usam; só import, nenhum n.ot lido).
