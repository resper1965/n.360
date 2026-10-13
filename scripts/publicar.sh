#!/usr/bin/env bash
#
# Plano B de publicação: os passos do `.github/workflows/deploy.yml`, na máquina do dono.
#
# Caminho oficial para o dia em que o GitHub Actions não rodar (minutos do plano esgotados,
# GitHub fora do ar, workflow quebrado). O caminho normal continua sendo o merge na `main`,
# que dispara o Deploy. Runbook: docs/runbook-publicacao.md.
#
# O que este script NÃO faz, de propósito: aplicar migration. Ele só a lista e PARA se houver
# pendente — migration em produção exige backup verificado antes (backups/README.md), e o
# procedimento está em docs/runbook-publicacao.md e migrations/README.md.
#
# Uso:
#   scripts/publicar.sh --dry-run   # só imprime os passos; não executa nada
#   scripts/publicar.sh             # publica de verdade (pede confirmação antes do deploy)
#
# Pré-requisitos: Node 22, bash (Git Bash serve no Windows), curl, e o wrangler autenticado na
# conta da Cloudflare (`npx wrangler login`, ou CLOUDFLARE_API_TOKEN no ambiente — nunca em
# arquivo versionado).

set -euo pipefail

SECO=0
case "${1:-}" in
  --dry-run) SECO=1 ;;
  "") ;;
  *) echo "uso: $0 [--dry-run]" >&2; exit 2 ;;
esac

# Sempre a partir da raiz do repositório, de onde quer que seja chamado.
cd "$(git rev-parse --show-toplevel)"

DOMINIOS=(https://n360.ness.com.br https://niso.ness.com.br)

# Imprime o passo e, fora do modo seco, executa. `eval` porque alguns passos têm pipe e `cd`.
passo() {
  echo
  echo "==> $1"
  echo "    \$ $2"
  [ "$SECO" -eq 1 ] && return 0
  eval "$2"
}

falhar() { echo "::erro:: $*" >&2; exit 1; }

# 1. Árvore limpa, na `main`, igual à origin. Publica-se o que está na `main` remota, nada além:
#    é isso que mantém o /health apontando para um commit que todo mundo enxerga.
passo "Conferir árvore limpa" '[ -z "$(git status --porcelain)" ] || falhar "há mudança não commitada; publique só o que está na main"'
passo "Conferir branch main" '[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || falhar "não está na main"'
passo "Buscar origin/main" 'git fetch origin main --quiet'
passo "Conferir main = origin/main" '[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || falhar "main local diferente da origin/main; rode git pull --ff-only (e nunca publique commit que não está na origin)"'

SHA=$(git rev-parse HEAD)
echo
echo "Commit a publicar: $SHA"

# 2. O mesmo portão do deploy manual do workflow: tipos, suíte do Worker, build e suíte do frontend.
passo "Instalar dependências (raiz)" 'npm ci'
passo "TypeScript" 'npx tsc --noEmit'
passo "Suíte do Worker (com cobertura)" 'npm run test:coverage'
passo "Build do frontend" '(cd frontend && npm ci && npm run build)'
passo "Suíte do frontend (com cobertura)" '(cd frontend && npm run test:coverage)'

# 3. Migration pendente: lista e PARA. Mesma regra e mesmo texto que o deploy.yml procura.
passo "Migrations pendentes em produção (só leitura)" '
  saida=$(npx wrangler d1 migrations list niso-db --remote 2>&1 | tee /dev/stderr)
  echo "$saida" | grep -q "No migrations to apply" || falhar "há migration pendente em produção. Pare aqui: backup (npm run db:backup), aplicar pelo runbook (docs/runbook-publicacao.md), e só então rode este script de novo."'

# 4. Publicar. Mesmo comando do deploy.yml (`deploy --var VERSAO_SHA:<sha>`): é o SHA que
#    faz o /health dizer qual código está no ar.
if [ "$SECO" -eq 0 ]; then
  read -r -p "Publicar $SHA em produção? Digite PUBLICAR: " resposta
  [ "$resposta" = PUBLICAR ] || falhar "cancelado"
fi
passo "Publicar o Worker" "npx wrangler deploy --var VERSAO_SHA:$SHA"

# 5. Conferir o que está no ar, nos dois domínios. Algumas tentativas: a versão nova leva
#    alguns segundos para chegar a todos os pontos da rede.
for base in "${DOMINIOS[@]}"; do
  passo "Conferir $base/health devolve $SHA" '
    ok=0
    for tentativa in 1 2 3 4 5 6; do
      corpo=$(curl -s -m 15 "'"$base"'/health" || true)
      case "$corpo" in *"\"version\":\"'"$SHA"'\""*) ok=1; break ;; esac
      sleep 10
    done
    [ "$ok" -eq 1 ] || falhar "'"$base"'/health não devolveu a versão '"$SHA"'; veja docs/runbook-incidente.md, seção 2"'
done

echo
if [ "$SECO" -eq 1 ]; then
  echo "Modo --dry-run: nada foi executado."
else
  echo "Publicado: $SHA"
fi
