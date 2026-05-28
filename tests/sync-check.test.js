// Source-sync guard: ensures critical invariants and load-bearing strings
// still exist in app.js. If you change app.js such that one of these checks
// fails, you MUST update tests/task-engine.js to match and re-run the suite.
//
// These are not full structural diffs (that would be brittle and noisy);
// they are targeted checks on the specific code shapes that the test mirror
// depends on. Each check has a comment explaining what the mirror assumes.

'use strict';

var t = require('./harness');
var fs = require('fs');
var path = require('path');

var APP_JS = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function has(pattern, msg) {
  t.assert.match(APP_JS, pattern, msg);
}

t.describe('source-sync :: app.js still defines the mirrored helpers', function () {
  t.it('parseLocalDateKey exists (iPad UTC fix lives here)', function () {
    has(/function parseLocalDateKey\s*\(\s*key\s*\)\s*\{/);
  });
  t.it('parseLocalDateKey uses local-midnight constructor (NOT new Date with T)', function () {
    // Mirror assumes the function returns a local-midnight Date built from
    // `new Date(y, m-1, d)`. The pre-fix code used `new Date(key + 'T00:00:00')`
    // which would re-introduce the iPad bug.
    var fnMatch = APP_JS.match(/function parseLocalDateKey[\s\S]*?\n  \}/);
    t.assert.ok(fnMatch, 'parseLocalDateKey body not found');
    t.assert.match(fnMatch[0], /new Date\(\s*y\s*,\s*m\s*-\s*1\s*,\s*d\s*\)/,
      'must use local-midnight constructor new Date(y, m-1, d)');
    t.assert.ok(!/new Date\(\s*['"`].*T00:00/.test(fnMatch[0]),
      'must not use `new Date("YYYY-MM-DDT00:00:00")` (iPad regression)');
  });
  t.it('getLogicalHour exists (bug #1 fix)', function () {
    has(/function getLogicalHour\s*\(\s*\)\s*\{/);
  });
  t.it('getLogicalHour returns 24 + h when h < 1', function () {
    var fnMatch = APP_JS.match(/function getLogicalHour[\s\S]*?\n  \}/);
    t.assert.ok(fnMatch, 'getLogicalHour body not found');
    t.assert.match(fnMatch[0], /24\s*\+\s*h/, 'must compute 24 + h for midnight hour');
  });
  t.it('renderTaskView uses getLogicalHour (not raw getHours())', function () {
    var rtv = APP_JS.match(/function renderTaskView[\s\S]*?expandedTasks\s*=\s*\[\]/);
    t.assert.ok(rtv, 'renderTaskView preamble not found');
    t.assert.match(rtv[0], /nowHour\s*=\s*getLogicalHour\s*\(\s*\)/,
      'renderTaskView must compute nowHour via getLogicalHour()');
    t.assert.ok(!/nowHour\s*=\s*new Date\(\)\.getHours\(\)/.test(rtv[0]),
      'renderTaskView must NOT use raw new Date().getHours() for nowHour');
  });
  t.it('isWithinTimeWindow normalizes wrap-around with slot.to + 24', function () {
    var fn = APP_JS.match(/function isWithinTimeWindow[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /slot\.to\s*\+\s*24/);
  });
  t.it('isExpiredTimeWindow normalizes wrap-around with slot.to + 24', function () {
    var fn = APP_JS.match(/function isExpiredTimeWindow[\s\S]*?\n  \}/);
    t.assert.ok(fn);
    t.assert.match(fn[0], /slot\.to\s*\+\s*24/);
  });
  t.it('wasOnceDayCaughtUp excludes today (subtracts 1 from end)', function () {
    // The be30e0a fix: without `end.setDate(end.getDate() - 1)`, ticking a
    // catch-up TODAY would make the task vanish entirely.
    var fn = APP_JS.match(/function wasOnceDayCaughtUp[\s\S]*?\n    \}/);
    t.assert.ok(fn, 'wasOnceDayCaughtUp body not found');
    t.assert.match(fn[0], /end\.setDate\(\s*end\.getDate\(\)\s*-\s*1\s*\)/,
      'wasOnceDayCaughtUp must exclude today via end-1');
  });
  t.it('wasEverCompleted excludes today (subtracts 1 from end)', function () {
    var fn = APP_JS.match(/function wasEverCompleted[\s\S]*?\n      \}/);
    t.assert.ok(fn, 'wasEverCompleted body not found');
    t.assert.match(fn[0], /end\.setDate\(\s*end\.getDate\(\)\s*-\s*1\s*\)/);
  });
  t.it('single-day once carry-forward calls wasEverCompleted (bug #2 fix)', function () {
    // Without this, a once task ticked late (D+1) resurfaces as MISSED on
    // every subsequent day until MAX_CARRY_DAYS.
    var legacyBranch = APP_JS.match(/Legacy single-day path[\s\S]{0,800}/);
    t.assert.ok(legacyBranch, 'legacy single-day branch comment not found');
    t.assert.match(legacyBranch[0], /wasEverCompleted\s*\(\s*task\.id\s*,\s*d\s*,\s*todayNorm\s*\)/,
      'single-day once branch must call wasEverCompleted to suppress resurrection');
  });
  t.it('MAX_CARRY_DAYS is 14', function () {
    has(/var MAX_CARRY_DAYS\s*=\s*14\s*;/);
  });
  t.it('once-task carry uses parseLocalDateKey (not the broken T00:00:00 form)', function () {
    // Regression guard for the iPad fix (commit 448a41e). The relevant code
    // is the span-aware carry-forward branch in renderTaskView, which
    // assigns startD/endD from the once range.
    var startMatch = APP_JS.match(/var startD\s*=\s*([^;]+);/);
    var endMatch   = APP_JS.match(/var endD\s*=\s*([^;]+);/);
    t.assert.ok(startMatch, 'startD assignment not found');
    t.assert.ok(endMatch,   'endD assignment not found');
    t.assert.match(startMatch[1], /parseLocalDateKey\(range\.startDate\)/,
      'startD must use parseLocalDateKey (iPad regression guard)');
    t.assert.match(endMatch[1], /parseLocalDateKey\(range\.endDate\)/,
      'endD must use parseLocalDateKey (iPad regression guard)');
    t.assert.ok(!/T00:00:00/.test(startMatch[1] + endMatch[1]),
      'must not use new Date(range.x + "T00:00:00")');
    // Also: onceRangeLength/onceRangeDayIndex must use parseLocalDateKey.
    var orl = APP_JS.match(/function onceRangeLength[\s\S]*?\n  \}/);
    var ori = APP_JS.match(/function onceRangeDayIndex[\s\S]*?\n  \}/);
    t.assert.ok(orl && ori);
    t.assert.match(orl[0], /parseLocalDateKey/);
    t.assert.match(ori[0], /parseLocalDateKey/);
    t.assert.ok(!/T00:00:00/.test(orl[0] + ori[0]),
      'once range helpers must not reintroduce T00:00:00');
  });
});

t.describe('source-sync :: visible/Caught-Up split classifier', function () {
  t.it('still routes on `task.missed && state[task.id]`', function () {
    has(/if \(task\.missed && state\[task\.id\]\)/);
  });
});

t.describe('source-sync :: storage prefixes are preserved', function () {
  // Changing these silently would lose all user state. The mirror does not
  // care about specific prefix strings, but production behavior does.
  t.it('MYDAY_STORAGE_PREFIX is wired up', function () {
    has(/var MYDAY_STORAGE_PREFIX\s*=/);
  });
  t.it('MORNING_STORAGE_PREFIX is wired up', function () {
    has(/var MORNING_STORAGE_PREFIX\s*=/);
  });
});
