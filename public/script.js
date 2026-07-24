// ---------- Hydrate content from the data store ----------

// Known social platforms get a brand icon instead of a raw text label. Each
// entry derives a clean profile URL from whatever the admin saved — even a
// pasted share link with ?igsh=… tracking junk, or a stray "#" url.
const SOCIAL_ICONS = [
  {
    name: 'Instagram',
    match: /instagram/i,
    href: (s) => {
      const src = /instagram\.com/i.test(s.url || '') ? s.url : (s.label || '');
      const m = src.match(/instagram\.com\/([^/?#\s]+)/i);
      const handle = m
        ? m[1]
        : (s.label || '').replace(/^instagram[\s/:]*/i, '').replace(/[/?#\s].*$/, '');
      if (handle) return `https://www.instagram.com/${handle.replace(/^@/, '')}/`;
      return s.url && s.url !== '#' ? s.url : null;
    },
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
  },
  {
    name: 'LinkedIn',
    match: /linkedin/i,
    href: (s) => (s.url && s.url !== '#' ? s.url : null),
    svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>',
  },
  {
    name: 'GitHub',
    match: /github/i,
    href: (s) => (s.url && s.url !== '#' ? s.url : null),
    svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z"/></svg>',
  },
  {
    name: 'Phone',
    match: /^tel:|(?:^|\s)\+?\d[\d\s().-]{6,}/,
    href: (s) => {
      if (/^tel:/i.test(s.url || '')) return s.url;
      const digits = `${s.url || s.label || ''}`.replace(/[^\d+]/g, '');
      return digits ? `tel:${digits}` : null;
    },
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  },
];

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
    // Uploaded photos show as-is; the tinted gradient in the CSS class remains
    // the placeholder for sections with no image.
    el.style.backgroundImage = `url("${image}")`;
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
  const brandCfg = c.brand || {};
  const logo = brandCfg.logo || '';
  // The image is opt-in: an uploaded logo stays on file, but the brand shows as
  // text unless the admin explicitly picks the image. That way "text" is what a
  // site with no brand settings at all gets.
  const useLogo = brandCfg.mode === 'image' && !!logo;
  // Empty logo text falls back to the hero name, so the header never goes blank.
  const wordmark = (brandCfg.text || '').trim() || fullName;
  const fontStack = window.brandFontStack ? window.brandFontStack(brandCfg.font) : '';
  const headerSize = window.brandFontSize ? window.brandFontSize(brandCfg.size) : 0;
  const footerSize = window.brandFontSize ? window.brandFontSize(brandCfg.footerSize) : 0;
  // A chosen face is only downloaded here, at the point of use.
  if (window.ensureBrandFont) window.ensureBrandFont(brandCfg.font);

  // A styled wordmark is a design in its own right; the spaced uppercase
  // treatment is only right for the untouched default.
  const styled = !!(fontStack || headerSize || footerSize);
  function applyWordmark(el, size) {
    el.textContent = styled ? wordmark : wordmark.toUpperCase();
    el.classList.toggle('custom', styled);
    if (fontStack) el.style.fontFamily = fontStack;
    // Handed to the stylesheet as a variable so the responsive rules can cap it
    // on small screens instead of letting a 72px wordmark run off the edge.
    if (size) el.style.setProperty('--brand-size', size + 'px');
  }

  // Header brand: the logo replaces the wordmark entirely when it is the chosen
  // mode — the mark already carries the name, so repeating it as text is
  // redundant and costs the logo room.
  const brand = document.getElementById('brand');
  if (brand) {
    brand.innerHTML = '';
    brand.classList.toggle('has-logo', useLogo);
    if (useLogo) {
      const img = document.createElement('img');
      img.className = 'brand-logo';
      img.src = logo;
      // With no visible text this is the link's only accessible name.
      img.alt = fullName;
      brand.appendChild(img);
    } else {
      const name = document.createElement('span');
      name.className = 'brand-name';
      applyWordmark(name, headerSize);
      brand.appendChild(name);
    }
  }
  setText('footerName', fullName);
  setText('footerNameBottom', fullName);
  setText('footerTag', c.hero.tagline);

  // Footer brand: same rule as the header — the logo stands in for the name.
  const footerBrand = document.querySelector('.footer-brand');
  if (footerBrand) {
    const existing = footerBrand.querySelector('.footer-logo');
    if (existing) existing.remove();
    const footerNameEl = document.getElementById('footerName');
    if (useLogo) {
      const img = document.createElement('img');
      img.className = 'footer-logo';
      img.src = logo;
      img.alt = fullName;
      footerBrand.insertBefore(img, footerBrand.firstChild);
    } else if (footerNameEl) {
      applyWordmark(footerNameEl, footerSize);
    }
    // The tagline and the copyright line keep their text either way.
    if (footerNameEl) footerNameEl.hidden = useLogo;
  }

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
      if (!s) return;
      const hint = `${s.label || ''} ${s.url || ''}`;
      const brand = SOCIAL_ICONS.find((b) => b.match.test(hint));
      const a = document.createElement('a');

      if (brand) {
        const href = brand.href(s);
        if (!href) return;
        a.className = 'social-icon';
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';

        const glyph = document.createElement('span');
        glyph.className = 'social-glyph';
        glyph.innerHTML = brand.svg; // trusted, constant markup
        a.appendChild(glyph);

        // The label (e.g. "eman_s.hindawi" or the phone number) shows next to the
        // icon. Hide it only when it's junk — a pasted URL or just the bare
        // platform name — so old data degrades to an icon-only link.
        const label = (s.label || '').trim();
        const isJunk =
          !label ||
          /https?:|\/\//i.test(label) ||
          label.toLowerCase() === brand.name.toLowerCase();
        const handle = isJunk ? '' : label;
        if (handle) {
          const text = document.createElement('span');
          text.className = 'social-handle';
          text.textContent = handle;
          a.appendChild(text);
        }
        a.title = brand.name;
        a.setAttribute('aria-label', handle ? `${brand.name}: ${handle}` : brand.name);
      } else {
        if (!s.label) return;
        a.textContent = s.label;
        a.href = s.url || '#';
        a.setAttribute('aria-label', s.label);
        if (s.url && s.url !== '#') { a.target = '_blank'; a.rel = 'noopener'; }
      }
      socials.appendChild(a);
    });
  }

  // Web Projects slideshow — rebuilt from content when projects are defined.
  renderProjects(c.projects);
}

// Replace the slideshow's hardcoded slides with the admin-managed project list.
// Runs before initUI (loadContent().finally(initUI)), so the slideshow wiring
// picks up these fresh .slide / .dot nodes. If there are no valid projects the
// static fallback markup in index.html is left untouched.
function renderProjects(projects) {
  const slideshow = document.getElementById('webSlideshow');
  if (!slideshow || !Array.isArray(projects)) return;
  const valid = projects.filter((p) => p && p.url && p.image);
  if (!valid.length) return;

  slideshow.innerHTML = '';
  const dots = document.createElement('div');
  dots.className = 'slide-dots';
  dots.id = 'slideDots';

  valid.forEach((p, i) => {
    const slide = document.createElement('a');
    slide.className = 'slide' + (i === 0 ? ' active' : '');
    slide.href = p.url;
    slide.target = '_blank';
    slide.rel = 'noopener';
    slide.style.backgroundImage = `url("${p.image}")`;

    const label = document.createElement('span');
    label.className = 'slide-label';
    label.textContent = `${p.title || 'Project'} `;
    const visit = document.createElement('span');
    visit.textContent = 'Visit ↗';
    label.appendChild(visit);
    slide.appendChild(label);
    slideshow.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.type = 'button';
    dot.dataset.i = String(i);
    dot.setAttribute('aria-label', p.title || `Project ${i + 1}`);
    dots.appendChild(dot);
  });

  slideshow.appendChild(dots);
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
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  // Close on Escape
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

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

  // Custom cursor (desktop / fine-pointer only, respects reduced motion)
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (finePointer && !noMotion) {
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    document.body.append(dot, ring);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;
    const HOVER_SEL = 'a, button, input, textarea, label, .dot, .menu-toggle';

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
