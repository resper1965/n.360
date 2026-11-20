# Higienização do repositório resper1965/n.360 (2026-11-19)

Pedido do dono: "ajuste o histórico do github e planeje higienização". Interpretação: deixar o estado do GitHub organizado e planejar a limpeza SEM reescrever o histórico compartilhado. Esta fase 0 foi só leitura. Nada foi alterado no GitHub nem no git.

Base: origin/main c0badf9 (mais um commit de docs no worktree). Leituras via `git` local e `gh api -X GET`. O que o proxy bloqueou está marcado "não conferido".

## Fase 0 — Inventário (feito, somente leitura)

### 0.1 Branches remotos
Comando: `git for-each-ref refs/remotes/origin` + `git merge-base --is-ancestor <b> origin/main` + `git rev-list --left-right --count origin/main...<b>` + `gh api repos/resper1965/n.360/pulls?state=closed --paginate`.

Total: 27 refs em `git branch -r` (26 branches + main). Atenção: o repositório faz squash merge, então "ahead N" de branch antigo (centenas) NÃO significa trabalho pendente; é o histórico pré-squash. O critério confiável é o estado do PR.

Só 2 são ancestrais de main de fato (merged por git): main e `claude/friendly-ptolemy-1d3lrq`. Pelo estado dos PRs:

