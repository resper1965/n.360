# Avaliação do repositório — 2026-10-14

Foto de `origin/main` = `742b521` (worktree `chore/higienizacao-2026-10-14`). Todo número traz o comando que o
mediu, rodado neste dia. Produção estava no mesmo commit: `curl -s https://n360.ness.com.br/health` devolveu
`"version":"742b52145c7897bcb98cc30a839a8adbde9fa1ab"`, e o Deploy desse commit terminou com sucesso
(`gh run list --workflow deploy.yml --limit 1`), o que só acontece sem migration pendente (a 0070 está aplicada).

Prioridade: **P0** quebra produção ou expõe dado; **P1** risco real ou portão que pode mentir; **P2** dívida.
Nenhum P0 encontrado.

## Resumo executável

| # | Prio | Achado | Ação sugerida |
|---|---|---|---|
| 1 | P1 | Duas intermitências na suíte que é portão do CI: `test/mfa.test.ts` (relógio) e o pool do vitest (`bad port`) | Fixar o relógio no teste; acompanhar o pool (ver 2.1) |
| 2 | P1 | Hash de senha legado (SHA-256 sem sal) ainda aceito no login | Medir quantas contas restam; forçar troca (ver 3.4) |
| 3 | P1 | Documentação com 10 contagens velhas (corrigidas neste branch) | Feito; manter o hábito do comando ao lado |
| 4 | P2 | Bundle único de 1.037 kB (250 kB gzip) | Separar telas grandes por `import()` dinâmico, se o tempo de carga incomodar |
| 5 | P2 | 47 botões de fechar `&times;` sem `aria-label` | Um `aria-label="Fechar"` por botão, ou no utilitário de modal |
| 6 | P2 | 3 tabelas sem nenhuma referência em `src/` | Decidir se saem por migration |
| 7 | P2 | 8 exports sem uso em lugar nenhum | Apagar depois de conferir um a um |
| 8 | P2 | 2 rotas de escrita sem teste HTTP | Teste de 403/200 para cada |
| 9 | P2 | 17 alertas abertos do CodeQL (0 de segurança) | Limpar na próxima passada nos arquivos |
| 10 | P2 | `.gitignore` com curingas quebrados (corrigido neste branch) | Feito |
| 11 | P2 | Ferramentas de teste e build em `dependencies` | Mover para `devDependencies` num PR de dependências |

## 1. Documentação x código

Re-medido com o comando que o próprio texto cita. Corrigido no commit `docs: atualiza contagens...`:

| Afirmação | Onde | Era | Agora | Comando |
|---|---|---|---|---|
| Arquivos de rota | `AGENTS.md:90`, `README.md:137` | 50 | 51 | `ls src/routes/*.ts \| grep -vc '\.test\.ts$'` |
| Arquivos de serviço | `AGENTS.md:127`, `README.md:138` | 40 | 43 | `ls src/services/*.ts \| wc -l` |
| Migrations | `README.md:147` | 67, última 0069 | 68, última 0070 | `ls migrations/*.sql \| wc -l`; `ls migrations/*.sql \| tail -1` |
| Testes do backend | `AGENTS.md:432`, `README.md:148`, `docs/testing.md:12` | 245 | 254 | `ls test/*.test.ts \| wc -l` |
| Testes jsdom | `AGENTS.md:443`, `README.md:149`, `docs/testing.md:13` | 92 / 94 | 96 | `ls frontend/test/*.test.js \| wc -l` |
| Linhas de JS do frontend | `AGENTS.md:442` | ~19,4 mil | 19.860 | `cat frontend/src/*.js frontend/src/views/*.js \| wc -l` |
| Ferramentas do MCP local | `README.md:116` | 23 | 39 | `grep -oE 'name: "niso_[a-z_0-9]+"' mcp-server-niso/src/*.ts \| sort -u \| wc -l` |
| Skills do agente | `README.md:113`, `AGENTS.md:372`, `llms.txt:11` | 2 | 6 | `ls agent-skills` |
| Invariantes do agente | `SECURITY.md:60`, `docs/README.md:41` | 12 | 13 | `grep -oE '^\| \*\*I[0-9]+' docs/agente/seguranca.md \| sort -u \| wc -l` |
| "A maior parte das telas não tem teste próprio" | `AGENTS.md:445` | — | as 30 views são importadas por algum teste | `for f in frontend/src/views/*.js; do grep -rlq "views/$(basename $f .js)" frontend/test frontend/e2e \|\| echo $f; done` (não imprime nada) |
| Dubles de D1 citados | `AGENTS.md:437` | 6 arquivos | 12 arquivos, 18 linhas, todos pontuais | `git grep -nE "prepare\s*[:(]\s*(vi\.fn\|\(\|async)\|\bDB\s*:" -- test` |
| Skills vendorizadas em `.agents/skills` | `AGENTS.md:534` | "todas" | `ponytail` é pasta real só em `.claude/skills/` | `ls .agents/skills`; `git ls-files .claude/skills/ponytail` |

