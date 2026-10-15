#!/usr/bin/env bash
# Portão de PR no Workers Builds (Cloudflare): build command das builds de branch que não é a main.
# Substitui os jobs `test` e `e2e` do GitHub Actions, que deixaram de rodar com o repositório privado.
# O Workers Builds já instalou as dependências da raiz antes de chamar este script.
# PULAR_E2E=1 (variável de build) pula o e2e se o ambiente não conseguir subir o Chromium.
set -euo pipefail

echo "== Tipos"
npx tsc --noEmit

echo "== Frontend: build e testes"
(cd frontend && npm ci --include=dev && npm run build && npm test)

echo "== Servidor MCP: build"
(cd mcp-server-niso && npm ci && npm run build)

echo "== Backend: testes"
npx vitest run

if [ "${PULAR_E2E:-0}" = "1" ]; then
  echo "== E2E pulado (PULAR_E2E=1)"
else
  echo "== E2E (Chromium)"
  (cd frontend && npx playwright install chromium && npm run test:e2e)
fi

echo "Verificação concluída."
