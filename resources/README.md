# `resources/`

Static media and data files referenced at runtime by the app. Paths to these
are **document-relative** (resolved from the page URL at the repo root), so the
files live here at `resources/<name>` regardless of where the referencing JS or
CSS sits.

## Files

| File | Used by | Purpose |
|---|---|---|
| `quotes.txt` | `assets/js/pages/app.js` (`fetch`) | One motivational quote per line; shown on My Day when the day is complete. |
| `missed.svg` | `assets/css/styles.css` (`background-image`) | Badge overlaid on missed task cards. |
| `task-completed.wav` | `assets/js/pages/app.js` (`Audio`) | Plays when a task is checked off. |
| `terminate-selection.wav` | `assets/js/pages/app.js` (`Audio`) | Plays when a task is un-checked. |
| `skincare-svgrepo-com.svg` | (icon source art) | Reference SVG art. |
| `sampleimage.jpg`, `Screenshot *.png` | docs / preview | Reference screenshots, not loaded by the app. |

## Note on paths

`app.js` references these as `resources/quotes.txt` etc. — relative to the HTML
**document**, not to `app.js`. That is why the utility pages in
[`../tools/`](../tools/) set `<base href="../">`: it makes those
document-relative lookups resolve from the repo root even though the page file
lives one level down.
