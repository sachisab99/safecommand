#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# seed-hyderabad-demo.sh — populate Hyderabad Demo Supermall with realistic
# operating state for sales validation demos.
#
# Purpose: every founder demo call should open a "live operating venue" in
# under 60 seconds — no manual roster setup required. This script transforms
# the empty Hyderabad Demo Supermall into a venue mid-shift with covered
# zones, named owners, an attention-state zone, and a recent incident
# timeline.
#
# What this seeds (on top of existing TEST_DEMO_* staff which we leave alone):
#   - 6 realistic staff (Indian names) with phone-pattern +919999XXXX
#   - 2 shift templates: '[DEMO] Day Shift' 09:00–18:00, '[DEMO] Night Shift' 18:00–06:00
#   - 1 ACTIVE shift_instance for today's Day Shift, commander = senior SH
#   - 9 of 12 zones assigned across 6 staff (75% coverage; 3 zones uncovered
#     so the dashboard /accountability coverage-gap callout has something
#     to render)
#   - 1 zone (T1-Reception) flipped to ATTENTION state
#   - 2 historical incidents (1 RESOLVED 2hr ago FIRE drill, 1 CONTAINED
#     30min ago SECURITY check) for incident timeline flavor
#
# Idempotency: refuses to double-seed. If [DEMO] markers exist, aborts and
# instructs you to run reset-hyderabad-demo.sh first.
#
# Usage:
#   ./scripts/seed-hyderabad-demo.sh
#   ./scripts/seed-hyderabad-demo.sh --dry-run   # preview without writing
#
# Requires (in .env at project root):
#   DATABASE_URL — full Postgres URL, used to derive password
#                  (we then use the AWS pooler endpoint for production safety)
#
# Refs: BR-04 / BR-19 / BR-18 / Plan §22 (validation gate hero demo)
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      grep -E "^# (Purpose|What|Idempotency|Usage|Requires)" "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ─── Resolve project root from script location ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: $ROOT/.env not found" >&2
  exit 1
fi

# ─── Derive pooler URL (matches the pattern used elsewhere in this repo) ───
PWD_RAW="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's|.*postgres:||' | sed 's|@db.*||')"
if [[ -z "$PWD_RAW" ]]; then
  echo "ERROR: could not extract password from DATABASE_URL in $ROOT/.env" >&2
  exit 1
fi
POOLER_URL="postgresql://postgres.exrewpsjrtevsicmullp:${PWD_RAW}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

SQL_FILE="$SCRIPT_DIR/seed-hyderabad-demo.sql"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "ERROR: $SQL_FILE not found" >&2
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "═══ DRY RUN — would execute $SQL_FILE against the pooler ═══"
  echo ""
  cat "$SQL_FILE"
  exit 0
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Seeding Hyderabad Demo Supermall — $(date)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Lock timeout protects against hangs if Realtime publication contention
# returns (we hit this during mig 009 deploy earlier today)
psql "$POOLER_URL" -v ON_ERROR_STOP=1 \
  -c "SET lock_timeout = '10s';" \
  -f "$SQL_FILE"

echo ""
echo "Done. Next:"
echo "  - Open Ops Console (http://localhost:3001) → Hyderabad Demo Supermall → Shifts & Roster"
echo "  - Open mobile (Expo Go) — log in as any staff to see populated state"
echo "  - Open dashboard (http://localhost:3000/accountability) for venue-wide view"
echo ""
echo "To undo: ./scripts/reset-hyderabad-demo.sh"
