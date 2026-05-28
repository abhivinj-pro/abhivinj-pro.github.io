// End-to-end scenario tests for renderTaskView.
// Covers MyDay + Work, all frequency types, both Caught Up and Missed
// sections, time-slot tasks, span tasks, and the recent regression bugs.

'use strict';

var t = require('./harness');
var E = require('./task-engine');

// ── Reusable task fixtures ──────────────────────────────────────────────────

var eyeDrops = {
  id: 'eye-drops', title: 'Eye Drops', frequency: { type: 'daily' },
  times: [
    { label: 'First',  from: 7,  to: 12 },
    { label: 'Second', from: 12, to: 14 },
    { label: 'Third',  from: 14, to: 17 },
    { label: 'Fourth', from: 17, to: 20 },
    { label: 'Fifth',  from: 20, to: 22 },
    { label: 'Sixth',  from: 22, to: 1  }
  ]
};
var aligners       = { id: 'aligners',     title: 'Aligners',     frequency: { type: 'daily' } };
var gym            = { id: 'gym',          title: 'Gym',          frequency: { type: 'weekly', days: [1, 3, 5] } };
var biweeklyReview = { id: 'biweekly',     title: 'Biweekly',     frequency: { type: 'interval', startDate: '2026-05-04', every: 2, day: 1 } };
var doctorVisit    = { id: 'doctor-visit', title: 'Doctor Visit', frequency: { type: 'once', startDate: '2026-05-27', endDate: '2026-05-27' } };
var readingSprint  = { id: 'reading-3d',   title: 'Reading 3d',   frequency: { type: 'once', startDate: '2026-05-26', endDate: '2026-05-28' } };

// Work category fixtures (logic is symmetric; only the bucket name differs in app.js)
var cisa020        = { id: 'cisa-020',     title: 'CISA D4.020',  category: 'Work', frequency: { type: 'once', startDate: '2026-05-27', endDate: '2026-05-27' } };
var projectX       = { id: 'project-x',    title: 'Project X',    category: 'Work', frequency: { type: 'once', startDate: '2026-05-26', endDate: '2026-05-29' } };

function hasMissed(arr, id) { return arr.some(function (x) { return x.id === id && x.missed; }); }
function hasActive(arr, id) { return arr.some(function (x) { return x.id === id && !x.missed; }); }

// ── Eye Drops (multi-time-slot daily) ───────────────────────────────────────

t.describe('renderTaskView :: multi-time-slot (Eye Drops)', function () {
  t.it('09:00 → only First active', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 9, 0), {});
    t.assert.equal(r.visible.length, 1);
    t.assert.ok(hasActive(r.visible, 'eye-drops__first'));
    t.assert.equal(r.caughtUp.length, 0);
  });
  t.it('14:00 → Third active, First+Second Missed', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 14, 0), {});
    t.assert.ok(hasActive(r.visible, 'eye-drops__third'));
    t.assert.ok(hasMissed(r.visible, 'eye-drops__first'));
    t.assert.ok(hasMissed(r.visible, 'eye-drops__second'));
  });
  t.it('14:00 with Second already ticked → moves to Caught Up', function () {
    var st = { '2026-05-30': { 'eye-drops__second': true } };
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 14, 0), st);
    t.assert.ok(!hasMissed(r.visible, 'eye-drops__second'));
    t.assert.includes(r.caughtUp, function (x) { return x.id === 'eye-drops__second'; });
  });
  t.it('23:30 → Sixth active (wrap-around slot)', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 23, 30), {});
    t.assert.ok(hasActive(r.visible, 'eye-drops__sixth'));
  });
  t.it('BUG #1 REGRESSION: 00:10 logical=yesterday hour=24 → Sixth active, First..Fifth Missed', function () {
    // Pre-fix, nowHour=getHours()=0 made every expired slot of yesterday
    // appear neither active nor expired, so they vanished from both Missed
    // and Caught Up entirely.
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 0, 10), {});
    t.assert.equal(r.dateKey, '2026-05-29', 'logical date is yesterday');
    t.assert.equal(r.logicalHour, 24);
    t.assert.ok(hasActive(r.visible, 'eye-drops__sixth'));
    ['first', 'second', 'third', 'fourth', 'fifth'].forEach(function (lbl) {
      t.assert.ok(hasMissed(r.visible, 'eye-drops__' + lbl), lbl + ' should be Missed');
    });
  });
  t.it('BUG #1 REGRESSION: 00:10 with all earlier slots ticked → all 5 in Caught Up', function () {
    var st = {
      '2026-05-29': {
        'eye-drops__first': true, 'eye-drops__second': true, 'eye-drops__third': true,
        'eye-drops__fourth': true, 'eye-drops__fifth': true
      }
    };
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 0, 10), st);
    t.assert.equal(r.visible.length, 1, 'only Sixth visible');
    t.assert.equal(r.caughtUp.length, 5, 'First..Fifth caught up');
  });
  t.it('01:30 → logical day flipped, all of today\'s slots are future (empty board)', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 1, 30), {});
    t.assert.equal(r.dateKey, '2026-05-30');
    t.assert.equal(r.logicalHour, 1);
    t.assert.equal(r.visible.length, 0);
    t.assert.equal(r.caughtUp.length, 0);
  });
  t.it('ticking a Missed slot immediately re-routes to Caught Up', function () {
    var st = { '2026-05-30': {} };
    var before = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 14, 0), st);
    t.assert.ok(hasMissed(before.visible, 'eye-drops__first'));
    st['2026-05-30']['eye-drops__first'] = true;
    var after = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 14, 0), st);
    t.assert.ok(!hasMissed(after.visible, 'eye-drops__first'));
    t.assert.includes(after.caughtUp, function (x) { return x.id === 'eye-drops__first'; });
  });
});

