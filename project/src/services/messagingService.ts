import { getToken, isSupported, Messaging, onMessage } from 'firebase/messaging';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfigForMessaging, getMessagingInstance } from './firebase';
import { sendFirebaseConfigToWorker } from './pwaService';

type MessageCallback = (payload: {
  title: string;
  body: string;
  url?: string;
}) => void;

class MessagingService {
  private messagingPromise: Promise<Messaging | null> | null = null;

  private async getMessaging() {
    if (!this.messagingPromise) {
      this.messagingPromise = isSupported().then((supported) => (supported ? getMessagingInstance() : null));
    }

    return this.messagingPromise;
  }

  async registerForegroundListener(callback: MessageCallback) {
    const messaging = await this.getMessaging();
    if (!messaging) {
      return () => undefined;
    }

    return onMessage(messaging, (payload) => {
      callback({
        title: payload.notification?.title || 'TeachFlow',
        body: payload.notification?.body || 'You have a new notification.',
        url: payload.data?.url,
      });
    });
  }

  async syncToken(userId: string, registration: ServiceWorkerRegistration | null) {
    if (!registration || typeof window === 'undefined' || !('Notification' in window) || Notification.permission === 'denied') {
      return null;
    }

    const messaging = await this.getMessaging();
    if (!messaging) {
      return null;
    }

    await sendFirebaseConfigToWorker(registration, firebaseConfigForMessaging);

    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();

    if (permission !== 'granted') {
      return null;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('FCM VAPID key is missing. Push notifications will stay disabled.');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return null;
    }

    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token),
    });

    return token;
  }
}

export const messagingService = new MessagingService();
