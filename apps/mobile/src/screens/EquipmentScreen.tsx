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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import {
  fetchEquipment,
  createEquipment,
  updateEquipment,
  setEquipmentActive,
  canWriteEquipment,
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
  /**
   * Logged-in staff role — drives write-surface gating per BR-21 RLS.
   * SH/DSH/FM see add/edit/deactivate controls; others see read-only list.
   */
  staffRole: string;
  onBack: () => void;
}

export function EquipmentScreen({ staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Phase 5.13 write-surface state — gated to SH/DSH/FM roles.
  const canWrite = canWriteEquipment(staffRole);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);

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
          renderItem={({ item }) => (
            <EquipmentRow
              item={item}
              colours={c}
              onPress={
                canWrite
                  ? () => {
                      setEditingItem(item);
                      setEditorVisible(true);
                    }
                  : undefined
              }
            />
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

      {/*
       * FAB — only visible for SH/DSH/FM (api enforces same gate; client
       * hides it pre-emptively to avoid 403 round-trip). Tap → open empty
       * Add modal. Per-row tap (handled inside the FlatList renderItem)
       * opens the same modal pre-filled for editing.
       */}
      {canWrite && !loading && error === null && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: brand.primary_colour, shadowColor: brand.primary_colour }]}
          onPress={() => {
            setEditingItem(null);
            setEditorVisible(true);
          }}
          activeOpacity={0.85}
          hitSlop={touch.hitSlop}
          accessibilityLabel="Add equipment"
          accessibilityRole="button"
        >
          <Text style={[s.fabIcon, { color: c.textInverse }]}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add / Edit modal */}
      <EquipmentEditorModal
        visible={editorVisible}
        editing={editingItem}
        onClose={() => setEditorVisible(false)}
        onSaved={() => {
          setEditorVisible(false);
          setEditingItem(null);
          void load(true);
        }}
      />
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

