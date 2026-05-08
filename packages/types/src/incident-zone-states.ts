/**
 * Incident Zone State Machine (BR-H, v8 SIRE)
 *
 * 10 zone states + role-based transition matrix.
 *
 * Per architect resolution `docs/specs/SafeCommand_Phase521_Preflight_Analysis.md` §R1:
 *   - State transition matrix MUST be a shared constant — used by both api
 *     route handlers (server-side enforcement) AND mobile UI (client-side
 *     pre-validation). Single source of truth = zero divergence.
 *
 *   - GS cannot transition `EVACUATION_TRIGGERED → ZONE_CLEAR`. This
 *     prevents a "nervous GS taps Zone Clear during ongoing evacuation"
 *     bug that would cause false-green dashboard state. SH/DSH only can
 *     override an evacuation.
 *
 * The api PATCH /v1/incidents/:id/zones/:zone_id/state endpoint validates
 * proposed transitions against this matrix and returns 422 on invalid
 * transitions with the valid-transition graph as part of the error
 * response.
 *
 * Refs:
 *   - Migration 014: incident_zone_states.state CHECK constraint
 *   - Architecture v8 §SIRE BR-H
 *   - docs/specs/incident-response-activity-templates.md §3.1
 *
 * @see SafeCommand_Phase521_Preflight_Analysis.md §3 R1 (matrix source)
 * @see SafeCommand_Phase521_Clarifications_Resolved.md §1.3 (race condition pattern)
 */

// ─── Zone state enum ────────────────────────────────────────────────────────
// Must match the CHECK constraint on incident_zone_states.state in mig 014.

export type IncidentZoneState =
  | 'UNVALIDATED'           // Default at incident declaration; awaiting GS acknowledgement
  | 'SWEEP_IN_PROGRESS'     // GS acknowledged; physical zone sweep underway
  | 'ZONE_CLEAR'            // GS tapped "✅ Safe + Zone Clear"; zone empty + fire doors closed
  | 'NEEDS_ATTENTION'       // GS tapped "⚠ Zone Needs Attention"; reason_note mandatory
  | 'EVACUATION_TRIGGERED'  // GS/FS/SC/SH initiated evacuation; fan-out in flight
  | 'EVACUATING'            // Post-fan-out system-set state; staff leaving zone
  | 'EVACUATION_COMPLETE'   // FS confirmed zone swept + empty; photo evidence required
  | 'SH_CONFIRMED_CLEAR'    // SH manual confirm (alternative to FS photo)
  | 'LOCKED_DOWN'           // SH lockdown for SECURITY incident sub-types
  | 'INACCESSIBLE';         // Zone blocked (fire/structural/locked); cannot sweep

export const INCIDENT_ZONE_STATES: readonly IncidentZoneState[] = [
  'UNVALIDATED',
  'SWEEP_IN_PROGRESS',
  'ZONE_CLEAR',
  'NEEDS_ATTENTION',
  'EVACUATION_TRIGGERED',
  'EVACUATING',
  'EVACUATION_COMPLETE',
  'SH_CONFIRMED_CLEAR',
  'LOCKED_DOWN',
  'INACCESSIBLE',
] as const;

// ─── Role keys for transition matrix ────────────────────────────────────────
// Subset of StaffRole that participates in zone state transitions.
// (GM, AUDITOR, FLOOR_SUPERVISOR, GROUND_STAFF mapped to legacy enum names
// where they differ; the matrix uses the BR-H-canonical short-names.)

export type ZoneTransitionRole = 'GS' | 'FS' | 'SC' | 'SH' | 'DSH';

/** Maps full StaffRole enum values to the transition matrix's short-name keys. */
export const ROLE_TO_ZONE_TRANSITION_KEY: Record<string, ZoneTransitionRole | null> = {
  GROUND_STAFF: 'GS',
  FLOOR_SUPERVISOR: 'FS',
  SHIFT_COMMANDER: 'SC',
  SH: 'SH',
  DSH: 'DSH',
  // FM, GM, AUDITOR cannot transition zone states directly:
  FM: null,
  GM: null,
  AUDITOR: null,
};

