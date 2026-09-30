const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, opts) => {
  const r = await fetch('/api' + path, opts && { method: opts.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) });
  const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), j); return j;
};
const hi = s => (s >= 75 ? 'hi' : '');
let timer = null, nav = 0, cache = { people: [] };
const nameOf = id => cache.people.find(p => p.id === id)?.name || id;
const keyOf = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const hue = id => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = n => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const av = (id, name, size = 40) => `<span class="av" style="--h:${hue(id)};--s:${size}px" aria-hidden="true">${esc(initials(name))}</span>`;
const pct = x => Math.round(x * 100);
const srcName = s => ({ linkedin: 'LinkedIn', instagram: 'Instagram' }[s] || s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const empty = (title, body, action = '') => `<div class="empty"><b>${title}</b><p>${body}</p>${action}</div>`;
const STAGES = { coffee: 'Coffee', activity: 'Activity', 'deep-talk': 'Deep talk' };
// two-click confirm instead of confirm(), which some embeds block
const confirmTwice = (btn, label, action) => { btn.onclick = async () => { if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = label; return; } btn.disabled = true; await action(); }; };

async function refreshStatus() {
  const s = await api('/status');
  $('#status').textContent = `${s.people} people, ${s.dates} dates, ${s.llm ? 'Claude agents' : 'built-in agents'}`;
  return s;
}

const routes = { '': home, add: addView, people: peopleView, p: profileView, dates: datesView, d: dateView, rankings: rankView };
async function router() {
  clearInterval(timer); const gen = ++nav;
  const [r, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('nav a').forEach(a => {
    const on = a.dataset.r === r || (a.dataset.r === 'people' && r === 'p') || (a.dataset.r === 'dates' && r === 'd');
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  // placeholder only if the page takes long enough to notice
  const slow = setTimeout(() => { if (gen === nav) app.innerHTML = '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i></div>'; }, 180);
  try {
    cache.people = await api('/people');
    refreshStatus();
    await (routes[r] || home)(decodeURIComponent(arg || ''));
    if (gen === nav) { scrollTo(0, 0); app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); }
  } catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; } finally { clearTimeout(slow); }
}
addEventListener('hashchange', router); router();

// ---------------- chat, shared by the home preview and the date page
const bubble = (t, d, extra = '') => {
  const id = t.speaker === 'a' ? d.a : d.b, who = nameOf(id);
  return `<div class="msg ${t.speaker} ${extra}">${av(id, who, 30)}<div class="bub"><small>${esc(who)}’s agent</small>${esc(t.text)}${t.aside ? `<div class="think"><b>Private thought:</b> ${esc(t.aside)}</div>` : ''}</div></div>`;
};
const typing = (t, d) => { const id = t.speaker === 'a' ? d.a : d.b; return `<div class="msg ${t.speaker} is-typing">${av(id, nameOf(id), 30)}<div class="bub"><small>${esc(nameOf(id))}’s agent</small><span class="typing" aria-label="typing"><i></i><i></i><i></i></span></div></div>`; };
const follow = el => { if (el.classList.contains('live-feed')) el.scrollTop = el.scrollHeight; else el.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); };
async function play(el, d, turns, { instant, alive, stages = true }) {
  el.innerHTML = ''; let stage = '';
  for (const t of turns) {
    if (!alive()) return false;
    if (stages && t.stage !== stage) { stage = t.stage; el.insertAdjacentHTML('beforeend', `<div class="stage">${esc(STAGES[stage] || stage)}</div>`); }
    if (!instant) { el.insertAdjacentHTML('beforeend', typing(t, d)); follow(el); await wait(700); if (!alive()) return false; el.querySelector('.is-typing')?.remove(); }
    el.insertAdjacentHTML('beforeend', bubble(t, d, instant ? '' : 'new'));
    if (!instant) { follow(el); await wait(900); }
  }
  return alive();
}

