'use client';

/**
 * Incident detail (deep-dive) — `/incidents/[id]`.
 *
 * Surfaces the full lifecycle of a single incident: header (type / severity /
 * status / declared time / declarer / zone) → description → chronological
 * timeline of every lifecycle event (DECLARED / BROADCAST_SENT / STAFF_ON_SITE
 * / STAFF_ACK / ESCALATED_LEVEL_N / CONTAINED / RESOLVED / NOTE) with the
 * acting staff member resolved.
 *
 * Data: GET /v1/incidents/:id (already returns *, zones, staff, timeline).
 * Actor names are resolved client-side via /v1/staff (the incidents endpoint
 * doesn't join the timeline → staff relation).
 *
 * BR-29: Post-incident report auto-generation. PDF export is Phase B (June);
 * this page renders the human-readable equivalent today and includes a
 * "Print this page" affordance as an interim escape hatch.
 *
 * EC-10 / Rule 4: timeline is append-only at DB level. This page is read-
 * only — no mutations from here.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../../components/AppShell';
import { apiFetch } from '../../../lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Severity = 'SEV1' | 'SEV2' | 'SEV3';
type Status = 'ACTIVE' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
type IncidentType =
  | 'FIRE' | 'MEDICAL' | 'SECURITY' | 'EVACUATION' | 'STRUCTURAL' | 'OTHER';

interface TimelineEvent {
  id: string;
  incident_id: string;
  event_type: string;
  actor_staff_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

interface IncidentDetail {
  id: string;
  incident_type: IncidentType;
  severity: Severity;
  status: Status;
  declared_at: string;
  resolved_at: string | null;
  description: string | null;
  zone_id: string | null;
  declared_by_staff_id: string | null;
  zones: { name: string; floor_id: string | null } | null;
  staff: { name: string; role: string } | null;
  incident_timeline: TimelineEvent[];
}

interface StaffRef {
  id: string;
  name: string;
  role: string;
}

/* ─── Visual config ──────────────────────────────────────────────────────── */

const TYPE_ICON: Record<IncidentType, string> = {
  FIRE: '🔥',
  MEDICAL: '🏥',
  SECURITY: '🔒',
  EVACUATION: '🚨',
  STRUCTURAL: '🏗️',
  OTHER: '⚠️',
};

const SEV_PILL: Record<Severity, string> = {
  SEV1: 'bg-red-600 text-white',
  SEV2: 'bg-orange-500 text-white',
  SEV3: 'bg-yellow-400 text-slate-900',
};

const STATUS_PILL: Record<Status, string> = {
  ACTIVE: 'bg-red-100 text-red-700 border-red-200',
  CONTAINED: 'bg-amber-100 text-amber-700 border-amber-200',
  RESOLVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
};

