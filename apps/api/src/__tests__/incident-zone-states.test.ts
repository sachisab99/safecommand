/**
 * Unit tests for the SIRE zone state transition matrix.
 *
 * The matrix is the safety-critical heart of BR-H. Tests below codify the
 * invariants the architect resolved in §3 R1:
 *
 *   - GS cannot transition `EVACUATION_TRIGGERED → ZONE_CLEAR`
 *     (false-green prevention; the bug a nervous GS could otherwise create)
 *   - SH_CONFIRMED_CLEAR is terminal (no transitions out for any role)
 *   - LOCKED_DOWN can be released only by SH or DSH
 *   - FM/GM/AUDITOR cannot drive zone transitions at all
 *   - Same-state transitions are idempotent no-ops (UPSERT semantic)
 *
 * These tests ALSO double as living documentation of the role-authority
 * model. If a future engineer changes the matrix in a way that violates
 * one of these invariants, the test fails with a clear pointer to the rule.
 *
 * Refs:
 *   - packages/types/src/incident-zone-states.ts (the code under test)
 *   - docs/specs/SafeCommand_Phase521_Preflight_Analysis.md §3 R1
 *   - mig 014 line 124 (DB CHECK constraint mirrors the state enum)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidZoneTransition,
  getValidTransitions,
  requiresReasonNote,
  requiresEvidence,
  isTerminalState,
  ROLE_TO_ZONE_TRANSITION_KEY,
  VALID_TRANSITIONS,
  INCIDENT_ZONE_STATES,
} from '@safecommand/types';

describe('isValidZoneTransition', () => {
  describe('GS false-green prevention (architect §3 R1)', () => {
    it('rejects GS transitioning EVACUATION_TRIGGERED → ZONE_CLEAR', () => {
      // The single most safety-critical assertion in the codebase.
      expect(
        isValidZoneTransition('EVACUATION_TRIGGERED', 'ZONE_CLEAR', 'GROUND_STAFF'),
      ).toBe(false);
    });

    it('rejects GS transitioning EVACUATION_TRIGGERED to ANY other state', () => {
      // GS has empty transition array from EVACUATION_TRIGGERED.
      for (const toState of INCIDENT_ZONE_STATES) {
        if (toState === 'EVACUATION_TRIGGERED') continue;
        expect(
          isValidZoneTransition('EVACUATION_TRIGGERED', toState, 'GROUND_STAFF'),
        ).toBe(false);
      }
    });

    it('allows SH to transition EVACUATION_TRIGGERED → SH_CONFIRMED_CLEAR (override)', () => {
      // SH can override an evacuation; that's the architect's resolution.
      expect(
        isValidZoneTransition('EVACUATION_TRIGGERED', 'SH_CONFIRMED_CLEAR', 'SH'),
      ).toBe(true);
    });
  });

  describe('SH_CONFIRMED_CLEAR is terminal', () => {
    it('no role can transition out of SH_CONFIRMED_CLEAR', () => {
      const roles = ['GROUND_STAFF', 'FLOOR_SUPERVISOR', 'SHIFT_COMMANDER', 'SH', 'DSH'];
      const targets: ReadonlyArray<typeof INCIDENT_ZONE_STATES[number]> = INCIDENT_ZONE_STATES;
      for (const role of roles) {
        for (const target of targets) {
          if (target === 'SH_CONFIRMED_CLEAR') continue; // same-state no-op allowed
          expect(
            isValidZoneTransition('SH_CONFIRMED_CLEAR', target, role),
          ).toBe(false);
        }
      }
    });
  });

  describe('LOCKED_DOWN release is SH/DSH only', () => {
    it('GS cannot release LOCKED_DOWN', () => {
      expect(isValidZoneTransition('LOCKED_DOWN', 'UNVALIDATED', 'GROUND_STAFF')).toBe(false);
    });
    it('FS cannot release LOCKED_DOWN', () => {
      expect(isValidZoneTransition('LOCKED_DOWN', 'UNVALIDATED', 'FLOOR_SUPERVISOR')).toBe(false);
    });
    it('SC cannot release LOCKED_DOWN', () => {
      expect(isValidZoneTransition('LOCKED_DOWN', 'UNVALIDATED', 'SHIFT_COMMANDER')).toBe(false);
    });
    it('SH releases LOCKED_DOWN → UNVALIDATED', () => {
      expect(isValidZoneTransition('LOCKED_DOWN', 'UNVALIDATED', 'SH')).toBe(true);
    });
    it('DSH releases LOCKED_DOWN → UNVALIDATED', () => {
      expect(isValidZoneTransition('LOCKED_DOWN', 'UNVALIDATED', 'DSH')).toBe(true);
    });
  });

  describe('non-transition roles (FM/GM/AUDITOR)', () => {
    it('FM cannot drive zone transitions', () => {
      expect(isValidZoneTransition('UNVALIDATED', 'SWEEP_IN_PROGRESS', 'FM')).toBe(false);
    });
    it('GM cannot drive zone transitions', () => {
      expect(isValidZoneTransition('UNVALIDATED', 'SWEEP_IN_PROGRESS', 'GM')).toBe(false);
    });
    it('AUDITOR cannot drive zone transitions', () => {
      expect(isValidZoneTransition('UNVALIDATED', 'SWEEP_IN_PROGRESS', 'AUDITOR')).toBe(false);
    });
  });

  describe('idempotent same-state (UPSERT semantic)', () => {
    it('same-state transition is always valid for any role', () => {
      // Even FM/GM/AUDITOR can submit a same-state PATCH (no-op).
      const roles = ['GROUND_STAFF', 'SH', 'FM', 'GM', 'AUDITOR', 'unknown_role'];
      for (const role of roles) {
        expect(isValidZoneTransition('UNVALIDATED', 'UNVALIDATED', role)).toBe(true);
        expect(isValidZoneTransition('SH_CONFIRMED_CLEAR', 'SH_CONFIRMED_CLEAR', role)).toBe(true);
      }
    });
  });

  describe('happy-path GS sweep flow', () => {
    it('GS can move UNVALIDATED → SWEEP_IN_PROGRESS', () => {
      expect(isValidZoneTransition('UNVALIDATED', 'SWEEP_IN_PROGRESS', 'GROUND_STAFF')).toBe(true);
    });
    it('GS can move SWEEP_IN_PROGRESS → ZONE_CLEAR', () => {
      expect(isValidZoneTransition('SWEEP_IN_PROGRESS', 'ZONE_CLEAR', 'GROUND_STAFF')).toBe(true);
    });
    it('GS can move SWEEP_IN_PROGRESS → NEEDS_ATTENTION', () => {
      expect(isValidZoneTransition('SWEEP_IN_PROGRESS', 'NEEDS_ATTENTION', 'GROUND_STAFF')).toBe(true);
    });
  });
});

describe('getValidTransitions', () => {
  it('GS at SWEEP_IN_PROGRESS returns the 4 valid next-states', () => {
    const valid = getValidTransitions('SWEEP_IN_PROGRESS', 'GROUND_STAFF');
    expect(valid).toEqual(['ZONE_CLEAR', 'NEEDS_ATTENTION', 'EVACUATION_TRIGGERED', 'INACCESSIBLE']);
  });

  it('GS at EVACUATION_TRIGGERED returns empty array (cannot override)', () => {
    expect(getValidTransitions('EVACUATION_TRIGGERED', 'GROUND_STAFF')).toEqual([]);
  });

  it('SH at SH_CONFIRMED_CLEAR returns empty array (terminal)', () => {
    expect(getValidTransitions('SH_CONFIRMED_CLEAR', 'SH')).toEqual([]);
  });

  it('FM at any state returns empty array', () => {
    expect(getValidTransitions('UNVALIDATED', 'FM')).toEqual([]);
  });

  it('matrix entries are non-undefined for every (state, role) combo', () => {
    // Defensive: no undefined slots in the matrix that could cause runtime
    // errors in the api PATCH handler.
    const roles = ['GS', 'FS', 'SC', 'SH', 'DSH'] as const;
    for (const state of INCIDENT_ZONE_STATES) {
      for (const role of roles) {
        const transitions = VALID_TRANSITIONS[state][role];
        expect(transitions).toBeDefined();
        expect(Array.isArray(transitions)).toBe(true);
      }
    }
  });
});

describe('requiresReasonNote', () => {
  it('returns true for NEEDS_ATTENTION', () => {
    expect(requiresReasonNote('NEEDS_ATTENTION')).toBe(true);
  });
  it('returns true for INACCESSIBLE', () => {
    expect(requiresReasonNote('INACCESSIBLE')).toBe(true);
  });
  it('returns true for LOCKED_DOWN', () => {
    expect(requiresReasonNote('LOCKED_DOWN')).toBe(true);
  });
  it('returns false for ZONE_CLEAR', () => {
    expect(requiresReasonNote('ZONE_CLEAR')).toBe(false);
  });
  it('returns false for UNVALIDATED', () => {
    expect(requiresReasonNote('UNVALIDATED')).toBe(false);
  });
  it('returns false for EVACUATION_COMPLETE (evidence required, not reason)', () => {
    expect(requiresReasonNote('EVACUATION_COMPLETE')).toBe(false);
  });
});

describe('requiresEvidence', () => {
  it('returns true ONLY for EVACUATION_COMPLETE', () => {
    for (const state of INCIDENT_ZONE_STATES) {
      expect(requiresEvidence(state)).toBe(state === 'EVACUATION_COMPLETE');
    }
  });
});

describe('isTerminalState', () => {
  it('returns true ONLY for SH_CONFIRMED_CLEAR', () => {
    for (const state of INCIDENT_ZONE_STATES) {
      expect(isTerminalState(state)).toBe(state === 'SH_CONFIRMED_CLEAR');
    }
  });
});

describe('ROLE_TO_ZONE_TRANSITION_KEY', () => {
  it('maps the 5 transition roles to short keys', () => {
    expect(ROLE_TO_ZONE_TRANSITION_KEY['GROUND_STAFF']).toBe('GS');
    expect(ROLE_TO_ZONE_TRANSITION_KEY['FLOOR_SUPERVISOR']).toBe('FS');
    expect(ROLE_TO_ZONE_TRANSITION_KEY['SHIFT_COMMANDER']).toBe('SC');
    expect(ROLE_TO_ZONE_TRANSITION_KEY['SH']).toBe('SH');
    expect(ROLE_TO_ZONE_TRANSITION_KEY['DSH']).toBe('DSH');
  });

  it('explicitly maps non-transition roles to null', () => {
    expect(ROLE_TO_ZONE_TRANSITION_KEY['FM']).toBeNull();
    expect(ROLE_TO_ZONE_TRANSITION_KEY['GM']).toBeNull();
    expect(ROLE_TO_ZONE_TRANSITION_KEY['AUDITOR']).toBeNull();
  });
});