// ---------------- Home
async function home() {
  const matches = await api('/matches').catch(() => []);
  const m = matches[0];
  let d = null, prof = null, rk = [];
  if (m) {
    d = await api('/dates/' + m.key);
    [prof, rk] = await Promise.all([api('/people/' + d.a), api('/rankings/' + d.a)]);
  }
  const n = cache.people.length;
  const A = d && nameOf(d.a), B = d && nameOf(d.b);
  // prefer a sentence-like quote over a dotted bio line; the quote itself is never edited
  const withEv = prof ? [...prof.hobbies, ...prof.interests].filter(h => h.evidence?.length) : [];
  const found = withEv.find(h => !/[·|•]/.test(h.evidence[0].quote) && h.evidence[0].quote.length > 24) || withEv[0];
  const counts = d ? Object.entries(d.transcript.reduce((o, t) => (t.speaker && (o[t.stage] = (o[t.stage] || 0) + 1), o), {})) : [];
  app.innerHTML = `<div class="hero"><div>
    <h1>Your agent reads you, then goes on the dates.</h1>
    <p class="lede">Paste a LinkedIn and a public Instagram. Your agent writes your profile, dates everyone else’s agent, and ranks your matches.</p>
    <div class="actions"><a class="btn" href="#/add">Add people</a><a class="btn ghost" href="#/dates">Watch the dates</a></div>
  </div>
  ${d ? `<div class="surface live" aria-label="A date between two agents, replayed">
    <div class="live-head"><div class="who"><span class="pair">${av(d.a, A, 34)}${av(d.b, B, 34)}</span><span><b>${esc(A)} and ${esc(B)}</b><small>Coffee, replayed from the finished run</small></span></div><button class="ghost small" id="again" hidden>Replay</button></div>
    <div class="live-feed" id="feed"></div>
    <div class="live-foot" id="foot"><span>The agents are talking…</span></div></div>` : ''}</div>

  ${n ? `<section><div class="sec-head"><h2>The cohort</h2><a href="#/people">All ${n} profiles</a></div>
    <div class="cast">${cache.people.map(p => `<a href="#/p/${esc(p.id)}">${av(p.id, p.name, 44)}<span><b>${esc(p.name)}</b><small>${esc(p.headline)}</small></span></a>`).join('')}</div></section>` : ''}

  <section><div class="sec-head"><h2>How it works</h2></div>
    <div class="bento">
      <div class="b1"><span class="step">1. Read</span><h3>Every claim keeps its quote.</h3>
        <p class="mut">The agent reads two sources only, LinkedIn and Instagram, and ties each need, hobby and interest to the words that show it.</p>
        ${found ? `<blockquote>“${esc(found.evidence[0].quote)}”<small>${esc(prof.name)} on ${srcName(found.evidence[0].source)}, read as ${esc(found.name)}</small></blockquote>` : ''}</div>
      <div class="b2"><span class="step">2. Date</span><h3>Three rounds with every agent.</h3>
        <p class="mut">Coffee, an activity, then a deep talk. Each agent files a verdict for its own person.</p>
        ${counts.length ? `<div class="stages">${counts.map(([s, c]) => `<span class="chip line">${esc(STAGES[s] || s)}, ${c} turns</span>`).join('')}</div>` : ''}</div>
      <div class="b3"><span class="step">3. Rank</span><h3>A ranking for each person.</h3>
        <p class="mut">Their own agent’s verdict counts 65%, the other agent’s 35%.${rk.length ? ` Top three for ${esc(prof.name)}:` : ''}</p>
        ${rk.length ? `<ol class="mini-rank">${rk.slice(0, 3).map(r => `<li>${av(r.id, r.name, 30)}<span>${esc(r.name)}</span><span class="num ${hi(r.fit)}">${r.fit}</span></li>`).join('')}</ol>` : ''}</div>
    </div></section>

  ${matches.length ? `<section><div class="sec-head"><h2>Strongest mutual matches</h2><a href="#/rankings">All rankings</a></div>
    <div class="pairs">${matches.slice(0, 6).map(x => `<a href="#/d/${esc(x.key)}"><span class="pair">${av(x.a, x.aName, 36)}${av(x.b, x.bName, 36)}</span><span><b>${esc(x.aName)} and ${esc(x.bName)}</b><small>${esc((x.shared || []).slice(0, 3).join(', ') || 'Different worlds, strong verdicts')}</small></span><span class="num ${hi(x.score)}">${x.score}</span></a>`).join('')}</div></section>` : ''}

  ${cache.people.some(p => p.synthetic) ? `<section><p class="note">The loaded cohort is synthetic: invented people, so the demo runs without reaching LinkedIn or Instagram. Real people are added on the Add people page.</p></section>` : ''}`;

  if (!d) return;
  const gen = nav, alive = () => gen === nav && !!$('#feed');
  const turns = d.transcript.filter(t => t.speaker).slice(0, 4);
  const run = async () => {
    $('#again').hidden = true; $('#foot').innerHTML = '<span>The agents are talking…</span>';
    if (!await play($('#feed'), d, turns, { instant: reduced(), alive, stages: false })) return;
    $('#foot').innerHTML = `<span>Verdicts</span><span class="num ${hi(d.verdicts.a.score)}">${d.verdicts.a.score}</span><span class="num ${hi(d.verdicts.b.score)}">${d.verdicts.b.score}</span><a href="#/d/${esc(m.key)}">Watch the full date</a>`;
    $('#again').hidden = false;
  };
  $('#again').onclick = run; run();
}

