/* WATCH HISTORY — powers "Continue watching" and episode ticks.
 *
 * Honest limitation: playback happens in a cross-origin iframe, so we cannot
 * read the real playhead. "Watched" means "you opened this episode", not "you
 * finished it". That's the most any site can know without owning the player.
 */

const HIST = 'mv:hist';
const SEEN = 'mv:seen';
const MAX = 60;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

const key = (id, type) => `${type}:${id}`;
const epKey = (id, s, e) => `tv:${id}:s${s}e${e}`;

/* --------------------------------- history -------------------------------- */
export function record(item) {
  if (!item?.id) return;
  const entries = all();
  const k = key(item.id, item.type);
  const entry = {
    id: Number(item.id),
    type: item.type || 'movie',
    title: item.title || 'Untitled',
    poster: item.poster || null,
    date: item.date || '',
    rating: item.rating || 0,
    season: item.season ? Number(item.season) : null,
    episode: item.episode ? Number(item.episode) : null,
    episodeName: item.episodeName || '',
    v: 1,
    at: Date.now(),
  };

  const i = entries.findIndex((x) => key(x.id, x.type) === k);
  if (i >= 0) entries.splice(i, 1);
  entries.unshift(entry);
  write(HIST, entries.slice(0, MAX));

  if (entry.type === 'tv' && entry.season && entry.episode) {
    markWatched(entry.id, entry.season, entry.episode);
  }
}

export function all() { return read(HIST, '[]'); }

export function latestFor(id, type) {
  return all().find((x) => x.id === Number(id) && x.type === type) || null;
}

export function remove(id, type) {
  write(HIST, all().filter((x) => !(x.id === Number(id) && x.type === type)));
}

export function clearHistory() {
  localStorage.removeItem(HIST);
  localStorage.removeItem(SEEN);
}

/* ----------------------------- watched episodes --------------------------- */
export function markWatched(id, season, episode) {
  const seen = read(SEEN, '{}');
  seen[epKey(id, season, episode)] = Date.now();
  write(SEEN, seen);
}

export function isWatched(id, season, episode) {
  return Boolean(read(SEEN, '{}')[epKey(id, season, episode)]);
}

export function watchedIn(id, season) {
  const seen = read(SEEN, '{}');
  const prefix = `tv:${id}:s${season}e`;
  return Object.keys(seen).filter((k) => k.startsWith(prefix)).length;
}

/** Next episode after the recorded one, within a known episode list. */
export function nextEpisode(entry, episodes) {
  if (!entry || !episodes?.length) return null;
  const i = episodes.findIndex((e) => Number(e.episode_number) === Number(entry.episode));
  if (i >= 0 && episodes[i + 1]) return episodes[i + 1];
  return null;
}
