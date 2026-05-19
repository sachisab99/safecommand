'use client';

/**
 * Compliance Exports — BR-20. Generates an authority-oriented venue-wide
 * PDF (Fire NOC / NABH / Full Audit) over a date range. The api renders +
 * stores the PDF and returns a short-lived presigned URL we open directly.
 * Role-gated to SH/DSH/GM/AUDITOR (api enforces; UI mirrors).
 */

import { useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { getSession } from '../../../lib/auth';
import {
  requestComplianceExport,
  canExportCompliance,
  type ComplianceReportType,
  type ComplianceExportResult,
} from '../../../lib/compliance';

const TYPES: { id: ComplianceReportType; label: string; blurb: string }[] = [
  {
    id: 'FIRE_NOC',
    label: 'Fire NOC',
    blurb: 'NBC 2016 P4 · Telangana FF-3 · NFPA 101/1620. Mock-drill register, fire-equipment register, fire-safety certs, FIRE/EVAC incident + evacuation audit.',
  },
  {
    id: 'NABH',
    label: 'NABH §EM',
    blurb: 'NABH 6th §FMS + §EM. Emergency drills, equipment posture, staff competence, incident response, safety health score.',
  },
  {
    id: 'FULL_AUDIT',
    label: 'Full Audit',
    blurb: 'Composite (NBC / NABH / NFPA / OSHA / insurance). Health score breakdown + every register + all incidents.',
  },
];

const PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
  { id: 'custom', label: 'Custom', days: null },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ComplianceExportsPage() {
  const role = useMemo(() => getSession()?.staff.role, []);
  const allowed = canExportCompliance(role);

  const [type, setType] = useState<ComplianceReportType>('FIRE_NOC');
  const [preset, setPreset] = useState('90');
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ComplianceExportResult | null>(null);

  const applyPreset = (id: string) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p?.days != null) {
      setFrom(isoDaysAgo(p.days));
      setTo(todayIso());
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    const { data, error: e } = await requestComplianceExport(type, from, to);
    setBusy(false);
    if (e || !data) {
      setError(e ?? 'Generation failed');
      return;
    }
    setResult(data);
    if (typeof window !== 'undefined') window.open(data.url, '_blank', 'noopener');
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Compliance Exports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate an authority-oriented compliance PDF for this venue · BR-20
          </p>
        </div>

        {!allowed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Compliance exports are restricted to Security Head, Deputy SH, General
            Manager, and Auditor roles. Your role ({role ?? 'unknown'}) cannot generate
            these reports.
          </div>
        )}

        {allowed && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Report type</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      type === t.id
                        ? 'border-red-500 bg-red-50 ring-1 ring-red-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{t.label}</div>
                    <div className="mt-1 text-xs leading-snug text-slate-500">{t.blurb}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Reporting period</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      preset === p.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-xs text-slate-600">
                  From
                  <input
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPreset('custom');
                    }}
                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  To
                  <input
                    type="date"
                    value={to}
                    min={from}
                    max={todayIso()}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPreset('custom');
                    }}
                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </label>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-semibold">Report generated · {result.report_ref}</div>
                <div className="mt-1 text-xs">
                  The PDF opened in a new tab. The link is valid for ~15 minutes —{' '}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline"
                  >
                    open again
                  </a>
                  . Re-generate any time for a fresh copy.
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Generating…' : 'Generate PDF'}
            </button>

            <p className="text-xs text-slate-400">
              System-generated from immutable operational records. Source-derived and
              tamper-evident; not a substitute for statutory inspection. Every page
              carries the &lsquo;Powered by SafeCommand&rsquo; credit.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
