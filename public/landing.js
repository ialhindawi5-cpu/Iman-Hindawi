/* Alternate landing page: wordmark, three picture cards, a row of contact
   links. Everything on it is admin content — the wordmark comes from the Logo
   panel, the cards from the Landing page panel, the links from Contact info.
   If the API is unreachable the markup in landing.html stays as it is. */

// The envelope lives in social-icons.js, shared with the contact page.
const MAIL_ICON = window.MAIL_ICON;

function renderBrand(c) {
  const el = document.getElementById('landingBrand');
  if (!el) return;
  const hero = c.hero || {};
  const cfg = c.brand || {};
  const fullName = `${hero.firstName || ''} ${hero.lastName || ''}`.trim();
  const wordmark = (cfg.text || '').trim() || fullName;
  if (fullName) document.title = fullName;
  if (!wordmark && !cfg.logo) return;

  el.innerHTML = '';
  el.classList.remove('custom');
  if (cfg.mode === 'image' && cfg.logo) {
    const img = document.createElement('img');
    img.className = 'landing-brand-logo';
    img.src = cfg.logo;
    img.alt = fullName || 'Home';
    el.appendChild(img);
    return;
  }

  const stack = window.brandFontStack ? window.brandFontStack(cfg.font) : '';
  const size = window.brandFontSize ? window.brandFontSize(cfg.size) : 0;
  if (window.ensureBrandFont) window.ensureBrandFont(cfg.font);
  const styled = !!(stack || size);
  el.textContent = styled ? wordmark : wordmark.toUpperCase();
  if (styled) el.classList.add('custom');
  if (stack) el.style.fontFamily = stack;
  if (size) el.style.setProperty('--brand-size', size + 'px');
}

// The layout is three panels. Saved content can hold fewer — uploading a
// picture to panel 1 before ever pressing Save creates just that one — so the
// missing ones fall back to these rather than leaving a one-panel page.
const DEFAULT_CARDS = [
  { label: 'Project Management', url: '/projects', image: '' },
  { label: 'Entrepreneur', url: '/entrepreneur', image: '' },
  { label: 'Iman Lifestyle', url: '/iman-lifestyle', image: '' },
];

function renderCards(c) {
  const wrap = document.getElementById('landingCards');
  const saved = c.landing && Array.isArray(c.landing.cards) ? c.landing.cards : [];
  if (!wrap) return;

  const cards = DEFAULT_CARDS.map((dflt, i) => {
    const card = saved[i] || {};
    return {
      label: (card.label || '').trim() || dflt.label,
      url: (card.url || '').trim() || dflt.url,
      image: card.image || '',
    };
  });

  wrap.innerHTML = '';
  cards.forEach((card) => {
    const a = document.createElement('a');
    a.className = 'landing-card';
    a.href = card.url || '/';
    if (card.image) a.classList.add('has-image');

    const media = document.createElement('span');
    media.className = 'landing-card-media';
    if (card.image) media.style.backgroundImage = `url("${card.image}")`;
    a.appendChild(media);

    const label = document.createElement('span');
    label.className = 'landing-card-label';
    label.textContent = card.label || '';
    a.appendChild(label);

    // With no label the picture itself is the link, so it needs a name.
    if (!card.label) a.setAttribute('aria-label', 'View section');
    wrap.appendChild(a);
  });
}

function circleLink(href, svg, label, external) {
  const a = document.createElement('a');
  a.className = 'landing-social';
  a.href = href;
  a.setAttribute('aria-label', label);
  a.title = label;
  if (external) { a.target = '_blank'; a.rel = 'noopener'; }
  a.innerHTML = svg; // trusted, constant markup
  return a;
}

function renderSocials(c) {
  const wrap = document.getElementById('landingSocials');
  const contact = c.contact || {};
  if (!wrap) return;
  wrap.innerHTML = '';

  (Array.isArray(contact.socials) ? contact.socials : []).forEach((s) => {
    if (!s) return;
    const hint = `${s.label || ''} ${s.url || ''}`;
    const brand = (window.SOCIAL_ICONS || []).find((b) => b.match.test(hint));
    if (!brand) return;
    const href = brand.href(s);
    if (!href) return;
    wrap.appendChild(circleLink(href, brand.svg, brand.name, !/^tel:/i.test(href)));
  });

  // The envelope goes to the contact page rather than straight to a mail client:
  // it is the only route to that page from here, and the address is on it.
  wrap.appendChild(circleLink('/contact', MAIL_ICON, 'Contact', false));
}

// Same preview rule as the rest of the site: ?preview=1 shows the dashboard's
// unpublished draft, but only to a signed-in admin (see script.js).
const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';

function showPreviewBanner() {
  if (document.getElementById('previewBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'previewBanner';
  bar.className = 'preview-banner';
  bar.textContent = 'Preview — unpublished changes. Visitors still see the published site.';
  document.body.appendChild(bar);
  document.body.classList.add('has-preview-banner');
}

function keepPreviewOnLinks() {
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.origin);
    if (url.searchParams.get('preview') === '1') return;
    url.searchParams.set('preview', '1');
    a.setAttribute('href', url.pathname + url.search + url.hash);
  });
}

(async function load() {
  try {
    const res = await fetch(PREVIEW ? '/api/content?preview=1' : '/api/content', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const isPreview = res.headers.get('x-preview') === '1';
    const c = await res.json();
    renderBrand(c);
    renderCards(c);
    renderSocials(c);
    if (isPreview) { showPreviewBanner(); keepPreviewOnLinks(); }
  } catch (_) {
    /* Served without the API: the static markup stays visible. */
  } finally {
    // The same pointer the rest of the site uses.
    if (window.initBrandCursor) window.initBrandCursor();
  }
})();
