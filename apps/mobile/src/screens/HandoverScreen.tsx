/**
 * HandoverScreen — mobile Shift Handover (BR-12). Field commander surface
 * (a commander hands over at shift-end on the floor, phone in hand).
 *
 * Mirrors dashboard /handovers: outgoing submits (server snapshots zones +
 * open incidents — immutable), incoming accepts (authority-transfer
 * record). Command-gated (SH/DSH/SHIFT_COMMANDER); the api re-enforces.
 *
 * Reuses the shipped /v1/handovers api (PR #9). Until that deploys,
 * fetch errors render as a friendly message — no crash.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
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
import {
  fetchHandovers,
  createHandover,
  acceptHandover,
  fetchShiftInstances,
  canManageShifts,
  todayDate,
  type Handover,
  type ShiftInstance,
} from '../services/handovers';

interface Props {
  staffRole: string;
  onBack: () => void;
}

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : '—';
}

export function HandoverScreen({ staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const s = makeStyles(c);
  const canManage = canManageShifts(staffRole);

  const [rows, setRows] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await fetchHandovers();
    setLoading(false);
    if (e || !data) {
      setError(e ?? 'Could not load handovers');
      return;
    }
    setError(null);
    setRows(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAccept = useCallback(
    (id: string) => {
      Alert.alert('Accept handover', 'Confirm authority transfer to the incoming shift?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setBusyId(id);
            const res = await acceptHandover(id);
            setBusyId(null);
            if (res.ok) void load();
            else Alert.alert('Failed', res.error ?? 'Could not accept');
          },
        },
      ]);
    },
    [load],
  );

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: c.textPrimary }]}>Shift Handover</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {canManage && (
          <TouchableOpacity style={s.newBtn} onPress={() => setModal(true)} activeOpacity={0.85}>
            <Text style={s.newBtnText}>⇄  New handover</Text>
          </TouchableOpacity>
        )}

        {loading && (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} />
          </View>
        )}

        {error && !loading && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); void load(); }}>
              <Text style={[s.retry, { color: c.primary }]}>↻ Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && rows.length === 0 && (
          <Text style={s.empty}>No handovers recorded yet.</Text>
        )}

        {rows.map((h) => {
          const accepted = h.state === 'ACCEPTED';
          return (
            <View key={h.id} style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {h.outgoing?.shift_name ?? 'Outgoing'} → {h.incoming?.shift_name ?? 'Incoming'}
                </Text>
                <View style={[s.pill, { backgroundColor: accepted ? '#10b98122' : '#f59e0b22' }]}>
                  <Text style={[s.pillText, { color: accepted ? '#059669' : '#b45309' }]}>
                    {h.state}
                  </Text>
                </View>
              </View>
              <Text style={s.cardSub}>
                {h.outgoing?.commander_name ?? '—'} → {h.incoming?.commander_name ?? '—'} ·{' '}
                {h.outgoing?.shift_date ?? ''}
              </Text>
              <Text style={s.meta}>Submitted: {fmt(h.outgoing_submitted_at)}</Text>
              <Text style={s.meta}>Accepted: {fmt(h.incoming_accepted_at)}</Text>
              <Text style={s.meta}>
                Snapshot: {h.snapshots?.zones?.length ?? 0} zones ·{' '}
                {h.snapshots?.open_incidents?.length ?? 0} open incidents
              </Text>
              {h.notes ? <Text style={s.notes}>{h.notes}</Text> : null}
              {(h.snapshots?.open_incidents ?? []).map((i, idx) => (
                <Text key={idx} style={s.incidentLine}>
                  ⚠ {i.type} · {i.severity} · {i.status}
                  {i.zone ? ` · ${i.zone}` : ''}
                </Text>
              ))}
              {!accepted && canManage && (
                <TouchableOpacity
                  style={s.acceptBtn}
                  onPress={() => onAccept(h.id)}
                  disabled={busyId === h.id}
                  activeOpacity={0.85}
                >
                  <Text style={s.acceptBtnText}>
                    {busyId === h.id ? 'Accepting…' : '✓ Accept (transfer authority)'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {modal && (
        <NewHandoverSheet
          onClose={() => setModal(false)}
          onDone={() => {
            setModal(false);
            setLoading(true);
            void load();
          }}
        />
      )}
    </Screen>
  );
}

function NewHandoverSheet(props: { onClose: () => void; onDone: () => void }) {
  const c = useColours();
  const s = makeStyles(c);
  const [date, setDate] = useState(todayDate());
  const [instances, setInstances] = useState<ShiftInstance[]>([]);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchShiftInstances(date).then(({ instances: insts }) => {
      if (alive) setInstances(insts ?? []);
    });
    return () => {
      alive = false;
    };
  }, [date]);

  const label = (i: ShiftInstance): string =>
    `${i.shift?.name ?? 'Shift'} · ${i.status}${i.commander ? ` · ${i.commander.name}` : ''}`;

  const submit = async () => {
    if (!outgoing || !incoming) {
      setErr('Pick both outgoing and incoming shifts.');
      return;
    }
    if (outgoing === incoming) {
      setErr('Outgoing and incoming must differ.');
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await createHandover({
      outgoing_instance_id: outgoing,
      incoming_instance_id: incoming,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) props.onDone();
    else setErr(res.error ?? 'Could not submit handover');
  };

  const Picker = ({
    title,
    value,
    onPick,
  }: {
    title: string;
    value: string | null;
    onPick: (id: string) => void;
  }) => (
    <View style={{ gap: spacing.xs }}>
      <Text style={s.fieldLabel}>{title}</Text>
      {instances.length === 0 ? (
        <Text style={s.muted}>No shift instances on this date.</Text>
      ) : (
        instances.map((i) => {
          const sel = value === i.id;
          return (
            <TouchableOpacity
              key={i.id}
              style={[s.pickRow, sel && { borderColor: c.primary, backgroundColor: c.primary + '14' }]}
              onPress={() => onPick(i.id)}
            >
              <Text style={[s.pickText, sel && { color: c.primary, fontWeight: fontWeight.bold }]}>
                {sel ? '● ' : '○ '}
                {label(i)}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onClose}>
      <View style={s.sheetBackdrop}>
        <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheet}>
          <Text style={s.sheetTitle}>New shift handover</Text>
          <Text style={s.sheetSub}>
            Zone status + open incidents are snapshotted server-side at submit (immutable).
          </Text>

          <Text style={s.fieldLabel}>Shift date (YYYY-MM-DD)</Text>
          <TextInput
            style={s.input}
            value={date}
            onChangeText={(t) => {
              setDate(t);
              setOutgoing(null);
              setIncoming(null);
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
          />

          <Picker title="Outgoing shift" value={outgoing} onPick={setOutgoing} />
          <Picker title="Incoming shift" value={incoming} onPick={setIncoming} />

          <Text style={s.fieldLabel}>Handover notes</Text>
          <TextInput
            style={[s.input, { minHeight: 80 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Open items, watch-outs, anything the incoming shift must know…"
            placeholderTextColor={c.textMuted}
            multiline
          />

          {err && <Text style={s.errorText}>{err}</Text>}

          <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={busy}>
            <Text style={s.submitBtnText}>{busy ? 'Submitting…' : '⇄ Submit handover'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={props.onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
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
    body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    center: { paddingVertical: spacing.xl, alignItems: 'center' },
    empty: { color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.lg },
    errorBox: {
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    errorText: { color: '#dc2626', fontSize: fontSize.small },
    retry: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
    newBtn: {
      backgroundColor: c.primary,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    newBtnText: { color: c.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.body },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 2,
      borderWidth: 1,
      borderColor: c.divider,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: c.textPrimary, flex: 1 },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
    pillText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
    cardSub: { fontSize: fontSize.small, color: c.textMuted, marginBottom: spacing.xs },
    meta: { fontSize: fontSize.caption, color: c.textMuted },
    notes: {
      marginTop: spacing.xs,
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
      color: c.textPrimary,
      fontSize: fontSize.small,
    },
    incidentLine: { fontSize: fontSize.caption, color: '#b45309', marginTop: 2 },
    acceptBtn: {
      marginTop: spacing.sm,
      backgroundColor: '#059669',
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    acceptBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.small },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheetScroll: { maxHeight: '88%' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sheetTitle: { fontSize: fontSize.h6, fontWeight: fontWeight.bold, color: c.textPrimary },
    sheetSub: { fontSize: fontSize.small, color: c.textMuted },
    fieldLabel: {
      fontSize: fontSize.caption,
      color: c.textMuted,
      marginTop: spacing.sm,
      fontWeight: fontWeight.medium,
    },
    muted: { color: c.textMuted, fontSize: fontSize.small, fontStyle: 'italic' },
    input: {
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
      color: c.textPrimary,
      fontSize: fontSize.body,
      minHeight: 44,
    },
    pickRow: {
      borderWidth: 1,
      borderColor: c.divider,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    pickText: { color: c.textPrimary, fontSize: fontSize.small },
    submitBtn: {
      marginTop: spacing.md,
      backgroundColor: c.primary,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    submitBtnText: { color: c.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.body },
    cancelBtn: { paddingVertical: spacing.md, alignItems: 'center' },
    cancelText: { color: c.textMuted, fontSize: fontSize.body },
  });
}