// ── Daily (plain) ───────────────────────────────────────────────────────────

t.describe('renderTaskView :: plain daily task', function () {
  t.it('always visible on today, never carried forward', function () {
    var r = E.renderTaskView([aligners], new Date(2026, 4, 30, 12, 0), {});
    t.assert.equal(r.visible.length, 1);
    t.assert.ok(!r.visible[0].missed);
  });
  t.it('ticking today does not add a Caught Up entry', function () {
    var st = { '2026-05-30': { 'aligners': true } };
    var r = E.renderTaskView([aligners], new Date(2026, 4, 30, 12, 0), st);
    t.assert.equal(r.visible.length, 1);
    t.assert.equal(r.caughtUp.length, 0);
  });
  t.it('untouched yesterday does not surface as Missed today', function () {
    var r = E.renderTaskView([aligners], new Date(2026, 4, 30, 12, 0), {});
    t.assert.ok(!r.visible.some(function (x) { return x.missed; }));
  });
});

// ── Weekly ──────────────────────────────────────────────────────────────────

t.describe('renderTaskView :: weekly task (M/W/F gym)', function () {
  t.it('on scheduled day: visible, not missed', function () {
    var r = E.renderTaskView([gym], new Date(2026, 4, 27, 12, 0), {}); // Wed
    t.assert.equal(r.visible.length, 1);
    t.assert.ok(!r.visible[0].missed);
  });
  t.it('missed Wed → Thu shows it as Missed', function () {
    var r = E.renderTaskView([gym], new Date(2026, 4, 28, 12, 0), {});
    t.assert.ok(hasMissed(r.visible, 'gym'));
  });
  t.it('missed Wed, caught Thu → Thu shows in Caught Up', function () {
    var st = { '2026-05-28': { 'gym': true } };
    var r = E.renderTaskView([gym], new Date(2026, 4, 28, 12, 0), st);
    t.assert.includes(r.caughtUp, function (x) { return x.id === 'gym'; });
  });
  t.it('missed Wed, caught Thu → Fri (next scheduled day) shows only today\'s card', function () {
    var st = { '2026-05-28': { 'gym': true } };
    var r = E.renderTaskView([gym], new Date(2026, 4, 29, 12, 0), st); // Fri
    t.assert.equal(r.visible.filter(function (x) { return x.id === 'gym'; }).length, 1);
    t.assert.ok(!r.visible.find(function (x) { return x.id === 'gym'; }).missed);
  });
  t.it('missed Wed never caught → Fri shows today card AND no duplicate carry', function () {
    // On Fri, the Wed miss is past its W=2 window (daysSince=2 ≤ 2, so it
    // could carry — but the today-card branch supersedes via todayTaskIds).
    var r = E.renderTaskView([gym], new Date(2026, 4, 29, 12, 0), {});
    t.assert.equal(r.visible.filter(function (x) { return x.id === 'gym'; }).length, 1);
  });
});

