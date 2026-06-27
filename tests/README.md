# Task Engine Test Suite

Zero-dependency Node test suite for the pure scheduling / carry-forward logic
inside `app.js`. Run on a fresh clone with:

```powershell
node tests/run.js
# or
npm test
```

No `npm install` step — the harness is hand-rolled and uses only Node stdlib.

---

## What this suite is for

`app.js` is a single 1100-line IIFE that mixes pure scheduling logic with
DOM rendering and the Storage layer. The scheduling logic has historically
been the source of subtle, hard-to-reproduce bugs (logical-day rollover at
midnight, iPad/iOS 12 UTC date shifts, once-task resurrection, multi-day span
catch-ups). This suite locks down the **observable behavior** of that logic
so future changes do not silently regress any of those fixes.

The suite is intentionally **focused on data behavior** — it does not test
DOM rendering, Firestore sync, login flows, or the Storage layer. Those are
integration concerns and would require a browser environment.

---

## How it is organized

```
tests/
├── run.js                       # Entry point; auto-discovers *.test.js
├── harness.js                   # Zero-dep describe / it / assert
├── task-engine.js               # Mirror of pure helpers from app.js
├── date-primitives.test.js      # Date / time / logical-hour primitives
├── scheduling.test.js           # Frequency types, isTaskForDate, carry window math
├── render-task-view.test.js     # End-to-end renderTaskView scenarios
├── archive.test.js              # Stale once-task archival grace window
├── backfill.test.js             # Backward date nav (past days, daily-only view)
├── forward.test.js              # Forward date nav (future days, plan-ahead view)
└── sync-check.test.js           # Regex guards against drift in app.js
```

### Why a "mirror" file (`task-engine.js`)?

`app.js` is wrapped in an IIFE that captures `window`, `document`, and
`Storage` — it cannot be `require()`d from Node. The pragmatic solution is
to maintain a Node-importable mirror of every **pure** helper and verify the
two stay in sync via `sync-check.test.js` (regex assertions on the
load-bearing shapes inside `app.js`).

### Sync policy (READ THIS BEFORE CHANGING `app.js`)

If you modify any of these functions in `app.js`, you must:

1. Mirror the change in `tests/task-engine.js`.
2. Run `node tests/run.js` and confirm both behavior tests AND the
   `source-sync` guard tests pass.
3. If the sync-check regex catches a legitimate refactor, update the regex
   in `sync-check.test.js` together with the mirror — never silence a
   sync-check by deleting it without a replacement.

Functions covered by sync checks:

