// Scenario tests for the "backfill" date-navigation feature: stepping the board
// back up to 14 days to tick off DAILY tasks missed before the midnight reset.
//
// Covers the exact scenarios discussed during design:
//   • 14-day window clamping + no-forward-past-today
//   • the midnight logical-day rollover interaction
//   • which day a tick reads/writes (boardDateKey) for Morning vs My Day
//   • historical view = daily-only, multi-slot expanded, saved ticks pre-checked
//   • Q1: a carried-forward weekly miss is NOT shown in history
//   • Q2: a daily done on time shows pre-ticked
//   • Q3: a weekly missed-then-caught task is shown on neither day
//   • once / interval tasks are excluded; no "Missed" markers ever

'use strict';

var t = require('./harness');
var E = require('./task-engine');

// Friday 2026-06-26, noon → logical day = 2026-06-26, floor = 2026-06-12.
var NOON = new Date(2026, 5, 26, 12, 0);
// 00:30 is already the new calendar day (rollover is at midnight).
var PRE_ROLLOVER = new Date(2026, 5, 26, 0, 30);

// ── Fixtures ────────────────────────────────────────────────────────────────
var aligners = { id: 'aligners', title: 'Aligners', frequency: { type: 'daily' } };
var legacyNoFreq = { id: 'legacy', title: 'Legacy' }; // missing frequency == daily
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
var gym = { id: 'gym', title: 'Gym', frequency: { type: 'weekly', days: [1, 3, 5] } };
var biweekly = { id: 'biweekly', title: 'Biweekly', frequency: { type: 'interval', startDate: '2026-05-04', every: 2, day: 1 } };
var doctorVisit = { id: 'doctor', title: 'Doctor', frequency: { type: 'once', startDate: '2026-06-20', endDate: '2026-06-20' } };
var readingSprint = { id: 'reading', title: 'Reading', frequency: { type: 'once', startDate: '2026-06-18', endDate: '2026-06-21' } };

function card(cards, id) { return cards.filter(function (c) { return c.id === id; })[0]; }

// ── Date-window navigation (stepViewDate) ────────────────────────────────────

t.describe('backfill :: stepViewDate window clamping', function () {
  t.it('from live today, Previous → yesterday', function () {
    t.assert.equal(E.stepViewDate(null, -1, NOON), '2026-06-25');
  });
  t.it('from a past day, Previous → one more day back', function () {
    t.assert.equal(E.stepViewDate('2026-06-25', -1, NOON), '2026-06-24');
  });
  t.it('14 consecutive Previous clicks reach the floor, then stop', function () {
    var key = null;
    var keys = [];
    for (var i = 0; i < 16; i += 1) {
      key = E.stepViewDate(key, -1, NOON);
      keys.push(key);
    }
    // 14 distinct days back, then the 15th/16th clicks are clamped (no change).
    t.assert.equal(keys[13], '2026-06-12', 'floor is logical today − 14 days');
    t.assert.equal(keys[14], '2026-06-12', 'clamped at floor');
    t.assert.equal(keys[15], '2026-06-12', 'still clamped');
  });
  t.it('minBackfillKey is exactly 14 days before logical today', function () {
    t.assert.equal(E.minBackfillKey(NOON), '2026-06-12');
  });
  t.it('from live today, Next → tomorrow (plan-ahead, future view)', function () {
    t.assert.equal(E.stepViewDate(null, 1, NOON), '2026-06-27');
  });
  t.it('from yesterday, Next → back to live today (null)', function () {
    t.assert.equal(E.stepViewDate('2026-06-25', 1, NOON), null);
  });
  t.it('from two days ago, Next → one day forward (still historical)', function () {
    t.assert.equal(E.stepViewDate('2026-06-24', 1, NOON), '2026-06-25');
  });
});

t.describe('backfill :: midnight rollover interaction', function () {
  t.it('at 00:30 the logical "today" is already the new calendar day', function () {
    t.assert.equal(E.getDateKey(E.getLogicalDate(PRE_ROLLOVER)), '2026-06-26');
  });
  t.it('Previous at 00:30 steps back from the new logical day', function () {
    // Just past midnight: logical today is Jun 26, so back = Jun 25.
    t.assert.equal(E.stepViewDate(null, -1, PRE_ROLLOVER), '2026-06-25');
  });
  t.it('floor at 00:30 is 14 days before the logical day', function () {
    t.assert.equal(E.minBackfillKey(PRE_ROLLOVER), '2026-06-12');
  });
});

// ── isHistoricalView ─────────────────────────────────────────────────────────

t.describe('backfill :: isHistoricalView', function () {
  t.it('null (live) is not historical', function () {
    t.assert.equal(E.isHistoricalView(null, NOON), false);
  });
  t.it('logical today key is not historical', function () {
    t.assert.equal(E.isHistoricalView('2026-06-26', NOON), false);
  });
  t.it('a past day key is historical', function () {
    t.assert.equal(E.isHistoricalView('2026-06-20', NOON), true);
  });
});

// ── boardDateKey: which day a tick reads/writes ──────────────────────────────

