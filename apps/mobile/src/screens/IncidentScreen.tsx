import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  fetchZones,
  declareIncident,
  type Zone,
  type IncidentType,
  type Severity,
} from '../services/incidents';
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
  type Colours,
} from '../theme';

interface Props {
  onBack: () => void;
  onDeclared: (incidentId: string) => void;
}

interface IncidentTypeConfig {
  type: IncidentType;
  label: string;
  icon: string;
  /** Resolves through useColours() at render time — keys into Colours */
  colourKey: 'severityRed' | 'pending' | 'severityOrange' | 'purple' | 'severityYellow' | 'muted';
}

const INCIDENT_TYPES: IncidentTypeConfig[] = [
  { type: 'FIRE', label: 'Fire', icon: '🔥', colourKey: 'severityRed' },
  { type: 'MEDICAL', label: 'Medical', icon: '🏥', colourKey: 'pending' },
  { type: 'SECURITY', label: 'Security', icon: '🔒', colourKey: 'severityOrange' },
  { type: 'EVACUATION', label: 'Evacuation', icon: '🚨', colourKey: 'purple' },
  { type: 'STRUCTURAL', label: 'Structural', icon: '🏗️', colourKey: 'severityYellow' },
  { type: 'OTHER', label: 'Other', icon: '⚠️', colourKey: 'muted' },
];

function resolveTypeColour(c: Colours, key: IncidentTypeConfig['colourKey']): string {
  switch (key) {
    case 'severityRed':
      return c.severity.SEV1;
    case 'pending':
      return c.status.pending;
    case 'severityOrange':
      return c.severity.SEV2;
    case 'purple':
      return c.status.inProgress;
    case 'severityYellow':
      return c.severity.SEV3;
    case 'muted':
      return c.textMuted;
  }
}

interface SeverityConfig {
  level: Severity;
  label: string;
  sub: string;
  /** True = SEV3 (light bg with dark text); False = SEV1/SEV2 (red/orange bg, white text) */
  isLight: boolean;
}

const SEVERITIES: SeverityConfig[] = [
  {
    level: 'SEV1',
    label: 'SEV 1 — Critical',
    sub: 'Life-threatening / active danger',
    isLight: false,
  },
  {
    level: 'SEV2',
    label: 'SEV 2 — Serious',
    sub: 'Significant threat, injuries possible',
    isLight: false,
  },
  {
    level: 'SEV3',
    label: 'SEV 3 — Minor',
    sub: 'Contained, no immediate threat',
    isLight: true,
  },
];

function severityBackground(c: Colours, level: Severity): string {
  switch (level) {
    case 'SEV1':
      return c.severity.SEV1;
    case 'SEV2':
      return c.severity.SEV2;
    case 'SEV3':
      return c.severity.SEV3_BG;
  }
}

function severityForeground(c: Colours, level: Severity): string {
  return level === 'SEV3' ? c.textPrimary : c.textInverse;
}