| `app.js` function       | What the mirror assumes                                              |
|-------------------------|----------------------------------------------------------------------|
| `parseLocalDateKey`     | Local-midnight constructor (NOT `new Date(s + 'T00:00:00')`)         |
| `getLogicalDate`        | Always the calendar day (midnight rollover, no rollback)            |
| `getLogicalHour`        | Raw wall-clock hour 0–23                                             |
| `isWithinTimeWindow`    | Wrap-around normalized via `slot.to + 24`                            |
| `isExpiredTimeWindow`   | Wrap-around normalized via `slot.to + 24`                            |
| `getOnceRange`          | Normalizes legacy `{date}` and new `{startDate, endDate}`            |
| `onceRangeLength/Index` | Use `parseLocalDateKey` (no `T00:00:00`)                             |
| `isTaskForDate`         | 4 frequency types; once-range inclusive                              |
| `nextOccurrenceDate`    | Forward scan, 366 days max                                           |
| `lastScheduledBefore`   | Backward scan, `maxLookback` days                                    |
| `carryWindowDays`       | `ceil(gap/4)` clamped to `[2, MAX_CARRY_DAYS]`, daily=0, once=14     |
| `wasEverCompleted`      | Excludes today (range `[from, throughDate-1]`)                       |
| `wasOnceDayCaughtUp`    | Excludes today (be30e0a fix)                                         |
| `renderTaskView`        | Uses `getLogicalHour()` (bug #1); single-day once calls `wasEverCompleted` (bug #2) |
| `isHistoricalView`      | Past-only: `viewDateKey < todayLogicalKey()`                        |
| `isFutureView`          | Future-only: `viewDateKey > todayLogicalKey()`                      |
| `minBackfillKey` / `maxForwardKey` | Floor = today − 7; ceiling = today + 7                   |
| `stepViewDate`          | Clamped to `[floor, ceiling]`; today → `null`                       |
| `buildHistoricalCards`  | Daily-only, multi-slot expanded (past view)                         |
| `buildFutureCards`      | All scheduled (`isTaskForDate`), once "Day X of N", slot-expanded   |

---

## Coverage map

### Frequency types
- **daily** — never carried; always visible today.
- **weekly** — `{ days: [0..6] }`; carry window = `ceil(gap/4)` clamped to ≥2.
- **interval** — every Nth week on a given weekday from a start date.
- **once** — single-day (`{date}` legacy or `{startDate=endDate}`) AND
  multi-day span (`{startDate, endDate}`).
- **multi-time-slot** (orthogonal to frequency) — `times: [{label, from, to}]`
  with per-slot composite IDs; supports wrap-around slots like `22→1`.

### UI sections (per task)
- **Today's card** — active or future task scheduled for today.
- **Missed** — past-but-uncompleted instance, within its carry window.
- **Caught Up** — `task.missed === true && state[task.id] === true`.

### Time-of-day transitions (Eye Drops 6-slot scenario)
| Wall clock | Logical date | Logical hour | Behavior |
|------------|--------------|--------------|----------|
| 09:00      | today        | 9            | First active |
| 14:00      | today        | 14           | Third active; First+Second Missed |
| 23:30      | today        | 23           | Sixth active (wrap-around) |
| 00:10      | **today**    | **0**        | New day already rolled; board empty (all slots future) |
| 00:50      | **today**    | **0**        | Same as above |
| 01:00      | today        | 1            | All of today's slots future |
| 01:30      | today        | 1            | Empty board (all slots future) |

### Carry-forward window math
| Frequency           | Gap | Window W |
|---------------------|-----|----------|
| daily               | 1   | 0        |
| 2x/week (Mon+Thu)   | 3   | 2        |
| weekly              | 7   | 2        |
| biweekly            | 14  | 4        |
| monthly             | 28  | 7        |
| quarterly+          | ≥56 | 14 (cap) |
| once (any)          | ∞   | 14 (cap) |

### Date navigation (board stepping)
The board can step off "today" in either direction (`stepViewDate`), clamped
to a 7-day window on each side. The two directions are deliberately different:

| Direction | Predicate         | View shows                                  | Why |
|-----------|-------------------|---------------------------------------------|-----|
| Past      | `isHistoricalView`| DAILY tasks only (`buildHistoricalCards`)   | Weekly/interval/once misses are carried forward onto the live board, so the past view only needs the dailies that can't be caught up otherwise. |
| Future    | `isFutureView`    | ALL scheduled tasks (`buildFutureCards`)    | Plan-ahead: preview everything due that day and optionally tick it early. |

- Floor = logical today − 7 (`minBackfillKey`); ceiling = logical today + 7
  (`maxForwardKey`); stepping onto today returns `null` (live mode).
- A tick on a non-today day reads/writes that day's doc via `boardDateKey`.
- Future early-completion uses the **same** id scheme the live board will use
  for that date (multi-slot → `id__<slot>`, multi-day once → bare `task.id`
  with a "Day X of N" badge, else bare task) so the tick is recognized when
  the day actually arrives. `forward.test.js` asserts this id parity.

### Regression-named tests (named after the commits / bugs they guard)
- **iPad UTC date shift** (commit 448a41e) — `parseLocalDateKey` does not
  shift the day in non-UTC zones; once-task span helpers use it.
- **Multi-day once support** (commit 2e59507) — per-day composite-ID missed
  entries; "Day X of N" badges; legacy single-day shape preserved.
- **Multi-day catch-up flow** (commit be30e0a) — `wasOnceDayCaughtUp`
  excludes today so a same-day catch-up routes to Caught Up instead of
  vanishing.
- **Bug #1: midnight logical-hour** — historical guard. With the midnight
  rollover, the 00:00–00:59 window belongs to the new day (where prior-day
  slots are correctly "future"), so multi-time slots no longer vanish.
- **Bug #2: once-task resurrection** — single-day once tasks ticked late
  (D+1) stay gone on D+2..D+14 instead of re-appearing as Missed each day
  after the midnight rollover.

### Cross-cutting invariants (always-true, regardless of input)
- No task ID appears in both `visible` and `caughtUp`.
- Every `caughtUp` entry has `missed === true`.
- `renderTaskView` is pure: does not mutate the input state or bucket.
- Two calls with identical inputs return deeply-equal outputs (idempotency).

---

## Adding new tests

1. Pick (or create) a `*.test.js` file by category.
2. Use the harness:
   ```js
   var t = require('./harness');
   var E = require('./task-engine');
   t.describe('group name :: subgroup', function () {
     t.it('what it should do', function () {
       var r = E.renderTaskView([/* tasks */], new Date(2026, 4, 30, 12, 0), {/* state */});
       t.assert.ok(/* condition */, 'why it must hold');
     });
   });
   ```
3. Prefer end-to-end `renderTaskView` calls over unit-poking individual
   helpers — that catches integration regressions that unit tests miss.
4. When fixing a bug, add a test named `BUG #N REGRESSION:` or
   `REGRESSION (commit <sha>):` so future readers can trace it back.

---

## When the suite fails on CI / a teammate's machine

The suite is timezone-agnostic by design (all date arithmetic uses local
`Date` arithmetic, never UTC parsing). If a test passes locally but fails
elsewhere, the most likely cause is a code change in `app.js` that broke
the mirror — check the failing test's source comment, which always points
to the relevant `app.js` line or commit.
