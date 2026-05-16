/**
 * CaptureEvidence — reusable "take/choose a photo, upload to S3, hand back
 * the public URL" button. Phase 5.21 Day 7 (Rec 2).
 *
 * Mirrors the camera/library + presign + uploadToS3 pattern already in
 * TaskDetailScreen (BR-07 task evidence) so behaviour is consistent across
 * the app. Used by:
 *   - SireSection photo wall ("Add photo" — any staff, any incident)
 *   - SireSection zone-state sheet (replaces the demo URL-paste box)
 *
 * The component is presentation-agnostic about what happens with the URL:
 * the caller's onUploaded(publicUrl) decides (post to wall vs set as zone
 * evidence). Upload uses purpose=incident_evidence (mig 018).
 */

import React, { useState, useCallback } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadIncidentPhoto } from '../services/sire';
import { useColours, spacing, fontSize, fontWeight, radius, type Colours } from '../theme';

export interface CaptureEvidenceProps {
  incidentId: string;
  /** Called with the S3 public URL after a successful upload. */
  onUploaded: (publicUrl: string) => void;
  /** Button label. Default: "📷 Add photo". */
  label?: string;
  disabled?: boolean;
}

export function CaptureEvidence({
  incidentId,
  onUploaded,
  label = '📷 Add photo',
  disabled = false,
}: CaptureEvidenceProps) {
  const c = useColours();
  const styles = makeStyles(c);
  const [busy, setBusy] = useState(false);

  const doUpload = useCallback(
    async (uri: string) => {
      setBusy(true);
      const res = await uploadIncidentPhoto(incidentId, uri, 'image/jpeg');
      setBusy(false);
      if (res.ok && res.publicUrl) {
        onUploaded(res.publicUrl);
      } else {
        Alert.alert('Upload failed', res.error ?? 'Could not upload the photo. Try again.');
      }
    },
    [incidentId, onUploaded],
  );

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to capture incident evidence.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets[0]) {
      await doUpload(result.assets[0].uri);
    }
  }, [doUpload]);

  const pickFromLibrary = useCallback(async () => {
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
      await doUpload(result.assets[0].uri);
    }
  }, [doUpload]);

  const onPress = useCallback(() => {
    Alert.alert('Add photo', 'Capture incident evidence', [
      { text: 'Take photo', onPress: pickFromCamera },
      { text: 'Choose from library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromLibrary]);

  return (
    <TouchableOpacity
      style={[styles.btn, (busy || disabled) && styles.btnDisabled]}
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.7}
    >
      {busy ? (
        <ActivityIndicator color={c.primary} size="small" />
      ) : (
        <Text style={styles.btnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(c: Colours) {
  return StyleSheet.create({
    btn: {
      backgroundColor: c.surfaceMuted,
      borderColor: c.primary,
      borderWidth: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: c.primary, fontWeight: fontWeight.bold, fontSize: fontSize.body },
  });
}
