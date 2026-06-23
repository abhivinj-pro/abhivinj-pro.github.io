# `tools/`

Developer-only utility pages. These are **not** part of the normal user flow
and are not linked from the app — open them directly when you need them. Each
sets `<base href="../">` so its relative asset and `resources/` lookups resolve
from the repository root even though the file lives in this subfolder.

## Files

### `deployed.html`
A standalone preview of the Morning/My Day/Work/Clock shell **without
authentication** — it loads only `tasks-config.js` + `app.js` against the
bundled demo task list. Handy for eyeballing layout changes without signing in.

### `seed-tasks.html`
One-click seeder that signs in and writes the default task list
(`window.ALL_TASKS` from `config/tasks-config.js`) into the authenticated
account's Firestore document. Use to bootstrap a fresh account.

### `seed-tasks-append.html`
Appends a set of **Work** tasks to the current account's existing list
(non-destructive). Loads `icon-library-color.js` for icon data.

### `seed-cisa-d4.html`
One-off seeder for a specific "CISA D4" study-task set. A throwaway data-entry
helper, kept for re-runs.

## Safety

The seed pages **write to Firestore** under the signed-in user. Review the task
payload in each file before running, and confirm you are signed into the
intended account.
