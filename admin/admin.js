let content = null;
let currentUser = null;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
// The session lives in an httpOnly cookie (unreadable here). We only read the
// CSRF cookie and echo it back on state-changing requests (double-submit).
function getCsrf() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
}
function authHeaders(extra = {}) {
  // Harmless on GETs; required on writes for the CSRF double-submit check.
  return { 'x-csrf-token': getCsrf(), ...extra };
}
async function api(url, options = {}) {
  // Same-origin so the httpOnly session cookie rides along automatically.
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    // Session expired/invalid while using the dashboard → back to the login screen.
    if (res.status === 401 && dash && !dash.hidden) location.reload();
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

/* ---------- login ---------- */
const loginScreen = $('loginScreen');
const dash = $('dash');

// Held in memory only (never stored) so "Resend code" can re-trigger step 1.
let pendingLogin = null;

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  if (turnstileSiteKey && !turnstileToken) {
    $('loginError').textContent = 'Please complete the verification below.';
    return;
  }
  try {
    const data = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    if (data.mfaRequired) {
      pendingLogin = { email, password };
      showMfaStep(data);
    } else if (data.ok) {
      // Fallback for any non-2FA response (session cookie already set).
      enterDashboard();
    }
  } catch (err) {
    $('loginError').textContent = err.message;
  } finally {
    resetTurnstile(); // tokens are single-use — refresh for the next attempt
  }
});

function showMfaStep(data) {
  $('loginForm').hidden = true;
  $('mfaForm').hidden = false;
  $('mfaError').textContent = '';
  $('mfaCode').value = '';
  if (data && data.devCode) {
    $('mfaMsg').innerHTML = `Email isn't configured, so here is your code (dev mode): <strong>${data.devCode}</strong>`;
  } else {
    $('mfaMsg').textContent = `Enter the 6-digit code we emailed to ${pendingLogin ? pendingLogin.email : 'you'}.`;
  }
  $('mfaCode').focus();
}

function backToLogin() {
  pendingLogin = null;
  $('mfaForm').hidden = true;
  $('loginForm').hidden = false;
  $('mfaError').textContent = '';
  $('loginPassword').value = '';
}

$('mfaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('mfaError').textContent = '';
  if (!pendingLogin) { backToLogin(); return; }
  try {
    await api('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingLogin.email, code: $('mfaCode').value.trim() }),
    });
    // Session cookie is now set by the server; nothing to store client-side.
    pendingLogin = null;
    enterDashboard();
  } catch (err) {
    $('mfaError').textContent = err.message;
  }
});

$('mfaResend').addEventListener('click', async () => {
  if (!pendingLogin) { backToLogin(); return; }
  $('mfaError').textContent = '';
  try {
    // Dedicated resend — no bot challenge needed (the login step already passed).
    const data = await api('/api/login/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingLogin.email }),
    });
    // Refresh only the dev-code hint / message; stay on the code step.
    if (data.devCode) {
      $('mfaMsg').innerHTML = `Email isn't configured, so here is your code (dev mode): <strong>${data.devCode}</strong>`;
    } else {
      $('mfaMsg').textContent = `A new code was sent to ${pendingLogin.email}.`;
    }
    $('mfaCode').value = '';
    $('mfaCode').focus();
  } catch (err) {
    $('mfaError').textContent = err.message;
  }
});

$('mfaBack').addEventListener('click', backToLogin);

/* ---------- Cloudflare Turnstile (bot challenge on login) ---------- */
let turnstileSiteKey = '';
let turnstileToken = '';
let turnstileWidgetId = null;

async function initTurnstile() {
  if (turnstileSiteKey) return; // already set up
  try {
    const cfg = await api('/api/login-config');
    turnstileSiteKey = cfg.turnstileSiteKey || '';
  } catch (_) { turnstileSiteKey = ''; }
  if (!turnstileSiteKey) return; // feature off — login works without it

  $('turnstileBox').hidden = false;
  window.onTurnstileLoad = () => {
    if (!window.turnstile) return;
    turnstileWidgetId = window.turnstile.render('#turnstileBox', {
      sitekey: turnstileSiteKey,
      theme: 'light',
      callback: (token) => { turnstileToken = token; $('loginError').textContent = ''; },
      'error-callback': () => { turnstileToken = ''; },
      'expired-callback': () => { turnstileToken = ''; },
    });
  };
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}
function resetTurnstile() {
  turnstileToken = '';
  if (turnstileWidgetId !== null && window.turnstile) {
    try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
  }
}

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', headers: authHeaders() }); } catch (_) {}
  location.reload();
});

