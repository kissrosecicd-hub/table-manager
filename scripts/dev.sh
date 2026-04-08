#!/usr/bin/env bash
set -euo pipefail

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PORT="${PORT:-3000}"
BROWSER="${BROWSER:-}"
URL="http://localhost:${PORT}"

echo "🚀 Starting Table Manager on ${URL}"

# Start Next.js in background (no pipe — pipes kill process tree when reader exits)
PORT=${PORT} npx next dev --port "${PORT}" > /tmp/table-manager-dev.log 2>&1 &
NEXT_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server..."
for i in $(seq 1 30); do
  if nc -z localhost "${PORT}" 2>/dev/null; then
    echo "✅ Server ready on port ${PORT}"
    break
  fi
  sleep 1
done

# Open browser
if [ -n "${BROWSER}" ]; then
  if command -v "${BROWSER}" &>/dev/null; then
    echo "🌐 Opening ${BROWSER}..."
    "${BROWSER}" "${URL}" &>/dev/null &
  else
    echo "⚠️  Browser '${BROWSER}' not found, trying xdg-open..."
    xdg-open "${URL}" &>/dev/null 2>&1 || open "${URL}" &>/dev/null 2>&1 || true
  fi
else
  if command -v xdg-open &>/dev/null; then
    xdg-open "${URL}" &>/dev/null 2>&1 || true
  elif command -v open &>/dev/null; then
    open "${URL}" &>/dev/null 2>&1 || true
  fi
fi

echo "📝 Logs: tail -f /tmp/table-manager-dev.log"
echo "🔧 PID: ${NEXT_PID}"

# Wait for Next.js process
wait ${NEXT_PID}
