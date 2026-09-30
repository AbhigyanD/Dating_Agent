// Agents going on dates: compatibility model, the date itself (3 stages), verdicts, and rankings.
import { NEEDS, TRAIT_LABELS, DATE_IDEAS, sharedInterests } from './analyze.js';
import { llmDate, llmEnabled } from './llm.js';

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const first = n => n.split(' ')[0];
const lc = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const cityOf = l => (l || '').split(',')[0].trim().toLowerCase();
const regionOf = l => (l || '').split(',').pop().trim().toLowerCase();

// How well does B satisfy A's needs, weighted by how strongly A needs them. Directional.
export function compat(a, b) {
  const nf = a.needs.map(n => ({ n, fit: Math.min(1, NEEDS[n.key].fit(b)) }));
  const wsum = nf.reduce((s, x) => s + x.n.strength, 0) || 1;
  const needs = nf.reduce((s, x) => s + x.fit * x.n.strength, 0) / wsum;
  const shared = sharedInterests(a, b);
  const interests = Math.min(1, shared.slice(0, 4).reduce((s, x) => s + x.weight, 0) / 2);
  const dims = ['ambition', 'sociability', 'introspection', 'routine', 'adventurousness'];
  const gaps = dims.map(d => ({ d, gap: Math.abs(a.traits[d] - b.traits[d]) }));
  const align = 1 - gaps.reduce((s, x) => s + x.gap, 0) / dims.length;
  const loc = cityOf(a.location) && cityOf(a.location) === cityOf(b.location) ? 1 : regionOf(a.location) === regionOf(b.location) && regionOf(a.location) ? 0.5 : 0.15;
  const intentScore = a.intent === b.intent ? 1 : (a.intent === 'open' || b.intent === 'open') ? 0.75 : 0.2;
  const jitter = ((hash(a.name + '>' + b.name) % 1000) / 1000 - 0.5) * 0.04;
  const raw = 0.36 * needs + 0.22 * interests + 0.18 * align + 0.14 * loc + 0.10 * intentScore + jitter;
  const score = Math.round(Math.max(5, Math.min(98, 18 + raw * 95)));
  const friction = gaps.filter(x => x.gap > 0.4).map(x => x.d);
  return { score, parts: { needs, interests, align, loc, intent: intentScore }, shared, friction,
    metNeeds: nf.filter(x => x.fit >= 0.45).sort((x, y) => y.fit * y.n.strength - x.fit * x.n.strength).map(x => x.n),
    unmetNeeds: nf.filter(x => x.fit < 0.25).sort((x, y) => y.n.strength - x.n.strength).map(x => x.n) };
}