Conferido e **ainda certo**: 86 tabelas (`grep -oE '^\s*CREATE TABLE( IF NOT EXISTS)? +[a-z_0-9]+' schema.sql | awk '{print $NF}' | sort -u | wc -l`),
535 `any` (`git grep -ahoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | wc -l`, igual ao `TETO` em
`test/any-catraca.test.ts:19`), 6 specs E2E, 6 leituras de corpo cruas em 4 arquivos (`git grep -n "c\.req\.json" -- 'src/routes/*.ts'`
dá 7 linhas em 5 arquivos, a de `policies.ts:21` passa por `safeParse`), `border-radius:10px` inline 41 em 4 arquivos
(`git grep -c "border-radius:\s*10px" -- 'frontend/src/views/*.js'`), crons (`grep -A2 '"triggers"' wrangler.jsonc`: 3),
`migrations/README.md` já tem a seção da 0070 (linha 500).

**Comentários "produtos separados"** (`git grep -niE "produtos? separados|dois produtos|outro produto" -- src test migrations frontend/src schema.sql`):
corrigidos em `src/modulos.ts:3`, `src/helpers.ts:308`, `test/modulos-produto.test.ts:9`, `frontend/src/globals.js:1148,1270`,
`frontend/src/views/ponto-de-partida.js:4`, `frontend/src/views/dashboard.js:82`. **Não tocados**, de propósito:
`migrations/0060_modulos_do_contrato.sql:1` e `schema.sql:459` (fora do escopo: schema e migration não se mexem nesta limpeza),
`frontend/src/produto.js:380` (texto de UI, "Os dois produtos usam o mesmo cadastro": mudança visível, pede decisão) e nomes de
`it(...)` em `frontend/test/produto.test.js`, `aviso-clique.test.js`, `casca-menu.test.js`.

## 2. Dívida e riscos

### 2.1 P1 — teste intermitente no portão

A suíte completa da raiz falhou uma vez em `test/mfa.test.ts:227` ("disable é limitado — não vira oráculo de senha",
`expected 0 to be greater than 0`) e passou isolada (`npx vitest run test/mfa.test.ts`: 27/27). Causa:
`limiteTentativas` (`src/routes/mfa.ts:128`) usa balde FIXO de 300 s (`BALDE_SEG`, linha 113) com teto 10; se as 14
tentativas do teste cruzam a virada do balde (a suíte cheia leva ~7 min e o teste ~2 s), o contador zera no meio e nenhuma
chega ao 429. O código está correto para a regra que declara; o teste é que depende do relógio. Ação: `vi.useFakeTimers()`
com `setSystemTime` no início de um balde, ou 21 tentativas (2 x teto + 1). O irmão "activate é limitado" (linha 205) tem o
mesmo risco. Mexer em teste não fazia parte desta limpeza.

**Segunda intermitência, de infraestrutura:** na rodada final a suíte completa terminou com `Tests 2478 passed`, `Errors 1 error` e
exit 1 porque o pool não subiu o worker de `test/modulos-ligar-privacy.test.ts` (`[vitest-pool]: Failed to start cloudflare-pool worker`,
`Caused by: Error: bad port` do `undici`): a porta sorteada caiu na lista de portas que o `fetch` recusa. Isolado, o arquivo passa
(`npx vitest run test/modulos-ligar-privacy.test.ts test/mfa.test.ts`: 36/36). Não é do código, mas reprova o job `test` do CI ao
acaso; se se repetir, vale fixar a faixa de portas do pool ou reexecutar o job.

