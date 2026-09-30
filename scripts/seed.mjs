// Builds data/db.json: 25 synthetic personas -> analyzed -> every pair dated -> rankings.
process.env.DB_FILE ||= new URL('../data/db.json', import.meta.url).pathname;
const store = await import('../lib/store.js');
const { addPerson } = await import('../lib/pipeline.js');
const { runDate, buildRankings } = await import('../lib/date.js');
const { default: personas } = await import('./personas.mjs');

store.reset();
for (const p of personas) {
  await addPerson({ linkedinUrl: `https://www.linkedin.com/in/${p.slug}`, instagramUrl: `https://www.instagram.com/${p.instagram.username}/`, sources: { linkedin: p.linkedin, instagram: p.instagram }, synthetic: true });
}
const db = store.get();
for (let i = 0; i < db.people.length; i++) for (let j = i + 1; j < db.people.length; j++) {
  const d = await runDate(db.people[i], db.people[j]);
  db.dates[`${d.a}__${d.b}`] = d;
}
db.rankings = buildRankings(db.people, db.dates);
db.runs.push({ at: Date.now(), people: db.people.length, dates: Object.keys(db.dates).length, llm: false });
store.save();
console.log(`seeded ${db.people.length} people, ${Object.keys(db.dates).length} dates`);
for (const p of db.people.slice(0, 4)) console.log(p.name, '→', db.rankings[p.id].slice(0, 3).map(r => `${r.name} ${r.fit}`).join(' | '));
