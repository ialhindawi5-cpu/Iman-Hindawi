// ---------- Hydrate content from the data store ----------

// The SOCIAL_ICONS table lives in social-icons.js (shared with the landing
// page) and is loaded before this file.

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
  // A section page names itself after its own (admin-edited) heading; the rest
  // of the site is titled with the name alone.
  const pageSection = document.body.dataset.section;
  const pageTitle = pageSection && c.sections && c.sections[pageSection] && c.sections[pageSection].title;
  document.title = pageTitle ? `${pageTitle} — ${fullName}` : fullName;
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

  // The same circled icons the home page uses, for a page that carries no
  // footer. The envelope opens a mail client here, since the address is this
  // page's whole point.
  const circles = document.getElementById('socialCircles');
  if (circles) {
    circles.innerHTML = '';
    const circle = (href, svg, label, external) => {
      const a = document.createElement('a');
      a.className = 'social-circle';
      a.href = href;
      a.title = label;
      a.setAttribute('aria-label', label);
      if (external) { a.target = '_blank'; a.rel = 'noopener'; }
      a.innerHTML = svg; // trusted, constant markup
      circles.appendChild(a);
    };
    (Array.isArray(c.contact.socials) ? c.contact.socials : []).forEach((s) => {
      if (!s) return;
      const brand = (window.SOCIAL_ICONS || []).find((b) => b.match.test(`${s.label || ''} ${s.url || ''}`));
      if (!brand) return;
      const href = brand.href(s);
      if (href) circle(href, brand.svg, brand.name, !/^tel:/i.test(href));
    });
    if (email && window.MAIL_ICON) circle(`mailto:${email}`, window.MAIL_ICON, 'Email', false);
  }

  // Web Projects buttons — rebuilt from content when projects are defined.
  renderProjects(c.projects);
}

// Replace the hardcoded project buttons with the admin-managed list. If there
// are no valid projects the static fallback markup in web.html is left as it is.
// A project needs nothing but its link: the screenshot the dashboard captures is
// no longer shown on the page, it is only what gives the button its title.
function renderProjects(projects) {
  const grid = document.getElementById('webProjects');
  if (!grid || !Array.isArray(projects)) return;
  const valid = projects.filter((p) => p && p.url);
  if (!valid.length) return;

  grid.innerHTML = '';
  valid.forEach((p) => {
    const button = document.createElement('a');
    button.className = 'project-button';
    button.href = p.url;
    button.target = '_blank';
    button.rel = 'noopener';

    const name = document.createElement('span');
    name.className = 'project-button-name';
    name.textContent = p.title || 'Project';
    button.appendChild(name);

    const go = document.createElement('span');
    go.className = 'project-button-go';
    go.textContent = 'View live project ↗';
    button.appendChild(go);

    grid.appendChild(button);
  });
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
// This file is shared by every page of the site, and a section page carries
// only the markup it needs — so each block below checks that its elements are
// actually present rather than assuming the full one-page layout.
function initUI() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Header background on scroll. A page with no dark hero behind the header
  // (.static) keeps the light treatment at every scroll position.
  const header = document.getElementById('header');
  if (header && !header.classList.contains('static')) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (toggle && nav) {
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
  }

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

  // Custom cursor — lives in cursor.js so the home page has the same pointer.
  if (window.initBrandCursor) window.initBrandCursor();

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
