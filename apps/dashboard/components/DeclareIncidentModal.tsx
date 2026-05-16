'use client';

/**
 * DeclareIncidentButton + DeclareIncidentModal — command-desk incident
 * declaration on the dashboard (parity with mobile IncidentScreen / BR-11).
 *
 * Drop-in: <DeclareIncidentButton /> renders nothing for roles that can't
 * declare (defence-in-depth — the api also enforces requireRole). Reads
 * the session client-side (post-mount, Drawer pattern) to avoid SSR
 * hydration mismatch. On success navigates to the new incident's detail.
 *
 * Purely additive — no existing dashboard surface is modified.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib/auth';
import {
  declareIncident,
  fetchZones,
  canDeclare,
  INCIDENT_TYPES,
  SEVERITIES,
  SIRE_SUBTYPES,
  type ZoneRef,
} from '../lib/incidents';
import type { IncidentType, IncidentSeverity } from '@safecommand/types';

export function DeclareIncidentButton() {
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRole(getSession()?.staff.role ?? null);
  }, []);

  if (!canDeclare(role)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
      >
        ⚠ Declare incident
      </button>
      {open && <DeclareIncidentModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DeclareIncidentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity | null>(null);
  const [zones, setZones] = useState<ZoneRef[]>([]);
  const [zoneId, setZoneId] = useState<string>('');
  const [enableSire, setEnableSire] = useState(false);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchZones().then((z) => {
      if (alive) setZones(z);
    });
    return () => {
      alive = false;
    };
  }, []);

  const subtypeOptions = type ? (SIRE_SUBTYPES[type] ?? []) : [];

  const submit = async () => {
    if (!type || !severity) {
      setError('Pick an incident type and severity.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await declareIncident({
      incident_type: type,
      severity,
      zone_id: zoneId || undefined,
      enable_sire: enableSire || undefined,
      incident_subtype: enableSire ? subtype ?? undefined : undefined,
      affected_zone_ids: enableSire && zoneId ? [zoneId] : undefined,
    });
    setSubmitting(false);
    if (res.ok && res.incidentId) {
      onClose();
      router.push(`/incidents/${res.incidentId}`);
    } else {
      setError(res.error ?? 'Could not declare incident. Try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Declare incident</h3>
        <p className="mt-1 text-sm text-slate-600">
          Command-desk declaration. The on-site mobile flow remains the primary path.
        </p>

        {/* Type */}
        <label className="mt-4 block text-xs font-medium text-slate-500">Type</label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => {
                setType(t.type);
                setSubtype(null);
              }}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                type === t.type
                  ? 'border-red-500 bg-red-50 font-semibold text-red-900'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Severity */}
        <label className="mt-4 block text-xs font-medium text-slate-500">Severity</label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {SEVERITIES.map((sv) => (
            <button
              key={sv.level}
              type="button"
              onClick={() => setSeverity(sv.level)}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                severity === sv.level
                  ? 'border-red-500 bg-red-50 font-semibold text-red-900'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {sv.label}
            </button>
          ))}
        </div>

        {/* Zone */}
        <label className="mt-4 block text-xs font-medium text-slate-500">
          Zone <span className="text-slate-400">(optional — venue-wide if blank)</span>
        </label>
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— Venue-wide —</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>

        {/* SIRE toggle */}
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={enableSire}
            onChange={(e) => {
              setEnableSire(e.target.checked);
              if (!e.target.checked) setSubtype(null);
            }}
          />
          Structured Incident Response (SIRE) — per-role action templates + zone state grid
        </label>

        {/* Sub-type (FIRE / EVACUATION only, parity with mobile) */}
        {enableSire && subtypeOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {subtypeOptions.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSubtype(subtype === st ? null : st)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  subtype === st
                    ? 'border-blue-500 bg-blue-600 font-semibold text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {st.replace(/^(FIRE|EVACUATION)_/, '').replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Declaring…' : '⚠ Declare incident'}
          </button>
        </div>
      </div>
    </div>
  );
}
