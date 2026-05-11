(function () {
  var STORAGE_PREFIX = 'habit-board-state-';
  var MORNING_START_SECONDS = 7 * 60 * 60;
  var MORNING_END_SECONDS = (9 * 60 * 60) + (30 * 60);

  var habits = [
    {
      id: 'stretch-toes',
      title: 'Stretch your toes',
      accentClass: 'accent-pink',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="toeSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd3cc"/><stop offset="100%" stop-color="#ff8c92"/></linearGradient><linearGradient id="toeShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffb2b7"/><stop offset="100%" stop-color="#ff7d84"/></linearGradient></defs><g stroke="#ff6f8d" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.9"><path d="M14 83l-10 7"/><path d="M18 97H6"/><path d="M126 83l10 7"/><path d="M122 97h12"/><path d="M28 18l-5-8"/><path d="M112 18l5-8"/></g><g><path fill="url(#toeSkin)" d="M47 42c0-7 4-13 11-16 7-3 12 1 12 8v18l5 24c2 10-1 27-17 27-15 0-20-16-18-28l3-20c2-6 4-9 4-13z"/><path fill="url(#toeShade)" d="M83 42c0-7-4-13-11-16-7-3-12 1-12 8v18l-5 24c-2 10 1 27 17 27 15 0 20-16 18-28l-3-20c-2-6-4-9-4-13z" opacity="0.94"/><ellipse cx="41" cy="33" rx="8" ry="10" fill="#ffd2c8"/><ellipse cx="54" cy="24" rx="8" ry="11" fill="#ffd0c5"/><ellipse cx="68" cy="20" rx="8" ry="11" fill="#ffcabf"/><ellipse cx="86" cy="24" rx="8" ry="11" fill="#ffc1b8"/><ellipse cx="99" cy="33" rx="8" ry="10" fill="#ffb5af"/></g></svg>'
    },
    {
      id: 'roll-feet',
      title: 'Roll your feet',
      accentClass: 'accent-blue',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="footBlue" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7dc5ff"/><stop offset="100%" stop-color="#2d78f6"/></linearGradient></defs><path fill="url(#footBlue)" d="M84 20c8 6 13 18 14 31l2 28c1 9-2 18-8 25l-15 16c-5 5-11 8-18 8H41c-8 0-11-9-4-13l28-17 8-21V20h11z"/><path fill="#1e66da" d="M74 92c-8 7-18 12-29 14l20-12 6-14z" opacity="0.65"/><g fill="none" stroke="#2d78f6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 85c0-17 8-30 21-38"/><path d="M18 71l4 14 14-6"/><path d="M112 58c5 8 7 16 7 25 0 11-4 22-11 31"/><path d="M96 111l13 1 3-13"/></g><path fill="none" stroke="#164f9f" stroke-width="3" stroke-linecap="round" d="M86 33c5 10 7 22 6 34" opacity="0.55"/></svg>'
    },
    {
      id: 'brush-teeth',
      title: 'Brush your teeth',
      accentClass: 'accent-green',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="toothGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#eff6ff"/></linearGradient></defs><path fill="url(#toothGlow)" d="M59 24c18 0 29 12 29 31 0 9-3 16-7 24-3 7-6 20-9 31-3 10-8 15-13 15s-10-5-13-15c-3-11-6-24-9-31-4-8-7-15-7-24 0-19 11-31 29-31z"/><path fill="#8fe24a" d="M91 22h9l19 15v8H91z"/><rect x="82" y="35" width="9" height="69" rx="4.5" fill="#68b92d"/><g fill="#11151f"><circle cx="49" cy="59" r="4"/><circle cx="69" cy="59" r="4"/></g><path d="M47 83c5 6 11 9 18 9 7 0 13-3 18-9" fill="none" stroke="#11151f" stroke-width="4" stroke-linecap="round"/><g fill="#9df05b" opacity="0.95"><circle cx="22" cy="42" r="5"/><circle cx="16" cy="66" r="4"/><circle cx="23" cy="88" r="5"/><circle cx="112" cy="46" r="5"/><circle cx="120" cy="73" r="4"/><circle cx="111" cy="95" r="5"/></g><path fill="#ffb6c7" d="M55 73c2 2 4 3 6 3s4-1 6-3c-1 5-4 7-6 7s-5-2-6-7z"/></svg>'
    },
    {
      id: 'drink-water',
      title: 'Drink water',
      accentClass: 'accent-cyan',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="glassStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6fe9ff"/><stop offset="100%" stop-color="#2abfe1"/></linearGradient><linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#54bfff"/><stop offset="100%" stop-color="#216fe0"/></linearGradient></defs><path fill="rgba(93,226,255,0.08)" stroke="url(#glassStroke)" stroke-width="5" d="M30 24h58l-5 76c0 10-7 18-17 18H52c-10 0-17-8-17-18z"/><path fill="url(#waterFill)" d="M35 63h48l-4 35c0 8-5 14-12 14H51c-7 0-12-6-12-14z"/><path fill="none" stroke="#a9f5ff" stroke-width="4" stroke-linecap="round" d="M42 37h33" opacity="0.8"/><path fill="#58ddff" d="M106 52c10 13 15 22 15 31 0 11-7 19-16 19-10 0-17-8-17-19 0-9 5-18 18-31z"/><path fill="none" stroke="#baf8ff" stroke-width="4" stroke-linecap="round" d="M100 75c1-6 4-11 8-15" opacity="0.78"/></svg>'
    },
    {
      id: 'take-tablet',
      title: 'Take tablet',
      accentClass: 'accent-amber',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="pillOuter" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe2a4"/><stop offset="100%" stop-color="#d79a44"/></linearGradient><linearGradient id="pillInner" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff3d1"/><stop offset="100%" stop-color="#ffd48c"/></linearGradient></defs><g transform="rotate(-12 70 70)"><ellipse cx="70" cy="70" rx="41" ry="28" fill="url(#pillOuter)"/><ellipse cx="70" cy="70" rx="34" ry="22" fill="url(#pillInner)"/><path d="M52 70h36" stroke="#e5b56a" stroke-width="4" stroke-linecap="round" opacity="0.65"/><text x="70" y="77" text-anchor="middle" font-size="18" font-weight="800" fill="#53340c" font-family="Arial, sans-serif">PanD</text></g><g stroke="#ffbe32" stroke-width="6" stroke-linecap="round"><path d="M20 62H8"/><path d="M30 40l-9-8"/><path d="M108 42l9-8"/><path d="M120 66h12"/><path d="M25 89l-10 6"/></g></svg>'
    },
    {
      id: 'drink-whey',
      title: 'Drink whey',
      accentClass: 'accent-purple',
      icon: '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="shakerTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9a6af5"/><stop offset="100%" stop-color="#6230a9"/></linearGradient><linearGradient id="shakerCup" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6d39c0"/><stop offset="100%" stop-color="#452278"/></linearGradient></defs><path fill="url(#shakerTop)" d="M55 20h30l10 14-7 11H52l-7-11z"/><path fill="url(#shakerCup)" d="M49 45h42l9 49c2 12-7 24-20 24H60c-13 0-22-12-20-24z"/><path fill="#f2d29a" d="M57 66h26l6 30c1 7-4 13-11 13H62c-7 0-12-6-11-13z"/><path fill="#ffffff" opacity="0.82" d="M69 35h8v63h-8z"/><path fill="none" stroke="#b591ff" stroke-width="5" stroke-linecap="round" d="M32 66l-10 6M35 86l-12 3M108 66l10 6M105 86l12 3"/></svg>'
    }
  ];

  var routineGrid = document.getElementById('routine-grid');
  var morningScreen = document.getElementById('morning-screen');
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

  var calendarMonthCursor = null;
  var touchStartY = 0;
  var touchEndY = 0;

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function getModeOverride() {
    var search = window.location.search || '';
    var match = search.match(/(?:\?|&)mode=(morning|clock)(?:&|$)/i);

    return match ? match[1].toLowerCase() : '';
  }

  function getDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
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

  function readState(dateKey) {
    try {
      var raw = window.localStorage.getItem(STORAGE_PREFIX + dateKey);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function writeState(dateKey, state) {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(state));
    } catch (error) {
    }
  }

  function createHabitCard(habit, index) {
    var button = document.createElement('button');

    button.type = 'button';
    button.className = 'habit-card';
    button.setAttribute('data-habit-id', habit.id);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = [
      '<div class="habit-card-inner">',
      '<div class="habit-index ', habit.accentClass, '">', index + 1, '</div>',
      '<div class="habit-content"><div class="habit-title">', habit.title, '</div></div>',
      '<div class="habit-icon">', habit.icon, '</div>',
      '</div>'
    ].join('');
    return button;
  }

  function renderCards() {
    var fragment = document.createDocumentFragment();
    var index;

    for (index = 0; index < habits.length; index += 1) {
      fragment.appendChild(createHabitCard(habits[index], index));
    }

    routineGrid.appendChild(fragment);
  }

  function applyState(dateKey) {
    var state = readState(dateKey);
    var cards = routineGrid.querySelectorAll('.habit-card');
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

  function toggleHabit(habitId) {
    var dateKey = getDateKey(new Date());
    var state = readState(dateKey);
    state[habitId] = !state[habitId];
    writeState(dateKey, state);
    applyState(dateKey);
  }

  function isMorningWindow(date) {
    var seconds = (date.getHours() * 60 * 60) + (date.getMinutes() * 60) + date.getSeconds();
    return seconds >= MORNING_START_SECONDS && seconds < MORNING_END_SECONDS;
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
    var year;
    var month;
    var monthFirstDay;
    var monthStartWeekday;
    var monthDays;
    var previousMonthDays;
    var index;

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
    setupViewportSizing();
    var now = new Date();
    var overrideMode = getModeOverride();
    var morningActive = overrideMode ? overrideMode === 'morning' : isMorningWindow(now);

    updateClock(now);

    if (morningActive) {
      morningScreen.classList.remove('hidden');
      clockScreen.classList.add('hidden');
      applyState(getDateKey(now));
    } else {
      morningScreen.classList.add('hidden');
      clockScreen.classList.remove('hidden');
      if (!calendarMonthCursor) {
        calendarMonthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      renderCalendar(now);
    }
  }

  var fitTimer = null;

  function fitTitles() {
    var cards = routineGrid.querySelectorAll('.habit-card');
    if (!cards.length) return;

    var i, w, titles = [], words, longest, cardH;

    // Off-screen measurer for single-word width
    var measurer = document.createElement('span');
    measurer.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:nowrap;visibility:hidden;';
    document.body.appendChild(measurer);

    // Reset all titles and collect longest word across all cards
    longest = '';
    for (i = 0; i < cards.length; i += 1) {
      titles.push(cards[i].querySelector('.habit-title'));
      titles[i].style.fontSize = '';
      words = titles[i].textContent.split(/\s+/);
      for (w = 0; w < words.length; w += 1) {
        if (words[w].length > longest.length) { longest = words[w]; }
      }
    }
    void routineGrid.offsetHeight;

    // Copy font properties to measurer
    var ts = window.getComputedStyle(titles[0]);
    measurer.style.fontFamily = ts.fontFamily;
    measurer.style.fontWeight = ts.fontWeight;
    measurer.style.letterSpacing = ts.letterSpacing;

    // Available dimensions
    cardH = cards[0].getBoundingClientRect().height;
    var availH = cardH - 16;
    var content = cards[0].querySelector('.habit-content');
    var cs = window.getComputedStyle(content);
    var availW = content.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 4;

    // Binary-search the largest uniform font-size
    var lo = 20;
    var hi = Math.min(200, Math.round(availH));
    var mid;

    while (hi - lo > 1) {
      mid = Math.floor((lo + hi) / 2);
      for (i = 0; i < titles.length; i += 1) {
        titles[i].style.fontSize = mid + 'px';
      }

      // Check longest word fits horizontally
      measurer.style.fontSize = mid + 'px';
      measurer.textContent = longest;
      var wordFits = measurer.getBoundingClientRect().width <= availW;

      // Check all titles fit vertically
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

  function debouncedFitTitles() {
    if (fitTimer) { clearTimeout(fitTimer); }
    fitTimer = setTimeout(fitTitles, 120);
  }

  routineGrid.addEventListener('click', function (event) {
    var node = event.target;

    while (node && node !== routineGrid && !node.getAttribute('data-habit-id')) {
      node = node.parentNode;
    }

    if (node && node.getAttribute && node.getAttribute('data-habit-id')) {
      toggleHabit(node.getAttribute('data-habit-id'));
    }
  });

  setupCalendarInteractions();
  setupViewportSizing();
  renderCards();
  syncView();

  // Fit titles after first paint, and re-fit on resize / orientation change
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(fitTitles);
  } else {
    setTimeout(fitTitles, 60);
  }
  window.addEventListener('resize', debouncedFitTitles);
  window.addEventListener('orientationchange', function () {
    setTimeout(fitTitles, 250);
  });

  window.setInterval(syncView, 1000);
}());