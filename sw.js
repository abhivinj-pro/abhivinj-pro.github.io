/*
 * Habit Board service worker.
 *
 * Goals:
 *   - Make the three app shells installable and available offline.
 *   - NEVER cache authentication or Firestore data requests — those must always
 *     hit the network so the board stays correct and secure.
 *   - Serve static assets fast (stale-while-revalidate) while still picking up
 *     new deploys.
 *
 * Bump CACHE_VERSION whenever the precached shell or caching strategy changes;
 * the activate handler purges every cache that does not match.
 */
'use strict';

var CACHE_VERSION = 'v4';
var SHELL_CACHE = 'habit-shell-' + CACHE_VERSION;
var RUNTIME_CACHE = 'habit-runtime-' + CACHE_VERSION;
var FONT_CACHE = 'habit-fonts-' + CACHE_VERSION;

// Core navigations + manifest/icons precached on install. Static JS/CSS are
// picked up lazily by the runtime cache so we don't have to track ?v= strings.
var SHELL_ASSETS = [
  './',
  './index.html',
  './todo.html',
  './dashboard.html',
  './settings.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

// Hosts whose responses must never be cached (auth + live data).
var BYPASS_HOST_RE = /(firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebase)/i;

// Media files must be served straight from the network. iOS Safari plays audio
// via HTTP Range requests and expects 206 Partial Content responses; returning
// a full 200 body from the Cache API corrupts playback (white noise on iOS 12).
var MEDIA_EXT_RE = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|mp4|webm|mov)$/i;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  var keep = [SHELL_CACHE, RUNTIME_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (keep.indexOf(name) === -1) { return caches['delete'](name); }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle GET; let the browser deal with everything else.
  if (req.method !== 'GET') { return; }

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Never intercept auth / Firestore — always straight to the network.
  if (BYPASS_HOST_RE.test(url.hostname) || BYPASS_HOST_RE.test(url.href)) {
    return;
  }

  // Never intercept media or Range requests. iOS Safari media playback relies on
  // Range/206 responses that the Cache API does not satisfy; let the browser
  // fetch these directly so audio/video decode correctly.
  if (req.headers.get('range') || MEDIA_EXT_RE.test(url.pathname)) {
    return;
  }

  // Google Fonts (stylesheet + font files): cache-first, refresh in background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // Same-origin.
  if (url.origin === self.location.origin) {
    // Navigations: network-first so new deploys win, fall back to cached shell.
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req));
      return;
    }
    // Static assets: stale-while-revalidate.
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
  // Other cross-origin GETs: leave to the browser.
});

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(SHELL_CACHE).then(function (cache) { cache.put(req, copy); });
    }
    return res;
  })['catch'](function () {
    return caches.match(req).then(function (cached) {
      return cached || caches.match('./index.html');
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone());
        }
        return res;
      })['catch'](function () { return cached; });
      return cached || network;
    });
  });
}