/* ---------- image target helpers (sections + logo + landing) ---------- */
// The logo lives at content.brand.logo, the landing pictures at
// content.landing.cards[i].image, the pillar images at content.sections[k].image.
function landingCardIndex(section) {
  const m = /^landing([123])$/.exec(section || '');
  return m ? Number(m[1]) - 1 : -1;
}
// The landing block may be missing entirely on a site saved before the page
// existed, or hold fewer than three cards if a picture was uploaded before the
// first save. [data-path] writes also need real arrays to index into.
const DEFAULT_LANDING_CARDS = [
  { label: 'Project Management', url: '/projects', image: '' },
  { label: 'Entrepreneur', url: '/entrepreneur', image: '' },
  { label: 'Iman Lifestyle', url: '/iman-lifestyle', image: '' },
];
function ensureLanding() {
  content.landing = content.landing || {};
  if (!Array.isArray(content.landing.cards)) content.landing.cards = [];
  DEFAULT_LANDING_CARDS.forEach((dflt, i) => {
    const card = content.landing.cards[i] || {};
    content.landing.cards[i] = {
      label: card.label || dflt.label,
      url: card.url || dflt.url,
      image: card.image || '',
    };
  });
}
function sectionImage(section) {
  if (section === 'logo') return content.brand && content.brand.logo;
  const card = landingCardIndex(section);
  if (card >= 0) {
    const cards = content.landing && content.landing.cards;
    return Array.isArray(cards) && cards[card] ? cards[card].image : '';
  }
  return content.sections && content.sections[section] && content.sections[section].image;
}
function setSectionImage(section, url) {
  if (section === 'logo') {
    content.brand = content.brand || {};
    content.brand.logo = url;
    return;
  }
  const card = landingCardIndex(section);
  if (card >= 0) {
    ensureLanding();
    content.landing.cards[card].image = url;
    return;
  }
  if (content.sections && content.sections[section]) content.sections[section].image = url;
}

/* ---------- logo panel: font pickers & live preview ---------- */
// The menus are built once, before any content arrives, because populate()
// assigns a <select>'s value and a value with no matching <option> is dropped.
function buildBrandPickers() {
  const fontSel = $('brandFont');
  if (!fontSel || !window.BRAND_FONTS) return;

  const dflt = document.createElement('option');
  dflt.value = '';
  dflt.textContent = 'Site default (Cormorant Garamond)';
  fontSel.appendChild(dflt);
  window.BRAND_FONTS.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    // Word-processor habit: each entry is set in its own face. Only families
    // already on the machine render that way until the font is chosen and
    // fetched, which is a fair preview of what a visitor would see.
    opt.style.fontFamily = f.stack;
    fontSel.appendChild(opt);
  });

  [['brandSize', 'Default'], ['brandFooterSize', 'Default']].forEach(([id, label]) => {
    const sel = $(id);
    if (!sel) return;
    const none = document.createElement('option');
    none.value = '';
    none.textContent = label;
    sel.appendChild(none);
    (window.BRAND_FONT_SIZES || []).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = String(s);
      sel.appendChild(opt);
    });
  });
}

// Mirrors what the website does with the same values, so the panel shows the
// real result rather than an approximation.
function refreshBrandPreview() {
  const mode = $('brandMode');
  const textBlock = $('brandTextBlock');
  const imageBlock = $('brandImageBlock');
  if (!mode) return;
  const isText = mode.value !== 'image';
  if (textBlock) textBlock.hidden = !isText;
  if (imageBlock) imageBlock.hidden = isText;

  const fontName = $('brandFont') ? $('brandFont').value : '';
  if (window.ensureBrandFont) window.ensureBrandFont(fontName);
  const stack = window.brandFontStack ? window.brandFontStack(fontName) : '';
  const hero = (content && content.hero) || {};
  const fallback = `${hero.firstName || ''} ${hero.lastName || ''}`.trim() || 'Your name';
  const text = (($('brandText') && $('brandText').value) || '').trim() || fallback;
  const styled = !!(stack || ($('brandSize') && $('brandSize').value) || ($('brandFooterSize') && $('brandFooterSize').value));

  [['brandPreviewHeader', 'brandSize', 24], ['brandPreviewFooter', 'brandFooterSize', 34]].forEach(([previewId, sizeId, dflt]) => {
    const el = $(previewId);
    if (!el) return;
    const size = window.brandFontSize ? window.brandFontSize($(sizeId) && $(sizeId).value) : 0;
    el.textContent = styled ? text : text.toUpperCase();
    el.style.fontFamily = stack || "'Cormorant Garamond', Georgia, serif";
    el.style.fontSize = `${size || dflt}px`;
    el.style.letterSpacing = styled ? '0.05em' : '0.28em';
  });
}

