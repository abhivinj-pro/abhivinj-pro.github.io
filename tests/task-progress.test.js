// Tests for assets/js/data/task-progress.js (window.TaskProgress).
// Loads the real source in a sandbox so there is no mirrored-logic drift.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var t = require('./harness');

var src = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'data', 'task-progress.js'),
  'utf8'
);
var sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
var TP = sandbox.window.TaskProgress;

var measure = { id: 'water', measure: { target: 8, unit: 'glass', unitLabel: 'glasses', step: 1 } };
var measure10 = { id: 'water', measure: { target: 10, unit: 'glass', unitLabel: 'glasses', step: 1 } };
var steps = { id: 'steps', measure: { target: 10000, unit: 'step', unitLabel: 'steps', step: 100 } };
var binary = { id: 'meditate' };

t.describe('TaskProgress.isMeasurable', function () {
  t.it('true when a valid measure block exists', function () {
    t.assert.equal(TP.isMeasurable(measure), true);
  });
  t.it('false for a binary task', function () {
    t.assert.equal(TP.isMeasurable(binary), false);
  });
  t.it('false when target is missing/zero', function () {
    t.assert.equal(TP.isMeasurable({ measure: { target: 0 } }), false);
  });
});

t.describe('TaskProgress.readEntry — value shapes', function () {
  t.it('undefined -> 0 of goal, not done', function () {
    var e = TP.readEntry(undefined, measure);
    t.assert.equal(e.value, 0);
    t.assert.equal(e.goal, 8);
    t.assert.equal(e.done, false);
  });
  t.it('legacy true -> value equals target, done', function () {
    var e = TP.readEntry(true, measure);
    t.assert.equal(e.value, 8);
    t.assert.equal(e.done, true);
  });
  t.it('bare number -> value with current target as goal', function () {
    var e = TP.readEntry(5, measure);
    t.assert.equal(e.value, 5);
    t.assert.equal(e.goal, 8);
    t.assert.equal(e.done, false);
  });
  t.it('object {v,g} -> honours the snapshot goal', function () {
    var e = TP.readEntry({ v: 5, g: 8 }, measure);
    t.assert.equal(e.value, 5);
    t.assert.equal(e.goal, 8);
  });
  t.it('binary task -> 0/1 or 1/1', function () {
    t.assert.equal(TP.readEntry(false, binary).value, 0);
    t.assert.equal(TP.readEntry(true, binary).done, true);
    t.assert.equal(TP.readEntry(true, binary).isMeasurable, false);
  });
});

t.describe('TaskProgress — goal snapshot is immutable to target changes', function () {
  t.it('an 8/8 entry stays done even after the target is raised to 10', function () {
    // Entry written when target was 8; task now has target 10.
    var e = TP.readEntry({ v: 8, g: 8 }, measure10);
    t.assert.equal(e.goal, 8, 'goal comes from the snapshot, not the new target');
    t.assert.equal(e.done, true);
  });
  t.it('a fresh entry uses the new target', function () {
    var e = TP.readEntry(undefined, measure10);
    t.assert.equal(e.goal, 10);
  });
});

t.describe('TaskProgress.writeEntry', function () {
  t.it('first write snapshots the current target', function () {
    t.assert.deepEqual(TP.writeEntry(undefined, measure, 3), { v: 3, g: 8 });
  });
  t.it('later writes preserve the existing snapshot even if target changed', function () {
    t.assert.deepEqual(TP.writeEntry({ v: 3, g: 8 }, measure10, 5), { v: 5, g: 8 });
  });
  t.it('clamps negative values to 0', function () {
    t.assert.deepEqual(TP.writeEntry(undefined, measure, -4), { v: 0, g: 8 });
  });
  t.it('binary task returns a boolean', function () {
    t.assert.equal(TP.writeEntry(false, binary, true), true);
    t.assert.equal(TP.writeEntry(true, binary, 0), false);
  });
});

t.describe('TaskProgress — helpers', function () {
  t.it('percent is uncapped (over-achievement shows > 100)', function () {
    t.assert.equal(TP.percent({ v: 10, g: 8 }, measure), 125);
  });
  t.it('formatNumber inserts thousands separators', function () {
    t.assert.equal(TP.formatNumber(8000), '8,000');
    t.assert.equal(TP.formatNumber(500), '500');
  });
  t.it('stepOf returns the configured step', function () {
    t.assert.equal(TP.stepOf(steps), 100);
    t.assert.equal(TP.stepOf(binary), 1);
  });
  t.it('unitLabel comes from the task', function () {
    t.assert.equal(TP.unitLabel(measure), 'glasses');
    t.assert.equal(TP.unitLabel(binary), '');
  });
  t.it('usesChips only for large/coarse goals', function () {
    t.assert.equal(TP.usesChips(measure), false);
    t.assert.equal(TP.usesChips(steps), true);
  });
});
