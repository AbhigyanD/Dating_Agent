// The agent's "reading" of a person: LinkedIn + Instagram text in, structured profile out.
// Works offline with a transparent, evidence-linked lexicon engine; if ANTHROPIC_API_KEY is set,
// Claude rewrites the qualitative fields (summary, needs, flags) on top of the same evidence.
import { llmAnalyze } from './llm.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = kws => new RegExp(`(?:^|[^a-z])(?:${kws.map(k => esc(k) + (k.length <= 3 ? '(?![a-z])' : '')).join('|')})`, 'gi');

export const INTERESTS = {
  running: ['running', 'marathon', '5k', '10k', 'half marathon', 'runner', 'trail run'],
  climbing: ['climbing', 'bouldering', 'climber'],
  yoga: ['yoga', 'pilates'],
  'gym & lifting': ['gym', 'lifting', 'crossfit', 'strength training'],
  cycling: ['cycling', 'bike ride', 'cyclist', 'gravel'],
  surfing: ['surf'],
  skiing: ['ski', 'skiing', 'snowboard'],
  hiking: ['hiking', 'hike', 'backpacking', 'camping', 'national park'],
  cooking: ['cooking', 'baking', 'recipe', 'sourdough', 'home chef'],
  coffee: ['coffee', 'espresso', 'latte'],
  'wine & cocktails': ['wine', 'cocktail', 'sommelier', 'negroni'],
  'food scene': ['restaurant', 'foodie', 'brunch', 'ramen', 'tasting menu', 'dumpling', 'taco'],
  travel: ['travel', 'wanderlust', 'passport', 'abroad', 'expat', 'trip to', 'road trip'],
  photography: ['photography', 'photographer', 'film camera', 'shot on'],
  'live music': ['concert', 'live music', 'festival', 'vinyl', 'gig'],
  'making music': ['guitar', 'piano', 'songwriting', 'band', 'drummer'],
  dancing: ['dance', 'dancing', 'salsa', 'ballet'],
  'art & museums': ['gallery', 'museum', 'painting', 'sketch', 'ceramics', 'pottery'],
  reading: ['reading', 'bookworm', 'novel', 'book club', 'bookstore'],
  writing: ['writing', 'essay', 'newsletter', 'poetry', 'journal'],
  film: ['film', 'cinema', 'movie', 'a24', 'letterboxd'],
  theater: ['theater', 'theatre', 'broadway', 'improv', 'stand-up', 'comedy'],
  gaming: ['gaming', 'gamer', 'd&d', 'board game', 'chess', 'video game'],
  dogs: ['dog', 'dogs', 'puppy', 'golden retriever', 'rescue pup'],
  cats: ['cat mom', 'cat dad', 'my cat', 'kitten'],
  'AI & ML': ['ai', 'machine learning', 'llm', 'neural', 'deep learning'],
  startups: ['startup', 'founder', 'seed round', 'series a', 'yc', 'venture'],
  'finance & markets': ['investing', 'finance', 'markets', 'hedge fund', 'equity', 'trading'],
  'design & craft': ['design', 'typography', 'product design', 'ux', 'architecture'],
  sustainability: ['climate', 'sustainab', 'renewable', 'clean energy', 'carbon'],
  'health & medicine': ['healthcare', 'medicine', 'clinical', 'patient', 'nurse', 'physician'],
  'teaching & mentoring': ['teaching', 'teacher', 'edtech', 'mentor', 'professor'],
  'community & volunteering': ['volunteer', 'nonprofit', 'community', 'social impact', 'mutual aid'],
  fashion: ['fashion', 'thrift', 'vintage', 'styling'],
  'mindfulness': ['meditation', 'mindfulness', 'breathwork', 'retreat'],
  podcasts: ['podcast'],
  science: ['research', 'phd', 'physics', 'biology', 'chemistry', 'lab'],
};
const HOBBY_SET = new Set(['running', 'climbing', 'yoga', 'gym & lifting', 'cycling', 'surfing', 'skiing', 'hiking', 'cooking', 'coffee', 'wine & cocktails',
  'food scene', 'travel', 'photography', 'live music', 'making music', 'dancing', 'art & museums', 'reading', 'writing', 'film', 'theater', 'gaming', 'dogs', 'cats', 'fashion', 'mindfulness', 'podcasts']);
