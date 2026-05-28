// ─────────────────────────────────────────────────────────────────────────────
// Test mirror of the pure functions from app.js renderTaskView() and helpers.
//
// PURPOSE
//   app.js is a single 1100-line IIFE that mixes pure scheduling logic with
//   DOM rendering and the Storage layer. We cannot require() it directly in
//   Node, so this module re-implements every PURE helper verbatim. The
//   `sync-check.test.js` suite asserts that the corresponding code in app.js
//   has not drifted from these expectations (regex/structural checks).
//
// HOW TO KEEP THIS FILE IN SYNC WITH app.js
//   Any time you change one of the following in app.js, mirror the change
//   here AND verify that sync-check.test.js still passes:
//
//     • parseLocalDateKey       (app.js ~L172) — iOS 12 Safari local-midnight
//     • getLogicalDate          (app.js ~L187)
//     • getLogicalHour          (app.js ~L202) — bug #1 fix
//     • isWithinTimeWindow      (app.js ~L220)
//     • isExpiredTimeWindow     (app.js ~L225)
//     • slugifyTime             (app.js ~L211)
//     • getOnceRange            (app.js ~L368)
//     • onceRangeLength         (app.js ~L379)
//     • onceRangeDayIndex       (app.js ~L386)
//     • isTaskForDate           (app.js ~L393)
//     • nextOccurrenceDate      (app.js ~L455)
//     • lastScheduledBefore     (app.js ~L464)
//     • carryWindowDays         (app.js ~L474)
//     • renderTaskView          (app.js ~L489) — the orchestrator
//
// Anything that touches the DOM, Storage, focus, etc. STAYS in app.js and is
// NOT covered here — only behavior of the pure data pipeline.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var MAX_CARRY_DAYS = 14;

// ── Date primitives ─────────────────────────────────────────────────────────

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function getDateKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

// Local-midnight parser. Replaces `new Date('YYYY-MM-DDT00:00:00')` which
// iOS 12 Safari interprets as UTC and shifts the day in non-UTC zones.
// (Regression covered by `iPad UTC date shift` group below.)
function parseLocalDateKey(key) {
  if (!key || typeof key !== 'string') return new Date(NaN);
  var p = key.split('-');
  if (p.length < 3) return new Date(NaN);
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date(NaN);
  return new Date(y, m - 1, d);
}

// Logical day rolls back to yesterday between 00:00 and 00:59 so a habit board
// still belongs to "today" until the cutoff at 1 AM.
function getLogicalDate(clock) {
  var n = new Date(clock.getTime());
  if (n.getHours() < 1) n.setDate(n.getDate() - 1);
  return n;
}

// Logical hour ∈ [1, 24]. Between 00:00–00:59 returns 24..24.99 so time-slot
// predicates work after midnight when the logical date is still yesterday.
function getLogicalHour(clock) {
  var h = clock.getHours();
  return h < 1 ? 24 + h : h;
}

