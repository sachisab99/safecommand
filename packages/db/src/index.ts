import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _serviceClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    _serviceClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}

export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_ANON_KEY'];
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }
    _anonClient = createClient(url, key);
  }
  return _anonClient;
}

export async function setTenantContext(
  client: SupabaseClient,
  venueId: string,
  staffId: string,
  role: string,
): Promise<void> {
  const { error } = await client.rpc('set_tenant_context', {
    p_venue_id: venueId,
    p_staff_id: staffId,
    p_role: role,
  });
  if (error) throw new Error(`Failed to set tenant context: ${error.message}`);
}

export { SupabaseClient };