### 2.2 Dependências

- `npm audit` = 0 vulnerabilidades em raiz, `frontend` e `mcp-server-niso` (`npm audit | tail -1` em cada).
- `npm outdated` (só reporte): raiz — `@modelcontextprotocol/server` 2.0.0→2.3.1 (ignorado no Dependabot por ERESOLVE com
  `agents`), `vitest`/`@vitest/coverage-istanbul` 4.1.11→5.0.4 (ignorado: pool-workers), `typescript` 5.9.3→7.0.2 (major),
  `wrangler` 4.149→4.151, `agents` 0.27→0.28, `docx` 9.9→9.11, `zod` 4.6.5→4.6.7, `@types/node` patch; frontend —
  `qrcode-generator` 1.4.4→2.0.4; `mcp-server-niso` sem `node_modules` no worktree (o audit leu o lockfile).
- P2: `typescript`, `wrangler` e `@cloudflare/vitest-pool-workers` estão em `dependencies` (`package.json:19-28`), não em
  `devDependencies`. O Worker não empacota por `package.json`, então é só arrumação.

### 2.3 `any` — maiores ofensores

`git grep -acoE ': any\b|as any\b|<any>' -- 'src/*.ts' ':!*.test.ts' | sort -t: -k2 -rn | head`: `routes/projects.ts` 47,
`routes/platform.ts` 28, `routes/governance.ts` 28, `routes/policies.ts` 21, `routes/evidence.ts` 20, `routes/controls.ts` 19,
`routes/auth.ts` 19, `routes/propostas.ts` 18, `routes/pedidos.ts` 18, `routes/assessments.ts` 17. Dez arquivos de rota somam
235 dos 535.

### 2.4 TODO/FIXME e `ponytail:`

`git grep -nE "\b(TODO|FIXME|XXX|HACK)\b" -- src frontend/src mcp-server-niso/src scripts`: nenhum marcador real (os 8 casos
são a palavra "TODO" em português, "MÉTODO" etc.). `ponytail:` com teto declarado
(`git grep -n "ponytail:" -- src frontend/src mcp-server-niso/src`), os que valem acompanhar:

| Onde | Teto declarado |
|---|---|
| `src/helpers.ts:671` | `rateLimit` por KV não é atômico; proteção básica, não limitador rígido |
| `src/routes/projects.ts:316` | COUNT e INSERT não atômicos: duas criações simultâneas no limite passam |
| `src/routes/servicos.ts:82` | COUNT e batch não atômicos entre si |
| `src/services/similares.ts:23` | cosseno 0,75 é "chute inicial" para o bge-m3; precisa calibrar com uso |
| `src/services/rascunhos-privacy.ts:29`, `src/services/importacao.ts:197` | PII por regex: nome de pessoa em texto livre passa |
| `src/services/importacao.ts:222` | girar a `TOKEN_ENC_KEY` muda os pseudônimos novos |
| `src/services/parametros-legais.ts:52`, `frontend/src/views/titular.js:247` | dias úteis sem feriado |
| `src/services/avisos-prazo.ts:85` | fuso de São Paulo fixo em -3h |
| `src/services/documentos.ts:34,429` | sem paginação de versões; dezenas de aprovações por projeto |
| `mcp-server-niso/src/ferramentas.ts:656` | N+1 acima de 50 tratamentos |
| `frontend/src/similares.js:52` | O(n·m) por palavra; índice se passar de milhares |
| `src/routes/auth.ts:236` | ver 3.4 |

### 2.5 Rotas sem teste

Não há teste que enumere rotas sem cobertura. Heurística feita aqui: cada operação de `docs/openapi.json` (165, só as rotas com
schema Zod de escrita) cujo caminho, com parâmetro como curinga, não aparece em nenhum `test/*.test.ts`. Sobraram 11; depois de
conferir à mão (o teste monta o caminho por template), ficam **sem chamada HTTP em teste**:

