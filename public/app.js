import { tmdb, normalise } from './api.js';
import { $, esc, card, row, list, detailHTML, year, continueRow, relDate, isFuture, todayStr } from './ui.js';
import { playItem } from './player.js';
import { poster, SOURCES } from './config.js';
import { clearHistory, setOverride, stats } from './probe.js';
import { all as allHistory, latestFor, isWatched, clearHistory as clearWatchHistory } from './history.js';
import { resolveAnime, mapAbsolute, isAnime, describe } from './anime.js';
import { mountHero } from './hero.js';
import { initStrips } from './scroller.js';
import { filterBar, readFrom, toQuery, discoverParams, activeCount } from './filters.js';

const view = $('#view');
const load = (html) => { view.innerHTML = html; initStrips(view); };

/* --------------------------------- router -------------------------------- */
async function route() {
  // Any navigation closes the player. Otherwise the modal stays on top of the
  // page and the site looks frozen — clicking a nav link did nothing visible.
  document.querySelectorAll('.modal').forEach((m) => m.remove());

  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const p = new URLSearchParams(query || '');
  document.querySelectorAll('[data-n]').forEach((a) => a.classList.remove('on'));

  try {
    if (path.startsWith('movie/')) return detail('movie', path.slice(6));
    if (path.startsWith('tv/')) return detail('tv', path.slice(3));
    if (path === 'movies') { document.querySelector('[data-n=movies]').classList.add('on'); readFrom(p); return browse('movie', Number(p.get('page')) || 1); }
    if (path === 'tv') { document.querySelector('[data-n=tv]').classList.add('on'); readFrom(p); return browse('tv', Number(p.get('page')) || 1); }
    if (path === 'list') { document.querySelector('[data-n=list]').classList.add('on'); return myList(); }
    if (path === 'settings') { document.querySelector('[data-n=settings]').classList.add('on'); return settings(); }
    if (path === 'search') { return search(p.get('q') || ''); }
    document.querySelector('[data-n=home]').classList.add('on');
    return home();
  } catch (e) {
    load(`<div class="msg">Couldn't load. ${esc(e.message)}</div>`);
  }
}

/* ---------------------------------- home --------------------------------- */
async function home() {
  load(`<div class="hero-skel"></div><div class="msg">loading…</div>`);
  const [trend, popM, popT, topM] = await Promise.all([
    tmdb('/trending/all/week'),
    tmdb('/movie/popular'),
    tmdb('/tv/popular'),
    tmdb('/movie/top_rated'),
  ]);

  const t = (trend.results || []).map((r) => normalise(r)).filter(Boolean);
  const slides = t.filter((x) => x.backdrop).slice(0, 6);

  view.innerHTML = `
    <div id="herohost"></div>
    ${continueRow(allHistory().slice(0, 12))}
    ${row('Trending', t.slice(0, 18))}
    ${row('Popular movies', (popM.results || []).map((r) => normalise(r, 'movie')), '#/movies')}
    ${row('Popular series', (popT.results || []).map((r) => normalise(r, 'tv')), '#/tv')}
    ${row('Top rated', (topM.results || []).map((r) => normalise(r, 'movie')), '#/movies')}
  `;
  initStrips(view);
  mountHero(document.getElementById('herohost'), slides);

  const clearBtn = document.getElementById('clearHist');
  if (clearBtn) clearBtn.onclick = () => { clearWatchHistory(); home(); };
}

