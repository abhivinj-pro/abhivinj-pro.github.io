/*
 * One-off PWA icon generator for Habit Board.
 * Draws a dark-background maskable icon with a pink checkmark inside a ring,
 * then writes real PNGs to assets/icons/. Uses only Node built-ins (zlib).
 *
 * Run:  node tools/gen-icons.js
 */
'use strict';

var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

// Theme colours (match assets/css/styles.css :root).
var BG = [0x05, 0x07, 0x0d];        // --bg
var PINK = [0xff, 0x5c, 0x8a];      // accent pink
var RING = [0x57, 0xd5, 0xff];      // accent cyan (subtle ring)

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

// Distance from point p to segment ab.
function segDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
  var cx = ax + t * dx, cy = ay + t * dy;
  var ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

function buildPng(size) {
  var c = size / 2;
  // Checkmark geometry, scaled to icon size (kept within ~70% safe zone).
  var p1 = [size * 0.34, size * 0.52];
  var p2 = [size * 0.45, size * 0.64];
  var p3 = [size * 0.68, size * 0.37];
  var stroke = size * 0.055;          // half-thickness of the check
  var ringR = size * 0.30;            // ring radius
  var ringW = size * 0.022;           // ring half-thickness
  var edge = Math.max(1, size * 0.006); // anti-alias width

  // Raw RGBA, each row prefixed with a filter byte (0 = none).
  var raw = Buffer.alloc((size * 4 + 1) * size);
  var o = 0;
  for (var y = 0; y < size; y++) {
    raw[o++] = 0; // filter type
    for (var x = 0; x < size; x++) {
      var col = BG.slice();

      // Subtle radial glow toward centre.
      var dc = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) / (size * 0.5);
      if (dc < 1) { col = mix(col, [0x12, 0x16, 0x22], (1 - dc) * 0.5); }

      // Ring.
      var dr = Math.abs(Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) - ringR);
      var ringA = 1 - smooth(dr, ringW, edge);
      if (ringA > 0) { col = mix(col, RING, ringA * 0.55); }

      // Checkmark (two segments).
      var d = Math.min(
        segDist(x, y, p1[0], p1[1], p2[0], p2[1]),
        segDist(x, y, p2[0], p2[1], p3[0], p3[1])
      );
      var checkA = 1 - smooth(d, stroke, edge);
      if (checkA > 0) { col = mix(col, PINK, checkA); }

      raw[o++] = col[0];
      raw[o++] = col[1];
      raw[o++] = col[2];
      raw[o++] = 0xff; // opaque
    }
  }
  return encodePng(size, size, raw);
}

// Returns 0 inside the band, ramping to 1 outside over `edge` px.
function smooth(dist, halfWidth, edge) {
  if (dist <= halfWidth) { return 0; }
  if (dist >= halfWidth + edge) { return 1; }
  return (dist - halfWidth) / edge;
}

function encodePng(w, h, raw) {
  function chunk(type, data) {
    var len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    var typeBuf = Buffer.from(type, 'ascii');
    var body = Buffer.concat([typeBuf, data]);
    var crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }
  var sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  var idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

var crcTable = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
}());

function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

var outDir = path.join(__dirname, '..', 'assets', 'icons');
if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }

[[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]
  .forEach(function (spec) {
    var png = buildPng(spec[0]);
    fs.writeFileSync(path.join(outDir, spec[1]), png);
    console.log('wrote', spec[1], '(' + png.length + ' bytes)');
  });
