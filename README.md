# 💘 Agentic Dating

**Every person is an agent. The agents date each other. Everyone gets a ranking.**

```
LinkedIn (public) + Instagram (public)  →  Agent reads  →  Profile page (needs · hobbies · interests · traits, with quoted evidence)
                                                     →  Agents date (coffee → activity → deep talk, every pair)  →  Personal rankings
```

## Run it
```bash
node server.js          # http://localhost:3000  — zero npm dependencies, Node ≥ 20
node scripts/smoke.mjs  # optional browser smoke test (needs playwright)
```
`data/db.json` ships pre-run (25 people, 300 dates) so you can look before typing anything.

Optional env: `ANTHROPIC_API_KEY` (Claude-written analysis + Claude-scripted dates), `APIFY_TOKEN` (robust LinkedIn/Instagram scraping), `CLAUDE_MODEL`, `PORT`.

## Using the site
1. **Add people** – paste a LinkedIn URL + a public Instagram URL (single or bulk, one `linkedin, instagram` pair per line). If the sites block the fetch, the form tells you why and opens a paste-the-text fallback.
2. **Profiles** – analysis page: summary, needs, hobbies, interests (each with a quote from the source), 10 trait scores, values, green flags, watch-fors, date ideas, plus a "how the agent read them" log.
3. **Dates** – *Run the dating round* (live progress + feed) and *Watch a date* (animated replay with each agent's private reasoning aside and final verdicts).
4. **Rankings** – pick anyone → ranked list of all others. Fit = 65% own agent's verdict + 35% the other agent's. "Mutual match" = both verdicts ≥ 65. Plus a cohort-wide leaderboard.

## How it works
* **Ingest (`lib/scrape.js`)** – strictly two sources per person. Providers in order: Apify actors → direct public fetch (Instagram `web_profile_info` JSON, then `og:` meta; LinkedIn JSON-LD/`og:`) → user-pasted text. Private Instagram profiles are rejected.
* **Analyze (`lib/analyze.js`)** – lexicon engine over both texts: 37 interests/hobbies, 10 traits, 12 inferable needs, stated intent. Every claim keeps the quote and the source that produced it. With a Claude key, Claude rewrites the qualitative fields over the same evidence.
* **Date (`lib/date.js`)** – a directional compatibility model (how well does B satisfy A's weighted needs, shared interests, trait alignment, location, intent) drives a 3-stage scripted date. Dialogue is assembled from each person's actual evidence; each turn carries the agent's private note. Each agent files a verdict *for its own human*, so A→B ≠ B→A. With Claude enabled, each agent's top-6 pre-screened pairs get a fully LLM-written date.
* **Rank (`buildRankings`)** – per person, blend own verdict with the counterpart's.

## Honest limitations
* LinkedIn and Instagram aggressively block anonymous scraping and their ToS restrict it. Expect to need `APIFY_TOKEN` or the paste fallback. Scraping real people should be done only with their consent.
* **The bundled demo cohort is 25 synthetic personas, not real people** (`scripts/personas.mjs`), because the build environment could not reach either site. To run real people: fill `data/cohort.csv`, then `APIFY_TOKEN=… node scripts/ingest.mjs`.
* Without an Anthropic key the dates are template-assembled (grounded, deterministic), not free-form LLM conversation. The Claude path is implemented but was not exercised in the build environment.
* Gender/orientation preferences are not modeled.

## Submission copy
**200-char summary:** Paste a LinkedIn + public Instagram; an agent reads you, writes a needs/hobbies/interests profile, dates every other agent on your behalf, and ranks who fits you best.

**Tech (scraping):** Node 22, zero-dependency HTTP server; scraping via Apify (instagram-profile-scraper, harvestapi linkedin-profile-scraper) with fallbacks to Instagram's public web_profile_info endpoint, og:/JSON-LD parsing, and pasted text. Analysis/dates: Claude API (optional) + built-in engine. Frontend: vanilla JS SPA.
