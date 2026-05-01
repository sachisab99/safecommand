import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';
import { getStoredSession, clearSession } from './src/services/auth';
import { initDb, syncPending } from './src/services/tasks';
import type { AuthSession, OtpConfirmation } from './src/services/auth';

type Screen = 'loading' | 'phone' | 'otp' | 'tasks' | 'incident';

initDb(); // initialise SQLite tables at module load

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<OtpConfirmation | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [lastIncidentId, setLastIncidentId] = useState<string | null>(null);

  useEffect(() => {
    getStoredSession().then((s) => {
      setSession(s);
      setScreen(s ? 'tasks' : 'phone');
      if (s) syncPending(); // flush any offline-queued completions on resume
    });
  }, []);

  const handleOtpSent = (p: string, conf: OtpConfirmation) => {
    setPhone(p);
    setConfirmation(conf);
    setScreen('otp');
  };

  const handleVerified = (s: AuthSession) => {
    setSession(s);
    setScreen('tasks');
  };

  const handleLogout = async () => {
    await clearSession();
    setSession(null);
    setPhone('');
    setScreen('phone');
  };

  if (screen === 'loading') {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {screen === 'phone' && <PhoneScreen onOtpSent={handleOtpSent} />}
      {screen === 'otp' && confirmation && (
        <OtpScreen
          phone={phone}
          confirmation={confirmation}
          onVerified={handleVerified}
          onBack={() => setScreen('phone')}
        />
      )}
      {screen === 'tasks' && session && (
        <TasksScreen
          staff={session.staff}
          onLogout={handleLogout}
          onDeclareIncident={() => setScreen('incident')}
        />
      )}
      {screen === 'incident' && (
        <IncidentScreen
          onBack={() => setScreen('tasks')}
          onDeclared={(id) => {
            setLastIncidentId(id);
            Alert.alert(
              'Incident Declared',
              `All on-duty staff are being alerted.\nRef: ${id.slice(0, 8).toUpperCase()}`,
              [{ text: 'OK', onPress: () => setScreen('tasks') }],
            );
          }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});