buildBrandPickers();
['brandMode', 'brandText', 'brandFont', 'brandSize', 'brandFooterSize'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('input', refreshBrandPreview);
});

/* ---------- panel captions name their sections everywhere ---------- */
// The three panels on the home page are the three section pages, so the caption
// given to a panel is what that section is called: in the sidebar here, at the
// top of its panel, and in the website's menu (public/script.js renderNav reads
// the same captions). The text written in the markup is the fallback for a
// caption left empty.
const captionTargets = Array.from(document.querySelectorAll('[data-caption-card]'));
captionTargets.forEach((el) => { el.dataset.captionDefault = el.textContent.trim(); });

function applyCaptions() {
  const cards = (content && content.landing && content.landing.cards) || [];
  captionTargets.forEach((el) => {
    const card = cards[Number(el.dataset.captionCard)];
    const label = card ? (card.label || '').trim() : '';
    el.textContent = label || el.dataset.captionDefault;
  });
}

// Typing a caption renames the section straight away, so the rename is visible
// where it will land rather than only after a Save.
document.querySelectorAll('[data-path^="landing.cards."][data-path$=".label"]').forEach((input) => {
  input.addEventListener('input', () => {
    if (!content) return;
    setPath(content, input.dataset.path, input.value);
    applyCaptions();
  });
});

/* ---------- content populate & collect ---------- */
function populate() {
  ensureLanding();
  applyCaptions();
  document.querySelectorAll('[data-path]').forEach((el) => {
    el.value = getPath(content, el.dataset.path) ?? '';
  });
  document.querySelectorAll('[data-list]').forEach((el) => {
    el.value = (getPath(content, el.dataset.list) || []).join('\n');
  });
  document.querySelectorAll('[data-socials]').forEach((el) => {
    el.value = (getPath(content, el.dataset.socials) || [])
      .map((s) => `${s.label} | ${s.url}`).join('\n');
  });
  document.querySelectorAll('[data-preview]').forEach((el) => {
    applyPreview(el, sectionImage(el.dataset.preview));
  });
  // Sites saved before the logo could be text have no mode stored; text is the
  // default there, so the picker has to say so rather than sit blank.
  const mode = $('brandMode');
  if (mode && mode.value !== 'image') mode.value = 'text';
  refreshBrandPreview();
  renderProjectsEditor();
}
function applyPreview(el, img) {
  if (img) {
    // Absolute (Vercel Blob) URLs are used as-is; relative paths get a leading slash + cache-bust.
    const src = /^https?:\/\//.test(img) ? img : `/${img}?t=${Date.now()}`;
    el.style.backgroundImage = `url("${src}")`;
    el.innerHTML = '';
  } else {
    el.style.backgroundImage = '';
    el.innerHTML = '<span>No image</span>';
  }
  // Removal is only offered when there is something to remove.
  const removeBtn = document.querySelector(`[data-remove="${el.dataset.preview}"]`);
  if (removeBtn) removeBtn.hidden = !img;
}
function collect() {
  document.querySelectorAll('[data-path]').forEach((el) => setPath(content, el.dataset.path, el.value));
  document.querySelectorAll('[data-list]').forEach((el) => {
    setPath(content, el.dataset.list, el.value.split('\n').map((s) => s.trim()).filter(Boolean));
  });
  document.querySelectorAll('[data-socials]').forEach((el) => {
    const arr = el.value.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [label, url] = line.split('|').map((s) => (s || '').trim());
      return { label, url: url || '#' };
    }).filter((s) => s.label);
    setPath(content, el.dataset.socials, arr);
  });
  return content;
}

/* ---------- image removal ---------- */
document.querySelectorAll('[data-remove]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const section = btn.dataset.remove;
    if (!confirm('Remove this image? The website will show no image for this section until you upload another.')) return;
    const statusEl = document.querySelector(`[data-status="${section}"]`);
    statusEl.className = 'upload-status';
    statusEl.textContent = 'Removing…';
    btn.disabled = true;
    try {
      await api(`/api/upload/${section}`, { method: 'DELETE', headers: authHeaders() });
      setSectionImage(section, '');
      applyPreview(document.querySelector(`[data-preview="${section}"]`), '');
      statusEl.textContent = 'Removed ✓';
      statusEl.classList.add('ok');
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  });
});

