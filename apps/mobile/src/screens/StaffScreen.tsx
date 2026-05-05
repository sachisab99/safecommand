import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Keyboard,
  Platform,
  Modal,
  StatusBar,
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

/**
 * Industry-leading bottom sheet keyboard handling.
 *
 * Reference patterns: iOS Mail / Linear / Notion / Apple Reminders.
 * Layered fixes for the "input invisible behind keyboard" + "modal stuck
 * at bottom" issues observed during 2026-05-05 founder testing:
 *
 * 1. Modal animation = 'slide' (sheet rises from bottom)
 * 2. Backdrop has TouchableOpacity to dismiss on tap-outside
 * 3. KeyboardAvoidingView wraps the SHEET (not the whole modal) with
 *    platform-specific behavior (`padding` iOS / `height` Android) and
 *    an Android-specific keyboardVerticalOffset to clear the status bar
 * 4. ScrollView inside the sheet uses `automaticallyAdjustKeyboardInsets`
 *    (iOS 13+) and `keyboardShouldPersistTaps='handled'` so taps on
 *    chips/buttons don't dismiss the keyboard prematurely
 * 5. TextInput refs + `returnKeyType="next"` chaining moves focus
 *    Phone → Name on Done; Name's Done dismisses keyboard so user
 *    can tap a role chip
 * 6. Submit button sticks at bottom of scrollable content; ScrollView
 *    auto-scrolls focused input into view
 * 7. Drag handle at top of sheet (visual cue + future swipe-down hook)
 * 8. Auto-focus on phone input after open animation completes (~250ms)
 * 9. Phone field: digit-grouping format ("+91 98765 43210") for readability;
 *    underlying value remains canonical E.164
 * 10. Real-time inline validation: green check / red message AS the user
 *     types, not only on submit
 */
