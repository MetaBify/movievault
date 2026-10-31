// TMDB wrapper — two-tier cache (memory + localStorage) with retry.
//
// Why localStorage and not sessionStorage: customers come back. A cached show
// means an instant detail page on the second visit instead of a 6-second wait.
// TTL is short enough that episode lists stay current.

import { TMDB, TMDB_KEY } from './config.js';

const mem = new Map();
const LS_PREFIX = 'tvc:';
const TTL = 6 * 60 * 60 * 1000;      // 6h — long enough to feel instant, short enough to stay fresh
const MAX_LS_BYTES = 2 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > TTL) { localStorage.removeItem(LS_PREFIX + key); return null; }
    return d;
  } catch { return null; }
}

function lsSet(key, d) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), d }));
  } catch {
    // quota hit: drop the oldest half and try once more, then give up quietly
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
      for (const k of keys.slice(0, Math.ceil(keys.length / 2))) localStorage.removeItem(k);
      localStorage.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), d }));
    } catch { /* fine */ }
  }
}

async function once(url) {
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + TMDB_KEY, accept: 'application/json' },
  });
  if (r.status === 429) {
    const err = new Error('TMDB 429');
    err.retryable = true;
    throw err;
  }
  if (!r.ok) throw new Error('TMDB ' + r.status);
  return r.json();
}

export async function tmdb(path, params = {}) {
  const url = new URL(TMDB + path);
  url.searchParams.set('language', params.language || 'en-US');
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  // strip the token-irrelevant bits so the key is stable
  const key = url.pathname + url.search;

  if (mem.has(key)) return mem.get(key);

  const cached = lsGet(key);
  if (cached) {
    mem.set(key, Promise.resolve(cached));
    return cached;
  }

  const p = (async () => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await once(url);
      } catch (e) {
        lastErr = e;
        // back off on rate limits and transient network failures
        if (attempt < 2) await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  })().then((d) => {
    lsSet(key, d);
    return d;
  });

  mem.set(key, p);
  p.catch(() => mem.delete(key));
  return p;
}

export function clearCache() {
  mem.clear();
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
  }
}

export const normalise = (r, fallbackType) => {
  const type = r.media_type || fallbackType;
  if (type === 'person') return null;
  return {
    type,
    id: r.id,
    title: r.title || r.name || 'Untitled',
    date: r.release_date || r.first_air_date || '',
    poster: r.poster_path || null,
    backdrop: r.backdrop_path || null,
    rating: Math.round((r.vote_average || 0) * 10) / 10,
    overview: r.overview || '',
  };
};