/* ---------- image upload ---------- */
document.querySelectorAll('[data-upload]').forEach((input) => {
  input.addEventListener('change', async () => {
    const section = input.dataset.upload;
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.querySelector(`[data-status="${section}"]`);
    statusEl.className = 'upload-status';
    statusEl.textContent = 'Uploading…';
    const form = new FormData();
    form.append('image', file);
    try {
      const data = await api(`/api/upload/${section}`, { method: 'POST', headers: authHeaders(), body: form });
      setSectionImage(section, data.path);
      applyPreview(document.querySelector(`[data-preview="${section}"]`), data.path);
      statusEl.textContent = 'Uploaded ✓';
      statusEl.classList.add('ok');
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add('err');
    } finally {
      input.value = '';
    }
  });
});

/* ---------- live projects (the grid behind the Data page's button) ---------- */
function projImgSrc(img) {
  if (!img) return '';
  return /^https?:\/\//.test(img) ? img : `/${img.replace(/^\//, '')}`;
}
function mkProjBtn(text, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghost small';
  b.textContent = text;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
function renderProjectsEditor() {
  const list = $('projectsList');
  if (!list) return;
  if (!Array.isArray(content.projects)) content.projects = [];
  list.innerHTML = '';
  if (!content.projects.length) {
    list.innerHTML = '<p class="projects-empty">No projects yet — add one below.</p>';
    return;
  }
  content.projects.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'project-row';

    const thumb = document.createElement('div');
    thumb.className = 'project-thumb';
    const src = projImgSrc(p.image);
    if (src) thumb.style.backgroundImage = `url("${src}")`;
    else thumb.textContent = 'No image';
    row.appendChild(thumb);

    const main = document.createElement('div');
    main.className = 'project-main';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'project-title';
    titleInput.value = p.title || '';
    titleInput.placeholder = 'Project title';
    titleInput.addEventListener('input', () => { content.projects[i].title = titleInput.value; });
    const link = document.createElement('a');
    link.className = 'project-url';
    link.href = p.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = p.url;
    main.append(titleInput, link);
    row.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'project-actions';
    const up = mkProjBtn('↑', 'Move up', () => moveProject(i, -1));
    const down = mkProjBtn('↓', 'Move down', () => moveProject(i, 1));
    up.disabled = i === 0;
    down.disabled = i === content.projects.length - 1;
    const refresh = mkProjBtn('Refresh shot', 'Re-capture the screenshot', (e) => refreshProject(i, e.currentTarget));
    const remove = mkProjBtn('Remove', '', () => removeProject(i));
    remove.classList.remove('ghost');
    remove.classList.add('danger');
    actions.append(up, down, refresh, remove);
    row.appendChild(actions);

    list.appendChild(row);
  });
}
function moveProject(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= content.projects.length) return;
  const [item] = content.projects.splice(i, 1);
  content.projects.splice(j, 0, item);
  renderProjectsEditor();
}
function removeProject(i) {
  if (!confirm('Remove this project from the live projects list?')) return;
  content.projects.splice(i, 1);
  renderProjectsEditor();
}
async function captureShot(url) {
  return api('/api/projects/screenshot', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url }),
  });
}
function projStatus(msg, kind) {
  const el = $('projectStatus');
  if (!el) return;
  el.className = 'project-status' + (kind ? ` ${kind}` : '');
  el.textContent = msg;
}
async function refreshProject(i, btn) {
  projStatus('Capturing screenshot…');
  if (btn) btn.disabled = true;
  try {
    const data = await captureShot(content.projects[i].url);
    content.projects[i].image = data.image;
    if (!content.projects[i].title && data.title) content.projects[i].title = data.title;
    renderProjectsEditor();
    projStatus('Screenshot updated ✓ — Save it, then Publish to put it on the website.', 'ok');
  } catch (err) {
    projStatus(err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function addProject() {
  const input = $('newProjectUrl');
  const btn = $('addProjectBtn');
  const url = input.value.trim();
  if (!url) { projStatus('Paste a project link first.', 'err'); return; }
  projStatus('Capturing screenshot… this can take a few seconds.');
  btn.disabled = true;
  try {
    const data = await captureShot(url);
    if (!Array.isArray(content.projects)) content.projects = [];
    content.projects.push({ url: data.url, title: data.title || '', image: data.image });
    input.value = '';
    renderProjectsEditor();
    projStatus('Project added ✓ — Save it, then Publish to put it on the website.', 'ok');
  } catch (err) {
    projStatus(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}
const addProjectBtn = $('addProjectBtn');
if (addProjectBtn) addProjectBtn.addEventListener('click', addProject);
const newProjectUrl = $('newProjectUrl');
if (newProjectUrl) newProjectUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addProject(); }
});

/* ---------- save, publish, history ---------- */
// Save stores the draft; Publish copies one page of that draft onto the live
// website. Every panel sends the whole document on Save (collect() gathers all
// of it) — the page name only says which panel the save came from, and which
// slice Publish should push out.
const PAGE_LABELS = {
  home: 'Home page',
  projects: 'Projects',
  data: 'Data',
  web: 'Web',
  contact: 'Contact page',
  nameintro: 'Name & intro',
  settings: 'Settings',
  all: 'the whole site',
};
// Which pages hold work that is saved but not on the website yet.
let pending = {};

function pageStateEl(page) { return document.querySelector(`[data-page-state="${page}"]`); }

function renderPending() {
  Object.keys(PAGE_LABELS).forEach((page) => {
    const el = pageStateEl(page);
    if (!el) return;
    const waiting = !!pending[page];
    el.textContent = waiting ? 'Unpublished changes' : 'Published — up to date';
    el.classList.toggle('waiting', waiting);
  });
}

function setPageMsg(page, text, kind) {
  const el = pageStateEl(page);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('waiting', 'ok', 'err');
  if (kind) el.classList.add(kind);
  // Say what happened, then go back to reporting the page's standing state.
  setTimeout(renderPending, 2600);
}

// Saving is always done from a page's own bar. The whole document still goes
// up — collect() reads every panel — so edits made on another page are not lost
// by saving this one; `page` says which one to file it under and to publish.
async function save(page) {
  setPageMsg(page, 'Saving…');
  try {
    const res = await api('/api/content', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ page, content: collect() }),
    });
    pending = res.pending || pending;
    setPageMsg(page, 'Saved ✓ — not on the website yet', 'ok');
  } catch (err) {
    setPageMsg(page, err.message, 'err');
  }
}

