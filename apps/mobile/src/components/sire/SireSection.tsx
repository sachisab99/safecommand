/**
 * SireSection — the v2 SIRE-aware UI block on IncidentDetailScreen.
 *
 * Renders:
 *   1. Zone state grid — colour-coded cards per affected zone with current
 *      state pill, assigned GS name, and last-updated timestamp. Tap a zone
 *      (if caller has authority) to open the state-transition action sheet.
 *   2. Your assigned actions — the per-staff checklist filtered to the
 *      caller's staff_id. Tap an action to open the status-transition
 *      sheet (Mark Done / In Progress / Skip / Block + reason).
 *   3. Evacuation triggers — immutable audit list of every selective +
 *      full evacuation decision so far on this incident.
 *
 * Polls GET /v1/sire/state/:incidentId every 3 seconds while mounted.
 * (Realtime push via Supabase Realtime is Phase 5.22; polling is the demo
 * pattern matching Phase 5.18 drill banner cadence.)
 *
 * Authorisation gating mirrors the api:
 *   - Zone state actions: assigned_gs_id OR command role (SH/DSH/SC/FM)
 *   - Action status: only assigned staff_id can update
 *   - Selective evacuation trigger: SH/DSH/SHIFT_COMMANDER only
 *
 * Composes the 10-state × 5-role transition matrix from @safecommand/types
 * for client-side pre-validation before the api round-trip — so the user
 * sees only the buttons they can actually act on.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  fetchSireState,
  patchZoneState,
  patchAssignmentStatus,
  postEvacuationTrigger,
  postIncidentEvidence,
  dismissPrompt,
  assignmentsForStaff,
  summariseAssignments,
  type SireState,
  type SireZoneState,
  type SireAssignment,
} from '../../services/sire';
import { CaptureEvidence } from '../CaptureEvidence';
import {
  getValidTransitions,
  requiresReasonNote,
  requiresEvidence,
  draftPaAnnouncement,
  ZONE_STATE_LABEL,
  type IncidentZoneState,
} from '@safecommand/types';
import {
  useColours,
  spacing,
  fontSize,
  fontWeight,
  radius,
  shadow,
  type Colours,
} from '../../theme';

// ─── Visual mapping ─────────────────────────────────────────────────────────
// ZONE_STATE_COLOUR from types is semantic ('red-flashing'); we map to actual
// theme colour values here for the mobile UI.
function zoneStateBg(state: IncidentZoneState, c: Colours): string {
  switch (state) {
    case 'UNVALIDATED': return c.surfaceMuted;
    case 'SWEEP_IN_PROGRESS': return '#3b82f680'; // blue translucent
    case 'ZONE_CLEAR': return '#10b98180'; // green translucent
    case 'NEEDS_ATTENTION': return '#f59e0b80'; // amber translucent
    case 'EVACUATION_TRIGGERED': return '#ef444480'; // red translucent
    case 'EVACUATING': return '#dc262680'; // red-solid translucent
    case 'EVACUATION_COMPLETE': return '#10b98180';
    case 'SH_CONFIRMED_CLEAR': return '#059669c0'; // green-deep
    case 'LOCKED_DOWN': return '#a855f780'; // purple translucent
    case 'INACCESSIBLE': return '#6b7280a0'; // grey translucent
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SireSectionProps {
  incidentId: string;
  staffId: string;
  staffRole: string;
  /** Polling interval in ms (default 3000) */
  pollIntervalMs?: number;
}

const COMMAND_ROLES = new Set(['SH', 'DSH', 'SHIFT_COMMANDER', 'FM']);
const EVAC_TRIGGER_ROLES = new Set(['SH', 'DSH', 'SHIFT_COMMANDER']);

// ─── Component ──────────────────────────────────────────────────────────────

