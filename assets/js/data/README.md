# `assets/js/data/`

The persistence layer. `firestore-client.js` is the low-level REST transport;
`storage.js` is the high-level facade every page actually talks to.

## Files

### `firestore-client.js` → `window.Firestore`
A minimal Firestore REST CRUD wrapper. Hides Firestore's typed-value wire
format so callers pass and receive plain JS objects.

| Method | Description |
|---|---|
| `Firestore.getDoc(path)` | Fetch a document; resolves to `object \| null`. |
| `Firestore.setDoc(path, data)` | Full replace via `PATCH`. |
| `Firestore.deleteDoc(path)` | Delete a document. |

- `path` is a document path such as `users/<uid>/config/tasks`.
- Internally handles typed-value **encode/decode** (`stringValue`,
  `booleanValue`, `mapValue`, …).
- Every request attaches a bearer token from `window.Auth.idToken()`.
- Builds its base URL from `window.FIREBASE_CONFIG.projectId`.

### `storage.js` → `window.Storage`
The unified storage facade. Picks a backend based on auth state and exposes one
API to `app.js`, `todo.js`, and the dashboard, regardless of backend.

| Member | Description |
|---|---|
| `Storage.init()` | Boot the layer; resolves when initial data is loaded. |
| `Storage.mode` | `'demo' \| 'cloud' \| 'pro-fallback' \| 'loading'`. |
| `Storage.tasks` | Current task array (synchronous read). |
| `Storage.saveTasks(tasks)` | Persist the task list; resolves on write. |
| `Storage.readDayState(prefix, dateKey)` | Synchronous read of a day's check state from cache. |
| `Storage.writeDayState(prefix, dateKey, state)` | Update cache synchronously, flush to cloud fire-and-forget (debounced). |
| `Storage.ensureDayLoaded(dateKey)` | Ensure a day document is fetched (used by the dashboard). |
| `Storage.onChange(cb)` | Subscribe to data/mode changes; returns unsubscribe. |
| `Storage.PREFIXES` | `{ MORNING, MYDAY }` channel-name constants. |

Key behaviours:

- **Two logical channels** — `habit-board-state-` (Morning) and `myday-state-`
  (My Day) — map to the `morning` / `myday` keys inside a single Firestore
  document per date, so one day-doc holds both.
- Preloads today + the prior 14 days for carry-forward logic.
- Day-state writes are **debounced per `(prefix, dateKey)`** (~700 ms) to avoid
  spamming Firestore on rapid taps; a background poll refetches periodically.
- Chooses `demo` (signed out), `cloud` (signed in), or `pro-fallback`
  (signed-in Pro email when the cloud is unreachable — see
  [`../config/pro-allowlist.js`](../config/pro-allowlist.js)).
