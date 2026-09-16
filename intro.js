/* ==========================================================================
   NovaTerra — intro animation

   A dot-matrix world map assembles behind a hairline scan, resolves to the
   three African markets the site names, and holds still while the network arcs
   draw out from the head office. The overlay lifts away on a diagonal to reveal
   the hero.

   The map does not move. It used to push in on the markets once the labels had
   landed, which meant the frame was still travelling under the arcs and the one
   thing the sequence is about — six fixed points and the lines between them —
   was the only thing on screen not holding still.

   Geometry comes from intro-data.js (generated — see tools/build-intro-data.py).
   Everything is drawn in map units, but type, stroke weights and node marks are
   counter-scaled against the live frame so they keep a constant on-screen size
   at any viewport. That counter-scale is also what lets the labels stay legible
   at the full world view, which is now the only view there is.

   The intro is decorative and never gates content: it is skipped outright under
   prefers-reduced-motion, and any click, key, scroll or touch dismisses it.
   ========================================================================== */

(() => {
  const DATA = window.NOVATERRA_INTRO;
  const overlay = document.querySelector('[data-intro]');
  if (!overlay) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const shell = document.documentElement;
  const header = document.querySelector('.site-header');
  const main = document.querySelector('main');

  let finished = false;
  const release = () => {
    shell.classList.remove('is-intro');
    if (overlay.parentNode) overlay.remove();
    [header, main].forEach((node) => { if (node) node.inert = false; });
  };

  if (!DATA || !DATA.rows || reduce.matches) { release(); return; }

  shell.classList.add('is-intro');
  [header, main].forEach((node) => { if (node) node.inert = true; });

  /* ------------------------------------------------------------------ setup */
  const stage = overlay.querySelector('[data-intro-stage]');
  const skip = overlay.querySelector('[data-intro-skip]');

  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  };

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const [VW, VH] = DATA.viewBox;
  const WORLD = [0, 0, VW, VH];
  const GRID = DATA.grid;
  const BANDS = 18;               // vertical strips the scan reveals
  const SCAN_SOFT = 190;          // map units of soft edge on the scan
  const ROT = -9;                 // scan tilt, degrees
  const ROT_AT = `${VW / 2} ${VH / 2}`;

  const bandPaths = (code) => {
    const out = Array.from({ length: BANDS }, () => []);
    const size = GRID.dot;
    DATA.rows.forEach((row, r) => {
      const y = (GRID.y0 + r * GRID.stepY).toFixed(1);
      for (let c = 0; c < row.length; c++) {
        if (row.charCodeAt(c) - 48 !== code) continue;
        const x = GRID.x0 + c * GRID.stepX;
        const band = Math.min(BANDS - 1, Math.floor((x / VW) * BANDS));
        out[band].push(`M${x.toFixed(1)} ${y}h${size}v${size}h-${size}z`);
      }
    });
    return out.map((parts) => parts.join(''));
  };

  const quadratic = (p0, cp, p1, t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0],
            u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1]];
  };

  /* ------------------------------------------------------------------- draw */
  const svg = el('svg', {
    class: 'site-intro__map', viewBox: WORLD.join(' '),
    'aria-hidden': 'true', focusable: 'false',
  });
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

  const gGrat = el('g', { class: 'site-intro__layer site-intro__graticule' });
  gGrat.appendChild(el('path', { d: DATA.graticule }));
  svg.appendChild(gGrat);

  const gWorld = el('g', { class: 'site-intro__layer site-intro__world' });
  const worldBands = bandPaths(1).map((d) => {
    const path = el('path', { d });
    gWorld.appendChild(path);
    return path;
  });
  svg.appendChild(gWorld);

  const gAfrica = el('g', { class: 'site-intro__layer site-intro__africa' });
  gAfrica.appendChild(el('path', { d: bandPaths(2).join('') }));
  svg.appendChild(gAfrica);

  const gFocus = el('g', { class: 'site-intro__layer site-intro__focus-dots' });
  gFocus.appendChild(el('path', { d: bandPaths(3).join('') }));
  svg.appendChild(gFocus);

  const gOutlines = el('g', { class: 'site-intro__layer site-intro__outlines' });
  for (const name in DATA.outlines) {
    const outline = DATA.outlines[name];
    gOutlines.appendChild(el('path', { d: outline.d, pathLength: 1 }));
  }
  svg.appendChild(gOutlines);

  const gArcs = el('g', { class: 'site-intro__layer site-intro__arcs' });
  const arcPaths = DATA.arcs.map((arc) => {
    const path = el('path', { d: arc.d, pathLength: 1, class: arc.focus ? 'is-focus' : '' });
    gArcs.appendChild(path);
    return path;
  });
  const gPulses = el('g', { class: 'site-intro__layer site-intro__pulses' });
  const pulses = DATA.arcs.map(() => {
    const dot = el('circle', { cx: -999, cy: -999, opacity: 0 });
    gPulses.appendChild(dot);
    return dot;
  });
  svg.appendChild(gArcs);
  svg.appendChild(gPulses);

  const gNodes = el('g', { class: 'site-intro__layer site-intro__nodes' });
  const nodeMarks = [];
  for (const name in DATA.nodes) {
    const data = DATA.nodes[name];
    const frame = el('g', { transform: `translate(${data.x} ${data.y})` });
    const inner = el('g', { class: `site-intro__node ${data.focus ? 'is-focus' : ''}` });
    const size = data.focus ? 8 : 5.5;
    inner.appendChild(el('rect', { x: -size / 2, y: -size / 2, width: size, height: size }));
    if (data.focus) {
      inner.appendChild(el('rect', {
        class: 'site-intro__node-ring',
        x: -size, y: -size, width: size * 2, height: size * 2,
      }));
    }
    frame.appendChild(inner);
    gNodes.appendChild(frame);
    nodeMarks.push({ data, frame, inner });
  }
  svg.appendChild(gNodes);

  const gLabels = el('g', { class: 'site-intro__layer site-intro__labels' });
  const labelMarks = [];
  for (const name in DATA.nodes) {
    const data = DATA.nodes[name];
    if (!data.labelDir) continue;
    // x2/y2 are placeholders; applyCamera sets them once the frame is measured.
    const leader = el('line', {
      class: 'site-intro__leader',
      x1: data.x, y1: data.y, x2: data.x, y2: data.y,
    });
    const group = el('g', { class: 'site-intro__label' });
    const head = el('text', { class: 'site-intro__label-head', x: 0, y: 0 });
    head.textContent = data.label;
    const sub = el('text', { class: 'site-intro__label-sub', x: 0, y: 15 });
    sub.textContent = data.sub;
    group.appendChild(head);
    group.appendChild(sub);
    gLabels.appendChild(leader);
    gLabels.appendChild(group);
    labelMarks.push({ data, group, leader });
  }
  svg.appendChild(gLabels);

  // Measured once the glyphs are laid out. Each label group is scaled so that
  // one local unit is one screen pixel, so its bbox is the on-screen extent the
  // clamping in applyCamera works in. Re-measured when the webfont lands, since
  // the fallback face has different metrics.
  const measureLabels = () => {
    labelMarks.forEach(({ data, group }) => {
      const rect = group.getBBox();
      data.labelW = rect.width;
      data.labelTop = rect.y;
      data.labelBottom = rect.y + rect.height;
    });
  };
  measureLabels();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measureLabels(); applyCamera(WORLD); });
  }

  // A single crisp hairline, no bloom: the softness belongs to the band reveal
  // behind it, and a glow would fight the site's hairline-rule language.
  const scan = el('line', {
    class: 'site-intro__scan',
    x1: 0, y1: -VH, x2: 0, y2: VH * 2,
    transform: `rotate(${ROT} ${ROT_AT})`,
  });
  svg.appendChild(scan);

  stage.appendChild(svg);

  /* ------------------------------------------------- camera, type, strokes */
  const fitMode = () => (stage.clientWidth / stage.clientHeight >= 1.2 ? 'slice' : 'meet');

  const mapScale = (box) => {
    const sx = stage.clientWidth / box[2];
    const sy = stage.clientHeight / box[3];
    return fitMode() === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
  };

  const applyCamera = (box) => {
    svg.setAttribute('viewBox', box.map((v) => v.toFixed(2)).join(' '));
    svg.setAttribute('preserveAspectRatio', `xMidYMid ${fitMode()}`);

    const scale = mapScale(box);
    // Everything that should hold a constant pixel size is counter-scaled:
    // hairlines via --hair, type and node marks via an explicit 1/scale flip.
    svg.style.setProperty('--hair', (1 / scale).toFixed(5));
    const labelScale = stage.clientWidth < 700 ? 0.78 : 1;
    const k = (1 / scale) * labelScale;

    // viewBox -> screen, mirroring preserveAspectRatio="xMidYMid <fit>": the
    // scaled box is centred, so the offsets are positive on a letterboxed
    // viewport and negative on a cropped one. Labels are positioned in screen
    // space and converted back, because that is the space they are specified in.
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const ox = (W - box[2] * scale) / 2;
    const oy = (H - box[3] * scale) / 2;
    const toScreen = (mx, my) => [(mx - box[0]) * scale + ox, (my - box[1]) * scale + oy];
    const toMap = (sx, sy) => [box[0] + (sx - ox) / scale, box[1] + (sy - oy) / scale];

    labelMarks.forEach(({ data, group, leader }) => {
      // The label sits a fixed number of screen pixels from its node, so the
      // composition is unchanged by the camera push. Storing this in map units
      // would multiply it by the zoom and fling the labels off the frame.
      const [dx0, dy] = data.labelDir;
      const [nx, ny] = toScreen(data.x, data.y);
      const w = data.labelW * labelScale;
      const margin = 10;

      // Mirror the offset when the text would run off the frame. Nothing else
      // holds a label in: it is a fixed screen distance from its node, so on a
      // narrow viewport the rightmost market used to run off the edge.
      const edge = (d) => nx + d * data.labelPx;
      const fits = (d) => (d > 0 ? edge(d) + w <= W - margin : edge(d) - w >= margin);
      const dx = !fits(dx0) && fits(-dx0) ? -dx0 : dx0;

      // Then clamp, so a label with no room on either side still stays inside.
      const anchor = dx > 0 ? 'start' : 'end';
      const rawX = edge(dx);
      const lx = dx > 0 ? Math.min(rawX, W - margin - w) : Math.max(rawX, margin + w);
      const ly = Math.min(
        Math.max(ny + dy * data.labelPx, margin - data.labelTop * labelScale),
        H - margin - data.labelBottom * labelScale,
      );

      const [mx, my] = toMap(lx, ly);
      group.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)}) scale(${k})`);

      // The text is anchored by its near edge, so a fixed gap clears the
      // glyphs; anchoring by the centre would run the rule through the word.
      group.firstChild.setAttribute('text-anchor', anchor);
      group.lastChild.setAttribute('text-anchor', anchor);

      const [ex, ey] = toMap(lx - dx * 14, ly - dy * 14);
      leader.setAttribute('x2', ex.toFixed(1));
      leader.setAttribute('y2', ey.toFixed(1));
    });

    nodeMarks.forEach(({ data, frame }) => {
      frame.setAttribute('transform', `translate(${data.x} ${data.y}) scale(${k})`);
    });

    pulses.forEach((dot) => dot.setAttribute('r', (2.6 / scale).toFixed(3)));
  };

  applyCamera(WORLD);

  /* ---------------------------------------------------------------- ticking */
  const t0 = performance.now();
  const raf = new Set();
  const timers = [];

  const tween = (ms, ease, update, done, delay = 0) => {
    const state = { id: 0, dead: false };
    const start = t0 + delay;
    const step = (now) => {
      if (state.dead) return;
      const t = clamp01((now - start) / ms);
      update(ease(t), t);
      if (t < 1) state.id = requestAnimationFrame(step);
      else { raf.delete(state); if (done) done(); }
    };
    state.id = requestAnimationFrame(step);
    raf.add(state);
    return state;
  };

  const after = (ms, fn) => {
    timers.push(setTimeout(() => { if (!finished) fn(); }, ms));
  };

  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
    raf.forEach((state) => { state.dead = true; cancelAnimationFrame(state.id); });
    raf.clear();
  };

  /* --------------------------------------------------------------- timeline */
  const T = {
    live: 60,
    scanFor: 1150,
    africa: 1080,
    focus: 1240,
    outlines: 1380,
    labels: 1680,
    skip: 900,
    nodes: 2580,
    arcs: 2820,
    arcStagger: 110,
    arcDraw: 620,
    pulse: 480,
    caption: 3000,
    // The network is the payoff, so the exit waits for it: the last arc
    // finishes at arcs + arcStagger*(n-1) + arcDraw = 3880, and its pulse
    // lands at 4360. Leaving at 3480 cut the whole sequence off mid-draw.
    exit: 4450,
  };

  // 1 — the scan assembles the world, band by band, in step with the hairline
  after(T.live, () => overlay.classList.add('is-live'));
  after(T.live + 20, () => {
    overlay.classList.add('is-scanning');
    tween(T.scanFor, easeInOut, (v) => {
      const x = (-SCAN_SOFT + v * (VW + SCAN_SOFT * 2)).toFixed(1);
      scan.setAttribute('x1', x);
      scan.setAttribute('x2', x);
      for (let i = 0; i < worldBands.length; i++) {
        const edge = (i / BANDS) * VW;
        worldBands[i].style.opacity = clamp01((x - edge) / SCAN_SOFT).toFixed(3);
      }
    }, () => {
      // Drop is-scanning as well: it and is-scan-done have equal specificity,
      // so leaving both on would make the hairline's fate depend on source
      // order. Removing it means the scan is hidden unconditionally.
      overlay.classList.remove('is-scanning');
      overlay.classList.add('is-scan-done');
    });
  });

  // 2 — Africa resolves out of the world, then the three named markets
  after(T.africa, () => overlay.classList.add('is-africa'));
  after(T.focus, () => overlay.classList.add('is-focus'));
  after(T.outlines, () => overlay.classList.add('is-outlines'));
  after(T.labels, () => overlay.classList.add('is-labels'));
  after(T.skip, () => overlay.classList.add('is-skip'));

  // 3 — the camera no longer pushes in. It used to, once the labels had landed;
  // the world now holds at full frame for the rest of the sequence, so the arcs
  // draw against a still map.

  // 4 — nodes pop, then the network draws out of the head office
  after(T.nodes, () => overlay.classList.add('is-nodes'));
  after(T.arcs, () => {
    overlay.classList.add('is-arcs');
    arcPaths.forEach((path, i) => { path.style.transitionDelay = `${i * T.arcStagger}ms`; });

    const span = T.arcDraw + (DATA.arcs.length - 1) * T.arcStagger;
    const starts = DATA.arcs.map((_, i) => T.arcs + i * T.arcStagger);
    tween(span + T.pulse, (t) => t, (_, raw) => {
      const now = t0 + raw * (span + T.pulse);
      DATA.arcs.forEach((arc, i) => {
        const local = clamp01((now - starts[i]) / T.pulse);
        const dot = pulses[i];
        if (local <= 0 || local >= 1) { dot.setAttribute('opacity', '0'); return; }
        const flat = arc.d.replace('M', '').replace('Q', ' ').trim().split(/\s+/).map(Number);
        const point = quadratic([flat[0], flat[1]], [flat[2], flat[3]], [flat[4], flat[5]], local);
        dot.setAttribute('cx', point[0].toFixed(1));
        dot.setAttribute('cy', point[1].toFixed(1));
        dot.setAttribute('opacity', (Math.sin(local * Math.PI) * 0.85).toFixed(3));
      });
    });
  });

  after(T.caption, () => overlay.classList.add('is-caption'));

  /* ------------------------------------------------------------- dismissal */
  let leaving = false;

  const onKey = (event) => {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') leave();
  };
  const onIntent = () => leave();
  const onResize = () => applyCamera(WORLD);

  function listeners(off) {
    const bind = off ? 'removeEventListener' : 'addEventListener';
    window[bind]('keydown', onKey);
    window[bind]('wheel', onIntent, { passive: true });
    window[bind]('touchstart', onIntent, { passive: true });
    window[bind]('resize', onResize, { passive: true });
  }

  function leave() {
    if (leaving || finished) return;
    leaving = true;
    clearAll();
    overlay.classList.add('site-intro--out');
    setTimeout(() => {
      if (finished) return;
      finished = true;
      listeners(true);
      release();
    }, 880);
  }

  listeners(false);
  after(T.exit, leave);

  if (skip) {
    skip.addEventListener('click', (event) => { event.stopPropagation(); leave(); });
  }
  overlay.addEventListener('click', leave);
  addEventListener('pagehide', () => { finished = true; clearAll(); release(); });

  // Half-applied state must never survive a mid-intro reload.
  addEventListener('beforeunload', () => { clearAll(); });
})();
