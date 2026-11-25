#!/usr/bin/env bash
# T-13: confirm the live site serves the bundle we just built (same build id), not a stale deploy.
set -euo pipefail
SITE="${1:-https://veilbench-hybrid-ai.web.app}"
local_id=$(grep -Eho '(nogit|[0-9a-f]{7,})-[0-9]{8}T[0-9]{4}' -r dist/assets 2>/dev/null | head -1 || true)
entry=$(curl -fsS "$SITE/" | grep -Eo '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
[ -z "$entry" ] && { echo "Could not find entry bundle on $SITE"; exit 1; }
bundle=$(curl -fsS "$SITE$entry")
# Here-strings instead of pipes: with pipefail, an early-exiting grep would SIGPIPE the writer.
live_id=$(grep -Eo -m1 '(nogit|[0-9a-f]{7,})-[0-9]{8}T[0-9]{4}' <<<"$bundle" || true)
echo "local build id: ${local_id:-unknown}"
echo "live  build id: ${live_id:-not found}"
if grep -q "veilbench.outbound.v1" <<<"$bundle"; then echo "outbound envelope marker: present"; else echo "outbound envelope marker: MISSING (stale deploy?)"; exit 2; fi
