// =====================================================================
// AURA Construction — Firebase web config
//
// Paste the values from:
//   Firebase Console → Project settings → General → "Your apps" → Web app
//
// These values are NOT secrets — they only identify your project.
// Your data is protected by firestore.rules / storage.rules and by
// App Check, never by hiding this file.
// =====================================================================
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};

// Optional but STRONGLY recommended — blocks bots/scripts from calling your
// Firestore & Storage directly. Create a reCAPTCHA v3 site key, register it
// in Firebase Console → App Check, then paste the SITE key here.
export const APP_CHECK_SITE_KEY = '';

// The WhatsApp number shown on the site (international format, no +).
export const WHATSAPP_NUMBER = '94771234567';
