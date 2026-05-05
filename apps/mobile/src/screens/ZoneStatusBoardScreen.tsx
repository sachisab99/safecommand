/**
 * ZoneStatusBoardScreen — status-first realtime view of every zone.
 *
 * Companion to ZonesScreen (Zone Accountability — person-first). Both
 * surfaces consume the same /v1/zones/accountability endpoint plus active
 * incidents, but invert the hierarchy:
 *
 *   Zone Status Board (this screen)  → "Where are the problems RIGHT NOW?"
 *   Zone Accountability (ZonesScreen) → "WHO owns each zone this shift?"
 *
 * Design parity with dashboard /zones page: same DisplayState derivation
 * (SEV1 / SEV2 / SEV3 / CONTAINED / ATTENTION / ALL_CLEAR), same severity
 * rank, same zones-sorted-by-severity-DESC.
 *
 * Refs: BR-18 Zone Status Board (real-time colour-coded board)
 * Refs: NFR-35 (severity colours immutable across brand layer)
 * Refs: NFR-10 (≤30s refresh on GM dashboard)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  fetchZoneAccountability,
  primaryOwnerOf,
  type AccountableZone,
  type FloorRef,
} from '../services/zones';
import { fetchActiveIncidents, type ActiveIncident } from '../services/incidents';
import {
  Screen,
  useColours,
  useBrand,
  spacing,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  shadow,
  touch,
  type Colours,
} from '../theme';

// ──────────────────────────────────────────────────────────────────────────
// Display state — mirrors dashboard /zones page derivation

type DisplayState = 'SEV1' | 'SEV2' | 'SEV3' | 'CONTAINED' | 'ATTENTION' | 'ALL_CLEAR';

const SEVERITY_RANK: Record<'SEV1' | 'SEV2' | 'SEV3', number> = { SEV1: 3, SEV2: 2, SEV3: 1 };

const STATE_RANK: Record<DisplayState, number> = {
  SEV1: 6,
  SEV2: 5,
  SEV3: 4,
  CONTAINED: 3,
  ATTENTION: 2,
  ALL_CLEAR: 1,
};

const STATE_LABEL: Record<DisplayState, string> = {
  SEV1: 'SEV1 Critical',
  SEV2: 'SEV2 Urgent',
  SEV3: 'SEV3 Advisory',
  CONTAINED: 'Contained',
  ATTENTION: 'Attention',
  ALL_CLEAR: 'Clear',
};

function deriveState(zone: AccountableZone, incidents: ActiveIncident[]): DisplayState {
  const zi = incidents.filter((i) => i.zone_id === zone.id);
  const active = zi.filter((i) => i.status === 'ACTIVE');
  if (active.length > 0) {
    const top = active.reduce((a, b) =>
      SEVERITY_RANK[a.severity] >= SEVERITY_RANK[b.severity] ? a : b,
    );
    return top.severity;
  }
  if (zi.some((i) => i.status === 'CONTAINED')) return 'CONTAINED';
  if (zone.current_status === 'ATTENTION') return 'ATTENTION';
  return 'ALL_CLEAR';
}

// ──────────────────────────────────────────────────────────────────────────
// Floor bucket — used for grouped layout (same shape as dashboard)

interface EnrichedZone {
  zone: AccountableZone;
  state: DisplayState;
}

interface FloorBucket {
  floor: FloorRef | null;
  zones: EnrichedZone[];
  topRank: number;
  counts: { SEV1: number; SEV2: number; SEV3: number; CONTAINED: number; ATTENTION: number };
}

function bucketByFloor(
  zones: AccountableZone[],
  incidents: ActiveIncident[],
): FloorBucket[] {
  const map = new Map<string, FloorBucket>();
  const NO_FLOOR = '__no_floor__';

  for (const zone of zones) {
    const enriched: EnrichedZone = { zone, state: deriveState(zone, incidents) };
    const key = zone.floors?.id ?? NO_FLOOR;
    const existing = map.get(key);
    if (existing) {
      existing.zones.push(enriched);
    } else {
      map.set(key, {
        floor: zone.floors ?? null,
        zones: [enriched],
        topRank: 0,
        counts: { SEV1: 0, SEV2: 0, SEV3: 0, CONTAINED: 0, ATTENTION: 0 },
      });
    }
  }

  for (const bucket of map.values()) {
    for (const { state } of bucket.zones) {
      if (state === 'SEV1') bucket.counts.SEV1++;
      else if (state === 'SEV2') bucket.counts.SEV2++;
      else if (state === 'SEV3') bucket.counts.SEV3++;
      else if (state === 'CONTAINED') bucket.counts.CONTAINED++;
      else if (state === 'ATTENTION') bucket.counts.ATTENTION++;
      bucket.topRank = Math.max(bucket.topRank, STATE_RANK[state]);
    }
    // Sort zones within each floor: highest severity first, then by name
    bucket.zones.sort((a, b) => {
      const r = STATE_RANK[b.state] - STATE_RANK[a.state];
      return r !== 0 ? r : a.zone.name.localeCompare(b.zone.name);
    });
  }

  // Sort floors: highest topRank first (problems surface to top); ties by floor_number
  return [...map.values()].sort((a, b) => {
    const r = b.topRank - a.topRank;
    if (r !== 0) return r;
    return (a.floor?.floor_number ?? 999) - (b.floor?.floor_number ?? 999);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Screen

interface Props {
  onBack: () => void;
}

export function ZoneStatusBoardScreen({ onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [zones, setZones] = useState<AccountableZone[]>([]);
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const [zRes, incList] = await Promise.all([
      fetchZoneAccountability(),
      fetchActiveIncidents(),
    ]);
    if (zRes.error) {
      setError(zRes.error);
    } else {
      setError(null);
      setZones(zRes.zones);
      setIncidents(incList);
      setLastFetchedAt(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    // Refresh every 30s — matches NFR-10 GM dashboard cadence
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const buckets = bucketByFloor(zones, incidents);

  const totals = {
    SEV1: buckets.reduce((s, b) => s + b.counts.SEV1, 0),
    SEV2: buckets.reduce((s, b) => s + b.counts.SEV2, 0),
    SEV3: buckets.reduce((s, b) => s + b.counts.SEV3, 0),
    CONTAINED: buckets.reduce((s, b) => s + b.counts.CONTAINED, 0),
    ATTENTION: buckets.reduce((s, b) => s + b.counts.ATTENTION, 0),
  };
  const totalIssues = totals.SEV1 + totals.SEV2 + totals.SEV3 + totals.CONTAINED + totals.ATTENTION;

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Zone Status Board</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Where the problems are — right now
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {!loading && error === null && (
        <View style={[s.tally, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
          {totalIssues === 0 ? (
            <View style={s.tallyAllClear}>
              <View style={[s.tallyDot, { backgroundColor: c.zoneStatus.ALL_CLEAR }]} />
              <Text style={[s.tallyAllClearText, { color: c.textMuted }]}>
                All zones clear
              </Text>
            </View>
          ) : (
            <View style={s.tallyRow}>
              {totals.SEV1 > 0 && (
                <TallyChip count={totals.SEV1} label="SEV1" colour={c.severity.SEV1} pulse colours={c} />
              )}
              {totals.SEV2 > 0 && (
                <TallyChip count={totals.SEV2} label="SEV2" colour={c.severity.SEV2} colours={c} />
              )}
              {totals.SEV3 > 0 && (
                <TallyChip count={totals.SEV3} label="SEV3" colour={c.severity.SEV3} colours={c} />
              )}
              {totals.CONTAINED > 0 && (
                <TallyChip count={totals.CONTAINED} label="Contained" colour={c.status.escalated} colours={c} />
              )}
              {totals.ATTENTION > 0 && (
                <TallyChip count={totals.ATTENTION} label="Attention" colour={c.zoneStatus.ATTENTION} colours={c} />
              )}
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading status board...</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={[s.errorText, { color: c.severity.SEV1 }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : zones.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: c.textMuted }]}>No zones configured</Text>
          <Text style={[s.emptySub, { color: c.textDisabled }]}>
            Configure zones via the Operations Console for this venue.
          </Text>
        </View>
      ) : (
        <FlatList
          data={buckets}
          keyExtractor={(item) => item.floor?.id ?? '__no_floor__'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.floorSep} />}
          renderItem={({ item: bucket }) => (
            <View>
              <View style={s.floorHeader}>
                <Text style={[s.floorName, { color: c.textPrimary }]}>
                  {bucket.floor?.name ?? 'Unassigned'}
                </Text>
                <Text style={[s.floorMeta, { color: c.textMuted }]}>
                  {bucket.zones.length} zone{bucket.zones.length === 1 ? '' : 's'}
                </Text>
              </View>
              {bucket.zones.map((ez) => (
                <ZoneStatusTile key={ez.zone.id} enriched={ez} colours={c} />
              ))}
            </View>
          )}
        />
      )}

      {lastFetchedAt !== null && !loading && error === null && (
        <View style={[s.footerBar, { backgroundColor: c.background, borderTopColor: c.divider }]}>
          <Text style={[s.footerText, { color: c.textDisabled }]}>
            Last refreshed {lastFetchedAt.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tally chip — at-a-glance severity totals

interface TallyChipProps {
  count: number;
  label: string;
  colour: string;
  pulse?: boolean;
  colours: Colours;
}

function TallyChip({ count, label, colour, colours: c }: TallyChipProps): React.JSX.Element {
  return (
    <View style={s.tallyChip}>
      <View style={[s.tallyDot, { backgroundColor: colour }]} />
      <Text style={[s.tallyCount, { color: colour }]}>{count}</Text>
      <Text style={[s.tallyLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Zone tile — status-first

interface ZoneStatusTileProps {
  enriched: EnrichedZone;
  colours: Colours;
}

function ZoneStatusTile({ enriched, colours: c }: ZoneStatusTileProps): React.JSX.Element {
  const { zone, state } = enriched;
  const stateColour = stateColourFor(c, state);
  const stateBg = stateBgFor(c, state);
  const { ownerName, additionalCount } = primaryOwnerOf(zone);

  return (
    <View style={[s.tile, { backgroundColor: c.background, borderColor: stateColour }]}>
      <View style={[s.tileStrip, { backgroundColor: stateColour }]} />
      <View style={s.tileContent}>
        <View style={s.tileTop}>
          <Text style={[s.tileName, { color: c.textPrimary }]} numberOfLines={1}>
            {zone.name}
          </Text>
          {zone.two_person_required && (
            <View style={[s.lockPill, { backgroundColor: c.status.warningBg }]}>
              <Text style={[s.lockPillText, { color: c.status.warning }]}>2P</Text>
            </View>
          )}
        </View>
        <View style={s.tileMid}>
          <View style={[s.statePill, { backgroundColor: stateBg }]}>
            <View style={[s.tinyDot, { backgroundColor: stateColour }]} />
            <Text style={[s.statePillText, { color: stateColour }]}>{STATE_LABEL[state]}</Text>
          </View>
          <Text style={[s.tileType, { color: c.textMuted }]} numberOfLines={1}>
            {zone.zone_type}
          </Text>
        </View>
        <View style={s.tileBottom}>
          {ownerName === null ? (
            <Text style={[s.coverageGap, { color: c.severity.SEV1 }]}>⊘ No staff this shift</Text>
          ) : (
            <Text style={[s.coverageOk, { color: c.textMuted }]} numberOfLines={1}>
              {ownerName}
              {additionalCount > 0 ? ` +${additionalCount}` : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function stateColourFor(c: Colours, state: DisplayState): string {
  switch (state) {
    case 'SEV1': return c.severity.SEV1;
    case 'SEV2': return c.severity.SEV2;
    case 'SEV3': return c.severity.SEV3;
    case 'CONTAINED': return c.status.escalated;
    case 'ATTENTION': return c.zoneStatus.ATTENTION;
    case 'ALL_CLEAR': return c.zoneStatus.ALL_CLEAR;
  }
}

function stateBgFor(c: Colours, state: DisplayState): string {
  switch (state) {
    case 'SEV1':
    case 'SEV2':
    case 'SEV3':
      return c.zoneStatus.INCIDENT_ACTIVE_BG;
    case 'CONTAINED':
      return c.status.escalatedBg;
    case 'ATTENTION':
      return c.zoneStatus.ATTENTION_BG;
    case 'ALL_CLEAR':
      return c.zoneStatus.ALL_CLEAR_BG;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Styles

const s = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backBtnSpacer: { width: 60 },
  backText: { fontSize: fontSize.body + 1, fontWeight: fontWeight.medium },
  navTitleWrap: { alignItems: 'center', flex: 1 },
  navTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  navSubtitle: { fontSize: fontSize.caption, marginTop: 2 },
  tally: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  tallyAllClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  tallyAllClearText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  tallyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-start',
  },
  tallyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tallyDot: { width: 10, height: 10, borderRadius: 5 },
  tallyCount: { fontSize: fontSize.h6, fontWeight: fontWeight.bold },
  tallyLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { fontSize: fontSize.body, marginTop: spacing.md },
  errorText: { fontSize: fontSize.body, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touch.minTarget - 8,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  emptyTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.semibold },
  emptySub: { fontSize: fontSize.small, textAlign: 'center', maxWidth: 280 },
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  floorSep: { height: spacing.md },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  floorName: {
    fontSize: fontSize.h6,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  floorMeta: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  tile: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    borderLeftWidth: 0,
    ...shadow.sm,
  },
  tileStrip: { width: 6, alignSelf: 'stretch' },
  tileContent: { flex: 1, padding: spacing.md, gap: spacing.xs },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tileName: { fontSize: fontSize.body + 1, fontWeight: fontWeight.semibold, flex: 1 },
  lockPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  lockPillText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  tileMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
  },
  tinyDot: { width: 6, height: 6, borderRadius: 3 },
  statePillText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  tileType: {
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    flexShrink: 1,
  },
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  coverageGap: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  coverageOk: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
  },
  footerBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: { fontSize: fontSize.caption },
});
