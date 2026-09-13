#!/usr/bin/env bash
#
# Run the e2e-live journeys against a freshly seeded backend.
#
#   bash frontend/scripts/run-e2e-live.sh
#
# Boots FastAPI on :8000 against a throwaway SQLite database, waits for
# /health, then runs the `e2e-live` vitest project with MSW disabled. Fails
# (never skips) if the backend does not come up. The server is stopped on exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

PORT="${PORT:-8000}"
DB_DIR="${DB_DIR:-$(mktemp -d /tmp/hospital-e2e-live.XXXXXX)}"
export DATABASE_PATH="${DATABASE_PATH:-$DB_DIR/e2e-live.db}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:$PORT}"
export NEXT_PUBLIC_API_MOCK=off
export E2E_LIVE=1

BACKEND_LOG="$DB_DIR/e2e-live-backend.log"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Seeding throwaway database at $DATABASE_PATH"
(
  cd "$BACKEND_DIR"
  python3 -m db.migrate
  python3 -m db.seed
)

echo "Booting API on $NEXT_PUBLIC_API_URL (log: $BACKEND_LOG)"
(
  cd "$BACKEND_DIR"
  exec python3 -m uvicorn app.main:app --port "$PORT"
) >"$BACKEND_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -fs "${NEXT_PUBLIC_API_URL}/health" >/dev/null 2>&1; then
    echo "backend healthy"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "backend exited before becoming healthy" >&2
    cat "$BACKEND_LOG" >&2
    exit 1
  fi
  sleep 1
done

if ! curl -fs "${NEXT_PUBLIC_API_URL}/health" >/dev/null 2>&1; then
  echo "backend did not become healthy in 30s" >&2
  cat "$BACKEND_LOG" >&2
  exit 1
fi

cd "$FRONTEND_DIR"
npx vitest --run --project=e2e-live
