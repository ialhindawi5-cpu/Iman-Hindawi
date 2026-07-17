// Seed content.projects in the live store with the existing slideshow items,
// so the Web-Projects slideshow becomes admin-editable without losing the
// screenshots already shipped as static assets. Idempotent: only seeds when
// projects is missing/empty.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql } = require('../db');

const SEED = [
  { url: 'https://exam-management-system-kappa.vercel.app/', title: 'Exam System', image: 'assets/uploads/proj-exam.png?v=2' },
  { url: 'https://hibas-bakery.vercel.app/', title: "Hiba's Bakery", image: 'assets/uploads/proj-bakery.png?v=2' },
  { url: 'https://makeup-by-ikbal.vercel.app/', title: 'Makeup by Ikbal', image: 'assets/uploads/proj-makeup.png?v=2' },
];

(async () => {
  const rows = await sql`SELECT data FROM content WHERE id = 1`;
  if (!rows[0]) throw new Error('No content row found');
  const data = rows[0].data;
  if (Array.isArray(data.projects) && data.projects.length) {
    console.log('projects already present, leaving as-is:', JSON.stringify(data.projects, null, 2));
    return;
  }
  data.projects = SEED;
  await sql`UPDATE content SET data = ${JSON.stringify(data)}::jsonb WHERE id = 1`;
  console.log('Seeded projects:', JSON.stringify(data.projects, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
