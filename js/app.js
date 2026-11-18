/**
 * app.js — screens and wiring. Plain DOM, no framework, no innerHTML with user data.
 *
 *   boot -> auth state -> route():
 *     not signed in + invite link   -> anonymous sign-in -> Join screen -> Waiting Room
 *     not signed in                 -> Login (admin)
 *     signed in, no household       -> Create household (Google) / "open your invite link" (anonymous)
 *     signed in, household          -> watch my member doc: pending = Waiting Room, approved = app
 */
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from './fb.js';
import {
  signInAsAdmin, logout, createHousehold, rotateInvite, revokeInvite, shareInvite, buildInviteLink,
  readJoinTokenFromHash, ensureDeviceIdentity, lookupInvite, requestToJoin, getUserPointer, getInviteInfo,
  watchMyMembership, watchHousehold, watchMembers, approveMember, removeMember, forgetMember,
} from './household.js';
import {
  watchItems, addItem, updateItem, deleteItem, seedItems, setStatus, addSuggestionToList, dismissSuggestion,
} from './items.js';
import { buildSuggestions } from './predict.js';
import { CATEGORIES, SEED_ITEMS } from './seed-data.js';

/* ───────────────────────────── tiny helpers ───────────────────────────── */

const $app = document.getElementById('app');

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
const byName = (a, b) => a.name.localeCompare(b.name);
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

let toastTimer;
function toast(message, action) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (action) {
    t.append(h('button', { onclick: () => { t.remove(); action.run(); } }, action.label));
  }
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 8000);
}

async function guarded(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong.'); }
}

/* ─────────────────────────────── app state ─────────────────────────────── */

const S = {
  user: null, hid: null, household: null, isAdmin: false,
  items: [], members: [], invite: null,
  tab: 'pantry', query: '', collapsed: new Set(),
  shell: false, started: false,
  membershipUnsub: null, dataUnsubs: [], membersUnsub: null,
};

function stopHousehold() {
  S.dataUnsubs.forEach((u) => u());
  S.membersUnsub?.();
  Object.assign(S, { dataUnsubs: [], membersUnsub: null, started: false, items: [], members: [], household: null, invite: null });
}

function resetAll() {
  S.membershipUnsub?.();
  S.membershipUnsub = null;
  stopHousehold();
  Object.assign(S, { hid: null, isAdmin: false, tab: 'pantry', query: '' });
}

function showScreen(...nodes) {
  S.shell = false;
  $app.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'brand' }, 'કોઠાર · Kothar'), ...nodes));
}

/* ───────────────────────────── entry screens ───────────────────────────── */

function showLogin() {
  showScreen(
    h('h1', {}, 'Household pantry'),
    h('p', { class: 'muted' }, 'Track bulk staples — rice, dal, atta, masala — and get a shopping list that learns how fast your family uses them.'),
    h('button', { class: 'btn primary big', onclick: () => guarded(signInAsAdmin) }, 'Sign in with Google (Admin)'),
    h('p', { class: 'muted small' }, 'Family member? Just open the invite link the admin sent you — no account needed.'),
  );
}

