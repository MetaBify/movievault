/* SCROLLER — dead simple. No pointer dragging on the content (the browser kept
 * hijacking it), and NO wheel hijacking either. Instead: an always-visible dark
 * scrollbar you grab and slide, plus arrow buttons. The page wheel stays yours.
 */

export function dragScroll(strip) {
  /* ------------------------------ the rail -------------------------------- */
  const rail = document.createElement('div');
  rail.className = 'rail';
  rail.innerHTML = '<div class="rail-track"><div class="rail-thumb"></div></div>';
  strip.after(rail);

  const track = rail.querySelector('.rail-track');
  const thumb = rail.querySelector('.rail-thumb');

  /* ------------------------------ the arrows ------------------------------ */
  const arrows = document.createElement('div');
  arrows.className = 'row-arrows';
  arrows.innerHTML = '<button data-dir="-1" aria-label="Scroll left">‹</button><button data-dir="1" aria-label="Scroll right">›</button>';
  rail.appendChild(arrows);

  arrows.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    strip.scrollBy({ left: Number(b.dataset.dir) * strip.clientWidth * 0.8, behavior: 'smooth' });
  });

  /* -------------------------------- sync --------------------------------- */
  let raf = 0;
  function sync() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const max = strip.scrollWidth - strip.clientWidth;
      if (max < 8) { rail.classList.add('hidden'); return; }
      rail.classList.remove('hidden');

      const trackW = track.clientWidth;
      const w = Math.max(50, Math.round(trackW * (strip.clientWidth / strip.scrollWidth)));
      thumb.style.width = w + 'px';
      const p = max > 0 ? strip.scrollLeft / max : 0;
      thumb.style.transform = `translate3d(${Math.round(p * (trackW - w))}px,0,0)`;

      // dim the arrows at the ends
      arrows.querySelector('[data-dir="-1"]').disabled = strip.scrollLeft <= 2;
      arrows.querySelector('[data-dir="1"]').disabled = strip.scrollLeft >= max - 2;
    });
  }
  strip.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(strip);
  new ResizeObserver(sync).observe(track);
  window.addEventListener('resize', sync);

  // scrollWidth can grow after posters decode; re-sync on every image load
  strip.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', sync, { once: true });
    img.addEventListener('error', sync, { once: true });
  });

  // final safety net: three passes after layout settles
  [0, 120, 400, 1000].forEach((ms) => setTimeout(sync, ms));
  sync();

  /* ------------------------- grab the thumb ------------------------------- */
  let down = false, startX = 0, startLeft = 0;

  thumb.addEventListener('pointerdown', (e) => {
    down = true;
    startX = e.clientX;
    startLeft = strip.scrollLeft;
    thumb.setPointerCapture(e.pointerId);
    rail.classList.add('active');
    e.preventDefault();
    e.stopPropagation();
  });

  thumb.addEventListener('pointermove', (e) => {
    if (!down) return;
    const max = strip.scrollWidth - strip.clientWidth;
    const range = track.clientWidth - thumb.clientWidth;
    if (range <= 0) return;
    strip.scrollLeft = startLeft + Math.round(((e.clientX - startX) / range) * max);
    e.preventDefault();
  });

  const up = (e) => {
    if (!down) return;
    down = false;
    rail.classList.remove('active');
    try { thumb.releasePointerCapture(e.pointerId); } catch { /* ok */ }
  };
  thumb.addEventListener('pointerup', up);
  thumb.addEventListener('pointercancel', up);

  /* click the empty track to jump */
  track.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const r = track.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    strip.scrollTo({ left: p * (strip.scrollWidth - strip.clientWidth) - strip.clientWidth / 2, behavior: 'smooth' });
  });

  /* --------------------------------- wheel -------------------------------- */
  // Deliberately NOT hijacking the wheel. Swallowing vertical wheel over a row
  // makes the page feel stuck when you're just trying to scroll down.
  // Rows move via the rail, the arrows, drag, trackpad or arrow keys.

  /* ---------------------------------- keys -------------------------------- */
  strip.tabIndex = 0;
  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    strip.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * strip.clientWidth * 0.8, behavior: 'smooth' });
  });

  // native image drag off — the thing that kept eating the mouse
  strip.addEventListener('dragstart', (e) => e.preventDefault());

  return () => rail.remove();
}

export function initStrips(root = document) {
  root.querySelectorAll('.strip').forEach((s) => {
    if (s.dataset.dsBound) return;
    s.dataset.dsBound = '1';
    dragScroll(s);
  });
}
