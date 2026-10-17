// Firebase is used only for web push tokens (Cloud Messaging). Config values are public.
import { initializeApp, type FirebaseApp } from 'firebase/app';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const VAPID_KEY: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const firebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.messagingSenderId && config.appId && VAPID_KEY,
);

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('Firebase is not configured');
  app ??= initializeApp(config);
  return app;
}
