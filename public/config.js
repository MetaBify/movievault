/* MOVIEVAULT — shared config.
 *
 * The TMDB bearer token is a PUBLIC read token (v4 auth). It ships in the client
 * on purpose: it can only read catalogue data, and a free TMDB account issues
 * you your own if the hardcoded one ever gets rate-limited.
 */

export const TMDB_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyYmYwZmFlZWIzZjc3OWRhZDdkOWM3MjY4ZGM0NmNmNiIsIm5iZiI6MTcyMzkzMjM1MS4xNDEyNzIsInN1YiI6IjY2YzExZTJmOTk5ZmYwYTFjNTE2YWRhNCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.vwZW4D57fT-wlqLgHt_4vhnfTbuIwFOOrWE2DBlRHMQ';
export const TMDB = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p';

/* Embed sources.
 *
 * This list and its order mirror a site that is known to work (extracted from
 * its own embeds.js), so URLs and params are battle-tested rather than guessed.
 * Order = priority: the first entry is what plays by default.
 */
export const SOURCES = [
{
    id: 'vidstuck',
    name: 'VidStuck',
    url: (m) => `https://vidstuck.cc/embed/movie/${m.tmdbId}?loading=2&color=c9a227&overlay=true&back=false`,
    tv: (m) => `https://vidstuck.cc/embed/tv/${m.tmdbId}/${m.season}/${m.episode}?loading=2&color=c9a227&overlay=true&back=false&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false`,
  },
{
    id: 'vidfast',
    name: 'VidFast',
    url: (m) => `https://vidfast.pro/movie/${m.tmdbId}?autoPlay=false&title=true&poster=true&nextButton=false&autoNext=false&theme=c9a227`,
    tv: (m) => `https://vidfast.pro/tv/${m.tmdbId}/${m.season}/${m.episode}?autoPlay=false&title=true&poster=true&nextButton=false&autoNext=false&theme=c9a227`,
  },
{
    id: 'vidlink',
    name: 'VidLink',
    inlineData: true,   // inlines the TMDB payload: a missing title is detectable
    url: (m) => `https://vidlink.pro/movie/${m.tmdbId}?autoplay=false&poster=true&title=true&nextbutton=false&primaryColor=c9a227`,
    tv: (m) => `https://vidlink.pro/tv/${m.tmdbId}/${m.season}/${m.episode}?autoplay=false&poster=true&title=true&nextbutton=false&primaryColor=c9a227`,
  },
{
    id: 'vixsrc',
    name: 'VixSrc',
    url: (m) => `https://vixsrc.to/movie/${m.tmdbId}?primaryColor=c9a227`,
    tv: (m) => `https://vixsrc.to/tv/${m.tmdbId}/${m.season}/${m.episode}?primaryColor=c9a227`,
  },
{
    id: 'vidy',
    name: 'Vidy',
    url: (m) => `https://www.vidy.st/movie/${m.tmdbId}?color=c9a227&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false`,
    tv: (m) => `https://www.vidy.st/tv/${m.tmdbId}/${m.season}/${m.episode}?color=c9a227&nextEpisode=false&episodeSelector=false&autoplayNextEpisode=false`,
  },
{
    id: 'vidzee',
    name: 'VidZee',
    url: (m) => `https://player.vidzee.wtf/embed/movie/${m.tmdbId}`,
    tv: (m) => `https://player.vidzee.wtf/embed/tv/${m.tmdbId}/${m.season}/${m.episode}`,
  },
{
    id: 'vidrift',
    name: 'VidRift',
    url: (m) => `https://embed.vidrift.net/embed/movie/${m.tmdbId}?brandColor=c9a227&hide=next,episodes`,
    tv: (m) => `https://embed.vidrift.net/embed/tv/${m.tmdbId}/${m.season}/${m.episode}?brandColor=c9a227&hide=next,episodes`,
  },
{
    id: 'atlantic',
    name: 'Atlantic',
    url: (m) => `https://atlantic.st/embed/movie/${m.tmdbId}`,
    tv: (m) => `https://atlantic.st/embed/tv/${m.tmdbId}/${m.season}/${m.episode}`,
  },
{
    id: 'cinesrc',
    name: 'CineSrc',
    url: (m) => `https://cinesrc.st/embed/movie/${m.tmdbId}?color=%23c9a227`,
    tv: (m) => `https://cinesrc.st/embed/tv/${m.tmdbId}?s=${m.season}&e=${m.episode}&color=%23c9a227`,
  },
{
    id: 'superembed',
    name: 'SuperEmbed',
    url: (m) => `https://multiembed.mov/?tmdb=1&video_id=${m.tmdbId}`,
    tv: (m) => `https://multiembed.mov/?tmdb=1&video_id=${m.tmdbId}&s=${m.season}&e=${m.episode}`,
  },
{
    id: 'vidnest',
    name: 'VidNest',
    url: (m) => `https://vidnest.fun/movie/${m.tmdbId}`,
    tv: (m) => `https://vidnest.fun/tv/${m.tmdbId}/${m.season}/${m.episode}`,
  },
{
    id: 'primewire',
    name: 'PrimeWire',
    url: (m) => `https://primewire.mov/embed/movie?tmdb=${m.tmdbId}`,
    tv: (m) => `https://primewire.mov/embed/tv?tmdb=${m.tmdbId}&season=${m.season}&episode=${m.episode}`,
  }
];

export const poster = (p, size = 'w342') => (p ? `${IMG}/${size}${p}` : null);
export const backdrop = (p, size = 'w1280') => (p ? `${IMG}/${size}${p}` : null);
export const year = (d) => (d ? String(d).slice(0, 4) : '');
