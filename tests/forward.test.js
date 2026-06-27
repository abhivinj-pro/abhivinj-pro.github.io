// Scenario tests for the "plan-ahead" forward date-navigation feature: stepping
// the board FORWARD up to 7 days to preview — and optionally tick off early —
// the tasks scheduled on an upcoming day.
//
// Covers the design decisions locked during Q&A:
//   • forward 7-day window clamping (ceiling = logical today + 7)
//   • view-mode split: past = historical (daily-only), future = plan-ahead (all
//     scheduled tasks via isTaskForDate)
//   • buildFutureCards: weekly on/off scheduling, once-in-range "Day X of N",
//     multi-slot expansion into per-slot composite ids
//   • boardDateKey resolves a tick to the viewed FUTURE day
//   • renderFutureView pre-checks cards from that day's saved record

'use strict';

var t = require('./harness');
var E = require('./task-engine');

// Friday 2026-06-26, noon → logical day = 2026-06-26, ceiling = 2026-07-03.
// Forward weekdays from here: Sat 06-27, Sun 06-28, Mon 06-29, Tue 06-30,
// Wed 07-01, Thu 07-02, Fri 07-03.
var NOON = new Date(2026, 5, 26, 12, 0);

// ── Fixtures ────────────────────────────────────────────────────────────────
var aligners = { id: 'aligners', title: 'Aligners', frequency: { type: 'daily' } };
var legacyNoFreq = { id: 'legacy', title: 'Legacy' }; // missing frequency == daily
var eyeDrops = {
  id: 'eye-drops', title: 'Eye Drops', frequency: { type: 'daily' },
  times: [
    { label: 'First',  from: 7,  to: 12 },
    { label: 'Second', from: 12, to: 14 }
  ]
};
// weekly Mon/Wed/Fri → scheduled 06-29 (Mon) & 07-01 (Wed), NOT 06-27 (Sat).
var gym = { id: 'gym', title: 'Gym', frequency: { type: 'weekly', days: [1, 3, 5] } };
// once span 06-27..06-30 (4 days) → on 06-29 it is "Day 3 of 4".
var trip = { id: 'trip', title: 'Trip', frequency: { type: 'once', startDate: '2026-06-27', endDate: '2026-06-30' } };
// single-day once on 07-01.
var dentist = { id: 'dentist', title: 'Dentist', frequency: { type: 'once', startDate: '2026-07-01', endDate: '2026-07-01' } };

function card(cards, id) { return cards.filter(function (c) { return c.id === id; })[0]; }
function dk(key) { return E.parseLocalDateKey(key); }

// ── Forward stepping + clamp ─────────────────────────────────────────────────

t.describe('forward :: stepViewDate forward clamping', function () {
  t.it('from live today, Next → tomorrow', function () {
    t.assert.equal(E.stepViewDate(null, 1, NOON), '2026-06-27');
  });
  t.it('from a future day, Next → one more day forward', function () {
    t.assert.equal(E.stepViewDate('2026-06-27', 1, NOON), '2026-06-28');
  });
  t.it('7 consecutive Next clicks reach the ceiling, then stop', function () {
    var key = null;
    var keys = [];
    for (var i = 0; i < 9; i += 1) {
      key = E.stepViewDate(key, 1, NOON);
      keys.push(key);
    }
    t.assert.equal(keys[6], '2026-07-03', 'ceiling is logical today + 7 days');
    t.assert.equal(keys[7], '2026-07-03', 'clamped at ceiling');
    t.assert.equal(keys[8], '2026-07-03', 'still clamped');
  });
  t.it('maxForwardKey is exactly 7 days after logical today', function () {
    t.assert.equal(E.maxForwardKey(NOON), '2026-07-03');
  });
  t.it('from tomorrow, Previous → back to live today (null)', function () {
    t.assert.equal(E.stepViewDate('2026-06-27', -1, NOON), null);
  });
  t.it('from two days ahead, Previous → one day back (still future)', function () {
    t.assert.equal(E.stepViewDate('2026-06-28', -1, NOON), '2026-06-27');
  });
});

// ── View-mode split (past vs future vs today) ────────────────────────────────

