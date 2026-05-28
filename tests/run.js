// Entry point for `npm test` (or `node tests/run.js`).
// Loads every *.test.js in this directory, then runs the harness.

'use strict';

var fs = require('fs');
var path = require('path');
var harness = require('./harness');

var files = fs.readdirSync(__dirname)
  .filter(function (f) { return /\.test\.js$/.test(f); })
  .sort();

console.log('Running ' + files.length + ' test file(s):');
files.forEach(function (f) { console.log('  • ' + f); });

files.forEach(function (f) { require(path.join(__dirname, f)); });

harness.run();