// ── Once single-day (the bug #2 regression test bed) ────────────────────────

t.describe('renderTaskView :: once single-day (work/myday symmetric)', function () {
  t.it('on D (scheduled day): today\'s card', function () {
    var r = E.renderTaskView([cisa020], new Date(2026, 4, 27, 12, 0), {});
    t.assert.equal(r.visible.length, 1);
    t.assert.ok(!r.visible[0].missed);
  });
  t.it('untouched after D: shows Missed every day until MAX_CARRY_DAYS', function () {
    var d1  = E.renderTaskView([cisa020], new Date(2026, 4, 28, 12, 0), {});
    var d14 = E.renderTaskView([cisa020], new Date(2026, 5, 10, 12, 0), {});
    var d15 = E.renderTaskView([cisa020], new Date(2026, 5, 11, 12, 0), {});
    t.assert.ok(hasMissed(d1.visible, 'cisa-020'));
    t.assert.ok(hasMissed(d14.visible, 'cisa-020'));
    t.assert.equal(d15.visible.length, 0, 'falls off the board after MAX_CARRY_DAYS');
  });
  t.it('ticked timely on D → never resurfaces (D+1, D+2, D+3 all clean)', function () {
    var st = { '2026-05-27': { 'cisa-020': true } };
    [new Date(2026, 4, 28), new Date(2026, 4, 29), new Date(2026, 4, 30)].forEach(function (clk) {
      clk.setHours(12);
      var r = E.renderTaskView([cisa020], clk, st);
      t.assert.equal(r.visible.length, 0, E.getDateKey(clk) + ' visible');
      t.assert.equal(r.caughtUp.length, 0, E.getDateKey(clk) + ' caughtUp');
    });
  });
  t.it('BUG #2 REGRESSION: missed D, caught D+1 → D+2 and D+3 must be clean (no Missed resurrection)', function () {
    var st = { '2026-05-28': { 'cisa-020': true } };
    var dD    = E.renderTaskView([cisa020], new Date(2026, 4, 27, 12), st);
    var dD1   = E.renderTaskView([cisa020], new Date(2026, 4, 28, 12), st);
    var dD2   = E.renderTaskView([cisa020], new Date(2026, 4, 29, 12), st);
    var dD3   = E.renderTaskView([cisa020], new Date(2026, 4, 30, 12), st);
    t.assert.ok(hasActive(dD.visible, 'cisa-020'), 'D: today card');
    t.assert.includes(dD1.caughtUp, function (x) { return x.id === 'cisa-020'; }, 'D+1: Caught Up');
    t.assert.equal(dD2.visible.length, 0, 'D+2: clean (was MISSED before fix)');
    t.assert.equal(dD2.caughtUp.length, 0);
    t.assert.equal(dD3.visible.length, 0, 'D+3: clean (was MISSED before fix)');
  });
  t.it('ticking a carried-forward Missed today routes immediately to Caught Up', function () {
    var st = {};
    var before = E.renderTaskView([cisa020], new Date(2026, 4, 28, 12), st);
    t.assert.ok(hasMissed(before.visible, 'cisa-020'));
    st['2026-05-28'] = { 'cisa-020': true };
    var after = E.renderTaskView([cisa020], new Date(2026, 4, 28, 12), st);
    t.assert.includes(after.caughtUp, function (x) { return x.id === 'cisa-020'; });
    t.assert.ok(!hasMissed(after.visible, 'cisa-020'));
  });
  t.it('legacy {date} shape behaves identically to {startDate=endDate}', function () {
    var legacy = { id: 'legacy-x', title: 'L', frequency: { type: 'once', date: '2026-05-27' } };
    var r = E.renderTaskView([legacy], new Date(2026, 4, 28, 12), {});
    t.assert.ok(hasMissed(r.visible, 'legacy-x'));
  });
});

// ── Once multi-day span (commits 2e59507 + be30e0a) ─────────────────────────

