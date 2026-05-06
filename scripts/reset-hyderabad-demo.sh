#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# reset-hyderabad-demo.sh — undo seed-hyderabad-demo.sh.
#
# Removes ONLY rows tagged with seed markers:
#   - staff with phone like '+919999%'
#   - shifts with name like '[DEMO] %'
#   - shift_instances cascading from above
#   - staff_zone_assignments cascading from above
#   - incidents with description like '[DEMO] %'
#   - resets T1-Reception zone status back to ALL_CLEAR
#
# Existing TEST_DEMO_* staff and any non-seed venue config are NOT touched.
# Safe to run on production schema (write filters use venue_id + markers).
#
# Usage:
#   ./scripts/reset-hyderabad-demo.sh
#   ./scripts/reset-hyderabad-demo.sh --dry-run   # preview without writing
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      grep -E "^# (Removes|Existing|Usage)" "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: $ROOT/.env not found" >&2
  exit 1
fi

PWD_RAW="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's|.*postgres:||' | sed 's|@db.*||')"
POOLER_URL="postgresql://postgres.exrewpsjrtevsicmullp:${PWD_RAW}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

SQL_FILE="$SCRIPT_DIR/reset-hyderabad-demo.sql"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "═══ DRY RUN — would execute $SQL_FILE ═══"
  echo ""
  cat "$SQL_FILE"
  exit 0
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Resetting Hyderabad Demo Supermall — $(date)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

psql "$POOLER_URL" -v ON_ERROR_STOP=1 \
  -c "SET lock_timeout = '10s';" \
  -f "$SQL_FILE"

echo ""
echo "Reset complete. To re-seed: ./scripts/seed-hyderabad-demo.sh"
