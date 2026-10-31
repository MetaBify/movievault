/* ADS — config-driven, so more than one network can coexist without conflicts.
 *
 * Both Adsterra and this network follow the same rules (from Adsterra's own docs):
 *
 *   POPUNDER     one per page. Several codes on one page conflict and break.
 *   SOCIAL BAR   one per page. Same warning.
 *   NATIVE       one code per page; the container must be visible and have size.
 *   STATIC       can repeat, but impressions count per unique visitor.
 *
 * So this file enforces the hard limits itself: at most ONE popunder and ONE
 * social bar across ALL networks. Adding a second pops a console warning and
 * refuses to load it, because two popunders don't pay double — they just break.
 *
 * Timing per kind (why they differ):
 *   native   → immediately; slot is outside #view so SPA nav can't destroy it
 *   social   → after the page settles (scroll or 4s); it is an overlay
 *   popunder → after CLICK_THRESHOLD clicks, never from inside the player
 */

const CLICK_THRESHOLD = 8;
const SOCIAL_DELAY = 4000;
const FILL_TIMEOUT = 10000;

const DEBUG = new URLSearchParams(location.search).has('adsdebug');
const log = (...a) => { if (DEBUG) console.log('[ads]', ...a); };

/* ------------------------------- the units -------------------------------- */
/* Add an Adsterra unit by pasting its script URL here and removing the //.
 * Get the snippet from Adsterra → Websites (beta.publishers.adsterra.com).
 * Don't add a second popunder or social bar — the guard will reject it. */
const UNITS = [
  // --- current network (profitableratecpmnetwork) ---
  {
    kind: 'native',
    containerId: 'container-eb1df166ccaa6ef7da59114eeb1b0ad6',
    src: 'https://pl32120989.profitableratecpmnetwork.com/eb1df166ccaa6ef7da59114eeb1b0ad6/invoke.js',
  },
  {
    kind: 'social',
    src: 'https://pl32120990.profitableratecpmnetwork.com/30/5a/93/305a93a513dbd446ff4799fa5fdcc90a.js',
  },
  {
    kind: 'popunder',
    src: 'https://pl32120991.profitableratecpmnetwork.com/b5/99/ae/b599aecc21374b780d2edfaa14996c54.js',
  },

  // --- Adsterra (uncomment after signup and paste YOUR snippets) ---
  // {
  //   kind: 'native',
  //   containerId: 'container-REPLACE_ME',
  //   src: '//www.highperformanceformat.com/xxxxxxxx/invoke.js',
  // },
  // {
  //   kind: 'static',
  //   containerId: 'adsterra-banner-1',
  //   src: '//www.highperformanceformat.com/xxxxxxxx/invoke.js',
  // },
];

/* ------------------------------- machinery -------------------------------- */
function loadScript(src, { onerror } = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.setAttribute('data-cfasync', 'false');
  if (onerror) s.onerror = onerror;
  document.body.appendChild(s);
  return s;
}

/** Rejects duplicate popunder/social units across every network. */
function validate(units) {
  const seen = {};
  const ok = [];
  for (const u of units) {
    if (u.kind === 'popunder' || u.kind === 'social') {
      seen[u.kind] = (seen[u.kind] || 0) + 1;
      if (seen[u.kind] > 1) {
        console.warn(`[ads] refused a second ${u.kind} — several on one page conflict. Keeping the first.`);
        continue;
      }
    }
    ok.push(u);
  }
  return ok;
}

/* --------------------------------- native --------------------------------- */
function mountNative(unit) {
  const slot = document.getElementById('ad-slot');
  if (!slot || !unit.containerId) return;

  // the slot is visible with real dimensions BEFORE the script runs — networks
  // measure it and silently refuse to render into a 0x0 or display:none box
  const box = document.getElementById(unit.containerId) || document.createElement('div');
  box.id = unit.containerId;
  box.className = 'ad-box';

  if (!box.isConnected) {
    const label = document.createElement('span');
    label.className = 'ad-label';
    label.textContent = 'Advertisement';
    slot.append(label, box);
  }

  loadScript(unit.src, {
    onerror: () => {
      slot.classList.add('off');
      console.warn('[ads] native script failed to load — blocked or domain not approved');
    },
  });

  log('native: mounted', box.offsetWidth + 'x' + box.offsetHeight, '| origin', location.origin);

  setTimeout(() => {
    const hasContent = box.childElementCount > 0 || box.innerHTML.trim().length > 0;
    log('native: after', FILL_TIMEOUT, 'ms →', box.offsetWidth + 'x' + box.offsetHeight,
        '| children', box.childElementCount, '| filled:', hasContent);
    if (hasContent) { log('native: FILLED ✓'); return; }
    if (DEBUG) { log('native: EMPTY — domain approval, ad blocker, or no inventory'); return; }
    slot.classList.add('off');
    console.warn('[ads] native banner did not fill (blocked, no inventory, or domain not approved)');
  }, FILL_TIMEOUT);
}

/* --------------------------------- social --------------------------------- */
function armSocial(unit) {
  let done = false;
  const fire = () => { if (done) return; done = true; loadScript(unit.src); };

  // a real scroll only — layout emits scroll at scrollY 0 on load
  const onScroll = () => {
    if (window.scrollY < 150) return;
    removeEventListener('scroll', onScroll);
    fire();
  };
  addEventListener('scroll', onScroll, { passive: true });
  setTimeout(fire, SOCIAL_DELAY);
}

/* --------------------------------- static --------------------------------- */
function mountStatic(unit) {
  const slot = document.getElementById('ad-slot');
  if (!slot) return;
  const box = document.createElement('div');
  box.id = unit.containerId || '';
  box.className = 'ad-box';
  slot.appendChild(box);
  loadScript(unit.src);
}

/* -------------------------------- popunder -------------------------------- */
function armPopunder(unit) {
  let fired = false;
  let clicks = 0;

  addEventListener('click', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('.modal')) return;          // never while watching

    clicks++;
    if (clicks >= CLICK_THRESHOLD && !fired) {
      fired = true;
      loadScript(unit.src);
      log('popunder: armed after', clicks, 'clicks');
    }
  }, true);
}

/* ---------------------------------- start ---------------------------------- */
function start() {
  const units = validate(UNITS);
  for (const u of units) {
    if (u.kind === 'native') mountNative(u);
    else if (u.kind === 'static') mountStatic(u);
    else if (u.kind === 'social') armSocial(u);
    else if (u.kind === 'popunder') armPopunder(u);
  }
  log('units active:', units.map((u) => u.kind).join(', '));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
