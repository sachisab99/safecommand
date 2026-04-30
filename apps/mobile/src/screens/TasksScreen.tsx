import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { fetchMyTasks, syncPending, type TaskItem } from '../services/tasks';
import type { StaffProfile } from '../services/auth';
import { TaskDetailScreen } from './TaskDetailScreen';

const STATUS_COLOR: Record<string, string> = {
  PENDING:      '#2563EB',
  IN_PROGRESS:  '#7C3AED',
  COMPLETE:     '#16A34A',
  LATE_COMPLETE:'#16A34A',
  MISSED:       '#DC2626',
  ESCALATED:    '#EA580C',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:      'Pending',
  IN_PROGRESS:  'In Progress',
  COMPLETE:     'Complete',
  LATE_COMPLETE:'Complete (Late)',
  MISSED:       'Missed',
  ESCALATED:    'Escalated',
};

const FREQ_LABEL: Record<string, string> = {
  HOURLY:'Hourly', EVERY_2H:'Every 2h', EVERY_4H:'Every 4h',
  EVERY_6H:'Every 6h', EVERY_8H:'Every 8h', DAILY:'Daily',
  WEEKLY:'Weekly', MONTHLY:'Monthly', QUARTERLY:'Quarterly', ANNUAL:'Annual',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

interface Props {
  staff: StaffProfile;
  onLogout: () => void;
}

export function TasksScreen({ staff, onLogout }: Props) {
  const [tasks, setTasks]           = useState<TaskItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache]   = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const { tasks: t, fromCache: fc } = await fetchMyTasks();
    setTasks(t);
    setFromCache(fc);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    syncPending(); // flush any offline completions
  }, [load]);

  const handleComplete = useCallback(() => {
    setSelectedTask(null);
    load(true); // reload task list after completion
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

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });

  const actionable = tasks.filter(t => !['COMPLETE', 'LATE_COMPLETE'].includes(t.status));
  const done       = tasks.filter(t => ['COMPLETE', 'LATE_COMPLETE'].includes(t.status));

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>My Tasks</Text>
          <Text style={s.headerSub}>{today}</Text>
        </View>
        <View style={s.headerRight}>
          {fromCache && (
            <View style={s.cacheBadge}>
              <Text style={s.cacheBadgeText}>Offline cache</Text>
            </View>
          )}
          <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
            <Text style={s.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Staff pill */}
      <View style={s.staffRow}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{staff.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={s.staffName}>{staff.name}</Text>
          <Text style={s.staffRole}>{staff.role.replace(/_/g, ' ')}</Text>
        </View>
        <View style={s.taskCount}>
          <Text style={s.taskCountNum}>{actionable.length}</Text>
          <Text style={s.taskCountLabel}>open</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>
      ) : tasks.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTitle}>No tasks today</Text>
          <Text style={s.emptySub}>Pull down to refresh</Text>
        </View>
      ) : (
        <FlatList
          data={[...actionable, ...done]}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#1E3A5F']} />}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListHeaderComponent={actionable.length > 0 && done.length > 0 ? (
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Open ({actionable.length})</Text>
            </View>
          ) : null}
          renderItem={({ item, index }) => {
            // Section divider between open and done
            const isDoneSection = index === actionable.length;
            return (
              <>
                {isDoneSection && (
                  <View style={[s.sectionHeader, { marginTop: 16 }]}>
                    <Text style={s.sectionTitle}>Completed ({done.length})</Text>
                  </View>
                )}
                <TaskRow task={item} onPress={() => setSelectedTask(item)} />
              </>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function TaskRow({ task, onPress }: { task: TaskItem; onPress: () => void }) {
  const color = STATUS_COLOR[task.status] ?? '#64748B';
  const isDone = ['COMPLETE', 'LATE_COMPLETE'].includes(task.status);
  const tpl = task.schedule_templates;

  return (
    <TouchableOpacity style={[s.row, isDone && s.rowDone]} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.statusBar, { backgroundColor: color }]} />
      <View style={s.rowContent}>
        <Text style={[s.rowTitle, isDone && s.rowTitleDone]} numberOfLines={2}>{tpl.title}</Text>
        <View style={s.rowMeta}>
          <Text style={s.metaText}>{FREQ_LABEL[tpl.frequency] ?? tpl.frequency}</Text>
          <Text style={s.metaDot}>·</Text>
          <Text style={s.metaText}>Due {formatTime(task.due_at)}</Text>
          {tpl.evidence_type !== 'NONE' && (
            <>
              <Text style={s.metaDot}>·</Text>
              <Text style={s.metaText}>{tpl.evidence_type.toLowerCase()}</Text>
            </>
          )}
        </View>
      </View>
      <View style={[s.statusPill, { backgroundColor: color + '18' }]}>
        <Text style={[s.statusPillText, { color }]}>{STATUS_LABEL[task.status]}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#F8FAFC' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  headerSub:    { fontSize: 13, color: '#64748B', marginTop: 2 },
  headerRight:  { alignItems: 'flex-end', gap: 6 },
  cacheBadge:   { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cacheBadgeText:{ fontSize: 11, color: '#92400E', fontWeight: '600' },
  logoutBtn:    { paddingVertical: 4 },
  logoutText:   { fontSize: 13, color: '#94A3B8' },
  staffRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12 },
  avatar:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  staffName:    { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  staffRole:    { fontSize: 12, color: '#64748B', marginTop: 1 },
  taskCount:    { marginLeft: 'auto', alignItems: 'center' },
  taskCountNum: { fontSize: 22, fontWeight: '700', color: '#1E3A5F' },
  taskCountLabel:{ fontSize: 11, color: '#94A3B8' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyTitle:   { fontSize: 16, fontWeight: '600', color: '#64748B', marginBottom: 4 },
  emptySub:     { fontSize: 13, color: '#94A3B8' },
  list:         { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  sep:          { height: 8 },
  sectionHeader:{ paddingVertical: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  row:          { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  rowDone:      { opacity: 0.7 },
  statusBar:    { width: 4, alignSelf: 'stretch' },
  rowContent:   { flex: 1, paddingVertical: 14, paddingLeft: 14, paddingRight: 8 },
  rowTitle:     { fontSize: 14, fontWeight: '600', color: '#1E293B', marginBottom: 4 },
  rowTitleDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  rowMeta:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaText:     { fontSize: 12, color: '#64748B' },
  metaDot:      { fontSize: 12, color: '#CBD5E1' },
  statusPill:   { marginRight: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText:{ fontSize: 11, fontWeight: '700' },
});
