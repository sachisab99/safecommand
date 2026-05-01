import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { getServiceClient } from '@safecommand/db';
import { SendOtpSchema, VerifyOtpSchema, RegisterDeviceTokenSchema } from '@safecommand/schemas';
import { logger } from '../services/logger.js';
import { getFirebaseApp, getMessaging } from '../services/firebase.js';

export const authRouter = Router();

// Parse TEST_PHONE_PAIRS=+91XXXXXXXXXX:123456,+91YYYYYYYYY:654321
function getTestPairs(): Map<string, string> {
  const pairs = new Map<string, string>();
  const raw = process.env['TEST_PHONE_PAIRS'];
  if (!raw) return pairs;
  for (const pair of raw.split(',')) {
    const [phone, otp] = pair.trim().split(':');
    if (phone && otp) pairs.set(phone.trim(), otp.trim());
  }
  return pairs;
}

authRouter.post('/send-otp', validate(SendOtpSchema), async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone: string };

  // Dev bypass: skip Supabase SMS if phone is a configured test number
  if (getTestPairs().has(phone)) {
    logger.info({ phone }, 'TEST_PHONE_PAIRS bypass: OTP send skipped');
    res.status(200).json({ message: 'OTP sent' });
    return;
  }

  try {
    const { error } = await getServiceClient().auth.signInWithOtp({
      phone,
      options: { channel: 'sms' },
    });

    if (error) {
      logger.warn({ phone, error: error.message }, 'OTP send failed');
      res.status(400).json({ error: { code: 'OTP_SEND_FAILED', message: error.message } });
      return;
    }

    res.status(200).json({ message: 'OTP sent' });
  } catch (err) {
    logger.error({ err }, 'send-otp unexpected error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to send OTP' } });
  }
});

authRouter.post('/verify-otp', validate(VerifyOtpSchema), async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body as { phone: string; otp: string };

  // Dev bypass: skip Supabase verification for configured test pairs
  const testPairs = getTestPairs();
  if (testPairs.has(phone)) {
    if (testPairs.get(phone) !== otp) {
      res.status(401).json({ error: { code: 'OTP_INVALID', message: 'Invalid OTP for test number' } });
      return;
    }

    const { data: staff, error: staffError } = await getServiceClient()
      .from('staff')
      .select('id, venue_id, role, is_active, name')
      .eq('phone', phone)
      .eq('is_active', true)
      .maybeSingle();

    if (staffError || !staff) {
      res.status(403).json({ error: { code: 'STAFF_NOT_FOUND', message: 'No active staff account found for this number' } });
      return;
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'JWT_SECRET not configured' } });
      return;
    }

    const access_token = jwt.sign(
      { venue_id: staff.venue_id, staff_id: staff.id, role: staff.role },
      secret,
      { subject: staff.id, expiresIn: '7d' },
    );

    logger.info({ phone, staff_id: staff.id }, 'TEST_PHONE_PAIRS bypass: JWT issued');
    res.status(200).json({
      access_token,
      refresh_token: '',
      staff: { id: staff.id, name: staff.name, role: staff.role, venue_id: staff.venue_id },
    });
    return;
  }

  try {
    const { data, error } = await getServiceClient().auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });

    if (error || !data.user) {
      res.status(401).json({ error: { code: 'OTP_INVALID', message: 'Invalid or expired OTP' } });
      return;
    }

    const { data: staff, error: staffError } = await getServiceClient()
      .from('staff')
      .select('id, venue_id, role, is_active, name')
      .eq('phone', phone)
      .eq('is_active', true)
      .maybeSingle();

    if (staffError || !staff) {
      res.status(403).json({ error: { code: 'STAFF_NOT_FOUND', message: 'No active staff account found for this number' } });
      return;
    }

    await getServiceClient()
      .from('staff')
      .update({ firebase_auth_id: data.user.id, updated_at: new Date().toISOString() })
      .eq('id', staff.id);

    res.status(200).json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      staff: { id: staff.id, name: staff.name, role: staff.role, venue_id: staff.venue_id },
    });
  } catch (err) {
    logger.error({ err }, 'verify-otp unexpected error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Authentication failed' } });
  }
});

// Firebase Auth: mobile sends Firebase ID token → we verify + issue our JWT.
// TEST_PHONE_PAIRS bypass is NOT needed here — Firebase console test numbers handle dev.
authRouter.post('/firebase-token', async (req: Request, res: Response): Promise<void> => {
  const { id_token } = req.body as { id_token?: string };
  if (!id_token) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'id_token is required' } });
    return;
  }

  let phone: string | undefined;
  let uid: string;
  try {
    const decoded = await getFirebaseApp().auth().verifyIdToken(id_token);
    phone = decoded.phone_number;
    uid = decoded.uid;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/id-token-expired') {
      res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Firebase ID token expired — re-authenticate' } });
      return;
    }
    logger.error({ err }, 'Firebase verifyIdToken failed');
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Invalid Firebase ID token' } });
    return;
  }

  if (!phone) {
    res.status(400).json({ error: { code: 'NO_PHONE', message: 'Firebase token missing phone_number claim — enable Phone provider' } });
    return;
  }

  const { data: staff, error: staffError } = await getServiceClient()
    .from('staff')
    .select('id, venue_id, role, is_active, name')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (staffError || !staff) {
    res.status(403).json({ error: { code: 'STAFF_NOT_FOUND', message: 'No active staff account for this phone number' } });
    return;
  }

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'JWT_SECRET not configured' } });
    return;
  }

  // Persist the Firebase UID so we can link identity in future
  await getServiceClient()
    .from('staff')
    .update({ firebase_auth_id: uid, updated_at: new Date().toISOString() })
    .eq('id', staff.id);

  const access_token = jwt.sign(
    { venue_id: staff.venue_id, staff_id: staff.id, role: staff.role },
    secret,
    { subject: staff.id, expiresIn: '7d' },
  );

  logger.info({ phone, staff_id: staff.id, uid }, 'Firebase auth: JWT issued');
  res.status(200).json({
    access_token,
    refresh_token: '',
    staff: { id: staff.id, name: staff.name, role: staff.role, venue_id: staff.venue_id },
  });
});

authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body as { refresh_token: string };
  if (!refresh_token) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'refresh_token is required' } });
    return;
  }

  const { data, error } = await getServiceClient().auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    res.status(401).json({ error: { code: 'REFRESH_FAILED', message: 'Could not refresh session' } });
    return;
  }

  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

authRouter.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  await getServiceClient().auth.signOut();
  res.status(204).send();
});

authRouter.post(
  '/device-token',
  requireAuth,
  validate(RegisterDeviceTokenSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { token, platform } = req.body as { token: string; platform: 'ANDROID' | 'IOS' };

    // Validate the FCM token is real by sending a dry-run message
    try {
      await getMessaging().send({ token, data: { _ping: '1' } }, /* dryRun */ true);
    } catch {
      res.status(400).json({ error: { code: 'INVALID_DEVICE_TOKEN', message: 'FCM device token is invalid or expired' } });
      return;
    }

    const { error } = await getServiceClient()
      .from('staff')
      .update({ fcm_token: token, updated_at: new Date().toISOString() })
      .eq('id', req.auth.staff_id);

    if (error) {
      res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Could not register device token' } });
      return;
    }

    logger.info({ staff_id: req.auth.staff_id, platform }, 'Device token registered');
    res.status(200).json({ message: 'Device token registered' });
  },
);
