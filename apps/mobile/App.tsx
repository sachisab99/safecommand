import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { getStoredSession, clearSession } from './src/services/auth';
import { initDb, syncPending } from './src/services/tasks';
import type { AuthSession } from './src/services/auth';

type Screen = 'loading' | 'phone' | 'otp' | 'tasks';

initDb(); // initialise SQLite tables at module load

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [phone, setPhone] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    getStoredSession().then((s) => {
      setSession(s);
      setScreen(s ? 'tasks' : 'phone');
      if (s) syncPending(); // flush any offline-queued completions on resume
    });
  }, []);

  const handleOtpSent = (p: string) => {
    setPhone(p);
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
      {screen === 'otp' && (
        <OtpScreen
          phone={phone}
          onVerified={handleVerified}
          onBack={() => setScreen('phone')}
        />
      )}
      {screen === 'tasks' && session && (
        <TasksScreen staff={session.staff} onLogout={handleLogout} />
      )}
    </>
  );
}

const s = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});
