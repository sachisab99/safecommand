/**
 * EquipmentScreen — venue-wide compliance view (BR-21).
 *
 * Mirrors the Ops Console Equipment tab on mobile: compliance summary at
 * top (score + per-bucket counts), then sorted list (most-urgent first)
 * with expiry-status pills across the full colour ramp.
 *
 * RLS: equipment_items SELECT is gated to "current_venue_id() OR is_sc_ops"
 * — any authenticated venue staff can READ. Mutations (Phase B mobile
 * write surface) gated to SH/DSH/FM.
 *
 * Refs: BR-21 (Equipment & Maintenance Tracker), BR-14 (10% weight in
 * Health Score), Phase 5.6 (Health Score Breakdown), Phase 5.9 (Ops
 * Console foundation), Phase 5.10 (this — mobile + api activation).
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
  fetchEquipment,
  computeStats,
  daysUntilDue,
  expiryBucket,
  CATEGORY_LABEL,
  CATEGORY_ICON,
  type EquipmentItem,
  type ExpiryBucket,
} from '../services/equipment';
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
// Visual config

interface BucketStyle {
  label: (days: number) => string;
  fg: (c: Colours) => string;
  bg: (c: Colours) => string;
  rank: number;
}

const BUCKET_STYLE: Record<ExpiryBucket, BucketStyle> = {
  OVERDUE: {
    label: (d) => `OVERDUE ${Math.abs(d)}d`,
    fg: (c) => c.severity.SEV1,
    bg: (c) => c.severity.SEV1_BG,
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Due in ${d}d`,
    fg: (c) => c.severity.SEV2,
    bg: (c) => c.zoneStatus.INCIDENT_ACTIVE_BG,
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Due in ${d}d`,
    fg: (c) => c.status.escalated,
    bg: (c) => c.status.escalatedBg,
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Due in ${d}d`,
    fg: (c) => c.status.warning,
    bg: (c) => c.status.warningBg,
    rank: 2,
  },
  OK: {
    label: () => 'OK',
    fg: (c) => c.status.success,
    bg: (c) => c.status.successBg,
    rank: 1,
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Screen

interface Props {
  onBack: () => void;
}

export function EquipmentScreen({ onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) setRefreshing(true);
      const { items: i, error: err } = await fetchEquipment();
      if (err) {
        setError(err);
      } else {
        setError(null);
        setItems(i);
        setLastFetchedAt(new Date());
      }
      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void load();
    // 5-minute polling — equipment dates change rarely
    const id = setInterval(() => void load(), 300_000);
    return () => clearInterval(id);
  }, [load]);

  const stats = computeStats(items);

  // Sort: most urgent first, then by next_service_due ascending
  const sorted = [...items].sort((a, b) => {
    const ra = BUCKET_STYLE[expiryBucket(daysUntilDue(a.next_service_due))].rank;
    const rb = BUCKET_STYLE[expiryBucket(daysUntilDue(b.next_service_due))].rank;
    if (ra !== rb) return rb - ra;
    return a.next_service_due.localeCompare(b.next_service_due);
  });

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Equipment</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Compliance · 90 / 30 / 7 day windows
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading equipment...</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={[s.emptyEmoji]}>🛠️</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load equipment</Text>
          <Text style={[s.errorText, { color: c.textMuted }]}>{error}</Text>
          <Text style={[s.errorHint, { color: c.textDisabled }]}>
            If this persists, your api server may not have the equipment endpoint
            deployed yet (ships May/June 2026).
          </Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyEmoji]}>🛠️</Text>
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No equipment registered</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>
            Your venue's safety equipment (fire extinguishers, AEDs, smoke detectors,
            etc) hasn't been registered yet.
          </Text>
          <Text style={[s.emptyHint, { color: c.textDisabled }]}>
            Ask your Operations team to add equipment via the Ops Console.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <ComplianceCard stats={stats} colours={c} />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => <EquipmentRow item={item} colours={c} />}
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
// Compliance summary card (header)

function ComplianceCard({
  stats,
  colours: c,
}: {
  stats: ReturnType<typeof computeStats>;
  colours: Colours;
}) {
  const score = stats.compliance_score;
  const scoreColour =
    score >= 80 ? c.status.success : score >= 60 ? c.status.warning : c.severity.SEV1;

  return (
    <View style={[ss.card, { backgroundColor: c.background }]}>
      <View style={ss.cardHeader}>
        <View style={ss.cardHeaderText}>
          <Text style={[ss.cardLabel, { color: c.textMuted }]}>Compliance score</Text>
          <Text style={[ss.cardSubLabel, { color: c.textDisabled }]}>
            % of items ≥ 90 days to next service
          </Text>
        </View>
        <Text style={[ss.scoreNumber, { color: scoreColour }]}>{score}</Text>
      </View>

      <View style={ss.bucketGrid}>
        <BucketTile
          label="OK"
          value={stats.ok}
          tone={stats.ok > 0 ? 'good' : 'neutral'}
          colours={c}
        />
        <BucketTile
          label="30-90d"
          value={stats.due_90}
          tone={stats.due_90 > 0 ? 'warn' : 'neutral'}
          colours={c}
        />
        <BucketTile
          label="7-30d"
          value={stats.due_30}
          tone={stats.due_30 > 0 ? 'warn' : 'neutral'}
          colours={c}
        />
        <BucketTile
          label="≤7d / overdue"
          value={stats.due_7 + stats.overdue}
          tone={stats.due_7 + stats.overdue > 0 ? 'bad' : 'neutral'}
          colours={c}
        />
      </View>
    </View>
  );
}

function BucketTile({
  label,
  value,
  tone,
  colours: c,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  colours: Colours;
}) {
  const fg =
    tone === 'good'
      ? c.status.success
      : tone === 'warn'
        ? c.status.warning
        : tone === 'bad'
          ? c.severity.SEV1
          : c.textPrimary;

  return (
    <View style={[ss.bucket, { backgroundColor: c.surface }]}>
      <Text style={[ss.bucketValue, { color: fg }]}>{value}</Text>
      <Text style={[ss.bucketLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Equipment row

function EquipmentRow({ item, colours: c }: { item: EquipmentItem; colours: Colours }) {
  const days = daysUntilDue(item.next_service_due);
  const bucket = expiryBucket(days);
  const style = BUCKET_STYLE[bucket];
  const fg = style.fg(c);
  const bg = style.bg(c);
  const icon = CATEGORY_ICON[item.category] ?? '🛠️';

  return (
    <View style={[rs.row, { backgroundColor: c.background }]}>
      <View style={[rs.statusStrip, { backgroundColor: fg }]} />
      <View style={rs.rowContent}>
        <View style={rs.rowTop}>
          <Text style={rs.rowIcon}>{icon}</Text>
          <View style={rs.rowText}>
            <Text style={[rs.rowName, { color: c.textPrimary }]} numberOfLines={1}>
              {item.name.replace(/^\[DEMO\]\s*/, '')}
            </Text>
            <Text style={[rs.rowCategory, { color: c.textMuted }]}>
              {CATEGORY_LABEL[item.category] ?? item.category}
              {item.location_description ? ` · ${item.location_description}` : ''}
            </Text>
          </View>
        </View>

        <View style={rs.rowBottom}>
          <View style={[rs.statusPill, { backgroundColor: bg }]}>
            <Text style={[rs.statusPillText, { color: fg }]}>{style.label(days)}</Text>
          </View>
          <Text style={[rs.dueDate, { color: c.textMuted }]}>
            Next service: {item.next_service_due}
          </Text>
        </View>
      </View>
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
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  sep: { height: spacing.sm },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: { fontSize: fontSize.body, marginTop: spacing.md },
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
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  errorText: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 320 },
  errorHint: {
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
    marginTop: spacing.md,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  footerBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: { fontSize: fontSize.caption },
});

// Compliance card styles
const ss = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderText: { flex: 1 },
  cardLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  cardSubLabel: {
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  scoreNumber: { fontSize: fontSize.h3, fontWeight: fontWeight.bold },
  bucketGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bucket: {
    flex: 1,
    borderRadius: radius.sm + 2,
    padding: spacing.sm,
    alignItems: 'center',
  },
  bucketValue: { fontSize: fontSize.h5, fontWeight: fontWeight.bold },
  bucketLabel: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },
});

// Row styles
const rs = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  statusStrip: { width: 4, alignSelf: 'stretch' },
  rowContent: { flex: 1, padding: spacing.md, gap: spacing.sm },
  rowTop: { flexDirection: 'row', gap: spacing.sm },
  rowIcon: { fontSize: 24 },
  rowText: { flex: 1 },
  rowName: { fontSize: fontSize.body + 1, fontWeight: fontWeight.semibold },
  rowCategory: { fontSize: fontSize.caption, marginTop: 2 },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  statusPillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  dueDate: {
    fontSize: fontSize.caption,
    fontFamily: 'Courier',
  },
});
