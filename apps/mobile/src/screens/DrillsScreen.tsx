/**
 * DrillsScreen — venue drill compliance view (BR-A).
 *
 * Mirrors dashboard /drills + Ops Console Drills tab on mobile.
 * Compliance summary card + categorised drill lists (in-progress /
 * upcoming / completed). Read-only on mobile in Phase 1; SH/DSH/FM
 * schedule/run drills via Ops Console or future mobile write surface
 * (Phase B).
 *
 * Refs: BR-A (Drill Management), BR-14 (Health Score 10% weight),
 * Phase 5.11 (this).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import {
  fetchDrills,
  scheduleDrill,
  startDrill,
  endDrill,
  cancelDrill,
  canWriteDrills,
  computeDrillScore,
  daysSince,
  formatDuration,
  DRILL_TYPE_LABEL,
  DRILL_TYPE_ICON,
  type DrillSession,
  type DrillType,
} from '../services/drills';
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

interface StatusStyle {
  fg: (c: Colours) => string;
  bg: (c: Colours) => string;
  pulse?: boolean;
}

const STATUS_STYLE: Record<DrillSession['status'], StatusStyle> = {
  SCHEDULED: {
    fg: (c) => c.status.pending,
    bg: (c) => c.status.pendingBg ?? c.surface,
  },
  IN_PROGRESS: {
    fg: (c) => c.status.warning,
    bg: (c) => c.status.warningBg,
    pulse: true,
  },
  COMPLETED: {
    fg: (c) => c.status.success,
    bg: (c) => c.status.successBg,
  },
  CANCELLED: {
    fg: (c) => c.textMuted,
    bg: (c) => c.surface,
  },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Screen

interface Props {
  /**
   * Logged-in staff role — drives write-surface gating.
   * SH/DSH/FM/SHIFT_COMMANDER can schedule + start + end + cancel drills.
   */
  staffRole: string;
  onBack: () => void;
}

