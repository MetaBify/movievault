// Shared helpers: cards, rows, my-list, detail markup.
import { tmdb, normalise } from './api.js';
import { poster, backdrop, year, SOURCES } from './config.js';

export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DAY = 864e5;
export const todayStr = () => new Date().toISOString().slice(0, 10);

/** "in 4 days" / "tomorrow" / "aired Mar 3" — used for episode dates. */
export function relDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const now = new Date(todayStr() + 'T00:00:00');
  const days = Math.round((d - now) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  if (days === -1) return 'yesterday';
  return `${Math.abs(days)} days ago`;
}

export const isFuture = (iso) => Boolean(iso) && iso > todayStr();

/* --------------------------------- my list -------------------------------- */
export const list = {
  all: () => JSON.parse(localStorage.getItem('mylist') || '[]'),
  has(id) { return this.all().some((x) => x.id === id); },
  toggle(item) {
    const a = this.all();
    const i = a.findIndex((x) => x.id === item.id);
    if (i < 0) a.unshift({ id: item.id, type: item.type, title: item.title, poster: item.poster, date: item.date, rating: item.rating });
    else a.splice(i, 1);
    localStorage.setItem('mylist', JSON.stringify(a.slice(0, 300)));
    return i < 0;
  },
};

/* ---------------------------------- cards --------------------------------- */
export function card(r, opts = {}) {
  const t = r.title || r.name;
  const badge = opts.badge ? `<span class="badge-ov">${esc(opts.badge)}</span>` : '';
  const sub = opts.sub ?? year(r.date || r.release_date || r.first_air_date);
  return `<a class="card" href="#/${r.type}/${r.id}" draggable="false">
    <div class="art">
      ${r.poster ? `<img loading="lazy" draggable="false" src="${poster(r.poster)}" alt="">` : '<span class="noart">▶</span>'}
      ${r.rating ? `<span class="rate">${r.rating}</span>` : ''}
      ${badge}
    </div>
    <h3>${esc(t)}</h3>
    <p>${esc(String(sub))}</p>
  </a>`;
}

export function row(title, items, moreHref = '') {
  if (!items?.length) return '';
  return `<section class="row">
    <div class="row-head"><h2>${esc(title)}</h2>${moreHref ? `<a href="${moreHref}">See all →</a>` : ''}</div>
    <div class="strip">${items.map((i) => card(i)).join('')}</div>
  </section>`;
}

/** Continue-watching row. Only rendered when history exists. */
export function continueRow(entries) {
  if (!entries?.length) return '';
  const cards = entries.map((e) => {
    const badge = e.type === 'tv' && e.season ? `S${e.season}E${e.episode}` : 'Watched';
    const sub = e.type === 'tv' && e.season ? `S${e.season} · E${e.episode}` : 'Film';
    return card(e, { badge, sub });
  }).join('');
  return `<section class="row continue">
    <div class="row-head">
      <h2>Continue watching</h2>
      <button class="linkbtn" id="clearHist">Clear</button>
    </div>
    <div class="strip">${cards}</div>
  </section>`;
}

/* ------------------------------ detail render ----------------------------- */
export function detailHTML(d, item, hist) {
  const inList = list.has(item.id);
  const next = d.next_episode_to_air;
  const last = d.last_episode_to_air;
  const status = d.status || '';

  const resume = hist && hist.type === 'tv' && hist.season
    ? `▶ Resume S${hist.season} E${hist.episode}`
    : '▶ Play';

  const nextLine = next
    ? `<p class="nextep"><span class="dot-live"></span>Next: <b>S${next.season_number} E${next.episode_number}</b>${next.name ? ` · ${esc(next.name)}` : ''} · ${relDate(next.air_date)}${next.air_date ? ` (${esc(next.air_date)})` : ''}</p>`
    : (status === 'Ended' ? `<p class="nextep ended">Series ended${last?.air_date ? ` · last aired ${esc(last.air_date)}` : ''}</p>` : '');

  return `
    <div class="hero" style="${d.backdrop_path ? `background-image:url(${backdrop(d.backdrop_path)})` : ''}">
      <div class="hero-fade"></div>
      <div class="hero-inner">
        ${d.poster_path ? `<img class="dposter" src="${poster(d.poster_path, 'w500')}" alt="">` : ''}
        <div class="dtext">
          <h1>${esc(item.title)}</h1>
          <p class="dsub">
            ${year(item.date)} ${d.runtime ? `· ${d.runtime}m` : ''}
            ${d.number_of_seasons ? `· ${d.number_of_seasons} season(s)` : ''}
            · ★ ${item.rating || '–'}
            ${status ? `· <span class="status ${status === 'Ended' ? 'ended' : ''}">${esc(status)}</span>` : ''}
          </p>
          ${nextLine}
          <div class="dacts">
            <button class="btn primary" id="play">${resume}</button>
            <button class="btn ghost" id="addmylist">${inList ? '✓ In list' : '+ My List'}</button>
          </div>
          <p class="dover">${esc(d.overview || 'No description.')}</p>
          <p class="dgen">${(d.genres || []).map((g) => `<span>${esc(g.name)}</span>`).join('')}</p>
        </div>
      </div>
    </div>`;
}

export { tmdb, normalise, year, poster, SOURCES };
