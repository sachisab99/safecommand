#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# seed-drill-participants-demo.sh — industry-leading drill demo data.
#
# Purpose: enrich the 2 completed demo drills (FIRE_EVACUATION 60d ago +
# FULL_EVACUATION 240d ago) in Hyderabad Demo Supermall with realistic
# per-staff participant timelines for client / investor / board demos.
# Together the two drills showcase ALL 6 reason codes from ADR 0004 with
# realistic Indian-context narratives.
#
# Demonstrates value-add of:
#   - Phase 5.18 per-staff acknowledgement tracking
#   - 6-code reason taxonomy (ADR 0004)
#   - Audit-grade `/drills/[id]` detail view
#   - NABH / Fire NOC / DPDP-aligned classification language
#
# Headline metrics post-seed:
#   Drill A: 14 expected / 12 acknowledged / 11 safe / 2 missed / 100% classified
#   Drill B: 10 expected / 8 acknowledged / 7 safe / 2 missed / 100% classified
#   Both: 0 unexcused (every non-acknowledgement classified with reason)
#
# Idempotency: rerun-safe (DELETE + INSERT for participants;
#   ON CONFLICT for staff additions).
#
# Prerequisites:
#   1. Hyderabad Demo Supermall must exist (via seed-hyderabad-demo.sh)
#   2. mig 013 must be deployed (drill_session_participants reason columns)
#
# Usage:
#   ./scripts/seed-drill-participants-demo.sh
#   ./scripts/seed-drill-participants-demo.sh --dry-run   # preview
#
# Refs: BR-A, ADR 0004, mig 013, docs/sales/drill-demo-narrative.md
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      grep -E "^# (Purpose|Demonstrates|Headline|Idempotency|Prerequisites|Usage)" "$0" | sed 's/^# //'
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

# ─── Derive pooler URL (matches the pattern used elsewhere) ────────────────
PWD_RAW="$(grep '^DATABASE_URL=' "$ROOT/.env" | head -1 | sed 's|.*postgres:||' | sed 's|@db.*||')"
if [[ -z "$PWD_RAW" ]]; then
  echo "ERROR: could not extract password from DATABASE_URL in $ROOT/.env" >&2
  exit 1
fi
POOLER_URL="postgresql://postgres.exrewpsjrtevsicmullp:${PWD_RAW}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

SQL_FILE="$SCRIPT_DIR/seed-drill-participants-demo.sql"
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
echo "  Seeding drill participant demo data — $(date)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

psql "$POOLER_URL" -v ON_ERROR_STOP=1 \
  -c "SET lock_timeout = '10s';" \
  -f "$SQL_FILE"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Demo data seeded."
echo "  Open dashboard /drills → click any COMPLETED drill row to see"
echo "  the audit-grade detail page with per-staff timeline + reason"
echo "  classifications."
echo ""
echo "  Sales/investor/board talking points: docs/sales/drill-demo-narrative.md"
echo "═══════════════════════════════════════════════════════════════"
