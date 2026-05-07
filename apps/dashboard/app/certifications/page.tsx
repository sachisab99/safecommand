'use client';

/**
 * /certifications — venue-wide cert compliance view (BR-22).
 *
 * Reads /v1/certifications which returns the full list with staff names
 * joined. Phase 5.15: SH/DSH/FM can add + edit certs; SH/DSH can delete.
 *
 * Refs: BR-22 (Staff Certification Tracker), BR-14 (Health Score 15% weight),
 * BR-B (Cert Expiry Warning on Shift Activation).
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { getSession } from '../../lib/auth';

/* ─── Write helpers (Phase 5.15 — SH/DSH/FM add+edit; SH/DSH delete) ─────── */

const WRITE_ROLES = ['SH', 'DSH', 'FM'];
const DELETE_ROLES = ['SH', 'DSH'];

interface CertWritePayload {
  staff_id: string;
  certification_name: string;
  issued_at: string;
  expires_at: string;
  document_url: string | null;
}

async function postCertification(payload: CertWritePayload) {
  return apiFetch('/certifications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function patchCertification(id: string, payload: Partial<CertWritePayload>) {
  return apiFetch(`/certifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function deleteCertificationApi(id: string) {
  return apiFetch(`/certifications/${id}`, { method: 'DELETE' });
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CertWithStaff {
  id: string;
  venue_id: string;
  staff_id: string;
  certification_name: string;
  issued_at: string;
  expires_at: string;
  document_url: string | null;
  staff: { name: string; role: string } | null;
}

interface StaffRef {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
}

type ExpiryBucket = 'OK' | 'DUE_90' | 'DUE_30' | 'DUE_7' | 'EXPIRED';

/* ─── Visual config ──────────────────────────────────────────────────────── */

const BUCKET_CONFIG: Record<
  ExpiryBucket,
  { label: (d: number) => string; cls: string; rank: number }
> = {
  EXPIRED: {
    label: (d) => `EXPIRED ${Math.abs(d)}d`,
    cls: 'bg-red-700 text-white',
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-red-100 text-red-700 border border-red-200',
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Expires in ${d}d`,
    cls: 'bg-amber-100 text-amber-700 border border-amber-200',
    rank: 2,
  },
  OK: {
    label: () => 'OK',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rank: 1,
  },
};

/** Common certification names — used as datalist suggestions in the editor */
const COMMON_CERT_NAMES = [
  'First Aid',
  'CPR / BLS',
  'Fire Safety / Fire Warden',
  'Security Guard License (PSARA)',
  'Defensive Driving',
  'Hazardous Materials Handling',
  'Working at Heights',
  'Electrical Safety',
  'Food Safety / FSSAI',
  'NABH Internal Auditor',
  'AED Operator',
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(date + 'T00:00:00+05:30');
  return Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function bucket(days: number): ExpiryBucket {
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'DUE_7';
  if (days <= 30) return 'DUE_30';
  if (days <= 90) return 'DUE_90';
  return 'OK';
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function CertificationsPage() {
  const [certs, setCerts] = useState<CertWithStaff[]>([]);
  const [staff, setStaff] = useState<StaffRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 5.15 — write surface state. canWrite drives Add/Edit; canDelete
  // drives Delete. api requireRole returns 403 if a non-eligible role
  // tries to bypass the UI hide.
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<CertWithStaff | null>(null);
  const canWrite = staffRole !== null && WRITE_ROLES.includes(staffRole);
  const canDelete = staffRole !== null && DELETE_ROLES.includes(staffRole);

  // Hydration-safe role read
  useEffect(() => {
    const session = getSession();
    if (session) setStaffRole(session.staff.role);
  }, []);

  const refetch = async () => {
    const [{ data: certData, error: ce }, { data: staffData }] = await Promise.all([
      apiFetch<CertWithStaff[]>('/certifications'),
      apiFetch<StaffRef[]>('/staff'),
    ]);
    setLoading(false);
    if (ce) setError(ce);
    else {
      setError(null);
      setCerts(certData ?? []);
      setStaff((staffData ?? []).filter((s) => s.is_active));
    }
  };

  useEffect(() => {
    void refetch();
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, []);

  // Compliance stats (matches api formula)
  const buckets = { ok: 0, due_90: 0, due_30: 0, due_7: 0, expired: 0 };
  for (const c of certs) {
    const b = bucket(daysUntil(c.expires_at));
    if (b === 'OK') buckets.ok++;
    else if (b === 'DUE_90') buckets.due_90++;
    else if (b === 'DUE_30') buckets.due_30++;
    else if (b === 'DUE_7') buckets.due_7++;
    else buckets.expired++;
  }
  const total = certs.length;
  const score = total === 0 ? 100 : Math.round((buckets.ok / total) * 100);
  const scoreColour =
    score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700';

  // Sort: most urgent first
  const sorted = [...certs].sort((a, b) => {
    const ra = BUCKET_CONFIG[bucket(daysUntil(a.expires_at))].rank;
    const rb = BUCKET_CONFIG[bucket(daysUntil(b.expires_at))].rank;
    if (ra !== rb) return rb - ra;
    return a.expires_at.localeCompare(b.expires_at);
  });

  const handleDelete = async (cert: CertWithStaff) => {
    const certName = cert.certification_name;
    const staffName = cert.staff?.name ?? 'this staff member';
    if (!window.confirm(`Delete "${certName}" for ${staffName}? This cannot be undone.`)) return;
    const { error: e } = await deleteCertificationApi(cert.id);
    if (e) {
      window.alert(`Could not delete: ${e}`);
      return;
    }
    await refetch();
  };

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <PageHeader
          canWrite={canWrite}
          onAdd={() => {
            setEditingCert(null);
            setEditorOpen(true);
          }}
        />

        {loading && <div className="text-slate-400 text-sm">Loading certifications…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && certs.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📜</div>
            <div className="font-semibold text-slate-700">No certifications registered</div>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
              {canWrite
                ? 'Click "+ Add cert" above to register your first staff credential (First Aid, Fire Safety, Security Guard License, etc).'
                : 'Track staff professional credentials via Operations Console.'}
            </p>
          </div>
        )}

        {!loading && !error && certs.length > 0 && (
          <>
            {/* Compliance summary */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6 mb-4 sm:mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Certification Compliance
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    % of certs ≥90 days to expiry
                  </p>
                </div>
                <div className={`text-4xl font-black ${scoreColour}`}>{score}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                <Tile label="Total" value={total} tone="neutral" />
                <Tile label="OK (>90d)" value={buckets.ok} tone={buckets.ok > 0 ? 'good' : 'neutral'} />
                <Tile label="Due 30-90d" value={buckets.due_90} tone={buckets.due_90 > 0 ? 'warn' : 'neutral'} />
                <Tile label="Due 7-30d" value={buckets.due_30} tone={buckets.due_30 > 0 ? 'warn' : 'neutral'} />
                <Tile
                  label="Due ≤7d / expired"
                  value={buckets.due_7 + buckets.expired}
                  tone={buckets.due_7 + buckets.expired > 0 ? 'bad' : 'neutral'}
                />
              </div>
            </section>

            {/* Certifications list */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">All Certifications</h2>
                <span className="text-xs text-slate-500">
                  {sorted.length} · sorted by urgency
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {sorted.map((cert) => {
                  const days = daysUntil(cert.expires_at);
                  const cfg = BUCKET_CONFIG[bucket(days)];
                  return (
                    <div
                      key={cert.id}
                      className="px-5 sm:px-6 py-4 flex items-center gap-3 sm:gap-4"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                        {cert.staff?.name.charAt(0) ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {cert.certification_name}
                        </div>
                        <div className="text-slate-500 text-xs sm:text-sm truncate">
                          {cert.staff?.name ?? 'Unknown staff'}
                          {cert.staff?.role && (
                            <span className="text-slate-400 ml-1">· {cert.staff.role}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}
                        >
                          {cfg.label(days)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Expires {cert.expires_at}
                        </span>
                      </div>
                      {(canWrite || canDelete) && (
                        <div className="flex gap-1 shrink-0">
                          {canWrite && (
                            <button
                              onClick={() => {
                                setEditingCert(cert);
                                setEditorOpen(true);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                              aria-label={`Edit ${cert.certification_name}`}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => void handleDelete(cert)}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                              aria-label={`Delete ${cert.certification_name}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Editor modal — top-level overlay */}
      <CertEditorModal
        open={editorOpen}
        editing={editingCert}
        staff={staff}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false);
          setEditingCert(null);
          await refetch();
        }}
      />
    </AppShell>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function PageHeader({ canWrite, onAdd }: { canWrite: boolean; onAdd: () => void }) {
  return (
    <div className="mb-4 sm:mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Certifications</h1>
        <p className="text-slate-500 text-sm mt-1">
          Staff professional credentials · 90 / 30 / 7-day expiry windows
        </p>
      </div>
      {canWrite && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors min-h-[40px]"
        >
          <span aria-hidden="true">+</span> Add cert
        </button>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const cls = {
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    neutral: 'text-slate-900',
  }[tone];
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

/* ─── Editor modal — Add (when editing===null) or Edit (with cert) ───────── */

function CertEditorModal({
  open,
  editing,
  staff,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: CertWithStaff | null;
  staff: StaffRef[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = editing !== null;
  const [staffId, setStaffId] = useState('');
  const [certName, setCertName] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStaffId(editing.staff_id);
      setCertName(editing.certification_name);
      setIssuedAt(editing.issued_at);
      setExpiresAt(editing.expires_at);
      setDocUrl(editing.document_url ?? '');
    } else {
      setStaffId('');
      setCertName('');
      setIssuedAt('');
      setExpiresAt('');
      setDocUrl('');
    }
    setErr(null);
    setSubmitting(false);
  }, [open, editing]);

  // Esc key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const validate = (): string | null => {
    if (!isEdit && !staffId) return 'Select a staff member';
    if (certName.trim().length === 0) return 'Certification name is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) return 'Issued date is required (YYYY-MM-DD)';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return 'Expiry date is required (YYYY-MM-DD)';
    if (issuedAt > expiresAt) return 'Issued date cannot be after expiry date';
    if (docUrl.trim().length > 0 && !/^https?:\/\//.test(docUrl.trim())) {
      return 'Document URL must start with http:// or https://';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setSubmitting(true);
    setErr(null);
    const payload: CertWritePayload = {
      staff_id: staffId,
      certification_name: certName.trim(),
      issued_at: issuedAt,
      expires_at: expiresAt,
      document_url: docUrl.trim() || null,
    };
    const result = isEdit
      ? await patchCertification(editing!.id, {
          // staff_id is immutable — api ignores it on PATCH but be explicit
          certification_name: payload.certification_name,
          issued_at: payload.issued_at,
          expires_at: payload.expires_at,
          document_url: payload.document_url,
        })
      : await postCertification(payload);
    if (result.error) {
      setErr(result.error);
      setSubmitting(false);
      return;
    }
    await onSaved();
    setSubmitting(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit certification' : 'Add certification'}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">
              {isEdit ? 'Edit certification' : 'Add certification'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl px-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Staff *</label>
              {isEdit ? (
                <input
                  type="text"
                  value={editing?.staff?.name ?? '(unknown)'}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 bg-slate-50"
                />
              ) : (
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select staff —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.role}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Certification name *
              </label>
              <input
                type="text"
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                required
                placeholder="e.g. First Aid"
                list="cert-name-suggestions"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="cert-name-suggestions">
                {COMMON_CERT_NAMES.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Issued at *
                </label>
                <input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Expires at *
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Document URL (optional)
              </label>
              <input
                type="url"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {err && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {err}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add certification'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
