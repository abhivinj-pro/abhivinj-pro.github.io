(function () {
  var MORNING_STORAGE_PREFIX = 'habit-board-state-';
  var MYDAY_STORAGE_PREFIX = 'myday-state-';
  var CLOCK_START_SECONDS = 1 * 60 * 60;
  var MORNING_START_SECONDS = 7 * 60 * 60;
  var MORNING_END_SECONDS = 10 * 60 * 60;

  var morningConfig = window.MORNING_CONFIG || { habits: [], badge: 'Morning reset', heading: 'Start with:', timeLabel: '' };
  var morningHabits = morningConfig.habits;
  var mydayTasks = window.MYDAY_TASKS || [];

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

  function createHabitCard(habit, index) {
    var card = document.createElement('div');
    card.className = 'habit-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-habit-id', habit.id);
    card.setAttribute('aria-pressed', 'false');
    card.innerHTML = [
      '<div class="habit-card-inner">',
      '<div class="habit-index ', habit.accentClass || accentClasses[index % accentClasses.length], '">', index + 1, '</div>',
      '<div class="habit-content"><div class="habit-title">', habit.title, '</div>',
      (habit.timeLabel ? '<div class="habit-time-label">' + habit.timeLabel + '</div>' : ''),
      '</div>',
      '<div class="habit-icon">', habit.icon || '', '</div>',
      '</div>'
    ].join('');
    return card;
  }

  function renderCardsInto(grid, habitsList) {
    var fragment = document.createDocumentFragment();
    var index;
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    for (index = 0; index < habitsList.length; index += 1) {
      fragment.appendChild(createHabitCard(habitsList[index], index));
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
    state[habitId] = !state[habitId];
    writeState(prefix, dateKey, state);
    applyState(grid, prefix, dateKey);
  }

  function setupGridInteraction(grid, storagePrefix) {
    grid.addEventListener('click', function (event) {
      var node = event.target;
      while (node && node !== grid && !node.getAttribute('data-habit-id')) {
        node = node.parentNode;
      }
      if (node && node.getAttribute && node.getAttribute('data-habit-id')) {
        toggleHabit(grid, storagePrefix, node.getAttribute('data-habit-id'));
      }
    });

    grid.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        var node = event.target;
        if (node && node.getAttribute && node.getAttribute('data-habit-id')) {
          event.preventDefault();
          toggleHabit(grid, storagePrefix, node.getAttribute('data-habit-id'));
        }
      }
    });
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

    return false;
  }

  function renderMyDay() {
    var logicalDate = getLogicalDate();
    var todayTasks = [];
    var i, t, task, nowHour, expandedTasks, missedTasks, carryForwardTasks;
    var dateKey, state, compositeId, todayTaskIds;
    var yesterday, yesterdayKey, yesterdayState;
    var allTasks, isLandscape, minRows, actualRows, rows;

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
          } else if (isExpiredTimeWindow(task.times[t], nowHour) && !state[compositeId]) {
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

    for (i = 0; i < mydayTasks.length; i += 1) {
      task = mydayTasks[i];
      if (task.times && task.times.length > 0) { continue; }
      if (!task.frequency || task.frequency.type === 'daily') { continue; }
      if (todayTaskIds[task.id]) { continue; }
      if (!isTaskForDate(task, yesterday)) { continue; }
      if (yesterdayState[task.id]) { continue; }
      carryForwardTasks.push({
        id: task.id,
        title: task.title,
        accentClass: task.accentClass,
        icon: task.icon,
        missed: true
      });
    }

    expandedTasks.sort(function (a, b) {
      var aT = a.timeLabel ? 0 : 1;
      var bT = b.timeLabel ? 0 : 1;
      return aT - bT;
    });

    allTasks = expandedTasks.concat(carryForwardTasks).concat(missedTasks);
    currentMyDayTasks = allTasks;

    if (mydayDateHeading) {
      mydayDateHeading.textContent = dayNames[logicalDate.getDay()] + ', ' + monthNames[logicalDate.getMonth()] + ' ' + logicalDate.getDate();
    }
    if (mydayTaskCount) {
      mydayTaskCount.textContent = allTasks.length + (allTasks.length === 1 ? ' task now' : ' tasks now');
    }

    if (allTasks.length === 0) {
      while (mydayGrid.firstChild) {
        mydayGrid.removeChild(mydayGrid.firstChild);
      }
      var emptyMsg = document.createElement('div');
      emptyMsg.className = 'myday-empty';
      emptyMsg.textContent = 'No tasks right now';
      mydayGrid.appendChild(emptyMsg);
      return;
    }

    renderCardsInto(mydayGrid, allTasks);
    applyState(mydayGrid, MYDAY_STORAGE_PREFIX, dateKey);

    var cards = mydayGrid.querySelectorAll('.habit-card');
    for (i = 0; i < allTasks.length; i += 1) {
      if (allTasks[i].missed) {
        cards[i].classList.add('missed');
      }
    }

    isLandscape = window.innerWidth > window.innerHeight;
    minRows = isLandscape ? 3 : 6;
    actualRows = isLandscape ? Math.ceil(allTasks.length / 2) : allTasks.length;
    rows = Math.max(actualRows, minRows);
    mydayGrid.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
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

  function fitTitlesForGrid(grid) {
    var cards = grid.querySelectorAll('.habit-card');
    if (!cards.length) return;

    var i, w, titles = [], words, longest, cardH;

    var measurer = document.createElement('span');
    measurer.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:nowrap;visibility:hidden;';
    document.body.appendChild(measurer);

    longest = '';
    for (i = 0; i < cards.length; i += 1) {
      titles.push(cards[i].querySelector('.habit-title'));
      titles[i].style.fontSize = '';
      words = titles[i].textContent.split(/\s+/);
      for (w = 0; w < words.length; w += 1) {
        if (words[w].length > longest.length) { longest = words[w]; }
      }
    }
    void grid.offsetHeight;

    var ts = window.getComputedStyle(titles[0]);
    measurer.style.fontFamily = ts.fontFamily;
    measurer.style.fontWeight = ts.fontWeight;
    measurer.style.letterSpacing = ts.letterSpacing;

    cardH = cards[0].getBoundingClientRect().height;
    var availH = cardH - 16;
    var content = cards[0].querySelector('.habit-content');
    var cs = window.getComputedStyle(content);
    var availW = content.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 4;

    var lo = 20;
    var hi = Math.min(200, Math.round(availH));
    var mid;

    while (hi - lo > 1) {
      mid = Math.floor((lo + hi) / 2);
      for (i = 0; i < titles.length; i += 1) {
        titles[i].style.fontSize = mid + 'px';
      }

      measurer.style.fontSize = mid + 'px';
      measurer.textContent = longest;
      var wordFits = measurer.getBoundingClientRect().width <= availW;

      var allFit = wordFits;
      if (allFit) {
        for (i = 0; i < titles.length; i += 1) {
          if (titles[i].getBoundingClientRect().height > availH) {
            allFit = false;
            break;
          }
        }
      }

      if (allFit) { lo = mid; } else { hi = mid; }
    }

    for (i = 0; i < titles.length; i += 1) {
      titles[i].style.fontSize = lo + 'px';
    }

    document.body.removeChild(measurer);
  }

  function fitAllTitles() {
    if (routineGrid && !morningScreen.classList.contains('hidden')) {
      fitTitlesForGrid(routineGrid);
    }
    if (mydayGrid && !mydayScreen.classList.contains('hidden') && currentMyDayTasks.length > 0) {
      fitTitlesForGrid(mydayGrid);
    }
  }

  function debouncedFitAllTitles() {
    if (fitTimer) { clearTimeout(fitTimer); }
    fitTimer = setTimeout(fitAllTitles, 120);
  }

  function setupNavButtons() {
    var morningToClockBtn = document.getElementById('morning-to-clock');
    var mydayToClockBtn = document.getElementById('myday-to-clock');
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
    if (badgeEl) { badgeEl.textContent = morningConfig.badge; }
    if (headingEl) { headingEl.textContent = morningConfig.heading; }
    if (timeLabelEl) { timeLabelEl.textContent = morningConfig.timeLabel; }
  }

  applyMorningConfig();
  setupCalendarInteractions();
  setupViewportSizing();
  renderCardsInto(routineGrid, morningHabits);
  renderMyDay();
  setupGridInteraction(routineGrid, MORNING_STORAGE_PREFIX);
  setupGridInteraction(mydayGrid, MYDAY_STORAGE_PREFIX);
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
