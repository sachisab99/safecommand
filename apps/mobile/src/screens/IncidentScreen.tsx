import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import {
  fetchZones, declareIncident,
  type Zone, type IncidentType, type Severity,
} from '../services/incidents';

interface Props {
  onBack: () => void;
  onDeclared: (incidentId: string) => void;
}

const INCIDENT_TYPES: { type: IncidentType; label: string; icon: string; color: string }[] = [
  { type: 'FIRE',        label: 'Fire',        icon: '🔥', color: '#DC2626' },
  { type: 'MEDICAL',     label: 'Medical',     icon: '🏥', color: '#2563EB' },
  { type: 'SECURITY',    label: 'Security',    icon: '🔒', color: '#EA580C' },
  { type: 'EVACUATION',  label: 'Evacuation',  icon: '🚨', color: '#9333EA' },
  { type: 'STRUCTURAL',  label: 'Structural',  icon: '🏗️', color: '#D97706' },
  { type: 'OTHER',       label: 'Other',       icon: '⚠️', color: '#64748B' },
];

const SEVERITIES: { level: Severity; label: string; sub: string; color: string; bg: string }[] = [
  { level: 'SEV1', label: 'SEV 1 — Critical', sub: 'Life-threatening / active danger', color: '#fff', bg: '#DC2626' },
  { level: 'SEV2', label: 'SEV 2 — Serious',  sub: 'Significant threat, injuries possible', color: '#fff', bg: '#EA580C' },
  { level: 'SEV3', label: 'SEV 3 — Minor',    sub: 'Contained, no immediate threat', color: '#1E293B', bg: '#FEF3C7' },
];

