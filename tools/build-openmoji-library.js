#!/usr/bin/env node
/*
 * build-openmoji-library.js
 *
 * Curates a small, searchable subset of OpenMoji emojis for the task icon
 * picker. Reads the committed OpenMoji metadata (resources/openmoji.json),
 * keeps ~500 useful base emojis (no skin-tone variants; gender variants kept),
 * verifies each SVG file actually exists under resources/openmoji-svg-color/,
 * and writes assets/js/icons/openmoji-library.js exposing window.OPENMOJI_LIBRARY.
 *
 * The generated file stores a file PATH per emoji (not inline SVG) so it stays
 * small; the picker renders lazy <img> tiles and inlines the SVG only when the
 * user actually selects one.
 *
 * Usage:  npm run build:icons   (or)   node tools/build-openmoji-library.js
 * Re-run whenever you want to refresh the curated set.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var META_PATH = path.join(ROOT, 'resources', 'openmoji.json');
var SVG_DIR = path.join(ROOT, 'resources', 'openmoji-svg-color');
var OUT_PATH = path.join(ROOT, 'assets', 'js', 'icons', 'openmoji-library.js');

// OpenMoji group -> friendly picker category. Groups not listed are dropped
// (flags, extras-openmoji, extras-unicode, component).
var GROUP_TO_CATEGORY = {
  'smileys-emotion': 'Smileys',
  'people-body': 'People',
  'animals-nature': 'Animals & Nature',
  'food-drink': 'Food & Drink',
  'activities': 'Activities',
  'travel-places': 'Travel & Places',
  'objects': 'Objects',
  'symbols': 'Symbols'
};

// Per-group cap (taken in ascending `order`, i.e. most standard emojis first).
// Tuned to land near ~1000 total after the file-existence check.
var GROUP_CAPS = {
  'smileys-emotion': 140,
  'people-body': 160,
  'animals-nature': 150,
  'food-drink': 125,
  'activities': 85,
  'travel-places': 120,
  'objects': 150,
  'symbols': 70
};

function titleCase(str) {
  return String(str || '').replace(/\S+/g, function (word) {
    // Preserve all-caps tokens (e.g. "ID", "TV") and tokens with digits.
    if (/[0-9]/.test(word) || (word.length > 1 && word === word.toUpperCase())) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function buildTags(entry) {
  var raw = [];
  [entry.tags, entry.openmoji_tags, entry.annotation, entry.subgroups].forEach(function (field) {
    if (!field) { return; }
    String(field).split(/[,\s]+/).forEach(function (t) { raw.push(t); });
  });
  var seen = Object.create(null);
  var out = [];
  raw.forEach(function (t) {
    var tag = t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (tag && tag.length > 1 && !seen[tag]) {
      seen[tag] = true;
      out.push(tag);
    }
  });
  return out;
}

function main() {
  if (!fs.existsSync(META_PATH)) {
    console.error('Missing metadata: ' + META_PATH);
    console.error('Download it once, e.g.:');
    console.error('  Invoke-WebRequest "https://cdn.jsdelivr.net/npm/openmoji@latest/data/openmoji.json" -OutFile resources/openmoji.json');
    process.exit(1);
  }
  if (!fs.existsSync(SVG_DIR)) {
    console.error('Missing SVG directory: ' + SVG_DIR);
    process.exit(1);
  }

  var meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

  // 1) Keep only chosen groups, base emojis (no skin-tone), with an existing SVG.
  var candidates = meta.filter(function (e) {
    if (!GROUP_TO_CATEGORY[e.group]) { return false; }   // wanted groups only
    if (e.skintone) { return false; }                    // drop skin-tone variants
    if (!e.hexcode) { return false; }
    return fs.existsSync(path.join(SVG_DIR, e.hexcode + '.svg'));
  });

  // 2) Sort by standard order (common emojis first) within each group.
  candidates.sort(function (a, b) { return (a.order || 1e9) - (b.order || 1e9); });

  // 3) Apply the per-group cap.
  var counts = Object.create(null);
  var picked = [];
  candidates.forEach(function (e) {
    var cap = GROUP_CAPS[e.group] || 0;
    var n = counts[e.group] || 0;
    if (n >= cap) { return; }
    counts[e.group] = n + 1;
    picked.push({
      id: 'emoji-' + e.hexcode,
      name: titleCase(e.annotation),
      category: GROUP_TO_CATEGORY[e.group],
      tags: buildTags(e),
      file: 'resources/openmoji-svg-color/' + e.hexcode + '.svg'
    });
  });

  // 4) Stable, human-friendly ordering in the output: by category, then name.
  picked.sort(function (a, b) {
    if (a.category !== b.category) { return a.category < b.category ? -1 : 1; }
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });

  // 5) Emit the module.
  var header =
    '/*\n' +
    ' * openmoji-library.js — GENERATED, do not edit by hand.\n' +
    ' * Source: resources/openmoji.json (OpenMoji, CC BY-SA 4.0).\n' +
    ' * Regenerate with: npm run build:icons\n' +
    ' *\n' +
    ' * Each entry: { id, name, category, tags[], file }. `file` is a path to a\n' +
    ' * full-color OpenMoji SVG; the icon picker renders it as a lazy <img> and\n' +
    ' * inlines the SVG only when the user selects it.\n' +
    ' */\n';
  var body = 'window.OPENMOJI_LIBRARY = ' + JSON.stringify(picked, null, 2) + ';\n';

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, header + body, 'utf8');

  var byCat = Object.create(null);
  picked.forEach(function (p) { byCat[p.category] = (byCat[p.category] || 0) + 1; });
  console.log('Wrote ' + picked.length + ' emojis -> ' + path.relative(ROOT, OUT_PATH));
  Object.keys(byCat).sort().forEach(function (c) { console.log('  ' + c + ': ' + byCat[c]); });
}

main();
