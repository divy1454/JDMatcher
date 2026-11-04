/**
 * Which industry a job is in, so a candidate with healthcare (or banking, insurance...) experience
 * sees jobs in that industry first.
 *
 * Evidence, strongest first:
 *  1. the industry the recruiter tagged the company with, or the source's company type ("Health Care")
 *  2. well-known company names (UnitedHealth, Wells Fargo, State Farm...)
 *  3. industry words in the posting (HIPAA, EHR, claims, underwriting...), counted once each
 * Benefits and equal-opportunity text is ignored: "medical, dental, vision insurance" appears in
 * almost every US posting and says nothing about the industry.
 */
import { NormalizedJob } from './types.js';

interface IndustryDef {
  name: string;
  /** Words in the posting (each distinct word counts once). */
  words: RegExp;
  /** Company names. */
  companies: RegExp;
  /** How people write it in a candidate profile or a source's company type. */
  aliases: RegExp;
}

const INDUSTRIES: IndustryDef[] = [
  {
    name: 'Healthcare',
    words: /\b(healthcare|health\s*care|hospitals?|clinical|patients?|ehr|emr|epic\s+(?:systems|ehr|certified)|cerner|hipaa|hl7|fhir|medicaid|medicare|health\s+plans?|payers?|providers?\s+network|pharmacy|telehealth|care\s+management|revenue\s+cycle|claims\s+adjudication|population\s+health|value[\s-]based\s+care)\b/gi,
    companies: /\b(unitedhealth|united\s*health|optum|cvs|aetna|anthem|elevance|cigna|evernorth|humana|kaiser|hca|centene|molina|highmark|blue\s*cross|bcbs|cerner|epic\s+systems|mckesson|cardinal\s+health|labcorp|quest\s+diagnostics|mayo\s+clinic|cleveland\s+clinic|ascension|commonspirit|providence|tenet|change\s+healthcare|cotiviti|gainwell|athenahealth|veradigm|allscripts|oscar\s+health|clover\s+health|teladoc|carelon|wellcare|ambetter)\b/i,
    aliases: /health\s*care|healthcare|medical|hospital|payer|provider|clinical|\bhealth\b/i,
  },
  {
    name: 'Life sciences / Pharma',
    words: /\b(pharmaceuticals?|pharma|biotech\w*|life\s+sciences|clinical\s+trials?|gxp|gmp|fda|drug\s+development|lims|regulatory\s+affairs|pharmacovigilance)\b/gi,
    companies: /\b(pfizer|merck|johnson\s*&\s*johnson|abbvie|bristol[\s-]myers|amgen|gilead|eli\s+lilly|novartis|astrazeneca|sanofi|gsk|moderna|regeneron|biogen|vertex|thermo\s+fisher|iqvia|medtronic|abbott|baxter|stryker|boston\s+scientific|genentech|bayer)\b/i,
    aliases: /pharma|life\s*science|biotech/i,
  },
  {
    name: 'Banking / Financial services',
    words: /\b(banking|banks?|financial\s+services|fintech|payments?|trading|capital\s+markets|investment\s+banking|wealth\s+management|asset\s+management|lending|mortgages?|credit\s+cards?|brokerage|finra|anti[\s-]money\s+laundering|aml|kyc|basel|treasury|loan\s+origination|core\s+banking|ccar)\b/gi,
    companies: /\b(jpmorgan|jp\s+morgan|chase|bank\s+of\s+america|wells\s+fargo|citi(?:group|bank)?|capital\s+one|u\.?s\.?\s+bank|pnc|truist|goldman\s+sachs|morgan\s+stanley|charles\s+schwab|schwab|fidelity|vanguard|american\s+express|amex|discover\s+financial|mastercard|visa\s+inc|paypal|fannie\s+mae|freddie\s+mac|td\s+bank|bny|state\s+street|northern\s+trust|ally\s+financial|synchrony|fifth\s+third|regions\s+bank|keybank|citizens\s+bank|m&t|huntington|santander|barclays|hsbc|ubs|deutsche\s+bank|blackrock|raymond\s+james|edward\s+jones|ameriprise|stripe|robinhood|coinbase|sofi|chime)\b/i,
    aliases: /bank|financ|fintech|bfsi|capital\s+markets|payments|wealth/i,
  },
  {
    name: 'Insurance',
    words: /\b(insurers?|underwriting|policy\s+administration|actuarial|guidewire|duck\s+creek|p&c|property\s+and\s+casualty|annuit(?:y|ies)|reinsurance|claims\s+(?:processing|handling|system))\b/gi,
    companies: /\b(state\s+farm|allstate|progressive|liberty\s+mutual|nationwide|usaa|travelers|chubb|metlife|prudential|geico|farmers\s+insurance|aflac|the\s+hartford|aig|principal\s+financial|lincoln\s+financial|new\s+york\s+life|northwestern\s+mutual|massmutual|mass\s+mutual|erie\s+insurance|american\s+family|cna\s+financial|markel|zurich|assurant)\b/i,
    aliases: /insur|p&c|underwrit|actuar/i,
  },
  {
    name: 'Retail / E-commerce',
    words: /\b(retail(?:er|ers)?|e-?commerce|merchandising|point[\s-]of[\s-]sale|omnichannel|store\s+operations|consumer\s+goods|cpg)\b/gi,
    companies: /\b(walmart|target\s+corporation|home\s+depot|lowe'?s|costco|kroger|best\s+buy|macy'?s|nordstrom|kohl'?s|albertsons|publix|walgreens|dollar\s+general|dollar\s+tree|tjx|nike|wayfair|ebay|etsy|chewy|ulta|petsmart|7-eleven)\b/i,
    aliases: /retail|e-?commerce|cpg|consumer\s+goods/i,
  },
  {
    name: 'Telecom',
    words: /\b(telecom\w*|wireless\s+carriers?|5g|oss\/bss|broadband|network\s+operators?|telco)\b/gi,
    companies: /\b(at&t|verizon|t-mobile|comcast|charter\s+communications|lumen|centurylink|frontier\s+communications|cox\s+communications|dish\s+network|ericsson|nokia)\b/i,
    aliases: /telecom|telco|wireless|communications/i,
  },
  {
    name: 'Energy / Utilities',
    words: /\b(utilit(?:y|ies)\s+(?:company|industry|operations)|oil\s+(?:and|&)\s+gas|power\s+generation|renewable\s+energy|electric\s+grid|smart\s+grid|energy\s+(?:company|sector|industry|trading))\b/gi,
    companies: /\b(exxon\w*|chevron|conocophillips|duke\s+energy|southern\s+company|dominion\s+energy|nextera|exelon|pg&e|edison|xcel\s+energy|entergy|sempra|halliburton|schlumberger|baker\s+hughes|bp\s+america)\b/i,
    aliases: /energy|utilit|oil|gas|power/i,
  },
  {
    name: 'Automotive / Manufacturing',
    words: /\b(automotive|manufacturing\s+(?:execution|plants?|operations|systems)|industrial\s+automation|scada|plant\s+floor|assembly\s+plants?)\b/gi,
    companies: /\b(ford\s+motor|general\s+motors|stellantis|toyota|honda|tesla|rivian|boeing|lockheed|caterpillar|john\s+deere|deere|3m|honeywell|ge\s+aerospace|general\s+electric|cummins|paccar|whirlpool)\b/i,
    aliases: /automotive|manufactur|industrial|aerospace/i,
  },
  {
    name: 'Government / Public sector',
    words: /\b(state\s+agenc(?:y|ies)|federal\s+agenc(?:y|ies)|public\s+sector|government\s+agenc(?:y|ies)|municipal|county\s+government)\b/gi,
    companies: /\b(state\s+of\s+\w+|county\s+of\s+\w+|city\s+of\s+\w+|department\s+of\s+\w+)\b/i,
    aliases: /government|public\s+sector|federal|state\s+agency/i,
  },
  {
    name: 'Logistics / Transportation',
    words: /\b(logistics|supply\s+chain|freight|shipping|transportation\s+management|warehouse\s+management|fleet\s+management|airlines?)\b/gi,
    companies: /\b(fedex|ups|dhl|xpo|c\.?\s?h\.?\s+robinson|j\.?\s?b\.?\s+hunt|union\s+pacific|bnsf|csx|delta\s+air\s+lines|american\s+airlines|united\s+airlines|southwest\s+airlines|maersk)\b/i,
    aliases: /logistic|transport|supply\s+chain|airline|shipping/i,
  },
];

/** Benefits and equal-opportunity sentences don't describe the industry. */
const BOILERPLATE = /\b(dental|vision|401\s*\(?k\)?|paid\s+time\s+off|pto|benefits?|equal\s+(?:employment\s+)?opportunity|eeo|disabilit\w*|veterans?|reasonable\s+accommodations?|parental\s+leave|wellness|life\s+insurance|health\s+insurance|medical\s+insurance|hsa|fsa)\b/i;

function withoutBoilerplate(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !BOILERPLATE.test(sentence))
    .join('\n');
}