/* --------------------------------- browse -------------------------------- */
async function browse(type, page = 1) {
  load(`<h1 class="page-title">${type === 'movie' ? 'Movies' : 'Series'}</h1><div class="filters"><span class="msg">loading…</span></div>`);

  const [genres, d] = await Promise.all([
    tmdb(`/genre/${type}/list`),
    tmdb(`/discover/${type}`, { page, ...discoverParams(type) }),
  ]);

  const items = (d.results || []).map((r) => normalise(r, type));
  const total = d.total_pages || 1;

  view.innerHTML = `
    <h1 class="page-title">${type === 'movie' ? 'Movies' : 'Series'}${activeCount() ? ' <span class="fcount">filtered</span>' : ''}</h1>
    <div id="filterhost"></div>
    ${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="msg">Nothing matches those filters.</div>'}
    ${items.length ? `<div class="pager">
      ${page > 1 ? `<button class="btn ghost" data-p="${page - 1}">← Previous</button>` : ''}
      <span>page ${page} of ${Math.min(total, 500)}</span>
      ${page < Math.min(total, 500) ? `<button class="btn ghost" data-p="${page + 1}">Next →</button>` : ''}
    </div>` : ''}`;
  initStrips(view);

  document.getElementById('filterhost').appendChild(
    filterBar(genres.genres, type, () => {
      location.hash = `#/${type === 'movie' ? 'movies' : 'tv'}?${toQuery()}`;
    })
  );

  view.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => browse(type, Number(b.dataset.p)));
  window.scrollTo(0, 0);
}

/* --------------------------------- search -------------------------------- */
async function search(q) {
  if (!q) return load('<div class="msg">Type something in the search box.</div>');
  load('<div class="msg">searching…</div>');
  const d = await tmdb('/search/multi', { query: q, include_adult: 'false' });
  const items = (d.results || []).map((r) => normalise(r)).filter(Boolean).filter((x) => x.type !== 'person');
  load(`<h1 class="page-title">“${esc(q)}”</h1>
    ${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="msg">Nothing found.</div>'}`);
  window.scrollTo(0, 0);
}

/* -------------------------------- my list -------------------------------- */
function myList() {
  const a = list.all();
  load(`<h1 class="page-title">My List</h1>
    ${a.length ? `<div class="grid">${a.map(card).join('')}</div>` : '<div class="msg">Empty. Hit “+ My List” on anything.</div>'}`);
}

