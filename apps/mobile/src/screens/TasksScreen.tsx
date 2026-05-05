import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { fetchMyTasks, syncPending, type TaskItem } from '../services/tasks';
import {
  fetchActiveIncidents,
  markSafe,
  resolveIncident,
  type ActiveIncident,
} from '../services/incidents';
import type { StaffProfile } from '../services/auth';
import { TaskDetailScreen } from './TaskDetailScreen';
import {
  Screen,
  useColours,
  useBrand,
  Drawer,
  DrawerTrigger,
  spacing,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  borderWidth,
  shadow,
  touch,
  type Colours,
  type DrawerGroup,
} from '../theme';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETE: 'Complete',
  LATE_COMPLETE: 'Complete (Late)',
  MISSED: 'Missed',
  ESCALATED: 'Escalated',
};

const FREQ_LABEL: Record<string, string> = {
  HOURLY: 'Hourly',
  EVERY_2H: 'Every 2h',
  EVERY_4H: 'Every 4h',
  EVERY_6H: 'Every 6h',
  EVERY_8H: 'Every 8h',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
};

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥',
  MEDICAL: '🏥',
  SECURITY: '🔒',
  EVACUATION: '🚨',
  STRUCTURAL: '🏗️',
  OTHER: '⚠️',
};

function statusColour(c: Colours, status: string): string {
  switch (status) {
    case 'PENDING':
      return c.status.pending;
    case 'IN_PROGRESS':
      return c.status.inProgress;
    case 'COMPLETE':
    case 'LATE_COMPLETE':
      return c.status.success;
    case 'MISSED':
      return c.status.danger;
    case 'ESCALATED':
      return c.status.escalated;
    default:
      return c.textMuted;
  }
}

