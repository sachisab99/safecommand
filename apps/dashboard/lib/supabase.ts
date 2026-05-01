import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !anon) throw new Error('Supabase env vars missing');
  _client = createClient(url, anon);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_t, prop: string | symbol) => {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
