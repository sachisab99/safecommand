import type { FrequencyType } from '@safecommand/types';

export const FREQUENCY_WINDOW_MS: Record<string, number> = {
  HOURLY:    60 * 60 * 1000,
  EVERY_2H:  2  * 60 * 60 * 1000,
  EVERY_4H:  4  * 60 * 60 * 1000,
  EVERY_6H:  6  * 60 * 60 * 1000,
  EVERY_8H:  8  * 60 * 60 * 1000,
  DAILY:     24 * 60 * 60 * 1000,
  WEEKLY:    7  * 24 * 60 * 60 * 1000,
  MONTHLY:   30 * 24 * 60 * 60 * 1000,
  QUARTERLY: 90 * 24 * 60 * 60 * 1000,
  ANNUAL:    365 * 24 * 60 * 60 * 1000,
};

// Returns the IANA timezone UTC offset in minutes at the given moment.
// Uses 'shortOffset' timeZoneName (e.g. "GMT+5:30") — reliable across Node versions.
function getTzOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = raw.match(/GMT([+-])(\d{1,2}):?(\d{0,2})/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (parseInt(match[2]!, 10) * 60 + parseInt(match[3] || '0', 10));
}

// Returns "YYYY-MM-DD" for the given date in the target timezone.
function getLocalDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

// Converts "YYYY-MM-DD" + "HH:MM" in a timezone to a UTC Date.
function localToUtc(dateStr: string, timeStr: string, offsetMinutes: number): Date {
  // Treat as Zulu first (incorrect offset), then shift by the timezone offset.
  const asZulu = new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(asZulu.getTime() - offsetMinutes * 60_000);
}

// Returns the canonical "slot" (due_at) for this template at tick time `now`.
// Returns null for unsupported/CUSTOM frequencies.
// The slot is stable: same template + same window → same slot (idempotency key base).
export function computeCurrentSlot(
  frequency: FrequencyType,
  startTime: string | null,
  timezone: string,
  now: Date,
): Date | null {
  // For sub-daily frequencies: floor `now` to the UTC interval boundary.
  // start_time is ignored for sub-daily (treated as continuous within each window).
  const subDailyMs: Partial<Record<FrequencyType, number>> = {
    HOURLY:   60 * 60_000,
    EVERY_2H: 120 * 60_000,
    EVERY_4H: 240 * 60_000,
    EVERY_6H: 360 * 60_000,
    EVERY_8H: 480 * 60_000,
  };
  if (frequency in subDailyMs) {
    const interval = subDailyMs[frequency]!;
    return new Date(Math.floor(now.getTime() / interval) * interval);
  }

  // For daily+: anchor to start_time (default 00:00) in the template timezone.
  const [sh, sm] = startTime ? startTime.split(':').map(Number) : [0, 0];
  const timeStr = `${String(sh).padStart(2, '0')}:${String(sm!).padStart(2, '0')}`;
  const offsetMin = getTzOffsetMinutes(now, timezone);
  const localDate = getLocalDateStr(now, timezone);
  const [yr, mo] = localDate.split('-').map(Number);

  switch (frequency) {
    case 'DAILY':
      return localToUtc(localDate, timeStr, offsetMin);

    case 'WEEKLY': {
      // Monday of the current local week.
      const localNowMs = now.getTime() + offsetMin * 60_000;
      const dayOfWeek = new Date(localNowMs).getUTCDay(); // 0=Sun
      const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayMs = localNowMs + daysToMon * 86_400_000;
      const mondayStr = new Date(mondayMs).toISOString().slice(0, 10);
      return localToUtc(mondayStr, timeStr, offsetMin);
    }

    case 'MONTHLY': {
      const firstOfMonth = `${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-01`;
      return localToUtc(firstOfMonth, timeStr, offsetMin);
    }

    case 'QUARTERLY': {
      const quarterStart = Math.floor((mo! - 1) / 3) * 3 + 1;
      const firstOfQuarter = `${String(yr).padStart(4, '0')}-${String(quarterStart).padStart(2, '0')}-01`;
      return localToUtc(firstOfQuarter, timeStr, offsetMin);
    }

    case 'ANNUAL': {
      return localToUtc(`${String(yr).padStart(4, '0')}-01-01`, timeStr, offsetMin);
    }

    default:
      return null; // CUSTOM not handled
  }
}
