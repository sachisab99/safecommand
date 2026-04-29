/**
 * Sprint 1 Gate 1 — RLS Isolation Proof
 * Creates 2 venues, inserts data into venue_1, queries as venue_2 context → must return 0 rows.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function genVenueCode(type, city) {
  const { data, error } = await svc.rpc('generate_venue_code', { p_type: type, p_city: city });
  if (error) throw new Error('generate_venue_code failed: ' + error.message);
  return data;
}

async function run() {
  console.log('\n=== Sprint 1 Gate 1: RLS Isolation Proof ===\n');

  // ── 1. Create Venue 1 ─────────────────────────────────────────────────────
  const code1 = await genVenueCode('MALL', 'HYD');
  const { data: v1, error: v1Err } = await svc
    .from('venues')
    .insert({ name: 'RLS Test Venue Alpha', type: 'MALL', city: 'HYD', venue_code: code1 })
    .select('id, venue_code')
    .single();

  if (v1Err) { console.error('Venue 1 create failed:', v1Err.message); process.exit(1); }
  console.log('✓ Venue 1 created:', v1.venue_code, '(' + v1.id + ')');

  // ── 2. Create Venue 2 ─────────────────────────────────────────────────────
  const code2 = await genVenueCode('HOTEL', 'BLR');
  const { data: v2, error: v2Err } = await svc
    .from('venues')
    .insert({ name: 'RLS Test Venue Beta', type: 'HOTEL', city: 'BLR', venue_code: code2 })
    .select('id, venue_code')
    .single();

  if (v2Err) { console.error('Venue 2 create failed:', v2Err.message); process.exit(1); }
  console.log('✓ Venue 2 created:', v2.venue_code, '(' + v2.id + ')');

  // ── 3. Create SH staff for Venue 1 ────────────────────────────────────────
  const { data: sh1, error: sh1Err } = await svc
    .from('staff')
    .insert({ venue_id: v1.id, name: 'Alpha SH', phone: '+910000000001', role: 'SH' })
    .select('id')
    .single();

  if (sh1Err) { console.error('Staff V1 create failed:', sh1Err.message); process.exit(1); }
  console.log('✓ Venue 1 SH staff created:', sh1.id);

  // ── 4. Create SH staff for Venue 2 ────────────────────────────────────────
  const { data: sh2, error: sh2Err } = await svc
    .from('staff')
    .insert({ venue_id: v2.id, name: 'Beta SH', phone: '+910000000002', role: 'SH' })
    .select('id')
    .single();

  if (sh2Err) { console.error('Staff V2 create failed:', sh2Err.message); process.exit(1); }
  console.log('✓ Venue 2 SH staff created:', sh2.id);

  // ── 5. Insert floor in Venue 1 ────────────────────────────────────────────
  const { data: fl1, error: fl1Err } = await svc
    .from('floors')
    .insert({ venue_id: v1.id, name: 'Ground Floor', floor_number: 0 })
    .select('id')
    .single();

  if (fl1Err) { console.error('Floor V1 create failed:', fl1Err.message); process.exit(1); }
  console.log('✓ Venue 1 floor created:', fl1.id);

  // ── 6. RLS ISOLATION TEST — Floors ────────────────────────────────────────
  console.log('\n--- Setting tenant context to Venue 2, querying Venue 1 floors ---');

  const { error: ctxErr } = await svc.rpc('set_tenant_context', {
    p_venue_id: v2.id,
    p_staff_id: sh2.id,
    p_role: 'SH',
  });
  if (ctxErr) { console.error('set_tenant_context failed:', ctxErr.message); process.exit(1); }

  // Explicitly try to get Venue 1 floors — RLS must block this
  const { data: leakedFloors, error: leakErr } = await svc
    .from('floors')
    .select('id, venue_id')
    .eq('venue_id', v1.id);

  if (leakErr) { console.error('Floors query error:', leakErr.message); process.exit(1); }

  if ((leakedFloors?.length ?? 0) === 0) {
    console.log('✓ PASS — Floor cross-venue query returned 0 rows. RLS isolation working.\n');
  } else {
    console.error(`✗ FAIL — Floor cross-venue query returned ${leakedFloors.length} rows! RLS BREACH!\n`);
    process.exit(1);
  }

  // ── 7. RLS ISOLATION TEST — Staff ─────────────────────────────────────────
  console.log('--- Querying Venue 1 staff as Venue 2 context ---');

  const { data: leakedStaff, error: staffLeakErr } = await svc
    .from('staff')
    .select('id, venue_id, name')
    .eq('venue_id', v1.id);

  if (staffLeakErr) { console.error('Staff query error:', staffLeakErr.message); process.exit(1); }

  if ((leakedStaff?.length ?? 0) === 0) {
    console.log('✓ PASS — Staff cross-venue query returned 0 rows.\n');
  } else {
    console.error(`✗ FAIL — Staff query returned ${leakedStaff.length} rows across venues! RLS BREACH!\n`);
    process.exit(1);
  }

  // ── 8. RLS ISOLATION TEST — Venue itself ──────────────────────────────────
  console.log('--- Querying Venue 1 record as Venue 2 context ---');

  const { data: leakedVenue, error: venueLeakErr } = await svc
    .from('venues')
    .select('id, name')
    .eq('id', v1.id);

  if (venueLeakErr) { console.error('Venue query error:', venueLeakErr.message); process.exit(1); }

  if ((leakedVenue?.length ?? 0) === 0) {
    console.log('✓ PASS — Venue record cross-venue query returned 0 rows.\n');
  } else {
    console.error(`✗ FAIL — Venue record returned ${leakedVenue.length} rows! RLS BREACH!\n`);
    process.exit(1);
  }

  // ── 9. Cleanup ────────────────────────────────────────────────────────────
  // Use service role bypass to clean up test data
  await svc.from('floors').delete().eq('id', fl1.id);
  await svc.from('staff').delete().in('id', [sh1.id, sh2.id]);
  await svc.from('venues').delete().in('id', [v1.id, v2.id]);
  console.log('✓ Test data cleaned up.\n');

  console.log('=== Gate 1 PASSED: RLS multi-tenant isolation is proven ✓ ===\n');
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
