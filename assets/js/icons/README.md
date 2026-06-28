# `assets/js/icons/`

The SVG icon catalogue used by the Task Manager's icon picker. Declares
`window.ICON_LIBRARY` as an array of `{ id, name, category, tags, svg }`
objects, grouped by category (Health, Fitness, Food, Mind, Home, …). The
`tags` feed the picker's search; `category` feeds its filter chips.

## Files

### `icon-library-color.js` (active)
The full-colour icon set: multi-stop gradients, layered fills, decorative
highlights. This is the only catalogue the live app uses — it is loaded by
`todo.html` and the seeding tools.
