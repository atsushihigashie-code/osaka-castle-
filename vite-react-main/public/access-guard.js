// /shared-audio/../access-guard.js  (served from site root as /access-guard.js)
//
// Every route-a and route-b tour page includes this script FIRST, before
// any content is shown. It checks that the visitor actually unlocked the
// tour through gate.html (i.e. entered a valid ¥500 access code) in THIS
// browser session. If not — for example, someone opened a copied/shared
// tour URL directly, or their code has expired — they're bounced back to
// the code-entry screen instead of seeing the tour for free.
//
// sessionStorage is per-browser-tab and is never included when a URL is
// copied or shared, so this closes the "just send someone the tour link"
// bypass described by the site owner.
//
// Include as the very first thing in <head>, before any visible content:
//   <script src="../access-guard.js" data-route="a"></script>   (route-a pages)
//   <script src="../access-guard.js" data-route="b"></script>   (route-b pages)
//
// --- Owner preview bypass ---
// The site owner can preview any page without going through the code
// flow every time, by visiting a page once with ?owner=<OWNER_PREVIEW_KEY>
// in the URL. That sets a long-lived flag in localStorage (not
// sessionStorage), so it survives across browser restarts on that one
// device/browser. This key is only convenient, not a real secret — it
// lives in this public JS file — so it should still not be shared or
// posted publicly.

(function () {
  var OWNER_PREVIEW_KEY = 'WTNeHk58b378IP8JXpds';
  var OWNER_FLAG = 'osakaCastleOwnerPreview';

  var thisScript = document.currentScript;
  var route = (thisScript && thisScript.getAttribute('data-route')) || 'a';

  var params = new URLSearchParams(window.location.search);
  var ownerParam = params.get('owner');

  if (ownerParam && ownerParam === OWNER_PREVIEW_KEY) {
    localStorage.setItem(OWNER_FLAG, '1');
    // Clean the key out of the visible URL/history without reloading.
    params.delete('owner');
    var cleanUrl = window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', cleanUrl);
  }

  if (localStorage.getItem(OWNER_FLAG) === '1') {
    return; // Owner preview mode — skip the code check entirely.
  }

  var raw = sessionStorage.getItem('osakaCastleAccess');
  var valid = false;

  if (raw) {
    try {
      var access = JSON.parse(raw);
      if (access && access.expiresAt && Date.now() < access.expiresAt) {
        valid = true;
      }
    } catch (e) {
      valid = false;
    }
  }

  if (!valid) {
    // Send them to the code-entry screen for the route they were trying
    // to view, then straight back here once unlocked.
    var here = window.location.pathname.split('/').pop();
    window.location.replace(
      '../gate.html?route=' + encodeURIComponent(route) +
      '&next=' + encodeURIComponent(here)
    );
  }
})();
