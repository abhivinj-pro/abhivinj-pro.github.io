(function () {
  var MORNING_STORAGE_PREFIX = (window.Storage && window.Storage.PREFIXES)
    ? window.Storage.PREFIXES.MORNING : 'habit-board-state-';
  var MYDAY_STORAGE_PREFIX = (window.Storage && window.Storage.PREFIXES)
    ? window.Storage.PREFIXES.MYDAY : 'myday-state-';
  var CLOCK_START_SECONDS = 0;
  var MORNING_START_SECONDS = 7 * 60 * 60;
  var MORNING_END_SECONDS = 10 * 60 * 60;

  // Task buckets are rebuilt from Storage.tasks whenever auth/cloud state
  // changes; they start empty and populate on the first Storage event.
  var morningHabits = [];
  var mydayTasks = [];
  var workTasks = [];

  function normalizeTaskCategory(category) {
    if (!category) {
      return 'Work';
    }
    return category;
  }

  function rebuildTaskBuckets() {
    morningHabits = [];
    mydayTasks = [];
    workTasks = [];
    var src = (window.Storage && window.Storage.tasks) || [];
    for (var i = 0; i < src.length; i += 1) {
      var category = normalizeTaskCategory(src[i].category);
      src[i].category = category;
      src[i].archived = Boolean(src[i].archived);
      if (src[i].archived) { continue; }
      if (category === 'Morning Routine') {
        morningHabits.push(src[i]);
      } else if (category === 'Work') {
        workTasks.push(src[i]);
      } else {
        mydayTasks.push(src[i]);
      }
    }
  }

  var accentClasses = ['accent-pink', 'accent-blue', 'accent-green', 'accent-cyan', 'accent-amber', 'accent-purple'];

  // Audio feedback for task check / uncheck.
  var taskCompletedSound = new Audio('resources/task-completed.wav');
  var taskUncheckedSound = new Audio('resources/terminate-selection.wav');
  taskCompletedSound.preload = 'auto';
  taskUncheckedSound.preload = 'auto';
  function playTaskSound(completed) {
    var snd = completed ? taskCompletedSound : taskUncheckedSound;
    try {
      snd.currentTime = 0;
      var p = snd.play();
      if (p && typeof p.catch === 'function') { p.catch(function () { /* ignore autoplay errors */ }); }
    } catch (e) { /* no-op */ }
  }

  var routineGrid = document.getElementById('routine-grid');
  var mydayGrid = document.getElementById('myday-grid');
  var morningScreen = document.getElementById('morning-screen');
  var mydayScreen = document.getElementById('myday-screen');
  var clockScreen = document.getElementById('clock-screen');
  var rootElement = document.documentElement;
  var clockTimeMain = document.getElementById('clock-time-main');
  var clockMeridiem = document.getElementById('clock-meridiem');
  var clockSeconds = document.getElementById('clock-seconds');
  var clockDay = document.getElementById('clock-day');
  var clockDate = document.getElementById('clock-date');
  var calendarPanel = document.getElementById('calendar-panel');
  var calendarMonthLabel = document.getElementById('calendar-month-label');
  var calendarGrid = document.getElementById('calendar-grid');
  var calendarPrevButton = document.getElementById('calendar-prev');
  var calendarNextButton = document.getElementById('calendar-next');
  var mydayDateHeading = document.getElementById('myday-date-heading');
  var morningDateHeading = document.getElementById('morning-date-heading');
  var doneMissedSection = document.getElementById('done-missed-section');
  var doneMissedCount = document.getElementById('done-missed-count');
  var doneMissedGrid = document.getElementById('done-missed-grid');
  var mydayQuote = document.getElementById('myday-quote');
  var mydayQuoteText = document.getElementById('myday-quote-text');
  var mydayQuoteAuthor = document.getElementById('myday-quote-author');

  var MYDAY_QUOTES = [
    { text: 'Small steps every day.', author: '' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
    { text: 'Habits are the compound interest of self\u2011improvement.', author: 'James Clear' },
    { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
    { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
    { text: 'Consistency over intensity.', author: '' },
    { text: 'One percent better today.', author: '' },
    { text: 'Showing up is the secret.', author: '' },
    { text: 'The body achieves what the mind believes.', author: '' },
    { text: 'Take care of your body. It\u2019s the only place you have to live.', author: 'Jim Rohn' },
    { text: 'Motivation gets you going. Habit keeps you growing.', author: 'John C. Maxwell' },
    { text: 'A river cuts through rock not because of its power, but its persistence.', author: 'James N. Watkins' },
    { text: 'Make each day your masterpiece.', author: 'John Wooden' },
    { text: 'Tiny changes, remarkable results.', author: 'James Clear' }
  ];

  function parseQuotesText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '#') { continue; }
      // Support optional "Quote -- Author" or "Quote — Author" formats.
      var m = line.match(/^(.*?)\s+(?:--|\u2014|\u2013)\s+(.+)$/);
      if (m) {
        out.push({ text: m[1].trim(), author: m[2].trim() });
      } else {
        out.push({ text: line, author: '' });
      }
    }
    return out;
  }

  function dayIndexFromKey(key) {
    // Cycle quotes by day. Use the YYYY-MM-DD key to compute a stable
    // day index (days since epoch) so each consecutive day advances by one.
    var src = String(key || '');
    var m = src.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var d = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      return Math.floor(d / 86400000);
    }
    // Fallback: hash the key.
    var hash = 0;
    for (var i = 0; i < src.length; i += 1) {
      hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function pickQuoteForKey(key) {
    if (!MYDAY_QUOTES.length) { return { text: '', author: '' }; }
    var idx = dayIndexFromKey(key) % MYDAY_QUOTES.length;
    return MYDAY_QUOTES[idx];
  }

  function loadQuotesFromFile() {
    if (typeof fetch !== 'function') { return; }
    fetch('resources/quotes.txt', { cache: 'no-cache' })
      .then(function (resp) { return resp.ok ? resp.text() : ''; })
      .then(function (text) {
        var parsed = parseQuotesText(text);
        if (parsed.length) {
          MYDAY_QUOTES = parsed;
          // If the MyDay quote is already on screen, refresh it so the
          // user sees the file-driven quote without a reload.
          if (mydayQuote && !mydayQuote.classList.contains('hidden') && mydayQuoteText) {
            var q = pickQuoteForKey(getDateKey(getLogicalDate()));
            mydayQuoteText.textContent = q.text;
            if (mydayQuoteAuthor) { mydayQuoteAuthor.textContent = q.author || ''; }
          }
        }
      })
      .catch(function () { /* keep inline fallback */ });
  }

  var calendarMonthCursor = null;
  var manualScreen = null;
  var lastNaturalScreen = null;
  var currentDayTasks = [];
  var currentDayView = 'myday';
  var lastTaskHour = -1;
  var lastTaskView = '';

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(value) {
    return value < 10 ? '0' + String(value) : String(value);
  }

  function getModeOverride() {
    var search = window.location.search || '';
    var match = search.match(/(?:\?|&)mode=(morning|clock|myday|work)(?:&|$)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function getDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  // Parse a 'YYYY-MM-DD' key into a local-midnight Date.
  // Do NOT use `new Date('YYYY-MM-DDT00:00:00')`: iOS 12 Safari and other
  // pre-ES2015 parsers treat date-time strings without a timezone designator
  // as UTC, which shifts the day in any non-UTC zone and breaks once-task
  // carry-forward (a same-day task ends up classified as "future").
  function parseLocalDateKey(key) {
    if (!key || typeof key !== 'string') { return new Date(NaN); }
    var parts = key.split('-');
    if (parts.length < 3) { return new Date(NaN); }
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) { return new Date(NaN); }
    return new Date(y, m - 1, d);
  }

  // The logical day rolls over at midnight (00:00) — it is simply the current
  // calendar day. A new day's board appears the instant the clock passes
  // midnight; anything missed from the previous day is reached with the date
  // arrows (back-navigation), not by holding the old day open past midnight.
  function getLogicalDate() {
    return new Date();
  }

  // Hours elapsed since midnight of the logical day (0..23). Since the logical
  // day == the calendar day, this is just the wall-clock hour.
  function getLogicalHour() {
    return new Date().getHours();
  }

  function slugifyTime(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ─── Backfill / date navigation ────────────────────────────────────────────
  // The board normally shows "today" (the logical date). The date arrows let a
  // user step back up to BACKFILL_MAX_DAYS to tick off DAILY tasks they did but
  // could not check before the midnight rollover. `viewDateKey === null` means the
  // live "today" view; a 'YYYY-MM-DD' string means a historical day. Only the
  // Morning and My Day screens honor it (Work resets to today — its arrows are
  // hidden). See /memories plan: historical view shows ONLY daily tasks.
  var BACKFILL_MAX_DAYS = 14;
  var FORWARD_MAX_DAYS = 7;
  var viewDateKey = null;

  function isDailyTask(task) {
    return !task.frequency || task.frequency.type === 'daily';
  }

  function todayLogicalKey() {
    return getDateKey(getLogicalDate());
  }

  function minBackfillKey() {
    var d = getLogicalDate();
    return getDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - BACKFILL_MAX_DAYS));
  }

  // Furthest day the forward (plan-ahead) arrows allow: logical today + N days.
  function maxForwardKey() {
    var d = getLogicalDate();
    return getDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + FORWARD_MAX_DAYS));
  }

  // Past day ("backfill"): viewed day is strictly before logical today.
  function isHistoricalView() {
    return viewDateKey !== null && viewDateKey < todayLogicalKey();
  }

  // Future day ("plan ahead"): viewed day is strictly after logical today.
  // (YYYY-MM-DD keys compare lexicographically the same as chronologically.)
  function isFutureView() {
    return viewDateKey !== null && viewDateKey > todayLogicalKey();
  }

  // Effective storage dateKey for a given screen prefix. With the midnight
  // rollover the logical day == the calendar day, so Morning and My Day always
  // resolve to the same day; in historical mode both screens read/write the
  // viewed day so a backfilled tick lands on the correct day-document. (The
  // prefix is retained for call-site symmetry and future per-screen needs.)
  function boardDateKey(prefix) {
    if (viewDateKey) { return viewDateKey; }
    return getDateKey(getLogicalDate());
  }

  // Build the card list for a historical day: DAILY tasks only, multi-slot
  // dailies expanded into one card per slot (composite ids so the dashboard
  // scores them per slot). No missed/expiry/carry-forward — every card is a
  // plain toggle whose checked state comes from that day's saved record.
  function buildHistoricalCards(bucket) {
    var out = [];
    for (var i = 0; i < bucket.length; i += 1) {
      var task = bucket[i];
      if (!isDailyTask(task)) { continue; }
      if (task.times && task.times.length > 0) {
        for (var s = 0; s < task.times.length; s += 1) {
          out.push({
            id: task.id + '__' + slugifyTime(task.times[s].label),
            title: task.title,
            timeLabel: task.times[s].label,
            accentClass: task.accentClass,
            icon: task.icon
          });
        }
      } else {
        out.push(task);
      }
    }
    return out;
  }

  // Build the card list for a FUTURE (plan-ahead) day: ALL tasks scheduled on
  // that date (isTaskForDate), unlike the daily-only backfill view. Cards use
  // the SAME storage ids the live board would use for that date so an early
  // tick is recognized when the day arrives: multi-slot -> one `id__<slot>`
  // card per slot; once-span (length > 1) -> a single bare-id card with a
  // "Day X of N" badge; everything else -> the plain task (bare id). No missed/
  // expiry markers — the future cannot be missed.
  function buildFutureCards(bucket, date) {
    var out = [];
    for (var i = 0; i < bucket.length; i += 1) {
      var task = bucket[i];
      if (!isTaskForDate(task, date)) { continue; }
      if (task.times && task.times.length > 0) {
        for (var s = 0; s < task.times.length; s += 1) {
          out.push({
            id: task.id + '__' + slugifyTime(task.times[s].label),
            title: task.title,
            timeLabel: task.times[s].label,
            accentClass: task.accentClass,
            icon: task.icon
          });
        }
      } else if (task.frequency && task.frequency.type === 'once') {
        var range = getOnceRange(task);
        var totalDays = onceRangeLength(range);
        if (totalDays > 1) {
          var dayIdx = onceRangeDayIndex(range, getDateKey(date));
          out.push({
            id: task.id,
            title: task.title,
            timeLabel: 'Day ' + dayIdx + ' of ' + totalDays,
            accentClass: task.accentClass,
            icon: task.icon
          });
        } else {
          out.push(task);
        }
      } else {
        out.push(task);
      }
    }
    return out;
  }

  function formatNavHeading(date) {
    return dayNames[date.getDay()] + ', ' + monthNames[date.getMonth()].slice(0, 3) + ' ' + date.getDate();
  }

  // Relative descriptor for the date heading's eyebrow label, e.g. "Today",
  // "Yesterday", "Tomorrow", "3 days ago", "In 2 days". Both args are
  // YYYY-MM-DD keys; the diff is computed in whole local days.
  function relativeDayLabel(displayedKey, todayKey) {
    var diff = Math.round(
      (parseLocalDateKey(displayedKey).getTime() - parseLocalDateKey(todayKey).getTime()) / 86400000
    );
    if (diff === 0) { return 'Today'; }
    if (diff === -1) { return 'Yesterday'; }
    if (diff === 1) { return 'Tomorrow'; }
    if (diff < 0) { return Math.abs(diff) + ' days ago'; }
    return 'In ' + diff + ' days';
  }

  // Both window predicates operate in logical-hour space (see getLogicalHour).
  // Wrap-around slots (e.g. 22→1) are normalized by treating slot.to as
  // slot.to + 24 so the slot ends at hour 25 of the logical day. That keeps
  // expiry semantics symmetric with non-wrap slots: a slot is expired iff the
  // logical hour is at or past the slot's effective end.
  function isWithinTimeWindow(slot, currentHour) {
    var end = slot.from <= slot.to ? slot.to : slot.to + 24;
    return currentHour >= slot.from && currentHour < end;
  }

  function isExpiredTimeWindow(slot, nowHour) {
    var end = slot.from <= slot.to ? slot.to : slot.to + 24;
    return nowHour >= end;
  }

  function setViewportHeightVar() {
    var viewportHeight = window.innerHeight;
    if (window.visualViewport && window.visualViewport.height) {
      viewportHeight = Math.round(window.visualViewport.height);
    }
    if (rootElement && viewportHeight > 0) {
      rootElement.style.setProperty('--viewport-height', viewportHeight + 'px');
    }
  }

  function setupViewportSizing() {
    setViewportHeightVar();
    window.addEventListener('pageshow', setViewportHeightVar);
    window.addEventListener('resize', setViewportHeightVar);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(setViewportHeightVar, 160);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setViewportHeightVar);
    }
  }

  // Day state is owned by the Storage layer (cloud-backed for logged-in
  // users, no-op for demo). We keep these thin wrappers so the rest of app.js
  // does not need to know about the storage backend.
  function readState(prefix, dateKey) {
    if (window.Storage) {
      return window.Storage.readDayState(prefix, dateKey) || {};
    }
    return {};
  }

  function writeState(prefix, dateKey, state) {
    if (window.Storage) {
      window.Storage.writeDayState(prefix, dateKey, state);
    }
  }

  function createHabitCard(habit, index, onActivate) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'habit-card';
    card.setAttribute('data-habit-id', habit.id);
    card.setAttribute('aria-pressed', 'false');
    card.innerHTML = [
      '<div class="habit-card-inner">',
      '<div class="habit-index ', habit.accentClass || accentClasses[index % accentClasses.length], '">', habit.icon || '', '</div>',
      '<div class="habit-content"><div class="habit-title">', habit.title, '</div>',
      (habit.timeLabel ? '<div class="habit-time-label">' + habit.timeLabel + '</div>' : ''),
      '</div>',
      '</div>'
    ].join('');
    // Attach the toggle handler DIRECTLY to the button. iOS 9 Safari (iPad 1)
    // drops delegated click events from non-interactive children inside
    // momentum-scrolling containers, so per-card binding on a native <button>
    // is the only path that works on every device without touch shims.
    if (onActivate) {
      card.onclick = function () { onActivate(habit.id); };
    }
    return card;
  }

  function renderCardsInto(grid, habitsList, storagePrefix) {
    var fragment = document.createDocumentFragment();
    var index;
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    var onActivate = storagePrefix
      ? function (habitId) { toggleHabit(grid, storagePrefix, habitId); }
      : null;
    for (index = 0; index < habitsList.length; index += 1) {
      fragment.appendChild(createHabitCard(habitsList[index], index, onActivate));
    }
    grid.appendChild(fragment);
  }

  function applyState(grid, prefix, dateKey) {
    var state = readState(prefix, dateKey);
    var cards = grid.querySelectorAll('.habit-card');
    var index;
    for (index = 0; index < cards.length; index += 1) {
      var card = cards[index];
      var isCompleted = Boolean(state[card.getAttribute('data-habit-id')]);
      if (isCompleted) {
        card.classList.add('completed');
      } else {
        card.classList.remove('completed');
      }
      card.setAttribute('aria-pressed', isCompleted ? 'true' : 'false');
    }
  }

  function toggleHabit(grid, prefix, habitId) {
    // Demo mode: tapping a card prompts the user to sign in rather than
    // silently dropping the write.
    if (window.Storage && window.Storage.mode === 'demo') {
      if (window.AuthUI) {
        window.AuthUI.openLogin({ message: 'Log in to track your day across devices.' });
      }
      return;
    }
    var dateKey;
    if (prefix === MYDAY_STORAGE_PREFIX) {
      dateKey = boardDateKey(MYDAY_STORAGE_PREFIX);
    } else {
      dateKey = boardDateKey(MORNING_STORAGE_PREFIX);
    }
    var state = readState(prefix, dateKey);
    var wasMissed = false;
    if (prefix === MYDAY_STORAGE_PREFIX && grid) {
      var card = grid.querySelector('[data-habit-id="' + habitId + '"]');
      if (card && card.classList && card.classList.contains('missed')) {
        wasMissed = true;
      }
    }
    state[habitId] = !state[habitId];
    playTaskSound(!!state[habitId]);
    writeState(prefix, dateKey, state);
    if (prefix === MYDAY_STORAGE_PREFIX) {
      // When a Missed task is caught up, auto-open the Caught Up section so
      // the user sees where the card moved (otherwise it appears to vanish
      // into the collapsed <details>).
      if (wasMissed && state[habitId] && doneMissedSection) {
        doneMissedSection.open = true;
      }
      renderTaskView(currentDayView);
      fitAllTitles();
    } else {
      applyState(grid, prefix, dateKey);
    }
  }

  // Normalize a `once` frequency into {startDate, endDate} (YYYY-MM-DD strings).
  // Supports legacy { date } (single-day) and new { startDate, endDate } (span).
  // Returns null if the frequency is not a usable `once` shape.
  function getOnceRange(task) {
    if (!task || !task.frequency || task.frequency.type !== 'once') { return null; }
    var freq = task.frequency;
    var start = freq.startDate || freq.date;
    if (!start) { return null; }
    var end = freq.endDate || freq.date || start;
    // Defensive: if end somehow precedes start, collapse to single-day.
    if (end < start) { end = start; }
    return { startDate: start, endDate: end };
  }

  // Inclusive day-count of a once range. Single-day ranges return 1.
  function onceRangeLength(range) {
    if (!range) { return 0; }
    var s = parseLocalDateKey(range.startDate);
    var e = parseLocalDateKey(range.endDate);
    var diff = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
    return diff + 1;
  }

  // 1-based day index of `dateKey` within `range`. Returns 0 if outside.
  function onceRangeDayIndex(range, dateKey) {
    if (!range || dateKey < range.startDate || dateKey > range.endDate) { return 0; }
    var s = parseLocalDateKey(range.startDate);
    var d = parseLocalDateKey(dateKey);
    return Math.round((d.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }

  function isTaskForDate(task, date) {
    var freq = task.frequency;
    var startDate, normalizedDate, normalizedStart, diffMs, diffWeeks;

    if (!freq || freq.type === 'daily') {
      return true;
    }

    if (freq.type === 'weekly') {
      return freq.days.indexOf(date.getDay()) !== -1;
    }

    if (freq.type === 'interval') {
      startDate = parseLocalDateKey(freq.startDate);
      normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      diffMs = normalizedDate.getTime() - normalizedStart.getTime();
      diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      return (diffWeeks >= 0) && (diffWeeks % freq.every === 0) && (date.getDay() === freq.day);
    }

    if (freq.type === 'once') {
      var range = getOnceRange(task);
      if (!range) { return false; }
      var key = getDateKey(date);
      return key >= range.startDate && key <= range.endDate;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Missed-task decay
  //
  // A missed task is carried forward into subsequent days for a window W that
  // depends on the task's natural recurrence gap G (days from the missed date
  // to its next scheduled occurrence):
  //
  //     W = clamp( ceil(G / 4), 2, MAX_CARRY_DAYS )      (non-daily)
  //     W = 0                                            (daily)
  //
  // Intuition: carry a miss forward for about a quarter of the gap to the next
  // occurrence, with a floor of 2 days (so 2x/week still gets a real second
  // chance) and a ceiling of two weeks (so quarterly / one-off tasks don't
  // haunt the board forever). The /4 falls out of the rule "a monthly task
  // missed this weekend should survive long enough to be done next weekend":
  //     G = 28 -> W = 7.
  //
  // Lifetimes this produces:
  //   daily       (G=1)  -> W = 0
  //   2x/week     (G=3)  -> W = 2
  //   weekly      (G=7)  -> W = 2
  //   biweekly    (G=14) -> W = 4
  //   monthly     (G=28) -> W = 7
  //   quarterly+  (G>=56)-> W = 14 (cap)
  //   once        (G=inf)-> W = 14 (cap)
  // ---------------------------------------------------------------------------
  var MAX_CARRY_DAYS = 14;

  function nextOccurrenceDate(task, fromDate) {
    var cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    var i;
    for (i = 0; i < 366; i += 1) {
      if (isTaskForDate(task, cursor)) { return cursor; }
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  function lastScheduledBefore(task, beforeDate, maxLookback) {
    var cursor = new Date(beforeDate.getFullYear(), beforeDate.getMonth(), beforeDate.getDate());
    cursor.setDate(cursor.getDate() - 1);
    var i;
    for (i = 0; i < maxLookback; i += 1) {
      if (isTaskForDate(task, cursor)) { return cursor; }
      cursor.setDate(cursor.getDate() - 1);
    }
    return null;
  }

  function carryWindowDays(task, scheduledDate) {
    if (!task.frequency || task.frequency.type === 'daily') { return 0; }
    if (task.frequency.type === 'once') { return MAX_CARRY_DAYS; }

    var dayAfter = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
    dayAfter.setDate(dayAfter.getDate() + 1);
    var next = nextOccurrenceDate(task, dayAfter);
    if (!next) { return MAX_CARRY_DAYS; }

    var gap = Math.round((next.getTime() - scheduledDate.getTime()) / (24 * 60 * 60 * 1000));
    var w = Math.ceil(gap / 4);
    if (w < 2) { w = 2; }
    if (w > MAX_CARRY_DAYS) { w = MAX_CARRY_DAYS; }
    return w;
  }

  function renderTaskView(viewName) {
    var logicalDate = getLogicalDate();
    var bucket = viewName === 'work' ? workTasks : mydayTasks;
    var todayTasks = [];
    var i, t, task, nowHour, expandedTasks, missedTasks, carryForwardTasks;
    var dateKey, state, compositeId, todayTaskIds;
    var allTasks, visibleTasks, doneMissedTasks;

    // Static-day views: a non-today day shows plain tickable cards with that
    // day's saved state. Past (backfill) shows ONLY daily tasks; future (plan
    // ahead) shows ALL scheduled tasks so the day can be planned and ticked
    // early. Work is never non-today (its arrows are hidden), so these paths
    // are My Day only.
    if (viewName !== 'work') {
      if (isFutureView()) {
        renderFutureTaskView(bucket, viewName);
        return;
      }
      if (isHistoricalView()) {
        renderHistoricalTaskView(bucket, viewName);
        return;
      }
    }

    for (i = 0; i < bucket.length; i += 1) {
      if (isTaskForDate(bucket[i], logicalDate)) {
        todayTasks.push(bucket[i]);
      }
    }

    dateKey = getDateKey(logicalDate);
    state = readState(MYDAY_STORAGE_PREFIX, dateKey);
    nowHour = getLogicalHour();
    expandedTasks = [];
    missedTasks = [];

    for (i = 0; i < todayTasks.length; i += 1) {
      task = todayTasks[i];
      if (task.times && task.times.length > 0) {
        for (t = 0; t < task.times.length; t += 1) {
          compositeId = task.id + '__' + slugifyTime(task.times[t].label);
          if (isWithinTimeWindow(task.times[t], nowHour)) {
            expandedTasks.push({
              id: compositeId,
              title: task.title,
              timeLabel: task.times[t].label,
              accentClass: task.accentClass,
              icon: task.icon
            });
          } else if (isExpiredTimeWindow(task.times[t], nowHour)) {
            // Always push expired time-slot tasks as missed. Whether the user
            // has checked them off is decided downstream by the visible-vs-
            // Caught-Up split (task.missed && state[task.id]). Filtering out
            // completed ones here would make the card disappear entirely
            // instead of moving into Caught Up.
            missedTasks.push({
              id: compositeId,
              title: task.title,
              timeLabel: task.times[t].label,
              accentClass: task.accentClass,
              icon: task.icon,
              missed: true
            });
          }
        }
      } else if (task.frequency && task.frequency.type === 'once') {
        // Multi-day once-tasks get a "Day X of N" badge on today's card so the
        // user can see progress through the span. Single-day spans (legacy
        // shape) get no badge to preserve their pre-existing look.
        var todayRange = getOnceRange(task);
        var todayKey = getDateKey(logicalDate);
        var totalDays = onceRangeLength(todayRange);
        if (totalDays > 1) {
          var dayIdx = onceRangeDayIndex(todayRange, todayKey);
          expandedTasks.push({
            id: task.id,
            title: task.title,
            timeLabel: 'Day ' + dayIdx + ' of ' + totalDays,
            accentClass: task.accentClass,
            icon: task.icon
          });
        } else {
          expandedTasks.push(task);
        }
      } else {
        expandedTasks.push(task);
      }
    }

    todayTaskIds = {};
    for (i = 0; i < todayTasks.length; i += 1) {
      todayTaskIds[todayTasks[i].id] = true;
    }

    carryForwardTasks = [];

    // A missed task is carried forward for W days where W is derived from the
    // task's natural recurrence gap (see carryWindowDays above). Daily tasks
    // are excluded — their next instance is already on today's board.
    //
    // Note: the range is [fromDate, throughDate) — i.e. today is intentionally
    // EXCLUDED. If we included today, then the moment the user catches up on a
    // missed task, this function would return true, the task would be filtered
    // out of carryForwardTasks via `continue`, and never reach the Caught Up
    // split below. Today's tick is handled by the `task.missed && state[task.id]`
    // classifier further down, which routes the card into doneMissedTasks.
    function wasEverCompleted(taskId, fromDate, throughDate) {
      var cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
      var end = new Date(throughDate.getFullYear(), throughDate.getMonth(), throughDate.getDate());
      end.setDate(end.getDate() - 1);
      while (cursor.getTime() <= end.getTime()) {
        var dayState = readState(MYDAY_STORAGE_PREFIX, getDateKey(cursor));
        if (dayState[taskId]) { return true; }
        cursor.setDate(cursor.getDate() + 1);
      }
      return false;
    }

    function pushCarryForward(task) {
      carryForwardTasks.push({
        id: task.id,
        title: task.title,
        accentClass: task.accentClass,
        icon: task.icon,
        missed: true
      });
    }

    // Per-day missed instance for a multi-day once-task. The composite id
    // (`task.id#YYYY-MM-DD`) lives in *today's* state when the user catches up,
    // so each missed day gets independent completion tracking without
    // touching historical day-state docs. The "Day X of N — Missed" badge
    // is rendered via timeLabel by createHabitCard.
    function pushCarryForwardOnceDay(task, range, missedDateKey, totalDays) {
      var dayIdx = onceRangeDayIndex(range, missedDateKey);
      carryForwardTasks.push({
        id: task.id + '#' + missedDateKey,
        title: task.title,
        accentClass: task.accentClass,
        icon: task.icon,
        timeLabel: 'Day ' + dayIdx + ' of ' + totalDays + ' \u2014 Missed',
        missed: true,
        missedDateKey: missedDateKey,
        parentTaskId: task.id
      });
    }

    // True if a multi-day once-task's missed day was caught up on a day strictly
    // before today (i.e. [missedDate+1, yesterday]). Today is intentionally
    // excluded — same pattern as wasEverCompleted — so that when a user catches
    // up on a missed once-day task today, the task still flows into
    // carryForwardTasks and is correctly routed to the Caught Up section by the
    // state[task.id] classifier below. If we included today here, the task
    // would be filtered out of carryForwardTasks the moment it is checked off
    // and would disappear from the board entirely.
    function wasOnceDayCaughtUp(task, missedDateKey, todayDate) {
      var compositeId = task.id + '#' + missedDateKey;
      var cursor = parseLocalDateKey(missedDateKey);
      cursor.setDate(cursor.getDate() + 1);
      var end = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
      end.setDate(end.getDate() - 1); // exclude today
      while (cursor.getTime() <= end.getTime()) {
        var dayState = readState(MYDAY_STORAGE_PREFIX, getDateKey(cursor));
        if (dayState[compositeId]) { return true; }
        cursor.setDate(cursor.getDate() + 1);
      }
      return false;
    }

    var todayNorm = new Date(logicalDate.getFullYear(), logicalDate.getMonth(), logicalDate.getDate());

    for (i = 0; i < bucket.length; i += 1) {
      task = bucket[i];
      if (task.times && task.times.length > 0) { continue; }
      if (!task.frequency || task.frequency.type === 'daily') { continue; }

      if (task.frequency.type === 'once') {
        // Span-aware carry-forward: iterate each day D in
        // [startDate, min(endDate, today-1)] and surface a per-day missed
        // instance for any day that is (a) un-done on the day itself and
        // (b) not already caught up on a later day. Single-day spans
        // preserve the legacy behavior (one card, bare task.id, no badge).
        var range = getOnceRange(task);
        if (!range) { continue; }
        var spanLen = onceRangeLength(range);
        var isSpan = spanLen > 1;

        var startD = parseLocalDateKey(range.startDate);
        var endD = parseLocalDateKey(range.endDate);
        // Carry-forward only inspects strictly past days; today's card is
        // handled in the expansion loop above.
        var lastInspect = new Date(todayNorm.getTime());
        lastInspect.setDate(lastInspect.getDate() - 1);
        if (endD.getTime() < lastInspect.getTime()) {
          lastInspect = endD;
        }

        var d = new Date(startD.getTime());
        while (d.getTime() <= lastInspect.getTime()) {
          var dKey = getDateKey(d);
          var daysSinceD = Math.round((todayNorm.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
          if (daysSinceD < 1 || daysSinceD > MAX_CARRY_DAYS) {
            d.setDate(d.getDate() + 1);
            continue;
          }
          var stateForD = readState(MYDAY_STORAGE_PREFIX, dKey);
          if (stateForD[task.id]) {
            d.setDate(d.getDate() + 1);
            continue;
          }
          if (isSpan && wasOnceDayCaughtUp(task, dKey, todayNorm)) {
            d.setDate(d.getDate() + 1);
            continue;
          }
          if (isSpan) {
            pushCarryForwardOnceDay(task, range, dKey, spanLen);
          } else {
            // Legacy single-day path: skip if today's card already represents
            // the task (would be a duplicate), and use bare task.id so any
            // existing per-task today-state catch-ups still apply.
            //
            // wasEverCompleted check (range [d+1, today-1]): the legacy catch-
            // up channel stores bare task.id on the catch-up day. Without this
            // check, a task ticked on day D+1 would re-appear in Missed on
            // D+2 onwards because the visible/Caught-Up split only inspects
            // *today's* state[task.id]. Matches the semantics used for
            // weekly/interval tasks further below.
            if (!todayTaskIds[task.id] && !wasEverCompleted(task.id, d, todayNorm)) {
              pushCarryForward(task);
            }
          }
          d.setDate(d.getDate() + 1);
        }
        continue;
      }

      if (todayTaskIds[task.id]) { continue; }

      var scheduledNorm = lastScheduledBefore(task, todayNorm, MAX_CARRY_DAYS);
      if (!scheduledNorm) { continue; }

      var daysSince = Math.round((todayNorm.getTime() - scheduledNorm.getTime()) / (24 * 60 * 60 * 1000));
      if (daysSince < 1) { continue; }

      var carryWindow = carryWindowDays(task, scheduledNorm);
      if (carryWindow <= 0 || daysSince > carryWindow) { continue; }

      if (wasEverCompleted(task.id, scheduledNorm, todayNorm)) { continue; }
      pushCarryForward(task);
    }

    expandedTasks.sort(function (a, b) {
      var aT = a.timeLabel ? 0 : 1;
      var bT = b.timeLabel ? 0 : 1;
      return aT - bT;
    });

    allTasks = expandedTasks.concat(carryForwardTasks).concat(missedTasks);
    visibleTasks = [];
    doneMissedTasks = [];

    for (i = 0; i < allTasks.length; i += 1) {
      task = allTasks[i];
      if (task.missed && state[task.id]) {
        doneMissedTasks.push(task);
      } else {
        visibleTasks.push(task);
      }
    }

    currentDayTasks = visibleTasks;
    currentDayView = viewName;

    if (visibleTasks.length === 0) {
      while (mydayGrid.firstChild) {
        mydayGrid.removeChild(mydayGrid.firstChild);
      }
      var emptyMsg = document.createElement('div');
      emptyMsg.className = 'myday-empty';
      emptyMsg.textContent = viewName === 'work' ? 'No work tasks right now' : 'No tasks right now';
      mydayGrid.appendChild(emptyMsg);
    } else {
      renderCardsInto(mydayGrid, visibleTasks, MYDAY_STORAGE_PREFIX);
      applyState(mydayGrid, MYDAY_STORAGE_PREFIX, dateKey);

      var cards = mydayGrid.querySelectorAll('.habit-card');
      for (i = 0; i < visibleTasks.length; i += 1) {
        if (visibleTasks[i].missed) {
          cards[i].classList.add('missed');
        }
      }
    }

    if (doneMissedSection && doneMissedGrid) {
      if (doneMissedTasks.length === 0) {
        doneMissedSection.classList.add('hidden');
        while (doneMissedGrid.firstChild) {
          doneMissedGrid.removeChild(doneMissedGrid.firstChild);
        }
      } else {
        doneMissedSection.classList.remove('hidden');
        if (doneMissedCount) {
          doneMissedCount.textContent = String(doneMissedTasks.length);
        }
        renderCardsInto(doneMissedGrid, doneMissedTasks, MYDAY_STORAGE_PREFIX);
        applyState(doneMissedGrid, MYDAY_STORAGE_PREFIX, dateKey);

        var doneCards = doneMissedGrid.querySelectorAll('.habit-card');
        for (i = 0; i < doneMissedTasks.length; i += 1) {
          doneCards[i].classList.add('missed');
        }
      }
    }

    // Motivational quote is always shown below the task list.
    if (mydayGrid && mydayQuote && mydayQuoteText) {
      var q = pickQuoteForKey(dateKey);
      mydayQuoteText.textContent = q.text;
      if (mydayQuoteAuthor) { mydayQuoteAuthor.textContent = q.author || ''; }
      mydayQuote.classList.remove('hidden');

      // The grid normally uses flex:1 to fill the viewport. Since the quote
      // (and possibly the Caught Up section) sits below the grid, switch the
      // grid to size-to-content so those elements remain on-screen instead of
      // being pushed below the fold.
      mydayGrid.classList.add('compact');
    }

    updateDateNavUI();
  }

  // Render a past day for the Morning/My Day screens: daily tasks only, plain
  // tickable cards reflecting that day's saved record. No missed markers,
  // expiry dimming, carry-forward duplicates, or "Caught Up" section.
  // Shared renderer for a non-live (static) day board: plain tickable cards
  // whose checked state comes from that day's saved record, no Caught Up
  // section, with the day's quote shown. Used by both the past (backfill) and
  // future (plan-ahead) views, which differ only in how `cards`/`emptyMsg` are
  // computed by their callers.
  function renderStaticDayView(cards, viewName, emptyMsg) {
    var dateKey = viewDateKey;

    currentDayTasks = cards;
    currentDayView = viewName;

    while (mydayGrid.firstChild) {
      mydayGrid.removeChild(mydayGrid.firstChild);
    }

    if (cards.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'myday-empty';
      empty.textContent = emptyMsg;
      mydayGrid.appendChild(empty);
    } else {
      renderCardsInto(mydayGrid, cards, MYDAY_STORAGE_PREFIX);
      applyState(mydayGrid, MYDAY_STORAGE_PREFIX, dateKey);
    }

    // No Caught Up section in a static-day view.
    if (doneMissedSection && doneMissedGrid) {
      doneMissedSection.classList.add('hidden');
      while (doneMissedGrid.firstChild) {
        doneMissedGrid.removeChild(doneMissedGrid.firstChild);
      }
    }

    if (mydayGrid && mydayQuote && mydayQuoteText) {
      var q = pickQuoteForKey(dateKey);
      mydayQuoteText.textContent = q.text;
      if (mydayQuoteAuthor) { mydayQuoteAuthor.textContent = q.author || ''; }
      mydayQuote.classList.remove('hidden');
      mydayGrid.classList.add('compact');
    }

    updateDateNavUI();
  }

  function renderHistoricalTaskView(bucket, viewName) {
    renderStaticDayView(buildHistoricalCards(bucket), viewName, 'No daily tasks for this day');
  }

  function renderFutureTaskView(bucket, viewName) {
    var cards = buildFutureCards(bucket, parseLocalDateKey(viewDateKey));
    renderStaticDayView(cards, viewName, 'No tasks scheduled for this day');
  }

  function syncPageNavState(activeScreen) {
    var screenPrefixes = ['morning', 'myday'];
    var targets = ['morning', 'myday', 'work', 'clock'];
    var pi, ti, button, isActive;

    for (pi = 0; pi < screenPrefixes.length; pi += 1) {
      for (ti = 0; ti < targets.length; ti += 1) {
        button = document.getElementById(screenPrefixes[pi] + '-nav-' + targets[ti]);
        if (!button) { continue; }
        isActive = targets[ti] === activeScreen;
        if (isActive) {
          button.classList.add('active');
          button.setAttribute('aria-current', 'page');
        } else {
          button.classList.remove('active');
          button.removeAttribute('aria-current');
        }
      }
    }
  }

  function getActiveScreen(date) {
    // Logged-out (demo) users never see the Morning routine; their default is
    // the clock, with My Day reachable as an opt-in demo. The 'loading' state
    // is treated the same way so we don't briefly flash an empty Morning grid
    // while Storage resolves on first paint.
    var mode = window.Storage && window.Storage.mode;
    if (mode === 'demo' || mode === 'loading') {
      return 'clock';
    }
    var seconds = (date.getHours() * 3600) + (date.getMinutes() * 60) + date.getSeconds();
    if (seconds >= CLOCK_START_SECONDS && seconds < MORNING_START_SECONDS) {
      return 'clock';
    }
    if (seconds >= MORNING_START_SECONDS && seconds < MORNING_END_SECONDS) {
      return 'morning';
    }
    return 'myday';
  }

  function updateClock(now) {
    var hours24 = now.getHours();
    var hours12 = hours24 % 12;
    var minutes = now.getMinutes();
    var seconds = now.getSeconds();
    if (hours12 === 0) {
      hours12 = 12;
    }
    clockTimeMain.textContent = pad(hours12) + ':' + pad(minutes);
    clockMeridiem.textContent = hours24 >= 12 ? 'PM' : 'AM';
    clockSeconds.textContent = pad(seconds);
    clockDay.textContent = dayNames[now.getDay()];
    clockDate.textContent = monthNames[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
  }

  function isSameDate(leftDate, rightDate) {
    return leftDate.getFullYear() === rightDate.getFullYear() &&
      leftDate.getMonth() === rightDate.getMonth() &&
      leftDate.getDate() === rightDate.getDate();
  }

  function renderCalendar(todayDate) {
    var year, month, monthFirstDay, monthStartWeekday, monthDays, previousMonthDays, index;

    if (!calendarGrid || !calendarMonthLabel || !calendarMonthCursor) {
      return;
    }

    year = calendarMonthCursor.getFullYear();
    month = calendarMonthCursor.getMonth();
    monthFirstDay = new Date(year, month, 1);
    monthStartWeekday = monthFirstDay.getDay();
    monthDays = new Date(year, month + 1, 0).getDate();
    previousMonthDays = new Date(year, month, 0).getDate();

    calendarMonthLabel.textContent = monthNames[month] + ' ' + year;

    while (calendarGrid.firstChild) {
      calendarGrid.removeChild(calendarGrid.firstChild);
    }

    for (index = 0; index < 42; index += 1) {
      var dayCell = document.createElement('div');
      var cellDate;
      var dayNumber;

      dayCell.className = 'calendar-day';

      if (index < monthStartWeekday) {
        dayNumber = (previousMonthDays - monthStartWeekday) + index + 1;
        dayCell.className += ' adjacent';
        cellDate = new Date(year, month - 1, dayNumber);
      } else if (index < monthStartWeekday + monthDays) {
        dayNumber = index - monthStartWeekday + 1;
        cellDate = new Date(year, month, dayNumber);
      } else {
        dayNumber = index - (monthStartWeekday + monthDays) + 1;
        dayCell.className += ' adjacent';
        cellDate = new Date(year, month + 1, dayNumber);
      }

      dayCell.textContent = String(dayNumber);

      if (isSameDate(cellDate, todayDate)) {
        dayCell.className += ' today';
      }

      calendarGrid.appendChild(dayCell);
    }
  }

  function moveCalendarMonth(step, todayDate) {
    if (!calendarMonthCursor) {
      return;
    }
    calendarMonthCursor.setMonth(calendarMonthCursor.getMonth() + step);
    renderCalendar(todayDate || new Date());
  }

  function setupCalendarInteractions() {
    if (!calendarPanel || !calendarPrevButton || !calendarNextButton) {
      return;
    }

    calendarPrevButton.addEventListener('click', function () {
      moveCalendarMonth(-1, new Date());
    });

    calendarNextButton.addEventListener('click', function () {
      moveCalendarMonth(1, new Date());
    });
  }

  function syncView() {
    setViewportHeightVar();
    var now = new Date();
    var overrideMode = getModeOverride();
    var naturalScreen = getActiveScreen(now);
    var activeScreen;

    if (manualScreen) {
      if (lastNaturalScreen && lastNaturalScreen !== naturalScreen) {
        manualScreen = null;
        activeScreen = overrideMode || naturalScreen;
      } else {
        activeScreen = manualScreen;
      }
    } else if (overrideMode) {
      activeScreen = overrideMode;
    } else {
      activeScreen = naturalScreen;
    }

    lastNaturalScreen = naturalScreen;

    // Safety net: demo / loading modes never have data for Morning. If
    // something tries to route there (manual override, query param), redirect
    // to clock.
    var sm = window.Storage && window.Storage.mode;
    if ((sm === 'demo' || sm === 'loading') && activeScreen === 'morning') {
      activeScreen = 'clock';
    }

    syncPageNavState(activeScreen);
    updateClock(now);

    morningScreen.classList.add('hidden');
    mydayScreen.classList.add('hidden');
    clockScreen.classList.add('hidden');

    if (activeScreen === 'morning') {
      morningScreen.classList.remove('hidden');
      applyState(routineGrid, MORNING_STORAGE_PREFIX, boardDateKey(MORNING_STORAGE_PREFIX));
    } else if (activeScreen === 'myday' || activeScreen === 'work') {
      mydayScreen.classList.remove('hidden');
      var currentHour = now.getHours();
      if (currentHour !== lastTaskHour || activeScreen !== lastTaskView) {
        lastTaskHour = currentHour;
        lastTaskView = activeScreen;
        renderTaskView(activeScreen);
        fitAllTitles();
      }
      applyState(mydayGrid, MYDAY_STORAGE_PREFIX, boardDateKey(MYDAY_STORAGE_PREFIX));
    } else {
      clockScreen.classList.remove('hidden');
      if (!calendarMonthCursor) {
        calendarMonthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      renderCalendar(now);
    }
  }

  var fitTimer = null;

  function fitTitlesForGrid(grid, extraGrids) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.habit-card'));
    var allTitles = Array.prototype.slice.call(grid.querySelectorAll('.habit-title'));
    if (extraGrids && extraGrids.length) {
      for (var g = 0; g < extraGrids.length; g += 1) {
        if (!extraGrids[g]) continue;
        var moreTitles = extraGrids[g].querySelectorAll('.habit-title');
        for (var m = 0; m < moreTitles.length; m += 1) { allTitles.push(moreTitles[m]); }
      }
    }
    if (!cards.length || !allTitles.length) return;

    var i, w, words, longest;

    // Reset inline sizes so measurement isn't biased by previous run.
    for (i = 0; i < allTitles.length; i += 1) {
      allTitles[i].style.fontSize = '';
    }

    var measurer = document.createElement('span');
    measurer.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:nowrap;visibility:hidden;';
    document.body.appendChild(measurer);

    // Collect title texts and longest single word from ALL titles (visible + hidden).
    longest = '';
    var titleTexts = [];
    for (i = 0; i < allTitles.length; i += 1) {
      var txt = allTitles[i].textContent;
      titleTexts.push(txt);
      words = txt.split(/\s+/);
      for (w = 0; w < words.length; w += 1) {
        if (words[w].length > longest.length) { longest = words[w]; }
      }
    }

    var ts = window.getComputedStyle(allTitles[0]);
    measurer.style.fontFamily = ts.fontFamily;
    measurer.style.fontWeight = ts.fontWeight;
    measurer.style.letterSpacing = ts.letterSpacing;
    var lineHeightMult = parseFloat(ts.lineHeight) / parseFloat(ts.fontSize);
    if (!isFinite(lineHeightMult) || lineHeightMult <= 0) { lineHeightMult = 1.15; }

    // Card height is fixed via grid-auto-rows — use first visible card.
    var cardH = cards[0].getBoundingClientRect().height;
    var availH = cardH - 24;
    var content = cards[0].querySelector('.habit-content');
    var cs = window.getComputedStyle(content);
    var availW = content.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 4;

    // Greedy line-wrap simulation using measurer, so hidden titles can be measured.
    function countLines(text, fontPx) {
      measurer.style.fontSize = fontPx + 'px';
      var ws = text.split(/\s+/);
      if (!ws.length) return 1;
      var lines = 1;
      var current = '';
      for (var k = 0; k < ws.length; k += 1) {
        var trial = current ? current + ' ' + ws[k] : ws[k];
        measurer.textContent = trial;
        if (measurer.getBoundingClientRect().width <= availW) {
          current = trial;
        } else {
          if (!current) {
            // Single word exceeds width — counts as one line but doesn't fit.
            return Infinity;
          }
          lines += 1;
          current = ws[k];
          measurer.textContent = current;
          if (measurer.getBoundingClientRect().width > availW) { return Infinity; }
        }
      }
      return lines;
    }

    var lo = 20;
    var hi = Math.min(220, Math.round(availH));
    var mid;

    while (hi - lo > 1) {
      mid = Math.floor((lo + hi) / 2);

      // Quick reject: longest single word must fit on one line.
      measurer.style.fontSize = mid + 'px';
      measurer.textContent = longest;
      var wordFits = measurer.getBoundingClientRect().width <= availW;

      var allFit = wordFits;
      if (allFit) {
        for (i = 0; i < titleTexts.length; i += 1) {
          var lines = countLines(titleTexts[i], mid);
          if (!isFinite(lines) || lines * mid * lineHeightMult > availH) {
            allFit = false;
            break;
          }
        }
      }

      if (allFit) { lo = mid; } else { hi = mid; }
    }

    for (i = 0; i < allTitles.length; i += 1) {
      allTitles[i].style.fontSize = lo + 'px';
    }

    document.body.removeChild(measurer);
  }

  function fitAllTitles() {
    if (routineGrid && !morningScreen.classList.contains('hidden')) {
      fitTitlesForGrid(routineGrid);
    }
    if (mydayGrid && !mydayScreen.classList.contains('hidden') && currentDayTasks.length > 0) {
      var extras = [];
      // Always include done-missed grid (even when collapsed/hidden) so
      // fit basis stays constant when tasks move between sections.
      if (doneMissedGrid) {
        extras.push(doneMissedGrid);
      }
      fitTitlesForGrid(mydayGrid, extras);
    } else if (doneMissedGrid && doneMissedSection && !doneMissedSection.classList.contains('hidden')) {
      fitTitlesForGrid(doneMissedGrid);
    }
  }

  function debouncedFitAllTitles() {
    if (fitTimer) { clearTimeout(fitTimer); }
    fitTimer = setTimeout(fitAllTitles, 120);
  }

  // ─── Date navigation (backfill) UI ───────────────────────────────────────
  function displayedViewDate() {
    return viewDateKey ? parseLocalDateKey(viewDateKey) : getLogicalDate();
  }

  // Update one screen's date-nav controls (heading + prev/next/today).
  function updateNavGroup(prefix, headingEl, hideArrows) {
    var navEl = document.getElementById(prefix + '-date-nav');
    var prevBtn = document.getElementById(prefix + '-date-prev');
    var nextBtn = document.getElementById(prefix + '-date-next');
    var todayBtn = document.getElementById(prefix + '-date-today');
    var displayed = displayedViewDate();
    var displayedKey = getDateKey(displayed);
    var todayKey = todayLogicalKey();
    var offToday = displayedKey !== todayKey;

    if (headingEl) {
      var tense = displayedKey < todayKey ? 'is-past'
        : (displayedKey > todayKey ? 'is-future' : 'is-today');
      headingEl.innerHTML = '<span class="date-eyebrow ' + tense + '">' +
        relativeDayLabel(displayedKey, todayKey) + '</span>' +
        '<span class="date-main">' + formatNavHeading(displayed) + '</span>';
    }

    // Work shares the My Day screen but is always "today" — hide its arrows.
    if (navEl) {
      if (hideArrows) { navEl.classList.add('hidden'); }
      else { navEl.classList.remove('hidden'); }
    }

    if (prevBtn) { prevBtn.disabled = (displayedKey <= minBackfillKey()); }
    if (nextBtn) { nextBtn.disabled = (displayedKey >= maxForwardKey()); }
    if (todayBtn) {
      if (offToday) { todayBtn.classList.remove('hidden'); }
      else { todayBtn.classList.add('hidden'); }
    }
  }

  function updateDateNavUI() {
    updateNavGroup('morning', morningDateHeading, false);
    updateNavGroup('myday', mydayDateHeading, currentDayView === 'work');
    if (calPrefix) { renderCalendar(); }
  }

  // Re-render both boards for the current viewDateKey (used after stepping the
  // date or returning to today). Morning tasks are all daily, but route them
  // through the same render path so historical/live stay consistent.
  function rerenderBoards() {
    if (routineGrid) {
      var morningCards = morningHabits;
      if (isHistoricalView()) {
        morningCards = buildHistoricalCards(morningHabits);
      } else if (isFutureView()) {
        morningCards = buildFutureCards(morningHabits, parseLocalDateKey(viewDateKey));
      }
      renderCardsInto(routineGrid, morningCards, MORNING_STORAGE_PREFIX);
      applyState(routineGrid, MORNING_STORAGE_PREFIX, boardDateKey(MORNING_STORAGE_PREFIX));
    }
    renderTaskView(currentDayView);
    updateDateNavUI();
    fitAllTitles();
  }

  function setViewDate(key) {
    viewDateKey = key;
    if (key) {
      window.Storage.ensureDayLoaded(key).then(function () {
        // Guard against a rapid second navigation having changed the target.
        if (viewDateKey === key) { rerenderBoards(); }
      });
    }
    rerenderBoards();
  }

  function stepViewDate(deltaDays) {
    var base = displayedViewDate();
    var next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
    var nextKey = getDateKey(next);
    if (nextKey > maxForwardKey()) { return; }
    if (nextKey < minBackfillKey()) { return; }
    if (nextKey === todayLogicalKey()) {
      goToToday();
    } else {
      setViewDate(nextKey);
    }
  }

  function goToToday() {
    closeCalendar();
    if (viewDateKey === null) {
      updateDateNavUI();
      return;
    }
    viewDateKey = null;
    rerenderBoards();
  }

  // ─── Pop-up date picker (mini month calendar) ────────────────────────────
  // A small calendar anchored under the date-nav. Only days inside the
  // navigable window (minBackfillKey()..maxForwardKey()) are enabled; the
  // window spans at most two calendar months, so month paging is clamped to
  // just those months. `calPrefix` tracks which screen's popover is open.
  var CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var CAL_DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var calPrefix = null;     // 'morning' | 'myday' | null
  var calMonth = null;      // Date pinned to the 1st of the displayed month

  // True when the month offset by `dir` contains at least one in-window day.
  function calMonthHasDays(dir) {
    var min = minBackfillKey();
    var max = maxForwardKey();
    var shifted = new Date(calMonth.getFullYear(), calMonth.getMonth() + dir, 1);
    var firstKey = getDateKey(new Date(shifted.getFullYear(), shifted.getMonth(), 1));
    var lastKey = getDateKey(new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0));
    return !(lastKey < min || firstKey > max);
  }

  function renderCalendar() {
    if (!calPrefix || !calMonth) { return; }
    var pop = document.getElementById(calPrefix + '-date-cal-pop');
    if (!pop) { return; }
    var min = minBackfillKey();
    var max = maxForwardKey();
    var todayKey = todayLogicalKey();
    var selectedKey = getDateKey(displayedViewDate());
    var year = calMonth.getFullYear();
    var month = calMonth.getMonth();
    var firstDow = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var prevChevron = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"></path></svg>';
    var nextChevron = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"></path></svg>';
    var html = '';
    html += '<div class="date-cal-head">';
    html += '<button type="button" class="date-cal-pg" data-pg="-1" aria-label="Previous month"' +
      (calMonthHasDays(-1) ? '' : ' disabled') + '>' + prevChevron + '</button>';
    html += '<span class="date-cal-title">' + CAL_MONTHS[month] + ' ' + year + '</span>';
    html += '<button type="button" class="date-cal-pg" data-pg="1" aria-label="Next month"' +
      (calMonthHasDays(1) ? '' : ' disabled') + '>' + nextChevron + '</button>';
    html += '</div>';
    html += '<div class="date-cal-dow">';
    for (var w = 0; w < 7; w += 1) { html += '<span>' + CAL_DOW[w] + '</span>'; }
    html += '</div>';
    html += '<div class="date-cal-days">';
    for (var p = 0; p < firstDow; p += 1) { html += '<span></span>'; }
    for (var d = 1; d <= daysInMonth; d += 1) {
      var cellDate = new Date(year, month, d);
      var key = getDateKey(cellDate);
      var inRange = (key >= min && key <= max);
      var cls = 'date-cal-day';
      if (key === todayKey) { cls += ' is-today'; }
      if (key === selectedKey) { cls += ' is-selected'; }
      html += '<button type="button" class="' + cls + '" data-key="' + key + '"' +
        (inRange ? '' : ' disabled') + ' aria-label="' + formatNavHeading(cellDate) + '">' +
        d + '</button>';
    }
    html += '</div>';
    pop.innerHTML = html;
  }

  function openCalendar(prefix) {
    if (calPrefix && calPrefix !== prefix) { closeCalendar(); }
    calPrefix = prefix;
    var dv = displayedViewDate();
    calMonth = new Date(dv.getFullYear(), dv.getMonth(), 1);
    var pop = document.getElementById(prefix + '-date-cal-pop');
    var btn = document.getElementById(prefix + '-date-cal');
    renderCalendar();
    if (pop) { pop.classList.remove('hidden'); }
    if (btn) { btn.setAttribute('aria-expanded', 'true'); }
  }

  function closeCalendar() {
    if (!calPrefix) { return; }
    var pop = document.getElementById(calPrefix + '-date-cal-pop');
    var btn = document.getElementById(calPrefix + '-date-cal');
    if (pop) { pop.classList.add('hidden'); }
    if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    calPrefix = null;
  }

  function toggleCalendar(prefix) {
    if (calPrefix === prefix) { closeCalendar(); }
    else { openCalendar(prefix); }
  }

  function onCalendarPopClick(e) {
    // Keep this click from reaching the document outside-click handler: paging
    // rebuilds the popover (detaching the clicked node), which would otherwise
    // look like an outside click and close the calendar.
    e.stopPropagation();
    var node = e.target;
    while (node && node !== this && !(node.getAttribute &&
        (node.getAttribute('data-key') || node.getAttribute('data-pg')))) {
      node = node.parentNode;
    }
    if (!node || node === this || node.disabled) { return; }
    var pg = node.getAttribute('data-pg');
    if (pg) {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + parseInt(pg, 10), 1);
      renderCalendar();
      return;
    }
    var key = node.getAttribute('data-key');
    if (key) {
      closeCalendar();
      if (key === todayLogicalKey()) { goToToday(); }
      else { setViewDate(key); }
    }
  }

  function setupNavButtons() {
    var navHandlers = {
      morning: function () {
        closeCalendar();
        manualScreen = 'morning';
        syncView();
        fitAllTitles();
      },
      myday: function () {
        closeCalendar();
        manualScreen = 'myday';
        syncView();
        fitAllTitles();
      },
      work: function () {
        closeCalendar();
        viewDateKey = null;
        manualScreen = 'work';
        syncView();
        fitAllTitles();
      },
      clock: function () {
        closeCalendar();
        viewDateKey = null;
        manualScreen = 'clock';
        syncView();
      }
    };

    var screenPrefixes = ['morning', 'myday'];
    var targets = ['morning', 'myday', 'work', 'clock'];
    for (var pi = 0; pi < screenPrefixes.length; pi += 1) {
      for (var ti = 0; ti < targets.length; ti += 1) {
        (function (target) {
          var btn = document.getElementById(screenPrefixes[pi] + '-nav-' + target);
          if (btn) {
            btn.addEventListener('click', navHandlers[target]);
          }
        })(targets[ti]);
      }
    }

    // Clock screen keeps a single top-right button (relabeled 'My Day').
    var clockToMyDayBtn = document.getElementById('clock-to-home');
    if (clockToMyDayBtn) {
      clockToMyDayBtn.addEventListener('click', navHandlers.myday);
    }

    // Date-nav (backfill) arrows + "Today" button on the Morning and My Day
    // screens. The shared viewDateKey means stepping on one screen carries to
    // the other.
    var datePrefixes = ['morning', 'myday'];
    for (var di = 0; di < datePrefixes.length; di += 1) {
      (function (prefix) {
        var prevBtn = document.getElementById(prefix + '-date-prev');
        var nextBtn = document.getElementById(prefix + '-date-next');
        var todayBtn = document.getElementById(prefix + '-date-today');
        if (prevBtn) { prevBtn.addEventListener('click', function () { stepViewDate(-1); }); }
        if (nextBtn) { nextBtn.addEventListener('click', function () { stepViewDate(1); }); }
        if (todayBtn) { todayBtn.addEventListener('click', function () { goToToday(); }); }
      })(datePrefixes[di]);
    }

    // Calendar pop-up: trigger button toggles it; clicks inside are delegated
    // (day select + month paging). Open state is shared via calPrefix.
    for (var ci = 0; ci < datePrefixes.length; ci += 1) {
      (function (prefix) {
        var calBtn = document.getElementById(prefix + '-date-cal');
        var calPop = document.getElementById(prefix + '-date-cal-pop');
        if (calBtn) {
          calBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleCalendar(prefix);
          });
        }
        if (calPop) { calPop.addEventListener('click', onCalendarPopClick); }
      })(datePrefixes[ci]);
    }

    // Dismiss the calendar on an outside click or the Escape key.
    document.addEventListener('click', function (e) {
      if (!calPrefix) { return; }
      var pop = document.getElementById(calPrefix + '-date-cal-pop');
      var btn = document.getElementById(calPrefix + '-date-cal');
      if (pop && pop.contains(e.target)) { return; }
      if (btn && btn.contains(e.target)) { return; }
      closeCalendar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.keyCode === 27 || e.key === 'Escape') { closeCalendar(); }
    });

    // Returning to the app (tab refocus / device wake) should snap back to
    // today so a stale historical view doesn't linger across the midnight reset.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { goToToday(); }
    });
    window.addEventListener('focus', function () { goToToday(); });
  }

  function applyMorningConfig() {
    // The Morning header now shows the navigable date heading (set by
    // updateDateNavUI) instead of a static "Start with:" label.
    updateDateNavUI();
  }

  function rerenderAll() {
    rebuildTaskBuckets();
    applyAuthStateToBody();
    if (routineGrid) {
      renderCardsInto(routineGrid, morningHabits, MORNING_STORAGE_PREFIX);
    }
    renderTaskView(currentDayView);
    syncView();
    fitAllTitles();
  }

  function applyAuthStateToBody() {
    if (!document.body) { return; }
    var mode = (window.Storage && window.Storage.mode) || 'loading';
    document.body.setAttribute('data-auth-mode', mode);
  }

  applyMorningConfig();
  setupCalendarInteractions();
  setupViewportSizing();
  loadQuotesFromFile();

  // Initial render uses whatever Storage currently has (empty until first
  // Storage event fires). Subsequent re-renders are driven by Storage.onChange
  // — that's how cloud loads, sign-ins, and sign-outs propagate to the UI.
  rerenderAll();
  if (window.Storage) {
    window.Storage.onChange(rerenderAll);
  }
  if (doneMissedSection) {
    doneMissedSection.addEventListener('toggle', function () {
      if (doneMissedSection.open) {
        fitAllTitles();
      }
    });
  }
  setupNavButtons();
  syncView();

  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(fitAllTitles);
  } else {
    setTimeout(fitAllTitles, 60);
  }
  window.addEventListener('resize', debouncedFitAllTitles);
  window.addEventListener('orientationchange', function () {
    setTimeout(fitAllTitles, 250);
  });

  window.setInterval(syncView, 1000);
}());
