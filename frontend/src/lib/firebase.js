import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCwtAVvYG6Q_Qc0LDuPhqSkUofL3xY6slo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'devhub-ebd3c.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'devhub-ebd3c',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'devhub-ebd3c.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '768182480818',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:768182480818:web:c9d15321d6bd00a80e3eab',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-WRPT4N0PKP'
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

// Connect to emulators if enabled in environment
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    console.log('[Firebase] Connected to local Firebase Emulators');
  } catch (e) {
    console.warn('[Firebase] Emulator connection warning:', e.message);
  }
}

export { app, auth, db, storage, functions, analytics };
