/**
 * SIRE — Per-role action template resolver (EC-23 graceful fallback chain).
 *
 * Implements the 6-tier specificity chain that the architect committed to in
 * `docs/specs/SafeCommand_Phase521_Clarifications_Resolved.md` §1.4:
 *
 *   Tier 1 (most specific):  venue + sub-type
 *   Tier 2:                  venue + parent type
 *   Tier 3:                  venue-type + sub-type
 *   Tier 4:                  venue-type + parent type
 *   Tier 5:                  global + sub-type
 *   Tier 6 (mandatory floor): global + parent type
 *
 * The mig 015 seed guarantees tier 6 is always populated for at least
 * (FIRE, SH). Hard Rule per EC-23: this function MUST always resolve to
 * SOMETHING — empty actions list is unacceptable. We throw `EC23ViolationError`
 * if no tier matches; that should never happen in production but is the
 * defence-in-depth backstop the architect required.
 *
 * Mirrors the SQL chain in `mig 015` lines 142-228 verification block, and
 * is regression-tested against the live FIRE+SH global+parent row.
 *
 * @see SafeCommand_Phase521_Clarifications_Resolved.md §1.4
 * @see supabase/migrations/015_sire_seed_fire_sh_global_template.sql
 */

import type { SupabaseClient } from '@safecommand/db';

// ──────────────────────────────────────────────────────────────────────────
// Types

/**
 * The shape of one action step within a template's `actions` JSONB column.
 * Mirrors the inline schema-comment in mig 014 lines 290-299.
 */
export interface SireActionStep {
  order: number;
  instruction: string;
  instruction_i18n_key: string;
  time_target_seconds: number | null;
  evidence_type: 'PHOTO' | 'GPS' | 'NOTE' | 'SIGNATURE' | 'VERBAL' | null;
  is_mandatory: boolean;
  is_life_critical: boolean;
  location_scope: 'ASSIGNED_ZONE' | 'FLOOR' | 'BUILDING' | 'VENUE' | 'EXTERNAL';
}

/** Resolved template row + its computed specificity tier. */
export interface ResolvedTemplate {
  id: string;
  venue_id: string | null;
  venue_type: string | null;
  incident_type: string;
  incident_subtype: string | null;
  staff_role: string;
  template_version: number;
  is_active: boolean;
  actions: SireActionStep[];
  /**
   * Specificity tier the chain matched on. 1 = venue+sub (most specific);
   * 6 = global+parent (mandatory floor). Useful for audit + UI badging
   * ("This action list is the venue-specific override" vs "...the global
   * default — request a venue-specific edit via SC Ops").
   */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
}

/** Inputs to the resolver. All required. */
export interface TemplateResolveContext {
  venue_id: string;
  venue_type: string; // HOSPITAL | MALL | HOTEL | CORPORATE
  incident_type: string; // FIRE | MEDICAL | SECURITY | EVACUATION | STRUCTURAL | OTHER
  incident_subtype: string | null; // 32-value enum, or null = parent-only
  staff_role: string; // SH | DSH | SHIFT_COMMANDER | FM | FLOOR_SUPERVISOR | GROUND_STAFF | GM | AUDITOR
}

/**
 * Thrown when the EC-23 chain returns no row. This indicates a missing
 * mandatory tier-6 (global+parent) seed for the given (incident_type,
 * staff_role) — violates EC-23 + Hard Rule 23. The api should treat this
 * as a 500 (server misconfiguration), not a 404.
 */
