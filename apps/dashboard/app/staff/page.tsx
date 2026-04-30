'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';

interface Staff {
  id: string;
  name: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const ROLE_COLOR: Record<string, string> = {
  SH:               'bg-red-100 text-red-700',
  DSH:              'bg-orange-100 text-orange-700',
  GM:               'bg-purple-100 text-purple-700',
  SHIFT_COMMANDER:  'bg-blue-100 text-blue-700',
  FLOOR_SUPERVISOR: 'bg-sky-100 text-sky-700',
  FM:               'bg-teal-100 text-teal-700',
  AUDITOR:          'bg-slate-100 text-slate-600',
  GROUND_STAFF:     'bg-slate-100 text-slate-600',
};

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<Staff[]>('/staff').then(({ data, error: e }) => {
      setLoading(false);
      if (e || !data) { setError(e ?? 'Load failed'); return; }
      setStaff(data);
    });
  }, []);

  const displayed = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
            <p className="text-slate-500 text-sm mt-1">{staff.length} total · {staff.filter(s => s.is_active).length} active</p>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or role…"
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>

        {loading && <div className="text-slate-400 text-sm">Loading…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">Phone</th>
                <th className="text-left px-5 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayed.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-900">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLOR[s.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {s.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{s.phone}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && displayed.length === 0 && (
            <div className="text-center py-12 text-slate-400">No staff found</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
