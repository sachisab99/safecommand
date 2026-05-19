/**
 * Team Certifications — venue-wide staff certification management on mobile.
 *
 * Closes the LAST two-tier-admin-parity gap: Equipment / Drills / Shifts /
 * Staff already have mobile write surfaces; certifications was dashboard-
 * only (mobile had read-only MyCertificationsScreen for self certs). This
 * screen gives SH/DSH/FM in the field the same add/edit (and SH/DSH delete)
 * the dashboard /certifications page has — reusing the Phase 5.15 service
 * layer verbatim (no api change, no migration, no worker).
 *
 * Defence-in-depth: UI hides write controls for ineligible roles; the api
 * enforces requireRole (SH/DSH/FM add+edit; SH/DSH delete) + RLS. Feeds
 * BR-14 health-score certs component + the FF-3 / NABH §EM compliance
 * narrative (staff competence).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ScrollView,
  StyleSheet,
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
  fetchVenueCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
  canWriteCertifications,
  canDeleteCertifications,
  daysUntilExpiry,
  certBucket,
  type CertWithStaff,
  type CertExpiryBucket,
} from '../services/certifications';
import { fetchStaffList, type StaffRef } from '../services/incidents';

interface Props {
  staffRole: string;
  onBack: () => void;
}

const BUCKET_STYLE: Record<
  CertExpiryBucket,
  { label: string; rank: number; key: keyof Colours['status'] }
> = {
  EXPIRED: { label: 'EXPIRED', rank: 4, key: 'danger' },
  DUE_7: { label: '≤7 days', rank: 3, key: 'danger' },
  DUE_30: { label: '≤30 days', rank: 2, key: 'warning' },
  DUE_90: { label: '≤90 days', rank: 1, key: 'warning' },
  OK: { label: 'OK', rank: 0, key: 'success' },
};

export function TeamCertificationsScreen({ staffRole, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [certs, setCerts] = useState<CertWithStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = canWriteCertifications(staffRole);
  const canDelete = canDeleteCertifications(staffRole);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<CertWithStaff | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { certs: data, error: err } = await fetchVenueCertifications();
    if (err) setError(err);
    else {
      setError(null);
      setCerts(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 300_000); // 5-min — certs change rarely
    return () => clearInterval(id);
  }, [load]);

  // Most urgent first, then soonest expiry
  const sorted = [...certs].sort((a, b) => {
    const ra = BUCKET_STYLE[certBucket(daysUntilExpiry(a.expires_at))].rank;
    const rb = BUCKET_STYLE[certBucket(daysUntilExpiry(b.expires_at))].rank;
    if (ra !== rb) return rb - ra;
    return a.expires_at.localeCompare(b.expires_at);
  });

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Team Certifications</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]}>
            Venue-wide · {certs.length} on record
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.muted, { color: c.textMuted }]}>Loading certifications…</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={s.emoji}>🎓</Text>
          <Text style={[s.title, { color: c.textPrimary }]}>Could not load certifications</Text>
          <Text style={[s.muted, { color: c.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : certs.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emoji}>🎓</Text>
          <Text style={[s.title, { color: c.textPrimary }]}>No certifications yet</Text>
          <Text style={[s.muted, { color: c.textMuted }]}>
            {canWrite
              ? 'Tap + to record a staff certification (PSARA, First Aid, Fire Safety, NABH, etc).'
              : 'No staff certifications have been recorded for this venue.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(x) => x.id}
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
            <CertRow
              cert={item}
              colours={c}
              onPress={
                canWrite
                  ? () => {
                      setEditing(item);
                      setEditorVisible(true);
                    }
                  : undefined
              }
            />
          )}
        />
      )}

      {canWrite && !loading && error === null && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: brand.primary_colour, shadowColor: brand.primary_colour }]}
          onPress={() => {
            setEditing(null);
            setEditorVisible(true);
          }}
          activeOpacity={0.85}
          hitSlop={touch.hitSlop}
          accessibilityLabel="Add certification"
          accessibilityRole="button"
        >
          <Text style={[s.fabIcon, { color: c.textInverse }]}>+</Text>
        </TouchableOpacity>
      )}

      <CertEditorModal
        visible={editorVisible}
        editing={editing}
        canDelete={canDelete}
        onClose={() => setEditorVisible(false)}
        onSaved={() => {
          setEditorVisible(false);
          setEditing(null);
          void load(true);
        }}
      />
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function CertRow({
  cert,
  colours: c,
  onPress,
}: {
  cert: CertWithStaff;
  colours: Colours;
  onPress?: () => void;
}) {
  const days = daysUntilExpiry(cert.expires_at);
  const bucket = certBucket(days);
  const bs = BUCKET_STYLE[bucket];
  const fg = c.status[bs.key];
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      {...(onPress ? { onPress, activeOpacity: 0.7, hitSlop: touch.hitSlop } : {})}
      style={[s.row, { backgroundColor: c.background }]}
    >
      <View style={s.rowMain}>
        <Text style={[s.rowName, { color: c.textPrimary }]} numberOfLines={1}>
          {cert.certification_name}
        </Text>
        <Text style={[s.rowSub, { color: c.textMuted }]} numberOfLines={1}>
          {cert.staff ? `${cert.staff.name} · ${cert.staff.role}` : 'Unassigned'}
          {'  ·  expires '}
          {cert.expires_at}
        </Text>
      </View>
      <View style={[s.pill, { backgroundColor: c.surface, borderColor: fg }]}>
        <Text style={[s.pillText, { color: fg }]}>
          {bs.label}
          {bucket !== 'OK' && bucket !== 'EXPIRED' ? ` · ${days}d` : ''}
        </Text>
      </View>
    </Wrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// CertEditorModal — Add (editing===null) / Edit. Bottom-sheet, matches the
// EquipmentEditorModal pattern (KeyboardAvoidingView, drag handle, auto-
// focus, error-on-submit, refetch-on-success).

interface EditorProps {
  visible: boolean;
  editing: CertWithStaff | null;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const COMMON_CERTS = [
  'PSARA License',
  'First Aid',
  'Fire Safety',
  'Working at Heights',
  'NABH',
  'FSSAI',
  'Electrical Safety',
];

function CertEditorModal({ visible, editing, canDelete, onClose, onSaved }: EditorProps) {
  const c = useColours();
  const brand = useBrand();
  const isEdit = editing !== null;

  const [staff, setStaff] = useState<StaffRef[]>([]);
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    // Staff list for the picker (Add flow). /v1/staff is role-gated; on a
    // 403 we degrade gracefully → empty picker, edit-existing still works.
    void fetchStaffList().then(setStaff);
    if (editing) {
      setStaffId(editing.staff_id);
      setName(editing.certification_name);
      setIssuedAt(editing.issued_at);
      setExpiresAt(editing.expires_at);
      setDocUrl(editing.document_url ?? '');
    } else {
      setStaffId('');
      setName('');
      setIssuedAt('');
      setExpiresAt('');
      setDocUrl('');
    }
    setError(null);
    setSubmitting(false);
    setDeleting(false);
    const t = setTimeout(() => nameRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [visible, editing]);

  const validate = (): string | null => {
    if (!isEdit && staffId.length === 0) return 'Select a staff member';
    if (name.trim().length === 0) return 'Certification name is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) return 'Issued date must be YYYY-MM-DD';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return 'Expiry date must be YYYY-MM-DD';
    if (issuedAt > expiresAt) return 'Issued date cannot be after expiry date';
    if (docUrl.trim() && !/^https?:\/\//.test(docUrl.trim()))
      return 'Document URL must start with http(s)://';
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
    const base = {
      certification_name: name.trim(),
      issued_at: issuedAt,
      expires_at: expiresAt,
      document_url: docUrl.trim() || null,
    };
    const res = isEdit
      ? await updateCertification(editing!.id, base)
      : await createCertification({ staff_id: staffId, ...base });
    setSubmitting(false);
    if (res.error || !res.cert) {
      setError(res.error ?? 'Save failed');
      return;
    }
    onSaved();
  };

  const handleDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    setError(null);
    const { ok, error: err } = await deleteCertification(editing.id);
    setDeleting(false);
    if (!ok) {
      setError(err ?? 'Could not delete');
      return;
    }
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
              {isEdit ? 'Edit certification' : 'Add certification'}
            </Text>

            {!isEdit && (
              <>
                <Text style={[ms.label, { color: c.textMuted }]}>Staff member *</Text>
                <View style={ms.chipRow}>
                  {staff.length === 0 ? (
                    <Text style={[ms.hint, { color: c.textDisabled }]}>
                      Staff list unavailable for your role — edit existing entries instead.
                    </Text>
                  ) : (
                    staff.map((st) => {
                      const sel = staffId === st.id;
                      return (
                        <TouchableOpacity
                          key={st.id}
                          onPress={() => setStaffId(st.id)}
                          style={[
                            ms.chip,
                            {
                              backgroundColor: sel ? brand.primary_colour : c.surface,
                              borderColor: sel ? brand.primary_colour : c.borderStrong,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              ms.chipText,
                              { color: sel ? c.textInverse : c.textPrimary },
                            ]}
                          >
                            {st.name} · {st.role}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </>
            )}
            {isEdit && editing?.staff && (
              <Text style={[ms.hint, { color: c.textMuted }]}>
                Staff: {editing.staff.name} ({editing.staff.role}) — fixed on edit
              </Text>
            )}

            <Text style={[ms.label, { color: c.textMuted }]}>Certification name *</Text>
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              placeholder="e.g. PSARA License"
              placeholderTextColor={c.textDisabled}
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
              returnKeyType="next"
            />
            <View style={ms.chipRow}>
              {COMMON_CERTS.map((cn) => (
                <TouchableOpacity
                  key={cn}
                  onPress={() => setName(cn)}
                  style={[ms.chipSm, { borderColor: c.borderStrong }]}
                >
                  <Text style={[ms.chipSmText, { color: c.textMuted }]}>{cn}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[ms.label, { color: c.textMuted }]}>Issued (YYYY-MM-DD) *</Text>
            <TextInput
              value={issuedAt}
              onChangeText={setIssuedAt}
              placeholder="2025-01-15"
              placeholderTextColor={c.textDisabled}
              autoCapitalize="none"
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
            />

            <Text style={[ms.label, { color: c.textMuted }]}>Expires (YYYY-MM-DD) *</Text>
            <TextInput
              value={expiresAt}
              onChangeText={setExpiresAt}
              placeholder="2027-01-15"
              placeholderTextColor={c.textDisabled}
              autoCapitalize="none"
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
            />

            <Text style={[ms.label, { color: c.textMuted }]}>Document URL (optional)</Text>
            <TextInput
              value={docUrl}
              onChangeText={setDocUrl}
              placeholder="https://…"
              placeholderTextColor={c.textDisabled}
              autoCapitalize="none"
              keyboardType="url"
              style={[ms.input, { color: c.textPrimary, borderColor: c.borderStrong }]}
            />

            {error !== null && (
              <Text style={[ms.error, { color: c.status.danger }]}>{error}</Text>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[
                ms.submitBtn,
                { backgroundColor: brand.primary_colour, opacity: submitting ? 0.6 : 1 },
              ]}
              hitSlop={touch.hitSlop}
            >
              {submitting ? (
                <ActivityIndicator color={c.textInverse} size="small" />
              ) : (
                <Text style={[ms.submitText, { color: c.textInverse }]}>
                  {isEdit ? 'Save changes' : 'Add certification'}
                </Text>
              )}
            </TouchableOpacity>

            {isEdit && canDelete && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting}
                style={[ms.deleteBtn, { borderColor: c.status.danger, opacity: deleting ? 0.6 : 1 }]}
                hitSlop={touch.hitSlop}
              >
                {deleting ? (
                  <ActivityIndicator color={c.status.danger} size="small" />
                ) : (
                  <Text style={[ms.deleteText, { color: c.status.danger }]}>
                    Delete certification
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onClose} style={ms.cancelBtn} hitSlop={touch.hitSlop}>
              <Text style={[ms.cancelText, { color: c.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 60 },
  backBtnSpacer: { width: 60 },
  backText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  navTitleWrap: { flex: 1, alignItems: 'center' },
  navTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  navSubtitle: { fontSize: fontSize.caption, marginTop: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: 40 },
  title: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold, textAlign: 'center' },
  muted: { fontSize: fontSize.body, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  list: { padding: spacing.md },
  sep: { height: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  rowSub: { fontSize: fontSize.caption, marginTop: 2 },
  pill: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: { fontSize: 30, fontWeight: fontWeight.bold, marginTop: -2 },
});

const ms = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  title: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.wide,
    marginTop: spacing.sm,
  },
  hint: { fontSize: fontSize.caption, marginTop: 2 },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    marginTop: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  chipSm: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipSmText: { fontSize: fontSize.caption },
  error: { fontSize: fontSize.caption, marginTop: spacing.sm },
  submitBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    minHeight: touch.minTarget,
    justifyContent: 'center',
  },
  submitText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  deleteBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: touch.minTarget,
    justifyContent: 'center',
  },
  deleteText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  cancelText: { fontSize: fontSize.body },
});
