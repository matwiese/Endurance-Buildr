#!/bin/sh
# Start fuer macOS / Linux
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte Node.js 22.13 oder neuer installieren: https://nodejs.org"; exit 1
fi
exec node --disable-warning=ExperimentalWarning server/index.js --open
