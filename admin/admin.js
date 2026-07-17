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

/* ---------- image target helpers (sections + logo) ---------- */
// The logo lives at content.brand.logo; the pillar images at content.sections[k].image.
function sectionImage(section) {
  if (section === 'logo') return content.brand && content.brand.logo;
  return content.sections && content.sections[section] && content.sections[section].image;
}
function setSectionImage(section, url) {
  if (section === 'logo') {
    content.brand = content.brand || {};
    content.brand.logo = url;
    return;
  }
  if (content.sections && content.sections[section]) content.sections[section].image = url;
}

/* ---------- content populate & collect ---------- */
function populate() {
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

/* ---------- web projects (slideshow) ---------- */
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
  if (!confirm('Remove this project from the slideshow?')) return;
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
    projStatus('Screenshot updated ✓ — click Save changes to publish.', 'ok');
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
    projStatus('Project added ✓ — click Save changes to publish it live.', 'ok');
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

/* ---------- save content ---------- */
async function save() {
  const saveMsg = $('saveMsg');
  saveMsg.className = '';
  saveMsg.textContent = 'Saving…';
  try {
    await api('/api/content', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(collect()),
    });
    saveMsg.textContent = 'All changes saved ✓';
    saveMsg.classList.add('ok');
    setTimeout(() => { saveMsg.textContent = ''; saveMsg.className = ''; }, 2500);
  } catch (err) {
    saveMsg.textContent = err.message;
    saveMsg.classList.add('err');
  }
}
$('saveBtn').addEventListener('click', save);
$('saveBtn2').addEventListener('click', save);
$('saveBtnMobile').addEventListener('click', save);

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

/* ---------- panel routing — one section on screen at a time ---------- */
// Hidden panels stay in the DOM, so collect() still gathers every field and
// Save changes keeps saving the whole site, not just the visible section.
const navLinks = Array.from(document.querySelectorAll('.side-nav a'));
const panels = Array.from(document.querySelectorAll('.dash-body .panel'));
const DEFAULT_PANEL = 'panel-messages';

function showPanel(id) {
  const target = panels.some((p) => p.id === id) ? id : DEFAULT_PANEL;
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
  content = await api('/api/content', { cache: 'no-store' });
  populate();
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
