import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StaffProfile } from '../services/auth';
import {
  Screen,
  useColours,
  useBrand,
  useRoleLabel,
  spacing,
  fontSize,
  fontWeight,
  radius,
  borderWidth,
  shadow,
  touch,
} from '../theme';

const ROLE_LABELS: Record<string, string> = {
  SH: 'Security Head',
  DSH: 'Deputy Security Head',
  SHIFT_COMMANDER: 'Shift Commander',
  GM: 'General Manager',
  AUDITOR: 'Auditor',
  FM: 'Facility Manager',
  FLOOR_SUPERVISOR: 'Floor Supervisor',
  GROUND_STAFF: 'Ground Staff',
};

interface Props {
  staff: StaffProfile;
  onLogout: () => void;
}

export function HomeScreen({ staff, onLogout }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const c = useColours();
  const brand = useBrand();
  // useRoleLabel respects per-corporate role_overrides (BR-84); falls through
  // to JWT role code otherwise. We then map the code/override to the long form.
  const resolvedCode = useRoleLabel(
    staff.role as 'SH' | 'DSH' | 'SHIFT_COMMANDER' | 'GM' | 'AUDITOR' | 'FM' | 'FLOOR_SUPERVISOR' | 'GROUND_STAFF',
  );
  const roleLabel = ROLE_LABELS[resolvedCode] ?? resolvedCode;

  return (
    <Screen background={c.surface}>
      <View style={s.container}>
        <View style={s.header}>
          <View style={[s.badge, { backgroundColor: brand.primary_colour }]}>
            <Text style={[s.badgeText, { color: c.textOnPrimary }]}>SC</Text>
          </View>
          <Text style={[s.title, { color: c.textPrimary }]}>{brand.brand_name}</Text>
        </View>

        <View style={[s.card, { backgroundColor: c.background }]}>
          <View style={s.avatarRow}>
            <View style={[s.avatar, { backgroundColor: brand.primary_colour }]}>
              <Text style={[s.avatarText, { color: c.textOnPrimary }]}>
                {staff.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={[s.name, { color: c.textPrimary }]}>{staff.name}</Text>
              <View style={[s.rolePill, { backgroundColor: c.status.pendingBg }]}>
                <Text style={[s.roleText, { color: c.status.pending }]}>{roleLabel}</Text>
              </View>
            </View>
          </View>
          <View style={[s.divider, { backgroundColor: c.divider }]} />
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: c.status.success }]} />
            <Text style={[s.statusText, { color: c.textMuted }]}>
              Logged in — Sprint 1 Gate 2 ✓
            </Text>
          </View>
        </View>

        <Text style={[s.note, { color: c.textDisabled }]}>
          Full dashboard coming in Sprint 2. Scheduling engine, tasks, and incident declaration
          will appear here.
        </Text>

        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: c.borderStrong }]}
          onPress={onLogout}
          hitSlop={touch.hitSlop}
        >
          <Text style={[s.logoutText, { color: c.textMuted }]}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  badgeText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.bold,
  },
  title: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl - spacing.xs,
    marginBottom: spacing.xl - spacing.xs,
    ...shadow.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md + 2,
  },
  avatarText: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
  },
  name: {
    fontSize: fontSize.h6 - 1,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs + 2,
  },
  rolePill: {
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  divider: {
    height: 1,
    marginBottom: spacing.md + 2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: { fontSize: fontSize.small },
  note: {
    fontSize: fontSize.small,
    lineHeight: 20,
    marginBottom: spacing['2xl'],
  },
  logoutBtn: {
    height: touch.minTarget,
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.medium,
  },
});
