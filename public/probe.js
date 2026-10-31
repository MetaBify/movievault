/* SOURCE ROTATION — auto-advance until something plays.
 *
 * Hard truth first: an iframe is cross-origin, so we CANNOT see inside it.
 * `onload` fires even when the embed shows "404 title not found". There is no
 * API to ask "are you playing?". Any site claiming otherwise is guessing.
 *
 * So we do the only three things that are actually verifiable:
 *
 *   1. ORDER   — known-good sources first, learned from real failures per user.
 *   2. TIMEOUT — if a source hasn't loaded in N seconds, advance automatically.
 *   3. CONFIRM — a visible "this one plays ✓" button; that trains the ordering.
 *
 * Plus a manual escape hatch. Result: you press play, it cycles the duds by
 * itself and lands on something that works.
 */

const FAIL_KEY = 'mv:failures';   // { [sourceId]: { fails, lastFail } }
const OK_KEY = 'mv:working';      // { [sourceId]: lastOk }

function read(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full */ } }

export function recordFail(id) {
  const f = read(FAIL_KEY);
  f[id] = { fails: (f[id]?.fails || 0) + 1, lastFail: Date.now() };
  write(FAIL_KEY, f);
}

export function recordOk(id) {
  const w = read(OK_KEY);
  w[id] = Date.now();
  write(OK_KEY, w);
  const f = read(FAIL_KEY);
  if (f[id]) { f[id].fails = Math.max(0, f[id].fails - 1); write(FAIL_KEY, f); }
}

export function clearHistory() {
  localStorage.removeItem(FAIL_KEY);
  localStorage.removeItem(OK_KEY);
}

/**
 * Orders sources best-first using learned history.
 * Score = proven-working bonus − recent-failure penalty. No fake pings.
 */
export function orderSources(sources) {
  const fails = read(FAIL_KEY);
  const ok = read(OK_KEY);
  const now = Date.now();

  return [...sources]
    .map((s, i) => {
      const f = fails[s.id];
      const worked = ok[s.id];
      let score = 1000 - i * 5;                          // keep config order as baseline
      if (worked) score += 400;                          // it played before for this user
      if (f?.fails) score -= f.fails * 150;              // failed here before
      if (f && now - f.lastFail < 864e5) score -= 100;   // very recent failure
      return { ...s, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

export function stats() {
  const fails = read(FAIL_KEY);
  return Object.entries(fails).map(([id, v]) => ({ id, ...v }));
}

export function userOverride() { return localStorage.getItem('mv:source'); }
export function setOverride(id) { id ? localStorage.setItem('mv:source', id) : localStorage.removeItem('mv:source'); }