- `POST /api/v1/controls/:id/trilha/desfazer` (`src/routes/controls.ts:347`; `test/trilha-por-campo.test.ts` testa a regra, não a rota)
- `POST /api/v1/projects/:id/policy-acknowledgments` (`git grep -l "policy-acknowledgments" -- test` vazio)

Ação: um teste por rota com o 403 de outro projeto e o caminho feliz. As rotas de leitura (GET) ficam fora do `openapi.json` e
desta medição: `git grep -hoE "\.(get|post|put|patch|delete)\(\s*['\`]/" -- 'src/routes/*.ts' ':!*.test.ts' | wc -l` dá 407 registros.

### 2.6 Arquivos acima de 800 linhas

`for f in $(git ls-files 'src/*.ts' 'frontend/src/*.js' 'frontend/src/*.css' ':!*.test.ts'); do n=$(wc -l < $f); [ $n -gt 800 ] && echo "$n $f"; done | sort -rn`:
`frontend/src/views/compliance.js` 2553, `frontend/src/globals.js` 2166, `frontend/src/views/monitor.js` 1938,
`frontend/src/views/grc.js` 1818, `frontend/src/style.css` 1673, `frontend/src/views/project.js` 1469,
`src/routes/projects.ts` 1178, `frontend/src/views/ropa-entrevista.js` 1083, `frontend/src/data/wizards.js` 999,
`src/services/importacao.ts` 967, `src/helpers.ts` 946. Dividir só quando a tela for revisitada.

### 2.7 Código morto provável (não apagado)

Script de leitura (export de `src/` cujo nome não aparece em nenhum outro arquivo de `src/`, `test/`, `scripts/`,
`mcp-server-niso/src/` ou `frontend/src/`): 226 exports só usados no próprio arquivo (o `export` sobra, sem dano). Os que nem o
próprio arquivo nem teste usam — candidatos reais:

`src/agents/privacidade.ts` `SugestaoTratamento`; `src/constants.ts` `EvaluationStatus`, `BLOCK_TITLES`; `src/helpers.ts`
`createNotification`, `pagedJson`; `src/schemas/domain.ts` `evidenceEvaluateSchema`, `gerarPoliticaSchema`; `src/services/pricing.ts`
`FINANCIAL_MODEL`. Conferir cada um (`git grep -nw <nome>`) antes de apagar; tipo exportado pode ser contrato documentado.

## 3. Segurança e conformidade com `SECURITY.md`

### 3.1 Invariantes e testes

Cada linha da tabela de `SECURITY.md:51-69` cita um teste; todos existem
(`ls test/{consultor-escopo,agente-paridade,mcp-remoto,agente-principal,webhooks-segredo,modulos-produto,modulos-por-pessoa,contas-ativo,contas-seguranca,sso,agentes-privacy,importacao,erro-sem-vazamento,schema-contract}.test.ts`
lista os 14) e passaram na suíte completa.

### 3.2 CSP e inline

`script-src 'self' https://challenges.cloudflare.com` em `frontend/public/_headers:19` e em `src/index.ts` (comentário na 191);
`style-src` mantém `'unsafe-inline'` de propósito (linha 198). Handler inline: `git grep -nE '\son(click|change|input|submit|load|error)=' -- frontend/src`
só casa comentários (`delegation.js:4`, `globals.js:585`). `<script>` inline nos HTML: nenhum
(`LC_ALL=C.UTF-8 grep -nP "<script(?![^>]*\bsrc=)" frontend/login.html frontend/public/*.html` só acha um comentário em `login.html:18`).

### 3.3 Segredos e dado de cliente

- Padrões de segredo (`AKIA`, `sk-`, `ghp_`, `github_pat_`, `xox?-`, `-----BEGIN ... PRIVATE KEY`, `re_`, `AIza`) com `git grep -nIE`:
  só a menção em `docs/arquivo/arrumacao/inventario-github.md:6` e um token fictício de teste (`frontend/test/proposta-publica.test.js:11`).
  Nenhum `.env`, `.dev.vars`, `.pem` ou `.key` versionado (`git ls-files | grep -iE "(^|/)\.env|\.dev\.vars|\.pem$|\.key$"` vazio).
