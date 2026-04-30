'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminClient } from '@/lib/supabase';

export async function createVenueAction(formData: FormData) {
  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const city = formData.get('city') as string;
  const subscription_tier = formData.get('subscription_tier') as string;
  const address = (formData.get('address') as string) || null;

  const client = getAdminClient();

  const { data: venueCode, error: codeError } = await client.rpc('generate_venue_code', {
    p_type: type,
    p_city: city,
  });
  if (codeError) throw new Error(`Failed to generate venue code: ${codeError.message}`);

  const { data: venue, error } = await client
    .from('venues')
    .insert({ name, type, city, address, subscription_tier, venue_code: venueCode })
    .select('id')
    .single();

  if (error || !venue) throw new Error(`Failed to create venue: ${error?.message}`);

  redirect(`/venues/${venue.id}`);
}

export async function createFloorAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const name = formData.get('name') as string;
  const floor_number = parseInt(formData.get('floor_number') as string, 10);

  const { error } = await getAdminClient()
    .from('floors')
    .insert({ venue_id, name, floor_number });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function deleteFloorAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const id = formData.get('id') as string;
  await getAdminClient().from('floors').delete().eq('id', id);
  revalidatePath(`/venues/${venue_id}`);
}

export async function createZoneAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const floor_id = formData.get('floor_id') as string;
  const name = formData.get('name') as string;
  const zone_type = formData.get('zone_type') as string;
  const two_person_required = formData.get('two_person_required') === 'on';

  const { error } = await getAdminClient()
    .from('zones')
    .insert({ venue_id, floor_id, name, zone_type, two_person_required });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function deleteZoneAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const id = formData.get('id') as string;
  await getAdminClient().from('zones').delete().eq('id', id);
  revalidatePath(`/venues/${venue_id}`);
}

export async function createTemplateAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const title = formData.get('title') as string;
  const description = (formData.get('description') as string) || null;
  const frequency = formData.get('frequency') as string;
  const assigned_role = formData.get('assigned_role') as string;
  const evidence_type = formData.get('evidence_type') as string;
  const escalation_interval_minutes = parseInt(
    (formData.get('escalation_interval_minutes') as string) || '30',
    10,
  );

  // Build primary escalation chain from individual level selects
  const escalation_chain = [1, 2, 3, 4, 5]
    .map((i) => (formData.get(`escalation_chain_${i}`) as string) || '')
    .filter(Boolean);

  // Build secondary escalation chain
  const secondary_escalation_chain = [1, 2, 3, 4, 5]
    .map((i) => (formData.get(`secondary_chain_${i}`) as string) || '')
    .filter(Boolean);

  // Build start_time (24h HH:MM) from hour + minute + ampm
  let start_time: string | null = null;
  const startHour = formData.get('start_hour') as string;
  const startMinute = formData.get('start_minute') as string;
  const startAmpm = formData.get('start_ampm') as string;
  if (startHour && startMinute && startAmpm) {
    let h = parseInt(startHour, 10);
    if (startAmpm === 'PM' && h !== 12) h += 12;
    if (startAmpm === 'AM' && h === 12) h = 0;
    start_time = `${h.toString().padStart(2, '0')}:${startMinute}`;
  }

  const timezone = (formData.get('start_timezone') as string) || 'Asia/Kolkata';

  const { error } = await getAdminClient()
    .from('schedule_templates')
    .insert({
      venue_id,
      title,
      description,
      frequency,
      assigned_role,
      evidence_type,
      escalation_chain,
      escalation_interval_minutes,
      start_time,
      timezone,
      secondary_escalation_chain,
    });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function deleteTemplateAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const id = formData.get('id') as string;
  await getAdminClient().from('schedule_templates').delete().eq('id', id);
  revalidatePath(`/venues/${venue_id}`);
}

export async function createStaffAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const role = formData.get('role') as string;

  const { error } = await getAdminClient()
    .from('staff')
    .insert({ venue_id, name, phone, role });

  if (error) throw new Error(error.message);
  revalidatePath(`/venues/${venue_id}`);
}

export async function deactivateStaffAction(formData: FormData) {
  const venue_id = formData.get('venue_id') as string;
  const id = formData.get('id') as string;
  await getAdminClient()
    .from('staff')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath(`/venues/${venue_id}`);
}

export async function updateFloorAction(formData: FormData) {
  const id = formData.get('id') as string;
  const venue_id = formData.get('venue_id') as string;
  const name = formData.get('name') as string;
  const floor_number = parseInt(formData.get('floor_number') as string, 10);

  const { error } = await getAdminClient()
    .from('floors')
    .update({ name, floor_number })
    .eq('id', id);

  if (error) throw new Error(error.message);
  redirect(`/venues/${venue_id}?tab=floors`);
}

export async function updateZoneAction(formData: FormData) {
  const id = formData.get('id') as string;
  const venue_id = formData.get('venue_id') as string;
  const name = formData.get('name') as string;
  const zone_type = formData.get('zone_type') as string;
  const two_person_required = formData.get('two_person_required') === 'on';

  const { error } = await getAdminClient()
    .from('zones')
    .update({ name, zone_type, two_person_required, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  redirect(`/venues/${venue_id}?tab=floors`);
}

export async function updateTemplateAction(formData: FormData) {
  const id = formData.get('id') as string;
  const venue_id = formData.get('venue_id') as string;
  const title = formData.get('title') as string;
  const description = (formData.get('description') as string) || null;
  const frequency = formData.get('frequency') as string;
  const assigned_role = formData.get('assigned_role') as string;
  const evidence_type = formData.get('evidence_type') as string;
  const escalation_interval_minutes = parseInt(
    (formData.get('escalation_interval_minutes') as string) || '30',
    10,
  );

  const escalation_chain = [1, 2, 3, 4, 5]
    .map((i) => (formData.get(`escalation_chain_${i}`) as string) || '')
    .filter(Boolean);

  const secondary_escalation_chain = [1, 2, 3, 4, 5]
    .map((i) => (formData.get(`secondary_chain_${i}`) as string) || '')
    .filter(Boolean);

  let start_time: string | null = null;
  const startHour = formData.get('start_hour') as string;
  const startMinute = formData.get('start_minute') as string;
  const startAmpm = formData.get('start_ampm') as string;
  if (startHour && startMinute && startAmpm) {
    let h = parseInt(startHour, 10);
    if (startAmpm === 'PM' && h !== 12) h += 12;
    if (startAmpm === 'AM' && h === 12) h = 0;
    start_time = `${h.toString().padStart(2, '0')}:${startMinute}`;
  }

  const timezone = (formData.get('start_timezone') as string) || 'Asia/Kolkata';

  const { error } = await getAdminClient()
    .from('schedule_templates')
    .update({
      title,
      description,
      frequency,
      assigned_role,
      evidence_type,
      escalation_chain,
      escalation_interval_minutes,
      start_time,
      timezone,
      secondary_escalation_chain,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  redirect(`/venues/${venue_id}?tab=templates`);
}

export async function updateStaffAction(formData: FormData) {
  const id = formData.get('id') as string;
  const venue_id = formData.get('venue_id') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const role = formData.get('role') as string;

  const { error } = await getAdminClient()
    .from('staff')
    .update({ name, phone, role, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  redirect(`/venues/${venue_id}?tab=staff`);
}
