// family.js: admin-only tab. Invite link, approve/remove phones. (Logic lives in household.js; this is only screens.)
import { ctx } from '../ctx.js';
import { h, toast, guarded } from './dom.js';

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
const date = (t) => { const m = ms(t); return m ? new Date(m).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; };
const initial = (s) => (s || '?').trim().charAt(0).toUpperCase() || '?';

export function familyView() {
  const page = h('div', { class: 'page' });
  const H = ctx.invites;
  if (ctx.mode !== 'firebase' || !H) {
    page.append(h('div', { class: 'card stack' },
      h('b', {}, 'Family sharing is not switched on yet'),
      h('p', { class: 'muted small', style: 'line-height:1.5' },
        'Right now Kothar is in demo mode: everything stays on this phone. To let your family share one pantry, add your Firebase settings to js/config.js (steps are in the README). Then this tab shows the invite link and the Approve button.')));
    return page;
  }
  const name = ctx.household?.name || 'your household';
  const inv = ctx.invite;
  const pending = ctx.members.filter((m) => m.status === 'pending');
  const approved = ctx.members.filter((m) => m.status === 'approved');
  const removed = ctx.members.filter((m) => m.status === 'removed');

  if (pending.length) {
    page.append(h('div', { class: 'card', style: 'box-shadow:inset 0 0 0 1px var(--tint),0 14px 30px -18px var(--tint)' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('span', { style: 'width:8px;height:8px;border-radius:4px;background:var(--tint)' }), h('b', { style: 'color:var(--tint);font-size:13px' }, 'Waiting for approval')),
      pending.map((m) => h('div', { class: 'stack', style: 'gap:10px;margin-bottom:10px' },
        h('div', { class: 'row' }, h('div', { class: 'avatar' }, initial(m.deviceName)),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, m.deviceName || 'Unnamed phone'), h('div', { class: 'muted small' }, `Asked ${date(m.requestedAt)}`.trim()))),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary grow', onclick: () => guarded(() => H.approveMember(ctx.hid, m.uid)) }, 'Approve'),
          h('button', { class: 'btn grow', onclick: () => guarded(() => H.removeMember(ctx.hid, m.uid)) }, 'Remove'))))));
  }

  page.append(h('div', {},
    h('div', { class: 'sechead' }, h('b', {}, 'Members'), h('span', {}, `${approved.length} device${approved.length === 1 ? '' : 's'}`)),
    h('div', { class: 'list' }, approved.map((m) => {
      const me = m.uid === ctx.user?.uid;
      return h('div', { class: 'lrow' }, h('div', { class: 'avatar' + (me ? ' me' : '') }, initial(me ? 'You' : m.deviceName)),
        h('div', { class: 'tx' }, h('b', {}, me ? 'You' : (m.deviceName || 'Phone')), h('span', {}, me ? 'Admin' : `Joined ${date(m.approvedAt)}`.trim())),
        me ? null : h('button', { class: 'btn sm link', onclick: () => guarded(async () => {
          if (confirm(`Remove ${m.deviceName || 'this phone'}? It loses access immediately.`)) await H.removeMember(ctx.hid, m.uid);
        }) }, 'Remove'));
    }))));

  const invCard = h('div', { class: 'card stack' }, h('b', {}, 'Invite link'));
  if (inv && inv.active !== false) {
    invCard.append(
      h('div', { class: 'muted small' }, `${inv.expiresAt ? 'Valid until ' + new Date(inv.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + '. ' : ''}Anyone who opens it still needs your approval.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', onclick: () => guarded(async () => { if ((await H.shareInvite(inv.link, name)) === 'copied') toast('Link copied'); }) }, 'Share link'),
        h('button', { class: 'btn', onclick: () => guarded(async () => { if (confirm('Make a new link? The old one stops working.')) { await H.rotateInvite(ctx.hid, name); toast('New link ready'); } }) }, 'New link')),
      h('button', { class: 'btn link', onclick: () => guarded(async () => { if (confirm('Switch the invite link off?')) { await H.revokeInvite(ctx.hid, inv.token); toast('Invite switched off'); } }) }, 'Switch invite off'));
  } else {
    invCard.append(h('button', { class: 'btn primary', onclick: () => guarded(() => H.rotateInvite(ctx.hid, name)) }, 'Create invite link'));
  }
  page.append(invCard);

  if (removed.length) page.append(h('div', {},
    h('div', { class: 'sechead' }, h('b', {}, 'Removed'), h('span', {}, `${removed.length}`)),
    h('div', { class: 'list' }, removed.map((m) => h('div', { class: 'lrow' }, h('div', { class: 'avatar' }, initial(m.deviceName)),
      h('div', { class: 'tx' }, h('b', {}, m.deviceName || 'Phone')),
      h('button', { class: 'btn sm', onclick: () => guarded(() => H.approveMember(ctx.hid, m.uid)) }, 'Approve again'),
      h('button', { class: 'btn sm link', onclick: () => guarded(() => H.forgetMember(ctx.hid, m.uid)) }, 'Forget'))))));
  return page;
}
