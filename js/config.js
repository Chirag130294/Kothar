// Firebase console -> Project settings -> General -> Your apps -> Web app -> "SDK setup and configuration".
// These values are NOT secrets (they ship to every browser). Your data is protected by
// firestore.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
