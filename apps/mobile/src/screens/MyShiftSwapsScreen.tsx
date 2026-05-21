/**
 * MyShiftSwapsScreen — staff self-service for shift-swap workflow (BR-AP).
 * Pattern Engine Pass 5b + 5b-ii — Phase 5.24.
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
 * PROPOSE-SWAP CREATION (Pass 5b-ii): + Propose Swap FAB → bottom-sheet
 * modal. Picks: swap_type (DROP/COVER/SWAP) → my assignment (from
 * /v1/staff/me/assignments — new Pass 5b-ii backend endpoint) →
 * counterpart staff (COVER + SWAP only, from /v1/staff which is command-
 * role-gated; SWAP additionally needs counterpart's assignment which
 * is not yet exposed — SWAP picker shows the gated state and asks user
 * to coordinate via SH).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchMySwaps,
  acceptSwap,
  declineSwap,
  withdrawSwap,
  bucketSwaps,
  fetchMyAssignments,
  fetchVenueStaff,
  proposeSwap,
  SWAP_TYPE_LABEL,
  STATE_LABEL,
  type ShiftSwapRow,
  type AssignmentForPicker,
  type StaffListRow,
  type SwapType,
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
  const [proposeOpen, setProposeOpen] = useState(false);

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

      {/* + Propose Swap FAB — Pass 5b-ii */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: brand.primary_colour }]}
        onPress={() => setProposeOpen(true)}
        hitSlop={touch.hitSlop}
        accessibilityLabel="Propose swap"
      >
        <Text style={[s.fabText, { color: '#fff' }]}>+ Propose Swap</Text>
      </TouchableOpacity>

      {proposeOpen && (
        <ProposeSwapModal
          onClose={() => setProposeOpen(false)}
          onSubmitted={() => { setProposeOpen(false); void load(true); }}
        />
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Propose-swap modal — Pass 5b-ii
// Three swap types, two with counterpart picker:
//   DROP  — pick my assignment + reason; SH approves directly
//   COVER — pick my assignment + pick counterpart + reason
//   SWAP  — pick my assignment + pick counterpart + counterpart assignment + reason
//           (counterpart-assignment picker is Pass 5b-iii; for now SWAP is gated
//            with a TODO that tells the user to coordinate via SH)

function ProposeSwapModal({
  onClose, onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const c = useColours();
  const brand = useBrand();

  const [swapType, setSwapType] = useState<SwapType>('DROP');
  const [assignments, setAssignments] = useState<AssignmentForPicker[]>([]);
  const [staffList, setStaffList] = useState<StaffListRow[]>([]);
  const [chosenAssignment, setChosenAssignment] = useState<string | null>(null);
  const [chosenCounterpart, setChosenCounterpart] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [staffListErr, setStaffListErr] = useState<string | null>(null);

  // Load meta on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [asgRes, stRes] = await Promise.all([fetchMyAssignments(), fetchVenueStaff()]);
      if (cancelled) return;
      if (asgRes.error) setFormErr(asgRes.error);
      else setAssignments(asgRes.rows);
      // Staff list endpoint is command-role-gated — non-command callers get 403.
      // Surface that as an inline note rather than a hard error.
      if (stRes.error) setStaffListErr(stRes.error);
      else setStaffList(stRes.rows);
      setLoadingMeta(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function reset(newType: SwapType) {
    setSwapType(newType);
    setChosenCounterpart(null);
    setFormErr(null);
  }

  async function handleSubmit(): Promise<void> {
    setFormErr(null);
    if (!chosenAssignment) {
      setFormErr('Pick the shift you want to swap or drop');
      return;
    }
    if (swapType !== 'DROP' && !chosenCounterpart) {
      setFormErr('Pick a counterpart staff member');
      return;
    }
    if (swapType === 'SWAP') {
      setFormErr('SWAP type from mobile is coming in a follow-up release — choose COVER or DROP for now, or coordinate the swap via your SH');
      return;
    }
    setSubmitting(true);
    const { error: err } = await proposeSwap({
      swap_type: swapType,
      original_assignment_id: chosenAssignment,
      ...(swapType !== 'DROP' && chosenCounterpart ? { counterpart_staff_id: chosenCounterpart } : {}),
      ...(reason.trim() !== '' ? { reason_text: reason.trim() } : {}),
    });
    setSubmitting(false);
    if (err) { setFormErr(err); return; }
    onSubmitted();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={ms.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={ms.kbWrap}
        >
          <View style={[ms.sheet, { backgroundColor: c.background }]}>
            <View style={[ms.header, { borderBottomColor: c.divider }]}>
              <Text style={[ms.handle, { backgroundColor: c.textDisabled }]} />
              <Text style={[ms.title, { color: c.textPrimary }]}>Propose Swap</Text>
              <Text style={[ms.subtitle, { color: c.textMuted }]}>
                Your Security Head reviews + approves
              </Text>
            </View>

            <ScrollView contentContainerStyle={ms.body} keyboardShouldPersistTaps="handled">
              {/* Type chips */}
              <Text style={[ms.label, { color: c.textPrimary }]}>Swap type</Text>
              <View style={ms.chipRow}>
                {(['DROP', 'COVER', 'SWAP'] as SwapType[]).map((t) => {
                  const selected = swapType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => reset(t)}
                      style={[
                        ms.chip,
                        { borderColor: selected ? brand.primary_colour : c.borderStrong, backgroundColor: selected ? brand.primary_colour : c.background },
                      ]}
                      hitSlop={touch.hitSlop}
                    >
                      <Text style={[ms.chipText, { color: selected ? '#fff' : c.textPrimary }]}>
                        {SWAP_TYPE_LABEL[t]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {loadingMeta ? (
                <View style={ms.loadingBlock}>
                  <ActivityIndicator color={brand.primary_colour} />
                  <Text style={[ms.loadingText, { color: c.textMuted }]}>Loading your shifts…</Text>
                </View>
              ) : (
                <>
                  {/* Assignment picker */}
                  <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>
                    Your upcoming shifts ({assignments.length})
                  </Text>
                  {assignments.length === 0 ? (
                    <Text style={[ms.helperText, { color: c.textMuted }]}>
                      You have no upcoming shift assignments in the next 30 days.
                    </Text>
                  ) : (
                    assignments.map((a) => {
                      const selected = chosenAssignment === a.assignment_id;
                      return (
                        <TouchableOpacity
                          key={a.assignment_id}
                          onPress={() => setChosenAssignment(a.assignment_id)}
                          style={[
                            ms.optionCard,
                            { borderColor: selected ? brand.primary_colour : c.borderStrong, backgroundColor: selected ? c.surface : c.background },
                          ]}
                          hitSlop={touch.hitSlop}
                        >
                          <Text style={[ms.optionTitle, { color: c.textPrimary }]}>
                            {a.shift_date} · {a.shift_label}
                          </Text>
                          <Text style={[ms.optionMeta, { color: c.textMuted }]}>
                            {a.zone_name} · {a.assignment_type}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}

                  {/* Counterpart picker — COVER + SWAP only */}
                  {(swapType === 'COVER' || swapType === 'SWAP') && (
                    <>
                      <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>
                        Counterpart staff
                      </Text>
                      {staffListErr ? (
                        <Text style={[ms.helperText, { color: c.severity.SEV1 }]}>
                          You can't see the venue staff list. SWAP / COVER need your SH to assist
                          for now — or use DROP and let the SH find a replacement.
                        </Text>
                      ) : staffList.length === 0 ? (
                        <Text style={[ms.helperText, { color: c.textMuted }]}>No other staff in this venue.</Text>
                      ) : (
                        staffList.map((s) => {
                          const selected = chosenCounterpart === s.id;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              onPress={() => setChosenCounterpart(s.id)}
                              style={[
                                ms.optionCard,
                                { borderColor: selected ? brand.primary_colour : c.borderStrong, backgroundColor: selected ? c.surface : c.background },
                              ]}
                              hitSlop={touch.hitSlop}
                            >
                              <Text style={[ms.optionTitle, { color: c.textPrimary }]}>{s.name}</Text>
                              <Text style={[ms.optionMeta, { color: c.textMuted }]}>{s.role}</Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* SWAP-specific note */}
                  {swapType === 'SWAP' && (
                    <View style={[ms.errBox, { backgroundColor: c.severity.SEV1_BG, borderLeftColor: c.severity.SEV1 }]}>
                      <Text style={[ms.errText, { color: c.severity.SEV1 }]}>
                        SWAP requires picking the counterpart's specific assignment — that picker
                        ships in the next release. For now, choose COVER or DROP, or ask your SH
                        to set up the SWAP from the dashboard.
                      </Text>
                    </View>
                  )}

                  {/* Reason */}
                  <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>Reason (optional)</Text>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Brief note for your SH and counterpart"
                    placeholderTextColor={c.textDisabled}
                    multiline
                    numberOfLines={3}
                    style={[ms.input, ms.textArea, { backgroundColor: c.surface, color: c.textPrimary, borderColor: c.borderStrong }]}
                  />
                </>
              )}

              {formErr && (
                <View style={[ms.errBox, { backgroundColor: c.severity.SEV1_BG, borderLeftColor: c.severity.SEV1 }]}>
                  <Text style={[ms.errText, { color: c.severity.SEV1 }]}>{formErr}</Text>
                </View>
              )}
            </ScrollView>

            <View style={[ms.footer, { borderTopColor: c.divider }]}>
              <TouchableOpacity
                onPress={onClose}
                style={[ms.btn, { borderColor: c.borderStrong, backgroundColor: c.background }]}
                hitSlop={touch.hitSlop}
              >
                <Text style={[ms.btnText, { color: c.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSubmit()}
                disabled={submitting || loadingMeta}
                style={[
                  ms.btn,
                  { backgroundColor: brand.primary_colour, opacity: submitting || loadingMeta ? 0.6 : 1 },
                ]}
                hitSlop={touch.hitSlop}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[ms.btnText, { color: '#fff', fontWeight: fontWeight.bold }]}>
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  list: { padding: spacing.lg, paddingBottom: spacing['3xl'] + 60 },
  sectionHeader: { marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  sectionSubtitle: { fontSize: fontSize.caption, marginTop: 2 },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...shadow.md,
  },
  fabText: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
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

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  kbWrap: { width: '100%' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '92%', minHeight: '60%' },
  header: { padding: spacing.lg, borderBottomWidth: 1, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  title: { fontSize: fontSize.h5, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.caption, marginTop: spacing.xs },
  body: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  helperText: { fontSize: fontSize.caption, fontStyle: 'italic', marginBottom: spacing.sm },
  loadingBlock: { padding: spacing.xl, alignItems: 'center' },
  loadingText: { fontSize: fontSize.caption, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  optionCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  optionTitle: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  optionMeta: { fontSize: fontSize.caption, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  errBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 4 },
  errText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, padding: spacing.lg, borderTopWidth: 1 },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
});
