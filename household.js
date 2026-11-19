/**
 * household.js — Admin Invite & Approve flow.
 *
 *  ADMIN (Google Sign-In)                       FAMILY DEVICE (Anonymous Auth)
 *  ─────────────────────                        ──────────────────────────────
 *  signInAsAdmin()
 *  createHousehold(name)  ──► households/{hid}, members/{adminUid}, invites/{token}
 *  shareInvite(link)      ───────── link ─────► readJoinTokenFromHash()
 *                                               lookupInvite(token)        (anonymous sign-in)
 *                                               requestToJoin(token, "Mummy's phone")
 *                                                 └► members/{myUid}.status = 'pending'  (Waiting Room)
 *  watchMembers()  ◄── pending device appears ──
 *  approveMember() ──► status = 'approved' ───► watchMyMembership() fires -> app unlocks + syncs
 *  removeMember()  ──► status = 'removed'  ───► device is locked out immediately
 *
 * The rules in firestore.rules are what actually enforce this; the code below is just
 * the client side of the same contract.
 */
import { auth, db } from './firebase-init.js';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInAnonymously, signOut,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, Timestamp,
} from './fb.js';

export const INVITE_TTL_DAYS = 7;

const householdRef = (hid) => doc(db, 'households', hid);
const memberRef = (hid, uid) => doc(db, 'households', hid, 'members', uid);
const inviteRef = (token) => doc(db, 'invites', token);
const userRef = (uid) => doc(db, 'users', uid);

export class JoinError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ───────────────────────────── invite links ───────────────────────────── */

/** 192 bits of randomness, URL-safe (32 chars) — matches the regex in firestore.rules. */
export function newInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Hash routing (#/join/…) because GitHub Pages cannot rewrite URLs. */
export function buildInviteLink(token) {
  return `${location.href.split('#')[0]}#/join/${token}`;
}

export function readJoinTokenFromHash(hash = location.hash) {
  const m = /^#\/join\/([A-Za-z0-9_-]{32,64})$/.exec(hash);
  return m ? m[1] : null;
}

export async function shareInvite(link, householdName) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Join our pantry',
        text: `Join the ${householdName} pantry list. Open this link and wait for approval:`,
        url: link,
      });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(link);
  return 'copied';
}

/* ───────────────────────────────── ADMIN ───────────────────────────────── */

export async function signInAsAdmin() {
  const provider = new GoogleAuthProvider();
  try {
    return (await signInWithPopup(auth, provider)).user;
  } catch (e) {
    // Some in-app browsers block popups; fall back to a full-page redirect.
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
}

export const logout = () => signOut(auth);

/** Creates the household, the admin's own member doc and the first invite link. */
export async function createHousehold(name) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in with Google first — only the admin creates a household.');
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error('Give your household a name.');

  const hid = doc(collection(db, 'households')).id;
  const batch = writeBatch(db); // atomic: rules check the admin doc with getAfter()
  batch.set(householdRef(hid), { name: cleanName, adminUid: user.uid, createdAt: serverTimestamp() });
  batch.set(memberRef(hid, user.uid), {
    role: 'admin', status: 'approved', deviceName: user.displayName || 'Admin',
    requestedAt: serverTimestamp(), approvedAt: serverTimestamp(),
  });
  batch.set(userRef(user.uid), {
    householdId: hid, householdName: cleanName, displayName: user.displayName || null,
    email: user.email || null, isAnonymous: false, createdAt: serverTimestamp(),
  });
  await batch.commit();

  await rotateInvite(hid, cleanName);
  return hid;
}

/** Issue a fresh invite link and switch the previous one off. */
export async function rotateInvite(hid, householdName) {
  const user = auth.currentUser;
  const current = await getDoc(householdRef(hid));
  const oldToken = current.data()?.activeInviteToken ?? null;

  const token = newInviteToken();
  const batch = writeBatch(db);
  batch.set(inviteRef(token), {
    householdId: hid, householdName, createdBy: user.uid, active: true,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  });
  batch.update(householdRef(hid), { activeInviteToken: token });
  if (oldToken) batch.update(inviteRef(oldToken), { active: false });
  await batch.commit();
  return { token, link: buildInviteLink(token) };
}

export async function revokeInvite(hid, token) {
  const batch = writeBatch(db);
  batch.update(inviteRef(token), { active: false });
  batch.update(householdRef(hid), { activeInviteToken: null });
  await batch.commit();
}

export async function getInviteInfo(token) {
  const snap = await getDoc(inviteRef(token));
  return snap.exists() ? snap.data() : null;
}

/** Live list for the admin dashboard: pending first, then approved, then removed. */
export function watchMembers(hid, cb) {
  const order = { pending: 0, approved: 1, removed: 2 };
  return onSnapshot(
    collection(db, 'households', hid, 'members'),
    (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
        || (a.deviceName || '').localeCompare(b.deviceName || ''));
      cb(list);
    },
    (err) => console.error('watchMembers', err),
  );
}

export const approveMember = (hid, uid) =>
  updateDoc(memberRef(hid, uid), { status: 'approved', approvedAt: serverTimestamp() });

/** Deny a pending device or revoke an approved one. Keeps a tombstone so the same
 *  device cannot simply re-request with the (still valid) link. */
export const removeMember = (hid, uid) =>
  updateDoc(memberRef(hid, uid), { status: 'removed', removedAt: serverTimestamp() });

/** Delete the tombstone so that device may ask to join again. */
export const forgetMember = (hid, uid) => deleteDoc(memberRef(hid, uid));

/* ──────────────────────────── FAMILY DEVICE ──────────────────────────── */

/** Every device gets a secure anonymous id — no password, no Google account. */
export async function ensureDeviceIdentity() {
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

/** Validates the link and returns what the Waiting Room needs to show. */
export async function lookupInvite(token) {
  await ensureDeviceIdentity();
  const snap = await getDoc(inviteRef(token));
  if (!snap.exists()) throw new JoinError('invalid', 'This invite link is not valid.');
  const inv = snap.data();
  if (!inv.active) throw new JoinError('revoked', 'This link was replaced. Ask the admin for a new one.');
  if (inv.expiresAt.toMillis() < Date.now()) throw new JoinError('expired', 'This link has expired. Ask the admin for a new one.');
  return { householdId: inv.householdId, householdName: inv.householdName };
}

/** Puts this device in the Waiting Room (members/{uid}.status = 'pending'). */
export async function requestToJoin(token, deviceName) {
  const user = await ensureDeviceIdentity();
  const { householdId, householdName } = await lookupInvite(token);

  const ref = memberRef(householdId, user.uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      role: 'member', status: 'pending',
      deviceName: (deviceName || '').trim().slice(0, 40) || 'Family phone',
      inviteToken: token, requestedAt: serverTimestamp(),
    });
  }
  await setDoc(userRef(user.uid), { householdId, householdName, isAnonymous: user.isAnonymous }, { merge: true });
  return { householdId, householdName, status: existing.exists() ? existing.data().status : 'pending' };
}

/** Which household did this device join? (null if none yet) */
export async function getUserPointer(uid) {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

/** 'pending' | 'approved' | 'removed' | 'missing' — fires the moment the admin acts. */
export function watchMyMembership(hid, uid, cb) {
  return onSnapshot(
    memberRef(hid, uid),
    (snap) => cb(snap.exists() ? snap.data().status : 'missing'),
    (err) => cb('error', err),
  );
}

export function watchHousehold(hid, cb) {
  return onSnapshot(
    householdRef(hid),
    (snap) => snap.exists() && cb({ id: snap.id, ...snap.data() }),
    (err) => console.error('watchHousehold', err),
  );
}