function showNeedInvite() {
  // iPhones keep Safari and the Home Screen app in separate storage, so a link opened in
  // Safari does not carry over. Pasting it here works from any place.
  const paste = h('input', { type: 'text', placeholder: 'Paste the invite link here', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  showScreen(
    h('h1', {}, 'Open your invite link'),
    h('p', { class: 'muted' }, 'This phone has not joined a household yet. Ask the admin to share the invite link from the Family tab, then open it, or paste it below.'),
    paste,
    h('button', { class: 'btn primary big', onclick: () => {
      const m = /([A-Za-z0-9_-]{32,64})\s*$/.exec(paste.value.trim());
      if (!m) { toast("That doesn't look like an invite link."); return; }
      showJoin(m[1]);
    } }, 'Continue'),
    h('button', { class: 'btn link', onclick: () => logout() }, 'Start over'),
  );
}

function showCreateHousehold() {
  const name = h('input', { type: 'text', placeholder: 'e.g. Patel Family', maxlength: 60, autocomplete: 'off' });
  showScreen(
    h('h1', {}, 'Create your household'),
    h('p', { class: 'muted' }, `Signed in as ${S.user.displayName || S.user.email}. You'll be the admin: you approve every family phone.`),
    name,
    h('button', { class: 'btn primary big', onclick: (e) => guarded(async () => {
      e.target.disabled = true;
      try { await createHousehold(name.value); await route(auth.currentUser); }
      finally { e.target.disabled = false; }
    }) }, 'Create household'),
    h('button', { class: 'btn link', onclick: () => logout() }, 'Sign out'),
  );
}

async function showJoin(token) {
  showScreen(h('p', { class: 'muted' }, 'Checking your invite…'));
  try {
    const { householdName } = await lookupInvite(token);
    const device = h('input', { type: 'text', maxlength: 40, placeholder: "e.g. Mummy's phone", autocomplete: 'off' });
    showScreen(
      h('h1', {}, `Join ${householdName}`),
      h('p', { class: 'muted' }, 'Tell the admin whose phone this is. They will tap Approve, and the pantry will appear here.'),
      device,
      h('button', { class: 'btn primary big', onclick: (e) => guarded(async () => {
        e.target.disabled = true;
        try { await requestToJoin(token, device.value); await route(auth.currentUser); }
        finally { e.target.disabled = false; }
      }) }, 'Ask to join'),
    );
  } catch (e) {
    showScreen(h('h1', {}, "Can't use this link"), h('p', { class: 'muted' }, e.message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again'));
  }
}

function showWaiting(name) {
  showScreen(
    h('div', { class: 'pulse', 'aria-hidden': 'true' }, '⏳'),
    h('h1', {}, 'Waiting for approval'),
    h('p', { class: 'muted' }, `${name ? name + ' — ' : ''}the admin needs to open the Family tab and tap Approve. This page updates by itself; you can leave it open.`),
  );
}

function showRemoved() {
  showScreen(
    h('h1', {}, 'Access removed'),
    h('p', { class: 'muted' }, 'The admin removed this phone from the household. Ask them for a fresh invite if that was a mistake.'),
  );
}

/* ────────────────────────────────── routing ────────────────────────────────── */

async function route(user) {
  S.user = user;
  const token = readJoinTokenFromHash();

  let pointer = null;
  try { pointer = await getUserPointer(user.uid); } catch (e) { console.warn('pointer lookup failed', e); }

  if (pointer?.householdId) return watchMembership(user, pointer.householdId, pointer.householdName);
  if (!user.isAnonymous) return showCreateHousehold();
  if (token) return showJoin(token);
  return showNeedInvite();
}

function watchMembership(user, hid, householdName) {
  S.membershipUnsub?.();
  S.hid = hid;
  S.membershipUnsub = watchMyMembership(hid, user.uid, (status) => {
    if (status === 'approved') {
      if (!S.started) startHousehold(user, hid);
    } else if (status === 'pending') {
      stopHousehold();
      showWaiting(householdName);
    } else if (status === 'removed' || status === 'missing') {
      stopHousehold();
      showRemoved();
    }
    // 'error' (e.g. offline with nothing cached): keep whatever is on screen.
  });
}

/* ───────────────────────────── household shell ───────────────────────────── */

function startHousehold(user, hid) {
  S.started = true;
  if (readJoinTokenFromHash()) history.replaceState(null, '', location.pathname + location.search);
  mountShell();

  S.dataUnsubs.push(
    watchHousehold(hid, (hh) => {
      S.household = hh;
      S.isAdmin = hh.adminUid === user.uid;
      if (S.isAdmin && !S.membersUnsub) S.membersUnsub = watchMembers(hid, (list) => { S.members = list; renderView(); });
      syncInvite(hh);
      renderView();
    }),
    watchItems(hid, (items) => { S.items = items; renderView(); }),
  );
}

function syncInvite(hh) {
  const token = hh.activeInviteToken || null;
  if (!S.isAdmin || token === S.invite?.token) return;
  S.invite = token ? { token, link: buildInviteLink(token), expiresAt: null, active: true } : null;
  if (token) {
    getInviteInfo(token).then((info) => {
      if (S.invite?.token !== token || !info) return;
      S.invite.expiresAt = tsMs(info.expiresAt);
      S.invite.active = info.active;
      renderView();
    }).catch(() => {});
  }
}

function mountShell() {
  const q = h('input', {
    id: 'q', class: 'search', type: 'search', placeholder: 'Search items…  દાળ, rice, haldi',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search pantry items',
    oninput: (e) => { S.query = e.target.value; if (S.tab !== 'pantry') S.tab = 'pantry'; renderView(); },
  });
  q.value = S.query;
  $app.replaceChildren(
    h('header', { class: 'topbar' }, q, h('div', { class: 'offline-bar' }, 'Offline — changes will sync when you reconnect')),
    h('main', { id: 'view' }),
    h('nav', { id: 'nav', class: 'nav' }),
  );
  S.shell = true;
}

function renderView() {
  if (!S.shell) return;
  const view = document.getElementById('view');
  const scroll = window.scrollY;
  let content;
  if (S.tab === 'shopping') content = shoppingView();
  else if (S.tab === 'family' && S.isAdmin) content = familyView();
  else content = pantryView();
  view.replaceChildren(content);
  renderNav();
  window.scrollTo(0, scroll);
}

function renderNav() {
  const badge = S.items.filter((i) => i.status === 'need' || i.onShoppingList).length + buildSuggestions(S.items).length;
  const pending = S.members.filter((m) => m.status === 'pending').length;
  const tab = (id, icon, label, count) => h('button', {
    class: 'navbtn' + (S.tab === id ? ' on' : ''),
    onclick: () => { S.tab = id; renderView(); window.scrollTo(0, 0); },
  }, h('span', { class: 'ico', 'aria-hidden': 'true' }, icon), label, count ? h('b', { class: 'badge' }, count) : null);

  document.getElementById('nav').replaceChildren(
    tab('pantry', '🏠', 'Pantry'),
    tab('shopping', '🛒', 'Shopping', badge),
    S.isAdmin ? tab('family', '👪', 'Family', pending) : null,
  );
}

/* ───────────────────────────────── Pantry tab ───────────────────────────────── */

function changeStatus(item, next) {
  if (!setStatus(S.hid, item, next)) return;
  const label = `${item.name} — ${next === 'need' ? 'added to your shopping list' : 'marked as in stock'}`;
  toast(label, {
    label: 'Undo',
    run: () => {
      const cur = S.items.find((i) => i.id === item.id);
      if (cur) setStatus(S.hid, cur, next === 'need' ? 'have' : 'need');
    },
  });
}

function itemTitle(item) {
  return h('button', { class: 'itemname', onclick: () => openItemDialog(item), 'aria-label': `Edit ${item.name}` },
    h('span', { class: 'name' }, item.name), h('span', { class: 'size' }, ` - ${item.sizeLabel}`),
    item.nameGu ? h('span', { class: 'gu' }, item.nameGu) : null);
}

function itemCard(item) {
  const need = item.status === 'need';
  return h('div', { class: 'card' },
    itemTitle(item),
    h('div', { class: 'seg', role: 'group', 'aria-label': `${item.name} status` },
      h('button', { class: 'have' + (!need ? ' on' : ''), 'aria-pressed': String(!need), onclick: () => changeStatus(item, 'have') }, 'Have it'),
      h('button', { class: 'need' + (need ? ' on' : ''), 'aria-pressed': String(need), onclick: () => changeStatus(item, 'need') }, 'Need it')),
  );
}

function pantryView() {
  const wrap = h('div', {});
  if (!S.items.length) {
    wrap.append(h('div', { class: 'empty' },
      h('h2', {}, 'Your pantry is empty'),
      h('p', { class: 'muted' }, 'Start with a typical Gujarati pantry (about 35 bulk items with Gujarati names), then edit sizes to match your home.'),
      h('button', { class: 'btn primary big', onclick: () => guarded(async () => { await seedItems(S.hid, SEED_ITEMS); toast('Starter pantry added'); }) }, 'Load starter pantry'),
      h('button', { class: 'btn', onclick: () => openItemDialog() }, 'Add an item myself')));
    return wrap;
  }

  const q = norm(S.query);
  const matches = (i) => !q || [i.name, i.nameGu, ...(i.aliases || [])].some((s) => norm(s).includes(q));
  const shown = S.items.filter(matches);

  if (q && !shown.length) {
    wrap.append(h('div', { class: 'empty' },
      h('p', {}, `Nothing matches "${S.query}".`),
      h('button', { class: 'btn primary', onclick: () => openItemDialog(null, S.query) }, `Add "${S.query}" as a new item`)));
    return wrap;
  }

  const known = new Set(CATEGORIES.map((c) => c.id));
  const groups = [...CATEGORIES, { id: '_other', name: 'Other', gu: '', icon: '📦' }];
  for (const cat of groups) {
    const list = shown.filter((i) => (cat.id === '_other' ? !known.has(i.category) : i.category === cat.id)).sort(byName);
    if (!list.length) continue;
    const open = q ? true : !S.collapsed.has(cat.id);
    const need = list.filter((i) => i.status === 'need').length;
    const d = h('details', { class: 'cat', open, ontoggle: (e) => {
      if (q) return;
      if (e.target.open) S.collapsed.delete(cat.id); else S.collapsed.add(cat.id);
    } },
      h('summary', {}, h('span', { class: 'ico' }, cat.icon), h('span', { class: 'catname' }, cat.name, cat.gu ? h('small', {}, cat.gu) : null),
        need ? h('b', { class: 'badge' }, `${need} to buy`) : null),
      list.map(itemCard));
    wrap.append(d);
  }
  wrap.append(h('button', { class: 'btn addbtn', onclick: () => openItemDialog() }, '+ Add item'));
  return wrap;
}

/* ───────────────────────────────── Shopping tab ───────────────────────────────── */

function shoppingView() {
  const wrap = h('div', {});
  const listed = S.items.filter((i) => i.status === 'need' || i.onShoppingList).sort(byName);
  const suggestions = buildSuggestions(S.items);

  wrap.append(h('h2', { class: 'sect' }, 'Manually Added', h('small', {}, `${listed.length}`)));
  if (!listed.length) wrap.append(h('p', { class: 'muted pad' }, 'Nothing here. Tap "Need it" on the Pantry tab when something runs out.'));
  for (const item of listed) {
    wrap.append(h('div', { class: 'card' },
      itemTitle(item),
      item.status === 'have' ? h('span', { class: 'tag' }, 'from suggestion') : null,
      h('button', { class: 'btn bought', onclick: () => {
        if (setStatus(S.hid, item, 'have')) toast(`${item.name} — bought, thanks!`);
      } }, '✓ Bought')));
  }

  wrap.append(h('h2', { class: 'sect' }, 'Suggested for You', h('small', {}, `${suggestions.length}`)));
  if (!suggestions.length) {
    wrap.append(h('p', { class: 'muted pad' }, 'No suggestions yet. After an item has been refilled a couple of times, Kothar learns how long it lasts and nudges you before it runs out.'));
  }
  for (const s of suggestions) {
    const note = s.state === 'likely_empty' ? 'Probably empty' : 'Running low';
    const basis = s.method === 'scaled' ? `estimated from other pack sizes` : `based on ${s.n} refills`;
    wrap.append(h('div', { class: 'card sugg' },
      h('div', { class: 'suggtop' }, itemTitle(s.item), h('span', { class: 'chip ' + s.state }, note)),
      h('p', { class: 'muted small' }, `Usually lasts ~${Math.round(s.avgDays)} days · last refilled ${Math.round(s.daysSince)} days ago · ${basis}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { addSuggestionToList(S.hid, s.item); toast(`${s.item.name} added to your list`); } }, 'Add to list'),
        h('button', { class: 'btn', onclick: () => { dismissSuggestion(S.hid, s.item); toast('Okay, I will check again later'); } }, 'Dismiss'))));
  }
  return wrap;
}

/* ─────────────────────────── Family tab (admin approvals) ─────────────────────────── */

function familyView() {
  const wrap = h('div', {});
  const name = S.household?.name || 'your household';

  // Invite link
  const inv = S.invite;
  const invitePanel = h('section', { class: 'panel' }, h('h2', {}, 'Invite family'));
  if (inv && inv.active !== false) {
    invitePanel.append(
      h('input', { type: 'text', readonly: true, value: inv.link, onfocus: (e) => e.target.select(), 'aria-label': 'Invite link' }),
      h('p', { class: 'muted small' }, `${inv.expiresAt ? 'Expires ' + fmtDate(inv.expiresAt) + '. ' : ''}Anyone who opens it still needs your approval.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => guarded(async () => {
          const r = await shareInvite(inv.link, name);
          if (r === 'copied') toast('Link copied');
        }) }, 'Share link'),
        h('button', { class: 'btn', onclick: () => guarded(async () => {
          if (confirm('Make a new link? The old one stops working.')) { await rotateInvite(S.hid, name); toast('New link ready'); }
        }) }, 'New link')),
      h('button', { class: 'btn link', onclick: () => guarded(async () => {
        if (confirm('Switch the invite link off?')) { await revokeInvite(S.hid, inv.token); toast('Invite switched off'); }
      }) }, 'Switch invite off'));
  } else {
    invitePanel.append(h('button', { class: 'btn primary', onclick: () => guarded(async () => { await rotateInvite(S.hid, name); }) }, 'Create invite link'));
  }
  wrap.append(invitePanel);

  const pending = S.members.filter((m) => m.status === 'pending');
  const approved = S.members.filter((m) => m.status === 'approved');
  const removed = S.members.filter((m) => m.status === 'removed');
  const when = (m) => fmtDate(tsMs(m.requestedAt));

  wrap.append(h('h2', { class: 'sect' }, 'Waiting for approval', h('small', {}, `${pending.length}`)));
  if (!pending.length) wrap.append(h('p', { class: 'muted pad' }, 'No one is waiting.'));
  for (const m of pending) {
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'itemname static' }, h('span', { class: 'name' }, m.deviceName || 'Unnamed phone'), h('span', { class: 'gu' }, `asked ${when(m)}`.trim())),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn primary', onclick: () => guarded(() => approveMember(S.hid, m.uid)) }, 'Approve'),
        h('button', { class: 'btn', onclick: () => guarded(() => removeMember(S.hid, m.uid)) }, 'Deny'))));
  }

  wrap.append(h('h2', { class: 'sect' }, 'Family devices', h('small', {}, `${approved.length}`)));
  for (const m of approved) {
    const isMe = m.uid === S.user.uid;
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'itemname static' }, h('span', { class: 'name' }, m.deviceName || 'Phone'), h('span', { class: 'gu' }, isMe ? 'you (admin)' : `joined ${fmtDate(tsMs(m.approvedAt))}`.trim())),
      isMe ? null : h('button', { class: 'btn danger', onclick: () => guarded(async () => {
        if (confirm(`Remove ${m.deviceName || 'this phone'}? It loses access immediately.`)) await removeMember(S.hid, m.uid);
      }) }, 'Remove')));
  }

  if (removed.length) {
    wrap.append(h('h2', { class: 'sect' }, 'Removed', h('small', {}, `${removed.length}`)));
    for (const m of removed) {
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'itemname static' }, h('span', { class: 'name' }, m.deviceName || 'Phone')),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn', onclick: () => guarded(() => approveMember(S.hid, m.uid)) }, 'Approve again'),
          h('button', { class: 'btn link', onclick: () => guarded(() => forgetMember(S.hid, m.uid)) }, 'Forget'))));
    }
  }

  wrap.append(h('button', { class: 'btn link signout', onclick: () => { resetAll(); logout(); } }, 'Sign out'));
  return wrap;
}