t.describe('backfill :: boardDateKey', function () {
  t.it('historical view → both screens use the viewed day', function () {
    t.assert.equal(E.boardDateKey('morning', '2026-06-20', NOON), '2026-06-20');
    t.assert.equal(E.boardDateKey('myday', '2026-06-20', NOON), '2026-06-20');
  });
  t.it('live daytime → Morning and My Day agree on today', function () {
    t.assert.equal(E.boardDateKey('morning', null, NOON), '2026-06-26');
    t.assert.equal(E.boardDateKey('myday', null, NOON), '2026-06-26');
  });
  t.it('live at 00:30 → Morning and My Day both use the new logical day', function () {
    // With the midnight rollover, both screens agree on the calendar day.
    t.assert.equal(E.boardDateKey('morning', null, PRE_ROLLOVER), '2026-06-26');
    t.assert.equal(E.boardDateKey('myday', null, PRE_ROLLOVER), '2026-06-26');
  });
});

// ── Historical render scenarios (the design Q&A) ─────────────────────────────

t.describe('backfill :: renderHistoricalView daily-only + pre-ticked', function () {
  t.it('Q2: a daily done on the viewed day shows pre-ticked', function () {
    var state = { '2026-06-20': { 'eye-drops__first': true } };
    var r = E.renderHistoricalView([eyeDrops], '2026-06-20', state);
    t.assert.equal(r.dateKey, '2026-06-20');
    t.assert.equal(card(r.cards, 'eye-drops__first').checked, true, 'done slot is checked');
    t.assert.equal(card(r.cards, 'eye-drops__second').checked, false, 'untouched slot unchecked');
  });
  t.it('a daily not done shows unchecked', function () {
    var r = E.renderHistoricalView([aligners], '2026-06-20', {});
    t.assert.equal(r.cards.length, 1);
    t.assert.equal(r.cards[0].id, 'aligners');
    t.assert.equal(r.cards[0].checked, false);
  });
  t.it('a task with no frequency is treated as daily and shown', function () {
    var r = E.renderHistoricalView([legacyNoFreq], '2026-06-20', {});
    t.assert.equal(r.cards.length, 1);
    t.assert.equal(r.cards[0].id, 'legacy');
  });
  t.it('multi-slot daily: ALL slots present, only saved ones checked', function () {
    var state = { '2026-06-20': { 'eye-drops__second': true, 'eye-drops__fifth': true } };
    var r = E.renderHistoricalView([eyeDrops], '2026-06-20', state);
    t.assert.equal(r.cards.length, 6, 'all six slots rendered');
    t.assert.equal(card(r.cards, 'eye-drops__second').checked, true);
    t.assert.equal(card(r.cards, 'eye-drops__fifth').checked, true);
    t.assert.equal(card(r.cards, 'eye-drops__first').checked, false);
    t.assert.equal(card(r.cards, 'eye-drops__sixth').checked, false);
  });
  t.it('no card is ever marked missed in history', function () {
    var state = { '2026-06-20': { 'eye-drops__third': true } };
    var r = E.renderHistoricalView([eyeDrops, aligners], '2026-06-20', state);
    r.cards.forEach(function (c) { t.assert.equal(c.missed, false, c.id + ' must not be missed'); });
  });
});

t.describe('backfill :: renderHistoricalView excludes non-daily', function () {
  t.it('Q1: a weekly (carry-forward) task is NOT shown in history', function () {
    var r = E.renderHistoricalView([gym], '2026-06-20', {});
    t.assert.equal(r.cards.length, 0);
  });
  t.it('Q3: a weekly missed-then-caught task is shown on neither day', function () {
    // Even with a saved completion on the viewed day, weekly tasks are excluded
    // outright, so it never appears in the daily-only backfill view.
    var monday = E.renderHistoricalView([gym], '2026-06-22', { '2026-06-22': { gym: true } });
    var tuesday = E.renderHistoricalView([gym], '2026-06-23', { '2026-06-23': { gym: true } });
    t.assert.equal(monday.cards.length, 0);
    t.assert.equal(tuesday.cards.length, 0);
  });
  t.it('interval and once (single + span) tasks are excluded', function () {
    var r = E.renderHistoricalView([biweekly, doctorVisit, readingSprint], '2026-06-20', {});
    t.assert.equal(r.cards.length, 0);
  });
  t.it('mixed bucket → only dailies survive (weekly/once dropped)', function () {
    var state = { '2026-06-20': { 'eye-drops__first': true } };
    var r = E.renderHistoricalView([gym, eyeDrops, doctorVisit, aligners, biweekly], '2026-06-20', state);
    var ids = r.cards.map(function (c) { return c.id; });
    t.assert.deepEqual(ids, [
      'eye-drops__first', 'eye-drops__second', 'eye-drops__third',
      'eye-drops__fourth', 'eye-drops__fifth', 'eye-drops__sixth',
      'aligners'
    ]);
    t.assert.equal(card(r.cards, 'eye-drops__first').checked, true);
  });
  t.it('a bucket of only non-daily tasks renders an empty (but valid) view', function () {
    var r = E.renderHistoricalView([gym, doctorVisit], '2026-06-20', {});
    t.assert.equal(r.cards.length, 0);
    t.assert.equal(r.dateKey, '2026-06-20');
  });
});