function severityColour(c: Colours, sev: string): string {
  switch (sev) {
    case 'SEV1':
      return c.severity.SEV1;
    case 'SEV2':
      return c.severity.SEV2;
    case 'SEV3':
      return c.severity.SEV3;
    default:
      return c.severity.SEV1;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

interface Props {
  staff: StaffProfile;
  onLogout: () => void;
  onDeclareIncident: () => void;
  onManageStaff: () => void;
}

export function TasksScreen({
  staff,
  onLogout,
  onDeclareIncident,
  onManageStaff,
}: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [markingSafe, setMarkingSafe] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const [{ tasks: t, fromCache: fc }, activeIncidents] = await Promise.all([
      fetchMyTasks(),
      fetchActiveIncidents(),
    ]);
    setTasks(t);
    setFromCache(fc);
    setIncidents(activeIncidents);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    syncPending();
  }, [load]);

  const handleMarkSafe = useCallback(async (incident: ActiveIncident): Promise<void> => {
    setMarkingSafe(incident.id);
    const ok = await markSafe(incident.id);
    setMarkingSafe(null);
    if (ok) {
      Alert.alert('Confirmed', 'Your safe status has been recorded.');
    } else {
      Alert.alert('Error', 'Could not record safe status. Try again.');
    }
  }, []);

  const handleResolve = useCallback((incident: ActiveIncident): void => {
    Alert.alert(
      'Resolve Incident',
      `Mark this ${incident.incident_type.toLowerCase()} incident as resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            setResolving(incident.id);
            const ok = await resolveIncident(incident.id);
            setResolving(null);
            if (ok) {
              setIncidents((prev) => prev.filter((i) => i.id !== incident.id));
            } else {
              Alert.alert('Error', 'Could not resolve incident. Try again.');
            }
          },
        },
      ],
    );
  }, []);

  const handleComplete = useCallback((): void => {
    setSelectedTask(null);
    void load(true);
  }, [load]);

  if (selectedTask) {
    return (
      <TaskDetailScreen
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
        onCompleted={handleComplete}
      />
    );
  }

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });

  const actionable = tasks.filter((t) => !['COMPLETE', 'LATE_COMPLETE'].includes(t.status));
  const done = tasks.filter((t) => ['COMPLETE', 'LATE_COMPLETE'].includes(t.status));

  // 5-group drawer structure per UX-DESIGN-DECISIONS.md §4.
  // Phase B items render disabled (greyed out) to communicate forward roadmap
  // without breaking the navigation skeleton during testing.
  const drawerGroups: DrawerGroup[] = [
    {
      key: 'PRIMARY',
      title: 'Primary',
      items: [
        { key: 'tasks', label: 'My Tasks', icon: '📋', selected: true, onPress: () => undefined },
        {
          key: 'incident',
          label: 'Declare Incident',
          icon: '⚠️',
          onPress: onDeclareIncident,
        },
      ],
    },
    {
      key: 'OPERATIONS',
      title: 'Operations',
      items: [
        {
          key: 'shift',
          label: 'My Shift',
          icon: '🕐',
          disabled: true,
          onPress: () => undefined,
        },
        {
          key: 'visitors',
          label: 'Visitors (VMS)',
          icon: '🚪',
          disabled: true,
          onPress: () => undefined,
        },
      ],
    },
    {
      key: 'COMPLIANCE',
      title: 'Compliance',
      items: [
        {
          key: 'certs',
          label: 'My Certifications',
          icon: '🎓',
          disabled: true,
          onPress: () => undefined,
        },
      ],
    },
    {
      key: 'PEOPLE',
      title: 'People',
      items: [
        // SH/DSH only — gated server-side too (api 403 if non-SH/DSH attempts).
        // Per Plan §11 Role × Permission Matrix: "Add / remove staff" = FULL
        // for SH and DSH only; LTD or none for everyone else. UI mirrors that
        // by hiding the entry for ineligible roles to reduce surface area.
        ...(['SH', 'DSH'].includes(staff.role)
          ? [
              {
                key: 'staff',
                label: 'Manage Staff',
                icon: '👥',
                onPress: onManageStaff,
              } as const,
            ]
          : []),
        {
          key: 'profile',
          label: 'My Profile',
          icon: '👤',
          disabled: true,
          onPress: () => undefined,
        },
      ],
    },
    {
      key: 'SETTINGS',
      title: 'Settings',
      items: [
        {
          key: 'notifications',
          label: 'Notifications',
          icon: '🔔',
          disabled: true,
          onPress: () => undefined,
        },
        {
          key: 'help',
          label: 'Help & Support',
          icon: '❓',
          disabled: true,
          onPress: () => undefined,
        },
      ],
    },
  ];

  return (
    <Screen background={c.surface}>
      {/* Header */}
      <View
        style={[
          s.header,
          { backgroundColor: c.background, borderBottomColor: c.divider },
        ]}
      >
        <View style={s.headerLeft}>
          <DrawerTrigger onPress={() => setDrawerOpen(true)} />
          <View>
            <Text style={[s.headerTitle, { color: c.textPrimary }]}>My Tasks</Text>
            <Text style={[s.headerSub, { color: c.textMuted }]}>{today}</Text>
          </View>
        </View>
        {fromCache && (
          <View style={[s.cacheBadge, { backgroundColor: c.status.warningBg }]}>
            <Text style={[s.cacheBadgeText, { color: c.status.warning }]}>Offline cache</Text>
          </View>
        )}
      </View>

      {/* Staff pill */}
      <View
        style={[
          s.staffRow,
          { backgroundColor: c.background, borderBottomColor: c.divider },
        ]}
      >
        <View style={[s.avatar, { backgroundColor: brand.primary_colour }]}>
          <Text style={[s.avatarText, { color: c.textOnPrimary }]}>
            {staff.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={[s.staffName, { color: c.textPrimary }]}>{staff.name}</Text>
          <Text style={[s.staffRole, { color: c.textMuted }]}>
            {staff.role.replace(/_/g, ' ')}
          </Text>
        </View>
        <View style={s.taskCount}>
          <Text style={[s.taskCountNum, { color: brand.primary_colour }]}>{actionable.length}</Text>
          <Text style={[s.taskCountLabel, { color: c.textDisabled }]}>open</Text>
        </View>
      </View>

      {/* Active incident banner — shown whenever an ACTIVE or CONTAINED incident exists */}
      {incidents.map((incident) => (
        <IncidentBanner
          key={incident.id}
          incident={incident}
          markingSafe={markingSafe === incident.id}
          resolving={resolving === incident.id}
          onMarkSafe={() => handleMarkSafe(incident)}
          onResolve={() => handleResolve(incident)}
        />
      ))}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
        </View>
      ) : tasks.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: c.textMuted }]}>No tasks today</Text>
          <Text style={[s.emptySub, { color: c.textDisabled }]}>Pull down to refresh</Text>
        </View>
      ) : (
        <FlatList
          data={[...actionable, ...done]}
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
          ListHeaderComponent={
            actionable.length > 0 && done.length > 0 ? (
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: c.textDisabled }]}>
                  Open ({actionable.length})
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isDoneSection = index === actionable.length;
            return (
              <>
                {isDoneSection && (
                  <View style={[s.sectionHeader, { marginTop: spacing.lg }]}>
                    <Text style={[s.sectionTitle, { color: c.textDisabled }]}>
                      Completed ({done.length})
                    </Text>
                  </View>
                )}
                <TaskRow task={item} onPress={() => setSelectedTask(item)} />
              </>
            );
          }}
        />
      )}

      {/* Incident declaration FAB — always visible */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: c.severity.SEV1, shadowColor: c.severity.SEV1 }]}
        onPress={onDeclareIncident}
        activeOpacity={0.85}
        hitSlop={touch.hitSlop}
      >
        <Text style={[s.fabText, { color: c.textInverse }]}>⚠ Incident</Text>
      </TouchableOpacity>

      {/* Slide-over drawer — UX-DESIGN-DECISIONS.md §4 */}
      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        header={{
          initials: staff.name.charAt(0).toUpperCase(),
          primaryText: staff.name,
          secondaryText: staff.role.replace(/_/g, ' '),
        }}
        groups={drawerGroups}
        footerAction={{
          label: 'Sign Out',
          onPress: onLogout,
          tone: 'danger',
        }}
      />
    </Screen>
  );
}

interface IncidentBannerProps {
  incident: ActiveIncident;
  markingSafe: boolean;
  resolving: boolean;
  onMarkSafe: () => void;
  onResolve: () => void;
}

function IncidentBanner({
  incident,
  markingSafe,
  resolving,
  onMarkSafe,
  onResolve,
}: IncidentBannerProps): React.JSX.Element {
  const c = useColours();
  const sevColor = severityColour(c, incident.severity);
  const icon = TYPE_ICON[incident.incident_type] ?? '⚠️';
  const elapsed = Math.floor((Date.now() - new Date(incident.declared_at).getTime()) / 60_000);
  const elapsedStr =
    elapsed < 1 ? 'Just now' : elapsed === 1 ? '1 min ago' : `${elapsed} min ago`;

  return (
    <View style={[bs.banner, { backgroundColor: c.severity.SEV1_BG, borderLeftColor: sevColor }]}>
      <View style={bs.bannerTop}>
        <View style={[bs.sevDot, { backgroundColor: sevColor }]} />
        <Text style={[bs.bannerAlert, { color: sevColor }]}>INCIDENT ACTIVE</Text>
        <View style={[bs.sevPill, { backgroundColor: sevColor + '22' }]}>
          <Text style={[bs.sevPillText, { color: sevColor }]}>{incident.severity}</Text>
        </View>
      </View>
      <View style={bs.bannerMid}>
        <Text style={bs.bannerIcon}>{icon}</Text>
        <View style={bs.bannerMidText}>
          <Text style={[bs.bannerType, { color: c.textPrimary }]}>
            {incident.incident_type.charAt(0) + incident.incident_type.slice(1).toLowerCase()}
            {incident.zones ? ` · ${incident.zones.name}` : ''}
          </Text>
          <Text style={[bs.bannerTime, { color: c.textMuted }]}>{elapsedStr}</Text>
        </View>
      </View>
      <View style={bs.bannerActions}>
        <TouchableOpacity
          style={[
            bs.safeBtn,
            { backgroundColor: c.status.successBg, borderColor: c.status.success },
            markingSafe && bs.btnDisabled,
          ]}
          onPress={onMarkSafe}
          disabled={markingSafe || resolving}
          activeOpacity={0.8}
          hitSlop={touch.hitSlop}
        >
          {markingSafe ? (
            <ActivityIndicator color={c.status.success} size="small" />
          ) : (
            <Text style={[bs.safeBtnText, { color: c.status.success }]}>✓  I AM SAFE</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            bs.resolveBtn,
            { backgroundColor: c.surface, borderColor: c.borderStrong },
            resolving && bs.btnDisabled,
          ]}
          onPress={onResolve}
          disabled={markingSafe || resolving}
          activeOpacity={0.8}
          hitSlop={touch.hitSlop}
        >
          {resolving ? (
            <ActivityIndicator color={c.textSecondary} size="small" />
          ) : (
            <Text style={[bs.resolveBtnText, { color: c.textSecondary }]}>Resolve</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface TaskRowProps {
  task: TaskItem;
  onPress: () => void;
}

function TaskRow({ task, onPress }: TaskRowProps): React.JSX.Element {
  const c = useColours();
  const colour = statusColour(c, task.status);
  const isDone = ['COMPLETE', 'LATE_COMPLETE'].includes(task.status);
  const tpl = task.schedule_templates;

  return (
    <TouchableOpacity
      style={[s.row, { backgroundColor: c.background }, isDone && s.rowDone]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={touch.hitSlop}
    >
      <View style={[s.statusBar, { backgroundColor: colour }]} />
      <View style={s.rowContent}>
        <Text
          style={[
            s.rowTitle,
            { color: c.textPrimary },
            isDone && { textDecorationLine: 'line-through', color: c.textDisabled },
          ]}
          numberOfLines={2}
        >
          {tpl.title}
        </Text>
        <View style={s.rowMeta}>
          <Text style={[s.metaText, { color: c.textMuted }]}>
            {FREQ_LABEL[tpl.frequency] ?? tpl.frequency}
          </Text>
          <Text style={[s.metaDot, { color: c.borderStrong }]}>·</Text>
          <Text style={[s.metaText, { color: c.textMuted }]}>Due {formatTime(task.due_at)}</Text>
          {tpl.evidence_type !== 'NONE' && (
            <>
              <Text style={[s.metaDot, { color: c.borderStrong }]}>·</Text>
              <Text style={[s.metaText, { color: c.textMuted }]}>
                {tpl.evidence_type.toLowerCase()}
              </Text>
            </>
          )}
        </View>
      </View>
      <View style={[s.statusPill, { backgroundColor: colour + '18' }]}>
        <Text style={[s.statusPillText, { color: colour }]}>{STATUS_LABEL[task.status]}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingRight: spacing.lg + 4,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerTitle: { fontSize: fontSize.h5, fontWeight: fontWeight.bold },
  headerSub: { fontSize: fontSize.small, marginTop: 2 },
  cacheBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  cacheBadgeText: { fontSize: 11, fontWeight: fontWeight.semibold },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  staffName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  staffRole: { fontSize: fontSize.caption, marginTop: 1 },
  taskCount: { marginLeft: 'auto', alignItems: 'center' },
  taskCountNum: { fontSize: fontSize.h4, fontWeight: fontWeight.bold },
  taskCountLabel: { fontSize: 11 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing['3xl'] + spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  emptySub: { fontSize: fontSize.small },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing['2xl'] + spacing.sm },
  sep: { height: spacing.sm },
  sectionHeader: { paddingVertical: spacing.xs + 2 },
  sectionTitle: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
  },
  row: {
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow.sm,
  },
  rowDone: { opacity: 0.7 },
  statusBar: { width: 4, alignSelf: 'stretch' },
  rowContent: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.sm,
  },
  rowTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  metaText: { fontSize: fontSize.caption },
  metaDot: { fontSize: fontSize.caption },
  statusPill: {
    marginRight: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
  },
  statusPillText: { fontSize: 11, fontWeight: fontWeight.bold },
  fab: {
    position: 'absolute',
    bottom: spacing['2xl'] - spacing.xs,
    right: spacing.lg + 4,
    borderRadius: 28,
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.minTarget,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.heavy,
    letterSpacing: letterSpacing.wide,
  },
});

const bs = StyleSheet.create({
  banner: {
    borderLeftWidth: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm + 2,
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  bannerAlert: {
    fontSize: 11,
    fontWeight: fontWeight.heavy,
    letterSpacing: letterSpacing.wider,
    flex: 1,
  },
  sevPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  sevPillText: { fontSize: 11, fontWeight: fontWeight.bold },
  bannerMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  bannerIcon: { fontSize: fontSize.h3 },
  bannerMidText: { flex: 1 },
  bannerType: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  bannerTime: { fontSize: fontSize.caption, marginTop: 2 },
  bannerActions: { flexDirection: 'row', gap: spacing.sm + 2 },
  safeBtn: {
    flex: 1,
    height: touch.minTarget - 8,
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  safeBtnText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  resolveBtn: {
    height: touch.minTarget - 8,
    paddingHorizontal: spacing.lg,
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveBtnText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});
