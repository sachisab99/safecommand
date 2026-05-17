'use client';

/**
 * /handovers — Shift Handover protocol (BR-12).
 * Outgoing commander submits (server snapshots zones + open incidents);
 * incoming commander accepts (authority-transfer record). Read-only after
 * accept. Shift status lifecycle stays owned by /shifts (non-breaking).
 */

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { getSession } from '../../lib/auth';
import {
  fetchHandovers,
  fetchShiftInstances,
  createHandover,
  acceptHandover,
  canManageHandover,
  instanceLabel,
  type Handover,
  type ShiftInstanceLite,
} from '../../lib/handovers';

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString('en-IN') : '—';
}

export default function HandoversPage() {
  const [rows, setRows] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data, error: e } = await fetchHandovers();
    setLoading(false);
    if (e || !data) { setError(e ?? 'Load failed'); return; }
    setRows(data);
  };

  useEffect(() => {
    setRole(getSession()?.staff.role ?? null);
    load();
  }, []);

  const canManage = canManageHandover(role);

  const onAccept = async (id: string) => {
    setBusyId(id);
    const res = await acceptHandover(id);
    setBusyId(null);
    if (res.ok) load();
    else setError(res.error ?? 'Accept failed');
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Shift Handovers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Outgoing logs an immutable snapshot · incoming accepts (authority transfer)
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              ⇄ New handover
            </button>
          )}
        </div>

        {loading && <div className="flex h-48 items-center justify-center text-slate-400">Loading…</div>}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm italic text-slate-400">No handovers recorded yet.</p>
        )}

        <div className="space-y-3">
          {rows.map((h) => {
            const accepted = h.state === 'ACCEPTED';
            return (
              <section key={h.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {h.outgoing?.shift_name ?? 'Outgoing'} → {h.incoming?.shift_name ?? 'Incoming'}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {h.outgoing?.commander_name ?? '—'} → {h.incoming?.commander_name ?? '—'} ·{' '}
                      {h.outgoing?.shift_date ?? ''}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      accepted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {h.state}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
                  <div><span className="text-slate-400">Submitted:</span> {fmt(h.outgoing_submitted_at)}</div>
                  <div><span className="text-slate-400">Accepted:</span> {fmt(h.incoming_accepted_at)}</div>
                  <div><span className="text-slate-400">Zones snapped:</span> {h.snapshots?.zones?.length ?? 0}</div>
                  <div><span className="text-slate-400">Open incidents:</span> {h.snapshots?.open_incidents?.length ?? 0}</div>
                </div>

                {h.notes && (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{h.notes}</p>
                )}

                {(h.snapshots?.open_incidents?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {h.snapshots!.open_incidents!.map((i, idx) => (
                      <li key={idx}>
                        ⚠ {i.type} · {i.severity} · {i.status}
                        {i.zone ? ` · ${i.zone}` : ''}
                      </li>
                    ))}
                  </ul>
                )}

                {!accepted && canManage && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => onAccept(h.id)}
                      disabled={busyId === h.id}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === h.id ? 'Accepting…' : '✓ Accept (transfer authority)'}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {modal && (
        <NewHandoverModal
          onClose={() => setModal(false)}
          onDone={() => { setModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

function NewHandoverModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [instances, setInstances] = useState<ShiftInstanceLite[]>([]);
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchShiftInstances(date).then(({ data }) => {
      if (alive) setInstances(data ?? []);
    });
    return () => { alive = false; };
  }, [date]);

  const submit = async () => {
    if (!outgoing || !incoming) { setErr('Pick both outgoing and incoming shifts.'); return; }
    if (outgoing === incoming) { setErr('Outgoing and incoming must differ.'); return; }
    setBusy(true);
    setErr(null);
    const res = await createHandover({ outgoing_instance_id: outgoing, incoming_instance_id: incoming, notes });
    setBusy(false);
    if (res.ok) onDone();
    else setErr(res.error ?? 'Could not submit handover');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">New shift handover</h3>
        <p className="mt-1 text-sm text-slate-600">
          The zone status + open incidents are snapshotted server-side at submit (immutable).
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-500">Shift date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setOutgoing(''); setIncoming(''); }}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-xs font-medium text-slate-500">Outgoing shift</label>
        <select
          value={outgoing}
          onChange={(e) => setOutgoing(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— Select —</option>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>{instanceLabel(i)}</option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-medium text-slate-500">Incoming shift</label>
        <select
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— Select —</option>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>{instanceLabel(i)}</option>
          ))}
        </select>
        {instances.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">No shift instances on this date — create them in Shifts &amp; Roster first.</p>
        )}

        <label className="mt-4 block text-xs font-medium text-slate-500">Handover notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Open items, watch-outs, anything the incoming shift must know…"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          rows={3}
        />

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Submitting…' : '⇄ Submit handover'}
          </button>
        </div>
      </div>
    </div>
  );
}
