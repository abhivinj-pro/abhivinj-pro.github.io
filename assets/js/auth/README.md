# `assets/js/auth/`

Authentication: a framework-free Firebase Auth client and the login UI that
drives it. Both run on ES5 / iOS 9 Safari — XHR + Promise polyfill, no Firebase
SDK, no `fetch`.

## Files

### `auth-client.js` → `window.Auth`
A thin wrapper over the Firebase **Identity Toolkit** and **Secure Token** REST
endpoints. Owns the auth token lifecycle and broadcasts auth-state changes.

Public API:

| Method | Description |
|---|---|
| `Auth.init()` | Restore any saved session; resolves to `user \| null`. |
| `Auth.signUp(email, password)` | Create an account; resolves to `user`. |
| `Auth.signIn(email, password)` | Password sign-in; resolves to `user`. |
| `Auth.sendMagicLink(email)` | Email a passwordless sign-in link. |
| `Auth.completeMagicLink(email, oobCode)` | Finish magic-link sign-in. |
| `Auth.signOut()` | Clear the local session. |
| `Auth.currentUser()` | Synchronous `user \| null`. |
| `Auth.idToken()` | Resolves to a fresh ID token, auto-refreshing when <5 min remain. |
| `Auth.onChange(cb)` | Subscribe to auth-state changes; returns an unsubscribe fn. |

- A `user` is `{ uid, email }`.
- Tokens are persisted in `localStorage` (`hb-auth-v1`) and the pending
  magic-link email under `hb-pending-email-v1`.
- Reads `window.FIREBASE_CONFIG`; throws a clear error if it is missing.

### `auth-ui.js` → `window.AuthUI`
The login modal and the user chip. Builds DOM lazily so callers only supply a
container for the chip; the modal mounts itself to `<body>`.

Public API:

| Method | Description |
|---|---|
| `AuthUI.mountChip(container)` | Render the signed-in/out chip into `container`. |
| `AuthUI.openLogin(opts)` | Open the modal. `opts = { message?, requireLogin? }`. |
| `AuthUI.closeLogin()` | Dismiss the modal. |
| `AuthUI.flash(text)` | Show a transient toast. |

- Calls into `window.Auth` for every credential operation and listens via
  `Auth.onChange` to keep the chip in sync.
- Styled by [`../../css/auth.css`](../../css/auth.css).