export const FITNESS = ['running', 'climbing', 'yoga', 'gym & lifting', 'cycling', 'surfing', 'skiing', 'hiking'];

export const TRAIT_LABELS = {
  ambition: 'Ambition', curiosity: 'Curiosity', creativity: 'Creativity', sociability: 'Social energy', adventurousness: 'Adventurousness',
  introspection: 'Introspection', analytical: 'Analytical', warmth: 'Warmth', playfulness: 'Playfulness', routine: 'Routine & structure',
};
const TRAITS = {
  ambition: ['founder', 'ceo', 'cto', 'vp ', 'head of', 'director', 'scaling', 'promoted', 'hustle', 'launched', 'led a', 'principal', 'partner at', 'driven', 'ambitio'],
  curiosity: ['curious', 'learning', 'exploring', 'tinker', 'research', 'questions', 'rabbit hole', 'phd', 'reading'],
  creativity: ['design', 'creative', 'art', 'writing', 'music', 'photography', 'film', 'craft', 'ceramics', 'illustrat'],
  sociability: ['friends', 'dinner party', 'hosting', 'host', 'community', 'networking', 'festival', 'brunch', 'party', 'people person', 'game night'],
  adventurousness: ['adventure', 'travel', 'hike', 'surf', 'climb', 'spontaneous', 'road trip', 'explor', 'ski', 'backpack'],
  introspection: ['meditat', 'journal', 'quiet', 'reflect', 'introvert', 'therapy', 'mindful', 'slow', 'cozy', 'homebody'],
  analytical: ['data', 'engineer', 'analysis', 'quant', 'systems', 'model', 'finance', 'rigor', 'research', 'metrics'],
  warmth: ['caring', 'care for', 'mentor', 'volunteer', 'family', 'kind', 'support', 'nurse', 'teacher', 'community', 'dog', 'dogs', 'grateful'],
  playfulness: ['lol', '😂', 'haha', 'meme', 'joke', 'silly', 'pun ', '🤪', 'banter', 'chaos', 'goofy'],
  routine: ['routine', '5am', 'early morning', 'sunday reset', 'meal prep', 'planner', 'schedule', 'habit'],
};

// Needs the agent infers. `fit(other)` is how well another profile's traits/interests would satisfy it.
const maxInt = (o, ks) => Math.max(0, ...ks.map(k => o.interestScores?.[k] || 0));
export const NEEDS = {
  career_respect: { text: 'A partner who respects a demanding career and protects shared downtime', when: p => p.traits.ambition > 0.5, fit: o => Math.max(o.traits.ambition * 0.9, o.traits.warmth * 0.8) },
  adventure: { text: 'Someone up for spontaneous trips and trying new things', when: p => p.traits.adventurousness > 0.45, fit: o => Math.max(o.traits.adventurousness, maxInt(o, ['travel', 'hiking']) * 0.9) },
  quiet_depth: { text: 'Room for quiet evenings and real conversation, not constant stimulation', when: p => p.traits.introspection > 0.45, fit: o => Math.max(o.traits.introspection, o.traits.warmth * 0.7) },
  social_circle: { text: 'A partner who enjoys hosting, friends, and a full social calendar', when: p => p.traits.sociability > 0.5, fit: o => o.traits.sociability },
  intellectual: { text: 'Intellectual sparring — someone who asks “why?” back', when: p => p.traits.curiosity > 0.5, fit: o => Math.max(o.traits.curiosity, o.traits.analytical * 0.8) },
  creative_spark: { text: 'Someone who makes, or at least deeply appreciates, creative things', when: p => p.traits.creativity > 0.5, fit: o => Math.max(o.traits.creativity, maxInt(o, ['art & museums', 'live music', 'film']) * 0.8) },
  humor: { text: 'Humor as a baseline — someone who can be silly', when: p => p.traits.playfulness > 0.4, fit: o => o.traits.playfulness },
  emotional_generosity: { text: 'Emotional generosity and reciprocity', when: p => p.traits.warmth > 0.5, fit: o => o.traits.warmth },
  active: { text: 'An active partner — someone to move with', when: p => maxInt(p, FITNESS) > 0.5, fit: o => maxInt(o, FITNESS) },
  animals: { text: 'Someone who loves animals as much as they do', when: p => maxInt(p, ['dogs', 'cats']) > 0.4, fit: o => maxInt(o, ['dogs', 'cats']) },
  food: { text: 'Someone who cares about good food and eating well', when: p => maxInt(p, ['cooking', 'food scene', 'wine & cocktails', 'coffee']) > 0.5, fit: o => maxInt(o, ['cooking', 'food scene', 'wine & cocktails', 'coffee']) },
  reliability: { text: 'Reliability, planning, and follow-through', when: p => p.traits.routine > 0.4 || (p.traits.analytical > 0.55 && p.traits.playfulness < 0.3), fit: o => Math.max(o.traits.routine, o.traits.analytical * 0.7) },
};

