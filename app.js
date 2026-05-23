(function () {
  var MORNING_STORAGE_PREFIX = 'habit-board-state-';
  var MYDAY_STORAGE_PREFIX = 'myday-state-';
  var CLOCK_START_SECONDS = 1 * 60 * 60;
  var MORNING_START_SECONDS = 7 * 60 * 60;
  var MORNING_END_SECONDS = 10 * 60 * 60;

  var allTasks = window.ALL_TASKS || [];
  var morningHabits = [];
  var mydayTasks = [];
  for (var _i = 0; _i < allTasks.length; _i += 1) {
    if (allTasks[_i].category === 'Morning Routine') {
      morningHabits.push(allTasks[_i]);
    } else {
      mydayTasks.push(allTasks[_i]);
    }
  }

  var accentClasses = ['accent-pink', 'accent-blue', 'accent-green', 'accent-cyan', 'accent-amber', 'accent-purple'];

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
  var mydayTaskCount = document.getElementById('myday-task-count');
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
  var touchStartY = 0;
  var touchEndY = 0;
  var manualScreen = null;
  var lastNaturalScreen = null;
  var currentMyDayTasks = [];
  var lastMyDayHour = -1;

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(value) {
    return value < 10 ? '0' + String(value) : String(value);
  }

  function getModeOverride() {
    var search = window.location.search || '';
    var match = search.match(/(?:\?|&)mode=(morning|clock|myday)(?:&|$)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function getDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function getLogicalDate() {
    var now = new Date();
    if (now.getHours() < 1) {
      now.setDate(now.getDate() - 1);
    }
    return now;
  }

  function slugifyTime(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function isWithinTimeWindow(slot, currentHour) {
    if (slot.from <= slot.to) {
      return currentHour >= slot.from && currentHour < slot.to;
    }
    return currentHour >= slot.from || currentHour < slot.to;
  }

  function isExpiredTimeWindow(slot, nowHour) {
    if (slot.from <= slot.to) {
      return nowHour >= slot.to;
    }
    return false;
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

  function readState(prefix, dateKey) {
    try {
      var raw = window.localStorage.getItem(prefix + dateKey);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function writeState(prefix, dateKey, state) {
    try {
      window.localStorage.setItem(prefix + dateKey, JSON.stringify(state));
    } catch (error) {
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
    var dateKey;
    if (prefix === MYDAY_STORAGE_PREFIX) {
      dateKey = getDateKey(getLogicalDate());
    } else {
      dateKey = getDateKey(new Date());
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
    writeState(prefix, dateKey, state);
    if (prefix === MYDAY_STORAGE_PREFIX) {
      // When a Missed task is caught up, auto-open the Caught Up section so
      // the user sees where the card moved (otherwise it appears to vanish
      // into the collapsed <details>).
      if (wasMissed && state[habitId] && doneMissedSection) {
        doneMissedSection.open = true;
      }
      renderMyDay();
      fitAllTitles();
    } else {
      applyState(grid, prefix, dateKey);
    }
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
      startDate = new Date(freq.startDate + 'T00:00:00');
      normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      diffMs = normalizedDate.getTime() - normalizedStart.getTime();
      diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      return (diffWeeks >= 0) && (diffWeeks % freq.every === 0) && (date.getDay() === freq.day);
    }

    if (freq.type === 'once') {
      if (!freq.date) { return false; }
      var y = date.getFullYear();
      var m = String(date.getMonth() + 1).padStart(2, '0');
      var d = String(date.getDate()).padStart(2, '0');
      return freq.date === (y + '-' + m + '-' + d);
    }

    return false;
  }

  function renderMyDay() {
    var logicalDate = getLogicalDate();
    var todayTasks = [];
    var i, t, task, nowHour, expandedTasks, missedTasks, carryForwardTasks;
    var dateKey, state, compositeId, todayTaskIds;
    var yesterday, yesterdayKey, yesterdayState;
    var allTasks, visibleTasks, doneMissedTasks;

    for (i = 0; i < mydayTasks.length; i += 1) {
      if (isTaskForDate(mydayTasks[i], logicalDate)) {
        todayTasks.push(mydayTasks[i]);
      }
    }

    dateKey = getDateKey(logicalDate);
    state = readState(MYDAY_STORAGE_PREFIX, dateKey);
    nowHour = new Date().getHours();
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
      } else {
        expandedTasks.push(task);
      }
    }

    todayTaskIds = {};
    for (i = 0; i < todayTasks.length; i += 1) {
      todayTaskIds[todayTasks[i].id] = true;
    }

    yesterday = new Date(logicalDate.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    yesterdayKey = getDateKey(yesterday);
    yesterdayState = readState(MYDAY_STORAGE_PREFIX, yesterdayKey);
    carryForwardTasks = [];

    // Recurring tasks (weekly/interval) carry forward one day if missed yesterday.
    // One-time tasks carry forward for up to 7 days after their scheduled date
    // so a short trip / busy week doesn't bury them — they die down after that.
    var ONCE_CARRY_FORWARD_DAYS = 7;

    function wasEverCompleted(taskId, fromDate, throughDate) {
      var cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
      var end = new Date(throughDate.getFullYear(), throughDate.getMonth(), throughDate.getDate());
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

    for (i = 0; i < mydayTasks.length; i += 1) {
      task = mydayTasks[i];
      if (task.times && task.times.length > 0) { continue; }
      if (!task.frequency || task.frequency.type === 'daily') { continue; }
      if (todayTaskIds[task.id]) { continue; }

      if (task.frequency.type === 'once') {
        if (!task.frequency.date) { continue; }
        var scheduled = new Date(task.frequency.date + 'T00:00:00');
        var scheduledNorm = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
        var todayNorm = new Date(logicalDate.getFullYear(), logicalDate.getMonth(), logicalDate.getDate());
        var daysSince = Math.floor((todayNorm.getTime() - scheduledNorm.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSince < 1 || daysSince > ONCE_CARRY_FORWARD_DAYS) { continue; }
        if (wasEverCompleted(task.id, scheduledNorm, todayNorm)) { continue; }
        pushCarryForward(task);
        continue;
      }

      if (!isTaskForDate(task, yesterday)) { continue; }
      if (yesterdayState[task.id]) { continue; }
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

    currentMyDayTasks = visibleTasks;

    if (mydayDateHeading) {
      mydayDateHeading.textContent = dayNames[logicalDate.getDay()] + ', ' + monthNames[logicalDate.getMonth()] + ' ' + logicalDate.getDate();
    }
    if (mydayTaskCount) {
      mydayTaskCount.textContent = visibleTasks.length + (visibleTasks.length === 1 ? ' task now' : ' tasks now');
    }

    if (visibleTasks.length === 0) {
      while (mydayGrid.firstChild) {
        mydayGrid.removeChild(mydayGrid.firstChild);
      }
      var emptyMsg = document.createElement('div');
      emptyMsg.className = 'myday-empty';
      emptyMsg.textContent = 'No tasks right now';
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
  }

  function getActiveScreen(date) {
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

    calendarPanel.addEventListener('wheel', function (event) {
      if (Math.abs(event.deltaY) < 12) {
        return;
      }
      event.preventDefault();
      moveCalendarMonth(event.deltaY > 0 ? 1 : -1, new Date());
    }, { passive: false });

    calendarPanel.addEventListener('touchstart', function (event) {
      if (!event.touches || !event.touches[0]) {
        return;
      }
      touchStartY = event.touches[0].clientY;
      touchEndY = touchStartY;
    });

    calendarPanel.addEventListener('touchmove', function (event) {
      if (!event.touches || !event.touches[0]) {
        return;
      }
      touchEndY = event.touches[0].clientY;
    });

    calendarPanel.addEventListener('touchend', function () {
      var deltaY = touchStartY - touchEndY;
      if (Math.abs(deltaY) < 30) {
        return;
      }
      moveCalendarMonth(deltaY > 0 ? 1 : -1, new Date());
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

    updateClock(now);

    morningScreen.classList.add('hidden');
    mydayScreen.classList.add('hidden');
    clockScreen.classList.add('hidden');

    if (activeScreen === 'morning') {
      morningScreen.classList.remove('hidden');
      applyState(routineGrid, MORNING_STORAGE_PREFIX, getDateKey(now));
    } else if (activeScreen === 'myday') {
      mydayScreen.classList.remove('hidden');
      var currentHour = now.getHours();
      if (currentHour !== lastMyDayHour) {
        lastMyDayHour = currentHour;
        renderMyDay();
        fitAllTitles();
      }
      applyState(mydayGrid, MYDAY_STORAGE_PREFIX, getDateKey(getLogicalDate()));
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
    if (mydayGrid && !mydayScreen.classList.contains('hidden') && currentMyDayTasks.length > 0) {
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

  function setupNavButtons() {
    var morningToClockBtn = document.getElementById('morning-to-clock');
    var mydayToClockBtn = document.getElementById('myday-to-clock');
    var mydayToMorningBtn = document.getElementById('myday-to-morning');
    var clockToHomeBtn = document.getElementById('clock-to-home');

    if (morningToClockBtn) {
      morningToClockBtn.addEventListener('click', function () {
        manualScreen = 'clock';
        syncView();
      });
    }
    if (mydayToClockBtn) {
      mydayToClockBtn.addEventListener('click', function () {
        manualScreen = 'clock';
        syncView();
      });
    }
    if (mydayToMorningBtn) {
      mydayToMorningBtn.addEventListener('click', function () {
        manualScreen = 'morning';
        syncView();
        fitAllTitles();
      });
    }
    if (clockToHomeBtn) {
      clockToHomeBtn.addEventListener('click', function () {
        manualScreen = null;
        syncView();
        fitAllTitles();
      });
    }
  }

  function applyMorningConfig() {
    var badgeEl = document.getElementById('morning-badge');
    var headingEl = document.getElementById('morning-heading');
    var timeLabelEl = document.getElementById('morning-time-label');
    if (badgeEl) { badgeEl.textContent = 'Morning reset'; }
    if (headingEl) { headingEl.textContent = 'Start with:'; }
    if (timeLabelEl) { timeLabelEl.textContent = '7:00 AM to 10:00 AM'; }
  }

  applyMorningConfig();
  setupCalendarInteractions();
  setupViewportSizing();
  renderCardsInto(routineGrid, morningHabits, MORNING_STORAGE_PREFIX);
  renderMyDay();
  loadQuotesFromFile();
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
