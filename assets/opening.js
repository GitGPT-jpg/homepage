// Opening: the real Earth shows Santiago, rotates to Beijing at a fixed distance (no camera zoom),
// then blurs and digitizes into dots that unfold into the flat dotted map and hand off to the live Santiago–Beijing route.
// Falls back to a pre-rendered poster without WebGL2.
(function () {
  'use strict';
  const map = window.ZT && window.ZT.map;
  const opening = document.getElementById('opening');
  if (!map || !opening) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || location.hash || document.hidden) {
    map.finishOpening();
    return;
  }

  const poster = opening.querySelector('.orbit-poster');
  const canvas = opening.querySelector('.orbit-gl');
  const skip = document.getElementById('opening-skip');
  const timers = [];
  const events = new AbortController();
  const listen = {signal: events.signal};
  const RAD = Math.PI / 180;
  const BEIJING = window.ZT.geo.PLACES.beijing, SANTIAGO = window.ZT.geo.PLACES.santiago;
  // Santiago -> spin to Beijing -> digitize -> unfold. The globe keeps one size until it flattens.
  const T = {drift: 1800, spin0: 2800, spin1: 4800, dig0: 6600, dig1: 8200, unf0: 8400, unf1: 10600};
  const R_GLOBE = .5, R_FLAT = .42;
  const HANDOFF = T.unf1, GONE = HANDOFF + 1250;
  const DAY = .82, LEVELS = 10;
  let finished = false, raf = 0, globe = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function release(immediate) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    events.abort();
    if (globe) globe.dispose();
    opening.remove();
    if (immediate) map.finishOpening();
  }

  function handoff() {
    map.begin();
    document.documentElement.classList.add('settled');
    opening.classList.add('fade');
    timers.push(setTimeout(() => release(false), GONE - HANDOFF));
  }

  function playPoster() {
    opening.classList.add('poster', 'rolling');
    timers.push(setTimeout(handoff, 2950));
  }

  const easeIO = t => .5 - Math.cos(Math.PI * t) / 2;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  // Sphere position of a map dot: same orthographic projection the globe shader uses.
  function onSphere(lon, lat, lat0, lon0, cx, cy, r) {
    const la = lat * RAD, dl = (lon - lon0) * RAD, l0 = lat0 * RAD;
    const cl = Math.cos(la);
    return {
      x: cx + r * cl * Math.sin(dl),
      y: cy - r * (Math.cos(l0) * Math.sin(la) - Math.sin(l0) * cl * Math.cos(dl)),
      z: Math.sin(l0) * Math.sin(la) + Math.cos(l0) * cl * Math.cos(dl)
    };
  }

  function playGlobe() {
    opening.classList.add('globe', 'rolling');
    const overlay = opening.querySelector('.orbit-dots');
    const ctx = overlay.getContext('2d');
    const miller = window.ZT.geo.millerLat;
    const t0 = performance.now();
    const dLon = (((SANTIAGO.lon - BEIJING.lon) % 360) + 360) % 360;
    // Santiago -> Beijing runs west across the Pacific by the same angle as Beijing -> Santiago runs east.
    const back = dLon;
    let w = 0, h = 0, s = 1, dots = null, stale = true, frames = 0, refreshed = false;
    const stageEl = document.getElementById('stage');

    function size() {
      const cw = innerWidth, ch = innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      s = Math.min(dpr, Math.sqrt(9e6 / (cw * ch)));
      w = Math.round(cw * s);
      h = Math.round(ch * s);
      globe.resize(w, h);
      overlay.width = w;
      overlay.height = h;
      loadDots();
      stale = false;
    }

    // Snapshot of the live map's dots. Taken again right before the unfold so the target is exactly what the map shows at handoff.
    function loadDots() {
      const d = map.dots();
      dots = d && d.n ? d : null;
      if (dots) {
        dots.lat = new Float32Array(dots.n);
        for (let i = 0; i < dots.n; i++) dots.lat[i] = miller(dots.wy[i]);
      }
      refreshed = true;
    }

    function frame(now) {
      if (finished) return;
      const t = now - t0;
      if (stale && ++frames > 2) size();
      else if (!w) size();
      if (!refreshed && t > T.unf0 - 400) loadDots();
      const m = Math.min(w, h);
      const spin = easeIO(seg(t, T.spin0, T.spin1));
      const drift = 1 - smooth(seg(t, 0, T.drift));
      const lat = lerp(SANTIAGO.lat * (1 - .6 * drift), BEIJING.lat, spin);
      const lon = SANTIAGO.lon + 35 * drift - back * spin;
      const r = lerp(R_GLOBE, R_FLAT, smooth(seg(t, T.dig0, T.dig1)));
      const R = m * r;
      const dig = smooth(seg(t, T.dig0, T.dig1));
      const unf = seg(t, T.unf0, T.unf1);
      const fadeIn = smooth(seg(t, 0, 500));
      const gAlpha = fadeIn * (1 - smooth(seg(t, T.unf0, T.unf0 + 700)));
      globe.draw(w / 2, h / 2, R, lat * RAD, lon * RAD, gAlpha, dig, t);
      ctx.clearRect(0, 0, w, h);
      pin(SANTIAGO, [255, 179, 71], seg(t, 400, 1000) * (1 - seg(t, 2500, 2900)), t, lat, lon, R);
      pin(BEIJING, [95, 225, 255], seg(t, 4700, 5300) * (1 - seg(t, 6000, 6500)), t, lat, lon, R);
      if (dots && dig > 0) paint(lat, lon, R, dig, unf);
      if (dig > .5) opening.classList.add('digital');
      if (t < HANDOFF + 100) raf = requestAnimationFrame(frame);
    }

    // Location marker: dot, two expanding rings and a short leader to the caption side.
    function pin(place, c, a, t, lat0, lon0, R) {
      if (a <= .01) return;
      const p = onSphere(place.lon, place.lat, lat0, lon0, w / 2, h / 2, R);
      if (p.z <= 0) return;
      const u = s, col = c.join(',');
      ctx.save();
      ctx.globalAlpha = a;
      for (let k = 0; k < 2; k++) {
        const ph = ((t / 1600) + k * .5) % 1;
        ctx.strokeStyle = 'rgba(' + col + ',' + (.8 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (8 + 34 * ph) * u, 0, 6.2832);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(' + col + ',.85)';
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * u, 0, 6.2832);
      for (let q = 0; q < 4; q++) {
        const dx = Math.cos(q * 1.5708), dy = Math.sin(q * 1.5708);
        ctx.moveTo(p.x + dx * 14 * u, p.y + dy * 14 * u);
        ctx.lineTo(p.x + dx * 22 * u, p.y + dy * 22 * u);
      }
      ctx.stroke();
      ctx.shadowColor = 'rgba(' + col + ',.9)';
      ctx.shadowBlur = 14 * u;
      ctx.fillStyle = 'rgb(' + col + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6 * u, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    function paint(lat0, lon0, R, dig, unf) {
      const n = dots.n, cx = w / 2, cy = h / 2;
      // Map dots are in stage coordinates; the overlay covers the viewport.
      const sr = stageEl.getBoundingClientRect(), ox = sr.left * s, oy = sr.top * s;
      const bins = Array.from({length: LEVELS}, () => []);
      const base = Math.max(1, R * .0045);
      for (let i = 0; i < n; i++) {
        const p = onSphere(dots.wx[i], dots.lat[i], lat0, lon0, cx, cy, R);
        const fx = dots.x[i] * s + ox, fy = dots.y[i] * s + oy;
        // Stagger the unfold from the left edge of the flat map to the right.
        const delay = clamp((dots.x[i] + sr.left) / innerWidth, 0, 1) * .35;
        const e = smooth(clamp((unf - delay) / .65, 0, 1));
        const front = clamp(p.z * 5, 0, 1);
        const vis = lerp(front, 1, e);
        const a = dots.a[i] * DAY * vis * dig;
        if (a < .02) continue;
        const rad = lerp(base * (.4 + .6 * Math.max(p.z, 0)), dots.r[i] * s, e);
        const bin = clamp(Math.round(a / DAY * (LEVELS - 1)), 0, LEVELS - 1);
        bins[bin].push(lerp(p.x, fx, e), lerp(p.y, fy, e), rad);
      }
      for (let b = 0; b < LEVELS; b++) {
        const arr = bins[b];
        if (!arr.length) continue;
        ctx.fillStyle = 'rgba(' + Math.round(lerp(120, 160, unf)) + ',' + Math.round(lerp(190, 186, unf)) + ',' +
          Math.round(lerp(255, 226, unf)) + ',' + ((b / (LEVELS - 1)) * DAY * Math.min(1, dig * 1.2)).toFixed(3) + ')';
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 3) {
          ctx.moveTo(arr[k] + arr[k + 2], arr[k + 1]);
          ctx.arc(arr[k], arr[k + 1], arr[k + 2], 0, 6.2832);
        }
        ctx.fill();
      }
    }

    window.addEventListener('resize', () => { stale = true; frames = 0; refreshed = false; }, listen);
    raf = requestAnimationFrame(frame);
    timers.push(setTimeout(handoff, HANDOFF));
  }

  function start() {
    if (finished) return;
    clearTimeout(failsafe);
    failsafe = setTimeout(() => release(true), HANDOFF + 4000);
    timers.push(failsafe);
    if (globe) playGlobe(); else playPoster();
  }

  function usePoster() {
    globe = null;
    poster.addEventListener('load', start, {once: true, signal: events.signal});
    poster.addEventListener('error', () => release(true), listen);
    poster.sizes = '(max-aspect-ratio: 1/1) 166vw, max(101vw, 152vh)';
    poster.srcset = 'assets/orbit-1280.webp 1280w, assets/orbit-2160.webp 2160w, assets/orbit-4096.webp 4096w';
    poster.src = 'assets/orbit-1280.webp';
  }

  window.ZT_openingReady = true;
  document.documentElement.classList.add('is-opening');
  skip.addEventListener('click', () => release(true), listen);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') release(true);
    if (e.key === 'Tab' && opening.classList.contains('rolling') && !opening.classList.contains('fade')) {
      e.preventDefault();
      skip.focus();
    }
  }, listen);
  window.addEventListener('hashchange', () => release(true), listen);
  motion.addEventListener('change', e => { if (e.matches) release(true); }, listen);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(true); }, listen);
  let failsafe = setTimeout(() => release(true), 20000);
  timers.push(failsafe);

  try {
    globe = window.ZTGlobe && window.ZTGlobe.create(canvas);
  } catch (err) {
    globe = null;
  }
  if (globe) {
    globe.load().then(start, () => { if (!finished) { if (globe) globe.dispose(); usePoster(); } });
  } else {
    usePoster();
  }
})();
