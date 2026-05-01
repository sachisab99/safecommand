import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from '../config/api';

export type OtpConfirmation = FirebaseAuthTypes.ConfirmationResult;

const KEY_TOKEN   = 'sc_access_token';
const KEY_REFRESH = 'sc_refresh_token';
const KEY_STAFF   = 'sc_staff';

export interface StaffProfile {
  id: string;
  name: string;
  role: string;
  venue_id: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  staff: StaffProfile;
}

export async function sendFirebaseOtp(
  phone: string,
): Promise<{ confirmation: OtpConfirmation | null; error: string | null }> {
  try {
    const confirmation = await auth().signInWithPhoneNumber(phone);
    return { confirmation, error: null };
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    const msg =
      code === 'auth/invalid-phone-number' ? 'Invalid phone number format' :
      code === 'auth/too-many-requests'     ? 'Too many attempts — try again later' :
      (err as Error).message;
    return { confirmation: null, error: msg };
  }
}

export async function verifyFirebaseOtp(
  confirmation: OtpConfirmation,
  otp: string,
): Promise<{ session: AuthSession | null; error: string | null }> {
  try {
    const credential = await confirmation.confirm(otp);
    if (!credential?.user) return { session: null, error: 'Verification failed' };

    const idToken = await credential.user.getIdToken();

    const { data, error } = await apiFetch<AuthSession>('/auth/firebase-token', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });

    if (error || !data) return { session: null, error: error ?? 'Login failed' };

    await Promise.all([
      SecureStore.setItemAsync(KEY_TOKEN,   data.access_token),
      SecureStore.setItemAsync(KEY_REFRESH, data.refresh_token ?? ''),
      SecureStore.setItemAsync(KEY_STAFF,   JSON.stringify(data.staff)),
    ]);

    return { session: data, error: null };
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    const msg =
      code === 'auth/invalid-verification-code' ? 'Incorrect OTP — check and try again' :
      code === 'auth/code-expired'               ? 'OTP expired — tap Back and request a new one' :
      (err as Error).message;
    return { session: null, error: msg };
  }
}

export async function getStoredSession(): Promise<AuthSession | null> {
  const [accessToken, refreshToken, staffJson] = await Promise.all([
    SecureStore.getItemAsync(KEY_TOKEN),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_STAFF),
  ]);
  if (!accessToken || !staffJson) return null;
  return {
    access_token:  accessToken,
    refresh_token: refreshToken ?? '',
    staff: JSON.parse(staffJson) as StaffProfile,
  };
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_TOKEN),
    SecureStore.deleteItemAsync(KEY_REFRESH),
    SecureStore.deleteItemAsync(KEY_STAFF),
  ]);
  // Sign out Firebase session too so a re-login triggers a fresh OTP
  await auth().signOut().catch(() => { /* ignore if not signed in */ });
}
