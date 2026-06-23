# `assets/js/config/`

Static configuration data. These files declare plain globals and contain no
logic — they are the values the rest of the app reads at startup.

## Files

### `firebase-config.js` → `window.FIREBASE_CONFIG`
Public Firebase web-app config (`apiKey`, `projectId`, `authDomain`).

- These values are **not secrets** — they identify the project. Access is
  restricted server-side by Firestore security rules
  (`request.auth.uid == uid`) and Web API key referrer restrictions.
- Consumed by `auth/auth-client.js` (builds Identity Toolkit URLs) and
  `data/firestore-client.js` (builds the Firestore REST base URL).
- Must be filled in before deploying — see [`../../../SETUP.md`](../../../SETUP.md).

### `pro-allowlist.js` → `window.PRO_EMAILS`
A hardcoded array of "Pro" account emails (matched case-insensitively).

- Pro accounts get the bundled `tasks-config.js` as an **offline fallback**
  when the cloud is unreachable; free accounts never see it after login.
- Read by `data/storage.js` when deciding between `cloud` and `pro-fallback`
  modes.

### `tasks-config.js` → `window.ALL_TASKS`
The default / demo task catalogue: an array of task objects, each with
`id`, `title`, `category` (`Morning Routine`, `Work`, …), `accentClass`, and an
inline `icon` SVG string.

- Powers **demo mode** for signed-out visitors on `index.html`.
- Serves as the **pro-fallback** seed list (see `pro-allowlist.js`).
- Used by the seeding tools in [`../../../tools/`](../../../tools/) to push a
  starter task list into a real account.
