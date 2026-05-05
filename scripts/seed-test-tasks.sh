#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# seed-test-tasks.sh — manually seed task_instances for May 2026 testing
#
# Purpose: enable mobile app testing while workers are paused (May 2026 budget
# freeze, Q5 hybrid budget posture). Workers normally generate task_instances
# from schedule_templates every 60s, but with WORKERS_PAUSED=true that
# pipeline is dormant. This script writes task_instances directly via
# Supabase REST API as a stop-gap.
#
# Idempotent: each row's idempotency_key is constructed from
# (venue_id, template_id, hour-bucket) so re-runs don't create duplicates.
#
# Usage:
#   ./scripts/seed-test-tasks.sh                    # default: 8 hourly tasks for next 8 hours
#   ./scripts/seed-test-tasks.sh --hours 24         # next 24 hours
#   ./scripts/seed-test-tasks.sh --template-id <uuid>  # specific template
#   ./scripts/seed-test-tasks.sh --venue-code SC-MAL-HYD-00001  # specific venue
#   ./scripts/seed-test-tasks.sh --dry-run          # preview without writing
#
# Requires (in .env at project root):
#   SUPABASE_URL                  https://exrewpsjrtevsicmullp.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY     sb_secret_* (per ADR 0003)
#
# Refs: 2026-04-30-19:30_fix.md  (G2 — original ad-hoc seeding via REST)
# Refs: Q5 hybrid budget posture (workers paused; manual seed bridge)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────────────────
HOURS="${HOURS:-8}"
TEMPLATE_ID=""
VENUE_CODE=""
DRY_RUN=false

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hours)        HOURS="$2";       shift 2 ;;
    --template-id)  TEMPLATE_ID="$2"; shift 2 ;;
    --venue-code)   VENUE_CODE="$2";  shift 2 ;;
    --dry-run)      DRY_RUN=true;     shift ;;
    -h|--help)
      grep -E "^# (Purpose|Usage|Requires)" "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ─── Locate project root + load .env ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  echo "ERROR: $PROJECT_ROOT/.env not found" >&2
  exit 1
fi

# Source only the variables we need (don't blanket-source .env to avoid
# unexpected mutations from other vars).
SUPABASE_URL="$(grep -E '^SUPABASE_URL=' "$PROJECT_ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
SERVICE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$PROJECT_ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_KEY" ]]; then
  echo "ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env" >&2
  exit 1
fi

# Sanity check key format (sb_secret_* per ADR 0003)
if [[ ! "$SERVICE_KEY" =~ ^sb_secret_ ]]; then
  echo "WARN: SERVICE_KEY does not start with 'sb_secret_' — may be a stale legacy JWT." >&2
  echo "      Per ADR 0003 (2026-05-05), keys are now opaque tokens." >&2
  read -rp "Continue anyway? (y/N): " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

REST="$SUPABASE_URL/rest/v1"
AUTH_HEADER="Authorization: Bearer $SERVICE_KEY"
KEY_HEADER="apikey: $SERVICE_KEY"
JSON_HEADER="Content-Type: application/json"
PREFER_HEADER="Prefer: resolution=merge-duplicates"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  seed-test-tasks.sh"
echo "  Supabase: $SUPABASE_URL"
echo "  Hours to seed: $HOURS"
[[ -n "$VENUE_CODE"   ]] && echo "  Venue filter: $VENUE_CODE"
[[ -n "$TEMPLATE_ID"  ]] && echo "  Template filter: $TEMPLATE_ID"
[[ "$DRY_RUN" == true ]] && echo "  DRY RUN — no writes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Resolve venue_id ────────────────────────────────────────────────────────
if [[ -n "$VENUE_CODE" ]]; then
  VENUE_FILTER="venue_code=eq.$VENUE_CODE"
else
  VENUE_FILTER="select=*&limit=1"
fi

VENUES_JSON="$(curl -fsS \
  -H "$AUTH_HEADER" \
  -H "$KEY_HEADER" \
  "$REST/venues?$VENUE_FILTER&select=id,venue_code,name")"

if [[ -z "$VENUES_JSON" || "$VENUES_JSON" == "[]" ]]; then
  echo "ERROR: no venue matched. Check --venue-code or seed a venue first." >&2
  exit 1
fi

