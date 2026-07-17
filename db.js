const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Lazily create the Neon client so the module can be imported without DATABASE_URL
// (it only errors if a query actually runs without a connection string).
let _client = null;
function client() {
  if (!_client) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — provide a Neon Postgres connection string.');
    }
    _client = neon(process.env.DATABASE_URL);
  }
  return _client;
}
const sql = (strings, ...values) => client()(strings, ...values);

// Seed content is the existing content.json (shipped in the repo).
const DEFAULT_CONTENT = require('./data/content.json');

let initPromise = null;
function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit() {
  await sql`CREATE TABLE IF NOT EXISTS content (
    id int PRIMARY KEY DEFAULT 1,
    data jsonb NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL,
    role text NOT NULL,
    salt text NOT NULL,
    hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY,
    name text,
    email text,
    phone text,
    message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read boolean NOT NULL DEFAULT false
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reset_codes (
    email text PRIMARY KEY,
    code text NOT NULL,
    expires bigint NOT NULL,
    attempts int NOT NULL DEFAULT 0
  )`;
  // Two-factor login codes (emailed after a correct password, required to finish sign-in).
  await sql`CREATE TABLE IF NOT EXISTS login_codes (
    email text PRIMARY KEY,
    code text NOT NULL,
    expires bigint NOT NULL,
    attempts int NOT NULL DEFAULT 0
  )`;
  // token_version invalidates old JWTs when a password changes.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0`;
  // Rate-limit events (brute-force protection), shared across serverless instances.
  await sql`CREATE TABLE IF NOT EXISTS rate_events (k text NOT NULL, ts bigint NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS rate_events_k_ts ON rate_events (k, ts)`;

  // Seed content row once.
  const c = await sql`SELECT 1 FROM content WHERE id = 1`;
  if (c.length === 0) {
    await sql`INSERT INTO content (id, data) VALUES (1, ${JSON.stringify(DEFAULT_CONTENT)}::jsonb)`;
  }

  // Seed the owner account once.
  const u = await sql`SELECT 1 FROM users LIMIT 1`;
  if (u.length === 0) {
    const email = (process.env.ADMIN_EMAIL || 'i.alhindawi5@gmail.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'iman-admin';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    await sql`INSERT INTO users (id, email, role, salt, hash)
              VALUES (${crypto.randomUUID()}, ${email}, 'owner', ${salt}, ${hash})`;
    console.log(`  Seeded admin owner: ${email}`);
  }
}

module.exports = { sql, init };