// ─── State transition matrix ────────────────────────────────────────────────
// VALID_TRANSITIONS[from_state][role] = array of allowed to_states.
// An empty array means the role cannot transition out of that state.
//
// Per architect §3 R1 — this is the canonical safety-critical matrix.
// Edge cases enforced:
//   - GS cannot move EVACUATION_TRIGGERED → ZONE_CLEAR (false-green prevention)
//   - GS cannot transition EVACUATING / EVACUATION_COMPLETE / SH_CONFIRMED_CLEAR / LOCKED_DOWN
//   - SH_CONFIRMED_CLEAR is terminal (no further transitions)
//   - LOCKED_DOWN can only be released by SH/DSH (back to UNVALIDATED)
//   - INACCESSIBLE can be retried by anyone with sweep permission

export const VALID_TRANSITIONS: Record<
  IncidentZoneState,
  Record<ZoneTransitionRole, IncidentZoneState[]>
> = {
  UNVALIDATED: {
    GS:  ['SWEEP_IN_PROGRESS', 'INACCESSIBLE'],
    FS:  ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION', 'INACCESSIBLE'],
    SC:  ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION',
          'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'INACCESSIBLE'],
    SH:  ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION',
          'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'NEEDS_ATTENTION',
          'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  SWEEP_IN_PROGRESS: {
    GS:  ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    FS:  ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    SC:  ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED',
          'LOCKED_DOWN', 'INACCESSIBLE'],
    SH:  ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED',
          'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED',
          'LOCKED_DOWN', 'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  NEEDS_ATTENTION: {
    GS:  ['ZONE_CLEAR', 'EVACUATION_TRIGGERED'],
    FS:  ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'INACCESSIBLE'],
    SC:  ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN', 'INACCESSIBLE'],
    SH:  ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN',
          'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
    DSH: ['ZONE_CLEAR', 'EVACUATION_TRIGGERED', 'LOCKED_DOWN',
          'SH_CONFIRMED_CLEAR', 'INACCESSIBLE'],
  },
  EVACUATION_TRIGGERED: {
    // GS cannot cancel an evacuation — SH/DSH only override
    GS:  [],
    FS:  ['EVACUATING'],
    SC:  ['EVACUATING'],
    SH:  ['EVACUATING', 'SH_CONFIRMED_CLEAR'],
    DSH: ['EVACUATING', 'SH_CONFIRMED_CLEAR'],
  },
  EVACUATING: {
    GS:  [],
    FS:  ['EVACUATION_COMPLETE'],
    SC:  ['EVACUATION_COMPLETE'],
    SH:  ['EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR'],
    DSH: ['EVACUATION_COMPLETE', 'SH_CONFIRMED_CLEAR'],
  },
  EVACUATION_COMPLETE: {
    GS:  [],
    FS:  [],
    SC:  [],
    SH:  ['SH_CONFIRMED_CLEAR'],
    DSH: ['SH_CONFIRMED_CLEAR'],
  },
  SH_CONFIRMED_CLEAR: {
    // Terminal state — no transitions allowed by anyone
    GS:  [],
    FS:  [],
    SC:  [],
    SH:  [],
    DSH: [],
  },
  ZONE_CLEAR: {
    // ZONE_CLEAR is terminal in the happy path. SH/DSH can promote to
    // SH_CONFIRMED_CLEAR if needed for final audit.
    GS:  [],
    FS:  [],
    SC:  [],
    SH:  ['SH_CONFIRMED_CLEAR'],
    DSH: ['SH_CONFIRMED_CLEAR'],
  },
  LOCKED_DOWN: {
    GS:  [],
    FS:  [],
    SC:  [],
    SH:  ['UNVALIDATED'],   // SH releases lockdown; zone resets for re-validation
    DSH: ['UNVALIDATED'],
  },
  INACCESSIBLE: {
    GS:  ['SWEEP_IN_PROGRESS'],   // GS retries access
    FS:  ['SWEEP_IN_PROGRESS'],
    SC:  ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
    SH:  ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
    DSH: ['SWEEP_IN_PROGRESS', 'SH_CONFIRMED_CLEAR'],
  },
};

// ─── Helper functions ───────────────────────────────────────────────────────

