// Vercel serverless function: /api/probe-all?sources=a,b&tmdbId=550&season=1&episode=1
//
// Server-side availability probe. The browser cannot read an iframe and every
// embed host blocks CORS, so the check has to happen here.
//
// Self-contained on purpose: reads the source list from its own copy so the
// function does not depend on the static bundle being in its import path.

import { checkEmbed } from '../lib/check.mjs';

// host allowlist — stops the endpoint being used as an open proxy
const ALLOWED = new Set([
  'vidstuck.cc', 'www.vidy.st', 'vidlink.pro', 'vixsrc.to', 'vidfast.pro',
  'player.vidzee.wtf', 'atlantic.st', 'cinesrc.st', 'multiembed.mov',
  'embed.vidrift.net', 'vidnest.fun', 'primewire.mov',
]);

// Mirror of public/config.js SOURCES (URL builders only).
const SOURCES = [
  { id: 'vidstuck', name: 'VidStuck', inlineData: false,
    url: (m) => `https://vidstuck.cc/embed/movie/${m.tmdbId}?loading=2&color=c9a227&overlay=true&back=false`,
    tv: (m) => `https://vidstuck.cc/embed/tv/${m.tmdbId}/${m.season}/${m.episode}?loading=2&color=c9a227&overlay=true&back=false&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false` },
  { id: 'vidfast', name: 'VidFast', inlineData: false,
    url: (m) => `https://vidfast.pro/movie/${m.tmdbId}?autoPlay=false&title=true&poster=true&nextButton=false&autoNext=false&theme=c9a227`,
    tv: (m) => `https://vidfast.pro/tv/${m.tmdbId}/${m.season}/${m.episode}?autoPlay=false&title=true&poster=true&nextButton=false&autoNext=false&theme=c9a227` },
  { id: 'vidlink', name: 'VidLink', inlineData: true,
    url: (m) => `https://vidlink.pro/movie/${m.tmdbId}?autoplay=false&poster=true&title=true&nextbutton=false&primaryColor=c9a227`,
    tv: (m) => `https://vidlink.pro/tv/${m.tmdbId}/${m.season}/${m.episode}?autoplay=false&poster=true&title=true&nextbutton=false&primaryColor=c9a227` },
  { id: 'vixsrc', name: 'VixSrc', inlineData: false,
    url: (m) => `https://vixsrc.to/movie/${m.tmdbId}?primaryColor=c9a227`,
    tv: (m) => `https://vixsrc.to/tv/${m.tmdbId}/${m.season}/${m.episode}?primaryColor=c9a227` },
  { id: 'vidy', name: 'Vidy', inlineData: false,
    url: (m) => `https://www.vidy.st/movie/${m.tmdbId}?color=c9a227&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false`,
    tv: (m) => `https://www.vidy.st/tv/${m.tmdbId}/${m.season}/${m.episode}?color=c9a227&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false` },
  { id: 'vidzee', name: 'VidZee', inlineData: false,
    url: (m) => `https://player.vidzee.wtf/embed/movie/${m.tmdbId}`,
    tv: (m) => `https://player.vidzee.wtf/embed/tv/${m.tmdbId}/${m.season}/${m.episode}` },
  { id: 'vidrift', name: 'VidRift', inlineData: false,
    url: (m) => `https://embed.vidrift.net/embed/movie/${m.tmdbId}?brandColor=c9a227&hide=next,episodes`,
    tv: (m) => `https://embed.vidrift.net/embed/tv/${m.tmdbId}/${m.season}/${m.episode}?brandColor=c9a227&hide=next,episodes` },
  { id: 'atlantic', name: 'Atlantic', inlineData: false,
    url: (m) => `https://atlantic.st/embed/movie/${m.tmdbId}`,
    tv: (m) => `https://atlantic.st/embed/tv/${m.tmdbId}/${m.season}/${m.episode}` },
  { id: 'cinesrc', name: 'CineSrc', inlineData: false,
    url: (m) => `https://cinesrc.st/embed/movie/${m.tmdbId}?color=%23c9a227`,
    tv: (m) => `https://cinesrc.st/embed/tv/${m.tmdbId}?s=${m.season}&e=${m.episode}&color=%23c9a227` },
  { id: 'superembed', name: 'SuperEmbed', inlineData: false,
    url: (m) => `https://multiembed.mov/?tmdb=1&video_id=${m.tmdbId}`,
    tv: (m) => `https://multiembed.mov/?tmdb=1&video_id=${m.tmdbId}&s=${m.season}&e=${m.episode}` },
  { id: 'vidnest', name: 'VidNest', inlineData: false,
    url: (m) => `https://vidnest.fun/movie/${m.tmdbId}`,
    tv: (m) => `https://vidnest.fun/tv/${m.tmdbId}/${m.season}/${m.episode}` },
  { id: 'primewire', name: 'PrimeWire', inlineData: false,
    url: (m) => `https://primewire.mov/embed/movie?tmdb=${m.tmdbId}`,
    tv: (m) => `https://primewire.mov/embed/tv?tmdb=${m.tmdbId}&season=${m.season}&episode=${m.episode}` },
];

export default async function handler(req, res) {
  const q = req.query || {};
  const tmdbId = String(q.tmdbId || q.id || '');
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

  const item = {
    tmdbId,
    season: q.season ? String(q.season) : undefined,
    episode: q.episode ? String(q.episode) : undefined,
  };

  const wanted = String(q.sources || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = wanted.length ? SOURCES.filter((s) => wanted.includes(s.id)) : SOURCES;

  const results = await Promise.all(list.map(async (s) => {
    let url;
    try { url = item.season ? s.tv(item) : s.url(item); }
    catch { return { id: s.id, name: s.name, ok: false, conclusive: false, reason: 'bad url', ms: 0 }; }

    try {
      if (!ALLOWED.has(new URL(url).host)) return { id: s.id, name: s.name, ok: false, conclusive: false, reason: 'host not allowed', ms: 0 };
    } catch { return { id: s.id, name: s.name, ok: false, conclusive: false, reason: 'bad url', ms: 0 }; }

    const r = await checkEmbed(url, { inlineData: Boolean(s.inlineData) });
    return { id: s.id, name: s.name, url, ...r };
  }));

  results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms);
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ tmdbId, results });
}