function slugifyTime(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Wrap-around slots (e.g. 22→1) are normalized to slot.to + 24 so a single
// inclusive/exclusive comparison handles both cases.
function isWithinTimeWindow(slot, logicalHour) {
  var end = slot.from <= slot.to ? slot.to : slot.to + 24;
  return logicalHour >= slot.from && logicalHour < end;
}

function isExpiredTimeWindow(slot, logicalHour) {
  var end = slot.from <= slot.to ? slot.to : slot.to + 24;
  return logicalHour >= end;
}

// ── Frequency / scheduling ──────────────────────────────────────────────────

// Normalizes legacy {date} (single-day) and new {startDate,endDate} (span).
function getOnceRange(task) {
  if (!task || !task.frequency || task.frequency.type !== 'once') return null;
  var f = task.frequency;
  var s = f.startDate || f.date;
  if (!s) return null;
  var e = f.endDate || f.date || s;
  if (e < s) e = s;
  return { startDate: s, endDate: e };
}

function onceRangeLength(range) {
  if (!range) return 0;
  var s = parseLocalDateKey(range.startDate);
  var e = parseLocalDateKey(range.endDate);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function onceRangeDayIndex(range, dateKey) {
  if (!range || dateKey < range.startDate || dateKey > range.endDate) return 0;
  var s = parseLocalDateKey(range.startDate);
  var d = parseLocalDateKey(dateKey);
  return Math.round((d.getTime() - s.getTime()) / 86400000) + 1;
}

function isTaskForDate(task, date) {
  var f = task.frequency;
  if (!f || f.type === 'daily') return true;
  if (f.type === 'weekly') return f.days.indexOf(date.getDay()) !== -1;
  if (f.type === 'interval') {
    var startDate = parseLocalDateKey(f.startDate);
    var nd = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var ns = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    var weeks = Math.floor((nd.getTime() - ns.getTime()) / (7 * 86400000));
    return weeks >= 0 && weeks % f.every === 0 && date.getDay() === f.day;
  }
  if (f.type === 'once') {
    var r = getOnceRange(task);
    if (!r) return false;
    var k = getDateKey(date);
    return k >= r.startDate && k <= r.endDate;
  }
  return false;
}

function nextOccurrenceDate(task, fromDate) {
  var c = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  for (var i = 0; i < 366; i += 1) {
    if (isTaskForDate(task, c)) return new Date(c.getTime());
    c.setDate(c.getDate() + 1);
  }
  return null;
}

function lastScheduledBefore(task, beforeDate, maxLookback) {
  var c = new Date(beforeDate.getFullYear(), beforeDate.getMonth(), beforeDate.getDate());
  c.setDate(c.getDate() - 1);
  for (var i = 0; i < maxLookback; i += 1) {
    if (isTaskForDate(task, c)) return new Date(c.getTime());
    c.setDate(c.getDate() - 1);
  }
  return null;
}

function carryWindowDays(task, scheduledDate) {
  if (!task.frequency || task.frequency.type === 'daily') return 0;
  if (task.frequency.type === 'once') return MAX_CARRY_DAYS;
  var da = new Date(scheduledDate.getTime()); da.setDate(da.getDate() + 1);
  var nx = nextOccurrenceDate(task, da);
  if (!nx) return MAX_CARRY_DAYS;
  var gap = Math.round((nx.getTime() - scheduledDate.getTime()) / 86400000);
  var w = Math.ceil(gap / 4);
  if (w < 2) w = 2;
  if (w > MAX_CARRY_DAYS) w = MAX_CARRY_DAYS;
  return w;
}

// ── renderTaskView (pure subset) ────────────────────────────────────────────
//
// Inputs:
//   bucket      — array of task definitions (myday or work category)
//   clock       — Date instance representing wall-clock "now"
//   stateByDay  — { 'YYYY-MM-DD': { taskId: true, ... } } — per-day checkmarks
//                  (composite IDs for time-slots & multi-day-once-day catch-ups)
//
// Output:
//   { visible: Task[], caughtUp: Task[], dateKey, logicalHour }
//
// A task in the result has shape:
//   { id, title, timeLabel?, missed?, missedDateKey?, parentTaskId? }

function renderTaskView(bucket, clock, stateByDay) {
  var logicalDate = getLogicalDate(clock);
  var logicalHour = getLogicalHour(clock);
  var dateKey = getDateKey(logicalDate);
  var todayState = stateByDay[dateKey] || {};
  function readState(dk) { return stateByDay[dk] || {}; }

  var todayTasks = [];
  for (var i = 0; i < bucket.length; i += 1) {
    if (isTaskForDate(bucket[i], logicalDate)) todayTasks.push(bucket[i]);
  }

  var expanded = [], missed = [];
  for (i = 0; i < todayTasks.length; i += 1) {
    var task = todayTasks[i];
    if (task.times && task.times.length > 0) {
      for (var t = 0; t < task.times.length; t += 1) {
        var slot = task.times[t];
        var cid = task.id + '__' + slugifyTime(slot.label);
        if (isWithinTimeWindow(slot, logicalHour)) {
          expanded.push({ id: cid, title: task.title, timeLabel: slot.label });
        } else if (isExpiredTimeWindow(slot, logicalHour)) {
          // Always push expired slots; visible-vs-CaughtUp split runs later.
          missed.push({ id: cid, title: task.title, timeLabel: slot.label, missed: true });
        }
      }
    } else if (task.frequency && task.frequency.type === 'once') {
      var range = getOnceRange(task);
      var todayKey = getDateKey(logicalDate);
      var totalDays = onceRangeLength(range);
      if (totalDays > 1) {
        expanded.push({
          id: task.id,
          title: task.title,
          timeLabel: 'Day ' + onceRangeDayIndex(range, todayKey) + ' of ' + totalDays
        });
      } else {
        expanded.push({ id: task.id, title: task.title });
      }
    } else {
      expanded.push({ id: task.id, title: task.title });
    }
  }

  var todayTaskIds = {};
  for (i = 0; i < todayTasks.length; i += 1) todayTaskIds[todayTasks[i].id] = true;

  var carry = [];

  // Excludes today on purpose: a same-day tick goes through the Caught-Up
  // split, not the carry-forward filter.
  function wasEverCompleted(taskId, fromDate, throughDate) {
    var c = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    var end = new Date(throughDate.getFullYear(), throughDate.getMonth(), throughDate.getDate());
    end.setDate(end.getDate() - 1);
    while (c.getTime() <= end.getTime()) {
      if (readState(getDateKey(c))[taskId]) return true;
      c.setDate(c.getDate() + 1);
    }
    return false;
  }

  // Per-day caught-up channel for multi-day once spans (composite id).
  // Excludes today (same reason as wasEverCompleted).
  function wasOnceDayCaughtUp(task, missedDateKey, todayDate) {
    var compositeId = task.id + '#' + missedDateKey;
    var cur = parseLocalDateKey(missedDateKey); cur.setDate(cur.getDate() + 1);
    var end = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    end.setDate(end.getDate() - 1);
    while (cur.getTime() <= end.getTime()) {
      if (readState(getDateKey(cur))[compositeId]) return true;
      cur.setDate(cur.getDate() + 1);
    }
    return false;
  }

  function pushCarryForward(task) {
    carry.push({ id: task.id, title: task.title, missed: true });
  }
  function pushCarryForwardOnceDay(task, range, missedDateKey, total) {
    carry.push({
      id: task.id + '#' + missedDateKey,
      title: task.title,
      timeLabel: 'Day ' + onceRangeDayIndex(range, missedDateKey) + ' of ' + total + ' \u2014 Missed',
      missed: true,
      missedDateKey: missedDateKey,
      parentTaskId: task.id
    });
  }

  var todayNorm = new Date(logicalDate.getFullYear(), logicalDate.getMonth(), logicalDate.getDate());

  for (i = 0; i < bucket.length; i += 1) {
    var b = bucket[i];
    if (b.times && b.times.length > 0) continue;
    if (!b.frequency || b.frequency.type === 'daily') continue;

    if (b.frequency.type === 'once') {
      var r2 = getOnceRange(b);
      if (!r2) continue;
      var spanLen = onceRangeLength(r2);
      var isSpan = spanLen > 1;
      var startD = parseLocalDateKey(r2.startDate);
      var endD = parseLocalDateKey(r2.endDate);
      var lastInspect = new Date(todayNorm.getTime()); lastInspect.setDate(lastInspect.getDate() - 1);
      if (endD.getTime() < lastInspect.getTime()) lastInspect = endD;
      var d = new Date(startD.getTime());
      while (d.getTime() <= lastInspect.getTime()) {
        var dKey = getDateKey(d);
        var since = Math.round((todayNorm.getTime() - d.getTime()) / 86400000);
        if (since < 1 || since > MAX_CARRY_DAYS) { d.setDate(d.getDate() + 1); continue; }
        var sd = readState(dKey);
        if (sd[b.id]) { d.setDate(d.getDate() + 1); continue; }
        if (isSpan && wasOnceDayCaughtUp(b, dKey, todayNorm)) { d.setDate(d.getDate() + 1); continue; }
        if (isSpan) {
          pushCarryForwardOnceDay(b, r2, dKey, spanLen);
        } else if (!todayTaskIds[b.id] && !wasEverCompleted(b.id, d, todayNorm)) {
          pushCarryForward(b);
        }
        d.setDate(d.getDate() + 1);
      }
      continue;
    }

    if (todayTaskIds[b.id]) continue;
    var scheduled = lastScheduledBefore(b, todayNorm, MAX_CARRY_DAYS);
    if (!scheduled) continue;
    var daysSince = Math.round((todayNorm.getTime() - scheduled.getTime()) / 86400000);
    if (daysSince < 1) continue;
    var w2 = carryWindowDays(b, scheduled);
    if (w2 <= 0 || daysSince > w2) continue;
    if (wasEverCompleted(b.id, scheduled, todayNorm)) continue;
    pushCarryForward(b);
  }

  expanded.sort(function (a, b) { return (a.timeLabel ? 0 : 1) - (b.timeLabel ? 0 : 1); });

  var all = expanded.concat(carry).concat(missed);
  var visible = [], caughtUp = [];
  for (i = 0; i < all.length; i += 1) {
    var x = all[i];
    if (x.missed && todayState[x.id]) caughtUp.push(x);
    else visible.push(x);
  }

  return { visible: visible, caughtUp: caughtUp, dateKey: dateKey, logicalHour: logicalHour };
}

module.exports = {
  MAX_CARRY_DAYS: MAX_CARRY_DAYS,
  getDateKey: getDateKey,
  parseLocalDateKey: parseLocalDateKey,
  getLogicalDate: getLogicalDate,
  getLogicalHour: getLogicalHour,
  slugifyTime: slugifyTime,
  isWithinTimeWindow: isWithinTimeWindow,
  isExpiredTimeWindow: isExpiredTimeWindow,
  getOnceRange: getOnceRange,
  onceRangeLength: onceRangeLength,
  onceRangeDayIndex: onceRangeDayIndex,
  isTaskForDate: isTaskForDate,
  nextOccurrenceDate: nextOccurrenceDate,
  lastScheduledBefore: lastScheduledBefore,
  carryWindowDays: carryWindowDays,
  renderTaskView: renderTaskView
};