/* --------------------------------- detail -------------------------------- */
async function detail(type, id) {
  // skeleton first — never a bare "loading…" string
  load(`
    <div class="hero-skel">
      <div class="skel-lines">
        <span style="width:38%;height:34px"></span>
        <span style="width:20%"></span>
        <span style="width:52%"></span>
        <span style="width:46%"></span>
      </div>
    </div>
    ${type === 'tv' ? '<div class="msg">loading episodes…</div>' : ''}
  `);
  const d = await tmdb(`/${type}/${id}`);
  const item = {
    id: Number(id), type,
    title: d.title || d.name,
    date: d.release_date || d.first_air_date,
    rating: Math.round((d.vote_average || 0) * 10) / 10,
    poster: d.poster_path,
  };
  const hist = latestFor(item.id, type);
  const isTV = type === 'tv';
  const regular = (d.seasons || []).filter((s) => s.season_number > 0);
  const specials = (d.seasons || []).find((s) => s.season_number === 0 && (s.episode_count || 0) > 0);

  // 1) Paint the hero + episode shell the moment we have the show, so the page
  //    is interactive in ~1s instead of waiting on seasons, AniList and similar.
  load(detailHTML(d, item, hist) + `
    ${isTV ? `<section class="row">
      <div class="row-head"><h2>Episodes</h2></div>
      <div id="sels" class="seasons"></div>
      <div id="specials" class="seasons specials-row"></div>
      <div id="eps" class="eps"><div class="msg">loading episodes…</div></div>
    </section>` : ''}
    <section class="row"><div class="row-head"><h2>More like this</h2></div><div class="strip" id="sim"></div></section>
  `);

  /* ------------------------------- playback -------------------------------- */
  let animeMap = null;   // filled in later, never blocks the render

  const toAbsolute = (season, episode) => {
    let abs = Number(episode) || 0;
    for (const s of regular) {
      if (s.season_number >= season) break;
      abs += s.episode_count || 0;
    }
    return abs;
  };

  const play = (season, episode, epName) => {
    // Two numbering systems travel together:
    //   season/episode -> TMDB numbering, which is the DEFAULT and what the
    //                     embeds actually key on (reference site: S1E47).
    //   alt            -> anime/cour numbering, opt-in.
    let reqSeason = season;
    let reqEpisode = episode;
    let alt = null;

    if (S?.anime) {
      // `season` is an anime tab; TMDB keeps everything in one long season,
      // so convert back to an absolute episode number.
      let absolute = Number(episode) || 1;
      for (const g of S.groups) {
        if (g.special || g.season >= season) continue;
        absolute += g.count;
      }
      reqSeason = 1;
      reqEpisode = absolute;
      alt = { season, episode };
    } else if (animeMap && season) {
      alt = mapAbsolute(toAbsolute(season, episode), animeMap);
    }

    playItem({
      tmdbId: item.id, title: item.title, year: year(item.date),
      poster: item.poster, date: item.date, rating: item.rating,
      season: reqSeason, episode: reqEpisode, episodeName: epName,
      alt,
    });
  };

  if (type === 'movie') $('#play').onclick = () => play();

  $('#addmylist').onclick = (e) => {
    const added = list.toggle({ ...item });
    e.target.textContent = added ? '✓ In list' : '+ My List';
  };

  /* -------------------------------- TV ------------------------------------ */
  const S = isTV ? { groups: [], idx: 0, eps: [], season: regular[0]?.season_number ?? 1, anime: false } : null;

  if (isTV) {
    const specialGroup = specials
      ? {
          label: 'Specials', season: 0, count: specials.episode_count, special: true,
          get: () => tmdb(`/tv/${id}/season/0`).then((x) => x.episodes || []),
        }
      : null;

    S.groups = regular.map((s) => ({
      label: `S${s.season_number}`,
      season: s.season_number,
      count: s.episode_count,
      special: false,
      get: () => tmdb(`/tv/${id}/season/${s.season_number}`).then((x) => x.episodes || []),
    }));
    if (specialGroup) S.groups.push(specialGroup);

    const updateHead = () => {
      const head = document.querySelector('#sels')?.parentElement?.querySelector('.row-head h2');
      if (!head) return;
      const total = S.groups.filter((g) => !g.special).reduce((a, g) => a + g.count, 0);
      const n = S.groups.filter((g) => !g.special).length;
      const tag = S.anime ? ' · anime numbering' : '';
      head.innerHTML = `Episodes <span class="epsum">${total} across ${n} season${n === 1 ? '' : 's'}${tag}</span>`;
    };

    const setPlayLabel = () => {
      const btn = $('#play');
      btn.disabled = false;
      const g = S.groups[S.idx];
      const prefix = g?.special ? 'Special' : `S${S.season}`;
      const ep = hist && hist.season === S.season ? hist.episode : null;
      btn.textContent = ep ? `▶ Resume ${prefix} E${ep}` : (g?.special ? '▶ Play specials' : '▶ Play S1 E1');
    };

    const renderChips = () => {
      const sels = $('#sels');
      const spHost = $('#specials');
      sels.innerHTML = S.groups
        .map((g, i) => (g.special ? '' : `<button class="chip" data-i="${i}">${g.label} · ${g.count}</button>`))
        .join('');

      const spIdx = S.groups.findIndex((g) => g.special);
      if (spIdx >= 0 && spHost) {
        spHost.innerHTML = `<span class="sp-label">Extras</span>
          <button class="chip special" data-i="${spIdx}">Specials · ${S.groups[spIdx].count}</button>`;
      } else if (spHost) {
        spHost.remove();
      }

      document.querySelectorAll('#sels .chip, #specials .chip').forEach((b) => {
        b.onclick = () => select(Number(b.dataset.i));
      });
    };

    const renderEpisodes = (eps, group) => {
      const aired = eps.filter((e) => e.air_date && e.air_date <= todayStr());
      const latestAired = aired.length ? Number(aired[aired.length - 1].episode_number) : null;
      const futureCount = eps.filter((e) => isFuture(e.air_date)).length;

      const host = $('#eps');
      host.innerHTML = '';

      const summary = document.createElement('div');
      summary.className = 'epsum-line';
      summary.innerHTML = group?.special
        ? `${aired.length} aired special${aired.length === 1 ? '' : 's'}${futureCount ? ` · ${futureCount} upcoming` : ''}`
        : `<b>${aired.length} aired</b> · ${futureCount} upcoming · ${eps.length} announced`;
      host.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'eplist';
      list.innerHTML = eps.map((e) => {
        const seen = isWatched(item.id, S.season, e.episode_number);
        const future = isFuture(e.air_date);
        const noDate = !e.air_date;
        const isLatest = Number(e.episode_number) === latestAired;
        const cls = `ep${seen ? ' seen' : ''}${future ? ' upcoming' : ''}${isLatest ? ' latest' : ''}${noDate ? ' nodate' : ''}`;
        const right = future
          ? `airs ${relDate(e.air_date)}`
          : noDate ? 'date unknown'
          : isLatest ? 'LATEST'
          : seen ? '✓ watched'
          : (e.runtime ? e.runtime + 'm' : '');
        return `<button class="${cls}" data-e="${e.episode_number}" ${future ? 'disabled' : ''}>
          <span class="epn">E${e.episode_number}</span>
          <span class="ept">${esc(e.name || '')}</span>
          <span class="epr">${esc(right)}</span>
        </button>`;
      }).join('') || '<div class="msg">No episodes.</div>';
      host.appendChild(list);

      list.querySelectorAll('.ep:not(.upcoming)').forEach((b) => {
        b.onclick = () => {
          const n = Number(b.dataset.e);
          const ep = eps.find((x) => Number(x.episode_number) === n);
          play(S.season, n, ep?.name || '');
        };
      });
    };

    const select = async (i) => {
      if (!S.groups[i]) return;
      S.idx = i;
      const g = S.groups[i];
      S.season = g.season;

      document.querySelectorAll('#sels .chip, #specials .chip').forEach((x) => x.classList.remove('on'));
      document.querySelector(`.chip[data-i="${i}"]`)?.classList.add('on');

      $('#eps').innerHTML = '<div class="msg">loading…</div>';
      try {
        S.eps = await g.get();
      } catch {
        S.eps = [];
      }
      renderEpisodes(S.eps, g);
      setPlayLabel();
    };

    renderChips();
    updateHead();

    // resume on the remembered season
    const startIdx = Math.max(0, S.groups.findIndex((g) => g.season === hist?.season));
    select(startIdx);

    $('#play').onclick = () => {
      if (hist && hist.season === S.season && hist.episode) {
        const ep = S.eps.find((x) => Number(x.episode_number) === hist.episode);
        play(S.season, hist.episode, ep?.name || '');
        return;
      }
      const first = S.eps.find((e) => e.air_date && e.air_date <= todayStr());
      if (first) { play(S.season, Number(first.episode_number), first.name); return; }
      if (S.eps.length) {
        const btn = $('#play');
        btn.textContent = 'Nothing aired yet';
        btn.disabled = true;
      }
    };

    /* Anime upgrade — runs AFTER the page is interactive, so nothing blocks.
     * TMDB merges cours into one 60-episode season; AniList knows it's 24+24.
     * We slice TMDB's flat list into the chain and rebuild the tabs. */
    if (isAnime(d)) {
      resolveAnime(item.title, year(item.date))
        .then(async (resolved) => {
          if (!resolved) return;
          animeMap = resolved;

          const flat = await tmdb(`/tv/${id}/season/1`).then((x) => x.episodes || []).catch(() => []);
          if (!flat.length) return;

          const groups = [];
          let offset = 0;
          resolved.chain.forEach((c, i) => {
            const slice = flat.slice(offset, offset + c.episodes);
            offset += c.episodes;
            if (!slice.length) return;
            groups.push({
              label: `S${i + 1}`,
              season: i + 1,
              count: slice.length,
              special: false,
              // TMDB's numbers are absolute (25..48); the tab must show 1..24 or
              // the absolute conversion double-counts.
              get: async () => slice.map((e, k) => ({ ...e, episode_number: k + 1, tmdbEpisode: e.episode_number })),
            });
          });

          if (!groups.length) return;
          if (specialGroup) groups.push(specialGroup);

          S.groups = groups;
          S.anime = true;
          renderChips();
          updateHead();
          select(Math.max(0, groups.findIndex((g) => g.season === hist?.season)));
        })
        .catch(() => { /* stay on TMDB numbering */ });
    }
  }

  // 2) "More like this" is the least important thing on the page — never let it
  //    hold up the episodes. Fire it last and paint it when it lands.
  const simPromise = tmdb(`/${type}/${id}/similar`).catch(() => ({ results: [] }));
  simPromise.then((sim) => {
    const simEl = $('#sim');
    if (!simEl) return;
    simEl.innerHTML = (sim.results || []).slice(0, 18).map((r) => card(normalise(r, type))).join('');
    delete simEl.dataset.ds;
    initStrips(view);
  });

  initStrips(view);
  window.scrollTo(0, 0);
}

