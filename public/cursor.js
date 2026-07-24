/* The pink dot-and-ring pointer, shared by every page of the site.
   Desktop / fine-pointer only, and skipped entirely for visitors who ask for
   reduced motion — on a touch screen there is no pointer to replace. */
window.initBrandCursor = function initBrandCursor() {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!finePointer || noMotion) return;
  if (document.querySelector('.cursor-dot')) return; // already running

  const dot = document.createElement('div');
  const ring = document.createElement('div');
  dot.className = 'cursor-dot';
  ring.className = 'cursor-ring';
  document.body.append(dot, ring);

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  const HOVER_SEL = 'a, button, input, textarea, label, .dot, .menu-toggle, .landing-card';

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = `${mx}px`;
    dot.style.top = `${my}px`;
    document.body.classList.add('cursor-ready');
    document.body.classList.toggle('cursor-hover', !!e.target.closest(HOVER_SEL));
  });
  window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('cursor-ready');
  });
  window.addEventListener('mouseover', () => document.body.classList.add('cursor-ready'));

  // Ring eases toward the pointer for a soft trailing feel
  const animateRing = () => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.left = `${rx}px`;
    ring.style.top = `${ry}px`;
    requestAnimationFrame(animateRing);
  };
  requestAnimationFrame(animateRing);
};
