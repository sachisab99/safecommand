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
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { sendFirebaseOtp, type OtpConfirmation } from '../services/auth';

interface Props {
  onOtpSent: (phone: string, confirmation: OtpConfirmation) => void;
}

export function PhoneScreen({ onOtpSent }: Props) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
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
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <View style={s.brand}>
            <View style={s.badge}>
              <Text style={s.badgeText}>SC</Text>
            </View>
            <Text style={s.title}>{t('auth.title')}</Text>
            <Text style={s.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          <View style={s.form}>
            <Text style={s.label}>{t('auth.phone_label')}</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.phone_placeholder')}
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>{t('auth.send_otp')}</Text>
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
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 48 },
  brand: { alignItems: 'center', marginBottom: 48 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  badgeText: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 26, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748B' },
  form: {},
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1E293B',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  error: { fontSize: 13, color: '#DC2626', marginBottom: 12 },
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
