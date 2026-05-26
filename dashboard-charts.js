/*
 * dashboard-charts.js — hand-rolled SVG chart primitives.
 *
 * Targets iOS 9 Safari (iPad Air 1): vanilla ES5, `var`-style, no template
 * literals, no arrow funcs, no fetch, no third-party deps. Each primitive
 * mounts into a container by replacing its children with an inline <svg>.
 *
 * Public API on window.DashboardCharts:
 *   barChart(container, items, opts)       — items: [{ label, value, accent? }]
 *   stackedBarChart(container, groups, opts) — groups: [{ label, segments:[{ value, accent }] }]
 *   lineChart(container, series, opts)     — series: [{ name, color, points:[{x,y,label?}] }]
 *   donutChart(container, slices, opts)    — slices: [{ label, value, color }]
 *   sparkline(container, values, opts)     — values: [number]
 *   heatmap(container, columns, opts)      — columns: [[{value, status, label?}, ...]]
 *
 * `accent` strings map to the Habit Board palette:
 *   pink, blue, green, cyan, amber, purple
 *
 * Color rationale: we read the same hexes the CSS uses to keep the dashboard
 * visually consistent with `accent-*` classes in styles.css.
 */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ACCENT_HEX = {
    pink:   '#ff4f8a',
    blue:   '#338df4',
    green:  '#7ad730',
    cyan:   '#1cbfcb',
    amber:  '#ffbf21',
    purple: '#7d4fd7',
    muted:  '#5b6577'
  };

  // Heatmap ramp tuned for the dark background. `none` (scheduled but 0%) is
  // distinct from `empty` (not scheduled) so misses are visible.
  var HEATMAP_RAMP = [
    'rgba(255,255,255,0.04)', // 0% scheduled-done bucket
    'rgba(95,191,255,0.18)',  // 1-25%
    'rgba(95,191,255,0.38)',  // 26-50%
    'rgba(95,191,255,0.62)',  // 51-75%
    'rgba(95,191,255,0.92)'   // 76-100%
  ];
  var HEATMAP_MISSED = 'rgba(255,140,90,0.30)';   // scheduled, 0% done
  var HEATMAP_EMPTY  = 'rgba(255,255,255,0.025)'; // not scheduled

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (parent) { parent.appendChild(node); }
    return node;
  }

  function clear(container) {
    while (container.firstChild) { container.removeChild(container.firstChild); }
  }

  function accentColor(name) {
    if (!name) { return ACCENT_HEX.blue; }
    var key = String(name).replace(/^accent-/, '');
    return ACCENT_HEX[key] || ACCENT_HEX.blue;
  }

  function svgRoot(container, w, h) {
    var svg = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      'aria-hidden': 'true',
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    container.appendChild(svg);
    return svg;
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) { return '\u2014'; }
    return Math.round(v * 100) + '%';
  }

  // ── Horizontal/vertical bar chart ────────────────────────────────────────
  // Vertical bars; values normalized to a 0..1 scale unless opts.maxValue set.
  function barChart(container, items, opts) {
    clear(container);
    opts = opts || {};
    var W = 600;
    var H = opts.height || 220;
    var padL = 28, padR = 12, padT = 14, padB = 32;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var svg = svgRoot(container, W, H);

    if (!items || !items.length) {
      el('text', { x: W / 2, y: H / 2, fill: '#adb9cb', 'text-anchor': 'middle', 'font-size': 13 }, svg)
        .appendChild(document.createTextNode('No data'));
      return;
    }

    var maxV = opts.maxValue;
    if (!maxV) {
      maxV = 0;
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].value > maxV) { maxV = items[i].value; }
      }
      if (maxV === 0) { maxV = 1; }
    }

    // Y gridlines at 0, 50%, 100% (or quartiles for non-rate scales).
    var ticks = opts.format === 'pct' ? [0, 0.5, 1] : [0, 0.5, 1];
    for (var t = 0; t < ticks.length; t += 1) {
      var y = padT + innerH - innerH * ticks[t];
      el('line', {
        x1: padL, y1: y, x2: W - padR, y2: y,
        stroke: 'rgba(255,255,255,0.05)', 'stroke-width': 1
      }, svg);
      el('text', {
        x: padL - 6, y: y + 4, 'text-anchor': 'end',
        fill: '#5b6577', 'font-size': 10
      }, svg).appendChild(document.createTextNode(
        opts.format === 'pct' ? Math.round(ticks[t] * 100) + '%' :
          Math.round(ticks[t] * maxV)
      ));
    }

    var slot = innerW / items.length;
    var barW = Math.max(8, Math.min(48, slot * 0.62));

    for (var bi = 0; bi < items.length; bi += 1) {
      var it = items[bi];
      var ratio = it.value / maxV;
      if (ratio < 0) { ratio = 0; }
      if (ratio > 1) { ratio = 1; }
      var bh = innerH * ratio;
      var bx = padL + slot * bi + (slot - barW) / 2;
      var by = padT + innerH - bh;

      var grad = accentColor(it.accent);
      el('rect', {
        x: bx, y: by, width: barW, height: bh,
        rx: 4, ry: 4, fill: grad,
        opacity: it.dim ? 0.35 : 0.92
      }, svg);

      el('text', {
        x: bx + barW / 2, y: H - padB + 14,
        'text-anchor': 'middle', fill: '#adb9cb', 'font-size': 11
      }, svg).appendChild(document.createTextNode(it.label));

      if (opts.showValues !== false && ratio > 0.05) {
        el('text', {
          x: bx + barW / 2, y: by - 4,
          'text-anchor': 'middle', fill: '#f6f8fb', 'font-size': 10, 'font-weight': 700
        }, svg).appendChild(document.createTextNode(
          opts.format === 'pct' ? Math.round(ratio * 100) + '%' : String(it.value)
        ));
      }
    }
  }

  // ── Stacked bar chart (one stack per group) ──────────────────────────────
  function stackedBarChart(container, groups, opts) {
    clear(container);
    opts = opts || {};
    var W = 600;
    var H = opts.height || 220;
    var padL = 28, padR = 12, padT = 14, padB = 32;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var svg = svgRoot(container, W, H);

    if (!groups || !groups.length) {
      el('text', { x: W / 2, y: H / 2, fill: '#adb9cb', 'text-anchor': 'middle', 'font-size': 13 }, svg)
        .appendChild(document.createTextNode('No data'));
      return;
    }

    var maxV = 0;
    for (var i = 0; i < groups.length; i += 1) {
      var total = 0;
      var segs = groups[i].segments || [];
      for (var s = 0; s < segs.length; s += 1) { total += segs[s].value || 0; }
      if (total > maxV) { maxV = total; }
    }
    if (maxV === 0) { maxV = 1; }

    var slot = innerW / groups.length;
    var barW = Math.max(10, Math.min(40, slot * 0.62));

    for (var gi = 0; gi < groups.length; gi += 1) {
      var g = groups[gi];
      var bx = padL + slot * gi + (slot - barW) / 2;
      var yCursor = padT + innerH;
      var sgs = g.segments || [];
      for (var si = 0; si < sgs.length; si += 1) {
        var seg = sgs[si];
        var sh = innerH * ((seg.value || 0) / maxV);
        if (sh < 0.5 && seg.value > 0) { sh = 0.5; }
        yCursor -= sh;
        el('rect', {
          x: bx, y: yCursor, width: barW, height: sh,
          fill: accentColor(seg.accent), opacity: 0.92,
          rx: si === sgs.length - 1 ? 4 : 0,
          ry: si === sgs.length - 1 ? 4 : 0
        }, svg);
      }
      el('text', {
        x: bx + barW / 2, y: H - padB + 14,
        'text-anchor': 'middle', fill: '#adb9cb', 'font-size': 11
      }, svg).appendChild(document.createTextNode(g.label));
    }
  }

  // ── Line chart (single or multi-series) ──────────────────────────────────
  function lineChart(container, series, opts) {
    clear(container);
    opts = opts || {};
    var W = 600;
    var H = opts.height || 220;
    var padL = 32, padR = 12, padT = 14, padB = 30;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var svg = svgRoot(container, W, H);

    if (!series || !series.length) {
      el('text', { x: W / 2, y: H / 2, fill: '#adb9cb', 'text-anchor': 'middle', 'font-size': 13 }, svg)
        .appendChild(document.createTextNode('No data'));
      return;
    }

    var maxY = opts.maxValue;
    if (!maxY) {
      maxY = opts.format === 'pct' ? 1 : 0;
      for (var s = 0; s < series.length; s += 1) {
        var pts = series[s].points || [];
        for (var p = 0; p < pts.length; p += 1) {
          if (pts[p].y > maxY) { maxY = pts[p].y; }
        }
      }
      if (maxY === 0) { maxY = 1; }
    }

    var labels = series[0].points || [];
    var n = labels.length;
    if (n === 0) { return; }

    // Gridlines
    var ticks = [0, 0.5, 1];
    for (var t = 0; t < ticks.length; t += 1) {
      var y = padT + innerH - innerH * ticks[t];
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'rgba(255,255,255,0.05)' }, svg);
      el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', fill: '#5b6577', 'font-size': 10 }, svg)
        .appendChild(document.createTextNode(
          opts.format === 'pct' ? Math.round(ticks[t] * 100) + '%' : Math.round(ticks[t] * maxY)
        ));
    }

    function xFor(i) {
      if (n === 1) { return padL + innerW / 2; }
      return padL + (innerW * i) / (n - 1);
    }
    function yFor(v) {
      var r = v / maxY;
      if (r < 0) { r = 0; }
      if (r > 1) { r = 1; }
      return padT + innerH - innerH * r;
    }

    // X labels (show first, mid, last to avoid clutter)
    var labelIdx = [0];
    if (n > 2) { labelIdx.push(Math.floor((n - 1) / 2)); }
    if (n > 1) { labelIdx.push(n - 1); }
    for (var li = 0; li < labelIdx.length; li += 1) {
      var lx = xFor(labelIdx[li]);
      el('text', { x: lx, y: H - padB + 14, 'text-anchor': 'middle', fill: '#adb9cb', 'font-size': 10 }, svg)
        .appendChild(document.createTextNode(labels[labelIdx[li]].label || ''));
    }

    for (var si2 = 0; si2 < series.length; si2 += 1) {
      var ser = series[si2];
      var col = ser.color || ACCENT_HEX.blue;
      var d = '';
      var pts2 = ser.points || [];
      for (var pi = 0; pi < pts2.length; pi += 1) {
        var px = xFor(pi);
        var py = yFor(pts2[pi].y);
        d += (pi === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      }
      // Area fill under line
      if (opts.fill !== false && pts2.length > 1) {
        var area = d + 'L' + xFor(pts2.length - 1).toFixed(1) + ' ' + (padT + innerH) +
                   'L' + xFor(0).toFixed(1) + ' ' + (padT + innerH) + ' Z';
        el('path', { d: area, fill: col, opacity: 0.12 }, svg);
      }
      el('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      // Dots
      for (var pi2 = 0; pi2 < pts2.length; pi2 += 1) {
        el('circle', {
          cx: xFor(pi2), cy: yFor(pts2[pi2].y), r: 2.5,
          fill: col
        }, svg);
      }
    }
  }

  // ── Donut chart ──────────────────────────────────────────────────────────
  function donutChart(container, slices, opts) {
    clear(container);
    opts = opts || {};
    var W = 320;
    var H = opts.height || 220;
    var cx = W / 2;
    var cy = H / 2;
    var rOuter = Math.min(W, H) / 2 - 12;
    var rInner = rOuter * 0.62;
    var svg = svgRoot(container, W, H);

    var total = 0;
    for (var i = 0; i < slices.length; i += 1) { total += slices[i].value || 0; }

    if (total === 0) {
      el('circle', { cx: cx, cy: cy, r: rOuter, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': rOuter - rInner }, svg);
      el('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: '#adb9cb', 'font-size': 13 }, svg)
        .appendChild(document.createTextNode('No data'));
      return;
    }

    var start = -Math.PI / 2; // start at 12 o'clock
    for (var j = 0; j < slices.length; j += 1) {
      var sl = slices[j];
      if (!sl.value) { continue; }
      var frac = sl.value / total;
      var end = start + frac * Math.PI * 2;
      // Inset a hair on either side so adjacent slices visually separate.
      var sx1 = cx + rOuter * Math.cos(start);
      var sy1 = cy + rOuter * Math.sin(start);
      var ex1 = cx + rOuter * Math.cos(end);
      var ey1 = cy + rOuter * Math.sin(end);
      var sx2 = cx + rInner * Math.cos(end);
      var sy2 = cy + rInner * Math.sin(end);
      var ex2 = cx + rInner * Math.cos(start);
      var ey2 = cy + rInner * Math.sin(start);
      var large = (end - start) > Math.PI ? 1 : 0;
      var d = 'M' + sx1.toFixed(2) + ' ' + sy1.toFixed(2) +
              ' A' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + ex1.toFixed(2) + ' ' + ey1.toFixed(2) +
              ' L' + sx2.toFixed(2) + ' ' + sy2.toFixed(2) +
              ' A' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + ex2.toFixed(2) + ' ' + ey2.toFixed(2) +
              ' Z';
      el('path', { d: d, fill: sl.color || accentColor(sl.accent), opacity: 0.92 }, svg);
      start = end;
    }

    // Center label
    if (opts.centerLabel) {
      el('text', {
        x: cx, y: cy - 4, 'text-anchor': 'middle',
        fill: '#f6f8fb', 'font-size': 24, 'font-weight': 600
      }, svg).appendChild(document.createTextNode(opts.centerLabel));
    }
    if (opts.centerSub) {
      el('text', {
        x: cx, y: cy + 14, 'text-anchor': 'middle',
        fill: '#adb9cb', 'font-size': 11, 'letter-spacing': '0.08em'
      }, svg).appendChild(document.createTextNode(opts.centerSub));
    }

    // Legend below
    var legendY = H - 4;
    var legendX = 0;
    // Estimate widths: each entry ~ label.length * 6 + dot
    var legend = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(legend);
    var x = 8;
    for (var k = 0; k < slices.length; k += 1) {
      var s2 = slices[k];
      var color = s2.color || accentColor(s2.accent);
      el('rect', { x: x, y: legendY - 8, width: 8, height: 8, rx: 2, ry: 2, fill: color }, legend);
      var tx = el('text', { x: x + 12, y: legendY - 1, fill: '#adb9cb', 'font-size': 10 }, legend);
      tx.appendChild(document.createTextNode(s2.label + '  ' + Math.round((s2.value / total) * 100) + '%'));
      x += 12 + (s2.label.length + 5) * 5.8;
      if (x > W - 60 && k < slices.length - 1) { break; }
    }
  }

  // ── Sparkline ────────────────────────────────────────────────────────────
  function sparkline(container, values, opts) {
    clear(container);
    opts = opts || {};
    var W = opts.width || 120;
    var H = opts.height || 28;
    var svg = svgRoot(container, W, H);
    if (!values || !values.length) { return; }
    var max = 0;
    for (var i = 0; i < values.length; i += 1) { if (values[i] > max) { max = values[i]; } }
    if (max === 0) { max = 1; }
    var col = opts.color || ACCENT_HEX.cyan;
    var d = '';
    for (var j = 0; j < values.length; j += 1) {
      var x = values.length === 1 ? W / 2 : (W * j) / (values.length - 1);
      var y = H - (H - 2) * (values[j] / max) - 1;
      d += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    el('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, svg);
  }

  // ── Heatmap (GitHub-style, week columns × 7 rows) ────────────────────────
  // columns: array of week-columns, each a 7-length array of cells where:
  //   cell = { status: 'done'|'partial'|'miss'|'empty'|'future', frac: 0..1, label, onTap? }
  function heatmap(container, columns, opts) {
    clear(container);
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'dash-heatmap';
    container.appendChild(wrap);

    for (var c = 0; c < columns.length; c += 1) {
      var colDiv = document.createElement('div');
      colDiv.className = 'dash-heatmap-col';
      var col = columns[c];
      for (var r = 0; r < col.length; r += 1) {
        var cell = col[r];
        var node = document.createElement('button');
        node.type = 'button';
        node.className = 'dash-heatmap-cell';
        var bg = HEATMAP_EMPTY;
        if (cell.status === 'future') {
          node.className += ' future';
          node.disabled = true;
        } else if (cell.status === 'empty') {
          node.className += ' empty';
          node.disabled = true;
        } else if (cell.status === 'miss') {
          bg = HEATMAP_MISSED;
        } else {
          var f = cell.frac == null ? 0 : cell.frac;
          var bucket = 0;
          if (f > 0)    { bucket = 1; }
          if (f > 0.25) { bucket = 2; }
          if (f > 0.5)  { bucket = 3; }
          if (f > 0.75) { bucket = 4; }
          bg = HEATMAP_RAMP[bucket];
        }
        node.style.background = bg;
        if (cell.label) { node.title = cell.label; node.setAttribute('aria-label', cell.label); }
        if (cell.onTap) {
          (function (h) { node.onclick = function () { h(); }; }(cell.onTap));
        } else {
          node.disabled = true;
        }
        colDiv.appendChild(node);
      }
      wrap.appendChild(colDiv);
    }

    if (opts.showLegend !== false) {
      var legend = document.createElement('div');
      legend.className = 'dash-heatmap-legend';
      legend.appendChild(document.createTextNode('Less'));
      var cells = document.createElement('span');
      cells.className = 'dash-heatmap-legend-cells';
      for (var lc = 0; lc < HEATMAP_RAMP.length; lc += 1) {
        var lcell = document.createElement('span');
        lcell.className = 'dash-heatmap-cell';
        lcell.style.background = HEATMAP_RAMP[lc];
        lcell.disabled = true;
        cells.appendChild(lcell);
      }
      legend.appendChild(cells);
      legend.appendChild(document.createTextNode('More'));
      var missLabel = document.createElement('span');
      missLabel.style.marginLeft = '12px';
      missLabel.appendChild(document.createTextNode('  Missed:'));
      legend.appendChild(missLabel);
      var missCell = document.createElement('span');
      missCell.className = 'dash-heatmap-cell';
      missCell.style.background = HEATMAP_MISSED;
      missCell.disabled = true;
      legend.appendChild(missCell);
      container.appendChild(legend);
    }
  }

  window.DashboardCharts = {
    accentColor: accentColor,
    fmtPct: fmtPct,
    barChart: barChart,
    stackedBarChart: stackedBarChart,
    lineChart: lineChart,
    donutChart: donutChart,
    sparkline: sparkline,
    heatmap: heatmap,
    ACCENT_HEX: ACCENT_HEX
  };
}());
