const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/v1';

interface ApiError {
  error: { code: string; message: string };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<{ data: T | null; error: string | null }> {
  const { token, ...fetchOptions } = options;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers });
    const body = (await res.json()) as T | ApiError;
    if (!res.ok) {
      const err = body as ApiError;
      return { data: null, error: err?.error?.message ?? 'Request failed' };
    }
    return { data: body as T, error: null };
  } catch {
    return { data: null, error: 'Network error — check your connection' };
  }
}
