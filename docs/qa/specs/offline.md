# The offline app

What makes the viewer an app that installs on a phone and opens without a network, in a garden or a van. Project #8 seeded these clauses. Its brief is `docs/projects/8.md`, and "decision N" below means decision N of that brief. User data and its sync are the `SYNC` area; this area covers the app itself. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

**Id prefix:** `PWA`

## Installing

- `[PWA-1]` `[seed]` The app serves a web app manifest with the name `Speeltoestel ArcticFlyer 3D`, the short name `Speeltoestel`, `lang` `nl`, `display` `standalone` and `start_url` `/`. The manifest has a theme and a background colour taken from the app's own stylesheet, and icons of 192 px and 512 px plus a maskable 512 px icon. The page links the manifest and an `apple-touch-icon` of 180 px.

## Opening offline

- `[PWA-2]` `[seed]` A service worker, registered from the page with the scope `/`, precaches on install everything the page needs to start: the page itself, its scripts and stylesheets, its fonts, the model data in whatever form the app loads it, and the icons. After one visit online, the app opens with no network and shows the full model, the panel, the filters and the colour modes, as it does online.
- `[PWA-3]` `[seed]` The page requests nothing from another origin. Its fonts are served from the app's own origin.
- `[PWA-4]` `[seed]` The service worker never answers a request under `/api/` from a cache, and stores no response from one.

## Updating

- `[PWA-5]` `[seed]` A new version is downloaded in the background. The running app keeps the version it started with and shows that a new version is ready, with a button to switch to it. The switch happens on that tap or at the app's next start, and it leaves the device's IndexedDB copy and outbox untouched. The texts are the ones decision 3 records.
- `[PWA-6]` `[seed]` The service worker script and the manifest are served with `Cache-Control: no-cache`, so a deploy reaches a device the next time the app is opened online.