export function DrillsScreen({ staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [drills, setDrills] = useState<DrillSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Phase 5.14 write-surface state
  const canWrite = canWriteDrills(staffRole);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { drills: d, error: err } = await fetchDrills();
    if (err) {
      setError(err);
    } else {
      setError(null);
      setDrills(d);
      setLastFetchedAt(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    // 5-min polling — drill state changes are infrequent
    const id = setInterval(() => void load(), 300_000);
    return () => clearInterval(id);
  }, [load]);

  // Categorise + sort
  const inProgress = drills.filter((d) => d.status === 'IN_PROGRESS');
  const upcoming = drills
    .filter((d) => d.status === 'SCHEDULED')
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const completed = drills
    .filter((d) => d.status === 'COMPLETED' && d.ended_at !== null)
    .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));

  const score = computeDrillScore(drills);
  const daysSinceLast = completed[0]?.ended_at ? daysSince(completed[0].ended_at) : null;

  // ─── Lifecycle action handlers (canWrite users only) ─────────────────────
  // Each wraps the api call + refetch + simple Alert error handling.
  const runAction = async (
    actionName: string,
    drillId: string,
    fn: (id: string) => Promise<{ drill: DrillSession | null; error: string | null }>,
    confirmMsg?: string,
  ) => {
    if (confirmMsg) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(actionName, confirmMsg, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: actionName, style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }
    setActionInFlight(drillId);
    const { error: err } = await fn(drillId);
    setActionInFlight(null);
    if (err) {
      Alert.alert('Could not complete', err);
      return;
    }
    await load(true);
  };

  const handleStart = (id: string) =>
    runAction('Start drill', id, startDrill, 'This will broadcast the drill to all on-duty staff. Continue?');
  const handleEnd = (id: string) =>
    runAction('End drill', id, endDrill, 'This will close the drill and record final timing. Continue?');
  const handleCancel = (id: string) =>
    runAction('Cancel', id, cancelDrill, 'Cancel this scheduled drill?');

  // FlatList data with section headers
  type ListItem =
    | { kind: 'header'; title: string; count: number; tone: 'warn' | 'good' | 'neutral' }
    | { kind: 'drill'; drill: DrillSession };

  const listData: ListItem[] = [];
  if (inProgress.length > 0) {
    listData.push({ kind: 'header', title: 'In Progress', count: inProgress.length, tone: 'warn' });
    inProgress.forEach((d) => listData.push({ kind: 'drill', drill: d }));
  }
  if (upcoming.length > 0) {
    listData.push({ kind: 'header', title: 'Upcoming', count: upcoming.length, tone: 'good' });
    upcoming.forEach((d) => listData.push({ kind: 'drill', drill: d }));
  }
  if (completed.length > 0) {
    listData.push({ kind: 'header', title: 'Completed', count: completed.length, tone: 'neutral' });
    completed.slice(0, 20).forEach((d) => listData.push({ kind: 'drill', drill: d }));
  }

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Drills</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Compliance · quarterly cadence
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading drills...</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={[s.emptyEmoji]}>🔥</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load drills</Text>
          <Text style={[s.errorText, { color: c.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : drills.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyEmoji]}>🔥</Text>
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No drills scheduled</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>
            Your venue hasn't scheduled or run a drill yet.
          </Text>
          <Text style={[s.emptyHint, { color: c.textDisabled }]}>
            Operations team can schedule drills via the Operations Console.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, idx) =>
            item.kind === 'header' ? `h-${item.title}-${idx}` : item.drill.id
          }
          ListHeaderComponent={
            <ComplianceCard
              score={score}
              daysSinceLast={daysSinceLast}
              upcoming={upcoming.length}
              completed={completed.length}
              total={drills.length}
              colours={c}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <SectionHeader
                title={item.title}
                count={item.count}
                tone={item.tone}
                colours={c}
              />
            ) : (
              <DrillRow
                drill={item.drill}
                colours={c}
                canWrite={canWrite}
                inFlight={actionInFlight === item.drill.id}
                onStart={canWrite ? () => handleStart(item.drill.id) : undefined}
                onEnd={canWrite ? () => handleEnd(item.drill.id) : undefined}
                onCancel={canWrite ? () => handleCancel(item.drill.id) : undefined}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        />
      )}

      {lastFetchedAt !== null && !loading && error === null && (
        <View style={[s.footerBar, { backgroundColor: c.background, borderTopColor: c.divider }]}>
          <Text style={[s.footerText, { color: c.textDisabled }]}>
            Last refreshed{' '}
            {lastFetchedAt.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      )}

      {canWrite && (
        <TouchableOpacity
          style={[fabStyles.fab, { backgroundColor: c.primary }]}
          activeOpacity={0.8}
          onPress={() => setScheduleModalVisible(true)}
          accessibilityLabel="Schedule drill"
        >
          <Text style={[fabStyles.fabIcon, { color: c.textOnPrimary }]}>＋</Text>
        </TouchableOpacity>
      )}

      <ScheduleDrillModal
        visible={scheduleModalVisible}
        onClose={() => setScheduleModalVisible(false)}
        onSubmitted={async () => {
          setScheduleModalVisible(false);
          await load(true);
        }}
        colours={c}
        brand={brand}
      />
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Compliance card

function ComplianceCard({
  score,
  daysSinceLast,
  upcoming,
  completed,
  total,
  colours: c,
}: {
  score: number;
  daysSinceLast: number | null;
  upcoming: number;
  completed: number;
  total: number;
  colours: Colours;
}) {
  const scoreColour =
    score >= 80 ? c.status.success : score >= 60 ? c.status.warning : c.severity.SEV1;

  return (
    <View style={[cs.card, { backgroundColor: c.background }]}>
      <View style={cs.cardHeader}>
        <View style={cs.cardHeaderText}>
          <Text style={[cs.cardLabel, { color: c.textMuted }]}>Compliance score</Text>
          <Text style={[cs.cardSubLabel, { color: c.textDisabled }]}>
            Recency of last completed drill
          </Text>
        </View>
        <Text style={[cs.scoreNumber, { color: scoreColour }]}>{score}</Text>
      </View>

      <View style={cs.bucketGrid}>
        <Tile
          label="Last drill"
          value={daysSinceLast === null ? '—' : `${daysSinceLast}d`}
          tone={
            daysSinceLast === null || daysSinceLast > 180
              ? 'bad'
              : daysSinceLast > 90
                ? 'warn'
                : 'good'
          }
          colours={c}
        />
        <Tile label="Upcoming" value={String(upcoming)} tone={upcoming > 0 ? 'good' : 'neutral'} colours={c} />
        <Tile label="Completed" value={String(completed)} tone="neutral" colours={c} />
        <Tile label="Total" value={String(total)} tone="neutral" colours={c} />
      </View>
    </View>
  );
}

function Tile({
  label,
  value,
  tone,
  colours: c,
}: {
  label: string;
  value: string;
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
    <View style={[cs.bucket, { backgroundColor: c.surface }]}>
      <Text style={[cs.bucketValue, { color: fg }]}>{value}</Text>
      <Text style={[cs.bucketLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Section header + Drill row

function SectionHeader({
  title,
  count,
  colours: c,
}: {
  title: string;
  count: number;
  tone: 'warn' | 'good' | 'neutral';
  colours: Colours;
}) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[s.sectionCount, { color: c.textMuted }]}>{count}</Text>
    </View>
  );
}

function DrillRow({
  drill,
  colours: c,
  canWrite,
  inFlight,
  onStart,
  onEnd,
  onCancel,
}: {
  drill: DrillSession;
  colours: Colours;
  canWrite: boolean;
  inFlight: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onCancel?: () => void;
}) {
  const style = STATUS_STYLE[drill.status];
  const fg = style.fg(c);
  const bg = style.bg(c);
  const icon = DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️';
  const cleanNotes = drill.notes?.replace(/^\[DEMO\]\s*/, '');
  const ackPercent =
    drill.total_staff_expected > 0
      ? Math.round((drill.total_staff_safe / drill.total_staff_expected) * 100)
      : 0;
  const showActions =
    canWrite && (drill.status === 'SCHEDULED' || drill.status === 'IN_PROGRESS');

  return (
    <View style={[rs.row, { backgroundColor: c.background }]}>
      <View style={[rs.statusStrip, { backgroundColor: fg }]} />
      <View style={rs.rowContent}>
        <View style={rs.rowTop}>
          <Text style={rs.rowIcon}>{icon}</Text>
          <View style={rs.rowText}>
            <Text style={[rs.rowName, { color: c.textPrimary }]} numberOfLines={1}>
              {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
            </Text>
            <Text style={[rs.rowMeta, { color: c.textMuted }]}>
              📅 {formatDateTime(drill.scheduled_for)}
              {drill.duration_seconds !== null
                ? ` · ⏱ ${formatDuration(drill.duration_seconds)}`
                : ''}
            </Text>
          </View>
        </View>

        <View style={rs.rowBottom}>
          <View style={[rs.statusPill, { backgroundColor: bg }]}>
            {style.pulse && <View style={[rs.pulseDot, { backgroundColor: fg }]} />}
            <Text style={[rs.statusPillText, { color: fg }]}>{drill.status}</Text>
          </View>

          {drill.status === 'COMPLETED' && drill.total_staff_expected > 0 && (
            <Text style={[rs.participation, { color: c.textMuted }]}>
              {ackPercent}% ({drill.total_staff_safe}/{drill.total_staff_expected})
              {drill.total_staff_missed > 0 ? ` · ${drill.total_staff_missed} missed` : ''}
            </Text>
          )}
        </View>

        {cleanNotes && (
          <Text style={[rs.notes, { color: c.textSecondary }]} numberOfLines={2}>
            "{cleanNotes}"
          </Text>
        )}

        {showActions && (
          <View style={rs.actionRow}>
            {drill.status === 'SCHEDULED' && (
              <>
                <TouchableOpacity
                  style={[rs.actionBtn, { backgroundColor: c.primary, opacity: inFlight ? 0.5 : 1 }]}
                  disabled={inFlight}
                  onPress={onStart}
                  activeOpacity={0.7}
                >
                  <Text style={[rs.actionBtnText, { color: c.textOnPrimary }]}>
                    {inFlight ? '…' : '▶ Start'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[rs.actionBtnSecondary, { borderColor: c.divider, opacity: inFlight ? 0.5 : 1 }]}
                  disabled={inFlight}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={[rs.actionBtnText, { color: c.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
            {drill.status === 'IN_PROGRESS' && (
              <TouchableOpacity
                style={[rs.actionBtn, { backgroundColor: c.status.danger, opacity: inFlight ? 0.5 : 1 }]}
                disabled={inFlight}
                onPress={onEnd}
                activeOpacity={0.7}
              >
                <Text style={[rs.actionBtnText, { color: '#fff' }]}>
                  {inFlight ? '…' : '■ End drill'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },
  sectionCount: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
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
  emptySub: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 320 },
  emptyHint: {
    fontSize: fontSize.small,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.xs,
  },
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  errorText: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 320 },
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

const cs = StyleSheet.create({
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
  cardSubLabel: { fontSize: fontSize.caption, marginTop: 2 },
  scoreNumber: { fontSize: fontSize.h3, fontWeight: fontWeight.bold },
  bucketGrid: { flexDirection: 'row', gap: spacing.xs },
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
  },
});

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
  rowMeta: { fontSize: fontSize.caption, marginTop: 2 },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  participation: { fontSize: fontSize.caption },
  notes: {
    fontSize: fontSize.caption,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
});

// ──────────────────────────────────────────────────────────────────────────
// FAB + Modal styles (mirrors EquipmentScreen patterns)

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl + spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 32,
    fontWeight: fontWeight.bold,
    marginTop: -2,
  },
});
const ms = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetContent: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    minHeight: touch.minTarget,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  helper: {
    fontSize: fontSize.caption,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  submitBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: touch.minTarget + 4,
    justifyContent: 'center',
  },
  submitText: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
});

// ──────────────────────────────────────────────────────────────────────────
// ScheduleDrillModal — bottom-sheet form (drill_type + scheduled_for + notes)
// Industry-leading keyboard handling: KeyboardAvoidingView + auto-focus + tab order.

const DRILL_TYPE_OPTIONS: DrillType[] = [
  'FIRE_EVACUATION',
  'EARTHQUAKE',
  'BOMB_THREAT',
  'MEDICAL_EMERGENCY',
  'PARTIAL_EVACUATION',
  'FULL_EVACUATION',
  'OTHER',
];

/** Default scheduled_for: tomorrow at 10:00 local time, ISO without seconds. */
function defaultScheduledFor(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

interface ScheduleDrillModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
  colours: Colours;
  brand: ReturnType<typeof useBrand>;
}

function ScheduleDrillModal({
  visible,
  onClose,
  onSubmitted,
  colours: c,
}: ScheduleDrillModalProps): React.JSX.Element {
  const [drillType, setDrillType] = useState<DrillType>('FIRE_EVACUATION');
  const [scheduledFor, setScheduledFor] = useState(defaultScheduledFor());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<TextInput>(null);

  // Reset on every open
  useEffect(() => {
    if (visible) {
      setDrillType('FIRE_EVACUATION');
      setScheduledFor(defaultScheduledFor());
      setNotes('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    setError(null);
    // Parse the local datetime-input into ISO with timezone
    const parsed = new Date(scheduledFor);
    if (isNaN(parsed.getTime())) {
      setError('Enter date/time as YYYY-MM-DDTHH:mm (e.g. 2026-05-15T14:00)');
      return;
    }
    if (parsed.getTime() < Date.now() - 60_000) {
      setError('Drill must be scheduled in the future.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await scheduleDrill({
      drill_type: drillType,
      scheduled_for: parsed.toISOString(),
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    await onSubmitted();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={ms.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={ms.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={[ms.sheet, { backgroundColor: c.background }]}>
          <View style={[ms.dragHandle, { backgroundColor: c.divider }]} />
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={ms.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[ms.title, { color: c.textPrimary }]}>Schedule drill</Text>

            <Text style={[ms.label, { color: c.textMuted }]}>Drill type</Text>
            <View style={ms.chipRow}>
              {DRILL_TYPE_OPTIONS.map((dt) => {
                const active = drillType === dt;
                return (
                  <TouchableOpacity
                    key={dt}
                    onPress={() => setDrillType(dt)}
                    style={[
                      ms.chip,
                      {
                        backgroundColor: active ? c.primary : c.surface,
                        borderColor: active ? c.primary : c.divider,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        ms.chipText,
                        { color: active ? c.textOnPrimary : c.textPrimary },
                      ]}
                    >
                      {DRILL_TYPE_ICON[dt]} {DRILL_TYPE_LABEL[dt]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[ms.label, { color: c.textMuted }]}>Scheduled for</Text>
            <TextInput
              style={[
                ms.input,
                { backgroundColor: c.surface, borderColor: c.divider, color: c.textPrimary },
              ]}
              value={scheduledFor}
              onChangeText={setScheduledFor}
              placeholder="YYYY-MM-DDTHH:mm"
              placeholderTextColor={c.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => notesRef.current?.focus()}
            />
            <Text style={[ms.helper, { color: c.textMuted }]}>
              Local time. Example: 2026-05-15T14:00
            </Text>

            <Text style={[ms.label, { color: c.textMuted }]}>Notes (optional)</Text>
            <TextInput
              ref={notesRef}
              style={[
                ms.input,
                ms.textarea,
                { backgroundColor: c.surface, borderColor: c.divider, color: c.textPrimary },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Briefing instructions, scope, attendees…"
              placeholderTextColor={c.textDisabled}
              multiline
              numberOfLines={3}
            />

            {error !== null && (
              <View style={[ms.errorBox, { backgroundColor: c.status.dangerBg }]}>
                <Text style={[ms.errorText, { color: c.status.danger }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                ms.submitBtn,
                { backgroundColor: c.primary, opacity: submitting ? 0.6 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={[ms.submitText, { color: c.textOnPrimary }]}>
                  Schedule drill
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={[ms.cancelText, { color: c.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