// Publish saves first: what is on screen is what the user means to publish,
// and a page published from a stale draft would be a nasty surprise.
async function publish(page) {
  if (!confirm(`Put the current ${PAGE_LABELS[page] || 'page'} on the website now?`)) return;
  setPageMsg(page, 'Publishing…');
  try {
    await api('/api/content', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ page, content: collect() }),
    });
    const res = await api('/api/content/publish', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ page }),
    });
    pending = res.pending || pending;
    setPageMsg(page, 'Published ✓ — it is on the website', 'ok');
  } catch (err) {
    setPageMsg(page, err.message, 'err');
  }
}

document.querySelectorAll('[data-save-page]').forEach((b) =>
  b.addEventListener('click', () => save(b.dataset.savePage))
);
document.querySelectorAll('[data-publish-page]').forEach((b) =>
  b.addEventListener('click', () => publish(b.dataset.publishPage))
);

/* ---------- page history ---------- */
const historyModal = $('historyModal');

const ACTION_WORDS = { save: 'Saved', publish: 'Published', restore: 'Restored' };

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function closeHistory() { historyModal.hidden = true; }
$('historyClose').addEventListener('click', closeHistory);
historyModal.addEventListener('click', (e) => { if (e.target === historyModal) closeHistory(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !historyModal.hidden) closeHistory();
});

async function openHistory(page) {
  $('historyPageName').textContent = PAGE_LABELS[page] || page;
  $('historyError').textContent = '';
  $('historyOk').textContent = '';
  $('historyList').innerHTML = '<li class="history-empty">Loading…</li>';
  historyModal.hidden = false;
  try {
    const { versions } = await api(`/api/content/versions?page=${encodeURIComponent(page)}`, {
      headers: authHeaders(),
    });
    renderHistory(versions || [], page);
  } catch (err) {
    $('historyList').innerHTML = '';
    $('historyError').textContent = err.message;
  }
}

