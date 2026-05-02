#!/usr/bin/env bash
#
# worker-status.sh — show current state of each Railway service
#
# Usage: ./scripts/worker-status.sh
#
# Quick check before pause/resume. Combines numReplicas + latest deployment status.
# numReplicas=null means "use default from railway.toml" (typically 1 or 2).
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
  echo "✗ Could not read Railway access token. Run: railway login" >&2
  exit 1
fi

declare -a SERVICES=(
  "api:d3fd284f-e7fd-48d9-8534-e37315388dc8"
  "scheduler:19df0688-609d-4226-9c13-1072f4adb571"
  "escalation:899ad603-48cc-4c06-b536-14f51dff99e5"
  "notifier:29fdd57b-90fe-41bb-a450-95999f4b3624"
)

echo "==================================================="
echo "  WORKER STATUS — SafeCommand Railway"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "==================================================="

for entry in "${SERVICES[@]}"; do
  NAME="${entry%%:*}"
  SVC="${entry##*:}"
  RESULT=$(curl -s -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ serviceInstance(serviceId: \\\"$SVC\\\", environmentId: \\\"$ENV_ID\\\") { numReplicas latestDeployment { status } } }\"}")

  REPLICAS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); v=d.get('data',{}).get('serviceInstance',{}).get('numReplicas'); print('null' if v is None else v)" 2>/dev/null || echo "?")
  STATUS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); s=d.get('data',{}).get('serviceInstance',{}).get('latestDeployment'); print(s.get('status','UNKNOWN') if s else 'NO_DEPLOY')" 2>/dev/null || echo "?")

  if [ "$REPLICAS" = "0" ]; then
    printf "  %-12s 🛑 PAUSED   replicas=0  deploy=%s\n" "$NAME" "$STATUS"
  elif [ "$STATUS" = "SUCCESS" ]; then
    if [ "$REPLICAS" = "null" ]; then
      printf "  %-12s ✓  RUNNING  replicas=default(railway.toml)  deploy=%s\n" "$NAME" "$STATUS"
    else
      printf "  %-12s ✓  RUNNING  replicas=%s  deploy=%s\n" "$NAME" "$REPLICAS" "$STATUS"
    fi
  elif [ "$STATUS" = "BUILDING" ] || [ "$STATUS" = "DEPLOYING" ] || [ "$STATUS" = "INITIALIZING" ]; then
    printf "  %-12s ⏳ DEPLOYING replicas=%s  deploy=%s\n" "$NAME" "$REPLICAS" "$STATUS"
  elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CRASHED" ]; then
    printf "  %-12s ⚠  FAILED   replicas=%s  deploy=%s\n" "$NAME" "$REPLICAS" "$STATUS"
  else
    printf "  %-12s ?  %s replicas=%s\n" "$NAME" "$STATUS" "$REPLICAS"
  fi
done

echo ""
echo "  Pause workers:  ./scripts/pause-workers.sh"
echo "  Resume workers: ./scripts/resume-workers.sh"
