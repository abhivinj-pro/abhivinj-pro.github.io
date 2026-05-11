(function () {
  const ACCENT_CLASSES = ['accent-pink', 'accent-blue', 'accent-green', 'accent-cyan', 'accent-amber', 'accent-purple'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const DEFAULT_ICON = '<svg viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="taskGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient></defs><circle cx="70" cy="70" r="44" fill="none" stroke="url(#taskGrad)" stroke-width="8"/><path fill="url(#taskGrad)" d="M62 88l-20-20 8-8 12 12 28-28 8 8z"/></svg>';

  let tasks = [];
  let editingId = null;

  const taskList = document.getElementById('task-list');
  const editorSection = document.getElementById('editor-section');
  const editorTitle = document.getElementById('editor-title');
  const taskForm = document.getElementById('task-form');
  const taskNameInput = document.getElementById('task-name');
  const addTaskBtn = document.getElementById('add-task-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const exportBtn = document.getElementById('export-btn');
  const copyBtn = document.getElementById('copy-btn');
  const exportOutput = document.getElementById('export-output');
  const weeklyPanel = document.getElementById('weekly-panel');
  const intervalPanel = document.getElementById('interval-panel');
  const timesPanel = document.getElementById('times-panel');
  const timeSlotsList = document.getElementById('time-slots-list');
  const addSlotBtn = document.getElementById('add-slot-btn');
  const freqRadios = document.querySelectorAll('input[name="freq-type"]');
  const timesModeRadios = document.querySelectorAll('input[name="times-mode"]');

  function loadTasks() {
    if (window.MYDAY_TASKS && Array.isArray(window.MYDAY_TASKS)) {
      tasks = JSON.parse(JSON.stringify(window.MYDAY_TASKS));
    }
    const draft = localStorage.getItem('todo-editor-tasks');
    if (draft) {
      try {
        tasks = JSON.parse(draft);
      } catch (e) { /* use config */ }
    }
  }

  function saveDraft() {
    localStorage.setItem('todo-editor-tasks', JSON.stringify(tasks));
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

    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-empty';
      empty.textContent = 'No tasks yet. Click "+ Add Task" to create one.';
      taskList.appendChild(empty);
      return;
    }

    tasks.forEach((task, index) => {
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
          <p class="task-freq">${describeFrequency(task.frequency, task.times)}</p>
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

  function showEditor(task) {
    editorSection.classList.remove('hidden');
    editorTitle.textContent = task ? 'Edit Task' : 'Add Task';

    taskNameInput.value = task ? task.title : '';

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

    clearSlots();
    if (task && task.times && task.times.length > 0) {
      timesModeRadios.forEach(r => { r.checked = r.value === 'multiple'; });
      timesPanel.classList.remove('hidden');
      task.times.forEach(slot => addSlotRow(slot.label, slot.from, slot.to));
    } else {
      timesModeRadios.forEach(r => { r.checked = r.value === 'once'; });
      timesPanel.classList.add('hidden');
    }

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
  }

  function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function collectFormData() {
    const title = taskNameInput.value.trim();
    if (!title) return null;

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

    const result = { title, frequency };

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
        tasks[idx].frequency = data.frequency;
        if (data.times) {
          tasks[idx].times = data.times;
        } else {
          delete tasks[idx].times;
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
        accentClass: getAccentForIndex(tasks.length),
        icon: DEFAULT_ICON,
        frequency: data.frequency
      };
      if (data.times) {
        newTask.times = data.times;
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

  function generateConfig() {
    let lines = ['window.MYDAY_TASKS = ['];

    tasks.forEach((task, i) => {
      lines.push('  {');
      lines.push("    id: '" + escapeJsString(task.id) + "',");
      lines.push("    title: '" + escapeJsString(task.title) + "',");
      lines.push("    accentClass: '" + (task.accentClass || getAccentForIndex(i)) + "',");
      lines.push("    icon: '" + escapeJsString(task.icon || DEFAULT_ICON) + "',");

      const freq = task.frequency;
      if (!freq || freq.type === 'daily') {
        lines.push("    frequency: { type: 'daily' }" + (task.times && task.times.length > 0 ? ',' : ''));
      } else if (freq.type === 'weekly') {
        lines.push("    frequency: { type: 'weekly', days: [" + freq.days.join(', ') + '] }' + (task.times && task.times.length > 0 ? ',' : ''));
      } else if (freq.type === 'interval') {
        lines.push("    frequency: { type: 'interval', day: " + freq.day + ", every: " + freq.every + ", startDate: '" + freq.startDate + "' }" + (task.times && task.times.length > 0 ? ',' : ''));
      }

      if (task.times && task.times.length > 0) {
        lines.push('    times: [');
        task.times.forEach((slot, si) => {
          lines.push("      { label: '" + escapeJsString(slot.label) + "', from: " + slot.from + ', to: ' + slot.to + ' }' + (si < task.times.length - 1 ? ',' : ''));
        });
        lines.push('    ]');
      }

      lines.push('  }' + (i < tasks.length - 1 ? ',' : ''));
    });

    lines.push('];');
    return lines.join('\n');
  }

  // Event listeners
  addTaskBtn.addEventListener('click', () => {
    editingId = null;
    showEditor(null);
  });

  cancelBtn.addEventListener('click', hideEditor);

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

  exportBtn.addEventListener('click', () => {
    const config = generateConfig();
    exportOutput.value = config;
    exportOutput.classList.remove('hidden');
    copyBtn.classList.remove('hidden');
  });

  copyBtn.addEventListener('click', () => {
    exportOutput.select();
    navigator.clipboard.writeText(exportOutput.value).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
    }).catch(() => {
      document.execCommand('copy');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
    });
  });

  // Initialize
  loadTasks();
  renderTaskList();
})();
