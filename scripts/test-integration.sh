#!/usr/bin/env bash
# Starts (or rebuilds) the docker-compose stack, waits until every service is
# healthy, then runs the integration suite in tests/ against it.
# The stack is left running for fast re-runs; stop it with `npm run stack:down`.
set -euo pipefail
cd "$(dirname "$0")/.."

# Tests read the same overrides as docker-compose.
if [[ -f .env ]]; then set -a; source .env; set +a; fi

docker compose up -d --build --wait
npm test --prefix tests -- "$@"
