// Tests for the archive lifecycle in todo.js.
//
// COVERAGE
//   1. isArchivedOnceTask — the 14-day grace window for one-time tasks
//   2. reconcileArchivedOnLoad — the loadTasks() reconciliation that:
//        - auto-archives expired once-tasks after 14 days
//        - never auto-archives recurring tasks (daily/weekly/interval)
//        - honors manuallyArchived  (user hit Archive)
//        - honors manuallyUnarchived (user hit Unarchive on historic once)
//        - heals stale `archived:true` written before the 14-day rule
//   3. archiveTask / unarchiveTask flag bookkeeping
//
// These mirror the pure logic in todo.js (~L140-L170 loadTasks,
// ~L270-L295 isArchivedOnceTask, ~L640-L660 archive/unarchive helpers).
// The source-sync section at the bottom guards against drift.

'use strict';

var t = require('./harness');
var fs = require('fs');
var path = require('path');

var ONCE_ARCHIVE_AFTER_DAYS = 14;

// ── Mirrors of todo.js pure helpers ─────────────────────────────────────────

function pad2(n) { return n < 10 ? '0' + n : String(n); }
function getDateKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function dayKeyOffset(fromKey, deltaDays) {
  var parts = fromKey.split('-');
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + deltaDays);
  return getDateKey(d);
}

function getOnceEndDate(task) {
  if (!task || !task.frequency || task.frequency.type !== 'once') { return ''; }
  return task.frequency.endDate || task.frequency.date || task.frequency.startDate || '';
}

function isArchivedOnceTask(task, todayKey) {
  var endDate = getOnceEndDate(task);
  if (!endDate || endDate >= todayKey) { return false; }
  var end = new Date(endDate + 'T00:00:00');
  var today = new Date(todayKey + 'T00:00:00');
  var daysSince = Math.round((today.getTime() - end.getTime()) / (24 * 60 * 60 * 1000));
  return daysSince > ONCE_ARCHIVE_AFTER_DAYS;
}

// Mirror of the per-task reconciliation inside loadTasks().
function reconcileArchivedOnLoad(task, todayKey) {
  var out = JSON.parse(JSON.stringify(task));
  var wasArchived = !!out.archived;
  if (out.frequency && out.frequency.type === 'once') {
    if (out.manuallyArchived) {
      out.archived = true;
    } else if (out.manuallyUnarchived) {
      out.archived = false;
    } else {
      out.archived = isArchivedOnceTask(out, todayKey);
    }
  } else {
    out.archived = wasArchived;
  }
  return out;
}

function archiveTask(task) {
  var out = JSON.parse(JSON.stringify(task));
  out.archived = true;
  out.manuallyArchived = true;
  delete out.manuallyUnarchived;
  return out;
}

function unarchiveTask(task) {
  var out = JSON.parse(JSON.stringify(task));
  out.archived = false;
  delete out.manuallyArchived;
  if (out.frequency && out.frequency.type === 'once') {
    out.manuallyUnarchived = true;
  }
  return out;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

var TODAY = '2026-06-07';

function onceTask(extra) {
  var base = {
    id: 'once-1', title: 'Once', category: 'Work',
    frequency: { type: 'once', startDate: TODAY, endDate: TODAY }
  };
  if (extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); }
  return base;
}

function onceTaskEndingDaysAgo(days, extra) {
  var endDate = dayKeyOffset(TODAY, -days);
  var task = onceTask(Object.assign({
    frequency: { type: 'once', startDate: endDate, endDate: endDate }
  }, extra || {}));
  return task;
}

function dailyTask(extra) {
  var base = {
    id: 'daily-1', title: 'Daily', category: 'Work',
    frequency: { type: 'daily' }
  };
  if (extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); }
  return base;
}

