/** Small text helpers shared by sources, signals and matching. */

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&rsquo;': "'", '&lsquo;': "'", '&rdquo;': '"', '&ldquo;': '"', '&ndash;': '-', '&mdash;': '-', '&bull;': '-',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ');
}

/** HTML (possibly entity-escaped, as Greenhouse returns it) to readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let s = String(html);
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s); // escaped HTML
  s = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalize(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable short hash for ids and cache keys. */
export function hash(s: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

export function daysAgo(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86400000;
}

/** Workday's "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" to an ISO date. */
export function parseRelativePosted(text: string | null | undefined, now = new Date()): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const exact = t.match(/(\d+)\+?\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\s+ago/);
  if (exact) {
    const n = Number(exact[1]);
    return new Date(now.getTime() - n * (/^(minute|min)/.test(exact[2]) ? 60000 : 3600000)).toISOString();
  }
  let days: number | null = null;
  if (/today|just posted|hours? ago|minutes? ago/.test(t)) days = 0;
  else if (/yesterday/.test(t)) days = 1;
  else {
    const m = t.match(/(\d+)\+?\s*(day|days|week|weeks|month|months)/);
    if (m) {
      const n = Number(m[1]);
      days = /week/.test(m[2]) ? n * 7 : /month/.test(m[2]) ? n * 30 : n;
    }
  }
  if (days === null) return null;
  return new Date(now.getTime() - days * 86400000).toISOString();
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date with no time ("2026-11-03"), as Workday gives it. */
export function isDateOnly(v: unknown): boolean {
  return typeof v === 'string' && DATE_ONLY.test(v.trim());
}

/**
 * "2026-11-03" -> 18:00 UTC that day (midday in the US), never later than now. The real time is unknown:
 * the engine allows for that when it checks the time window (see postedPrecision).
 */
export function dateOnlyToIso(d: string, now = new Date()): string | null {
  if (!isDateOnly(d)) return null;
  const t = Date.parse(`${d.trim()}T18:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(Math.min(t, now.getTime())).toISOString();
}

/** US state names and abbreviations, for location matching. */
export const US_STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan',
  mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire',
  nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma',
  or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee',
  tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin',
  wy: 'wyoming', dc: 'district of columbia',
};

/** Two-letter state code found in a location string ("Austin, TX" -> "tx", "Dallas, Texas" -> "tx"). */
export function stateOf(location: string | null | undefined): string | null {
  const raw = String(location || '');
  const abbr = raw.match(/,\s*([A-Z]{2})\b/);
  if (abbr && US_STATES[abbr[1].toLowerCase()]) return abbr[1].toLowerCase();
  const n = normalize(raw);
  for (const [code, name] of Object.entries(US_STATES)) {
    if (` ${n} `.includes(` ${name} `)) return code;
  }
  return null;
}

const NON_US = /\b(india|bengaluru|bangalore|hyderabad|pune|chennai|noida|gurgaon|mumbai|delhi|united kingdom|london|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|poland|spain|portugal|canada|toronto|vancouver|mexico|brazil|argentina|singapore|japan|tokyo|australia|sydney|philippines|israel|tel aviv|uae|dubai|south africa|romania|ukraine|czech|costa rica|colombia|chile)\b/i;

/** True when a location is clearly outside the US. */
export function isNonUs(location: string | null | undefined): boolean {
  const s = String(location || '');
  if (!s) return false;
  if (/\b(united states|usa|u\.s\.|us remote|remote us|remote - us|remote, us)\b/i.test(s) || stateOf(s)) return false;
  return NON_US.test(s);
}
