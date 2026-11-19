# Remediação dos gaps das ondas 1 e 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os gaps que as ondas 1 e 2 deixaram registrados e que dependem só de código: tela de identidade da organização direta, SSO/SCIM/transferência sem furar a regra "direta não tem cliente", visibilidade dos controles sem requisito (ids grossos da 27701:2025), botão de aprovar escondido de quem criou, seletor instável do E2E, rótulo do plano da direta, e a documentação que ficou desatualizada (migrations aplicadas, limite do D1 verificado).

**Architecture:** Sete mudanças pequenas e independentes, cada uma com teste negativo de exato status. Nada muda os três números que o cliente vê (travados por `test/onda2-numeros.test.ts`, que não pode ser editado). Autorização continua no servidor; a tela só espelha. Nenhuma migration nova.

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-pool-workers`), SPA vanilla JS, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-onda1-organizacao-direta-design.md` e `docs/superpowers/specs/2026-11-17-onda2-catalogo-de-requisitos-design.md` (seções "Rulings da execução" e "Fora da onda 1"). Origem de cada gap: o relatório final das duas ondas (pendências 1, 2, 3 e as notas de revisão).

## Global Constraints

- `test/onda2-numeros.test.ts` **não é editado** (`git diff --stat -- test/onda2-numeros.test.ts` vazio em todo commit): ele trava o indicador do n.iso, a cobertura LGPD/ANPD e o resumo do assessment do n.ot.
- Tipo da organização lido **do banco** (`tipoDaOrg`, `adminDireto` em `src/services/organizacao.ts`; `user.org_direta` já vem de `authMiddleware`), nunca do corpo, do header ou do cliente.
- P0-1 (`ot` nunca concedido automaticamente) e P0-2 (agente e chave de API nunca no n.ot) intocados.
- Toda checagem que vire `async` leva `await` em **todo** ponto de chamada (um `await` esquecido numa recusa falha aberto): teste negativo com status exato por rota e mutação (tirar o `await`/a condição, ver o teste falhar, restaurar).
- Nenhum texto normativo de memória de modelo. Nenhum mapeamento inventado de requisito.
- Textos de tela em português, sem estilo inline novo, sem handler inline (CSP), `escapeHTML` em todo dado vindo do servidor.
- `AGENTS.md` é escrito **sem acentos**; `CHANGELOG.md`, specs e `migrations/README.md` usam acentos.
- Comandos: backend `npx vitest run <arquivo>`; frontend `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --config frontend/vitest.config.js <arquivo>` (confira o caminho em `package.json`); E2E `cd frontend && CI=1 npx playwright test e2e/<arquivo>`; `npx tsc --noEmit`; contrato `npm run openapi`.
- **Fora deste plano, de propósito:** ISO 42001 e CIS v8.1 (falta o material revisado e a licença); onda 3 (n.ot apontando para o núcleo: roadmap, plano próprio); as questões de UX/UI que o dono vai listar; mapear de verdade os ids grossos da 27701:2025 (decisão de conteúdo normativo do dono: este plano só os torna visíveis); ligar de volta workflows do GitHub e conferir billing (ação do dono).
- Branch: recomeçar `claude/n360-positioning-flow-analysis-5sjto2` a partir de `origin/main` (o PR #592 foi mesclado). Três commits-chave: tarefas 1-3 (servidor), 4-6 (tela/E2E/rótulo), 7 (docs).

## File Structure

- `src/routes/organizacao.ts`: `GET /org/config` devolve só a identidade para o admin da direta.
- `src/services/organizacao.ts`: `tipoDoProjeto(db, projectId)`.
- `src/sso.ts`, `src/routes/scim.ts`, `src/routes/projects.ts` (`/:projectId/scim-token`, config de SSO): recusa em projeto de organização direta.
- `src/services/transferencia-projeto.ts`, `src/routes/platform.ts` (rota de transferência): destino direta com contas de cliente.
- `src/routes/projects.ts` (`migrate-27701`, `migrate-27701-2025`): `sem_requisito` na resposta e na auditoria.
- `src/services/ot-fase.ts`, `src/services/ot-avaliacao.ts`, `src/routes/ot.ts`: booleanos `eu_pedi_a_base` e `eu_avaliei` no payload (sem expor ids).
- `frontend/src/globals.js`, `frontend/src/views/config-comercial.js`, `frontend/src/views/ot-base.js`, `frontend/src/views/ot-assessment*.js`: tela de identidade da direta e botões escondidos.
- `frontend/e2e/ot.spec.js`: seletor do teste instável.
- `src/routes/organizacoes.ts`: `plan = 'direta'` nas organizações novas do tipo direta.
- `test/remediacao-gaps.test.ts` (novo): testes do servidor desta remediação; testes do frontend em `frontend/test/`.
- Docs: `migrations/README.md`, `AGENTS.md`, `CHANGELOG.md`, as duas specs.

---

### Task 1: Tela de identidade da organização direta (servidor)

**Files:**
- Modify: `src/routes/organizacao.ts:13-22` (`GET /config`)
- Test: `test/remediacao-gaps.test.ts` (novo)

**Interfaces:**
- Consumes: `podeAdministrarOrg(user, orgId)` (`src/helpers.ts`), `user.org_direta` (setado por `authMiddleware`), `lerConfigOrg(db, orgId)`.
- Produces: `GET /api/v1/org/config` → para o `consultoria_admin` da organização **direta** (e o `platform_admin` com `X-Org-Id` de uma direta, que não tem `org_direta`: ver Step 3) devolve **só** `{ nome, cnpj, corDestaque, seloNiso }`; sem custo interno, margem, preço, textos nem prefixo. Para o comercial e as consultorias, nada muda.

- [ ] **Step 1: Escrever o teste que falha** (reaproveite os fixtures de `test/organizacao-direta.test.ts`: orgs `org_d` direta e `org_c` consultoria, sessões `Ana`/`Beto` consultoria_admin de `org_d`, `Cris` de `org_c`, `chamar`/`um`/`S`)

```ts
describe('GET /api/v1/org/config', () => {
  it('admin da direta lê só a identidade, sem custo nem margem', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.beto);
    expect(r.status).toBe(200);
    const corpo = await r.json() as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toEqual(['cnpj', 'corDestaque', 'nome', 'seloNiso']);
  });
  it('consultor da direta e agente continuam recusados', async () => {
    expect((await chamar('GET', '/api/v1/org/config', S.consultorD)).status).toBe(403);
  });
  it('admin de consultoria segue como antes (config completa)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', S.cris);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json() as object)).toContain('preco');
  });
  it('admin da direta não lê a config de outra organização (X-Org-Id é ignorado)', async () => {
    const r = await chamar('GET', '/api/v1/org/config', { ...S.beto, 'X-Org-Id': 'org_c' });
    expect(Object.keys(await r.json() as object)).toEqual(expect.not.arrayContaining(['preco']));
  });
});
```
(`S.consultorD`: um `consultor` de `org_d`; crie a sessão no `beforeAll` do arquivo.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/remediacao-gaps.test.ts -t "org/config"` → FAIL (o admin da direta recebe 403).
- [ ] **Step 3: Implementar.** Em `GET /config`, antes da recusa do comercial:

```ts
const user = c.get('user');
const orgId = c.get('orgId');
// A direta não tem área comercial, mas administra a própria identidade (nome, CNPJ, cor, selo): devolve só isso, nunca preço/margem/prefixo.
if (user.org_direta === true && podeAdministrarOrg(user, orgId)) {
  const { nome, cnpj, corDestaque, seloNiso } = await lerConfigOrg(c.env.DB, orgId);
  return c.json({ nome, cnpj, corDestaque, seloNiso });
}
if (!ehComercial(user)) return c.json({ error: 'Forbidden: Área comercial restrita ao comercial da ness.' }, 403);
```
`orgId` já vem de `exigirOrg` (sessão, nunca o header, para quem não é `platform_admin`).
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/remediacao-gaps.test.ts test/organizacao*.test.ts test/comercial*.test.ts`.
- [ ] **Step 5: Mutação** — troque `user.org_direta === true` por `true` e confirme que o teste do consultor da direta falha; restaure.
- [ ] **Step 6: Commit** — `git commit -m "feat(remediacao): a direta lê a própria identidade (nome, CNPJ, cor, selo), sem área comercial"`

### Task 2: Tela de identidade da direta (frontend)

**Files:**
- Modify: `frontend/src/globals.js:1019-1023` (nav-identidade), `frontend/src/router.js:33`, `frontend/src/views/config-comercial.js` (`soIdentidade`, `tituloDaTela`)
- Test: `frontend/test/` (o teste vizinho de `config-comercial`/`casca-menu`)

**Interfaces:**
- Consumes: Task 1 (`GET /org/config` da direta devolve o subconjunto); `S.user.org_tipo`.
- Produces: item de menu "Identidade" visível para o `consultoria_admin` da direta; a tela `identidade-org` abre para a direta e mostra só identidade e logo, com título "Identidade da organização".

- [ ] **Step 1: Teste que falha** (jsdom, como `frontend/test/casca-menu.test.js`): com `S.user = { role: 'consultoria_admin', org_tipo: 'direta' }`, `nav-identidade` fica visível mesmo com `comercialAtivo()` verdadeiro; com `org_tipo: 'consultoria'` e comercial ligado continua escondido (a identidade lá fica na Configuração comercial); `renderConfigComercial` com `S.view = 'identidade-org'` e a resposta `{nome, cnpj, corDestaque, seloNiso}` mostra os campos e **não** pede preço/texto/prefixo, e o título é "Identidade da organização".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `globals.js`:

```js
if (navIdentidade) {
  const direta = S.user?.org_tipo === 'direta';
  const admin = ['platform_admin', 'consultoria_admin'].includes(S.user?.role);
  // Na direta a identidade é a única parte "de configuração" que sobra (sem área comercial); nas demais, só com o comercial desligado.
  navIdentidade.style.display = admin && (direta ? S.user?.role === 'consultoria_admin' : !window.comercialAtivo()) ? '' : 'none';
}
```
`router.js:33`: `identidade-org` não está em `TELAS_COMERCIAIS`, então abre; confirme com o teste. `config-comercial.js`: `tituloDaTela` → `soIdentidade() ? (S.user?.org_tipo === 'direta' ? 'Identidade da organização' : 'Identidade da consultoria') : ...`. Tolere a resposta sem `preco`/`textos` (a tela já omite esses blocos em `soIdentidade()`; garanta que nada faz `cfg.preco.diaria` sem checar).
- [ ] **Step 4: Rodar** o teste do frontend e os vizinhos (`casca-menu`, `papeis-admin`, `produto`).
- [ ] **Step 5: Commit** — `git commit -m "feat(remediacao): item Identidade e tela da organização direta"`

### Task 3: SSO, SCIM e transferência não furam "direta não tem cliente"

**Files:**
- Modify: `src/services/organizacao.ts` (novo `tipoDoProjeto`), `src/sso.ts` (`provisionar`), a rota que liga o SSO do projeto (`grep -rn "sso_config\|ConfigSso" src/routes | head`), `src/routes/scim.ts` (`POST /Users`), `src/routes/projects.ts:46` (`/:projectId/scim-token`), `src/services/transferencia-projeto.ts`, a rota de transferência (`grep -rn "transferirProjeto" src/routes`)
- Test: `test/remediacao-gaps.test.ts`

**Interfaces:**
- Produces:
  - `tipoDoProjeto(db: D1Database, projectId: string): Promise<'consultoria' | 'direta' | null>` (lê `projects.org_id` → `organizations.tipo`).
  - `MSG_DIRETA_SEM_CLIENTE = { error: 'A organização direta não tem conta de cliente: SSO e SCIM não se aplicam.' }`.
  - `ResultadoTransferencia` ganha `{ ok: false; motivo: 'destino_direta_com_clientes' }`.

- [ ] **Step 1: Testes que falham** (exatos):
  1. Projeto `p-d` (da direta `org_d`): o `platform_admin` gera `POST /api/v1/projects/p-d/scim-token` → **403** `MSG_DIRETA_SEM_CLIENTE`; em `p-c` (consultoria) → o status que a rota dá hoje (200/201). Idem para ligar o SSO de `p-d`.
  2. `provisionar(env, cfg, claims)` com `cfg.project_id = 'p-d'` (config de SSO plantada por SQL) → lança `Error` com a mensagem de `MSG_DIRETA_SEM_CLIENTE.error`; nada é inserido em `users`.
  3. `POST /scim/v2/Users` (rota do SCIM com o token plantado por SQL) para `p-d` → **403**, nenhuma conta criada.
  4. Transferência de `p-c` (tem uma conta `org_admin` com `client_project_id = 'p-c'`) para `org_d` → o motivo `destino_direta_com_clientes` e a rota responde **409** com mensagem em português; `p-c` continua em `org_c`. Transferir um projeto **sem** contas de cliente para `org_d` continua permitido; transferir de `org_d` para uma consultoria continua permitido.
  5. Convite de stakeholder em projeto da direta **continua funcionando** (decisão: `stakeholder` não é papel de cliente, é aprovador externo): teste que trava o comportamento atual.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
  `tipoDoProjeto` em `src/services/organizacao.ts`:

```ts
export async function tipoDoProjeto(db: D1Database, projectId: string): Promise<TipoOrg | null> {
  const r = await db.prepare('SELECT o.tipo AS tipo FROM projects p JOIN organizations o ON o.id = p.org_id WHERE p.id = ?')
    .bind(projectId).first<{ tipo: TipoOrg }>();
  return r?.tipo ?? null;
}
export const MSG_DIRETA_SEM_CLIENTE = { error: 'A organização direta não tem conta de cliente: SSO e SCIM não se aplicam.' } as const;
```
  Nas duas rotas (SCIM token e ligar SSO) e em `POST /Users` do SCIM: `if (await tipoDoProjeto(c.env.DB, projectId) === 'direta') return c.json(MSG_DIRETA_SEM_CLIENTE, 403);` com `await`. Em `provisionar`: no começo, `if (await tipoDoProjeto(env.DB, cfg.project_id) === 'direta') throw new Error(MSG_DIRETA_SEM_CLIENTE.error);` (defesa em profundidade: uma config de SSO antiga numa direta também para). Em `transferirProjeto`, depois de ler o destino:

```ts
const dest = await db.prepare('SELECT tipo FROM organizations WHERE id = ?').bind(e.orgDestinoId).first<{ tipo: string }>();
if (dest?.tipo === 'direta') {
  const clientes = await db.prepare(`SELECT 1 FROM users WHERE client_project_id = ? AND role IN ('org_admin', 'org_user', 'client') LIMIT 1`).bind(e.projetoId).first();
  if (clientes) return { ok: false, motivo: 'destino_direta_com_clientes' };
}
```
  e a rota de transferência mapeia o novo motivo para 409 `{ error: 'A organização de destino é direta e não tem conta de cliente: o projeto tem contas de cliente.' }` (leia como os outros motivos são mapeados e siga o padrão; `await` em todo ponto).
- [ ] **Step 4: Rodar** `npx vitest run test/remediacao-gaps.test.ts test/sso*.test.ts test/scim*.test.ts test/transferencia*.test.ts test/organizacao-direta.test.ts test/contrato-isolamento-org.test.ts`.
- [ ] **Step 5: Mutação** por rota (tirar o `await` do `tipoDoProjeto`, ou a condição): cada uma derruba um teste; restaure.
- [ ] **Step 6: Commit** — `git commit -m "fix(remediacao): SSO, SCIM e transferência respeitam a organização direta"`

### Task 4: Controles sem requisito ficam visíveis (ids grossos da 27701:2025)

**Files:**
- Modify: `src/routes/projects.ts` (`migrate-27701` ~linha 1000-1020 e `migrate-27701-2025` ~1022-1066)
- Test: `test/remediacao-gaps.test.ts`

**Interfaces:**
- Produces: a resposta das duas rotas ganha `sem_requisito: string[]` (ids de controles criados que continuam sem `requisito_id` depois de `ligarControles`), e a auditoria `migration.27701(.2025)` cita a quantidade. **Nenhum mapeamento é inventado** e nenhum controle é apagado.

- [ ] **Step 1: Teste que falha** — projeto com um controle `ISO 27701:2019` aplicável cujo mapa gera um id sem linha no catálogo (`A.1.1`), catálogo semeado (`semearCatalogo`): `POST /api/v1/projects/:id/migrate-27701-2025` → 200 e `sem_requisito` contém `A.1.1`; um id que existe no catálogo (ex. o primeiro da `ISO_27701_2025_CONTROLLER`) **não** aparece em `sem_requisito`; `new_controls_created` e `gaps` ficam iguais aos de antes (`toEqual` num caso fixo); a auditoria (`SELECT details FROM audit_logs WHERE action = 'migration.27701.2025'`) contém "sem requisito".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**, depois do `ligarControles` de cada rota:

```ts
const { results: soltos } = await c.env.DB.prepare(
  `SELECT id FROM compliance_controls WHERE project_id = ? AND standard = 'ISO 27701:2025' AND requisito_id IS NULL ORDER BY id`
).bind(projectId).all<{ id: string }>();
const sem_requisito = soltos.map((x) => x.id);
```
(`'ISO 27701:2025'` na rota 2025; `'ISO 27001:2022'` na `migrate-27701`.) Inclua `sem_requisito` na resposta JSON e `, ${sem_requisito.length} sem requisito` no texto do `logAudit`. Comentário curto: "ids grossos do mapa 2019→2025 sem linha no catálogo: visíveis, não inventados; decisão de produto pendente (spec onda 2, ruling e)".
- [ ] **Step 4: Rodar** `npx vitest run test/remediacao-gaps.test.ts test/migration*.test.ts test/seed-27701*.test.ts test/requisitos-ligacao.test.ts test/onda2-numeros.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat(remediacao): migrate-27701 informa os controles que ficaram sem requisito"`

### Task 5: Quem criou não vê o botão de aprovar (base e avaliação do n.ot)

**Files:**
- Modify: `src/services/ot-fase.ts` (`situacaoDoSite`/payload do site), `src/services/ot-avaliacao.ts` (`montarAssessment`), `src/routes/ot.ts` (passar o `ator.id`), `frontend/src/views/ot-base.js:~74`, o botão "Confirmar" da avaliação (`grep -n "confirmar" frontend/src/views/ot-assess*.js frontend/src/views/ot-*.js`)
- Test: `test/remediacao-gaps.test.ts`, `frontend/test/ot-*.test.js`

**Interfaces:**
- Consumes: `aprovarBase` (403 quando `base_pedida_por === ator.id`), `confirmarAvaliacao` (403 quando `atualizado_por === ator.id` e não confirmado).
- Produces: no payload do site em `em_aprovacao`: `eu_pedi_a_base: boolean`; em cada item do assessment: `eu_avaliei: boolean`. **Booleanos calculados no servidor para quem pede; nenhum id de pessoa sai.**

- [ ] **Step 1: Testes que falham** — servidor: quem pediu a base lê `eu_pedi_a_base: true` no payload do site e outra pessoa lê `false`; o `platform_admin`/técnico não recebem campos extras que já não recebiam; no assessment, quem salvou o item lê `eu_avaliei: true` e outra pessoa `false`. Frontend (jsdom): com `eu_pedi_a_base: true` o botão "Aprovar a base" não existe e aparece "Quem pediu a base não a aprova: peça a outra pessoa."; com `false` o botão existe; no assessment, o botão "Confirmar" some e aparece "Quem avaliou o item não o confirma." quando `eu_avaliei`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** os booleanos nos dois serviços (`SELECT ..., base_pedida_por` e `atualizado_por`, comparados com `ator.id` no serviço, devolvendo só o booleano) e a troca de botão por nota no frontend (`escapeHTML` não é necessário em texto fixo; sem inline).
- [ ] **Step 4: Rodar** `npx vitest run test/ot-*.test.ts test/remediacao-gaps.test.ts` e os testes do frontend do n.ot (`frontend/test/ot-*`).
- [ ] **Step 5: Commit** — `git commit -m "feat(remediacao): quem pediu a base ou avaliou o item não vê o botão de aprovar"`

### Task 6: Seletor instável do E2E e rótulo do plano da direta

**Files:**
- Modify: `frontend/e2e/ot.spec.js:500`, `src/routes/organizacoes.ts:~52` (INSERT)
- Test: o próprio E2E; `test/organizacao-direta.test.ts` (ou o arquivo novo)

- [ ] **Step 1: E2E.** Troque a linha 500 por um seletor que resolve a um elemento só (o título do conteúdo, não o do cabeçalho nem o do lote):

```js
await expect(conteudo.getByRole('heading', { name: 'SE Norte', exact: true })).toBeVisible();
```
Rode `cd frontend && CI=1 npx playwright test e2e/ot.spec.js --repeat-each=5` e confirme **0 flaky** nessa spec (5 repetições limpas). Requer `python3` ou o servidor Node do README do gate; se o ambiente não tiver, rode só `npx playwright test --list` para garantir que o arquivo compila e registre no relatório que a repetição ficou para o gate do dono.
- [ ] **Step 2: Rótulo do plano.** Teste: criar organização `tipo: 'direta'` → `SELECT plan FROM organizations` = `'direta'`; `tipo: 'consultoria'` → `'consultoria'`. Implemente no INSERT de `POST /platform/orgs`: o literal `'consultoria'` do `plan` vira `?` com `b.tipo === 'direta' ? 'direta' : 'consultoria'`. Confira antes que nada lê `plan` além de `plan === 'interno'` (`grep -rn "\.plan\b\|plan ===" src frontend/src`) e que o schema não tem CHECK em `plan` (`grep -n "plan TEXT" schema.sql`); se houver CHECK, **pare e registre** em vez de migrar.
- [ ] **Step 3: Rodar** `npx vitest run test/organizacao*.test.ts test/organizacoes.test.ts test/openapi.test.ts`.
- [ ] **Step 4: Commit** — `git commit -m "fix(remediacao): seletor do E2E do lote; plano 'direta' nas organizações novas"`

### Task 7: Documentação e fecho

**Files:**
- Modify: `migrations/README.md`, `AGENTS.md`, `CHANGELOG.md`, as duas specs

- [ ] **Step 1: `migrations/README.md` — 0113 e 0114 viram "APLICADA", com evidência.** Evidência já medida em produção em 17/11/2026 (só leitura): `d1_migrations` lista `0114_requisitos_catalogo_unico.sql` e `0113_organizacao_tipo.sql` depois da `0112`; 25 linhas ONS em `requisitos`; 0 `ot_requisitos` sem `requisito_id`; 3 organizações todas `tipo = 'consultoria'`; 0 requisitos ISO com texto. Aplicada pelo workflow `db-migrate.yml` (run `44149022784`, tentativa que ficou verde; as anteriores falharam por billing do GitHub e não aplicaram nada). **Não escreva nada além do que essas medições provam.**
- [ ] **Step 2: Specs.** Onda 2, "Rulings da execução": o limite do D1 foi **verificado na documentação da Cloudflare em 17/11/2026**: um `db.batch()` conta como **uma** consulta no limite por invocação (1000 no plano pago, 50 no gratuito; subrequests 10.000 no pago desde 11/02/2026); portanto o teto de 100 projetos da prévia gasta ~200 consultas e é seguro no plano pago; no gratuito estouraria a 50 de qualquer forma (a produção usa o plano pago: **conferir**; se for gratuito, baixar `LIMITE_PREVIA` para 20). Onda 1 e 2: marcar como resolvidos os itens cobertos pelas Tasks 1-6 (identidade da direta, SSO/SCIM/transferência, `sem_requisito`, botão do criador, seletor E2E, plano) e deixar abertos só: mapear os ids grossos (decisão do dono), 42001/CIS, convite de stakeholder (decisão: permitido na direta, travado por teste).
- [ ] **Step 3: `AGENTS.md`** (sem acentos, só o que existe): GET `/org/config` da direta devolve so identidade; SSO/SCIM/transferencia recusam direta (`tipoDoProjeto`); `sem_requisito` nas rotas `migrate-27701*`; `eu_pedi_a_base`/`eu_avaliei` (booleanos); plano `direta`. Verifique cada frase com `grep` antes de escrever.
- [ ] **Step 4: `CHANGELOG.md`**: entrada "Remediação dos gaps das ondas 1 e 2" com o que muda para quem usa: a direta edita nome/CNPJ/cor/logo; SSO/SCIM/transferência recusam a direta; resposta das migrações de 27701 ganha `sem_requisito`; quem pediu/avaliou não vê o botão de aprovar; organização direta nasce com plano `direta`.
- [ ] **Step 5: Rodar** `npx vitest run test/migrations-consistencia.test.ts test/openapi.test.ts test/onda2-numeros.test.ts test/remediacao-gaps.test.ts`, `npx tsc --noEmit`, `npm run openapi` (commite o que mudar), e confirme `git diff --stat -- test/onda2-numeros.test.ts` vazio.
- [ ] **Step 6: Commit** — `git commit -m "docs(remediacao): migrations 0113/0114 aplicadas (evidência), limite do D1 verificado, specs e changelog"`

---

## Self-Review

- **Spec/gaps:** identidade da direta (Tasks 1-2); SSO, SCIM e `transferirProjeto` (Task 3); ids grossos visíveis (Task 4); botão do criador (Task 5); seletor E2E e plano cosmético (Task 6); README de migrations aplicado, limite do D1 verificado, specs/changelog (Task 7). Convite de stakeholder: decisão registrada e travada por teste (Task 3). Fora, por depender do dono ou de roadmap: 42001/CIS, onda 3, UX/UI, mapeamento real da 27701:2025, workflows do GitHub.
- **Placeholders:** os pontos que dependem de localizar arquivo (rota de ligar o SSO, rota de transferência, botão "Confirmar" da avaliação) trazem o `grep` exato; os testes trazem valores esperados concretos.
- **Tipos:** `tipoDoProjeto`, `MSG_DIRETA_SEM_CLIENTE` (Task 3) e `sem_requisito`, `eu_pedi_a_base`, `eu_avaliei` (Tasks 4-5) têm uma definição só e os testes usam os mesmos nomes.
- **Riscos para a revisão:** (1) `GET /org/config` agora responde 200 a um papel que antes levava 403: conferir que `user.org_direta` só é verdadeiro para a equipe de organização direta e que o subconjunto nunca inclui custo/margem/prefixo; (2) a recusa de transferência muda o contrato do `platform_admin`; (3) `await` em todo `tipoDoProjeto` novo.
