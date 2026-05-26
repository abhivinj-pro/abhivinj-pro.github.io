(function () {
  const ACCENT_CLASSES = ['accent-pink', 'accent-blue', 'accent-green', 'accent-cyan', 'accent-amber', 'accent-purple'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MORNING_CATEGORY = 'Morning Routine';
  const WORK_CATEGORY = 'Work';
  const LEGACY_GENERAL_CATEGORY = 'General';

  const DEFAULT_ICON = (window.ICON_LIBRARY && window.ICON_LIBRARY.length)
    ? window.ICON_LIBRARY[0].svg
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  let tasks = [];
  let editingId = null;
  let activeFilters = new Set();
  let selectedIcon = DEFAULT_ICON;
  let iconPickerOpen = false;
  let iconCategoryFilter = 'All';

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
  const onceDateInput = document.getElementById('once-date');
  const timesPanel = document.getElementById('times-panel');
  const timeSlotsList = document.getElementById('time-slots-list');
  const addSlotBtn = document.getElementById('add-slot-btn');
  const freqRadios = document.querySelectorAll('input[name="freq-type"]');
  const timesModeRadios = document.querySelectorAll('input[name="times-mode"]');
  const taskCategory = document.getElementById('task-category');
  const freqSection = document.getElementById('freq-section');
  const timesSection = document.getElementById('times-section');
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
    if (!category || category === LEGACY_GENERAL_CATEGORY) {
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
      tasks.forEach(task => {
        task.category = normalizeCategory(task.category);
      });
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
      desc = freq.date ? ('One-time on ' + freq.date) : 'One-time (no date)';
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

    filtered.forEach((task, filteredIndex) => {
      const index = tasks.indexOf(task);
      const item = document.createElement('div');
      item.className = 'task-item';

      const accentClass = task.accentClass || getAccentForIndex(index);
      const colors = {
        'accent-pink': '#ff4f8a',
        'accent-blue': '#338df4',
        'accent-green': '#7ad730',
        'accent-cyan': '#1cbfcb',
        'accent-amber': '#ffbf21',
        'accent-purple': '#7d4fd7'
      };

      item.innerHTML = `
        <div class="task-dot" style="background: ${colors[accentClass] || '#64748b'}"></div>
        <div class="task-info">
          <p class="task-title">${escapeHtml(task.title)}</p>
          <p class="task-meta"><span class="task-category">${escapeHtml(normalizeCategory(task.category))}</span> ${describeFrequency(task.frequency, task.times)}</p>
        </div>
        <button type="button" class="btn btn-edit" data-action="edit" data-index="${index}">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete" data-index="${index}">Delete</button>
      `;

      taskList.appendChild(item);
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

    if (freqType === 'once' && task && task.frequency) {
      onceDateInput.value = task.frequency.date || getTodayStr();
    } else {
      onceDateInput.value = getTodayStr();
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
      frequency.date = onceDateInput.value || getTodayStr();
    }

    result.frequency = frequency;

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
    if (editingId !== null) {
      const idx = tasks.findIndex(t => t.id === editingId);
      if (idx !== -1) {
        tasks[idx].title = data.title;
        tasks[idx].category = data.category;
        tasks[idx].icon = selectedIcon;
        if (data.category === MORNING_CATEGORY) {
          delete tasks[idx].frequency;
          delete tasks[idx].times;
        } else {
          tasks[idx].frequency = data.frequency;
          if (data.times) {
            tasks[idx].times = data.times;
          } else {
            delete tasks[idx].times;
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
        icon: selectedIcon
      };
      if (data.category !== MORNING_CATEGORY) {
        newTask.frequency = data.frequency;
        if (data.times) {
          newTask.times = data.times;
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

  freqRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateFreqPanels(radio.value);
    });
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
