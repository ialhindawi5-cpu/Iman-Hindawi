// ---------- Hydrate content from the data store ----------
const MEDIA_OVERLAY = 'linear-gradient(160deg, rgba(122,28,71,0.28), rgba(122,28,71,0.42))';

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value != null) el.textContent = value;
}

function setList(id, items) {
  const el = document.getElementById(id);
  if (!el || !Array.isArray(items)) return;
  el.innerHTML = '';
  items.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    el.appendChild(li);
  });
}

function setMedia(id, image) {
  const el = document.getElementById(id);
  if (!el) return;
  if (image) {
    el.style.backgroundImage = `${MEDIA_OVERLAY}, url("${image}")`;
  }
}

function hydrate(c) {
  if (!c) return;
  // Hero
  setText('heroEyebrow', c.hero.eyebrow);
  setText('heroFirst', c.hero.firstName);
  setText('heroLast', c.hero.lastName);
  setText('heroTagline', c.hero.tagline);
  const fullName = `${c.hero.firstName} ${c.hero.lastName}`;
  document.title = fullName;
  const brand = document.getElementById('brand');
  if (brand) brand.textContent = fullName.toUpperCase();
  setText('footerName', fullName);
  setText('footerNameBottom', fullName);
  setText('footerTag', c.hero.tagline);

  // Intro
  setText('introText', c.intro.text);

  // Pillars
  ['actress', 'entrepreneur', 'philanthropist'].forEach((key) => {
    const s = c.sections[key];
    if (!s) return;
    setText(`${key}Index`, s.index);
    setText(`${key}Title`, s.title);
    setText(`${key}Body`, s.body);
    setList(`${key}List`, s.list);
    setText(`${key}Cta`, s.cta);
    setMedia(`${key}Media`, s.image);
  });

  // Quote
  setText('quoteText', `“${c.quote.text}”`);
  setText('quoteCite', c.quote.cite);

  // Contact
  setText('contactEyebrow', c.contact.eyebrow);
  setText('contactHeading', c.contact.heading);
  setText('contactSub', c.contact.sub);
  const email = c.contact.email || '';
  const footerEmail = document.getElementById('footerEmail');
  if (footerEmail) { footerEmail.textContent = email; footerEmail.href = `mailto:${email}`; }

  const socials = document.getElementById('socialsList');
  if (socials && Array.isArray(c.contact.socials)) {
    socials.innerHTML = '';
    c.contact.socials.forEach((s) => {
      if (!s.label) return;
      const a = document.createElement('a');
      a.textContent = s.label;
      a.href = s.url || '#';
      a.setAttribute('aria-label', s.label);
      if (s.url && s.url !== '#') { a.target = '_blank'; a.rel = 'noopener'; }
      socials.appendChild(a);
    });
  }
}

async function loadContent() {
  try {
    const res = await fetch('/api/content', { cache: 'no-store' });
    if (res.ok) hydrate(await res.json());
  } catch (_) {
    /* If served statically without the API, the default markup stays visible. */
  }
}

// ---------- Interactions & animation ----------
function initUI() {
  document.getElementById('year').textContent = new Date().getFullYear();

  // Header background on scroll
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('open');
    })
  );

  // Parallax (skipped for reduced-motion users)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    const media = Array.from(document.querySelectorAll('.pillar-media'));
    const heroInner = document.querySelector('.hero-inner');
    let ticking = false;

    const applyParallax = () => {
      const vh = window.innerHeight;
      media.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
        el.style.transform = `translateY(${(-progress * 42).toFixed(1)}px)`;
      });
      if (heroInner) {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          heroInner.style.transform = `translateY(${(y * 0.18).toFixed(1)}px)`;
          heroInner.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.85)));
        }
      }
      ticking = false;
    };
    const onParallaxScroll = () => {
      if (!ticking) { window.requestAnimationFrame(applyParallax); ticking = true; }
    };
    window.addEventListener('scroll', onParallaxScroll, { passive: true });
    window.addEventListener('resize', onParallaxScroll, { passive: true });
    applyParallax();
  }

  // Contact form
  const form = document.getElementById('contactForm');
  if (form) {
    const status = document.getElementById('cfStatus');
    const submit = document.getElementById('cfSubmit');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'cf-status';
      const payload = {
        name: document.getElementById('cfName').value.trim(),
        email: document.getElementById('cfEmail').value.trim(),
        phone: document.getElementById('cfPhone').value.trim(),
        message: document.getElementById('cfMessage').value.trim(),
      };
      if (!payload.name || !payload.email || !payload.phone || !payload.message) {
        status.textContent = 'Please fill in every field.';
        status.classList.add('err');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        form.reset();
        status.textContent = 'Thank you — your message has been sent.';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Send message';
      }
    });
  }

  // Web Projects slideshow
  const slideshow = document.getElementById('webSlideshow');
  if (slideshow) {
    const slides = Array.from(slideshow.querySelectorAll('.slide'));
    const dots = Array.from(slideshow.querySelectorAll('.dot'));
    let current = 0;
    let timer = null;
    const DELAY = 4000;

    const show = (i) => {
      current = (i + slides.length) % slides.length;
      slides.forEach((s, idx) => s.classList.toggle('active', idx === current));
      dots.forEach((d, idx) => d.classList.toggle('active', idx === current));
    };
    const next = () => show(current + 1);
    const start = () => { stop(); timer = setInterval(next, DELAY); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    dots.forEach((d) =>
      d.addEventListener('click', () => { show(Number(d.dataset.i)); start(); })
    );
    // Pause while the visitor is hovering (so links are easy to click)
    slideshow.addEventListener('mouseenter', stop);
    slideshow.addEventListener('mouseleave', start);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  }

  // Reveal on scroll
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// Load data first, then wire up the UI/animations.
loadContent().finally(initUI);
