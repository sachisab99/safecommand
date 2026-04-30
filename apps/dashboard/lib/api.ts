const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api-production-9f9dd.up.railway.app/v1';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sc_token');
}

export async function apiFetch<T>(
  path: string,
  options?: { method?: string; body?: string; token?: string },
): Promise<{ data: T | null; error: string | null }> {
  const token = options?.token ?? getToken();
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: options?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options?.body,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return { data: null, error: body?.error?.message ?? `HTTP ${res.status}` };
    }
    return { data: await res.json() as T, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}
