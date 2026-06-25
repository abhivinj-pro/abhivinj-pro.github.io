# `assets/css/`

Stylesheets for the site. All share the same dark theme palette (defined as CSS
custom properties at the top of `styles.css` and mirrored in `dashboard.css`).
Targets old iPad Safari, so they avoid newer-only CSS (no `grid-template-areas`
reliance, vendor-prefixed flex where needed, explicit `text-size-adjust`).

## Files

### `styles.css`
The global stylesheet and design system. Loaded by `index.html`,
`dashboard.html`, and `tools/deployed.html`.

- Declares the theme tokens under `:root` (`--bg`, `--panel`, `--text`,
  `--muted`, accent colours, shadows, the morning-screen top scroll buffer).
- Layout for the **Morning**, **My Day**, **Work**, and **Clock** screens:
  routine card grid, headers/nav, the live clock, and the calendar panel.
- Accent classes (`.accent-pink`, `.accent-blue`, …) — the same palette the
  dashboard charts read so visuals stay consistent.
- References one local asset: `url("../../resources/missed.svg")` for the
  "missed task" badge. The `../../` climbs from `assets/css/` back to the repo
  root before entering `resources/`.

### `auth.css`
Styling for the authentication UI built by `assets/js/auth/auth-ui.js`.

- The user chip / icon button shown in each screen header.
- The login / sign-up modal and its transient toast ("flash") messages.
- The **auth-required wall** shown on `todo.html` to signed-out visitors.

### `todo.css`
Styles specific to the Task Manager (`todo.html`): the task list, filter
chips, the task editor form, recurrence panels (weekly / interval / once), and
the icon picker grid.

### `dashboard.css`
Styles specific to the Insights dashboard (`dashboard.html`). Inherits palette
and base typography from `styles.css`; adds the dashboard shell, tab bar, chart
cards, and range/navigator controls.

## Cache busting

HTML references append a `?v=N` query string (e.g. `styles.css?v=41`). Bump the
number when you change a file so browsers and GitHub Pages fetch the new copy.
