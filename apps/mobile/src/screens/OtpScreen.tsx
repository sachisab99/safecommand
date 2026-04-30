import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { verifyOtp } from '../services/auth';
import type { AuthSession } from '../services/auth';

interface Props {
  phone: string;
  onVerified: (session: AuthSession) => void;
  onBack: () => void;
}

export function OtpScreen({ phone, onVerified, onBack }: Props) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setError(null);
    setLoading(true);
    const { session, error: err } = await verifyOtp(phone, otp);
    setLoading(false);
    if (err || !session) {
      setError(err ?? t('auth.invalid_otp'));
      return;
    }
    onVerified(session);
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <TouchableOpacity style={s.back} onPress={onBack}>
            <Text style={s.backText}>← {t('common.back')}</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={s.title}>{t('auth.otp_label')}</Text>
            <Text style={s.hint}>{t('auth.otp_sent', { phone })}</Text>
          </View>

          <View style={s.form}>
            <TextInput
              ref={inputRef}
              style={s.otpInput}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('auth.otp_placeholder')}
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>{t('auth.verify')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 },
  back: { marginBottom: 32 },
  backText: { fontSize: 15, color: '#2563EB', fontWeight: '500' },
  header: { marginBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  hint: { fontSize: 14, color: '#64748B' },
  form: {},
  otpInput: {
    height: 60,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: '#fff',
    marginBottom: 16,
    letterSpacing: 8,
  },
  error: { fontSize: 13, color: '#DC2626', marginBottom: 12, textAlign: 'center' },
  btn: {
    height: 52,
    backgroundColor: '#1E3A5F',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
