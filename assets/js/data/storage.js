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

  function loadCloudDay(uid, dateKey) {
    return window.Firestore.getDoc('users/' + uid + '/days/' + dateKey)
      .then(function (doc) {
        var morning = (doc && doc.morning) ? doc.morning : {};
        var myday = (doc && doc.myday) ? doc.myday : {};
        dayCache[cacheKey(MORNING_PREFIX, dateKey)] = morning;
        dayCache[cacheKey(MYDAY_PREFIX, dateKey)] = myday;
      });
  }

  function loadAllDays(uid) {
    var keys = preloadDateKeys();
    var promises = [];
    for (var i = 0; i < keys.length; i += 1) {
      promises.push(loadCloudDay(uid, keys[i])['catch'](function () { /* swallow */ }));
    }
    return Promise.all(promises);
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
    for (var j = 0; j < keys.length; j += 1) {
      jobs.push(loadCloudDay(uid, keys[j])['catch'](function () { return null; }));
    }

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
      // loadCloudDay already mutated dayCache; just diff to decide whether
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
      if (dayCache[cacheKey(MORNING_PREFIX, dateKey)] ||
          dayCache[cacheKey(MYDAY_PREFIX, dateKey)]) {
        return Promise.resolve();
      }
      return loadCloudDay(state.user.uid, dateKey)['catch'](function () {});
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
