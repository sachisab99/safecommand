#!/usr/bin/env bash
#
# resume-workers.sh — scale Railway worker services back to 1 replica
#
# Usage: ./scripts/resume-workers.sh
#
# Run at start of day or before any testing/building session to bring
# scheduler/escalation/notifier back online.
#
# Workers come up in ~60-90 seconds after this completes. Verifies API health
# at the end as a sanity check.
#

set -euo pipefail

ENV_ID="bd7d4903-0756-4dd0-8b55-33fc40a36f3d"
CONFIG_FILE="$HOME/.railway/config.json"
API_HEALTH_URL="https://api-production-9f9dd.up.railway.app/health"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "✗ Railway CLI not authenticated. Run: railway login" >&2
  exit 1
fi

TOKEN=$(python3 -c "import json,os; d=json.load(open(os.path.expanduser('~/.railway/config.json'))); print(d['user']['accessToken'])" 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  echo "✗ Could not read Railway access token from $CONFIG_FILE. Run: railway login" >&2
  exit 1
fi

declare -a SERVICES=(
  "scheduler:19df0688-609d-4226-9c13-1072f4adb571"
  "escalation:899ad603-48cc-4c06-b536-14f51dff99e5"
  "notifier:29fdd57b-90fe-41bb-a450-95999f4b3624"
)

echo "==================================================="
echo "  RESUMING WORKERS — SafeCommand Railway"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "==================================================="

FAILED=0
for entry in "${SERVICES[@]}"; do
  NAME="${entry%%:*}"
  SVC="${entry##*:}"
  RESULT=$(curl -s -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { serviceInstanceUpdate(serviceId: \\\"$SVC\\\", environmentId: \\\"$ENV_ID\\\", input: { numReplicas: 1 }) }\"}")
  if echo "$RESULT" | grep -q '"data":{"serviceInstanceUpdate":true}'; then
    printf "  ✓ %-12s scaled to 1 replica\n" "$NAME"
  else
    printf "  ✗ %-12s FAILED: %s\n" "$NAME" "$RESULT"
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "✗ $FAILED service(s) failed. Check Railway dashboard."
  exit 1
fi

echo ""
echo "Workers scaling up. Verifying API health (may take 60-90 sec)..."

ATTEMPT=0
MAX_ATTEMPTS=10
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  RESPONSE=$(curl -s "$API_HEALTH_URL" 2>&1 || true)
  if echo "$RESPONSE" | grep -qE '"status":"(ok|degraded)"'; then
    echo ""
    echo "✓ API healthy: $RESPONSE"
    echo ""
    echo "  Workers fully online in ~30-60 more seconds."
    echo "  Pause again with: ./scripts/pause-workers.sh"
    exit 0
  fi
  printf "  attempt %d/%d — waiting 15s...\n" "$ATTEMPT" "$MAX_ATTEMPTS"
  sleep 15
done

echo ""
echo "⚠ API health check did not respond within ${MAX_ATTEMPTS} attempts."
echo "  Workers may still be coming up. Check manually:"
echo "    curl $API_HEALTH_URL"
exit 0
