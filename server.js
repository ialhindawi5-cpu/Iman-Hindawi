require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SignJWT, jwtVerify } = require('jose');
const { sql, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const OWNER_EMAIL = process.env.ADMIN_EMAIL || 'i.alhindawi5@gmail.com';
const UPLOAD_DIR = path.join(__dirname, 'public', 'assets', 'uploads');
const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-insecure-secret-change-me'
);

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// ---------- Security headers (applied to API + local static) ----------
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// Ensure the database schema/seed exists before handling any request (cached after first).
app.use(async (req, res, next) => {
  try { await init(); next(); }
  catch (err) { console.error('DB init failed:', err.message); res.status(500).json({ error: 'Database unavailable' }); }
});

// ---------- Rate limiting (DB-backed → works across serverless instances) ----------
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}
function rateLimit(name, max, windowMs) {
  return async (req, res, next) => {
    try {
      const key = `${name}:${clientIp(req)}`;
      const now = Date.now();
      const rows = await sql`SELECT count(*)::int AS n FROM rate_events WHERE k = ${key} AND ts > ${now - windowMs}`;
      if (rows[0].n >= max) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }
      await sql`INSERT INTO rate_events (k, ts) VALUES (${key}, ${now})`;
      if (Math.random() < 0.05) await sql`DELETE FROM rate_events WHERE ts < ${now - 24 * 60 * 60 * 1000}`;
      next();
    } catch (err) {
      console.error('rate-limit error:', err.message); // fail open — never lock out on a DB hiccup
      next();
    }
  };
}