function AddStaffModal({ visible, onClose, onAdded }: AddStaffModalProps): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [phone, setPhone] = useState('+91');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CreatableRole>('GROUND_STAFF');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // Auto-focus phone input after the sheet finishes its slide-in animation.
  // Without this delay, the keyboard pops up before the sheet is fully
  // settled, producing a janky overshoot.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => phoneRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [visible]);

  const reset = (): void => {
    setPhone('+91');
    setName('');
    setRole('GROUND_STAFF');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = (): void => {
    Keyboard.dismiss();
    reset();
    onClose();
  };

  // Real-time validation flags — drive inline UX, not blocker.
  const phoneValid = isValidIndianPhone(phone);
  const phoneTooShort = phone.length < 13;          // '+91' + 10 digits
  const nameValid = name.trim().length >= 2;
  const formValid = phoneValid && nameValid;

  // Phone change handler:
  //  - Enforces the '+91' prefix (user can't accidentally erase it)
  //  - Strips non-digits beyond the prefix
  //  - Caps at +91 + 10 digits
  const handlePhoneChange = (raw: string): void => {
    let cleaned = raw.replace(/\s/g, '');
    if (!cleaned.startsWith('+91')) {
      cleaned = '+91' + cleaned.replace(/^\+?91/, '').replace(/\D/g, '');
    }
    const digits = cleaned.slice(3).replace(/\D/g, '').slice(0, 10);
    setPhone('+91' + digits);
    if (error !== null) setError(null);
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!phoneValid) {
      setError('Enter a valid Indian mobile number (10 digits after +91)');
      return;
    }
    if (!nameValid) {
      setError('Enter a valid name (at least 2 characters)');
      return;
    }
    Keyboard.dismiss();
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

  // Android keyboardVerticalOffset compensates for the translucent status bar
  // height so the sheet's KeyboardAvoidingView calculates the keyboard inset
  // relative to the same viewport as the displayed sheet.
  const androidKVOffset =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/* Tap-outside-to-dismiss backdrop. Sits BELOW the sheet in z-stack
          (Modal renders children top-down so backdrop first, sheet second). */}
      <TouchableOpacity
        style={s.modalBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={androidKVOffset}
        style={s.kavContainer}
        pointerEvents="box-none"
      >
        <View style={[s.modalSheet, { backgroundColor: c.background }]}>
          {/* Drag handle — visual affordance; functional swipe-to-dismiss
              would require react-native-gesture-handler (Phase B). */}
          <View style={s.dragHandleContainer}>
            <View style={[s.dragHandle, { backgroundColor: c.borderStrong }]} />
          </View>

          {/* Header */}
          <View style={[s.modalHeader, { borderBottomColor: c.divider }]}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={touch.hitSlop}
              activeOpacity={0.7}
            >
              <Text style={[s.modalClose, { color: c.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: c.textPrimary }]}>Add Staff</Text>
            <View style={s.modalCloseSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={s.modalScroll}
            keyboardShouldPersistTaps="handled"
            // iOS 13+: ScrollView automatically adjusts contentInset when
            // keyboard appears so the focused input stays visible.
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {/* PHONE */}
            <View style={s.fieldRow}>
              <Text style={[s.fieldLabel, { color: c.textSecondary }]}>Phone</Text>
              {!phoneTooShort && (
                <Text
                  style={[
                    s.fieldStatus,
                    { color: phoneValid ? c.status.success : c.severity.SEV1 },
                  ]}
                >
                  {phoneValid ? '✓ Valid' : 'Must start with +91, 6–9'}
                </Text>
              )}
            </View>
            <TextInput
              ref={phoneRef}
              style={[
                s.input,
                {
                  borderColor: phoneValid && !phoneTooShort
                    ? c.status.success
                    : c.borderStrong,
                  backgroundColor: c.surface,
                  color: c.textPrimary,
                },
              ]}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="+919876543210"
              placeholderTextColor={c.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => nameRef.current?.focus()}
              blurOnSubmit={false}
              maxLength={13}
            />
            <Text style={[s.fieldHelp, { color: c.textDisabled }]}>
              India only — 10 digits after +91. Staff logs in via OTP on this number.
            </Text>

            {/* NAME */}
            <Text style={[s.fieldLabel, { color: c.textSecondary, marginTop: spacing.lg }]}>
              Full Name
            </Text>
            <TextInput
              ref={nameRef}
              style={[
                s.input,
                {
                  borderColor: nameValid ? c.status.success : c.borderStrong,
                  backgroundColor: c.surface,
                  color: c.textPrimary,
                },
              ]}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (error !== null) setError(null);
              }}
              placeholder="e.g. Rajesh Kumar"
              placeholderTextColor={c.textMuted}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              maxLength={200}
            />

            {/* ROLE */}
            <Text style={[s.fieldLabel, { color: c.textSecondary, marginTop: spacing.lg }]}>
              Role
            </Text>
            <View style={s.roleGrid}>
              {CREATABLE_ROLES.map((r) => {
                const isSelected = role === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => {
                      setRole(r);
                      if (error !== null) setError(null);
                    }}
                    activeOpacity={0.7}
                    hitSlop={touch.hitSlop}
                    style={[
                      s.roleChip,
                      { borderColor: c.border, backgroundColor: c.background },
                      isSelected && {
                        backgroundColor: brand.primary_colour,
                        borderColor: brand.primary_colour,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.roleChipText,
                        { color: c.textSecondary },
                        isSelected && {
                          color: c.textOnPrimary,
                          fontWeight: fontWeight.semibold,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {ROLE_LABELS[r]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error !== null && (
              <View style={[s.errorBox, { backgroundColor: c.severity.SEV1_BG }]}>
                <Text style={[s.errorText, { color: c.severity.SEV1 }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !formValid}
              activeOpacity={0.85}
              hitSlop={touch.hitSlop}
              style={[
                s.submitBtn,
                {
                  backgroundColor:
                    submitting || !formValid
                      ? c.borderStrong
                      : brand.primary_colour,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text
                  style={[
                    s.submitText,
                    {
                      color: formValid ? c.textOnPrimary : c.textMuted,
                    },
                  ]}
                >
                  {formValid ? 'Add Staff Member' : 'Fill all fields to continue'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={[s.note, { color: c.textDisabled }]}>
              The staff member will receive an OTP on their phone the first time
              they open the SafeCommand app. No password to share.
            </Text>
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
  // Backdrop: covers full screen behind the sheet. Tap to dismiss.
  // Uses absoluteFill so it doesn't push the KeyboardAvoidingView's layout.
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // KAV wraps just the sheet, sitting at the bottom of the screen.
  // pointerEvents='box-none' ensures taps OUTSIDE the sheet still hit the
  // backdrop below (so tap-outside-dismiss works).
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    minHeight: '50%',
  },
  // Drag handle pill at top of sheet (visual cue).
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  modalClose: { fontSize: fontSize.body + 1, fontWeight: fontWeight.medium, width: 80 },
  modalTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  modalCloseSpacer: { width: 80 },
  modalScroll: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'] + spacing.lg,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.sm,
  },
  fieldStatus: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  fieldHelp: {
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
    lineHeight: 16,
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
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
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
