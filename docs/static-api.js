(() => {
  const realFetch = window.fetch.bind(window);
  let dbp;
  const load = () => dbp ||= realFetch('db.json').then(r => r.json());
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const brief = p => ({ id: p.id, name: p.name, headline: p.headline, location: p.location, hobbies: p.hobbies.slice(0, 3).map(h => h.name), confidence: p.confidence, synthetic: p.synthetic, engine: p.engine, links: p.links });
  async function route(path, method, query) {
    const db = await load(); let x;
    if (method !== 'GET') return reply({ error: 'This is a read-only demo on GitHub Pages. Run the app locally (node server.js) to add people or run dates.' }, 403);
    if (path === '/status') return reply({ people: db.people.length, dates: Object.keys(db.dates).length, llm: false, apify: false, job: { running: false } });
    if (path === '/people') return reply(db.people.map(brief));
    if ((x = path.match(/^\/people\/([^/]+)$/))) { const p = db.people.find(q => q.id === x[1]); return p ? reply(p) : reply({ error: 'not found' }, 404); }
    if (path === '/run/status') return reply({ running: false });
    if (path === '/dates') {
      const who = query.get('person');
      return reply(Object.entries(db.dates).filter(([k]) => !who || k.split('__').includes(who)).map(([k, d]) => ({ key: k, a: d.a, b: d.b, engine: d.engine, scoreA: d.verdicts.a.score, scoreB: d.verdicts.b.score })));
    }
    if ((x = path.match(/^\/dates\/([^/]+)$/))) return db.dates[x[1]] ? reply(db.dates[x[1]]) : reply({ error: 'not found' }, 404);
    if (path === '/rankings') return reply(db.rankings);
    if ((x = path.match(/^\/rankings\/([^/]+)$/))) return reply(db.rankings[x[1]] || []);
    if (path === '/matches') {
      const seen = new Set(), o = [];
      for (const [id, rows] of Object.entries(db.rankings)) for (const r of rows) {
        const k = id < r.id ? id + '__' + r.id : r.id + '__' + id;
        if (r.mutual && !seen.has(k)) { seen.add(k); o.push({ key: k, a: id, b: r.id, aName: db.people.find(q => q.id === id)?.name, bName: r.name, score: Math.round((r.myScore + r.theirScore) / 2), shared: r.shared }); }
      }
      return reply(o.sort((a, b) => b.score - a.score).slice(0, 30));
    }
    return reply({ error: 'no such endpoint' }, 404);
  }
  window.fetch = (input, opts) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!u.pathname.includes('/api/') && !String(input).startsWith('/api/')) return realFetch(input, opts);
    const path = String(input).split('?')[0].replace(/^.*?\/api/, '');
    return route(path, (opts && opts.method) || 'GET', u.searchParams);
  };
})();
