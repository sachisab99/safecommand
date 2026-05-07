/**
 * RosterScreen — venue Shifts & Roster (BR-04 / BR-12 / BR-13 / BR-19 / BR-61).
 *
 * Phase 5.16b — mobile companion to dashboard /shifts. Surfaces the same
 * shift-instance lifecycle + zone-assignment workflow on a phone form-factor
 * so SH/DSH/SHIFT_COMMANDER can run roster ops in the field.
 *
 * Workflow:
 *   1. Date input (YYYY-MM-DD; "Today" reset shortcut)
 *   2. Per-template card with state-driven actions:
 *        none yet → [Create instance]
 *        PENDING  → [▶ Activate] → ActivateModal (commander selector)
 *        ACTIVE   → [Manage assignments] → AssignmentsModal +
 *                  [■ Close shift] (with confirm)
 *        CLOSED   → read-only chip
 *   3. AssignmentsModal — floor-grouped zones, per-staff toggle pills,
 *      live 2-person validation preview, bulk-replace save.
 *
 * Hidden entirely from drawer for non-command roles — the surface is
 * write-only utility (read-only equivalent is MyShift / Zone Accountability).
 *
 * Refs: api endpoints in /v1/shift-instances router (Phase 5.16a).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
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
  fetchShiftTemplates,
  fetchShiftInstances,
  fetchZoneAssignments,
  createShiftInstance,
  activateShiftInstance,
  closeShiftInstance,
  replaceZoneAssignments,
  canManageShifts,
  todayDate,
  type ShiftTemplate,
  type ShiftInstance,
  type AssignmentInput,
} from '../services/shifts';
import { fetchStaff, type StaffMember } from '../services/staff';
import { fetchZoneAccountability, type AccountableZone } from '../services/zones';

interface Props {
  staffRole: string;
  onBack: () => void;
}

const COMMAND_ROLES = ['SH', 'DSH', 'SHIFT_COMMANDER'];

const STATUS_TONE: Record<ShiftInstance['status'], (c: Colours) => { fg: string; bg: string }> = {
  PENDING: (c) => ({ fg: c.status.pending, bg: c.status.pendingBg ?? c.surface }),
  ACTIVE: (c) => ({ fg: c.status.success, bg: c.status.successBg }),
  CLOSED: (c) => ({ fg: c.textMuted, bg: c.surface }),
};

export function RosterScreen({ staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const canWrite = canManageShifts(staffRole);

  const [date, setDate] = useState<string>(todayDate());
  const [dateInput, setDateInput] = useState<string>(todayDate());
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [instances, setInstances] = useState<ShiftInstance[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [zones, setZones] = useState<AccountableZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activateTarget, setActivateTarget] = useState<ShiftInstance | null>(null);
  const [assignmentsTarget, setAssignmentsTarget] = useState<ShiftInstance | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const refetch = async (): Promise<void> => {
    setLoading(true);
    const [t, i, s, z] = await Promise.all([
      fetchShiftTemplates(),
      fetchShiftInstances(date),
      fetchStaff(),
      fetchZoneAccountability(),
    ]);
    setLoading(false);
    if (t.error || i.error) {
      setError(t.error ?? i.error);
      return;
    }
    setError(null);
    setTemplates(t.templates);
    setInstances(i.instances);
    setStaff(s.staff.filter((m) => m.is_active));
    setZones(z.zones);
  };

  useEffect(() => {
    void refetch();
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDate = (): void => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      setDate(dateInput);
    } else {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format (e.g. 2026-05-07).');
      setDateInput(date);
    }
  };

  const handleCreate = async (template: ShiftTemplate): Promise<void> => {
    setActionInFlight(template.id);
    const { error: e } = await createShiftInstance(template.id, date);
    setActionInFlight(null);
    if (e) {
      Alert.alert('Could not create instance', e);
      return;
    }
    await refetch();
  };

  const handleClose = async (instance: ShiftInstance): Promise<void> => {
    Alert.alert(
      'Close shift?',
      `Close "${instance.shift?.name ?? 'shift'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close shift',
          style: 'destructive',
          onPress: async () => {
            setActionInFlight(instance.id);
            const { error: e } = await closeShiftInstance(instance.id);
            setActionInFlight(null);
            if (e) {
              Alert.alert('Could not close', e);
              return;
            }
            await refetch();
          },
        },
      ],
    );
  };

  // shift_id → instance for current date
  const instanceByShift = useMemo(() => {
    const m = new Map<string, ShiftInstance>();
    for (const i of instances) m.set(i.shift_id, i);
    return m;
  }, [instances]);

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Shifts &amp; Roster</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Activate · Assign · Close
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {/* Date row */}
      <View style={[s.dateRow, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <Text style={[s.dateLabel, { color: c.textMuted }]}>Date</Text>
        <TextInput
          style={[
            s.dateInput,
            { backgroundColor: c.surface, color: c.textPrimary, borderColor: c.divider },
          ]}
          value={dateInput}
          onChangeText={setDateInput}
          onBlur={applyDate}
          onSubmitEditing={applyDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {date !== todayDate() && (
          <TouchableOpacity
            onPress={() => {
              setDate(todayDate());
              setDateInput(todayDate());
            }}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.todayBtn, { color: c.primary }]}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {!canWrite && (
        <View style={[s.banner, { backgroundColor: c.status.warningBg }]}>
          <Text style={[s.bannerText, { color: c.status.warning }]}>
            Read-only. Only Security Head, Deputy SH, and Shift Commander can manage shifts.
          </Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading roster…</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>⚠️</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load roster</Text>
          <Text style={[s.errorMsg, { color: c.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void refetch()}
            style={[s.retryBtn, { backgroundColor: c.primary }]}
          >
            <Text style={[s.retryText, { color: c.textOnPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : templates.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>🛡</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>No shift templates</Text>
          <Text style={[s.errorMsg, { color: c.textMuted }]}>
            Templates are configured by SafeCommand Operations during onboarding.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {templates.map((template) => {
            const inst = instanceByShift.get(template.id) ?? null;
            const isPast = date < todayDate();
            const inFlight = actionInFlight === (inst?.id ?? template.id);
            return (
              <ShiftCard
                key={template.id}
                template={template}
                instance={inst}
                colours={c}
                canWrite={canWrite}
                isPast={isPast}
                inFlight={inFlight}
                onCreate={() => void handleCreate(template)}
                onActivate={() => inst && setActivateTarget(inst)}
                onManage={() => inst && setAssignmentsTarget(inst)}
                onClose={() => inst && handleClose(inst)}
              />
            );
          })}
        </ScrollView>
      )}

      <ActivateModal
        instance={activateTarget}
        commanderCandidates={staff.filter((m) => COMMAND_ROLES.includes(m.role))}
        colours={c}
        onClose={() => setActivateTarget(null)}
        onActivated={async () => {
          setActivateTarget(null);
          await refetch();
        }}
      />

      <AssignmentsModal
        instance={assignmentsTarget}
        zones={zones}
        staff={staff}
        canWrite={canWrite}
        colours={c}
        onClose={() => setAssignmentsTarget(null)}
        onSaved={async () => {
          setAssignmentsTarget(null);
          await refetch();
        }}
      />
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ShiftCard

function ShiftCard({
  template,
  instance,
  colours: c,
  canWrite,
  isPast,
  inFlight,
  onCreate,
  onActivate,
  onManage,
  onClose,
}: {
  template: ShiftTemplate;
  instance: ShiftInstance | null;
  colours: Colours;
  canWrite: boolean;
  isPast: boolean;
  inFlight: boolean;
  onCreate: () => void;
  onActivate: () => void;
  onManage: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const tone = instance ? STATUS_TONE[instance.status](c) : null;

  return (
    <View style={[cs.card, { backgroundColor: c.background }]}>
      <View style={cs.cardHead}>
        <View style={cs.cardTitleWrap}>
          <Text style={[cs.cardTitle, { color: c.textPrimary }]}>{template.name}</Text>
          <Text style={[cs.cardTime, { color: c.textMuted }]}>
            {template.start_time.slice(0, 5)} – {template.end_time.slice(0, 5)}
          </Text>
        </View>
        {instance && tone && (
          <View style={[cs.statusPill, { backgroundColor: tone.bg }]}>
            <Text style={[cs.statusPillText, { color: tone.fg }]}>{instance.status}</Text>
          </View>
        )}
      </View>

      {instance?.commander && (
        <Text style={[cs.commander, { color: c.textSecondary }]}>
          Commander: <Text style={{ color: c.textPrimary, fontWeight: fontWeight.semibold }}>{instance.commander.name}</Text>
          {' · '}{instance.commander.role}
        </Text>
      )}

      <View style={cs.actionRow}>
        {!instance && canWrite && !isPast && (
          <TouchableOpacity
            style={[cs.btnPrimary, { backgroundColor: c.primary, opacity: inFlight ? 0.5 : 1 }]}
            disabled={inFlight}
            onPress={onCreate}
            activeOpacity={0.7}
          >
            <Text style={[cs.btnPrimaryText, { color: c.textOnPrimary }]}>
              {inFlight ? '…' : 'Create instance'}
            </Text>
          </TouchableOpacity>
        )}
        {instance?.status === 'PENDING' && canWrite && (
          <TouchableOpacity
            style={[cs.btnPrimary, { backgroundColor: c.status.success }]}
            onPress={onActivate}
            activeOpacity={0.7}
          >
            <Text style={[cs.btnPrimaryText, { color: '#fff' }]}>▶ Activate</Text>
          </TouchableOpacity>
        )}
        {instance?.status === 'ACTIVE' && (
          <>
            <TouchableOpacity
              style={[cs.btnSecondary, { borderColor: c.divider, backgroundColor: c.surface }]}
              onPress={onManage}
              activeOpacity={0.7}
            >
              <Text style={[cs.btnSecondaryText, { color: c.textPrimary }]}>
                Manage assignments
              </Text>
            </TouchableOpacity>
            {canWrite && (
              <TouchableOpacity
                style={[cs.btnDanger, { backgroundColor: c.status.dangerBg, borderColor: c.status.danger }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[cs.btnDangerText, { color: c.status.danger }]}>■ Close</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {instance?.status === 'ACTIVE' && !canWrite && (
          <Text style={[cs.readonlyHint, { color: c.textMuted }]}>(read-only)</Text>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ActivateModal — bottom sheet with commander selector

function ActivateModal({
  instance,
  commanderCandidates,
  colours: c,
  onClose,
  onActivated,
}: {
  instance: ShiftInstance | null;
  commanderCandidates: StaffMember[];
  colours: Colours;
  onClose: () => void;
  onActivated: () => Promise<void>;
}): React.JSX.Element {
  const [commanderId, setCommanderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!instance) return;
    setCommanderId('');
    setErr(null);
    setSubmitting(false);
  }, [instance]);

  const handleSubmit = async (): Promise<void> => {
    if (!instance) return;
    if (!commanderId) {
      setErr('Select a commander');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const { error: e } = await activateShiftInstance(instance.id, commanderId);
    setSubmitting(false);
    if (e) {
      setErr(e);
      return;
    }
    await onActivated();
  };

  return (
    <Modal
      visible={instance !== null}
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
          <ScrollView contentContainerStyle={ms.sheetContent}>
            <Text style={[ms.title, { color: c.textPrimary }]}>
              Activate {instance?.shift?.name ?? 'shift'}
            </Text>
            <Text style={[ms.helper, { color: c.textMuted }]}>
              Select shift commander. SEV1 alerts route to this person first while shift is active.
            </Text>

            <Text style={[ms.label, { color: c.textMuted }]}>Commander</Text>
            <View style={ms.chipRow}>
              {commanderCandidates.length === 0 && (
                <Text style={[ms.helper, { color: c.status.danger }]}>
                  No staff with command role on this venue.
                </Text>
              )}
              {commanderCandidates.map((s) => {
                const active = commanderId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setCommanderId(s.id)}
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
                      {s.name} · {s.role}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {err && (
              <View style={[ms.errorBox, { backgroundColor: c.status.dangerBg }]}>
                <Text style={[ms.errorText, { color: c.status.danger }]}>{err}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                ms.submitBtn,
                { backgroundColor: c.status.success, opacity: submitting ? 0.6 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[ms.submitText, { color: '#fff' }]}>Activate shift</Text>
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

// ──────────────────────────────────────────────────────────────────────────
// AssignmentsModal — bottom sheet with floor-grouped zones + bulk-replace

function AssignmentsModal({
  instance,
  zones,
  staff,
  canWrite,
  colours: c,
  onClose,
  onSaved,
}: {
  instance: ShiftInstance | null;
  zones: AccountableZone[];
  staff: StaffMember[];
  canWrite: boolean;
  colours: Colours;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): React.JSX.Element {
  const [coverage, setCoverage] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load existing assignments whenever instance changes
  useEffect(() => {
    if (!instance) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { assignments, error } = await fetchZoneAssignments(instance.id);
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setErr(error);
        return;
      }
      const m = new Map<string, Set<string>>();
      for (const a of assignments) {
        const set = m.get(a.zone_id) ?? new Set<string>();
        set.add(a.staff_id);
        m.set(a.zone_id, set);
      }
      setCoverage(m);
      setErr(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [instance]);

  const toggle = (zoneId: string, staffId: string): void => {
    if (!canWrite) return;
    setCoverage((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(zoneId) ?? new Set<string>());
      if (set.has(staffId)) set.delete(staffId);
      else set.add(staffId);
      if (set.size === 0) next.delete(zoneId);
      else next.set(zoneId, set);
      return next;
    });
  };

  // Floor-grouped zones
  const zonesByFloor = useMemo(() => {
    const m = new Map<string, { floor: AccountableZone['floors']; zones: AccountableZone[] }>();
    for (const z of zones) {
      const key = z.floor_id;
      const existing = m.get(key) ?? { floor: z.floors, zones: [] };
      existing.zones.push(z);
      m.set(key, existing);
    }
    return [...m.values()].sort(
      (a, b) => (a.floor?.floor_number ?? 0) - (b.floor?.floor_number ?? 0),
    );
  }, [zones]);

  // 2-person validation preview
  const violations = useMemo(() => {
    const v: string[] = [];
    for (const z of zones) {
      if (!z.two_person_required) continue;
      const count = coverage.get(z.id)?.size ?? 0;
      if (count > 0 && count < 2) v.push(z.name);
    }
    return v;
  }, [zones, coverage]);

  const handleSave = async (): Promise<void> => {
    if (!instance) return;
    if (violations.length > 0) {
      setErr(
        `Two-person zones with only one staff: ${violations.join(', ')}. Add another staff or unassign.`,
      );
      return;
    }
    setSubmitting(true);
    setErr(null);
    const list: AssignmentInput[] = [];
    for (const [zoneId, staffSet] of coverage.entries()) {
      for (const staffId of staffSet) {
        list.push({ staff_id: staffId, zone_id: zoneId, assignment_type: 'PRIMARY' });
      }
    }
    const { error: e } = await replaceZoneAssignments(instance.id, list);
    setSubmitting(false);
    if (e) {
      setErr(e);
      return;
    }
    await onSaved();
  };

  const totalAssignments = [...coverage.values()].reduce((sum, set) => sum + set.size, 0);

  return (
    <Modal
      visible={instance !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={ms.backdrop} onPress={onClose} />
      <View style={ms.fullSheetWrap} pointerEvents="box-none">
        <View style={[ms.fullSheet, { backgroundColor: c.background }]}>
          <View style={[ms.sheetHeader, { borderBottomColor: c.divider }]}>
            <View style={{ flex: 1 }}>
              <Text style={[ms.title, { color: c.textPrimary, marginBottom: 0 }]}>
                Zone Assignments
              </Text>
              <Text style={[ms.helper, { color: c.textMuted }]}>
                {instance?.shift?.name ?? 'Shift'} · {totalAssignments} staged ·{' '}
                {coverage.size}/{zones.length} zones
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={touch.hitSlop}>
              <Text style={[ms.close, { color: c.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {violations.length > 0 && (
            <View style={[ms.warningBox, { backgroundColor: c.status.warningBg }]}>
              <Text style={[ms.warningText, { color: c.status.warning }]}>
                ⚠ 2-person zones with only one staff: {violations.join(', ')}
              </Text>
            </View>
          )}

          {err !== null && (
            <View style={[ms.errorBox, { backgroundColor: c.status.dangerBg, marginHorizontal: spacing.lg }]}>
              <Text style={[ms.errorText, { color: c.status.danger }]}>{err}</Text>
            </View>
          )}

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={c.primary} />
              <Text style={[s.loadingText, { color: c.textMuted }]}>Loading assignments…</Text>
            </View>
          ) : zones.length === 0 ? (
            <View style={s.center}>
              <Text style={[s.errorMsg, { color: c.textMuted }]}>No zones configured.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={ms.assignList}>
              {zonesByFloor.map(({ floor, zones: floorZones }) => (
                <View key={floor?.id ?? 'unknown'} style={ms.floorBlock}>
                  <Text style={[ms.floorHeader, { color: c.textMuted }]}>
                    {floor?.name ?? 'Unassigned'} {floor && `(F${floor.floor_number})`}
                  </Text>
                  {floorZones.map((z) => {
                    const assigned = coverage.get(z.id) ?? new Set<string>();
                    const count = assigned.size;
                    const violation = z.two_person_required && count > 0 && count < 2;
                    return (
                      <View
                        key={z.id}
                        style={[ms.zoneCard, { backgroundColor: c.surface, borderColor: c.divider }]}
                      >
                        <View style={ms.zoneHeader}>
                          <Text style={[ms.zoneName, { color: c.textPrimary }]}>{z.name}</Text>
                          {z.two_person_required && (
                            <View style={[ms.badge, { backgroundColor: c.status.infoBg }]}>
                              <Text style={[ms.badgeText, { color: c.status.info }]}>
                                2-PERSON
                              </Text>
                            </View>
                          )}
                          <Text style={[ms.assignCount, { color: c.textMuted }]}>
                            {count} assigned
                          </Text>
                        </View>
                        {violation && (
                          <Text style={[ms.violationText, { color: c.status.warning }]}>
                            ⚠ Needs +1 staff
                          </Text>
                        )}
                        <View style={ms.staffPills}>
                          {staff.map((sm) => {
                            const on = assigned.has(sm.id);
                            return (
                              <TouchableOpacity
                                key={sm.id}
                                onPress={() => toggle(z.id, sm.id)}
                                disabled={!canWrite}
                                style={[
                                  ms.staffPill,
                                  on
                                    ? { backgroundColor: c.primary, borderColor: c.primary }
                                    : { backgroundColor: c.background, borderColor: c.divider },
                                  !canWrite && { opacity: 0.6 },
                                ]}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    ms.staffPillText,
                                    { color: on ? c.textOnPrimary : c.textPrimary },
                                  ]}
                                >
                                  {sm.name.split(' ')[0]} · {sm.role}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          {canWrite && (
            <View style={[ms.saveFooter, { backgroundColor: c.background, borderTopColor: c.divider }]}>
              <TouchableOpacity
                style={[
                  ms.submitBtn,
                  {
                    backgroundColor: c.primary,
                    opacity: submitting || violations.length > 0 ? 0.5 : 1,
                  },
                ]}
                onPress={handleSave}
                disabled={submitting || violations.length > 0}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color={c.textOnPrimary} />
                ) : (
                  <Text style={[ms.submitText, { color: c.textOnPrimary }]}>
                    Save assignments
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
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
  navSubtitle: { fontSize: fontSize.caption, marginTop: 2 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  dateLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    fontSize: fontSize.body,
    minHeight: touch.minTarget - 4,
  },
  todayBtn: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  banner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: { fontSize: fontSize.caption, marginTop: spacing.sm },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm },
  errorTitle: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  errorMsg: {
    fontSize: fontSize.caption,
    textAlign: 'center',
    maxWidth: 320,
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});

const cs = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  cardTime: { fontSize: fontSize.caption, marginTop: 2 },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
  },
  statusPillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  commander: { fontSize: fontSize.caption },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  btnSecondary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  btnDanger: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  readonlyHint: {
    fontSize: fontSize.caption,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
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
  fullSheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fullSheet: {
    height: '92%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  close: { fontSize: 24, fontWeight: fontWeight.bold },
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
  helper: { fontSize: fontSize.caption },
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
  chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  errorBox: {
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  errorText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  warningBox: {
    padding: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  warningText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  submitBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: touch.minTarget + 4,
    justifyContent: 'center',
  },
  submitText: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelText: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  assignList: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  floorBlock: { gap: spacing.xs },
  floorHeader: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.xs,
  },
  zoneCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  zoneName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, flexShrink: 1 },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  assignCount: { fontSize: fontSize.caption, marginLeft: 'auto' },
  violationText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  staffPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  staffPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  staffPillText: { fontSize: fontSize.caption, fontWeight: fontWeight.medium },
  saveFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
  },
});
