const TOKEN_KEY = 'imanAdminToken';
let content = null;
let currentUser = null;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
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
  return { 'x-admin-token': localStorage.getItem(TOKEN_KEY) || '', ...extra };
}
async function api(url, options = {}) {
  const res = await fetch(url, options);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    if (res.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

/* ---------- login ---------- */
const loginScreen = $('loginScreen');
const dash = $('dash');

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value,
      }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    enterDashboard();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', headers: authHeaders() }); } catch (_) {}
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

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
    applyPreview(el, content.sections[el.dataset.preview]?.image);
  });
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
      if (content && content.sections && content.sections[section]) content.sections[section].image = '';
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
      content.sections[section].image = data.path;
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

// Close the drawer when a nav link is tapped
const navLinks = Array.from(document.querySelectorAll('.side-nav a'));
navLinks.forEach((a) => a.addEventListener('click', closeDrawer));

// Highlight the nav link for the section currently in view
const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const id = e.target.id;
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
      }
    });
  },
  { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
);
document.querySelectorAll('.panel').forEach((p) => navObserver.observe(p));

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
    setTimeout(() => {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }, 1800);
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

if (localStorage.getItem(TOKEN_KEY)) {
  enterDashboard().catch(() => {
    localStorage.removeItem(TOKEN_KEY);
    loginScreen.hidden = false;
    dash.hidden = true;
  });
}