/* ============================================================
 *  Password hashing + JWT auth (stateless — works on serverless)
 * ============================================================ */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function signToken(user) {
  return new SignJWT({ email: user.email, tv: user.token_version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('2d')
    .sign(AUTH_SECRET);
}
async function requireAuth(req, res, next) {
  const token = req.get('x-admin-token');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET, { algorithms: ['HS256'] });
    // Confirm the user still exists and the token hasn't been invalidated by a password change.
    const rows = await sql`SELECT id, email, role, token_version FROM users WHERE id = ${payload.sub}`;
    const user = rows[0];
    if (!user || Number(payload.tv) !== user.token_version) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

const findUserByEmail = async (email) => {
  const rows = await sql`SELECT * FROM users WHERE email = ${String(email || '').toLowerCase().trim()}`;
  return rows[0] || null;
};

/* ============================================================
 *  Email (nodemailer) — configure via env for real delivery
 * ============================================================ */
function getTransport() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return null;
}
async function sendResetCode(email, code) {
  const transport = getTransport();
  if (!transport) {
    console.log(`\n  [DEV] Password reset code for ${email}: ${code}\n`);
    return { delivered: false };
  }
  await transport.sendMail({
    from: `"Iman Al Hindawi Admin" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Your admin password reset code',
    text: `Your verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Your verification code is:</p><p style="font-size:26px;letter-spacing:4px;font-weight:700;color:#c83c6d">${code}</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
  });
  return { delivered: true };
}

async function getNotifyEmail() {
  if (process.env.NOTIFY_EMAIL) return process.env.NOTIFY_EMAIL;
  const rows = await sql`SELECT email FROM users WHERE role = 'owner' LIMIT 1`;
  return rows[0] ? rows[0].email : OWNER_EMAIL;
}
async function sendContactNotification(msg) {
  const transport = getTransport();
  const to = await getNotifyEmail();
  if (!transport) {
    console.log(`\n  [DEV] New message from ${msg.name} <${msg.email}> (would email ${to}):\n  ${msg.message}\n`);
    return { delivered: false };
  }
  await transport.sendMail({
    from: `"Iman Al Hindawi Website" <${process.env.GMAIL_USER}>`,
    to,
    replyTo: `"${msg.name}" <${msg.email}>`,
    subject: `New message from ${msg.name}`,
    text: `You received a new message via your website.\n\nFrom: ${msg.name} <${msg.email}>\n${msg.phone ? 'Phone: ' + msg.phone + '\n' : ''}Date: ${msg.createdAt}\n\n${msg.message}\n\nReply directly to this email to respond.`,
    html: `<p>You received a new message via your website.</p>
      <p><strong>From:</strong> ${msg.name} &lt;${msg.email}&gt;<br/>
      ${msg.phone ? '<strong>Phone:</strong> ' + msg.phone + '<br/>' : ''}
      <strong>Date:</strong> ${msg.createdAt}</p>
      <p style="white-space:pre-wrap;border-left:3px solid #c83c6d;padding-left:12px">${msg.message}</p>
      <p style="color:#888">Reply directly to this email to respond.</p>`,
  });
  return { delivered: true };
}

/* ============================================================
 *  Content store (Postgres)
 * ============================================================ */
async function getContent() {
  const rows = await sql`SELECT data FROM content WHERE id = 1`;
  return rows[0] ? rows[0].data : null;
}
async function saveContent(data) {
  await sql`UPDATE content SET data = ${JSON.stringify(data)}::jsonb WHERE id = 1`;
}

/* ============================================================
 *  Image uploads — Vercel Blob in prod, local disk in dev
 * ============================================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed')),
});
// Blob stores connected through Vercel's dashboard authenticate over OIDC and
// issue no read-write token; the store id arrives under the connection's env
// prefix, which is not the BLOB_STORE_ID the SDK reads by default.
const BLOB_STORE_ID = process.env.BLOB_STORE_ID || process.env.ImanBlob_STORE_ID;

// Inside a function the OIDC token is per-request header only — the env var is
// populated during builds and `vercel env pull`, never at runtime. Both must be
// passed to put() explicitly, since the SDK only auto-reads the env var.
function getOidcToken(req) {
  return process.env.VERCEL_OIDC_TOKEN || (req && req.headers['x-vercel-oidc-token']) || null;
}

// Persist an image buffer to Blob (prod) or local disk (dev) and return its URL.
async function storeImageBuffer(baseName, buffer, contentType, req) {
  const ext =
    contentType === 'image/png' ? '.png'
      : contentType === 'image/webp' ? '.webp'
        : /jpe?g/.test(contentType || '') ? '.jpg'
          : '.jpg';
  const filename = `${String(baseName).replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}${ext}`;
  const oidcToken = getOidcToken(req);
  if (oidcToken && BLOB_STORE_ID) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, buffer, {
      access: 'public', contentType, storeId: BLOB_STORE_ID, oidcToken,
    });
    return blob.url; // absolute https URL
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, buffer, { access: 'public', contentType });
    return blob.url; // absolute https URL
  }
  // The disk fallback only works locally — Vercel's filesystem is read-only.
  if (process.env.VERCEL) {
    throw new Error(
      'Image storage is not configured. In Vercel: Storage → Blob → Connect to Project, then redeploy.'
    );
  }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `assets/uploads/${filename}`; // relative path (served statically)
}

async function storeImage(section, file, req) {
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  // Preserve the uploaded extension when we recognise it; otherwise fall back
  // to the content-type mapping inside storeImageBuffer.
  const type = /png$/.test(ext) ? 'image/png'
    : /webp$/.test(ext) ? 'image/webp'
      : file.mimetype;
  return storeImageBuffer(section, file.buffer, type, req);
}

// Capture a screenshot of a live URL via Microlink's free API, then re-host it
// in our own Blob store so the slideshow never hot-links a third party (and it
// stays within our image CSP). Also returns the page <title> for the slide label.
async function captureProjectShot(targetUrl, req) {
  const endpoint =
    'https://api.microlink.io/?' +
    new URLSearchParams({
      url: targetUrl,
      screenshot: 'true',
      meta: 'true',
      type: 'png',
      'viewport.width': '1280',
      'viewport.height': '800',
      'viewport.deviceScaleFactor': '2',
    }).toString();

  const headers = {};
  if (process.env.MICROLINK_API_KEY) headers['x-api-key'] = process.env.MICROLINK_API_KEY;

  const metaRes = await fetch(endpoint, { headers });
  const meta = await metaRes.json().catch(() => null);
  const shotUrl = meta && meta.data && meta.data.screenshot && meta.data.screenshot.url;
  if (!metaRes.ok || meta.status !== 'success' || !shotUrl) {
    const reason = (meta && (meta.message || meta.status)) || `HTTP ${metaRes.status}`;
    throw new Error(`Screenshot service could not capture that URL (${reason}).`);
  }

  const imgRes = await fetch(shotUrl);
  if (!imgRes.ok) throw new Error('Could not download the captured screenshot.');
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const image = await storeImageBuffer('project', buffer, 'image/png', req);
  const title = String((meta.data.title || '')).trim();
  return { image, title };
}

/* ============================================================
 *  Auth routes
 * ============================================================ */
app.post('/api/login', rateLimit('login', 8, 10 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password || '', user.salt, user.hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = await signToken(user);
  res.json({ token, email: user.email, role: user.role });
});

app.post('/api/logout', requireAuth, (_req, res) => res.json({ ok: true }));

// Admin-only config check. Reports presence of env vars as booleans — never their values.
app.get('/api/_diag', requireAuth, (req, res) => {
  res.json({
    onVercel: !!process.env.VERCEL,
    blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobOidcEnv: !!process.env.VERCEL_OIDC_TOKEN,
    blobOidcHeader: !!req.headers['x-vercel-oidc-token'],
    blobOidcResolved: !!getOidcToken(req),
    blobStoreId: !!BLOB_STORE_ID,
    databaseUrl: !!process.env.DATABASE_URL,
    authSecret: !!process.env.AUTH_SECRET,
    gmailUser: !!process.env.GMAIL_USER,
    gmailAppPassword: !!process.env.GMAIL_APP_PASSWORD,
    notifyEmail: !!process.env.NOTIFY_EMAIL,
  });
});

app.get('/api/account', requireAuth, async (req, res) => {
  const rows = await sql`SELECT email, role FROM users WHERE id = ${req.user.userId}`;
  if (!rows[0]) return res.status(401).json({ error: 'Unauthorized' });
  res.json(rows[0]);
});

/* ---------- Password reset via email code ---------- */
app.post('/api/request-reset', rateLimit('reset', 5, 15 * 60 * 1000), async (req, res) => {
  const user = await findUserByEmail(req.body?.email);
  if (user) {
    const code = String(crypto.randomInt(100000, 1000000));
    const expires = Date.now() + 10 * 60 * 1000;
    await sql`INSERT INTO reset_codes (email, code, expires, attempts)
              VALUES (${user.email}, ${code}, ${expires}, 0)
              ON CONFLICT (email) DO UPDATE SET code = ${code}, expires = ${expires}, attempts = 0`;
    try {
      const { delivered } = await sendResetCode(user.email, code);
      return res.json({ ok: true, delivered, devCode: delivered ? undefined : code });
    } catch (err) {
      return res.status(500).json({ error: 'Could not send email: ' + err.message });
    }
  }
  res.json({ ok: true, delivered: false });
});

app.post('/api/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user) return res.status(400).json({ error: 'Request a new code' });
  const rows = await sql`SELECT * FROM reset_codes WHERE email = ${user.email}`;
  const entry = rows[0];
  if (!entry) return res.status(400).json({ error: 'Request a new code' });
  if (Date.now() > Number(entry.expires)) {
    await sql`DELETE FROM reset_codes WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'Code expired — request a new one' });
  }
  if (entry.attempts >= 5) {
    await sql`DELETE FROM reset_codes WHERE email = ${user.email}`;
    return res.status(429).json({ error: 'Too many attempts — request a new code' });
  }
  if (String(code) !== entry.code) {
    await sql`UPDATE reset_codes SET attempts = attempts + 1 WHERE email = ${user.email}`;
    return res.status(400).json({ error: 'Invalid code' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const { salt, hash } = hashPassword(newPassword);
  // Bump token_version so any existing sessions with the old password are invalidated.
  await sql`UPDATE users SET salt = ${salt}, hash = ${hash}, token_version = token_version + 1 WHERE id = ${user.id}`;
  await sql`DELETE FROM reset_codes WHERE email = ${user.email}`;
  res.json({ ok: true });
});

/* ---------- Admin user management ---------- */
app.get('/api/users', requireAuth, async (_req, res) => {
  const users = await sql`SELECT id, email, role, created_at AS "createdAt" FROM users ORDER BY created_at ASC`;
  res.json({ users });
});

app.post('/api/users', requireAuth, async (req, res) => {
  const { email, password } = req.body || {};
  const clean = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = await findUserByEmail(clean);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists' });
  const { salt, hash } = hashPassword(password);
  const id = crypto.randomUUID();
  const rows = await sql`INSERT INTO users (id, email, role, salt, hash)
    VALUES (${id}, ${clean}, 'admin', ${salt}, ${hash})
    RETURNING id, email, role, created_at AS "createdAt"`;
  res.json({ ok: true, user: rows[0] });
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
  const rows = await sql`SELECT id, role FROM users WHERE id = ${req.params.id}`;
  const target = rows[0];
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (target.role === 'owner') return res.status(400).json({ error: 'The owner account cannot be deleted' });
  await sql`DELETE FROM users WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

/* ============================================================
 *  Content routes
 * ============================================================ */
app.get('/api/content', async (_req, res) => {
  try { res.json(await getContent()); }
  catch { res.status(500).json({ error: 'Could not read content' }); }
});

app.put('/api/content', requireAuth, async (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || !incoming.hero || !incoming.sections) {
      return res.status(400).json({ error: 'Invalid content payload' });
    }
    await saveContent(incoming);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not save content' });
  }
});

// Capture (or refresh) a screenshot for a Web-Projects slide from just its URL.
app.post('/api/projects/screenshot', requireAuth, async (req, res) => {
  let target = String(req.body?.url || '').trim();
  if (!target) return res.status(400).json({ error: 'A project URL is required.' });
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    // Validate the URL and only allow public http(s) links.
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol');
    target = u.toString();
  } catch {
    return res.status(400).json({ error: 'That does not look like a valid website URL.' });
  }
  try {
    const { image, title } = await captureProjectShot(target, req);
    res.json({ ok: true, url: target, image, title });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not capture a screenshot.' });
  }
});