const DATE_IDEAS = {
  running: 'a morning run then coffee', climbing: 'a bouldering session', yoga: 'a slow-flow class then tea', 'gym & lifting': 'a gym session and a smoothie',
  cycling: 'a bike ride along the water', surfing: 'a beach morning', skiing: 'a day on the slopes', hiking: 'a trail hike with a picnic',
  cooking: 'cooking dinner together', coffee: 'a coffee-shop crawl', 'wine & cocktails': 'a wine bar', 'food scene': 'a tasting-menu dinner',
  travel: 'planning an imaginary trip over dinner', photography: 'a photo walk', 'live music': 'a small live show', 'making music': 'a jam session',
  dancing: 'a dance class', 'art & museums': 'a museum afternoon', reading: 'a bookstore wander', writing: 'a cozy café writing session', film: 'an indie-cinema double feature',
  theater: 'an improv show', gaming: 'a board-game café', dogs: 'a dog-park walk', cats: 'a cat café', 'AI & ML': 'a demo night', startups: 'a founders’ meetup',
  'finance & markets': 'a rooftop drinks debate', 'design & craft': 'a design-store browse', sustainability: 'a farmers’ market', 'health & medicine': 'a long walk',
  'teaching & mentoring': 'a lecture night', 'community & volunteering': 'volunteering side by side', fashion: 'a vintage-store crawl', mindfulness: 'a sound bath',
  podcasts: 'a walk and a podcast swap', science: 'a science museum',
};

const clamp = x => Math.max(0, Math.min(1, x));
const sat = (n, k) => clamp(1 - Math.exp(-n / k));

function snippets(text, re) {
  const out = [];
  for (const sentence of text.split(/(?<=[.!?\n])\s+|\n+/)) {
    re.lastIndex = 0;
    if (re.test(sentence)) out.push(sentence.trim().slice(0, 160));
    if (out.length >= 2) break;
  }
  return out;
}

export function flatten(li, ig) {
  const L = li || {}; const I = ig || {};
  const liText = [L.name, L.headline, L.location, L.about, ...(L.experience || []).map(e => `${e.title} ${e.company} ${e.description || ''}`), ...(L.education || []), ...(L.skills || []), L.raw].filter(Boolean).join('\n');
  const igText = [I.fullName, I.bio, ...(I.posts || []), ...(I.hashtags || []).map(h => '#' + h), I.raw].filter(Boolean).join('\n');
  return { liText, igText };
}

