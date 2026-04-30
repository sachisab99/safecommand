import * as SecureStore from 'expo-secure-store';
import { apiFetch } from '../config/api';

const KEY_TOKEN = 'sc_access_token';
const KEY_REFRESH = 'sc_refresh_token';
const KEY_STAFF = 'sc_staff';

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

export async function sendOtp(phone: string): Promise<string | null> {
  const { error } = await apiFetch<{ message: string }>('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
  return error;
}

export async function verifyOtp(
  phone: string,
  otp: string,
): Promise<{ session: AuthSession | null; error: string | null }> {
  const { data, error } = await apiFetch<AuthSession>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp }),
  });
  if (error || !data) {
    return { session: null, error: error ?? 'Verification failed' };
  }
  await SecureStore.setItemAsync(KEY_TOKEN, data.access_token);
  await SecureStore.setItemAsync(KEY_REFRESH, data.refresh_token);
  await SecureStore.setItemAsync(KEY_STAFF, JSON.stringify(data.staff));
  return { session: data, error: null };
}

export async function getStoredSession(): Promise<AuthSession | null> {
  const [accessToken, refreshToken, staffJson] = await Promise.all([
    SecureStore.getItemAsync(KEY_TOKEN),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_STAFF),
  ]);
  if (!accessToken || !staffJson) return null;
  return {
    access_token: accessToken,
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
}