- `test/sem-dado-de-cliente.test.ts` varre `*.{ts,js,mjs,mts,md,sql,html,json,jsonc,txt,yml,yaml,css}` e `.github/`, e **exclui**
  `.claude/` e `.agents/`; não lê `.sh`, `.py`, `.cjs`, `.svg`. Conferi à mão os termos proibidos nesses arquivos e em `.claude/`/`.agents/`
  (122 arquivos): nenhum. Lacuna P2: o teste não cobre essas extensões; acrescentar `sh,py,cjs,svg` ao glob.

### 3.4 P1 — hash de senha legado ainda aceito

`src/routes/auth.ts:236-240`: hash sem `:` (SHA-256 legado, sem sal nem iterações) é aceito e só migra para PBKDF2 quando a pessoa
entra. Conta que não entra desde a migração continua com hash fraco no banco: quem obtiver um dump (backup, export) quebra por
dicionário. Ação: medir (`SELECT count(*) FROM users WHERE password_hash NOT LIKE '%:%'`, leitura, pelo dono) e, se houver, marcar
`requires_password_change = 1` e anular o hash dessas contas (fluxo de redefinição). Não rodei consulta em produção.

### 3.5 Workflows e GitHub

- 9 workflows; todos com `permissions` no topo (`contents: read`, mais `issues: write` onde abre issue e `security-events: write` no
  CodeQL); 0 action sem SHA (`grep -E 'uses:' <wf> | grep -vcE '@[0-9a-f]{40}'` em cada); todo uso de `CLOUDFLARE_API_TOKEN` está em job
  com `environment: production`.
