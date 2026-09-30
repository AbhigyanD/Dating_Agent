# Agentic Dating

**Your agent reads you, then goes on the dates for you.**

Give the site two links, your LinkedIn and your public Instagram. An AI agent reads both, works out what you need in a partner, what you do for fun and what you care about, then goes on a date with every other person's agent. At the end you get your own ranking of who fits you best, and you can read every date it went on.

| | |
|---|---|
| Watch the video (3 min) | _add YouTube link_ |
| Try the finished demo | _add demo link_ |
| Use the live site | _add live site link_ |

---

## How to use it

### 1. Add people

Go to **Add people** and paste two links for each person:

- their **LinkedIn** profile
- their **Instagram** profile, which must be **public**

Click **Read this person**. Their agent fetches both profiles and reads them. It takes a few seconds.

Adding a group? Use **Add several at once** and paste one person per line, like this:

```
https://www.linkedin.com/in/someone, https://www.instagram.com/someone/
```

**If it says the profile couldn't be read:** LinkedIn and Instagram sometimes block the fetch. Open **Fetch blocked? Paste the profile text**, copy what you can see on their profile (name, headline, about, bio, a few captions) and paste it in. The agent reads that instead.

### 2. Read the profile

Each person gets a profile page showing what their agent found:

- **A short summary** of who they are
- **Needs:** what they seem to need from a partner, and how strongly
- **Hobbies and interests**, each with the **exact quote** from their LinkedIn or Instagram that shows it, highlighted, so you can see why the agent thinks so
- **Qualities:** 10 personality scores, such as ambition, warmth, curiosity and playfulness
- **Values, green flags, things to watch for, and ideal first dates**
- **How the agent read them:** a step-by-step log of what it noticed in each source

### 3. Let the agents date

Go to **Dates** and click **Run the dating round**. Every agent goes on a date with every other agent. A progress bar shows how far along it is.

To watch one, pick two people under **Watch a date**. The date plays out like a chat in three rounds:

1. **Coffee:** introductions and first questions
2. **An activity:** one agent suggests something based on what the two share
3. **A deep talk:** each agent checks whether the other person can give its person what they need, and raises any concerns honestly

Under every message you can see that agent's **private thought**: what it was really thinking and why it said what it did.

When the date ends, each agent gives its verdict **for its own person**: a score out of 100, what went well, what didn't, and whether it would go on a second date. The two agents don't always agree, just like real dates.

### 4. See the rankings

Go to **Rankings** and pick a person. Everyone else is ranked for them, best fit first. The top three come with the reasons: what they share, which needs are met and what to watch out for.

**How the score works:** your own agent's opinion counts most (65%), and the other agent's opinion counts too (35%). When both agents score the date 65 or higher, it's a **mutual match**.

You can click **Watch the date** on any match to see exactly how it went.

---

## What the agent looks at

**Only two things: your LinkedIn and your Instagram.** No other websites, no searching around, no private messages.

- From **LinkedIn**: your headline, role, location, about section and experience
- From **Instagram**: your bio and recent captions

Every conclusion on your profile points back to the words that led to it, so nothing is a black box.

---

## Questions

**Why does it say "synthetic" on the demo people?**
The finished demo uses 25 invented people, so it works without contacting LinkedIn or Instagram. Anything you add yourself is real.

**Why was my Instagram rejected?**
It's probably private. The agent only reads public profiles.

**The profile couldn't be read. What now?**
Use the paste box on the Add people page. See step 1.

**Is the date a real conversation?**
It's a conversation between the two agents, built from what each one learned about its person. With the Claude AI option switched on, the best matches get a date written freely by the AI.

**Does it consider gender, orientation or age?**
Not yet. Everyone is matched with everyone.

**Can I remove someone?**
Yes. Open their profile and click **Remove this person** (click twice to confirm).

---

## Privacy and consent

Only add people who have agreed to it. The agent reads public profiles, but a dating analysis of someone is personal. Ask first.

The public demo contains no real people.

---

## For developers

Run it yourself (Node 20+, no installs needed):

```bash
git clone https://github.com/AbhigyanD/Dating_Agent.git
cd Dating_Agent
node server.js     # then open http://localhost:3000
```

Optional settings:

- `ANTHROPIC_API_KEY`: lets Claude write the profile analysis and each agent's top 6 dates
- `APIFY_TOKEN`: much more reliable LinkedIn and Instagram reading (both sites block most direct requests)

More:

- **Refresh the demo copy:** `node scripts/build-static.mjs` writes a read-only version to `docs/` for GitHub Pages.
- **Deploy the live site:** `render.yaml` sets it up on Render.
- **Load a real group:** fill in `data/cohort.csv`, then run `APIFY_TOKEN=... node scripts/ingest.mjs`.

**Tech stack.** Instagram and LinkedIn are scraped with Apify (`apify/instagram-profile-scraper`, `harvestapi/linkedin-profile-scraper`). If that fails, it falls back to Instagram's public profile endpoint, reading the public page tags, and finally user-pasted text. The analysis and dates run on a built-in Node engine, with the Claude API as an option. The server is plain Node with no dependencies; the site is vanilla JavaScript.

**In one line (200 characters):** Paste a LinkedIn + public Instagram; an agent reads you, writes a needs/hobbies/interests profile, dates every other agent on your behalf, and ranks who fits you best.
