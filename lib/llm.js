// Optional Claude layer. Without ANTHROPIC_API_KEY every function resolves null and the
// heuristic engines are used, so the whole site still works offline.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
export const llmEnabled = () => !!KEY;

async function complete(system, user, maxTokens = 3000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.content?.map(c => c.text || '').join('') || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in Claude response');
  return JSON.parse(m[0]);
}

const ANALYST = `You are a dating agent reading your human's two public sources (LinkedIn and Instagram) and nothing else.
Never invent facts. Every hobby/interest must be supported by the text. Return ONLY JSON.`;

export async function llmAnalyze(sources, base) {
  if (!KEY) return null;
  const j = await complete(ANALYST, `LINKEDIN:\n${sources.linkedin}\n\nINSTAGRAM:\n${sources.instagram}\n\n` +
    `Improve this draft analysis. Keep the exact same JSON shape and keys as the draft (numbers 0..1 for traits; needs items must keep "key" values from the draft's vocabulary: ` +
    `career_respect, adventure, quiet_depth, social_circle, intellectual, creative_spark, humor, emotional_generosity, active, animals, food, reliability). ` +
    `Rewrite "summary" (3 sentences, insightful, specific), "needs" (with a one-line "need"), "greenFlags", "watchFor", "communicationStyle", "dateIdeas". ` +
    `Fix wrong hobbies/interests. Keep "reading" as a list of {source,step,finding} with real quotes.\n\nDRAFT:\n${JSON.stringify(base)}`, 4000);
  return { ...base, ...j, traits: { ...base.traits, ...(j.traits || {}) }, interestScores: base.interestScores, engine: 'claude' };
}

export async function llmDate(a, b, seedHint) {
  if (!KEY) return null;
  const card = p => ({ name: p.name, headline: p.headline, location: p.location, summary: p.summary, hobbies: p.hobbies.map(h => h.name), interests: p.interests.map(h => h.name),
    needs: p.needs.map(n => n.need), style: p.communicationStyle, watchFor: p.watchFor, lookingFor: p.lookingFor });
  return complete(`You run a dating simulation between two AI agents, each representing a real person ONLY from their public profile analysis. Stay grounded in the profiles;
no invented backstory. Be natural, specific, a little witty; disagreements and friction are allowed. Return ONLY JSON:
{"transcript":[{"stage":"coffee|activity|deep-talk","speaker":"a|b","text":"...","aside":"agent's private note for its human"}],
 "verdicts":{"a":{"score":0-100,"wouldSeeAgain":bool,"headline":"...","pros":["..."],"cons":["..."]},"b":{...same}}}
Produce 10-12 turns across the 3 stages, alternating speakers. Score each side from its own person's needs.`,
  `AGENT A (${a.name}): ${JSON.stringify(card(a))}\n\nAGENT B (${b.name}): ${JSON.stringify(card(b))}\n\nvariety seed: ${seedHint}`, 3500);
}