function renderHistory(versions, page) {
  const list = $('historyList');
  list.innerHTML = '';
  if (!versions.length) {
    list.innerHTML = '<li class="history-empty">Nothing saved for this page yet.</li>';
    return;
  }
  versions.forEach((v) => {
    const li = document.createElement('li');
    li.className = 'history-row';

    const head = document.createElement('div');
    head.className = 'history-head';

    const when = document.createElement('span');
    when.className = 'history-when';
    when.textContent = formatWhen(v.created_at);
    head.appendChild(when);

    const what = document.createElement('span');
    what.className = `history-action ${v.action}`;
    what.textContent = ACTION_WORDS[v.action] || v.action;
    head.appendChild(what);

    // A whole-site save covers this page as well; saying so explains why an
    // entry nobody made on this panel is sitting in its history.
    if (v.page === 'all') {
      const scope = document.createElement('span');
      scope.className = 'history-scope';
      scope.textContent = 'all pages';
      head.appendChild(scope);
    }

    if (v.author) {
      const who = document.createElement('span');
      who.className = 'history-who';
      who.textContent = v.author;
      head.appendChild(who);
    }

    const actions = document.createElement('span');
    actions.className = 'history-actions';
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn ghost small';
    viewBtn.textContent = 'View';
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn ghost small';
    restoreBtn.textContent = 'Restore';
    actions.appendChild(viewBtn);
    actions.appendChild(restoreBtn);
    head.appendChild(actions);
    li.appendChild(head);

    // The saved wording is fetched only when asked for — the list would be a
    // heavy payload if every version carried its whole snapshot.
    const body = document.createElement('pre');
    body.className = 'history-body';
    body.hidden = true;
    li.appendChild(body);

    viewBtn.addEventListener('click', async () => {
      if (!body.hidden) { body.hidden = true; viewBtn.textContent = 'View'; return; }
      viewBtn.disabled = true;
      try {
        const { slice } = await api(
          `/api/content/versions/${v.id}?page=${encodeURIComponent(page)}`,
          { headers: authHeaders() }
        );
        body.textContent = JSON.stringify(slice, null, 2);
        body.hidden = false;
        viewBtn.textContent = 'Hide';
      } catch (err) {
        $('historyError').textContent = err.message;
      } finally {
        viewBtn.disabled = false;
      }
    });

    restoreBtn.addEventListener('click', async () => {
      const label = `${ACTION_WORDS[v.action] || v.action} ${formatWhen(v.created_at)}`;
      if (!confirm(`Bring back this version (${label})?\n\nIt replaces what you have now for this page, as unpublished work — the website only changes when you press Publish.`)) return;
      restoreBtn.disabled = true;
      $('historyError').textContent = '';
      try {
        const res = await api(`/api/content/versions/${v.id}/restore`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ page }),
        });
        content = res.content;
        pending = res.pending || pending;
        populate();
        renderPending();
        $('historyOk').textContent = 'Restored. Close this and press Publish when you are happy with it.';
      } catch (err) {
        $('historyError').textContent = err.message;
      } finally {
        restoreBtn.disabled = false;
      }
    });

    list.appendChild(li);
  });
}

document.querySelectorAll('[data-history-page]').forEach((b) =>
  b.addEventListener('click', () => openHistory(b.dataset.historyPage))
);

/* ---------- sidebar drawer (mobile) + active nav ---------- */
const sidebar = $('sidebar');
const sidebarOverlay = $('sidebarOverlay');
const hamburger = $('hamburger');

function openDrawer() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
  hamburger.classList.add('open');
}
function closeDrawer() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
  hamburger.classList.remove('open');
}
hamburger.addEventListener('click', () =>
  sidebar.classList.contains('open') ? closeDrawer() : openDrawer()
);
sidebarOverlay.addEventListener('click', closeDrawer);

/* ---------- Settings tabs ---------- */
// Three buttons at the top of the Settings panel; the two blocks not chosen are
// hidden, not removed, so collect() still saves their fields.
const settingsTabBtns = Array.from(document.querySelectorAll('[data-settings-tab]'));
const settingsTabs = Array.from(document.querySelectorAll('[data-settings-panel]'));
const DEFAULT_SETTINGS_TAB = 'contactinfo';

