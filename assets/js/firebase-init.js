// Shared Firebase bootstrap used by both the public site and the admin panel.
import {
  initializeApp, initializeAppCheck, ReCaptchaV3Provider,
  getFirestore, getAuth, getStorage
} from './firebase-sdk.js';
import { firebaseConfig, APP_CHECK_SITE_KEY } from './firebase-config.js';

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('PASTE_');

let app = null, db = null, auth = null, storage = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);

  if (APP_CHECK_SITE_KEY) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (err) {
      console.warn('App Check failed to start', err);
    }
  }

  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
}

export { app, db, auth, storage };
