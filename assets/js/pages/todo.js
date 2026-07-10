(function () {
  const ACCENT_CLASSES = ['accent-pink', 'accent-blue', 'accent-green', 'accent-cyan', 'accent-amber', 'accent-purple'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MORNING_CATEGORY = 'Morning Routine';
  const WORK_CATEGORY = 'Work';

  const DEFAULT_ICON = (window.ICON_LIBRARY && window.ICON_LIBRARY.length)
    ? window.ICON_LIBRARY[0].svg
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  let tasks = [];
  let editingId = null;
  let activeFilters = new Set();
  let selectedIcon = DEFAULT_ICON;
  let iconPickerOpen = false;
  let iconCategoryFilter = 'All';
  // Working set of explicit occurrence dates (YYYY-MM-DD) for a `once` task in
  // "Specific dates" mode. Kept sorted + de-duped by addOnceDate.
  let onceDates = [];

  const taskList = document.getElementById('task-list');
  const filterBar = document.getElementById('filter-bar');
  const editorSection = document.getElementById('editor-section');
  const editorTitle = document.getElementById('editor-title');
  const taskForm = document.getElementById('task-form');
  const taskNameInput = document.getElementById('task-name');
  const addTaskBtn = document.getElementById('add-task-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const weeklyPanel = document.getElementById('weekly-panel');
  const intervalPanel = document.getElementById('interval-panel');
  const oncePanel = document.getElementById('once-panel');
  const onceStartDateInput = document.getElementById('once-start-date');
  const onceEndDateInput = document.getElementById('once-end-date');
  const onceModeRadios = document.querySelectorAll('input[name="once-mode"]');
  const onceRangePanel = document.getElementById('once-range-panel');
  const onceDatesPanel = document.getElementById('once-dates-panel');
  const onceDateInput = document.getElementById('once-date-input');
  const onceAddDateBtn = document.getElementById('once-add-date-btn');
  const onceDatesList = document.getElementById('once-dates-list');
  const onceDatesCount = document.getElementById('once-dates-count');
  const timesPanel = document.getElementById('times-panel');
  const timeSlotsList = document.getElementById('time-slots-list');
  const addSlotBtn = document.getElementById('add-slot-btn');
  const freqRadios = document.querySelectorAll('input[name="freq-type"]');
  const timesModeRadios = document.querySelectorAll('input[name="times-mode"]');
  const taskCategory = document.getElementById('task-category');
  const freqSection = document.getElementById('freq-section');
  const timesSection = document.getElementById('times-section');
  const goalTypeRadios = document.querySelectorAll('input[name="goal-type"]');
  const measurePanel = document.getElementById('measure-panel');
  const goalTypeSection = document.getElementById('goal-type-section');
  const measureUnit = document.getElementById('measure-unit');
  const measureCustomField = document.getElementById('measure-custom-field');
  const measureCustom = document.getElementById('measure-custom');
  const measureTarget = document.getElementById('measure-target');
  const measureStep = document.getElementById('measure-step');
  const iconPreview = document.getElementById('icon-preview');
  const openIconPickerBtn = document.getElementById('open-icon-picker-btn');
  const iconPickerPanel = document.getElementById('icon-picker-panel');
  const iconSearchInput = document.getElementById('icon-search');
  const iconGrid = document.getElementById('icon-grid');
  const iconFilterChips = document.getElementById('icon-filter-chips');
  const syncIndicator = document.getElementById('sync-indicator');
  const authWall = document.getElementById('auth-wall');
  const todoRoot = document.getElementById('todo-root');
  const authWallLoginBtn = document.getElementById('auth-wall-login');

  function normalizeCategory(category) {
    if (!category) {
      return WORK_CATEGORY;
    }
    return category;
  }

  function isWorkCategory(category) {
    return normalizeCategory(category) === WORK_CATEGORY;
  }

  // ── Icon picker ───────────────────────────────────────────────────────────

  const ICON_CATEGORIES = ['All', ...new Set((window.ICON_LIBRARY || []).map(i => i.category))];

  function buildIconFilterChips() {
    iconFilterChips.innerHTML = '';
    ICON_CATEGORIES.forEach(cat => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'icon-cat-chip' + (cat === iconCategoryFilter ? ' active' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        iconCategoryFilter = cat;
        buildIconFilterChips();
        renderIconGrid(iconSearchInput.value.trim().toLowerCase());
      });
      iconFilterChips.appendChild(chip);
    });
  }

  function renderIconGrid(query) {
    const lib = window.ICON_LIBRARY || [];
    const filtered = lib.filter(icon => {
      const matchCat = iconCategoryFilter === 'All' || icon.category === iconCategoryFilter;
      if (!matchCat) return false;
      if (!query) return true;
      return icon.name.toLowerCase().includes(query) ||
        (icon.tags || []).some(t => t.includes(query)) ||
        icon.category.toLowerCase().includes(query);
    });

    iconGrid.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'icon-grid-empty';
      empty.textContent = 'No icons match "' + query + '"';
      iconGrid.appendChild(empty);
      return;
    }

    filtered.forEach(icon => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'icon-tile' + (selectedIcon === icon.svg ? ' selected' : '');
      tile.title = icon.name;
      tile.innerHTML = icon.svg + '<span class="icon-tile-label">' + escapeHtml(icon.name) + '</span>';
      tile.addEventListener('click', () => {
        selectedIcon = icon.svg;
        updateIconPreview();
        closeIconPicker();
      });
      iconGrid.appendChild(tile);
    });
  }

  function updateIconPreview() {
    iconPreview.innerHTML = selectedIcon;
  }

  function openIconPicker() {
    iconPickerOpen = true;
    iconPickerPanel.classList.remove('hidden');
    openIconPickerBtn.textContent = 'Close';
    buildIconFilterChips();
    renderIconGrid('');
    iconSearchInput.value = '';
    iconSearchInput.focus();
  }

  function closeIconPicker() {
    iconPickerOpen = false;
    iconPickerPanel.classList.add('hidden');
    openIconPickerBtn.textContent = 'Choose Icon';
  }

  // ── End icon picker ───────────────────────────────────────────────────────

  function loadTasks() {
    if (window.Storage && window.Storage.tasks) {
      tasks = JSON.parse(JSON.stringify(window.Storage.tasks));
      let needsPersist = false;
      const todayKey = getTodayStr();
      tasks.forEach(task => {
        task.category = normalizeCategory(task.category);
        const wasArchived = !!task.archived;
        if (task.frequency && task.frequency.type === 'once') {
          // Auto-archive once-tasks only after the 14-day Missed window has
          // elapsed. Manual intent wins both ways:
          //   - manuallyArchived: user hit Archive  -> stays archived
          //   - manuallyUnarchived: user hit Unarchive on a historic once
          //     task -> never auto-archived again
          // Otherwise the archive flag is recomputed each load so stale
          // pre-14-day-rule data heals automatically.
          if (task.manuallyArchived) {
            task.archived = true;
          } else if (task.manuallyUnarchived) {
            task.archived = false;
          } else {
            task.archived = isArchivedOnceTask(task, todayKey);
          }
        } else {
          task.archived = wasArchived;
        }
        if (task.archived !== wasArchived) {
          needsPersist = true;
        }
      });
      if (needsPersist) {
        saveDraft();
      }
    } else {
      tasks = [];
    }
  }

  let syncTimer = null;
  function flashSync(text, isError) {
    if (!syncIndicator) { return; }
    syncIndicator.textContent = text || 'Synced \u2713';
    syncIndicator.classList.toggle('auth-status-error', !!isError);
    syncIndicator.classList.add('visible');
    if (syncTimer) { clearTimeout(syncTimer); }
    syncTimer = setTimeout(function () {
      syncIndicator.classList.remove('visible');
    }, 1800);
  }

  function saveDraft() {
    if (!window.Storage) { return; }
    if (window.Storage.mode === 'demo') {
      flashSync('Log in to save', true);
      return;
    }
    window.Storage.saveTasks(tasks).then(function () {
      flashSync('Synced \u2713', false);
    })['catch'](function (err) {
      flashSync('Save failed', true);
      // eslint-disable-next-line no-console
      if (window.console) { console.error('saveTasks failed', err); }
    });
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function describeFrequency(freq, times) {
    let desc;
    if (!freq || freq.type === 'daily') desc = 'Every day';
    else if (freq.type === 'weekly') {
      if (!freq.days || freq.days.length === 0) desc = 'No days selected';
      else if (freq.days.length === 7) desc = 'Every day';
      else desc = freq.days.map(d => DAY_SHORT[d]).join(', ');
    } else if (freq.type === 'interval') {
      desc = 'Every ' + freq.every + ' weeks on ' + DAY_NAMES[freq.day] + ' (from ' + freq.startDate + ')';
    } else if (freq.type === 'once') {
      if (freq.dates && freq.dates.length) {
        const sorted = freq.dates.slice().sort();
        if (sorted.length === 1) {
          desc = 'One-time on ' + sorted[0];
        } else {
          const preview = sorted.slice(0, 3).join(', ');
          desc = sorted.length + ' specific dates (' + preview + (sorted.length > 3 ? ', \u2026' : '') + ')';
        }
      } else {
        const start = freq.startDate || freq.date;
        const end = freq.endDate || freq.date || start;
        if (!start) {
          desc = 'One-time (no date)';
        } else if (!end || start === end) {
          desc = 'One-time on ' + start;
        } else {
          const days = Math.round(
            (new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime())
              / (24 * 60 * 60 * 1000)
          ) + 1;
          desc = 'Multi-day from ' + start + ' to ' + end + ' (' + days + ' days)';
        }
      }
    } else {
      desc = 'Unknown';
    }
    if (times && times.length > 0) {
      desc += ' \u00b7 ' + times.map(t => t.label + ' (' + formatHour(t.from) + '\u2013' + formatHour(t.to) + ')').join(', ');
    }
    return desc;
  }

  function getAccentForIndex(index) {
    return ACCENT_CLASSES[index % ACCENT_CLASSES.length];
  }

  function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h < 12) return h + ' AM';
    if (h === 12) return '12 PM';
    return (h - 12) + ' PM';
  }

  function buildHourOptions(selected) {
    let html = '';
    for (let h = 0; h < 24; h++) {
      html += '<option value="' + h + '"' + (h === selected ? ' selected' : '') + '>' + formatHour(h) + '</option>';
    }
    return html;
  }

  function addSlotRow(label, from, to) {
    const row = document.createElement('div');
    row.className = 'time-slot-row';
    row.innerHTML =
      '<input type="text" placeholder="Label (e.g. Morning)" class="form-input slot-label" value="' + escapeHtml(label || '') + '">' +
      '<select class="form-input form-input-sm slot-from">' + buildHourOptions(from != null ? from : 7) + '</select>' +
      '<span class="slot-separator">to</span>' +
      '<select class="form-input form-input-sm slot-to">' + buildHourOptions(to != null ? to : 12) + '</select>' +
      '<button type="button" class="btn btn-danger slot-remove">&times;</button>';
    timeSlotsList.appendChild(row);
  }

  function clearSlots() {
    timeSlotsList.innerHTML = '';
  }

  function getOnceEndDate(task) {
    if (!task || !task.frequency || task.frequency.type !== 'once') {
      return '';
    }
    const freq = task.frequency;
    if (freq.dates && freq.dates.length) {
      // Last (max) occurrence drives the auto-archive window.
      return freq.dates.slice().sort()[freq.dates.length - 1];
    }
    return freq.endDate || freq.date || freq.startDate || '';
  }

  // Match MAX_CARRY_DAYS in app.js: once-tasks remain visible as Missed for up
  // to 14 days past their end date. Only after that window do they auto-archive.
  const ONCE_ARCHIVE_AFTER_DAYS = 14;

  function isArchivedOnceTask(task, todayKey) {
    const endDate = getOnceEndDate(task);
    if (!endDate || endDate >= todayKey) { return false; }
    const end = new Date(endDate + 'T00:00:00');
    const today = new Date(todayKey + 'T00:00:00');
    const daysSince = Math.round((today.getTime() - end.getTime()) / (24 * 60 * 60 * 1000));
    return daysSince > ONCE_ARCHIVE_AFTER_DAYS;
  }

  function isTaskArchived(task, todayKey) {
    return !!task.archived || isArchivedOnceTask(task, todayKey);
  }

  function renderTaskItem(task) {
    const archivedView = !!task.archived;
    const index = tasks.indexOf(task);
    const item = document.createElement('div');
    item.className = 'task-item' + (archivedView ? ' task-item-archived' : '');

    const accentClass = task.accentClass || getAccentForIndex(index);
    const colors = {
      'accent-pink': '#ff4f8a',
      'accent-blue': '#338df4',
      'accent-green': '#7ad730',
      'accent-cyan': '#1cbfcb',
      'accent-amber': '#ffbf21',
      'accent-purple': '#7d4fd7'
    };

    const toggleBtn = archivedView
      ? '<button type="button" class="btn btn-accent" data-action="unarchive" data-index="' + index + '">Unarchive</button>'
      : '<button type="button" class="btn btn-accent" data-action="archive" data-index="' + index + '">Archive</button>';

    item.innerHTML = `
      <div class="task-dot" style="background: ${colors[accentClass] || '#64748b'}"></div>
      <div class="task-info">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <p class="task-meta"><span class="task-category">${escapeHtml(normalizeCategory(task.category))}</span> ${describeFrequency(task.frequency, task.times)}</p>
      </div>
      <div class="task-actions">
        ${toggleBtn}
        <button type="button" class="btn btn-edit" data-action="edit" data-index="${index}">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete" data-index="${index}">Delete</button>
      </div>
    `;

    return item;
  }

  function renderTaskList() {
    taskList.innerHTML = '';

    const filtered = activeFilters.size === 0
      ? tasks
      : tasks.filter(task => activeFilters.has(normalizeCategory(task.category)));

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-empty';
      empty.textContent = tasks.length === 0 ? 'No tasks yet. Click "+ Add Task" to create one.' : 'No tasks match the selected filter.';
      taskList.appendChild(empty);
      return;
    }

    const todayKey = getTodayStr();
    const categories = [];
    const grouped = {};

    filtered.forEach(task => {
      const category = normalizeCategory(task.category);
      if (!grouped[category]) {
        grouped[category] = { active: [], archive: [] };
        categories.push(category);
      }
      if (isTaskArchived(task, todayKey)) {
        grouped[category].archive.push(task);
      } else {
        grouped[category].active.push(task);
      }
    });

    categories.forEach(category => {
      const section = document.createElement('section');
      section.className = 'task-category-section';

      const header = document.createElement('div');
      header.className = 'task-category-header';
      const totals = grouped[category].active.length + grouped[category].archive.length;
      header.innerHTML = '<h3>' + escapeHtml(category) + '</h3>' +
        '<span class="task-category-count">' + totals + ' task' + (totals === 1 ? '' : 's') + '</span>';
      section.appendChild(header);

      const activeWrap = document.createElement('div');
      activeWrap.className = 'task-category-list';
      if (grouped[category].active.length === 0) {
        const activeEmpty = document.createElement('div');
        activeEmpty.className = 'task-empty task-empty-inline';
        activeEmpty.textContent = 'No active tasks in this category.';
        activeWrap.appendChild(activeEmpty);
      } else {
        grouped[category].active.forEach(task => {
          activeWrap.appendChild(renderTaskItem(task));
        });
      }
      section.appendChild(activeWrap);

      if (grouped[category].archive.length > 0) {
        const archiveDetails = document.createElement('details');
        archiveDetails.className = 'task-archive-section';

        const summary = document.createElement('summary');
        summary.className = 'task-archive-summary';
        summary.innerHTML = '<span>Archive</span><span class="task-archive-count">' + grouped[category].archive.length + '</span>';
        archiveDetails.appendChild(summary);

        const archiveList = document.createElement('div');
        archiveList.className = 'task-category-list';
        grouped[category].archive.forEach(task => {
          const archiveItem = renderTaskItem(task);
          archiveItem.classList.add('task-item-archived');
          archiveList.appendChild(archiveItem);
        });
        archiveDetails.appendChild(archiveList);
        section.appendChild(archiveDetails);
      }

      taskList.appendChild(section);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateCategoryVisibility() {
    const isMorning = normalizeCategory(taskCategory.value) === MORNING_CATEGORY;
    freqSection.classList.toggle('hidden', isMorning);
    timesSection.classList.toggle('hidden', isMorning);
    if (isMorning) {
      weeklyPanel.classList.add('hidden');
      intervalPanel.classList.add('hidden');
      timesPanel.classList.add('hidden');
    }
    updateGoalTypeVisibility();
  }

  function getGoalType() {
    const checked = document.querySelector('input[name="goal-type"]:checked');
    return checked ? checked.value : 'simple';
  }

  function unitPluralFor(key) {
    const units = (window.TaskProgress && window.TaskProgress.UNITS) || [];
    for (let i = 0; i < units.length; i += 1) {
      if (units[i].key === key) { return units[i].plural; }
    }
    return '';
  }

  function populateUnitOptions() {
    if (!measureUnit || !window.TaskProgress) { return; }
    const units = window.TaskProgress.UNITS;
    let html = '';
    let lastGroup = null;
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (u.group !== lastGroup) {
        if (lastGroup !== null) { html += '</optgroup>'; }
        html += '<optgroup label="' + u.group + '">';
        lastGroup = u.group;
      }
      const label = u.key === 'custom' ? 'Custom\u2026' : u.plural;
      html += '<option value="' + u.key + '">' + label + '</option>';
    }
    if (lastGroup !== null) { html += '</optgroup>'; }
    measureUnit.innerHTML = html;
  }

  function updateMeasureCustomVisibility() {
    if (!measureUnit || !measureCustomField) { return; }
    measureCustomField.classList.toggle('hidden', measureUnit.value !== 'custom');
  }

  // Goal type governs whether the measurable panel shows, and enforces that a
  // measurable task never also uses multi-slot times.
  function updateGoalTypeVisibility() {
    const isMorning = normalizeCategory(taskCategory.value) === MORNING_CATEGORY;
    if (goalTypeSection) { goalTypeSection.classList.toggle('hidden', isMorning); }
    const measurable = !isMorning && getGoalType() === 'measurable';
    if (measurePanel) { measurePanel.classList.toggle('hidden', !measurable); }
    if (measurable) {
      if (timesSection) { timesSection.classList.add('hidden'); }
      timesPanel.classList.add('hidden');
      timesModeRadios.forEach(r => { r.checked = r.value === 'once'; });
    } else if (!isMorning) {
      if (timesSection) { timesSection.classList.remove('hidden'); }
    }
    updateMeasureCustomVisibility();
  }

  function showEditor(task) {
    editorSection.classList.remove('hidden');
    editorTitle.textContent = task ? 'Edit Task' : 'Add Task';

    taskNameInput.value = task ? task.title : '';
    taskCategory.value = task && task.category ? normalizeCategory(task.category) : WORK_CATEGORY;

    const freqType = task && task.frequency ? task.frequency.type : 'daily';
    freqRadios.forEach(r => { r.checked = r.value === freqType; });
    updateFreqPanels(freqType);

    if (freqType === 'weekly' && task && task.frequency.days) {
      document.querySelectorAll('input[name="day"]').forEach(cb => {
        cb.checked = task.frequency.days.indexOf(parseInt(cb.value)) !== -1;
      });
    } else {
      document.querySelectorAll('input[name="day"]').forEach(cb => { cb.checked = false; });
    }

    if (freqType === 'interval' && task && task.frequency) {
      document.getElementById('interval-weeks').value = task.frequency.every || 2;
      document.getElementById('interval-day').value = task.frequency.day || 0;
      document.getElementById('interval-start').value = task.frequency.startDate || getTodayStr();
    } else {
      document.getElementById('interval-weeks').value = 2;
      document.getElementById('interval-day').value = 0;
      document.getElementById('interval-start').value = getTodayStr();
    }

    onceDates = [];
    if (freqType === 'once' && task && task.frequency && task.frequency.dates && task.frequency.dates.length) {
      // Explicit-dates task: populate the Specific-dates mode.
      task.frequency.dates.forEach(addOnceDate);
      updateOnceMode('dates');
      const today = getTodayStr();
      onceStartDateInput.value = today;
      onceEndDateInput.value = today;
      onceDateInput.value = '';
    } else if (freqType === 'once' && task && task.frequency) {
      const onceStart = task.frequency.startDate || task.frequency.date || getTodayStr();
      const onceEnd = task.frequency.endDate || task.frequency.date || onceStart;
      onceStartDateInput.value = onceStart;
      onceEndDateInput.value = onceEnd;
      updateOnceMode('range');
      onceDateInput.value = '';
      renderOnceDates();
    } else {
      const today = getTodayStr();
      onceStartDateInput.value = today;
      onceEndDateInput.value = today;
      updateOnceMode('range');
      onceDateInput.value = '';
      renderOnceDates();
    }

    clearSlots();
    if (task && task.times && task.times.length > 0) {
      timesModeRadios.forEach(r => { r.checked = r.value === 'multiple'; });
      timesPanel.classList.remove('hidden');
      task.times.forEach(slot => addSlotRow(slot.label, slot.from, slot.to));
    } else {
      timesModeRadios.forEach(r => { r.checked = r.value === 'once'; });
      timesPanel.classList.add('hidden');
    }

    // Measurable goal config.
    const measure = task && task.measure;
    goalTypeRadios.forEach(r => { r.checked = r.value === (measure ? 'measurable' : 'simple'); });
    if (measure) {
      measureUnit.value = measure.unit || 'custom';
      if (!measureUnit.value) { measureUnit.value = 'custom'; }
      measureCustom.value = (measureUnit.value === 'custom') ? (measure.unitLabel || '') : '';
      measureTarget.value = measure.target || 8;
      measureStep.value = measure.step || 1;
    } else {
      measureUnit.value = 'glass';
      measureCustom.value = '';
      measureTarget.value = 8;
      measureStep.value = 1;
    }

    updateCategoryVisibility();
    selectedIcon = (task && task.icon) ? task.icon : DEFAULT_ICON;
    closeIconPicker();
    iconCategoryFilter = 'All';
    updateIconPreview();
    taskNameInput.focus();
  }

  function hideEditor() {
    editorSection.classList.add('hidden');
    editingId = null;
    taskForm.reset();
  }

  function updateFreqPanels(type) {
    weeklyPanel.classList.toggle('hidden', type !== 'weekly');
    intervalPanel.classList.toggle('hidden', type !== 'interval');
    oncePanel.classList.toggle('hidden', type !== 'once');
  }

  function getOnceMode() {
    const checked = document.querySelector('input[name="once-mode"]:checked');
    return checked ? checked.value : 'range';
  }

  function updateOnceMode(mode) {
    onceModeRadios.forEach(r => { r.checked = r.value === mode; });
    onceRangePanel.classList.toggle('hidden', mode !== 'range');
    onceDatesPanel.classList.toggle('hidden', mode !== 'dates');
  }

  // Short, locale-independent label for a YYYY-MM-DD key, e.g. "Sun, Jul 5, 2026".
  function formatOnceDate(key) {
    const d = parseDateKey(key);
    if (!d) { return key; }
    return DAY_SHORT[d.getDay()] + ', ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function parseDateKey(key) {
    if (!key || typeof key !== 'string') { return null; }
    const p = key.split('-');
    if (p.length < 3) { return null; }
    const y = parseInt(p[0], 10), m = parseInt(p[1], 10), day = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(day)) { return null; }
    return new Date(y, m - 1, day);
  }

  function addOnceDate(key) {
    if (!key || onceDates.indexOf(key) !== -1) { return; }
    onceDates.push(key);
    onceDates.sort();
    renderOnceDates();
  }

  function removeOnceDate(key) {
    const idx = onceDates.indexOf(key);
    if (idx !== -1) {
      onceDates.splice(idx, 1);
      renderOnceDates();
    }
  }

  function renderOnceDates() {
    onceDatesList.innerHTML = '';
    onceDates.forEach(key => {
      const li = document.createElement('li');
      li.className = 'once-date-chip';
      li.innerHTML = '<span class="once-date-label">' + escapeHtml(formatOnceDate(key)) + '</span>' +
        '<button type="button" class="once-date-remove" data-date="' + key + '" aria-label="Remove date">&times;</button>';
      onceDatesList.appendChild(li);
    });
    const n = onceDates.length;
    onceDatesCount.textContent = n === 0
      ? 'No dates added yet.'
      : n + (n === 1 ? ' date added.' : ' dates added.');
  }

  function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function collectFormData() {
    const title = taskNameInput.value.trim();
    if (!title) return null;

    const category = normalizeCategory(taskCategory.value);
    const result = { title, category };

    if (category === MORNING_CATEGORY) {
      return result;
    }

    const freqType = document.querySelector('input[name="freq-type"]:checked').value;
    const frequency = { type: freqType };

    if (freqType === 'weekly') {
      const checked = document.querySelectorAll('input[name="day"]:checked');
      frequency.days = Array.from(checked).map(cb => parseInt(cb.value)).sort();
      if (frequency.days.length === 0) {
        alert('Please select at least one day.');
        return null;
      }
    }

    if (freqType === 'interval') {
      frequency.every = parseInt(document.getElementById('interval-weeks').value) || 2;
      frequency.day = parseInt(document.getElementById('interval-day').value);
      frequency.startDate = document.getElementById('interval-start').value || getTodayStr();
    }

    if (freqType === 'once') {
      if (getOnceMode() === 'dates') {
        if (onceDates.length === 0) {
          alert('Please add at least one date.');
          return null;
        }
        frequency.dates = onceDates.slice().sort();
      } else {
        const start = onceStartDateInput.value || getTodayStr();
        let end = onceEndDateInput.value || start;
        if (end < start) {
          alert('End date cannot be before start date.');
          return null;
        }
        frequency.startDate = start;
        frequency.endDate = end;
      }
    }

    result.frequency = frequency;

    // Measurable config is mutually exclusive with multi-slot times.
    if (getGoalType() === 'measurable') {
      const target = parseInt(measureTarget.value, 10);
      const step = parseInt(measureStep.value, 10);
      if (!(target >= 1)) {
        alert('Please enter a target of at least 1.');
        return null;
      }
      const unitKey = measureUnit.value;
      let unitLabel;
      if (unitKey === 'custom') {
        unitLabel = (measureCustom.value || '').trim();
      } else {
        unitLabel = unitPluralFor(unitKey);
      }
      result.measure = {
        target: target,
        unit: unitKey,
        unitLabel: unitLabel,
        step: (step >= 1) ? step : 1
      };
      return result;
    }

    const timesMode = document.querySelector('input[name="times-mode"]:checked').value;
    if (timesMode === 'multiple') {
      const rows = document.querySelectorAll('.time-slot-row');
      const times = Array.from(rows).map(row => ({
        label: row.querySelector('.slot-label').value.trim(),
        from: parseInt(row.querySelector('.slot-from').value),
        to: parseInt(row.querySelector('.slot-to').value)
      })).filter(s => s.label.length > 0);
      if (times.length === 0) {
        alert('Please add at least one time slot with a label.');
        return null;
      }
      result.times = times;
    }

    return result;
  }

  function saveTask(data) {
    const todayKey = getTodayStr();
    if (editingId !== null) {
      const idx = tasks.findIndex(t => t.id === editingId);
      if (idx !== -1) {
        tasks[idx].title = data.title;
        tasks[idx].category = data.category;
        tasks[idx].icon = selectedIcon;
        if (data.category === MORNING_CATEGORY) {
          delete tasks[idx].frequency;
          delete tasks[idx].times;
          tasks[idx].archived = false;
          delete tasks[idx].manuallyArchived;
          delete tasks[idx].manuallyUnarchived;
        } else {
          tasks[idx].frequency = data.frequency;
          if (data.times) {
            tasks[idx].times = data.times;
          } else {
            delete tasks[idx].times;
          }
          if (data.measure) {
            tasks[idx].measure = data.measure;
            delete tasks[idx].times;
          } else {
            delete tasks[idx].measure;
          }
          if (data.frequency && data.frequency.type === 'once') {
            // Editing dates clears stale manual intent so the new dates
            // drive the 14-day auto-archive again.
            delete tasks[idx].manuallyArchived;
            delete tasks[idx].manuallyUnarchived;
            tasks[idx].archived = isArchivedOnceTask(tasks[idx], todayKey);
          } else {
            delete tasks[idx].manuallyUnarchived;
          }
        }
      }
    } else {
      const id = slugify(data.title) || ('task-' + Date.now());
      const existing = tasks.find(t => t.id === id);
      if (existing) {
        alert('A task with a similar name already exists. Please use a different name.');
        return false;
      }
      const newTask = {
        id,
        title: data.title,
        category: data.category,
        accentClass: getAccentForIndex(tasks.length),
        icon: selectedIcon,
        archived: false,
        // Effective scheduling start: a task is never scheduled/missed before
        // the day it was created (see isTaskForDate in app.js / dashboard).
        startDate: todayKey
      };
      if (data.category !== MORNING_CATEGORY) {
        newTask.frequency = data.frequency;
        if (data.times) {
          newTask.times = data.times;
        }
        if (data.measure) {
          newTask.measure = data.measure;
        }
        if (data.frequency && data.frequency.type === 'once') {
          newTask.archived = isArchivedOnceTask(newTask, todayKey);
        }
      }
      tasks.push(newTask);
    }

    saveDraft();
    renderTaskList();
    return true;
  }

  function deleteTask(index) {
    if (!confirm('Delete "' + tasks[index].title + '"?')) return;
    tasks.splice(index, 1);
    saveDraft();
    renderTaskList();
  }

  function archiveTask(index) {
    tasks[index].archived = true;
    tasks[index].manuallyArchived = true;
    // Effective scheduling end: marks when the task stopped being active so
    // dashboard analytics bound its window and don't count later days as misses.
    tasks[index].archivedAt = getTodayStr();
    // Clear opposite intent so flags stay coherent.
    delete tasks[index].manuallyUnarchived;
    saveDraft();
    renderTaskList();
  }

  function unarchiveTask(index) {
    tasks[index].archived = false;
    delete tasks[index].manuallyArchived;
    // Drop the end boundary so a later re-archive re-stamps a fresh date.
    delete tasks[index].archivedAt;
    // For once-tasks, remember the user explicitly unarchived so the
    // 14-day auto-archive in loadTasks does not re-archive on next load.
    if (tasks[index].frequency && tasks[index].frequency.type === 'once') {
      tasks[index].manuallyUnarchived = true;
    }
    saveDraft();
    renderTaskList();
  }

  function escapeJsString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  // Event listeners
  addTaskBtn.addEventListener('click', () => {
    editingId = null;
    showEditor(null);
  });

  filterBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    const filter = normalizeCategory(chip.dataset.filter);
    const allChip = filterBar.querySelector('.filter-chip[data-filter="all"]');

    if (chip.dataset.filter === 'all') {
      activeFilters.clear();
      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      allChip.classList.add('active');
    } else {
      if (activeFilters.has(filter)) {
        activeFilters.delete(filter);
        chip.classList.remove('active');
      } else {
        activeFilters.add(filter);
        chip.classList.add('active');
      }
      if (activeFilters.size === 0) {
        allChip.classList.add('active');
      } else {
        allChip.classList.remove('active');
      }
    }
    renderTaskList();
  });

  cancelBtn.addEventListener('click', hideEditor);

  taskCategory.addEventListener('change', updateCategoryVisibility);
  goalTypeRadios.forEach(r => { r.addEventListener('change', updateGoalTypeVisibility); });
  if (measureUnit) { measureUnit.addEventListener('change', updateMeasureCustomVisibility); }
  populateUnitOptions();

  freqRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateFreqPanels(radio.value);
    });
  });

  onceModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateOnceMode(radio.value);
    });
  });

  onceAddDateBtn.addEventListener('click', () => {
    const key = onceDateInput.value;
    if (!key) {
      alert('Please pick a date to add.');
      return;
    }
    addOnceDate(key);
    onceDateInput.value = '';
  });

  onceDatesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.once-date-remove');
    if (btn) {
      removeOnceDate(btn.getAttribute('data-date'));
    }
  });

  timesModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      timesPanel.classList.toggle('hidden', radio.value !== 'multiple');
      if (radio.value === 'multiple' && timeSlotsList.children.length === 0) {
        addSlotRow('', 7, 12);
      }
    });
  });

  addSlotBtn.addEventListener('click', () => {
    addSlotRow('', 7, 12);
  });

  timeSlotsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('slot-remove')) {
      e.target.closest('.time-slot-row').remove();
    }
  });

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = collectFormData();
    if (!data) return;
    if (saveTask(data)) {
      hideEditor();
    }
  });

  taskList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index);

    if (action === 'edit') {
      editingId = tasks[index].id;
      showEditor(tasks[index]);
    } else if (action === 'archive') {
      archiveTask(index);
    } else if (action === 'unarchive') {
      unarchiveTask(index);
    } else if (action === 'delete') {
      deleteTask(index);
    }
  });

  // (legacy export buttons removed; cloud autosave replaces them)

  openIconPickerBtn.addEventListener('click', () => {
    if (iconPickerOpen) closeIconPicker();
    else openIconPicker();
  });

  iconSearchInput.addEventListener('input', () => {
    renderIconGrid(iconSearchInput.value.trim().toLowerCase());
  });

  // ── Auth gate + bootstrap ──────────────────────────────────────────────
  function applyAuthState() {
    const user = window.Auth && window.Auth.currentUser();
    if (user) {
      if (authWall) { authWall.classList.add('hidden'); }
      if (todoRoot) { todoRoot.classList.remove('hidden'); }
      loadTasks();
      renderTaskList();
    } else {
      if (authWall) { authWall.classList.remove('hidden'); }
      if (todoRoot) { todoRoot.classList.add('hidden'); }
    }
  }

  if (window.AuthUI) {
    window.AuthUI.mountChip(document.getElementById('todo-chip-slot'));
  }
  if (authWallLoginBtn) {
    authWallLoginBtn.onclick = function () {
      window.AuthUI.openLogin({ requireLogin: true });
    };
  }
  if (window.Auth) {
    window.Auth.onChange(function () {
      document.body.setAttribute('data-auth-mode',
        (window.Storage && window.Storage.mode) || 'loading');
      applyAuthState();
    });
  }
  if (window.Storage) {
    window.Storage.onChange(function (s) {
      document.body.setAttribute('data-auth-mode', s.mode || 'loading');
      // Tasks may have just finished loading from the cloud; refresh the UI.
      if (window.Auth && window.Auth.currentUser()) {
        loadTasks();
        renderTaskList();
      }
    });
    window.Storage.init();
  }
  applyAuthState();
})();
