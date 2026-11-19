import {
  initializeApp, getAuth, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from './fb.js';
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);

// Auth state is kept in IndexedDB by default, so an approved family phone stays signed in.
export const auth = getAuth(app);

// Offline-first: reads are served from the on-device cache and writes made without a
// connection are queued and synced automatically when the phone is back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
