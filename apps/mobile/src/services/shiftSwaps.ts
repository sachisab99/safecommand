/**
 * Mobile Shift-Swap service (BR-AP) — Pattern Engine Pass 5b.
 *
 * Read + counterpart-response wrapper over /v1/shift-swaps. Propose-swap
 * (creation) ships in Pass 5b-ii once the assignment-picker UX is
 * designed — likely needs GET /v1/staff/me/assignments to surface the
 * staff_zone_assignments the requester can target.
 *
 * Spec source: SafeCommand Shift Roster Architecture v1.0 §6.7.
 *
 * STATE MACHINE (mirrors api Pass 2):
 *   REQUESTED ─┬─(counterpart accept)─→ COUNTERPART_ACCEPTED ─┬─(SH approve)─→ APPROVED
 *              │                                              └─(SH reject )─→ REJECTED
 *              ├─(counterpart decline)─────────────────────────────────────→ DECLINED
 *              ├─(requester withdraw )─────────────────────────────────────→ WITHDRAWN
 *              └─(DROP: SH approve direct)─────────────────────────────────→ APPROVED
 */

import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

export type SwapType = 'SWAP' | 'COVER' | 'DROP';

export type SwapState =
  | 'REQUESTED'
  | 'COUNTERPART_ACCEPTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DECLINED'
  | 'WITHDRAWN';

export interface ShiftSwapRow {
  id: string;
  venue_id: string;
  requester_staff_id: string;
  counterpart_staff_id: string | null;
  original_assignment_id: string;
  counterpart_assignment_id: string | null;
  swap_type: SwapType;
  reason_text: string | null;
  state: SwapState;
  requested_at: string;
  counterpart_responded_at: string | null;
  supervisor_decided_at: string | null;
  supervisor_staff_id: string | null;
}

// ─── UX helpers ─────────────────────────────────────────────────────────

export const SWAP_TYPE_LABEL: Record<SwapType, string> = {
  SWAP:  'Swap shifts',
  COVER: 'Cover my shift',
  DROP:  'Drop assignment',
};

export const STATE_LABEL: Record<SwapState, { label: string; emoji: string }> = {
  REQUESTED:            { label: 'Awaiting response',  emoji: '⏳' },
  COUNTERPART_ACCEPTED: { label: 'Awaiting SH review', emoji: '👀' },
  APPROVED:             { label: 'Approved',           emoji: '✓' },
  REJECTED:             { label: 'Rejected by SH',     emoji: '✗' },
  DECLINED:             { label: 'Declined',           emoji: '✗' },
  WITHDRAWN:            { label: 'Withdrawn',          emoji: '↺' },
};

export interface BucketedSwaps {
  awaitingMyResponse: ShiftSwapRow[];   // I'm counterpart, state=REQUESTED
  myActiveRequests: ShiftSwapRow[];     // I'm requester, state ∈ {REQUESTED, COUNTERPART_ACCEPTED}
  closedHistory: ShiftSwapRow[];        // any role, state ∈ {APPROVED, REJECTED, DECLINED, WITHDRAWN}
}

export function bucketSwaps(rows: ShiftSwapRow[], myStaffId: string): BucketedSwaps {
  const awaiting: ShiftSwapRow[] = [];
  const mine: ShiftSwapRow[] = [];
  const closed: ShiftSwapRow[] = [];
  for (const r of rows) {
    const isOpen = ['REQUESTED', 'COUNTERPART_ACCEPTED'].includes(r.state);
    if (!isOpen) { closed.push(r); continue; }
    if (r.counterpart_staff_id === myStaffId && r.state === 'REQUESTED') {
      awaiting.push(r);
    } else if (r.requester_staff_id === myStaffId) {
      mine.push(r);
    } else {
      // We're counterpart in COUNTERPART_ACCEPTED state — just waiting for SH; treat as mine for visibility
      mine.push(r);
    }
  }
  // Sort each bucket newest-first
  const byRecency = (a: ShiftSwapRow, b: ShiftSwapRow) => (a.requested_at < b.requested_at ? 1 : -1);
  return {
    awaitingMyResponse: awaiting.sort(byRecency),
    myActiveRequests: mine.sort(byRecency),
    closedHistory: closed.sort(byRecency),
  };
}

// ─── API calls ──────────────────────────────────────────────────────────

