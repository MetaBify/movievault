# MovieVault

A TMDB-powered movie & series browser that plays through third-party embed
sources. **Static frontend, one tiny serverless function, no accounts, no database.**

Verified working sources (extracted from a known-good site, in fallback order):

```
vidstuck → vidfast → vidlink → vixsrc → vidy → vidzee
→ vidrift → atlantic → cinesrc → superembed → vidnest → primewire
```

---

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel → **Add New → Project** → import the repo.
3. Framework preset: **Other**. Build command: **none**. Output dir: `public`.
4. Deploy. `vercel.json` already sets all of that.
5. Add your domain under **Settings → Domains**.

`api/probe-all.js` deploys automatically as a serverless function.

## Local dev

```bash
npm install          # express only, for the dev server
npm run dev          # → http://localhost:4177
```

## Layout

```
public/            static site (this is what Vercel serves)
  index.html
  app.js           routes, browse, search, detail
  player.js        player modal, source rotation, remap
  config.js        SOURCES (URL builders) + TMDB token
  api.js           TMDB fetch with cache
  anime.js         AniList season resolver
  history.js       continue-watching + watched ticks
  hero.js          trending carousel
  filters.js       discover filters
  scroller.js      custom rail scroller
  ui.js            cards, rows, detail markup
api/probe-all.js   serverless: which sources actually have a title
lib/check.mjs      shared probe logic
server.js          dev-only Express (not used by Vercel)
```

## How playback works

The browser loads an `<iframe>` per episode. Each source is driven purely by a
**TMDB id** — no scraping, no matching, no database.

Because an iframe is cross-origin, the client cannot see whether a video is
playing. So:

- a source that **loads** is never abandoned automatically
- a source that **never loads** is skipped (max 4 hops)
- `✓ Playing fine` pins your choice
- every source is switchable manually

## Known limits

| Limit | Why |
|---|---|
| Sources die sometimes | Unlicensed embeds, run on donations |
| "No sources found" on new episodes | The provider hasn't got it yet — switch source |
| Newly aired anime lags days | Their catalogue, not ours |
| No accounts / sync | localStorage only, per device |
| Probe can't detect wrong titles | Players render errors in JS a server can't run |

## Anime numbering

TMDB merges cours into one long season (e.g. 60 episodes); many viewers expect
`S1 24 | S2 24`. AniList carries the real structure, so the detail page resolves
it and shows split tabs — while playback still sends TMDB numbering, which is
what the providers key on. A "remap" box in the player overrides both.

## Credits

Metadata: [TMDB](https://www.themoviedb.org). Anime structure:
[AniList](https://anilist.co). Video: the embed hosts above.
Not affiliated with any of them.
