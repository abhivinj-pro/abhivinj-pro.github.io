/*
 * task-progress.js — single source of truth for measurable-habit progress.
 *
 * A task is "measurable" when it carries a `measure` block:
 *   task.measure = { target, unit, unitLabel, step }
 * Its absence means the task is a plain binary (done / not-done) task, so every
 * existing task keeps working unchanged.
 *
 * Completion is modelled uniformly as a fraction `value / goal`:
 *   - binary      -> 0/1 or 1/1
 *   - measurable  -> logged units / target
 * The dashboard already consumes this fraction (doneCount / slotCount), so the
 * same numbers flow everywhere.
 *
 * Day-state entry shapes (stored under state[taskId]):
 *   - binary:      true | false            (unchanged)
 *   - measurable:  { v: <value>, g: <goalSnapshot> }
 * Legacy/interop shapes are tolerated on read (see readEntry).
 *
 * Exposes a single global: window.TaskProgress
 * ES5 / older-Safari safe (no arrow functions, template literals or fetch).
 * Mirrored by tests/task-engine.js — keep the two in sync.
 */
(function () {
  // Unit catalogue for the editor. `plural` is the display label; `step` is the
  // default quick-add increment. Purely presentational — the task stores its own
  // `unitLabel`, so unknown/custom units still work.
  var UNITS = [
    { key: 'glass',   singular: 'glass',   plural: 'glasses',  step: 1,   group: 'Count' },
    { key: 'cup',     singular: 'cup',     plural: 'cups',     step: 1,   group: 'Count' },
    { key: 'bottle',  singular: 'bottle',  plural: 'bottles',  step: 1,   group: 'Count' },
    { key: 'serving', singular: 'serving', plural: 'servings', step: 1,   group: 'Count' },
    { key: 'page',    singular: 'page',    plural: 'pages',    step: 1,   group: 'Count' },
    { key: 'item',    singular: 'item',    plural: 'items',    step: 1,   group: 'Count' },
    { key: 'rep',     singular: 'rep',     plural: 'reps',     step: 1,   group: 'Count' },
    { key: 'set',     singular: 'set',     plural: 'sets',     step: 1,   group: 'Count' },
    { key: 'session', singular: 'session', plural: 'sessions', step: 1,   group: 'Count' },
    { key: 'step',    singular: 'step',    plural: 'steps',    step: 100, group: 'Count' },
    { key: 'ml',      singular: 'ml',      plural: 'ml',       step: 50,  group: 'Volume' },
    { key: 'l',       singular: 'L',       plural: 'L',        step: 1,   group: 'Volume' },
    { key: 'km',      singular: 'km',      plural: 'km',       step: 1,   group: 'Distance' },
    { key: 'mi',      singular: 'mi',      plural: 'mi',       step: 1,   group: 'Distance' },
    { key: 'min',     singular: 'min',     plural: 'min',      step: 5,   group: 'Duration' },
    { key: 'hour',    singular: 'hour',    plural: 'hours',    step: 1,   group: 'Duration' },
    { key: 'g',       singular: 'g',       plural: 'g',        step: 5,   group: 'Mass' },
    { key: 'kg',      singular: 'kg',      plural: 'kg',       step: 1,   group: 'Mass' },
    { key: 'kcal',    singular: 'kcal',    plural: 'kcal',     step: 50,  group: 'Energy' },
    { key: 'percent', singular: '%',       plural: '%',        step: 5,   group: 'Other' },
    { key: 'custom',  singular: '',        plural: '',         step: 1,   group: 'Custom' }
  ];

  var UNIT_BY_KEY = {};
  for (var i = 0; i < UNITS.length; i += 1) { UNIT_BY_KEY[UNITS[i].key] = UNITS[i]; }

  function isMeasurable(task) {
    return !!(task && task.measure && Number(task.measure.target) > 0);
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return (isFinite(n)) ? n : fallback;
  }

  // Interpret a stored day-state entry for a task.
  // Returns { value, goal, fraction, done, isMeasurable }.
  function readEntry(raw, task) {
    if (!isMeasurable(task)) {
      var on = !!raw;
      return { value: on ? 1 : 0, goal: 1, fraction: on ? 1 : 0, done: on, isMeasurable: false };
    }
    var target = toNumber(task.measure.target, 0);
    var value = 0;
    var goal = target;
    if (raw === true) {
      value = target;                 // legacy "complete" flag
    } else if (typeof raw === 'number') {
      value = raw;                    // bare number, no snapshot
    } else if (raw && typeof raw === 'object') {
      value = toNumber(raw.v, 0);
      goal = toNumber(raw.g, target); // honour the snapshot
    }
    if (value < 0) { value = 0; }
    if (goal <= 0) { goal = target > 0 ? target : 1; }
    var fraction = value / goal;
    return {
      value: value,
      goal: goal,
      fraction: fraction,
      done: value >= goal,
      isMeasurable: true
    };
  }

  // Produce the value to persist after setting a measurable task to `newValue`.
  // Snapshots the goal on first write and preserves it thereafter, so raising
  // the target later never rewrites history.
  function writeEntry(currentRaw, task, newValue) {
    if (!isMeasurable(task)) {
      return !!newValue;
    }
    var value = toNumber(newValue, 0);
    if (value < 0) { value = 0; }
    var goal = (currentRaw && typeof currentRaw === 'object' && isFinite(Number(currentRaw.g)))
      ? Number(currentRaw.g)
      : toNumber(task.measure.target, 0);
    return { v: value, g: goal };
  }

  // Current numeric value from a raw entry (convenience for +/- handlers).
  function valueOf(raw, task) {
    return readEntry(raw, task).value;
  }

  // The +/- increment for a task.
  function stepOf(task) {
    if (!isMeasurable(task)) { return 1; }
    var s = toNumber(task.measure.step, 1);
    return s > 0 ? s : 1;
  }

  // Display label for the unit (plural), from the task or the catalogue.
  function unitLabel(task) {
    if (!isMeasurable(task)) { return ''; }
    if (task.measure.unitLabel) { return task.measure.unitLabel; }
    var u = UNIT_BY_KEY[task.measure.unit];
    return u ? u.plural : '';
  }

  // Format a numeric value with thousands separators (e.g. 8000 -> "8,000").
  function formatNumber(value) {
    var n = toNumber(value, 0);
    var neg = n < 0;
    var s = String(Math.abs(n));
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  // Whole-number percent of goal (uncapped, so over-achievement shows > 100).
  function percent(raw, task) {
    var e = readEntry(raw, task);
    if (e.goal <= 0) { return 0; }
    return Math.round((e.value / e.goal) * 100);
  }

  // Suggested quick-add increments for large goals (used instead of a stepper).
  function quickAdds(task) {
    var s = stepOf(task);
    var chips = [s, s * 5, s * 10];
    // De-dupe while preserving order.
    var seen = {};
    var out = [];
    for (var k = 0; k < chips.length; k += 1) {
      var v = chips[k];
      if (!seen[v]) { seen[v] = true; out.push(v); }
    }
    return out;
  }

  // Whether to present quick-add chips (large/coarse goals) instead of a
  // single-increment stepper.
  function usesChips(task) {
    if (!isMeasurable(task)) { return false; }
    return toNumber(task.measure.target, 0) > 20 || stepOf(task) >= 10;
  }

  window.TaskProgress = {
    UNITS: UNITS,
    isMeasurable: isMeasurable,
    readEntry: readEntry,
    writeEntry: writeEntry,
    valueOf: valueOf,
    stepOf: stepOf,
    unitLabel: unitLabel,
    formatNumber: formatNumber,
    percent: percent,
    quickAdds: quickAdds,
    usesChips: usesChips
  };
}());