/** "health care" / "BFSI" / "Finance" -> the industry name used here, or null. */
export function canonicalIndustry(name: string | null | undefined): string | null {
  const s = String(name || '').trim();
  if (!s) return null;
  const exact = INDUSTRIES.find((i) => i.name.toLowerCase() === s.toLowerCase());
  if (exact) return exact.name;
  // Order matters: "health insurance" is Insurance only when it doesn't also say healthcare
  const hit = INDUSTRIES.find((i) => i.aliases.test(s));
  return hit ? hit.name : null;
}

const SEARCH_WORD: Record<string, string> = {
  Healthcare: 'healthcare',
  'Life sciences / Pharma': 'pharma',
  'Banking / Financial services': 'banking',
  Insurance: 'insurance',
  'Retail / E-commerce': 'retail',
  Telecom: 'telecom',
  'Energy / Utilities': 'energy',
  'Automotive / Manufacturing': 'manufacturing',
  'Government / Public sector': 'government',
  'Logistics / Transportation': 'logistics',
};

/** Word to add to a portal search for this industry ("Java Developer healthcare"). */
export function industrySearchWord(name: string): string {
  return SEARCH_WORD[name] || name.toLowerCase();
}

export interface IndustryResult {
  name: string | null;
  evidence: string[];
}

