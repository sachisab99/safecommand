import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { completeTask, getPresignedUploadUrl, uploadToS3, type TaskItem, type CompletePayload } from '../services/tasks';

const FREQ_LABEL: Record<string, string> = {
  HOURLY:'Hourly', EVERY_2H:'Every 2h', EVERY_4H:'Every 4h',
  EVERY_6H:'Every 6h', EVERY_8H:'Every 8h', DAILY:'Daily',
  WEEKLY:'Weekly', MONTHLY:'Monthly', QUARTERLY:'Quarterly', ANNUAL:'Annual',
};

interface Props {
  task: TaskItem;
  onBack: () => void;
  onCompleted: () => void;
}

export function TaskDetailScreen({ task, onBack, onCompleted }: Props) {
  const tpl = task.schedule_templates;
  const isAlreadyDone = ['COMPLETE', 'LATE_COMPLETE'].includes(task.status);

  const [textEvidence, setTextEvidence]     = useState('');
  const [numericEvidence, setNumericEvidence] = useState('');
  const [photoUri, setPhotoUri]             = useState<string | null>(null);
  const [checklist, setChecklist]           = useState<{ item: string; checked: boolean }[]>(() =>
    tpl.evidence_type === 'CHECKLIST'
      ? ['Item 1', 'Item 2', 'Item 3'].map(item => ({ item, checked: false }))
      : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleCameraCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to capture evidence.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const toggleChecklistItem = (idx: number) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  };

  const buildPayload = async (): Promise<CompletePayload | null> => {
    switch (tpl.evidence_type) {
      case 'NONE':
        return { evidence_type: 'NONE' };

      case 'TEXT':
        if (!textEvidence.trim()) { setError('Please enter a text note.'); return null; }
        return { evidence_type: 'TEXT', evidence_text: textEvidence.trim() };

      case 'NUMERIC': {
        const n = parseFloat(numericEvidence);
        if (isNaN(n)) { setError('Please enter a valid number.'); return null; }
        return { evidence_type: 'NUMERIC', evidence_numeric: n };
      }

      case 'PHOTO': {
        if (!photoUri) { setError('Please capture or select a photo.'); return null; }
        const presign = await getPresignedUploadUrl(task.id, 'image/jpeg');
        if (!presign) { setError('Could not get upload URL. Check your connection.'); return null; }
        const uploaded = await uploadToS3(presign.uploadUrl, photoUri, 'image/jpeg');
        if (!uploaded) { setError('Photo upload failed. Try again.'); return null; }
        return { evidence_type: 'PHOTO', evidence_url: presign.publicUrl };
      }

      case 'CHECKLIST':
        if (!checklist.some(i => i.checked)) { setError('Please check at least one item.'); return null; }
        return { evidence_type: 'CHECKLIST', evidence_checklist: checklist };

      default:
        return { evidence_type: 'NONE' };
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const payload = await buildPayload();
    if (!payload) { setSubmitting(false); return; }

    const { success, queued } = await completeTask(task.id, payload);
    setSubmitting(false);

    if (success) {
      onCompleted();
    } else if (queued) {
      Alert.alert(
        'Saved offline',
        'No connection detected. Your completion has been saved and will sync when you\'re back online.',
        [{ text: 'OK', onPress: onCompleted }],
      );
    } else {
      setError('Could not submit. Please try again.');
    }
  };

  const dueTime = new Date(task.due_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const expiresTime = new Date(task.window_expires_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Nav bar */}
        <View style={s.nav}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>Task Detail</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Title card */}
          <View style={s.card}>
            <Text style={s.title}>{tpl.title}</Text>
            {tpl.description ? <Text style={s.desc}>{tpl.description}</Text> : null}
            <View style={s.meta}>
              <MetaPill label={FREQ_LABEL[tpl.frequency] ?? tpl.frequency} />
              <MetaPill label={`Due ${dueTime}`} />
              <MetaPill label={`Closes ${expiresTime}`} />
            </View>
          </View>

          {/* Already done */}
          {isAlreadyDone && (
            <View style={s.doneCard}>
              <Text style={s.doneText}>✓ This task has been completed.</Text>
              {task.task_completions[0] && (
                <Text style={s.doneSub}>
                  Completed at {new Date(task.task_completions[0].completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>
          )}

          {/* Evidence form */}
          {!isAlreadyDone && (
            <View style={s.card}>
              <Text style={s.formLabel}>Evidence required: {tpl.evidence_type.toLowerCase()}</Text>

              {tpl.evidence_type === 'TEXT' && (
                <TextInput
                  style={s.textInput}
                  placeholder="Enter your note here…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  value={textEvidence}
                  onChangeText={setTextEvidence}
                  textAlignVertical="top"
                />
              )}

              {tpl.evidence_type === 'NUMERIC' && (
                <TextInput
                  style={[s.textInput, { height: 48 }]}
                  placeholder="Enter numeric value"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={numericEvidence}
                  onChangeText={setNumericEvidence}
                />
              )}

              {tpl.evidence_type === 'PHOTO' && (
                <View style={s.photoSection}>
                  {photoUri ? (
                    <View style={s.photoPreview}>
                      <Text style={s.photoPreviewText}>Photo selected ✓</Text>
                      <TouchableOpacity onPress={() => setPhotoUri(null)}>
                        <Text style={s.photoRemove}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.photoButtons}>
                      <TouchableOpacity style={s.photoBtn} onPress={handleCameraCapture}>
                        <Text style={s.photoBtnText}>📷 Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.photoBtn} onPress={handlePickPhoto}>
                        <Text style={s.photoBtnText}>🖼 Gallery</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {tpl.evidence_type === 'CHECKLIST' && (
                <View style={s.checklist}>
                  {checklist.map((item, idx) => (
                    <TouchableOpacity key={idx} style={s.checkRow} onPress={() => toggleChecklistItem(idx)}>
                      <View style={[s.checkbox, item.checked && s.checkboxChecked]}>
                        {item.checked && <Text style={s.checkmark}>✓</Text>}
                      </View>
                      <Text style={s.checkLabel}>{item.item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.submitBtn, submitting && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitText}>Mark Complete</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#F8FAFC' },
  nav:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn:      { width: 60 },
  backText:     { fontSize: 15, color: '#2563EB', fontWeight: '500' },
  navTitle:     { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  scroll:       { padding: 16, gap: 12, paddingBottom: 40 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  title:        { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  desc:         { fontSize: 14, color: '#475569', marginBottom: 10, lineHeight: 20 },
  meta:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:         { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText:     { fontSize: 12, color: '#2563EB', fontWeight: '500' },
  doneCard:     { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#BBF7D0' },
  doneText:     { fontSize: 15, fontWeight: '600', color: '#15803D' },
  doneSub:      { fontSize: 13, color: '#4ADE80', marginTop: 4 },
  formLabel:    { fontSize: 13, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  textInput:    { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC', minHeight: 100 },
  photoSection: { gap: 10 },
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoBtn:     { flex: 1, height: 48, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  photoBtnText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  photoPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#F0FDF4', borderRadius: 10 },
  photoPreviewText:{ fontSize: 14, color: '#15803D', fontWeight: '600' },
  photoRemove:  { fontSize: 13, color: '#DC2626' },
  checklist:    { gap: 10 },
  checkRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:{ backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  checkmark:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel:   { fontSize: 15, color: '#1E293B', flex: 1 },
  errorText:    { fontSize: 13, color: '#DC2626', marginTop: 10 },
  submitBtn:    { marginTop: 20, height: 52, backgroundColor: '#1E3A5F', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled:{ opacity: 0.6 },
  submitText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
});
