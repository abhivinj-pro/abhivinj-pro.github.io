// Tests for date / time primitives.
// Covers the iPad UTC-date-shift fix (commit 448a41e) and the bug-#1
// logical-hour fix.

'use strict';

var t = require('./harness');
var E = require('./task-engine');

t.describe('date primitives :: getDateKey', function () {
  t.it('formats single-digit month/day with leading zero', function () {
    t.assert.equal(E.getDateKey(new Date(2026, 0, 3)), '2026-01-03');
  });
  t.it('formats two-digit month/day correctly', function () {
    t.assert.equal(E.getDateKey(new Date(2026, 10, 27)), '2026-11-27');
  });
});

t.describe('date primitives :: parseLocalDateKey (iPad UTC fix)', function () {
  // This is the regression that commit 448a41e fixed. The pre-fix code used
  // `new Date('YYYY-MM-DDT00:00:00')` which iOS 12 Safari (and other pre-
  // ES2015 parsers) interpret as UTC, causing the day to shift in any
  // non-UTC zone. The replacement constructs a local-midnight Date directly.
  t.it('returns a Date at local midnight', function () {
    var d = E.parseLocalDateKey('2026-05-27');
    t.assert.equal(d.getFullYear(), 2026);
    t.assert.equal(d.getMonth(), 4);   // May = 4
    t.assert.equal(d.getDate(), 27);
    t.assert.equal(d.getHours(), 0);
    t.assert.equal(d.getMinutes(), 0);
  });
  t.it('round-trips through getDateKey for arbitrary dates', function () {
    var samples = ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29', '2026-05-27'];
    for (var i = 0; i < samples.length; i += 1) {
      t.assert.equal(E.getDateKey(E.parseLocalDateKey(samples[i])), samples[i],
        'round-trip ' + samples[i]);
    }
  });
  t.it('does NOT shift dates due to UTC interpretation (iPad regression guard)', function () {
    // Whatever the host TZ, the returned year/month/day must match the input
    // tokens. The pre-fix `new Date('2026-05-27T00:00:00')` would give a
    // local Date of 2026-05-26 in any zone west of UTC.
    var d = E.parseLocalDateKey('2026-05-27');
    t.assert.equal(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(),
      '2026-5-27', 'tokens preserved');
  });
  t.it('returns Invalid Date for malformed input', function () {
    t.assert.ok(isNaN(E.parseLocalDateKey('').getTime()));
    t.assert.ok(isNaN(E.parseLocalDateKey('not-a-date').getTime()));
    t.assert.ok(isNaN(E.parseLocalDateKey(null).getTime()));
    t.assert.ok(isNaN(E.parseLocalDateKey('2026-05').getTime()));
  });
});

t.describe('date primitives :: getLogicalDate (midnight cutoff)', function () {
  t.it('returns today when wall-clock hour >= 1', function () {
    var clk = new Date(2026, 4, 30, 1, 0, 0);
    var ld = E.getLogicalDate(clk);
    t.assert.equal(E.getDateKey(ld), '2026-05-30');
  });
  t.it('returns today at 1:30 AM', function () {
    var clk = new Date(2026, 4, 30, 1, 30, 0);
    t.assert.equal(E.getDateKey(E.getLogicalDate(clk)), '2026-05-30');
  });
  t.it('returns TODAY at 12:10 AM (day already rolled at midnight)', function () {
    var clk = new Date(2026, 4, 30, 0, 10, 0);
    t.assert.equal(E.getDateKey(E.getLogicalDate(clk)), '2026-05-30');
  });
  t.it('returns TODAY at 12:59 AM', function () {
    var clk = new Date(2026, 4, 30, 0, 59, 59);
    t.assert.equal(E.getDateKey(E.getLogicalDate(clk)), '2026-05-30');
  });
  t.it('handles month boundary just after midnight', function () {
    var clk = new Date(2026, 5, 1, 0, 30, 0); // June 1, 00:30 → still June 1
    t.assert.equal(E.getDateKey(E.getLogicalDate(clk)), '2026-06-01');
  });
});

