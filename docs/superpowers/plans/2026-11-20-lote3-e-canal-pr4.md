# Lote 3 dos pontos menores e PR4 do canal do titular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os sete pontos menores de UX e docs do Lote 3 (P-12 a P-18, uma branch) e entregar o PR4 do canal do titular (e-mail do canal em "Pessoas-chave" do assistente "Novo projeto", outra branch), sem migration e sem rota nova.

**Architecture:** Lote 3 são quatro ajustes pequenos em telas (`frontend/src/views/admin.js`, `painel.js`, `ot-fornecedores.js`), um ajuste de `AGENTS.md` e dois testes que só travam comportamento existente (`organizacoes.test.js`, `onboarding-rotas.test.ts`); cada ajuste de comportamento tem teste vermelho antes. O PR4 acrescenta `canal_titular?: { email }` ao `pessoasChaveSchema`; a rota `POST /projects` grava o canal DEPOIS do batch da criação, reaproveitando `salvarCanal` (mesma validação, mesma trilha só com nomes de campos) e tolerando falha (inclusive tabela ausente) sem derrubar o projeto já criado.

**Tech Stack:** Cloudflare Worker (Hono) + D1, zod 4, vitest (`@cloudflare/vitest-pool-workers` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Spec:** Lote 3: triagem em `docs/superpowers/plans/2026-11-19-pontos-menores.md` (tabela A, linhas 45-51, e lista curta do Lote 3, linhas 539-549). PR4: `docs/superpowers/specs/2026-11-19-canal-do-titular-design.md` (decisão 7) e Task 8 de `docs/superpowers/plans/2026-11-19-canal-do-titular.md`, que este plano SUBSTITUI (o texto antigo foi escrito antes do canal entrar na `main`).

**Base:** worktree `/home/user/wt-plano`, `origin/main` `c2cb93d`. Toda referência arquivo:linha abaixo foi relida neste worktree.

## Global Constraints

- **`test/onda2-numeros.test.ts` nunca é editado.** Nenhum task deste plano toca `src/services/painel*.ts`, `encarregado.ts` ou `programa.ts`; mesmo assim `git diff --stat origin/main -- test/onda2-numeros.test.ts` deve sair vazio em todo commit.
- **Migrations: nenhuma.** Se aparecer a necessidade, pare e leve ao dono. A `0117` (`titular_canal`) já está aplicada em produção (`migrations/README.md:785-787`).
- **P0-1:** `ot` nunca é concedido nem pré-marcado. **P0-2:** agente MCP e chave de API nunca recebem dado do n.ot (`semOt`). **P0-4:** todo dado de site passa por `sitesPermitidos`. Nenhum task abaixo toca `src/**/ot*`, `src/routes/ot*` nem `frontend/src/ot*`; os testes do n.ot que aparecem aqui (`ot-fornecedores`, `onboarding-rotas`) só leem.
- **Nunca rode a suíte inteira do backend** (cerca de 20 min; é do `bash scripts/ci/gate.sh` na máquina de quem mergeia). Rode só os arquivos do passo + `npx tsc --noEmit`. Frontend: `cd frontend && npx vitest run <arquivos>` e `npm run build` (a suíte inteira do frontend leva cerca de 70 s e só roda inteira no Task 8).
- **Teste vermelho primeiro (TDD):** escreva o teste, rode, veja a falha com a mensagem esperada, só então corrija. Task só de teste (5 e 6) prova o teste com uma **mutação** (quebre o código, veja falhar, restaure).
- **Higiene de commit:** `git add` só com os caminhos de **Files** do task; nunca `git add -A` nem `git add .`; `git diff --cached --stat` mostra só esses caminhos antes de commitar. **Um branch por PR:** Tasks 1-7 em `claude/lote3-ux`; Task 8 em `claude/canal-titular-4`, cada um criado de `origin/main` (`git switch -c <nome> origin/main`).
- **Frontend:** `data-action` (delegação em `frontend/src/delegation.js`), sem handler e sem estilo inline novo (CSP; classe nova só no fim de `frontend/src/style.css`, e este plano não cria nenhuma), `escapeHTML` em dado do servidor, `<label for>` em todo campo, textos em português **com acentos**.
- **AGENTS.md sem acentos** (os trechos que este plano acrescenta nele estão sem acento); CHANGELOG e telas com acentos.
- **Nada de nome de cliente ou de pessoa real** em teste, exemplo ou texto de commit: só dados fictícios (`exemplo`, `.lat`, `.exemplo`).
- **Canal do titular (Task 8), regras herdadas do PR1-PR3 e que não podem regredir:** (1) o link do portal (`/solicitacao#...`, credencial de portador) nunca é gravado: o campo novo só aceita e-mail, e o objeto é `.strict()` (nenhum campo de URL entra); (2) a trilha `titular.canal` leva só NOMES de campo (nunca o endereço); (3) o canal tolera tabela ausente, como `resumoDoCanal` (`src/services/titular-canal.ts:109-123`); (4) agente MCP e chave de API não escrevem: `POST /projects` já está fora do agente (`test/empresa.test.ts`, "o agente MCP não cria projeto") e chave de API entra como `client`; o Task 8 ainda recusa o campo para quem não é equipe (`ehEquipeNess`, `src/helpers.ts:579-582`); (5) só com o n.privacy no projeto.
- **Comandos:** backend `npx vitest run <arquivos>`; frontend `cd frontend && npx vitest run <arquivos>`; build `cd frontend && npm run build`; tipos `npx tsc --noEmit`; contrato `npm run openapi` (`package.json:17`; só o Task 8 muda corpo de rota); portão `bash scripts/ci/gate.sh` (só na máquina de quem mergeia).
- **Fora deste plano:** itens `dono` e `drop` da triagem do plano de 19/11; o Lote 1 e o Lote 2 daquele plano; os itens da spec do canal listados em "Fora deste plano" do plano do canal (busca automática da página, vários canais, periodicidade etc.).

## Preflight (antes de cada branch e ao retomar)

- [ ] `cd /home/user/wt-plano && git fetch origin && git status --short && git log --oneline -1`: árvore limpa e HEAD contém `c2cb93d` (`git merge-base --is-ancestor c2cb93d HEAD` responde 0).
- [ ] `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest`: no momento em que este plano foi escrito **não existia `node_modules` no worktree**; se faltar, `npm ci && (cd frontend && npm ci)`.
- [ ] Branch: Lote 3 `git switch -c claude/lote3-ux origin/main`; PR4 `git switch -c claude/canal-titular-4 origin/main`.
- [ ] **Retomar (o contêiner pode reiniciar):** o estado está no git. `git log --oneline origin/main..HEAD` lista os tasks feitos pelo assunto do commit (os assuntos estão no último passo de cada task). Mudança não commitada de task que não é o em curso: descarte só os caminhos dele (`git checkout -- <caminho>`), nunca `git checkout .`.

## Reverificação dos itens (main atual, `c2cb93d`)

Nenhum dos sete itens foi resolvido por outro PR: todos ainda existem. O que mudou em relação ao texto do plano de 19/11:

| ID | Onde estava no plano antigo | Onde está agora | O que mudou no texto |
|---|---|---|---|
| P-12 | `ot-fornecedores.js:33` | `frontend/src/views/ot-fornecedores.js:33` (confere) | O teste existente `ot-fornecedores.test.js:71` fixa o rótulo antigo e **precisa ser editado** (o plano antigo não dizia). |
| P-13 | `admin.js:559` | `frontend/src/views/admin.js:559` (confere) | Três testes existentes de `renderApiKeys` dependem da seleção automática do primeiro projeto (`admin-usuarios-apikeys.test.js:351,373,388`) e **precisam de `S.apiKeysProjectId = 'p1'`**. |
| P-14 | `AGENTS.md:620` | `AGENTS.md:621` | Linha deslocada em 1; texto exato do trecho e do destino (`renderGovernance`, não "Monitor"). |
| P-15, P-16 | `painel.js:141-146` | `frontend/src/views/painel.js:143-148` (`trilha()`), chamada em `:225` | Linhas deslocadas; o guarda de lista vazia vai na CHAMADA (`:225`), onde mora a caixa (`quadro`). |
| P-17 | teste em `onboarding-encadeado.test.js` | **`frontend/test/organizacoes.test.js`** (describe "nova organização") | O arquivo antigo só dispara `__orgPrimeiroProjeto` direto; é o `organizacoes.test.js` que já monta o formulário e responde as rotas, então o teste mora lá. |
| P-18 | `onboarding-rotas.test.ts:88-92` | `test/onboarding-rotas.test.ts:88-92` (confere) | **O plano antigo estava errado:** o teto do cliente é só o do PROJETO (`tetoDaConta`, `src/routes/users.ts:127-131`: cliente = `modulosDoProjeto`; equipe = `modulosContratados`). Um projeto com `ot` em organização sem `ot` não nasce (409, `src/routes/projects.ts:374`), então "400 no segundo caso" não existe. O teste certo distingue projeto sem `ot` em organização COM `ot` (cliente 400) do projeto com `ot` (cliente 201). |

---

# PARTE A: LOTE 3 (branch `claude/lote3-ux`)

### Task 1: P-14 "Adicionar ao comitê" mora na Governança (AGENTS.md)

**Files:**
- Modify: `AGENTS.md:621`

**Interfaces:**
- Consumes: nada.
- Produces: nada (só texto). O botão vive em `renderGovernance` (`frontend/src/views/monitor.js:237`, botão em `:331`, rota de tela `S.view === 'governance'` em `frontend/src/router.js:142`).

- [ ] **Step 1: Confirmar o trecho e que o Monitor não é mais tela**

```bash
grep -n 'botao "Adicionar ao comite" no Monitor' AGENTS.md | cut -c1-12
grep -n "Adicionar ao comitê" frontend/src/views/monitor.js | cut -c1-80
grep -n "S.view === 'governance'" frontend/src/router.js
```

Expected: `621:` na primeira; `331:` na segunda; `142:` na terceira. (O `AGENTS.md:184` diz que o Monitor saiu e `?tela=monitor` é alias: está correto, não mexa.)

- [ ] **Step 2: Editar** (Edit tool, `old_string` único na linha 621):

old: `(botao "Adicionar ao comite" no Monitor)`

new: ``(botao "Adicionar ao comite" na tela Governanca, `renderGovernance` em `frontend/src/views/monitor.js`)``

- [ ] **Step 3: Verificar (não há teste de comportamento; a prova é o diff)**

```bash
grep -c 'botao "Adicionar ao comite" no Monitor' AGENTS.md          # 0
git diff -U0 AGENTS.md | grep '^+[^+]' | grep -cP '[^\x00-\x7F]'  # 0 (AGENTS.md sem acentos nas linhas novas)
git diff --stat
```

Expected: `0`, `0`, e só `AGENTS.md | 2 +-`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): o botão Adicionar ao comitê é da Governança, não do Monitor"
```

---

### Task 2: P-13 Chaves de API abre sem projeto escolhido

**Files:**
- Modify: `frontend/src/views/admin.js:558-577` (função `renderApiKeys`)
- Test: `frontend/test/admin-usuarios-apikeys.test.js` (describe `renderApiKeys`, linhas 342-395)

**Interfaces:**
- Consumes: `S.apiKeysProjectId` (estado, já usado por `__setFilter('apiKeysProjectId')` no `<select id="apikeys-projeto">`, `openApiKeyModal` `:603` e `createApiKey` `:633`), `S.projects`.
- Produces: `renderApiKeys` deixa de gravar `S.apiKeysProjectId`; sem escolha, "Nova chave" fica `disabled`, o `<select>` mostra a opção "Escolha o projeto" e nenhuma chamada de `GET /projects/:id/api-keys` é feita. `openApiKeyModal` e `createApiKey` não mudam (já recusam sem projeto).

- [ ] **Step 1: Editar os três testes que contavam com a seleção automática e escrever o novo.** Em `frontend/test/admin-usuarios-apikeys.test.js`:

(a) No teste `'platform_admin: seleciona o primeiro projeto, lista chaves e só oferece revogar a ativa'` (linha 351): troque o título por `'platform_admin com o projeto escolhido: lista chaves e só oferece revogar a ativa'` e acrescente `S.apiKeysProjectId = 'p1';` na linha logo antes de `const [c, h, a] = dom();`.

(b) No teste `'sem chaves: linha de vazio; sem projetos: ...'` (linha 373): acrescente `S.apiKeysProjectId = 'p1';` logo antes do primeiro `let [c, h, a] = dom();` (a segunda metade do teste já zera `S.apiKeysProjectId = null`).

(c) No teste `'erro da API não vira "sem chaves": mostra o erro'` (linha 388): acrescente `S.apiKeysProjectId = 'p1';` logo antes de `const [c, h, a] = dom();`.

(d) Teste novo, dentro do mesmo `describe('renderApiKeys', ...)`, depois do teste de erro:

```js
  it('abre sem projeto escolhido: "Nova chave" desabilitada, opção "Escolha o projeto" e nenhuma chamada de chaves; escolher habilita', async () => {
    apiMock.mockResolvedValue([]);
    S.projects = [{ id: 'p1', client_name: 'Cliente Um' }, { id: 'p2', client_name: 'Cliente Dois' }];
    let [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(S.apiKeysProjectId).toBeFalsy();
    expect(apiMock).not.toHaveBeenCalled();
    expect(a.querySelector('[data-action="openApiKeyModal"]').disabled).toBe(true);
    const sel = c.querySelector('#apikeys-projeto');
    expect(sel.value).toBe('');
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Escolha o projeto', 'Cliente Um', 'Cliente Dois']);
    expect(c.textContent).toContain('para ver e criar as chaves');
    expect(c.querySelector('table')).toBeNull();

    S.apiKeysProjectId = 'p2';   // o que o __setFilter faz ao escolher
    [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p2/api-keys');
    expect(a.querySelector('[data-action="openApiKeyModal"]').disabled).toBe(false);
    expect(c.querySelector('#apikeys-projeto').value).toBe('p2');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/admin-usuarios-apikeys.test.js -t "renderApiKeys"`
Expected: os três testes editados PASSAM (já escolhem `p1`); o novo FALHA em `expect(S.apiKeysProjectId).toBeFalsy()` (a tela grava `p1`) ou em `expect(apiMock).not.toHaveBeenCalled()`.

- [ ] **Step 3: Implementar.** Em `frontend/src/views/admin.js`, dentro de `renderApiKeys`, troque as linhas 558-566 (de `if (!S.projects ...` até a definição de `projOptions`) por:

```js
            if (!S.projects || S.projects.length === 0) { await loadProjects(); }
            const projects = S.projects || [];
            // Sem projeto pré-escolhido: a chave nasce no projeto que a pessoa viu e escolheu (id guardado que sumiu da lista conta como sem escolha).
            const pid = projects.some(p => p.id === S.apiKeysProjectId) ? S.apiKeysProjectId : '';
            a.innerHTML = `<button class="btn btn-primary" data-action="openApiKeyModal" ${pid ? '' : 'disabled'}>Nova chave</button>`;
            const projOptions = `<option value="" ${pid ? '' : 'selected'}>Escolha o projeto</option>` + projects.map(p =>
                `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${escapeHTML(p.project_name || p.client_name || p.id)}</option>`
            ).join('');

            let tabela = '<p class="form-hint">Escolha o projeto para ver e criar as chaves.</p>';
```

(isto remove a linha 559 `if (!S.apiKeysProjectId && projects.length) S.apiKeysProjectId = projects[0].id;`, troca `let tabela = '';` da 568 pela linha com o aviso, e mantém o `if (pid) { ... tabela = window.renderDataTable(...) }` como está.)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/admin-usuarios-apikeys.test.js`
Expected: todos os testes do arquivo passam. Depois `cd frontend && npm run build` → `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin.js frontend/test/admin-usuarios-apikeys.test.js
git diff --cached --stat
git commit -m "fix(admin): Chaves de API abre sem projeto pré-escolhido"
```

---

### Task 3: P-15 e P-16 Trilha do n.privacy: passo sem tela vira "Falta"; trilha vazia some

**Files:**
- Modify: `frontend/src/views/painel.js:146` (linha do passo em `trilha()`), `:225` (guarda de lista vazia na chamada)
- Test: `frontend/test/painel-regua.test.js` (describe `'trilha do n.privacy: só o que o servidor mandou'`, linhas 176-200)

**Interfaces:**
- Consumes: `estado(tom, texto)` (`painel.js:24`), `TELAS_DO_PAINEL` (`painel.js:31`), os passos do servidor `{ id, ordem, rotulo, etapa, feito, tela, acao }` (`src/services/programa.ts:15`, na ordem das etapas comuns, que NÃO é a ordem do campo `ordem`: `src/data/programa.ts:41-42` põe "Documentos" (6) antes de "Titular" (5)).
- Produces: passo não feito com `tela` fora da lista fechada mostra `estado('falta', 'Falta')` (a classe `.pn-falta` já existe em `style.css:1681`); `trilha()` não é chamada com lista vazia (sem `#pn-trilha-t`).

- [ ] **Step 1: Escrever os três testes.** Dentro do `describe('trilha do n.privacy: só o que o servidor mandou', ...)` (usa `base`, `rodar`, `P`, `ISO`, `el`), depois do teste `'o cliente não recebe a trilha nem botão de abrir'`:

```js
    it('passo por fazer com tela fora da lista fechada mostra "Falta" (a linha não fica muda)', async () => {
        await rodar(base({ privacy: { ...ISO, passos: P } }));
        const linhas = [...el('c').querySelector('#pn-trilha-t').closest('section').querySelectorAll('li')];
        expect(linhas[1].querySelector('.pn-tx').textContent).toBe('Fora');
        expect(linhas[1].querySelector('button')).toBeNull();
        expect(linhas[1].querySelector('.pn-estado').textContent).toBe('Falta');
        expect(linhas[0].querySelector('button')).not.toBeNull();   // a tela da lista fechada segue com o botão
    });
    it('trilha vazia não desenha a caixa', async () => {
        await rodar(base({ privacy: { ...ISO, passos: [] } }));
        expect(el('c').querySelector('#pn-trilha-t')).toBeNull();
    });
    it('a ordem exibida é a do servidor (não reordena por `ordem`) e aspas no texto não quebram os atributos', async () => {
        const Q = [{ id: 'b', ordem: 9, rotulo: 'Segundo "x"', etapa: 'levantar', feito: false, tela: 'ropa', acao: `Abrir 'a' "b"` },
            { id: 'a', ordem: 1, rotulo: 'Primeiro', etapa: 'comecar', feito: true, tela: 'importacao', acao: 'Trazer' }];
        await rodar(base({ privacy: { ...ISO, passos: Q } }));
        const t = el('c').querySelector('#pn-trilha-t').closest('section');
        expect([...t.querySelectorAll('li .pn-tx')].map((x) => x.textContent)).toEqual(['Segundo "x"', 'Primeiro']);
        const b = t.querySelector('button');
        expect(b.getAttribute('aria-label')).toBe(`Abrir 'a' "b": Segundo "x"`);
        expect(JSON.parse(b.dataset.args)).toEqual(['p9', 'ropa', null, null, null]);
        expect(b.attributes.length).toBe(5);   // type, class, data-action, data-args, aria-label: nada extra
    });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/painel-regua.test.js -t "trilha do n.privacy: só o que o servidor mandou"`
Expected: o de "Falta" FALHA (`querySelector('.pn-estado')` é `null`: a linha fica muda); o de "trilha vazia" FALHA (`#pn-trilha-t` existe); o de ordem e aspas PASSA (fixa o que a onda 4 deixou sem teste).

- [ ] **Step 3: Implementar.** Em `frontend/src/views/painel.js`:

(a) Linha 146: o fim da expressão `: ''}</li>` do ramo "tela fora da lista" passa a mostrar o estado. Troque

```js
        ${p.feito ? estado('ok', 'Feito') : TELAS_DO_PAINEL.has(p.tela) ? `<button type="button" class="btn btn-sm" data-action="painelAbrirProximo" data-args='${args(projectId, p.tela, null, null, null)}' aria-label="${e(`${p.acao}: ${p.rotulo}`)}">${e(p.acao)}</button>` : ''}</li>`).join('')}</ol>`;
```

por

```js
        ${p.feito ? estado('ok', 'Feito') : TELAS_DO_PAINEL.has(p.tela) ? `<button type="button" class="btn btn-sm" data-action="painelAbrirProximo" data-args='${args(projectId, p.tela, null, null, null)}' aria-label="${e(`${p.acao}: ${p.rotulo}`)}">${e(p.acao)}</button>` : estado('falta', 'Falta')}</li>`).join('')}</ol>`;
```

(b) Linha 225: troque `...(pv && Array.isArray(pv.passos) ? [quadro('pn-trilha-t', ...` por `...(pv && Array.isArray(pv.passos) && pv.passos.length ? [quadro('pn-trilha-t', ...` (só acrescenta `&& pv.passos.length`; o resto da linha fica igual).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/painel-regua.test.js test/painel-view.test.js`
Expected: passam. `cd frontend && npm run build` → `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/painel.js frontend/test/painel-regua.test.js
git diff --cached --stat
git commit -m "fix(painel): trilha do n.privacy mostra Falta no passo sem tela e não desenha caixa vazia"
```

---

### Task 4: P-12 "Gerar perguntas de OT" diz que é do projeto

**Files:**
- Modify: `frontend/src/views/ot-fornecedores.js:33`
- Test: `frontend/test/ot-fornecedores.test.js:71` (editar a asserção do rótulo) e um teste novo no `describe('com o módulo ot', ...)`

**Interfaces:**
- Consumes: rota `POST /api/v1/projects/:id/ot/fornecedores/:id/perguntas-padrao` (`src/routes/ot.ts:1240`: o `:id` só confere que o fornecedor existe; as perguntas são do projeto), `window.otFornPerguntas(id)` (`ot-fornecedores.js:67`).
- Produces: o botão passa a se chamar "Gerar perguntas de OT para o projeto"; continua único, com o id do primeiro fornecedor como âncora de existência (comportamento e rota iguais).

- [ ] **Step 1: Teste.** (a) Em `frontend/test/ot-fornecedores.test.js:71`, troque `expect(botao().textContent).toBe('Gerar perguntas de OT');` por `expect(botao().textContent).toBe('Gerar perguntas de OT para o projeto');`. (b) Teste novo, depois do teste `'lista escapada; com privacy, ...'`:

```js
    it('com vários fornecedores há UM botão, do projeto, e ele usa o primeiro só como âncora de existência', async () => {
        cenario(['iso', 'ot', 'privacy'], ['iso', 'ot', 'privacy']); servir();
        const base = apiMock.getMockImplementation();
        apiMock.mockImplementation(async (m, url, corpo) => (m === 'GET' && /\/ot\/fornecedores$/.test(url)
            ? { fornecedores: [...FORN.fornecedores, { ...FORN.fornecedores[0], id: 'f2', parte_id: 'pa2', parte_nome: 'Outra' }] }
            : base(m, url, corpo)));
        await montarFornecedoresOt(c, a, S.activeProject);
        const botoes = c.querySelectorAll('[data-action="otFornPerguntas"]');
        expect(botoes).toHaveLength(1);
        expect(botoes[0].textContent).toBe('Gerar perguntas de OT para o projeto');
        expect(JSON.parse(botoes[0].dataset.args)).toEqual(['f1']);
        botoes[0].click(); await pausa(); await pausa();
        expect(chamadas.filter(([m, u]) => m === 'POST' && /\/ot\/fornecedores\/f1\/perguntas-padrao$/.test(u))).toHaveLength(1);
    });
```

(Se o `click()` não disparar a ação neste arquivo, porque ele não chama `initDelegation()`, troque a última linha de ação por `window.otFornPerguntas('f1'); await pausa(); await pausa();` e mantenha a asserção do POST.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/ot-fornecedores.test.js`
Expected: FAIL nos dois (`expected 'Gerar perguntas de OT' to be 'Gerar perguntas de OT para o projeto'`).

- [ ] **Step 3: Implementar.** Em `frontend/src/views/ot-fornecedores.js:33`, troque só o texto do botão:

```js
        ? `<button class="btn" data-action="otFornPerguntas" data-args='${escapeHTML(JSON.stringify([forn[0].id]))}'>Gerar perguntas de OT para o projeto</button>`
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/ot-fornecedores.test.js` → passa. `cd frontend && npx vitest run test/contrato-tela-api.test.js` (se o arquivo existir: `ls frontend/test | grep contrato-tela`) → passa, e `npm run build` → `✓ built in`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ot-fornecedores.js frontend/test/ot-fornecedores.test.js
git diff --cached --stat
git commit -m "fix(ot): o botão de perguntas de OT diz que a ação é do projeto"
```

---

### Task 5: P-17 Teste: "Criar o primeiro projeto" só habilita quando as organizações carregam

**Files:**
- Test: `frontend/test/organizacoes.test.js` (describe `'nova organização'`, linha 190 em diante)
- (sem alteração de produção; o comportamento está em `frontend/src/views/organizacoes.js:318` `disabled` e `:321` `primeiro.disabled = false`)

**Interfaces:**
- Consumes: `window.__orgCriar`, `carregarOrgs(true)` (refaz `GET /api/v1/platform/orgs`), os helpers do arquivo `monta`, `clica`, `envia`, `preenche`, `espera`, `rotas`, `ORGS`, `json`.
- Produces: trava que o botão nasce `disabled` e habilita só quando a lista de organizações recarrega (o tipo da organização precisa estar carregado para o assistente).

- [ ] **Step 1: Escrever o teste** (dentro de `describe('nova organização', ...)`, depois do primeiro teste):

```js
  it('"Criar o primeiro projeto" nasce desabilitado e só habilita quando a lista de organizações recarrega', async () => {
    rotas['POST /api/v1/platform/orgs'] = () => json({ id: 'org_gama', adminEmail: 'ana@gama.test', emailEnviado: true }, 201);
    await monta();
    await clica('__orgNova');
    preenche();
    let liberar;
    const segura = new Promise((r) => { liberar = r; });
    rotas['GET /api/v1/platform/orgs'] = async () => { await segura; return json(ORGS); };   // o recarregamento pós-criação fica pendurado
    envia('org-n-form');
    await espera();
    expect($('org-n-primeiro')).not.toBeNull();
    expect($('org-n-primeiro').disabled).toBe(true);
    liberar();
    await espera();
    expect($('org-n-primeiro').disabled).toBe(false);
  });
```

- [ ] **Step 2: Rodar (passa de primeira: é teste de comportamento existente) e provar com mutação**

Run: `cd frontend && npx vitest run test/organizacoes.test.js -t "primeiro projeto"` → PASS.
Mutação: em `frontend/src/views/organizacoes.js:318` apague o atributo `disabled ` do botão (`<button type="button" id="org-n-primeiro" disabled class=...` vira `... id="org-n-primeiro" class=...`); rode de novo → FAIL em `expect($('org-n-primeiro').disabled).toBe(true)`. **Restaure** (`git checkout -- frontend/src/views/organizacoes.js`; `git status --short` mostra só o teste).

- [ ] **Step 3: Rodar o arquivo inteiro**

Run: `cd frontend && npx vitest run test/organizacoes.test.js test/onboarding-encadeado.test.js` → passam.

- [ ] **Step 4: Commit**

```bash
git add frontend/test/organizacoes.test.js
git diff --cached --stat
git commit -m "test(organizacoes): o primeiro projeto só habilita quando as organizações carregam"
```

---

### Task 6: P-18 Teste: o teto do cliente é o do projeto, o da equipe é o da organização

**Files:**
- Test: `test/onboarding-rotas.test.ts` (describe `'teto de módulos (tetoDaConta): vem da conta que se cria'`, linhas 87-106)
- (sem alteração de produção; regra em `src/routes/users.ts:127-131`, recusa em `:134-137`, projeto com módulo não contratado em `src/routes/projects.ts:371-374`)

**Interfaces:**
- Consumes: helpers do arquivo `chamar`, `convidar`, `cliente`, `equipe`, `modulosDe`, `S`, `P`; organizações `cons-on4` (contrata iso, privacy, ot) e `sem-ot4` (contrata iso, privacy).
- Produces: dois testes que separam as duas causas do 400 (o teste existente da linha 88 não separa: o projeto e a organização dele não têm `ot`).

- [ ] **Step 1: Escrever os testes** (dentro do describe, depois do teste `'regra real: ...'`):

```ts
  it('teto do PROJETO: cliente com o ot em projeto SEM o ot, de organização que CONTRATA o ot, é 400; no projeto com o ot passa', async () => {
    const pj = await chamar('POST', '/api/v1/projects', S['cons-on4'], { client_name: 'Cliente sem ot, organização com ot', modulos: ['iso', 'privacy'] });
    expect(pj.status).toBe(201);
    const semOt = ((await pj.json()) as { id: string }).id;
    const recusa = await convidar('cons-on4', { name: 'Cliente', email: 'cli-teto-proj@cliente.lat', role: 'org_admin', client_project_id: semOt, modulos: ['ot'] });
    expect(recusa.status).toBe(400);
    expect(((await recusa.json()) as { error: string }).error).toMatch(/Esta conta não pode receber/);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM users WHERE email = 'cli-teto-proj@cliente.lat'`).first()).toBeNull();
    // Controle: a MESMA organização, projeto COM o ot (P['cons-on4']): o teto do cliente é o do projeto, então passa.
    expect((await cliente('cons-on4', 'cli-teto-proj-ok@cliente.lat', ['ot'])).status).toBe(201);
    expect(await modulosDe('cli-teto-proj-ok@cliente.lat')).toEqual(['ot']);
  });
  it('teto da ORGANIZAÇÃO: projeto com o ot não nasce em organização que não o contrata (409), então só a equipe tem esse teto', async () => {
    const r = await chamar('POST', '/api/v1/projects', S['sem-ot4'], { client_name: 'Tenta o ot sem contrato', modulos: ['iso', 'ot'] });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/não contratado/);
    expect(await env.DB.prepare(`SELECT 1 AS x FROM projects WHERE client_name = 'Tenta o ot sem contrato'`).first()).toBeNull();
  });
```

- [ ] **Step 2: Rodar (passa de primeira) e provar com mutação**

Run: `npx vitest run test/onboarding-rotas.test.ts -t "teto"` → PASS (os dois novos e os dois antigos).
Mutação: em `src/routes/users.ts:129` troque `modulosDoProjeto(db, conta.client_project_id)` por `modulosContratados(db, conta.org ?? '')` (o cliente passaria a ter o teto da organização); rode de novo → o primeiro teste novo FALHA (`expected 201 to be 400`). **Restaure** (`git checkout -- src/routes/users.ts`).

- [ ] **Step 3: Rodar o arquivo e os tipos**

Run: `npx vitest run test/onboarding-rotas.test.ts` e `npx tsc --noEmit` → passam, sem saída do tsc.

- [ ] **Step 4: Commit**

```bash
git add test/onboarding-rotas.test.ts
git diff --cached --stat
git commit -m "test(onboarding): separa o teto do projeto (cliente) do teto da organização (equipe)"
```

---

### Task 7: CHANGELOG e verificação do lote

**Files:**
- Modify: `CHANGELOG.md` (seção `## [Não publicado]`, uma entrada nova no topo da lista de seções)

**Interfaces:** nenhuma.

- [ ] **Step 1: Entrada do CHANGELOG** (com acentos), logo abaixo de `## [Não publicado]` e acima da primeira `###`:

```markdown
### Pontos menores das ondas 1 a 4 (lote 3, telas e documentação)
- **Chaves de API** (só `platform_admin`) abre sem projeto escolhido: "Nova chave" fica desabilitada até a pessoa escolher o projeto, para a chave não nascer no projeto errado.
- **Trilha de implantação do n.privacy:** o passo por fazer cuja tela não abre pelo Painel mostra "Falta" em vez de ficar sem nada, e a trilha vazia não desenha mais a caixa.
- **Fornecedores do n.ot:** o botão agora diz "Gerar perguntas de OT para o projeto" (a ação sempre foi do projeto, não de um fornecedor).
- Testes novos fixam o botão "Criar o primeiro projeto" (habilita só com as organizações carregadas) e o teto de módulos do convite (cliente: o do projeto; equipe: o da organização).
```

- [ ] **Step 2: Verificação do lote** (só os arquivos do lote):

```bash
cd frontend && npx vitest run test/admin-usuarios-apikeys.test.js test/painel-regua.test.js test/painel-view.test.js test/ot-fornecedores.test.js test/organizacoes.test.js test/onboarding-encadeado.test.js && npm run build
cd .. && npx vitest run test/onboarding-rotas.test.ts && npx tsc --noEmit
git diff --stat origin/main -- test/onda2-numeros.test.ts   # vazio
git diff --stat origin/main -- 'src/**/ot*' 'src/routes/ot*' 'frontend/src/ot*' 'frontend/src/views/ot*'   # só frontend/src/views/ot-fornecedores.js (Task 4)
```

Expected: todos passam; build `✓ built in`; `tsc` sem saída; o penúltimo comando vazio; o último lista só `frontend/src/views/ot-fornecedores.js` (renomear rótulo; sem nenhuma chamada nova de n.ot).

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git diff --cached --stat
git commit -m "docs(changelog): lote 3 dos pontos menores"
```

**Entrega do lote:** `bash scripts/ci/gate.sh` na máquina de quem mergeia; PR (rascunho) "pontos menores, lote 3: UX e docs". Sem revisor opus (nenhum task toca segurança, permissão ou dado de titular).

---

# PARTE B: PR4 DO CANAL DO TITULAR (branch `claude/canal-titular-4`)

### Task 8: "E-mail do canal do titular" em Pessoas-chave do assistente **[revisor opus]**

Revisor em modelo forte: este task grava dado de titular (o canal) a partir de uma rota de criação de projeto, com permissão por papel e com falha tolerada que não pode vazar nem derrubar a criação.

**Files:**
- Modify: `src/schemas/corpos.ts:77` (dentro de `pessoasChaveSchema`, `:74-78`)
- Modify: `src/routes/projects.ts:24` (import novo), `:374` (recusas depois da checagem de módulos), `:405-407` (gravar o canal depois do batch e devolver o resultado)
- Modify: `frontend/src/views/empresa.js:321-328` (passo 3), `:340` (resumo, passo 4), `:370-373` (`guardarPasso`), `:385` (estado inicial), `:405-409` (`criarNovoProjeto`) e a mensagem pós-criação (`:433`)
- Modify: `AGENTS.md:642` (uma frase, sem acentos), `CHANGELOG.md` (uma linha na seção do canal)
- Modify (gerados): `docs/openapi.json` e, se `git diff --stat` mostrar mudança, `mcp-server-niso/src/contrato-gerado.ts` (`npm run openapi`)
- Test: `test/empresa.test.ts` (dentro de `describe('POST /projects com empresa e pessoas-chave')`, linha 163), `frontend/test/novo-projeto.test.js` (dentro de `describe('assistente')`, linha 65)
- **Não muda:** `src/services/empresas.ts` (`gravacaoDasPessoas` fica igual: o canal NÃO entra no batch da criação, ver Architecture), nenhuma migration, nenhuma rota nova (`test/onboarding-rotas.test.ts` fica verde sem edição).

**Interfaces:**
- Consumes (já na `main`): `salvarCanal(db: D1Database, projectId: string, ator: string, d: TitularCanalCorpo, hosts: readonly string[]): Promise<{ ok: false; status: 400 | 422; error: string } | { ok: true; campos: string[] }>` e `hostsDoApp(env: { APP_URL?: string }): string[]` (`src/services/titular-canal.ts:71`, `:31`); `salvarCanal` grava a linha de `titular_canal` e a trilha `titular.canal` com `Canal do titular atualizado: email` (só nomes de campo, `:102`); `ehEquipeNess(user)` (`src/helpers.ts:579`, já importado em `src/routes/projects.ts:7`); `TitularCanalCorpo = { email?: string | null; ...; conferir?: true }` (`src/schemas/nucleo.ts:299-308`).
- Produces: `pessoasChaveSchema` aceita `canal_titular?: { email: string }` (`.strict()`, `z.email().max(200)`, o mesmo e-mail que o `PUT` aceita); `POST /api/v1/projects` aceita `pessoas.canal_titular` e devolve, quando ele veio, `canal_titular: boolean` (`true` = gravado; `false` = projeto criado, canal não gravado); recusas: **400** sem o n.privacy no projeto, **403** para quem não é equipe. Nenhuma assinatura nova no frontend: `W.pessoas.canal_email: string` (estado do assistente).

**Decisões deste task (registrar no PR):**
1. **Depois do batch, não dentro dele.** O texto antigo punha o `INSERT` no batch da criação: com a tabela ausente (produção antes da `0117`) o batch falharia inteiro e o projeto não nasceria por causa de um campo opcional. Aqui o canal é gravado com `salvarCanal` DEPOIS do batch, num `try/catch`: falha de qualquer natureza (tabela ausente, banco) vira `canal_titular: false` na resposta e um aviso no log (sem o endereço), nunca um 500 depois do projeto criado (um 500 convidaria a repetir a criação e duplicar o projeto). O custo é a perda da atomicidade com o projeto; o front avisa a pessoa e o registro continua disponível no botão "Canal do titular" de Solicitações.
2. **"E-mail só do domínio válido"** = o mesmo `z.email()` do `PUT` do canal (`titularCanalSchema.email`, `src/schemas/nucleo.ts:300`), com `max(200)`; o servidor também põe em minúsculas e tira espaços (como o e-mail do DPO em `partes`). Não há consulta de MX.
3. **Nunca o link do portal:** o objeto `canal_titular` é `.strict()` com um único campo `email`; URL de formulário ou de divulgação não entra por aqui (e um link não é e-mail válido).

- [ ] **Step 1: Testes do backend que falham.** Em `test/empresa.test.ts`, dentro de `describe('POST /projects com empresa e pessoas-chave', ...)`, depois do teste `'o agente MCP não cria projeto'`:

```ts
  const contar = async (tabela: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM ${tabela}`).first<any>()).n;

  it('canal do titular (opcional, só o e-mail) é gravado depois da criação; a trilha leva só o nome do campo', async () => {
    const r = await chamar(cadm, 'POST', '/api/v1/projects', { project_name: 'Programa Ômega', standards: 'ISO 27001', org_role: 'Controller', modulos: ['iso', 'privacy'],
      empresa: { razao_social: 'Ômega Fictícia S.A.' }, pessoas: { dpo: { nome: 'Encarregado Ômega', email: 'dpo@omega.exemplo' }, canal_titular: { email: ' Privacidade@Omega.exemplo ' } } });
    expect(r.status, await r.clone().text()).toBe(201);
    const corpo = await r.json<any>();
    expect(corpo.canal_titular).toBe(true);
    expect(await env.DB.prepare('SELECT email, telefone, formulario_url, divulgacao_url, atualizado_por FROM titular_canal WHERE project_id = ?').bind(corpo.id).first())
      .toEqual({ email: 'privacidade@omega.exemplo', telefone: null, formulario_url: null, divulgacao_url: null, atualizado_por: 'cadm@e.lat' });
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'titular.canal' AND project_id = ?`).bind(corpo.id).first<{ details: string }>();
    expect(log!.details).toBe('Canal do titular atualizado: email');
    expect(log!.details).not.toContain('omega.exemplo');
  });

  it('sem canal_titular nada muda: a resposta não traz o campo e não nasce linha em titular_canal', async () => {
    const antes = await contar('titular_canal');
    const r = await chamar(cadm, 'POST', '/api/v1/projects', { client_name: 'Ômicron Fictícia', modulos: ['iso', 'privacy'], pessoas: { dpo: { nome: 'Encarregado Ômicron' } } });
    expect(r.status).toBe(201);
    expect('canal_titular' in (await r.json<any>())).toBe(false);
    expect(await contar('titular_canal')).toBe(antes);
  });

  it('o campo só aceita e-mail: link, campo extra, e-mail inválido e ausência do n.privacy são recusados e nada é criado', async () => {
    const antes = { projetos: await contar('projects'), canais: await contar('titular_canal') };
    const corpo = (canal_titular: unknown, modulos = ['iso', 'privacy']) => ({ client_name: 'Pi Fictícia', modulos, pessoas: { canal_titular } });
    const link = 'https://n360.ness.com.br/solicitacao#' + 'a'.repeat(64);
    for (const c of [{ email: 'nao-e-email' }, { email: link }, { email: 'a@b.exemplo', formulario_url: 'https://formulario.exemplo' }, {}]) {
      expect((await chamar(cadm, 'POST', '/api/v1/projects', corpo(c))).status).toBe(400);
    }
    const semPrivacy = await chamar(cadm, 'POST', '/api/v1/projects', corpo({ email: 'canal@pi.exemplo' }, ['iso']));
    expect(semPrivacy.status).toBe(400);
    expect((await semPrivacy.json<any>()).error).toMatch(/n\.privacy/);
    expect({ projetos: await contar('projects'), canais: await contar('titular_canal') }).toEqual(antes);
  });

  it('quem não é equipe (org_admin do cliente) e o agente MCP não registram o canal: 403 e nada é criado', async () => {
    const antes = { projetos: await contar('projects'), canais: await contar('titular_canal') };
    const corpo = { client_name: 'Rô Fictícia', modulos: ['iso', 'privacy'], pessoas: { canal_titular: { email: 'canal@ro.exemplo' } } };
    expect((await chamar(cli, 'POST', '/api/v1/projects', corpo)).status).toBe(403);
    const agente = { AGENTE: { concessaoId: 'c-e', userId: 'u-cons', email: 'cons@e.lat', projectId: 'pe1' } };
    expect((await chamar({ 'X-Agente-Confirmado': '1' }, 'POST', '/api/v1/projects', corpo, agente)).status).toBe(403);
    expect({ projetos: await contar('projects'), canais: await contar('titular_canal') }).toEqual(antes);
  });

  it('tabela titular_canal ausente (antes da 0117): o projeto nasce, canal_titular é false e o log não leva o endereço', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await env.DB.prepare('DROP TABLE titular_canal').run();
    try {
      const r = await chamar(cadm, 'POST', '/api/v1/projects', { client_name: 'Sigma Fictícia', modulos: ['iso', 'privacy'], pessoas: { canal_titular: { email: 'canal@sigma.exemplo' } } });
      expect(r.status, await r.clone().text()).toBe(201);
      const corpo = await r.json<any>();
      expect(corpo.canal_titular).toBe(false);
      expect(await env.DB.prepare('SELECT 1 FROM projects WHERE id = ?').bind(corpo.id).first()).not.toBeNull();
      const saida = log.mock.calls.flat().join(' ');
      expect(saida).toContain('titular_canal_nao_gravado');
      expect(saida).toContain('tabela_ausente');
      expect(saida).not.toContain('sigma.exemplo');
    } finally {
      log.mockRestore();
      await applySchema();   // devolve titular_canal (CREATE IF NOT EXISTS); os dados dos outros testes ficam
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/empresa.test.ts -t "POST /projects com empresa e pessoas-chave"`
Expected: FAIL nos cinco testes novos: o schema `.strict()` recusa `canal_titular` com 400 (o primeiro e o de ausência de tabela esperam 201), "sem canal_titular" PASSA (já é verdade; fica como trava), os 400 do terceiro passam por acaso mas o `semPrivacy.json().error` não casa `/n\.privacy/`, e o 403 do `cli` pode vir de outra recusa (o que o teste aceita) mas o do ausente falha. A falha que importa: o primeiro, com `expected 400 to be 201`.

- [ ] **Step 3: Implementar o backend.**

`src/schemas/corpos.ts`, dentro de `pessoasChaveSchema`, logo depois da linha do `dpo` (linha 77):

```ts
  /** Canal do titular (0117, decisão 7 da spec do canal): SÓ o e-mail (o link do portal e as páginas não entram por aqui). Só com o n.privacy no projeto. */
  canal_titular: z.object({ email: z.email().max(200) }).strict().optional(),
```

`src/routes/projects.ts`, import novo logo depois da linha 24:

```ts
import { hostsDoApp, salvarCanal } from '../services/titular-canal';
```

`src/routes/projects.ts`, logo depois da linha 374 (`if (fora.length) return c.json({ error: \`Produto não contratado ...\` }, 409);`):

```ts
    // Canal do titular (opcional): ato de pessoa da equipe e só com o n.privacy no projeto. Recusa ANTES do batch: nada é criado.
    const canalEmail = body.pessoas?.canal_titular?.email;
    if (canalEmail) {
      if (!ehEquipeNess(user)) return c.json({ error: 'Forbidden: o canal do titular é registrado pela equipe da consultoria' }, 403);
      if (!(escolhidos ?? contratados).includes('privacy')) return c.json({ error: 'O canal do titular é do n.privacy: habilite o módulo no projeto' }, 400);
    }
```

`src/routes/projects.ts`, entre a linha 405 (`if (pessoas.length) await logAudit(... 'parte.criada' ...)`) e a 407 (`return c.json({ id, ...`), grave o canal depois do batch e devolva o resultado:

```ts
    // Canal do titular DEPOIS do batch: campo opcional nunca derruba nem desfaz o projeto criado (tabela ausente antes da 0117 inclusive).
    // `salvarCanal` valida, grava e registra a trilha só com o NOME do campo; o endereço nunca vai para o log.
    let canalGravado: boolean | undefined;
    if (canalEmail) {
      try {
        canalGravado = (await salvarCanal(c.env.DB, id, user.email, { email: canalEmail.trim().toLowerCase() }, hostsDoApp(c.env))).ok;
      } catch (e) {
        canalGravado = false;
        console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_canal_nao_gravado', projeto: id,
          causa: /no such table: titular_canal/i.test(String((e as Error)?.message ?? e)) ? 'tabela_ausente' : 'erro' }));
      }
    }
```

e a resposta (linha 407) passa a ser:

```ts
    return c.json({ id, project_name: body.project_name, client_name: body.client_name, status: 'active', modulos: modulos.sort(),
      ...(canalGravado === undefined ? {} : { canal_titular: canalGravado }) }, 201);
```

- [ ] **Step 4: Rodar o backend e ver passar**

Run: `npx vitest run test/empresa.test.ts` e `npx tsc --noEmit`
Expected: todos passam (os cinco novos e os antigos, inclusive "falha no meio (pessoa) não deixa projeto pela metade" e "o agente MCP não cria projeto"); `tsc` sem saída. Se o 403 do `cli` vier com outro texto, o teste só confere o status: está certo.

- [ ] **Step 5: Testes do frontend que falham.** Em `frontend/test/novo-projeto.test.js`, dentro de `describe('assistente', ...)` (o `beforeEach` abre o assistente com `modulos: ['iso', 'privacy']`), depois do teste `'fluxo completo ...'`:

```js
    it('com o n.privacy, "E-mail do canal do titular" vai em pessoas.canal_titular, aparece no resumo e o campo é acessível', async () => {
        digitar('emp-razao_social', 'Teta Fictícia Ltda');
        window.novoProjetoIr(2);
        window.novoProjetoIr(3);
        expect(document.querySelector('label[for="np-canal-email"]')).not.toBeNull();
        expect($('np-canal-email').getAttribute('aria-describedby')).toBe('np-canal-dica');
        digitar('np-dpo-nome', 'Encarregado Fictício');
        digitar('np-canal-email', 'privacidade@teta.exemplo');
        window.novoProjetoIr(4);
        expect($('np-passo').textContent).toContain('privacidade@teta.exemplo');
        apiMock.mockImplementation(async (m) => (m === 'POST' ? { id: 'novo', modulos: ['iso', 'privacy'], canal_titular: true } : []));
        await window.criarNovoProjeto();
        const [, , corpo] = apiMock.mock.calls.find(([m]) => m === 'POST');
        expect(corpo.pessoas.canal_titular).toEqual({ email: 'privacidade@teta.exemplo' });
    });

    it('e-mail do canal inválido não segue do passo 3; sem o n.privacy o passo não oferece o campo e o corpo não leva o canal', async () => {
        digitar('emp-razao_social', 'Teta');
        window.novoProjetoIr(2);
        window.novoProjetoIr(3);
        digitar('np-canal-email', 'nao-e-email');
        window.novoProjetoIr(4);
        expect($('np-erro').textContent).toMatch(/e-mail válido para o canal do titular/);
        expect($('np-canal-email')).not.toBeNull();   // ficou no passo 3
        digitar('np-canal-email', 'canal@teta.exemplo');
        window.novoProjetoIr(2);                       // voltar não valida e guarda o que foi digitado
        for (const c of document.querySelectorAll('input[name=np-modulo]')) c.checked = c.value === 'iso';
        window.novoProjetoIr(3);
        expect($('np-canal-email')).toBeNull();
        window.novoProjetoIr(4);
        expect($('np-passo').textContent).not.toContain('canal@teta.exemplo');
        apiMock.mockImplementation(async (m) => (m === 'POST' ? { id: 'novo', modulos: ['iso'] } : []));
        await window.criarNovoProjeto();
        const [, , corpo] = apiMock.mock.calls.find(([m]) => m === 'POST');
        expect(JSON.stringify(corpo)).not.toContain('canal_titular');
    });

    it('canal não gravado (canal_titular: false na resposta): o projeto segue e a pessoa é avisada onde registrar', async () => {
        const avisos = vi.fn(); window.showToast = avisos;
        digitar('emp-razao_social', 'Teta');
        window.novoProjetoIr(2);
        window.novoProjetoIr(3);
        digitar('np-canal-email', 'canal@teta.exemplo');
        window.novoProjetoIr(4);
        apiMock.mockImplementation(async (m) => (m === 'POST' ? { id: 'novo', modulos: ['iso', 'privacy'], canal_titular: false } : []));
        await window.criarNovoProjeto();
        expect($('np-titulo').textContent).toBe('Novo projeto — Pessoas e acessos');
        expect(avisos.mock.calls.some(([t]) => /canal do titular não foi gravado/i.test(t))).toBe(true);
    });
```

(O arquivo importa `showToast` via `../src/ui.js`; `empresa.js` chama `showToast` como global importado, não `window.showToast`. Se o último teste não enxergar o aviso por esse motivo, use `vi.spyOn(await import('../src/ui.js'), 'showToast')` no lugar da atribuição a `window`; a asserção fica a mesma. Confira em `frontend/src/views/empresa.js:1-12` como o `showToast` é importado antes de escolher.)

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd frontend && npx vitest run test/novo-projeto.test.js -t "assistente"`
Expected: FAIL nos três (`np-canal-email` inexistente: `Cannot read properties of null`).

- [ ] **Step 7: Implementar o frontend.** Em `frontend/src/views/empresa.js`:

(a) Passo 3 (linhas 321-328). Depois de `const r = W.pessoas.representante, d = W.pessoas.dpo;` (linha 321) acrescente:

```js
        const canalHtml = W.programa.modulos.includes('privacy')
            ? `<div class="form-group"><label class="form-label" for="np-canal-email">E-mail do canal do titular (opcional)</label>
                <input class="form-input" id="np-canal-email" type="email" maxlength="200" aria-describedby="np-canal-dica" value="${escapeHTML(W.pessoas.canal_email || '')}">
                <p id="np-canal-dica" class="tc-dica">Caixa institucional por onde o titular fala com a empresa (por exemplo, privacidade@empresa.com.br). Não cole aqui o link do portal de solicitações.</p></div>` : '';
```

e no fim do template do passo 3 (linha 328), troque o final `...value="${escapeHTML(d.email)}"></div></div></fieldset>\`;` por `...value="${escapeHTML(d.email)}"></div></div></fieldset>${canalHtml}\`;` (só acrescenta `${canalHtml}` antes do acento grave de fechamento).

(b) Resumo, passo 4 (linha 340), logo depois da linha `${linha('Encarregado (DPO)', ...)}`:

```js
            ${p.modulos.includes('privacy') ? linha('Canal do titular', ps.canal_email) : ''}
```

(c) `guardarPasso`, passo 3 (linhas 370-375). Troque o bloco por:

```js
    if (W.passo === 3) {
        const v = (id) => document.getElementById(id).value.trim();
        const campoCanal = document.getElementById('np-canal-email');   // só existe com o n.privacy no projeto; sem ele, guarda o que já estava
        W.pessoas = { representante: { nome: v('np-rep-nome'), cargo: v('np-rep-cargo') }, dpo: { nome: v('np-dpo-nome'), email: v('np-dpo-email') },
            canal_email: campoCanal ? campoCanal.value.trim() : W.pessoas.canal_email };
        if (W.pessoas.dpo.email && !W.pessoas.dpo.nome) return 'Informe o nome do DPO.';
        if (W.pessoas.representante.cargo && !W.pessoas.representante.nome) return 'Informe o nome do representante legal.';
        if (campoCanal && W.pessoas.canal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(W.pessoas.canal_email)) return 'Informe um e-mail válido para o canal do titular.';
    }
```

(d) Estado inicial (linha 385): `pessoas: { representante: { nome: '', cargo: '' }, dpo: { nome: '', email: '' } } };` vira `pessoas: { representante: { nome: '', cargo: '' }, dpo: { nome: '', email: '' }, canal_email: '' } };`.

(e) `criarNovoProjeto` (depois da linha 409 `if (ps.dpo.nome) pessoas.dpo = ...`), acrescente (só com o n.privacy ainda marcado: quem desmarca o módulo depois de digitar não envia o canal):

```js
    if (ps.canal_email && p.modulos.includes('privacy')) pessoas.canal_titular = { email: ps.canal_email };
```

(f) Aviso quando o servidor criou o projeto mas não gravou o canal: logo depois de `showToast('Projeto criado.', 'success');` (linha 433) acrescente:

```js
    if (r && r.canal_titular === false) showToast('O projeto foi criado, mas o e-mail do canal do titular não foi gravado. Registre em Solicitações, botão "Canal do titular".', 'error');
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd frontend && npx vitest run test/novo-projeto.test.js test/onboarding-encadeado.test.js` → passam. Depois `cd frontend && npx vitest run` (suíte inteira do frontend) → todos passam; `cd frontend && npm run build` → `✓ built in`.

- [ ] **Step 9: Contrato gerado.** O corpo de `POST /projects` mudou:

```bash
npm run openapi
git diff --stat docs/openapi.json mcp-server-niso/src/contrato-gerado.ts
npx vitest run test/openapi.test.ts test/contrato-mcp.test.ts
```

Expected: `docs/openapi.json` muda (aparece `canal_titular` dentro de `pessoas`); `contrato-gerado.ts` pode não mudar (adicione ao commit só se o `git diff --stat` mostrar); os dois testes passam.

- [ ] **Step 10: Documentação.** `AGENTS.md:642` (sem acentos): no trecho `assistente (\`views/empresa.js\`): Empresa, Programa, Pessoas-chave, Resumo, cria o projeto,` troque `Pessoas-chave,` por `Pessoas-chave (com o n.privacy, o e-mail opcional do canal do titular, gravado depois da criacao por \`salvarCanal\`; falha dele nao derruba o projeto e a resposta traz \`canal_titular: false\`),` (Edit tool, `old_string`: `Empresa, Programa, Pessoas-chave, Resumo, cria o projeto,`). `CHANGELOG.md`: na seção `### n.privacy: canal do titular (migração 0117, spec 2026-11-19)`, acrescente antes da linha "A migração 0117 foi aplicada...":

```markdown
- O assistente "Novo projeto" pede, opcionalmente, o e-mail do canal do titular em "Pessoas-chave" (só com o n.privacy). É gravado depois da criação do projeto; se não puder ser gravado, o projeto nasce mesmo assim e o assistente avisa onde registrar.
```

Confira: `git diff -U0 AGENTS.md | grep '^+[^+]' | grep -cP '[^\x00-\x7F]'` → `0`.

- [ ] **Step 11: Verificação final** (só os arquivos do task):

```bash
npx vitest run test/empresa.test.ts test/onboarding-rotas.test.ts test/openapi.test.ts test/contrato-mcp.test.ts test/titular-canal.test.ts test/titular-canal-sem-tabela.test.ts
npx tsc --noEmit
git diff --stat origin/main -- test/onda2-numeros.test.ts   # vazio
git diff --stat origin/main -- 'src/**/ot*' 'src/routes/ot*' 'frontend/src/ot*' 'frontend/src/views/ot*'   # vazio
```

Expected: `Test Files  6 passed (6)`; `tsc` sem saída; os dois `git diff --stat` vazios. As suítes de isolamento (`contrato-isolamento-org`, `-topo`) não rodam aqui: o task não cria tabela nem rota.

- [ ] **Step 12: Commit**

```bash
git add src/schemas/corpos.ts src/routes/projects.ts frontend/src/views/empresa.js test/empresa.test.ts frontend/test/novo-projeto.test.js docs/openapi.json AGENTS.md CHANGELOG.md
# acrescente mcp-server-niso/src/contrato-gerado.ts SÓ se o Step 9 mostrou mudança nele
git diff --cached --stat
git commit -m "feat(onboarding): e-mail do canal do titular em Pessoas-chave do assistente"
```

**Entrega PR4:** `bash scripts/ci/gate.sh` na máquina de quem mergeia; PR (rascunho) "canal do titular PR4: onboarding (opcional)", com revisão em modelo forte (opus) do Task 8. Texto do PR: dizer que NÃO há migration, que o canal é gravado depois do batch (decisão 1 acima) e por quê, e que o front avisa quando a resposta traz `canal_titular: false`.

---

## Self-Review

**1. Cobertura.** Lote 3: P-12 (Task 4), P-13 (Task 2), P-14 (Task 1), P-15 e P-16 (Task 3), P-17 (Task 5), P-18 (Task 6), CHANGELOG e verificação (Task 7). Nenhum item "já resolvido": os sete ainda existem (tabela "Reverificação"). PR4: Task 8 cobre as cinco exigências do pedido: e-mail só válido (`z.email().max(200)`, mesmo do `PUT`; link e campos extras recusados pelo `.strict()`), trilha só com nomes de campo (reaproveita `salvarCanal`; teste confere que o endereço não está em `details`), nunca gravar o link do portal (teste com o link no campo e com `formulario_url` extra), tabela ausente tolerada (teste dedicado com `DROP TABLE` e `applySchema()` no `finally`), agente e chave de API não escrevem (teste do `cli`/agente: 403; a chave de API entra como `client` e cai no `ehEquipeNess` falso).

**2. Placeholders.** Nenhum passo de código sem código. Dois condicionais declarados com a condição exata: o `click()` do teste do Task 4 (cai para `window.otFornPerguntas('f1')` se o arquivo não inicializar a delegação) e o `showToast` do último teste do frontend do Task 8 (como o import é feito em `empresa.js`); em ambos o passo diz o que conferir e qual alternativa usar.

**3. Tipos e nomes.** `salvarCanal(db, projectId, ator, d, hosts)`, `hostsDoApp(env)` e `TitularCanalCorpo` são os da `main` (`src/services/titular-canal.ts:31,71`; `src/schemas/nucleo.ts:308`). `canal_titular` (campo do corpo e da resposta) tem o mesmo nome em schema, rota, testes e frontend; `W.pessoas.canal_email` (estado do assistente) é usado igual nos passos 3, 4, `guardarPasso`, estado inicial e `criarNovoProjeto`. A mensagem `Canal do titular atualizado: email` do teste é a que `salvarCanal` produz para um canal novo só com e-mail (`mudaram = ['email']`).

**4. O que mudou em relação aos textos antigos.**
- Task 8 (antigo): o `INSERT` no batch da criação virou `salvarCanal` DEPOIS do batch com tolerância a falha (o texto antigo derrubaria a criação do projeto com a tabela ausente e duplicava validação); `src/services/empresas.ts` deixou de ser tocado; entram recusas novas (403 não equipe, 400 sem n.privacy) e o campo `canal_titular` na resposta com aviso no front; o estado do assistente foi para `W.pessoas.canal_email` (antes `dpo.canal_email`) com validação de e-mail no passo 3; linhas atualizadas (`corpos.ts:74-78`, `projects.ts:24,374,405-407`, `empresa.js:321-328,340,370-375,385,405-433`, `AGENTS.md:642`).
- Lote 3: P-14 passou de `AGENTS.md:620` para `:621`; P-15/P-16 de `painel.js:141-146` para `:143-148` e `:225`; o teste de P-17 mudou de arquivo; **P-18 corrigido** (o teto do cliente é só o do projeto); P-12 e P-13 exigem editar testes existentes.

**5. Não conferido (nada foi executado: o worktree não tem `node_modules`, e a instrução era só ler).**
- Nenhum teste, `tsc`, build ou `npm run openapi` rodou; as falhas e passes "esperados" dos passos são deduzidos da leitura do código.
- Se o `org_admin` (`cli`) chega à rota `POST /projects` ou é barrado antes (o teste aceita qualquer 403, e o Task 8 cobre o caso em que chega, com o `ehEquipeNess`).
- O texto exato do erro do D1 para tabela ausente em teste (o código classifica por regex e o teste confere `tabela_ausente`; se o miniflare formatar diferente, o log sai com `causa: 'erro'` e o teste do Step 1 mostra a mensagem real: ajuste só a regex, não a tolerância).
- Se `ot-fornecedores.test.js` inicializa a delegação de eventos (Task 4, ramo alternativo descrito) e como `empresa.js` importa `showToast` (Task 8, Step 5).
- Se `npm run openapi` altera `mcp-server-niso/src/contrato-gerado.ts` (o arquivo hoje não menciona `pessoas`).
- Se o cliente `org_admin` com módulo `ot` num projeto com `ot` é aceito pela rota de usuários (Task 6, controle `cli-teto-proj-ok`): a leitura de `tetoDaConta` diz que sim; se a rota tiver outra regra, esse `expect(...).toBe(201)` ensina qual.

## Execução

Plano em `docs/superpowers/plans/2026-11-20-lote3-e-canal-pr4.md`. Duas opções: **1. Subagent-Driven (recomendado)**, um subagente por task, com revisão forte (opus) no Task 8; **2. Execução inline** com `superpowers:executing-plans`. Lote 3 (Tasks 1-7) e PR4 (Task 8) são independentes e podem andar em paralelo, em worktrees e branches separados.
