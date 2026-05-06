/**
 * MyShiftScreen — focused list of zones the logged-in staff covers.
 *
 * Companion to:
 *   ZoneStatusBoardScreen ("Where are problems RIGHT NOW?" — venue-wide)
 *   ZonesScreen / Zone Accountability ("WHO owns each zone?" — venue-wide)
 *   MyShiftScreen (this — "Which zones am I personally covering?")
 *
 * Why this third surface: the venue-wide views are great for command
 * roles (SH/DSH/SC/GM) but a Ground Staff member just needs to know
 * "what's mine?" The first thing they should see when they open the
 * app is a focused list of their own zones with current status.
 *
 * May implementation: filters the existing /v1/zones/accountability
 * response client-side. Phase B June: replace with new
 * /v1/shifts/active endpoint that also returns shift name, commander,
 * crewmates, and time remaining.
 *
 * Refs: BR-04 (8-role permission model — staff sees own coverage)
 * Refs: BR-19 (Zone Accountability — this is the staff's slice of it)
 * Refs: NFR-04 (max 3 taps from notification to action — staff can
 *               reach this surface in 2 taps via drawer)
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
  fetchMyZones,
  groupZonesByFloor,
  ZONE_STATUS_LABELS,
  type AccountableZone,
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
  staffId: string;
  staffName: string;
  staffRole: string;
  onBack: () => void;
}

export function MyShiftScreen({
  staffId,
  staffName,
  staffRole,
  onBack,
}: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [zones, setZones] = useState<AccountableZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) setRefreshing(true);
      const { zones: z, error: err } = await fetchMyZones(staffId);
      if (err) {
        setError(err);
      } else {
        setError(null);
        setZones(z);
        setLastFetchedAt(new Date());
      }
      setLoading(false);
      setRefreshing(false);
    },
    [staffId],
  );

  useEffect(() => {
    void load();
    // 60s polling — assignments change at shift turnover (rare)
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Stats for at-a-glance summary
  const total = zones.length;
  const incidentCount = zones.filter((z) => z.current_status === 'INCIDENT_ACTIVE').length;
  const attentionCount = zones.filter((z) => z.current_status === 'ATTENTION').length;
  const allClearCount = zones.filter((z) => z.current_status === 'ALL_CLEAR').length;
  const twoPersonCount = zones.filter((z) => z.two_person_required).length;

  const groups = groupZonesByFloor(zones);

  return (
    <Screen background={c.surface}>
      {/* Nav */}
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>My Shift</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Zones you cover today
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {/* Identity header */}
      {!loading && error === null && (
        <View
          style={[s.identity, { backgroundColor: brand.primary_colour + '0A' /* 4% tint */ }]}
        >
          <View style={[s.avatar, { backgroundColor: brand.primary_colour }]}>
            <Text style={[s.avatarText, { color: c.textInverse }]}>
              {staffName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={s.identityText}>
            <Text style={[s.identityName, { color: c.textPrimary }]} numberOfLines={1}>
              {staffName}
            </Text>
            <Text style={[s.identityRole, { color: c.textMuted }]}>{staffRole}</Text>
          </View>
        </View>
      )}

      {/* Stats strip */}
      {!loading && error === null && total > 0 && (
        <View
          style={[s.statsStrip, { backgroundColor: c.background, borderBottomColor: c.divider }]}
        >
          <Stat label="Zones" value={String(total)} colour={c.textPrimary} colours={c} />
          <Stat
            label="Active"
            value={String(incidentCount)}
            colour={incidentCount > 0 ? c.severity.SEV1 : c.textMuted}
            colours={c}
          />
          <Stat
            label="Attention"
            value={String(attentionCount)}
            colour={attentionCount > 0 ? c.zoneStatus.ATTENTION : c.textMuted}
            colours={c}
          />
          <Stat
            label="Clear"
            value={String(allClearCount)}
            colour={c.zoneStatus.ALL_CLEAR}
            colours={c}
          />
          {twoPersonCount > 0 && (
            <Stat
              label="2-person"
              value={String(twoPersonCount)}
              colour={c.status.warning}
              colours={c}
            />
          )}
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading your shift...</Text>
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
          <Text style={[s.emptyEmoji]}>🌤️</Text>
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No zones assigned</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>
            You don't have any zone coverage yet for today's shift.
          </Text>
          <Text style={[s.emptyHint, { color: c.textDisabled }]}>
            Your Shift Commander will assign zones at shift start. Pull to refresh
            once they do.
          </Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong, marginTop: spacing.lg }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Refresh</Text>
          </TouchableOpacity>
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
            Last refreshed{' '}
            {lastFetchedAt.toLocaleTimeString('en-IN', {
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
// ZoneRow — one zone the staff covers

interface ZoneRowProps {
  zone: AccountableZone;
  colours: Colours;
}

function ZoneRow({ zone, colours: c }: ZoneRowProps): React.JSX.Element {
  const statusColour = statusColourFor(c, zone.current_status);
  const statusBg = statusBgFor(c, zone.current_status);

  return (
    <View style={[s.zoneRow, { backgroundColor: c.background }]}>
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
        </View>
      </View>
    </View>
  );
}

function statusColourFor(c: Colours, status: ZoneStatus): string {
  switch (status) {
    case 'ALL_CLEAR':
      return c.zoneStatus.ALL_CLEAR;
    case 'ATTENTION':
      return c.zoneStatus.ATTENTION;
    case 'INCIDENT_ACTIVE':
      return c.zoneStatus.INCIDENT_ACTIVE;
  }
}

function statusBgFor(c: Colours, status: ZoneStatus): string {
  switch (status) {
    case 'ALL_CLEAR':
      return c.zoneStatus.ALL_CLEAR_BG;
    case 'ATTENTION':
      return c.zoneStatus.ATTENTION_BG;
    case 'INCIDENT_ACTIVE':
      return c.zoneStatus.INCIDENT_ACTIVE_BG;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stat — at-a-glance count chip

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
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.bold,
  },
  identityText: { flex: 1 },
  identityName: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
  },
  identityRole: {
    fontSize: fontSize.caption,
    marginTop: 2,
  },
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
    gap: spacing.sm,
  },
  loadingText: { fontSize: fontSize.body, marginTop: spacing.md },
  errorText: { fontSize: fontSize.body, textAlign: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm },
  emptyTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  emptySub: {
    fontSize: fontSize.body,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyHint: {
    fontSize: fontSize.small,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.xs,
  },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touch.minTarget - 8,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
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
  footerBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: { fontSize: fontSize.caption },
});