t.describe('renderTaskView :: once multi-day span', function () {
  t.it('today\'s card carries "Day X of N" badge', function () {
    var r = E.renderTaskView([projectX], new Date(2026, 4, 27, 12), {});
    var today = r.visible.find(function (x) { return x.id === 'project-x'; });
    t.assert.ok(today);
    t.assert.equal(today.timeLabel, 'Day 2 of 4');
  });
  t.it('mid-span untouched: each past day surfaces independently as Missed', function () {
    var r = E.renderTaskView([projectX], new Date(2026, 4, 28, 12), {});
    t.assert.ok(hasMissed(r.visible, 'project-x#2026-05-26'));
    t.assert.ok(hasMissed(r.visible, 'project-x#2026-05-27'));
    t.assert.ok(hasActive(r.visible, 'project-x'), 'today still has its card');
  });
  t.it('Day 1 ticked on Day 1 itself: not in carry-forward', function () {
    var st = { '2026-05-26': { 'project-x': true } };
    var r = E.renderTaskView([projectX], new Date(2026, 4, 27, 12), st);
    t.assert.equal(
      r.visible.filter(function (x) { return x.id.indexOf('project-x#') === 0; }).length,
      0
    );
  });
  t.it('REGRESSION (commit be30e0a): catch-up TODAY via composite id routes to Caught Up that day', function () {
    // Pre-be30e0a fix, wasOnceDayCaughtUp included today, so the moment a
    // user ticked the catch-up checkbox the task got filtered out of
    // carryForwardTasks entirely (vanishing instead of moving to Caught Up).
    // Now wasOnceDayCaughtUp excludes today, so the card flows through.
    var st = { '2026-05-28': { 'project-x#2026-05-26': true } };
    var r = E.renderTaskView([projectX], new Date(2026, 4, 28, 12), st);
    t.assert.includes(r.caughtUp, function (x) { return x.id === 'project-x#2026-05-26'; });
  });
  t.it('Day 1 caught on Day 3 → Day 4 view: Day 1 not re-shown', function () {
    var st = { '2026-05-28': { 'project-x#2026-05-26': true } };
    var r = E.renderTaskView([projectX], new Date(2026, 4, 29, 12), st);
    t.assert.ok(!r.visible.some(function (x) { return x.id === 'project-x#2026-05-26'; }));
    t.assert.ok(!r.caughtUp.some(function (x) { return x.id === 'project-x#2026-05-26'; }));
    t.assert.ok(hasActive(r.visible, 'project-x'), 'Day 4 today card');
  });
  t.it('span fully missed, viewed after end: 4 separate Missed entries, no today card', function () {
    var r = E.renderTaskView([projectX], new Date(2026, 4, 31, 12), {});
    var missedDays = r.visible.filter(function (x) {
      return x.id.indexOf('project-x#') === 0 && x.missed;
    });
    t.assert.equal(missedDays.length, 4);
    t.assert.ok(!r.visible.some(function (x) { return x.id === 'project-x' && !x.missed; }));
  });
  t.it('span never extends Missed entries past MAX_CARRY_DAYS', function () {
    // Span 05-26..05-29 viewed on 06-10 → 05-26 is 15 days back, should drop.
    var r = E.renderTaskView([projectX], new Date(2026, 5, 10, 12), {});
    var d1 = r.visible.find(function (x) { return x.id === 'project-x#2026-05-26'; });
    t.assert.equal(d1, undefined, 'Day 1 (15d ago) should be off the board');
    t.assert.ok(hasMissed(r.visible, 'project-x#2026-05-27'), 'Day 2 (14d) still in window');
  });
});

// ── Mixed bucket / cross-cutting invariants ────────────────────────────────