const EVENT_CONFIG: Record<string, { label: string; dot: string; tone: string }> = {
  DECLARED: { label: 'Incident declared', dot: 'bg-red-500', tone: 'text-red-700' },
  BROADCAST_SENT: { label: 'Broadcast sent', dot: 'bg-blue-500', tone: 'text-blue-700' },
  STAFF_ON_SITE: { label: 'Staff on site', dot: 'bg-indigo-500', tone: 'text-indigo-700' },
  STAFF_ACK: { label: 'Staff acknowledged', dot: 'bg-emerald-500', tone: 'text-emerald-700' },
  ESCALATED_LEVEL_1: { label: 'Escalated — level 1', dot: 'bg-orange-500', tone: 'text-orange-700' },
  ESCALATED_LEVEL_2: { label: 'Escalated — level 2', dot: 'bg-orange-600', tone: 'text-orange-800' },
  ESCALATED_LEVEL_3: { label: 'Escalated — level 3', dot: 'bg-red-600', tone: 'text-red-800' },
  CONTAINED: { label: 'Contained', dot: 'bg-purple-500', tone: 'text-purple-700' },
  RESOLVED: { label: 'Resolved', dot: 'bg-emerald-600', tone: 'text-emerald-800' },
  CLOSED: { label: 'Closed', dot: 'bg-slate-500', tone: 'text-slate-700' },
  NOTE: { label: 'Note', dot: 'bg-slate-400', tone: 'text-slate-600' },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatElapsed(iso: string, base: string | number = Date.now()): string {
  const baseMs = typeof base === 'string' ? new Date(base).getTime() : base;
  const mins = Math.floor((baseMs - new Date(iso).getTime()) / 60_000);
  if (mins < 0) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function metadataLine(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  // Surface common keys verbosely; render others as JSON tail
  const parts: string[] = [];
  if (typeof metadata['note'] === 'string') parts.push(metadata['note']);
  if (typeof metadata['text'] === 'string') parts.push(metadata['text']);
  if (typeof metadata['description'] === 'string' && parts.length === 0)
    parts.push(metadata['description']);
  if (typeof metadata['resolution'] === 'string') parts.push(metadata['resolution']);
  if (typeof metadata['reason'] === 'string') parts.push(`Reason: ${metadata['reason']}`);
  if (
    typeof metadata['recipients'] === 'number' &&
    typeof metadata['delivered'] === 'number'
  ) {
    parts.push(
      `${metadata['delivered']}/${metadata['recipients']} delivered (${metadata['channel'] ?? 'unknown'})`,
    );
  }
  if (typeof metadata['location'] === 'string') parts.push(`📍 ${metadata['location']}`);
  if (typeof metadata['ack_type'] === 'string')
    parts.push(`${String(metadata['ack_type']).replace('_', ' ')}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16 server-component pattern: params is a Promise; unwrap with `use()`
  const { id } = use(params);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [staffMap, setStaffMap] = useState<Map<string, StaffRef>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [incRes, staffRes] = await Promise.all([
        apiFetch<IncidentDetail>(`/incidents/${id}`),
        // /v1/staff requires SH/DSH/GM/AUDITOR — caller's role determines
        // success. On 403, we degrade gracefully: actor names show as IDs.
        apiFetch<StaffRef[]>('/staff'),
      ]);
      if (cancelled) return;
      if (incRes.error || !incRes.data) {
        setError(incRes.error ?? 'Incident not found');
        setLoading(false);
        return;
      }
      setIncident(incRes.data);
      if (staffRes.data) {
        const m = new Map<string, StaffRef>();
        for (const s of staffRes.data) m.set(s.id, s);
        setStaffMap(m);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <AppShell>
      <div
        className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Link href="/incidents" className="hover:text-slate-900">Incidents</Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">
            {loading || !incident ? '…' : incident.id.slice(0, 8).toUpperCase()}
          </span>
        </nav>

        {loading && (
          <div className="text-slate-400 text-sm">Loading incident…</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && incident && (
          <article className="space-y-6">
            <IncidentHeader incident={incident} onPrint={handlePrint} />
            {incident.description && (
              <DescriptionCard description={incident.description} />
            )}
            <TimelineCard
              events={incident.incident_timeline}
              staffMap={staffMap}
              declaredAt={incident.declared_at}
            />
            <ScopeCard incident={incident} />
            <PdfPlaceholderCard />
          </article>
        )}
      </div>
    </AppShell>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

function IncidentHeader({
  incident,
  onPrint,
}: {
  incident: IncidentDetail;
  onPrint: () => void;
}) {
  const sev = SEV_PILL[incident.severity];
  const status = STATUS_PILL[incident.status];
  const isUrgent = incident.status === 'ACTIVE';

  return (
    <header className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="text-4xl shrink-0" aria-hidden="true">
          {TYPE_ICON[incident.incident_type]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {incident.incident_type}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${sev}`}>
              {incident.severity}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status}`}
            >
              {isUrgent && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1" />
              )}
              {incident.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
            <div>
              <span className="text-slate-400">Declared:</span>{' '}
              <span className="font-medium">{formatAbsolute(incident.declared_at)}</span>
              <span className="text-slate-400 ml-2">({formatElapsed(incident.declared_at)})</span>
            </div>
            {incident.staff?.name && (
              <div>
                <span className="text-slate-400">By:</span>{' '}
                <span className="font-medium">{incident.staff.name}</span>{' '}
                <span className="text-slate-400">({incident.staff.role})</span>
              </div>
            )}
            {incident.zones?.name && (
              <div>
                <span className="text-slate-400">Zone:</span>{' '}
                <span className="font-medium">{incident.zones.name}</span>
              </div>
            )}
            {incident.resolved_at && (
              <div>
                <span className="text-slate-400">Resolved:</span>{' '}
                <span className="font-medium">{formatAbsolute(incident.resolved_at)}</span>
              </div>
            )}
            <div>
              <span className="text-slate-400">Reference:</span>{' '}
              <span className="font-mono text-xs">
                {incident.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onPrint}
          className="hidden sm:inline-block text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
          aria-label="Print this incident report"
        >
          Print
        </button>
      </div>
    </header>
  );
}

/* ─── Description ────────────────────────────────────────────────────────── */

function DescriptionCard({ description }: { description: string }) {
  // Strip the [DEMO] marker for prospect-facing display
  const clean = description.replace(/^\[DEMO\]\s*/, '');
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
        Description
      </h2>
      <p className="text-slate-800 text-sm">{clean}</p>
    </section>
  );
}

/* ─── Timeline ───────────────────────────────────────────────────────────── */

function TimelineCard({
  events,
  staffMap,
  declaredAt,
}: {
  events: TimelineEvent[];
  staffMap: Map<string, StaffRef>;
  declaredAt: string;
}) {
  // Order chronologically (oldest first — narrative arc reads top-to-bottom)
  const ordered = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Timeline</h2>
        <span className="text-xs text-slate-500">
          {ordered.length} event{ordered.length === 1 ? '' : 's'}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="px-5 sm:px-6 py-8 text-center text-slate-400 text-sm">
          No timeline events recorded for this incident.
        </div>
      ) : (
        <ol className="px-5 sm:px-6 py-4 space-y-4 relative">
          {/* Connecting vertical line */}
          <div
            className="absolute left-6 sm:left-7 top-7 bottom-7 w-px bg-slate-100"
            aria-hidden="true"
          />
          {ordered.map((evt) => (
            <TimelineEventRow
              key={evt.id}
              event={evt}
              staffMap={staffMap}
              relativeBase={declaredAt}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineEventRow({
  event,
  staffMap,
  relativeBase,
}: {
  event: TimelineEvent;
  staffMap: Map<string, StaffRef>;
  relativeBase: string;
}) {
  const cfg = EVENT_CONFIG[event.event_type] ?? {
    label: event.event_type,
    dot: 'bg-slate-400',
    tone: 'text-slate-700',
  };
  const actor = event.actor_staff_id ? staffMap.get(event.actor_staff_id) : null;
  const actorLabel = actor
    ? `${actor.name} (${actor.role})`
    : event.actor_staff_id
      ? `Staff ${event.actor_staff_id.slice(0, 8).toUpperCase()}`
      : 'System';
  const detail = metadataLine(event.metadata);

  return (
    <li className="relative pl-8 sm:pl-10">
      <span
        className={`absolute left-4 sm:left-5 top-1 w-3 h-3 rounded-full ${cfg.dot} ring-2 ring-white`}
        aria-hidden="true"
      />
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-sm font-semibold ${cfg.tone}`}>{cfg.label}</span>
        <span className="text-xs text-slate-500">·</span>
        <span className="text-xs text-slate-600">{actorLabel}</span>
        <span className="text-xs text-slate-400 ml-auto" title={formatAbsolute(event.occurred_at)}>
          {formatElapsed(event.occurred_at)}{' '}
          <span className="text-slate-300">
            ({Math.floor(
              (new Date(event.occurred_at).getTime() -
                new Date(relativeBase).getTime()) /
                60_000,
            )}m
            from declaration)
          </span>
        </span>
      </div>
      {detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}
    </li>
  );
}

