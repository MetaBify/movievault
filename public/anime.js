/* ANIME SEASON RESOLVER
 *
 * TMDB often merges every cour of an anime into one long "Season 1" (60 eps),
 * while the sites people actually watch on split it into seasons of 24. Sending
 * TMDB's S1E52 to a provider that expects S3E4 gets you "no sources found".
 *
 * AniList carries the real structure and its PREQUEL/SEQUEL graph links the
 * seasons. This module rebuilds the chain and converts absolute episode numbers
 * into per-season numbering.
 */

const ENDPOINT = 'https://graphql.anilist.co';

const QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id episodes format seasonYear
    title { romaji english }
    relations {
      edges {
        relationType
        node { id episodes format seasonYear title { romaji english } }
      }
    }
  }
}`;

const cache = new Map();

async function gql(variables) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error('anilist ' + r.status);
      const j = await r.json();
      return j.data?.Media || null;
    } catch (e) {
      if (i === 3) return null;
      await new Promise((res) => setTimeout(res, 800 * i));
    }
  }
  return null;
}

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Walks the SEQUEL/PREQUEL graph to produce an ordered season list.
 * @returns {Promise<{chain: Array<{id:number,title:string,episodes:number,year:number|null}>, total:number}|null>}
 */
export async function resolveAnime(title, year) {
  const key = norm(title) + '|' + (year || '');
  if (cache.has(key)) return cache.get(key);

  const media = await gql({ search: title });
  if (!media) return null;

  // gather every TV entry connected to this one
  const nodes = new Map();
  nodes.set(media.id, media);
  for (const e of media.relations?.edges || []) {
    if (e.node) nodes.set(e.node.id, e.node);
  }

  // order: PREQUEL links point backwards, SEQUEL forwards
  const seq = [];
  for (const e of media.relations?.edges || []) {
    if (e.relationType === 'PREQUEL' && e.node) seq.push({ node: e.node, dir: -1 });
    if (e.relationType === 'SEQUEL' && e.node) seq.push({ node: e.node, dir: 1 });
  }

  const before = seq.filter((s) => s.dir === -1).map((s) => s.node).sort((a, b) => (a.seasonYear || 0) - (b.seasonYear || 0));
  const after = seq.filter((s) => s.dir === 1).map((s) => s.node).sort((a, b) => (a.seasonYear || 0) - (b.seasonYear || 0));

  const ordered = [...before, media, ...after]
    .filter((n) => n && (n.format === 'TV' || n.format === 'TV_SHORT' || n.format === 'ONA') && n.episodes)
    .map((n) => ({ id: n.id, title: n.title?.romaji || n.title?.english || '', episodes: Number(n.episodes) || 0, year: n.seasonYear || null }));

  if (ordered.length < 2) { cache.set(key, null); return null; }

  const total = ordered.reduce((a, s) => a + s.episodes, 0);
  const out = { chain: ordered, total };
  cache.set(key, out);
  return out;
}

/**
 * absolute episode (1-based, counting from the first season) → provider numbering
 * @returns {{season:number, episode:number}|null}
 */
export function mapAbsolute(absolute, resolved) {
  if (!resolved?.chain?.length) return null;
  let left = Number(absolute);
  if (!left || left < 1) return null;
  for (let i = 0; i < resolved.chain.length; i++) {
    const eps = resolved.chain[i].episodes;
    if (left <= eps) return { season: i + 1, episode: left };
    left -= eps;
  }
  // Beyond what AniList knows (a currently-airing cour). Providers usually keep
  // extending the latest season, so roll the remainder into it: 52 → S2E28.
  const last = resolved.chain[resolved.chain.length - 1];
  return { season: resolved.chain.length, episode: last.episodes + left };
}

export function isAnime(show) {
  const genres = show.genres || [];
  const isAnim = genres.some((g) => g.id === 16 || /animation/i.test(g.name || ''));
  const japanese = (show.original_language || '').toLowerCase() === 'ja';
  return isAnim && japanese;
}

/** Human summary for the UI: "S1 24 · S2 24". */
export function describe(resolved) {
  return resolved?.chain?.map((s, i) => `S${i + 1} ${s.episodes}`).join(' · ') || '';
}
