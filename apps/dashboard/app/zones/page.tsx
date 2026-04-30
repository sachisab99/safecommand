'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { getSession } from '../../lib/auth';

interface ZoneAssignment {
  staff: { id: string; name: string; role: string }[];
}
interface Zone {
  id: string;
  name: string;
  zone_type: string;
  current_status: 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE';
  two_person_required: boolean;
  staff_zone_assignments: ZoneAssignment[];
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; card: string; text: string }> = {
  ALL_CLEAR:      { label: 'All Clear',      dot: 'bg-green-500',  card: 'border-green-200 bg-green-50',  text: 'text-green-700' },
  ATTENTION:      { label: 'Attention',      dot: 'bg-amber-500',  card: 'border-amber-200 bg-amber-50',  text: 'text-amber-700' },
  INCIDENT_ACTIVE:{ label: 'Incident Active',dot: 'bg-red-500',    card: 'border-red-200 bg-red-50',      text: 'text-red-700' },
};

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ALL_CLEAR' | 'ATTENTION' | 'INCIDENT_ACTIVE'>('ALL');
  const session = getSession();

  const fetchZones = async () => {
    const { data } = await apiFetch<Zone[]>('/zones/accountability');
    if (data) setZones(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchZones();

    // Realtime subscription — update individual zone in state when DB changes
    const channel = supabase
      .channel('zones-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'zones',
          filter: session ? `venue_id=eq.${session.staff.venue_id}` : undefined },
        (payload) => {
          const updated = payload.new as Zone;
          setZones(prev => prev.map(z => z.id === updated.id ? { ...z, current_status: updated.current_status } : z));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.staff.venue_id]);

  const displayed = filter === 'ALL' ? zones : zones.filter(z => z.current_status === filter);

  const counts = {
    ALL_CLEAR:       zones.filter(z => z.current_status === 'ALL_CLEAR').length,
    ATTENTION:       zones.filter(z => z.current_status === 'ATTENTION').length,
    INCIDENT_ACTIVE: zones.filter(z => z.current_status === 'INCIDENT_ACTIVE').length,
  };

  return (
    <AppShell>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Zone Status Board</h1>
          <p className="text-slate-500 text-sm mt-1">Live · updates in real-time via Supabase Realtime</p>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['ALL', 'ALL_CLEAR', 'ATTENTION', 'INCIDENT_ACTIVE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                filter === f
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {f === 'ALL' ? `All (${zones.length})` :
               f === 'ALL_CLEAR' ? `All Clear (${counts.ALL_CLEAR})` :
               f === 'ATTENTION' ? `Attention (${counts.ATTENTION})` :
               `Incident Active (${counts.INCIDENT_ACTIVE})`}
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading zones…</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map(zone => {
            const cfg = STATUS_CONFIG[zone.current_status] ?? STATUS_CONFIG['ALL_CLEAR'];
            const assignees = zone.staff_zone_assignments?.flatMap(a => a.staff) ?? [];
            return (
              <div key={zone.id} className={`rounded-2xl border-2 p-4 transition-colors ${cfg.card}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{zone.name}</h3>
                    <p className="text-slate-500 text-xs mt-0.5">{zone.zone_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${cfg.dot}`} />
                    <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
                  </div>
                </div>

                {zone.two_person_required && (
                  <div className="text-xs text-amber-600 font-medium mb-2">⚠ 2-person required</div>
                )}

                {assignees.length > 0 ? (
                  <div className="space-y-1">
                    {assignees.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-slate-600">
                        <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs">
                          {s.name.charAt(0)}
                        </div>
                        <span className="truncate">{s.name}</span>
                        <span className="text-slate-400 ml-auto shrink-0">{s.role.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No staff assigned</p>
                )}
              </div>
            );
          })}
        </div>

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-slate-400">No zones match this filter.</div>
        )}
      </div>
    </AppShell>
  );
}
