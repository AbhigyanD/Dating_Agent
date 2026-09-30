// Source ingestion: exactly two sources per person — LinkedIn + public Instagram.
// Providers, tried in order:
//   1. Apify actors (set APIFY_TOKEN) — most reliable, handles anti-bot
//   2. Direct public fetch — Instagram web_profile_info JSON + og:/JSON-LD meta tags
//   3. Manual paste fallback (handled by the caller when both providers fail)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const APIFY = process.env.APIFY_TOKEN;
const APIFY_IG = process.env.APIFY_IG_ACTOR || 'apify~instagram-profile-scraper';
const APIFY_LI = process.env.APIFY_LI_ACTOR || 'harvestapi~linkedin-profile-scraper';

export function parseLinkedIn(url) {
  try {
    const u = new URL(/^https?:/i.test(url) ? url : 'https://' + url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)/i);
    if (!m) return null;
    const slug = decodeURIComponent(m[1]).toLowerCase();
    return { slug, url: `https://www.linkedin.com/in/${slug}` };
  } catch { return null; }
}

export function parseInstagram(url) {
  try {
    const u = new URL(/^https?:/i.test(url) ? url : 'https://' + url);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
    if (!m || ['p', 'reel', 'explore', 'accounts', 'stories'].includes(m[1])) return null;
    const handle = m[1].toLowerCase();
    return { handle, url: `https://www.instagram.com/${handle}/` };
  } catch { return null; }
}

const decode = (s = '') => s.replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const meta = (html, prop) => {
  const r = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)
    || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i').exec(html);
  return r ? decode(r[1]) : '';
};

async function timed(url, opts = {}, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow' }); } finally { clearTimeout(t); }
}

async function apify(actor, input) {
  const r = await timed(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }, 120000);
  if (!r.ok) throw new Error(`Apify ${actor} HTTP ${r.status}`);
  const items = await r.json();
  if (!items?.[0]) throw new Error('Apify returned no data');
  return items[0];
}

// ---------- Instagram ----------
export async function scrapeInstagram({ handle, url }) {
  const errors = [];
  if (APIFY) {
    try {
      const d = await apify(APIFY_IG, { usernames: [handle] });
      if (d.private) throw new Error('profile is private');
      return {
        ok: true, via: 'apify', url, username: handle, fullName: d.fullName || '', bio: d.biography || '',
        followers: d.followersCount, category: d.businessCategoryName || '',
        posts: (d.latestPosts || []).map(p => p.caption).filter(Boolean).slice(0, 12),
        hashtags: [], raw: '',
      };
    } catch (e) { errors.push(`apify: ${e.message}`); }
  }
  try {
    const r = await timed(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${handle}`, {
      headers: { 'user-agent': UA, 'x-ig-app-id': '936619743392459', accept: '*/*' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const u = (await r.json())?.data?.user;
    if (!u) throw new Error('no user in response');
    if (u.is_private) throw new Error('profile is private — only public profiles are supported');
    const posts = (u.edge_owner_to_timeline_media?.edges || [])
      .map(e => e.node?.edge_media_to_caption?.edges?.[0]?.node?.text).filter(Boolean).slice(0, 12);
    return { ok: true, via: 'instagram-json', url, username: handle, fullName: u.full_name || '', bio: u.biography || '',
      followers: u.edge_followed_by?.count, category: u.category_name || '', posts, hashtags: [], raw: '' };
  } catch (e) { errors.push(`json: ${e.message}`); }
  try {
    const r = await timed(url, { headers: { 'user-agent': 'facebookexternalhit/1.1', accept: 'text/html' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const desc = meta(html, 'og:description');
    const title = meta(html, 'og:title');
    if (!desc && !title) throw new Error('no public metadata');
    return { ok: true, via: 'instagram-og', url, username: handle, fullName: title.replace(/\s*\(@.*$/, ''), bio: desc, posts: [], hashtags: [], raw: desc };
  } catch (e) { errors.push(`og: ${e.message}`); }
  return { ok: false, url, username: handle, error: errors.join(' | ') };
}

// ---------- LinkedIn ----------
export async function scrapeLinkedIn({ slug, url }) {
  const errors = [];
  if (APIFY) {
    try {
      const d = await apify(APIFY_LI, { publicIdentifiers: [slug], profileScraperMode: 'Profile details no email ($4 per 1k)' });
      const exp = (d.experience || []).map(x => ({ title: x.position || x.title || '', company: x.companyName || x.company || '', description: x.description || '' }));
      return {
        ok: true, via: 'apify', url, name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.fullName || '',
        headline: d.headline || '', location: d.location?.linkedinText || d.location?.parsed?.text || d.location || '',
        about: d.about || d.summary || '', experience: exp,
        education: (d.education || []).map(e => [e.degree, e.schoolName || e.school].filter(Boolean).join(' — ')),
        skills: (d.skills || []).map(s => s.name || s).slice(0, 25), raw: '',
      };
    } catch (e) { errors.push(`apify: ${e.message}`); }
  }
  try {
    const r = await timed(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} (LinkedIn blocks most anonymous requests)`);
    const html = await r.text();
    let ld = null;
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { const j = JSON.parse(m[1]); const g = j['@graph']?.find(x => x['@type'] === 'Person') || (j['@type'] === 'Person' ? j : null); if (g) { ld = g; break; } } catch { /* next */ }
    }
    const title = meta(html, 'og:title').replace(/\s*\|\s*LinkedIn.*$/i, '');
    const desc = meta(html, 'og:description');
    if (!ld && !title) throw new Error('login wall — no public data');
    return {
      ok: true, via: ld ? 'linkedin-jsonld' : 'linkedin-og', url,
      name: ld?.name || title.split(' - ')[0] || '', headline: ld?.jobTitle?.join?.(', ') || title.split(' - ').slice(1).join(' - '),
      location: ld?.address?.addressLocality || '', about: ld?.description || desc || '',
      experience: (ld?.worksFor || []).map(w => ({ title: ld.jobTitle?.[0] || '', company: w.name })), education: (ld?.alumniOf || []).map(a => a.name), skills: [], raw: desc,
    };
  } catch (e) { errors.push(`html: ${e.message}`); }
  return { ok: false, url, error: errors.join(' | ') };
}

// Manual fallback: the user pastes the visible text of the public profile.
export function fromPastedLinkedIn(url, text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const loc = lines.find(l => /^(location|📍)/i.test(l))?.replace(/^(location:?|📍)\s*/i, '') || lines.find(l => /,\s*[A-Z]/.test(l) && l.length < 60) || '';
  return { ok: true, via: 'pasted', url, name: lines[0] || '', headline: lines[1] || '', location: loc, about: lines.slice(2).join('\n'), experience: [], education: [], skills: [], raw: text };
}
export function fromPastedInstagram(url, handle, text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  return { ok: true, via: 'pasted', url, username: handle, fullName: '', bio: lines.slice(0, 3).join(' '), posts: lines.slice(3), hashtags: [], raw: text };
}
