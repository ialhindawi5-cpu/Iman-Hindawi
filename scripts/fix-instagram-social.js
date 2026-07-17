// One-off: clean up the garbled Instagram social entry in the live content store.
// The admin had saved the whole share URL into the label with url = "#".
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql } = require('../db');

(async () => {
  const rows = await sql`SELECT data FROM content WHERE id = 1`;
  if (!rows[0]) throw new Error('No content row found');
  const data = rows[0].data;

  const socials = Array.isArray(data.contact?.socials) ? data.contact.socials : [];
  const cleaned = socials.map((s) => {
    const hint = `${s.label || ''} ${s.url || ''}`;
    if (/instagram/i.test(hint)) {
      return { label: 'Instagram', url: 'https://www.instagram.com/eman_s.hindawi/' };
    }
    return s;
  });
  if (!cleaned.some((s) => /instagram/i.test(`${s.label} ${s.url}`))) {
    cleaned.unshift({ label: 'Instagram', url: 'https://www.instagram.com/eman_s.hindawi/' });
  }
  data.contact.socials = cleaned;

  await sql`UPDATE content SET data = ${JSON.stringify(data)}::jsonb WHERE id = 1`;
  console.log('Updated socials:', JSON.stringify(cleaned, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
