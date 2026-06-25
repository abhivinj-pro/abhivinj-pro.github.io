# Habit Board

A personal habit-tracking and task-management web app hosted on GitHub Pages. Designed to work on older iPad Safari (iPad Air 1, iOS 12) as well as modern browsers — no framework, no build step.

## Screens

### Morning Board (`index.html`)
- Large tap-friendly routine cards from 7:00 AM to 10:00 AM showing your **Morning Routine** tasks.
- Each card has a custom SVG icon, an accent colour, and a checkmark that persists across the day.
- Navigation bar switches between **Morning**, **My Day**, **Work**, and **Clock** tabs.

### My Day
- Shows all non-Morning, non-Work tasks scheduled for today, pulled from your cloud task list.
- Tasks with time slots appear in order; tasks without a time slot are grouped below.
- Completed and missed tasks collapse into a **Caught Up** disclosure section.
- A rotating motivational quote appears at the bottom when all tasks are done.
- Demo mode is shown to unauthenticated visitors using a built-in sample task list.

### Work
- Dedicated view for tasks in the **Work** category, with the same card layout as My Day.

### Clock
- Full-screen clock showing hours, minutes, seconds, AM/PM, day of the week, and date.
- Built-in calendar panel for the current month.
- Active outside the morning window as the default view; also reachable from the nav bar.

### Task Manager (`todo.html`)
- Requires sign-in — shows an auth wall for unauthenticated visitors.
- Add, edit, delete, and reorder tasks.
- Per-task settings: name, category, accent colour, custom icon, recurrence schedule, and time slots.
- **Categories**: Morning Routine, Self Care, Chores, Groceries, Work.
- **Recurrence types**: daily, specific days of the week, interval (every N days), or a one-time date range.
- **Time slots**: assign one or more times to a task, or mark it as a full-day task.
- Filter chips let you view tasks by category.
- Sync status indicator shows whether changes have been saved to the cloud.

## Authentication & Cloud Sync

- Firebase Authentication via REST (no SDK) — supports email/password sign-up, sign-in, and **magic-link (passwordless)** sign-in.
- Firestore via REST — per-account task list and per-day check state are stored in the cloud and sync across devices.
- Tokens are stored in `localStorage` and refreshed automatically when less than 5 minutes remain.
- **Pro accounts** (email allowlist in `assets/js/config/pro-allowlist.js`) fall back to the bundled `assets/js/config/tasks-config.js` when the cloud is unreachable.
- **Demo mode** for unauthenticated visitors shows a read-only sample from `assets/js/config/tasks-config.js`.

## Icon Library

`assets/js/icons/icon-library-color.js` contains a curated SVG icon library (Health, Fitness, Food, Mind, Home, and more). The Task Manager lets you search and filter icons by name, tag, or category with a visual picker. (A monochrome outline variant, `icon-library.js`, is kept alongside it for reference.)

## Project structure

The repo is organised so that the HTML **entry pages stay at the root** (where
GitHub Pages and the cross-page links expect them) while all supporting code is
grouped by responsibility under `assets/`. Every folder has its own `README.md`
documenting the files and functions it contains.

```
index.html            Morning / My Day / Work / Clock shell
todo.html             Task Manager
dashboard.html        Insights dashboard
README.md  SETUP.md   Docs
package.json          npm test script (Node test harness)

assets/
  css/                Stylesheets — see assets/css/README.md
    styles.css          Global theme + app layout
    auth.css            Login modal, user chip, auth wall
    todo.css            Task Manager styles
    dashboard.css       Dashboard styles
  js/                 Browser JS (globals, load order) — see assets/js/README.md
    polyfills.js        Legacy-Safari Promise shim (loaded first)
    config/             Static config — firebase-config, pro-allowlist, tasks-config
    auth/               window.Auth (REST client) + window.AuthUI (login UI)
    data/               window.Firestore (REST) + window.Storage (facade)
    icons/              window.ICON_LIBRARY (icon picker catalogues)
    pages/              Per-page controllers — app.js, todo.js, dashboard*.js

resources/            Runtime media + data (quotes, sounds, svg) — see resources/README.md
tools/                Dev-only utility pages (preview + Firestore seeders) — see tools/README.md
tests/                Node test harness for the pure scheduling logic — see tests/README.md
```

Detailed per-file responsibilities live in each folder's README:
[`assets/css`](assets/css/README.md) ·
[`assets/js`](assets/js/README.md) ·
[`assets/js/config`](assets/js/config/README.md) ·
[`assets/js/auth`](assets/js/auth/README.md) ·
[`assets/js/data`](assets/js/data/README.md) ·
[`assets/js/icons`](assets/js/icons/README.md) ·
[`assets/js/pages`](assets/js/pages/README.md) ·
[`resources`](resources/README.md) ·
[`tools`](tools/README.md) ·
[`tests`](tests/README.md)

## Preview Locally

Open `index.html` directly in a browser (no server needed).

URL parameters for testing:

- `index.html?mode=morning` — force the Morning screen
- `index.html?mode=clock` — force the Clock screen

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose the `main` branch and the `/ (root)` folder.
5. Save.

Before deploying, fill in your Firebase project values in `assets/js/config/firebase-config.js`. See [SETUP.md](SETUP.md) for the full Firebase setup guide including Firestore rules and API key restrictions.

## Notes

- Optimised for tablets (iPad), laptops, and desktops — cards are large enough to read from a distance.
- Safari home-screen mode is supported via Apple web app meta tags in `index.html`.
- All network calls use XHR (not `fetch`) for compatibility with iOS 9/12; `assets/js/polyfills.js` patches `Promise` for the same reason.
- Day state uses a logical midnight of 1:00 AM — tapping cards just after midnight still counts toward the previous day.
