# Runbook de publicação — n.360

Como o código sai da `main` para `https://n360.ness.com.br`, o que fazer quando o GitHub Actions não
roda, e o que muda quando o repositório ficar privado. Incidente em produção é o
[`runbook-incidente.md`](runbook-incidente.md); restauração de banco, o [`backups/README.md`](../backups/README.md).

## 1. Publicação normal (pelo Actions)

1. PR para a `main`. O CI (`.github/workflows/ci.yml`) roda **só em `pull_request`**: `tsc`, a suíte do Worker e a
   do frontend com cobertura, o build, o E2E em Chromium e o `npm audit` (informativo). Push novo no PR cancela a
   execução anterior. O ruleset exige os checks **`test`** e **`e2e`** verdes, com a branch em dia com a base.
2. Squash-merge na `main` dispara o **Deploy** (`deploy.yml`): `npm ci`, `tsc --noEmit`, build do frontend,
   **recusa se houver migration pendente**, `wrangler deploy --var VERSAO_SHA:<sha>`. A suíte **não** roda de
   novo aqui: ela já passou no PR, sobre a mesma árvore (branch em dia + squash).
3. Disparo manual do Deploy (aba Actions, *Run workflow*) roda **também** a suíte do Worker e a do frontend antes
   de publicar: é o caminho de hotfix e de re-run depois de migration, sem PR por trás.
4. Conferir: `curl -s https://n360.ness.com.br/health` devolve `"version":"<sha do merge>"`.

Falha do Deploy abre (ou atualiza) uma issue com o rótulo `deploy-failure`, que fecha sozinha no próximo verde.

## 2. Com migration nova

O Deploy recusa publicar com migration pendente, de propósito. Duas ordens possíveis (detalhe em
[`migrations/README.md`](../migrations/README.md)):

- **Antes do merge, pelo terminal**: `npm run db:backup`, conferir o dump, `npx wrangler d1 migrations apply
  niso-db --remote`, `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply"), e só
  então mergear.
- **Depois do merge, pelo Actions**: o Deploy falha e abre issue; rodar *Apply DB migrations* (digitar `APLICAR`;
  faz backup e aplica) e depois disparar o *Deploy* à mão.

O ambiente `production` só aceita a `main`, então o *Apply DB migrations* só enxerga a migration depois do merge.

## 3. Plano B: publicar da máquina do dono

Para o dia em que o Actions não rodar (minutos do plano esgotados, GitHub fora, workflow quebrado).
`scripts/publicar.sh` repete os passos do `deploy.yml`, com a suíte inteira como portão:

```bash
scripts/publicar.sh --dry-run   # imprime os passos, não executa nada
scripts/publicar.sh             # publica (pede "PUBLICAR" antes do deploy)
```

O que ele faz, na ordem, parando no primeiro erro:

1. Confere árvore limpa, branch `main` e `main` igual à `origin/main` (publica-se só o que todo mundo enxerga).
2. `npm ci`, `tsc --noEmit`, suíte do Worker com cobertura, build e suíte do frontend com cobertura.
3. Lista as migrations pendentes em produção (só leitura) e **para** se houver alguma: migration só pela seção 2.
4. `npx wrangler deploy --var VERSAO_SHA:<sha>` — o mesmo comando do `deploy.yml`.
5. Confere que `/health` devolve o SHA em `n360.ness.com.br` e em `niso.ness.com.br`.

Pré-requisitos: Node 22, bash (Git Bash no Windows), e o wrangler autenticado (`npx wrangler login`, ou
`CLOUDFLARE_API_TOKEN` exportado na sessão, nunca em arquivo). O E2E em Chromium não roda no script: se a mudança
tocou casca, menu ou navegação, rode `cd frontend && npm run test:e2e` antes.

## 4. Rollback

Reverter o código é reverter o commit de squash e mergear (o Deploy republica). Sem Actions, `scripts/publicar.sh`
depois do revert na `main`. Urgência sem repositório: `npx wrangler rollback` (volta o código, não o banco). Detalhe
e cuidados com migration na seção 2 do [`runbook-incidente.md`](runbook-incidente.md#2-deploy-ruim--reverter).

## 5. O que muda com o repositório privado

Em repositório privado o GitHub cobra minuto de Actions acima da franquia do plano, o code scanning exige GitHub
Advanced Security e rulesets exigem plano pago. O que já foi ajustado no código:

| Item | Antes | Agora |
|---|---|---|
| CI | `pull_request` e `push` na `main` | só `pull_request`, com cancelamento da execução superada |
| Deploy | suíte inteira a cada merge | suíte só no disparo manual; no merge, `tsc` + build + checagem de migration |
| CodeQL | push, PR e semanal | o job se pula sozinho em repositório privado (`if: github.event.repository.private == false`) |
| Sonda externa (`uptime.yml`) | a cada 15 min | só manual; vigilância contínua no monitor externo e na sonda interna do Worker |

`test/workflows-economia.test.ts` reprova a volta do `push` no CI, do `schedule` na sonda e da suíte no deploy
automático.

**No lugar do CodeQL**, sem serviço novo: `npm audit --audit-level=high` nos três pacotes, já no CI (informativo);
o Dependabot (`.github/dependabot.yml`), que funciona em repositório privado; e o secret scanning do GitHub, conforme
o plano contratado.

### Orçamento de minutos

Medido em 13/10/2026 sobre as últimas execuções com sucesso (minutos cobrados = soma dos jobs, cada um arredondado
para cima):

```bash
for w in ci.yml deploy.yml codeql.yml uptime.yml slo.yml db-backup.yml schema-drift.yml; do
  for id in $(gh run list --workflow $w --status success --limit 5 --json databaseId --jq '.[].databaseId'); do
    gh run view $id --json event,jobs --jq '"'$w' \(.event) \([.jobs[] | select(.conclusion!="skipped")
      | (((.completedAt|fromdateiso8601)-(.startedAt|fromdateiso8601))/60|ceil)] | add)"'
  done
