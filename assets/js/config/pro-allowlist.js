/*
 * pro-allowlist.js — hardcoded list of "Pro" account emails.
 *
 * Pro accounts get the bundled tasks-config.js as an offline fallback when the
 * cloud is unreachable. Free accounts never see tasks-config.js after login.
 *
 * Emails are matched case-insensitively against the authenticated user's email.
 */
window.PRO_EMAILS = [
  // 'you@example.com'
];
