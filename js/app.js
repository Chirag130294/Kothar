/**
 * app.js: boot, sign-in routing and the shell (header, tabs). Plain DOM, no framework.
 *
 * Two modes, same screens:
 *   demo      Firebase not configured (or ?demo): data lives on this phone only.
 *   firebase  admin signs in with Google; family phones join by invite link and wait for approval.
 *
 *   firebase routing:
 *     not signed in + invite link   -> anonymous sign-in -> Join -> Waiting room
 *     not signed in                 -> Login (admin)
 *     signed in, no household       -> Create household (Google) / "open your invite link" (anonymous)
 *     signed in, household          -> watch my member doc: pending = Waiting room, approved = the app
 */
import { ctx, loadSettings, toBuyCount } from './ctx.js';
import { h, $, icon, sheet, toast, guarded } from './ui/dom.js';
import { firebaseConfig } from './config.js';
import { createLocalStore } from './store-local.js';
import { pantryView } from './ui/pantry.js';
import { shoppingView } from './ui/shop.js';
import { familyView } from './ui/family.js';
import { settingsView } from './ui/settings.js';
import { openForm } from './ui/form.js';
import { openScan } from './ui/scan.js';
import { total } from './stock.js';

const $app = $('#app');
const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

/* ───────────────────────────── shell ───────────────────────────── */

let shellUp = false;
let searchEl = null;

function mountShell() {
  searchEl = h('input', { type: 'search', placeholder: 'Search · દાળ, rice, haldi', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search pantry',
    oninput: (e) => { ctx.query = e.target.value; if (ctx.tab !== 'pantry') ctx.tab = 'pantry'; ctx.render(); } });
  searchEl.value = ctx.query;
  $app.replaceChildren(
    h('header', { class: 'top', id: 'top' }),
    h('div', { class: 'offline-bar' }, 'Offline. Changes will sync when you reconnect.'),
    h('main', { id: 'view' }),
    h('nav', { class: 'tabs', id: 'tabs', 'aria-label': 'Sections' }));
  shellUp = true;
}

function renderHeader() {
  const top = $('#top');
  const inStock = ctx.items.filter((i) => total(i) > 0).length;
  const onPantry = ctx.tab === 'pantry';
  const titles = { pantry: null, shopping: 'Shopping', family: 'Family', settings: 'Settings' };
  const title = onPantry
    ? h('div', { class: 'title' }, 'Kothar', h('span', { class: 'gu' }, 'કોઠાર'))
    : h('div', { class: 'title' }, titles[ctx.tab]);
  const APP_V = 'v2.6';
  const warn = ctx.syncError ? `  ⚠ ${ctx.syncError}` : '';
  const sub = onPantry ? `${ctx.mode === 'demo' ? 'Demo, this phone only' : (ctx.household?.name || 'My pantry')} · ${ctx.items.length} item${ctx.items.length === 1 ? '' : 's'}${ctx.items.length ? `, ${inStock} in stock` : ''}${warn} · ${APP_V}` : (ctx.household?.name || '');
  top.replaceChildren(
    h('div', { class: 'titlerow' }, h('div', {}, title, h('div', { class: 'sub' }, sub)),
      onPantry ? h('button', { class: 'iconbtn tint', 'aria-label': 'Add item', onclick: () => openForm() }, icon('plus', 20)) : null),
    onPantry ? h('div', { class: 'searchrow' },
      h('div', { class: 'search' }, icon('search', 18), searchEl),
      h('button', { class: 'iconbtn', 'aria-label': 'Scan a barcode', onclick: openScan }, icon('scan', 20))) : null);
}

function renderTabs() {
  const pending = ctx.members.filter((m) => m.status === 'pending').length;
  const tab = (id, ic, label, count) => h('button', { class: 'tab', 'aria-current': ctx.tab === id ? 'page' : null,
    onclick: () => { ctx.tab = id; ctx.render(); window.scrollTo(0, 0); } },
  icon(ic, 24), label, count ? h('b', { class: 'badge', 'aria-label': `${count} waiting` }, count) : null);
  $('#tabs').replaceChildren(
    tab('pantry', 'pantry', 'Pantry'),
    tab('shopping', 'cart', 'Shopping', toBuyCount()),
    ctx.isAdmin ? tab('family', 'people', 'Family', pending) : null,
    tab('settings', 'gear', 'Settings'));
}

