// Tests for frequency / scheduling helpers.
// Covers commit 2e59507 (multi-day once support) and all four frequency types.

'use strict';

var t = require('./harness');
var E = require('./task-engine');

t.describe('scheduling :: getOnceRange', function () {
  t.it('normalizes new shape {startDate, endDate}', function () {
    var r = E.getOnceRange({ frequency: { type: 'once', startDate: '2026-05-26', endDate: '2026-05-29' } });
    t.assert.deepEqual(r, { startDate: '2026-05-26', endDate: '2026-05-29' });
  });
  t.it('normalizes legacy shape {date}', function () {
    var r = E.getOnceRange({ frequency: { type: 'once', date: '2026-05-27' } });
    t.assert.deepEqual(r, { startDate: '2026-05-27', endDate: '2026-05-27' });
  });
  t.it('returns null for non-once frequencies', function () {
    t.assert.equal(E.getOnceRange({ frequency: { type: 'daily' } }), null);
    t.assert.equal(E.getOnceRange({ frequency: { type: 'weekly', days: [1] } }), null);
    t.assert.equal(E.getOnceRange({}), null);
  });
  t.it('collapses end<start defensively to single-day', function () {
    var r = E.getOnceRange({ frequency: { type: 'once', startDate: '2026-05-29', endDate: '2026-05-26' } });
    t.assert.equal(r.startDate, '2026-05-29');
    t.assert.equal(r.endDate, '2026-05-29');
  });
});

t.describe('scheduling :: onceRangeLength / onceRangeDayIndex', function () {
  var r = { startDate: '2026-05-26', endDate: '2026-05-29' };
  t.it('length is inclusive day count', function () {
    t.assert.equal(E.onceRangeLength(r), 4);
    t.assert.equal(E.onceRangeLength({ startDate: '2026-05-27', endDate: '2026-05-27' }), 1);
  });
  t.it('day index is 1-based within range', function () {
    t.assert.equal(E.onceRangeDayIndex(r, '2026-05-26'), 1);
    t.assert.equal(E.onceRangeDayIndex(r, '2026-05-27'), 2);
    t.assert.equal(E.onceRangeDayIndex(r, '2026-05-29'), 4);
  });
  t.it('day index returns 0 outside range', function () {
    t.assert.equal(E.onceRangeDayIndex(r, '2026-05-25'), 0);
    t.assert.equal(E.onceRangeDayIndex(r, '2026-05-30'), 0);
  });
});

t.describe('scheduling :: isTaskForDate', function () {
  var may27_wed = new Date(2026, 4, 27); // Wed
  var may28_thu = new Date(2026, 4, 28);
  var may29_fri = new Date(2026, 4, 29);

  t.it('daily: true on every date', function () {
    t.assert.equal(E.isTaskForDate({ frequency: { type: 'daily' } }, may27_wed), true);
    t.assert.equal(E.isTaskForDate({}, may27_wed), true);
  });
  t.it('weekly: only on listed weekday numbers', function () {
    var gym = { frequency: { type: 'weekly', days: [1, 3, 5] } };
    t.assert.equal(E.isTaskForDate(gym, may27_wed), true,  'Wed');
    t.assert.equal(E.isTaskForDate(gym, may28_thu), false, 'Thu');
    t.assert.equal(E.isTaskForDate(gym, may29_fri), true,  'Fri');
  });
  t.it('interval: only on Nth-week boundaries on the specified weekday', function () {
    // every 2nd Monday starting 2026-05-04 (Monday)
    var biw = { frequency: { type: 'interval', startDate: '2026-05-04', every: 2, day: 1 } };
    t.assert.equal(E.isTaskForDate(biw, new Date(2026, 4, 4)),  true,  'week 0 Mon');
    t.assert.equal(E.isTaskForDate(biw, new Date(2026, 4, 11)), false, 'week 1 Mon');
    t.assert.equal(E.isTaskForDate(biw, new Date(2026, 4, 18)), true,  'week 2 Mon');
    t.assert.equal(E.isTaskForDate(biw, new Date(2026, 4, 19)), false, 'week 2 Tue');
  });
  t.it('once: inside [startDate, endDate] inclusive', function () {
    var span = { frequency: { type: 'once', startDate: '2026-05-26', endDate: '2026-05-29' } };
    t.assert.equal(E.isTaskForDate(span, new Date(2026, 4, 25)), false);
    t.assert.equal(E.isTaskForDate(span, new Date(2026, 4, 26)), true);
    t.assert.equal(E.isTaskForDate(span, new Date(2026, 4, 28)), true);
    t.assert.equal(E.isTaskForDate(span, new Date(2026, 4, 29)), true);
    t.assert.equal(E.isTaskForDate(span, new Date(2026, 4, 30)), false);
  });
  t.it('once: legacy {date} works same as single-day {startDate=endDate}', function () {
    var legacy = { frequency: { type: 'once', date: '2026-05-27' } };
    t.assert.equal(E.isTaskForDate(legacy, new Date(2026, 4, 27)), true);
    t.assert.equal(E.isTaskForDate(legacy, new Date(2026, 4, 28)), false);
  });
});

