/**
 * Text normalisation and similarity helpers shared by the auto-fill resolvers.
 *
 * Everything here works on whole words. Raw substring checks ("notice".includes("no"))
 * caused wrong answers before, so nothing in the engine should compare labels that way.
 */

/** Words that carry no meaning when comparing two questions. Negations are deliberately NOT here. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'you', 'your', 'yours',
  'we', 'our', 'us', 'i', 'me', 'my', 'this', 'that', 'these', 'those', 'it', 'its', 'please',
  'will', 'would', 'can', 'could', 'should', 'have', 'has', 'had', 'if', 'any', 'what', 'which',
  'who', 'whom', 'how', 'when', 'where', 'there', 'here', 'am', 'so', 'such', 'than', 'then',
  'into', 'about', 'enter', 'provide', 'select', 'choose', 'one', 'following', 'below', 'above',
  'required', 'optional',
]);

/** Lowercase, drop apostrophes, turn every other non-alphanumeric run into a single space. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    .replace(/[‘’ʼ']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string | null | undefined): string[] {
  const norm = normalizeText(input);
  return norm ? norm.split(' ') : [];
}

/** Very small stemmer: plural and "-ies" endings only, applied the same way to both sides. */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Stemmed tokens without stop words. */
export function meaningfulTokens(input: string | null | undefined): string[] {
  return tokenize(input).filter((t) => !STOP_WORDS.has(t)).map(stem);
}

export function wordCount(input: string | null | undefined): number {
  return tokenize(input).length;
}

/** True when `word` appears as a whole word in already-normalised text. */
export function hasWord(normalized: string, word: string): boolean {
  return ` ${normalized} `.includes(` ${word} `);
}

const NEGATION_WORDS = [
  'not', 'no', 'dont', 'never', 'cannot', 'cant', 'wont', 'didnt', 'doesnt', 'havent', 'hasnt',
  'isnt', 'arent', 'without', 'non', 'neither', 'nor',
];

export function hasNegation(normalized: string): boolean {
  return NEGATION_WORDS.some((w) => hasWord(normalized, w));
}

export interface TokenOverlap {
  inter: number;
  sizeA: number;
  sizeB: number;
  /** Share of A's tokens found in B. */
  coverageA: number;
  /** Share of B's tokens found in A. */
  coverageB: number;
  jaccard: number;
}

export function tokenOverlap(a: string[], b: string[]): TokenOverlap {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((t) => {
    if (setB.has(t)) inter++;
  });
  const union = setA.size + setB.size - inter;
  return {
    inter,
    sizeA: setA.size,
    sizeB: setB.size,
    coverageA: setA.size ? inter / setA.size : 0,
    coverageB: setB.size ? inter / setB.size : 0,
    jaccard: union ? inter / union : 0,
  };
}

/** Sørensen–Dice coefficient on character bigrams of normalised text (0..1). */
export function diceCoefficient(a: string, b: string): number {
  const x = normalizeText(a).replace(/ /g, '');
  const y = normalizeText(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = bigrams.get(g) || 0;
    if (n > 0) {
      bigrams.set(g, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (x.length - 1 + (y.length - 1));
}

/** Collapses whitespace and trims a label taken from the page. */
export function cleanLabel(input: string | null | undefined): string {
  if (!input) return '';
  return String(input).replace(/\s+/g, ' ').trim();
}
