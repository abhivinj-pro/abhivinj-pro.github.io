/*
 * settings.js — Settings page controller (settings.html).
 *
 * Two sections, both for signed-in users only:
 *   1. Screen timings — the Morning routine window (start/end) that drives the
 *      Clock -> Morning -> My Day auto-switch in app.js. Persisted per account
 *      via Storage.saveSettings.
 *   2. Backup & restore — full export / import of tasks + completion history
 *      via Storage.exportAll / Storage.importAll.
 *
 * ES5 / older-Safari safe: no arrow functions, template literals or fetch.
 */
(function () {
  var DEFAULTS = { morningStart: '07:00', morningEnd: '10:00', mydayEnd: '23:59' };

  var authWall = document.getElementById('auth-wall');
  var settingsRoot = document.getElementById('settings-root');
  var authWallLoginBtn = document.getElementById('auth-wall-login');

  var timingsForm = document.getElementById('timings-form');
  var morningStartInput = document.getElementById('morning-start');
  var morningEndInput = document.getElementById('morning-end');
  var mydayEndInput = document.getElementById('myday-end');
  var windowPreview = document.getElementById('settings-window-preview');
  var timingsStatus = document.getElementById('timings-status');
  var timingsResetBtn = document.getElementById('timings-reset-btn');

  var backupExportBtn = document.getElementById('backup-export-btn');
  var backupImportBtn = document.getElementById('backup-import-btn');
  var backupFileInput = document.getElementById('backup-file-input');
  var backupStatus = document.getElementById('backup-status');
  var backupModal = document.getElementById('backup-modal');
  var backupModalFile = document.getElementById('backup-modal-file');
  var backupModalStatus = document.getElementById('backup-modal-status');
  var backupCancelBtn = document.getElementById('backup-cancel-btn');
  var backupConfirmBtn = document.getElementById('backup-confirm-btn');

  var pendingBackup = null;
  var timingsLoaded = false; // load form values once; don't clobber edits on poll

  // ── Small helpers ─────────────────────────────────────────────────────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isValidTime(str) {
    return typeof str === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
  }

  // "07:00" -> "7:00 AM"
  function formatTime(hhmm) {
    if (!isValidTime(hhmm)) { return hhmm; }
    var parts = hhmm.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) { h12 = 12; }
    return h12 + ':' + m + ' ' + suffix;
  }

  function setStatus(node, text, isError) {
    if (!node) { return; }
    if (!text) {
      node.classList.add('hidden');
      node.textContent = '';
      return;
    }
    node.textContent = text;
    node.classList.toggle('settings-status-error', !!isError);
    node.classList.remove('hidden');
  }

  // ── Timings ───────────────────────────────────────────────────────────────
  function currentSettings() {
    return (window.Storage && window.Storage.settings) || DEFAULTS;
  }

  function loadTimingsIntoForm() {
    var s = currentSettings();
    morningStartInput.value = isValidTime(s.morningStart) ? s.morningStart : DEFAULTS.morningStart;
    morningEndInput.value = isValidTime(s.morningEnd) ? s.morningEnd : DEFAULTS.morningEnd;
    mydayEndInput.value = isValidTime(s.mydayEnd) ? s.mydayEnd : DEFAULTS.mydayEnd;
    timingsLoaded = true;
    renderWindowPreview();
  }

  function renderWindowPreview() {
    if (!windowPreview) { return; }
    var start = morningStartInput.value;
    var end = morningEndInput.value;
    var mydayEnd = mydayEndInput.value;
    var fmt = function (v) { return isValidTime(v) ? formatTime(v) : '—'; };
    var rows = [
      ['Clock', '12:00 AM – ' + fmt(start)],
      ['Morning', fmt(start) + ' – ' + fmt(end)],
      ['My Day', fmt(end) + ' – ' + fmt(mydayEnd)],
      ['Clock', fmt(mydayEnd) + ' – 11:59 PM']
    ];
    while (windowPreview.firstChild) { windowPreview.removeChild(windowPreview.firstChild); }
    for (var i = 0; i < rows.length; i += 1) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'settings-window-name';
      name.textContent = rows[i][0];
      var range = document.createElement('span');
      range.className = 'settings-window-range';
      range.textContent = rows[i][1];
      li.appendChild(name);
      li.appendChild(range);
      windowPreview.appendChild(li);
    }
  }

  function saveTimings() {
    if (!window.Storage) { return; }
    if (window.Storage.mode === 'demo') {
      setStatus(timingsStatus, 'Log in to save timings.', true);
      return;
    }
    var start = morningStartInput.value;
    var end = morningEndInput.value;
    var mydayEnd = mydayEndInput.value;
    if (!isValidTime(start) || !isValidTime(end) || !isValidTime(mydayEnd)) {
      setStatus(timingsStatus, 'Please enter valid times.', true);
      return;
    }
    if (end <= start) {
      setStatus(timingsStatus, 'Morning must end after it starts.', true);
      return;
    }
    if (mydayEnd <= end) {
      setStatus(timingsStatus, 'My Day must end after Morning ends.', true);
      return;
    }
    setStatus(timingsStatus, 'Saving…', false);
    window.Storage.saveSettings({ morningStart: start, morningEnd: end, mydayEnd: mydayEnd }).then(function () {
      setStatus(timingsStatus, 'Timings saved ✓', false);
    })['catch'](function (err) {
      setStatus(timingsStatus, (err && err.message) || 'Save failed', true);
      if (window.console) { console.error('saveSettings failed', err); }
    });
  }

  function resetTimings() {
    morningStartInput.value = DEFAULTS.morningStart;
    morningEndInput.value = DEFAULTS.morningEnd;
    mydayEndInput.value = DEFAULTS.mydayEnd;
    renderWindowPreview();
    setStatus(timingsStatus, 'Defaults restored — press Save to apply.', false);
  }

  // ── Backup: export ────────────────────────────────────────────────────────
  function backupFilename() {
    var d = new Date();
    return 'habit-board-backup-' + d.getFullYear() +
      pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
  }

  function doExport() {
    if (!window.Storage) { return; }
    if (window.Storage.mode === 'demo') {
      setStatus(backupStatus, 'Log in to export.', true);
      return;
    }
    setStatus(backupStatus, 'Preparing backup…', false);
    window.Storage.exportAll().then(function (data) {
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setStatus(backupStatus, 'Backup downloaded ✓', false);
    })['catch'](function (err) {
      setStatus(backupStatus, 'Export failed', true);
      if (window.console) { console.error('exportAll failed', err); }
    });
  }

  // ── Backup: import ────────────────────────────────────────────────────────
  function selectedBackupMode() {
    var checked = document.querySelector('input[name="backup-mode"]:checked');
    return checked ? checked.value : 'merge';
  }

  function openBackupModal(data, fileName) {
    pendingBackup = data;
    if (backupModalFile) { backupModalFile.textContent = fileName || 'Selected backup'; }
    if (backupModalStatus) {
      backupModalStatus.classList.add('hidden');
      backupModalStatus.textContent = '';
    }
    if (backupConfirmBtn) { backupConfirmBtn.disabled = false; }
    if (backupModal) { backupModal.classList.remove('hidden'); }
  }

  function closeBackupModal() {
    pendingBackup = null;
    if (backupModal) { backupModal.classList.add('hidden'); }
    if (backupFileInput) { backupFileInput.value = ''; }
  }

  function handleBackupFile(file) {
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        setStatus(backupStatus, 'Invalid backup file.', true);
        return;
      }
      if (!parsed ||
          Object.prototype.toString.call(parsed.tasks) !== '[object Array]' ||
          !parsed.days || typeof parsed.days !== 'object') {
        setStatus(backupStatus, 'Not a Habit Board backup.', true);
        return;
      }
      openBackupModal(parsed, file.name);
    };
    reader.onerror = function () { setStatus(backupStatus, 'Could not read file.', true); };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingBackup || !window.Storage) { return; }
    var mode = selectedBackupMode();
    if (backupConfirmBtn) { backupConfirmBtn.disabled = true; }
    if (backupModalStatus) {
      backupModalStatus.classList.remove('hidden');
      backupModalStatus.textContent = 'Importing…';
    }
    window.Storage.importAll(pendingBackup, mode).then(function (summary) {
      closeBackupModal();
      setStatus(backupStatus, 'Imported ' + summary.tasks + ' tasks ✓', false);
    })['catch'](function (err) {
      if (backupModalStatus) {
        backupModalStatus.textContent = (err && err.message) || 'Import failed';
      }
      if (backupConfirmBtn) { backupConfirmBtn.disabled = false; }
      if (window.console) { console.error('importAll failed', err); }
    });
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  if (timingsForm) {
    timingsForm.onsubmit = function (e) { e.preventDefault(); saveTimings(); };
  }
  if (timingsResetBtn) { timingsResetBtn.onclick = resetTimings; }
  if (morningStartInput) { morningStartInput.onchange = renderWindowPreview; }
  if (morningEndInput) { morningEndInput.onchange = renderWindowPreview; }
  if (mydayEndInput) { mydayEndInput.onchange = renderWindowPreview; }

  if (backupExportBtn) { backupExportBtn.onclick = doExport; }
  if (backupImportBtn) {
    backupImportBtn.onclick = function () {
      if (window.Storage && window.Storage.mode === 'demo') {
        setStatus(backupStatus, 'Log in to import.', true);
        return;
      }
      if (backupFileInput) { backupFileInput.click(); }
    };
  }
  if (backupFileInput) {
    backupFileInput.onchange = function () {
      handleBackupFile(backupFileInput.files && backupFileInput.files[0]);
    };
  }
  if (backupCancelBtn) { backupCancelBtn.onclick = closeBackupModal; }
  if (backupModal) {
    backupModal.addEventListener('click', function (e) {
      if (e.target === backupModal) { closeBackupModal(); }
    });
  }
  if (backupConfirmBtn) { backupConfirmBtn.onclick = confirmImport; }

  // ── Auth gate + bootstrap ─────────────────────────────────────────────────
  function applyAuthState() {
    var user = window.Auth && window.Auth.currentUser();
    if (user) {
      if (authWall) { authWall.classList.add('hidden'); }
      if (settingsRoot) { settingsRoot.classList.remove('hidden'); }
      if (!timingsLoaded) { loadTimingsIntoForm(); }
    } else {
      timingsLoaded = false;
      if (authWall) { authWall.classList.remove('hidden'); }
      if (settingsRoot) { settingsRoot.classList.add('hidden'); }
    }
  }

  if (window.AuthUI) {
    window.AuthUI.mountChip(document.getElementById('settings-chip-slot'));
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
      if (window.Auth && window.Auth.currentUser() && !timingsLoaded) {
        loadTimingsIntoForm();
      }
    });
    window.Storage.init();
  }
  applyAuthState();
}());