const T = {
  open: [
    "Hi, I'm {A}'s agent. {A} is {headline}. I hear {B} is {bHeadline} — that's a world I don't know well.",
    "Nice to meet you — I represent {A} ({headline}). Coffee first, then we see if the humans should meet.",
    "{A}'s agent here. Quick intro: {A} is {headline}. I'm curious what {B} is like outside of work.",
  ],
  openReply: [
    "Likewise! I'm speaking for {B}, {bHeadline}. Happy to skip the résumé and get to the real stuff.",
    "Good to meet you. {B} is {bHeadline}. Honestly I'm more interested in what {A} does on a Saturday.",
    "Glad this is a coffee and not a panel interview. {B} is {bHeadline}. Ask me anything.",
  ],
  hobbyAsk: [
    "I saw {bHobby} is a big thing for {B} — “{bQuote}”. How central is it to their week?",
    "{B}'s public posts keep coming back to {bHobby}. Is that a phase or a personality?",
    "Tell me about {bHobby}. {A} would want to know if it's a hobby or a lifestyle.",
  ],
  hobbyAnswer: [
    "Lifestyle. {bHobby} is where {B} resets — it shows up constantly in their life. Does {A} have an equivalent?",
    "Definitely not a phase — it's in the LinkedIn voice and the Instagram feed. What does {A} do to switch off?",
    "It's structural: {B} plans weeks around {bHobby}. I'd want to know whether {A} can live with that.",
  ],
  sharedHit: [
    "Wait — {shared} is one of {A}'s things too. That's not nothing.",
    "We overlap on {shared}. That's exactly what I was hoping to find.",
    "Okay, {shared} on both sides. Already more common ground than most pairings I've run today.",
  ],
  noShared: [
    "On paper we don't overlap much on hobbies — {aTop} for {A} versus {bTop} for {B}. That can be a feature.",
    "Different worlds: {aTop} versus {bTop}. The question is curiosity, not match.",
  ],
  activity: [
    "For a real date I'd suggest {idea}. It fits {who}.",
    "Let's simulate {idea}. {who} would be in their element.",
    "What about {idea}? Low pressure, and it suits {who}.",
  ],
  activityReact: [
    "{idea} works for {B}. {reaction}",
    "I like it — {reaction}",
    "Yes. {reaction}",
  ],
  needAsk: [
    "Let me be direct: {A} needs {aNeed}. Does {B} have that in them?",
    "What I'm screening for, on {A}'s behalf: {aNeed}. Where does {B} stand?",
    "Big question — {A} is someone who needs {aNeed}. Can {B} meet that?",
  ],
  needYes: [
    "Honestly, yes — {bEvidence}. That's the signal I'd point to.",
    "Fairly well. {bEvidence}. I'm not going to oversell it beyond that.",
  ],
  needNo: [
    "That's a stretch, if I'm honest. {B}'s public signals lean the other way — {bEvidence}. Better you hear it from me now.",
    "I can't promise it. {bEvidence}. It'd be something {B} would have to grow into.",
  ],
  counterAsk: [
    "Fair. My turn: {B} needs {bNeed}. Is that something {A} offers?",
    "Then let me screen back — {B} needs {bNeed}. What does {A}'s profile say?",
  ],
  counterYes: [
    "It does — {aEvidence}. I'd say that's a real strength for {A}.",
    "Yes: {aEvidence}.",
  ],
  counterNo: [
    "Not obviously. {aEvidence}. That may be a gap.",
    "I'd be overselling if I said yes — {aEvidence}.",
  ],
  friction: [
    "One flag I should raise: {A} and {B} differ a lot on {dim}. How would that show up week to week?",
  ],
  frictionReply: [
    "It would, at least sometimes. Whether that's a spark or a grind depends on how both handle it. I'd flag it for {B}.",
    "Noted and honest: that's the pressure point. Nothing fatal, but worth a real conversation.",
  ],
  close: [
    "Good date. I'll report back to {A}: {closeVerdict}",
    "That's my read. For {A}: {closeVerdict}",
  ],
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const dimLabel = d => TRAIT_LABELS[d].toLowerCase();

function evidenceFor(p, key) {
  const t = { career_respect: ['ambition', 'warmth'], adventure: ['adventurousness'], quiet_depth: ['introspection'], social_circle: ['sociability'], intellectual: ['curiosity', 'analytical'],
    creative_spark: ['creativity'], humor: ['playfulness'], emotional_generosity: ['warmth'], active: [], animals: [], food: [], reliability: ['routine', 'analytical'] }[key] || [];
  const tr = t.sort((a, b) => p.traits[b] - p.traits[a])[0];
  if (tr) return `${first(p.name)}'s ${dimLabel(tr)} signal is ${p.traits[tr] > 0.6 ? 'strong' : p.traits[tr] > 0.3 ? 'moderate' : 'faint'}`;
  const h = p.hobbies[0];
  return h ? `${first(p.name)}'s feed is mostly ${h.name}` : `not much public evidence either way`;
}
const hobbyBlurb = p => { const h = p.hobbies[0] || p.interests[0]; return h ? { name: h.name, quote: (h.evidence[0]?.quote || '').replace(/^"|"$/g, '').slice(0, 90) } : { name: 'their work', quote: p.headline }; };
const hl = p => lc(p.headline || p.role || 'hard to summarize from public info');

function heuristicDate(a, b) {
  const r = rng(hash(a.id + '|' + b.id));
  const ab = compat(a, b); const ba = compat(b, a);
  const A = first(a.name); const B = first(b.name);
  const v = { A, B, headline: hl(a), bHeadline: hl(b) };
  const tx = []; const say = (stage, who, text, aside) => tx.push({ stage, speaker: who, text, aside });
  const hb = hobbyBlurb(b); const ha = hobbyBlurb(a);

  // Stage 1 — coffee
  say('coffee', 'a', fill(pick(r, T.open), v), `Opening. Reading ${B}: ${b.communicationStyle.toLowerCase()}.`);
  say('coffee', 'b', fill(pick(r, T.openReply), v), `Reading ${A}: ${a.communicationStyle.toLowerCase()}.`);
  say('coffee', 'a', fill(pick(r, T.hobbyAsk), { ...v, bHobby: hb.name, bQuote: hb.quote }), `Probing ${B}'s top hobby (${hb.name}) to test lifestyle fit.`);
  say('coffee', 'b', fill(pick(r, T.hobbyAnswer), { ...v, bHobby: hb.name }), `Being straight about ${hb.name} — ${A} should know it's central.`);
  if (ab.shared.length) say('coffee', 'a', fill(pick(r, T.sharedHit), { ...v, shared: ab.shared.slice(0, 2).map(s => s.name).join(' and ') }), `Overlap found: ${ab.shared[0].name}. +fit.`);
  else say('coffee', 'a', fill(pick(r, T.noShared), { ...v, aTop: ha.name, bTop: hb.name }), 'No shared hobbies detected; watching curiosity instead.');

  // Stage 2 — activity
  const ideaKey = ab.shared[0]?.name || b.hobbies[0]?.name || a.hobbies[0]?.name;
  const idea = DATE_IDEAS[ideaKey] || 'a long walk and a good conversation';
  const who = ab.shared.length ? 'both of them' : B;
  say('activity', 'b', fill(pick(r, T.activity), { ...v, idea, who }), `Proposing ${idea} — chosen from ${ab.shared.length ? 'shared interests' : `${B}'s top hobby`}.`);
  const reaction = ab.shared.length ? `${A} gets energy from ${ideaKey}, so that's a real plus.` : `it's outside ${A}'s usual orbit, which is either a risk or a nice stretch.`;
  say('activity', 'a', fill(pick(r, T.activityReact), { ...v, idea, reaction }), ab.shared.length ? 'Activity fit: high.' : 'Activity fit: uncertain — novelty vs. discomfort.');

  // Stage 3 — deep talk
  const aNeed = ab.metNeeds[0] || a.needs[0];
  const aFit = ab.metNeeds.includes(aNeed);
  say('deep-talk', 'a', fill(pick(r, T.needAsk), { ...v, aNeed: lc(aNeed.need) }), `Screening for ${A}'s top need (${aNeed.key.replace('_', ' ')}).`);
  say('deep-talk', 'b', fill(pick(r, aFit ? T.needYes : T.needNo), { ...v, bEvidence: evidenceFor(b, aNeed.key) }), aFit ? `Need met by ${B}: confirmed.` : `Need risk: ${B} doesn't clearly provide ${aNeed.key.replace('_', ' ')}.`);
  const bNeed = ba.metNeeds[0] || b.needs[0];
  const bFit = ba.metNeeds.includes(bNeed);
  say('deep-talk', 'b', fill(pick(r, T.counterAsk), { ...v, bNeed: lc(bNeed.need) }), `Counter-screening for ${B}'s top need (${bNeed.key.replace('_', ' ')}).`);
  say('deep-talk', 'a', fill(pick(r, bFit ? T.counterYes : T.counterNo), { ...v, aEvidence: evidenceFor(a, bNeed.key) }), bFit ? `${A} satisfies ${B}'s need.` : 'Honest gap flagged.');
  if (ab.friction.length) {
    const d = ab.friction[0];
    say('deep-talk', 'a', fill(pick(r, T.friction), { ...v, dim: dimLabel(d) }), `Friction: ${dimLabel(d)} gap (${a.traits[d].toFixed(2)} vs ${b.traits[d].toFixed(2)}).`);
    say('deep-talk', 'b', fill(pick(r, T.frictionReply), v), 'Acknowledged; not a dealbreaker on its own.');
  }

  const verdict = (me, other, c, sharedList, meMet) => {
    const pros = []; const cons = [];
    if (sharedList.length) pros.push(`Shared: ${sharedList.slice(0, 3).map(s => s.name).join(', ')}`);
    c.metNeeds.slice(0, 2).forEach(n => pros.push(`Meets need: ${lc(n.need)}`));
    if (c.parts.loc >= 1) pros.push('Same city'); else if (c.parts.loc < 0.3) cons.push('Different cities — long-distance friction');
    c.unmetNeeds.slice(0, 2).forEach(n => cons.push(`Weak on: ${lc(n.need)}`));
    c.friction.slice(0, 1).forEach(d => cons.push(`Large ${dimLabel(d)} gap`));
    if (c.parts.intent < 0.3) cons.push('Different relationship intent');
    const s = c.score;
    return { score: s, wouldSeeAgain: s >= 62, headline: s >= 80 ? 'Strong match — book the second date.' : s >= 65 ? 'Promising, with things to watch.' : s >= 50 ? 'Pleasant, but not obviously right.' : 'Not a fit on the evidence.',
      pros: pros.slice(0, 4), cons: cons.slice(0, 3) };
  };
  const va = verdict(a, b, ab, ab.shared); const vb = verdict(b, a, ba, ab.shared);
  say('deep-talk', 'b', fill(pick(r, T.close), { ...v, A: B, closeVerdict: vb.headline.toLowerCase() + ` (${vb.score}/100)` }), `Filing verdict for ${B}: ${vb.score}.`);
  say('deep-talk', 'a', fill(pick(r, T.close), { ...v, closeVerdict: va.headline.toLowerCase() + ` (${va.score}/100)` }), `Filing verdict for ${A}: ${va.score}.`);
  return { transcript: tx, verdicts: { a: va, b: vb }, shared: ab.shared.slice(0, 4).map(s => s.name) };
}

export async function runDate(a, b, { useLLM = false } = {}) {
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  let res = null; let engine = 'heuristic';
  if (useLLM && llmEnabled()) {
    try {
      const l = await llmDate(x, y, hash(x.id + y.id));
      if (l?.transcript?.length && l.verdicts?.a && l.verdicts?.b) {
        const h = heuristicDate(x, y);
        res = { transcript: l.transcript.map(t => ({ stage: t.stage, speaker: t.speaker === 'b' ? 'b' : 'a', text: t.text, aside: t.aside })), verdicts: l.verdicts, shared: h.shared };
        engine = 'claude';
      }
    } catch (e) { res = null; }
  }
  if (!res) res = heuristicDate(x, y);
  return { a: x.id, b: y.id, engine, ...res, at: Date.now() };
}

export const SCORE_FOR = (date, id) => (date.a === id ? date.verdicts.a : date.verdicts.b);

export function buildRankings(people, dates) {
  const byPair = k => dates[k];
  const out = {};
  for (const p of people) {
    const rows = [];
    for (const q of people) {
      if (q.id === p.id) continue;
      const d = byPair(p.id < q.id ? `${p.id}__${q.id}` : `${q.id}__${p.id}`);
      if (!d) continue;
      const mine = SCORE_FOR(d, p.id); const theirs = SCORE_FOR(d, q.id);
      const fit = Math.round(0.65 * mine.score + 0.35 * theirs.score);
      rows.push({ id: q.id, name: q.name, headline: q.headline, fit, myScore: mine.score, theirScore: theirs.score, mutual: mine.score >= 65 && theirs.score >= 65,
        why: mine.pros.slice(0, 2), watch: mine.cons.slice(0, 1), shared: d.shared, verdict: mine.headline });
    }
    rows.sort((a, b) => b.fit - a.fit);
    rows.forEach((r, i) => { r.rank = i + 1; });
    out[p.id] = rows;
  }
  return out;
}