export function IncidentScreen({ onBack, onDeclared }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [selectedSev, setSelectedSev] = useState<Severity | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (step === 2 && zones.length === 0) {
      setZonesLoading(true);
      void fetchZones().then((z) => {
        setZones(z);
        setZonesLoading(false);
      });
    }
  }, [step, zones.length]);

  const typeConfig = INCIDENT_TYPES.find((t) => t.type === selectedType);

  const handleDeclare = async (): Promise<void> => {
    if (!selectedType || !selectedSev) return;
    setSubmitting(true);
    const { success, incident_id, error } = await declareIncident({
      incident_type: selectedType,
      severity: selectedSev,
      zone_id: selectedZone?.id,
    });
    setSubmitting(false);
    if (success && incident_id) {
      onDeclared(incident_id);
    } else {
      Alert.alert('Failed', error ?? 'Could not declare incident. Try again.');
    }
  };

  return (
    <Screen background={c.surface}>
      {/* Nav */}
      <View
        style={[s.nav, { backgroundColor: c.background, borderBottomColor: c.divider }]}
      >
        <TouchableOpacity
          onPress={step === 1 ? onBack : () => setStep((step - 1) as 1 | 2 | 3)}
          style={s.backBtn}
          hitSlop={touch.hitSlop}
        >
          <Text style={[s.backText, { color: c.severity.SEV1 }]}>
            ← {step === 1 ? 'Cancel' : 'Back'}
          </Text>
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: c.textPrimary }]}>Declare Incident</Text>
        <View style={s.stepIndicator}>
          {[1, 2, 3].map((n) => (
            <View
              key={n}
              style={[
                s.stepDot,
                { backgroundColor: c.border },
                step >= n && { backgroundColor: c.severity.SEV1 },
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── Step 1: Type selection ── */}
      {step === 1 && (
        <View style={s.stepBody}>
          <Text style={[s.stepTitle, { color: c.textPrimary }]}>What type of incident?</Text>
          <View style={s.typeGrid}>
            {INCIDENT_TYPES.map(({ type, label, icon, colourKey }) => {
              const colour = resolveTypeColour(c, colourKey);
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    s.typeBtn,
                    { borderColor: colour, backgroundColor: c.background },
                    shadow.sm,
                  ]}
                  onPress={() => {
                    setSelectedType(type);
                    setStep(2);
                  }}
                  activeOpacity={0.7}
                  hitSlop={touch.hitSlop}
                >
                  <Text style={s.typeIcon}>{icon}</Text>
                  <Text style={[s.typeLabel, { color: colour }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Step 2: Severity + zone ── */}
      {step === 2 && (
        <ScrollView contentContainerStyle={s.stepScroll} keyboardShouldPersistTaps="handled">
          <Text style={[s.stepTitle, { color: c.textPrimary }]}>Severity level?</Text>
          <View style={s.sevList}>
            {SEVERITIES.map(({ level, label, sub }) => {
              const bg = severityBackground(c, level);
              const fg = severityForeground(c, level);
              const isSelected = selectedSev === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    s.sevBtn,
                    { backgroundColor: bg },
                    isSelected && shadow.md,
                  ]}
                  onPress={() => setSelectedSev(level)}
                  activeOpacity={0.8}
                  hitSlop={touch.hitSlop}
                >
                  <Text style={[s.sevLabel, { color: fg }]}>{label}</Text>
                  <Text style={[s.sevSub, { color: fg, opacity: 0.85 }]}>{sub}</Text>
                  {isSelected && (
                    <View style={[s.sevCheck, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
                      <Text style={[s.sevCheckText, { color: c.textInverse }]}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionLabel, { color: c.textDisabled }]}>Zone (optional)</Text>
          {zonesLoading ? (
            <ActivityIndicator color={brand.primary_colour} style={s.zonesLoading} />
          ) : (
            <View style={s.zoneGrid}>
              <TouchableOpacity
                style={[
                  s.zoneChip,
                  { borderColor: c.border, backgroundColor: c.background },
                  !selectedZone && {
                    backgroundColor: brand.primary_colour,
                    borderColor: brand.primary_colour,
                  },
                ]}
                onPress={() => setSelectedZone(null)}
                hitSlop={touch.hitSlop}
              >
                <Text
                  style={[
                    s.zoneChipText,
                    { color: c.textSecondary },
                    !selectedZone && { color: c.textOnPrimary },
                  ]}
                >
                  Unspecified
                </Text>
              </TouchableOpacity>
              {zones.map((zone) => {
                const isSelected = selectedZone?.id === zone.id;
                return (
                  <TouchableOpacity
                    key={zone.id}
                    style={[
                      s.zoneChip,
                      { borderColor: c.border, backgroundColor: c.background },
                      isSelected && {
                        backgroundColor: brand.primary_colour,
                        borderColor: brand.primary_colour,
                      },
                    ]}
                    onPress={() => setSelectedZone(zone)}
                    hitSlop={touch.hitSlop}
                  >
                    <Text
                      style={[
                        s.zoneChipText,
                        { color: c.textSecondary },
                        isSelected && { color: c.textOnPrimary },
                      ]}
                      numberOfLines={1}
                    >
                      {zone.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={[
              s.nextBtn,
              { backgroundColor: brand.primary_colour },
              !selectedSev && s.btnDisabled,
            ]}
            onPress={() => selectedSev && setStep(3)}
            disabled={!selectedSev}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.nextBtnText, { color: c.textOnPrimary }]}>Review & Confirm →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === 3 && typeConfig && selectedSev && (
        <View style={s.confirmBody}>
          <View
            style={[
              s.confirmTypeCard,
              {
                borderColor: resolveTypeColour(c, typeConfig.colourKey),
                backgroundColor: c.background,
              },
              shadow.md,
            ]}
          >
            <Text style={s.confirmIcon}>{typeConfig.icon}</Text>
            <Text
              style={[s.confirmType, { color: resolveTypeColour(c, typeConfig.colourKey) }]}
            >
              {typeConfig.label}
            </Text>
            {selectedZone && (
              <Text style={[s.confirmZone, { color: c.textMuted }]}>{selectedZone.name}</Text>
            )}
          </View>

          <View
            style={[
              s.confirmSevBadge,
              { backgroundColor: severityBackground(c, selectedSev) },
            ]}
          >
            <Text
              style={[
                s.confirmSevText,
                { color: severityForeground(c, selectedSev) },
              ]}
            >
              {SEVERITIES.find((sv) => sv.level === selectedSev)?.label}
            </Text>
          </View>

          <Text style={[s.confirmWarning, { color: c.textMuted }]}>
            All on-duty staff will be alerted immediately.
          </Text>

          <TouchableOpacity
            style={[
              s.declareBtn,
              { backgroundColor: c.severity.SEV1, shadowColor: c.severity.SEV1 },
              submitting && s.btnDisabled,
            ]}
            onPress={handleDeclare}
            disabled={submitting}
            activeOpacity={0.85}
            hitSlop={touch.hitSlop}
          >
            {submitting ? (
              <ActivityIndicator color={c.textInverse} size="small" />
            ) : (
              <Text style={[s.declareBtnText, { color: c.textInverse }]}>DECLARE INCIDENT</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStep(2)}
            style={s.goBackLink}
            hitSlop={touch.hitSlop}
          >
            <Text style={[s.goBackText, { color: c.textDisabled }]}>Go back and change</Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 70 },
  backText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.semibold,
  },
  navTitle: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    width: 70,
    justifyContent: 'flex-end',
  },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepBody: { flex: 1, padding: spacing.lg + 4 },
  stepScroll: { padding: spacing.lg + 4, paddingBottom: spacing['2xl'] + spacing.sm },
  stepTitle: {
    fontSize: fontSize.h6,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.lg + 4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  typeBtn: {
    width: '47%',
    aspectRatio: 1.2,
    borderWidth: borderWidth.medium,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  typeIcon: { fontSize: 32 },
  typeLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  sevList: { gap: spacing.md, marginBottom: spacing.xl },
  sevBtn: {
    borderRadius: radius.lg + 2,
    padding: spacing.lg,
    position: 'relative',
  },
  sevLabel: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  sevSub: { fontSize: fontSize.caption, fontWeight: fontWeight.regular },
  sevCheck: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sevCheckText: { fontSize: 11, fontWeight: fontWeight.bold },
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.sm + 2,
  },
  zonesLoading: { marginVertical: spacing.md },
  zoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl + spacing.xs,
  },
  zoneChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: borderWidth.medium - 0.5,
  },
  zoneChipText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
  },
  nextBtn: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.minTarget,
  },
  btnDisabled: { opacity: 0.4 },
  nextBtnText: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
  },
  confirmBody: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  confirmTypeCard: {
    width: '100%',
    borderWidth: 2.5,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  confirmIcon: { fontSize: 52 },
  confirmType: {
    fontSize: fontSize.h4 + 2,
    fontWeight: fontWeight.heavy,
  },
  confirmZone: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  confirmSevBadge: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: 30,
  },
  confirmSevText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  confirmWarning: {
    fontSize: fontSize.small,
    textAlign: 'center',
    lineHeight: 18,
  },
  declareBtn: {
    width: '100%',
    height: 60,
    borderRadius: radius.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    marginTop: spacing.sm,
    minHeight: touch.minTarget,
  },
  declareBtnText: {
    fontSize: fontSize.h6,
    fontWeight: fontWeight.heavy,
    letterSpacing: letterSpacing.wider,
  },
  goBackLink: { paddingVertical: spacing.md },
  goBackText: { fontSize: fontSize.body },
});
