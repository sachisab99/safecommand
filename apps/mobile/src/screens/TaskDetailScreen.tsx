import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  completeTask,
  getPresignedUploadUrl,
  uploadToS3,
  type TaskItem,
  type CompletePayload,
} from '../services/tasks';
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

interface Props {
  task: TaskItem;
  onBack: () => void;
  onCompleted: () => void;
}

export function TaskDetailScreen({ task, onBack, onCompleted }: Props): React.JSX.Element {
  const c = useColours();
  const brand = useBrand();
  const tpl = task.schedule_templates;
  const isAlreadyDone = ['COMPLETE', 'LATE_COMPLETE'].includes(task.status);

  const [textEvidence, setTextEvidence] = useState('');
  const [numericEvidence, setNumericEvidence] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<{ item: string; checked: boolean }[]>(() =>
    tpl.evidence_type === 'CHECKLIST'
      ? ['Item 1', 'Item 2', 'Item 3'].map((item) => ({ item, checked: false }))
      : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickPhoto = async (): Promise<void> => {
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

  const handleCameraCapture = async (): Promise<void> => {
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

  const toggleChecklistItem = (idx: number): void => {
    setChecklist((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, checked: !item.checked } : item)),
    );
  };

  const buildPayload = async (): Promise<CompletePayload | null> => {
    switch (tpl.evidence_type) {
      case 'NONE':
        return { evidence_type: 'NONE' };

      case 'TEXT':
        if (!textEvidence.trim()) {
          setError('Please enter a text note.');
          return null;
        }
        return { evidence_type: 'TEXT', evidence_text: textEvidence.trim() };

      case 'NUMERIC': {
        const n = parseFloat(numericEvidence);
        if (isNaN(n)) {
          setError('Please enter a valid number.');
          return null;
        }
        return { evidence_type: 'NUMERIC', evidence_numeric: n };
      }

      case 'PHOTO': {
        if (!photoUri) {
          setError('Please capture or select a photo.');
          return null;
        }
        const presign = await getPresignedUploadUrl(task.id, 'image/jpeg');
        if (!presign) {
          setError('Could not get upload URL. Check your connection.');
          return null;
        }
        const uploaded = await uploadToS3(presign.uploadUrl, photoUri, 'image/jpeg');
        if (!uploaded) {
          setError('Photo upload failed. Try again.');
          return null;
        }
        return { evidence_type: 'PHOTO', evidence_url: presign.publicUrl };
      }

      case 'CHECKLIST':
        if (!checklist.some((i) => i.checked)) {
          setError('Please check at least one item.');
          return null;
        }
        return { evidence_type: 'CHECKLIST', evidence_checklist: checklist };

      default:
        return { evidence_type: 'NONE' };
    }
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    const payload = await buildPayload();
    if (!payload) {
      setSubmitting(false);
      return;
    }

    const { success, queued } = await completeTask(task.id, payload);
    setSubmitting(false);

    if (success) {
      onCompleted();
    } else if (queued) {
      Alert.alert(
        'Saved offline',
        "No connection detected. Your completion has been saved and will sync when you're back online.",
        [{ text: 'OK', onPress: onCompleted }],
      );
    } else {
      setError('Could not submit. Please try again.');
    }
  };

  const dueTime = new Date(task.due_at).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const expiresTime = new Date(task.window_expires_at).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Screen background={c.surface}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Nav bar */}
        <View
          style={[
            s.nav,
            { backgroundColor: c.background, borderBottomColor: c.divider },
          ]}
        >
          <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={touch.hitSlop}>
            <Text style={[s.backText, { color: c.status.pending }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: c.textPrimary }]}>Task Detail</Text>
          <View style={s.navSpacer} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Title card */}
          <View style={[s.card, { backgroundColor: c.background }]}>
            <Text style={[s.title, { color: c.textPrimary }]}>{tpl.title}</Text>
            {tpl.description !== undefined && tpl.description !== null && tpl.description !== '' && (
              <Text style={[s.desc, { color: c.textSecondary }]}>{tpl.description}</Text>
            )}
            <View style={s.meta}>
              <MetaPill label={FREQ_LABEL[tpl.frequency] ?? tpl.frequency} colours={c} />
              <MetaPill label={`Due ${dueTime}`} colours={c} />
              <MetaPill label={`Closes ${expiresTime}`} colours={c} />
            </View>
          </View>

          {/* Already done */}
          {isAlreadyDone && (
            <View
              style={[
                s.doneCard,
                { backgroundColor: c.status.successBg, borderColor: c.status.success },
              ]}
            >
              <Text style={[s.doneText, { color: c.status.success }]}>
                ✓ This task has been completed.
              </Text>
              {task.task_completions && (
                <Text style={[s.doneSub, { color: c.status.success, opacity: 0.85 }]}>
                  Completed at{' '}
                  {new Date(task.task_completions.completed_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              )}
            </View>
          )}

          {/* Evidence form */}
          {!isAlreadyDone && (
            <View style={[s.card, { backgroundColor: c.background }]}>
              <Text style={[s.formLabel, { color: c.textMuted }]}>
                Evidence required: {tpl.evidence_type.toLowerCase()}
              </Text>

              {tpl.evidence_type === 'TEXT' && (
                <TextInput
                  style={[
                    s.textInput,
                    {
                      borderColor: c.border,
                      backgroundColor: c.surface,
                      color: c.textPrimary,
                    },
                  ]}
                  placeholder="Enter your note here…"
                  placeholderTextColor={c.textMuted}
                  multiline
                  numberOfLines={4}
                  value={textEvidence}
                  onChangeText={setTextEvidence}
                  textAlignVertical="top"
                />
              )}

              {tpl.evidence_type === 'NUMERIC' && (
                <TextInput
                  style={[
                    s.textInput,
                    s.numericInput,
                    {
                      borderColor: c.border,
                      backgroundColor: c.surface,
                      color: c.textPrimary,
                    },
                  ]}
                  placeholder="Enter numeric value"
                  placeholderTextColor={c.textMuted}
                  keyboardType="decimal-pad"
                  value={numericEvidence}
                  onChangeText={setNumericEvidence}
                />
              )}

              {tpl.evidence_type === 'PHOTO' && (
                <View style={s.photoSection}>
                  {photoUri !== null ? (
                    <View
                      style={[s.photoPreview, { backgroundColor: c.status.successBg }]}
                    >
                      <Text style={[s.photoPreviewText, { color: c.status.success }]}>
                        Photo selected ✓
                      </Text>
                      <TouchableOpacity onPress={() => setPhotoUri(null)} hitSlop={touch.hitSlop}>
                        <Text style={[s.photoRemove, { color: c.severity.SEV1 }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.photoButtons}>
                      <TouchableOpacity
                        style={[s.photoBtn, { borderColor: c.border }]}
                        onPress={handleCameraCapture}
                        hitSlop={touch.hitSlop}
                      >
                        <Text style={[s.photoBtnText, { color: c.textSecondary }]}>📷 Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.photoBtn, { borderColor: c.border }]}
                        onPress={handlePickPhoto}
                        hitSlop={touch.hitSlop}
                      >
                        <Text style={[s.photoBtnText, { color: c.textSecondary }]}>🖼 Gallery</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {tpl.evidence_type === 'CHECKLIST' && (
                <View style={s.checklist}>
                  {checklist.map((item, idx) => (
                    <TouchableOpacity
                      key={item.item}
                      style={s.checkRow}
                      onPress={() => toggleChecklistItem(idx)}
                      hitSlop={touch.hitSlop}
                    >
                      <View
                        style={[
                          s.checkbox,
                          { borderColor: c.borderStrong },
                          item.checked && {
                            backgroundColor: brand.primary_colour,
                            borderColor: brand.primary_colour,
                          },
                        ]}
                      >
                        {item.checked && (
                          <Text style={[s.checkmark, { color: c.textOnPrimary }]}>✓</Text>
                        )}
                      </View>
                      <Text style={[s.checkLabel, { color: c.textPrimary }]}>{item.item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {error !== null && (
                <Text style={[s.errorText, { color: c.severity.SEV1 }]}>{error}</Text>
              )}

              <TouchableOpacity
                style={[
                  s.submitBtn,
                  { backgroundColor: brand.primary_colour },
                  submitting && s.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting}
                hitSlop={touch.hitSlop}
              >
                {submitting ? (
                  <ActivityIndicator color={c.textOnPrimary} size="small" />
                ) : (
                  <Text style={[s.submitText, { color: c.textOnPrimary }]}>Mark Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface MetaPillProps {
  label: string;
  colours: Colours;
}

function MetaPill({ label, colours }: MetaPillProps): React.JSX.Element {
  return (
    <View style={[s.pill, { backgroundColor: colours.status.pendingBg }]}>
      <Text style={[s.pillText, { color: colours.status.pending }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.medium,
  },
  navTitle: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
  },
  navSpacer: { width: 60 },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'] + spacing.sm,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl - spacing.xs,
    ...shadow.sm,
  },
  title: {
    fontSize: fontSize.h6,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs + 2,
  },
  desc: {
    fontSize: fontSize.body,
    marginBottom: spacing.sm + 2,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm + 2,
  },
  pillText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  doneCard: {
    borderRadius: radius.xl,
    padding: spacing.xl - spacing.xs,
    borderWidth: 1,
  },
  doneText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.semibold,
  },
  doneSub: {
    fontSize: fontSize.small,
    marginTop: spacing.xs,
  },
  formLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.md + 2,
  },
  textInput: {
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.body + 1,
    minHeight: 100,
  },
  numericInput: { height: 48, minHeight: 48 },
  photoSection: { gap: spacing.sm + 2 },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  photoBtn: {
    flex: 1,
    height: 48,
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  photoPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  photoPreviewText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  photoRemove: { fontSize: fontSize.small },
  checklist: { gap: spacing.sm + 2 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm + 2,
    borderWidth: borderWidth.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  checkLabel: {
    fontSize: fontSize.body + 1,
    flex: 1,
  },
  errorText: {
    fontSize: fontSize.small,
    marginTop: spacing.sm + 2,
  },
  submitBtn: {
    marginTop: spacing.lg,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.minTarget,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.bold,
  },
});