t.describe('renderTaskView :: mixed bucket invariants', function () {
  var bucket = [aligners, gym, eyeDrops, doctorVisit, projectX, biweeklyReview];

  t.it('renders without throwing for a 5-type mixed bucket', function () {
    var r = E.renderTaskView(bucket, new Date(2026, 4, 28, 11, 0), {});
    t.assert.ok(r);
    t.assert.ok(Array.isArray(r.visible));
    t.assert.ok(Array.isArray(r.caughtUp));
  });
  t.it('no task id appears in both visible AND caughtUp', function () {
    var st = { '2026-05-28': { 'gym': true, 'eye-drops__first': true } };
    var r = E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), st);
    var v = {};
    r.visible.forEach(function (x) { v[x.id] = true; });
    r.caughtUp.forEach(function (x) {
      t.assert.ok(!v[x.id], 'duplicate id: ' + x.id);
    });
  });
  t.it('every caughtUp entry has missed=true', function () {
    var st = { '2026-05-28': { 'gym': true } };
    var r = E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), st);
    r.caughtUp.forEach(function (x) {
      t.assert.equal(x.missed, true, 'caughtUp entry without missed flag: ' + x.id);
    });
  });
  t.it('idempotency: same input → same output across two calls', function () {
    var st = { '2026-05-28': { 'gym': true, 'eye-drops__first': true } };
    var r1 = E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), st);
    var r2 = E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), st);
    t.assert.deepEqual(r1, r2);
  });
  t.it('does not mutate the input state object', function () {
    var st = { '2026-05-28': { 'gym': true } };
    var snapshot = JSON.parse(JSON.stringify(st));
    E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), st);
    t.assert.deepEqual(st, snapshot);
  });
  t.it('does not mutate the input bucket', function () {
    var snapshot = JSON.parse(JSON.stringify(bucket));
    E.renderTaskView(bucket, new Date(2026, 4, 28, 14, 0), {});
    t.assert.deepEqual(bucket, snapshot);
  });
});

// ── Boundary / temporal edge cases ──────────────────────────────────────────

t.describe('renderTaskView :: boundary cases', function () {
  t.it('empty bucket → empty result', function () {
    var r = E.renderTaskView([], new Date(2026, 4, 28, 14), {});
    t.assert.equal(r.visible.length, 0);
    t.assert.equal(r.caughtUp.length, 0);
  });
  t.it('00:50 AM still on yesterday\'s logical day', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 0, 50), {});
    t.assert.equal(r.dateKey, '2026-05-29');
    t.assert.ok(hasActive(r.visible, 'eye-drops__sixth'));
  });
  t.it('exactly 01:00 AM is the rollover instant → new logical day', function () {
    var r = E.renderTaskView([eyeDrops], new Date(2026, 4, 30, 1, 0, 0), {});
    t.assert.equal(r.dateKey, '2026-05-30');
    t.assert.equal(r.logicalHour, 1);
  });
  t.it('once-task scheduled today AND in past via state: today card + no spurious carry', function () {
    var st = { '2026-05-26': { 'project-x': true } };
    var r = E.renderTaskView([projectX], new Date(2026, 4, 26, 12), st);
    // Today is start day; today card has "Day 1 of 4" badge; state[today][id]
    // makes it appear ticked (Caught Up split only catches missed=true items).
    t.assert.equal(r.visible.length, 1);
    t.assert.equal(r.visible[0].timeLabel, 'Day 1 of 4');
  });
  t.it('biweekly task missed on its first occurrence carries forward W=4 days', function () {
    // Scheduled 2026-05-04 (Mon, week 0). Next occurrence is 2026-05-18.
    // W = ceil(14/4) = 4. So visible Missed on 05-05..05-08, gone by 05-09.
    var st = {};
    var d1 = E.renderTaskView([biweeklyReview], new Date(2026, 4, 5, 12), st);
    var d4 = E.renderTaskView([biweeklyReview], new Date(2026, 4, 8, 12), st);
    var d5 = E.renderTaskView([biweeklyReview], new Date(2026, 4, 9, 12), st);
    t.assert.ok(hasMissed(d1.visible, 'biweekly'));
    t.assert.ok(hasMissed(d4.visible, 'biweekly'));
    t.assert.ok(!hasMissed(d5.visible, 'biweekly'), 'past W=4 days, should drop');
  });
});

// ── Symmetric: Work bucket should behave identically to MyDay bucket ───────

t.describe('renderTaskView :: Work category symmetry', function () {
  t.it('once-single fix applies to Work bucket too (bug #2 was originally reported against Work)', function () {
    var st = { '2026-05-28': { 'cisa-020': true } };
    var r = E.renderTaskView([cisa020], new Date(2026, 4, 30, 12), st);
    t.assert.equal(r.visible.length, 0);
    t.assert.equal(r.caughtUp.length, 0);
  });
  t.it('span fix applies to Work bucket too (the original iPad regression)', function () {
    var r = E.renderTaskView([projectX], new Date(2026, 4, 28, 12), {});
    t.assert.ok(hasMissed(r.visible, 'project-x#2026-05-26'));
    t.assert.ok(hasMissed(r.visible, 'project-x#2026-05-27'));
  });
});
