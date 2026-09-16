/* ==========================================================================
   NovaTerra — merged behaviour
   01 footer year      (new)
   02 film             (new)
   03 mobile menu      (Handoff 01, unchanged)
   04 divisions accordion (Handoff 03, adapted)
   05 scroll reveals   (new)
   ========================================================================== */

/* --------------------------------------------------------------------------
   Footer year

   The markup carries a plain year so the line reads correctly without JS; this
   only keeps it from going stale.
   -------------------------------------------------------------------------- */
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

/* --------------------------------------------------------------------------
   Film

   The hero asks for autoplay in its markup, because that is the right default:
   without JS it still runs. The mandate film sits below the fold, so it is not
   allowed to pull 1.5MB on first paint — it carries preload="none" and no
   autoplay, and is started here when it comes into view and paused again when
   it leaves, which also stops it decoding in a tab nobody is looking at.

   Under reduced-motion neither plays: every film is left standing on its poster
   frame, so no slot is ever an empty box. Written against the attribute and the
   hook rather than a list of ids, so a film added later is covered for free.
   -------------------------------------------------------------------------- */
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const lazyFilms = [...document.querySelectorAll('[data-video-on-view]')];

if (prefersReducedMotion.matches) {
  document.querySelectorAll('video[autoplay]').forEach((video) => {
    video.removeAttribute('autoplay');
    video.pause();
  });
} else if (lazyFilms.length && 'IntersectionObserver' in window) {
  const filmObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        // play() rejects when the browser declines; the poster simply stays.
        const started = video.play();
        if (started) started.catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.25 });
  lazyFilms.forEach((video) => filmObserver.observe(video));
}

/* --------------------------------------------------------------------------
   Mobile menu
   -------------------------------------------------------------------------- */
const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.mobile-menu');

toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
  menu.classList.toggle('open', !open);
});

menu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    menu.classList.remove('open');
  });
});

/* --------------------------------------------------------------------------
   "What We Do" divisions accordion

   One division is open at any time. A transition animates the outgoing and
   incoming panel as a single state change; a monotonically increasing token
   discards the tail of any transition that a newer interaction interrupts, so
   rapid input can never leave stale inline heights or two open panels.

   Desktop pointers open a division on hover intent; click and the keyboard
   pattern still work everywhere (touch included), and hovering never moves
   focus. The open division is never reverted to closed on pointer leave —
   exactly one panel stays open at all times.
   -------------------------------------------------------------------------- */
