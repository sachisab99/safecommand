import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { IncidentScreen } from './src/screens/IncidentScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { ZonesScreen } from './src/screens/ZonesScreen';
import { ZoneStatusBoardScreen } from './src/screens/ZoneStatusBoardScreen';
import { MyShiftScreen } from './src/screens/MyShiftScreen';
import { IncidentDetailScreen } from './src/screens/IncidentDetailScreen';
import { EquipmentScreen } from './src/screens/EquipmentScreen';
import { DrillsScreen } from './src/screens/DrillsScreen';
import { MyCertificationsScreen } from './src/screens/MyCertificationsScreen';
import { RosterScreen } from './src/screens/RosterScreen';
import { DrillDetailScreen } from './src/screens/DrillDetailScreen';
import { getStoredSession, clearSession } from './src/services/auth';
import { initDb, syncPending } from './src/services/tasks';
import type { AuthSession, OtpConfirmation } from './src/services/auth';
import { ThemeProvider, Screen, Stack, useColours } from './src/theme';
import { ActivityIndicator } from 'react-native';

type ScreenName =
  | 'loading'
  | 'phone'
  | 'otp'
  | 'tasks'
  | 'incident'
  | 'staff'
  | 'zones'
  | 'zoneStatusBoard'
  | 'myShift'
  | 'incidentDetail'
  | 'equipment'
  | 'drills'
  | 'myCerts'
  | 'roster'
  | 'drillDetail';

initDb(); // initialise SQLite tables at module load

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppRouter />
    </ThemeProvider>
  );
}

function AppRouter(): React.JSX.Element {
  const c = useColours();
  const [screen, setScreen] = useState<ScreenName>('loading');
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState<OtpConfirmation | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [, setLastIncidentId] = useState<string | null>(null);
  // Currently-viewed incident for detail screen — distinct from the
  // "I just declared this" announcement state above
  const [viewIncidentId, setViewIncidentId] = useState<string | null>(null);
  const [viewDrillId, setViewDrillId] = useState<string | null>(null);

  useEffect(() => {
    getStoredSession().then((s) => {
      setSession(s);
      setScreen(s ? 'tasks' : 'phone');
      if (s) syncPending(); // flush any offline-queued completions on resume
    });
  }, []);

  const handleOtpSent = (p: string, conf: OtpConfirmation): void => {
    setPhone(p);
    setConfirmation(conf);
    setScreen('otp');
  };

  const handleVerified = (s: AuthSession): void => {
    setSession(s);
    setScreen('tasks');
  };

  const handleLogout = async (): Promise<void> => {
    await clearSession();
    setSession(null);
    setPhone('');
    setScreen('phone');
  };

  if (screen === 'loading') {
    return (
      <Screen>
        <Stack flex align="center" justify="center">
          <ActivityIndicator size="large" color={c.primary} />
        </Stack>
      </Screen>
    );
  }

  return (
    <>
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
          onManageStaff={() => setScreen('staff')}
          onZoneAccountability={() => setScreen('zones')}
          onZoneStatusBoard={() => setScreen('zoneStatusBoard')}
          onMyShift={() => setScreen('myShift')}
          onIncidentDetail={(id) => {
            setViewIncidentId(id);
            setScreen('incidentDetail');
          }}
          onEquipment={() => setScreen('equipment')}
          onDrills={() => setScreen('drills')}
          onMyCerts={() => setScreen('myCerts')}
          onRoster={() => setScreen('roster')}
          onDrillDetail={(id) => {
            setViewDrillId(id);
            setScreen('drillDetail');
          }}
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
      {screen === 'staff' && <StaffScreen onBack={() => setScreen('tasks')} />}
      {screen === 'zones' && <ZonesScreen onBack={() => setScreen('tasks')} />}
      {screen === 'zoneStatusBoard' && (
        <ZoneStatusBoardScreen onBack={() => setScreen('tasks')} />
      )}
      {screen === 'myShift' && session && (
        <MyShiftScreen
          staffId={session.staff.id}
          staffName={session.staff.name}
          staffRole={session.staff.role}
          onBack={() => setScreen('tasks')}
        />
      )}
      {screen === 'incidentDetail' && viewIncidentId && (
        <IncidentDetailScreen
          incidentId={viewIncidentId}
          onBack={() => setScreen('tasks')}
        />
      )}
      {screen === 'equipment' && session && (
        <EquipmentScreen
          staffRole={session.staff.role}
          onBack={() => setScreen('tasks')}
        />
      )}
      {screen === 'drills' && session && (
        <DrillsScreen
          staffRole={session.staff.role}
          onBack={() => setScreen('tasks')}
          onDrillDetail={(id) => {
            setViewDrillId(id);
            setScreen('drillDetail');
          }}
        />
      )}
      {screen === 'myCerts' && session && (
        <MyCertificationsScreen
          staffName={session.staff.name}
          onBack={() => setScreen('tasks')}
        />
      )}
      {screen === 'roster' && session && (
        <RosterScreen
          staffRole={session.staff.role}
          onBack={() => setScreen('tasks')}
        />
      )}
      {screen === 'drillDetail' && session && viewDrillId && (
        <DrillDetailScreen
          drillId={viewDrillId}
          staffId={session.staff.id}
          staffRole={session.staff.role}
          onBack={() => setScreen('drills')}
        />
      )}
    </>
  );
}
