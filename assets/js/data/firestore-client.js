/*
 * firestore-client.js — Firestore REST CRUD wrapper.
 *
 * Exports window.Firestore:
 *   Firestore.getDoc(path)         -> Promise<object|null>
 *   Firestore.setDoc(path, data)   -> Promise<void>   (full replace via PATCH)
 *   Firestore.deleteDoc(path)      -> Promise<void>
 *
 * `path` is a document path like 'users/abc/config/tasks'. Callers pass plain
 * JS objects; this module handles Firestore's typed-value encoding and
 * decoding internally so consumers don't need to know it exists.
 *
 * Authentication: every request attaches a bearer ID token sourced from
 * window.Auth.idToken() (which auto-refreshes when stale).
 */
(function () {
  function baseUrl() {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId || cfg.projectId.indexOf('REPLACE_') === 0) {
      throw new Error('Firebase config missing. Edit firebase-config.js.');
    }
    return 'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(cfg.projectId) +
      '/databases/(default)/documents/';
  }

  // ── Typed-value encode/decode ─────────────────────────────────────────────
  function encodeValue(v) {
    if (v === null || typeof v === 'undefined') { return { nullValue: null }; }
    if (typeof v === 'boolean') { return { booleanValue: v }; }
    if (typeof v === 'number') {
      if (isFinite(v) && Math.floor(v) === v) {
        return { integerValue: String(v) };
      }
      return { doubleValue: v };
    }
    if (typeof v === 'string') { return { stringValue: v }; }
    if (Object.prototype.toString.call(v) === '[object Array]') {
      var values = [];
      for (var i = 0; i < v.length; i += 1) { values.push(encodeValue(v[i])); }
      return { arrayValue: { values: values } };
    }
    if (typeof v === 'object') {
      return { mapValue: { fields: encodeFields(v) } };
    }
    return { stringValue: String(v) };
  }

  function encodeFields(obj) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        out[k] = encodeValue(obj[k]);
      }
    }
    return out;
  }

  function decodeValue(v) {
    if (!v) { return null; }
    if ('stringValue' in v) { return v.stringValue; }
    if ('booleanValue' in v) { return v.booleanValue; }
    if ('integerValue' in v) { return parseInt(v.integerValue, 10); }
    if ('doubleValue' in v) { return v.doubleValue; }
    if ('nullValue' in v) { return null; }
    if ('arrayValue' in v) {
      var arr = (v.arrayValue && v.arrayValue.values) || [];
      var out = [];
      for (var i = 0; i < arr.length; i += 1) { out.push(decodeValue(arr[i])); }
      return out;
    }
    if ('mapValue' in v) {
      return decodeFields((v.mapValue && v.mapValue.fields) || {});
    }
    if ('timestampValue' in v) { return v.timestampValue; }
    return null;
  }

  function decodeFields(fields) {
    var out = {};
    for (var k in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, k)) {
        out[k] = decodeValue(fields[k]);
      }
    }
    return out;
  }

  // ── Authenticated XHR ─────────────────────────────────────────────────────
  function authedXhr(method, url, body) {
    return window.Auth.idToken().then(function (idToken) {
      if (!idToken) { throw new Error('Not authenticated'); }
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + idToken);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          var data = null;
          if (xhr.responseText) {
            try { data = JSON.parse(xhr.responseText); } catch (e) {}
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else if (xhr.status === 404) {
            // Treat missing docs as "no data" rather than an error.
            resolve(null);
          } else {
            var msg = (data && data.error && data.error.message) || ('HTTP ' + xhr.status);
            var err = new Error(msg);
            err.status = xhr.status;
            err.response = data;
            reject(err);
          }
        };
        xhr.onerror = function () { reject(new Error('Network error')); };
        xhr.send(body ? JSON.stringify(body) : null);
      });
    });
  }

  // Full Firestore resource name (without the API host) for the given document
  // path. Used to build `referenceValue` operands in structured queries.
  function resourceName(path) {
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId) {
      throw new Error('Firebase config missing. Edit firebase-config.js.');
    }
    return 'projects/' + cfg.projectId + '/databases/(default)/documents/' + path;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var Firestore = {
    getDoc: function (path) {
      return authedXhr('GET', baseUrl() + path).then(function (resp) {
        if (!resp || !resp.fields) { return null; }
        return decodeFields(resp.fields);
      });
    },

    resourceName: resourceName,

    // Run a structured query against the collection(s) under `parentPath`
    // (a document path, e.g. 'users/abc'). Returns an array of
    // { id: <docId>, data: <decoded fields> }. Unlike getDoc, a query never
    // 404s for missing documents — it simply omits them — so callers can read
    // a date range without generating console noise for empty days.
    runQuery: function (parentPath, structuredQuery) {
      var url = baseUrl() + parentPath + ':runQuery';
      return authedXhr('POST', url, { structuredQuery: structuredQuery })
        .then(function (resp) {
          var out = [];
          if (!resp || Object.prototype.toString.call(resp) !== '[object Array]') {
            return out;
          }
          for (var i = 0; i < resp.length; i += 1) {
            var doc = resp[i] && resp[i].document;
            if (!doc || !doc.name) { continue; }
            var segs = doc.name.split('/');
            out.push({
              id: segs[segs.length - 1],
              data: doc.fields ? decodeFields(doc.fields) : {}
            });
          }
          return out;
        });
    },

    setDoc: function (path, data) {
      // PATCH without updateMask replaces all listed fields. We include every
      // top-level field so this behaves like a "put" of the whole document.
      var url = baseUrl() + path;
      var keys = [];
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) {
          keys.push(k);
          url += (url.indexOf('?') === -1 ? '?' : '&') +
            'updateMask.fieldPaths=' + encodeURIComponent(k);
        }
      }
      return authedXhr('PATCH', url, { fields: encodeFields(data) })
        .then(function () { return undefined; });
    },

    deleteDoc: function (path) {
      return authedXhr('DELETE', baseUrl() + path)
        .then(function () { return undefined; });
    }
  };

  window.Firestore = Firestore;
}());
