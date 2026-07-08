/*
 * storage.js — unified storage layer.
 *
 * Picks one of three backends based on auth state and exposes the same
 * synchronous-read / async-write API to app.js and todo.js:
 *
 *   Storage.init()                          -> Promise<void>
 *   Storage.mode                            -> 'demo' | 'cloud' | 'pro-fallback' | 'loading'
 *   Storage.tasks                           -> Array  (current list, sync read)
 *   Storage.saveTasks(tasks)                -> Promise<void>
 *   Storage.readDayState(prefix, dateKey)   -> object  (sync, from cache)
 *   Storage.writeDayState(prefix, dateKey, state)
 *                                           -> void   (sync cache update,
 *                                                      fire-and-forget cloud)
 *   Storage.onChange(cb)                    -> unsubscribe
 *
 * The two storage prefixes from app.js are preserved as logical channel names
 * ('habit-board-state-' for Morning, 'myday-state-' for My Day) but inside a
 * day document they map to the keys `morning` and `myday` respectively, so
 * one Firestore document per date holds both channels.
 *
 * Day-state writes are debounced per (prefix, dateKey) pair to avoid spamming
 * Firestore when a user taps multiple cards in quick succession.
 */
(function () {
  var MORNING_PREFIX = 'habit-board-state-';
  var MYDAY_PREFIX = 'myday-state-';
  var CHANNEL_FOR_PREFIX = {};
  CHANNEL_FOR_PREFIX[MORNING_PREFIX] = 'morning';
  CHANNEL_FOR_PREFIX[MYDAY_PREFIX] = 'myday';

  var DAYS_TO_PRELOAD = 15;            // today + 14 prior for carry-forward
  var WRITE_DEBOUNCE_MS = 700;
  var POLL_INTERVAL_MS = 60 * 1000;    // background refetch cadence

  var listeners = [];
  var dayCache = {};                   // key: prefix+dateKey -> state object
  var loadedDays = {};                 // dateKey -> true once fetched (even empty)
  var dayWriteTimers = {};             // key: dateKey -> { timer, channels: {} }
  var pollTimer = null;
  var tasksSaveInFlight = false;

  var state = {
    mode: 'loading',
    user: null,
    tasks: [],
    isPro: false
  };

  // ── Tiny utility helpers ──────────────────────────────────────────────────
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emit() {
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](state); } catch (e) {}
    }
  }

  function isProEmail(email) {
    if (!email) { return false; }
    var list = window.PRO_EMAILS || [];
    var lower = String(email).toLowerCase();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i]).toLowerCase() === lower) { return true; }
    }
    return false;
  }

  function todayLogicalDateKey() {
    var now = new Date();
    return formatDateKey(now);
  }

  function formatDateKey(date) {
    var m = String(date.getMonth() + 1);
    var d = String(date.getDate());
    if (m.length < 2) { m = '0' + m; }
    if (d.length < 2) { d = '0' + d; }
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function preloadDateKeys() {
    var keys = [];
    var base = new Date();
    for (var i = 0; i < DAYS_TO_PRELOAD; i += 1) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      keys.push(formatDateKey(d));
    }
    return keys;
  }

  function cacheKey(prefix, dateKey) { return prefix + dateKey; }

  // ── Local mirror (offline fallback for Pro accounts) ──────────────────────
  function localTasksKey(uid) { return 'hb-tasks-cache-v1:' + uid; }
  function localDayKey(uid, dateKey) { return 'hb-day-cache-v1:' + uid + ':' + dateKey; }

  function readLocalJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeLocalJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ── Demo backend ──────────────────────────────────────────────────────────
  function createDemoTask(id, title, accentClass, category, icon) {
    return {
      id: id,
      title: title,
      category: category || 'Self Care',
      accentClass: accentClass,
      icon: icon,
      frequency: { type: 'daily' }
    };
  }

  function sampleDemoTasks() {
    return [
      createDemoTask(
        'demo-reading',
        'Reading',
        'accent-blue',
        'Self Care',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M6.5 3C8 3 9 4 9 5.5V21"/><path d="M9 6h8"/><path d="M9 10h8"/></svg>'
      ),
      createDemoTask(
        'demo-journaling',
        'Journaling',
        'accent-pink',
        'Self Care',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2z"/><path d="M6 3a2 2 0 0 0-2 2v16"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="m14.5 15.5 3-3 2 2-3 3-2.5.5z"/></svg>'
      ),
      createDemoTask(
        'demo-skin-care',
        'Skin Care',
        'accent-green',
        'Self Care',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3h4"/><path d="M9 6h6"/><rect x="7" y="6" width="10" height="15" rx="2"/><path d="M10 11h4"/><path d="M12 14v3"/></svg>'
      ),
      createDemoTask(
        'demo-water-plants',
        'Water Plants',
        'accent-cyan',
        'Chores',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V11"/><path d="M12 11C12 7 8 4 4 5.5 4 9 7 11.5 12 11"/><path d="M12 11c0-4 4-7 8-5.5 0 3.5-3 6-8 5.5"/><path d="M9 21h6"/></svg>'
      ),
      createDemoTask(
        'demo-meditation',
        'Meditation',
        'accent-purple',
        'Self Care',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M8.5 11a3.5 3.5 0 0 1 7 0"/><path d="M7 14c1.5 0 2.5-1 3-2"/><path d="M17 14c-1.5 0-2.5-1-3-2"/><path d="M5 19c1.5-2 3.5-3 7-3s5.5 1 7 3"/></svg>'
      ),
      createDemoTask(
        'demo-exercise',
        'Exercise',
        'accent-amber',
        'Self Care',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 8.5h2v7h-2z"/><path d="M15.5 8.5h2v7h-2z"/><rect x="3" y="10" width="3.5" height="4" rx="1"/><rect x="17.5" y="10" width="3.5" height="4" rx="1"/><path d="M8.5 12h7"/></svg>'
      )
    ];
  }

  // ── Cloud loaders ─────────────────────────────────────────────────────────
  function loadCloudTasks(uid) {
    return window.Firestore.getDoc('users/' + uid + '/config/tasks')
      .then(function (doc) {
        if (doc && doc.tasks && Object.prototype.toString.call(doc.tasks) === '[object Array]') {
          return doc.tasks;
        }
        return [];
      });
  }

  // Bulk-load every day document whose id (a YYYY-MM-DD key) is >= minKey via
  // a single structured query. Missing days are simply absent from the result
  // instead of producing a 404 per day, so this both eliminates console noise
  // and collapses N requests into one. Returns the array of loaded day rows.
  function loadDaysFrom(uid, minKey) {
    var query = {
      from: [{ collectionId: 'days' }],
      where: {
        fieldFilter: {
          field: { fieldPath: '__name__' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: {
            referenceValue: window.Firestore.resourceName(
              'users/' + uid + '/days/' + minKey
            )
          }
        }
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
    };
    return window.Firestore.runQuery('users/' + uid, query)
      .then(function (rows) {
        for (var i = 0; i < rows.length; i += 1) {
          var dk = rows[i].id;
          var data = rows[i].data || {};
          dayCache[cacheKey(MORNING_PREFIX, dk)] = data.morning || {};
          dayCache[cacheKey(MYDAY_PREFIX, dk)] = data.myday || {};
          loadedDays[dk] = true;
        }
        return rows;
      });
  }

  // Load a single day via an equality query rather than a document GET, so an
  // empty day resolves to "no data" without a 404.
  function loadOneDay(uid, dateKey) {
    var query = {
      from: [{ collectionId: 'days' }],
      where: {
        fieldFilter: {
          field: { fieldPath: '__name__' },
          op: 'EQUAL',
          value: {
            referenceValue: window.Firestore.resourceName(
              'users/' + uid + '/days/' + dateKey
            )
          }
        }
      }
    };
    return window.Firestore.runQuery('users/' + uid, query)
      .then(function (rows) {
        var data = rows.length ? (rows[0].data || {}) : {};
        dayCache[cacheKey(MORNING_PREFIX, dateKey)] = data.morning || {};
        dayCache[cacheKey(MYDAY_PREFIX, dateKey)] = data.myday || {};
        loadedDays[dateKey] = true;
      });
  }

  function loadAllDays(uid) {
    var keys = preloadDateKeys();           // today + past 14
    var minKey = keys[keys.length - 1];     // oldest key in the window
    return loadDaysFrom(uid, minKey)['catch'](function () { /* swallow */ })
      .then(function () {
        // Mark every day in the preload window as attempted so empty days are
        // remembered and not re-fetched one-by-one on navigation.
        for (var i = 0; i < keys.length; i += 1) { loadedDays[keys[i]] = true; }
      });
  }

  // ── Cloud write (debounced per date) ──────────────────────────────────────
  function scheduleDayWrite(uid, dateKey) {
    if (dayWriteTimers[dateKey]) {
      window.clearTimeout(dayWriteTimers[dateKey]);
    }
    dayWriteTimers[dateKey] = window.setTimeout(function () {
      delete dayWriteTimers[dateKey];
      flushDayWrite(uid, dateKey);
    }, WRITE_DEBOUNCE_MS);
  }

  function flushDayWrite(uid, dateKey) {
    var payload = {
      morning: dayCache[cacheKey(MORNING_PREFIX, dateKey)] || {},
      myday: dayCache[cacheKey(MYDAY_PREFIX, dateKey)] || {},
      updatedAt: new Date().toISOString()
    };
    // Always mirror to localStorage for Pro offline fallback. Cheap, harmless.
    if (state.isPro) {
      writeLocalJson(localDayKey(uid, dateKey), payload);
    }
    return window.Firestore.setDoc('users/' + uid + '/days/' + dateKey, payload)
      ['catch'](function () { /* offline / transient; cached locally already */ });
  }

  // ── Bootstrap on auth change ──────────────────────────────────────────────
  function handleAuthChange(user) {
    // Reset per-session state.
    dayCache = {};
    loadedDays = {};
    for (var k in dayWriteTimers) {
      if (Object.prototype.hasOwnProperty.call(dayWriteTimers, k)) {
        window.clearTimeout(dayWriteTimers[k]);
      }
    }
    dayWriteTimers = {};
    stopPolling();

    if (!user) {
      state.mode = 'demo';
      state.user = null;
      state.isPro = false;
      state.tasks = sampleDemoTasks();
      emit();
      return Promise.resolve();
    }

    state.user = user;
    state.isPro = isProEmail(user.email);
    state.mode = state.isPro ? 'pro-fallback' : 'cloud';
    state.tasks = [];
    emit();  // mark "loading" so UI can show spinner if it wants

    return Promise.all([
      loadCloudTasks(user.uid),
      loadAllDays(user.uid)
    ]).then(function (results) {
      state.tasks = results[0] || [];
      if (state.isPro) {
        writeLocalJson(localTasksKey(user.uid), state.tasks);
      }
      emit();
      startPolling();
    })['catch'](function (err) {
      // Cloud unreachable. Pro accounts fall back to bundled config + cached
      // local mirror; free accounts get an empty board.
      if (state.isPro) {
        var localTasks = readLocalJson(localTasksKey(user.uid));
        state.tasks = (localTasks && localTasks.length)
          ? localTasks
          : (window.ALL_TASKS || []).slice();
        // Hydrate day cache from local mirror as best-effort.
        var keys = preloadDateKeys();
        for (var i = 0; i < keys.length; i += 1) {
          var cached = readLocalJson(localDayKey(user.uid, keys[i]));
          if (cached) {
            dayCache[cacheKey(MORNING_PREFIX, keys[i])] = cached.morning || {};
            dayCache[cacheKey(MYDAY_PREFIX, keys[i])] = cached.myday || {};
          }
          loadedDays[keys[i]] = true;
        }
      } else {
        state.tasks = [];
      }
      emit();
      startPolling();   // keep retrying in the background; cloud may recover
      throw err;
    });
  }

  // ── Background polling (option 2: refetch every minute) ───────────────────
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function hasPendingWrites() {
    if (tasksSaveInFlight) { return true; }
    for (var k in dayWriteTimers) {
      if (Object.prototype.hasOwnProperty.call(dayWriteTimers, k)) { return true; }
    }
    return false;
  }

  function pollOnce() {
    if (!state.user) { return; }
    if (typeof document !== 'undefined' && document.hidden) { return; }
    if (hasPendingWrites()) { return; }      // don't clobber unsaved local edits

    var uid = state.user.uid;
    var keys = preloadDateKeys();            // today + past 14 days
    var prevTasksJson = JSON.stringify(state.tasks || []);
    var prevDayJson = {};
    for (var i = 0; i < keys.length; i += 1) {
      var dk = keys[i];
      prevDayJson[dk] = {
        morning: JSON.stringify(dayCache[cacheKey(MORNING_PREFIX, dk)] || {}),
        myday: JSON.stringify(dayCache[cacheKey(MYDAY_PREFIX, dk)] || {})
      };
    }

    var jobs = [loadCloudTasks(uid)['catch'](function () { return null; })];
    jobs.push(loadDaysFrom(uid, keys[keys.length - 1])['catch'](function () { return null; }));

    Promise.all(jobs).then(function (results) {
      // Re-check that the user hasn't started typing/tapping mid-flight.
      if (!state.user || state.user.uid !== uid) { return; }
      if (hasPendingWrites()) { return; }

      var changed = false;
      var cloudTasks = results[0];
      if (cloudTasks && JSON.stringify(cloudTasks) !== prevTasksJson) {
        state.tasks = cloudTasks;
        if (state.isPro) {
          writeLocalJson(localTasksKey(uid), state.tasks);
        }
        changed = true;
      }
      // loadDaysFrom already mutated dayCache; just diff to decide whether
      // to notify the UI.
      for (var k = 0; k < keys.length; k += 1) {
        var dk2 = keys[k];
        var nowMorning = JSON.stringify(dayCache[cacheKey(MORNING_PREFIX, dk2)] || {});
        var nowMyday = JSON.stringify(dayCache[cacheKey(MYDAY_PREFIX, dk2)] || {});
        if (nowMorning !== prevDayJson[dk2].morning ||
            nowMyday !== prevDayJson[dk2].myday) {
          changed = true;
          break;
        }
      }
      if (changed) { emit(); }
    });
  }

  function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(pollOnce, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ── Backup / restore helpers ──────────────────────────────────────────────
  // Day-document ids are user-supplied when importing a backup file, and they
  // are interpolated into a Firestore path, so validate strictly to prevent
  // path traversal onto sibling docs (e.g. config/tasks).
  function isValidDateKey(k) {
    return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
  }

  // Merge imported tasks into the current list by id (imported wins), keeping
  // existing order and appending genuinely new tasks at the end.
  function mergeTasks(currentTasks, importedTasks) {
    var byId = {};
    var order = [];
    var i, t;
    for (i = 0; i < currentTasks.length; i += 1) {
      t = currentTasks[i];
      if (t && t.id) { byId[t.id] = t; order.push(t.id); }
    }
    for (i = 0; i < importedTasks.length; i += 1) {
      t = importedTasks[i];
      if (!t || !t.id) { continue; }
      if (!Object.prototype.hasOwnProperty.call(byId, t.id)) { order.push(t.id); }
      byId[t.id] = t; // imported wins
    }
    var out = [];
    for (i = 0; i < order.length; i += 1) { out.push(deepClone(byId[order[i]])); }
    return out;
  }

  // Shallow-merge two per-day check maps; overlay (imported) wins per task id.
  function mergeStateMap(base, overlay) {
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) { out[k] = base[k]; }
    }
    for (k in overlay) {
      if (Object.prototype.hasOwnProperty.call(overlay, k)) { out[k] = overlay[k]; }
    }
    return out;
  }

  // Write imported day documents one at a time (import is rare; keeps us from
  // flooding Firestore). In merge mode each day is fetched first and combined.
  function writeImportedDays(uid, daysObj, dayKeys, replace) {
    var idx = 0;
    function writeOne(dk, existing) {
      var incoming = daysObj[dk] || {};
      var inMorning = incoming.morning || {};
      var inMyday = incoming.myday || {};
      var payload = {
        morning: replace ? inMorning : mergeStateMap(existing.morning || {}, inMorning),
        myday: replace ? inMyday : mergeStateMap(existing.myday || {}, inMyday),
        updatedAt: new Date().toISOString()
      };
      return window.Firestore.setDoc('users/' + uid + '/days/' + dk, payload);
    }
    function step() {
      if (idx >= dayKeys.length) { return Promise.resolve(); }
      var dk = dayKeys[idx];
      idx += 1;
      if (replace) { return writeOne(dk, {}).then(step); }
      return window.Firestore.getDoc('users/' + uid + '/days/' + dk)
        .then(function (doc) { return writeOne(dk, doc || {}); },
              function () { return writeOne(dk, {}); })
        .then(step);
    }
    return step();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var Storage = {
    PREFIXES: { MORNING: MORNING_PREFIX, MYDAY: MYDAY_PREFIX },

    init: function () {
      window.Auth.onChange(function (user) {
        handleAuthChange(user)['catch'](function () { /* already handled */ });
      });
      return window.Auth.init().then(function (user) {
        return handleAuthChange(user);
      })['catch'](function () { /* keep demo mode on any auth init failure */ });
    },

    saveTasks: function (tasks) {
      state.tasks = deepClone(tasks);
      emit();
      if (state.mode === 'demo' || !state.user) {
        return Promise.reject(new Error('Cannot save tasks in demo mode'));
      }
      if (state.isPro) {
        writeLocalJson(localTasksKey(state.user.uid), state.tasks);
      }
      tasksSaveInFlight = true;
      return window.Firestore.setDoc('users/' + state.user.uid + '/config/tasks', {
        tasks: state.tasks,
        updatedAt: new Date().toISOString()
      }).then(function (r) { tasksSaveInFlight = false; return r; },
             function (e) { tasksSaveInFlight = false; throw e; });
    },

    readDayState: function (prefix, dateKey) {
      var cached = dayCache[cacheKey(prefix, dateKey)];
      return cached ? cached : {};
    },

    writeDayState: function (prefix, dateKey, value) {
      if (state.mode === 'demo' || !state.user) { return; }
      dayCache[cacheKey(prefix, dateKey)] = deepClone(value);
      scheduleDayWrite(state.user.uid, dateKey);
    },

    // Lazy-load a date that wasn't part of the initial preload (e.g. user
    // scrolled the calendar far back). Resolves once dayCache is populated.
    ensureDayLoaded: function (dateKey) {
      if (state.mode === 'demo' || !state.user) { return Promise.resolve(); }
      if (loadedDays[dateKey]) { return Promise.resolve(); }
      return loadOneDay(state.user.uid, dateKey)['catch'](function () {});
    },

    // Bulk-load every day from fromKey through today (and any future days) in a
    // single query. Used by views that need a wide range (e.g. the dashboard's
    // multi-week history) so they avoid issuing one request per day.
    ensureRangeLoaded: function (fromKey) {
      if (state.mode === 'demo' || !state.user) { return Promise.resolve(); }
      return loadDaysFrom(state.user.uid, fromKey)['catch'](function () {});
    },

    // Produce a full backup: the task list plus every day's completion history.
    // Resolves to a plain JSON-serialisable object.
    exportAll: function () {
      if (state.mode === 'demo' || !state.user) {
        return Promise.reject(new Error('Sign in to export your data.'));
      }
      var uid = state.user.uid;
      return Promise.all([
        loadCloudTasks(uid),
        loadDaysFrom(uid, '0000-01-01')   // early key -> every day document
      ]).then(function (results) {
        var tasks = results[0] || [];
        var rows = results[1] || [];
        var days = {};
        for (var i = 0; i < rows.length; i += 1) {
          if (!isValidDateKey(rows[i].id)) { continue; }
          var d = rows[i].data || {};
          days[rows[i].id] = { morning: d.morning || {}, myday: d.myday || {} };
        }
        return {
          app: 'habit-board',
          version: 1,
          exportedAt: new Date().toISOString(),
          uid: uid,
          email: (state.user && state.user.email) || null,
          tasks: tasks,
          days: days
        };
      });
    },

    // Restore a backup produced by exportAll. `mode` is 'merge' (default) or
    // 'replace'. Resolves to a small summary of what was written.
    importAll: function (data, mode) {
      if (state.mode === 'demo' || !state.user) {
        return Promise.reject(new Error('Sign in to import your data.'));
      }
      if (!data ||
          Object.prototype.toString.call(data.tasks) !== '[object Array]' ||
          !data.days || typeof data.days !== 'object') {
        return Promise.reject(new Error('This file is not a valid Habit Board backup.'));
      }
      var replace = (mode === 'replace');
      var uid = state.user.uid;

      var dayKeys = [];
      for (var k in data.days) {
        if (Object.prototype.hasOwnProperty.call(data.days, k) && isValidDateKey(k)) {
          dayKeys.push(k);
        }
      }

      var nextTasks = replace ? deepClone(data.tasks)
                              : mergeTasks(state.tasks, data.tasks);

      return Storage.saveTasks(nextTasks).then(function () {
        return writeImportedDays(uid, data.days, dayKeys, replace);
      }).then(function () {
        return loadAllDays(uid); // refresh the preload window from the server
      }).then(function () {
        emit();
        return { tasks: nextTasks.length, days: dayKeys.length };
      });
    },

    onChange: function (cb) {
      listeners.push(cb);
      return function () {
        var idx = listeners.indexOf(cb);
        if (idx !== -1) { listeners.splice(idx, 1); }
      };
    },

    // Read-only accessors so consumers don't mutate internal state directly.
    get mode() { return state.mode; },
    get tasks() { return state.tasks; },
    get user() { return state.user; },
    get isPro() { return state.isPro; }
  };

  window.Storage = Storage;
}());
