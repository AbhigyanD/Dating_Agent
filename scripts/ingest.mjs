// Real cohort: fill data/cohort.csv (linkedin_url,instagram_url per line), then:
//   APIFY_TOKEN=... [ANTHROPIC_API_KEY=...] node scripts/ingest.mjs [--keep]
// Scrapes both sources for each person, analyzes, runs every date, builds rankings into data/db.json.
import fs from 'node:fs';
const store = await import('../lib/store.js');
const { addPerson } = await import('../lib/pipeline.js');
const { runDate, buildRankings } = await import('../lib/date.js');
const { llmEnabled } = await import('../lib/llm.js');

const rows = fs.readFileSync(new URL('../data/cohort.csv', import.meta.url), 'utf8').split('\n').slice(1).map(l => l.split(',').map(s => s.trim())).filter(r => r[0] && r[1]);
if (!process.argv.includes('--keep')) store.reset();
const failed = [];
for (const [linkedinUrl, instagramUrl] of rows) {
  try { const p = await addPerson({ linkedinUrl, instagramUrl }); console.log('✓', p.name, `(li ${p.sources.linkedin.chars}c, ig ${p.sources.instagram.chars}c)`); }
  catch (e) { console.log('✗', linkedinUrl, e.message); failed.push(linkedinUrl); }
}
const db = store.get();
for (let i = 0; i < db.people.length; i++) for (let j = i + 1; j < db.people.length; j++) {
  const d = await runDate(db.people[i], db.people[j], { useLLM: llmEnabled() });
  db.dates[`${d.a}__${d.b}`] = d;
}
db.rankings = buildRankings(db.people, db.dates);
store.save();
console.log(`${db.people.length} people, ${Object.keys(db.dates).length} dates. Failed: ${failed.length}`);
