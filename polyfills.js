/*
 * polyfills.js — feature-detected polyfills for legacy Safari (iOS 9 / iPad Air 1).
 * Loaded first, synchronously, so later scripts can assume Promise exists.
 *
 * - Promise: pulled from a CDN via document.write so it blocks subsequent
 *   parsing only when the native global is missing.
 * - We deliberately do NOT polyfill fetch; the rest of the codebase uses
 *   XMLHttpRequest wrapped in Promise, which works everywhere back to IE10.
 */
(function () {
  if (typeof Promise === 'undefined') {
    document.write(
      '<script src="https://cdn.jsdelivr.net/npm/promise-polyfill@8.3.0/dist/polyfill.min.js"><\/script>'
    );
  }
}());