// Verify the bytes are really an image (defends against disguised uploads).
function looksLikeImage(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true; // WEBP
  return false;
}
const ALLOWED_SECTIONS = new Set(['actress', 'entrepreneur', 'philanthropist']);
app.post('/api/upload/:section', requireAuth, upload.single('image'), async (req, res) => {
  if (!ALLOWED_SECTIONS.has(req.params.section)) return res.status(400).json({ error: 'Invalid section' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!looksLikeImage(req.file.buffer)) return res.status(400).json({ error: 'File is not a valid image' });
  try {
    const url = await storeImage(req.params.section, req.file, req);
    const content = await getContent();
    if (content && content.sections && content.sections[req.params.section]) {
      content.sections[req.params.section].image = url;
      await saveContent(content);
    }
    res.json({ ok: true, path: url });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// Best-effort: an orphaned blob is not worth failing the removal over, since the
// section is only considered cleared once the content reference is gone.
async function deleteStoredImage(image, req) {
  try {
    if (/^https?:\/\//.test(image)) {
      const { del } = require('@vercel/blob');
      const oidcToken = getOidcToken(req);
      if (oidcToken && BLOB_STORE_ID) await del(image, { storeId: BLOB_STORE_ID, oidcToken });
      else if (process.env.BLOB_READ_WRITE_TOKEN) await del(image);
      return;
    }
    if (process.env.VERCEL) return; // read-only filesystem
    const full = path.join(__dirname, 'public', image);
    if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) fs.unlinkSync(full);
  } catch (err) {
    console.error('Could not delete stored image:', err.message);
  }
}

app.delete('/api/upload/:section', requireAuth, async (req, res) => {
  const section = req.params.section;
  if (!ALLOWED_SECTIONS.has(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    const content = await getContent();
    const current = content && content.sections && content.sections[section]
      ? content.sections[section].image
      : '';
    if (current) await deleteStoredImage(current, req);
    if (content && content.sections && content.sections[section]) {
      content.sections[section].image = '';
      await saveContent(content);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Remove failed: ' + err.message });
  }
});

/* ============================================================
 *  Contact messages
 * ============================================================ */
app.post('/api/contact', rateLimit('contact', 5, 15 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !phone || !message) {
    return res.status(400).json({ error: 'Please fill in your name, email, phone and message.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!/[0-9]{6,}/.test(phone.replace(/[\s()+-]/g, ''))) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long.' });
  }

  const entry = {
    id: crypto.randomUUID(),
    name: name.slice(0, 120),
    email: email.slice(0, 160),
    phone: phone.slice(0, 40),
    message,
    createdAt: new Date().toISOString(),
  };
  try {
    await sql`INSERT INTO messages (id, name, email, phone, message, read)
              VALUES (${entry.id}, ${entry.name}, ${entry.email}, ${entry.phone}, ${entry.message}, false)`;
  } catch {
    return res.status(500).json({ error: 'Could not save your message.' });
  }
  try { await sendContactNotification(entry); } catch (err) { console.error('Notify failed:', err.message); }
  res.json({ ok: true });
});

app.get('/api/messages', requireAuth, async (_req, res) => {
  try {
    const messages = await sql`
      SELECT id, name, email, phone, message, created_at AS "createdAt", read
      FROM messages ORDER BY created_at DESC`;
    const unread = messages.filter((m) => !m.read).length;
    res.json({ messages, unread });
  } catch {
    res.status(500).json({ error: 'Could not read messages' });
  }
});

app.patch('/api/messages/:id', requireAuth, async (req, res) => {
  if (typeof req.body?.read !== 'boolean') return res.json({ ok: true });
  const rows = await sql`UPDATE messages SET read = ${req.body.read} WHERE id = ${req.params.id} RETURNING id`;
  if (!rows[0]) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  const rows = await sql`DELETE FROM messages WHERE id = ${req.params.id} RETURNING id`;
  if (!rows[0]) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

/* ============================================================
 *  Static sites (used locally; on Vercel these are served by routes)
 * ============================================================ */
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/', express.static(path.join(__dirname, 'public')));

// ---------- Error handler (never leak stack traces) ----------
app.use((err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image is too large (max 8MB)' });
    if (/only image files/i.test(err.message || '')) return res.status(400).json({ error: 'Only image files are allowed' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error('Unhandled error:', err.message);
  }
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

// Only listen when run directly (local dev). On Vercel the app is exported.
if (require.main === module) {
  app.listen(PORT, () => {
    const mail = getTransport() ? 'Gmail configured' : 'DEV mode (codes printed to console)';
    console.log(`\n  Iman Al Hindawi site running:`);
    console.log(`  • Website   →  http://localhost:${PORT}`);
    console.log(`  • Dashboard →  http://localhost:${PORT}/admin`);
    console.log(`  • Email     →  ${mail}\n`);
  });
}

module.exports = app;