function showSettingsTab(name) {
  const target = settingsTabs.some((t) => t.dataset.settingsPanel === name) ? name : DEFAULT_SETTINGS_TAB;
  settingsTabs.forEach((t) => { t.hidden = t.dataset.settingsPanel !== target; });
  settingsTabBtns.forEach((b) => {
    const on = b.dataset.settingsTab === target;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

settingsTabBtns.forEach((b) =>
  b.addEventListener('click', () => showSettingsTab(b.dataset.settingsTab))
);
showSettingsTab(DEFAULT_SETTINGS_TAB);

/* ---------- panel routing — one section on screen at a time ---------- */
// Hidden panels stay in the DOM, so collect() still gathers every field and
// a Save keeps sending the whole site, not just the visible section.
const navLinks = Array.from(document.querySelectorAll('.side-nav a'));
const panels = Array.from(document.querySelectorAll('.dash-body .panel'));
const DEFAULT_PANEL = 'panel-messages';
// Contact info, the logo and the admin users used to be three panels of their
// own; they are subheadings of Settings now, so an old bookmark still lands on
// them rather than dropping into Messages.
const PANEL_ALIASES = {
  'panel-contactinfo': { panel: 'panel-settings', tab: 'contactinfo' },
  'panel-logo': { panel: 'panel-settings', tab: 'logo' },
  'panel-users': { panel: 'panel-settings', tab: 'users' },
};

function showPanel(id) {
  const alias = PANEL_ALIASES[id];
  if (alias) showSettingsTab(alias.tab);
  const wanted = alias ? alias.panel : id;
  const target = panels.some((p) => p.id === wanted) ? wanted : DEFAULT_PANEL;
  panels.forEach((p) => { p.hidden = p.id !== target; });
  navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${target}`));
  if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
  window.scrollTo(0, 0);
}

navLinks.forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault(); // routing replaces anchor scrolling
    showPanel(a.getAttribute('href').slice(1));
    closeDrawer();
  })
);

// Keeps the back button and a pasted #panel-… URL working.
window.addEventListener('hashchange', () => showPanel(location.hash.slice(1)));
showPanel(location.hash.slice(1));

/* ---------- admin users ---------- */
async function loadUsers() {
  try {
    const { users } = await api('/api/users', { headers: authHeaders() });
    const list = $('userList');
    list.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      const isSelf = currentUser && u.email === currentUser.email;
      li.innerHTML = `
        <span class="user-email">${u.email}${isSelf ? ' <em>(you)</em>' : ''}</span>
        <span class="user-role">${u.role}</span>`;
      if (u.role !== 'owner' && !isSelf) {
        const btn = document.createElement('button');
        btn.className = 'btn danger small';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => removeUser(u.id, u.email));
        li.appendChild(btn);
      } else {
        li.appendChild(document.createElement('span'));
      }
      list.appendChild(li);
    });
  } catch (err) {
    $('userError').textContent = err.message;
  }
}
async function removeUser(id, email) {
  if (!confirm(`Remove admin user ${email}?`)) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadUsers();
  } catch (err) {
    $('userError').textContent = err.message;
  }
}
$('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('userError').textContent = '';
  try {
    await api('/api/users', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email: $('newUserEmail').value.trim(),
        password: $('newUserPassword').value,
      }),
    });
    $('newUserEmail').value = '';
    $('newUserPassword').value = '';
    loadUsers();
  } catch (err) {
    $('userError').textContent = err.message;
  }
});

/* ---------- messages inbox ---------- */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadMessages() {
  try {
    const { messages, unread } = await api('/api/messages', { headers: authHeaders() });
    const badge = $('msgBadge');
    if (unread > 0) { badge.textContent = unread; badge.hidden = false; }
    else { badge.hidden = true; }

    const list = $('msgList');
    if (!messages.length) {
      list.innerHTML = '<p class="msg-empty">No messages yet.</p>';
      return;
    }
    list.innerHTML = '';
    messages.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'msg-card' + (m.read ? '' : ' unread');
      card.innerHTML = `
        <div class="msg-top">
          <div>
            <span class="msg-name">${escapeHtml(m.name)}</span>
            <a class="msg-from" href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>
            ${m.phone ? `<a class="msg-from" href="tel:${escapeHtml(m.phone)}">${escapeHtml(m.phone)}</a>` : ''}
          </div>
          <span class="msg-date">${fmtDate(m.createdAt)}</span>
        </div>
        <p class="msg-body">${escapeHtml(m.message)}</p>
        <div class="msg-actions"></div>`;
      const actions = card.querySelector('.msg-actions');

      const reply = document.createElement('a');
      reply.className = 'btn ghost small';
      reply.href = `mailto:${m.email}?subject=${encodeURIComponent('Re: your message')}`;
      reply.textContent = 'Reply';
      actions.appendChild(reply);

      const toggle = document.createElement('button');
      toggle.className = 'btn ghost small';
      toggle.textContent = m.read ? 'Mark unread' : 'Mark read';
      toggle.addEventListener('click', () => setRead(m.id, !m.read));
      actions.appendChild(toggle);

      const del = document.createElement('button');
      del.className = 'btn danger small';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteMessage(m.id, m.name));
      actions.appendChild(del);

      list.appendChild(card);
    });
  } catch (err) {
    $('msgList').innerHTML = `<p class="msg-empty">${escapeHtml(err.message)}</p>`;
  }
}
async function setRead(id, read) {
  try {
    await api(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ read }),
    });
    loadMessages();
  } catch (_) {}
}
async function deleteMessage(id, name) {
  if (!confirm(`Delete the message from ${name}?`)) return;
  try {
    await api(`/api/messages/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadMessages();
  } catch (_) {}
}
$('refreshMsgs').addEventListener('click', loadMessages);

/* ---------- password reset modal ---------- */
const resetModal = $('resetModal');
function openReset(prefillEmail) {
  $('resetError').textContent = '';
  $('resetOk').textContent = '';
  $('resetStep1').hidden = false;
  $('resetStep2').hidden = true;
  $('resetEmail').value = prefillEmail || '';
  $('resetCode').value = '';
  $('resetNewPw').value = '';
  resetModal.hidden = false;
}
function closeReset() { resetModal.hidden = true; }
$('resetClose').addEventListener('click', closeReset);
resetModal.addEventListener('click', (e) => { if (e.target === resetModal) closeReset(); });
$('forgotBtn').addEventListener('click', () => openReset($('loginEmail').value.trim()));
$('resetPwBtn').addEventListener('click', () => openReset(currentUser ? currentUser.email : ''));

async function requestCode() {
  $('resetError').textContent = '';
  $('resetOk').textContent = '';
  const email = $('resetEmail').value.trim();
  if (!email) { $('resetError').textContent = 'Enter your email'; return; }
  try {
    const data = await api('/api/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    $('resetStep1').hidden = true;
    $('resetStep2').hidden = false;
    if (data.delivered) {
      $('resetSentMsg').textContent = `A code was sent to ${email}. Enter it below.`;
    } else if (data.devCode) {
      $('resetSentMsg').innerHTML =
        `Email is not configured, so here is your code (dev mode): <strong>${data.devCode}</strong>`;
    } else {
      $('resetSentMsg').textContent = `If ${email} is registered, a code has been sent.`;
    }
  } catch (err) {
    $('resetError').textContent = err.message;
  }
}
$('sendCodeBtn').addEventListener('click', requestCode);
$('resendBtn').addEventListener('click', requestCode);

$('confirmResetBtn').addEventListener('click', async () => {
  $('resetError').textContent = '';
  try {
    await api('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('resetEmail').value.trim(),
        code: $('resetCode').value.trim(),
        newPassword: $('resetNewPw').value,
      }),
    });
    $('resetOk').textContent = 'Password updated. Please sign in with your new password.';
    setTimeout(() => { location.reload(); }, 1800);
  } catch (err) {
    $('resetError').textContent = err.message;
  }
});

