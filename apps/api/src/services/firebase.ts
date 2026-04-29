import admin from 'firebase-admin';

let _app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (_app) return _app;

  const projectId = process.env['FIREBASE_PROJECT_ID'];
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY'];

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY must be set');
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      // Railway stores the key with literal \n — convert back to real newlines
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  return _app;
}

export function getMessaging(): admin.messaging.Messaging {
  return getFirebaseApp().messaging();
}

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPush(payload: PushPayload): Promise<string> {
  const { token, title, body, data } = payload;
  const messageId = await getMessaging().send({
    token,
    notification: { title, body },
    ...(data !== undefined && { data }),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
  return messageId;
}

export async function sendMulticastPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    ...(data !== undefined && { data }),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}
