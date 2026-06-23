/*
 * dashboard-data.js — analytics aggregation layer.
 *
 * Loads day-state documents via Storage.ensureDayLoaded across the selected
 * range, then derives a single `dailyStatus[dateKey][taskId]` table that all
 * tabs share. Recurrence logic mirrors app.js#isTaskForDate; we re-implement
 * it locally so the dashboard page doesn't need to load app.js. Multi-slot
 * tasks (task.times[]) count composite-key completions
 * (`taskId__<slugifyTime(label)>`) as fractional progress.
 *
 * Excluded from analytics by product decision:
 *   - task.archived === true (mirrors app.js#rebuildTaskBuckets)
 *   - frequency.type === 'once' (one-off study tasks etc.)
 *   - category === 'Work' (currently dominated by `once` items)
 *
 * Public API on window.DashboardData:
 *   load(rangeDays, onProgress) -> Promise<void>
 *   tasks                       -> recurring, non-Work tasks
 *   range                       -> { fromKey, toKey, fromDate, toDate, days[] }
 *   dailyStatus                 -> { dateKey: { taskId: { scheduled, doneCount, slotCount } } }
 *   completionRate(taskId, fromKey?, toKey?) -> 0..1
 *   currentStreak(taskId)       -> int
 *   longestStreak(taskId)       -> int
 *   perfectDayStreak(currentOnly) -> int
 *   weekdayStrength(taskId?)    -> [{ label, rate, scheduled, done }]  Mon..Sun
 *   categoryBreakdown(fromKey?, toKey?) -> [{ category, accent, done, scheduled }]
 *   topPerformers(limit)        -> sorted tasks by rate
 *   atRisk(limit)               -> tasks whose recent rate fell vs prior
 *   recentMisses(limit)         -> [{ task, dateKey, daysAgo }]
 *   weekTrend(weeks)            -> [{ label, rate }]
 *   monthTrend(months)          -> [{ label, rate }]
 *   monthStats(year, month)     -> { dayStats:{dateKey:{frac,done,scheduled}}, perfectDays, completionRate, totalDone }
 *   weekStats(monday)           -> { days:[{dateKey, frac, done, scheduled, tasks:[{task,done}]}], totalDone, totalScheduled }
 *   categoryTrend(weeks)        -> grouped stacks for stackedBarChart
 *   listTaskDates(taskId)       -> [{ dateKey, status:'done'|'partial'|'miss', frac }]
 */
