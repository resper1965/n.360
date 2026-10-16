#!/usr/bin/env bash
# Portão de PR, na máquina de quem mergeia: roda TUDO (tipos, build e testes do frontend, build do MCP, testes do backend e o
# E2E) e só então marca o commit com o status `gate/local`, que a regra da `main` exige. Substitui o build de branch do Workers
# Builds, que levava ~14 min, não rodava o E2E e não deixava ler o log por linha de comando.
#
#   bash scripts/ci/gate.sh          # no checkout do PR, árvore limpa; o status vai para o HEAD
#   GATE_SEM_STATUS=1 bash ...       # só roda, sem marcar o commit (uso local)
#
# Uma suíte por vez (nunca duas ao mesmo tempo: a máquina estoura timeout). `--retry=1` repete um teste que falhou uma vez,
# então um flake isolado não derruba o portão, mas o log mostra a repetição. O log inteiro fica em $LOG.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
SHA=$(git rev-parse HEAD)
REPO=${GATE_REPO:-resper1965/n.360}
LOG="${TMPDIR:-${TEMP:-/tmp}}/gate-${SHA:0:10}.log"
: > "$LOG"

[ -z "$(git status --porcelain)" ] || { echo "Árvore suja: o status vale para um commit, commite antes."; exit 2; }

marcar() { # estado descrição
  [ "${GATE_SEM_STATUS:-0}" = "1" ] && return 0
  gh api -X POST "repos/$REPO/statuses/$SHA" -f state="$1" -f context="gate/local" -f description="${2:0:130}" >/dev/null \
    || echo "Aviso: não consegui gravar o status no GitHub."
}

# O local do lock evita dois portões ao mesmo tempo.
LOCK="${TMPDIR:-${TEMP:-/tmp}}/gate.lock"
mkdir "$LOCK" 2>/dev/null || { echo "Outro portão está rodando ($LOCK). Espere ou apague o lock se morreu."; exit 3; }
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

marcar pending "rodando em $(hostname)"
inicio=$(date +%s)
# Roda o vitest. Se ele sair com erro, mas SÓ porque um worker não subiu ('Failed to start forks worker', timeout de carga: todos os
# testes passaram e nenhum falhou), repete apenas esses arquivos, sozinhos. Falha de teste de verdade continua reprovando.
rodar_vitest() { # diretorio args...
  local dir=$1; shift
  local saida; saida=$(mktemp)
  (cd "$dir" && npx vitest run "$@") >"$saida" 2>&1; local rc=$?
  cat "$saida"
  if [ $rc -ne 0 ] && grep -q "Failed to start forks worker" "$saida" && ! grep -qE "^ FAIL |Tests +[0-9]+ failed|[0-9]+ failed" "$saida"; then
    local arquivos; arquivos=$(grep -oE "(test|src)/[^ ]+.test.(js|ts)" "$saida" | sort -u | tr '
' ' ')
    echo ">> worker que não subiu por carga da máquina; repetindo sozinhos: $arquivos"
    (cd "$dir" && npx vitest run $arquivos "$@"); rc=$?
  fi
  rm -f "$saida"; return $rc
}

passo() { # nome comando...
  local nome=$1; shift
  echo "== $nome"
  echo "== $nome" >> "$LOG"
  if ! "$@" >> "$LOG" 2>&1; then
    echo "FALHOU: $nome (log completo: $LOG). Fim do log:"; tail -40 "$LOG"
    marcar failure "falhou: $nome"
    exit 1
  fi
}

passo "Tipos" npx tsc --noEmit
[ -d frontend/node_modules ] || passo "Frontend: instalar" bash -c "cd frontend && npm ci --include=dev"
passo "Frontend: build" bash -c "cd frontend && npm run build"
passo "Frontend: testes" rodar_vitest frontend --maxWorkers=3 --testTimeout=30000 --retry=1
[ -d mcp-server-niso/node_modules ] || passo "MCP: instalar" bash -c "cd mcp-server-niso && npm ci"
passo "MCP: build" bash -c "cd mcp-server-niso && npm run build"
passo "Backend: testes" rodar_vitest . --exclude "nISO/**" --retry=1
passo "E2E (Chromium)" bash -c "cd frontend && npx playwright test --workers=2"

dur=$(( $(date +%s) - inicio ))
marcar success "tipos, testes, build e E2E em $((dur/60)) min"
echo "Portão verde em $((dur/60)) min para ${SHA:0:10}."
