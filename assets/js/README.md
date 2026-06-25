# `assets/js/`

All browser JavaScript, grouped by responsibility. Every file is plain ES5
(no modules, no build step) and attaches its public surface to a `window.*`
global. Scripts must be loaded in **dependency order** by the HTML pages.

## Subfolders

| Folder | Responsibility | Globals exported |
|---|---|---|
| `polyfills.js` (file) | Legacy-Safari shims, loaded first | — |
| [`config/`](config/) | Static configuration data | `FIREBASE_CONFIG`, `PRO_EMAILS`, `ALL_TASKS` |
| [`auth/`](auth/) | Authentication client + login UI | `Auth`, `AuthUI` |
| [`data/`](data/) | Cloud persistence + unified storage | `Firestore`, `Storage` |
| [`icons/`](icons/) | SVG icon catalogues for the task editor | `ICON_LIBRARY` |
| [`pages/`](pages/) | Per-page controllers (Morning/Clock, Task Manager, Dashboard) | `DashboardData`, `DashboardCharts` |

## `polyfills.js`

Feature-detected shims for legacy Safari (iOS 9 / iPad Air 1). Loaded **first
and synchronously** so every later script can assume `Promise` exists.

- Injects the `promise-polyfill` CDN script via `document.write` **only** when
  the native `Promise` global is missing (so it blocks parsing on old engines
  but is a no-op on modern ones).
- Deliberately does **not** polyfill `fetch`; the rest of the codebase uses
  `XMLHttpRequest` wrapped in a `Promise`, which works back to IE10.

## Required load order

Globals must exist before their consumers run. The canonical order used by the
HTML pages is:

```
polyfills.js
config/firebase-config.js     → window.FIREBASE_CONFIG
config/pro-allowlist.js       → window.PRO_EMAILS
config/tasks-config.js        → window.ALL_TASKS
icons/icon-library-color.js   → window.ICON_LIBRARY   (todo + seed pages only)
auth/auth-client.js           → window.Auth      (needs FIREBASE_CONFIG)
data/firestore-client.js      → window.Firestore (needs FIREBASE_CONFIG + Auth)
data/storage.js               → window.Storage   (needs Auth + Firestore + PRO_EMAILS)
auth/auth-ui.js               → window.AuthUI    (needs Auth)
pages/<page>.js               → page controller  (needs everything above)
```

`dashboard.html` additionally loads `pages/dashboard-charts.js` and
`pages/dashboard-data.js` before `pages/dashboard.js`.

## Why globals instead of modules?

No bundler runs over this repo, and old Safari lacks reliable ES-module
support. Each file wraps its body in an IIFE and exposes only its public object
on `window`. A practical upside: **relocating a file only requires updating the
`<script src>` paths in the HTML**, never the JS itself.
