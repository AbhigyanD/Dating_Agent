const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, opts) => {
  const r = await fetch('/api' + path, opts && { method: opts.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) });
  const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), j); return j;
};
const cls = s => (s >= 75 ? 'hi' : s >= 55 ? 'mid' : 'lo');
let timer = null, nav = 0, cache = { people: [] };
const nameOf = id => cache.people.find(p => p.id === id)?.name || id;

async function refreshStatus() {
  const s = await api('/status');
  $('#status').textContent = `${s.people} people · ${s.dates} dates · ${s.llm ? 'Claude agents' : 'built-in agents'}${s.apify ? ' · Apify' : ''}`;
  return s;
}

const routes = { '': home, add: addView, people: peopleView, p: profileView, dates: datesView, d: dateView, rankings: rankView };
async function router() {
  clearInterval(timer); nav++;
  const [r, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  cache.people = await api('/people');
  refreshStatus();
  try { await (routes[r] || home)(decodeURIComponent(arg || '')); } catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
addEventListener('hashchange', router); router();

// ---------------- Home
async function home() {
  app.innerHTML = `<h1>Every person is an agent. The agents date each other.</h1>
  <p class="sub">Paste a LinkedIn and a public Instagram link → your agent reads both → writes your profile → dates every other agent on your behalf → ranks who fits you best.</p>
  <div class="row">
   <div class="card"><h3>1 · Read</h3><p class="mut">Agent ingests exactly two sources — LinkedIn + public Instagram — and extracts needs, hobbies, interests, traits, with quoted evidence.</p><a class="btn" href="#/add">Add people</a></div>
   <div class="card"><h3>2 · Date</h3><p class="mut">Every pair of agents goes on a 3-stage date (coffee → activity → deep talk). Each files a verdict for its own human.</p><a class="btn" href="#/dates">Watch the dates</a></div>
   <div class="card"><h3>3 · Rank</h3><p class="mut">Each person gets a personal ranking of who fits best, blending their own verdict with how the other agent felt.</p><a class="btn" href="#/rankings">See rankings</a></div>
  </div>
  ${cache.people.length ? `<h2>Already run: ${cache.people.length} people</h2><p class="sub">A finished example is loaded. <a href="#/people">Open a profile</a> or <a href="#/rankings">jump to the rankings</a>.</p>` : ''}
  ${cache.people.some(p => p.synthetic) ? `<div class="banner">The pre-loaded cohort is <b>synthetic</b> (invented people) so the demo runs without network access to LinkedIn/Instagram. Real people are added on the “Add people” page.</div>` : ''}`;
}

// ---------------- Add
async function addView() {
  app.innerHTML = `<h1>Add people</h1><p class="sub">One LinkedIn + one <b>public</b> Instagram per person. The agent will fetch and read both.</p>
  <div class="card"><form id="f">
    <div class="row"><div><label>LinkedIn URL</label><input id="li" placeholder="https://www.linkedin.com/in/username" required></div>
    <div><label>Instagram URL (public)</label><input id="ig" placeholder="https://www.instagram.com/username/" required></div></div>
    <details id="manual"><summary class="mut" style="cursor:pointer;margin-top:10px">If fetching is blocked: paste the visible profile text instead</summary>
      <div class="row"><div><label>LinkedIn text (name, headline, location, about, experience…)</label><textarea id="lit" rows="6"></textarea></div>
      <div><label>Instagram text (bio, then captions)</label><textarea id="igt" rows="6"></textarea></div></div></details>
    <p><button id="go">Send my agent to read me</button></p><div id="out"></div></form></div>
  <h2>Bulk add</h2><div class="card"><label>One person per line: <code>linkedin-url, instagram-url</code></label>
    <textarea id="bulk" rows="5" placeholder="https://www.linkedin.com/in/a, https://www.instagram.com/a/"></textarea>
    <p><button id="bgo" class="ghost">Add all</button></p><div id="bout"></div></div>
  <h2>Current cohort (${cache.people.length})</h2>
  <div class="card">${cache.people.length ? cache.people.map(p => `<span class="tag">${esc(p.name)} <a href="#/p/${esc(p.id)}">open</a></span>`).join('') : '<span class="mut">Nobody yet.</span>'}
  <p><button class="ghost" id="clear">Remove everyone</button></p></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'Agent reading…'; $('#out').innerHTML = '';
    try {
      const p = await api('/people', { method: 'POST', body: { linkedinUrl: $('#li').value, instagramUrl: $('#ig').value, linkedinText: $('#lit').value, instagramText: $('#igt').value } });
      location.hash = '#/p/' + p.id;
    } catch (err) {
      $('#out').innerHTML = `<div class="err">${esc(err.message)}${err.linkedin ? `\nLinkedIn: ${esc(err.linkedin.error || 'ok')}\nInstagram: ${esc(err.instagram.error || 'ok')}` : ''}</div>`;
      if (err.needsManual) $('#manual').open = true;
    } finally { b.disabled = false; b.textContent = 'Send my agent to read me'; }
  };
  $('#bgo').onclick = async () => {
    const rows = $('#bulk').value.split('\n').map(l => l.split(/[,\s]+/).filter(Boolean)).filter(a => a.length >= 2).map(([l, i]) => ({ linkedinUrl: l, instagramUrl: i }));
    if (!rows.length) return; $('#bgo').disabled = true; $('#bout').innerHTML = '<span class="mut">Reading profiles…</span>';
    const res = await api('/people/bulk', { method: 'POST', body: { rows } });
    $('#bout').innerHTML = res.map(r => r.ok ? `<div class="ok">✓ ${esc(r.name)}</div>` : `<div class="err">✗ ${esc(r.row.linkedinUrl)} — ${esc(r.error)}</div>`).join('');
    $('#bgo').disabled = false; router();
  };
  $('#clear').onclick = async () => { if (confirm('Remove everyone?')) { for (const p of cache.people) await api('/people/' + p.id, { method: 'DELETE' }); router(); } };
}

// ---------------- People
function peopleView() {
  app.innerHTML = `<h1>Profiles</h1><p class="sub">What each agent learned from LinkedIn + Instagram.</p>
  ${cache.people.length ? '' : '<div class="card">No people yet — <a href="#/add">add some</a>.</div>'}
  <div class="grid">${cache.people.map(p => `<div class="card pc" onclick="location.hash='#/p/${esc(p.id)}'"><b>${esc(p.name)}</b><small>${esc(p.headline)}</small><br><small>${esc(p.location)}</small>
    <div>${p.hobbies.map(h => `<span class="tag">${esc(h)}</span>`).join('')}</div>${p.synthetic ? '<span class="tag amb">synthetic demo</span>' : ''}</div>`).join('')}</div>`;
}

// ---------------- Profile
async function profileView(id) {
  const p = await api('/people/' + id);
  const tr = Object.entries(p.traits).sort((a, b) => b[1] - a[1]);
  const L = { ambition: 'Ambition', curiosity: 'Curiosity', creativity: 'Creativity', sociability: 'Social energy', adventurousness: 'Adventurousness', introspection: 'Introspection', analytical: 'Analytical', warmth: 'Warmth', playfulness: 'Playfulness', routine: 'Routine' };
  const items = arr => arr.map(h => `<div style="margin:6px 0"><span class="tag vio">${esc(h.name)}</span><span class="mut" style="font-size:12px">${Math.round(h.score * 100)}%</span>
    ${h.evidence.slice(0, 1).map(e => `<div class="ev">${e.source}: “${esc(e.quote)}”</div>`).join('')}</div>`).join('') || '<span class="mut">None found</span>';
  const rk = await api('/rankings/' + id);
  app.innerHTML = `<a href="#/people">← all profiles</a>
  <h1>${esc(p.name)} ${p.synthetic ? '<span class="tag amb">synthetic demo</span>' : ''}</h1>
  <p class="sub">${esc(p.headline)} · ${esc(p.location)} · engine: ${esc(p.engine)} · confidence ${Math.round(p.confidence * 100)}%</p>
  <p class="sub">Sources: <a href="${esc(p.links.linkedin)}" target="_blank" rel="noopener">LinkedIn</a> (${p.sources.linkedin.ok ? p.sources.linkedin.chars + ' chars via ' + esc(p.sources.linkedin.via) : 'unreadable'}) ·
   <a href="${esc(p.links.instagram)}" target="_blank" rel="noopener">Instagram</a> (${p.sources.instagram.ok ? p.sources.instagram.chars + ' chars via ' + esc(p.sources.instagram.via) : 'unreadable'})</p>
  <div class="card"><h3>Agent's read</h3><p>${esc(p.summary)}</p><p class="mut">Communication style: ${esc(p.communicationStyle)}${p.lookingFor ? ` · Stated: “${esc(p.lookingFor)}”` : ''} · Intent: ${esc(p.intent)}</p></div>
  <div class="two"><div>
    <h2>Needs</h2><div class="card">${p.needs.map(n => `<div style="margin:6px 0">${esc(n.need)}<div class="bar"><i style="width:${n.strength * 100}%"></i></div></div>`).join('')}</div>
    <h2>Hobbies</h2><div class="card">${items(p.hobbies)}</div>
    <h2>Interests</h2><div class="card">${items(p.interests)}</div>
    <h2>How the agent read them</h2><div class="card">${p.reading.map(r => `<div class="read ${esc(r.source)}"><b>${esc(r.source)} · ${esc(r.step)}</b><br>${esc(r.finding)}</div>`).join('')}</div>
  </div><div>
    <h2>Qualities</h2><div class="card">${tr.map(([k, v]) => `<div class="tr"><span>${L[k]}</span><div class="bar"><i style="width:${v * 100}%"></i></div><span class="mut">${Math.round(v * 100)}</span></div>`).join('')}</div>
    <h2>Values</h2><div class="card">${p.values.map(v => `<span class="tag pink">${esc(v)}</span>`).join('')}</div>
    <h2>Green flags</h2><div class="card">${p.greenFlags.map(g => `<div class="ok">✓ ${esc(g)}</div>`).join('')}</div>
    <h2>Watch-fors</h2><div class="card">${p.watchFor.map(g => `<div>⚠ ${esc(g)}</div>`).join('') || '<span class="mut">None spotted</span>'}</div>
    <h2>Ideal first dates</h2><div class="card">${p.dateIdeas.map(g => `<div>• ${esc(g)}</div>`).join('')}</div>
    <h2>Top matches</h2><div class="card">${rk.slice(0, 3).map(r => `<div><a href="#/d/${esc(keyOf(id, r.id))}">${r.rank}. ${esc(r.name)}</a> <span class="score ${cls(r.fit)}" style="font-size:15px">${r.fit}</span></div>`).join('') || '<span class="mut">Run the dating round first.</span>'}
      <p><a href="#/rankings/${esc(id)}">Full ranking →</a></p></div>
    <p><button class="ghost" id="del">Remove this person</button></p>
  </div></div>`;
  $('#del').onclick = async () => { if (confirm('Remove?')) { await api('/people/' + id, { method: 'DELETE' }); location.hash = '#/people'; } };
}
const keyOf = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

// ---------------- Dates
async function datesView() {
  const s = await refreshStatus();
  app.innerHTML = `<h1>The agents date</h1><p class="sub">${cache.people.length} agents · ${cache.people.length * (cache.people.length - 1) / 2} first dates.</p>
  <div class="card"><div class="row" style="align-items:end"><div><button id="run">▶ Run the dating round</button></div>
   <div>${s.llm ? '<label><input type="checkbox" id="llm" style="width:auto"> Use Claude for each agent’s top-6 dates (slower)</label>' : '<span class="mut">Built-in agents (set ANTHROPIC_API_KEY for Claude-powered dates)</span>'}</div></div>
   <div id="prog" style="margin-top:12px"></div><div class="feed" id="feed"></div></div>
  <h2>Watch a date</h2><div class="card"><div class="row"><div><label>Agent A</label><select id="sa">${cache.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
  <div><label>Agent B</label><select id="sb">${cache.people.map((p, i) => `<option value="${esc(p.id)}" ${i === 1 ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
  <p><button class="ghost" id="watch">Watch this date</button></p></div>
  <h2>All dates</h2><div class="card"><select id="flt"><option value="">Everyone</option>${cache.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><div id="list"></div></div>`;
  $('#watch').onclick = () => { const a = $('#sa').value, b = $('#sb').value; if (a !== b) location.hash = '#/d/' + keyOf(a, b); };
  const load = async () => {
    const ds = await api('/dates?person=' + encodeURIComponent($('#flt').value));
    $('#list').innerHTML = `<table><tr><th>Date</th><th>A’s verdict</th><th>B’s verdict</th></tr>${ds.sort((x, y) => (y.scoreA + y.scoreB) - (x.scoreA + x.scoreB)).slice(0, 60).map(d => `<tr><td><a href="#/d/${esc(d.key)}">${esc(nameOf(d.a))} × ${esc(nameOf(d.b))}</a></td><td class="${cls(d.scoreA)}">${d.scoreA}</td><td class="${cls(d.scoreB)}">${d.scoreB}</td></tr>`).join('')}</table>`;
  };
  $('#flt').onchange = load; load();
  const poll = async () => {
    const j = await api('/run/status');
    if (j.total) $('#prog').innerHTML = `<div class="bar"><i style="width:${j.done / j.total * 100}%"></i></div><small class="mut">${j.done}/${j.total} dates ${j.running ? 'in progress…' : 'complete'}${j.error ? ' — ' + esc(j.error) : ''}</small>`;
    $('#feed').innerHTML = j.recent.map(r => `<div><a href="#/d/${esc(r.key)}">${esc(r.a)} ♥ ${esc(r.b)}</a> — <span class="${cls(r.scoreA)}">${r.scoreA}</span> / <span class="${cls(r.scoreB)}">${r.scoreB}</span> <span class="mut">(${esc(r.engine)})</span></div>`).join('');
    if (!j.running && $('#run').disabled) { $('#run').disabled = false; load(); refreshStatus(); }
    return j.running;
  };
  timer = setInterval(poll, 500); poll();
  $('#run').onclick = async () => {
    $('#run').disabled = true;
    try { await api('/run', { method: 'POST', body: { useLLM: !!$('#llm')?.checked } }); } catch (e) { $('#prog').innerHTML = `<div class="err">${esc(e.message)}</div>`; $('#run').disabled = false; }
  };
}

// ---------------- Single date (animated replay)
async function dateView(key) {
  const d = await api('/dates/' + key);
  const A = nameOf(d.a), B = nameOf(d.b);
  const vbox = (n, v) => `<div class="card"><h3>${esc(n)}’s agent verdict</h3><div class="score ${cls(v.score)}">${v.score}/100</div><div><b>${esc(v.headline)}</b> ${v.wouldSeeAgain ? '<span class="tag grn">would see again</span>' : '<span class="tag amb">pass</span>'}</div>
    ${v.pros.map(x => `<div class="ok">+ ${esc(x)}</div>`).join('')}${v.cons.map(x => `<div style="color:var(--red)">− ${esc(x)}</div>`).join('')}</div>`;
  app.innerHTML = `<a href="#/dates">← all dates</a><h1>${esc(A)} × ${esc(B)}</h1>
  <p class="sub">Agents: <a href="#/p/${esc(d.a)}">${esc(A)}</a> (pink) and <a href="#/p/${esc(d.b)}">${esc(B)}</a> (violet) · engine: ${esc(d.engine)}${d.shared.length ? ' · shared: ' + d.shared.map(esc).join(', ') : ''}</p>
  <p><button id="replay" class="ghost">↻ Replay live</button> <button id="skip" class="ghost">Show all</button></p>
  <div class="card"><div class="chat" id="chat"></div></div><div id="verdicts" class="row" style="margin-top:12px"></div>`;
  let token = 0; const gen = nav;
  const alive = my => my === token && gen === nav && $('#chat');
  const play = async instant => {
    const my = ++token; $('#chat').innerHTML = ''; $('#verdicts').innerHTML = ''; let stage = '';
    for (const t of d.transcript) {
      if (!alive(my)) return;
      if (t.stage !== stage) { stage = t.stage; $('#chat').insertAdjacentHTML('beforeend', `<div class="stage">${esc({ coffee: '☕ Coffee', activity: '🎯 Activity date', 'deep-talk': '🌙 Deep talk' }[stage] || stage)}</div>`); }
      const who = t.speaker === 'a' ? A : B;
      if (!instant) { $('#chat').insertAdjacentHTML('beforeend', `<div class="msg ${t.speaker}" id="typing"><small>${esc(who)}’s agent</small><span class="mut">typing…</span></div>`); $('#chat').scrollTop = 1e9; await new Promise(r => setTimeout(r, 650)); if (!alive(my)) return; $('#typing').remove(); }
      $('#chat').insertAdjacentHTML('beforeend', `<div class="msg ${t.speaker}"><small>${esc(who)}’s agent</small>${esc(t.text)}${t.aside ? `<div class="aside">🧠 ${esc(t.aside)}</div>` : ''}</div>`);
      $('#chat').scrollTop = 1e9;
      if (!instant) await new Promise(r => setTimeout(r, 900));
    }
    if (!alive(my)) return;
    $('#verdicts').innerHTML = vbox(A, d.verdicts.a) + vbox(B, d.verdicts.b);
  };
  $('#replay').onclick = () => play(false); $('#skip').onclick = () => play(true);
  play(false);
}

// ---------------- Rankings
async function rankView(id) {
  const matches = await api('/matches');
  id = id || cache.people[0]?.id;
  if (!id) { app.innerHTML = '<div class="card">No people yet.</div>'; return; }
  const rows = await api('/rankings/' + id);
  app.innerHTML = `<h1>Rankings</h1><p class="sub">For each person: who fits best. Fit = 65% their own agent’s verdict + 35% the other agent’s verdict.</p>
  <div class="card"><label>Rank for</label><select id="who">${cache.people.map(p => `<option value="${esc(p.id)}" ${p.id === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
  ${rows.length ? '' : '<div class="banner">No dates yet — <a href="#/dates">run the dating round</a>.</div>'}
  <div>${rows.map(r => `<div class="card rk"><div class="n">${r.rank}</div><div><b><a href="#/p/${esc(r.id)}">${esc(r.name)}</a></b> ${r.mutual ? '<span class="tag pink">mutual match</span>' : ''}<br><small class="mut">${esc(r.headline)}</small>
    <div>${r.shared.map(s => `<span class="tag vio">${esc(s)}</span>`).join('')}</div><small class="ok">${r.why.map(esc).join(' · ')}</small>${r.watch.length ? `<br><small style="color:var(--amb)">⚠ ${r.watch.map(esc).join(' · ')}</small>` : ''}</div>
    <div style="text-align:right"><div class="score ${cls(r.fit)}">${r.fit}</div><small class="mut">you ${r.myScore} · them ${r.theirScore}</small><br><a href="#/d/${esc(keyOf(id, r.id))}">watch date →</a></div></div>`).join('')}</div>
  <h2>Top mutual matches (whole cohort)</h2><div class="card"><table><tr><th>Pair</th><th>Score</th><th>Shared</th></tr>${matches.slice(0, 15).map(m => `<tr><td><a href="#/d/${esc(m.key)}">${esc(m.aName)} × ${esc(m.bName)}</a></td><td class="${cls(m.score)}">${m.score}</td><td>${(m.shared || []).map(esc).join(', ')}</td></tr>`).join('')}</table></div>`;
  $('#who').onchange = e => { location.hash = '#/rankings/' + e.target.value; };
}
