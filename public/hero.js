// Hero carousel: cycles trending titles, dots to jump, pauses on hover/touch.
import { esc } from './ui.js';
import { year } from './config.js';

const SLIDE_MS = 7000;

export function mountHero(host, items) {
  if (!items.length) return;
  let i = 0;
  let timer = null;

  host.innerHTML = `
    <section class="hero" id="hero">
      <div class="hero-bg" id="hbg"></div>
      <div class="hero-fade"></div>
      <div class="hero-inner">
        <div class="dtext">
          <span class="kicker" id="hkick">Trending this week</span>
          <h1 id="htitle"></h1>
          <p class="dsub" id="hsub"></p>
          <p class="dover" id="hover"></p>
          <div class="dacts">
            <a class="btn primary" id="hplay">▶ Watch</a>
            <a class="btn ghost" id="hmore">Details</a>
          </div>
        </div>
      </div>
      <div class="dots" id="hdots" role="tablist"></div>
      <button class="hero-arrow left" id="hprev" aria-label="Previous">‹</button>
      <button class="hero-arrow right" id="hnext" aria-label="Next">›</button>
    </section>`;

  const bg = host.querySelector('#hbg');
  const dots = host.querySelector('#hdots');

  dots.innerHTML = items.map((_, n) => `<button class="dot" data-i="${n}" role="tab" aria-label="Slide ${n + 1}"></button>`).join('');
  dots.onclick = (e) => {
    const b = e.target.closest('.dot');
    if (b) go(Number(b.dataset.i));
  };

  function render(dir = 1) {
    const it = items[i];

    // directional slide: old layer pushes out, new layer pushes in
    const old = bg.firstElementChild;
    const layer = document.createElement('div');
    layer.className = 'hero-layer';
    layer.style.backgroundImage = `url(https://image.tmdb.org/t/p/w1280${it.backdrop})`;
    layer.style.transform = `translateX(${dir > 0 ? '100%' : '-100%'})`;
    bg.appendChild(layer);

    requestAnimationFrame(() => {
      layer.style.transform = 'translateX(0)';
      if (old) {
        old.style.transform = `translateX(${dir > 0 ? '-30%' : '30%'})`;
        old.style.opacity = '0';
        setTimeout(() => old.remove(), 620);
      }
    });

    // text re-animates in
    const text = host.querySelector('.dtext');
    text.classList.remove('in');
    void text.offsetWidth;             // force reflow so the animation replays
    text.classList.add('in');

    host.querySelector('#htitle').textContent = it.title;
    host.querySelector('#hsub').textContent = `${year(it.date)} · ★ ${it.rating}`;
    host.querySelector('#hover').textContent = (it.overview || '').slice(0, 210);
    host.querySelector('#hplay').href = `#/${it.type}/${it.id}`;
    host.querySelector('#hmore').href = `#/${it.type}/${it.id}`;

    dots.querySelectorAll('.dot').forEach((d, n) => d.classList.toggle('on', n === i));
  }

  function go(n, dir) {
    i = (n + items.length) % items.length;
    render(dir ?? 1);
    restart();
  }
  const next = () => go(i + 1, 1);
  const prev = () => go(i - 1, -1);

  function restart() {
    clearInterval(timer);
    timer = setInterval(next, SLIDE_MS);
  }

  host.querySelector('#hnext').onclick = next;
  host.querySelector('#hprev').onclick = prev;

  const heroEl = host.querySelector('#hero');
  heroEl.addEventListener('mouseenter', () => clearInterval(timer));
  heroEl.addEventListener('mouseleave', restart);
  heroEl.addEventListener('touchstart', () => clearInterval(timer), { passive: true });
  heroEl.addEventListener('touchend', restart);

  // keyboard when nothing else is focused
  document.addEventListener('keydown', function keys(e) {
    if (!document.body.contains(heroEl)) return document.removeEventListener('keydown', keys);
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });

  render();
  restart();
}
