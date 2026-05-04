import * as SQLite from 'expo-sqlite';
import { apiFetch } from '../config/api';
import { getStoredSession } from './auth';

const db = SQLite.openDatabaseSync('safecommand.db');

export function initDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS task_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_completions (
      local_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface TaskTemplate {
  title: string;
  description: string | null;
  evidence_type: 'NONE' | 'TEXT' | 'NUMERIC' | 'PHOTO' | 'CHECKLIST';
  frequency: string;
  assigned_role: string;
}

export interface TaskCompletion {
  id: string;
  evidence_type: string;
  evidence_url: string | null;
  evidence_text: string | null;
  evidence_numeric: number | null;
  completed_at: string;
}

export interface TaskItem {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'MISSED' | 'ESCALATED' | 'LATE_COMPLETE';
  due_at: string;
  window_expires_at: string;
  schedule_templates: TaskTemplate;
  task_completions: TaskCompletion | null;
}

export async function fetchMyTasks(date?: string): Promise<{ tasks: TaskItem[]; fromCache: boolean }> {
  const session = await getStoredSession();
  if (!session) return { tasks: [], fromCache: false };

  const dateStr = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `tasks_${dateStr}_${session.staff.id}`;

  const { data, error } = await apiFetch<TaskItem[]>(`/tasks/my?date=${dateStr}`, {
    token: session.access_token,
  });

  if (!error && data) {
    db.runSync(
      'INSERT OR REPLACE INTO task_cache (key, data, cached_at) VALUES (?, ?, ?)',
      [cacheKey, JSON.stringify(data), Date.now()],
    );
    return { tasks: data, fromCache: false };
  }

  const cached = db.getFirstSync<{ data: string; cached_at: number }>(
    'SELECT data, cached_at FROM task_cache WHERE key = ?',
    [cacheKey],
  );

  if (cached && Date.now() - cached.cached_at < CACHE_TTL_MS) {
    return { tasks: JSON.parse(cached.data) as TaskItem[], fromCache: true };
  }

  return { tasks: [], fromCache: false };
}

export interface CompletePayload {
  evidence_type: 'NONE' | 'TEXT' | 'NUMERIC' | 'PHOTO' | 'CHECKLIST';
  evidence_text?: string;
  evidence_numeric?: number;
  evidence_url?: string;
  evidence_checklist?: { item: string; checked: boolean }[];
}

export async function completeTask(
  taskId: string,
  payload: CompletePayload,
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const session = await getStoredSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const { error } = await apiFetch(`/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    token: session.access_token,
  });

  if (error) {
    // Queue for offline sync
    db.runSync(
      'INSERT OR IGNORE INTO pending_completions (local_id, task_id, payload, created_at) VALUES (?, ?, ?, ?)',
      [`${taskId}_${Date.now()}`, taskId, JSON.stringify(payload), Date.now()],
    );
    return { success: false, queued: true, error };
  }

  return { success: true };
}

export async function syncPending(): Promise<number> {
  const session = await getStoredSession();
  if (!session) return 0;

  const rows = db.getAllSync<{ local_id: string; task_id: string; payload: string }>(
    'SELECT local_id, task_id, payload FROM pending_completions ORDER BY created_at ASC',
  );

  let synced = 0;
  for (const row of rows) {
    const { error } = await apiFetch(`/tasks/${row.task_id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: row.payload,
      token: session.access_token,
    });
    if (!error) {
      db.runSync('DELETE FROM pending_completions WHERE local_id = ?', [row.local_id]);
      synced++;
    }
  }
  return synced;
}

export async function getPresignedUploadUrl(
  taskId: string,
  contentType: string = 'image/jpeg',
): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string } | null> {
  const session = await getStoredSession();
  if (!session) return null;

  const { data, error } = await apiFetch<{ upload_url: string; file_key: string; public_url: string }>(
    `/upload/presign?purpose=task_evidence&ref_id=${taskId}&content_type=${encodeURIComponent(contentType)}`,
    { token: session.access_token },
  );

  if (error || !data) return null;
  return { uploadUrl: data.upload_url, fileKey: data.file_key, publicUrl: data.public_url };
}

export async function uploadToS3(uploadUrl: string, uri: string, contentType: string): Promise<boolean> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const result = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    });
    return result.ok;
  } catch {
    return false;
  }
}
