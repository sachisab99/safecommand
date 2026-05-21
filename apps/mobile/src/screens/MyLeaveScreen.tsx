/**
 * MyLeaveScreen — staff self-service for leave / unavailability (BR-AN).
 * Pattern Engine Pass 5a — Phase 5.24.
 *
 * Surfaces the staff's own /v1/unavailability rows + a modal to submit
 * a new REQUESTED row + a Withdraw affordance on REQUESTED rows.
 *
 * Submittable types (4 of 6): LEAVE_ANNUAL / LEAVE_SICK / LEAVE_TRAINING /
 * LEAVE_PERSONAL. OFF_DUTY is roster-system-managed (auto-derived from
 * the cycle), and SUSPENDED is HR-managed — neither is self-submittable.
 *
 * DB safety net (mig 022 §5.6): EXCLUDE-gist on (staff_id, daterange)
 * WHERE status='APPROVED' — staff can submit REQUESTED rows freely; the
 * conflict only fires when an SH approves an overlapping row. Surfaced
 * here on the SH side as 422 OVERLAP via dashboard Pass 4b (this surface
 * doesn't need to handle that — the SH does).
 */

import React, { useCallback, useEffect, useState } from 'react';
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
  fetchMyUnavailability,
  submitLeaveRequest,
  withdrawUnavailability,
  SUBMITTABLE_TYPES,
  UNAVAILABILITY_TYPE_LABEL,
  STATUS_TONE,
  todayISO,
  addDaysISO,
  type UnavailabilityRow,
  type UnavailabilityType,
} from '../services/unavailability';
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
  staffName: string;
  onBack: () => void;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MyLeaveScreen({ staffName, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [rows, setRows] = useState<UnavailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { rows: r, error: err } = await fetchMyUnavailability();
    if (err) setError(err);
    else { setError(null); setRows(r); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    // 5-minute background refresh — status may flip when SH approves
    const id = setInterval(() => void load(), 300_000);
    return () => clearInterval(id);
  }, [load]);

  async function handleWithdraw(row: UnavailabilityRow): Promise<void> {
    Alert.alert(
      'Withdraw this request?',
      `${UNAVAILABILITY_TYPE_LABEL[row.unavailability_type]} · ${row.unavailable_from} → ${row.unavailable_to}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await withdrawUnavailability(row.id);
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
          <Text style={[s.navTitle, { color: c.textPrimary }]}>My Leave</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]} numberOfLines={1}>{staffName}</Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading leave history…</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>🌴</Text>
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
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyEmoji}>🌴</Text>
              <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No leave history</Text>
              <Text style={[s.emptySub, { color: c.textMuted }]}>
                Tap "+ Request Leave" below to submit your first request.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <LeaveRow
              row={item}
              colours={c}
              onWithdraw={() => void handleWithdraw(item)}
            />
          )}
          ListFooterComponent={
            rows.length > 0 ? (
              <View style={s.footer}>
                <Text style={[s.footerText, { color: c.textDisabled }]}>
                  Total: {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* FAB — submit new */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: brand.primary_colour }]}
        onPress={() => setSubmitOpen(true)}
        hitSlop={touch.hitSlop}
        accessibilityLabel="Request leave"
      >
        <Text style={[s.fabText, { color: '#fff' }]}>+ Request Leave</Text>
      </TouchableOpacity>

      {submitOpen && (
        <SubmitLeaveModal
          onClose={() => setSubmitOpen(false)}
          onSubmitted={() => { setSubmitOpen(false); void load(true); }}
        />
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Row

function LeaveRow({
  row, colours: c, onWithdraw,
}: {
  row: UnavailabilityRow;
  colours: Colours;
  onWithdraw: () => void;
}) {
  const statusTone = STATUS_TONE[row.status];
  const stripColour =
    row.status === 'APPROVED' ? c.zoneStatus.ALL_CLEAR ?? c.status.success ?? '#10b981' :
    row.status === 'REJECTED' ? c.severity.SEV1 :
    row.status === 'WITHDRAWN' ? c.textDisabled :
    c.status.warning ?? '#f59e0b';
  const isPending = row.status === 'REQUESTED';

  return (
    <View style={[rs.row, { backgroundColor: c.background }]}>
      <View style={[rs.statusStrip, { backgroundColor: stripColour }]} />
      <View style={rs.rowContent}>
        <View style={rs.rowTopRow}>
          <Text style={[rs.rowName, { color: c.textPrimary }]} numberOfLines={1}>
            {UNAVAILABILITY_TYPE_LABEL[row.unavailability_type]}
          </Text>
          <Text style={[rs.statusPillText, { color: stripColour }]}>
            {statusTone.emoji} {statusTone.label}
          </Text>
        </View>
        <Text style={[rs.rowDate, { color: c.textMuted }]}>
          {row.unavailable_from} → {row.unavailable_to}
        </Text>
        {row.reason_text && (
          <Text style={[rs.reasonText, { color: c.textMuted }]} numberOfLines={3}>
            {row.reason_text}
          </Text>
        )}
        {isPending && (
          <TouchableOpacity onPress={onWithdraw} style={rs.withdrawBtn} hitSlop={touch.hitSlop}>
            <Text style={[rs.withdrawText, { color: c.severity.SEV1 }]}>Withdraw</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Submit modal

function SubmitLeaveModal({
  onClose, onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const c = useColours();
  const brand = useBrand();
  const [type, setType] = useState<UnavailabilityType>('LEAVE_ANNUAL');
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(addDaysISO(todayISO(), 1));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setFormErr(null);
    if (!ISO_DATE_RE.test(fromDate) || !ISO_DATE_RE.test(toDate)) {
      setFormErr('Dates must be YYYY-MM-DD');
      return;
    }
    if (toDate < fromDate) {
      setFormErr('To-date must be on or after from-date');
      return;
    }
    setSubmitting(true);
    const { error: err } = await submitLeaveRequest({
      unavailable_from: fromDate,
      unavailable_to: toDate,
      unavailability_type: type,
      reason_text: reason.trim() === '' ? undefined : reason.trim(),
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
              <Text style={[ms.title, { color: c.textPrimary }]}>Request Leave</Text>
              <Text style={[ms.subtitle, { color: c.textMuted }]}>
                Submit for your Security Head to review
              </Text>
            </View>

            <ScrollView contentContainerStyle={ms.body} keyboardShouldPersistTaps="handled">
              {/* Type chips */}
              <Text style={[ms.label, { color: c.textPrimary }]}>Type</Text>
              <View style={ms.chipRow}>
                {SUBMITTABLE_TYPES.map((t) => {
                  const selected = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t)}
                      style={[
                        ms.chip,
                        { borderColor: selected ? brand.primary_colour : c.borderStrong, backgroundColor: selected ? brand.primary_colour : c.background },
                      ]}
                      hitSlop={touch.hitSlop}
                    >
                      <Text style={[
                        ms.chipText,
                        { color: selected ? ('#fff') : c.textPrimary },
                      ]}>
                        {UNAVAILABILITY_TYPE_LABEL[t]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Dates */}
              <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>From date</Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.textDisabled}
                autoCapitalize="none"
                autoCorrect={false}
                style={[ms.input, { backgroundColor: c.surface, color: c.textPrimary, borderColor: c.borderStrong }]}
              />

              <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>To date</Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.textDisabled}
                autoCapitalize="none"
                autoCorrect={false}
                style={[ms.input, { backgroundColor: c.surface, color: c.textPrimary, borderColor: c.borderStrong }]}
              />

              <Text style={[ms.label, { color: c.textPrimary, marginTop: spacing.md }]}>Reason (optional)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Brief note for your SH"
                placeholderTextColor={c.textDisabled}
                multiline
                numberOfLines={3}
                style={[ms.input, ms.textArea, { backgroundColor: c.surface, color: c.textPrimary, borderColor: c.borderStrong }]}
              />

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
                disabled={submitting}
                style={[
                  ms.btn,
                  ms.btnPrimary,
                  { backgroundColor: brand.primary_colour, opacity: submitting ? 0.6 : 1 },
                ]}
                hitSlop={touch.hitSlop}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={'#fff'} />
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
  emptySub: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 300 },
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  errorText: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 300, marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.sm },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  list: { padding: spacing.lg, paddingBottom: spacing['3xl'] + 60 },
  footer: { alignItems: 'center', padding: spacing.lg },
  footerText: { fontSize: fontSize.caption },
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
  rowDate: { fontSize: fontSize.caption, marginBottom: spacing.xs },
  reasonText: { fontSize: fontSize.caption, marginTop: spacing.xs, fontStyle: 'italic' },
  statusPillText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  withdrawBtn: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xs },
  withdrawText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium, textDecorationLine: 'underline' },
});

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  kbWrap: { width: '100%' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%', minHeight: '60%' },
  header: { padding: spacing.lg, borderBottomWidth: 1, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  title: { fontSize: fontSize.h5, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.caption, marginTop: spacing.xs },
  body: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  errBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 4 },
  errText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, padding: spacing.lg, borderTopWidth: 1 },
  btn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', minWidth: 100, borderWidth: 1, borderColor: 'transparent' },
  btnPrimary: {},
  btnText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
});
