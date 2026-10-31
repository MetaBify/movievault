// MOVIEVAULT — dev server.
//
// Serves the static app, plus one serverless-style endpoint: /api/probe, which
// checks whether an embed source actually has a given title. The browser can't
// do this (cross-origin iframes are opaque, and the hosts send no CORS headers),
// but a server can fetch the embed page and inspect it.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEmbed } from './lib/check.mjs';
import { SOURCES } from './public/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4177;
const pub = path.join(__dirname, 'public');

// only these hosts may be fetched — prevents the endpoint being used as an open proxy
const ALLOWED = new Set(SOURCES.map((s) => new URL(s.url({ tmdbId: '1' })).host));

const itemFrom = (q) => ({
  tmdbId: String(q.tmdbId || q.id || ''),
  season: q.season ? String(q.season) : undefined,
  episode: q.episode ? String(q.episode) : undefined,
});

app.get('/api/probe', async (req, res) => {
  const source = SOURCES.find((s) => s.id === req.query.source);
  if (!source) return res.status(400).json({ error: 'unknown source' });

  const item = itemFrom(req.query);
  if (!item.tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  const url = item.season ? source.tv(item) : source.url(item);
  let host;
  try { host = new URL(url).host; } catch { return res.status(400).json({ error: 'bad url' }); }
  if (!ALLOWED.has(host)) return res.status(400).json({ error: 'host not allowed' });

  const out = await checkEmbed(url, { inlineData: Boolean(source.inlineData) });
  res.set('cache-control', 'public, max-age=300');
  res.json({ source: source.id, url, ...out });
});

// Check several (or all) sources at once — powers "find a working source".
app.get('/api/probe-all', async (req, res) => {
  const item = itemFrom(req.query);
  if (!item.tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  const wanted = String(req.query.sources || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const list = wanted.length ? SOURCES.filter((s) => wanted.includes(s.id)) : SOURCES;

  const results = await Promise.all(
    list.map(async (s) => {
      const url = item.season ? s.tv(item) : s.url(item);
      const r = await checkEmbed(url, { inlineData: Boolean(s.inlineData) });
      return { id: s.id, name: s.name, url, ...r };
    })
  );

  results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms);
  res.set('cache-control', 'public, max-age=300');
  res.json({ tmdbId: item.tmdbId, results });
});

app.use(express.static(pub));
app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html')));

app.listen(PORT, () => console.log(`MOVIEVAULT → http://localhost:${PORT}`));
