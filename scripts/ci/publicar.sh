#!/usr/bin/env bash
# Build de produção no Workers Builds (Cloudflare): build command da branch main.
# Mesmas garantias do antigo deploy.yml: tipos, build do frontend e recusa com migration pendente.
# O deploy em si é o deploy command do Workers Builds:
#   npx wrangler deploy --var VERSAO_SHA:$WORKERS_CI_COMMIT_SHA
# A suíte já rodou no PR, sobre a mesma árvore (portão de PR em scripts/ci/verificar.sh).
set -euo pipefail

echo "== Tipos"
npx tsc --noEmit

echo "== Frontend: build"
(cd frontend && npm ci --include=dev && npm run build)

echo "== Migrations pendentes em produção"
saida=$(npx wrangler d1 migrations list niso-db --remote 2>&1) || { echo "$saida"; echo "Não foi possível listar as migrations (token sem acesso ao D1?)."; exit 1; }
echo "$saida"
if ! echo "$saida" | grep -q "No migrations to apply"; then
  echo "Há migration não aplicada em produção. Faça o backup (wrangler d1 export), aplique com"
  echo "'npx wrangler d1 migrations apply niso-db --remote' e dispare a build de novo (Retry build)."
  exit 1
fi

echo "Build de produção pronta para o deploy."
