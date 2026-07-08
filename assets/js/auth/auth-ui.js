/*
 * auth-ui.js — login modal + user chip.
 *
 * Builds DOM lazily so consumers only need to provide a container for the
 * chip. The modal mounts to <body>.
 *
 * Public API on window.AuthUI:
 *   AuthUI.mountChip(container)              -> void
 *   AuthUI.openLogin(opts)                   -> void
 *      opts = { message?: string, requireLogin?: boolean }
 *   AuthUI.closeLogin()                      -> void
 *   AuthUI.flash(text)                       -> void   (transient toast)
 */
(function () {
  var modalEl = null;
  var chipContainers = [];

  // ── Generic helpers ───────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) { continue; }
        if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'text') { node.textContent = attrs[k]; }
        else if (k === 'html') { node.innerHTML = attrs[k]; }
        else { node.setAttribute(k, attrs[k]); }
      }
    }
    if (children && children.length) {
      for (var i = 0; i < children.length; i += 1) {
        if (children[i]) { node.appendChild(children[i]); }
      }
    }
    return node;
  }

  function truncateEmail(email) {
    if (!email) { return ''; }
    if (email.length <= 22) { return email; }
    return email.substr(0, 19) + '…';
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function buildModal() {
    if (modalEl) { return modalEl; }

    var msg = el('p', { className: 'auth-modal-msg', id: 'auth-modal-msg' });

    var emailInput = el('input', {
      type: 'email', id: 'auth-email', className: 'auth-input',
      placeholder: 'you@example.com', autocomplete: 'email', required: 'required'
    });
    var passwordInput = el('input', {
      type: 'password', id: 'auth-password', className: 'auth-input',
      placeholder: 'Password', autocomplete: 'current-password', minlength: '6'
    });

    var modeToggle = el('button', {
      type: 'button', className: 'auth-link', id: 'auth-mode-toggle',
      text: 'Create an account'
    });

    var submitBtn = el('button', {
      type: 'submit', className: 'auth-btn auth-btn-primary', id: 'auth-submit',
      text: 'Log in'
    });

    var magicBtn = el('button', {
      type: 'button', className: 'auth-btn auth-btn-secondary', id: 'auth-magic',
      text: 'Email me a magic link'
    });

    var statusEl = el('p', { className: 'auth-status', id: 'auth-status' });

    var form = el('form', { className: 'auth-form', id: 'auth-form' }, [
      el('label', { className: 'auth-label', 'for': 'auth-email', text: 'Email' }),
      emailInput,
      el('label', { className: 'auth-label auth-label-pw', 'for': 'auth-password', text: 'Password' }),
      passwordInput,
      submitBtn,
      el('div', { className: 'auth-divider', text: 'or' }),
      magicBtn,
      statusEl
    ]);

    var closeBtn = el('button', {
      type: 'button', className: 'auth-modal-close', 'aria-label': 'Close', text: '×'
    });

    var card = el('div', { className: 'auth-modal-card', role: 'dialog', 'aria-modal': 'true' }, [
      closeBtn,
      el('h2', { className: 'auth-modal-title', text: 'Sign in to Habit Board' }),
      msg,
      form,
      el('p', { className: 'auth-modal-footer' }, [
        modeToggle
      ])
    ]);

    var backdrop = el('div', { className: 'auth-modal-backdrop hidden', id: 'auth-modal' }, [card]);

    // Event wiring
    var mode = 'signin';
    function applyMode() {
      if (mode === 'signin') {
        submitBtn.textContent = 'Log in';
        modeToggle.textContent = 'New here? Create an account';
        passwordInput.setAttribute('autocomplete', 'current-password');
      } else {
        submitBtn.textContent = 'Create account';
        modeToggle.textContent = 'Already have an account? Log in';
        passwordInput.setAttribute('autocomplete', 'new-password');
      }
    }
    modeToggle.onclick = function () {
      mode = (mode === 'signin') ? 'signup' : 'signin';
      applyMode();
      setStatus('');
    };

    function setStatus(text, isError) {
      statusEl.textContent = text || '';
      statusEl.className = 'auth-status' + (isError ? ' auth-status-error' : '');
    }

    function setBusy(busy) {
      submitBtn.disabled = busy;
      magicBtn.disabled = busy;
      submitBtn.textContent = busy
        ? (mode === 'signin' ? 'Signing in…' : 'Creating…')
        : (mode === 'signin' ? 'Log in' : 'Create account');
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var email = (emailInput.value || '').trim();
      var password = passwordInput.value || '';
      if (!email || !password) {
        setStatus('Email and password required.', true);
        return;
      }
      setStatus('');
      setBusy(true);
      var op = (mode === 'signin') ? window.Auth.signIn(email, password)
                                   : window.Auth.signUp(email, password);
      op.then(function () {
        setBusy(false);
        AuthUI.closeLogin();
      })['catch'](function (err) {
        setBusy(false);
        setStatus(prettyAuthError(err), true);
      });
    };

    magicBtn.onclick = function () {
      var email = (emailInput.value || '').trim();
      if (!email) {
        setStatus('Enter your email above first.', true);
        return;
      }
      magicBtn.disabled = true;
      magicBtn.textContent = 'Sending…';
      window.Auth.sendMagicLink(email).then(function () {
        magicBtn.disabled = false;
        magicBtn.textContent = 'Email me a magic link';
        setStatus('Check your inbox for a sign-in link.', false);
      })['catch'](function (err) {
        magicBtn.disabled = false;
        magicBtn.textContent = 'Email me a magic link';
        setStatus(prettyAuthError(err), true);
      });
    };

    closeBtn.onclick = function () { AuthUI.closeLogin(); };
    backdrop.onclick = function (e) {
      if (e.target === backdrop && !backdrop.getAttribute('data-required')) {
        AuthUI.closeLogin();
      }
    };

    document.body.appendChild(backdrop);
    modalEl = backdrop;
    applyMode();
    return modalEl;
  }

  function prettyAuthError(err) {
    var code = (err && err.code) || (err && err.message) || '';
    if (code.indexOf('EMAIL_EXISTS') !== -1) { return 'That email is already registered. Try logging in.'; }
    if (code.indexOf('EMAIL_NOT_FOUND') !== -1) { return 'No account with that email.'; }
    if (code.indexOf('INVALID_PASSWORD') !== -1) { return 'Wrong password.'; }
    if (code.indexOf('INVALID_LOGIN_CREDENTIALS') !== -1) { return 'Wrong email or password.'; }
    if (code.indexOf('WEAK_PASSWORD') !== -1) { return 'Password must be at least 6 characters.'; }
    if (code.indexOf('INVALID_EMAIL') !== -1) { return 'That email looks invalid.'; }
    if (code.indexOf('TOO_MANY_ATTEMPTS') !== -1) { return 'Too many attempts. Try again later.'; }
    if (code.indexOf('Network') !== -1) { return 'Network error. Check your connection.'; }
    if (code.indexOf('Firebase config') !== -1) { return code; }
    return code || 'Something went wrong.';
  }

  // ── User icon popup ───────────────────────────────────────────────────────
  var popupEl = null;

  var GEAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  function closePopup() {
    if (popupEl) { popupEl.classList.add('hidden'); }
  }

  function buildPopup() {
    if (popupEl) { return popupEl; }
    var emailEl = el('p', { className: 'auth-popup-email', id: 'auth-popup-email' });
    var settingsLink = el('a', {
      className: 'auth-popup-settings', href: 'settings.html',
      html: GEAR_SVG + '<span>Settings</span>'
    });
    settingsLink.onclick = function () { closePopup(); };
    var logoutBtn = el('button', {
      type: 'button', className: 'auth-popup-logout', text: 'Log out'
    });
    logoutBtn.onclick = function () {
      closePopup();
      window.Auth.signOut();
    };
    popupEl = el('div', { className: 'auth-user-popup hidden', id: 'auth-user-popup' }, [
      emailEl,
      settingsLink,
      logoutBtn
    ]);
    document.body.appendChild(popupEl);

    // Close on outside click (traverse ancestors without relying on closest)
    document.addEventListener('click', function (e) {
      if (!popupEl || popupEl.classList.contains('hidden')) { return; }
      var node = e.target;
      while (node) {
        if (node === popupEl) { return; }
        if (node.className && typeof node.className === 'string' &&
            node.className.indexOf('auth-user-icon-btn') !== -1) { return; }
        node = node.parentNode;
      }
      closePopup();
    }, true);

    return popupEl;
  }

  // ── Chip ──────────────────────────────────────────────────────────────────
  var USER_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.66 0 4.8-2.14 4.8-4.8S14.66 2.4 12 2.4 7.2 4.54 7.2 7.2 9.34 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';

  function renderChip(container) {
    while (container.firstChild) { container.removeChild(container.firstChild); }
    var user = window.Auth.currentUser();

    var iconBtn = el('button', {
      type: 'button',
      className: 'auth-user-icon-btn' + (user ? ' auth-user-icon-signed-in' : ''),
      'aria-label': user ? 'Account options' : 'Log in',
      html: USER_ICON_SVG
    });

    if (user) {
      iconBtn.onclick = function (e) {
        e.stopPropagation();
        var popup = buildPopup();
        var emailEl = document.getElementById('auth-popup-email');
        if (emailEl) { emailEl.textContent = user.email || 'Account'; }
        if (popup.classList.contains('hidden')) {
          var rect = iconBtn.getBoundingClientRect();
          popup.style.top = (rect.bottom + 8) + 'px';
          popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
          popup.classList.remove('hidden');
        } else {
          closePopup();
        }
      };
    } else {
      iconBtn.onclick = function () { AuthUI.openLogin(); };
    }

    container.appendChild(iconBtn);
  }

  function renderAllChips() {
    for (var i = 0; i < chipContainers.length; i += 1) {
      renderChip(chipContainers[i]);
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  var toastTimer = null;
  function ensureToastEl() {
    var t = document.getElementById('auth-toast');
    if (t) { return t; }
    t = el('div', { className: 'auth-toast hidden', id: 'auth-toast' });
    document.body.appendChild(t);
    return t;
  }

  // ── Public ────────────────────────────────────────────────────────────────
  var AuthUI = {
    mountChip: function (container) {
      var node = (typeof container === 'string')
        ? document.querySelector(container)
        : container;
      if (!node) { return; }
      chipContainers.push(node);
      renderChip(node);
    },

    openLogin: function (opts) {
      var modal = buildModal();
      var msg = document.getElementById('auth-modal-msg');
      if (msg) {
        msg.textContent = (opts && opts.message) || '';
        msg.style.display = (opts && opts.message) ? '' : 'none';
      }
      if (opts && opts.requireLogin) {
        modal.setAttribute('data-required', '1');
      } else {
        modal.removeAttribute('data-required');
      }
      modal.classList.remove('hidden');
      var emailInput = document.getElementById('auth-email');
      if (emailInput) { setTimeout(function () { emailInput.focus(); }, 50); }
    },

    closeLogin: function () {
      if (modalEl) { modalEl.classList.add('hidden'); }
    },

    flash: function (text) {
      var t = ensureToastEl();
      t.textContent = text;
      t.classList.remove('hidden');
      if (toastTimer) { window.clearTimeout(toastTimer); }
      toastTimer = window.setTimeout(function () {
        t.classList.add('hidden');
      }, 2400);
    }
  };

  window.AuthUI = AuthUI;

  // Re-render chip on every auth change.
  if (window.Auth) {
    window.Auth.onChange(renderAllChips);
  }
}());