export class EC23ViolationError extends Error {
  constructor(public readonly ctx: TemplateResolveContext) {
    super(
      `EC-23 violation: no template found for incident_type=${ctx.incident_type}, ` +
        `staff_role=${ctx.staff_role}. Tier-6 (global+parent) seed missing. ` +
        `Run mig 015 or seed via SC Ops.`,
    );
    this.name = 'EC23ViolationError';
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Resolver

/**
 * Resolve the most-specific active template for the given context.
 *
 * The query mirrors the SQL chain in mig 015 verification block. Returns
 * the single best-match row tagged with its specificity tier. Throws
 * `EC23ViolationError` if no row matches (which should be impossible in
 * production given the mig 015 floor seed, but is a defence-in-depth
 * backstop).
 *
 * Performance: Uses idx_iat_resolution partial index from mig 014
 * (line 320-322) — `(incident_type, incident_subtype, staff_role,
 * venue_id, venue_type) WHERE is_active = TRUE`. Sub-millisecond on
 * realistic template volumes.
 *
 * @param client — Supabase service role client (bypasses RLS)
 * @param ctx — incident + role + venue context
 * @returns the resolved template, or throws EC23ViolationError
 */
export async function resolveTemplate(
  client: SupabaseClient,
  ctx: TemplateResolveContext,
): Promise<ResolvedTemplate> {
  // Fetch all rows that COULD match the chain, then pick the most specific.
  // We fetch broadly and filter in JS rather than 6 sequential queries —
  // a single round-trip is faster, and the filtered set is small (typically
  // 1-6 rows in production for a given incident_type × staff_role).
  const { data, error } = await client
    .from('incident_action_templates')
    .select('*')
    .eq('is_active', true)
    .eq('staff_role', ctx.staff_role)
    .eq('incident_type', ctx.incident_type);

  if (error) {
    throw new Error(`templateResolver: DB error: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new EC23ViolationError(ctx);
  }

  // Compute tier for each candidate row that COULD match this context, then
  // pick the lowest tier (highest specificity). Rows that don't match the
  // chain at all (wrong venue / wrong venue-type / wrong sub-type) are
  // filtered out.
  const candidates = data
    .map((row) => ({ row, tier: matchTier(row, ctx) }))
    .filter((c): c is { row: typeof c.row; tier: 1 | 2 | 3 | 4 | 5 | 6 } => c.tier !== null)
    // Tie-breaker: higher template_version wins within the same tier
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return (b.row.template_version ?? 1) - (a.row.template_version ?? 1);
    });

  if (candidates.length === 0) {
    throw new EC23ViolationError(ctx);
  }

  const winner = candidates[0]!;

  return {
    id: winner.row.id,
    venue_id: winner.row.venue_id,
    venue_type: winner.row.venue_type,
    incident_type: winner.row.incident_type,
    incident_subtype: winner.row.incident_subtype,
    staff_role: winner.row.staff_role,
    template_version: winner.row.template_version,
    is_active: winner.row.is_active,
    actions: winner.row.actions as SireActionStep[],
    tier: winner.tier,
  };
}

/**
 * Compute the specificity tier this row matches against the context, or
 * null if it doesn't match the chain at all.
 *
 * Tier 1: venue_id matches AND incident_subtype matches AND non-null
 * Tier 2: venue_id matches AND incident_subtype IS NULL (parent fallback)
 * Tier 3: venue_id NULL AND venue_type matches AND incident_subtype matches
 * Tier 4: venue_id NULL AND venue_type matches AND incident_subtype IS NULL
 * Tier 5: venue_id NULL AND venue_type NULL AND incident_subtype matches
 * Tier 6: venue_id NULL AND venue_type NULL AND incident_subtype IS NULL
 *
 * Exported for unit testing; the resolver itself is the only production caller.
 */
export function matchTier(
  row: {
    venue_id: string | null;
    venue_type: string | null;
    incident_subtype: string | null;
  },
  ctx: TemplateResolveContext,
): 1 | 2 | 3 | 4 | 5 | 6 | null {
  // Tier 1 + 2 require the row's venue_id to match the caller's venue
  if (row.venue_id !== null && row.venue_id !== ctx.venue_id) {
    return null; // a different venue's row — never matches
  }

  // Tier 3 + 4 require the row's venue_type to match (when venue_id NULL)
  if (
    row.venue_id === null &&
    row.venue_type !== null &&
    row.venue_type !== ctx.venue_type
  ) {
    return null; // a different venue-type's row — never matches
  }

  // Tier-discrimination
  if (row.venue_id !== null) {
    // Tier 1 or 2
    if (row.incident_subtype !== null) {
      // Tier 1 needs the row's subtype to match the caller's subtype
      return row.incident_subtype === ctx.incident_subtype ? 1 : null;
    }
    return 2; // venue + parent — always matches if venue_id matches
  }

  if (row.venue_type !== null) {
    // Tier 3 or 4
    if (row.incident_subtype !== null) {
      return row.incident_subtype === ctx.incident_subtype ? 3 : null;
    }
    return 4;
  }

  // Tier 5 or 6 (global)
  if (row.incident_subtype !== null) {
    return row.incident_subtype === ctx.incident_subtype ? 5 : null;
  }
  return 6;
}
