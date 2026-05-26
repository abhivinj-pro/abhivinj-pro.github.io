/*
 * auth-client.js — Firebase Identity Toolkit + Secure Token REST wrapper.
 *
 * Exports a single global: window.Auth
 *
 *   Auth.init()                                -> Promise<user|null>
 *   Auth.signUp(email, password)               -> Promise<user>
 *   Auth.signIn(email, password)               -> Promise<user>
 *   Auth.sendMagicLink(email)                  -> Promise<void>
 *   Auth.completeMagicLink(email, oobCode)     -> Promise<user>
 *   Auth.signOut()                             -> void
 *   Auth.currentUser()                         -> user | null
 *   Auth.idToken()                             -> Promise<string|null>  (auto-refresh)
 *   Auth.onChange(cb)                          -> unsubscribe fn
 *
 * A `user` object is `{ uid, email }`. Tokens live in localStorage under
 * STORAGE_KEY and are refreshed when <5min remain on the ID token.
 *
 * Designed to run on ES5 / iOS 9 Safari. Uses XHR + Promise polyfill, no fetch,
 * no Firebase SDK.
 */
(function () {
  var STORAGE_KEY = 'hb-auth-v1';
  var PENDING_EMAIL_KEY = 'hb-pending-email-v1';
  var REFRESH_LEAD_MS = 5 * 60 * 1000;

  var listeners = [];
  var refreshInflight = null;

  function getConfig() {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf('REPLACE_') === 0) {
      throw new Error('Firebase config missing. Edit firebase-config.js.');
    }
    return cfg;
  }

  function identityToolkitUrl(method) {
    return 'https://identitytoolkit.googleapis.com/v1/accounts:' + method +
      '?key=' + encodeURIComponent(getConfig().apiKey);
  }

  function secureTokenUrl() {
    return 'https://securetoken.googleapis.com/v1/token?key=' +
      encodeURIComponent(getConfig().apiKey);
  }

  // ── Low-level XHR helper ──────────────────────────────────────────────────
  function xhrJson(method, url, body, opts) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type',
        (opts && opts.formEncoded) ? 'application/x-www-form-urlencoded' : 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        var data = null;
        if (xhr.responseText) {
          try { data = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + xhr.status);
          var err = new Error(msg);
          err.status = xhr.status;
          err.code = (data && data.error && data.error.message) || null;
          err.response = data;
          reject(err);
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      var payload;
      if (opts && opts.formEncoded) {
        var parts = [];
        for (var k in body) {
          if (Object.prototype.hasOwnProperty.call(body, k)) {
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(body[k]));
          }
        }
        payload = parts.join('&');
      } else {
        payload = body ? JSON.stringify(body) : null;
      }
      xhr.send(payload);
    });
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeStored(state) {
    try {
      if (state) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) { /* ignore quota */ }
  }

  function persistSession(payload) {
    // payload is the Identity Toolkit response. Normalize to a single shape.
    var expiresInMs = (parseInt(payload.expiresIn, 10) || 3600) * 1000;
    var state = {
      uid: payload.localId,
      email: payload.email || readStored() && readStored().email || null,
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      expiresAt: Date.now() + expiresInMs
    };
    writeStored(state);
    emitChange();
    return userFromState(state);
  }

  function userFromState(state) {
    if (!state || !state.uid) { return null; }
    return { uid: state.uid, email: state.email || null };
  }

  // ── Token refresh ─────────────────────────────────────────────────────────
  function refreshIfNeeded() {
    var state = readStored();
    if (!state || !state.refreshToken) {
      return Promise.resolve(null);
    }
    if (state.idToken && state.expiresAt - Date.now() > REFRESH_LEAD_MS) {
      return Promise.resolve(state.idToken);
    }
    if (refreshInflight) { return refreshInflight; }
    refreshInflight = xhrJson('POST', secureTokenUrl(), {
      grant_type: 'refresh_token',
      refresh_token: state.refreshToken
    }, { formEncoded: true }).then(function (resp) {
      var current = readStored() || {};
      current.idToken = resp.id_token;
      current.refreshToken = resp.refresh_token || current.refreshToken;
      current.uid = resp.user_id || current.uid;
      current.expiresAt = Date.now() + ((parseInt(resp.expires_in, 10) || 3600) * 1000);
      writeStored(current);
      refreshInflight = null;
      return current.idToken;
    })['catch'](function (err) {
      refreshInflight = null;
      // Refresh failed -> tokens are likely invalid. Sign out silently.
      writeStored(null);
      emitChange();
      throw err;
    });
    return refreshInflight;
  }

  // ── Change events ─────────────────────────────────────────────────────────
  function emitChange() {
    var user = Auth.currentUser();
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](user); } catch (e) { /* swallow listener errors */ }
    }
  }

  // ── Magic-link helpers ────────────────────────────────────────────────────
  function getMagicLinkParams() {
    var search = window.location.search || '';
    var mode = (search.match(/[?&]mode=([^&]+)/) || [])[1];
    var oobCode = (search.match(/[?&]oobCode=([^&]+)/) || [])[1];
    if (mode === 'signIn' && oobCode) {
      return { oobCode: decodeURIComponent(oobCode) };
    }
    return null;
  }

  function stripMagicLinkParams() {
    if (!window.history || !window.history.replaceState) { return; }
    var url = window.location.href.split('?')[0];
    var search = window.location.search || '';
    var kept = [];
    var parts = search.replace(/^\?/, '').split('&');
    for (var i = 0; i < parts.length; i += 1) {
      var p = parts[i];
      if (!p) { continue; }
      var name = p.split('=')[0];
      if (name === 'mode' || name === 'oobCode' || name === 'apiKey' ||
          name === 'lang' || name === 'continueUrl') { continue; }
      kept.push(p);
    }
    var qs = kept.length ? '?' + kept.join('&') : '';
    window.history.replaceState({}, '', url + qs + window.location.hash);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var Auth = {
    init: function () {
      // Handle magic-link landing first; otherwise restore any stored session.
      var params = getMagicLinkParams();
      if (params) {
        var email = '';
        try { email = window.localStorage.getItem(PENDING_EMAIL_KEY) || ''; } catch (e) {}
        if (!email && typeof window.prompt === 'function') {
          email = window.prompt('Confirm your email to finish signing in:') || '';
        }
        if (!email) {
          stripMagicLinkParams();
          return Promise.resolve(Auth.currentUser());
        }
        return Auth.completeMagicLink(email, params.oobCode).then(function (user) {
          stripMagicLinkParams();
          return user;
        })['catch'](function (err) {
          stripMagicLinkParams();
          throw err;
        });
      }
      // Touch refresh so onChange listeners get an authoritative current user.
      var state = readStored();
      if (state && state.refreshToken) {
        return refreshIfNeeded().then(function () {
          emitChange();
          return Auth.currentUser();
        })['catch'](function () { return null; });
      }
      return Promise.resolve(null);
    },

    signUp: function (email, password) {
      return xhrJson('POST', identityToolkitUrl('signUp'), {
        email: email, password: password, returnSecureToken: true
      }).then(persistSession);
    },

    signIn: function (email, password) {
      return xhrJson('POST', identityToolkitUrl('signInWithPassword'), {
        email: email, password: password, returnSecureToken: true
      }).then(persistSession);
    },

    sendMagicLink: function (email) {
      try { window.localStorage.setItem(PENDING_EMAIL_KEY, email); } catch (e) {}
      var continueUrl = window.location.origin + window.location.pathname;
      return xhrJson('POST', identityToolkitUrl('sendOobCode'), {
        requestType: 'EMAIL_SIGNIN',
        email: email,
        continueUrl: continueUrl,
        canHandleCodeInApp: true
      }).then(function () { return undefined; });
    },

    completeMagicLink: function (email, oobCode) {
      return xhrJson('POST', identityToolkitUrl('signInWithEmailLink'), {
        email: email, oobCode: oobCode
      }).then(function (resp) {
        try { window.localStorage.removeItem(PENDING_EMAIL_KEY); } catch (e) {}
        return persistSession(resp);
      });
    },

    signOut: function () {
      writeStored(null);
      emitChange();
    },

    currentUser: function () {
      return userFromState(readStored());
    },

    idToken: function () {
      return refreshIfNeeded();
    },

    onChange: function (cb) {
      listeners.push(cb);
      return function () {
        var idx = listeners.indexOf(cb);
        if (idx !== -1) { listeners.splice(idx, 1); }
      };
    }
  };

  window.Auth = Auth;
}());