t.describe('scheduling :: nextOccurrenceDate / lastScheduledBefore', function () {
  var gym = { frequency: { type: 'weekly', days: [1, 3, 5] } }; // M/W/F
  t.it('finds next M/W/F from a Thu', function () {
    var n = E.nextOccurrenceDate(gym, new Date(2026, 4, 28)); // Thu
    t.assert.equal(E.getDateKey(n), '2026-05-29', 'Fri');
  });
  t.it('finds last scheduled before today=Thu → Wed', function () {
    var p = E.lastScheduledBefore(gym, new Date(2026, 4, 28), 14);
    t.assert.equal(E.getDateKey(p), '2026-05-27');
  });
  t.it('finds last scheduled before today=Tue → Mon', function () {
    var p = E.lastScheduledBefore(gym, new Date(2026, 4, 26), 14);
    t.assert.equal(E.getDateKey(p), '2026-05-25');
  });
  t.it('returns null when no occurrence within lookback', function () {
    var rare = { frequency: { type: 'weekly', days: [0] } }; // Sundays only
    // From a Monday, lookback 1 day won't find Sunday
    var p = E.lastScheduledBefore(rare, new Date(2026, 4, 25), 0);
    t.assert.equal(p, null);
  });
});

t.describe('scheduling :: carryWindowDays', function () {
  // The doc-comment table in app.js. Treat this as load-bearing.
  t.it('daily → 0', function () {
    t.assert.equal(
      E.carryWindowDays({ frequency: { type: 'daily' } }, new Date(2026, 4, 27)),
      0
    );
  });
  t.it('weekly (G=7) → 2', function () {
    var task = { frequency: { type: 'weekly', days: [1] } }; // Mondays
    t.assert.equal(E.carryWindowDays(task, new Date(2026, 4, 25)), 2);
  });
  t.it('twice-weekly Mon+Thu (G=3) → 2 (floor)', function () {
    var task = { frequency: { type: 'weekly', days: [1, 4] } };
    t.assert.equal(E.carryWindowDays(task, new Date(2026, 4, 25)), 2);
  });
  t.it('biweekly interval (G=14) → 4', function () {
    var task = { frequency: { type: 'interval', startDate: '2026-05-04', every: 2, day: 1 } };
    t.assert.equal(E.carryWindowDays(task, new Date(2026, 4, 4)), 4);
  });
  t.it('once-task → MAX_CARRY_DAYS (14)', function () {
    var task = { frequency: { type: 'once', startDate: '2026-05-27', endDate: '2026-05-27' } };
    t.assert.equal(E.carryWindowDays(task, new Date(2026, 4, 27)), 14);
  });
});
