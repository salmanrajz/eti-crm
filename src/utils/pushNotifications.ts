import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessagingInstance } from '../lib/firebase';
import { getFirebaseConfig } from '../lib/firebaseConfig';
import { VAPID_KEY } from '../lib/firebaseConfig';
import { toast } from 'react-hot-toast';

let currentToken: string | null = null;
let initialized = false;

async function registerFCMServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  const config = getFirebaseConfig();
  const swUrl = '/firebase-messaging-sw.js';

  const reg = await navigator.serviceWorker.register(swUrl);
  await navigator.serviceWorker.ready;

  const waitForActive = () =>
    new Promise<ServiceWorkerRegistration>((resolve) => {
      if (reg.active) return resolve(reg);
      const sw = reg.installing || reg.waiting;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve(reg);
      });
    });

  const activeReg = await waitForActive();
  activeReg.active?.postMessage({ type: 'FIREBASE_CONFIG', config });

  return activeReg;
}

function showNativeNotification(title: string, body: string, url?: string) {
  if (Notification.permission !== 'granted') return;

  try {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        reg.showNotification(title, {
          body,
          icon: '/icon.svg',
          badge: '/tab.svg',
          vibrate: [100, 50, 100],
          tag: 'crm-' + Date.now(),
          data: { url: url || '/dashboard' },
        });
      } else {
        new Notification(title, { body, icon: '/icon.svg' });
      }
    });
  } catch {
    try { new Notification(title, { body, icon: '/icon.svg' }); } catch { /* ignore */ }
  }
}

export async function initializePushNotifications(userId: string): Promise<void> {
  if (initialized) return;

  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (!VAPID_KEY) {
      console.warn('VITE_FIREBASE_VAPID_KEY not set — push notifications disabled');
      return;
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : Notification.permission === 'denied'
        ? 'denied'
        : await Notification.requestPermission();

    if (permission !== 'granted') return;

    const messaging = await getMessagingInstance();
    if (!messaging) return;

    const swRegistration = await registerFCMServiceWorker();
    if (!swRegistration) return;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) return;

    currentToken = token;

    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token),
    });

    onMessage(messaging, (payload) => {
      const title = payload.data?.title || payload.notification?.title || 'CRM Notification';
      const body = payload.data?.body || payload.notification?.body || payload.data?.message || '';
      const url = payload.data?.url || '/dashboard';

      toast(body, { icon: '🔔', duration: 5000 });
      showNativeNotification(title, body, url);
    });

    initialized = true;
  } catch (error) {
    console.warn('Push notification setup failed (non-fatal):', error);
  }
}

export async function removePushToken(userId: string): Promise<void> {
  try {
    if (!currentToken) return;
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayRemove(currentToken),
    });
    currentToken = null;
    initialized = false;
  } catch (error) {
    console.warn('Failed to remove push token (non-fatal):', error);
  }
}
