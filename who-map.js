/* ==========================================================================
   NovaTerra — "Who We Are" footprint figure

   The static counterpart to the intro: the same generated dot-matrix world,
   cropped to the band that holds all six markets and frozen mid-thought.

   It reads window.NOVATERRA_INTRO rather than shipping its own copy of the
   geometry. That file is already loaded by the time this runs, so the figure
   costs no extra bytes — and, more to the point, the two views can never drift
   apart about where a market is, which is the whole reason the intro's markers
   were moved off country centroids and onto real trading addresses.
   ========================================================================== */
(() => {
  const root = document.querySelector('[data-who-map]');
  const stage = root && root.querySelector('[data-who-map-stage]');
  const DATA = window.NOVATERRA_INTRO;
  if (!stage || !DATA || !DATA.rows) return;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  };

  /* ------------------------------------------------------------- the frame
     Not the crop the build script frames for the markets (intro-data.js
     viewBoxZoom, which the intro no longer uses). That one is cut for a
     full-bleed hero and is far taller than the markets need: it carried 84 map
     units of empty ocean under South Africa, which at figure scale was a dead
     third of the frame.

     This box is cut to the market spread, but not tightly. The first pass cut
     to the markers themselves and the figure could not be labelled: the dot
     field ran to every edge, so SOUTH AFRICA, ZIMBABWE, GUYANA and SURINAME
     had no clear position anywhere in the frame — every candidate either sat
     on dots or threw a leader across half a continent. The map needs water
     next to a port before a label can go beside it, and this frame is the
     smallest one that has it:

       x 265  South America's north coast starts at 294, so 29 units of
              Atlantic — nothing is sliced mid-continent the way the old
              350 edge sliced Colombia and Venezuela.
       x 830  the Arabian peninsula ends at 796, and India's first dot is at
              827; the edge falls in the Arabian Sea and cuts neither.
       y 250  just above Africa's Mediterranean coast (256), so the coast
              itself is inside the frame rather than decapitated by it.
       y 545  South Africa's own dots run to 494.6 and the Cape to 501,
              leaving 44 units of Southern Ocean for the hub label to live in.

     The aspect that falls out of this is 1.915, against the old 2.119 — the
     figure is ~55px taller, which is the price of six readable labels. */
  const BOX = [265, 250, 565, 295];
  const [bx, by, bw, bh] = BOX;
  const GRID = DATA.grid;

  /* ------------------------------------------------------------- the markets
     dx/dy are map units from the marker to the point the label hangs on;
     anchor is which end of the text sits there. Declared here rather than down
     with the labels because the markers, the rings, the outlines and the
     leaders all need the same slug, and the slug is built from the label text:
     Dubai is the United Arab Emirates node, so its slug cannot come from the
     node's own name. */
  const LABELS = {
    Guyana: { dx: 29, dy: -13, anchor: 'start' },
    Suriname: { dx: 66, dy: 7, anchor: 'start' },
    Ghana: { dx: -12, dy: 19, anchor: 'start' },
    Zimbabwe: { dx: 32, dy: -44, anchor: 'start' },
    'South Africa': { dx: 15, dy: 15, anchor: 'start', hub: true },
    'United Arab Emirates': { dx: -2, dy: 17, anchor: 'start', text: 'Dubai' },
  };

  /* Only the UAE is renamed for display, so this is a short list rather than a
     second copy of the table. */
  const LABEL_TEXT = { 'United Arab Emirates': 'Dubai' };
  const slugOf = (name) =>
    (LABEL_TEXT[name] || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const svg = el('svg', { viewBox: BOX.join(' '), 'aria-hidden': 'true', focusable: 'false' });
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  // The stage's ratio comes from the box, so the two can never disagree.
  stage.style.setProperty('--map-aspect', (bw / bh).toFixed(4));

  /* Code 1 is world land, 2 is Africa, 3 the markets' own countries. Drawn as
     one path per code rather than per dot: 70 rows of squares would otherwise
     be several thousand nodes for a figure that never animates individually. */
  const dotsByCode = (code) => {
    const size = GRID.dot;
    const d = [];
    DATA.rows.forEach((row, r) => {
      const y = (GRID.y0 + r * GRID.stepY).toFixed(1);
      for (let c = 0; c < row.length; c++) {
        if (row.charCodeAt(c) - 48 !== code) continue;
        const x = (GRID.x0 + c * GRID.stepX).toFixed(1);
        d.push(`M${x} ${y}h${size}v${size}h-${size}z`);
      }
    });
    return d.join('');
  };

  /* The graticule and the intro's arcs are both deliberately absent. At this
     size the graticule's straight rules read as crop marks rather than as a
     grid, and the arcs — hairlines of sage over a sage dot field — measured as
     invisible. The network motif belongs to the intro, where it is the whole
     point and runs at full screen; here the six markers carry it. */
  svg.appendChild(el('path', { class: 'who-map__grid', d: dotsByCode(1) }));
  svg.appendChild(el('path', { class: 'who-map__africa', d: dotsByCode(2) }));
  svg.appendChild(el('path', { class: 'who-map__focus', d: dotsByCode(3) }));

  /* Country outlines for the three focus markets. At this crop the national
     boundary is the only thing that reads at a glance, and a filled shape would
     fight the dot field. */
  const outlines = el('g');
  for (const name in DATA.outlines) {
    outlines.appendChild(el('path', {
      class: 'who-map__outline',
      'data-market': slugOf(name),
      d: DATA.outlines[name].d,
    }));
  }
  svg.appendChild(outlines);

  const marks = el('g');
  const half = 2.6;
  for (const name in DATA.nodes) {
    const node = DATA.nodes[name];
    const focus = !!node.focus;
    const slug = slugOf(name);
    const s = focus ? half : half * 0.72;
    // A square rotated to a diamond for the three focus markets, a plain square
    // for the rest: the same distinction the intro draws with node size.
    const shape = focus
      ? `M${node.x} ${node.y - s}L${node.x + s} ${node.y}L${node.x} ${node.y + s}L${node.x - s} ${node.y}Z`
      : `M${node.x - s} ${node.y - s}h${s * 2}v${s * 2}h${-s * 2}z`;

    /* The hit target comes first so the marker sits on top of it. A marker is
       about seven map units across — eight pixels at figure scale — which is far
       too small to point at; this is the same shape inflated to something a
       cursor can find. */
    marks.appendChild(el('circle', {
      class: 'who-map__hit', 'data-market': slug, cx: node.x, cy: node.y, r: focus ? 16 : 13,
    }));
    marks.appendChild(el('path', {
      class: focus ? 'who-map__node' : 'who-map__node who-map__node--related',
      'data-market': slug,
      d: shape,
    }));
  }
  svg.appendChild(marks);
  stage.appendChild(svg);

  /* ---------------------------------------------------------------- labels */
  /* HTML rather than SVG text, so the type keeps a fixed size when the figure
     shrinks. Positioned in percentages of the crop, with a per-market offset in
     map units — every one of them placed into open water and joined to its
     marker by a leader, because there is no room for a label *on* this map:
     South Africa's node sits 30 units inside its own dot field and Zimbabwe's
     is landlocked, so anything set beside them lands on dots.

     The water each one uses, and why:
       Guyana / Suriname  the two nodes are ten map units apart, so their
                          labels cannot both sit beside them. Both go out into
                          the Atlantic — Guyana's above the Guianas, Suriname's
                          below the equator — so the leaders diverge instead of
                          crossing, and neither crosses the other's label.
       Ghana              south into the Gulf of Guinea, in clear water below
                          the coast it trades from.
       Zimbabwe           east across the Mozambique Channel, held north of
                          Madagascar (which occupies 84.6-88.8% across and
                          58.9-74% down, and would otherwise catch the label).
       South Africa       south-east into the Southern Ocean under the Cape.
       Dubai              south into the Arabian Sea.

     dx/dy are map units from the marker; anchor is which end of the text sits
     on that point. The table itself is declared up with the frame, because the
     markers need the same slugs the labels do. */

  const pct = (x, y) => [
    ((x - bx) / bw) * 100,
    ((y - by) / bh) * 100,
  ];

  /* No leaders and no rings. Both were annotation on top of a figure that
     already says where each market is: a ring around a marker six pixels wide
     is a second mark for the same fact, and a rule from a marker to its own
     label is a line the eye draws anyway once the two are near each other. What
     is left is the dot field, six markers and six names. */
  const placed = [];

  for (const name in LABELS) {
    const node = DATA.nodes[name];
    if (!node) continue;
    const spec = LABELS[name];
    const [px, py] = pct(node.x + spec.dx, node.y + spec.dy);

    const slug = slugOf(name);
    const label = document.createElement('span');
    label.className = spec.hub ? 'who__map-label who__map-label--hub' : 'who__map-label';
    label.dataset.market = slug;
    label.textContent = spec.text || name;
    label.style.left = `${px}%`;
    label.style.top = `${py}%`;
    label.style.transform = spec.anchor === 'end'
      ? 'translate(-100%, -50%)'
      : 'translate(0, -50%)';
    stage.appendChild(label);
    placed.push({ label, anchor: spec.anchor || 'start' });
  }

  /* A label hangs on a percentage of the frame but is sized in pixels, so the
     narrower the figure the further it reaches past its anchor — Dubai hangs
     91% of the way across and a phone pushes it off the right edge, where it is
     clipped mid-word. Nothing here re-anchors a label; it only gives back the
     few pixels by which the text left the frame, which is why the leader still
     points where it always did.

     Hidden labels have no box to measure, so this is skipped for them and run
     again for the one that a tap brings back. */
  const keepInside = () => {
    const frame = stage.getBoundingClientRect();
    if (!frame.width) return;
    placed.forEach(({ label, anchor }) => {
      const box = label.getBoundingClientRect();
      if (!box.width) return;
      const spill = anchor === 'end'
        ? frame.left - box.left
        : box.right - frame.right;
      // Eight pixels of inset, so a label pulled back off the edge is not left
      // flush against it.
      const shift = spill > 0.5 ? `${anchor === 'end' ? spill + 8 : -(spill + 8)}px` : '';
      if (label.style.marginLeft !== shift) label.style.marginLeft = shift;
    });
  };

  keepInside();
  /* The webfont decides the widths, and a resize moves the edges. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(keepInside);
  let fitFrame = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(keepInside);
  }, { passive: true });

  /* ------------------------------------------------------------ interaction
     The legend and the map are one object with two ends, so pointing at either
     lights the same market. Every element above carries its slug, which means
     neither end needs a list of the other's parts.

     This is an enhancement, not a control: the key already names all six
     markets and their roles in text, so nothing here is load-bearing. That is
     also why the rows are not focusable — six tab stops that do nothing but
     restyle a decorative figure is a cost paid by every keyboard user to reach
     the links that come after it, for no information they do not already have.

     Hover is for pointers that have one; a click pins the highlight, which is
     what makes it work under touch, where there is no hover to give. */
  const rows = [...root.querySelectorAll('.who__markets [data-market]')];
  const parts = [...stage.querySelectorAll('[data-market]')];
  let pinned = null;
  let current = null;

  const setActive = (slug) => {
    root.classList.toggle('has-active', !!slug);
    parts.forEach((part) => part.classList.toggle('is-active', part.dataset.market === slug));
    rows.forEach((row) => row.classList.toggle('is-active', row.dataset.market === slug));
    /* After the classes, not before: a phone holds the labels back, so the tap
       that names a market is also the first moment its label has a width to be
       measured against the frame. */
    if (slug !== current) { current = slug; keepInside(); }
  };

  if (rows.length && parts.length) {
    const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;

    rows.forEach((row) => {
      const slug = row.dataset.market;
      if (hover) {
        row.addEventListener('pointerenter', () => { if (!pinned) setActive(slug); });
        row.addEventListener('pointerleave', () => { if (!pinned) setActive(null); });
      }
      row.addEventListener('click', () => {
        pinned = pinned === slug ? null : slug;
        setActive(pinned);
      });
    });

    /* On the map the events land on whichever part is on top — hit circle,
       marker, ring or outline — so the handler reads the slug off whatever was
       entered rather than wiring each one. Crossing open water between two
       markers finds no slug and drops the highlight, which is why this clears
       rather than only setting: a highlight that survived the pointer leaving
       the marker would read as a stuck state. */
    stage.addEventListener('pointerover', (event) => {
      if (!hover || pinned) return;
      const part = event.target.closest('[data-market]');
      setActive(part ? part.dataset.market : null);
    });
    stage.addEventListener('pointerleave', () => { if (!pinned) setActive(null); });

    stage.addEventListener('click', (event) => {
      const part = event.target.closest('[data-market]');
      if (!part) return;
      const slug = part.dataset.market;
      pinned = pinned === slug ? null : slug;
      setActive(pinned);
    });

    /* A tap anywhere else in the section puts the pin back down. */
    document.addEventListener('pointerdown', (event) => {
      if (root.contains(event.target)) return;
      if (pinned) { pinned = null; setActive(null); }
    });
  }

  /* One reveal, once. Re-observing would re-run the fade on every scroll past
     the section, which reads as a glitch rather than an entrance. */
  const reveal = () => root.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { reveal(); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      reveal();
      io.disconnect();
    });
  }, { rootMargin: '-12% 0px -18% 0px' });
  io.observe(root);
})();
