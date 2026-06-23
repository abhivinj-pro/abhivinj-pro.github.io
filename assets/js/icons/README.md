# `assets/js/icons/`

SVG icon catalogues used by the Task Manager's icon picker. Each file declares
`window.ICON_LIBRARY` as an array of `{ id, name, category, tags, svg }`
objects, grouped by category (Health, Fitness, Food, Mind, Home, …). The
`tags` feed the picker's search; `category` feeds its filter chips.

> **Both files define the same global (`window.ICON_LIBRARY`).** Whichever is
> loaded **last wins**, so a page must include exactly one of them.

## Files

### `icon-library-color.js` (active)
The full-colour icon set: multi-stop gradients, layered fills, decorative
highlights. This is the catalogue the live app uses — it is the one loaded by
`todo.html` and the seeding tools.

### `icon-library.js` (monochrome variant)
The original single-stroke, `currentColor` outline set (same ids/names/tags,
different `svg`). Kept for reference / as an alternate theme. It is **not
referenced by any current HTML page**; including it instead of the colour file
would render flat outline icons.
