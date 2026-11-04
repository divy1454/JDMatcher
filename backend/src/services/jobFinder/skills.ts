/**
 * Finding a candidate's skills in a job posting.
 *  - Aliases: "k8s" and "EKS" count as Kubernetes, "J2EE" as Java.
 *  - Word boundaries: "Java" never matches "JavaScript", "TS" never matches "TS/SCI".
 *  - Skills that are also everyday words ("React", "REST", "Go", "Spring", "Swift") only count
 *    in their written tech form, so "react to incidents" or "the rest of the team" don't match.
 */

const CANON: Record<string, string> = {
  golang: 'go', 'go lang': 'go', springboot: 'spring boot', spring: 'spring boot', 'spring-boot': 'spring boot',
  node: 'node.js', nodejs: 'node.js', 'node js': 'node.js', 'react.js': 'react', reactjs: 'react', 'react js': 'react',
  k8s: 'kubernetes', restful: 'rest', 'rest api': 'rest', 'rest apis': 'rest', 'restful api': 'rest', 'restful apis': 'rest',
  'rest services': 'rest', csharp: 'c#', 'c sharp': 'c#', dotnet: '.net', 'asp.net': '.net', '.net core': '.net', 'dot net': '.net',
  'amazon web services': 'aws', 'amazon aws': 'aws', 'google cloud': 'gcp', 'google cloud platform': 'gcp', 'microsoft azure': 'azure',
  postgres: 'postgresql', mongo: 'mongodb', powerbi: 'power bi', 'ci cd': 'ci/cd', cicd: 'ci/cd', 'ci-cd': 'ci/cd',
  microservice: 'microservices', 'micro services': 'microservices', 'micro-services': 'microservices',
  j2ee: 'java', 'java ee': 'java', 'core java': 'java', 'vue.js': 'vue', vuejs: 'vue', angularjs: 'angular',
  pyspark: 'spark', 'apache spark': 'spark', 'apache kafka': 'kafka', 'shell scripting': 'shell', bash: 'shell',
};