function weeklyTask(extra) {
  var base = {
    id: 'weekly-1', title: 'Weekly', category: 'Work',
    frequency: { type: 'weekly', days: [1, 3, 5] }
  };
  if (extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────

t.describe('archive :: isArchivedOnceTask (14-day grace window)', function () {
  t.it('today\'s once-task is NOT archived', function () {
    t.assert.equal(isArchivedOnceTask(onceTask(), TODAY), false);
  });
  t.it('once-task ending tomorrow is NOT archived', function () {
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(-1), TODAY), false);
  });
  t.it('once-task ending yesterday is NOT archived (within grace)', function () {
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(1), TODAY), false);
  });
  t.it('once-task ending 13 days ago is NOT archived (within grace)', function () {
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(13), TODAY), false);
  });
  t.it('once-task ending exactly 14 days ago is NOT archived (boundary)', function () {
    // daysSince > 14, so 14 itself is still inside the window.
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(14), TODAY), false);
  });
  t.it('once-task ending 15 days ago IS archived', function () {
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(15), TODAY), true);
  });
  t.it('once-task ending months ago IS archived', function () {
    t.assert.equal(isArchivedOnceTask(onceTaskEndingDaysAgo(120), TODAY), true);
  });
  t.it('legacy {date} shape is handled (no endDate field)', function () {
    var legacyOld = { id: 'x', title: 'X', category: 'Work',
      frequency: { type: 'once', date: dayKeyOffset(TODAY, -30) } };
    var legacyToday = { id: 'x', title: 'X', category: 'Work',
      frequency: { type: 'once', date: TODAY } };
    t.assert.equal(isArchivedOnceTask(legacyOld, TODAY), true);
    t.assert.equal(isArchivedOnceTask(legacyToday, TODAY), false);
  });
  t.it('non-once tasks are never auto-archived by this helper', function () {
    t.assert.equal(isArchivedOnceTask(dailyTask(), TODAY), false);
    t.assert.equal(isArchivedOnceTask(weeklyTask(), TODAY), false);
  });
});

t.describe('archive :: reconcileArchivedOnLoad (once-tasks)', function () {
  t.it('expired once-task (>14d) becomes archived on load', function () {
    var out = reconcileArchivedOnLoad(onceTaskEndingDaysAgo(30), TODAY);
    t.assert.equal(out.archived, true);
  });
  t.it('within-grace once-task stays unarchived', function () {
    var out = reconcileArchivedOnLoad(onceTaskEndingDaysAgo(5), TODAY);
    t.assert.equal(out.archived, false);
  });
  t.it('HEALS stale archived:true on a within-grace once-task', function () {
    // This is the bug the user reported: tasks saved with archived:true
    // before the 14-day rule existed were being kept archived forever.
    var stale = onceTaskEndingDaysAgo(2, { archived: true });
    var out = reconcileArchivedOnLoad(stale, TODAY);
    t.assert.equal(out.archived, false, 'stale archived flag must clear');
  });
  t.it('HEALS stale archived:true on a future once-task', function () {
    var stale = onceTaskEndingDaysAgo(-3, { archived: true });
    var out = reconcileArchivedOnLoad(stale, TODAY);
    t.assert.equal(out.archived, false);
  });
  t.it('manuallyArchived once-task stays archived even within grace', function () {
    var t1 = onceTaskEndingDaysAgo(2, { manuallyArchived: true });
    var out = reconcileArchivedOnLoad(t1, TODAY);
    t.assert.equal(out.archived, true);
  });
  t.it('manuallyArchived once-task stays archived even when future-dated', function () {
    var t1 = onceTaskEndingDaysAgo(-5, { manuallyArchived: true });
    var out = reconcileArchivedOnLoad(t1, TODAY);
    t.assert.equal(out.archived, true);
  });
  t.it('manuallyUnarchived historic once-task stays unarchived past 14 days', function () {
    var t1 = onceTaskEndingDaysAgo(60, { manuallyUnarchived: true, archived: true });
    var out = reconcileArchivedOnLoad(t1, TODAY);
    t.assert.equal(out.archived, false);
  });
  t.it('manuallyArchived wins over manuallyUnarchived (coherence)', function () {
    // Production code clears one when setting the other, but be defensive.
    var t1 = onceTaskEndingDaysAgo(2, { manuallyArchived: true, manuallyUnarchived: true });
    var out = reconcileArchivedOnLoad(t1, TODAY);
    t.assert.equal(out.archived, true);
  });
});

