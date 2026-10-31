/* ADS — integration for the profitableratecpmnetwork units.
 *
 * Three units, two behaviours:
 *   1. invoke.js + container  -> display ad, renders in place
 *   2. two bare script tags   -> popunder/interstitial (no container of their own)
 *
 * Integration choices, so this doesn't wreck the site:
 *   - The display unit lives in its own slot OUTSIDE #view, so SPA navigation
 *     never destroys it and it never appears inside the player modal.
 *   - The popunder scripts are deferred until the first real user interaction.
 *     Loading them on page load fires them at bounce-time, which both annoys
 *     people and wastes the impression.
 *   - If the slot renders nothing (ad blocker), it collapses instead of leaving
 *     a hole in the layout.
 */

const DISPLAY = {
  containerId: 'container-eb1df166ccaa6ef7da59114eeb1b0ad6',
  src: 'https://pl32120989.profitableratecpmnetwork.com/eb1df166ccaa6ef7da59114eeb1b0ad6/invoke.js',
};

const POPUNDERS = [
  'https://pl32120990.profitableratecpmnetwork.com/30/5a/93/305a93a513dbd446ff4799fa5fdcc90a.js',
  'https://pl32120991.profitableratecpmnetwork.com/b5/99/ae/b599aecc21374b780d2edfaa14996c54.js',
];

function loadScript(src, { async = true, onload, onerror } = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.async = async;
  s.setAttribute('data-cfasync', 'false');
  if (onload) s.onload = onload;
  if (onerror) s.onerror = onerror;
  document.body.appendChild(s);
  return s;
}

/* ------------------------------- display unit ------------------------------ */
function mountDisplay() {
  const slot = document.getElementById('ad-slot');
  if (!slot) return;

  const box = document.createElement('div');
  box.id = DISPLAY.containerId;
  box.className = 'ad-box';

  const label = document.createElement('span');
  label.className = 'ad-label';
  label.textContent = 'Advertisement';

  slot.append(label, box);

  loadScript(DISPLAY.src, {
    onerror: () => slot.classList.remove('on'),
  });

  // give the network a moment; if nothing rendered (blocked/filled=none),
  // collapse so there's no empty gap in the page
  setTimeout(() => {
    const filled = box.childElementCount > 0 || box.innerHTML.trim().length > 0;
    slot.classList.toggle('on', filled);
  }, 2500);
}

/* ------------------------------ popunder units ----------------------------- */
let popundersLoaded = false;

function mountPopunders() {
  if (popundersLoaded) return;
  popundersLoaded = true;
  for (const src of POPUNDERS) loadScript(src);
}

function onFirstInteraction() {
  mountPopunders();
  removeEventListener('pointerdown', onFirstInteraction, true);
  removeEventListener('keydown', onFirstInteraction, true);
  removeEventListener('touchstart', onFirstInteraction, true);
}

function armPopunders() {
  addEventListener('pointerdown', onFirstInteraction, true);
  addEventListener('keydown', onFirstInteraction, true);
  addEventListener('touchstart', onFirstInteraction, true);

  // safety net: if nobody interacts within 30s, load them anyway
  setTimeout(mountPopunders, 30000);
}

function start() {
  mountDisplay();
  armPopunders();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
