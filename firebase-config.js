/*
 * firebase-config.js — public Firebase web-app config.
 *
 * These values are NOT secrets. They identify the project and are restricted
 * server-side via:
 *   1. Firestore security rules (request.auth.uid == uid under users/{uid}/**).
 *   2. Web API key referrer restrictions in Google Cloud Console.
 *
 * Fill these in after creating the Firebase project (see SETUP.md).
 */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD_FYMRQ_rsQ_ELbRHk8O2VWKkg_tJJrAU',
  projectId: 'habitshare-64e20',
  authDomain: 'habitshare-64e20.firebaseapp.com'
};
