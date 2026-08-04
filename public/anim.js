/* ---------------------------------------------------------------------------
   Entrance and scroll animation for every page except the home page.

   Modelled on the reference site (yolanthe.com/entrepreneur), which does two
   things and no more: the copy over the photograph rises a little as it fades
   in, one piece after the next, and the photograph itself drifts more slowly
   than the page on any screen tall enough to scroll. Nothing spins, nothing
   flies in from the side.

   This file is loaded from the <head>, before the first paint, because the
   hidden start states in styles.css all hang off the `js-anim` class it sets.
   That way round is deliberate: if the file never runs — JavaScript off, a
   blocked request, a visitor who has asked for less motion — the class is
   absent, no element is ever hidden, and the page reads exactly as it does
   today. Nothing can be left stranded at zero opacity by an animation that
   didn't happen.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var root = document.documentElement;
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) return;

  root.classList.add('js-anim');

  var GROUP = 'data-anim-children';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    /* ---------------- fade in from bottom ---------------- */

    /* Once an element has arrived it is let go of completely: the attribute
       comes off, which is what the start state in styles.css is keyed to, so
       the element is left with nothing of this system on it. That matters
       because the rule that hides it also declares a `transition`, and an
       input or a button that kept it would have lost the focus and hover
       transitions of its own.

       The timer is the safety net, and the reason nothing here can strand a
       piece of the page: whatever happens to the transition — never started
       because the element was display:none when it was revealed, interrupted,
       dropped on a slow frame — the element is unwrapped on a clock and ends
       up visible. */
    function settle(el) {
      el.removeAttribute('data-anim');
      el.removeAttribute('data-anim-delay');
      el.style.transitionDelay = '';
    }

    function reveal(el) {
      var delay = parseFloat(el.getAttribute('data-anim-delay')) || 0;
      el.classList.add('anim-in');
      el.addEventListener('transitionend', function done(e) {
        if (e.propertyName !== 'opacity') return;
        el.removeEventListener('transitionend', done);
        settle(el);
      });
      window.setTimeout(function () { settle(el); }, delay + 1400);
    }

    var io = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            reveal(e.target);
          });
        }, { threshold: 0, rootMargin: '0px 0px 90px 0px' })
      : null;
    /* The margin grows the viewport downwards rather than shrinking it, which
       is the opposite of the usual "wait until it is properly on screen"
       setting, and it has to be: an element waiting to rise is sitting up to
       75px lower than where it will end up. The copy on the section pages is
       pinned to the foot of a full-height picture, so a shrunk viewport put
       those links underneath the line the observer was watching and they were
       never asked to arrive at all. */

    /* Hands each child of a marked container its own place in the queue, so a
       row the dashboard builds at run time — the circled contact icons — can
       stagger without anything being written into the markup for it. The
       container's own delay, if it has one, is where the queue starts. */
    function expand(box) {
      var step = parseFloat(box.getAttribute(GROUP)) || 80;
      var base = parseFloat(box.getAttribute('data-anim-delay')) || 0;
      var kids = box.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].hasAttribute('data-anim')) continue;
        /* Something that is empty on arrival and filled in later — the form's
           status line — has to be left out. It has no height, so it never
           trips the observer, and it would still be hidden at the moment it
           finally has something to say. */
        if (kids[i].hasAttribute('data-anim-skip')) continue;
        kids[i].setAttribute('data-anim', 'up');
        kids[i].setAttribute('data-anim-delay', String(base + i * step));
      }
    }

    function scan() {
      var boxes = document.querySelectorAll('[' + GROUP + ']');
      for (var b = 0; b < boxes.length; b++) expand(boxes[b]);

      var els = document.querySelectorAll('[data-anim]:not(.anim-watched)');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        el.classList.add('anim-watched');
        var d = parseFloat(el.getAttribute('data-anim-delay'));
        if (d) el.style.transitionDelay = (d / 1000) + 's';
        if (io) io.observe(el);
        else reveal(el);
      }
    }

    scan();
    /* The contact icons are built from the dashboard's content after this file
       has run, so script.js calls this again the moment it has drawn them —
       inside the same task, so they are never painted in their start state.
       The load handler is only a safety net; re-scanning is harmless because a
       watched element is skipped. */
    window.scanAnim = scan;
    window.addEventListener('load', scan);

    /* ---------------- the photograph drifts ----------------
       The reference gives its full-height picture row a "fast" parallax: the
       background moves a good deal less than the page it sits behind. Here the
       same drift rides inside a 6% zoom, which is the only headroom it has —
       without it the bottom edge of the picture would be dragged into view.

       The zoom is applied by this file rather than by the stylesheet, and only
       while the page is actually long enough to scroll. The three section
       pages are a single screen tall on a desktop, so there is no drift to
       make room for and the picture keeps the crop it was framed with — a crop
       that was chosen carefully enough to be worth not disturbing. */

    var media = Array.prototype.slice.call(document.querySelectorAll('.section-hero-media'));
    if (!media.length) return;

    var ZOOM = 1.06;
    var HEADROOM = (ZOOM - 1) / 2;   /* share of the height that hangs off each edge */
    var SPEED = 0.28;                /* how much of the scroll the picture keeps */
    var ticking = false;

    function frame() {
      ticking = false;
      var vh = window.innerHeight;
      var scrolls = root.scrollHeight - vh > 40;

      for (var i = 0; i < media.length; i++) {
        var el = media[i];
        if (!scrolls) {
          if (el.classList.contains('has-parallax')) {
            el.classList.remove('has-parallax');
            el.style.transform = '';
          }
          continue;
        }
        el.classList.add('has-parallax');

        var host = el.parentElement || el;
        var rect = host.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > vh + 80) continue;

        var shift = -rect.top * SPEED;
        var max = rect.height * HEADROOM * 0.94;
        if (shift > max) shift = max;
        else if (shift < -max) shift = -max;

        el.style.transform = 'scale(' + ZOOM + ') translate3d(0,' + shift.toFixed(1) + 'px,0)';
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    frame();
  });
})();
