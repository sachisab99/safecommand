import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import {
  fetchStaff,
  createStaff,
  isValidIndianPhone,
  CREATABLE_ROLES,
  ROLE_LABELS,
  type StaffMember,
  type CreatableRole,
} from '../services/staff';
import {
  Screen,
  useColours,
  useBrand,
  spacing,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  borderWidth,
  shadow,
  touch,
} from '../theme';

interface Props {
  onBack: () => void;
}

export function StaffScreen({ onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { staff: s, error: err } = await fetchStaff();
    if (err) {
      setError(err);
    } else {
      setError(null);
      setStaff(s);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdded = useCallback((): void => {
    setShowAdd(false);
    void load(true);
  }, [load]);

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: c.textPrimary }]}>Manage Staff</Text>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={[s.addBtn, { backgroundColor: brand.primary_colour }]}
          hitSlop={touch.hitSlop}
          activeOpacity={0.7}
        >
          <Text style={[s.addBtnText, { color: c.textOnPrimary }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={[s.errorText, { color: c.severity.SEV1 }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => void load(true)}
            style={[s.retryBtn, { borderColor: c.borderStrong }]}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.retryText, { color: c.textPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : staff.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: c.textMuted }]}>No staff yet</Text>
          <Text style={[s.emptySub, { color: c.textDisabled }]}>Tap + Add to create the first one</Text>
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => <StaffRow staff={item} />}
        />
      )}

      <AddStaffModal visible={showAdd} onClose={() => setShowAdd(false)} onAdded={handleAdded} />
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// StaffRow

function StaffRow({ staff }: { staff: StaffMember }): React.JSX.Element {
  const c = useColours();
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;
  const phoneLast4 = staff.phone.slice(-4);
  const dotColour = staff.is_active ? c.status.success : c.textDisabled;

  return (
    <View style={[s.row, { backgroundColor: c.background }, ...(shadow.sm ? [shadow.sm] : [])]}>
      <View style={s.rowLeft}>
        <View style={[s.statusDot, { backgroundColor: dotColour }]} />
        <View style={s.rowContent}>
          <Text style={[s.staffName, { color: c.textPrimary }]} numberOfLines={1}>
            {staff.name}
          </Text>
          <View style={s.rowMeta}>
            <View style={[s.rolePill, { backgroundColor: c.status.pendingBg }]}>
              <Text style={[s.rolePillText, { color: c.status.pending }]}>{roleLabel}</Text>
            </View>
            <Text style={[s.phoneText, { color: c.textMuted }]}>···{phoneLast4}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AddStaffModal — slide-up modal with form

interface AddStaffModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function AddStaffModal({ visible, onClose, onAdded }: AddStaffModalProps): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [phone, setPhone] = useState('+91');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CreatableRole>('GROUND_STAFF');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setPhone('+91');
    setName('');
    setRole('GROUND_STAFF');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!isValidIndianPhone(phone)) {
      setError('Enter a valid Indian mobile number (+91XXXXXXXXXX)');
      return;
    }
    if (name.trim().length < 2) {
      setError('Enter a valid name (at least 2 characters)');
      return;
    }
    setSubmitting(true);
    const { staff, error: err } = await createStaff({
      phone: phone.trim(),
      name: name.trim(),
      role,
    });
    setSubmitting(false);
    if (err || !staff) {
      setError(err ?? 'Could not create staff member');
      return;
    }
    Alert.alert('Staff added', `${staff.name} added as ${ROLE_LABELS[staff.role]}.`);
    reset();
    onAdded();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalContainer}
        >
          <View style={[s.modalSheet, { backgroundColor: c.background }]}>
            <View style={[s.modalHeader, { borderBottomColor: c.divider }]}>
              <TouchableOpacity onPress={handleClose} hitSlop={touch.hitSlop}>
                <Text style={[s.modalClose, { color: c.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: c.textPrimary }]}>Add Staff</Text>
              <View style={s.modalCloseSpacer} />
            </View>

            <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={[s.fieldLabel, { color: c.textSecondary }]}>Phone (E.164 — +91 prefix)</Text>
              <TextInput
                style={[s.input, { borderColor: c.borderStrong, backgroundColor: c.surface, color: c.textPrimary }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+919876543210"
                placeholderTextColor={c.textMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                autoCapitalize="none"
              />

              <Text style={[s.fieldLabel, { color: c.textSecondary }]}>Name</Text>
              <TextInput
                style={[s.input, { borderColor: c.borderStrong, backgroundColor: c.surface, color: c.textPrimary }]}
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor={c.textMuted}
                autoCapitalize="words"
              />

              <Text style={[s.fieldLabel, { color: c.textSecondary }]}>Role</Text>
              <View style={s.roleGrid}>
                {CREATABLE_ROLES.map((r) => {
                  const isSelected = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setRole(r)}
                      activeOpacity={0.7}
                      hitSlop={touch.hitSlop}
                      style={[
                        s.roleChip,
                        { borderColor: c.border, backgroundColor: c.background },
                        isSelected && { backgroundColor: brand.primary_colour, borderColor: brand.primary_colour },
                      ]}
                    >
                      <Text
                        style={[
                          s.roleChipText,
                          { color: c.textSecondary },
                          isSelected && { color: c.textOnPrimary, fontWeight: fontWeight.semibold },
                        ]}
                        numberOfLines={1}
                      >
                        {ROLE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error !== null && <Text style={[s.errorText, { color: c.severity.SEV1 }]}>{error}</Text>}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
                hitSlop={touch.hitSlop}
                style={[
                  s.submitBtn,
                  { backgroundColor: brand.primary_colour },
                  submitting && { opacity: 0.6 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={c.textOnPrimary} />
                ) : (
                  <Text style={[s.submitText, { color: c.textOnPrimary }]}>Add Staff Member</Text>
                )}
              </TouchableOpacity>

              <Text style={[s.note, { color: c.textDisabled }]}>
                The staff member can log in to SafeCommand once they receive a one-time password
                on their registered phone number.
              </Text>
            </ScrollView>
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 80 },
  backText: { fontSize: fontSize.body + 1, fontWeight: fontWeight.medium },
  navTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorText: { fontSize: fontSize.body, marginTop: spacing.sm, textAlign: 'center' },
  retryBtn: {
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touch.minTarget - 8,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  emptyTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.semibold },
  emptySub: { fontSize: fontSize.small, textAlign: 'center' },
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  sep: { height: spacing.sm },
  row: { borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  rowContent: { flex: 1 },
  staffName: { fontSize: fontSize.body + 1, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rolePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  rolePillText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  phoneText: { fontSize: fontSize.caption, fontWeight: fontWeight.regular },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContainer: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalClose: { fontSize: fontSize.body + 1, fontWeight: fontWeight.medium, width: 80 },
  modalTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  modalCloseSpacer: { width: 80 },
  modalScroll: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  fieldLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLarge,
    minHeight: touch.minTarget,
  },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.medium - 0.5,
    minHeight: touch.minTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChipText: { fontSize: fontSize.small, fontWeight: fontWeight.medium },
  submitBtn: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.minTarget,
  },
  submitText: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  note: {
    marginTop: spacing.lg,
    fontSize: fontSize.caption,
    lineHeight: 16,
    textAlign: 'center',
  },
});
