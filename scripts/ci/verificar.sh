#!/usr/bin/env bash
# Portão de PR no Workers Builds (Cloudflare): build command das builds de branch que não é a main.
# Substitui os jobs `test` e `e2e` do GitHub Actions, que deixaram de rodar com o repositório privado.
# O Workers Builds já instalou as dependências da raiz antes de chamar este script.
# E2E: a imagem do Workers Builds não tem as bibliotecas de sistema do Chromium (libatk etc., sem root para
# instalar), então lá o E2E não roda: ele roda na máquina de quem mergeia (`cd frontend && npm run test:e2e`).
# Fora do Workers Builds, ou com E2E=1, o E2E roda aqui também.
set -euo pipefail

echo "== Tipos"
npx tsc --noEmit

echo "== Frontend: build e testes"
(cd frontend && npm ci --include=dev && npm run build && npm test)

echo "== Servidor MCP: build"
(cd mcp-server-niso && npm ci && npm run build)

echo "== Backend: testes"
npx vitest run

if [ "${WORKERS_CI:-0}" = "1" ] && [ "${E2E:-0}" != "1" ]; then
  echo "== E2E não roda no Workers Builds (sem bibliotecas do Chromium): rode localmente antes do merge"
else
  echo "== E2E (Chromium)"
  (cd frontend && npx playwright install chromium && npm run test:e2e)
fi

echo "Verificação concluída."
