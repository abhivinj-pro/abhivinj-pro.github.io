# Firebase Setup (one-time)

Habit Board uses Firebase (Auth + Firestore) for cross-device sync. The site
talks to Firebase via REST so no SDK / build step is required, but you must
create a Firebase project and paste three values into
[firebase-config.js](assets/js/config/firebase-config.js).

## 1. Create the project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Skip Google Analytics (not needed).
3. In the project, open **Build → Authentication → Get started**.
4. Enable **Email/Password**. In the same screen, also flip on
   **Email link (passwordless sign-in)**.
5. Open **Authentication → Settings → Authorized domains** and add the host
   that serves the site, e.g. `abhivinj-pro.github.io`. `localhost` is allowed
   by default for local testing.

## 2. Create the database

1. In the left sidebar open **Build**. Under the **NoSQL** group click
   **Firestore** (not SQL Connect, not Realtime Database, not Storage), then
   **Create database**.
2. Pick a region close to you, **Production mode**, then **Enable**.
3. Open the **Rules** tab and replace the contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   Click **Publish**.

## 3. Get the web config

1. In the Firebase console, click the gear icon → **Project settings**.
2. Under **Your apps**, click the `</>` (Web) icon and register an app
   (any nickname, no hosting).
3. Copy the three values you need from the snippet shown:
   - `apiKey`
   - `projectId`
   - `authDomain`

## 4. Paste into the repo

Open [firebase-config.js](assets/js/config/firebase-config.js) and replace the placeholders:

```js
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSy…',
  projectId: 'your-project-id',
  authDomain: 'your-project-id.firebaseapp.com'
};
```

Commit and push. That's it — the site now supports sign-up, sign-in, magic
links, and per-account task sync.

## 5. (Optional) Restrict the API key

The API key in `assets/js/config/firebase-config.js` is **not** a secret, but you should still
restrict its allowed referrers so random sites can't reuse your quota.

1. Open <https://console.cloud.google.com/apis/credentials> and pick your
   Firebase project.
2. Edit the **Browser key (auto created by Firebase)**.
3. Under **Application restrictions** choose **HTTP referrers** and add:
   - `https://abhivinj-pro.github.io/*`
   - `http://localhost:*/*` (for local dev)

## 6. (Optional) Mark Pro accounts

If you want certain accounts to fall back to the bundled `tasks-config.js`
when the cloud is unreachable, add their emails to
[pro-allowlist.js](pro-allowlist.js):

```js
window.PRO_EMAILS = ['you@example.com'];
```

Free accounts always use the cloud and never see `tasks-config.js` after
login.

## Data model (FYI)

```
users/{uid}/profile/main        -> { email, createdAt }       (reserved, not yet written)
users/{uid}/config/tasks        -> { tasks: [...], updatedAt }
users/{uid}/days/{YYYY-MM-DD}   -> { morning: {...}, myday: {...}, updatedAt }
```

The security rule above gates every document under `users/{uid}` so each
account can only read/write its own data.
