// Browse filters. Uses TMDB /discover so filtering is server-side and pages
// correctly, instead of filtering whatever 20 items we happen to hold.
import { tmdb } from './api.js';

export const SORTS = {
  movie: [
    ['popularity.desc', 'Most popular'],
    ['vote_average.desc', 'Highest rated'],
    ['vote_count.desc', 'Most voted'],
    ['primary_release_date.desc', 'Newest'],
    ['revenue.desc', 'Biggest box office'],
  ],
  tv: [
    ['popularity.desc', 'Most popular'],
    ['vote_average.desc', 'Highest rated'],
    ['first_air_date.desc', 'Newest'],
  ],
};

export const DECADES = [
  ['', 'Any year'],
  ['2025,2026', '2025–now'],
  ['2020,2024', '2020s'],
  ['2010,2019', '2010s'],
  ['2000,2009', '2000s'],
  ['1990,1999', '90s'],
  ['1980,1989', '80s'],
  ['1970,1979', '70s'],
  ['1950,1969', 'Classics'],
];

export const MIN_RATING = [
  ['', 'Any rating'],
  ['7', '7+'],
  ['8', '8+'],
  ['9', '9+'],
];

export const LANG = [
  ['', 'Any language'],
  ['en', 'English'],
  ['de', 'German'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ru', 'Russian'],
];

export const state = { genre: '', decade: '', rating: '', lang: '', sort: '' };

export function reset() { Object.keys(state).forEach((k) => (state[k] = '')); }

export function readFrom(q) {
  state.genre = q.get('genre') || '';
  state.decade = q.get('decade') || '';
  state.rating = q.get('rating') || '';
  state.lang = q.get('lang') || '';
  state.sort = q.get('sort') || '';
}

export function toQuery() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
  return p.toString();
}

export function activeCount() {
  return Object.values(state).filter(Boolean).length;
}

/** Builds TMDB discover params from current filter state. */
export function discoverParams(type) {
  const p = { sort_by: state.sort || SORTS[type][0][0] };
  if (state.genre) p.with_genres = state.genre;
  if (state.rating) { p['vote_average.gte'] = state.rating; p['vote_count.gte'] = state.rating >= 8 ? 200 : 50; }
  if (state.lang) p.with_original_language = state.lang;

  const [from, to] = (state.decade || '').split(',');
  if (from) {
    const d = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    p[`${d}.gte`] = `${from}-01-01`;
    if (to) p[`${d}.lte`] = `${to}-12-31`;
  }
  return p;
}

export function filterBar(genres, type, onApply) {
  const wrap = document.createElement('div');
  wrap.className = 'filters';
  const g = genres || [];

  wrap.innerHTML = `
    <select data-k="genre"><option value="">All genres</option>${g.map((x) => `<option value="${x.id}">${x.name}</option>`).join('')}</select>
    <select data-k="decade">${DECADES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <select data-k="rating">${MIN_RATING.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <select data-k="lang">${LANG.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <select data-k="sort">${SORTS[type].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <button class="btn ghost reset" ${activeCount() ? '' : 'disabled'}>Reset ${activeCount() ? `(${activeCount()})` : ''}</button>`;

  // restore current values without firing change
  wrap.querySelectorAll('select').forEach((s) => { s.value = state[s.dataset.k] || ''; });
  wrap.querySelectorAll('select').forEach((s) => {
    s.onchange = () => { state[s.dataset.k] = s.value; onApply(); };
  });
  wrap.querySelector('.reset').onclick = () => { reset(); onApply(); };
  return wrap;
}
