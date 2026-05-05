/**
 * ZonesScreen — Zone Accountability Map. THE hero demo (Plan §22 Rec #1).
 *
 * Sales conversation flow during validation gate:
 *   1. Founder asks: "If I asked you who is responsible for parking level B
 *      right now, how long would it take you to answer?"
 *   2. They pause / answer with a phone call / honest admission
 *   3. Founder opens this screen on their phone
 *   4. Demonstrates: every zone, named owner, current status, in <1 second
 *
 * What's shown:
 *   - Zones grouped by floor (sorted by floor_number)
 *   - Each row: zone name + zone_type pill + current_status pill (immutable
 *     severity colour per NFR-35) + assigned staff name (from active
 *     staff_zone_assignments) + "+N more" if multi-assigned
 *   - "Unassigned" rendered prominently (red dot) for zones without active
 *     staff — surfaces coverage gaps the demo explicitly calls out
 *
 * Refs: BR-19 (Zone Accountability Map — primary venue command-role surface)
 * Refs: Plan §22 Rec #1 ("Always lead with this. It closes faster than any
 *       other feature in the portfolio.")
 * Refs: NFR-35 (severity/status colours immutable; brand layer cannot recolour)
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
  type SectionListRenderItem,
} from 'react-native';
import {
  fetchZoneAccountability,
  primaryOwnerOf,
  groupZonesByFloor,
  ZONE_STATUS_LABELS,
  type AccountableZone,
  type FloorGroup,
  type ZoneStatus,
} from '../services/zones';
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

interface Props {
  onBack: () => void;
}

export function ZonesScreen({ onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [zones, setZones] = useState<AccountableZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const start = Date.now();
    const { zones: z, error: err } = await fetchZoneAccountability();
    const elapsedMs = Date.now() - start;
    if (err) {
      setError(err);
    } else {
      setError(null);
      setZones(z);
      setLastFetchedAt(new Date());
    }
    setLoading(false);
    setRefreshing(false);
    // Demo-time signal: show how fast the answer arrived
    void elapsedMs;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Aggregate stats — at-a-glance overview row
  const total = zones.length;
  const allClearCount = zones.filter((z) => z.current_status === 'ALL_CLEAR').length;
  const attentionCount = zones.filter((z) => z.current_status === 'ATTENTION').length;
  const activeIncidentCount = zones.filter((z) => z.current_status === 'INCIDENT_ACTIVE').length;
  const unassignedCount = zones.filter((z) => primaryOwnerOf(z).ownerName === null).length;

  const groups = groupZonesByFloor(zones);

  return (
    <Screen background={c.surface}>
      {/* Nav */}
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Zone Accountability</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Who owns each zone — right now
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {/* Stats strip — total + status breakdown */}
      {!loading && error === null && (
        <View style={[s.statsStrip, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
          <Stat
            label="Total"
            value={String(total)}
            colour={c.textPrimary}
            colours={c}
          />
          <Stat
            label="All Clear"
            value={String(allClearCount)}
            colour={c.zoneStatus.ALL_CLEAR}
            colours={c}
          />
          <Stat
            label="Attention"
            value={String(attentionCount)}
            colour={c.zoneStatus.ATTENTION}
            colours={c}
          />
          <Stat
            label="Incident"
            value={String(activeIncidentCount)}
            colour={c.zoneStatus.INCIDENT_ACTIVE}
            colours={c}
          />
          <Stat
            label="Unassigned"
            value={String(unassignedCount)}
            colour={unassignedCount > 0 ? c.severity.SEV1 : c.textMuted}
            colours={c}
          />
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>
            Loading accountability map...
          </Text>
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
          data={groups}
          keyExtractor={(item) => item.floor.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.floorSep} />}
          renderItem={({ item: group }) => (
            <View>
              <View style={s.floorHeader}>
                <Text style={[s.floorName, { color: c.textPrimary }]}>{group.floor.name}</Text>
                <Text style={[s.floorMeta, { color: c.textMuted }]}>
                  {group.zones.length} zone{group.zones.length === 1 ? '' : 's'}
                </Text>
              </View>
              {group.zones.map((zone) => (
                <ZoneRow key={zone.id} zone={zone} colours={c} />
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
// ZoneRow

interface ZoneRowProps {
  zone: AccountableZone;
  colours: Colours;
}

function ZoneRow({ zone, colours: c }: ZoneRowProps): React.JSX.Element {
  const { ownerName, additionalCount } = primaryOwnerOf(zone);
  const statusColour = statusColourFor(c, zone.current_status);
  const statusBg = statusBgFor(c, zone.current_status);
  const isUnassigned = ownerName === null;

  return (
    <View style={[s.zoneRow, { backgroundColor: c.background }]}>
      {/* Status indicator strip — visual scan */}
      <View style={[s.statusStrip, { backgroundColor: statusColour }]} />
      <View style={s.zoneContent}>
        <View style={s.zoneTop}>
          <Text style={[s.zoneName, { color: c.textPrimary }]} numberOfLines={1}>
            {zone.name}
          </Text>
          {zone.two_person_required && (
            <View style={[s.twoPersonPill, { backgroundColor: c.status.warningBg }]}>
              <Text style={[s.twoPersonText, { color: c.status.warning }]}>2-PERSON</Text>
            </View>
          )}
        </View>
        <Text style={[s.zoneType, { color: c.textMuted }]}>{zone.zone_type}</Text>
        <View style={s.zoneBottom}>
          <View style={[s.statusPill, { backgroundColor: statusBg }]}>
            <Text style={[s.statusText, { color: statusColour }]}>
              {ZONE_STATUS_LABELS[zone.current_status]}
            </Text>
          </View>
          {isUnassigned ? (
            <View style={s.ownerRow}>
              <View style={[s.unassignedDot, { backgroundColor: c.severity.SEV1 }]} />
              <Text style={[s.unassignedText, { color: c.severity.SEV1 }]}>Unassigned</Text>
            </View>
          ) : (
            <View style={s.ownerRow}>
              <Text style={[s.ownerLabel, { color: c.textMuted }]}>Owned by</Text>
              <Text style={[s.ownerName, { color: c.textPrimary }]} numberOfLines={1}>
                {ownerName}
              </Text>
              {additionalCount > 0 && (
                <Text style={[s.ownerExtra, { color: c.textMuted }]}>
                  +{additionalCount}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function statusColourFor(c: Colours, status: ZoneStatus): string {
  switch (status) {
    case 'ALL_CLEAR':       return c.zoneStatus.ALL_CLEAR;
    case 'ATTENTION':       return c.zoneStatus.ATTENTION;
    case 'INCIDENT_ACTIVE': return c.zoneStatus.INCIDENT_ACTIVE;
  }
}

function statusBgFor(c: Colours, status: ZoneStatus): string {
  switch (status) {
    case 'ALL_CLEAR':       return c.zoneStatus.ALL_CLEAR_BG;
    case 'ATTENTION':       return c.zoneStatus.ATTENTION_BG;
    case 'INCIDENT_ACTIVE': return c.zoneStatus.INCIDENT_ACTIVE_BG;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stat — small at-a-glance count

interface StatProps {
  label: string;
  value: string;
  colour: string;
  colours: Colours;
}

function Stat({ label, value, colour, colours: c }: StatProps): React.JSX.Element {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: colour }]}>{value}</Text>
      <Text style={[s.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
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
  statsStrip: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: fontSize.h4, fontWeight: fontWeight.bold },
  statLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginTop: 2,
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
  floorMeta: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  zoneRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  statusStrip: { width: 4, alignSelf: 'stretch' },
  zoneContent: { flex: 1, padding: spacing.md, gap: spacing.xs },
  zoneTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  zoneName: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  twoPersonPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  twoPersonText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  zoneType: {
    fontSize: fontSize.caption,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  zoneBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  statusText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    flexWrap: 'wrap',
  },
  ownerLabel: {
    fontSize: fontSize.caption,
  },
  ownerName: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  ownerExtra: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  unassignedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  unassignedText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  footerBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.caption,
  },
});
