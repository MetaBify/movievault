// Player with source rotation that never interrupts a working stream.
//
// Rules:
//  - A source that LOADS is never abandoned automatically. Only you can switch.
//  - A source that never loads (dead host, blocked frame) advances by itself,
//    but only when auto-try is on.
//  - Optional per-source `check(item)` can pre-flight an availability API.
//    No provider here documents one publicly, so this is a hook: paste a real
//    endpoint into config.js and the player will skip dead titles before
//    mounting the iframe.
import { esc } from './ui.js';
import { SOURCES } from './config.js';
import { orderSources, recordFail, recordOk, setOverride, userOverride } from './probe.js';
import { record } from './history.js';

const LOAD_DEADLINE = 15000;   // only matters if the frame never fires `load`
const MAX_AUTO_HOPS = 4;       // fall through at most this many dead sources

/* Server-side availability probe. Only *conclusive* negatives are actionable:
 * a hard 404 or a page containing a "not found" marker. Everything else
 * (timeout, DNS, or a generic shell) is treated as "unknown — try it", because
 * these players usually render their error state in JavaScript a server can't run. */
const probeCache = new Map();

async function autoPick(item) {
  const key = `${item.tmdbId}:${item.season || ''}:${item.episode || ''}`;
  if (probeCache.has(key)) return probeCache.get(key);

  const q = new URLSearchParams({ tmdbId: item.tmdbId });
  if (item.season) { q.set('season', item.season); q.set('episode', item.episode); }

  try {
    const r = await fetch('/api/probe-all?' + q.toString(), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const j = await r.json();
    probeCache.set(key, j.results || []);
    return j.results || [];
  } catch {
    return null;   // no backend (static host without functions) — degrade quietly
  }
}

export function playItem(item) {
  // One player at a time. Stacking modals leaves stale nodes with duplicate ids
  // (two #psrc, two #pframe) and the new player ends up querying the wrong one.
  document.querySelectorAll('.modal').forEach((m) => m.remove());

  try {
    record({
      id: item.tmdbId,
      type: item.season ? 'tv' : 'movie',
      title: item.title,
      poster: item.poster,
      date: item.date,
      rating: item.rating,
      season: item.season,
      episode: item.episode,
      episodeName: item.episodeName,
    });
  } catch (e) {
    console.warn('history write failed:', e);
  }

  // Declared BEFORE the template — the markup interpolates req.season/req.episode.
  // Getting this order wrong throws a TDZ error and the modal never opens.
  //
  // Default is TMDB numbering: that's what these embeds actually key on (the
  // reference site plays this show as S1E47 straight from TMDB). The anime/cour
  // split is opt-in for players that number by season.
  const req = { season: item.season, episode: item.episode };
  // Auto-skip dead sources is ON by default: you asked for a fallback chain, and
  // a chain that needs manual clicking isn't one. Capped so it can't spin forever.
  let useAlt = Boolean(item.alt) && localStorage.getItem('mv:animeNumbering') === 'on';
  const autoSkip = () => localStorage.getItem('mv:autorotate') !== 'off';
  const applyNumbering = () => {
    if (useAlt && item.alt) { req.season = item.alt.season; req.episode = item.alt.episode; }
    else { req.season = item.season; req.episode = item.episode; }
  };
  applyNumbering();

  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="player">
      <div class="p-top">
        <strong>${esc(item.title)}${item.year ? ' (' + item.year + ')' : ''}</strong>
        <span class="p-sub">${item.season ? `S${item.season} E${item.episode}` : ''}</span>
        <span class="p-status" id="pstatus">starting…</span>
        <button class="x" aria-label="Close">✕</button>
      </div>
      <div class="frame" id="pframe"><div class="spin">loading…</div></div>
      <div class="p-bar">
        <button class="btn primary" id="pok">✓ Playing fine</button>
        <button class="btn ghost" id="pnext">Next source →</button>
        <label class="auto-lbl" title="Only switches if a source fails to load">
          <input type="checkbox" id="pauto" ${localStorage.getItem('mv:autorotate') !== 'off' ? 'checked' : ''}>
          skip dead sources
        </label>
        <select id="psrc" aria-label="Source"></select>
      </div>
      <div class="p-hint" id="phint">
        Seeing <b>“no sources found”</b>? That server doesn't have this episode yet —
        hit <b>Next source →</b>. Newly aired anime usually lags a few days.
        <details class="remap">
          <summary>Wrong season/episode? Remap the request</summary>
          ${item.alt ? `<span class="remap-row" style="margin-bottom:8px">
            <label class="auto-lbl"><input type="checkbox" id="rAnime" ${useAlt ? 'checked' : ''}>
            anime numbering — sends <b>S${item.alt.season}E${item.alt.episode}</b> instead of TMDB's S${item.season}E${item.episode}</label>
          </span>` : ''}
          <span class="remap-row">
            S <input type="number" id="rS" min="0" max="99" value="${req.season ?? 1}" />
            E <input type="number" id="rE" min="1" max="999" value="${req.episode ?? 1}" />
            <button class="btn ghost" id="rGo">Apply</button>
            <em id="rNow"></em>
          </span>
          <span class="remap-note">
            TMDB merges some anime into one long season (e.g. 60 eps) while providers
            split it 24 + 24. Send whichever numbering that server expects.
          </span>
        </details>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const frame = wrap.querySelector('#pframe');
  const sel = wrap.querySelector('#psrc');
  const status = wrap.querySelector('#pstatus');
  const autoBox = wrap.querySelector('#pauto');

  const ordered = orderSources(SOURCES);
  const override = userOverride();
  let idx = override ? Math.max(0, ordered.findIndex((s) => s.id === override)) : 0;
  if (idx < 0) idx = 0;
  let timer = null;
  let hops = 0;
  let token = 0;             // guards against overlapping async loads

  sel.innerHTML = ordered.map((s, i) => `<option value="${s.id}">${i + 1} · ${esc(s.name)}</option>`).join('');

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } clearInterval(wrap._tick); };
  const setStatus = (txt, cls = '') => { status.textContent = txt; status.className = 'p-status ' + cls; };

  async function load(i, reason = '') {
    clearTimer();
    const my = ++token;
    idx = (i + ordered.length) % ordered.length;
    const s = ordered[idx];
    sel.value = s.id;

    frame.innerHTML = `<div class="spin">loading ${esc(s.name)}…</div>`;
    setStatus(`${s.name}${reason ? ' · ' + reason : ''}`, '');

    // a ticking counter, so a slow embed doesn't look frozen
    clearInterval(wrap._tick);
    const t0 = Date.now();
    wrap._tick = setInterval(() => {
      const secs = Math.round((Date.now() - t0) / 1000);
      setStatus(`${s.name} · loading ${secs}s`, '');
    }, 1000);

    // optional pre-flight availability check
    if (typeof s.check === 'function') {
      try {
        const available = await s.check(item);
        if (my !== token) return;
        if (available === false) {
          recordFail(s.id);
          if (autoSkip() && hops++ < MAX_AUTO_HOPS) return load(idx + 1, 'not found');
          setStatus(`${s.name} · not found`, 'bad');
          return;
        }
      } catch {
        /* CORS or network: unknown, so try it anyway */
      }
    }

    const url = req.season
      ? s.tv({ ...item, season: req.season, episode: req.episode })
      : s.url(item);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'origin';

    let loaded = false;
    iframe.onload = () => {
      loaded = true;
      clearInterval(wrap._tick);
      const spin = frame.querySelector('.spin');
      if (spin) spin.remove();
      setStatus(`${s.name} · loaded`, 'ok');
      clearTimer();                     // NEVER auto-advance after a successful load
    };
    frame.appendChild(iframe);

    // the only automatic switch: the frame never loaded at all
    timer = setTimeout(() => {
      if (loaded || my !== token) return;
      recordFail(s.id);
      if (autoSkip() && hops++ < MAX_AUTO_HOPS) load(idx + 1, 'no load');
      else setStatus(`${s.name} · did not load`, 'bad');
    }, LOAD_DEADLINE);
  }

  wrap.querySelector('#pok').onclick = () => {
    recordOk(ordered[idx].id);
    clearTimer();
    setStatus(`${ordered[idx].name} · confirmed`, 'ok');
  };

  wrap.querySelector('#pnext').onclick = () => { hops = 0; load(idx + 1, 'manual'); };

  sel.onchange = () => {
    setOverride(sel.value);
    hops = 0;
    load(ordered.findIndex((x) => x.id === sel.value));
  };

  autoBox.onchange = () => localStorage.setItem('mv:autorotate', autoBox.checked ? 'on' : 'off');

  // live remap: re-request the same source with different numbering
  const rNow = wrap.querySelector('#rNow');
  const showReq = () => {
    if (!rNow) return;
    rNow.textContent = req.season ? `sending S${req.season}E${req.episode}` : '';
  };
  showReq();

  const animeBox = wrap.querySelector('#rAnime');
  if (animeBox) {
    animeBox.onchange = () => {
      useAlt = animeBox.checked;
      localStorage.setItem('mv:animeNumbering', useAlt ? 'on' : 'off');
      applyNumbering();
      wrap.querySelector('#rS').value = req.season ?? 1;
      wrap.querySelector('#rE').value = req.episode ?? 1;
      showReq();
      hops = 0;
      load(idx, useAlt ? 'anime numbering' : 'tmdb numbering');
    };
  }

  wrap.querySelector('#rGo').onclick = () => {
    const s = Number(wrap.querySelector('#rS').value);
    const e = Number(wrap.querySelector('#rE').value);
    if (!s || !e) return;
    useAlt = false;                       // manual wins over auto
    req.season = s;
    req.episode = e;
    showReq();
    hops = 0;
    load(idx, `remapped S${s}E${e}`);
  };

  const close = () => { clearTimer(); wrap.remove(); };
  wrap.querySelector('.x').onclick = close;
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); }
  });

  load(idx, override ? 'override' : 'auto');

  /* Background: ask the server which sources are *conclusively* dead, and hop
   * past them. Runs after the first source is already loading, so it never
   * delays playback — and it never interrupts a source that loaded. */
  if (autoBox.checked) {
    const startToken = token;
    autoPick(item).then((list) => {
      if (!list?.length || token !== startToken) return;
      const current = list.find((x) => x.id === ordered[idx]?.id);
      if (!current || !current.conclusive || current.ok) return;   // nothing actionable

      const best = list.find((x) => x.ok);
      if (!best) { setStatus('every source failed the check', 'bad'); return; }
      const n = ordered.findIndex((s) => s.id === best.id);
      if (n >= 0) { hops = 0; load(n, 'auto-picked'); }
    });
  }
}