| Classe | Branches | Evidência |
|---|---|---|
| Merged via squash, deletável (3) | `claude/friendly-ptolemy-1d3lrq` (PRs #543-#580 todos merged, ahead 0), `claude/awesome-cray-r78x5a` (PRs #462-#497 todos merged), `claude/n360-positioning-flow-analysis-5sjto2` (PRs #589-#593 merged; porém a branch está ahead 1 e é a do PR #595 aberto: NÃO deletar até o #595 fechar) | ver nota |
| Ativos com PR aberto (4) | `claude/n360-positioning-flow-analysis-5sjto2` (#595 draft), `claude/nifty-franklin-nkqeny` (#594), `dependabot/.../hono-4.13.16` (#587), `dependabot/.../mcp-server-niso/hono-4.13.18` (#588) | PRs abertos |
| Stale, PR fechado sem merge (16) | `ci/portao-sem-espera` (#455), `claude/frente2-regras` (#465), `claude/frente2b-decisoes` (#466), `claude/frente3-listas` (#467), `claude/frente3a-lista` (#468), `claude/frente3c-itens` (#469), `dependabot/.../menores-e-patches-7912339da8` (#533), `docs/agents-fornecedores-listas` (#456), `docs/requisito-nao-aplicavel` (#537), `n-ot/n1-backend` (#525), `n-ot/n2-inventario` (#526), `n-ot/n3-coleta` (#527), `n-ot/n4-saidas` (#528), `n-ot/frontend-n2-n4` (#529), `n-ot/p1-1-stepup` (#530) | PR closed, merged_at nulo; behind main 17 a 55 commits |
| Stale, sem nenhum PR (5) | `chore/ship-juncao`, `chore/ship-juncao-segura` (18/10), `n-ot/integracao`, `n-ot/revisao-back`, `n-ot/revisao-front` (30/10) | nenhum PR encontrado na API |

Notas: os "n-ot/*" foram fechados em 30/10 e o conteúdo entrou depois por "onda 3 (n.ot no núcleo)" (#593), conforme o histórico de main; confirmar com o dono antes de apagar, porque são o único registro do trabalho original separado. Autores dos commits dos branches: Ricardo Esper (resper1965), "Claude" (noreply@anthropic.com) e dependabot[bot]. Datas do último commit: de 18/10 (mais velho) a 19/11 (ativos).

Contagem final: 3 merged (2 deletáveis agora + 1 aguardando #595), 4 ativos, 15 stale com PR fechado, 5 stale sem PR, mais main = 27. (A linha "Merged" lista 3 refs, uma delas também ativa: 2 + 4 + 15 + 5 + main = 27 sem dupla contagem.)

Obs.: `delete_branch_on_merge` já está `true` no repositório (ver 0.9), então os 2 branches "merged" sobraram por terem sido mantidos de propósito ou por PRs sucessivos reaproveitando o mesmo branch (31 e 5 PRs no mesmo branch).

### 0.2 PRs abertos
Comando: `gh api 'repos/resper1965/n.360/pulls?state=open'` e `.../pulls/<n>`.

| PR | Branch | Autor | Criado | Idade | Estado |
|---|---|---|---|---|---|
| #587 | dependabot/npm_and_yarn/hono-4.13.16 | dependabot | 13/11 | 6 dias | mergeable "não conferido" (null/unknown); 2 arquivos; status "pending" sem checks |
| #588 | dependabot/.../mcp-server-niso/hono-4.13.18 | dependabot | 13/11 | 6 dias | idem; 1 arquivo |
| #594 | claude/nifty-franklin-nkqeny | resper1965 | 18/11 | 1 dia | mergeable true, state blocked (falta gate/local); 14 arquivos; fix(evidence) |
| #595 | claude/n360-positioning-flow-analysis-5sjto2 | resper1965 | 19/11 | hoje | draft, mergeable true, blocked; 2 arquivos |

Contra-observação: #587 (hono 4.13.16) e #588 (hono 4.13.18 no mcp-server-niso) são diretórios diferentes (raiz e `mcp-server-niso`). Não são duplicados. A raiz sobe para 4.13.16 enquanto o MCP sobe para 4.13.18: vale alinhar a versão (ver fase 2).

### 0.3 PRs fechados sem merge
Comando: `gh api 'repos/resper1965/n.360/pulls?state=closed&per_page=100' --paginate`. Total de PRs fechados lidos: 563. Fechados sem merge: 98 (inclui os do bot). Notáveis: #455/#456 (CI portão, docs agentes), #465-#469 (frentes 2/3, 21/10), #525-#530 (n-ot, 30/10), #533 (menores-e-patches, 10/11), #537 (requisito não aplicável, 9/11), #500-#502 (codeql-action, fechados 10/11, coerentes com CodeQL desabilitado). Os demais são em maioria bumps do dependabot substituídos.

### 0.4 Tags e releases
Comandos: `git tag -l --format='%(refname:short) %(creatordate:short)'`, `gh api repos/.../releases`.

- 6 tags: v8.1.0, v8.2.0, v8.3.0, v9.0.0 (08/09/2026), v10.0.0 (08/09, release 14/09), v11.0.0 (06/10/2026).
- 5 releases publicados (v8.1.0 a v10.0.0, todos em 14/09/2026). v11.0.0 tem tag mas NÃO tem release publicado.
- `package.json` está em `"version": "11.0.0"`: coerente com a última tag. Esquema semver. Fez-se 6 semanas sem nova tag, apesar de ~55 commits na main (ondas 1-4); decidir se onda = versão.

### 0.5 Alertas do Dependabot
Comando: `gh api 'repos/resper1965/n.360/dependabot/alerts?state=open'` -> HTTP 403 "Resource not accessible by integration". NÃO CONFERIDO. O push informou 11 vulnerabilidades (1 high, 8 moderate, 2 low); pacote, advisory e versão corrigida não foram lidos. Pistas indiretas: os PRs abertos #587/#588 são bumps de hono (provável correção de advisory de hono, não verificado); histórico de PRs fechados mostra bumps de `fast-uri`, `ip-address`, `body-parser`, `@hono/node-server` que foram fechados sem merge em 25/10 e 05/11. Secret scanning alerts: 403 de proxy, não conferido. O dono lê em Security > Dependabot (github.com/resper1965/n.360/security/dependabot).

### 0.6 Workflows do GitHub Actions
Comando: `gh api repos/resper1965/n.360/actions/workflows`. Estado real (10 itens contando o Dependabot):

| Workflow | Estado | Gatilho no arquivo |
|---|---|---|
| CI | disabled_manually | pull_request |
| CodeQL | disabled_manually | push, pull_request, cron semanal 2ª 06:00 UTC |
| Conferência de dados de produção | disabled_manually | workflow_dispatch |
| Backup do D1 (diário) | disabled_manually | cron `40 3 * * *` + dispatch |
| Apply DB migrations (manual) | active | workflow_dispatch |
| Deploy | active | push + dispatch (suíte só no dispatch) |
| Drift de schema do D1 (semanal) | disabled_manually | cron `25 6 * * 1` |
| SLO de produção (6h) | disabled_manually | cron `15 */6 * * *` |
| Sonda externa de produção | active | workflow_dispatch (sem cron) |
| Dependabot Updates | active | dinâmico |

Razão documentada (AGENTS.md ~linha 1056): "desde 15/10/2026 o repositório é privado ... o dono não paga minutos do Actions; os workflows estão desabilitados, não apagados"; o portão é local (`gate/local`) + Workers Builds da Cloudflare.

**DISCREPÂNCIA FACTUAL**: a API do GitHub retorna `visibility: "public"`, `private: false` para o repositório. A premissa "repositório privado, sem minutos" não bate com o estado lido. Em repositório público, minutos de Actions em runners padrão são gratuitos. Verificar com o dono se o repositório foi reaberto (ou se a leitura via proxy é enganosa) ANTES de decidir a fase 3. Se for mesmo público, o argumento de custo desaparece (mas atenção a um repositório público com dados de cliente/segredos: ver 0.8).

### 0.7 Higiene do histórico de commits
Comandos: `git shortlog -sne`, `git log origin/main --format=%s`, `git rev-list --objects --all | git cat-file --batch-check`.

- main: 55 commits na leitura de `git log origin/main` (histórico raso/limitado do worktree; `git rev-list --count --all` = 835 em todas as refs). 0 merge commits: histórico linear, squash policy confirmada. 55/55 terminam em `(#NNN)`.
- Conventional commits: 53 de 55 (96%) seguem `tipo(escopo): ...`. 2 fora do padrão (ambos em português livre: "Achados do Codex no #544 ...", "Órgãos públicos estruturados ... (#544)").
- Autoria (`git shortlog -sne origin/main`): Ricardo Esper (noreply do GitHub) 54, dependabot 1. Em todas as refs (`git log --all`): Ricardo Esper 657 + 1 com e-mail diferente (o e-mail pessoal do dono), resper1965 4 (mesmo e-mail noreply), Claude (noreply@anthropic.com) 149, dependabot 24. Inconsistência menor: 1 commit com e-mail o e-mail pessoal do dono e o nome "resper1965" vs "Ricardo Esper". Corrigir só se o dono quiser, e apenas via `.mailmap` (não reescreve histórico).
- Arquivos grandes: maior blob no histórico = `docs/openapi.json` (~1,25 MB, várias revisões, 15 maiores são todas versões dele). Nada de binário grande, nada acima de ~1,3 MB. Tamanho do `.git`: não conferido (worktree usa arquivo `.git`). Não há justificativa de tamanho para filter-repo.
- Arquivos rastreados: 1835. `docs/arquivo/` tem 93 arquivos.

### 0.8 Varredura de segredos (apenas grep, valores NÃO impressos)
Comando: `git grep -nIE '<padrões AKIA/ghp_/github_pat_/sk-/xox/BEGIN PRIVATE KEY>'` e padrão genérico `(api_key|secret|token|password)\s*[:=]\s*"<24+ chars>"`.

- Padrões de token/chave conhecidos: 1 ocorrência, `docs/arquivo/arrumacao/inventario-github.md:6`, é texto ("Nenhum segredo aparente: sem ... PRIVATE KEY"): falso positivo.
- Padrão genérico: `frontend/test/proposta-publica.test.js:11` e `test/reset-primeiro-acesso.test.ts:34`: constantes de fixture de teste, falso positivo provável (não validado contra uso real).
- `git log --all -S'BEGIN PRIVATE KEY'` retorna 2 commits (c8c14ab, e9db819): são commits que mencionam a string em texto/teste (não abri o conteúdo). Revisar manualmente esses 2 antes de afirmar "limpo".
- Arquivos sensíveis rastreados (.env, .dev.vars, *.pem, *.key, *.sqlite, *.db): nenhum. `docs/export-public-key.json` é chave pública (esperado).
- Resultado: nenhum segredo real encontrado por grep simples. Limite: grep simples não substitui secret scanning (bloqueado, não conferido).

### 0.9 .gitignore
- Ignorados: `.env`, `.dev.vars`, logs (`*.log`), coverage.
- NÃO cobertos: `.superpowers` (diretório de scratch das skills), `scratch`, `.wrangler`, `node_modules` (a checagem `git check-ignore` em caminho inexistente é inconclusiva para estes dois últimos: confirmar na raiz do clone do dono). 
- Logs versionados: `scripts/fixtures-zeek*/*.log` (6+ arquivos): são fixtures intencionais; o ignore `*.log` não os atinge por já estarem rastreados. Aceitável.

### 0.10 Docs obsoletos
`docs/arquivo/` (14 arquivos de topo, 68 em `planos/`, 6 em `specs/`, + READINESS, avaliações de 14/10 e 20/10, equalização) já é o arquivo morto. `docs/superpowers/specs` (42) e `plans` (7). `docs/estado-2026-11-05.md` e docs/design/diagnostico-2026-10-14|15 são fotos datadas. Sem ação destrutiva: o git guarda tudo; só mover/indexar se o dono quiser.

### 0.11 Configurações do repositório
- `delete_branch_on_merge`: true. Merge methods: squash, merge commit e rebase todos permitidos (`allow_squash_merge/allow_merge_commit/allow_rebase_merge` true), `allow_auto_merge` true. Como a main é linear por política, desabilitar merge commit e rebase alinharia a configuração à prática.
- Branch protection clássica (`/branches/main/protection`): 403, não conferido.
- Ruleset ativo "main protegida" (lido): bloqueia deletion e non_fast_forward (force push); exige PR (0 aprovações, resolução de threads não exigida, merge methods merge/squash/rebase); exige status `gate/local` com `strict_required_status_checks_policy: true` (branch em dia). Ou seja, a reescrita do histórico da main já é impedida pelo próprio ruleset.
- Arquivos de governança presentes: `.github/CODEOWNERS` (`* @resper1965`), `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE`, `CONTRIBUTING.md`, `SECURITY.md`, `dependabot.yml` (mensal, 5 PRs, grupos).
- Issues abertas: 7 (`open_issues_count`, inclui PRs abertos: 4 PRs + 3 issues; não detalhado).

## Plano por fases (ordem de risco)

Convenção: "Dono" = comando na máquina/conta do dono; "Claude" = a sessão pode executar quando o dono autorizar. Nada abaixo foi executado.

### Fase 1 — Segura (GitHub, reversível quando indicado)

| # | Ação | Comando | Quem | Reversível | Autorização |
|---|---|---|---|---|---|
| 1.1 | Apagar 1 branch merged hoje: `claude/friendly-ptolemy-1d3lrq` | `gh api -X DELETE repos/resper1965/n.360/git/refs/heads/claude/friendly-ptolemy-1d3lrq` ou `git push origin --delete claude/friendly-ptolemy-1d3lrq` | Dono | Sim (recria-se pelo SHA; anotar antes: `git rev-parse origin/claude/friendly-ptolemy-1d3lrq`) | OK explícito do dono |
| 1.2 | `claude/awesome-cray-r78x5a`: todos os PRs merged, mas a branch está 632 commits "à frente" (pré-squash). Apagar após conferir `git diff origin/main...origin/claude/awesome-cray-r78x5a --stat` | `git push origin --delete claude/awesome-cray-r78x5a` | Dono | Sim (pelo SHA) | OK explícito |
| 1.3 | Fechar PRs/branches stale sem PR e com PR fechado (20 branches da tabela 0.1), em lotes. Salvar lista de SHAs antes: `git for-each-ref refs/remotes/origin --format='%(objectname) %(refname:short)' > shas-branches.txt` (guardar fora do repo) | `git push origin --delete <branch> [<branch> ...]` | Dono | Sim enquanto o SHA estiver anotado (e o GitHub guarda refs por tempo limitado) | OK explícito, em especial `n-ot/*` e `chore/ship-juncao*` (único registro do trabalho original) |
| 1.4 | Fechar PRs dependabot obsoletos após a fase 2 (ver abaixo) | `gh pr close 587 -c "<motivo>"` | Dono ou Claude | Sim (reabrir PR) | OK |
| 1.5 | `delete_branch_on_merge` | já `true`; nenhuma ação | n/a | n/a | n/a |
| 1.6 | Alinhar merge methods à política linear: desabilitar merge commit e rebase | `gh api -X PATCH repos/resper1965/n.360 -F allow_merge_commit=false -F allow_rebase_merge=false` (o ruleset ainda lista os 3 métodos: editar também em Settings > Rules) | Dono | Sim | OK; opcional |

### Fase 2 — Dependências e segurança
1. Ler os 11 alertas: `gh api 'repos/resper1965/n.360/dependabot/alerts?state=open' --jq '.[]|[.security_advisory.severity,.dependency.package.name,.security_advisory.ghsa_id,.security_vulnerability.first_patched_version.identifier]|@tsv'` (precisa de token com escopo `security_events`/Dependabot alerts; o do Claude deu 403). Quem: Dono.
2. #587/#588 (hono): passar o gate local e mergear, em PR único idealmente alinhando a mesma versão (4.13.18) na raiz e em `mcp-server-niso`. Se o 4.13.16 for superado, fechar #587 e pedir ao Dependabot `@dependabot recreate`. Quem: Claude prepara, dono autoriza o merge. Reversível: sim (revert PR).
3. Os bumps que o dependabot abriu para `fast-uri`, `ip-address`, `body-parser`, `@hono/node-server` foram fechados sem merge: conferir se os alertas abertos referem esses pacotes; se sim, atualizar via `npm update <pacote>` num PR de "segurança" único. Quem: Claude (com gate local). Reversível: sim.
4. Aplicar a regra: alerta de segurança ignora a agenda mensal; abrir PR manual quando houver alerta high.

### Fase 3 — Backup e workflows (decisão do dono)
Fato: o "Backup do D1 (diário)" está desabilitado, então HOJE não há backup automático do D1 além do manual pré-migração (AGENTS.md: backup pelo terminal antes do merge). O próprio arquivo explica por que o backup é um workflow e não um cron Worker: o binding D1 não expõe export, só o CLI `wrangler d1 export`.

Estimativa de custo do backup diário: 1 execução/dia, ~3 a 5 min (checkout + setup-node com cache + `npm ci` + export + verificação) => ~30 dias x 3-5 min = 90 a 150 min/mês (estimativa, não medido; não consegui ler a duração real das execuções). Planos privados: o Free dá 2.000 min/mês, Pro 3.000 (Linux, 1x). Ou seja, só o backup consome ~5-8% da franquia gratuita. (Valores de franquia: conhecimento geral, não conferido nesta sessão.)

Recomendação por workflow:
- Backup do D1: reabilitar SÓ este (`gh workflow enable "Backup do D1 (diário)"`) se a franquia do plano cobrir, ou, se o repo é de fato público, sem custo. Alternativa sem Actions: Cloudflare Cron Worker não exporta D1 por binding; usar D1 Time Travel (restauração pontual, nativa e sem minutos: `wrangler d1 time-travel info niso-db`) como rede de segurança e um cron na máquina do dono com `wrangler d1 export niso-db --remote --output ...`. Quem: Dono (reversível: sim).
- Drift de schema (semanal, ~1 execução curta): reabilitar junto se o backup voltar (~20 min/mês, estimativa).
- SLO a cada 6h (120 execuções/mês, ~1 min cada = ~120 min/mês): manter desabilitado; considerar a sonda externa por cron-job externo (UptimeRobot/Cloudflare Health Checks).
- Uptime (só dispatch): manter ativo, sem custo.
- CI e CodeQL: manter desabilitados enquanto `gate/local` + Workers Builds cobrirem; CodeQL semanal (~1x/semana, ~10 min) é barato e recomendado se houver minutos, pois cobre SAST que o gate local não cobre.
- Conferência de dados (dispatch, só leitura): manter.
- db-migrate e deploy: manter ativos, são manuais.
- Se o repositório é realmente público: reabilitar backup, drift e CodeQL (custo zero de minutos).

### Fase 4 — Convenções
O repositório já tem CONTRIBUTING.md, SECURITY.md, CODEOWNERS e pull_request_template.md. O que falta/pode melhorar:
1. Um trecho em CONTRIBUTING.md sobre commit message: `tipo(escopo): resumo (#PR)` em português, tipos permitidos (feat, fix, docs, chore, refactor, test, ci, perf), squash com título do PR em padrão. Conformidade atual 96% (53/55): só formalizar. Quem: Claude (PR de docs). Reversível: sim.
2. `.mailmap` para unificar o e-mail pessoal do dono / "resper1965" / "Ricardo Esper" (não reescreve histórico). Quem: Claude. Reversível: sim.
3. `.gitignore`: acrescentar `.superpowers/`, `scratch/`, `.wrangler/`. Quem: Claude. Reversível: sim.
4. Política de branches: apagar após merge (já automático), e cada branch ligado a um PR; reaproveitar um mesmo branch para dezenas de PRs (ex.: 29 PRs em `claude/friendly-ptolemy-1d3lrq`) dificulta o rastreio.
5. Publicar release para v11.0.0 e definir critério de tag (por onda?): `gh release create v11.0.0 --generate-notes --verify-tag`. Quem: Dono. Reversível: sim (excluir release).

### Fase 5 — Opcional / destrutiva (recomendo CONTRA)
Reescrever histórico (`git filter-repo`, `git push --force`, BFG) não é recomendado: não achei segredo real nem arquivo grande (maior blob 1,25 MB) e o histórico da main é linear e já protegido por ruleset (sem force push nem deleção); reescrever invalidaria SHAs de ~835 commits, 563 PRs, 6 tags/5 releases e o `gate/local` gravado por commit. Só reconsiderar se o dono achar um segredo real (então: revogar o segredo primeiro, depois filter-repo, com backup espelho `git clone --mirror`, desbloqueio temporário do ruleset e autorização explícita; irreversível para os clones existentes).

## Decisões do dono
1. O repositório é público ou privado? A API diz público; AGENTS.md diz privado. Muda toda a fase 3.
2. Autoriza apagar os branches (lista 1.1-1.3)? Incluindo `n-ot/*` e `chore/ship-juncao*`?
3. Quer reabilitar o workflow de backup diário do D1 (e drift/CodeQL), ou prefere backup manual/Time Travel?
4. Quem lê os 11 alertas do Dependabot e autoriza o PR de atualização de segurança (hono e demais)?
5. Desabilitar merge commit e rebase nas configurações (alinhar à política squash)?
6. Publicar o release v11.0.0 e adotar critério de tag?
7. Aprova o PR de convenções (.mailmap, .gitignore, trecho de CONTRIBUTING)?
8. Confirma: sem reescrita de histórico (fase 5 descartada).

## Não conferido
Alertas do Dependabot (403), secret scanning (proxy), branch protection clássica (403), mergeable de #587/#588 (unknown), checks dos PRs abertos (status pending, sem contextos), duração real das execuções de Actions, tamanho do `.git`, conteúdo dos 2 commits que citam "BEGIN PRIVATE KEY", as 3 issues abertas, franquia de minutos do plano.