export async function fetchMySwaps(): Promise<{
  rows: ShiftSwapRow[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { rows: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<ShiftSwapRow[]>('/shift-swaps', {
    token: session.access_token,
  });
  return { rows: data ?? [], error };
}

export async function acceptSwap(id: string): Promise<{ error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { error: 'Not authenticated' };
  const { error } = await apiFetch<ShiftSwapRow>(`/shift-swaps/${id}/accept`, {
    method: 'POST',
    token: session.access_token,
    body: '{}',
  });
  return { error };
}

export async function declineSwap(id: string): Promise<{ error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { error: 'Not authenticated' };
  const { error } = await apiFetch<ShiftSwapRow>(`/shift-swaps/${id}/decline`, {
    method: 'POST',
    token: session.access_token,
    body: '{}',
  });
  return { error };
}

export async function withdrawSwap(id: string): Promise<{ error: string | null }> {
  const session = await getStoredSession();
  if (!session) return { error: 'Not authenticated' };
  const { error } = await apiFetch<ShiftSwapRow>(`/shift-swaps/${id}/withdraw`, {
    method: 'POST',
    token: session.access_token,
    body: '{}',
  });
  return { error };
}

// ─── Propose-swap helpers — Pass 5b-ii ───────────────────────────────────

/**
 * The /v1/staff/me/assignments response shape — joined shift_instance +
 * shift + zone metadata for the propose-swap picker. Matches the PostgREST
 * nested-select payload.
 */
export interface MyAssignmentRow {
  id: string;
  shift_instance_id: string;
  zone_id: string;
  assignment_type: 'PRIMARY' | 'SECONDARY' | 'BACKUP' | null;
  shift_instances: {
    id: string;
    shift_date: string;
    shift_id: string;
    status: string;
    shifts: {
      id: string;
      name: string | null;
      start_time: string;
      end_time: string;
    } | null;
  } | null;
  zones: {
    id: string;
    name: string;
  } | null;
}

/** Flatter UX-ready shape derived from MyAssignmentRow. */
export interface AssignmentForPicker {
  assignment_id: string;
  shift_instance_id: string;
  shift_date: string;
  shift_label: string;
  zone_name: string;
  assignment_type: string;
}

function flattenAssignment(r: MyAssignmentRow): AssignmentForPicker | null {
  const si = r.shift_instances;
  const sh = si?.shifts;
  const zn = r.zones;
  if (!si || !sh || !zn) return null;
  const label = sh.name ?? `${sh.start_time.slice(0, 5)}-${sh.end_time.slice(0, 5)}`;
  return {
    assignment_id: r.id,
    shift_instance_id: r.shift_instance_id,
    shift_date: si.shift_date,
    shift_label: label,
    zone_name: zn.name,
    assignment_type: r.assignment_type ?? 'PRIMARY',
  };
}

export async function fetchMyAssignments(): Promise<{
  rows: AssignmentForPicker[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { rows: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<MyAssignmentRow[]>('/staff/me/assignments', {
    token: session.access_token,
  });
  if (error) return { rows: [], error };
  const flattened = (data ?? []).map(flattenAssignment).filter((x): x is AssignmentForPicker => x !== null);
  return { rows: flattened, error: null };
}

/** Counterpart-picker source — already exists at /v1/staff but command-role-gated.
 *  For non-command callers, the api returns 403. Caller surfaces this gracefully:
 *  "You can propose DROPs without a counterpart. SWAP/COVER needs SH coordination
 *   for now." */
export interface StaffListRow {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

export async function fetchVenueStaff(): Promise<{
  rows: StaffListRow[];
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { rows: [], error: 'Not authenticated' };
  const { data, error } = await apiFetch<StaffListRow[]>('/staff', {
    token: session.access_token,
  });
  if (error) return { rows: [], error };
  return { rows: (data ?? []).filter((s) => s.is_active), error: null };
}

export interface ProposeSwapInput {
  swap_type: SwapType;
  original_assignment_id: string;
  counterpart_staff_id?: string;       // SWAP + COVER only
  counterpart_assignment_id?: string;  // SWAP only
  reason_text?: string;
}

export async function proposeSwap(input: ProposeSwapInput): Promise<{
  row: ShiftSwapRow | null;
  error: string | null;
}> {
  const session = await getStoredSession();
  if (!session) return { row: null, error: 'Not authenticated' };
  const body: Record<string, unknown> = {
    swap_type: input.swap_type,
    original_assignment_id: input.original_assignment_id,
  };
  if (input.counterpart_staff_id) body['counterpart_staff_id'] = input.counterpart_staff_id;
  if (input.counterpart_assignment_id) body['counterpart_assignment_id'] = input.counterpart_assignment_id;
  if (input.reason_text) body['reason_text'] = input.reason_text;
  const { data, error } = await apiFetch<ShiftSwapRow>('/shift-swaps', {
    method: 'POST',
    token: session.access_token,
    body: JSON.stringify(body),
  });
  return { row: data, error };
}
