/**
 * IncidentDetailScreen — full lifecycle view for a single incident on mobile.
 *
 * Mirror of dashboard /incidents/[id] (Phase 5.7) for the mobile operator:
 * header (type / severity / status pills) → description → chronological
 * timeline (DECLARED / BROADCAST_SENT / STAFF_ON_SITE / STAFF_ACK /
 * ESCALATED / CONTAINED / RESOLVED / NOTE) → scope → mark-safe action.
 *
 * Closes the round-trip: a staff who declared an incident from this app
 * can now follow its lifecycle from the same app — no need to call the
 * security desk to learn the status.
 *
 * Refs: BR-29 (post-incident audit trail), EC-10 / Rule 4 (timeline
 * append-only), BR-11 (incident declaration backbone), NFR-04 (≤3 taps:
 * banner → detail = 1 tap from any screen)
 *
 * api: existing GET /v1/incidents/:id — no api change required for
 * this screen. Actor names resolved via /v1/staff (degrades gracefully
 * to truncated IDs if caller's role can't read /v1/staff).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {
  fetchIncidentDetail,
  fetchStaffList,
  markSafe,
  generateSireComplianceExport,
  canExportIncidentCompliance,
  type IncidentDetail,
  type TimelineEvent,
  type StaffRef,
  type SireExportFormat,
} from '../services/incidents';
import { SireSection } from '../components/sire/SireSection';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { getStoredSession } from '../services/auth';
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

const TYPE_ICON: Record<string, string> = {
  FIRE: '🔥',
  MEDICAL: '🏥',
  SECURITY: '🔒',
  EVACUATION: '🚨',
  STRUCTURAL: '🏗️',
  OTHER: '⚠️',
};

const EVENT_LABEL: Record<string, string> = {
  DECLARED: 'Incident declared',
  BROADCAST_SENT: 'Broadcast sent',
  STAFF_ON_SITE: 'Staff on site',
  STAFF_ACK: 'Staff acknowledged',
  ESCALATED_LEVEL_1: 'Escalated — level 1',
  ESCALATED_LEVEL_2: 'Escalated — level 2',
  ESCALATED_LEVEL_3: 'Escalated — level 3',
  CONTAINED: 'Contained',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  NOTE: 'Note',
};

function severityColour(c: Colours, sev: string): string {
  switch (sev) {
    case 'SEV1': return c.severity.SEV1;
    case 'SEV2': return c.severity.SEV2;
    case 'SEV3': return c.severity.SEV3;
    default:     return c.severity.SEV1;
  }
}

function statusColours(c: Colours, status: string): { fg: string; bg: string } {
  switch (status) {
    case 'ACTIVE':    return { fg: c.severity.SEV1, bg: c.severity.SEV1_BG };
    case 'CONTAINED': return { fg: c.status.escalated, bg: c.status.escalatedBg };
    case 'RESOLVED':  return { fg: c.status.success, bg: c.status.successBg };
    case 'CLOSED':    return { fg: c.textMuted, bg: c.surface };
    default:          return { fg: c.textMuted, bg: c.surface };
  }
}

function eventDotColour(c: Colours, event_type: string): string {
  if (event_type === 'DECLARED') return c.severity.SEV1;
  if (event_type === 'BROADCAST_SENT') return c.status.pending;
  if (event_type === 'STAFF_ON_SITE') return c.status.inProgress;
  if (event_type === 'STAFF_ACK') return c.status.success;
  if (event_type.startsWith('ESCALATED')) return c.severity.SEV2;
  if (event_type === 'CONTAINED') return c.status.escalated;
  if (event_type === 'RESOLVED') return c.status.success;
  return c.textMuted;
}

function metadataLine(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  if (typeof metadata['note'] === 'string') parts.push(metadata['note'] as string);
  if (typeof metadata['text'] === 'string') parts.push(metadata['text'] as string);
  if (typeof metadata['description'] === 'string' && parts.length === 0)
    parts.push(metadata['description'] as string);
  if (typeof metadata['resolution'] === 'string')
    parts.push(metadata['resolution'] as string);
  if (typeof metadata['reason'] === 'string')
    parts.push(`Reason: ${metadata['reason']}`);
  if (
    typeof metadata['recipients'] === 'number' &&
    typeof metadata['delivered'] === 'number'
  ) {
    parts.push(
      `${metadata['delivered']}/${metadata['recipients']} delivered (${metadata['channel'] ?? '—'})`,
    );
  }
  if (typeof metadata['location'] === 'string')
    parts.push(`📍 ${metadata['location']}`);
  if (typeof metadata['ack_type'] === 'string')
    parts.push(String(metadata['ack_type']).replace('_', ' '));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatElapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Screen

interface Props {
  incidentId: string;
  onBack: () => void;
}

export function IncidentDetailScreen({ incidentId, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [staffMap, setStaffMap] = useState<Map<string, StaffRef>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingSafe, setMarkingSafe] = useState(false);
  const [safeFeedback, setSafeFeedback] = useState<string | null>(null);
  // Session — used to identify caller for SIRE section (staff_id + role)
  const [callerStaffId, setCallerStaffId] = useState<string | null>(null);
  const [callerRole, setCallerRole] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<SireExportFormat | null>(null);

  useEffect(() => {
    let mounted = true;
    getStoredSession().then((session) => {
      if (!mounted || !session) return;
      setCallerStaffId(session.staff.id);
      setCallerRole(session.staff.role);
    });
    return () => { mounted = false; };
  }, []);

  const load = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (isRefresh) setRefreshing(true);
      const [detailRes, staffList] = await Promise.all([
        fetchIncidentDetail(incidentId),
        fetchStaffList(),
      ]);
      if (detailRes.error || !detailRes.incident) {
        setError(detailRes.error ?? 'Incident not found');
      } else {
        setError(null);
        setIncident(detailRes.incident);
        const m = new Map<string, StaffRef>();
        for (const s of staffList) m.set(s.id, s);
        setStaffMap(m);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [incidentId],
  );

  useEffect(() => {
    void load();
    // 30s polling — incident state changes (CONTAINED/RESOLVED) should
    // be reflected promptly on mobile during an event
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleMarkSafe = useCallback(async () => {
    if (!incident) return;
    setMarkingSafe(true);
    setSafeFeedback(null);
    const ok = await markSafe(incident.id);
    setMarkingSafe(false);
    if (ok) {
      setSafeFeedback('Marked safe — your acknowledgement is recorded.');
      // Reload to reflect the new STAFF_ACK timeline event
      await load(true);
    } else {
      setSafeFeedback('Could not record. Try again.');
    }
  }, [incident, load]);

  // SIRE Compliance Export — FF-3 / NABH §EM (Arch v9.1 §20.13).
  const handleExport = useCallback(
    async (format: SireExportFormat): Promise<void> => {
      if (!incident) return;
      setExportBusy(format);
      const { url, error: e } = await generateSireComplianceExport(incident.id, format);
      setExportBusy(null);
      if (e || !url) {
        Alert.alert('Export failed', e ?? 'Could not generate the compliance export.');
        return;
      }
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Export ready', 'Generated, but the device could not open the PDF link.');
      }
    },
    [incident],
  );

  const isOpen =
    incident !== null && (incident.status === 'ACTIVE' || incident.status === 'CONTAINED');

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Incident</Text>
          {incident && (
            <Text style={[s.navSubtitle, { color: c.textMuted }]}>
              {incident.id.slice(0, 8).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading incident...</Text>
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
      ) : incident !== null ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[brand.primary_colour]}
            />
          }
        >
          <Header incident={incident} colours={c} />
          {incident.description && (
            <DescriptionCard description={incident.description} colours={c} />
          )}
          {/* SIRE v2 section — only for incidents declared with enable_sire=true.
              Renders zone state grid + per-staff action checklist + evacuation
              triggers. Polls /v1/sire/state every 3s. */}
          {incident.has_sire_data && callerStaffId && callerRole && (
            <ErrorBoundary label="incident response view">
              <SireSection
                incidentId={incident.id}
                staffId={callerStaffId}
                staffRole={callerRole}
              />
            </ErrorBoundary>
          )}
          <TimelineCard
            events={incident.incident_timeline}
            staffMap={staffMap}
            colours={c}
          />
          <ScopeCard incident={incident} colours={c} />

          {/* Mark safe — legacy v1 binary path. Suppressed for SIRE incidents:
              the SireSection above is the action surface (3-button zone state
              + per-role actions). Context-aware per Rec 1; v1 path preserved
              verbatim for non-SIRE incidents. */}
          {isOpen && !incident.has_sire_data && (
            <View style={s.safeBlock}>
              <TouchableOpacity
                onPress={handleMarkSafe}
                disabled={markingSafe}
                style={[
                  s.safeBtn,
                  {
                    backgroundColor: c.status.successBg,
                    borderColor: c.status.success,
                    opacity: markingSafe ? 0.6 : 1,
                  },
                ]}
                hitSlop={touch.hitSlop}
              >
                {markingSafe ? (
                  <ActivityIndicator color={c.status.success} size="small" />
                ) : (
                  <Text style={[s.safeBtnText, { color: c.status.success }]}>
                    ✓  I AM SAFE
                  </Text>
                )}
              </TouchableOpacity>
              {safeFeedback !== null && (
                <Text style={[s.safeFeedback, { color: c.textMuted }]}>{safeFeedback}</Text>
              )}
            </View>
          )}

          {/* SIRE Compliance Export — FF-3 / NABH §EM (Arch v9.1 §20.13).
              In-field authority PDF for the Fire-NOC / NABH walkthrough.
              Command + GM + Auditor only (mirrors api requireRole). */}
          {canExportIncidentCompliance(callerRole) && (
            <View style={s.exportBlock}>
              <Text style={[s.exportHint, { color: c.textMuted }]}>
                Compliance export (PDF)
              </Text>
              <View style={s.exportRow}>
                <TouchableOpacity
                  onPress={() => void handleExport('TELANGANA_FF3')}
                  disabled={exportBusy !== null}
                  style={[
                    s.exportBtn,
                    { borderColor: c.status.danger, opacity: exportBusy ? 0.6 : 1 },
                  ]}
                  hitSlop={touch.hitSlop}
                >
                  {exportBusy === 'TELANGANA_FF3' ? (
                    <ActivityIndicator color={c.status.danger} size="small" />
                  ) : (
                    <Text style={[s.exportBtnText, { color: c.status.danger }]}>
                      FF-3 export
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleExport('NABH_EM')}
                  disabled={exportBusy !== null}
                  style={[
                    s.exportBtn,
                    { borderColor: c.divider, opacity: exportBusy ? 0.6 : 1 },
                  ]}
                  hitSlop={touch.hitSlop}
                >
                  {exportBusy === 'NABH_EM' ? (
                    <ActivityIndicator color={c.textSecondary} size="small" />
                  ) : (
                    <Text style={[s.exportBtnText, { color: c.textSecondary }]}>
                      NABH §EM pack
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Header

function Header({ incident, colours: c }: { incident: IncidentDetail; colours: Colours }) {
  const sevColour = severityColour(c, incident.severity);
  const status = statusColours(c, incident.status);
  const icon = TYPE_ICON[incident.incident_type] ?? '⚠️';

  return (
    <View style={[s.card, { backgroundColor: c.background }]}>
      <View style={s.headerTop}>
        <Text style={s.headerIcon}>{icon}</Text>
        <View style={s.headerTextWrap}>
          <View style={s.headerTitleRow}>
            <Text style={[s.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
              {incident.incident_type}
            </Text>
            <View style={[s.sevPill, { backgroundColor: sevColour }]}>
              <Text style={[s.sevPillText, { color: c.textInverse }]}>{incident.severity}</Text>
            </View>
          </View>
          <View style={[s.statusPill, { backgroundColor: status.bg }]}>
            {incident.status === 'ACTIVE' && (
              <View style={[s.pulseDot, { backgroundColor: status.fg }]} />
            )}
            <Text style={[s.statusPillText, { color: status.fg }]}>{incident.status}</Text>
          </View>
        </View>
      </View>

      <View style={s.headerMeta}>
        {incident.zones?.name && (
          <MetaRow label="Zone" value={incident.zones.name} colours={c} />
        )}
        {incident.staff?.name && (
          <MetaRow
            label="Declared by"
            value={`${incident.staff.name} (${incident.staff.role})`}
            colours={c}
          />
        )}
        <MetaRow
          label="When"
          value={`${formatAbsolute(incident.declared_at)} (${formatElapsed(incident.declared_at)})`}
          colours={c}
        />
        {incident.resolved_at && (
          <MetaRow label="Resolved" value={formatAbsolute(incident.resolved_at)} colours={c} />
        )}
      </View>
    </View>
  );
}

function MetaRow({
  label,
  value,
  colours: c,
}: {
  label: string;
  value: string;
  colours: Colours;
}) {
  return (
    <View style={s.metaRow}>
      <Text style={[s.metaLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[s.metaValue, { color: c.textPrimary }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Description

function DescriptionCard({
  description,
  colours: c,
}: {
  description: string;
  colours: Colours;
}) {
  // Strip [DEMO] marker for clean display
  const clean = description.replace(/^\[DEMO\]\s*/, '');
  return (
    <View style={[s.card, { backgroundColor: c.background }]}>
      <Text style={[s.cardLabel, { color: c.textMuted }]}>DESCRIPTION</Text>
      <Text style={[s.descriptionText, { color: c.textPrimary }]}>{clean}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Timeline

function TimelineCard({
  events,
  staffMap,
  colours: c,
}: {
  events: TimelineEvent[];
  staffMap: Map<string, StaffRef>;
  colours: Colours;
}) {
  const ordered = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );

  return (
    <View style={[s.card, { backgroundColor: c.background }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardLabel, { color: c.textMuted }]}>TIMELINE</Text>
        <Text style={[s.cardCount, { color: c.textMuted }]}>
          {ordered.length} event{ordered.length === 1 ? '' : 's'}
        </Text>
      </View>

      {ordered.length === 0 ? (
        <Text style={[s.emptyText, { color: c.textDisabled }]}>
          No timeline events recorded yet.
        </Text>
      ) : (
        <View style={s.timelineWrap}>
          {ordered.map((evt, idx) => (
            <TimelineRow
              key={evt.id}
              event={evt}
              staffMap={staffMap}
              isLast={idx === ordered.length - 1}
              colours={c}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TimelineRow({
  event,
  staffMap,
  isLast,
  colours: c,
}: {
  event: TimelineEvent;
  staffMap: Map<string, StaffRef>;
  isLast: boolean;
  colours: Colours;
}) {
  const dotColour = eventDotColour(c, event.event_type);
  const label = EVENT_LABEL[event.event_type] ?? event.event_type;
  const actor = event.actor_staff_id ? staffMap.get(event.actor_staff_id) : null;
  const actorLabel = actor
    ? actor.name
    : event.actor_staff_id
      ? `Staff ${event.actor_staff_id.slice(0, 8).toUpperCase()}`
      : 'System';
  const detail = metadataLine(event.metadata);

  return (
    <View style={s.timelineRow}>
      <View style={s.timelineGutter}>
        <View style={[s.timelineDot, { backgroundColor: dotColour, borderColor: c.background }]} />
        {!isLast && <View style={[s.timelineLine, { backgroundColor: c.divider }]} />}
      </View>
      <View style={s.timelineContent}>
        <Text style={[s.timelineLabel, { color: c.textPrimary }]}>{label}</Text>
        <View style={s.timelineMeta}>
          <Text style={[s.timelineActor, { color: c.textMuted }]}>{actorLabel}</Text>
          <Text style={[s.timelineTime, { color: c.textDisabled }]}>
            {formatElapsed(event.occurred_at)}
          </Text>
        </View>
        {detail && (
          <Text style={[s.timelineDetail, { color: c.textSecondary }]} numberOfLines={3}>
            {detail}
          </Text>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Scope

function ScopeCard({
  incident,
  colours: c,
}: {
  incident: IncidentDetail;
  colours: Colours;
}) {
  return (
    <View style={[s.card, { backgroundColor: c.background }]}>
      <Text style={[s.cardLabel, { color: c.textMuted }]}>SCOPE</Text>
      <View style={s.scopeGrid}>
        <ScopeField label="Type" value={incident.incident_type} colours={c} />
        <ScopeField label="Severity" value={incident.severity} colours={c} />
        <ScopeField label="Status" value={incident.status} colours={c} />
        <ScopeField
          label="Zone"
          value={incident.zones?.name ?? 'Venue-wide'}
          colours={c}
        />
        <ScopeField
          label="Reference"
          value={incident.id.slice(0, 8).toUpperCase()}
          mono
          colours={c}
        />
      </View>
    </View>
  );
}

function ScopeField({
  label,
  value,
  mono,
  colours: c,
}: {
  label: string;
  value: string;
  mono?: boolean;
  colours: Colours;
}) {
  return (
    <View style={s.scopeField}>
      <Text style={[s.scopeFieldLabel, { color: c.textMuted }]}>{label}</Text>
      <Text
        style={[
          s.scopeFieldValue,
          { color: c.textPrimary },
          mono && { fontFamily: 'Courier', fontSize: fontSize.caption },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
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
  navSubtitle: {
    fontSize: fontSize.caption,
    marginTop: 2,
    fontFamily: 'Courier',
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardCount: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  emptyText: {
    fontSize: fontSize.small,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  // Header
  headerTop: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  headerIcon: { fontSize: 36 },
  headerTextWrap: { flex: 1, gap: spacing.xs },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: fontSize.h5,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  sevPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm + 2,
  },
  sevPillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  headerMeta: { gap: spacing.xs, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  metaLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    minWidth: 90,
  },
  metaValue: { fontSize: fontSize.caption, flex: 1 },
  // Description
  descriptionText: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.4,
  },
  // Timeline
  timelineWrap: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineGutter: { width: 16, alignItems: 'center' },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 4,
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  timelineMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  timelineActor: { fontSize: fontSize.caption, flex: 1 },
  timelineTime: { fontSize: fontSize.caption },
  timelineDetail: {
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
    lineHeight: fontSize.caption * 1.4,
  },
  // Scope
  scopeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  scopeField: { minWidth: '40%', flex: 1 },
  scopeFieldLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: 2,
  },
  scopeFieldValue: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  // Mark safe
  safeBlock: { gap: spacing.sm, marginTop: spacing.xs },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: touch.minTarget + 4,
  },
  safeBtnText: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wide,
  },
  safeFeedback: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
  // Centered states
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { fontSize: fontSize.body },
  errorText: { fontSize: fontSize.body, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  // SIRE compliance export (FF-3 / NABH §EM)
  exportBlock: { gap: spacing.xs, marginTop: spacing.md },
  exportHint: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.wide,
  },
  exportRow: { flexDirection: 'row', gap: spacing.sm },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    minHeight: touch.minTarget,
  },
  exportBtnText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
});
