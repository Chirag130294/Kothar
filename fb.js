// One place that pins the Firebase SDK version (loaded straight from Google's CDN,
// so the project needs no npm install and no build step on GitHub Pages).
// To upgrade: change 13.3.0 in the three URLs below, and bump VERSION in sw.js.

export { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';

export {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  GoogleAuthProvider, signInAnonymously, signOut,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
