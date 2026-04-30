import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StaffProfile } from '../services/auth';

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

export function HomeScreen({ staff, onLogout }: Props) {
  const { t } = useTranslation();
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.badge}>
            <Text style={s.badgeText}>SC</Text>
          </View>
          <Text style={s.title}>SafeCommand</Text>
        </View>

        <View style={s.card}>
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{staff.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.name}>{staff.name}</Text>
              <View style={s.rolePill}>
                <Text style={s.roleText}>{roleLabel}</Text>
              </View>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.statusRow}>
            <View style={s.statusDot} />
            <Text style={s.statusText}>Logged in — Sprint 1 Gate 2 ✓</Text>
          </View>
        </View>

        <Text style={s.note}>
          Full dashboard coming in Sprint 2. Scheduling engine, tasks, and incident declaration will appear here.
        </Text>

        <TouchableOpacity style={s.logoutBtn} onPress={onLogout}>
          <Text style={s.logoutText}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 20,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  rolePill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  roleText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 8 },
  statusText: { fontSize: 13, color: '#64748B' },
  note: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 32,
  },
  logoutBtn: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 15, color: '#64748B', fontWeight: '500' },
});
