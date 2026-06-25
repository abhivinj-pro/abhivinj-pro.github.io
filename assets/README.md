# `assets/`

All static front-end assets that the HTML entry pages load. Nothing here is
served as a top-level URL — the three entry pages (`index.html`, `todo.html`,
`dashboard.html`) live at the repository root and reference everything in this
folder by relative path (e.g. `assets/js/pages/app.js`).

## Layout

| Path | Contents |
|---|---|
| [`css/`](css/) | All stylesheets (global theme, auth modal, task manager, dashboard) |
| [`js/`](js/) | All browser JavaScript, grouped by responsibility |

## Why this split exists

The project is a **no-build, no-framework** static site that must run on old
iPad Safari (iOS 12, iPad Air 1). There is no bundler, so:

- Every script is a plain `<script src>` tag loaded in dependency order.
- Modules communicate through a small set of **global singletons** on `window`
  (`window.Auth`, `window.Storage`, `window.Firestore`, `window.AuthUI`,
  `window.ALL_TASKS`, `window.ICON_LIBRARY`, `window.DashboardData`,
  `window.DashboardCharts`, …) rather than ES `import`/`export`.

Because of the global pattern, **moving a `.js` file never breaks another
`.js` file** — only the `<script src>` order and paths inside the HTML pages
matter. See [`js/README.md`](js/README.md) for the required load order.