/* ---------- boot ---------- */
async function enterDashboard() {
  currentUser = await api('/api/account', { headers: authHeaders() }); // verifies token
  // The dashboard edits the draft, not the live site, and is told which pages
  // are waiting to be published.
  const state = await api('/api/content/draft', { headers: authHeaders(), cache: 'no-store' });
  content = state.content;
  pending = state.pending || {};
  populate();
  renderPending();
  $('whoami').textContent = currentUser.email;
  await loadUsers();
  await loadMessages();
  loginScreen.hidden = true;
  dash.hidden = false;
  // Poll for new messages every 30s so the inbox/badge stays current.
  setInterval(() => { if (!dash.hidden) loadMessages(); }, 30000);
}

/* ---------- password reveal toggles ---------- */
const EYE_SHOW = `<svg class="pw-icon pw-icon-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_HIDE = `<svg class="pw-icon pw-icon-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

document.querySelectorAll('input[type="password"]').forEach((input) => {
  const field = document.createElement('div');
  field.className = 'pw-field';
  input.parentNode.insertBefore(field, input);
  field.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Show password');
  btn.innerHTML = EYE_SHOW + EYE_HIDE;
  field.appendChild(btn);

  btn.addEventListener('click', () => {
    const revealed = input.type === 'text';
    input.type = revealed ? 'password' : 'text';
    btn.setAttribute('aria-pressed', String(!revealed));
    btn.setAttribute('aria-label', revealed ? 'Show password' : 'Hide password');
    input.focus();
  });
});

// Try to resume via the httpOnly session cookie; if it's missing/expired the
// account check 401s and we fall back to the login screen (with the bot challenge).
enterDashboard().catch(() => {
  loginScreen.hidden = false;
  dash.hidden = true;
  initTurnstile();
});