t.describe('archive :: reconcileArchivedOnLoad (recurring tasks)', function () {
  t.it('daily task is NEVER auto-archived', function () {
    var out = reconcileArchivedOnLoad(dailyTask(), TODAY);
    t.assert.equal(out.archived, false);
  });
  t.it('weekly task is NEVER auto-archived', function () {
    var out = reconcileArchivedOnLoad(weeklyTask(), TODAY);
    t.assert.equal(out.archived, false);
  });
  t.it('daily task with manuallyArchived stays archived (Archive button)', function () {
    // Recurring archive uses task.archived directly; manual flags don\'t
    // apply but the existing archived flag must be preserved on reload.
    var out = reconcileArchivedOnLoad(dailyTask({ archived: true }), TODAY);
    t.assert.equal(out.archived, true);
  });
  t.it('weekly task with archived:true stays archived on reload', function () {
    var out = reconcileArchivedOnLoad(weeklyTask({ archived: true }), TODAY);
    t.assert.equal(out.archived, true);
  });
  t.it('interval task with archived:true stays archived on reload', function () {
    var task = { id: 'iv', title: 'IV', category: 'Work', archived: true,
      frequency: { type: 'interval', weeks: 2, day: 1 } };
    var out = reconcileArchivedOnLoad(task, TODAY);
    t.assert.equal(out.archived, true);
  });
});

t.describe('archive :: archiveTask / unarchiveTask', function () {
  t.it('archiveTask sets archived + manuallyArchived on once-task', function () {
    var out = archiveTask(onceTask());
    t.assert.equal(out.archived, true);
    t.assert.equal(out.manuallyArchived, true);
    t.assert.equal(out.manuallyUnarchived, undefined);
  });
  t.it('archiveTask clears prior manuallyUnarchived', function () {
    var out = archiveTask(onceTask({ manuallyUnarchived: true }));
    t.assert.equal(out.manuallyUnarchived, undefined);
    t.assert.equal(out.manuallyArchived, true);
  });
  t.it('archiveTask on recurring task sets archived flag', function () {
    var out = archiveTask(dailyTask());
    t.assert.equal(out.archived, true);
    t.assert.equal(out.manuallyArchived, true);
  });
  t.it('unarchiveTask on once-task sets manuallyUnarchived', function () {
    var out = unarchiveTask(onceTask({ archived: true, manuallyArchived: true }));
    t.assert.equal(out.archived, false);
    t.assert.equal(out.manuallyArchived, undefined);
    t.assert.equal(out.manuallyUnarchived, true);
  });
  t.it('unarchiveTask on recurring task does NOT set manuallyUnarchived', function () {
    var out = unarchiveTask(dailyTask({ archived: true, manuallyArchived: true }));
    t.assert.equal(out.archived, false);
    t.assert.equal(out.manuallyArchived, undefined);
    t.assert.equal(out.manuallyUnarchived, undefined);
  });
  t.it('round-trip: archive then unarchive a recurring task returns to baseline', function () {
    var d = dailyTask();
    var afterArchive = archiveTask(d);
    var afterUnarchive = unarchiveTask(afterArchive);
    t.assert.equal(afterUnarchive.archived, false);
    // Recurring tasks have no lingering manual flags.
    t.assert.equal(afterUnarchive.manuallyArchived, undefined);
    t.assert.equal(afterUnarchive.manuallyUnarchived, undefined);
  });
  t.it('historic once unarchived then reloaded stays unarchived', function () {
    var historic = onceTaskEndingDaysAgo(60, { archived: true });
    var unarchived = unarchiveTask(historic);
    var reloaded = reconcileArchivedOnLoad(unarchived, TODAY);
    t.assert.equal(reloaded.archived, false, 'manuallyUnarchived must survive reload');
  });
  t.it('once-task archived then reloaded within grace stays archived', function () {
    var t1 = onceTaskEndingDaysAgo(2);
    var archived = archiveTask(t1);
    var reloaded = reconcileArchivedOnLoad(archived, TODAY);
    t.assert.equal(reloaded.archived, true, 'manuallyArchived must survive reload');
  });
});

