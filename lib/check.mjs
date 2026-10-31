// Server-side source availability check.
//
// The browser can't read an iframe and CORS blocks every embed host, but a
// server can fetch the embed page and look for the markers these players render
// when a title is missing.
//
// Critical detail: these embed pages hold the connection open (they stream), so
// `await res.text()` never resolves. We read the FIRST chunk, scan it, then
// cancel the body. That turns a 9s timeout into a ~300ms answer.

const FAIL_MARKERS = [
  'video not found',
  'movie not found',
  'title not found',
  'episode not found',
  'content not found',
  'no video sources',
  'no sources found',
  'not available at this time',
  'this video is unavailable',
  'does not exist',
  'has been removed',
  'failed to load',
  'no such file',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_BYTES = 96 * 1024;
const READ_BUDGET_MS = 3500;   // how long we're willing to accumulate body bytes
const HEADER_TIMEOUT_MS = 15000;

/**
 * @param {string} url
 * @returns {Promise<{ok:boolean,status:number,reason:string,bytes:number,ms:number}>}
 */
export async function checkEmbed(url, { inlineData = false } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const headerTimer = setTimeout(() => ctrl.abort(), HEADER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    clearTimeout(headerTimer);

    if (!res.ok) {
      // 404/410 say "no such title". A bare 500 from these embeds usually means
      // the same thing (verified against vidlink: real id 200, fake id 500).
      const conclusive = res.status === 404 || res.status === 410 || res.status === 500;
      return { ok: !conclusive, conclusive, status: res.status, reason: `http ${res.status}`, bytes: 0, ms: Date.now() - t0 };
    }

    // read a bounded prefix, then bail — the page may never end
    const reader = res.body?.getReader();
    if (!reader) return { ok: true, conclusive: false, status: res.status, reason: 'no body', bytes: 0, ms: Date.now() - t0 };

    const chunks = [];
    let bytes = 0;
    const deadline = Date.now() + READ_BUDGET_MS;

    while (bytes < MAX_BYTES && Date.now() < deadline) {
      const race = await Promise.race([
        reader.read().catch(() => ({ done: true })),
        new Promise((r) => setTimeout(() => r({ done: true, timedOut: true }), Math.max(150, deadline - Date.now()))),
      ]);
      if (race.done) break;
      chunks.push(Buffer.from(race.value));
      bytes += race.value.length;
    }
    try { await reader.cancel(); } catch { /* already closed */ }

    const html = Buffer.concat(chunks).toString('utf8');
    const lower = html.toLowerCase();
    const hit = FAIL_MARKERS.find((m) => lower.includes(m));
    const ms = Date.now() - t0;

    if (hit) return { ok: false, conclusive: true, status: res.status, reason: hit, bytes, ms };
    if (bytes < 300) return { ok: false, conclusive: true, status: res.status, reason: 'empty shell', bytes, ms };

    // Some providers inline the TMDB payload: a real title carries
    // number_of_seasons, a missing one doesn't. Verified on vidlink.
    if (inlineData && !lower.includes('number_of_seasons')) {
      return { ok: false, conclusive: true, status: res.status, reason: 'no title data', bytes, ms };
    }

    return { ok: true, conclusive: true, status: res.status, reason: 'ok', bytes, ms };
  } catch (e) {
    const code = e.cause?.code || e.name;
    const reason = e.name === 'AbortError' ? 'timeout' : code;
    // network trouble says nothing about whether the title exists — mark it
    // unknown so the player still tries the source instead of skipping it
    return { ok: true, conclusive: false, status: 0, reason, bytes: 0, ms: Date.now() - t0 };
  } finally {
    clearTimeout(headerTimer);
  }
}

/** Builds the embed URL for a source + title. */
export function embedUrl(source, item) {
  return item.season ? source.tv(item) : source.url(item);
}
