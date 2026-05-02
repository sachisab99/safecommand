#!/usr/bin/env bash
#
# pause-workers.sh — scale Railway worker services to 0 replicas
#
# Usage: ./scripts/pause-workers.sh
#
# Run at end of day, weekend, or vacation to stop Upstash Redis burn from
# always-on worker heartbeats (saves ~95% of monthly burn during idle periods).
#
# What this DOES pause (numReplicas=0):
#   - scheduler   (no new task instances generated)
#   - escalation  (delayed escalation jobs queue up but don't fire)
#   - notifier    (push notifications don't get sent)
#
# What this DOES NOT touch:
#   - api         (stays up — dashboard, mobile auth still work)
#   - postgres    (data preserved)
#   - redis       (queue contents preserved — flushes on resume)
#
# Resume with: ./scripts/resume-workers.sh
#

set -euo pipefail

ENV_ID="bd7d4903-0756-4dd0-8b55-33fc40a36f3d"
CONFIG_FILE="$HOME/.railway/config.json"

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
echo "  PAUSING WORKERS — SafeCommand Railway"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "==================================================="

FAILED=0
for entry in "${SERVICES[@]}"; do
  NAME="${entry%%:*}"
  SVC="${entry##*:}"
  RESULT=$(curl -s -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { serviceInstanceUpdate(serviceId: \\\"$SVC\\\", environmentId: \\\"$ENV_ID\\\", input: { numReplicas: 0 }) }\"}")
  if echo "$RESULT" | grep -q '"data":{"serviceInstanceUpdate":true}'; then
    printf "  ✓ %-12s scaled to 0 replicas\n" "$NAME"
  else
    printf "  ✗ %-12s FAILED: %s\n" "$NAME" "$RESULT"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ $FAILED -eq 0 ]; then
  echo "✓ All 3 workers paused. They will stop within ~30 sec."
  echo "  API remains running — dashboard and mobile auth still work."
  echo ""
  echo "  Resume with: ./scripts/resume-workers.sh"
  exit 0
else
  echo "✗ $FAILED service(s) failed. Check Railway dashboard."
  exit 1
fi
