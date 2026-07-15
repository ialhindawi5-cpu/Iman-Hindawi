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

app.use(express.json({ limit: '2mb' }));

// Ensure the database schema/seed exists before handling any request (cached after first).
app.use(async (req, res, next) => {
  try { await init(); next(); }
  catch (err) { console.error('DB init failed:', err.message); res.status(500).json({ error: 'Database unavailable' }); }
});

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
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(AUTH_SECRET);
}
async function requireAuth(req, res, next) {
  const token = req.get('x-admin-token');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET);
    req.user = { userId: payload.sub, email: payload.email };
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
async function storeImage(section, file) {
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
  const filename = `${section.replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return blob.url; // absolute https URL
  }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return `assets/uploads/${filename}`; // relative path (served statically)
}

/* ============================================================
 *  Auth routes
 * ============================================================ */
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password || '', user.salt, user.hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = await signToken(user);
  res.json({ token, email: user.email, role: user.role });
});

app.post('/api/logout', requireAuth, (_req, res) => res.json({ ok: true }));

app.get('/api/account', requireAuth, async (req, res) => {
  const rows = await sql`SELECT email, role FROM users WHERE id = ${req.user.userId}`;
  if (!rows[0]) return res.status(401).json({ error: 'Unauthorized' });
  res.json(rows[0]);
});

/* ---------- Password reset via email code ---------- */
app.post('/api/request-reset', async (req, res) => {
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
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const { salt, hash } = hashPassword(newPassword);
  await sql`UPDATE users SET salt = ${salt}, hash = ${hash} WHERE id = ${user.id}`;
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
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

app.post('/api/upload/:section', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const url = await storeImage(req.params.section, req.file);
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

/* ============================================================
 *  Contact messages
 * ============================================================ */
app.post('/api/contact', async (req, res) => {
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
