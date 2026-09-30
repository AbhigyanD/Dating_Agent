import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './lib/store.js';
import { addPerson, removePerson, runRound, job, InputError } from './lib/pipeline.js';
import { llmEnabled } from './lib/llm.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new InputError('invalid JSON')); } }); });
const brief = p => ({ id: p.id, name: p.name, headline: p.headline, location: p.location, hobbies: p.hobbies.slice(0, 3).map(h => h.name), confidence: p.confidence, synthetic: p.synthetic, engine: p.engine, links: p.links });

async function api(req, res, url) {
  const db = store.get(); const p = url.pathname; const m = req.method;
  let x;
  if (p === '/api/status' && m === 'GET') return send(res, 200, { people: db.people.length, dates: Object.keys(db.dates).length, llm: llmEnabled(), apify: !!process.env.APIFY_TOKEN, job });
  if (p === '/api/people' && m === 'GET') return send(res, 200, db.people.map(brief));
  if (p === '/api/people' && m === 'POST') {
    const b = await readBody(req);
    return send(res, 200, await addPerson(b));
  }
  if (p === '/api/people/bulk' && m === 'POST') {
    const b = await readBody(req); const results = [];
    for (const row of b.rows || []) {
      try { const person = await addPerson(row); results.push({ ok: true, id: person.id, name: person.name }); }
      catch (e) { results.push({ ok: false, error: e.message, needsManual: e.extra?.needsManual, row }); }
    }
    return send(res, 200, results);
  }
  if ((x = p.match(/^\/api\/people\/([^/]+)$/))) {
    const person = db.people.find(q => q.id === x[1]);
    if (m === 'DELETE') { removePerson(x[1]); return send(res, 200, { ok: true }); }
    return person ? send(res, 200, person) : send(res, 404, { error: 'not found' });
  }
  if (p === '/api/run' && m === 'POST') {
    const b = await readBody(req);
    await runRound({ useLLM: !!b.useLLM && llmEnabled(), topK: b.topK || 6 });
    return send(res, 200, job);
  }
  if (p === '/api/run/status') return send(res, 200, job);
  if (p === '/api/dates' && m === 'GET') {
    const who = url.searchParams.get('person');
    return send(res, 200, Object.entries(db.dates).filter(([k]) => !who || k.split('__').includes(who)).map(([k, d]) => ({ key: k, a: d.a, b: d.b, engine: d.engine, scoreA: d.verdicts.a.score, scoreB: d.verdicts.b.score })));
  }
  if ((x = p.match(/^\/api\/dates\/([^/]+)$/))) return db.dates[x[1]] ? send(res, 200, db.dates[x[1]]) : send(res, 404, { error: 'not found' });
  if (p === '/api/rankings' && m === 'GET') return send(res, 200, db.rankings);
  if ((x = p.match(/^\/api\/rankings\/([^/]+)$/))) return send(res, 200, db.rankings[x[1]] || []);
  if (p === '/api/matches' && m === 'GET') {
    const seen = new Set(); const out = [];
    for (const [id, rows] of Object.entries(db.rankings)) for (const r of rows) {
      const k = id < r.id ? `${id}__${r.id}` : `${r.id}__${id}`;
      if (r.mutual && !seen.has(k)) { seen.add(k); out.push({ key: k, a: id, b: r.id, aName: db.people.find(q => q.id === id)?.name, bName: r.name, score: Math.round((r.myScore + r.theirScore) / 2), shared: r.shared }); }
    }
    return send(res, 200, out.sort((a, b) => b.score - a.score).slice(0, 30));
  }
  return send(res, 404, { error: 'no such endpoint' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(path.join(root, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'public', 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (e instanceof InputError) return send(res, e.status, { error: e.message, ...e.extra });
    console.error(e); send(res, 500, { error: 'internal error: ' + e.message });
  }
}).listen(PORT, () => console.log(`Agentic Dating on http://localhost:${PORT}  (Claude: ${llmEnabled() ? 'on' : 'off, heuristic engine'})`));
