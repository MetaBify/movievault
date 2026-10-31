/* ADS — three units, three different behaviours.
 *
 *   1. NATIVE BANNER   invoke.js + container div  → renders inline in the slot
 *   2. SOCIAL BAR      pl32120990...              → self-injecting floating bar
 *   3. POPUNDER        pl32120991...              → opens a tab on click
 *
 * Each gets its own timing, because lumping them together either fires the
 * popunder too early or holds back the banners that are actually harmless:
 *
 *   native  → immediately, in its own slot outside #view so SPA navigation
 *             doesn't destroy it and it never lands inside the player
 *   social  → once the page settles (scroll or 4s); it's an overlay, so it
 *             needs the page to exist before it can attach itself
 *   popunder→ only after CLICK_THRESHOLD real clicks, and never from inside
 *             the player
 */

const NATIVE = {
  containerId: 'container-eb1df166ccaa6ef7da59114eeb1b0ad6',
  src: 'https://pl32120989.profitableratecpmnetwork.com/eb1df166ccaa6ef7da59114eeb1b0ad6/invoke.js',
};

const SOCIAL = 'https://pl32120990.profitableratecpmnetwork.com/30/5a/93/305a93a513dbd446ff4799fa5fdcc90a.js';

const POPUNDER = 'https://pl32120991.profitableratecpmnetwork.com/b5/99/ae/b599aecc21374b780d2edfaa14996c54.js';

const CLICK_THRESHOLD = 8;     // clicks before the popunder arms
const SOCIAL_DELAY = 4000;     // ms before the social bar may load
const FILL_TIMEOUT = 10000;    // how long to wait for the native banner to fill

// ?adsdebug=1 keeps the slot visible and narrates what happens, so you can tell
// "no inventory" from "blocked" from "wiring bug" on the real domain.
const DEBUG = new URLSearchParams(location.search).has('adsdebug');
const log = (...a) => { if (DEBUG) console.log('[ads]', ...a); };

function loadScript(src, { onerror } = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.setAttribute('data-cfasync', 'false');
  if (onerror) s.onerror = onerror;
  document.body.appendChild(s);
  return s;
}

/* ----------------------------- 1. native banner ---------------------------- */
function mountNative() {
  const slot = document.getElementById('ad-slot');
  if (!slot) return;

  const label = document.createElement('span');
  label.className = 'ad-label';
  label.textContent = 'Advertisement';

  const box = document.createElement('div');
  box.id = NATIVE.containerId;
  box.className = 'ad-box';

  slot.append(label, box);

  loadScript(NATIVE.src, {
    onerror: () => {
      slot.classList.add('off');
      console.warn('[ads] native banner script failed to load — blocked by an ad blocker or the domain');
    },
  });

  log('native: container mounted, size', box.offsetWidth + 'x' + box.offsetHeight,
      '| origin', location.origin);

  // The slot stays visible with real dimensions so the network can render into
  // it. If it is still empty after a generous window, collapse it and say why.
  // These networks verify the embedding domain, so an unapproved origin or
  // plain http://localhost will legitimately return nothing.
  setTimeout(() => {
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const hasContent = box.childElementCount > 0 || box.innerHTML.trim().length > 0;

    log('native: after', FILL_TIMEOUT + 'ms →', w + 'x' + h,
        '| children', box.childElementCount, '| html len', box.innerHTML.trim().length,
        '| filled:', hasContent);

    if (hasContent) { log('native: FILLED ✓'); return; }

    if (DEBUG) {
      // leave it visible so the empty box can be inspected
      log('native: EMPTY. Likely causes — domain not approved in the ad dashboard,');
      log('        ad blocker, no inventory for this geo, or non-https origin.');
      return;
    }
    slot.classList.add('off');
    console.warn('[ads] native banner did not fill (blocked, no inventory, or domain not approved)');
  }, FILL_TIMEOUT);
}

/* ------------------------------ 2. social bar ------------------------------ */
let socialLoaded = false;

function mountSocial() {
  if (socialLoaded) return;
  socialLoaded = true;
  loadScript(SOCIAL);
}

function armSocial() {
  // Only a REAL scroll counts — layout can emit a scroll event at scrollY 0 on
  // load, which was firing this after ~1s instead of the intended delay.
  const onScroll = () => {
    if (window.scrollY < 150) return;
    removeEventListener('scroll', onScroll);
    mountSocial();
  };
  addEventListener('scroll', onScroll, { passive: true });
  setTimeout(mountSocial, SOCIAL_DELAY);
}

/* ------------------------------- 3. popunder ------------------------------- */
let popunderLoaded = false;
let clickCount = 0;

function mountPopunder() {
  if (popunderLoaded) return;
  popunderLoaded = true;
  loadScript(POPUNDER);
}

function countClick(e) {
  if (e.button !== undefined && e.button !== 0) return;   // left click only
  const el = e.target;
  if (!el || !el.closest) return;
  // never from inside the player: seeking or changing volume is the worst
  // possible moment for a tab to open
  if (el.closest('.modal')) return;

  clickCount++;
  if (clickCount >= CLICK_THRESHOLD) mountPopunder();
}

function armPopunder() {
  addEventListener('click', countClick, true);
}

/* ---------------------------------- start ---------------------------------- */
function start() {
  mountNative();
  armSocial();
  armPopunder();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
