#!/usr/bin/env bash
# Build command único do Workers Builds: a main publica, as outras branches só verificam.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
if [ "${WORKERS_CI_BRANCH:-}" = "main" ]; then
  exec bash "$dir/publicar.sh"
fi
exec bash "$dir/verificar.sh"
