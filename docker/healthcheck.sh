#!/bin/sh
set -e
PORT="${HTTP_PORT:-3000}"
node -e "fetch('http://localhost:${PORT}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
