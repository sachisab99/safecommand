'use client';

/**
 * /patterns/[patternId] — Roster Pattern detail + governance actions
 * (Dashboard, Pass 4b, Phase 5.24).
 *
 * The SH/DSH operational surface. Read-only view of pattern shape,
 * five lifecycle actions, and two modals:
 *
 *   • Validate dry-run modal — shows ValidationResult (mandatory + warnings)
 *   • Materialise modal     — from_date / to_date picker → POST /materialise
 *
 * State machine surface (action visibility):
 *   DRAFT      → [Validate (dry-run)] [Publish]                         + non-DRAFT note re: Ops Console edits
 *   PUBLISHED  → [Validate] [Sign-off (if unsigned)] [Suspend] [Materialise]
 *   SUSPENDED  → [Archive (with successor or no_replacement_sign_off)]
 *   ARCHIVED   → (no actions; read-only)
 *
 * Defence: every button only renders when both (a) the role can manage
 * (SH/DSH/SHIFT_COMMANDER) and (b) the current state permits the action.
 * The api enforces the same gates (Rule 24 defence-in-depth).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { getSession } from '../../../lib/auth';
import {
  getPattern,
  validatePattern,
  publishPattern,
  signOffPattern,
  suspendPattern,
  archivePattern,
  materialisePattern,
  generateCompliancePdf,
  canManagePatternsRole,
  STATUS_TONE,
  VIOLATION_TONE,
  VIOLATION_CODE_LABEL,
  COMPLIANCE_FORMAT_LABEL,
  type RosterPatternDetail,
  type ValidationResult,
  type MaterialisationResponse,
  type Violation,
  type RosterComplianceFormat,
  type CompliancePdfResponse,
} from '../../../lib/rosterPatterns';

export default function PatternDetailPage() {
  const params = useParams<{ patternId: string }>();
  const patternId = params.patternId;
  const router = useRouter();

  const [session, setSession] = useState<ReturnType<typeof getSession> | null>(null);
  const [pattern, setPattern] = useState<RosterPatternDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);

  const [materialiseOpen, setMaterialiseOpen] = useState(false);
  const [materialisation, setMaterialisation] = useState<MaterialisationResponse | null>(null);

  const [pdfFormat, setPdfFormat] = useState<RosterComplianceFormat>('NABH_HRM');
  const [pdfResult, setPdfResult] = useState<CompliancePdfResponse | null>(null);

  useEffect(() => { setSession(getSession()); }, []);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await getPattern(patternId);
    if (error) { setErr(error); setLoading(false); return; }
    setPattern(data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [patternId]);

  const canManage = canManagePatternsRole(session?.staff?.role);
  const status = pattern?.status;

  async function handleValidate() {
    setBusy('validate');
    const { data, error } = await validatePattern(patternId);
    setBusy(null);
    if (error) { setErr(error); return; }
    setValidation(data);
    setValidateOpen(true);
  }

  async function handlePublish() {
    if (!confirm('Publish this pattern? The materialisation worker will be enqueued for the next 30 days.')) return;
    setBusy('publish');
    setErr(null);
    const { data, error } = await publishPattern(patternId);
    setBusy(null);
    if (error) {
      setErr(error);
      // 422 VALIDATION_FAILED carries a validation payload in the parsed body — surface it.
      const parsed = (typeof error === 'string' && error.match(/\d+ mandatory violation/)) ? error : null;
      if (parsed) {
        // The shared apiFetch returns the message string; we don't have the validation payload back.
        // Run a separate /validate to populate the modal.
        const v = await validatePattern(patternId);
        if (v.data) { setValidation(v.data); setValidateOpen(true); }
      }
      return;
    }
    // Success — capture validation echo (warnings) + materialisation info.
    if (data?.validation) setValidation(data.validation);
    await load();
  }

  async function handleSignOff() {
    if (!confirm('Sign off this pattern? This is a second-signature step and cannot be undone.')) return;
    setBusy('sign-off');
    const { error } = await signOffPattern(patternId);
    setBusy(null);
    if (error) { setErr(error); return; }
    await load();
  }

  async function handleSuspend() {
    const reason = prompt('Reason for suspending (optional):') ?? undefined;
    setBusy('suspend');
    const { error } = await suspendPattern(patternId, reason);
    setBusy(null);
    if (error) { setErr(error); return; }
    await load();
  }

  async function handleArchive() {
    // Simple form: ask whether a successor pattern is being designated, else require no_replacement_sign_off.
    const ans = prompt(
      'Archive — enter a successor pattern_id to designate, or leave blank and confirm to archive WITHOUT replacement.',
    );
    let body: { successor_pattern_id?: string; no_replacement_sign_off?: boolean };
    if (ans && ans.trim().length > 0) {
      body = { successor_pattern_id: ans.trim() };
    } else {
      if (!confirm('Archive without a successor pattern? You confirm no replacement is in place.')) return;
      body = { no_replacement_sign_off: true };
    }
    setBusy('archive');
    const { error } = await archivePattern(patternId, body);
    setBusy(null);
    if (error) { setErr(error); return; }
    await load();
  }

  async function handleGeneratePdf() {
    setBusy('pdf');
    setPdfResult(null);
    const { data, error } = await generateCompliancePdf(patternId, pdfFormat);
    setBusy(null);
    if (error) { setErr(error); return; }
    if (data) {
      setPdfResult(data);
      // Open the presigned URL in a new tab so the SH gets a direct download.
      if (typeof window !== 'undefined') window.open(data.url, '_blank', 'noopener');
    }
  }

  async function handleMaterialiseSubmit(fromDate: string, toDate: string) {
    setBusy('materialise');
    const { data, error } = await materialisePattern(patternId, { from_date: fromDate, to_date: toDate });
    setBusy(null);
    if (error) { setErr(error); return; }
    if (data) setMaterialisation(data);
    setMaterialiseOpen(false);
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link href="/patterns" className="hover:underline">Roster patterns</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{pattern?.name ?? 'Loading…'}</span>
        </div>

        {loading && <div className="text-center py-10 text-sm text-gray-500">Loading…</div>}

        {err && (
          <div className="mb-4 p-4 border border-red-200 bg-red-50 rounded text-sm text-red-900 flex items-start justify-between">
            <span>{err}</span>
            <button onClick={() => setErr(null)} className="ml-3 text-red-700 hover:underline text-xs">dismiss</button>
          </div>
        )}

        {pattern && (
          <>
            <header className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-semibold text-gray-900">{pattern.name}</h1>
                <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_TONE[pattern.status].bg} ${STATUS_TONE[pattern.status].text} ${STATUS_TONE[pattern.status].border}`}>
                  {STATUS_TONE[pattern.status].label}
                </span>
                {pattern.signed_off_at && (
                  <span className="inline-block px-2 py-0.5 rounded text-xs border bg-blue-50 text-blue-800 border-blue-200">✔ signed off</span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {pattern.cycle_type} · {pattern.cycle_length_days}-day cycle ·
                {' '}{pattern.effective_from}{pattern.effective_to ? ` → ${pattern.effective_to}` : ' (open)'}
                {pattern.rotation_pattern_code && <span className="ml-2 text-gray-500">· rotation: {pattern.rotation_pattern_code}</span>}
              </p>
            </header>

            {/* Action panel */}
            <section className="mb-8 p-5 border border-gray-200 rounded-lg bg-white">
              <h2 className="font-medium text-gray-900 mb-3">Actions</h2>
              {!canManage && (
                <p className="text-sm text-amber-700 mb-3">
                  Your role ({session?.staff?.role ?? 'unknown'}) cannot change pattern state.
                  Read-only view.
                </p>
              )}
              {status === 'DRAFT' && (
                <p className="text-xs text-gray-500 mb-3">
                  This pattern is a DRAFT. Edit it (header, staff, cycle positions) from the Ops Console, then
                  validate and publish here.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={handleValidate}
                  className="px-3 py-1.5 rounded text-sm font-medium border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  {busy === 'validate' ? 'Validating…' : '✓ Validate (dry-run)'}
                </button>

                {canManage && status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handlePublish}
                    className="px-3 py-1.5 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {busy === 'publish' ? 'Publishing…' : '▲ Publish'}
                  </button>
                )}

                {canManage && status === 'PUBLISHED' && !pattern.signed_off_at && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleSignOff}
                    className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === 'sign-off' ? 'Signing off…' : '✔ Sign off'}
                  </button>
                )}

                {canManage && status === 'PUBLISHED' && (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setMaterialiseOpen(true)}
                      className="px-3 py-1.5 rounded text-sm font-medium border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 disabled:opacity-50"
                    >
                      ⚙ Materialise
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleSuspend}
                      className="px-3 py-1.5 rounded text-sm font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {busy === 'suspend' ? 'Suspending…' : '⏸ Suspend'}
                    </button>
                  </>
                )}

                {canManage && status === 'SUSPENDED' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleArchive}
                    className="px-3 py-1.5 rounded text-sm font-medium border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busy === 'archive' ? 'Archiving…' : '📦 Archive'}
                  </button>
                )}
              </div>

              {materialisation && (
                <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm text-purple-900">
                  Materialisation enqueued. job_id <code className="bg-white px-1 rounded">{materialisation.job_id}</code>{' '}
                  for {materialisation.from_date} → {materialisation.to_date}.
                  <div className="text-xs mt-1 opacity-80">{materialisation.worker_paused_note}</div>
                </div>
              )}
            </section>

            {/* Compliance PDF (BR-AU, Pass 6) */}
            <section className="mb-8 p-5 border border-gray-200 rounded-lg bg-white">
              <h2 className="font-medium text-gray-900 mb-1">📄 Compliance PDF</h2>
              <p className="text-xs text-gray-500 mb-3">
                Generate an authority-formatted PDF of this published duty roster.
                Audit trail (publish + sign-off + this generation) recorded in audit_logs.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-gray-700">Format:</label>
                <select
                  value={pdfFormat}
                  onChange={(e) => setPdfFormat(e.target.value as RosterComplianceFormat)}
                  className="px-3 py-1.5 rounded text-sm border border-gray-300 bg-white"
                >
                  {(Object.keys(COMPLIANCE_FORMAT_LABEL) as RosterComplianceFormat[]).map((f) => (
                    <option key={f} value={f}>{COMPLIANCE_FORMAT_LABEL[f]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={handleGeneratePdf}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {busy === 'pdf' ? 'Generating…' : '⬇ Generate & download'}
                </button>
              </div>

              {pdfResult && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-sm text-slate-800">
                  PDF generated. Ref <code className="bg-white px-1 rounded">{pdfResult.report_ref}</code>.{' '}
                  <a href={pdfResult.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Open again →
                  </a>
                  <div className="text-xs mt-1 opacity-80">
                    Link expires after a short window. Re-generate for a fresh URL.
                  </div>
                </div>
              )}
            </section>

            {/* Pattern shape — read-only */}
            <section className="mb-8 p-5 border border-gray-200 rounded-lg bg-white">
              <h2 className="font-medium text-gray-900 mb-3">Pattern shape</h2>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs uppercase">Staff in pattern</dt>
                  <dd className="text-gray-900 font-medium">{pattern.staff_assignments?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase">Cycle positions defined</dt>
                  <dd className="text-gray-900 font-medium">{pattern.cycle_positions?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase">Published at</dt>
                  <dd className="text-gray-900">{pattern.published_at ? new Date(pattern.published_at).toLocaleString('en-IN') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase">Signed off at</dt>
                  <dd className="text-gray-900">{pattern.signed_off_at ? new Date(pattern.signed_off_at).toLocaleString('en-IN') : '—'}</dd>
                </div>
              </dl>
            </section>

            <div className="mt-6 text-xs text-gray-500">
              Pattern id: <code className="bg-gray-100 px-1 py-0.5 rounded">{patternId}</code>
            </div>
          </>
        )}

        {/* Validate modal */}
        {validateOpen && validation && (
          <ValidationModal
            result={validation}
            onClose={() => setValidateOpen(false)}
            onPublishFromHere={canManage && status === 'DRAFT' && validation.ok ? () => { setValidateOpen(false); handlePublish(); } : undefined}
          />
        )}

        {/* Materialise modal */}
        {materialiseOpen && (
          <MaterialiseModal
            onClose={() => setMaterialiseOpen(false)}
            onSubmit={handleMaterialiseSubmit}
            busy={busy === 'materialise'}
          />
        )}
      </div>
    </AppShell>
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void router;  // keep import for future use (e.g. route to successor after archive)
}

// ────────────────────────────────────────────────────────────────────────
// Validation result modal

function ValidationModal({
  result,
  onClose,
  onPublishFromHere,
}: {
  result: ValidationResult;
  onClose: () => void;
  onPublishFromHere?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Validation {result.ok ? '✓ passed' : '✗ blocking'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {result.summary.staff_count} staff · {result.summary.cycle_length_days}-day cycle ·
              {' '}{result.summary.coverage_rules_checked} coverage rules ·
              {' '}{result.summary.mandatory_count} mandatory · {result.summary.warning_count} warnings
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </header>

        <div className="overflow-y-auto p-5 space-y-4">
          {result.mandatory_violations.length === 0 && result.warnings.length === 0 && (
            <div className="text-center py-6 text-sm text-green-700 border border-green-200 bg-green-50 rounded">
              No violations detected. Pattern ready to publish.
            </div>
          )}

          {result.mandatory_violations.length > 0 && (
            <ViolationGroup title={`Blocking — ${result.mandatory_violations.length}`} priority="MANDATORY" items={result.mandatory_violations} />
          )}

          {result.warnings.length > 0 && (
            <ViolationGroup title={`Warnings — ${result.warnings.length}`} priority="WARNING" items={result.warnings} />
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          {onPublishFromHere && (
            <button
              type="button"
              onClick={onPublishFromHere}
              className="px-3 py-1.5 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-700"
            >
              ▲ Publish now
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function ViolationGroup({
  title,
  priority,
  items,
}: {
  title: string;
  priority: 'MANDATORY' | 'WARNING';
  items: Violation[];
}) {
  const tone = VIOLATION_TONE[priority];
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((v, i) => (
          <li key={i} className={`p-3 rounded border ${tone.bg} ${tone.text} ${tone.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono uppercase opacity-80">{VIOLATION_CODE_LABEL[v.code]}</span>
              {typeof v.day_index === 'number' && (
                <span className="text-xs bg-white/50 px-1.5 py-0.5 rounded">D{v.day_index + 1}</span>
              )}
            </div>
            <div className="text-sm">{v.message}</div>
            {v.shared_staff_ids && v.shared_staff_ids.length > 0 && (
              <div className="text-xs mt-1 opacity-80">
                Shared staff: {v.shared_staff_ids.length} (ids: {v.shared_staff_ids.slice(0, 3).join(', ')}
                {v.shared_staff_ids.length > 3 && ` +${v.shared_staff_ids.length - 3} more`})
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Materialise modal

function MaterialiseModal({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (fromDate: string, toDate: string) => Promise<void>;
  busy: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(defaultEnd);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(fromDate, toDate); }}
        className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Materialise pattern</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </header>

        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Enqueues the BR-AO materialisation worker to write shift_instances + staff_zone_assignments
            for the date range. Worker is paused until <strong>2026-06-01</strong> (ADR 0005) — the job
            sits in Redis until then. Re-running is idempotent.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">To date (max 90-day span)</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </label>
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1.5 rounded text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {busy ? 'Enqueuing…' : 'Materialise'}
          </button>
        </footer>
      </form>
    </div>
  );
}