// ── Source-sync guards: ensure todo.js still matches the mirrors above ─────

var TODO_JS = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'pages', 'todo.js'), 'utf8');
var APP_JS  = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'pages', 'app.js'),  'utf8');

t.describe('source-sync :: archive logic in todo.js', function () {
  t.it('ONCE_ARCHIVE_AFTER_DAYS constant is 14', function () {
    t.assert.match(TODO_JS, /ONCE_ARCHIVE_AFTER_DAYS\s*=\s*14\s*;/);
  });
  t.it('matches app.js MAX_CARRY_DAYS so Missed window == archive window', function () {
    var todoMatch = TODO_JS.match(/ONCE_ARCHIVE_AFTER_DAYS\s*=\s*(\d+)\s*;/);
    var appMatch  = APP_JS.match(/MAX_CARRY_DAYS\s*=\s*(\d+)\s*;/);
    t.assert.ok(todoMatch && appMatch);
    t.assert.equal(todoMatch[1], appMatch[1],
      'ONCE_ARCHIVE_AFTER_DAYS in todo.js must match MAX_CARRY_DAYS in app.js');
  });
  t.it('isArchivedOnceTask uses daysSince > ONCE_ARCHIVE_AFTER_DAYS', function () {
    var fn = TODO_JS.match(/function isArchivedOnceTask[\s\S]*?\n  \}/);
    t.assert.ok(fn, 'isArchivedOnceTask body not found');
    t.assert.match(fn[0], /daysSince\s*>\s*ONCE_ARCHIVE_AFTER_DAYS/,
      'must use strict > so day 14 stays inside the grace window');
  });
  t.it('loadTasks honors manuallyArchived flag', function () {
    var fn = TODO_JS.match(/function loadTasks[\s\S]*?\n  \}/);
    t.assert.ok(fn, 'loadTasks body not found');
    t.assert.match(fn[0], /task\.manuallyArchived/);
  });
  t.it('loadTasks honors manuallyUnarchived flag', function () {
    var fn = TODO_JS.match(/function loadTasks[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /task\.manuallyUnarchived/);
  });
  t.it('loadTasks recomputes once-task archive from isArchivedOnceTask', function () {
    // Heals stale pre-14-day data — without this, archived:true persists.
    var fn = TODO_JS.match(/function loadTasks[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /isArchivedOnceTask\(task,\s*todayKey\)/);
  });
  t.it('archiveTask sets manuallyArchived', function () {
    var fn = TODO_JS.match(/function archiveTask[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /manuallyArchived\s*=\s*true/);
  });
  t.it('unarchiveTask sets manuallyUnarchived on once-tasks only', function () {
    var fn = TODO_JS.match(/function unarchiveTask[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /frequency\.type\s*===\s*['"]once['"]/);
    t.assert.match(fn[0], /manuallyUnarchived\s*=\s*true/);
  });
  t.it('app.js rebuildTaskBuckets still skips archived tasks', function () {
    // Cross-checks the board pages respect the archive flag set in todo.js.
    var fn = APP_JS.match(/function rebuildTaskBuckets[\s\S]*?\n  \}/);
    t.assert.ok(fn, 'rebuildTaskBuckets body not found');
    t.assert.match(fn[0], /\.archived/);
  });
});
