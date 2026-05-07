/**
 * MyCertificationsScreen — staff's own professional credentials (BR-22).
 *
 * Per-staff view: shows ONLY the logged-in staff's certifications, sorted
 * most-urgent-first. Backed by /v1/certifications/me which the api filters
 * to req.auth.staff_id.
 *
 * BR-B context: when a staff with an expiring cert is selected as shift
 * commander, SC + SH receive a soft warning (not a hard block). That
 * happens at activate-shift time on api side; this screen lets staff
 * proactively renew before that happens.
 *
 * Refs: BR-22 (Staff Certification Tracker), BR-B (Cert Expiry Warning),
 * BR-14 (Health Score 15% weight), Phase 5.12 (this).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  fetchMyCertifications,
  daysUntilExpiry,
  certBucket,
  type StaffCertification,
  type CertExpiryBucket,
} from '../services/certifications';
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

const BUCKET_STYLE: Record<CertExpiryBucket, BucketStyle> = {
  EXPIRED: {
    label: (d) => `EXPIRED ${Math.abs(d)}d`,
    fg: (c) => c.severity.SEV1,
    bg: (c) => c.severity.SEV1_BG,
    rank: 5,
  },
  DUE_7: {
    label: (d) => `Expires in ${d}d`,
    fg: (c) => c.severity.SEV2,
    bg: (c) => c.zoneStatus.INCIDENT_ACTIVE_BG,
    rank: 4,
  },
  DUE_30: {
    label: (d) => `Expires in ${d}d`,
    fg: (c) => c.status.escalated,
    bg: (c) => c.status.escalatedBg,
    rank: 3,
  },
  DUE_90: {
    label: (d) => `Expires in ${d}d`,
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
  staffName: string;
  onBack: () => void;
}

export function MyCertificationsScreen({ staffName, onBack }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [certs, setCerts] = useState<StaffCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) setRefreshing(true);
    const { certs: cs, error: err } = await fetchMyCertifications();
    if (err) {
      setError(err);
    } else {
      setError(null);
      setCerts(cs);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    // 5-minute polling — cert dates rarely change
    const id = setInterval(() => void load(), 300_000);
    return () => clearInterval(id);
  }, [load]);

  // Sort: most urgent first, then earliest expiry
  const sorted = [...certs].sort((a, b) => {
    const ra = BUCKET_STYLE[certBucket(daysUntilExpiry(a.expires_at))].rank;
    const rb = BUCKET_STYLE[certBucket(daysUntilExpiry(b.expires_at))].rank;
    if (ra !== rb) return rb - ra;
    return a.expires_at.localeCompare(b.expires_at);
  });

  // Bucket counts
  const counts = { ok: 0, due_90: 0, due_30: 0, due_7: 0, expired: 0 };
  for (const cc of certs) {
    const b = certBucket(daysUntilExpiry(cc.expires_at));
    if (b === 'OK') counts.ok++;
    else if (b === 'DUE_90') counts.due_90++;
    else if (b === 'DUE_30') counts.due_30++;
    else if (b === 'DUE_7') counts.due_7++;
    else counts.expired++;
  }
  const urgentCount = counts.due_7 + counts.expired;

  return (
    <Screen background={c.surface}>
      <View style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
          <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
        </TouchableOpacity>
        <View style={s.navTitleWrap}>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>My Certifications</Text>
          <Text style={[s.navSubtitle, { color: c.textMuted }]} numberOfLines={1}>
            {staffName}
          </Text>
        </View>
        <View style={s.backBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={brand.primary_colour} />
          <Text style={[s.loadingText, { color: c.textMuted }]}>Loading certifications...</Text>
        </View>
      ) : error !== null ? (
        <View style={s.center}>
          <Text style={[s.emptyEmoji]}>📜</Text>
          <Text style={[s.errorTitle, { color: c.textPrimary }]}>Could not load</Text>
          <Text style={[s.errorText, { color: c.textMuted }]}>{error}</Text>
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
          <Text style={[s.emptyEmoji]}>📜</Text>
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No certifications yet</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>
            Your professional credentials (First Aid, Fire Safety, Security Guard
            License, etc) haven't been registered.
          </Text>
          <Text style={[s.emptyHint, { color: c.textDisabled }]}>
            Speak to your Security Head to add them via the Operations Console.
          </Text>
        </View>
      ) : (
        <>
          {urgentCount > 0 && (
            <View style={[s.alertBanner, { backgroundColor: c.severity.SEV1_BG, borderLeftColor: c.severity.SEV1 }]}>
              <Text style={[s.alertText, { color: c.severity.SEV1 }]}>
                ⚠ {urgentCount} certification{urgentCount === 1 ? '' : 's'} need{urgentCount === 1 ? 's' : ''} immediate attention
              </Text>
            </View>
          )}

          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                colors={[brand.primary_colour]}
              />
            }
            contentContainerStyle={s.list}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => <CertRow cert={item} colours={c} />}
            ListFooterComponent={
              <View style={s.footer}>
                <Text style={[s.footerText, { color: c.textDisabled }]}>
                  Total: {certs.length} certification{certs.length === 1 ? '' : 's'}
                </Text>
              </View>
            }
          />
        </>
      )}
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Cert row

function CertRow({ cert, colours: c }: { cert: StaffCertification; colours: Colours }) {
  const days = daysUntilExpiry(cert.expires_at);
  const bucket = certBucket(days);
  const style = BUCKET_STYLE[bucket];
  const fg = style.fg(c);
  const bg = style.bg(c);

  return (
    <View style={[rs.row, { backgroundColor: c.background }]}>
      <View style={[rs.statusStrip, { backgroundColor: fg }]} />
      <View style={rs.rowContent}>
        <Text style={[rs.rowName, { color: c.textPrimary }]} numberOfLines={2}>
          {cert.certification_name}
        </Text>
        <View style={rs.rowMeta}>
          <Text style={[rs.rowDate, { color: c.textMuted }]}>
            Issued {cert.issued_at} · Expires {cert.expires_at}
          </Text>
        </View>
        <View style={rs.rowBottom}>
          <View style={[rs.statusPill, { backgroundColor: bg }]}>
            <Text style={[rs.statusPillText, { color: fg }]}>{style.label(days)}</Text>
          </View>
          {cert.document_url && (
            <Text style={[rs.docLink, { color: c.status.pending }]}>📎 Document</Text>
          )}
        </View>
      </View>
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
  navSubtitle: { fontSize: fontSize.caption, marginTop: 2, maxWidth: 200 },
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  alertBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 4,
  },
  alertText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
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
  emptySub: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 320 },
  emptyHint: {
    fontSize: fontSize.small,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.xs,
  },
  errorTitle: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.bold },
  errorText: { fontSize: fontSize.body, textAlign: 'center', maxWidth: 320 },
  retryBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: touch.minTarget - 8,
    marginTop: spacing.md,
  },
  retryText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  footer: { paddingTop: spacing.lg, alignItems: 'center' },
  footerText: { fontSize: fontSize.caption },
});

const rs = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  statusStrip: { width: 4, alignSelf: 'stretch' },
  rowContent: { flex: 1, padding: spacing.md, gap: spacing.xs },
  rowName: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.semibold,
  },
  rowMeta: { gap: 2 },
  rowDate: {
    fontSize: fontSize.caption,
    fontFamily: 'Courier',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
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
  docLink: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
});
