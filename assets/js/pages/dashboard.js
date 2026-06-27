/*
 * dashboard.js — Insights page controller.
 *
 * Owns tab routing (via location.hash), the date-range chip, week/month
 * navigators, and per-tab render orchestration. Pulls aggregates from
 * window.DashboardData and SVG primitives from window.DashboardCharts.
 *
 * iOS 9 Safari safe: vanilla ES5, var-style, no template literals, no
 * arrow functions, no fetch. No frameworks. All charts are inline SVG.
 */
(function () {
  var TABS = ['overview', 'tasks', 'week', 'month', 'categories', 'archived'];

  var state = {
    tab: 'overview',
    rangeDays: 30,
    weekMonday: null,           // Date (Monday of selected week)
    monthCursor: null,          // Date (first of selected month)
    selectedTaskId: null,
    selectedArchivedId: null,   // task id shown in the Archived tab
    booted: false,
    reloading: false
  };

  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var WEEKDAY_HEAD = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // ── DOM helpers ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function qsa(sel, parent) { return (parent || document).querySelectorAll(sel); }
  function clearNode(n) { while (n && n.firstChild) { n.removeChild(n.firstChild); } }

  function setTab(tab) {
    if (TABS.indexOf(tab) === -1) { tab = 'overview'; }
    state.tab = tab;
    var tabs = qsa('.dash-tab');
    for (var i = 0; i < tabs.length; i += 1) {
      var active = tabs[i].getAttribute('data-tab') === tab;
      if (active) { tabs[i].classList.add('active'); tabs[i].setAttribute('aria-current', 'page'); }
      else { tabs[i].classList.remove('active'); tabs[i].removeAttribute('aria-current'); }
    }
    var panels = qsa('.dash-tab-panel');
    for (var p = 0; p < panels.length; p += 1) {
      if (panels[p].getAttribute('data-panel') === tab) { panels[p].classList.remove('hidden'); }
      else { panels[p].classList.add('hidden'); }
    }
    if (location.hash !== '#' + tab) {
      try { history.replaceState(null, '', '#' + tab); } catch (e) { location.hash = tab; }
    }
    renderActive();
  }

  function setRange(days) {
    state.rangeDays = days;
    var btns = qsa('.dash-range-btn');
    for (var i = 0; i < btns.length; i += 1) {
      var active = parseInt(btns[i].getAttribute('data-range'), 10) === days;
      if (active) { btns[i].classList.add('active'); btns[i].setAttribute('aria-pressed', 'true'); }
      else { btns[i].classList.remove('active'); btns[i].removeAttribute('aria-pressed'); }
    }
    loadAndRender();
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function start() {
    if (state.booted) { return; }
    state.booted = true;

    // Tabs
    var tabs = qsa('.dash-tab');
    for (var i = 0; i < tabs.length; i += 1) {
      (function (t) {
        t.onclick = function () { setTab(t.getAttribute('data-tab')); };
      }(tabs[i]));
    }
    // Range
    var rbtns = qsa('.dash-range-btn');
    for (var r = 0; r < rbtns.length; r += 1) {
      (function (b) {
        b.onclick = function () { setRange(parseInt(b.getAttribute('data-range'), 10)); };
      }(rbtns[r]));
    }
    // Hash routing
    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#', '');
      if (h && TABS.indexOf(h) !== -1 && h !== state.tab) { setTab(h); }
    });
    var initialHash = (location.hash || '').replace('#', '');
    if (initialHash && TABS.indexOf(initialHash) !== -1) { state.tab = initialHash; }
    setTab(state.tab);

    // Week & month navigators
    $('week-prev').onclick = function () { state.weekMonday = window.DashboardData.addDays(state.weekMonday, -7); renderWeek(); };
    $('week-next').onclick = function () {
      var next = window.DashboardData.addDays(state.weekMonday, 7);
      var todayMon = window.DashboardData.mondayOf(window.DashboardData.todayLogical());
      if (next.getTime() > todayMon.getTime()) { return; }
      state.weekMonday = next; renderWeek();
    };
    $('month-prev').onclick = function () {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderMonth();
    };
    $('month-next').onclick = function () {
      var next = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      var today = window.DashboardData.todayLogical();
      if (next.getFullYear() > today.getFullYear() ||
         (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth())) { return; }
      state.monthCursor = next; renderMonth();
    };

    // Task picker
    $('tasks-picker').onchange = function () {
      state.selectedTaskId = this.value;
      renderTasksTab();
    };

    // Archived task picker
    var archPicker = $('archived-picker');
    if (archPicker) {
      archPicker.onchange = function () {
        state.selectedArchivedId = this.value;
        renderArchived();
      };
    }

    // Theme toggle (dark / light)
    var themeBtn = $('dash-theme-toggle');
    if (themeBtn) { themeBtn.onclick = toggleTheme; }
    applyThemeLabel();

    loadAndRender();
  }

  // ── Theme (dark / light) ────────────────────────────────────────────────
  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function applyThemeLabel() {
    var light = isLightTheme();
    var icon = $('dash-theme-icon');
    var label = $('dash-theme-label');
    if (icon) { icon.innerHTML = light ? '\u2600' : '\u263E'; } // sun / moon
    if (label) { label.textContent = light ? 'Light' : 'Dark'; }
  }

  function toggleTheme() {
    var light = isLightTheme();
    if (light) { document.documentElement.removeAttribute('data-theme'); }
    else { document.documentElement.setAttribute('data-theme', 'light'); }
    try { localStorage.setItem('habitDashboardTheme', light ? 'dark' : 'light'); } catch (e) {}
    applyThemeLabel();
    // Re-render the active tab so colours that are computed in JS refresh.
    renderActive();
  }

  function onStorageChange() {
    if (!state.booted) { return; }
    if (state.reloading) { state.pendingReload = true; return; }
    loadAndRender();
  }

  // ── Loading orchestration ──────────────────────────────────────────────
  function loadAndRender() {
    if (!window.DashboardData) { return; }
    state.reloading = true;

    var progress = $('dash-progress');
    var fill = $('dash-progress-fill');
    var label = $('dash-progress-label');
    progress.classList.remove('hidden');
    fill.style.width = '0%';
    label.textContent = 'Loading history\u2026';

    window.DashboardData.load(state.rangeDays, function (done, total) {
      var pct = total === 0 ? 100 : Math.round((done / total) * 100);
      fill.style.width = pct + '%';
      label.textContent = 'Loading history\u2026 ' + pct + '%';
    }).then(function () {
      progress.classList.add('hidden');
      state.reloading = false;
      if (state.pendingReload) { state.pendingReload = false; loadAndRender(); return; }

      // Initialize navigators on first load (defaults: this week, this month).
      var today = window.DashboardData.todayLogical();
      state.weekMonday = state.weekMonday || window.DashboardData.mondayOf(today);
      state.monthCursor = state.monthCursor || new Date(today.getFullYear(), today.getMonth(), 1);

      // Pick a default selected task if none set or stale.
      var tasks = window.DashboardData.tasks;
      var foundSelected = false;
      for (var i = 0; i < tasks.length; i += 1) { if (tasks[i].id === state.selectedTaskId) { foundSelected = true; break; } }
      if (!foundSelected) { state.selectedTaskId = tasks.length ? tasks[0].id : null; }

      renderTaskPicker();
      renderArchivedPicker();
      renderActive();
    });
  }

  function renderActive() {
    if (!window.DashboardData || !window.DashboardData.loaded) { return; }
    if (!window.DashboardData.tasks.length) {
      // No analyzable tasks at all (rare — e.g. all are once/Work).
      var panels = qsa('.dash-tab-panel');
      for (var p = 0; p < panels.length; p += 1) { panels[p].classList.add('hidden'); }
      $('dash-empty').classList.remove('hidden');
      $('dash-empty').querySelector('p').textContent =
        'No recurring habits to analyze yet. Add a daily, weekly, or interval task in the Task Manager.';
      return;
    }
    $('dash-empty').classList.add('hidden');
    if (state.tab === 'overview')   { renderOverview(); }
    if (state.tab === 'tasks')      { renderTasksTab(); }
    if (state.tab === 'week')       { renderWeek(); }
    if (state.tab === 'month')      { renderMonth(); }
    if (state.tab === 'categories') { renderCategories(); }
    if (state.tab === 'archived')   { renderArchived(); }
  }

  // ── KPI helpers ────────────────────────────────────────────────────────
  function kpiCard(label, value, sub, accent) {
    var div = document.createElement('div');
    div.className = 'dash-kpi';
    var lbl = document.createElement('p'); lbl.className = 'dash-kpi-label'; lbl.textContent = label; div.appendChild(lbl);
    var val = document.createElement('p'); val.className = 'dash-kpi-value';
    if (accent) {
      var dot = document.createElement('span');
      dot.className = 'dash-kpi-accent';
      dot.style.background = window.DashboardCharts.accentColor(accent);
      val.appendChild(dot);
    }
    val.appendChild(document.createTextNode(value));
    div.appendChild(val);
    if (sub) { var s = document.createElement('p'); s.className = 'dash-kpi-sub'; s.textContent = sub; div.appendChild(s); }
    return div;
  }

  function renderKPIs(container, items) {
    clearNode(container);
    for (var i = 0; i < items.length; i += 1) { container.appendChild(kpiCard(items[i].label, items[i].value, items[i].sub, items[i].accent)); }
  }

  // ── Overview ───────────────────────────────────────────────────────────
  function renderOverview() {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var todayKey = D.fmt(D.todayLogical());

    var rate = D.completionRate(null /*all*/, null, null);
    // Overall rate across all tasks/days:
    rate = aggregateRate();
    var todayRate = aggregateRateForDate(todayKey);
    var streak = D.perfectDayStreak();
    var longest = D.longestPerfectStreak();

    renderKPIs($('ov-kpis'), [
      { label: 'Today', value: todayRate == null ? '\u2014' : Math.round(todayRate * 100) + '%', sub: 'Scheduled tasks done', accent: 'cyan' },
      { label: 'Range', value: rate == null ? '\u2014' : Math.round(rate * 100) + '%', sub: 'Last ' + state.rangeDays + ' days', accent: 'purple' },
      { label: 'Streak', value: String(streak), sub: streak === 1 ? 'Perfect day' : 'Perfect days', accent: 'amber' },
      { label: 'Longest', value: String(longest), sub: 'In this range', accent: 'pink' }
    ]);

    // Heatmap (overall — column per week, row per weekday Mon..Sun)
    renderOverallHeatmap($('ov-heatmap'));

    // Top performers + at risk
    renderListPerformers($('ov-top'), D.topPerformers(5), 'rate');
    renderListAtRisk($('ov-risk'), D.atRisk(5));

    // Donut by category
    var breakdown = D.categoryBreakdown();
    var slices = [];
    for (var i = 0; i < breakdown.length; i += 1) {
      slices.push({
        label: breakdown[i].category,
        value: breakdown[i].done,
        color: C.accentColor(breakdown[i].accent)
      });
    }
    C.donutChart($('ov-donut'), slices, { centerLabel: String(totalDone(breakdown)), centerSub: 'completions' });

    // Recent misses
    renderMissList($('ov-misses'), D.recentMisses(6));
  }

  function totalDone(breakdown) {
    var t = 0;
    for (var i = 0; i < breakdown.length; i += 1) { t += breakdown[i].done; }
    return t;
  }

  function aggregateRate() {
    var sched = 0, done = 0;
    var ds = window.DashboardData.dailyStatus;
    for (var k in ds) {
      if (!Object.prototype.hasOwnProperty.call(ds, k)) { continue; }
      var row = ds[k];
      for (var id in row) {
        if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
        var s = row[id];
        if (!s.scheduled) { continue; }
        sched += s.slotCount;
        done += s.doneCount;
      }
    }
    return sched === 0 ? null : done / sched;
  }

  function aggregateRateForDate(dateKey) {
    var row = window.DashboardData.dailyStatus[dateKey] || {};
    var sched = 0, done = 0;
    for (var id in row) {
      if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
      var s = row[id];
      if (!s.scheduled) { continue; }
      sched += s.slotCount;
      done += s.doneCount;
    }
    return sched === 0 ? null : done / sched;
  }

  function renderOverallHeatmap(container) {
    clearNode(container);
    var D = window.DashboardData;
    var days = D.range.days;
    var today = D.todayLogical();
    // Build columns: each column = a week (Mon..Sun), rows = weekday.
    // Find the Monday of the first day's week.
    var first = days[0].date;
    var firstMon = D.mondayOf(first);
    // Number of weeks to cover [first..today]
    var totalDays = D.diffDays(today, firstMon) + 1;
    var weeks = Math.ceil(totalDays / 7);

    var cols = [];
    for (var w = 0; w < weeks; w += 1) {
      var col = [];
      for (var r = 0; r < 7; r += 1) {
        var date = D.addDays(firstMon, w * 7 + r);
        var key = D.fmt(date);
        if (date.getTime() > today.getTime()) {
          col.push({ status: 'future' });
          continue;
        }
        if (date.getTime() < first.getTime()) {
          col.push({ status: 'empty' });
          continue;
        }
        var rate = aggregateRateForDate(key);
        var label;
        if (rate == null) {
          col.push({ status: 'empty', label: key + ' \u2014 nothing scheduled' });
        } else if (rate === 0) {
          col.push({ status: 'miss', frac: 0, label: key + ' \u2014 0% done' });
        } else {
          col.push({ status: 'done', frac: rate, label: key + ' \u2014 ' + Math.round(rate * 100) + '% done' });
        }
      }
      cols.push(col);
    }
    window.DashboardCharts.heatmap(container, cols, { showLegend: true });
  }

  function renderListPerformers(container, items, key) {
    clearNode(container);
    if (!items.length) {
      var e = document.createElement('div'); e.className = 'dash-list-empty';
      e.textContent = 'Not enough data yet.';
      container.appendChild(e); return;
    }
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      var task = it.task;
      var row = document.createElement('div'); row.className = 'dash-list-item';

      var dot = document.createElement('span'); dot.className = 'dash-list-dot';
      dot.style.background = window.DashboardCharts.accentColor(task.accentClass);
      row.appendChild(dot);

      var title = document.createElement('span'); title.className = 'dash-list-title';
      title.textContent = task.title;
      row.appendChild(title);

      var bar = document.createElement('span'); bar.className = 'dash-list-bar';
      var fill = document.createElement('span'); fill.className = 'dash-list-bar-fill';
      fill.style.width = Math.round((it[key] || 0) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      var meta = document.createElement('span'); meta.className = 'dash-list-meta';
      meta.textContent = Math.round((it[key] || 0) * 100) + '%';
      row.appendChild(meta);

      container.appendChild(row);
    }
  }

  function renderListAtRisk(container, items) {
    clearNode(container);
    if (!items.length) {
      var e = document.createElement('div'); e.className = 'dash-list-empty';
      e.textContent = 'No slipping habits. \u{2728}'.replace(/[^\x00-\x7f]/g, '');
      e.textContent = 'No slipping habits. Nice.';
      container.appendChild(e); return;
    }
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      var row = document.createElement('div'); row.className = 'dash-list-item';
      var dot = document.createElement('span'); dot.className = 'dash-list-dot';
      dot.style.background = window.DashboardCharts.accentColor(it.task.accentClass);
      row.appendChild(dot);
      var title = document.createElement('span'); title.className = 'dash-list-title';
      title.textContent = it.task.title;
      row.appendChild(title);
      var meta = document.createElement('span'); meta.className = 'dash-list-meta';
      meta.textContent = Math.round(it.prior * 100) + '% \u2192 ' + Math.round(it.rate * 100) + '%';
      row.appendChild(meta);
      container.appendChild(row);
    }
  }

  function renderMissList(container, items) {
    clearNode(container);
    if (!items.length) {
      var e = document.createElement('div'); e.className = 'dash-list-empty';
      e.textContent = 'No misses past their grace period.';
      container.appendChild(e); return;
    }
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      var row = document.createElement('div'); row.className = 'dash-list-item';
      var dot = document.createElement('span'); dot.className = 'dash-list-dot';
      dot.style.background = window.DashboardCharts.accentColor(it.task.accentClass);
      row.appendChild(dot);
      var title = document.createElement('span'); title.className = 'dash-list-title';
      title.textContent = it.task.title;
      row.appendChild(title);
      var meta = document.createElement('span'); meta.className = 'dash-list-meta';
      meta.textContent = it.daysAgo === 1 ? 'yesterday' : it.daysAgo + ' days ago';
      row.appendChild(meta);
      container.appendChild(row);
    }
  }

  // ── Tasks tab ──────────────────────────────────────────────────────────
  function renderTaskPicker() {
    var sel = $('tasks-picker');
    clearNode(sel);
    var tasks = window.DashboardData.tasks;
    // Group by category
    var byCat = {};
    var order = window.DashboardData.CATEGORY_ORDER;
    for (var c = 0; c < order.length; c += 1) { byCat[order[c]] = []; }
    for (var i = 0; i < tasks.length; i += 1) {
      var cat = window.DashboardData.normalizeCategory(tasks[i].category);
      if (!byCat[cat]) { continue; }
      byCat[cat].push(tasks[i]);
    }
    for (var ci = 0; ci < order.length; ci += 1) {
      var bucket = byCat[order[ci]];
      if (!bucket.length) { continue; }
      var grp = document.createElement('optgroup');
      grp.label = order[ci];
      for (var t = 0; t < bucket.length; t += 1) {
        var opt = document.createElement('option');
        opt.value = bucket[t].id;
        opt.textContent = bucket[t].title;
        if (bucket[t].id === state.selectedTaskId) { opt.selected = true; }
        grp.appendChild(opt);
      }
      sel.appendChild(grp);
    }
  }

  function findTask(id) {
    var tasks = window.DashboardData.tasks;
    for (var i = 0; i < tasks.length; i += 1) { if (tasks[i].id === id) { return tasks[i]; } }
    return null;
  }

  // ── Archived tab ─────────────────────────────────────────────────────────
  function renderArchivedPicker() {
    var sel = $('archived-picker');
    if (!sel) { return; }
    clearNode(sel);
    var tasks = window.DashboardData.archivedTasks || [];
    var byCat = {};
    var order = window.DashboardData.CATEGORY_ORDER;
    for (var c = 0; c < order.length; c += 1) { byCat[order[c]] = []; }
    for (var i = 0; i < tasks.length; i += 1) {
      var cat = window.DashboardData.normalizeCategory(tasks[i].category);
      if (!byCat[cat]) { continue; }
      byCat[cat].push(tasks[i]);
    }
    for (var ci = 0; ci < order.length; ci += 1) {
      var bucket = byCat[order[ci]];
      if (!bucket.length) { continue; }
      var grp = document.createElement('optgroup');
      grp.label = order[ci];
      for (var t = 0; t < bucket.length; t += 1) {
        var opt = document.createElement('option');
        opt.value = bucket[t].id;
        opt.textContent = bucket[t].title + (bucket[t].archivedAt ? ' \u00b7 ' + bucket[t].archivedAt : '');
        if (bucket[t].id === state.selectedArchivedId) { opt.selected = true; }
        grp.appendChild(opt);
      }
      sel.appendChild(grp);
    }
  }

  function renderArchived() {
    var D = window.DashboardData;
    var tasks = D.archivedTasks || [];
    var emptyEl = $('archived-empty');
    var bodyEl = $('archived-body');
    if (!tasks.length) {
      if (emptyEl) { emptyEl.classList.remove('hidden'); }
      if (bodyEl) { bodyEl.classList.add('hidden'); }
      return;
    }
    if (emptyEl) { emptyEl.classList.add('hidden'); }
    if (bodyEl) { bodyEl.classList.remove('hidden'); }

    var found = false;
    for (var i = 0; i < tasks.length; i += 1) {
      if (tasks[i].id === state.selectedArchivedId) { found = true; break; }
    }
    if (!found) { state.selectedArchivedId = tasks[0].id; }
    var sel = $('archived-picker');
    if (sel && sel.value !== state.selectedArchivedId) { sel.value = state.selectedArchivedId; }

    var id = state.selectedArchivedId;
    D.loadArchivedTask(id).then(function (ctx) {
      // Ignore stale results if the user switched selection while loading.
      if (!ctx || state.selectedArchivedId !== id) { return; }
      D.withContext(ctx, function () {
        renderTaskDetail('archived', ctx.tasks[0], { archived: true });
      });
    });
  }

  function renderTasksTab() {
    var task = findTask(state.selectedTaskId);
    if (!task) { return; }
    renderTaskDetail('tasks', task, {});
  }

  // Renders the per-habit detail body (header, KPIs, heatmap, trend, weekday,
  // slots, miss log) into the element set identified by `prefix`. Reused by the
  // live Tasks tab and the read-only Archived tab (which calls it inside
  // DashboardData.withContext so every aggregation reads the archived window).
  function renderTaskDetail(prefix, task, opts) {
    opts = opts || {};
    var D = window.DashboardData;
    var C = window.DashboardCharts;

    // Header card
    var hdr = $(prefix + '-header-card');
    clearNode(hdr);
    var inner = document.createElement('div'); inner.className = 'task-header-inner';
    var iconBox = document.createElement('div'); iconBox.className = 'task-header-icon';
    iconBox.style.background = C.accentColor(task.accentClass);
    iconBox.innerHTML = task.icon || '';
    inner.appendChild(iconBox);
    var meta = document.createElement('div');
    var h = document.createElement('h2'); h.className = 'task-header-title'; h.textContent = task.title; meta.appendChild(h);
    var sub = document.createElement('p'); sub.className = 'task-header-sub';
    sub.textContent = D.normalizeCategory(task.category) + ' \u00b7 ' + D.describeFrequency(task);
    meta.appendChild(sub);
    if (opts.archived) {
      var badge = document.createElement('span'); badge.className = 'dash-archived-badge';
      badge.textContent = task.archivedAt ? ('Archived \u00b7 ended ' + task.archivedAt) : 'Archived';
      meta.appendChild(badge);
    }
    inner.appendChild(meta);
    hdr.appendChild(inner);

    // KPIs
    var rate = D.completionRate(task.id);
    var totalDoneN = totalDoneFor(task.id);
    var curStreak = D.currentStreak(task.id);
    var bestStreak = D.longestStreak(task.id);
    renderKPIs($(prefix + '-kpis'), [
      { label: 'Done', value: String(totalDoneN), sub: 'In range', accent: task.accentClass ? String(task.accentClass).replace('accent-','') : 'cyan' },
      { label: 'Rate', value: rate == null ? '\u2014' : Math.round(rate * 100) + '%', sub: 'Of scheduled', accent: 'cyan' },
      { label: 'Streak', value: String(curStreak), sub: curStreak === 1 ? 'Day' : 'Days', accent: 'amber' },
      { label: 'Best', value: String(bestStreak), sub: 'In range', accent: 'pink' }
    ]);

    // 12-week heatmap (or fewer if range shorter)
    renderTaskHeatmap($(prefix + '-heatmap'), task);

    // Weekly trend (per ISO-ish week) — completion rate of this task only
    renderTaskTrend($(prefix + '-trend'), task);

    // Weekday strength
    var ws = D.weekdayStrength(task.id);
    var bars = [];
    for (var i = 0; i < ws.length; i += 1) {
      bars.push({ label: ws[i].label, value: ws[i].rate, accent: task.accentClass ? String(task.accentClass).replace('accent-','') : 'cyan', dim: ws[i].scheduled === 0 });
    }
    C.barChart($(prefix + '-weekday'), bars, { format: 'pct', maxValue: 1 });

    // Slot breakdown (only for multi-slot tasks)
    var slotsCard = $(prefix + '-slots-card');
    if (task.times && task.times.length) {
      slotsCard.classList.remove('hidden');
      renderTaskSlots($(prefix + '-slots'), task);
    } else {
      slotsCard.classList.add('hidden');
    }

    // Miss log
    renderTaskMissLog($(prefix + '-misses'), task);
  }

  function totalDoneFor(taskId) {
    var ds = window.DashboardData.dailyStatus;
    var n = 0;
    for (var k in ds) {
      if (!Object.prototype.hasOwnProperty.call(ds, k)) { continue; }
      var s = ds[k][taskId];
      if (!s) { continue; }
      n += s.doneCount;
    }
    return n;
  }

  function renderTaskHeatmap(container, task) {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var statuses = D.listTaskDates(task.id); // chronological
    // Bucket by weekday columns (Mon..Sun). Need columns for full weeks.
    if (!statuses.length) { clearNode(container); return; }
    var firstDate = statuses[0].date;
    var firstMon = D.mondayOf(firstDate);
    var today = D.range.toDate; // window end (today live, archivedAt for archived)
    var weeks = Math.ceil((D.diffDays(today, firstMon) + 1) / 7);

    // Map dateKey -> status entry for lookup
    var map = {};
    for (var i = 0; i < statuses.length; i += 1) { map[statuses[i].dateKey] = statuses[i]; }

    var cols = [];
    for (var w = 0; w < weeks; w += 1) {
      var col = [];
      for (var r = 0; r < 7; r += 1) {
        var date = D.addDays(firstMon, w * 7 + r);
        if (date.getTime() > today.getTime()) { col.push({ status: 'future' }); continue; }
        var key = D.fmt(date);
        var s = map[key];
        if (!s || !s.scheduled) {
          col.push({ status: 'empty', label: key + ' \u2014 not scheduled' });
        } else if (s.frac === 0) {
          col.push({ status: 'miss', frac: 0, label: key + ' \u2014 missed' });
        } else {
          col.push({ status: 'done', frac: s.frac, label: key + ' \u2014 ' + s.done + '/' + s.slots + ' done' });
        }
      }
      cols.push(col);
    }
    C.heatmap(container, cols, { showLegend: true });
  }

  function renderTaskTrend(container, task) {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    // Weekly rate over range (group days by Monday). Use up to last 12 weeks
    // but at least fill the range.
    var today = D.range.toDate; // window end (today live, archivedAt for archived)
    var thisMon = D.mondayOf(today);
    var firstMon = D.mondayOf(D.range.fromDate);
    var weekCount = Math.ceil((D.diffDays(thisMon, firstMon)) / 7) + 1;
    if (weekCount < 2) { weekCount = 2; }
    if (weekCount > 26) { weekCount = 26; }

    var points = [];
    for (var w = weekCount - 1; w >= 0; w -= 1) {
      var start = D.addDays(thisMon, -7 * w);
      var sched = 0, done = 0;
      for (var k = 0; k < 7; k += 1) {
        var key = D.fmt(D.addDays(start, k));
        var s = (D.dailyStatus[key] || {})[task.id];
        if (!s || !s.scheduled) { continue; }
        sched += s.slotCount; done += s.doneCount;
      }
      points.push({
        label: (start.getMonth() + 1) + '/' + start.getDate(),
        y: sched === 0 ? 0 : done / sched
      });
    }
    C.lineChart(container, [{ name: task.title, color: C.accentColor(task.accentClass), points: points }], { format: 'pct', maxValue: 1 });
  }

  function renderTaskSlots(container, task) {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var slots = task.times;
    var done = []; var sched = [];
    for (var s = 0; s < slots.length; s += 1) { done.push(0); sched.push(0); }

    for (var i = 0; i < D.range.days.length; i += 1) {
      var d = D.range.days[i];
      if (!isTaskForDateExt(task, d.date)) { continue; }
      var prefix = D.normalizeCategory(task.category) === 'Morning Routine' ? 'habit-board-state-' : 'myday-state-';
      var dayState = window.Storage.readDayState(prefix, d.key) || {};
      for (var si = 0; si < slots.length; si += 1) {
        var cid = task.id + '__' + slugifyTime(slots[si].label);
        sched[si] += 1;
        if (dayState[cid]) { done[si] += 1; }
      }
    }
    var bars = [];
    for (var b = 0; b < slots.length; b += 1) {
      bars.push({
        label: slots[b].label,
        value: sched[b] === 0 ? 0 : done[b] / sched[b],
        accent: task.accentClass ? String(task.accentClass).replace('accent-','') : 'cyan'
      });
    }
    C.barChart(container, bars, { format: 'pct', maxValue: 1 });
  }

  // Mirror of DashboardData.isTaskForDate via the public surface — but
  // DashboardData doesn't expose isTaskForDate directly. Inline the same
  // logic here so slot aggregation knows scheduled days.
  function isTaskForDateExt(task, date) {
    var freq = task.frequency;
    if (!freq || freq.type === 'daily') { return true; }
    if (freq.type === 'weekly') { return (freq.days || []).indexOf(date.getDay()) !== -1; }
    if (freq.type === 'interval') {
      var p = freq.startDate.split('-');
      var start = new Date(parseInt(p[0],10), parseInt(p[1],10) - 1, parseInt(p[2],10));
      var sN = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var dN = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      var weeks = Math.floor((dN.getTime() - sN.getTime()) / (7 * 86400000));
      return (weeks >= 0) && (weeks % freq.every === 0) && (date.getDay() === freq.day);
    }
    return false;
  }
  function slugifyTime(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function renderTaskMissLog(container, task) {
    clearNode(container);
    var D = window.DashboardData;
    var statuses = D.listTaskDates(task.id);
    var today = D.todayLogical();
    var any = false;
    for (var i = statuses.length - 1; i >= 0; i -= 1) {
      var s = statuses[i];
      if (!s.scheduled || s.frac >= 1) { continue; }
      if (s.dateKey === D.fmt(today)) { continue; } // today still in flight
      any = true;
      var row = document.createElement('div'); row.className = 'dash-list-item';
      var dot = document.createElement('span'); dot.className = 'dash-list-dot';
      dot.style.background = window.DashboardCharts.accentColor(task.accentClass);
      row.appendChild(dot);
      var title = document.createElement('span'); title.className = 'dash-list-title';
      title.textContent = s.dateKey + ' \u00b7 ' + s.done + '/' + s.slots + ' done';
      row.appendChild(title);
      var meta = document.createElement('span'); meta.className = 'dash-list-meta';
      var daysAgo = D.diffDays(today, s.date);
      meta.textContent = daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';
      row.appendChild(meta);
      container.appendChild(row);
    }
    if (!any) {
      var e = document.createElement('div'); e.className = 'dash-list-empty';
      e.textContent = 'No misses in range. Keep going!';
      container.appendChild(e);
    }
  }

  // ── Week tab ───────────────────────────────────────────────────────────
  function renderWeek() {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var today = D.todayLogical();
    var monday = state.weekMonday;
    var sunday = D.addDays(monday, 6);

    var label = monday.getDate() + ' ' + MONTH_NAMES[monday.getMonth()].slice(0, 3) +
      ' \u2013 ' + sunday.getDate() + ' ' + MONTH_NAMES[sunday.getMonth()].slice(0, 3) +
      ', ' + sunday.getFullYear();
    $('week-label').textContent = label;

    var todayMon = D.mondayOf(today);
    $('week-next').disabled = monday.getTime() >= todayMon.getTime();

    // Strip
    var stats = D.weekStats(monday);
    var strip = $('week-strip');
    clearNode(strip);
    var openIdx = -1;
    for (var i = 0; i < 7; i += 1) {
      var day = stats.days[i];
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'dash-day-card';
      if (D.fmt(today) === day.dateKey) { btn.className += ' today'; }
      if (day.date.getTime() > today.getTime()) { btn.className += ' future'; btn.disabled = true; }

      var name = document.createElement('span'); name.className = 'dash-day-name';
      name.textContent = WEEKDAY_HEAD[i] + ' ' + day.date.getDate();
      btn.appendChild(name);

      var pct = document.createElement('span'); pct.className = 'dash-day-pct';
      pct.textContent = day.scheduled === 0 ? '\u2014' : Math.round(day.frac * 100) + '%';
      btn.appendChild(pct);

      var frac = document.createElement('span'); frac.className = 'dash-day-frac';
      frac.textContent = day.done + '/' + day.scheduled;
      btn.appendChild(frac);

      var bar = document.createElement('span'); bar.className = 'dash-day-bar';
      var fill = document.createElement('span'); fill.className = 'dash-day-bar-fill';
      fill.style.width = Math.round(day.frac * 100) + '%';
      bar.appendChild(fill);
      btn.appendChild(bar);

      (function (idx) {
        btn.onclick = function () { toggleDayDetail(strip, idx, stats.days); };
      }(i));

      strip.appendChild(btn);
    }

    // Weekday strength (full range)
    var ws = D.weekdayStrength();
    var bars = [];
    for (var b = 0; b < ws.length; b += 1) {
      bars.push({ label: ws[b].label, value: ws[b].rate, accent: 'cyan', dim: ws[b].scheduled === 0 });
    }
    C.barChart($('week-weekday'), bars, { format: 'pct', maxValue: 1 });

    // Category breakdown — stacked done by category for the week
    var breakdownGroups = [];
    var cats = D.CATEGORY_ORDER;
    for (var c = 0; c < cats.length; c += 1) {
      var doneN = 0, schedN = 0;
      for (var di = 0; di < stats.days.length; di += 1) {
        for (var ti = 0; ti < stats.days[di].tasks.length; ti += 1) {
          var rec = stats.days[di].tasks[ti];
          if (D.normalizeCategory(rec.task.category) !== cats[c]) { continue; }
          doneN += rec.done;
          schedN += rec.slots;
        }
      }
      breakdownGroups.push({
        label: cats[c].split(' ')[0],
        segments: [
          { value: doneN, accent: D.CATEGORY_ACCENT[cats[c]] },
          { value: Math.max(0, schedN - doneN), accent: 'muted' }
        ]
      });
    }
    C.stackedBarChart($('week-categories'), breakdownGroups);

    // Week-over-week trend
    var trend = D.weekTrend(8);
    var pts = [];
    for (var w = 0; w < trend.length; w += 1) { pts.push({ label: trend[w].label, y: trend[w].rate }); }
    C.lineChart($('week-trend'), [{ name: 'Completion', color: C.ACCENT_HEX.purple, points: pts }], { format: 'pct', maxValue: 1 });

    renderWeekMatrix(stats, today);
  }

  // Task × day grid for the selected week: rows = habits scheduled that week,
  // columns = Mon→Sun, colour-coded done / partial / missed / not-scheduled.
  function renderWeekMatrix(stats, today) {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var host = $('week-matrix');
    clearNode(host);

    // Lookup byTask[id][dayIdx] = { done, slots }; track which tasks appear.
    var byTask = {};
    var present = {};
    for (var di = 0; di < stats.days.length; di += 1) {
      var dayRecs = stats.days[di].tasks;
      for (var ri = 0; ri < dayRecs.length; ri += 1) {
        var rec = dayRecs[ri];
        if (!byTask[rec.task.id]) { byTask[rec.task.id] = {}; }
        byTask[rec.task.id][di] = { done: rec.done, slots: rec.slots };
        present[rec.task.id] = true;
      }
    }

    // Preserve global task order.
    var tasks = [];
    var all = D.tasks;
    for (var t = 0; t < all.length; t += 1) { if (present[all[t].id]) { tasks.push(all[t]); } }

    if (!tasks.length) {
      var emptyMsg = document.createElement('p'); emptyMsg.className = 'dash-list-empty';
      emptyMsg.textContent = 'Nothing scheduled this week.';
      host.appendChild(emptyMsg);
      return;
    }

    var todayKey = D.fmt(today);
    var grid = document.createElement('div');
    grid.className = 'dash-matrix';

    var corner = document.createElement('div'); corner.className = 'dash-matrix-corner';
    grid.appendChild(corner);
    for (var h = 0; h < 7; h += 1) {
      var hd = document.createElement('div'); hd.className = 'dash-matrix-colhead';
      if (stats.days[h].dateKey === todayKey) { hd.className += ' today'; }
      var hn = document.createElement('span'); hn.textContent = WEEKDAY_HEAD[h].charAt(0); hd.appendChild(hn);
      var hday = document.createElement('small'); hday.textContent = String(stats.days[h].date.getDate()); hd.appendChild(hday);
      grid.appendChild(hd);
    }

    for (var ti = 0; ti < tasks.length; ti += 1) {
      var task = tasks[ti];
      var rowHead = document.createElement('div'); rowHead.className = 'dash-matrix-rowhead';
      var ic = document.createElement('span'); ic.className = 'dash-matrix-icon'; ic.innerHTML = task.icon || '';
      rowHead.appendChild(ic);
      var nm = document.createElement('span'); nm.className = 'dash-matrix-name'; nm.textContent = task.title;
      rowHead.appendChild(nm);
      grid.appendChild(rowHead);

      for (var dj = 0; dj < 7; dj += 1) {
        var cell = document.createElement('div'); cell.className = 'dash-matrix-cell';
        var dayObj = stats.days[dj];
        var slot = byTask[task.id] ? byTask[task.id][dj] : null;
        if (dayObj.date.getTime() > today.getTime()) {
          cell.className += ' future';
        } else if (!slot) {
          cell.className += ' off';
          cell.title = task.title + ' \u2014 ' + dayObj.dateKey + ' \u2014 not scheduled';
        } else if (slot.done >= slot.slots) {
          cell.className += ' done';
          cell.style.background = C.fracColor(1);
          cell.title = task.title + ' \u2014 ' + dayObj.dateKey + ' \u2014 done';
        } else if (slot.done === 0) {
          cell.className += ' miss';
          cell.style.background = C.HEATMAP_MISSED;
          cell.title = task.title + ' \u2014 ' + dayObj.dateKey + ' \u2014 missed';
        } else {
          cell.className += ' partial';
          cell.style.background = C.fracColor(slot.done / slot.slots);
          cell.title = task.title + ' \u2014 ' + dayObj.dateKey + ' \u2014 ' + slot.done + '/' + slot.slots;
          var pf = document.createElement('span'); pf.className = 'dash-matrix-frac';
          pf.textContent = slot.done + '/' + slot.slots;
          cell.appendChild(pf);
        }
        grid.appendChild(cell);
      }
    }
    host.appendChild(grid);
    host.appendChild(matrixLegend());
  }

  function matrixLegend() {
    var C = window.DashboardCharts;
    var items = [
      { c: C.fracColor(1), t: 'Done' },
      { c: C.fracColor(0.5), t: 'Partial' },
      { c: C.HEATMAP_MISSED, t: 'Missed' },
      { c: null, t: 'Not scheduled' }
    ];
    var leg = document.createElement('div'); leg.className = 'dash-matrix-legend';
    for (var i = 0; i < items.length; i += 1) {
      var sw = document.createElement('span');
      sw.className = 'dash-matrix-swatch' + (items[i].c ? '' : ' off');
      if (items[i].c) { sw.style.background = items[i].c; }
      leg.appendChild(sw);
      var lb = document.createElement('span'); lb.className = 'dash-matrix-legend-label';
      lb.textContent = items[i].t;
      leg.appendChild(lb);
    }
    return leg;
  }

  function toggleDayDetail(stripContainer, idx, days) {
    var existing = document.getElementById('dash-day-detail');
    if (existing && existing.getAttribute('data-idx') === String(idx)) {
      existing.parentNode.removeChild(existing); return;
    }
    if (existing) { existing.parentNode.removeChild(existing); }
    var day = days[idx];
    var box = document.createElement('div'); box.className = 'dash-day-detail'; box.id = 'dash-day-detail'; box.setAttribute('data-idx', String(idx));
    var head = document.createElement('h3');
    head.textContent = WEEKDAY_HEAD[idx] + ' \u00b7 ' + day.dateKey + ' \u00b7 ' + day.done + '/' + day.scheduled;
    box.appendChild(head);
    if (!day.tasks.length) {
      var emp = document.createElement('p'); emp.style.color = 'var(--muted)'; emp.style.margin = '0'; emp.textContent = 'Nothing scheduled this day.';
      box.appendChild(emp);
    } else {
      for (var t = 0; t < day.tasks.length; t += 1) {
        var rec = day.tasks[t];
        var rowEl = document.createElement('div');
        rowEl.className = 'dash-day-detail-row ' + (rec.done >= rec.slots ? 'done' : 'missed');
        var dot = document.createElement('span'); dot.className = 'dash-list-dot';
        dot.style.background = window.DashboardCharts.accentColor(rec.task.accentClass);
        rowEl.appendChild(dot);
        var tt = document.createElement('span'); tt.textContent = rec.task.title;
        rowEl.appendChild(tt);
        var st = document.createElement('span'); st.className = 'state';
        st.textContent = rec.done >= rec.slots ? 'Done' : (rec.done + '/' + rec.slots);
        rowEl.appendChild(st);
        box.appendChild(rowEl);
      }
    }
    stripContainer.parentNode.insertBefore(box, stripContainer.nextSibling);
  }

  // ── Month tab ──────────────────────────────────────────────────────────
  function renderMonth() {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var cursor = state.monthCursor;
    var today = D.todayLogical();
    var stats = D.monthStats(cursor.getFullYear(), cursor.getMonth());

    $('month-label').textContent = MONTH_NAMES[cursor.getMonth()] + ' ' + cursor.getFullYear();
    var nextStart = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    $('month-next').disabled = nextStart.getFullYear() > today.getFullYear() ||
      (nextStart.getFullYear() === today.getFullYear() && nextStart.getMonth() > today.getMonth());

    // Calendar grid (header + cells)
    var cal = $('month-cal');
    clearNode(cal);
    for (var h = 0; h < 7; h += 1) {
      var head = document.createElement('div'); head.className = 'dash-month-head';
      head.textContent = WEEKDAY_HEAD[h];
      cal.appendChild(head);
    }
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    var leadEmpty = (first.getDay() + 6) % 7; // make Monday-first
    for (var le = 0; le < leadEmpty; le += 1) {
      var emp = document.createElement('div'); emp.className = 'dash-month-cell empty'; cal.appendChild(emp);
    }
    var cur = new Date(first.getTime());
    var todayKey = D.fmt(today);
    while (cur.getMonth() === cursor.getMonth()) {
      var key = D.fmt(cur);
      var cell = document.createElement('div'); cell.className = 'dash-month-cell';
      if (key === todayKey) { cell.className += ' today'; }
      if (cur.getTime() > today.getTime()) { cell.className += ' future'; }
      var num = document.createElement('span'); num.className = 'num'; num.textContent = String(cur.getDate());
      cell.appendChild(num);
      var info = stats.dayStats[key];
      if (info && info.scheduled > 0) {
        // Same red→green ramp as the heatmaps; missed days read red.
        cell.style.background = info.done === 0 ? C.HEATMAP_MISSED : C.fracColor(info.frac);
        num.style.color = '#0c1018';
        var frac = document.createElement('span'); frac.className = 'frac';
        frac.textContent = info.done + '/' + info.scheduled;
        frac.style.color = '#0c1018';
        cell.appendChild(frac);
      } else if (info && info.scheduled === 0 && cur.getTime() <= today.getTime()) {
        // unscheduled day — leave neutral, show dash
        var dash = document.createElement('span'); dash.className = 'frac'; dash.textContent = '\u2014';
        cell.appendChild(dash);
      }
      cell.title = key + ' \u2014 ' + (info ? (info.done + '/' + info.scheduled) : 'no data');
      cal.appendChild(cell);
      cur.setDate(cur.getDate() + 1);
    }

    // KPIs
    var bestDay = null, worstDay = null;
    for (var bk in stats.dayStats) {
      if (!Object.prototype.hasOwnProperty.call(stats.dayStats, bk)) { continue; }
      var di = stats.dayStats[bk];
      if (di.scheduled === 0) { continue; }
      if (!bestDay || di.frac > bestDay.frac)  { bestDay = { key: bk, frac: di.frac }; }
      if (!worstDay || di.frac < worstDay.frac) { worstDay = { key: bk, frac: di.frac }; }
    }
    renderKPIs($('month-kpis'), [
      { label: 'Rate', value: stats.completionRate == null ? '\u2014' : Math.round(stats.completionRate * 100) + '%', sub: 'Scheduled completed', accent: 'cyan' },
      { label: 'Perfect days', value: String(stats.perfectDays), sub: 'Everything done', accent: 'amber' },
      { label: 'Done', value: String(stats.totalDone), sub: 'Completions', accent: 'green' },
      { label: 'Best day', value: bestDay ? bestDay.key.slice(-2) : '\u2014', sub: bestDay ? Math.round(bestDay.frac * 100) + '%' : '', accent: 'pink' }
    ]);

    // Month over month trend
    var mt = D.monthTrend(12);
    var pts = [];
    for (var i = 0; i < mt.length; i += 1) { pts.push({ label: mt[i].label, y: mt[i].rate }); }
    C.lineChart($('month-trend'), [{ name: 'Monthly rate', color: C.ACCENT_HEX.cyan, points: pts }], { format: 'pct', maxValue: 1 });

    // Donut: category mix for this month
    var byCat = {};
    for (var bc = 0; bc < D.CATEGORY_ORDER.length; bc += 1) { byCat[D.CATEGORY_ORDER[bc]] = 0; }
    var taskCat = {};
    var tasks = D.tasks;
    for (var t = 0; t < tasks.length; t += 1) { taskCat[tasks[t].id] = D.normalizeCategory(tasks[t].category); }
    for (var dk in stats.dayStats) {
      if (!Object.prototype.hasOwnProperty.call(stats.dayStats, dk)) { continue; }
      var row = D.dailyStatus[dk]; if (!row) { continue; }
      for (var id in row) {
        if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
        var s = row[id];
        if (!s.scheduled || s.doneCount === 0) { continue; }
        var cat = taskCat[id];
        if (byCat[cat] != null) { byCat[cat] += s.doneCount; }
      }
    }
    var slices = [];
    var totDone = 0;
    for (var cn = 0; cn < D.CATEGORY_ORDER.length; cn += 1) {
      var c = D.CATEGORY_ORDER[cn];
      if (!byCat[c]) { continue; }
      totDone += byCat[c];
      slices.push({ label: c, value: byCat[c], color: C.accentColor(D.CATEGORY_ACCENT[c]) });
    }
    C.donutChart($('month-donut'), slices, { centerLabel: String(totDone), centerSub: 'done' });

    renderTaskCalendars();
  }

  // Per-habit month calendars: one mini grid per task scheduled in the month,
  // colour-coded with the same ramp as the heatmaps plus a completion %.
  function renderTaskCalendars() {
    var D = window.DashboardData;
    var C = window.DashboardCharts;
    var host = $('month-task-cals');
    clearNode(host);

    var cursor = state.monthCursor;
    var today = D.todayLogical();
    var todayKey = D.fmt(today);
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var first = new Date(year, month, 1);
    var leadEmpty = (first.getDay() + 6) % 7; // Monday-first
    var tasks = D.tasks;

    var anyShown = false;
    for (var t = 0; t < tasks.length; t += 1) {
      var task = tasks[t];
      var done = 0, scheduled = 0;
      var cells = [];
      var cur = new Date(first.getTime());
      while (cur.getMonth() === month) {
        var key = D.fmt(cur);
        var row = D.dailyStatus[key];
        var s = row ? row[task.id] : null;
        var status = 'off', frac = 0;
        if (cur.getTime() > today.getTime()) {
          status = 'future';
        } else if (s && s.scheduled) {
          scheduled += s.slotCount; done += s.doneCount;
          if (s.doneCount >= s.slotCount) { status = 'done'; frac = 1; }
          else if (s.doneCount === 0) { status = 'miss'; }
          else { status = 'partial'; frac = s.doneCount / s.slotCount; }
        }
        cells.push({ day: cur.getDate(), key: key, status: status, frac: frac, slot: s, today: key === todayKey });
        cur.setDate(cur.getDate() + 1);
      }
      if (scheduled === 0) { continue; } // habit not scheduled this month
      anyShown = true;

      var card = document.createElement('div'); card.className = 'dash-task-cal';

      var head = document.createElement('div'); head.className = 'dash-task-cal-head';
      var hicon = document.createElement('span'); hicon.className = 'dash-task-cal-icon'; hicon.innerHTML = task.icon || '';
      head.appendChild(hicon);
      var hname = document.createElement('span'); hname.className = 'dash-task-cal-name'; hname.textContent = task.title;
      head.appendChild(hname);
      var hpct = document.createElement('span'); hpct.className = 'dash-task-cal-pct';
      hpct.textContent = Math.round((done / scheduled) * 100) + '%';
      hpct.style.color = C.fracColor(done / scheduled);
      head.appendChild(hpct);
      card.appendChild(head);

      var grid = document.createElement('div'); grid.className = 'dash-task-cal-grid';
      for (var wd = 0; wd < 7; wd += 1) {
        var wh = document.createElement('span'); wh.className = 'dash-task-cal-wd';
        wh.textContent = WEEKDAY_HEAD[wd].charAt(0);
        grid.appendChild(wh);
      }
      for (var le = 0; le < leadEmpty; le += 1) {
        var ge = document.createElement('span'); ge.className = 'dash-task-cal-cell empty'; grid.appendChild(ge);
      }
      for (var ci = 0; ci < cells.length; ci += 1) {
        var cd = cells[ci];
        var cellEl = document.createElement('span'); cellEl.className = 'dash-task-cal-cell ' + cd.status;
        if (cd.today) { cellEl.className += ' today'; }
        if (cd.status === 'done') { cellEl.style.background = C.fracColor(1); }
        else if (cd.status === 'partial') { cellEl.style.background = C.fracColor(cd.frac); }
        else if (cd.status === 'miss') { cellEl.style.background = C.HEATMAP_MISSED; }
        cellEl.title = cd.key + (cd.slot && cd.slot.scheduled ? (' \u2014 ' + cd.slot.doneCount + '/' + cd.slot.slotCount) :
          (cd.status === 'off' ? ' \u2014 not scheduled' : ''));
        cellEl.textContent = String(cd.day);
        grid.appendChild(cellEl);
      }
      card.appendChild(grid);
      host.appendChild(card);
    }

    if (!anyShown) {
      var empty = document.createElement('p'); empty.className = 'dash-list-empty';
      empty.textContent = 'No habits scheduled this month.';
      host.appendChild(empty);
    }
  }

  // ── Categories tab ─────────────────────────────────────────────────────
  function renderCategories() {
    var D = window.DashboardData;
    var C = window.DashboardCharts;

    var leaderboard = $('cat-leaderboard');
    clearNode(leaderboard);
    var breakdown = D.categoryBreakdown();
    for (var i = 0; i < breakdown.length; i += 1) {
      var b = breakdown[i];
      var row = document.createElement('div'); row.className = 'dash-list-item';
      var dot = document.createElement('span'); dot.className = 'dash-list-dot';
      dot.style.background = C.accentColor(b.accent);
      row.appendChild(dot);
      var title = document.createElement('span'); title.className = 'dash-list-title';
      var bw = D.bestAndWorstInCategory(b.category);
      var rate = b.scheduled === 0 ? null : b.done / b.scheduled;
      title.textContent = b.category;
      row.appendChild(title);
      var bar = document.createElement('span'); bar.className = 'dash-list-bar';
      var fill = document.createElement('span'); fill.className = 'dash-list-bar-fill';
      fill.style.width = Math.round((rate || 0) * 100) + '%';
      fill.style.background = C.accentColor(b.accent);
      bar.appendChild(fill);
      row.appendChild(bar);
      var meta = document.createElement('span'); meta.className = 'dash-list-meta';
      meta.textContent = (rate == null ? '\u2014' : Math.round(rate * 100) + '%') + ' \u00b7 ' + b.done;
      row.appendChild(meta);
      leaderboard.appendChild(row);

      // Best/worst sub-row
      if (bw.best || bw.worst) {
        var sub = document.createElement('div');
        sub.style.fontSize = '12px'; sub.style.color = 'var(--muted)';
        sub.style.padding = '0 12px 4px 28px';
        var parts = [];
        if (bw.best)  { parts.push('Best: '  + bw.best.task.title  + ' (' + Math.round(bw.best.rate  * 100) + '%)'); }
        if (bw.worst && (!bw.best || bw.worst.task.id !== bw.best.task.id))
                      { parts.push('Worst: ' + bw.worst.task.title + ' (' + Math.round(bw.worst.rate * 100) + '%)'); }
        sub.textContent = parts.join(' \u00b7 ');
        leaderboard.appendChild(sub);
      }
    }

    var stacked = D.categoryTrend(12);
    C.stackedBarChart($('cat-stacked'), stacked);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.DashboardApp = {
    start: start,
    onStorageChange: onStorageChange
  };
}());