(() => {
  const root = document.querySelector('[data-accordion]');
  if (!root) return;

  const items = [...root.querySelectorAll('[data-item]')];
  const buttons = items.map((item) => item.querySelector('button'));
  const panels = items.map((item) => item.querySelector('.division__panel'));
  const inners = panels.map((panel) => panel.querySelector('.division__inner'));
  const controls = items.map((item) => item.querySelector('.division__control'));
  const nodes = [...root.querySelectorAll('.divisions__progress i')];

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 820px)');
  const hoverCapable = matchMedia('(hover: hover) and (pointer: fine)');
  const EASING = 'cubic-bezier(.22, 1, .36, 1)';
  const HOVER_INTENT = 120;
  const duration = () => (compact.matches ? 400 : 520);

  let active = 0;
  let sequence = 0;
  let resizeFrame = 0;
  let hoverTimer = 0;

  const cancelAnimations = (element) => element.getAnimations().forEach((animation) => animation.cancel());

  const applyState = (index) => {
    items.forEach((item, i) => item.classList.toggle('is-active', i === index));
    buttons.forEach((button, i) => button.setAttribute('aria-expanded', String(i === index)));
    controls.forEach((control, i) => { control.textContent = i === index ? '−' : '+'; });
    nodes.forEach((node, i) => node.classList.toggle('is-active', i === index));
  };

  const collapse = (index) => {
    const panel = panels[index];
    cancelAnimations(panel);
    cancelAnimations(inners[index]);
    items[index].classList.remove('is-closing');
    panel.style.overflow = '';
    panel.style.height = '0px';
    panel.style.opacity = '0';
  };

  /* Commit a resting state for every panel: no inline height left behind by an
     interrupted animation, no panel left rendering while it should be hidden. */
  const settle = () => {
    items.forEach((item, i) => {
      if (i === active) {
        const panel = panels[i];
        cancelAnimations(panel);
        cancelAnimations(inners[i]);
        item.classList.remove('is-closing');
        panel.style.overflow = '';
        panel.style.height = 'auto';
        panel.style.opacity = '1';
      } else {
        collapse(i);
      }
    });
  };

  /* On small screens, opening a lower row can push its own header off-screen.
     Nudge only when that actually happened, never on every interaction. */
  const keepHeaderInView = (item) => {
    if (!compact.matches) return;
    const header = item.querySelector('button');
    const top = header.getBoundingClientRect().top;
    if (top < 12) window.scrollBy({ top: top - 12, behavior: 'smooth' });
  };

  const transitionTo = (next) => {
    // A click or keypress supersedes any hover intent still pending.
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
    if (next === active) return;

    const token = ++sequence;
    const previous = active;
    const oldItem = items[previous];
    const newItem = items[next];
    const oldPanel = panels[previous];
    const newPanel = panels[next];

    // Read before write: capture the outgoing panel at its current live height.
    const oldHeight = oldPanel.getBoundingClientRect().height;

    // Any panel orphaned by an earlier interrupted transition is already meant
    // to be closed, so close it outright rather than leaving a half state.
    items.forEach((item, i) => {
      if (i !== previous && i !== next) collapse(i);
    });

    cancelAnimations(oldPanel);
    cancelAnimations(newPanel);
    cancelAnimations(inners[previous]);
    cancelAnimations(inners[next]);

    // The outgoing panel keeps rendering until its exit animation completes.
    oldItem.classList.add('is-closing');
    active = next;
    applyState(next);

    // The incoming panel is displayed now, so its natural height is measurable.
    const newHeight = newPanel.scrollHeight;

    oldPanel.style.overflow = 'clip';
    newPanel.style.overflow = 'clip';
    oldPanel.style.height = `${oldHeight}px`;
    newPanel.style.height = '0px';
    newPanel.style.opacity = '0';

    if (reduceMotion.matches) {
      oldPanel.style.height = '0px';
      oldPanel.style.opacity = '0';
      newPanel.style.height = 'auto';
      newPanel.style.opacity = '1';
      settle();
      return;
    }

    const ms = duration();

    const exit = oldPanel.animate(
      [{ height: `${oldHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: ms, easing: EASING, fill: 'forwards' }
    ).finished.catch(() => {});

    const enter = newPanel.animate(
      [{ height: '0px', opacity: 0 }, { height: `${newHeight}px`, opacity: 1 }],
      { duration: ms, easing: EASING, fill: 'forwards' }
    ).finished.catch(() => {});

    inners[next].animate(
      [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: ms, easing: EASING, fill: 'both' }
    ).finished.catch(() => {});

    Promise.all([exit, enter]).then(() => {
      if (token !== sequence) return; // a newer interaction owns the state now
      settle();
      keepHeaderInView(newItem);
    });
  };

  /* Hover intent, desktop pointers only. The short delay keeps the track from
     flickering as the pointer travels across it; leaving a division cancels a
     pending open but never closes the one already open. */
  items.forEach((item, index) => {
    item.addEventListener('pointerenter', (event) => {
      if (!hoverCapable.matches || event.pointerType !== 'mouse') return;
      if (index === active || hoverTimer) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = 0;
        transitionTo(index);
      }, HOVER_INTENT);
    });

    item.addEventListener('pointerleave', () => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
    });
  });

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => transitionTo(index));
    button.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = (index + 1) % buttons.length;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].focus();
    });
  });

  /* Measure the tallest resting configuration and pin the track to it, so
     opening a division can never resize the stage. Each panel is only as wide
     as its own division when that division is the open one, so its natural
     height has to be read in that state — hence the pass over every index. */
  const desktop = matchMedia('(min-width: 901px)');

  const syncTrackHeight = () => {
    if (!desktop.matches) { root.style.removeProperty('--track-h'); return; }
    const wasActive = items.map((item) => item.classList.contains('is-active'));
    root.classList.add('is-measuring');
    let tallest = 0;
    items.forEach((_, i) => {
      items.forEach((other, j) => other.classList.toggle('is-active', i === j));
      tallest = Math.max(tallest, buttons[i].offsetHeight + panels[i].scrollHeight);
    });
    items.forEach((item, i) => item.classList.toggle('is-active', wasActive[i]));
    // A closed division's header must fit too: its name turns vertical.
    const idleHeader = buttons.reduce(
      (max, button, i) => (wasActive[i] ? max : Math.max(max, button.offsetHeight)), 0);
    root.classList.remove('is-measuring');
    root.style.setProperty('--track-h', `${Math.ceil(Math.max(560, tallest, idleHeader))}px`);
  };

  // Recalculate the open panel from natural height on resize/orientation
  // change, finishing any in-flight transition instead of jumping mid-way.
  addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      sequence += 1;
      settle();
      syncTrackHeight();
    });
  }, { passive: true });

  applyState(active);
  settle();
  syncTrackHeight();
  // Text metrics change the panel heights once the webfont lands.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncTrackHeight);
})();

/* --------------------------------------------------------------------------
   Scroll reveals

   Each tagged element fades in while travelling 24px down into place and fades
   out while travelling back up out of it, so the movement always agrees with
   the direction of the scroll. Both the class and the direction are written
   here; the stylesheet only reads --reveal-dir, which is why the page is inert
   rather than blank without this file.

   Two states, toggled both ways — an element that has been scrolled past comes
   back when you scroll back to it, rather than burning its one entrance on the
   way down.

   The hero is deliberately not tagged: the intro is playing over it for the
   first five seconds, so anything revealed there would finish behind a curtain.
   -------------------------------------------------------------------------- */
(() => {
  const targets = [...document.querySelectorAll('[data-reveal]')];
  if (!targets.length || !('IntersectionObserver' in window)) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;

  /* Siblings that share a parent reveal together, so they take consecutive
     delays and arrive as a sequence rather than a single block. Capped, or a
     long list would still be waiting its turn after the scroll had moved on. */
  targets.forEach((target) => {
    const siblings = [...target.parentElement.children].filter((node) => node.hasAttribute('data-reveal'));
    if (siblings.length < 2) return;
    target.style.setProperty('--reveal-delay', `${Math.min(siblings.indexOf(target), 5) * 70}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const target = entry.target;
      const box = entry.boundingClientRect;
      if (entry.isIntersecting) {
        // Enter from whichever edge it is arriving at: still below the fold and
        // it drops in, already above it and it rises in.
        target.style.setProperty('--reveal-dir', box.top > 0 ? '1' : '-1');
        target.classList.add('is-revealed');
      } else {
        // ...and leave by whichever edge it actually went out of.
        target.style.setProperty('--reveal-dir', box.bottom < innerHeight ? '-1' : '1');
        target.classList.remove('is-revealed');
      }
    });
  }, { rootMargin: '0px 0px -10% 0px' });

  targets.forEach((target) => observer.observe(target));

  /* The observer's bottom edge is inset, so an element sitting in the last 10%
     of the document can never satisfy it — at the end of the page the footer's
     own legal line would stay invisible for good. Once the page is scrolled to
     its end, release anything still waiting. */
  let released = false;
  addEventListener('scroll', () => {
    if (released) return;
    if (innerHeight + scrollY < document.documentElement.scrollHeight - 2) return;
    released = true;
    targets.forEach((target) => {
      if (target.classList.contains('is-revealed')) return;
      target.style.setProperty('--reveal-dir', '1');
      target.classList.add('is-revealed');
    });
  }, { passive: true });
})();
