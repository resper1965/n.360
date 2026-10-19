#!/usr/bin/env bash
# Publica um PR de ponta a ponta: atualiza com a main, roda o portão local, mergeia (squash) e espera o /health mostrar o SHA.
#
#   bash scripts/ci/ship.sh <numero-do-pr>
#
# Funciona para qualquer PR (inclusive de bot). Roda num worktree fixo ($GATE_WT, padrão ~/worktrees/ship), reaproveitado de um
# PR para o outro: o node_modules fica (o gate só reinstala quando o package-lock muda).
# Migration pendente: aplique ANTES (backup + `wrangler d1 migrations apply`); o build de produção recusa o deploy.
set -uo pipefail
PR=${1:?uso: ship.sh <numero-do-pr>}
REPO=${GATE_REPO:-resper1965/n.360}
URL=${GATE_HEALTH:-https://n360.ness.com.br/health}
RAIZ=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
cd "$RAIZ"

echo "== PR $PR: atualizar com a main"
gh pr update-branch "$PR" >/dev/null 2>&1
BR=$(gh pr view "$PR" --json headRefName -q .headRefName) || exit 1
# Conflito com a main: parar ANTES do portão (antes rodava 30 min sobre a versão velha e o merge era recusado no fim).
for i in 1 2 3 4 5 6; do
  estado=$(gh pr view "$PR" --json mergeable -q .mergeable)
  [ "$estado" != UNKNOWN ] && break; sleep 5
done
[ "$estado" = CONFLICTING ] && { echo "PR $PR: conflito com a main. Resolva na branch e rode de novo; nada foi testado."; exit 1; }
git fetch -q origin "$BR" main

# Worktree fixo, sem junção (uma junção fazia o `worktree remove --force` apagar o node_modules da raiz) e sem remover no fim.
# `git clean` sem -x preserva o que o .gitignore cobre (node_modules, dist).
WT=${GATE_WT:-$HOME/worktrees/ship}
[ -e "$WT/.git" ] || git worktree add -q --detach "$WT" "origin/$BR" || exit 1
cd "$WT"
git checkout -q -f --detach "origin/$BR" && git clean -fdq || exit 1

SHA=$(git rev-parse HEAD); echo "== PR $PR em ${SHA:0:10} ($BR)"
bash scripts/ci/gate.sh || { echo "PR $PR: o portão não passou; nada foi mergeado."; exit 1; }

echo "== Merge"
gh pr merge "$PR" --squash || { echo "PR $PR: merge recusado (veja a regra da main)."; exit 1; }
sleep 10
M=$(gh pr view "$PR" --json mergeCommit -q .mergeCommit.oid); echo "merge $M"
for i in $(seq 1 60); do
  v=$(curl -s "$URL" | grep -o '"version":"[^"]*"')
  echo "$v" | grep -q "$M" && { echo "producao: $v"; exit 0; }
  sleep 20
done
echo "PR $PR: o deploy não apareceu no /health em 20 min (veja o build na Cloudflare)."; exit 1