/* ───────────────────────────── add / edit item sheet ───────────────────────────── */

function openItemDialog(item = null, prefillName = '') {
  const dlg = h('dialog', { class: 'sheet' });
  const name = h('input', { type: 'text', required: true, maxlength: 80, placeholder: 'e.g. Toor Dal', autocomplete: 'off' });
  const gu = h('input', { type: 'text', maxlength: 80, placeholder: 'Gujarati name (optional)', autocomplete: 'off' });
  const cat = h('select', {}, CATEGORIES.map((c) => h('option', { value: c.id }, `${c.icon} ${c.name}`)));
  const size = h('input', { type: 'number', inputmode: 'decimal', min: '0.01', step: 'any', required: true, placeholder: '5' });
  const unit = h('select', {}, ['kg', 'g', 'l', 'ml', 'pc'].map((u) => h('option', { value: u }, u === 'l' ? 'L' : u)));

  name.value = item?.name ?? prefillName;
  gu.value = item?.nameGu ?? '';
  cat.value = item?.category ?? CATEGORIES[0].id;
  size.value = item?.sizeValue ?? '';
  unit.value = item?.sizeUnit ?? 'kg';

  const form = h('form', { method: 'dialog', onsubmit: (e) => {
    e.preventDefault();
    const fields = { name: name.value, nameGu: gu.value, category: cat.value, sizeValue: size.value, sizeUnit: unit.value };
    if (!fields.name.trim() || !(Number(fields.sizeValue) > 0)) return;
    if (item) updateItem(S.hid, item.id, fields); else addItem(S.hid, fields);
    dlg.close();
  } },
    h('h2', {}, item ? 'Edit item' : 'Add item'),
    h('label', {}, 'Name', name),
    h('label', {}, 'Gujarati name', gu),
    h('label', {}, 'Category', cat),
    h('div', { class: 'row' }, h('label', { class: 'grow' }, 'Pack size', size), h('label', {}, 'Unit', unit)),
    item ? h('p', { class: 'muted small' }, 'Changing the pack size keeps what Kothar has learned for the old size.') : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel')),
    item ? h('button', { class: 'btn danger link', type: 'button', onclick: () => {
      if (confirm(`Delete ${item.name}? Its history is lost.`)) { deleteItem(S.hid, item.id); dlg.close(); }
    } }, 'Delete item') : null);

  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

/* ─────────────────────────────────── boot ─────────────────────────────────── */

function setOffline() { document.body.classList.toggle('offline', !navigator.onLine); }
window.addEventListener('online', setOffline);
window.addEventListener('offline', setOffline);
setOffline();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
}

window.addEventListener('hashchange', () => {
  if (!auth.currentUser) onAuthChange(null);
});

async function onAuthChange(user) {
  resetAll();
  S.user = user;
  if (!user) {
    // First visit via an invite link: give this phone an anonymous id, which re-triggers this handler.
    if (readJoinTokenFromHash()) { await guarded(ensureDeviceIdentity); return; }
    return showLogin();
  }
  await route(user);
}

showScreen(h('p', { class: 'muted' }, 'Loading…'));
onAuthStateChanged(auth, onAuthChange);