export function IncidentScreen({ onBack, onDeclared }: Props) {
  const [step, setStep]                   = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType]   = useState<IncidentType | null>(null);
  const [selectedSev, setSelectedSev]     = useState<Severity | null>(null);
  const [selectedZone, setSelectedZone]   = useState<Zone | null>(null);
  const [zones, setZones]                 = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading]   = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  useEffect(() => {
    if (step === 2 && zones.length === 0) {
      setZonesLoading(true);
      fetchZones().then(z => { setZones(z); setZonesLoading(false); });
    }
  }, [step]);

  const typeConfig = INCIDENT_TYPES.find(t => t.type === selectedType);

  const handleDeclare = async () => {
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
    <SafeAreaView style={s.safe}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={step === 1 ? onBack : () => setStep((step - 1) as 1 | 2 | 3)} style={s.backBtn}>
          <Text style={s.backText}>← {step === 1 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Declare Incident</Text>
        <View style={s.stepIndicator}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]} />
          ))}
        </View>
      </View>

      {/* ── Step 1: Type selection ── */}
      {step === 1 && (
        <View style={s.stepBody}>
          <Text style={s.stepTitle}>What type of incident?</Text>
          <View style={s.typeGrid}>
            {INCIDENT_TYPES.map(({ type, label, icon, color }) => (
              <TouchableOpacity
                key={type}
                style={[s.typeBtn, { borderColor: color }]}
                onPress={() => { setSelectedType(type); setStep(2); }}
                activeOpacity={0.7}
              >
                <Text style={s.typeIcon}>{icon}</Text>
                <Text style={[s.typeLabel, { color }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Step 2: Severity + zone ── */}
      {step === 2 && (
        <ScrollView contentContainerStyle={s.stepScroll} keyboardShouldPersistTaps="handled">
          <Text style={s.stepTitle}>Severity level?</Text>
          <View style={s.sevList}>
            {SEVERITIES.map(({ level, label, sub, color, bg }) => (
              <TouchableOpacity
                key={level}
                style={[s.sevBtn, { backgroundColor: bg }, selectedSev === level && s.sevBtnSelected]}
                onPress={() => setSelectedSev(level)}
                activeOpacity={0.8}
              >
                <Text style={[s.sevLabel, { color }]}>{label}</Text>
                <Text style={[s.sevSub, { color, opacity: 0.85 }]}>{sub}</Text>
                {selectedSev === level && (
                  <View style={s.sevCheck}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionLabel}>Zone (optional)</Text>
          {zonesLoading ? (
            <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 12 }} />
          ) : (
            <View style={s.zoneGrid}>
              <TouchableOpacity
                style={[s.zoneChip, !selectedZone && s.zoneChipSelected]}
                onPress={() => setSelectedZone(null)}
              >
                <Text style={[s.zoneChipText, !selectedZone && s.zoneChipTextSelected]}>Unspecified</Text>
              </TouchableOpacity>
              {zones.map(zone => (
                <TouchableOpacity
                  key={zone.id}
                  style={[s.zoneChip, selectedZone?.id === zone.id && s.zoneChipSelected]}
                  onPress={() => setSelectedZone(zone)}
                >
                  <Text
                    style={[s.zoneChipText, selectedZone?.id === zone.id && s.zoneChipTextSelected]}
                    numberOfLines={1}
                  >
                    {zone.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[s.nextBtn, !selectedSev && s.nextBtnDisabled]}
            onPress={() => selectedSev && setStep(3)}
            disabled={!selectedSev}
          >
            <Text style={s.nextBtnText}>Review & Confirm →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === 3 && typeConfig && selectedSev && (
        <View style={s.confirmBody}>
          <View style={[s.confirmTypeCard, { borderColor: typeConfig.color }]}>
            <Text style={s.confirmIcon}>{typeConfig.icon}</Text>
            <Text style={[s.confirmType, { color: typeConfig.color }]}>{typeConfig.label}</Text>
            {selectedZone && (
              <Text style={s.confirmZone}>{selectedZone.name}</Text>
            )}
          </View>

          <View style={[s.confirmSevBadge, { backgroundColor: SEVERITIES.find(s => s.level === selectedSev)!.bg }]}>
            <Text style={[s.confirmSevText, { color: SEVERITIES.find(sv => sv.level === selectedSev)!.color }]}>
              {SEVERITIES.find(sv => sv.level === selectedSev)!.label}
            </Text>
          </View>

          <Text style={s.confirmWarning}>
            All on-duty staff will be alerted immediately.
          </Text>

          <TouchableOpacity
            style={[s.declareBtn, submitting && s.declareBtnDisabled]}
            onPress={handleDeclare}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.declareBtnText}>DECLARE INCIDENT</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep(2)} style={s.goBackLink}>
            <Text style={s.goBackText}>Go back and change</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: '#F8FAFC' },
  nav:                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn:            { width: 70 },
  backText:           { fontSize: 15, color: '#DC2626', fontWeight: '600' },
  navTitle:           { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  stepIndicator:      { flexDirection: 'row', gap: 6, width: 70, justifyContent: 'flex-end' },
  stepDot:            { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  stepDotActive:      { backgroundColor: '#DC2626' },

  stepBody:           { flex: 1, padding: 20 },
  stepScroll:         { padding: 20, paddingBottom: 40 },
  stepTitle:          { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 20 },

  typeGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeBtn:            { width: '47%', aspectRatio: 1.2, borderWidth: 2, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  typeIcon:           { fontSize: 32 },
  typeLabel:          { fontSize: 14, fontWeight: '700' },

  sevList:            { gap: 12, marginBottom: 24 },
  sevBtn:             { borderRadius: 14, padding: 16, position: 'relative' },
  sevBtnSelected:     { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  sevLabel:           { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sevSub:             { fontSize: 12, fontWeight: '400' },
  sevCheck:           { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },

  sectionLabel:       { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  zoneGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  zoneChip:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  zoneChipSelected:   { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  zoneChipText:       { fontSize: 13, color: '#475569', fontWeight: '500' },
  zoneChipTextSelected:{ color: '#fff' },

  nextBtn:            { height: 52, backgroundColor: '#1E3A5F', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextBtnDisabled:    { opacity: 0.4 },
  nextBtnText:        { fontSize: 16, fontWeight: '700', color: '#fff' },

  confirmBody:        { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  confirmTypeCard:    { width: '100%', borderWidth: 2.5, borderRadius: 20, padding: 24, alignItems: 'center', backgroundColor: '#fff', gap: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  confirmIcon:        { fontSize: 52 },
  confirmType:        { fontSize: 24, fontWeight: '800' },
  confirmZone:        { fontSize: 14, color: '#64748B', fontWeight: '500' },
  confirmSevBadge:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30 },
  confirmSevText:     { fontSize: 14, fontWeight: '700' },
  confirmWarning:     { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },
  declareBtn:         { width: '100%', height: 60, backgroundColor: '#DC2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#DC2626', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6, marginTop: 8 },
  declareBtnDisabled: { opacity: 0.6 },
  declareBtnText:     { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  goBackLink:         { paddingVertical: 12 },
  goBackText:         { fontSize: 14, color: '#94A3B8' },
});
