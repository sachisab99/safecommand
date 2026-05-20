'use client';

/**
 * BreaksEditor — client component for editing a shift's break windows
 * (BR-AR / mig 021). Renders add/remove break rows; submits as a
 * JSON-encoded hidden `breaks_json` field consumed by
 * `createShiftAction` / `updateShiftAction` (which parses + validates
 * via `parseBreaksJson` + overnight-aware `validateBreaks` in
 * `apps/ops-console/actions/shifts.ts`).
 *
 * Server-side is the source of truth for validation; this component is
 * a UX convenience. Empty / no rows = `[]` (the migration default) =
 * no breaks defined.
 *
 * Time fields are HH:MM (HTML `<input type="time">`). For overnight
 * shifts (end_time < start_time), the server-side validator maps both
 * pre-midnight and post-midnight times to shift-relative minutes; the
 * user simply enters wall-clock times.
 */

import { useState } from 'react';
import type { ShiftBreak } from '@safecommand/types';

interface Props {
  defaultBreaks?: ShiftBreak[];
}

export function BreaksEditor({ defaultBreaks = [] }: Props): React.JSX.Element {
  const [rows, setRows] = useState<ShiftBreak[]>(defaultBreaks);

  const update = (idx: number, patch: Partial<ShiftBreak>): void => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = (): void => {
    setRows((prev) => [...prev, { start_time: '', end_time: '', label: '' }]);
  };

  const removeRow = (idx: number): void => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {/* Hidden field consumed by the server action */}
      <input type="hidden" name="breaks_json" value={JSON.stringify(rows)} />

      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No breaks defined. Click &ldquo;+ Add break&rdquo; to add one. Breaks are optional.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-center flex-wrap">
              <input
                type="time"
                value={row.start_time}
                onChange={(e) => update(idx, { start_time: e.target.value })}
                required
                className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Break ${idx + 1} start time`}
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="time"
                value={row.end_time}
                onChange={(e) => update(idx, { end_time: e.target.value })}
                required
                className="px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Break ${idx + 1} end time`}
              />
              <input
                type="text"
                value={row.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="Label (e.g. Lunch, Tea)"
                maxLength={50}
                required
                className="flex-1 min-w-32 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`Break ${idx + 1} label`}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                aria-label={`Remove break ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
      >
        + Add break
      </button>

      <p className="text-xs text-gray-400">
        Each break must lie within the shift&apos;s start–end window. Overnight shifts
        (end before start) are handled automatically. Server-side validates
        non-overlap, HH:MM format, and 1–50-char labels.
      </p>
    </div>
  );
}
