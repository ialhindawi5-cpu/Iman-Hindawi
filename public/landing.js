/* Alternate landing page: wordmark, three picture cards, a row of contact
   links. Everything on it is admin content — the wordmark comes from the Logo
   panel, the cards from the Landing page panel, the links from Contact info.
   If the API is unreachable the markup in landing.html stays as it is. */

// An envelope for the email link; the rest of the icons come from SOCIAL_ICONS.
const MAIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/></svg>';

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

function renderCards(c) {
  const wrap = document.getElementById('landingCards');
  const cards = c.landing && Array.isArray(c.landing.cards) ? c.landing.cards.filter(Boolean) : null;
  // No cards saved yet means the page keeps its built-in three, rather than
  // rendering an empty grid.
  if (!wrap || !cards || !cards.length) return;

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

  if (contact.email) {
    wrap.appendChild(circleLink(`mailto:${contact.email}`, MAIL_ICON, 'Email', false));
  }
}

(async function load() {
  try {
    const res = await fetch('/api/content', { cache: 'no-store' });
    if (!res.ok) return;
    const c = await res.json();
    renderBrand(c);
    renderCards(c);
    renderSocials(c);
  } catch (_) {
    /* Served without the API: the static markup stays visible. */
  }
})();
