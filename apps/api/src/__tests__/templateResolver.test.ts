/**
 * Unit tests for the EC-23 template resolution chain.
 *
 * The matchTier function is the heart of EC-23. Tests below cover all 6
 * specificity tiers, the rejection paths (wrong venue / wrong venue-type /
 * wrong sub-type), and the precedence ordering used by the resolver to
 * pick the most-specific match.
 *
 * The resolveTemplate function itself is integration-tested against the
 * live DB via a separate harness (see Day 1 manual verification). Pure
 * unit tests here cover the deterministic tier logic.
 */

import { describe, it, expect } from 'vitest';
import { matchTier, type TemplateResolveContext } from '../services/sire/templateResolver.js';

const VENUE_A = '00000000-0000-0000-0000-000000000001';
const VENUE_B = '00000000-0000-0000-0000-000000000002';

const ctx: TemplateResolveContext = {
  venue_id: VENUE_A,
  venue_type: 'HOSPITAL',
  incident_type: 'FIRE',
  incident_subtype: 'FIRE_CONTAINED',
  staff_role: 'SH',
};

describe('matchTier — happy paths (all 6 tiers)', () => {
  it('Tier 1: venue + sub-type', () => {
    expect(
      matchTier(
        { venue_id: VENUE_A, venue_type: null, incident_subtype: 'FIRE_CONTAINED' },
        ctx,
      ),
    ).toBe(1);
  });

  it('Tier 2: venue + parent type (sub-type NULL)', () => {
    expect(
      matchTier(
        { venue_id: VENUE_A, venue_type: null, incident_subtype: null },
        ctx,
      ),
    ).toBe(2);
  });

  it('Tier 3: venue-type + sub-type (venue NULL)', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: 'HOSPITAL', incident_subtype: 'FIRE_CONTAINED' },
        ctx,
      ),
    ).toBe(3);
  });

  it('Tier 4: venue-type + parent type', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: 'HOSPITAL', incident_subtype: null },
        ctx,
      ),
    ).toBe(4);
  });

  it('Tier 5: global + sub-type', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: null, incident_subtype: 'FIRE_CONTAINED' },
        ctx,
      ),
    ).toBe(5);
  });

  it('Tier 6: global + parent type (the mandatory floor)', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: null, incident_subtype: null },
        ctx,
      ),
    ).toBe(6);
  });
});

describe('matchTier — rejection paths', () => {
  it('rejects rows for a different venue', () => {
    expect(
      matchTier(
        { venue_id: VENUE_B, venue_type: null, incident_subtype: null },
        ctx,
      ),
    ).toBeNull();
  });

  it('rejects rows for a different venue-type', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: 'MALL', incident_subtype: null },
        ctx,
      ),
    ).toBeNull();
  });

  it('rejects venue+sub rows where sub-type does not match (would otherwise be tier 1)', () => {
    expect(
      matchTier(
        { venue_id: VENUE_A, venue_type: null, incident_subtype: 'FIRE_SPREADING' },
        ctx,
      ),
    ).toBeNull();
  });

  it('rejects venue-type+sub rows where sub-type does not match', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: 'HOSPITAL', incident_subtype: 'FIRE_SPREADING' },
        ctx,
      ),
    ).toBeNull();
  });

  it('rejects global+sub rows where sub-type does not match', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: null, incident_subtype: 'FIRE_SPREADING' },
        ctx,
      ),
    ).toBeNull();
  });
});

describe('matchTier — context with NULL incident_subtype (parent declaration)', () => {
  // When SH declares "FIRE" without a sub-type, we want the chain to skip
  // tier-1/3/5 (sub-type-specific) and land on tier 2/4/6 (parent rows).
  const parentCtx: TemplateResolveContext = {
    venue_id: VENUE_A,
    venue_type: 'HOSPITAL',
    incident_type: 'FIRE',
    incident_subtype: null, // ← parent declaration
    staff_role: 'SH',
  };

  it('Tier 2 still matches venue+parent row', () => {
    expect(
      matchTier(
        { venue_id: VENUE_A, venue_type: null, incident_subtype: null },
        parentCtx,
      ),
    ).toBe(2);
  });

  it('Tier 6 still matches global+parent row (the floor)', () => {
    expect(
      matchTier(
        { venue_id: null, venue_type: null, incident_subtype: null },
        parentCtx,
      ),
    ).toBe(6);
  });

  it('Tier 1 row (with concrete sub-type) does NOT match a NULL-subtype context', () => {
    // A FIRE_CONTAINED-specific venue row should not be returned when the
    // SH declares a generic FIRE (no sub-type).
    expect(
      matchTier(
        { venue_id: VENUE_A, venue_type: null, incident_subtype: 'FIRE_CONTAINED' },
        parentCtx,
      ),
    ).toBeNull();
  });
});