function EquipmentRow({
  item,
  colours: c,
  onPress,
}: {
  item: EquipmentItem;
  colours: Colours;
  /** When provided (caller has write permission), entire row becomes tappable → opens edit modal */
  onPress?: () => void;
}) {
  const days = daysUntilDue(item.next_service_due);
  const bucket = expiryBucket(days);
  const style = BUCKET_STYLE[bucket];
  const fg = style.fg(c);
  const bg = style.bg(c);
  const icon = CATEGORY_ICON[item.category] ?? '🛠️';

  // Wrap in TouchableOpacity only when caller passes onPress; read-only
  // viewers (non-SH/DSH/FM) get a static View — no false-affordance.
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress
    ? { onPress, activeOpacity: 0.7, accessibilityRole: 'button' as const }
    : {};

  return (
    <Wrapper
      style={[rs.row, { backgroundColor: c.background }]}
      {...wrapperProps}
    >
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
          {onPress && (
            <Text style={[rs.editChevron, { color: c.textDisabled }]}>›</Text>
          )}
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
    </Wrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// EquipmentEditorModal — Add (when editing===null) or Edit (with item)
//
// Pattern matches AddStaffModal in StaffScreen.tsx: bottom-sheet modal,
// KeyboardAvoidingView, ScrollView with automaticallyAdjustKeyboardInsets,
// auto-focus, error-on-submit, refetch-on-success.

interface EditorProps {
  visible: boolean;
  editing: EquipmentItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function EquipmentEditorModal({ visible, editing, onClose, onSaved }: EditorProps) {
  const c = useColours();
  const brand = useBrand();
  const isEdit = editing !== null;

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('FIRE_EXTINGUISHER');
  const [location, setLocation] = useState('');
  const [lastServiced, setLastServiced] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<TextInput>(null);

  // Reset form whenever the modal becomes visible or editing changes
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name.replace(/^\[DEMO\]\s*/, ''));
      setCategory(editing.category);
      setLocation(editing.location_description ?? '');
      setLastServiced(editing.last_serviced_at ?? '');
      setNextDue(editing.next_service_due);
    } else {
      setName('');
      setCategory('FIRE_EXTINGUISHER');
      setLocation('');
      setLastServiced('');
      setNextDue('');
    }
    setError(null);
    setSubmitting(false);
    setDeactivating(false);
    // Auto-focus name after sheet finishes animating
    const t = setTimeout(() => nameRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [visible, editing]);

  // Light client-side validation matching the server contract
  const validate = (): string | null => {
    if (name.trim().length === 0) return 'Name is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return 'Next service due must be YYYY-MM-DD';
    if (lastServiced.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(lastServiced)) {
      return 'Last serviced must be YYYY-MM-DD or empty';
    }
    if (lastServiced && lastServiced > nextDue) {
      return 'Last serviced cannot be after next service due';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      category,
      location_description: location.trim() || null,
      last_serviced_at: lastServiced || null,
      next_service_due: nextDue,
    };
    const result = isEdit
      ? await updateEquipment(editing!.id, payload)
      : await createEquipment(payload);
    setSubmitting(false);
    if (result.error || !result.item) {
      setError(result.error ?? 'Save failed');
      return;
    }
    onSaved();
  };

  const handleDeactivate = async () => {
    if (!editing) return;
    setDeactivating(true);
    setError(null);
    const { ok, error: err } = await setEquipmentActive(editing.id, false);
    setDeactivating(false);
    if (!ok) {
      setError(err ?? 'Could not deactivate');
      return;
    }
    onSaved();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={ms.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        style={ms.keyboardWrap}
      >
        <View style={[ms.sheet, { backgroundColor: c.background }]}>
          <View style={[ms.dragHandle, { backgroundColor: c.divider }]} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={ms.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[ms.title, { color: c.textPrimary }]}>
              {isEdit ? 'Edit equipment' : 'Add equipment'}
            </Text>

            <Text style={[ms.label, { color: c.textMuted }]}>Name *</Text>
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              placeholder="e.g. FE-001 (5kg ABC)"
              placeholderTextColor={c.textDisabled}
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
              returnKeyType="next"
            />

            <Text style={[ms.label, { color: c.textMuted }]}>Category *</Text>
            <View style={ms.chipRow}>
              {[
                ['FIRE_EXTINGUISHER', '🧯 Fire Ext'],
                ['AED', '❤️‍🩹 AED'],
                ['SMOKE_DETECTOR', '🚨 Smoke'],
                ['EMERGENCY_LIGHT', '💡 Light'],
                ['FIRST_AID_KIT', '🩹 First Aid'],
                ['ALARM_PANEL', '🔔 Alarm'],
                ['EVACUATION_SIGN', '🚪 Sign'],
                ['OTHER', '🛠️ Other'],
              ].map(([v, lbl]) => {
                const selected = category === v;
                return (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setCategory(v as string)}
                    style={[
                      ms.chip,
                      {
                        backgroundColor: selected ? brand.primary_colour : c.surface,
                        borderColor: selected ? brand.primary_colour : c.borderStrong,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        ms.chipText,
                        { color: selected ? c.textInverse : c.textPrimary },
                      ]}
                    >
                      {lbl}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[ms.label, { color: c.textMuted }]}>Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. T1 Reception, beside lift"
              placeholderTextColor={c.textDisabled}
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
              returnKeyType="next"
            />

            <View style={ms.dateRow}>
              <View style={ms.dateCol}>
                <Text style={[ms.label, { color: c.textMuted }]}>Last serviced</Text>
                <TextInput
                  value={lastServiced}
                  onChangeText={setLastServiced}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={c.textDisabled}
                  style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={ms.dateCol}>
                <Text style={[ms.label, { color: c.textMuted }]}>Next service due *</Text>
                <TextInput
                  value={nextDue}
                  onChangeText={setNextDue}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={c.textDisabled}
                  style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            {error && (
              <View style={[ms.errorBox, { backgroundColor: c.severity.SEV1_BG }]}>
                <Text style={[ms.errorText, { color: c.severity.SEV1 }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || deactivating}
              style={[
                ms.submitBtn,
                {
                  backgroundColor: brand.primary_colour,
                  opacity: submitting || deactivating ? 0.5 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={c.textInverse} />
              ) : (
                <Text style={[ms.submitText, { color: c.textInverse }]}>
                  {isEdit ? 'Save changes' : 'Add equipment'}
                </Text>
              )}
            </TouchableOpacity>

            {isEdit && editing.is_active && (
              <TouchableOpacity
                onPress={handleDeactivate}
                disabled={submitting || deactivating}
                style={[
                  ms.deactivateBtn,
                  { borderColor: c.severity.SEV1, opacity: deactivating ? 0.5 : 1 },
                ]}
              >
                {deactivating ? (
                  <ActivityIndicator color={c.severity.SEV1} />
                ) : (
                  <Text style={[ms.deactivateText, { color: c.severity.SEV1 }]}>
                    Deactivate this item
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onClose} style={ms.cancelBtn}>
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
  editChevron: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.regular,
    marginLeft: spacing.xs,
  },
});

// Editor modal styles
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
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateCol: { flex: 1 },
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
  deactivateBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  deactivateText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
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
