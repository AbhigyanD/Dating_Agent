import * as store from './store.js';
import { parseLinkedIn, parseInstagram, scrapeLinkedIn, scrapeInstagram, fromPastedLinkedIn, fromPastedInstagram } from './scrape.js';
import { analyze, flatten } from './analyze.js';
import { runDate, buildRankings } from './date.js';

export class InputError extends Error { constructor(msg, extra = {}) { super(msg); this.extra = extra; this.status = extra.status || 400; } }

export async function addPerson({ linkedinUrl, instagramUrl, linkedinText, instagramText, synthetic = false, sources }) {
  const li = parseLinkedIn(linkedinUrl || '');
  const ig = parseInstagram(instagramUrl || '');
  if (!li) throw new InputError('Need a valid LinkedIn profile URL like https://www.linkedin.com/in/username');
  if (!ig) throw new InputError('Need a valid public Instagram profile URL like https://www.instagram.com/username/');
  const id = li.slug.replace(/[^a-z0-9-]/g, '-').slice(0, 60);

  let linkedin; let instagram;
  if (sources) ({ linkedin, instagram } = sources);
  else {
    [linkedin, instagram] = await Promise.all([
      linkedinText?.trim() ? fromPastedLinkedIn(li.url, linkedinText) : scrapeLinkedIn(li),
      instagramText?.trim() ? fromPastedInstagram(ig.url, ig.handle, instagramText) : scrapeInstagram(ig),
    ]);
  }
  const { liText, igText } = flatten(linkedin.ok ? linkedin : null, instagram.ok ? instagram : null);
  if (liText.length + igText.length < 60) {
    throw new InputError('Could not read enough public data from these profiles. Both sites block anonymous scraping from many networks — paste the visible profile text below (or set APIFY_TOKEN on the server).', {
      status: 422, needsManual: true, linkedin: { ok: linkedin.ok, error: linkedin.error }, instagram: { ok: instagram.ok, error: instagram.error } });
  }
  const profile = await analyze({ linkedin: linkedin.ok ? linkedin : null, instagram: instagram.ok ? instagram : null });
  const person = {
    id, ...profile, synthetic, addedAt: Date.now(),
    links: { linkedin: li.url, instagram: ig.url },
    sources: {
      linkedin: { ok: linkedin.ok, via: linkedin.via, chars: liText.length, error: linkedin.error },
      instagram: { ok: instagram.ok, via: instagram.via, chars: igText.length, posts: instagram.posts?.length || 0, error: instagram.error },
    },
  };
  const db = store.get();
  const i = db.people.findIndex(p => p.id === id);
  if (i >= 0) db.people[i] = person; else db.people.push(person);
  // profile changed → stale dates involving this person
  for (const k of Object.keys(db.dates)) if (k.split('__').includes(id)) delete db.dates[k];
  store.save();
  return person;
}

export const removePerson = id => {
  const db = store.get();
  db.people = db.people.filter(p => p.id !== id);
  for (const k of Object.keys(db.dates)) if (k.split('__').includes(id)) delete db.dates[k];
  db.rankings = buildRankings(db.people, db.dates);
  store.save();
};

// ---- dating round (background job with live progress)
export const job = { running: false, total: 0, done: 0, recent: [], startedAt: 0, error: null };

export async function runRound({ useLLM = false, topK = 6 } = {}) {
  if (job.running) return job;
  const db = store.get();
  const people = db.people;
  if (people.length < 2) throw new InputError('Add at least 2 people before running a dating round.');
  const pairs = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) pairs.push([people[i], people[j]]);
  Object.assign(job, { running: true, total: pairs.length, done: 0, recent: [], startedAt: Date.now(), error: null });
  db.dates = {};
  (async () => {
    try {
      // With Claude: only pairs in each agent's pre-screened top-K get a full LLM date; the rest use the fast engine.
      let llmPairs = new Set();
      if (useLLM) {
        const { compat } = await import('./date.js');
        for (const p of people) {
          people.filter(q => q.id !== p.id).map(q => ({ q, s: compat(p, q).score + compat(q, p).score }))
            .sort((x, y) => y.s - x.s).slice(0, topK).forEach(({ q }) => llmPairs.add(p.id < q.id ? `${p.id}__${q.id}` : `${q.id}__${p.id}`));
        }
      }
      for (const [a, b] of pairs) {
        const key = a.id < b.id ? `${a.id}__${b.id}` : `${b.id}__${a.id}`;
        const d = await runDate(a, b, { useLLM: useLLM && llmPairs.has(key) });
        db.dates[key] = d;
        job.done++;
        job.recent.unshift({ key, a: a.name, b: b.name, scoreA: d.verdicts.a.score, scoreB: d.verdicts.b.score, engine: d.engine });
        job.recent = job.recent.slice(0, 12);
        if (job.done % 20 === 0) await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 15)); // let the UI stream the dates as they happen
      }
      db.rankings = buildRankings(people, db.dates);
      db.runs.push({ at: Date.now(), people: people.length, dates: pairs.length, llm: useLLM });
      store.save();
    } catch (e) { job.error = e.message; } finally { job.running = false; }
  })();
  return job;
}
