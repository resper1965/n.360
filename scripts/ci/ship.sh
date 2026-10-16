#!/usr/bin/env bash
# Publica um PR de ponta a ponta: atualiza com a main, roda o portão local, mergeia (squash) e espera o /health mostrar o SHA.
#
#   bash scripts/ci/ship.sh <numero-do-pr>
#
# Funciona para qualquer PR (inclusive de bot), sem precisar de worktree: cria um temporário no commit do PR.
# Migration pendente: aplique ANTES (backup + `wrangler d1 migrations apply`); o build de produção recusa o deploy.
set -uo pipefail
PR=${1:?uso: ship.sh <numero-do-pr>}
REPO=${GATE_REPO:-resper1965/n.360}
URL=${GATE_HEALTH:-https://n360.ness.com.br/health}
RAIZ=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
cd "$RAIZ"

echo "== PR $PR: atualizar com a main"
gh pr update-branch "$PR" >/dev/null 2>&1 || echo "(já estava atualizado, ou há conflito: o gate avisa)"
BR=$(gh pr view "$PR" --json headRefName -q .headRefName) || exit 1
git fetch -q origin "$BR" main

WT="${TMPDIR:-${TEMP:-/tmp}}/ship-wt-$PR"
git worktree remove --force "$WT" 2>/dev/null
git worktree add -q --detach "$WT" "origin/$BR" || exit 1
trap 'git -C "$RAIZ" worktree remove --force "$WT" 2>/dev/null' EXIT
cd "$WT"

# Dependências: junção para as da máquina principal (instalar de novo custa minutos).
juntar() { [ -e "$2" ] || [ ! -d "$1" ] || cmd //c "mklink /J $(cygpath -w "$2") $(cygpath -w "$1")" >/dev/null; }
juntar "$RAIZ/node_modules" node_modules
juntar "$RAIZ/frontend/node_modules" frontend/node_modules
juntar "$RAIZ/mcp-server-niso/node_modules" mcp-server-niso/node_modules

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
