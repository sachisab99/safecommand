/**
 * DrillDetailScreen — drill audit-grade detail (BR-A).
 *
 * Phase 5.18 — mirrors dashboard /drills/[id] on mobile. Surfaces the
 * full per-staff timeline, participation matrix, and reason classification
 * needed for NABH and Fire NOC compliance audits.
 *
 * Sections:
 *   1. Header card — drill type / status / scheduled / duration
 *   2. Notes (if drill.notes set)
 *   3. My-row banner — "Acknowledge" / "Mark me safe" CTAs when relevant
 *   4. Compliance metrics card — aggregate counts + ack-latency stats
 *   5. Timeline — chronological audit_logs events
 *   6. Participation matrix — per-staff status pill, ack/safe times,
 *      reason chip (if set), [Set reason] button (SH/DSH/FM/SHIFT_COMMANDER)
 *
 * Live-poll every 10s while drill.status='IN_PROGRESS' (matches incident-
 * detail pattern from Phase 5.8).
 *
 * Refs: BR-A (Drill Management Module), BR-14 (Health Score 10% weight),
 *       ADR 0004 (reason taxonomy), repo mig 013 (schema).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import {
  Screen,
  useColours,
  useBrand,
  spacing,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  touch,
  type Colours,
} from '../theme';
import {
  fetchDrillDetail,
  acknowledgeDrill,
  markDrillSafe,
  setParticipantReason,
  canSetParticipantReason,
  REASON_CODES,
  REASON_LABEL,
  REASON_HINT,
  DRILL_TYPE_LABEL,
  DRILL_TYPE_ICON,
  formatDuration,
  type DrillDetail,
  type DrillParticipant,
  type DrillTimelineEvent,
  type ReasonCode,
  type ParticipantStatus,
} from '../services/drills';

interface Props {
  drillId: string;
  staffId: string;
  staffRole: string;
  onBack: () => void;
}

const STATUS_TONE: Record<ParticipantStatus, (c: Colours) => { fg: string; bg: string }> = {
  NOTIFIED: (c) => ({ fg: c.status.warning, bg: c.status.warningBg }),
  ACKNOWLEDGED: (c) => ({ fg: c.status.info, bg: c.status.infoBg }),
  SAFE_CONFIRMED: (c) => ({ fg: c.status.success, bg: c.status.successBg }),
  MISSED: (c) => ({ fg: c.status.danger, bg: c.status.dangerBg }),
};

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  NOTIFIED: 'Notified',
  ACKNOWLEDGED: 'Acknowledged',
  SAFE_CONFIRMED: 'Marked safe',
  MISSED: 'Did not acknowledge',
};

type FilterKey = 'ALL' | 'NEEDS_ATTENTION' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'SAFE_CONFIRMED' | 'MISSED';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'NEEDS_ATTENTION', label: 'Needs reason' },
  { key: 'NOTIFIED', label: 'Notified' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'SAFE_CONFIRMED', label: 'Marked safe' },
  { key: 'MISSED', label: 'Did not ack' },
];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtSeconds(sec: number | null): string {
  if (sec === null || sec < 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function DrillDetailScreen({ drillId, staffId, staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const canSetReason = canSetParticipantReason(staffRole);

  const [detail, setDetail] = useState<DrillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [reasonTarget, setReasonTarget] = useState<DrillParticipant | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { detail: d, error: err } = await fetchDrillDetail(drillId);
    if (err) {
      setError(err);
    } else {
      setError(null);
      setDetail(d);
    }
    setLoading(false);
    setRefreshing(false);
  }, [drillId]);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Live poll while IN_PROGRESS — matches incident-detail pattern
  useEffect(() => {
    if (!detail || detail.drill.status !== 'IN_PROGRESS') return;
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [detail, load]);

  const myRow = useMemo(
    () => detail?.participants.find((p) => p.staff_id === staffId) ?? null,
    [detail, staffId],
  );

  const filteredParticipants = useMemo(() => {
    if (!detail) return [];
    if (filter === 'ALL') return detail.participants;
    if (filter === 'NEEDS_ATTENTION') {
      // Missed without reason (the actionable bucket for SH)
      return detail.participants.filter(
        (p) => p.status === 'MISSED' && p.reason_code === null,
      );
    }
    return detail.participants.filter((p) => p.status === filter);
  }, [detail, filter]);

  const handleAcknowledge = async (): Promise<void> => {
    setActionInFlight('ack');
    const { error: e } = await acknowledgeDrill(drillId);
    setActionInFlight(null);
    if (e) {
      Alert.alert('Could not acknowledge', e);
      return;
    }
    await load(true);
  };

  const handleMarkSafe = async (): Promise<void> => {
    setActionInFlight('safe');
    const { error: e } = await markDrillSafe(drillId);
    setActionInFlight(null);
    if (e) {
      Alert.alert('Could not mark safe', e);
      return;
    }
    await load(true);
  };

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Drill detail</Text>
          {detail && (
            <Text style={[s.navSubtitle, { color: c.textMuted }]}>
              {DRILL_TYPE_LABEL[detail.drill.drill_type] ?? detail.drill.drill_type} ·{' '}
              {detail.drill.status}
            </Text>
          )}
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>⚠️</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load detail</Text>
          <Text style={[s.errorMsg, { color: c.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { backgroundColor: c.primary }]}
          >
            <Text style={[s.retryText, { color: c.textOnPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : detail ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
        >
          <HeaderCard detail={detail} colours={c} />

          {detail.drill.notes && (
            <View style={[ss.notesCard, { backgroundColor: c.background, borderColor: c.divider }]}>
              <Text style={[ss.notesLabel, { color: c.textMuted }]}>Notes</Text>
              <Text style={[ss.notesBody, { color: c.textPrimary }]}>
                {detail.drill.notes.replace(/^\[DEMO\]\s*/, '')}
              </Text>
            </View>
          )}

          {myRow && detail.drill.status === 'IN_PROGRESS' && (
            <MyRowCallout
              myRow={myRow}
              colours={c}
              actionInFlight={actionInFlight}
              onAcknowledge={() => void handleAcknowledge()}
              onMarkSafe={() => void handleMarkSafe()}
            />
          )}

          <ComplianceCard aggregates={detail.aggregates} colours={c} />

          <TimelineSection timeline={detail.timeline} colours={c} />

          <ParticipationSection
            participants={filteredParticipants}
            allCount={detail.participants.length}
            filter={filter}
            onFilterChange={setFilter}
            requesterView={detail.requester_view}
            canSetReason={canSetReason}
            colours={c}
            onSetReason={(p) => setReasonTarget(p)}
          />
        </ScrollView>
      ) : null}

      <ReasonEditorModal
        target={reasonTarget}
        colours={c}
        onClose={() => setReasonTarget(null)}
        onSaved={async () => {
          setReasonTarget(null);
          await load(true);
        }}
      />
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components

