import React, { useState, useRef, useEffect } from 'react';
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
import { verifyFirebaseOtp, type OtpConfirmation, type AuthSession } from '../services/auth';
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
  phone: string;
  confirmation: OtpConfirmation;
  onVerified: (session: AuthSession) => void;
  onBack: () => void;
}

export function OtpScreen({ phone, confirmation, onVerified, onBack }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const c = useColours();
  const brand = useBrand();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleVerify = async (): Promise<void> => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setError(null);
    setLoading(true);
    const { session, error: err } = await verifyFirebaseOtp(confirmation, otp);
    setLoading(false);
    if (err || !session) {
      setError(err ?? t('auth.invalid_otp'));
      return;
    }
    onVerified(session);
  };

  return (
    <Screen background={c.surface}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <TouchableOpacity style={s.back} onPress={onBack} hitSlop={touch.hitSlop}>
            <Text style={[s.backText, { color: c.status.pending }]}>← {t('common.back')}</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={[s.title, { color: c.textPrimary }]}>{t('auth.otp_label')}</Text>
            <Text style={[s.hint, { color: c.textMuted }]}>{t('auth.otp_sent', { phone })}</Text>
          </View>

          <View>
            <TextInput
              ref={inputRef}
              style={[
                s.otpInput,
                {
                  borderColor: c.borderStrong,
                  backgroundColor: c.background,
                  color: c.textPrimary,
                },
              ]}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('auth.otp_placeholder') ?? ''}
              placeholderTextColor={c.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            {error !== null && (
              <Text style={[s.error, { color: c.severity.SEV1 }]}>{error}</Text>
            )}
            <TouchableOpacity
              style={[
                s.btn,
                { backgroundColor: brand.primary_colour },
                loading && s.btnDisabled,
              ]}
              onPress={handleVerify}
              disabled={loading}
              hitSlop={touch.hitSlop}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={[s.btnText, { color: c.textOnPrimary }]}>{t('auth.verify')}</Text>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  back: { marginBottom: spacing['2xl'] },
  backText: {
    fontSize: fontSize.body + 1,
    fontWeight: fontWeight.medium,
  },
  header: { marginBottom: spacing['3xl'] - spacing.sm },
  title: {
    fontSize: fontSize.h4 + 2,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: fontSize.body },
  otpInput: {
    height: 60,
    borderWidth: borderWidth.medium,
    borderRadius: radius.lg,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.lg,
    letterSpacing: letterSpacing.widest * 5,
  },
  error: {
    fontSize: fontSize.small,
    marginBottom: spacing.md,
    textAlign: 'center',
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
