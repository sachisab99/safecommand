/**
 * MyShiftSwapsScreen — staff self-service for shift-swap workflow (BR-AP).
 * Pattern Engine Pass 5b — Phase 5.24.
 *
 * Three sections (when populated):
 *   1) "Awaiting your response" — incoming swap requests where the staff
 *      is the counterpart in REQUESTED state. Actions: [Accept] [Decline].
 *   2) "My active requests" — outgoing swap requests by the staff in
 *      REQUESTED state. Action: [Withdraw]. Also COUNTERPART_ACCEPTED
 *      swaps (awaiting SH approval) — view-only, no actions.
 *   3) "Closed history" — APPROVED / REJECTED / DECLINED / WITHDRAWN.
 *      View-only.
 *
 * PROPOSE-SWAP CREATION  is Pass 5b-ii — needs an assignment picker
 * pattern (likely backed by a new GET /v1/staff/me/assignments endpoint).
 * This pass covers the incoming-response surface fully; the propose-flow
 * adds a "+ Propose Swap" FAB once that's designed.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchMySwaps,
  acceptSwap,
  declineSwap,
  withdrawSwap,
  bucketSwaps,
  SWAP_TYPE_LABEL,
  STATE_LABEL,
  type ShiftSwapRow,
} from '../services/shiftSwaps';
import {
  Screen,
  useColours,
  useBrand,
  spacing,
  fontSize,
  fontWeight,
  radius,
  shadow,
  touch,
  type Colours,
} from '../theme';

interface Props {
  staffId: string;
  staffName: string;
  onBack: () => void;
}

type SectionKind = 'awaiting' | 'mine' | 'closed';

interface SectionMeta {
  kind: SectionKind;
  title: string;
  subtitle?: string;
  rows: ShiftSwapRow[];
}

interface FlatItem {
  kind: 'header' | 'row';
  section: SectionKind;
  title?: string;
  subtitle?: string;
  row?: ShiftSwapRow;
}

export function MyShiftSwapsScreen({ staffId, staffName, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [rows, setRows] = useState<ShiftSwapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { rows: r, error: err } = await fetchMySwaps();
    if (err) setError(err);
    else { setError(null); setRows(r); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    // 2-minute polling — swap state flips quickly (counterpart response, SH approval)
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  const bucketed = useMemo(() => bucketSwaps(rows, staffId), [rows, staffId]);

  // Flatten sections into a single FlatList data array with header rows
  const flatData: FlatItem[] = useMemo(() => {
    const out: FlatItem[] = [];
    const sections: SectionMeta[] = [
      {
        kind: 'awaiting',
        title: 'Awaiting your response',
        subtitle: 'Colleagues asking for a swap with you',
        rows: bucketed.awaitingMyResponse,
      },
      {
        kind: 'mine',
        title: 'My active requests',
        subtitle: 'Open swap requests you initiated',
        rows: bucketed.myActiveRequests,
      },
      {
        kind: 'closed',
        title: 'Closed history',
        rows: bucketed.closedHistory.slice(0, 25), // cap to avoid runaway lists
      },
    ];
    for (const s of sections) {
      if (s.rows.length === 0) continue;
      out.push({ kind: 'header', section: s.kind, title: s.title, ...(s.subtitle && { subtitle: s.subtitle }) });
      for (const r of s.rows) {
        out.push({ kind: 'row', section: s.kind, row: r });
      }
    }
    return out;
  }, [bucketed]);

  async function handleAccept(row: ShiftSwapRow): Promise<void> {
    Alert.alert(
      'Accept this swap?',
      `${SWAP_TYPE_LABEL[row.swap_type]}. Your Security Head still needs to approve before it takes effect.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            const { error: err } = await acceptSwap(row.id);
            if (err) Alert.alert('Could not accept', err);
            else void load(true);
          },
        },
      ],
    );
  }

  async function handleDecline(row: ShiftSwapRow): Promise<void> {
    Alert.alert(
      'Decline this swap?',
      `${SWAP_TYPE_LABEL[row.swap_type]}. The requester will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await declineSwap(row.id);
            if (err) Alert.alert('Could not decline', err);
            else void load(true);
          },
        },
      ],
    );
  }

  async function handleWithdraw(row: ShiftSwapRow): Promise<void> {
    Alert.alert(
      'Withdraw this request?',
      `${SWAP_TYPE_LABEL[row.swap_type]}. You can submit a new request later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await withdrawSwap(row.id);
            if (err) Alert.alert('Could not withdraw', err);
            else void load(true);
          },
        },
      ],
    );
  }

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>My Shift Swaps</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]} numberOfLines={1}>{staffName}</Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading swap requests…</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>⇄</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load</Text>
          <Text style={[s.errorText, { color: c.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : flatData.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>⇄</Text>
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No swap requests</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>
            You'll see incoming swap requests and your own pending requests here.
          </Text>
          <Text style={[s.emptyHint, { color: c.textDisabled }]}>
            Proposing a swap from mobile is coming in a follow-up release.
            Speak to your Security Head to arrange a swap for now.
          </Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, idx) => item.kind === 'header' ? `h-${item.section}-${idx}` : `r-${item.row!.id}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: c.textPrimary }]}>{item.title}</Text>
                {item.subtitle && (
                  <Text style={[s.sectionSubtitle, { color: c.textMuted }]}>{item.subtitle}</Text>
                )}
              </View>
            ) : (
              <SwapRow
                row={item.row!}
                section={item.section}
                myStaffId={staffId}
                colours={c}
                onAccept={() => void handleAccept(item.row!)}
                onDecline={() => void handleDecline(item.row!)}
                onWithdraw={() => void handleWithdraw(item.row!)}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Row

function SwapRow({
  row, section, myStaffId, colours: c, onAccept, onDecline, onWithdraw,
}: {
  row: ShiftSwapRow;
  section: SectionKind;
  myStaffId: string;
  colours: Colours;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
}) {
  const stateMeta = STATE_LABEL[row.state];
  const stripColour =
    row.state === 'REQUESTED' && section === 'awaiting' ? c.severity.SEV2 :
    row.state === 'APPROVED' ? c.zoneStatus.ALL_CLEAR ?? c.status.success ?? '#10b981' :
    ['REJECTED', 'DECLINED'].includes(row.state) ? c.severity.SEV1 :
    row.state === 'WITHDRAWN' ? c.textDisabled :
    row.state === 'COUNTERPART_ACCEPTED' ? c.status.pending :
    c.status.warning ?? '#f59e0b';

  const iAmRequester = row.requester_staff_id === myStaffId;
  const iAmCounterpart = row.counterpart_staff_id === myStaffId;
  const showAcceptDecline = section === 'awaiting' && iAmCounterpart && row.state === 'REQUESTED';
  const showWithdraw = iAmRequester && row.state === 'REQUESTED';

  return (
    <View style={[rs.row, { backgroundColor: c.background }]}>
      <View style={[rs.statusStrip, { backgroundColor: stripColour }]} />
      <View style={rs.rowContent}>
        <View style={rs.rowTopRow}>
          <Text style={[rs.rowName, { color: c.textPrimary }]} numberOfLines={1}>
            {SWAP_TYPE_LABEL[row.swap_type]}
          </Text>
          <Text style={[rs.statusPillText, { color: stripColour }]}>
            {stateMeta.emoji} {stateMeta.label}
          </Text>
        </View>
        <Text style={[rs.rowMeta, { color: c.textMuted }]}>
          Requested {formatRelative(row.requested_at)}
          {iAmCounterpart && !iAmRequester && '  ·  you are the counterpart'}
        </Text>
        {row.reason_text && (
          <Text style={[rs.reasonText, { color: c.textMuted }]} numberOfLines={3}>
            "{row.reason_text}"
          </Text>
        )}
        {row.state === 'COUNTERPART_ACCEPTED' && (
          <Text style={[rs.helpText, { color: c.textMuted }]}>
            Waiting for your Security Head to approve.
          </Text>
        )}

        {(showAcceptDecline || showWithdraw) && (
          <View style={rs.actionRow}>
            {showAcceptDecline && (
              <>
                <TouchableOpacity
                  onPress={onAccept}
                  style={[rs.actionBtn, rs.acceptBtn, { backgroundColor: c.zoneStatus.ALL_CLEAR ?? c.status.success ?? '#10b981' }]}
                  hitSlop={touch.hitSlop}
                >
                  <Text style={[rs.actionBtnText, { color: '#fff' }]}>✓ Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onDecline}
                  style={[rs.actionBtn, rs.declineBtn, { borderColor: c.severity.SEV1 }]}
                  hitSlop={touch.hitSlop}
                >
                  <Text style={[rs.actionBtnText, { color: c.severity.SEV1 }]}>Decline</Text>
                </TouchableOpacity>
              </>
            )}
            {showWithdraw && (
              <TouchableOpacity
                onPress={onWithdraw}
                style={[rs.actionBtn, rs.declineBtn, { borderColor: c.severity.SEV1 }]}
                hitSlop={touch.hitSlop}
              >
                <Text style={[rs.actionBtnText, { color: c.severity.SEV1 }]}>↺ Withdraw</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
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
  navSubtitle: { fontSize: fontSize.caption, marginTop: 2, maxWidth: 200 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: { fontSize: fontSize.body, marginTop: spacing.md },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  emptySub: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 300, marginBottom: spacing.md },
  emptyHint: { fontSize: fontSize.caption, textAlign: 'center', maxWidth: 300, fontStyle: 'italic' },
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  errorText: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 300, marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.sm },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  sectionHeader: { marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  sectionSubtitle: { fontSize: fontSize.caption, marginTop: 2 },
});

const rs = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  statusStrip: { width: 4 },
  rowContent: { flex: 1, padding: spacing.md },
  rowTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  rowName: { fontSize: fontSize.body, fontWeight: fontWeight.bold, flex: 1, marginRight: spacing.sm },
  rowMeta: { fontSize: fontSize.caption },
  statusPillText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  reasonText: { fontSize: fontSize.caption, marginTop: spacing.xs, fontStyle: 'italic' },
  helpText: { fontSize: fontSize.caption, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 100,
    alignItems: 'center',
  },
  acceptBtn: {},
  declineBtn: { borderWidth: 1, backgroundColor: 'transparent' },
  actionBtnText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
});