done
```

| Por PR mergeado | Antes | Depois |
|---|---|---|
| CI no PR (por push no PR) | ~14 | ~14 |
| CI no push da `main` | ~12 | 0 |
| Deploy | ~14 | ~4 (estimado: `npm ci`, `tsc`, build, migration, deploy) |
| CodeQL (PR + push) | ~5 | 0 no privado |
| **Total** | **~45-50** | **~18** |

| Por mês | Antes | Depois |
|---|---|---|
| `uptime.yml` (96 execuções/dia × 1 min) | ~2.900 | 0 |
| `slo.yml` (4/dia × 1 min) | ~120 | ~120 |
| `db-backup.yml` (1/dia × 1 min) | ~30 | ~30 |
| `schema-drift.yml` (semanal × 1 min) | ~4 | ~4 |
| CodeQL semanal (~3 min) | ~13 | 0 no privado |

Para medir o consumo do mês: *Settings → Billing and plans → Usage* da conta dona do repositório, ou
`gh api /users/resper1965/settings/billing/usage` (o endpoint varia com o tipo de conta; a tela é a fonte).

### Checklist do dono para tornar o repositório privado

Nada disto está em código: é configuração do GitHub, do dono.

1. **Plano**: conta com rulesets em repositório privado (GitHub Pro para conta pessoal, ou Team para organização).
   Sem ele o ruleset "main protegida" deixa de valer e a `main` aceita push direto.
2. **Ruleset**: depois de mudar a visibilidade, conferir `gh api repos/resper1965/n.360/rulesets/20312002`. Continuar
   exigindo **`test` e `e2e`**, PR, branch em dia, sem deleção nem force-push. **Não** exigir `CodeQL`.
3. **CodeQL**: nada a fazer no workflow (ele se pula). Se o *default setup* de code scanning estiver ligado em
   *Settings → Code security*, desligar.
4. **Secret scanning e push protection**: ligar em *Settings → Code security* se o plano oferecer em privado.
5. **Dependabot**: conferir que *Dependabot alerts* e *security updates* continuam ligados.
6. **Environment `production`**: conferir que segue aceitando só a `main`
   (`gh api repos/resper1965/n.360/environments/production/deployment-branch-policies`) e que o
   `CLOUDFLARE_API_TOKEN` continua como environment secret (`gh api repos/resper1965/n.360/environments/production/secrets`).
7. **Monitor externo**: ligar antes de tudo (passo a passo na seção 1 do [`runbook-incidente.md`](runbook-incidente.md)),
   porque a sonda do Actions já não roda sozinha.
8. **`ALERTA_EMAIL`**: pôr o endereço de operação em `vars` do `wrangler.jsonc` (a linha comentada já está lá), para
   a sonda interna mandar e-mail. Sem ela, só log.
9. **Orçamento**: em *Settings → Billing → Spending limits*, definir limite de gasto de Actions (zero = para na
   franquia; o plano B da seção 3 cobre o deploy até o mês virar).
10. Depois de privado, rever a seção "Portões de revisão" do `AGENTS.md`.