export async function analyze({ linkedin, instagram }) {
  const { liText, igText } = flatten(linkedin, instagram);
  const srcs = [['linkedin', liText], ['instagram', igText]];
  const all = liText + '\n' + igText;
  const reading = [];

  // --- identity
  const name = linkedin?.name || instagram?.fullName || instagram?.username || 'Unknown';
  const headline = linkedin?.headline || '';
  const exp0 = linkedin?.experience?.[0];
  const role = exp0?.title || headline.split(/\s+(?:at|@|\|)\s+/)[0] || '';
  const company = exp0?.company || headline.split(/\s+(?:at|@)\s+/)[1]?.split('|')[0]?.trim() || '';
  const location = linkedin?.location || (igText.match(/📍\s*([^\n|•]+)/)?.[1] || '').trim();
  const seniorityRe = [[/\b(founder|co-?founder|ceo|cto|coo|chief|president)\b/i, 'Executive / founder'], [/\b(vp|vice president|head of|director|principal|partner)\b/i, 'Senior leader'],
    [/\b(senior|staff|lead|manager)\b/i, 'Senior IC / manager'], [/\b(intern|student|junior|associate|graduate|analyst)\b/i, 'Early career']];
  const seniority = seniorityRe.find(([r]) => r.test(headline + ' ' + (exp0?.title || '')))?.[1] || 'Mid-career';
  reading.push({ source: 'linkedin', step: 'Identity', finding: `${name} — ${headline || role || 'headline not found'}${location ? ` · ${location}` : ''}` });
  reading.push({ source: 'linkedin', step: 'Career stage', finding: `${seniority}${company ? ` at ${company}` : ''}` });

  // --- interests
  const interestScores = {}; const evidence = {};
  for (const [name_, kws] of Object.entries(INTERESTS)) {
    const re = rx(kws); let n = 0; const ev = [];
    for (const [src, text] of srcs) {
      const hits = (text.match(re) || []).length;
      if (hits) { n += hits * (src === 'instagram' ? 1.15 : 1); snippets(text, re).forEach(q => ev.push({ source: src, quote: q })); }
    }
    if (n) { interestScores[name_] = sat(n, 2.5); evidence[name_] = ev.slice(0, 3); }
  }
  const ranked = Object.entries(interestScores).sort((a, b) => b[1] - a[1]);
  const mk = ([k, v]) => ({ name: k, score: +v.toFixed(2), evidence: evidence[k] });
  const hobbies = ranked.filter(([k]) => HOBBY_SET.has(k)).slice(0, 8).map(mk);
  const interests = ranked.filter(([k]) => !HOBBY_SET.has(k)).slice(0, 6).map(mk);
  hobbies.slice(0, 3).forEach(h => reading.push({ source: h.evidence[0]?.source || 'instagram', step: `Hobby: ${h.name}`, finding: `“${h.evidence[0]?.quote}”` }));
  interests.slice(0, 2).forEach(h => reading.push({ source: h.evidence[0]?.source || 'linkedin', step: `Interest: ${h.name}`, finding: `“${h.evidence[0]?.quote}”` }));

  // --- traits
  const traits = {}; const traitEv = {};
  for (const [t, kws] of Object.entries(TRAITS)) {
    const re = rx(kws); let n = 0;
    for (const [src, text] of srcs) { const h = (text.match(re) || []).length; n += h; if (h && !traitEv[t]) traitEv[t] = { source: src, quote: snippets(text, re)[0] }; }
    traits[t] = +sat(n, 3).toFixed(2);
  }
  if (/\b(he|she|they)\b.*\bintrovert/i.test(all) || /introvert/i.test(all)) traits.sociability = Math.min(traits.sociability, 0.25);
  const topTraits = Object.entries(traits).sort((a, b) => b[1] - a[1]).slice(0, 3);
  topTraits.forEach(([t]) => traitEv[t] && reading.push({ source: traitEv[t].source, step: `Trait signal: ${TRAIT_LABELS[t]}`, finding: `“${traitEv[t].quote}”` }));

  // --- stated intent
  const lookingRe = /(looking for|seeking|want(?:ing)? someone|ideal partner|my person|hoping to find|dating)[^.\n]{0,140}/i;
  const lookingFor = all.match(lookingRe)?.[0]?.trim() || null;
  const intent = /\b(serious|long[- ]term|relationship|marriage|partner for life|commitment)\b/i.test(lookingFor || '') ? 'serious'
    : /\b(casual|fun|no strings|see where it goes|easygoing)\b/i.test(lookingFor || '') ? 'casual' : 'open';
  if (lookingFor) reading.push({ source: 'instagram', step: 'Stated intent', finding: `“${lookingFor}”` });

  // --- needs
  const base = { traits, interestScores };
  const needs = Object.entries(NEEDS).filter(([, n]) => n.when(base))
    .map(([key, n]) => ({ key, need: n.text, strength: +(Math.max(0.3, sat(1, 1)) * 0).toFixed(2) }));
  // strength = strength of the underlying signal
  const sig = { career_respect: traits.ambition, adventure: traits.adventurousness, quiet_depth: traits.introspection, social_circle: traits.sociability, intellectual: traits.curiosity,
    creative_spark: traits.creativity, humor: traits.playfulness, emotional_generosity: traits.warmth, active: maxInt(base, FITNESS), animals: maxInt(base, ['dogs', 'cats']),
    food: maxInt(base, ['cooking', 'food scene', 'wine & cocktails', 'coffee']), reliability: Math.max(traits.routine, traits.analytical * 0.7) };
  needs.forEach(n => { n.strength = +sig[n.key].toFixed(2); });
  needs.sort((a, b) => b.strength - a.strength);
  if (!needs.length) needs.push({ key: 'emotional_generosity', need: NEEDS.emotional_generosity.text, strength: 0.3 });
  const needsOut = needs.slice(0, 5);

  // --- flags & style
  const dateIdeas = ranked.slice(0, 4).map(([k]) => DATE_IDEAS[k]).filter(Boolean);
  const top = topTraits.map(([t]) => t);
  const style = traits.playfulness > 0.4 ? 'Playful and quick — leads with humor' : traits.analytical > 0.5 ? 'Direct and precise — asks pointed questions'
    : traits.warmth > 0.5 ? 'Warm and attentive — listens first' : traits.introspection > 0.5 ? 'Thoughtful and measured — opens up slowly' : 'Easygoing and open';
  const values = [...new Set(top.map(t => ({ ambition: 'Achievement', curiosity: 'Growth', creativity: 'Self-expression', sociability: 'Connection', adventurousness: 'Freedom', introspection: 'Depth',
    analytical: 'Rigor', warmth: 'Care', playfulness: 'Joy', routine: 'Stability' })[t]))];
  const greenFlags = []; const watch = [];
  if (traits.warmth > 0.45) greenFlags.push('Shows care for others (mentoring, community, family or animals)');
  if (traits.curiosity > 0.45) greenFlags.push('Curious — keeps learning in public');
  if (hobbies.length >= 3) greenFlags.push('Rich life outside work — multiple active hobbies');
  if (traits.ambition > 0.6 && traits.routine < 0.25) watch.push('Career-heavy signals; may over-index on work');
  if (traits.sociability > 0.6 && traits.introspection < 0.2) watch.push('Very social calendar — needs a partner who shares the pace');
  if (traits.introspection > 0.55 && traits.sociability < 0.25) watch.push('Prefers low-key settings; big-group dates may drain');
  if (!hobbies.length) watch.push('Few visible hobbies — agent is less certain about lifestyle fit');
  if (!greenFlags.length) greenFlags.push('Clear, consistent public presence');

  const chars = all.length;
  const confidence = +clamp(chars / 1800 * 0.6 + (liText && igText ? 0.3 : 0.1) + (hobbies.length ? 0.1 : 0)).toFixed(2);

  const summary = `${name} is ${seniority.toLowerCase()}${role ? ` working as ${role}${company ? ' at ' + company : ''}` : ''}${location ? `, based in ${location}` : ''}. ` +
    `${top.length ? `Public signals point to ${top.map(t => TRAIT_LABELS[t].toLowerCase()).join(', ')}.` : ''} ` +
    `${hobbies.length ? `Off the clock: ${hobbies.slice(0, 3).map(h => h.name).join(', ')}.` : ''} ` +
    `${needsOut[0] ? `Likely needs: ${needsOut[0].need.charAt(0).toLowerCase() + needsOut[0].need.slice(1)}.` : ''}`.replace(/\s+/g, ' ').trim();

  let profile = {
    name, headline, role, company, location, seniority, summary, hobbies, interests, traits, needs: needsOut, values, intent, lookingFor,
    communicationStyle: style, dateIdeas, greenFlags, watchFor: watch, interestScores, reading, confidence, engine: 'heuristic',
  };
  const ll = await llmAnalyze({ linkedin: liText.slice(0, 6000), instagram: igText.slice(0, 6000) }, profile).catch(e => { profile.llmError = e.message; return null; });
  if (ll) profile = ll;
  return profile;
}

export function sharedInterests(a, b) {
  const out = [];
  for (const k of Object.keys(a.interestScores || {})) {
    if (b.interestScores?.[k]) out.push({ name: k, weight: Math.min(a.interestScores[k], b.interestScores[k]) });
  }
  return out.sort((x, y) => y.weight - x.weight);
}
export { DATE_IDEAS };
