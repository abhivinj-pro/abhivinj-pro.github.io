# `assets/js/pages/`

Per-page controllers — the top of each page's script stack. Each one is an IIFE
that wires DOM elements to the shared singletons (`Storage`, `Auth`, `AuthUI`)
and owns all rendering for its page. All are ES5 / iOS 9 Safari safe (no
template literals, arrow functions, or `fetch`).

## Files

### `app.js` — Morning / My Day / Work / Clock (`index.html`, `tools/deployed.html`)
The main app-shell controller. Reads `Storage.tasks`, splits them into
buckets, renders cards, and drives the live clock.

Responsibilities & notable internals:

- **Task bucketing** — `rebuildTaskBuckets()` re-derives `morningHabits`,
  `mydayTasks`, and `workTasks` from `Storage.tasks` on every change, skipping
  `archived` tasks.
- **Date/time primitives** (mirrored by the test suite — keep them in sync):
  `parseLocalDateKey` (local-midnight parser that avoids the iPad UTC day-shift
  bug), `getLogicalDate` / `getLogicalHour` (the **1:00 AM logical-midnight**
  cutoff so taps just after midnight still count toward the previous day),
  `slugifyTime`, `isWithinTimeWindow`, `isExpiredTimeWindow`.
- **Scheduling** — `isTaskForDate`, `nextOccurrenceDate`, `lastScheduledBefore`,
  `getOnceRange` / `onceRangeLength` / `onceRangeDayIndex` for one-time spans,
  and `carryWindowDays` (how long a missed task keeps surfacing, capped at
  `MAX_CARRY_DAYS = 14`).
- **`renderTaskView()`** — the orchestrator that produces the visible vs.
  "Caught Up" split, including carry-forward of missed tasks.
- **Clock & calendar** — live time render and the monthly calendar panel.
- **My Day quote** — fetches `resources/quotes.txt` (document-relative) and
  shows a rotating quote when the day is complete.
- **Completion sounds** — plays `resources/task-completed.wav` /
  `resources/terminate-selection.wav`.
- **Demo banner** — toggled when `Storage.mode === 'demo'`.

> The pure helpers above are re-implemented in
> [`../../../tests/task-engine.js`](../../../tests/task-engine.js) and guarded
> against drift by `tests/sync-check.test.js`. Change one, update both.

### `todo.js` — Task Manager (`todo.html`)
Full CRUD for the task list plus the editor UI.

- Add / edit / delete / reorder tasks; persists via `Storage.saveTasks`.
- Task editor: name, category, accent colour, **icon picker** (search/filter
  over `window.ICON_LIBRARY`), recurrence editor (daily / weekly / interval /
  once), and time-slot assignment.
- Category filter chips and a cloud sync-status indicator.
- **Archive lifecycle** — `isArchivedOnceTask` (a 14-day grace window for
  one-time tasks), `loadTasks` reconciliation (auto-archives expired
  once-tasks, never auto-archives recurring ones, honours the
  `manuallyArchived` / `manuallyUnarchived` flags), and the
  `archiveTask` / `unarchiveTask` helpers. Covered by
  [`../../../tests/archive.test.js`](../../../tests/archive.test.js).

### `dashboard.js` — Insights page controller (`dashboard.html`)
Owns tab routing (via `location.hash`), the date-range chip, the week/month
navigators, and per-tab render orchestration. Pulls aggregates from
`window.DashboardData` and SVG primitives from `window.DashboardCharts`.
Tabs: `overview`, `tasks`, `week`, `month`, `categories`.

### `dashboard-data.js` → `window.DashboardData`
The analytics aggregation layer. Loads day-state docs via
`Storage.ensureDayLoaded` across the selected range and derives a shared
`dailyStatus[dateKey][taskId]` table. Re-implements recurrence locally
(mirroring `app.js#isTaskForDate`) so the dashboard need not load `app.js`.

Excludes `archived` tasks, `once`-type tasks, and the `Work` category by
product decision. Public methods include `load(rangeDays, onProgress)`,
`completionRate`, `currentStreak` / `longestStreak`, `perfectDayStreak`,
`weekdayStrength`, `categoryBreakdown`, `topPerformers`, `atRisk`,
`recentMisses`, and `weekTrend`.

### `dashboard-charts.js` → `window.DashboardCharts`
Hand-rolled inline-SVG chart primitives (no chart library). Each mounts into a
container by replacing its children with an `<svg>`:
`barChart`, `stackedBarChart`, `lineChart`, `donutChart`, `sparkline`,
`heatmap`. Accent strings (`pink`, `blue`, `green`, `cyan`, `amber`, `purple`)
map to the same hexes used by the `accent-*` classes in `styles.css`.

## Load order within a page

`dashboard.html` must load `dashboard-charts.js` and `dashboard-data.js`
**before** `dashboard.js` (the controller calls into both globals).
