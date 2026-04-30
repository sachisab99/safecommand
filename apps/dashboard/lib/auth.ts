export interface DashboardSession {
  token: string;
  staff: {
    id: string;
    name: string;
    role: string;
    venue_id: string;
  };
}

export function getSession(): DashboardSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('sc_session');
  if (!raw) return null;
  try { return JSON.parse(raw) as DashboardSession; } catch { return null; }
}

export function setSession(session: DashboardSession): void {
  localStorage.setItem('sc_session', JSON.stringify(session));
  localStorage.setItem('sc_token', session.token);
  document.cookie = `sc_token=${session.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearSession(): void {
  localStorage.removeItem('sc_session');
  localStorage.removeItem('sc_token');
  document.cookie = 'sc_token=; path=/; max-age=0';
}
