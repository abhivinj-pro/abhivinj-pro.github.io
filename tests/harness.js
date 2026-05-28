// Tiny zero-dependency test harness.
//
// Why hand-rolled (no mocha/jest)?  This is a vanilla static site with no
// build step and no node_modules. Keeping the harness dependency-free means
// `node tests/run.js` works on a fresh clone with nothing installed.
//
// Usage from any test file:
//   const t = require('./harness');
//   t.describe('group', () => {
//     t.it('case', () => { t.assert.equal(actual, expected, 'msg'); });
//   });
//   t.run();   // (called once at the bottom of run.js)

'use strict';

var groups = [];
var currentGroup = null;

function describe(name, fn) {
  var g = { name: name, cases: [] };
  groups.push(g);
  var prev = currentGroup;
  currentGroup = g;
  try { fn(); } finally { currentGroup = prev; }
}

function it(name, fn) {
  if (!currentGroup) { throw new Error('it() called outside describe()'); }
  currentGroup.cases.push({ name: name, fn: fn });
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (var i = 0; i < ak.length; i += 1) {
      if (!deepEqual(a[ak[i]], b[ak[i]])) return false;
    }
    return true;
  }
  return false;
}

function fmt(v) {
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

var assert = {
  ok: function (cond, msg) {
    if (!cond) { throw new Error('assert.ok failed: ' + (msg || '')); }
  },
  equal: function (actual, expected, msg) {
    if (actual !== expected) {
      throw new Error('assert.equal failed: ' + (msg || '') +
        '\n  expected: ' + fmt(expected) + '\n  actual:   ' + fmt(actual));
    }
  },
  notEqual: function (actual, expected, msg) {
    if (actual === expected) {
      throw new Error('assert.notEqual failed: ' + (msg || '') + ' (got ' + fmt(actual) + ')');
    }
  },
  deepEqual: function (actual, expected, msg) {
    if (!deepEqual(actual, expected)) {
      throw new Error('assert.deepEqual failed: ' + (msg || '') +
        '\n  expected: ' + fmt(expected) + '\n  actual:   ' + fmt(actual));
    }
  },
  match: function (str, re, msg) {
    if (!re.test(str)) {
      throw new Error('assert.match failed: ' + (msg || '') + '\n  string:  ' + fmt(str) + '\n  pattern: ' + re);
    }
  },
  includes: function (arr, predicate, msg) {
    if (!arr.some(predicate)) {
      throw new Error('assert.includes failed: ' + (msg || '') + '\n  haystack: ' + fmt(arr));
    }
  },
  excludes: function (arr, predicate, msg) {
    if (arr.some(predicate)) {
      throw new Error('assert.excludes failed: ' + (msg || '') + '\n  haystack: ' + fmt(arr));
    }
  }
};

function run() {
  var totalPass = 0, totalFail = 0, failures = [];
  var t0 = Date.now();
  for (var i = 0; i < groups.length; i += 1) {
    var g = groups[i];
    console.log('\n── ' + g.name);
    for (var j = 0; j < g.cases.length; j += 1) {
      var c = g.cases[j];
      try {
        c.fn();
        totalPass += 1;
        console.log('  \u2713 ' + c.name);
      } catch (e) {
        totalFail += 1;
        failures.push({ group: g.name, case: c.name, err: e });
        console.log('  \u2717 ' + c.name);
        console.log('    ' + String(e.message || e).split('\n').join('\n    '));
      }
    }
  }
  var dt = Date.now() - t0;
  console.log('\n──────────────────────────────────────');
  console.log('PASS ' + totalPass + '  FAIL ' + totalFail + '  (' + dt + 'ms)');
  if (totalFail > 0) {
    console.log('\nFailures:');
    failures.forEach(function (f) {
      console.log('  \u2717 [' + f.group + '] ' + f.case);
    });
    process.exit(1);
  }
}

module.exports = { describe: describe, it: it, assert: assert, run: run };