t.describe('forward :: isHistoricalView / isFutureView split', function () {
  t.it('a future key is future, not historical', function () {
    t.assert.equal(E.isFutureView('2026-06-29', NOON), true);
    t.assert.equal(E.isHistoricalView('2026-06-29', NOON), false);
  });
  t.it('a past key is historical, not future', function () {
    t.assert.equal(E.isHistoricalView('2026-06-25', NOON), true);
    t.assert.equal(E.isFutureView('2026-06-25', NOON), false);
  });
  t.it('today (the live key) is neither past nor future', function () {
    t.assert.equal(E.isFutureView('2026-06-26', NOON), false);
    t.assert.equal(E.isHistoricalView('2026-06-26', NOON), false);
  });
  t.it('null (live today) is neither past nor future', function () {
    t.assert.equal(E.isFutureView(null, NOON), false);
    t.assert.equal(E.isHistoricalView(null, NOON), false);
  });
});

// ── buildFutureCards: ALL scheduled tasks for the day ────────────────────────

t.describe('forward :: buildFutureCards shows all scheduled tasks', function () {
  var bucket = [aligners, legacyNoFreq, gym, trip, dentist];

  t.it('Saturday 06-27: dailies + the in-range once, but NOT the off-day weekly', function () {
    var cards = E.buildFutureCards(bucket, dk('2026-06-27'));
    t.assert.ok(card(cards, 'aligners'), 'daily shown');
    t.assert.ok(card(cards, 'legacy'), 'no-frequency (daily) shown');
    t.assert.ok(card(cards, 'trip'), 'once span (starts today) shown');
    t.assert.equal(card(cards, 'gym'), undefined, 'Sat is not a gym day');
    t.assert.equal(card(cards, 'dentist'), undefined, 'dentist is 07-01, not today');
  });
  t.it('Monday 06-29: weekly gym now appears', function () {
    var cards = E.buildFutureCards(bucket, dk('2026-06-29'));
    t.assert.ok(card(cards, 'gym'), 'Mon is a gym day');
  });
  t.it('multi-day once shows a "Day X of N" badge', function () {
    var cards = E.buildFutureCards(bucket, dk('2026-06-29'));
    var c = card(cards, 'trip');
    t.assert.ok(c, 'trip shown on 06-29 (within 06-27..06-30)');
    t.assert.equal(c.timeLabel, 'Day 3 of 4');
  });
  t.it('single-day once uses the bare task (no Day-of badge)', function () {
    var cards = E.buildFutureCards([dentist], dk('2026-07-01'));
    var c = card(cards, 'dentist');
    t.assert.ok(c, 'dentist shown on its single day');
    t.assert.ok(!c.timeLabel || c.timeLabel === null, 'no Day X of N for a single-day once');
  });
  t.it('multi-slot daily expands into per-slot composite ids', function () {
    var cards = E.buildFutureCards([eyeDrops], dk('2026-06-27'));
    t.assert.ok(card(cards, 'eye-drops__first'), 'first slot composite id');
    t.assert.ok(card(cards, 'eye-drops__second'), 'second slot composite id');
    t.assert.equal(card(cards, 'eye-drops'), undefined, 'no bare multi-slot card');
  });
});

// ── Tick resolution + pre-checked state ──────────────────────────────────────

t.describe('forward :: a tick lands on the viewed future day', function () {
  t.it('boardDateKey returns the future viewed key for both screens', function () {
    t.assert.equal(E.boardDateKey('myday', '2026-06-29', NOON), '2026-06-29');
    t.assert.equal(E.boardDateKey('morning', '2026-06-29', NOON), '2026-06-29');
  });
  t.it('renderFutureView pre-checks cards from that future day\'s saved record', function () {
    var bucket = [aligners, gym];
    var stateByDay = { '2026-06-29': { aligners: true } };
    var view = E.renderFutureView(bucket, '2026-06-29', stateByDay);
    t.assert.equal(view.dateKey, '2026-06-29');
    t.assert.equal(card(view.cards, 'aligners').checked, true, 'early-ticked daily is checked');
    t.assert.equal(card(view.cards, 'gym').checked, false, 'untouched task is unchecked');
    t.assert.equal(card(view.cards, 'aligners').missed, false, 'the future is never missed');
  });
  t.it('an early tick uses the same id the live board will use that day', function () {
    // Multi-slot composite ids must match between the future preview and the
    // live board so the tick is recognized when the day arrives.
    var futureCards = E.buildFutureCards([eyeDrops], dk('2026-06-27'));
    var liveCards = E.buildHistoricalCards([eyeDrops]); // same per-slot scheme
    t.assert.deepEqual(
      futureCards.map(function (c) { return c.id; }).sort(),
      liveCards.map(function (c) { return c.id; }).sort()
    );
  });
});
