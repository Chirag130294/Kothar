# Kothar (કોઠાર) — household pantry PWA

Tracks **bulk, long-lasting staples only** (10 kg rice, 5 kg dal, masalas, atta). No perishables, so nobody gets data-entry fatigue.
Static site on GitHub Pages + Firebase Auth + Firestore (Spark plan). No build step, no npm install.

---

## 1. Folder structure (GitHub Pages)

```
kothar/                      <- repo root = site root
├── index.html               app shell (one page, hash routing)
├── manifest.webmanifest     installable PWA metadata
├── sw.js                    service worker: app shell works offline
├── firestore.rules          security rules (paste into Firebase console)
├── package.json             only so `npm test` can run the unit tests
├── css/styles.css
├── icons/                   icon-192.png, icon-512.png, apple-touch-icon.png
├── js/
│   ├── config.js            YOUR Firebase web config (edit this)
│   ├── fb.js                pins the Firebase SDK version (CDN imports)
│   ├── firebase-init.js     app, auth, Firestore with offline cache
│   ├── household.js         ★ Admin invite & approve flow
│   ├── items.js             item CRUD + Have/Need toggle + logs
│   ├── predict.js           ★ rolling-average "Suggested for You" engine (pure, tested)
│   ├── seed-data.js         categories + ~35 starter items with Gujarati names
│   └── app.js               screens (login, join, waiting room, pantry, shopping, family)
└── tests/predict.test.js    16 unit tests for the algorithm (`npm test`)
```

---

## 2. Firestore schema

```
users/{uid}                              private pointer: "which household is this device in?"
  householdId, householdName, displayName?, email?, isAnonymous, createdAt

invites/{token}                          token = 32 random URL-safe chars (192 bits); get-only, never listable
  householdId, householdName, createdBy, active, createdAt, expiresAt   (7 days)

households/{hid}
  name, adminUid, createdAt, activeInviteToken

  members/{uid}                          THE WAITING ROOM (uid = Firebase auth uid of the device)
    role: 'admin' | 'member'
    status: 'pending' | 'approved' | 'removed'
    deviceName                           "Mummy's phone"
    inviteToken                          proof the device had a live link (checked by the rules)
    requestedAt, approvedAt?, removedAt?

  items/{itemId}
    name, nameGu, aliases[]              search matches all three ("haldi", "હળદર", "Turmeric")
    category                             masala | grains_dals | flours | oil_sweet | misc
    sizeValue, sizeUnit, sizeLabel       5, 'kg', "5kg"       (kg | g | l | ml | pc)
    sizeKey                              "g5000"  (5 kg and 5000 g are the same pack)
    status: 'have' | 'need'
    onShoppingList                       true = suggestion accepted (item is NOT marked empty)
    lastRestockedAt                      Timestamp  <- logged when toggled to "Have it"
    lastEmptiedAt                        Timestamp  <- logged when toggled to "Need it"
    prevRestockedAt, cycleSizeKey        for undo and for size changes
    suggestionSnoozedUntil               set by "Dismiss"
    lifespans: { g10000: [ {days, at, src: 'empty'|'restock'}, ... ] }   last 12 cycles per pack size
    createdAt, updatedAt, updatedBy

  logs/{logId}                           append-only audit trail (nobody can edit or delete)
    itemId, itemName, sizeLabel, sizeKey
    type: 'restocked' | 'emptied' | 'undo'
    at, by (uid), lifespanDays?, counted?, source?
```

The lifespan history lives **on the item** (not in a separate stats collection), so one listener
and one document hold everything the predictor needs, and the logs stay a pure audit trail.

---

## 3. One-time setup

**Firebase console**
1. Create a project (Spark plan). Add a **Web app** and copy its config into `js/config.js`.
2. **Authentication → Sign-in method:** enable **Google** and **Anonymous**.
3. **Authentication → Settings → Authorized domains:** add `YOUR-USERNAME.github.io`.
4. **Firestore Database:** create in production mode, then **Rules** → paste `firestore.rules` → Publish.

**GitHub**
1. Push this folder to a repo. **Settings → Pages → Deploy from branch → main / (root)**.
2. Open `https://YOUR-USERNAME.github.io/REPO/` on your phone, sign in with Google, create the household, tap **Load starter pantry**.
3. **Family tab → Share link** → send it on WhatsApp. When someone opens it they type whose phone it is, and you tap **Approve**.

When you deploy new code, bump `VERSION` in `sw.js` so phones fetch it.

---

## 4. How the access model works

| Step | Who | What happens | Enforced by |
|---|---|---|---|
| Create | Admin (Google) | `households/{hid}` + admin member doc + invite, in one batch | rules: only `google.com` sign-in may create a household |
| Share | Admin | link `#/join/<token>` | token is random, 7-day expiry, one active link at a time |
| Join | Family phone | anonymous sign-in → `members/{uid}` with `status: 'pending'` | rules: must present a live token; cannot write any other status or role |
| Approve | Admin | `status → 'approved'` | rules: only `adminUid` may update members |
| Sync | Family phone | its listener fires, app unlocks, items sync | rules: items/logs readable only if your member doc says `approved` |
| Remove | Admin | `status → 'removed'` | access is gone on the next request; a tombstone stops re-requesting |

Admin power is decided by `households/{hid}.adminUid`, never by a field a user can edit.

---

## 5. How suggestions are calculated (`js/predict.js`)

1. **Have it** logs `lastRestockedAt`. **Need it** logs `lastEmptiedAt`; the gap in days is one sample for that **pack size**.
2. Per pack size keep the last 12 samples. Ignore cycles under 2 days (accidental taps); flipping Need→Have within 10 minutes is treated as an undo.
3. Drop outliers (median/MAD) once there are 4+ samples: the month the guests came.
4. Recency-weighted mean: newest cycle weight 1, each older one × 0.7.
5. Suggest when **85 %** of the usual lifespan has passed and there are **≥ 2** refills of data.
6. Never refilled that size before? Convert from another size by consumption rate (5 kg lasted 22 days → 10 kg ≈ 44 days).
7. **Add to list** only sets `onShoppingList`; it does *not* mark the item empty. Otherwise the app would learn from its own guesses and every cycle would shrink. If the family buys straight from a suggestion, the cycle is measured from the purchase date and counts half.

All thresholds are in `CONFIG` at the top of `predict.js`.

---

## 6. Known limits (worth knowing before you rely on it)

- **Not yet run against a live Firebase project.** The algorithm is unit-tested (16 tests) and every file is syntax- and import-checked, but the rules and sign-in flows need a first real run. Use the **Rules Playground** in the console to try: a stranger reading items (should fail), a pending device writing `status: 'approved'` (should fail), an approved device reading items (should pass).
- **iPhone:** Safari and the Home Screen app keep separate storage, so they count as two different devices. Add to Home Screen first, then use *Paste the invite link* inside the app. Google sign-in popups inside an installed iOS app can be unreliable; do admin sign-in in a normal browser tab if it misbehaves.
- **Lost identity:** if a family member clears site data, they get a new anonymous id and must be approved again. Remove their old entry from the Family tab.
- **Spark plan budget:** rules that check membership cost about one extra read per request. A family of five stays far below 50k reads/day.
- **Simultaneous offline edits** to the *same item* from two phones: last write wins.
- The first cycle of an item is not counted (nobody knows when it was bought); learning starts after the first refill.
- Gujarati names in `seed-data.js` are a starting point; edit any of them in the app.