t.describe('date primitives :: getLogicalHour (wall-clock hour)', function () {
  // With the midnight rollover the logical day == the calendar day, so the
  // logical hour is always the raw wall-clock hour 0..23.
  t.it('matches wall-clock hour from 00:00 through 23:59', function () {
    for (var h = 0; h <= 23; h += 1) {
      t.assert.equal(E.getLogicalHour(new Date(2026, 4, 30, h, 0, 0)), h, 'hour ' + h);
    }
  });
  t.it('returns 0 at 00:00 (the boundary)', function () {
    t.assert.equal(E.getLogicalHour(new Date(2026, 4, 30, 0, 0, 0)), 0);
  });
  t.it('returns 0 at 00:30', function () {
    t.assert.equal(E.getLogicalHour(new Date(2026, 4, 30, 0, 30, 0)), 0);
  });
  t.it('returns 0 at 00:59', function () {
    t.assert.equal(E.getLogicalHour(new Date(2026, 4, 30, 0, 59, 59)), 0);
  });
  t.it('is consistent with getLogicalDate boundary', function () {
    var clk = new Date(2026, 4, 30, 0, 30, 0);
    var ld = E.getLogicalDate(clk);
    var lh = E.getLogicalHour(clk);
    // At 00:30 we are 0.5 hours into the (new) logical day.
    t.assert.equal(E.getDateKey(ld), '2026-05-30');
    t.assert.equal(lh, 0);
  });
});

t.describe('date primitives :: time-window predicates', function () {
  var morning = { from: 7, to: 12 };
  var wrap    = { from: 22, to: 1 };

  t.it('within: standard slot active hours', function () {
    t.assert.equal(E.isWithinTimeWindow(morning, 7), true);
    t.assert.equal(E.isWithinTimeWindow(morning, 11), true);
    t.assert.equal(E.isWithinTimeWindow(morning, 12), false, '12 is exclusive end');
    t.assert.equal(E.isWithinTimeWindow(morning, 6), false);
  });
  t.it('within: wrap-around slot is active in the evening hours 22 and 23', function () {
    t.assert.equal(E.isWithinTimeWindow(wrap, 22), true);
    t.assert.equal(E.isWithinTimeWindow(wrap, 23), true);
    // The 00:00–00:59 tail of a wrap slot belongs to the PREVIOUS calendar day.
    // On the live (new) day, hour 0 is not yet within this slot.
    t.assert.equal(E.isWithinTimeWindow(wrap, 0), false, 'hour 0 of the new day is before the 22:00 start');
    t.assert.equal(E.isWithinTimeWindow(wrap, 1), false, 'hour 1 is past the slot end');
  });
  t.it('expired: standard slot expires AT slot.to', function () {
    t.assert.equal(E.isExpiredTimeWindow(morning, 12), true);
    t.assert.equal(E.isExpiredTimeWindow(morning, 13), true);
    t.assert.equal(E.isExpiredTimeWindow(morning, 11), false);
  });
  t.it('expired: wrap-around slot is not expired during its active evening hours', function () {
    t.assert.equal(E.isExpiredTimeWindow(wrap, 22), false, 'active at 22:00');
    t.assert.equal(E.isExpiredTimeWindow(wrap, 23), false, 'active at 23:00');
  });
  t.it('within and expired are mutually exclusive across all wall-clock hours', function () {
    var slots = [morning, wrap, { from: 14, to: 17 }, { from: 20, to: 22 }];
    for (var h = 0; h <= 23; h += 1) {
      for (var i = 0; i < slots.length; i += 1) {
        var w = E.isWithinTimeWindow(slots[i], h);
        var e = E.isExpiredTimeWindow(slots[i], h);
        t.assert.ok(!(w && e), 'h=' + h + ' slot=' + JSON.stringify(slots[i]));
      }
    }
  });
});

t.describe('date primitives :: slugifyTime', function () {
  t.it('converts label to lowercase kebab', function () {
    t.assert.equal(E.slugifyTime('First'), 'first');
    t.assert.equal(E.slugifyTime('Late Evening'), 'late-evening');
    t.assert.equal(E.slugifyTime('  Mixed-Case  '), 'mixed-case');
  });
  t.it('strips non-alphanumerics safely', function () {
    t.assert.equal(E.slugifyTime("It's 3 o'clock!"), 'it-s-3-o-clock');
  });
});
