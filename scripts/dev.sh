#!/usr/bin/env bash
#
# Bring up the frontend and backend together for local development.
#
#   scripts/dev.sh
#
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000  (docs at /docs)
#
# Both services run in the background; their logs are tailed here.
# Press Ctrl-C to stop both.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"

cleanup() {
  trap - EXIT INT TERM
  echo ""
  echo "Stopping dev services..."
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  echo "Stopped."
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8000 ..."
(
  cd "$ROOT_DIR/backend"
  exec uvicorn app.main:app --port 8000 --reload
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
(
  cd "$ROOT_DIR/frontend"
  exec npm run dev
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

echo "Logs: $BACKEND_LOG"
echo "      $FRONTEND_LOG"
echo "Press Ctrl-C to stop both."

tail -n +1 -f "$BACKEND_LOG" "$FRONTEND_LOG"