/** Lower-case, alias-resolved name used to compare skills ("Spring Boot" and "springboot" -> "spring boot"). */
export function canonicalSkill(skill: string): string {
  const k = String(skill || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return CANON[k] || k;
}

const ALIASES: Record<string, string[]> = {
  java: ['java', 'j2ee', 'jee', 'java ee'],
  kubernetes: ['kubernetes', 'k8s', 'eks', 'aks', 'gke', 'openshift'],
  javascript: ['javascript', 'ecmascript', 'js'],
  typescript: ['typescript'],
  'node.js': ['node.js', 'nodejs', 'node js'],
  angular: ['angular', 'angularjs'],
  vue: ['vue', 'vue.js', 'vuejs'],
  '.net': ['.net', 'dotnet', 'asp.net', '.net core'],
  'c#': ['c#', 'csharp'],
  aws: ['aws', 'amazon web services'],
  gcp: ['gcp', 'google cloud'],
  azure: ['azure'],
  postgresql: ['postgresql', 'postgres'],
  mongodb: ['mongodb', 'mongo'],
  'ci/cd': ['ci/cd', 'cicd', 'ci cd', 'ci-cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  terraform: ['terraform'],
  salesforce: ['salesforce', 'sfdc', 'apex'],
  python: ['python'],
  microservices: ['microservices', 'microservice', 'micro services', 'micro-services'],
  sql: ['sql', 't-sql', 'pl/sql', 'plsql'],
  spark: ['spark', 'pyspark'],
  'power bi': ['power bi', 'powerbi'],
  linux: ['linux', 'rhel', 'red hat enterprise linux'],
  shell: ['shell scripting', 'bash', 'shell script'],
};

/** Skills that are also everyday words: matched only in their written tech form (case matters). */
const SPECIAL: Record<string, RegExp[]> = {
  react: [/\bReact(?:\.js|JS| Native)?\b/, /\breact\.js\b|\breactjs\b/i],
  rest: [/\bREST(?:ful)?\b/, /\brestful\b/i, /\brest\s+(?:api|apis|services|web services|endpoints)\b/i],
  go: [/\bgolang\b/i, /(?:[,(/]\s*|\band\s+|\bor\s+)Go\b/, /\bGo\s*(?:[,)/]|\band\b|\bor\b|programming|language|developer|engineer|services|microservices)/],
  'spring boot': [/\bspring[\s-]?boot\b/i, /\bSpring\b(?!\s+(?:break|semester|season|20\d\d))/],
  swift: [/\bSwift(?:UI)?\b/],
  chef: [/\bChef\b/],
  puppet: [/\bPuppet\b/],
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Does this text (title + posting, original case) ask for the skill? */
export function mentions(text: string, skill: string): boolean {
  const key = canonicalSkill(skill);
  if (!key) return false;
  const special = SPECIAL[key];
  if (special) return special.some((re) => re.test(text));
  const lower = text.toLowerCase();
  const variants = ALIASES[key] || [key];
  return variants.some((v) => new RegExp(`(?:^|[^a-z0-9+#.])${escapeRe(v)}(?:$|[^a-z0-9+#])`).test(lower));
}

/** Skills too common to tell jobs apart ("Agile", "Git", "Jira"): never used as must-haves. */
const GENERIC_SKILLS = new Set([
  'agile', 'scrum', 'kanban', 'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'linux', 'unix', 'windows', 'sdlc',
  'waterfall', 'ms office', 'microsoft office', 'excel', 'communication', 'teamwork', 'problem solving', 'rest', 'json', 'xml',
  'html', 'css', 'sql', 'oop', 'design patterns', 'data structures', 'algorithms', 'shell', 'postman', 'maven', 'gradle', 'npm',
  'intellij', 'eclipse', 'visual studio', 'vs code',
]);

export function isGenericSkill(skill: string): boolean {
  return GENERIC_SKILLS.has(canonicalSkill(skill));
}

/** Technologies a job title can name ("Java Developer", "Azure DevOps Engineer", "Salesforce Admin"). */
const TITLE_TECH = [
  'java', 'python', '.net', 'c#', 'salesforce', 'servicenow', 'sap', 'react', 'angular', 'node.js', 'go', 'ruby', 'php', 'scala',
  'kotlin', 'swift', 'ios', 'android', 'aws', 'azure', 'gcp', 'snowflake', 'databricks', 'informatica', 'tableau', 'power bi',
  'mainframe', 'cobol', 'sql', 'oracle', 'workday', 'guidewire', 'pega', 'mulesoft', 'sharepoint', 'kafka', 'spark', 'hadoop',
  'selenium', 'vue', 'flutter',
];
const DISPLAY: Record<string, string> = {
  java: 'Java', python: 'Python', '.net': '.NET', 'c#': 'C#', salesforce: 'Salesforce', servicenow: 'ServiceNow', sap: 'SAP',
  react: 'React', angular: 'Angular', 'node.js': 'Node.js', go: 'Go', ruby: 'Ruby', php: 'PHP', scala: 'Scala', kotlin: 'Kotlin',
  swift: 'Swift', ios: 'iOS', android: 'Android', aws: 'AWS', azure: 'Azure', gcp: 'GCP', snowflake: 'Snowflake',
  databricks: 'Databricks', informatica: 'Informatica', tableau: 'Tableau', 'power bi': 'Power BI', mainframe: 'Mainframe',
  cobol: 'COBOL', sql: 'SQL', oracle: 'Oracle', workday: 'Workday', guidewire: 'Guidewire', pega: 'Pega', mulesoft: 'MuleSoft',
  sharepoint: 'SharePoint', kafka: 'Kafka', spark: 'Spark', hadoop: 'Hadoop', selenium: 'Selenium', vue: 'Vue', flutter: 'Flutter',
  kubernetes: 'Kubernetes', terraform: 'Terraform', 'spring boot': 'Spring Boot', microservices: 'Microservices', 'ci/cd': 'CI/CD',
};

export function displaySkill(key: string): string {
  return DISPLAY[key] || key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Canonical names of the technologies named in a title. */
export function techInTitle(title: string): string[] {
  return TITLE_TECH.filter((t) => mentions(title, t));
}
