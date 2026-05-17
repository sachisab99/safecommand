/**
 * IncidentsListScreen — unified mobile Incidents view (Active / Past /
 * Scheduled). Fixes the gap where mobile had no standing Incidents nav
 * (only "Declare Incident"). Read-only list; tap → incident detail.
 *
 *  - Active   : fetchIncidents({}) → api no-params default (ACTIVE+
 *               CONTAINED) — same source as the banner, unchanged.
 *  - Past     : search + time-range presets → opt-in api params
 *               (status=RESOLVED,CLOSED &from &q).
 *  - Scheduled: SCHEDULED drills (reuses fetchDrills) — the only
 *               future-scheduled incident-type entity. Read-only.
 *
 * Mirrors HandoverScreen shell. Fail-safe fetches (no crash on error).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {
  Screen,
  useColours,
  spacing,
  fontSize,
  fontWeight,
  radius,
  touch,
  type Colours,
} from '../theme';
import { fetchIncidents, type IncidentListItem } from '../services/incidents';
import { fetchDrills, type DrillSession } from '../services/drills';

interface Props {
  onBack: () => void;
  onOpenIncident: (id: string) => void;
}

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥', MEDICAL: '🏥', SECURITY: '🔒', EVACUATION: '🚨', STRUCTURAL: '🏗️', OTHER: '⚠️',
};
const RANGES = [
  { key: '24h', label: '24h', ms: 864e5 },
  { key: '7d', label: '7 days', ms: 7 * 864e5 },
  { key: '30d', label: '30 days', ms: 30 * 864e5 },
  { key: 'all', label: 'All', ms: 0 },
] as const;
type Tab = 'active' | 'past' | 'scheduled';

function rel(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function IncidentsListScreen({ onBack, onOpenIncident }: Props): React.JSX.Element {
  const c = useColours();
  const s = makeStyles(c);
  const [tab, setTab] = useState<Tab>('active');

  const [active, setActive] = useState<IncidentListItem[]>([]);
  const [past, setPast] = useState<IncidentListItem[]>([]);
  const [drills, setDrills] = useState<DrillSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30d');
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchIncidents({});
    setLoading(false);
    if (e || !data) setError(e ?? 'Could not load incidents');
    else setActive(data);
  }, []);

  const loadPast = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = RANGES.find((x) => x.key === range)!;
    const { data, error: e } = await fetchIncidents({
      status: 'RESOLVED,CLOSED',
      from: r.ms > 0 ? new Date(Date.now() - r.ms).toISOString() : undefined,
      q,
    });
    setLoading(false);
    if (e || !data) setError(e ?? 'Could not load incidents');
    else setPast(data);
  }, [q, range]);

  const loadDrills = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { drills: d, error: e } = await fetchDrills();
    setLoading(false);
    if (e) setError(e);
    else setDrills(d.filter((x) => x.status === 'SCHEDULED'));
  }, []);

  useEffect(() => {
    if (tab === 'active') void loadActive();
    else if (tab === 'scheduled') void loadDrills();
    else {
      if (deb.current) clearTimeout(deb.current);
      deb.current = setTimeout(() => void loadPast(), 350);
      return () => {
        if (deb.current) clearTimeout(deb.current);
      };
    }
    return undefined;
  }, [tab, loadActive, loadDrills, loadPast]);

  const list = tab === 'active' ? active : past;

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: c.textPrimary }]}>Incidents</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={s.tabs}>
        {(['active', 'past', 'scheduled'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && { backgroundColor: c.textPrimary }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, { color: tab === t ? c.background : c.textMuted }]}>
              {t === 'active' ? 'Active' : t === 'past' ? 'Past' : 'Scheduled'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'past' && (
        <View style={s.filters}>
          <TextInput
            style={s.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search type, zone, ID…"
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
          />
          <View style={s.rangeRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[s.chip, range === r.key && { backgroundColor: c.textPrimary, borderColor: c.textPrimary }]}
                onPress={() => setRange(r.key)}
              >
                <Text style={[s.chipText, { color: range === r.key ? c.background : c.textMuted }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={s.body}>
        {loading && (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} />
          </View>
        )}
        {error && !loading && <Text style={s.error}>{error}</Text>}

        {!loading && !error && tab !== 'scheduled' && list.length === 0 && (
          <Text style={s.empty}>
            {tab === 'active' ? 'No active incidents — all clear.' : 'No past incidents match.'}
          </Text>
        )}
        {!loading && !error && tab === 'scheduled' && drills.length === 0 && (
          <Text style={s.empty}>No drills scheduled.</Text>
        )}

        {tab !== 'scheduled' &&
          list.map((i) => (
            <TouchableOpacity key={i.id} style={s.card} onPress={() => onOpenIncident(i.id)} activeOpacity={0.7}>
              <Text style={s.cardIcon}>{TYPE_ICON[i.incident_type] ?? '⚠️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {i.incident_type}
                  {i.incident_subtype ? ` · ${i.incident_subtype}` : ''}
                </Text>
                <Text style={s.cardSub} numberOfLines={1}>
                  {i.severity} · {i.status}
                  {i.zones?.name ? ` · ${i.zones.name}` : ''} · {rel(i.declared_at)}
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          ))}

        {tab === 'scheduled' &&
          drills.map((d) => (
            <View key={d.id} style={s.card}>
              <Text style={s.cardIcon}>🗓️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{String(d.drill_type)} drill</Text>
                <Text style={s.cardSub}>
                  Scheduled {d.scheduled_for ? new Date(d.scheduled_for).toLocaleString() : '—'}
                </Text>
              </View>
              <View style={s.pill}>
                <Text style={s.pillText}>SCHEDULED</Text>
              </View>
            </View>
          ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(c: Colours) {
  return StyleSheet.create({
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
    },
    backBtn: { paddingVertical: spacing.xs, width: 56 },
    backText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
    navTitle: { fontSize: fontSize.h6, fontWeight: fontWeight.bold },
    tabs: { flexDirection: 'row', gap: spacing.xs, padding: spacing.md, paddingBottom: spacing.xs },
    tab: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
    },
    tabText: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
    filters: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
    search: {
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
      color: c.textPrimary,
      fontSize: fontSize.body,
    },
    rangeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
    chip: {
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.divider,
    },
    chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
    body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    center: { paddingVertical: spacing.xl, alignItems: 'center' },
    empty: { color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.lg },
    error: { color: '#dc2626', fontSize: fontSize.small, textAlign: 'center', marginTop: spacing.lg },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.divider,
      padding: spacing.md,
    },
    cardIcon: { fontSize: fontSize.h5 },
    cardTitle: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: c.textPrimary },
    cardSub: { fontSize: fontSize.caption, color: c.textMuted, marginTop: 2 },
    chevron: { fontSize: fontSize.h5, color: c.textMuted },
    pill: {
      backgroundColor: '#3b82f622',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    pillText: { color: '#1d4ed8', fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  });
}
