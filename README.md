# Kothar (કોઠાર): family pantry tracker

A mobile-first, offline-capable PWA for bulk pantry staples (rice, dals, flours, masalas, oil). It deliberately ignores perishables.
Vanilla HTML/CSS/JS, no build step. Hosting: GitHub Pages. Backend: Firebase Auth + Firestore (Spark plan).

## Try it now (no Firebase)
Open the site with `?demo` (or leave `js/config.js` as is): data is kept in this browser only.
```
python3 -m http.server 8123   # then open http://localhost:8123/?demo
npm test                      # unit tests (node --test)
```

## Go live
1. Firebase console: create a project, enable **Authentication → Google** and **Anonymous**, create **Firestore** (production mode).
2. Add your GitHub Pages domain under Authentication → Settings → Authorized domains.
3. Paste your web-app config into `js/config.js`.
4. Paste `firestore.rules` into Firestore → Rules → Publish.
5. Push to GitHub, enable Pages. Sign in with Google (you become admin), create the household, share the invite link.
   Family phones open it, sit in the waiting room, and you approve them in the Family tab.

## Folder structure
```
index.html  manifest.webmanifest  sw.js  firestore.rules
css/styles.css
js/app.js            boot, shell, Firebase sign-in / household flow
js/ctx.js            shared state
js/stock.js          pack model + prediction (pure functions)
js/units.js          kg/g/lb/oz/l/ml parsing and display
js/importer.js       paste / CSV / Excel / photo -> rows
js/catalog.js        dictionary: English -> Gujarati, category, thumbnail look
js/store-firebase.js, store-local.js   same interface
js/ui/*              pantry rails, item sheet, form, shop, family, settings, setup, scan
tests/               importer + stock tests
```

## Data (Firestore)
- `households/{hid}`, `members/{uid}`, `invites/{token}`, `users/{uid}`: unchanged access model (admin approves devices).
- `households/{hid}/items/{id}`: `{name, gu, cat, form, color, keys[], dim, dsize, packs[], lifespans[], onList, everStocked, snoozeUntil, photo, ...}`
  - pack: `{id, amt, left, v, u, label, openedAt|null}`; amounts stored in g / ml / pc, display keeps the unit it was bought in.
- `households/{hid}/wants/{id}`: one-time shopping items `{name, note, done}` ("For this trip").
- `households/{hid}/config/app`: shared settings `{categories[], tune{minSamples, leadMin, leadMax, snoozeMin}}`; admin writes, everyone reads.
- `households/{hid}/barcodes/{code}`: `{itemId, v, u, by, at}`, shared by the family.
- `households/{hid}/logs/{id}`: append-only history.

## How it works
- **Views**: thumbnails (Netflix-style rails) or a compact list/table with a collapsible band per category (toggle next to the search box). In list view, swipe a row left to take a pack out: one pack size removes one pack at once (Undo offered); several sizes ask which size and how many. The "Used" button on each row does the same without swiping.
- **Packs stay sealed**: Kothar counts packs; it no longer marks one as "open". Each pack is timed from when it was bought, or from when the previous pack of that item finished.
- **Shopping**: "To buy" (out of stock), "For this trip" (one-time items; "Track in pantry" turns one into a tracked item), "Suggested for you" (predictions).
- **Settings**: per phone (units, theme, accent colour, thumbnail size, Gujarati on/off, swipe on/off, start screen) and shared (categories, prediction tuning).
- **Whole packs by default**: one tap "Finished" / "Bought". "Took some out" and "What's left" live under Advanced.
- **First-time setup**: paste or type, Excel/CSV, photo, or a starter list, always followed by a review screen. Section headings in a note (e.g. "Box") steer matching.
- **Prediction**: each finished pack gives (amount, days) → a consumption rate, recency-weighted, outliers trimmed once there are 4+ samples. Days left = stock ÷ rate − time elapsed. Suggested once the item is within 4–14 days of running out and at least 2 packs have been finished. Packs finished in under 2 days are ignored as mis-taps; imported already-open packs never teach the predictor.
- **Barcodes**: family memory → Open Food Facts → ask once and remember for everyone. Camera uses BarcodeDetector (Chrome/Android), otherwise ZXing is loaded on demand (iPhone).

## Known limits (please read)
- Firebase sign-in, rules and sync were **not tested against a live project** here; test with two phones before relying on it.
- Camera scanning, Excel and photo-OCR loaders fetch libraries from jsDelivr on demand; those URLs are unverified. Handwriting OCR is best effort, so always check the review screen.
- Open Food Facts coverage of Indian staples is patchy; the family memory fills the gaps.
- Gujarati spellings in `js/catalog.js` are auto-written and need a native review; every name is editable in the app.
- iPhone: the Home Screen app and Safari keep separate storage; use one of them consistently.
- Two phones editing the same item while both offline: last write wins.
