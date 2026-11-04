/**
 * The candidate's city and state from the top of their resume ("Charlotte, NC | (704) 555-0142 | ..."),
 * for application forms that ask for a location when the structured profile has none.
 * Only the first lines are read: further down, "Acme Corp, Dallas, TX" is an employer's location.
 */

const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const BY_NAME = new Map(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));
const STATE_ALT = [...Object.keys(STATES), ...Object.values(STATES)].sort((a, b) => b.length - a.length).join('|');

// "Charlotte, NC", "Jersey City, New Jersey 07302", "St. Louis, MO"; the city is 1-4 capitalised words
const CITY_STATE = new RegExp(String.raw`(?:^|[\s|•·,(])((?:[A-Z][A-Za-z.'-]+)(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*(${STATE_ALT})\b(?:[,\s]+\d{5}(?:-\d{4})?)?`);

/** Words that start a line about something other than where the candidate lives. */
const NOT_A_CITY = /^(summary|profile|objective|experience|education|skills|professional|technical|certifications?|projects?|university|college|institute|school|inc|llc|corp|company|bank|client|employer)$/i;

export function cityStateFromResume(text: string): { city: string; state: string } | null {
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const line of lines) {
    if (/\b(19|20)\d{2}\b.*\b(19|20)\d{2}\b|\bpresent\b/i.test(line)) continue; // a dated job line
    const m = CITY_STATE.exec(line);
    if (!m) continue;
    const city = m[1].trim();
    if (city.split(/\s+/).some((w) => NOT_A_CITY.test(w)) || /\d/.test(city)) continue;
    const raw = m[2];
    const code = raw.length === 2 ? raw.toUpperCase() : BY_NAME.get(raw.toLowerCase());
    if (!code || !STATES[code]) continue;
    return { city, state: code };
  }
  return null;
}