function HeaderCard({ detail, colours: c }: { detail: DrillDetail; colours: Colours }) {
  const { drill } = detail;
  const icon = DRILL_TYPE_ICON[drill.drill_type] ?? '⚠️';
  const score =
    detail.aggregates.total_participants > 0
      ? Math.round(
          (detail.aggregates.safe_count / detail.aggregates.total_participants) * 100,
        )
      : null;

  return (
    <View style={[hc.card, { backgroundColor: c.background }]}>
      <View style={hc.row}>
        <Text style={hc.icon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[hc.title, { color: c.textPrimary }]}>
            {DRILL_TYPE_LABEL[drill.drill_type] ?? drill.drill_type}
          </Text>
          <Text style={[hc.meta, { color: c.textMuted }]}>
            📅 {fmt(drill.scheduled_for)}
            {drill.duration_seconds !== null && ` · ⏱ ${formatDuration(drill.duration_seconds)}`}
          </Text>
        </View>
        {score !== null && (
          <View style={[hc.scorePill, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <Text style={[hc.scoreValue, { color: c.textPrimary }]}>{score}</Text>
            <Text style={[hc.scoreLabel, { color: c.textMuted }]}>SAFE</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MyRowCallout({
  myRow,
  colours: c,
  actionInFlight,
  onAcknowledge,
  onMarkSafe,
}: {
  myRow: DrillParticipant;
  colours: Colours;
  actionInFlight: string | null;
  onAcknowledge: () => void;
  onMarkSafe: () => void;
}) {
  const status = myRow.status;
  if (status === 'SAFE_CONFIRMED') {
    return (
      <View style={[mc.card, { backgroundColor: c.status.successBg, borderColor: c.status.success }]}>
        <Text style={[mc.title, { color: c.status.success }]}>✓ You marked yourself safe</Text>
        <Text style={[mc.meta, { color: c.textSecondary }]}>at {fmt(myRow.safe_confirmed_at)}</Text>
      </View>
    );
  }
  if (status === 'MISSED') {
    return (
      <View style={[mc.card, { backgroundColor: c.status.dangerBg, borderColor: c.status.danger }]}>
        <Text style={[mc.title, { color: c.status.danger }]}>This drill ended without your acknowledgement</Text>
        <Text style={[mc.meta, { color: c.textSecondary }]}>
          Speak to your shift commander if this was incorrectly recorded.
        </Text>
      </View>
    );
  }
  // NOTIFIED or ACKNOWLEDGED — actions available
  return (
    <View style={[mc.card, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
      <Text style={[mc.title, { color: c.primaryStrong }]}>Drill in progress</Text>
      <Text style={[mc.meta, { color: c.textSecondary }]}>
        {status === 'NOTIFIED'
          ? 'Acknowledge that you received the drill alert, then mark yourself safe once you reach your assembly point.'
          : `Acknowledged at ${fmt(myRow.acknowledged_at)}. Mark yourself safe once you reach your assembly point.`}
      </Text>
      <View style={mc.actions}>
        {status === 'NOTIFIED' && (
          <TouchableOpacity
            style={[mc.btnPrimary, { backgroundColor: c.primary, opacity: actionInFlight === 'ack' ? 0.5 : 1 }]}
            disabled={actionInFlight === 'ack'}
            onPress={onAcknowledge}
            activeOpacity={0.8}
          >
            <Text style={[mc.btnPrimaryText, { color: c.textOnPrimary }]}>
              {actionInFlight === 'ack' ? '…' : '✓ Acknowledge'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[mc.btnPrimary, { backgroundColor: c.status.success, opacity: actionInFlight === 'safe' ? 0.5 : 1 }]}
          disabled={actionInFlight === 'safe'}
          onPress={onMarkSafe}
          activeOpacity={0.8}
        >
          <Text style={[mc.btnPrimaryText, { color: '#fff' }]}>
            {actionInFlight === 'safe' ? '…' : '🛡 I AM SAFE'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ComplianceCard({
  aggregates,
  colours: c,
}: {
  aggregates: DrillDetail['aggregates'];
  colours: Colours;
}) {
  if (aggregates.total_participants === 0) {
    return (
      <View style={[cc.card, { backgroundColor: c.background }]}>
        <Text style={[cc.heading, { color: c.textMuted }]}>Compliance metrics</Text>
        <Text style={[cc.empty, { color: c.textSecondary }]}>
          Per-staff acknowledgement tracking begins with drills started after 2026-05-08. This drill was scheduled before participant tracking was enabled.
        </Text>
        <Text style={[cc.emptyMeta, { color: c.textDisabled }]}>
          Legacy aggregate: {aggregates.legacy_total_safe} marked safe of {aggregates.legacy_total_expected} expected.
        </Text>
      </View>
    );
  }
  return (
    <View style={[cc.card, { backgroundColor: c.background }]}>
      <Text style={[cc.heading, { color: c.textMuted }]}>Compliance metrics</Text>
      <View style={cc.tileRow}>
        <Tile label="Total" value={aggregates.total_participants} colours={c} tone="neutral" />
        <Tile label="Safe" value={aggregates.safe_count} colours={c} tone="good" />
        <Tile
          label="Acknowledged"
          value={aggregates.acknowledged_count}
          colours={c}
          tone={aggregates.acknowledged_count > 0 ? 'info' : 'neutral'}
        />
      </View>
      <View style={cc.tileRow}>
        <Tile
          label="Did not ack"
          value={aggregates.missed_count}
          colours={c}
          tone={aggregates.missed_count > 0 ? 'bad' : 'neutral'}
        />
        <Tile
          label="Excused"
          value={aggregates.excused_count}
          colours={c}
          tone={aggregates.excused_count > 0 ? 'good' : 'neutral'}
        />
        <Tile
          label="Unexcused"
          value={aggregates.unexcused_count}
          colours={c}
          tone={aggregates.unexcused_count > 0 ? 'bad' : 'good'}
        />
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
  value: number;
  tone: 'good' | 'bad' | 'info' | 'neutral';
  colours: Colours;
}) {
  const tonecolor =
    tone === 'good'
      ? c.status.success
      : tone === 'bad'
        ? c.status.danger
        : tone === 'info'
          ? c.status.info
          : c.textPrimary;
  return (
    <View style={[ti.tile, { backgroundColor: c.surface }]}>
      <Text style={[ti.value, { color: tonecolor }]}>{value}</Text>
      <Text style={[ti.label, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

function TimelineSection({
  timeline,
  colours: c,
}: {
  timeline: DrillTimelineEvent[];
  colours: Colours;
}) {
  if (timeline.length === 0) return null;
  return (
    <View style={[ts.section, { backgroundColor: c.background }]}>
      <Text style={[ts.heading, { color: c.textMuted }]}>Timeline</Text>
      {timeline.map((event, idx) => (
        <View key={event.id} style={ts.row}>
          <View
            style={[
              ts.dot,
              {
                backgroundColor: actionDotColour(event.action, c),
                borderColor: c.background,
              },
            ]}
          />
          {idx < timeline.length - 1 && <View style={[ts.line, { backgroundColor: c.divider }]} />}
          <View style={{ flex: 1 }}>
            <Text style={[ts.action, { color: c.textPrimary }]}>
              {prettifyAction(event.action)}
            </Text>
            <Text style={[ts.meta, { color: c.textMuted }]}>
              {fmt(event.created_at)}
              {event.actor && ` · ${event.actor.name} (${event.actor.role})`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function actionDotColour(action: string, c: Colours): string {
  if (action.includes('START')) return c.status.success;
  if (action.includes('END') || action.includes('COMPLETED')) return c.status.info;
  if (action.includes('CANCEL')) return c.textMuted;
  if (action.includes('SAFE')) return c.status.success;
  if (action.includes('ACK')) return c.status.info;
  if (action.includes('REASON')) return c.status.warning;
  return c.primary;
}

function prettifyAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\w/g, (s) => s.toUpperCase());
}

function ParticipationSection({
  participants,
  allCount,
  filter,
  onFilterChange,
  requesterView,
  canSetReason,
  colours: c,
  onSetReason,
}: {
  participants: DrillParticipant[];
  allCount: number;
  filter: FilterKey;
  onFilterChange: (k: FilterKey) => void;
  requesterView: 'full' | 'self';
  canSetReason: boolean;
  colours: Colours;
  onSetReason: (p: DrillParticipant) => void;
}) {
  return (
    <View style={[ps.section, { backgroundColor: c.background }]}>
      <Text style={[ps.heading, { color: c.textMuted }]}>
        Participation ({allCount})
        {requesterView === 'self' && (
          <Text style={{ color: c.textDisabled, fontWeight: fontWeight.regular }}> · your row only</Text>
        )}
      </Text>
      {requesterView === 'full' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ps.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => onFilterChange(f.key)}
                style={[
                  ps.filterChip,
                  {
                    backgroundColor: active ? c.primary : c.surface,
                    borderColor: active ? c.primary : c.divider,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    ps.filterChipText,
                    { color: active ? c.textOnPrimary : c.textPrimary },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      {participants.length === 0 ? (
        <Text style={[ps.empty, { color: c.textMuted }]}>
          No participants match this filter.
        </Text>
      ) : (
        participants.map((p) => (
          <ParticipantRow
            key={p.id}
            p={p}
            colours={c}
            canSetReason={canSetReason}
            onSetReason={() => onSetReason(p)}
          />
        ))
      )}
    </View>
  );
}

function ParticipantRow({
  p,
  colours: c,
  canSetReason,
  onSetReason,
}: {
  p: DrillParticipant;
  colours: Colours;
  canSetReason: boolean;
  onSetReason: () => void;
}) {
  const tone = STATUS_TONE[p.status](c);
  const showReasonAffordance =
    canSetReason && (p.status === 'MISSED' || p.status === 'NOTIFIED' || p.status === 'ACKNOWLEDGED');
  return (
    <View style={[pr.row, { borderBottomColor: c.divider }]}>
      <View style={pr.avatar}>
        <Text style={[pr.avatarText, { color: c.textSecondary }]}>
          {(p.staff?.name ?? '?').slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[pr.name, { color: c.textPrimary }]} numberOfLines={1}>
          {p.staff?.name ?? '(unknown)'}
        </Text>
        <Text style={[pr.role, { color: c.textMuted }]}>{p.staff?.role ?? '—'}</Text>
        <View style={pr.statusLine}>
          <View style={[pr.statusPill, { backgroundColor: tone.bg }]}>
            <Text style={[pr.statusText, { color: tone.fg }]}>{STATUS_LABEL[p.status]}</Text>
          </View>
          {p.is_excused && p.status === 'MISSED' && (
            <View style={[pr.excusedPill, { backgroundColor: c.status.successBg }]}>
              <Text style={[pr.excusedText, { color: c.status.success }]}>EXCUSED</Text>
            </View>
          )}
        </View>
        {p.acknowledged_at && (
          <Text style={[pr.meta, { color: c.textMuted }]}>
            Ack {fmt(p.acknowledged_at)} ({fmtSeconds(p.ack_latency_seconds)})
          </Text>
        )}
        {p.safe_confirmed_at && (
          <Text style={[pr.meta, { color: c.textMuted }]}>
            Safe {fmt(p.safe_confirmed_at)}
          </Text>
        )}
        {p.reason_code && (
          <View style={pr.reasonBlock}>
            <Text style={[pr.reasonCode, { color: c.status.warning }]}>
              ▸ {REASON_LABEL[p.reason_code]}
            </Text>
            {p.reason_notes && (
              <Text style={[pr.reasonNotes, { color: c.textSecondary }]} numberOfLines={3}>
                "{p.reason_notes}"
              </Text>
            )}
            {p.reason_setter && p.reason_set_at && (
              <Text style={[pr.reasonAttribution, { color: c.textDisabled }]}>
                Set by {p.reason_setter.name} · {fmt(p.reason_set_at)}
              </Text>
            )}
          </View>
        )}
        {showReasonAffordance && (
          <TouchableOpacity
            onPress={onSetReason}
            style={[pr.reasonBtn, { borderColor: c.divider, backgroundColor: c.surface }]}
            activeOpacity={0.7}
          >
            <Text style={[pr.reasonBtnText, { color: c.primary }]}>
              {p.reason_code ? 'Change reason' : 'Set reason'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ReasonEditorModal — bottom-sheet picker

function ReasonEditorModal({
  target,
  colours: c,
  onClose,
  onSaved,
}: {
  target: DrillParticipant | null;
  colours: Colours;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): React.JSX.Element {
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [reasonNotes, setReasonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const notesRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!target) return;
    setReasonCode(target.reason_code);
    setReasonNotes(target.reason_notes ?? '');
    setErr(null);
    setSubmitting(false);
  }, [target]);

  const handleSave = async (): Promise<void> => {
    if (!target) return;
    if (reasonCode === 'OTHER' && reasonNotes.trim().length < 10) {
      setErr('Notes must be at least 10 characters when "Other" is selected.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error: e } = await setParticipantReason(target.drill_session_id, target.staff_id, {
      reason_code: reasonCode,
      reason_notes: reasonNotes.trim() === '' ? null : reasonNotes.trim(),
    });
    setSubmitting(false);
    if (e) {
      setErr(e);
      return;
    }
    await onSaved();
  };

  const handleClear = async (): Promise<void> => {
    if (!target) return;
    setSubmitting(true);
    setErr(null);
    const { error: e } = await setParticipantReason(target.drill_session_id, target.staff_id, {
      reason_code: null,
    });
    setSubmitting(false);
    if (e) {
      setErr(e);
      return;
    }
    await onSaved();
  };

  return (
    <Modal
      visible={target !== null}
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
          <ScrollView contentContainerStyle={ms.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={[ms.title, { color: c.textPrimary }]}>
              Reason for {target?.staff?.name ?? 'staff'}
            </Text>
            <Text style={[ms.helper, { color: c.textMuted }]}>
              Classify why this person did not acknowledge. Saved per ADR 0004 taxonomy.
            </Text>

            <Text style={[ms.label, { color: c.textMuted }]}>Reason</Text>
            <View style={ms.chipRow}>
              {REASON_CODES.map((code) => {
                const active = reasonCode === code;
                return (
                  <TouchableOpacity
                    key={code}
                    onPress={() => {
                      setReasonCode(code);
                      if (code === 'OTHER') {
                        setTimeout(() => notesRef.current?.focus(), 250);
                      }
                    }}
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
                      {REASON_LABEL[code]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {reasonCode && (
              <Text style={[ms.hint, { color: c.textMuted }]}>{REASON_HINT[reasonCode]}</Text>
            )}

            <Text style={[ms.label, { color: c.textMuted }]}>
              Notes {reasonCode === 'OTHER' ? '(required, ≥10 chars)' : '(optional)'}
            </Text>
            <TextInput
              ref={notesRef}
              style={[
                ms.input,
                ms.textarea,
                { backgroundColor: c.surface, borderColor: c.divider, color: c.textPrimary },
              ]}
              value={reasonNotes}
              onChangeText={setReasonNotes}
              placeholder={
                reasonCode === 'OTHER'
                  ? 'Required: e.g. "Off-prem training", "ER ambulance run"…'
                  : 'Add detail for the audit trail…'
              }
              placeholderTextColor={c.textDisabled}
              multiline
              numberOfLines={3}
            />

            {err && (
              <View style={[ms.errorBox, { backgroundColor: c.status.dangerBg }]}>
                <Text style={[ms.errorText, { color: c.status.danger }]}>{err}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                ms.submitBtn,
                {
                  backgroundColor: c.primary,
                  opacity: submitting || reasonCode === null ? 0.5 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={submitting || reasonCode === null}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={[ms.submitText, { color: c.textOnPrimary }]}>Save reason</Text>
              )}
            </TouchableOpacity>

            {target?.reason_code && (
              <TouchableOpacity
                style={[ms.clearBtn, { borderColor: c.divider }]}
                onPress={handleClear}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Text style={[ms.clearText, { color: c.status.danger }]}>Clear reason</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={[ms.cancelText, { color: c.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  navSubtitle: { fontSize: fontSize.caption, marginTop: 2 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm },
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  errorMsg: { fontSize: fontSize.caption, textAlign: 'center', maxWidth: 320 },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});

const hc = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { fontSize: 32 },
  title: { fontSize: fontSize.h5, fontWeight: fontWeight.bold },
  meta: { fontSize: fontSize.caption, marginTop: 2 },
  scorePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 60,
  },
  scoreValue: { fontSize: fontSize.h4, fontWeight: fontWeight.bold },
  scoreLabel: { fontSize: 9, fontWeight: fontWeight.bold, letterSpacing: letterSpacing.wide, marginTop: 2 },
});

const mc = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  meta: { fontSize: fontSize.caption },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  btnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
});

const cc = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  empty: { fontSize: fontSize.caption },
  emptyMeta: { fontSize: fontSize.caption, marginTop: spacing.xs },
  tileRow: { flexDirection: 'row', gap: spacing.xs },
});

const ti = StyleSheet.create({
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  value: { fontSize: fontSize.h4, fontWeight: fontWeight.bold },
  label: { fontSize: 10, fontWeight: fontWeight.semibold, marginTop: 2, textTransform: 'uppercase' },
});

const ts = StyleSheet.create({
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingLeft: spacing.xs, position: 'relative' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 2, borderWidth: 2 },
  line: { position: 'absolute', left: 5, top: 14, bottom: -10, width: 2 },
  action: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.caption, marginTop: 2 },
});

const ps = StyleSheet.create({
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  filterChipText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  empty: { fontSize: fontSize.caption, paddingVertical: spacing.sm, fontStyle: 'italic' },
});

const pr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  name: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  role: { fontSize: fontSize.caption, marginTop: 1 },
  statusLine: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm + 2 },
  statusText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, letterSpacing: letterSpacing.wide },
  excusedPill: { paddingHorizontal: spacing.xs + 2, paddingVertical: 1, borderRadius: radius.sm },
  excusedText: { fontSize: 9, fontWeight: fontWeight.bold, letterSpacing: letterSpacing.wide },
  meta: { fontSize: fontSize.caption, marginTop: 2 },
  reasonBlock: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 2 },
  reasonCode: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  reasonNotes: { fontSize: fontSize.caption, fontStyle: 'italic' },
  reasonAttribution: { fontSize: 10, marginTop: 2 },
  reasonBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  reasonBtnText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
});

const ss = StyleSheet.create({
  notesCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  notesLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  notesBody: { fontSize: fontSize.body, fontStyle: 'italic' },
});

const ms = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%' },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetContent: { padding: spacing.lg, paddingBottom: spacing['2xl'], gap: spacing.sm },
  title: { fontSize: fontSize.h5, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  helper: { fontSize: fontSize.caption },
  label: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginTop: spacing.sm,
  },
  hint: { fontSize: fontSize.caption, fontStyle: 'italic' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    minHeight: touch.minTarget,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  errorBox: { padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm },
  errorText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  submitBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: touch.minTarget + 4,
    justifyContent: 'center',
  },
  submitText: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  clearBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  clearText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  cancelBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  cancelText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
});