// ---------------- Add
async function addView() {
  const n = cache.people.length;
  app.innerHTML = `<div class="add"><div>
    <h1>Add people</h1>
    <p class="lede">Each person is two links. The agent fetches both public profiles, reads them, and writes the analysis.</p>
    <div class="two-src">
      <div><span class="dot" aria-hidden="true">in</span><span><b>LinkedIn</b><br><span class="mut">Headline, role, location, about and experience.</span></span></div>
      <div><span class="dot" aria-hidden="true">IG</span><span><b>Instagram, public only</b><br><span class="mut">Bio and recent captions. Private profiles are rejected.</span></span></div>
    </div>
    <p class="note" style="margin-top:28px">If a site blocks the fetch, the form opens a box where you can paste the visible profile text instead.</p>
  </div>
  <form id="f" class="surface pad">
    <h2>One person</h2>
    <div class="field"><label for="li">LinkedIn URL</label><input id="li" type="url" placeholder="https://www.linkedin.com/in/username" required><span class="help">The public profile link.</span></div>
    <div class="field"><label for="ig">Instagram URL</label><input id="ig" type="url" placeholder="https://www.instagram.com/username/" required><span class="help">The profile must be public.</span></div>
    <details id="manual"><summary>Fetch blocked? Paste the profile text</summary>
      <div class="row2"><div class="field"><label for="lit">LinkedIn text</label><textarea id="lit" rows="6"></textarea><span class="help">Name, headline, about, experience.</span></div>
      <div class="field"><label for="igt">Instagram text</label><textarea id="igt" rows="6"></textarea><span class="help">Bio first, then captions.</span></div></div></details>
    <div class="actions" style="margin-top:10px"><button id="go">Read this person</button></div>
    <div id="out" aria-live="polite"></div>
  </form></div>

  <section><div class="sec-head"><h2>Add several at once</h2></div>
    <div class="surface pad"><div class="field"><label for="bulk">One person per line</label>
      <textarea id="bulk" rows="5" placeholder="https://www.linkedin.com/in/a, https://www.instagram.com/a/"></textarea><span class="help">LinkedIn URL, a comma, then the Instagram URL.</span></div>
      <button id="bgo" class="ghost">Read everyone</button><div id="bout" aria-live="polite"></div></div></section>

  <section><div class="sec-head"><h2>Current cohort <span class="mut">${n}</span></h2>${n ? '<button class="ghost small" id="clear">Remove everyone</button>' : ''}</div>
    ${n ? `<div class="cohort">${cache.people.map(p => `<a class="chip line" href="#/p/${esc(p.id)}">${esc(p.name)}</a>`).join('')}</div>` : empty('Nobody here yet', 'Add a LinkedIn and Instagram pair above to create the first profile.')}</section>`;

  $('#f').onsubmit = async e => {
    e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'Reading LinkedIn and Instagram…'; $('#out').innerHTML = '';
    try {
      const p = await api('/people', { method: 'POST', body: { linkedinUrl: $('#li').value, instagramUrl: $('#ig').value, linkedinText: $('#lit').value, instagramText: $('#igt').value } });
      location.hash = '#/p/' + p.id;
    } catch (err) {
      $('#out').innerHTML = `<div class="err">${esc(err.message)}${err.linkedin ? `\nLinkedIn: ${esc(err.linkedin.error || 'ok')}\nInstagram: ${esc(err.instagram.error || 'ok')}` : ''}</div>`;
      if (err.needsManual) $('#manual').open = true;
    } finally { b.disabled = false; b.textContent = 'Read this person'; }
  };
  $('#bgo').onclick = async () => {
    const rows = $('#bulk').value.split('\n').map(l => l.split(/[,\s]+/).filter(Boolean)).filter(a => a.length >= 2).map(([l, i]) => ({ linkedinUrl: l, instagramUrl: i }));
    if (!rows.length) { $('#bout').innerHTML = '<div class="err">Enter at least one line with two links separated by a comma.</div>'; return; }
    $('#bgo').disabled = true; $('#bgo').textContent = `Reading ${rows.length} ${rows.length === 1 ? 'person' : 'people'}…`; $('#bout').innerHTML = '';
    try {
      const res = await api('/people/bulk', { method: 'POST', body: { rows } });
      $('#bout').innerHTML = '<div style="margin-top:14px">' + res.map(r => r.ok ? `<div class="okline">Added ${esc(r.name)}</div>` : `<div class="err">${esc(r.row.linkedinUrl)}: ${esc(r.error)}</div>`).join('') + '</div>';
    } catch (err) { $('#bout').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
    $('#bgo').disabled = false; $('#bgo').textContent = 'Read everyone';
  };
  const clr = $('#clear');
  if (clr) confirmTwice(clr, `Click again to remove all ${n}`, async () => { for (const p of cache.people) await api('/people/' + p.id, { method: 'DELETE' }); router(); });
}

// ---------------- People
function peopleView() {
  app.innerHTML = `<h1>Profiles</h1><p class="lede">What each agent learned from one LinkedIn and one Instagram.</p>
  ${cache.people.length ? `<div class="toolbar"><label class="sr" for="q">Search profiles</label><input id="q" type="search" placeholder="Search by name, role, city or hobby" autocomplete="off"></div>` : empty('No profiles yet', 'Add a person to see what their agent finds.', '<a class="btn" href="#/add">Add people</a>')}
  <div class="people" id="grid"></div>`;
  const card = p => `<a class="person" href="#/p/${esc(p.id)}"><span class="who">${av(p.id, p.name, 46)}<span><b>${esc(p.name)}</b><small>${esc(p.headline)}</small></span></span>
    ${p.location ? `<span class="loc">${esc(p.location)}</span>` : ''}<span class="chips">${p.hobbies.map(h => `<span class="chip">${esc(h)}</span>`).join('')}${p.synthetic ? '<span class="chip demo">synthetic</span>' : ''}</span></a>`;
  const draw = q => {
    const t = q.trim().toLowerCase();
    const list = cache.people.filter(p => !t || [p.name, p.headline, p.location, ...p.hobbies].join(' ').toLowerCase().includes(t));
    $('#grid').innerHTML = list.length ? list.map(card).join('') : (cache.people.length ? `<p class="mut">No profile matches “${esc(q)}”.</p>` : '');
  };
  draw('');
  $('#q')?.addEventListener('input', e => draw(e.target.value));
}

// ---------------- Profile
async function profileView(id) {
  const [p, rk] = await Promise.all([api('/people/' + id), api('/rankings/' + id)]);
  const L = { ambition: 'Ambition', curiosity: 'Curiosity', creativity: 'Creativity', sociability: 'Social energy', adventurousness: 'Adventurousness', introspection: 'Introspection', analytical: 'Analytical', warmth: 'Warmth', playfulness: 'Playfulness', routine: 'Routine' };
  const evs = arr => arr.length ? `<div class="ev-grid">${arr.map(h => { const e = h.evidence?.[0]; return `<div class="ev"><div class="ev-head"><b>${esc(h.name)}</b><span>${pct(h.score)}% sure</span></div>
    ${e ? `<q><mark>${esc(e.quote)}</mark></q><small>From ${srcName(e.source)}</small>` : '<small>No direct quote found</small>'}</div>`; }).join('')}</div>` : '<p class="mut">Nothing found in either source.</p>';
  const src = k => `<div><dt><a href="${esc(p.links[k])}" target="_blank" rel="noopener">${srcName(k)}</a></dt><dd>${p.sources[k].ok ? `${p.sources[k].chars} characters` : 'unreadable'}</dd></div>`;
  const ul = (arr, c = '') => arr.length ? `<ul class="list ${c}">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="mut">Nothing spotted.</p>';
  app.innerHTML = `<a class="back" href="#/people">All profiles</a>
  <div class="dossier"><aside class="idcard">
    ${av(p.id, p.name, 88)}
    <div><h1>${esc(p.name)}</h1><p class="mut" style="margin:8px 0 0">${esc(p.headline)}</p>${p.synthetic ? '<p style="margin:10px 0 0"><span class="chip demo">synthetic</span></p>' : ''}</div>
    <dl class="facts">
      <div><dt>Location</dt><dd>${esc(p.location || 'Not stated')}</dd></div>
      <div><dt>Dating intent</dt><dd>${esc(p.intent)}</dd></div>
      <div><dt>Confidence</dt><dd>${pct(p.confidence)}%</dd></div>
      ${src('linkedin')}${src('instagram')}
    </dl>
    <div><h3>Best matches</h3>${rk.length ? `<div class="best">${rk.slice(0, 3).map(r => `<a href="#/d/${esc(keyOf(id, r.id))}">${av(r.id, r.name, 32)}<b>${esc(r.name)}</b><span class="num ${hi(r.fit)}">${r.fit}</span></a>`).join('')}</div><a href="#/rankings/${esc(id)}" style="font-size:14.5px">Full ranking</a>` : '<p class="mut">No dates yet. Run the dating round first.</p>'}</div>
    <div><button class="ghost small" id="del">Remove this person</button></div>
  </aside>
  <div>
    <p class="summary">${esc(p.summary)}</p>
    <p class="mut">Talks like: ${esc(p.communicationStyle)}.${p.lookingFor ? ` In their own words: “${esc(p.lookingFor)}”.` : ''} Read by the ${esc(p.engine)} engine.</p>
    <div class="block"><h2>Needs</h2><div class="needs">${p.needs.map(n => `<div class="need"><span>${esc(n.need)}</span><span>${pct(n.strength)}%</span><i class="ln" style="width:${pct(n.strength)}%"></i></div>`).join('') || '<p class="mut">No needs inferred.</p>'}</div></div>
    <div class="block"><h2>Hobbies</h2>${evs(p.hobbies)}</div>
    <div class="block"><h2>Interests</h2>${evs(p.interests)}</div>
    <div class="block"><h2>Qualities</h2><div class="traits">${Object.entries(p.traits).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="trait ${v ? '' : 'zero'}"><span>${L[k] || esc(k)}</span><span class="num">${pct(v)}</span><i class="ln" style="width:${Math.max(pct(v), 1)}%"></i></div>`).join('')}</div></div>
    <div class="block"><h2>Values and signals</h2>
      <p>${p.values.map(v => `<span class="chip">${esc(v)}</span>`).join('')}</p>
      <div class="split3" style="margin-top:18px"><div><h3>Green flags</h3>${ul(p.greenFlags)}</div><div><h3>Watch for</h3>${ul(p.watchFor, 'watch')}</div><div><h3>Ideal first dates</h3>${ul(p.dateIdeas)}</div></div></div>
    <div class="block"><h2>How the agent read them</h2><ol class="trace">${p.reading.map(r => `<li class="${esc(r.source)}"><b>${srcName(r.source)}, ${esc(r.step)}</b>${esc(r.finding)}</li>`).join('')}</ol></div>
  </div></div>`;
  confirmTwice($('#del'), 'Click again to remove', async () => { await api('/people/' + id, { method: 'DELETE' }); location.hash = '#/people'; });
}

// ---------------- Dates
async function datesView() {
  const s = await refreshStatus();
  const n = cache.people.length;
  const opts = sel => cache.people.map((p, i) => `<option value="${esc(p.id)}" ${i === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  app.innerHTML = `<h1>The agents date</h1><p class="lede">${n} agents and ${n * (n - 1) / 2} first dates. Every date runs coffee, an activity and a deep talk.</p>
  <div class="surface pad"><div class="runbar"><button id="run">Run the dating round</button>
    <div class="mut" style="font-size:14.5px">${s.llm ? '<label style="display:inline-flex;gap:10px;align-items:center;margin:0;font-weight:500;color:var(--ink)"><input type="checkbox" id="llm" style="width:auto"> Let Claude write each agent’s top 6 dates (slower)</label>' : 'Built-in agents write the dates. Set ANTHROPIC_API_KEY on the server to let Claude write them.'}</div></div>
    <div id="prog" aria-live="polite"></div><div class="feed" id="feed"></div></div>
  <section><div class="sec-head"><h2>Watch a date</h2></div>
    <div class="surface pad"><div class="picker"><div class="field"><label for="sa">First agent</label><select id="sa">${opts(0)}</select></div>
    <div class="field"><label for="sb">Second agent</label><select id="sb">${opts(1)}</select></div><button class="ghost" id="watch">Watch date</button></div><div id="wout"></div></div></section>
  <section><div class="sec-head"><h2>All dates</h2><div style="min-width:240px"><label for="flt" class="sr">Filter by person</label><select id="flt"><option value="">Everyone</option>${opts(-1)}</select></div></div>
    <div id="list" class="scroll"></div></section>`;
  $('#watch').onclick = () => { const a = $('#sa').value, b = $('#sb').value; if (a === b) { $('#wout').innerHTML = '<div class="err">Pick two different agents.</div>'; return; } location.hash = '#/d/' + keyOf(a, b); };
  const load = async () => {
    const ds = (await api('/dates?person=' + encodeURIComponent($('#flt').value))).sort((x, y) => (y.scoreA + y.scoreB) - (x.scoreA + x.scoreB));
    $('#list').innerHTML = ds.length ? `<table><thead><tr><th>Date</th><th>First verdict</th><th>Second verdict</th></tr></thead><tbody>${ds.slice(0, 60).map(d => `<tr><td><a class="who" href="#/d/${esc(d.key)}"><span class="pair">${av(d.a, nameOf(d.a), 28)}${av(d.b, nameOf(d.b), 28)}</span>${esc(nameOf(d.a))} and ${esc(nameOf(d.b))}</a></td><td class="num ${hi(d.scoreA)}">${d.scoreA}</td><td class="num ${hi(d.scoreB)}">${d.scoreB}</td></tr>`).join('')}</tbody></table>
      ${ds.length > 60 ? `<p class="mut" style="margin-top:14px;font-size:14px">Showing the 60 highest of ${ds.length} dates.</p>` : ''}` : empty('No dates yet', 'Run the dating round to send the agents out.');
  };
  $('#flt').onchange = load; load();
  const poll = async () => {
    const j = await api('/run/status');
    if (j.total) $('#prog').innerHTML = `<div class="prog"><i style="width:${j.done / j.total * 100}%"></i></div><p class="mut" style="font-size:14px;margin:8px 0 0">${j.done} of ${j.total} dates ${j.running ? 'in progress' : 'complete'}${j.error ? ': ' + esc(j.error) : ''}</p>`;
    $('#feed').innerHTML = (j.recent || []).map(r => `<div><a href="#/d/${esc(r.key)}">${esc(r.a)} and ${esc(r.b)}</a><span class="num ${hi(r.scoreA)}">${r.scoreA}</span><span class="num ${hi(r.scoreB)}">${r.scoreB}</span><span class="mut">${esc(r.engine)}</span></div>`).join('');
    if (!j.running && $('#run').disabled) { $('#run').disabled = false; $('#run').textContent = 'Run the dating round'; load(); refreshStatus(); }
  };
  timer = setInterval(poll, 500); poll();
  $('#run').onclick = async () => {
    $('#run').disabled = true; $('#run').textContent = 'Agents are dating…';
    try { await api('/run', { method: 'POST', body: { useLLM: !!$('#llm')?.checked } }); } catch (e) { $('#prog').innerHTML = `<div class="err">${esc(e.message)}</div>`; $('#run').disabled = false; $('#run').textContent = 'Run the dating round'; }
  };
}

// ---------------- Single date (animated replay)
async function dateView(key) {
  const d = await api('/dates/' + key);
  const A = nameOf(d.a), B = nameOf(d.b);
  const vbox = (side, name, v) => `<div class="verdict ${side}"><h3>${esc(name)}’s agent</h3><div class="score"><span class="num ${hi(v.score)}">${v.score}</span><span class="mut">/100</span></div>
    <p>${esc(v.headline)}</p><div>${v.wouldSeeAgain ? '<span class="chip acc">Would see again</span>' : '<span class="chip line">Would pass</span>'}</div>
    ${v.pros.length ? `<ul class="list">${v.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${v.cons.length ? `<ul class="list watch" style="margin-top:8px">${v.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
  app.innerHTML = `<a class="back" href="#/dates">All dates</a>
  <div class="date"><div>
    <h1 style="font-size:clamp(30px,4vw,50px)">${esc(A)} and ${esc(B)}</h1>
    <p class="lede" style="margin-bottom:22px">${d.shared.length ? `They share ${esc(d.shared.join(', '))}.` : 'No obvious shared interests going in.'} Written by the ${esc(d.engine)} engine.</p>
    <div class="actions" style="margin-bottom:18px"><button class="ghost small" id="replay">Replay</button><button class="ghost small" id="skip">Show the whole date</button></div>
    <div class="surface chat" id="chat" aria-live="off"></div>
  </div>
  <aside class="card-side">
    <div class="side-who">
      <a class="who" href="#/p/${esc(d.a)}">${av(d.a, A, 44)}<span><b class="tag-a">${esc(A)}</b><small>Their agent speaks in blue</small></span></a>
      <a class="who" href="#/p/${esc(d.b)}">${av(d.b, B, 44)}<span><b>${esc(B)}</b><small>Their agent speaks in grey</small></span></a>
    </div>
    <div id="verdicts" style="display:grid;gap:14px"><p class="pending">Each agent files a verdict when the date ends.</p></div>
  </aside></div>`;
  let token = 0; const gen = nav;
  const run = async instant => {
    const my = ++token; $('#verdicts').innerHTML = '<p class="pending">Each agent files a verdict when the date ends.</p>';
    if (!await play($('#chat'), d, d.transcript, { instant: instant || reduced(), alive: () => my === token && gen === nav && !!$('#chat') })) return;
    $('#verdicts').innerHTML = vbox('a', A, d.verdicts.a) + vbox('b', B, d.verdicts.b);
  };
  $('#replay').onclick = () => run(false); $('#skip').onclick = () => run(true);
  run(false);
}

// ---------------- Rankings
async function rankView(id) {
  id = id || cache.people[0]?.id;
  if (!id) { app.innerHTML = `<h1>Rankings</h1>${empty('No people yet', 'Add people and run the dating round to see rankings.', '<a class="btn" href="#/add">Add people</a>')}`; return; }
  const [rows, matches] = await Promise.all([api('/rankings/' + id), api('/matches')]);
  const pod = r => `<div class="pod"><div class="rank-n"><span class="mut">No. ${r.rank}</span><span class="num">${r.fit}</span></div>
    <a class="who" href="#/p/${esc(r.id)}" style="text-decoration:none">${av(r.id, r.name, 44)}<span><b>${esc(r.name)}</b><small>${esc(r.headline)}</small></span></a>
    <div>${r.mutual ? '<span class="chip acc">Mutual match</span>' : ''}${r.shared.slice(0, 3).map(s => `<span class="chip line">${esc(s)}</span>`).join('')}</div>
    ${r.why.length ? `<p class="why">${esc(r.why.join('. '))}.</p>` : ''}${r.watch.length ? `<p class="why mut">Watch for: ${esc(r.watch.join(', '))}.</p>` : ''}
    <div class="foot"><span class="mut">You ${r.myScore}, them ${r.theirScore}</span><a href="#/d/${esc(keyOf(id, r.id))}">Watch the date</a></div></div>`;
  const row = r => `<div class="rrow"><span class="n">${r.rank}</span>
    <a class="who" href="#/p/${esc(r.id)}" style="text-decoration:none">${av(r.id, r.name, 36)}<span><b>${esc(r.name)}${r.mutual ? ' <span class="chip acc" style="height:22px;font-size:12px;margin:0 0 0 6px">Mutual</span>' : ''}</b><small>${esc(r.shared.slice(0, 3).join(', ') || r.headline)}</small></span></a>
    <span class="split">You ${r.myScore}, them ${r.theirScore}</span><a class="num big ${hi(r.fit)}" href="#/d/${esc(keyOf(id, r.id))}" style="text-decoration:none" aria-label="Fit ${r.fit}, watch the date">${r.fit}</a></div>`;
  app.innerHTML = `<div class="rk-head"><div><h1>Rankings</h1><p class="lede" style="margin:0">Who fits each person best. Their own agent’s verdict counts 65% and the other agent’s 35%. Both verdicts at 65 or above makes a mutual match.</p></div>
    <div class="field" style="margin:0"><label for="who">Ranking for</label><select id="who">${cache.people.map(p => `<option value="${esc(p.id)}" ${p.id === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
  ${rows.length ? `<div class="podium">${rows.slice(0, 3).map(pod).join('')}</div><div class="rest">${rows.slice(3).map(row).join('')}</div>` : empty('No dates yet', 'Run the dating round to create rankings.', '<a class="btn" href="#/dates">Go to dates</a>')}
  ${matches.length ? `<section><div class="sec-head"><h2>Top mutual matches across everyone</h2></div>
    <div class="scroll"><table><thead><tr><th>Pair</th><th>Score</th><th>Shared</th></tr></thead><tbody>${matches.slice(0, 15).map(m => `<tr><td><a class="who" href="#/d/${esc(m.key)}"><span class="pair">${av(m.a, m.aName, 28)}${av(m.b, m.bName, 28)}</span>${esc(m.aName)} and ${esc(m.bName)}</a></td><td class="num ${hi(m.score)}">${m.score}</td><td class="mut">${esc((m.shared || []).join(', '))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  $('#who').onchange = e => { location.hash = '#/rankings/' + e.target.value; };
}
