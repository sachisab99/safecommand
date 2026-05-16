/**
 * Structured error-code catalog (shared: api + mobile + dashboard).
 *
 * Why: a render crash like "cannot read property 'map' of undefined" should
 * never reach the user. Every failure is given a stable CODE, a CATEGORY
 * (drives retry/affordance), and a human title+message. The api already
 * emits `{ error: { code, message } }`; this catalog makes those codes a
 * typed, classified contract instead of ad-hoc strings, and adds the
 * CLIENT-side codes (network / shape / render) the wire never sends.
 *
 * Adoption is incremental: this is the registry + the SIRE surface uses it
 * now (service normalisation + ErrorBoundary). Other services migrate to
 * `describeError()` over time — nothing breaks meanwhile because unknown
 * codes degrade to a safe UNKNOWN descriptor that preserves the raw code.
 *
 * Code convention: SCREAMING_SNAKE. Server codes keep their existing bare
 * names (back-compat with deployed api). Client codes are prefixed by
 * concern (NET_/RESP_/RENDER_/AUTH_) so they are greppable + unambiguous.
 */

export type ErrorCategory =
  | 'USER' // bad input / precondition the user can correct
  | 'AUTH' // not authenticated / not authorised / session expired
  | 'CONFLICT' // optimistic-lock / state moved under the caller
  | 'NETWORK' // offline / timeout / unreachable
  | 'CLIENT' // bug on the client: bad shape, render crash
  | 'SERVER'; // unexpected server-side failure

export interface ErrorDescriptor {
  code: string;
  category: ErrorCategory;
  /** Short, user-facing heading. */
  title: string;
  /** One calm sentence; never a stack trace. */
  message: string;
  /** Whether a "Try again" affordance makes sense. */
  retryable: boolean;
}

// ─── Client-side codes (the wire never sends these) ──────────────────────────
export const CLIENT_ERROR_CODES = {
  NET_OFFLINE: 'NET_OFFLINE',
  NET_TIMEOUT: 'NET_TIMEOUT',
  RESP_SHAPE: 'RESP_SHAPE', // response missing/!= expected shape (version skew)
  RENDER_CRASH: 'RENDER_CRASH', // a component threw during render
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  UNKNOWN: 'UNKNOWN',
} as const;

// ─── Catalog ─────────────────────────────────────────────────────────────────
// Keyed by code. Server codes here mirror api emitters (apps/api/src/routes).
const CATALOG: Record<string, ErrorDescriptor> = {
  // Client
  NET_OFFLINE: { code: 'NET_OFFLINE', category: 'NETWORK', title: 'No connection', message: 'You appear to be offline. Check your connection and try again.', retryable: true },
  NET_TIMEOUT: { code: 'NET_TIMEOUT', category: 'NETWORK', title: 'Connection slow', message: 'The request took too long. Try again in a moment.', retryable: true },
  RESP_SHAPE: { code: 'RESP_SHAPE', category: 'CLIENT', title: 'Update needed', message: 'This screen received unexpected data (the app or server may need updating). Showing what we can.', retryable: true },
  RENDER_CRASH: { code: 'RENDER_CRASH', category: 'CLIENT', title: 'This section could not load', message: 'Something went wrong displaying this section. The rest of the screen is still usable.', retryable: true },
  AUTH_EXPIRED: { code: 'AUTH_EXPIRED', category: 'AUTH', title: 'Session expired', message: 'Please sign in again to continue.', retryable: false },
  UNKNOWN: { code: 'UNKNOWN', category: 'SERVER', title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.', retryable: true },

  // Server — auth / authorisation
  NOT_AUTHORISED: { code: 'NOT_AUTHORISED', category: 'AUTH', title: 'Not allowed', message: 'You do not have permission for this action.', retryable: false },
  NOT_OWNER: { code: 'NOT_OWNER', category: 'AUTH', title: 'Not allowed', message: 'Only the assigned staff member can update this.', retryable: false },

  // Server — not found / conflict
  NOT_FOUND: { code: 'NOT_FOUND', category: 'USER', title: 'Not found', message: 'That item no longer exists or is not visible to you.', retryable: false },
  STATE_CHANGED: { code: 'STATE_CHANGED', category: 'CONFLICT', title: 'Updated elsewhere', message: 'Someone else changed this just now. Reloaded — please review and retry.', retryable: true },

  // Server — validation (user can correct)
  INVALID_TRANSITION: { code: 'INVALID_TRANSITION', category: 'USER', title: 'Not a valid step', message: 'That state change is not allowed from here for your role.', retryable: false },
  INVALID_STATUS_TRANSITION: { code: 'INVALID_STATUS_TRANSITION', category: 'USER', title: 'Not a valid step', message: 'That status change is not allowed from the current status.', retryable: false },
  REASON_NOTE_REQUIRED: { code: 'REASON_NOTE_REQUIRED', category: 'USER', title: 'Reason needed', message: 'This action requires a short reason note.', retryable: false },
  EVIDENCE_REQUIRED: { code: 'EVIDENCE_REQUIRED', category: 'USER', title: 'Photo needed', message: 'This action requires a photo before it can be submitted.', retryable: false },
  BLOCKED_REASON_REQUIRED: { code: 'BLOCKED_REASON_REQUIRED', category: 'USER', title: 'Reason needed', message: 'Blocking an action requires a reason.', retryable: false },
  ZONES_REQUIRED: { code: 'ZONES_REQUIRED', category: 'USER', title: 'Select zones', message: 'Select at least one zone for a selective evacuation.', retryable: false },
  EVIDENCE_URL_REQUIRED: { code: 'EVIDENCE_URL_REQUIRED', category: 'USER', title: 'Photo needed', message: 'A photo is required to post incident evidence.', retryable: false },

  // Server — should-not-happen safety nets
  EC23_VIOLATION: { code: 'EC23_VIOLATION', category: 'SERVER', title: 'No action list found', message: 'No response template could be resolved. Contact SafeCommand Ops.', retryable: false },
  NOT_SIRE_INCIDENT: { code: 'NOT_SIRE_INCIDENT', category: 'USER', title: 'Not applicable', message: 'This action only applies to structured-response incidents.', retryable: false },
};

/**
 * Resolve any code (typed or raw wire string) to a descriptor.
 * Unknown codes degrade to UNKNOWN but keep the raw code for logs.
 */
export function describeError(code?: string | null): ErrorDescriptor {
  if (!code) return CATALOG['UNKNOWN']!;
  const hit = CATALOG[code];
  if (hit) return hit;
  return { ...CATALOG['UNKNOWN']!, code };
}

/** Map a fetch failure / HTTP status to a client code before describeError. */
export function classifyTransport(status: number | null, offline: boolean): string {
  if (offline) return CLIENT_ERROR_CODES.NET_OFFLINE;
  if (status === null) return CLIENT_ERROR_CODES.NET_TIMEOUT;
  if (status === 401 || status === 403) return 'NOT_AUTHORISED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'STATE_CHANGED';
  if (status >= 500) return CLIENT_ERROR_CODES.UNKNOWN;
  return CLIENT_ERROR_CODES.UNKNOWN;
}