/* ─── Scope ──────────────────────────────────────────────────────────────── */

function ScopeCard({ incident }: { incident: IncidentDetail }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 sm:p-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
        Scope
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Incident type" value={incident.incident_type} />
        <Field label="Severity" value={incident.severity} />
        <Field label="Current status" value={incident.status} />
        <Field
          label="Zone"
          value={incident.zones?.name ?? 'Venue-wide (no specific zone)'}
        />
        <Field
          label="Declared by"
          value={
            incident.staff?.name
              ? `${incident.staff.name} (${incident.staff.role})`
              : 'Unknown'
          }
        />
        <Field label="Reference" value={incident.id.slice(0, 8).toUpperCase()} mono />
      </dl>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-slate-900 font-medium ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/* ─── PDF placeholder (BR-29 Phase B) ────────────────────────────────────── */

function PdfPlaceholderCard() {
  return (
    <section className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden="true">📄</span>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-700 text-sm">
            Compliance PDF report
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            Auto-generated post-incident report (PDFKit) ships in Phase B (June 2026)
            per <span className="font-mono">JUNE-2026-REVIEW-REQUIRED.md</span>. Until
            then, use the Print button at the top to capture this view as a PDF via
            your browser's print dialog.
          </p>
        </div>
      </div>
    </section>
  );
}