/**
 * Check if a state transition is valid for a given role.
 *
 * Used by:
 *   - api PATCH /v1/incidents/:id/zones/:zone_id/state — server-side enforcement
 *   - mobile 3-button action UI — client-side pre-validation (avoids 422 round-trip)
 *
 * Special cases:
 *   - Same-state transition is always valid (idempotent no-op)
 *   - Roles outside the matrix (FM/GM/AUDITOR) always invalid
 *
 * @param fromState — current zone state
 * @param toState — proposed new state
 * @param staffRole — full StaffRole enum value (e.g. 'GROUND_STAFF', 'SH')
 * @returns true if transition is allowed
 */
export function isValidZoneTransition(
  fromState: IncidentZoneState,
  toState: IncidentZoneState,
  staffRole: string,
): boolean {
  // Idempotent no-op: same state transitions always succeed (UPSERT semantic)
  if (fromState === toState) return true;

  const transitionKey = ROLE_TO_ZONE_TRANSITION_KEY[staffRole];
  if (transitionKey === null || transitionKey === undefined) {
    // Role not in transition matrix (FM/GM/AUDITOR/etc.)
    return false;
  }

  const allowedToStates = VALID_TRANSITIONS[fromState]?.[transitionKey];
  if (!allowedToStates) return false;

  return allowedToStates.includes(toState);
}

/**
 * Get the list of states a role can transition to from the current state.
 *
 * Used by mobile UI to render valid action buttons (e.g. for a GS in
 * NEEDS_ATTENTION state, only show "Mark zone clear" + "Trigger
 * evacuation" buttons — not "Set inaccessible" since GS can't transition
 * NEEDS_ATTENTION → INACCESSIBLE).
 *
 * @param fromState — current zone state
 * @param staffRole — full StaffRole enum value
 * @returns array of valid next-state options (empty if no transitions allowed)
 */
export function getValidTransitions(
  fromState: IncidentZoneState,
  staffRole: string,
): IncidentZoneState[] {
  const transitionKey = ROLE_TO_ZONE_TRANSITION_KEY[staffRole];
  if (transitionKey === null || transitionKey === undefined) return [];

  return VALID_TRANSITIONS[fromState]?.[transitionKey] ?? [];
}

/**
 * Check if a state requires `reason_note` to be set (mandatory text input).
 *
 * Used by both api validation and mobile UI gating.
 */
export function requiresReasonNote(state: IncidentZoneState): boolean {
  return state === 'NEEDS_ATTENTION' || state === 'INACCESSIBLE' || state === 'LOCKED_DOWN';
}

/**
 * Check if a state requires `evidence_url` (photo) to be set.
 */
export function requiresEvidence(state: IncidentZoneState): boolean {
  return state === 'EVACUATION_COMPLETE';
}

/**
 * Check if a state is terminal (no further transitions possible by anyone).
 */
export function isTerminalState(state: IncidentZoneState): boolean {
  return state === 'SH_CONFIRMED_CLEAR';
}

// ─── Display helpers ────────────────────────────────────────────────────────

/** Human-readable label per state. UI uses these via i18n key in Phase B. */
export const ZONE_STATE_LABEL: Record<IncidentZoneState, string> = {
  UNVALIDATED: 'Unvalidated',
  SWEEP_IN_PROGRESS: 'Sweep in progress',
  ZONE_CLEAR: 'Safe + Zone clear',
  NEEDS_ATTENTION: 'Needs attention',
  EVACUATION_TRIGGERED: 'Evacuation triggered',
  EVACUATING: 'Evacuating',
  EVACUATION_COMPLETE: 'Evacuation complete',
  SH_CONFIRMED_CLEAR: 'Confirmed clear (SH)',
  LOCKED_DOWN: 'Locked down',
  INACCESSIBLE: 'Inaccessible',
};

/** Colour token per state — matches dashboard + mobile palette. */
export const ZONE_STATE_COLOUR: Record<IncidentZoneState, string> = {
  UNVALIDATED: 'grey',
  SWEEP_IN_PROGRESS: 'blue',
  ZONE_CLEAR: 'green',
  NEEDS_ATTENTION: 'amber',
  EVACUATION_TRIGGERED: 'red-flashing',
  EVACUATING: 'red-solid',
  EVACUATION_COMPLETE: 'green',
  SH_CONFIRMED_CLEAR: 'green',
  LOCKED_DOWN: 'purple',
  INACCESSIBLE: 'dark-grey',
};
