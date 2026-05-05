import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { sendFirebaseOtp, type OtpConfirmation } from '../services/auth';
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
  touch,
} from '../theme';

interface Props {
  onOtpSent: (phone: string, confirmation: OtpConfirmation) => void;
}

export function PhoneScreen({ onOtpSent }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const c = useColours();
  const brand = useBrand();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (): Promise<void> => {
    const trimmed = phone.trim();
    if (!trimmed.match(/^\+\d{10,15}$/)) {
      setError('Enter a valid phone number in +91XXXXXXXXXX format');
      return;
    }
    setError(null);
    setLoading(true);
    const { confirmation, error: err } = await sendFirebaseOtp(trimmed);
    setLoading(false);
    if (err || !confirmation) {
      setError(err ?? 'Failed to send OTP');
      return;
    }
    onOtpSent(trimmed, confirmation);
  };

  return (
    <Screen background={c.surface}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <View style={s.brand}>
            <View style={[s.badge, { backgroundColor: brand.primary_colour }]}>
              <Text style={[s.badgeText, { color: c.textOnPrimary }]}>SC</Text>
            </View>
            <Text style={[s.title, { color: c.textPrimary }]}>{t('auth.title')}</Text>
            <Text style={[s.subtitle, { color: c.textMuted }]}>{t('auth.subtitle')}</Text>
          </View>

          <View>
            <Text style={[s.label, { color: c.textSecondary }]}>{t('auth.phone_label')}</Text>
            <TextInput
              style={[
                s.input,
                {
                  borderColor: c.borderStrong,
                  backgroundColor: c.background,
                  color: c.textPrimary,
                },
              ]}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.phone_placeholder') ?? ''}
              placeholderTextColor={c.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
            />
            {error !== null && <Text style={[s.error, { color: c.severity.SEV1 }]}>{error}</Text>}
            <TouchableOpacity
              style={[
                s.btn,
                { backgroundColor: brand.primary_colour },
                loading && s.btnDisabled,
              ]}
              onPress={handleSend}
              disabled={loading}
              hitSlop={touch.hitSlop}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={[s.btnText, { color: c.textOnPrimary }]}>{t('auth.send_otp')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  brand: { alignItems: 'center', marginBottom: spacing['3xl'] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  badgeText: {
    fontSize: fontSize.h4,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wider,
  },
  title: {
    fontSize: fontSize.h3,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  subtitle: { fontSize: fontSize.body },
  label: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    height: 52,
    borderWidth: borderWidth.medium - 0.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.bodyLarge,
    marginBottom: spacing.lg,
  },
  error: {
    fontSize: fontSize.small,
    marginBottom: spacing.md,
  },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.minTarget,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
  },
});