VENUE_ID="$(echo "$VENUES_JSON" | grep -oE '"id":"[a-f0-9-]+' | head -1 | cut -d'"' -f4)"
VENUE_LABEL="$(echo "$VENUES_JSON" | grep -oE '"venue_code":"[^"]+' | head -1 | cut -d'"' -f4)"

echo "Venue: $VENUE_LABEL ($VENUE_ID)"

# ─── Resolve template_id ─────────────────────────────────────────────────────
if [[ -n "$TEMPLATE_ID" ]]; then
  TPL_FILTER="id=eq.$TEMPLATE_ID&venue_id=eq.$VENUE_ID"
else
  # Default: pick the first HOURLY template active on this venue
  TPL_FILTER="venue_id=eq.$VENUE_ID&frequency=eq.HOURLY&is_active=eq.true&limit=1"
fi

TEMPLATES_JSON="$(curl -fsS \
  -H "$AUTH_HEADER" \
  -H "$KEY_HEADER" \
  "$REST/schedule_templates?$TPL_FILTER&select=id,title,frequency,assigned_role")"

if [[ -z "$TEMPLATES_JSON" || "$TEMPLATES_JSON" == "[]" ]]; then
  echo "ERROR: no schedule template matched. Try --template-id or check the venue has an HOURLY template active." >&2
  exit 1
fi

TPL_ID="$(echo "$TEMPLATES_JSON" | grep -oE '"id":"[a-f0-9-]+' | head -1 | cut -d'"' -f4)"
TPL_TITLE="$(echo "$TEMPLATES_JSON" | grep -oE '"title":"[^"]+' | head -1 | cut -d'"' -f4)"
TPL_FREQ="$(echo "$TEMPLATES_JSON" | grep -oE '"frequency":"[^"]+' | head -1 | cut -d'"' -f4)"

echo "Template: $TPL_TITLE [$TPL_FREQ] ($TPL_ID)"
echo

# ─── Compute hourly buckets + insert task_instances ──────────────────────────
NOW_EPOCH="$(date -u +%s)"
SUCCESS=0
SKIP=0
ERROR=0

for ((i=0; i<HOURS; i++)); do
  # Each task_instance covers a 1-hour window starting at the top of an hour.
  DUE_EPOCH=$((NOW_EPOCH + i*3600))
  DUE_BUCKET=$((DUE_EPOCH / 3600 * 3600))   # round down to hour
  WINDOW_END=$((DUE_BUCKET + 900))           # 15-min completion window

  DUE_AT="$(date -u -r "$DUE_BUCKET" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null \
    || date -u -d "@$DUE_BUCKET" +"%Y-%m-%dT%H:%M:%S.000Z")"
  WINDOW_AT="$(date -u -r "$WINDOW_END" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null \
    || date -u -d "@$WINDOW_END" +"%Y-%m-%dT%H:%M:%S.000Z")"

  # Idempotency key — re-runs of this script for the same hour bucket don't
  # create duplicate rows. Schema enforces UNIQUE on idempotency_key.
  IDEM_KEY="seed-${VENUE_ID:0:8}-${TPL_ID:0:8}-${DUE_BUCKET}"

  PAYLOAD=$(cat <<EOF
{
  "venue_id":          "$VENUE_ID",
  "template_id":       "$TPL_ID",
  "status":            "PENDING",
  "due_at":            "$DUE_AT",
  "window_expires_at": "$WINDOW_AT",
  "idempotency_key":   "$IDEM_KEY"
}
EOF
)

  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] $DUE_AT → window closes $WINDOW_AT  key=$IDEM_KEY"
    continue
  fi

  HTTP_CODE="$(curl -sS -o /tmp/seed-resp.json -w "%{http_code}" \
    -X POST \
    -H "$AUTH_HEADER" \
    -H "$KEY_HEADER" \
    -H "$JSON_HEADER" \
    -H "$PREFER_HEADER" \
    -d "$PAYLOAD" \
    "$REST/task_instances" || echo "000")"

  case "$HTTP_CODE" in
    201|200)
      echo "  ✓ created  due=$DUE_AT  key=$IDEM_KEY"
      SUCCESS=$((SUCCESS+1))
      ;;
    409)
      # Conflict on idempotency_key UNIQUE — already seeded
      echo "  · skipped  due=$DUE_AT  (already exists)"
      SKIP=$((SKIP+1))
      ;;
    *)
      echo "  ✗ failed   due=$DUE_AT  http=$HTTP_CODE  body=$(cat /tmp/seed-resp.json | head -c 200)"
      ERROR=$((ERROR+1))
      ;;
  esac
done

rm -f /tmp/seed-resp.json

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. created=$SUCCESS  skipped=$SKIP  failed=$ERROR"
[[ $ERROR -eq 0 ]] && echo "  Open mobile app and pull-to-refresh the tasks list." || echo "  Some inserts failed — check Supabase RLS + log output above."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
