'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  const password = formData.get('password') as string;
  const expected = process.env['OPS_CONSOLE_PASSWORD'];
  const token = process.env['OPS_SESSION_TOKEN'];

  if (!expected || !token || password !== expected) {
    redirect('/login?error=1');
  }

  const cookieStore = await cookies();
  cookieStore.set('ops_auth', token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/venues');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('ops_auth');
  redirect('/login');
}