- Ruleset 20312002 "main protegida" ativo: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks: test,e2e`,
  `strict` = true, `bypass_actors` vazio (`gh api repos/resper1965/n.360/rulesets/20312002`).
- Visibilidade `public` (`gh api repos/resper1965/n.360 --jq .visibility`). Secrets: nenhum de repositório; `production` tem só
  `CLOUDFLARE_API_TOKEN`, e aceita só a `main`. Secret scanning e push protection ligados; Dependabot security updates ligado
  (`--jq .security_and_analysis`).
- Alertas abertos: Dependabot 0; CodeQL 17, nenhum de segurança (2 `warning` de atribuição inútil em `src/services/excecoes.ts:41` e
  `frontend/src/views/compliance.js:2435`; 15 `note`, quase todos em teste).
- Plano de repositório privado (`docs/runbook-publicacao.md` seção 5): o código já está pronto (CI só em PR, CodeQL se pula, sonda
  manual, `test/workflows-economia.test.ts`). Pendente é configuração do dono (checklist de 10 itens). Ao privatizar, os 17 alertas do
  CodeQL deixam de ser atualizados.

## 4. Migrations e schema

- 86 tabelas no `schema.sql`, última migration 0070, 68 arquivos (comandos na seção 1). `migrations/README.md` está em dia (seção 0070,
  linha 500; "Estado" diz 0070 e 68).
- Tabelas sem nenhuma referência em `src/` (para cada tabela do `schema.sql`, `git grep -lw <tabela> -- 'src/*.ts' ':!*.test.ts'` vazio):
  `project_knowledge` (órfã conhecida, ver `AGENTS.md`), `project_documents` e `project_scope_changes`. P2: confirmar em produção se têm
  linhas e decidir a saída por migration (com backup).

## 5. Frontend

- Testes: as 30 views são importadas por ao menos um teste (comando na seção 1). Teste de frontend passou: 96 arquivos, 1268 testes,
  1 pulado.
- CSS morto conhecido (`design.md:41-55`): os `border-radius: 10px` do topo de `style.css` que a sobreposição vence; as classes que
  ainda renderizam 10px (`.wizard-step`, `.yesno-btn`, `.ness-select-*`, `.dropdown-menu`) seguem usadas em `commercial.js`,
  `compliance.js`, `globals.js` e `monitor.js` (`git grep -l <classe> -- 'frontend/src/*.js'`). `grep -c "border-radius: *10px" frontend/src/style.css` = 21.
- Catracas visuais (`frontend/test/catracas-visuais.test.js`) passaram.
- IDs duplicados: nenhum no `login.html` nem nos HTML públicos (`grep -oE '\sid="[^"]+"' <arquivo> | sort | uniq -d` vazio). Nas views há
  ids repetidos no código (ex.: `imp-erro` 5 vezes em `importacao.js:374-442`), mas em formulários alternativos que não coexistem no DOM.
- A11y por amostragem: no `login.html`, 9 `<input>` e 9 `<label>`, 26 `aria-*`. Nas views, 128 dos 377 `<label>` têm `for=` (o resto
  envolve o campo ou está solto: amostrar antes de corrigir). **P2:** 47 botões de fechar só com `&times;` e sem `aria-label`
  (`git grep -nE "<button[^>]*>\s*(&times;|×|✕)\s*</button>" -- 'frontend/src/*.js' 'frontend/src/views/*.js' | grep -v aria-label | wc -l`),
  16 em `grc.js`, 8 em `compliance.js`, 6 em `privacy.js`. Leitor de tela anuncia "vezes".
- Bundle (`npm run build --prefix frontend`): `login-*.js` 1.036,89 kB (249,88 kB gzip), `login-*.css` 77,93 kB, `login.html` 44 kB;
  o Vite avisa chunk acima de 500 kB. P2.

## 6. Estrutura do repositório

- Raiz versionada (`git ls-files | awk -F/ 'NF==1'`): 22 arquivos, nenhum lixo. `debug.log`, `.impeccable/`, `scratch/`, `escratch/` não
  estão versionados (`git ls-files ops backups .impeccable escratch debug.log scratch` lista só `backups/{.gitignore,README.md}` e os dois SQL de
  `ops/`). `ops/` é registro da reconciliação de 2026-08, citado por `migrations/README.md`; fica.
- `.gitignore`: o modelo do Node entrou com os curingas quebrados (`_.log`, `\*.tgz`, `\*.tsbuildinfo`, `.pnp.\*`), então `*.log` não
  era ignorado. **Corrigido** neste branch; `git ls-files -ci --exclude-standard` continua vazio.
- `.vscode/settings.json` é versionado (só associa `wrangler.json` a jsonc). Inofensivo; o checkout principal do dono tem modificação
  local nele.
- `.claude/skills/*` são symlinks (modo 120000) para `.agents/skills/`; no Windows sem `core.symlinks` viram arquivos texto de 30 bytes.
  O `ponytail` é a exceção (pasta real).
- Docs: nenhum candidato claro a `docs/arquivo/`. `docs/plano-2026-10-fechamento.md` ainda guarda pendências abertas do dono (H2, F2,
  F4, F5, T5) mas tem estados velhos (F7, F10 e D5 "PR aberto", já mergeados): decisão do dono entre atualizar e arquivar.
  `docs/design/diagnostico-2026-10-13/` não estava no índice: **acrescentado** em `docs/README.md`.
- Nomes: `n.360`/`n.iso`/`n.privacy` no texto, `niso` só técnico. Ver seção 1 para o que ficou com "produto".

## 7. Git e GitHub

- Branches remotas: só `main` (`git ls-remote --heads origin`). Nada a apagar.
- PRs abertos: nenhum (`gh pr list --state open`).
- Dependabot: 0 alertas abertos; `dependabot.yml` com grupos e ignores documentados (vitest 5, `@modelcontextprotocol/server`).
- Rulesets, visibilidade e secrets: seção 3.5.

## Verificação deste branch

Rodado no worktree, depois dos commits de limpeza:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` (raiz, completo) | 257 arquivos e 2478 testes passaram; exit 1 por 1 erro de infraestrutura do pool (`bad port`) em `test/modulos-ligar-privacy.test.ts`, que passou isolado (36/36 com `test/mfa.test.ts`). Na rodada de base, antes das mudanças: 2486 passaram e 1 falhou (`test/mfa.test.ts:227`, intermitente, 2.1) |
| `cd frontend && npx vitest run` | 96 arquivos, 1268 passaram, 1 pulado; exit 0 |
| `npm run build --prefix frontend` | exit 0; aviso de chunk acima de 500 kB |
| Links relativos em todos os `.md` versionados (script de leitura que resolve cada `](alvo)` contra o disco) | 157 links, 0 quebrados |

Não existe teste de links de documentação no repositório (`ls test | grep -iE "readme|link"` vazio).