/** All industry names, for pickers. */
export const INDUSTRY_NAMES: string[] = INDUSTRIES.map((i) => i.name);

/**
 * A candidate's industries from their resume, best first (at most 2): employers they worked for
 * (UnitedHealth, Wells Fargo...) count most, then distinct industry words (HIPAA, EHR, claims...).
 */
export function industriesFromResume(text: string, companies: string[] = []): string[] {
  const body = withoutBoilerplate(String(text || ''));
  const scored: Array<[string, number]> = [];
  for (const ind of INDUSTRIES) {
    let score = 0;
    if (companies.some((c) => ind.companies.test(c)) || ind.companies.test(body)) score += 5;
    ind.words.lastIndex = 0;
    const words = new Set((body.match(ind.words) || []).map((w) => w.toLowerCase().replace(/\s+/g, ' ')));
    score += Math.min(6, words.size);
    if (score >= 4) scored.push([ind.name, score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
}

export function detectIndustry(job: Pick<NormalizedJob, 'title' | 'company' | 'description' | 'companyType'>): IndustryResult {
  const points = new Map<string, { score: number; evidence: string[] }>();
  const give = (name: string, score: number, evidence: string) => {
    const cur = points.get(name) || { score: 0, evidence: [] };
    cur.score += score;
    cur.evidence.push(evidence);
    points.set(name, cur);
  };

  const stated = canonicalIndustry(job.companyType);
  if (stated) give(stated, 5, `company industry: ${job.companyType}`);
  for (const ind of INDUSTRIES) if (job.company && ind.companies.test(job.company)) give(ind.name, 5, `company: ${job.company}`);

  const body = withoutBoilerplate(`${job.title}\n${job.description || ''}`);
  for (const ind of INDUSTRIES) {
    ind.words.lastIndex = 0;
    const words = new Set((body.match(ind.words) || []).map((w) => w.toLowerCase().replace(/\s+/g, ' ')));
    if (words.size) give(ind.name, Math.min(4, words.size), `posting mentions ${Array.from(words).slice(0, 3).join(', ')}`);
  }

  let best: { name: string; score: number; evidence: string[] } | null = null;
  for (const [name, v] of points) if (!best || v.score > best.score) best = { name, ...v };
  // Company evidence (5 points) is enough on its own. From the posting's words alone, ask for 3 different
  // industry words: software companies list the industries they sell to ("banks and payments companies").
  if (!best || best.score < 3) return { name: null, evidence: [] };
  return { name: best.name, evidence: best.evidence.slice(0, 3) };
}