(function () {
  var MORNING_PREFIX = 'habit-board-state-';
  var MYDAY_PREFIX   = 'myday-state-';

  var CATEGORY_ACCENT = {
    'Morning Routine': 'pink',
    'Self Care':       'purple',
    'Chores':          'green',
    'Groceries':       'amber',
    'General':         'blue'
  };

  // Order used in donuts / leaderboards.
  var CATEGORY_ORDER = ['Morning Routine', 'Self Care', 'Chores', 'Groceries', 'General'];

  var WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ── Date helpers (logical day rolls at 1 AM) ────────────────────────────
  function pad(v) { return v < 10 ? '0' + v : '' + v; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function todayLogical() {
    var now = new Date();
    if (now.getHours() < 1) { now.setDate(now.getDate() - 1); }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function parseKey(key) {
    var p = key.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  function slugifyTime(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function normalizeCategory(c) {
    if (!c) { return 'Work'; }
    return c;
  }

  // ── Recurrence (mirrors app.js#isTaskForDate) ────────────────────────────
  function isTaskForDate(task, date) {
    var freq = task.frequency;
    if (!freq || freq.type === 'daily') { return true; }
    if (freq.type === 'weekly') {
      return (freq.days || []).indexOf(date.getDay()) !== -1;
    }
    if (freq.type === 'interval') {
      var start = parseKey(freq.startDate);
      var sNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var dNorm = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      var weeks = Math.floor((dNorm.getTime() - sNorm.getTime()) / (7 * 86400000));
      return (weeks >= 0) && (weeks % freq.every === 0) && (date.getDay() === freq.day);
    }
    // `once` is filtered upstream from analytics; treat as no-op here.
    return false;
  }

  // ── State (per dashboard session) ────────────────────────────────────────
  var state = {
    tasks: [],
    range: null,
    dailyStatus: {},
    loaded: false
  };

  // ── Channel resolution ───────────────────────────────────────────────────
  function channelForTask(task) {
    return normalizeCategory(task.category) === 'Morning Routine'
      ? MORNING_PREFIX : MYDAY_PREFIX;
  }

  // ── Build dailyStatus table ──────────────────────────────────────────────
  function buildDailyStatus() {
    var status = {};
    var days = state.range.days;
    for (var i = 0; i < days.length; i += 1) {
      var dateKey = days[i].key;
      var date = days[i].date;
      var row = {};
      for (var t = 0; t < state.tasks.length; t += 1) {
        var task = state.tasks[t];
        var scheduled = isTaskForDate(task, date);
        var slotCount = (task.times && task.times.length) ? task.times.length : 1;
        var doneCount = 0;

        // Read the right channel.
        var prefix = channelForTask(task);
        var dayState = window.Storage.readDayState(prefix, dateKey) || {};

        if (scheduled) {
          if (task.times && task.times.length) {
            for (var s = 0; s < task.times.length; s += 1) {
              var cid = task.id + '__' + slugifyTime(task.times[s].label);
              if (dayState[cid]) { doneCount += 1; }
            }
          } else {
            if (dayState[task.id]) { doneCount = 1; }
          }
        } else {
          // Not scheduled — still count a "ticked" entry if the user
          // back-completed (rare). Use bare id only.
          if (dayState[task.id]) { doneCount = 1; }
        }

        row[task.id] = {
          scheduled: scheduled,
          doneCount: doneCount,
          slotCount: slotCount
        };
      }
      status[dateKey] = row;
    }
    state.dailyStatus = status;
  }

  // ── Day-doc bulk loader (lazy beyond Storage's 15-day preload) ──────────
  function loadAllDays(onProgress) {
    var keys = [];
    for (var i = 0; i < state.range.days.length; i += 1) {
      keys.push(state.range.days[i].key);
    }
    if (!window.Storage || window.Storage.mode === 'demo' || !window.Storage.user) {
      // Demo mode: no cloud reads. dailyStatus will be built from empty state.
      if (onProgress) { onProgress(1, 1); }
      return Promise.resolve();
    }

    var total = keys.length;
    var completed = 0;
    var pending = keys.slice();
    var CONCURRENCY = 6;

    return new Promise(function (resolve) {
      function spawn() {
        while (pending.length && active < CONCURRENCY) {
          var k = pending.shift();
          active += 1;
          window.Storage.ensureDayLoaded(k).then(done, done);
        }
        if (!pending.length && active === 0) { resolve(); }
      }
      function done() {
        active -= 1;
        completed += 1;
        if (onProgress) { onProgress(completed, total); }
        spawn();
      }
      var active = 0;
      spawn();
    });
  }

  // ── Public: load (resolves once status is fully built) ──────────────────
  function load(rangeDays, onProgress) {
    rangeDays = rangeDays || 30;
    var today = todayLogical();
    var fromDate = addDays(today, -(rangeDays - 1));
    var days = [];
    for (var d = 0; d < rangeDays; d += 1) {
      var dt = addDays(fromDate, d);
      days.push({ key: fmt(dt), date: dt });
    }

    state.range = {
      days: days,
      fromKey: days[0].key,
      toKey: days[days.length - 1].key,
      fromDate: fromDate,
      toDate: today,
      rangeDays: rangeDays
    };

    // Pull tasks from Storage; filter out one-time + Work.
    var src = (window.Storage && window.Storage.tasks) || [];
    var picked = [];
    for (var i = 0; i < src.length; i += 1) {
      var task = src[i];
      if (task.archived) { continue; }
      var cat = normalizeCategory(task.category);
      if (cat === 'Work') { continue; }
      if (task.frequency && task.frequency.type === 'once') { continue; }
      picked.push(task);
    }
    state.tasks = picked;
    state.loaded = false;

    return loadAllDays(onProgress).then(function () {
      buildDailyStatus();
      state.loaded = true;
    });
  }

  // ── Aggregations ─────────────────────────────────────────────────────────
  function clampRange(fromKey, toKey) {
    return {
      fromKey: fromKey || state.range.fromKey,
      toKey:   toKey   || state.range.toKey
    };
  }

  function eachDayInRange(fromKey, toKey, cb) {
    var r = clampRange(fromKey, toKey);
    for (var i = 0; i < state.range.days.length; i += 1) {
      var d = state.range.days[i];
      if (d.key < r.fromKey || d.key > r.toKey) { continue; }
      cb(d, state.dailyStatus[d.key] || {});
    }
  }

  function completionRate(taskId, fromKey, toKey) {
    var scheduled = 0, done = 0;
    eachDayInRange(fromKey, toKey, function (d, row) {
      var s = row[taskId];
      if (!s || !s.scheduled) { return; }
      scheduled += s.slotCount;
      done += s.doneCount;
    });
    if (scheduled === 0) { return null; }
    return done / scheduled;
  }

  // Walk back from today: while the task was scheduled-and-done (slots may
  // be partial — count as continued if at least one slot done), increment.
  function currentStreak(taskId) {
    var streak = 0;
    var todayKey = state.range.toKey;
    var d = parseKey(todayKey);
    while (true) {
      var key = fmt(d);
      var row = state.dailyStatus[key];
      if (!row) { break; }
      var s = row[taskId];
      if (!s) { break; }
      if (!s.scheduled) {
        d = addDays(d, -1); // skip unscheduled days
        continue;
      }
      if (s.doneCount >= s.slotCount) { streak += 1; d = addDays(d, -1); continue; }
      // Today specifically is treated leniently: a partial / missing today
      // does NOT yet break the streak (the day isn't over).
      if (key === todayKey && s.doneCount === 0) { d = addDays(d, -1); continue; }
      break;
    }
    return streak;
  }

  function longestStreak(taskId) {
    var best = 0, cur = 0;
    for (var i = 0; i < state.range.days.length; i += 1) {
      var d = state.range.days[i];
      var s = (state.dailyStatus[d.key] || {})[taskId];
      if (!s) { continue; }
      if (!s.scheduled) { continue; }
      if (s.doneCount >= s.slotCount) {
        cur += 1;
        if (cur > best) { best = cur; }
      } else {
        cur = 0;
      }
    }
    return best;
  }

  function perfectDayFor(dateKey) {
    var row = state.dailyStatus[dateKey] || {};
    var anyScheduled = false;
    for (var id in row) {
      if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
      var s = row[id];
      if (!s.scheduled) { continue; }
      anyScheduled = true;
      if (s.doneCount < s.slotCount) { return false; }
    }
    return anyScheduled;
  }

  function perfectDayStreak() {
    var streak = 0;
    var todayKey = state.range.toKey;
    for (var i = state.range.days.length - 1; i >= 0; i -= 1) {
      var k = state.range.days[i].key;
      if (k === todayKey && !perfectDayFor(k)) { continue; } // be lenient on today
      if (perfectDayFor(k)) { streak += 1; }
      else { break; }
    }
    return streak;
  }

  function longestPerfectStreak() {
    var best = 0, cur = 0;
    for (var i = 0; i < state.range.days.length; i += 1) {
      if (perfectDayFor(state.range.days[i].key)) { cur += 1; if (cur > best) { best = cur; } }
      else { cur = 0; }
    }
    return best;
  }

  // Mon..Sun
  function weekdayStrength(taskId) {
    var sched = [0,0,0,0,0,0,0];
    var done  = [0,0,0,0,0,0,0];
    for (var i = 0; i < state.range.days.length; i += 1) {
      var d = state.range.days[i];
      var idx = (d.date.getDay() + 6) % 7; // Mon=0
      var row = state.dailyStatus[d.key] || {};
      if (taskId) {
        var s = row[taskId];
        if (!s || !s.scheduled) { continue; }
        sched[idx] += s.slotCount;
        done[idx] += s.doneCount;
      } else {
        for (var id in row) {
          if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
          var s2 = row[id];
          if (!s2.scheduled) { continue; }
          sched[idx] += s2.slotCount;
          done[idx]  += s2.doneCount;
        }
      }
    }
    var out = [];
    for (var w = 0; w < 7; w += 1) {
      out.push({
        label: WEEKDAY_LABELS[w],
        scheduled: sched[w],
        done: done[w],
        rate: sched[w] === 0 ? 0 : done[w] / sched[w]
      });
    }
    return out;
  }

  function categoryBreakdown(fromKey, toKey) {
    var buckets = {};
    for (var c = 0; c < CATEGORY_ORDER.length; c += 1) {
      buckets[CATEGORY_ORDER[c]] = { category: CATEGORY_ORDER[c], accent: CATEGORY_ACCENT[CATEGORY_ORDER[c]], done: 0, scheduled: 0 };
    }
    var taskCat = {};
    for (var t = 0; t < state.tasks.length; t += 1) { taskCat[state.tasks[t].id] = normalizeCategory(state.tasks[t].category); }

    eachDayInRange(fromKey, toKey, function (d, row) {
      for (var id in row) {
        if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
        var s = row[id];
        if (!s.scheduled) { continue; }
        var cat = taskCat[id];
        var bucket = buckets[cat];
        if (!bucket) { continue; }
        bucket.scheduled += s.slotCount;
        bucket.done += s.doneCount;
      }
    });
    var out = [];
    for (var k = 0; k < CATEGORY_ORDER.length; k += 1) { out.push(buckets[CATEGORY_ORDER[k]]); }
    return out;
  }

  function topPerformers(limit) {
    limit = limit || 5;
    var out = [];
    for (var i = 0; i < state.tasks.length; i += 1) {
      var task = state.tasks[i];
      var rate = completionRate(task.id);
      if (rate == null) { continue; }
      out.push({ task: task, rate: rate });
    }
    out.sort(function (a, b) { return b.rate - a.rate; });
    return out.slice(0, limit);
  }

  function atRisk(limit) {
    limit = limit || 5;
    // Compare the most recent 14 days vs the 14 days prior to that.
    var total = state.range.days.length;
    if (total < 8) { return []; }
    var window = Math.min(14, Math.floor(total / 2));
    var recentFrom = state.range.days[total - window].key;
    var recentTo = state.range.toKey;
    var priorFrom = state.range.days[Math.max(0, total - window * 2)].key;
    var priorTo = state.range.days[total - window - 1].key;

    var out = [];
    for (var i = 0; i < state.tasks.length; i += 1) {
      var task = state.tasks[i];
      var rRecent = completionRate(task.id, recentFrom, recentTo);
      var rPrior = completionRate(task.id, priorFrom, priorTo);
      if (rRecent == null || rPrior == null) { continue; }
      var drop = rPrior - rRecent;
      if (drop <= 0.05) { continue; } // only meaningful slips
      out.push({ task: task, rate: rRecent, prior: rPrior, drop: drop });
    }
    out.sort(function (a, b) { return b.drop - a.drop; });
    return out.slice(0, limit);
  }

  function recentMisses(limit) {
    limit = limit || 8;
    var out = [];
    var today = todayLogical();
    // Walk days newest-first, surface scheduled-and-not-done past today.
    for (var i = state.range.days.length - 1; i >= 0; i -= 1) {
      var d = state.range.days[i];
      if (d.key === fmt(today)) { continue; }
      var row = state.dailyStatus[d.key] || {};
      for (var t = 0; t < state.tasks.length; t += 1) {
        var task = state.tasks[t];
        var s = row[task.id];
        if (!s || !s.scheduled) { continue; }
        if (s.doneCount >= s.slotCount) { continue; }
        out.push({ task: task, dateKey: d.key, daysAgo: diffDays(today, d.date) });
        if (out.length >= limit) { return out; }
      }
    }
    return out;
  }

  function listTaskDates(taskId) {
    var out = [];
    for (var i = 0; i < state.range.days.length; i += 1) {
      var d = state.range.days[i];
      var s = (state.dailyStatus[d.key] || {})[taskId];
      if (!s) { continue; }
      var status, frac;
      if (!s.scheduled) {
        status = s.doneCount > 0 ? 'bonus' : 'empty';
        frac = s.doneCount > 0 ? 1 : 0;
      } else if (s.doneCount === 0) {
        status = 'miss'; frac = 0;
      } else if (s.doneCount < s.slotCount) {
        status = 'partial'; frac = s.doneCount / s.slotCount;
      } else {
        status = 'done'; frac = 1;
      }
      out.push({ dateKey: d.key, date: d.date, status: status, frac: frac, done: s.doneCount, slots: s.slotCount, scheduled: s.scheduled });
    }
    return out;
  }

  // ── Week / month / category trend helpers ────────────────────────────────
  // Monday-based ISO-ish week key
  function mondayOf(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d;
  }

  function weekTrend(weeks) {
    weeks = weeks || 8;
    var today = todayLogical();
    var thisMonday = mondayOf(today);
    var out = [];
    for (var w = weeks - 1; w >= 0; w -= 1) {
      var start = addDays(thisMonday, -7 * w);
      var end = addDays(start, 6);
      var done = 0, scheduled = 0;
      for (var k = 0; k < 7; k += 1) {
        var key = fmt(addDays(start, k));
        var row = state.dailyStatus[key];
        if (!row) { continue; }
        for (var id in row) {
          if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
          var s = row[id];
          if (!s.scheduled) { continue; }
          scheduled += s.slotCount;
          done += s.doneCount;
        }
      }
      out.push({
        label: pad(start.getMonth() + 1) + '/' + pad(start.getDate()),
        rate: scheduled === 0 ? 0 : done / scheduled,
        done: done, scheduled: scheduled
      });
    }
    return out;
  }

  function weekStats(monday) {
    var days = [];
    for (var i = 0; i < 7; i += 1) {
      var date = addDays(monday, i);
      var key = fmt(date);
      var row = state.dailyStatus[key];
      var done = 0, scheduled = 0;
      var taskList = [];
      if (row) {
        for (var t = 0; t < state.tasks.length; t += 1) {
          var task = state.tasks[t];
          var s = row[task.id];
          if (!s || !s.scheduled) { continue; }
          scheduled += s.slotCount;
          done += s.doneCount;
          taskList.push({ task: task, done: s.doneCount, slots: s.slotCount });
        }
      }
      days.push({
        dateKey: key,
        date: date,
        done: done,
        scheduled: scheduled,
        frac: scheduled === 0 ? 0 : done / scheduled,
        tasks: taskList
      });
    }
    var totalDone = 0, totalSched = 0;
    for (var j = 0; j < days.length; j += 1) { totalDone += days[j].done; totalSched += days[j].scheduled; }
    return { days: days, totalDone: totalDone, totalScheduled: totalSched };
  }

  function monthStats(year, month /* 0-11 */) {
    var first = new Date(year, month, 1);
    var dayStats = {};
    var totalDone = 0, totalSched = 0, perfectDays = 0;
    var cursor = new Date(first.getTime());
    while (cursor.getMonth() === month) {
      var key = fmt(cursor);
      var row = state.dailyStatus[key];
      var done = 0, scheduled = 0;
      if (row) {
        for (var id in row) {
          if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
          var s = row[id];
          if (!s.scheduled) { continue; }
          scheduled += s.slotCount;
          done += s.doneCount;
        }
      }
      dayStats[key] = { done: done, scheduled: scheduled, frac: scheduled === 0 ? 0 : done / scheduled };
      if (scheduled > 0 && done >= scheduled) { perfectDays += 1; }
      totalDone += done;
      totalSched += scheduled;
      cursor.setDate(cursor.getDate() + 1);
    }
    return {
      year: year, month: month,
      dayStats: dayStats,
      perfectDays: perfectDays,
      totalDone: totalDone,
      totalScheduled: totalSched,
      completionRate: totalSched === 0 ? null : totalDone / totalSched
    };
  }

  function monthTrend(months) {
    months = months || 12;
    var today = todayLogical();
    var out = [];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (var m = months - 1; m >= 0; m -= 1) {
      var date = new Date(today.getFullYear(), today.getMonth() - m, 1);
      var stats = monthStats(date.getFullYear(), date.getMonth());
      out.push({
        label: monthNames[date.getMonth()],
        rate: stats.completionRate == null ? 0 : stats.completionRate,
        done: stats.totalDone,
        scheduled: stats.totalScheduled
      });
    }
    return out;
  }

  function categoryTrend(weeks) {
    weeks = weeks || 12;
    var today = todayLogical();
    var thisMonday = mondayOf(today);
    var taskCat = {};
    for (var t = 0; t < state.tasks.length; t += 1) { taskCat[state.tasks[t].id] = normalizeCategory(state.tasks[t].category); }

    var groups = [];
    for (var w = weeks - 1; w >= 0; w -= 1) {
      var start = addDays(thisMonday, -7 * w);
      var perCat = {};
      for (var c = 0; c < CATEGORY_ORDER.length; c += 1) { perCat[CATEGORY_ORDER[c]] = 0; }

      for (var k = 0; k < 7; k += 1) {
        var key = fmt(addDays(start, k));
        var row = state.dailyStatus[key];
        if (!row) { continue; }
        for (var id in row) {
          if (!Object.prototype.hasOwnProperty.call(row, id)) { continue; }
          var s = row[id];
          if (!s.scheduled || s.doneCount === 0) { continue; }
          var cat = taskCat[id];
          if (perCat[cat] == null) { continue; }
          perCat[cat] += s.doneCount;
        }
      }
      var segments = [];
      for (var ci = 0; ci < CATEGORY_ORDER.length; ci += 1) {
        var cn = CATEGORY_ORDER[ci];
        segments.push({ value: perCat[cn], accent: CATEGORY_ACCENT[cn] });
      }
      groups.push({
        label: pad(start.getMonth() + 1) + '/' + pad(start.getDate()),
        segments: segments
      });
    }
    return groups;
  }

  function bestAndWorstInCategory(category) {
    var best = null, worst = null;
    for (var i = 0; i < state.tasks.length; i += 1) {
      var task = state.tasks[i];
      if (normalizeCategory(task.category) !== category) { continue; }
      var rate = completionRate(task.id);
      if (rate == null) { continue; }
      if (!best || rate > best.rate) { best = { task: task, rate: rate }; }
      if (!worst || rate < worst.rate) { worst = { task: task, rate: rate }; }
    }
    return { best: best, worst: worst };
  }

  function describeFrequency(task) {
    var f = task.frequency;
    if (!f || f.type === 'daily') { return 'Every day'; }
    if (f.type === 'weekly') {
      var names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var picks = [];
      for (var i = 0; i < (f.days || []).length; i += 1) { picks.push(names[f.days[i]]); }
      return picks.length === 7 ? 'Every day' : 'Every ' + picks.join(', ');
    }
    if (f.type === 'interval') {
      var n = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][f.day];
      return 'Every ' + f.every + ' weeks on ' + n;
    }
    return '';
  }

  window.DashboardData = {
    load: load,
    get tasks() { return state.tasks; },
    get range() { return state.range; },
    get dailyStatus() { return state.dailyStatus; },
    get loaded() { return state.loaded; },
    CATEGORY_ORDER: CATEGORY_ORDER,
    CATEGORY_ACCENT: CATEGORY_ACCENT,
    WEEKDAY_LABELS: WEEKDAY_LABELS,

    todayLogical: todayLogical,
    fmt: fmt,
    parseKey: parseKey,
    addDays: addDays,
    diffDays: diffDays,
    mondayOf: mondayOf,
    normalizeCategory: normalizeCategory,
    describeFrequency: describeFrequency,

    completionRate: completionRate,
    currentStreak: currentStreak,
    longestStreak: longestStreak,
    perfectDayStreak: perfectDayStreak,
    longestPerfectStreak: longestPerfectStreak,
    weekdayStrength: weekdayStrength,
    categoryBreakdown: categoryBreakdown,
    topPerformers: topPerformers,
    atRisk: atRisk,
    recentMisses: recentMisses,
    listTaskDates: listTaskDates,
    weekTrend: weekTrend,
    weekStats: weekStats,
    monthStats: monthStats,
    monthTrend: monthTrend,
    categoryTrend: categoryTrend,
    bestAndWorstInCategory: bestAndWorstInCategory
  };
}());