/* --------------------------------- settings ------------------------------- */
function settings() {
  const override = localStorage.getItem('mv:source');
  const fails = stats();
  const autorotate = localStorage.getItem('mv:autorotate') === 'on';
  const sandbox = localStorage.getItem('mv:sandbox') !== 'off';
  load(`
    <h1 class="page-title">Settings</h1>
    <div class="settings">
      <div class="srow">
        <div>
          <strong>Block popups from video sources</strong>
          <p>Runs every player in a sandbox that forbids <code>window.open</code>, top-level
             redirects and modals — so the embeds can't throw ad tabs at you.
             Some sources need popups for their own menus and will stop working;
             turn this off if a source misbehaves.</p>
        </div>
        <label class="switch"><input type="checkbox" id="setSandbox" ${sandbox ? 'checked' : ''}><span></span></label>
      </div>
      <div class="srow">
        <div>
          <strong>Skip dead sources</strong>
          <p>When on, the player moves to the next source <em>only if one fails to load</em>.
             A source that loads is never switched away from — not on a timer, not automatically.
             Use <b>Next source →</b> to change it yourself.</p>
        </div>
        <label class="switch"><input type="checkbox" id="setAuto" ${autorotate ? 'checked' : ''}><span></span></label>
      </div>
      <div class="srow">
        <div>
          <strong>Source order</strong>
          <p>${override ? `Pinned to <b>${esc(override)}</b>. Others still auto-try behind it.` : 'Fully automatic — best-learned source first.'}</p>
        </div>
        <button class="btn ghost" id="unpin" ${override ? '' : 'disabled'}>Unpin override</button>
      </div>
      <div class="srow">
        <div><strong>Learned failures</strong><p>Remembered per source on this device. Clears the ranking.</p></div>
        <button class="btn ghost" id="clearFails">Reset learning</button>
      </div>
      <div class="srow">
        <div><strong>Watch history</strong><p>${allHistory().length ? `${allHistory().length} title(s) in Continue watching.` : 'Empty.'} Clears the row and all episode ticks.</p></div>
        <button class="btn ghost" id="clearWatch">Clear history</button>
      </div>
      ${fails.length ? `<div class="scorelist">${fails.sort((a, b) => b.fails - a.fails).map((f) => `
        <div class="score"><span>${esc((SOURCES.find((s) => s.id === f.id) || {}).name || f.id)}</span><b>${f.fails} fail${f.fails > 1 ? 's' : ''}</b></div>`).join('')}</div>` : ''}
    </div>`);

  $('#setAuto').onchange = (e) => localStorage.setItem('mv:autorotate', e.target.checked ? 'on' : 'off');
  $('#setSandbox').onchange = (e) => {
    localStorage.setItem('mv:sandbox', e.target.checked ? 'on' : 'off');
    // live: rebuild the frame if a player is already open
    document.querySelectorAll('.modal iframe').forEach((f) => {
      if (e.target.checked) f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
      else f.removeAttribute('sandbox');
      f.src = f.src;   // reload so the sandbox takes effect
    });
  };
  $('#unpin')?.addEventListener('click', () => { setOverride(null); settings(); });
  $('#clearFails').onclick = () => { clearHistory(); setOverride(null); settings(); };
  $('#clearWatch').onclick = () => { clearWatchHistory(); settings(); };
}

/* --------------------------------- events -------------------------------- */
$('#searchForm').onsubmit = (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
};

$('#surprise').onclick = async () => {
  const d = await tmdb('/trending/all/week');
  const items = (d.results || []).map((r) => normalise(r)).filter(Boolean);
  const pick = items[Math.floor(Math.random() * items.length)];
  location.hash = `#/${pick.type}/${pick.id}`;
};

window.addEventListener('hashchange', route);
route();