ctx.render = function render() {
  if (!shellUp) return;
  if (ctx.tab === 'family' && !ctx.isAdmin) ctx.tab = 'pantry';
  const y = window.scrollY;
  // Never let one broken screen take the tabs down with it: show the error on screen instead.
  const safe = (fn) => { try { return fn(); } catch (e) {
    console.error(e);
    return h('div', { class: 'card stack', style: 'margin:16px var(--gut)' }, h('b', {}, 'Something went wrong on this screen'),
      h('div', { class: 'muted small', style: 'word-break:break-word' }, `${e.name}: ${e.message}`),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Reload')); } };
  const view = safe({ pantry: pantryView, shopping: shoppingView, family: familyView, settings: settingsView }[ctx.tab]);
  try { renderHeader(); } catch (e) { console.error(e); }
  $('#view').replaceChildren(view);
  try { renderTabs(); } catch (e) { console.error(e); }
  window.scrollTo(0, y);
  try { sheet.refresh(); } catch (e) { console.error(e); }
};

/* ───────────────────────────── demo mode ───────────────────────────── */

function startDemo() {
  ctx.mode = 'demo';
  ctx.store = createLocalStore();
  ctx.isAdmin = true;
  ctx.household = { name: 'My pantry' };
  mountShell();
  ctx.store.watchItems((items) => { ctx.items = items; ctx.render(); });
  ctx.store.watchBarcodes((b) => { ctx.barcodes = b; });
  ctx.signOut = () => {};
  ctx.render();
}

/* ───────────────────────────── firebase mode ───────────────────────────── */

async function startFirebase() {
  const [{ auth }, { onAuthStateChanged }, H, { createFirebaseStore }] = await Promise.all([
    import('./firebase-init.js'), import('./fb.js'), import('./household.js'), import('./store-firebase.js'),
  ]);
  ctx.mode = 'firebase';
  ctx.invites = H;
  const unsubs = [];
  let membershipUnsub = null, started = false;

  const showScreen = (...nodes) => { shellUp = false; $app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'brand' }, 'કોઠાર · Kothar'), ...nodes)); };

  function stopHousehold() {
    unsubs.splice(0).forEach((u) => u());
    Object.assign(ctx, { items: [], barcodes: {}, members: [], household: null, invite: null, store: null });
    started = false; unsubs.membersOn = false;
  }
  function resetAll() {
    membershipUnsub?.(); membershipUnsub = null;
    stopHousehold();
    Object.assign(ctx, { hid: null, isAdmin: false, tab: 'pantry', query: '' });
  }
  ctx.signOut = () => { resetAll(); H.logout(); };

  const showLogin = () => showScreen(
    h('h1', {}, 'Household pantry'),
    h('p', { class: 'muted' }, 'Track bulk staples (rice, dal, atta, masala) for the whole family and get a shopping list that learns how fast you use things.'),
    h('button', { class: 'btn primary', style: 'min-height:56px', onclick: () => guarded(H.signInAsAdmin) }, 'Sign in with Google (admin)'),
    h('p', { class: 'muted small' }, 'Family member? Open the invite link the admin sent you. No account needed.'));

  const showNeedInvite = () => {
    // iPhones keep Safari and the Home Screen app in separate storage, so a link opened in Safari does not carry over.
    const paste = h('input', { type: 'text', placeholder: 'Paste the invite link here', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    showScreen(h('h1', {}, 'Open your invite link'),
      h('p', { class: 'muted' }, 'This phone has not joined a household yet. Ask the admin to share the invite link from the Family tab, then open it, or paste it below.'),
      paste,
      h('button', { class: 'btn primary', onclick: () => {
        const m = /([A-Za-z0-9_-]{32,64})\s*$/.exec(paste.value.trim());
        if (!m) { toast("That doesn't look like an invite link."); return; }
        showJoin(m[1]);
      } }, 'Continue'),
      h('button', { class: 'btn link', onclick: () => H.logout() }, 'Start over'));
  };

  const showCreateHousehold = () => {
    const name = h('input', { type: 'text', placeholder: 'e.g. Shah Family', maxlength: 60, autocomplete: 'off' });
    showScreen(h('h1', {}, 'Create your household'),
      h('p', { class: 'muted' }, `Signed in as ${ctx.user.displayName || ctx.user.email}. You'll be the admin: you approve every family phone.`),
      name,
      h('button', { class: 'btn primary', onclick: (e) => guarded(async () => {
        e.target.disabled = true;
        try { await H.createHousehold(name.value); await route(auth.currentUser); } finally { e.target.disabled = false; }
      }) }, 'Create household'),
      h('button', { class: 'btn link', onclick: () => H.logout() }, 'Sign out'));
  };

  async function showJoin(token) {
    showScreen(h('p', { class: 'muted' }, 'Checking your invite…'));
    try {
      const { householdName } = await H.lookupInvite(token);
      const device = h('input', { type: 'text', maxlength: 40, placeholder: "e.g. Mummy's phone", autocomplete: 'off' });
      showScreen(h('h1', {}, `Join ${householdName}`),
        h('p', { class: 'muted' }, 'Tell the admin whose phone this is. They will tap Approve, and the pantry will appear here.'),
        device,
        h('button', { class: 'btn primary', onclick: (e) => guarded(async () => {
          e.target.disabled = true;
          try { await H.requestToJoin(token, device.value); await route(auth.currentUser); } finally { e.target.disabled = false; }
        }) }, 'Ask to join'));
    } catch (e) {
      showScreen(h('h1', {}, "Can't use this link"), h('p', { class: 'muted' }, e.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again'));
    }
  }

  const showWaiting = (name) => showScreen(
    h('div', { class: 'pulse', 'aria-hidden': 'true' }, '⏳'), h('h1', {}, 'Waiting for approval'),
    h('p', { class: 'muted' }, `${name ? name + ': ' : ''}the admin needs to open the Family tab and tap Approve. This page updates by itself; you can leave it open.`));

  const showRemoved = () => showScreen(h('h1', {}, 'Access removed'),
    h('p', { class: 'muted' }, 'The admin removed this phone from the household. Ask them for a fresh invite if that was a mistake.'));

  async function route(user) {
    ctx.user = user;
    const token = H.readJoinTokenFromHash();
    let pointer = null;
    try { pointer = await H.getUserPointer(user.uid); } catch (e) { console.warn('pointer lookup failed', e); }
    if (pointer?.householdId) return watchMembership(user, pointer.householdId, pointer.householdName);
    if (!user.isAnonymous) return showCreateHousehold();
    if (token) return showJoin(token);
    return showNeedInvite();
  }

  function watchMembership(user, hid, householdName) {
    membershipUnsub?.();
    ctx.hid = hid;
    membershipUnsub = H.watchMyMembership(hid, user.uid, (status) => {
      if (status === 'approved') { if (!started) startHousehold(user, hid); }
      else if (status === 'pending') { stopHousehold(); showWaiting(householdName); }
      else if (status === 'removed' || status === 'missing') { stopHousehold(); showRemoved(); }
      // 'error' (offline with nothing cached): keep whatever is on screen.
    });
  }

  function startHousehold(user, hid) {
    started = true;
    if (H.readJoinTokenFromHash()) history.replaceState(null, '', location.pathname + location.search);
    ctx.store = createFirebaseStore(hid);
    mountShell();
    unsubs.push(
      H.watchHousehold(hid, (hh) => {
        ctx.household = hh;
        ctx.isAdmin = hh.adminUid === user.uid;
        if (ctx.isAdmin && !unsubs.membersOn) { unsubs.membersOn = true; unsubs.push(H.watchMembers(hid, (list) => { ctx.members = list; ctx.render(); })); }
        syncInvite(hh);
        ctx.render();
      }),
      ctx.store.watchItems((items) => { ctx.items = items; ctx.render(); }),
      ctx.store.watchBarcodes((b) => { ctx.barcodes = b; }));
  }

  function syncInvite(hh) {
    const token = hh.activeInviteToken || null;
    if (!ctx.isAdmin || token === ctx.invite?.token) return;
    ctx.invite = token ? { token, link: H.buildInviteLink(token), expiresAt: null, active: true } : null;
    if (token) {
      H.getInviteInfo(token).then((info) => {
        if (ctx.invite?.token !== token || !info) return;
        ctx.invite.expiresAt = tsMs(info.expiresAt); ctx.invite.active = info.active; ctx.render();
      }).catch(() => {});
    }
  }

  window.addEventListener('hashchange', () => { if (!auth.currentUser) onAuthChange(null); });

  async function onAuthChange(user) {
    resetAll();
    unsubs.membersOn = false;
    ctx.user = user;
    if (!user) {
      // First visit via an invite link: give this phone an anonymous id, which re-triggers this handler.
      if (H.readJoinTokenFromHash()) { await guarded(H.ensureDeviceIdentity); return; }
      return showLogin();
    }
    await route(user);
  }

  showScreen(h('p', { class: 'muted' }, 'Loading…'));
  onAuthStateChanged(auth, onAuthChange);
}

/* ───────────────────────────── boot ───────────────────────────── */

const setOffline = () => document.body.classList.toggle('offline', !navigator.onLine);
window.addEventListener('online', setOffline); window.addEventListener('offline', setOffline); setOffline();

window.addEventListener('kothar-store-error', (e) => {
  const { code, what } = e.detail || {};
  ctx.syncError = `${what}: ${code || 'error'}`; ctx.render();
  toast(code === 'permission-denied'
    ? `Not allowed to ${what}. Publish the latest firestore.rules in Firebase, and check this phone is approved.`
    : `Could not ${what}${code ? ' (' + code + ')' : ''}. It will retry when you are online.`);
});
loadSettings();
sheet.init();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));

const configured = !String(firebaseConfig.apiKey || '').startsWith('YOUR_');
const wantDemo = new URLSearchParams(location.search).has('demo');
if (!configured || wantDemo) startDemo(); else startFirebase().catch((e) => { console.error(e); $app.replaceChildren(h('div', { class: 'screen' }, h('h1', {}, 'Could not start'), h('p', { class: 'muted' }, e.message))); });