export function SireSection(props: SireSectionProps) {
  const { incidentId, staffId, staffRole, pollIntervalMs = 3000 } = props;
  const c = useColours();
  const styles = makeStyles(c);

  const [state, setState] = useState<SireState | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoneActionTarget, setZoneActionTarget] = useState<SireZoneState | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<SireAssignment | null>(null);
  const [evacOpen, setEvacOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const fresh = await fetchSireState(incidentId);
    if (fresh) setState(fresh);
    setLoading(false);
  }, [incidentId]);

  // One-tap "Initiate" (Rec 3a): assigned staff starts their own action
  // (ASSIGNED → IN_PROGRESS) without opening the full status sheet.
  const initiateAssignment = useCallback(
    async (assignmentId: string) => {
      setBusyId(assignmentId);
      const res = await patchAssignmentStatus(assignmentId, { status: 'IN_PROGRESS' });
      setBusyId(null);
      if (res.ok) refresh();
    },
    [refresh],
  );

  const handleDismissPrompt = useCallback(
    async (promptId: string) => {
      setBusyId(promptId);
      const res = await dismissPrompt(promptId);
      setBusyId(null);
      if (res.ok) refresh();
    },
    [refresh],
  );

  const handlePostPhoto = useCallback(
    async (publicUrl: string) => {
      await postIncidentEvidence(incidentId, {
        evidence_url: publicUrl,
        content_type: 'image/jpeg',
      });
      refresh();
    },
    [incidentId, refresh],
  );

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, pollIntervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh, pollIntervalMs]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.primary} />
        <Text style={styles.loadingText}>Loading SIRE state…</Text>
      </View>
    );
  }
  if (!state || !state.has_sire_data) {
    return null; // Caller will fall back to v1 layout
  }

  const myAssignments = assignmentsForStaff(state.assignments, staffId);
  const summary = summariseAssignments(myAssignments);
  const isCommand = COMMAND_ROLES.has(staffRole);
  const canTriggerEvac = EVAC_TRIGGER_ROLES.has(staffRole);

  return (
    <View style={styles.container}>
      {/* ─── BR-L soft suggestion banner (Hard Rule 23: NEVER auto-trigger) ───
          Command-only data (server-gated). This is a SUGGESTION surface only —
          the SH must still explicitly use "Trigger selective evacuation"
          below. No code path here triggers an evacuation. */}
      {state.active_prompts.map((p) => (
        <View key={p.id} style={styles.brlBanner}>
          <Text style={styles.brlTitle}>⚠ Suggestion — not automatic</Text>
          <Text style={styles.brlMessage}>{p.message}</Text>
          <View style={styles.brlActions}>
            <TouchableOpacity
              style={styles.brlDismiss}
              onPress={() => handleDismissPrompt(p.id)}
              disabled={busyId === p.id}
            >
              <Text style={styles.brlDismissText}>
                {busyId === p.id ? 'Dismissing…' : 'Dismiss'}
              </Text>
            </TouchableOpacity>
            {canTriggerEvac && (
              <TouchableOpacity
                style={styles.brlReview}
                onPress={() => setEvacOpen(true)}
              >
                <Text style={styles.brlReviewText}>Review evacuation →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* ─── Zone grid section ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone state grid</Text>
        <Text style={styles.sectionMeta}>
          {state.zone_states.length} zone{state.zone_states.length !== 1 ? 's' : ''} · auto-refreshing
        </Text>
        <View style={styles.zoneGrid}>
          {state.zone_states.map((zs) => {
            const isAssignedToMe = zs.assigned_gs_id === staffId;
            const canTap = isAssignedToMe || isCommand;
            return (
              <TouchableOpacity
                key={zs.id}
                style={[styles.zoneCard, { backgroundColor: zoneStateBg(zs.state, c) }]}
                onPress={canTap ? () => setZoneActionTarget(zs) : undefined}
                disabled={!canTap}
                activeOpacity={canTap ? 0.7 : 1}
              >
                <Text style={styles.zoneName} numberOfLines={1}>
                  {zs.zones?.name ?? zs.zone_id.slice(0, 8)}
                </Text>
                <Text style={styles.zoneState}>{ZONE_STATE_LABEL[zs.state]}</Text>
                {zs.assigned_gs_id ? (
                  <Text style={styles.zoneAssignee} numberOfLines={1}>
                    {isAssignedToMe ? '★ You' : 'GS assigned'}
                  </Text>
                ) : (
                  <Text style={styles.zoneAssignee}>Unassigned</Text>
                )}
                {zs.reason_note ? (
                  <Text style={styles.zoneReason} numberOfLines={2}>
                    {zs.reason_note}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {canTriggerEvac && (
          <TouchableOpacity
            style={styles.evacButton}
            onPress={() => setEvacOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.evacButtonText}>⚠ Trigger selective evacuation</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── My actions checklist ─── */}
      {myAssignments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your actions</Text>
          <Text style={styles.sectionMeta}>
            {summary.done}/{summary.total} done · {summary.in_progress} in progress
            {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}
            {summary.blocked > 0 ? ` · ${summary.blocked} blocked` : ''}
          </Text>
          {myAssignments.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.assignmentCard}
              onPress={() => setAssignmentTarget(a)}
              activeOpacity={0.7}
            >
              <View style={styles.assignmentHeader}>
                <Text style={styles.assignmentOrder}>#{a.action_order}</Text>
                <View style={[styles.statusPill, statusPillStyle(a.status, c)]}>
                  <Text style={styles.statusPillText}>{a.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={styles.assignmentInstruction}>{a.instruction}</Text>
              {a.is_life_critical && (
                <Text style={styles.lifeCritical}>⚡ Life-critical</Text>
              )}
              {a.time_target_seconds !== null && (
                <Text style={styles.assignmentMeta}>
                  Target: {a.time_target_seconds}s · Evidence: {a.evidence_type ?? 'none'}
                </Text>
              )}
              {/* One-tap Initiate (Rec 3a) — only when ASSIGNED. Full
                  Done/Skip/Block transitions stay in the card sheet (tap card). */}
              {a.status === 'ASSIGNED' && (
                <TouchableOpacity
                  style={styles.initiateBtn}
                  onPress={() => initiateAssignment(a.id)}
                  disabled={busyId === a.id}
                  activeOpacity={0.8}
                >
                  <Text style={styles.initiateBtnText}>
                    {busyId === a.id ? 'Initiating…' : '⏵ Initiate'}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ─── Evacuation triggers (audit list) ─── */}
      {state.evacuation_triggers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evacuation triggers</Text>
          {state.evacuation_triggers.map((t) => (
            <View key={t.id} style={styles.triggerCard}>
              <Text style={styles.triggerType}>
                {t.trigger_type.replace('_', ' ')} · {t.zones_affected.length} zone{t.zones_affected.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.triggerReason}>{t.reason_note}</Text>
              <Text style={styles.triggerMeta}>
                {new Date(t.triggered_at).toLocaleTimeString()} · by {t.triggered_by_role ?? 'unknown'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ─── Shared incident photo wall (Rec 2b) — any staff posts, all see ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Incident photos</Text>
        <Text style={styles.sectionMeta}>
          {state.evidence_wall.length} photo{state.evidence_wall.length !== 1 ? 's' : ''} ·
          {' '}visible to everyone on this incident
        </Text>
        <CaptureEvidence
          incidentId={incidentId}
          onUploaded={handlePostPhoto}
          label="📷 Add a photo"
        />
        {state.evidence_wall.length > 0 && (
          <View style={styles.photoGrid}>
            {state.evidence_wall.map((ev) => (
              <View key={ev.id} style={styles.photoCard}>
                <Image
                  source={{ uri: ev.evidence_url }}
                  style={styles.photoThumb}
                  resizeMode="cover"
                />
                <Text style={styles.photoMeta} numberOfLines={1}>
                  {ev.staff?.name ?? ev.posted_by_role ?? 'Staff'} ·{' '}
                  {new Date(ev.created_at).toLocaleTimeString()}
                </Text>
                {ev.caption ? (
                  <Text style={styles.photoCaption} numberOfLines={2}>
                    {ev.caption}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ─── Zone state action sheet ─── */}
      {zoneActionTarget && (
        <ZoneStateActionSheet
          zoneState={zoneActionTarget}
          incidentId={incidentId}
          staffRole={staffRole}
          onClose={() => setZoneActionTarget(null)}
          onSuccess={() => {
            setZoneActionTarget(null);
            refresh();
          }}
        />
      )}

      {/* ─── Assignment status action sheet ─── */}
      {assignmentTarget && (
        <AssignmentStatusActionSheet
          assignment={assignmentTarget}
          onClose={() => setAssignmentTarget(null)}
          onSuccess={() => {
            setAssignmentTarget(null);
            refresh();
          }}
        />
      )}

      {/* ─── Evacuation trigger sheet ─── */}
      {evacOpen && (
        <EvacuationTriggerSheet
          incidentId={incidentId}
          zoneStates={state.zone_states}
          onClose={() => setEvacOpen(false)}
          onSuccess={() => {
            setEvacOpen(false);
            refresh();
          }}
        />
      )}
    </View>
  );
}

// ─── Zone state action sheet ────────────────────────────────────────────────

function ZoneStateActionSheet(props: {
  zoneState: SireZoneState;
  incidentId: string;
  staffRole: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const c = useColours();
  const styles = makeStyles(c);
  const [reasonNote, setReasonNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [pendingState, setPendingState] = useState<IncidentZoneState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validNextStates = getValidTransitions(props.zoneState.state, props.staffRole);

  const submit = async (target: IncidentZoneState) => {
    if (requiresReasonNote(target) && reasonNote.trim().length === 0) {
      setError('This state requires a reason note');
      setPendingState(target);
      return;
    }
    if (requiresEvidence(target) && evidenceUrl.trim().length === 0) {
      setError('This state requires a photo — tap "Capture photo evidence"');
      setPendingState(target);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await patchZoneState(props.incidentId, props.zoneState.zone_id, {
      to_state: target,
      prev_state_changed_at: props.zoneState.state_changed_at,
      reason_note: reasonNote.trim() || undefined,
      evidence_url: evidenceUrl.trim() || undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      props.onSuccess();
    } else {
      setError(result.error ?? 'Update failed');
    }
  };

  const needsNote = pendingState ? requiresReasonNote(pendingState) : false;
  const needsEvidence = pendingState ? requiresEvidence(pendingState) : false;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Update zone state</Text>
          <Text style={styles.sheetSubtitle}>
            {props.zoneState.zones?.name ?? 'Zone'} · current: {ZONE_STATE_LABEL[props.zoneState.state]}
          </Text>

          {(needsNote || needsEvidence) && (
            <View style={styles.inputGroup}>
              {needsNote && (
                <TextInput
                  style={styles.input}
                  value={reasonNote}
                  onChangeText={setReasonNote}
                  placeholder="Reason note (required)"
                  placeholderTextColor={c.textMuted}
                  multiline
                />
              )}
              {needsEvidence && (
                <View style={{ gap: spacing.xs }}>
                  <CaptureEvidence
                    incidentId={props.incidentId}
                    onUploaded={(url) => {
                      setEvidenceUrl(url);
                      setError(null);
                    }}
                    label={evidenceUrl ? '📷 Replace photo' : '📷 Capture photo evidence'}
                  />
                  {evidenceUrl.length > 0 && (
                    <Text style={styles.evidenceAttached}>✓ Photo attached</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          {validNextStates.length === 0 ? (
            <Text style={styles.noActions}>No state transitions available for your role.</Text>
          ) : (
            validNextStates.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.sheetButton}
                onPress={() => submit(s)}
                disabled={submitting}
              >
                <Text style={styles.sheetButtonText}>→ {ZONE_STATE_LABEL[s]}</Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={styles.sheetCancel} onPress={props.onClose}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Assignment status action sheet ─────────────────────────────────────────

function AssignmentStatusActionSheet(props: {
  assignment: SireAssignment;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const c = useColours();
  const styles = makeStyles(c);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const a = props.assignment;
  // Allowed transitions per Day 2 server logic
  const transitions: Record<typeof a.status, ('IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'BLOCKED')[]> = {
    ASSIGNED: ['IN_PROGRESS', 'DONE', 'SKIPPED', 'BLOCKED'],
    IN_PROGRESS: ['DONE', 'SKIPPED', 'BLOCKED'],
    DONE: [],
    SKIPPED: [],
    BLOCKED: ['IN_PROGRESS'],
  };
  const canDo = transitions[a.status] ?? [];

  const submit = async (target: 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'BLOCKED') => {
    if (target === 'BLOCKED' && blockedReason.trim().length === 0) {
      setError('Blocked status requires a reason');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await patchAssignmentStatus(a.id, {
      status: target,
      blocked_reason: target === 'BLOCKED' ? blockedReason.trim() : undefined,
      evidence: target === 'DONE'
        ? { evidence_note: evidenceNote.trim() || undefined }
        : undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      props.onSuccess();
    } else {
      setError(result.error ?? 'Update failed');
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Action #{a.action_order}</Text>
          <Text style={styles.sheetInstruction}>{a.instruction}</Text>
          <Text style={styles.sheetSubtitle}>Current status: {a.status}</Text>

          <TextInput
            style={styles.input}
            value={evidenceNote}
            onChangeText={setEvidenceNote}
            placeholder="Evidence note (optional)"
            placeholderTextColor={c.textMuted}
            multiline
          />
          <TextInput
            style={styles.input}
            value={blockedReason}
            onChangeText={setBlockedReason}
            placeholder="Blocked reason (only required for BLOCKED)"
            placeholderTextColor={c.textMuted}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          {canDo.length === 0 ? (
            <Text style={styles.noActions}>This action is in a terminal state.</Text>
          ) : (
            canDo.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.sheetButton, t === 'DONE' && styles.sheetButtonPrimary]}
                onPress={() => submit(t)}
                disabled={submitting}
              >
                <Text style={[styles.sheetButtonText, t === 'DONE' && styles.sheetButtonPrimaryText]}>
                  {t === 'IN_PROGRESS' ? '⏵ Start' : t === 'DONE' ? '✓ Mark Done' : t === 'SKIPPED' ? '↦ Skip' : '⊘ Block'}
                </Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={styles.sheetCancel} onPress={props.onClose}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Evacuation trigger sheet ───────────────────────────────────────────────

function EvacuationTriggerSheet(props: {
  incidentId: string;
  zoneStates: SireZoneState[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const c = useColours();
  const styles = makeStyles(c);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [reasonNote, setReasonNote] = useState('');
  const [paText, setPaText] = useState('');
  const [paEdited, setPaEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleZone = (zoneId: string) => {
    const next = new Set(selectedZones);
    if (next.has(zoneId)) next.delete(zoneId);
    else next.add(zoneId);
    setSelectedZones(next);
  };

  // BR-N: auto-draft the PA text from the current selection. Selective when
  // zones are picked, full-venue otherwise. Does not clobber SH manual edits.
  useEffect(() => {
    if (paEdited) return;
    const names = props.zoneStates
      .filter((z) => selectedZones.has(z.zone_id))
      .map((z) => z.zones?.name ?? z.zone_id.slice(0, 8));
    const draft = draftPaAnnouncement({
      triggerType: selectedZones.size > 0 ? 'ZONE_SELECTIVE' : 'FULL_VENUE',
      zoneNames: names,
    });
    setPaText(draft.en);
  }, [selectedZones, paEdited, props.zoneStates]);

  const submit = async (triggerType: 'ZONE_SELECTIVE' | 'FULL_VENUE') => {
    if (reasonNote.trim().length === 0) {
      setError('Reason note is required');
      return;
    }
    if (triggerType === 'ZONE_SELECTIVE' && selectedZones.size === 0) {
      setError('Select at least one zone for selective evacuation');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await postEvacuationTrigger(props.incidentId, {
      trigger_type: triggerType,
      zones_affected:
        triggerType === 'ZONE_SELECTIVE'
          ? Array.from(selectedZones)
          : props.zoneStates.map((z) => z.zone_id),
      reason_note: reasonNote.trim(),
      pa_text_broadcast: paText.trim() || undefined,
      pa_language: 'en-IN',
    });
    setSubmitting(false);
    if (result.ok) {
      props.onSuccess();
    } else {
      setError(result.error ?? 'Trigger failed');
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onClose}>
      <View style={styles.sheetBackdrop}>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet}>
          <Text style={styles.sheetTitle}>⚠ Trigger evacuation</Text>
          <Text style={styles.sheetSubtitle}>
            Select zones for selective, or hit Full Venue to evacuate everywhere.
          </Text>

          {props.zoneStates.map((z) => {
            const selected = selectedZones.has(z.zone_id);
            return (
              <TouchableOpacity
                key={z.id}
                style={[styles.zoneToggle, selected && styles.zoneToggleSelected]}
                onPress={() => toggleZone(z.zone_id)}
              >
                <Text style={[styles.zoneToggleText, selected && styles.zoneToggleSelectedText]}>
                  {selected ? '☑ ' : '☐ '}
                  {z.zones?.name ?? z.zone_id.slice(0, 8)} · {ZONE_STATE_LABEL[z.state]}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.input}
            value={reasonNote}
            onChangeText={setReasonNote}
            placeholder="Reason note (required)"
            placeholderTextColor={c.textMuted}
            multiline
          />
          <View style={styles.paHeaderRow}>
            <Text style={styles.paLabel}>PA announcement (auto-drafted — edit before broadcast)</Text>
            {paEdited && (
              <TouchableOpacity onPress={() => setPaEdited(false)}>
                <Text style={styles.paReset}>↻ Reset to suggested</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[styles.input, { minHeight: 96 }]}
            value={paText}
            onChangeText={(t) => {
              setPaEdited(true);
              setPaText(t);
            }}
            placeholder="PA broadcast text"
            placeholderTextColor={c.textMuted}
            multiline
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.sheetButton, styles.sheetButtonDanger]}
            onPress={() => submit('ZONE_SELECTIVE')}
            disabled={submitting}
          >
            <Text style={styles.sheetButtonDangerText}>
              ⚠ Trigger selective evacuation ({selectedZones.size} zone{selectedZones.size !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sheetButton, styles.sheetButtonDangerSolid]}
            onPress={() => submit('FULL_VENUE')}
            disabled={submitting}
          >
            <Text style={styles.sheetButtonDangerSolidText}>⚠⚠ Full venue evacuation</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetCancel} onPress={props.onClose}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Status pill colour helper ──────────────────────────────────────────────

function statusPillStyle(status: string, c: Colours): { backgroundColor: string } {
  switch (status) {
    case 'DONE': return { backgroundColor: '#10b981' };
    case 'IN_PROGRESS': return { backgroundColor: '#3b82f6' };
    case 'SKIPPED': return { backgroundColor: '#6b7280' };
    case 'BLOCKED': return { backgroundColor: '#ef4444' };
    case 'ASSIGNED':
    default: return { backgroundColor: c.surfaceMuted };
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function makeStyles(c: Colours) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    loading: {
      paddingVertical: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    loadingText: { color: c.textMuted, fontSize: fontSize.small },
    section: { marginBottom: spacing.lg },
    sectionTitle: {
      fontSize: fontSize.bodyLarge,
      fontWeight: fontWeight.bold,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    sectionMeta: {
      fontSize: fontSize.small,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    zoneGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    zoneCard: {
      width: '48%',
      padding: spacing.sm,
      borderRadius: radius.md,
      ...shadow.sm,
    },
    zoneName: {
      fontSize: fontSize.body,
      fontWeight: fontWeight.bold,
      color: c.textPrimary,
    },
    zoneState: {
      fontSize: fontSize.small,
      color: c.textPrimary,
      marginTop: 2,
    },
    zoneAssignee: {
      fontSize: fontSize.caption,
      color: c.textMuted,
      marginTop: 4,
    },
    zoneReason: {
      fontSize: fontSize.caption,
      color: c.textPrimary,
      marginTop: 4,
      fontStyle: 'italic',
    },
    evacButton: {
      marginTop: spacing.md,
      backgroundColor: '#fee2e2',
      borderColor: '#ef4444',
      borderWidth: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    evacButtonText: { color: '#991b1b', fontWeight: fontWeight.bold },
    assignmentCard: {
      backgroundColor: c.surface,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
      ...shadow.sm,
    },
    assignmentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    assignmentOrder: {
      fontSize: fontSize.small,
      color: c.textMuted,
      fontWeight: fontWeight.bold,
    },
    statusPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    statusPillText: {
      fontSize: fontSize.caption,
      color: '#fff',
      fontWeight: fontWeight.bold,
    },
    assignmentInstruction: {
      fontSize: fontSize.body,
      color: c.textPrimary,
      lineHeight: 20,
    },
    lifeCritical: {
      fontSize: fontSize.caption,
      color: '#dc2626',
      fontWeight: fontWeight.bold,
      marginTop: spacing.xs,
    },
    assignmentMeta: {
      fontSize: fontSize.caption,
      color: c.textMuted,
      marginTop: 4,
    },
    triggerCard: {
      backgroundColor: '#fef2f2',
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginBottom: spacing.xs,
    },
    triggerType: {
      fontSize: fontSize.small,
      fontWeight: fontWeight.bold,
      color: '#991b1b',
    },
    triggerReason: { fontSize: fontSize.small, color: c.textPrimary, marginTop: 2 },
    triggerMeta: { fontSize: fontSize.caption, color: c.textMuted, marginTop: 2 },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheetScroll: { maxHeight: '85%' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sheetTitle: {
      fontSize: fontSize.h6,
      fontWeight: fontWeight.bold,
      color: c.textPrimary,
    },
    sheetSubtitle: { fontSize: fontSize.small, color: c.textMuted },
    sheetInstruction: {
      fontSize: fontSize.body,
      color: c.textPrimary,
      lineHeight: 22,
      paddingVertical: spacing.sm,
    },
    inputGroup: { gap: spacing.sm },
    input: {
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
      padding: spacing.sm,
      color: c.textPrimary,
      fontSize: fontSize.body,
      minHeight: 44,
    },
    errorText: { color: '#dc2626', fontSize: fontSize.small },
    noActions: { color: c.textMuted, fontSize: fontSize.small, fontStyle: 'italic' },
    sheetButton: {
      backgroundColor: c.surfaceMuted,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    sheetButtonText: { color: c.textPrimary, fontWeight: fontWeight.medium },
    sheetButtonPrimary: { backgroundColor: c.primary },
    sheetButtonPrimaryText: { color: c.textOnPrimary },
    sheetButtonDanger: {
      backgroundColor: '#fee2e2',
      borderColor: '#ef4444',
      borderWidth: 1,
    },
    sheetButtonDangerText: { color: '#991b1b', fontWeight: fontWeight.bold },
    sheetButtonDangerSolid: { backgroundColor: '#dc2626' },
    sheetButtonDangerSolidText: { color: '#fff', fontWeight: fontWeight.bold },
    sheetCancel: {
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    sheetCancelText: { color: c.textMuted, fontSize: fontSize.body },
    zoneToggle: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
    },
    zoneToggleSelected: { backgroundColor: c.primary + '20', borderColor: c.primary, borderWidth: 1 },
    zoneToggleText: { color: c.textPrimary, fontSize: fontSize.body },
    zoneToggleSelectedText: { color: c.primary, fontWeight: fontWeight.bold },
    // BR-L soft suggestion banner
    brlBanner: {
      backgroundColor: '#fffbeb',
      borderColor: '#f59e0b',
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.xs,
    },
    brlTitle: { color: '#92400e', fontWeight: fontWeight.bold, fontSize: fontSize.small },
    brlMessage: { color: '#78350f', fontSize: fontSize.body, lineHeight: 20 },
    brlActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    brlDismiss: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surfaceMuted,
      borderRadius: radius.sm,
    },
    brlDismissText: { color: c.textPrimary, fontSize: fontSize.small, fontWeight: fontWeight.medium },
    brlReview: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: '#fef3c7',
      borderRadius: radius.sm,
    },
    brlReviewText: { color: '#92400e', fontSize: fontSize.small, fontWeight: fontWeight.bold },
    // One-tap Initiate
    initiateBtn: {
      marginTop: spacing.sm,
      backgroundColor: c.primary,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    initiateBtnText: { color: c.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.body },
    // Photo wall
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    photoCard: { width: '48%' },
    photoThumb: {
      width: '100%',
      height: 120,
      borderRadius: radius.md,
      backgroundColor: c.surfaceMuted,
    },
    photoMeta: { fontSize: fontSize.caption, color: c.textMuted, marginTop: 4 },
    photoCaption: { fontSize: fontSize.caption, color: c.textPrimary, marginTop: 2 },
    evidenceAttached: { color: '#059669', fontSize: fontSize.small, fontWeight: fontWeight.bold },
    paHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    paLabel: { color: c.textMuted, fontSize: fontSize.caption, flex: 1 },
    paReset: { color: c.primary, fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  });
}
