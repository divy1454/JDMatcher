/* Offline tests for the job finder (run: npm run test:job-finder): posting reader, skills, titles, industry, matching, every source parser, the full engine. */
import { detectSignals, requiredYears } from '../services/jobFinder/signals.js';
import { assessRelevance, matchJob, roleFamilyMatch, titleFit, worthReading } from '../services/jobFinder/match.js';
import { mentions } from '../services/jobFinder/skills.js';
import { buildProfile } from '../services/jobFinder/profile.js';
import { canonicalIndustry, detectIndustry } from '../services/jobFinder/industry.js';
import { findJobs, buildQueries } from '../services/jobFinder/engine.js';
import { parseCareerUrl } from '../services/jobFinder/sources/careers.js';
import { CandidateForSearch, FetchLike, NormalizedJob } from '../services/jobFinder/types.js';
import * as F from './test-job-finder-fixtures.js';
import { companiesFromLinks, defaultWatchlist, isValidCompany, mergeWatchlists, DEFAULT_WATCHLIST } from '../services/jobFinder/watchlist.js';
import { toSearchCandidate, CandidateRecord } from '../services/jobFinder/candidate.js';
import { industriesFromResume } from '../services/jobFinder/industry.js';
import { searchJobsForCandidate } from '../services/jobFinder/index.js';
import { createJobFinderFetch, clearJobFinderCache } from '../services/jobFinder/http.js';
import { dateOnlyToIso, parseRelativePosted } from '../services/jobFinder/text.js';

const results: Array<{ group: string; name: string; pass: boolean; detail?: string }> = [];
function check(group: string, name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ group, name, pass, detail: pass ? undefined : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}` });
}

const sig = (description: string, extra: Partial<NormalizedJob> = {}) =>
  detectSignals({ title: extra.title || 'DevOps Engineer', description, employmentType: extra.employmentType ?? null, isRemote: extra.isRemote ?? null, location: extra.location || '' });

// ---------------------------------------------------------------------------
// Reading postings like a bench-sales recruiter
// ---------------------------------------------------------------------------
{
  const g = 'signals';
  let s = sig('Rate: $65/hr on C2C. Duration: 12 months. Visa: USC/GC/H1B');
  check(g, 'C2C allowed', s.c2c, 'allowed');
  check(g, 'Rate read', s.rate, '$65/hr');
  check(g, 'Duration read', s.durationMonths, 12);
  check(g, 'USC/GC/H1B list is NOT citizens-only', s.citizenshipRequired, false);
  s = sig('W2 only. No C2C. USC/GC only.');
  check(g, '"No C2C" -> not allowed', s.c2c, 'not_allowed');
  check(g, '"W2 only" detected', s.w2Only, true);
  check(g, '"USC/GC only" -> citizens or green card only', s.citizenship, 'usc_gc');
  check(g, '"unable to sponsor" -> no sponsorship', sig('We are unable to sponsor visas at this time.').noSponsorship, true);
  check(g, '"without sponsorship" -> no sponsorship', sig('Candidates must be authorized to work in the US without sponsorship.').noSponsorship, true);
  check(g, '"not eligible for visa sponsorship"', sig('This position is not eligible for visa sponsorship.').noSponsorship, true);
  check(g, '"able to sponsor H-1B" is not a restriction', sig('We are able to sponsor H-1B transfers.').noSponsorship, false);
  check(g, '"do not require sponsorship" is not a restriction', sig('Ideal candidates do not require sponsorship but we consider all.').noSponsorship, false);
  s = sig('Locals only - onsite 5 days a week in Dallas, TX');
  check(g, 'Locals only', s.localOnly, true);
  check(g, 'On-site 5 days', s.workMode, 'onsite');
  check(g, 'Hybrid role', sig('This is a hybrid role, 3 days a week in office.').workMode, 'hybrid');
  check(g, '"hybrid cloud" skill is not a hybrid role', sig('Experience with hybrid cloud environments.').workMode, 'unknown');
  check(g, '"5+ years of experience" is not a contract length', sig('5+ years of experience in this role.').durationMonths, null);
  check(g, '"6 months contract" length', sig('6 months contract with possible extension').durationMonths, 6);
  check(g, '"No third party / No vendors"', sig('No third party / No vendors please').c2c, 'not_allowed');
  check(g, '"GC tuning" (Java) is not a visa rule', sig('JVM and GC tuning experience').citizenshipRequired, false);
  check(g, '"Corp-to-Corp is fine"', sig('Corp-to-Corp is fine for this role').c2c, 'allowed');
  check(g, '"C2C: No"', sig('C2C: No').c2c, 'not_allowed');
  check(g, '100% remote', sig('This is a 100% remote position').workMode, 'remote');
  check(g, 'Contract from employment type', sig('Great team.', { employmentType: 'Contractor' }).contract, true);
  check(g, '"contract management" skill is not a contract role', sig('Experience with vendor contract management.').contract, false);
  check(g, '"remote-first, but not remote-only" with a Remote location is remote', sig('Coinbase is a remote-first, but not remote-only company.', { location: 'Remote - USA', isRemote: true }).workMode, 'remote');
  check(g, '"This is not a remote position" is on-site', sig('This is not a remote position.').workMode, 'onsite');
}

// ---------------------------------------------------------------------------
// Strict citizenship and clearance check
// ---------------------------------------------------------------------------
{
  const g = 'citizenship & clearance';
  check(g, '"U.S. citizenship is required" -> US citizens only', sig('U.S. citizenship is required for this position.').citizenship, 'usc');
  check(g, '"US Citizens only" -> US citizens only', sig('Java developer. US Citizens only.').citizenship, 'usc');
  check(g, '"Requires US Citizenship" -> US citizens only', sig('Requires US Citizenship due to a federal contract.').citizenship, 'usc');
  check(g, '"Must be a US Citizen or Green Card holder" -> citizens or GC', sig('Must be a US Citizen or Green Card holder.').citizenship, 'usc_gc');
  check(g, '"Only US citizens and green card holders" -> citizens or GC', sig('Only US citizens and green card holders will be considered.').citizenship, 'usc_gc');
  check(g, '"Green Card holders only"', sig('Green Card holders only').citizenship, 'usc_gc');
  // Real wording from a live ServiceNow posting (was read as citizens-only)
  check(g, '"only US citizens, naturalized citizens or US Permanent Residents" -> citizens or GC', sig('Due to Federal requirements, only US citizens, US naturalized citizens or US Permanent Residents, holding a green card, will be considered. Team Overview: data platform.').citizenship, 'usc_gc');
  check(g, '"must be U.S. citizens or lawful permanent residents" -> citizens or GC', sig('Applicants must be U.S. citizens or lawful permanent residents.').citizenship, 'usc_gc');
  check(g, '"U.S. Citizen or Green Card Holder required" -> citizens or GC', sig('Java Developer. U.S. Citizen or Green Card Holder required.').citizenship, 'usc_gc');
  check(g, '"US citizenship or permanent residency is required" -> citizens or GC', sig('US citizenship or permanent residency is required for this role.').citizenship, 'usc_gc');
  check(g, '"Candidates must be US Citizens" -> US citizens only', sig('Candidates must be US Citizens.').citizenship, 'usc');
  check(g, '"Citizenship: US Citizen" field -> US citizens only', sig('Duration: 12 months\nCitizenship: US Citizen\nLocation: Reston, VA').citizenship, 'usc');
  check(g, '"Visa: USC" field -> US citizens only', sig('Rate: $70/hr\nVisa: USC\nRemote').citizenship, 'usc');
  check(g, '"US citizens only; green card holders are not eligible" stays citizens-only', sig('US citizens only; green card holders are not eligible.').citizenship, 'usc');
  check(g, 'Citizens-only sentence + a later green card sentence stays citizens-only', sig('US Citizenship is required. We also sponsor green cards for long-term employees.').citizenship, 'usc');
  check(g, 'ITAR "U.S. persons" -> citizens or GC', sig('Access to ITAR-controlled data; candidates must be U.S. persons.').citizenship, 'usc_gc');
  check(g, 'Equal-opportunity text is not a citizenship rule', sig('We hire without regard to race, color, religion, sex, national origin, citizenship status, or disability.').citizenship, null);
  check(g, '"authorized to work in the U.S." is not a citizenship rule', sig('Applicants must be authorized to work in the U.S.').citizenship, null);
  check(g, '"No US citizenship required" is not a rule', sig('No US citizenship required; all visas welcome.').citizenship, null);
  check(g, '"does not require US citizenship" is not a rule', sig('This role does not require US citizenship.').citizenship, null);
  check(g, '"Active Secret clearance" -> Secret', sig('Active Secret clearance required.').clearanceRequired, 'Secret');
  check(g, '"TS/SCI" -> TS/SCI', sig('TS/SCI with polygraph').clearanceRequired, 'TS/SCI');
  check(g, '"able to obtain a security clearance" counts', sig('Must be able to obtain a security clearance.').clearanceRequired, 'Must be able to get a clearance');
  check(g, '"Active Public Trust" counts', sig('Active Public Trust required.').clearanceRequired, 'Public Trust');
  check(g, '"earn the public trust" is not a clearance', sig('We work hard to earn the public trust every day.').clearanceRequired, null);
  check(g, '"No clearance required" is not a clearance', sig('No clearance required.').clearanceRequired, null);
  check(g, '"does not require a security clearance" is not a clearance', sig('This role does not require a security clearance.').clearanceRequired, null);
}

// ---------------------------------------------------------------------------
// Skills read from the posting (not just the title)
// ---------------------------------------------------------------------------
{
  const g = 'skills';
  check(g, '"JavaScript" is not Java', mentions('Strong JavaScript and TypeScript skills', 'Java'), false);
  check(g, '"J2EE" is Java', mentions('J2EE, Spring', 'Java'), true);
  check(g, '"react to incidents" is not React', mentions('You will react to production incidents quickly', 'React'), false);
  check(g, '"React" is React', mentions('Front end in React and Redux', 'React'), true);
  check(g, '"the rest of the team" is not REST', mentions('Work with the rest of the team', 'REST'), false);
  check(g, '"RESTful APIs" is REST', mentions('Design RESTful APIs', 'REST'), true);
  check(g, '"TS/SCI" is not TypeScript', mentions('TS/SCI clearance', 'TypeScript'), false);
  check(g, '"EKS" counts as Kubernetes', mentions('Run workloads on EKS', 'Kubernetes'), true);
  check(g, '"springboot" counts as Spring Boot', mentions('Java, springboot, Kafka', 'Spring Boot'), true);
  const java = buildProfile({ name: 'x', titles: ['Java Developer', 'Backend Engineer'], skills: ['Agile', 'Java', 'Spring Boot', 'Microservices', 'AWS'], visa: 'H-1B' });
  check(g, 'Tech in the title is required: Java', java.coreTech, ['Java']);
  check(g, 'Must-haves skip generic skills like Agile', java.mustHave, ['Java', 'Spring Boot', 'Microservices']);
}

// ---------------------------------------------------------------------------
// Titles: related roles and off-target roles
// ---------------------------------------------------------------------------
{
  const g = 'titles';
  check(g, '"Cloud Infrastructure Engineer" fits a DevOps candidate', roleFamilyMatch('DevOps Engineer', 'Cloud Infrastructure Engineer'), 'DevOps / Cloud');
  check(g, '"SRE II" fits a DevOps candidate', roleFamilyMatch('DevOps Engineer', 'SRE II'), 'DevOps / Cloud');
  check(g, '"Salesforce Platform Developer" does not fit a DevOps candidate', roleFamilyMatch('DevOps Engineer', 'Salesforce Platform Developer'), null);
  check(g, '"Account Executive, Cloud" does not fit a DevOps candidate', roleFamilyMatch('DevOps Engineer', 'Account Executive, Cloud'), null);
  check(g, '"Spring Boot Microservices Developer" fits a Java candidate', roleFamilyMatch('Java Developer', 'Spring Boot Microservices Developer'), 'Java');
  check(g, '"Salesforce Administrator" fits a Salesforce Developer', roleFamilyMatch('Salesforce Developer', 'Salesforce Administrator'), 'Salesforce');
  check(g, '"Java Developer" does not fit a Salesforce Developer', roleFamilyMatch('Salesforce Developer', 'Java Developer'), null);
  check(g, '"Senior .NET Engineer" fits a C# developer', roleFamilyMatch('C# .NET Developer', 'Senior .NET Engineer'), '.NET');
  check(g, '"Engineering Manager, DevOps" is not a consultant role', titleFit('DevOps Engineer', 'Engineering Manager, DevOps - Moveworks').excluded, 'manager / executive role');
  check(g, '"Vice President, Platform Engineering" is not a consultant role', titleFit('DevOps Engineer', 'Vice President, Platform Engineering').score >= 0.6, false);
  check(g, 'Plant "Reliability Engineer" is not SRE', titleFit('Site Reliability Engineer', 'Reliability Engineer').score >= 0.6, false);
  check(g, '"Software Engineer, Agent Eval Platform" is not DevOps', roleFamilyMatch('DevOps Engineer', 'Software Engineer, Agent Eval Platform'), null);
  check(g, '"Platform Engineer" still fits DevOps', roleFamilyMatch('DevOps Engineer', 'Senior Platform Engineer'), 'DevOps / Cloud');
  check(g, '"SRE" and "Site Reliability Engineer" are the same title', titleFit('Site Reliability Engineer', 'SRE').score >= 0.6, true);
  check(g, 'A project manager candidate still matches "Senior Project Manager"', titleFit('IT Project Manager', 'Senior Project Manager').score >= 0.6, true);
  // From the live runs
  check(g, '"Customer Success Engineer - DGX Cloud" is not a cloud engineering role', titleFit('Cloud Engineer', 'Senior Customer Success Engineer - DGX Cloud').excluded, 'specialist role (customer success)');
  check(g, '"Solutions Architect - Cloud Partners" is not DevOps', titleFit('DevOps Engineer', 'Solutions Architect - NVIDIA Cloud Partners').excluded, 'specialist role (solutions architect)');
  check(g, '"Compiler Engineer - Backend GPU" is not a backend role', titleFit('Backend Engineer', 'Senior Compiler Engineer - Backend GPU').excluded, 'specialist role (compiler)');
  check(g, '"Manufacturing Test Infrastructure Engineer" is not DevOps', titleFit('DevOps Engineer', 'Manufacturing Test Infrastructure Engineer').excluded, 'specialist role (manufacturing)');
  check(g, '"Performance Engineer - DGX Cloud": product name after the dash doesn\'t count', titleFit('Cloud Engineer', 'Senior Performance Engineer - DGX Cloud').score >= 0.6, false);
  check(g, '"Software Engineer, Infrastructure" is DevOps work', roleFamilyMatch('DevOps Engineer', 'Software Engineer, Infrastructure'), 'DevOps / Cloud');
  check(g, '"Software Engineer, Backend" fits a backend candidate', roleFamilyMatch('Backend Engineer', 'Senior Software Engineer, Backend (Payments)'), 'Back end');
  // From the live run
  check(g, '"Software Engineer, Agent Identity Security" is a security role, not DevOps', titleFit('DevOps Engineer', 'Staff Software Engineer, Agent Identity Security - Veza').excluded, 'different kind of role');
  const javaOnly = buildProfile({ name: 'x', titles: ['Java Developer', 'Backend Engineer'], skills: ['Java', 'Spring Boot', 'Microservices'], visa: 'H-1B' });
  check(g, '"Associate, Member and Provider Programs" is not an engineering role', worthReading('Associate, Member and Provider Programs', javaOnly).ok, false);
  check(g, '"IT Specialist" is not read as a general engineering role', worthReading('IT Specialist', javaOnly).ok, false);
  check(g, 'A plain "Software Engineer" is still worth reading', worthReading('Senior Software Engineer', javaOnly).ok, true);
}

// ---------------------------------------------------------------------------
// Relevance: title + what the posting actually asks for
// ---------------------------------------------------------------------------
const JAVA_HC: CandidateForSearch = {
  name: 'Sample Java (healthcare)',
  titles: ['Java Developer', 'Java Full Stack Developer', 'Backend Engineer'],
  skills: ['Java', 'Spring Boot', 'Microservices', 'React', 'AWS', 'Kafka', 'SQL', 'REST'],
  visa: 'H-1B',
  workPreference: 'Remote',
  location: 'Charlotte, NC',
  c2cOnly: true,
  industries: ['Healthcare'],
  yearsExperience: 9,
};
const H1B: CandidateForSearch = {
  name: 'Ravi Kumar',
  titles: ['DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer'],
  skills: ['Kubernetes', 'Terraform', 'AWS', 'Jenkins', 'Python', 'Ansible'],
  visa: 'H-1B',
  workPreference: 'Hybrid',
  location: 'Austin, TX',
  c2cOnly: true,
};
const job = (title: string, description: string, extra: Partial<NormalizedJob> = {}): NormalizedJob => ({
  id: title,
  source: extra.source || 'jsearch',
  publisher: 'Test',
  title,
  company: extra.company || 'Co',
  location: extra.location || 'Austin, TX',
  isRemote: null,
  postedAt: extra.postedAt ?? F.NOW.toISOString(),
  employmentType: extra.employmentType ?? null,
  url: 'https://example.com',
  applyOptions: [],
  description,
  companyType: extra.companyType ?? null,
});
{
  const g = 'relevance';
  const jp = buildProfile(JAVA_HC);
  const dp = buildProfile(H1B);
  check(g, 'Full-stack job without Java is dropped for a Java candidate', assessRelevance(job('Senior Full-Stack Engineer', 'React, Node.js, TypeScript and GraphQL for our customer portal.'), jp).dropReason, 'missing_skills');
  check(g, 'Plain "Software Engineer" asking for Java + Spring Boot is kept', assessRelevance(job('Software Engineer', 'Build services in Java 17 and Spring Boot on AWS for our platform.'), jp).keep, true);
  check(g, 'Plain "Software Engineer" asking for Go + Python is dropped', assessRelevance(job('Software Engineer', 'Build services in Go and Python on AWS for our platform team.'), jp).keep, false);
  check(g, '"Java Developer" listing without the full posting is kept (to check)', assessRelevance(job('Java Developer', ''), jp).keep, true);
  check(g, '"Backend Engineer" listing without the posting can\'t confirm Java: dropped', assessRelevance(job('Backend Engineer', ''), jp).dropReason, 'not_verified');
  check(g, 'DevOps title asking for none of Kubernetes/Terraform/AWS is dropped', assessRelevance(job('DevOps Engineer', 'Azure DevOps pipelines, PowerShell and Windows Server administration.'), dp).dropReason, 'missing_skills');
  check(g, 'DevOps title asking for Kubernetes is kept', assessRelevance(job('DevOps Engineer', 'Kubernetes, Helm and GitOps for our product teams across regions.'), dp).keep, true);
}

// ---------------------------------------------------------------------------
// Industry
// ---------------------------------------------------------------------------
{
  const g = 'industry';
  check(g, 'Company name: Optum -> Healthcare', detectIndustry({ title: 'Java Developer', company: 'Optum', description: 'Java services.' }).name, 'Healthcare');
  check(g, 'Posting words: HIPAA + EHR + patients -> Healthcare', detectIndustry({ title: 'Java Developer', company: 'Acme', description: 'HIPAA-compliant services that sync EHR data for patients.' }).name, 'Healthcare');
  check(g, 'Benefits text ("medical, dental, vision") is not healthcare', detectIndustry({ title: 'Java Developer', company: 'Acme', description: 'Java and Spring. We offer medical, dental and vision insurance and a 401(k).' }).name, null);
  check(g, 'Core banking + payments + AML -> Banking', detectIndustry({ title: 'Java Developer', company: 'Acme', description: 'Core banking platform: payments, AML and KYC checks.' }).name, 'Banking / Financial services');
  check(g, 'Source company type "Health Care" -> Healthcare', detectIndustry({ title: 'Java Developer', company: 'Acme', description: 'Java.', companyType: 'Health Care' }).name, 'Healthcare');
  check(g, 'Candidate industry names: "health care", "BFSI", "P&C insurance"', ['health care', 'BFSI', 'P&C insurance'].map(canonicalIndustry), ['Healthcare', 'Banking / Financial services', 'Insurance']);
  // From the live run: a messaging company was tagged "Banking" for naming its customers
  check(g, 'Software company naming its customers ("banks and payments companies") is not Banking', detectIndustry({ title: 'Software Engineer', company: 'Twilio', description: 'We power messaging for banks and payments companies. Build email infrastructure in Java.' }).name, null);
}

// ---------------------------------------------------------------------------
// Matching a bench candidate: blockers, checks, status, summary
// ---------------------------------------------------------------------------
{
  const g = 'matching';
  let m = matchJob(job('DevOps Engineer', 'USC/GC only. Kubernetes on AWS for our platform team.'), H1B, F.NOW);
  check(g, 'H-1B + "USC/GC only" -> blocked', [m.eligible, m.blockers[0]], [false, 'USC/GC only']);
  m = matchJob(job('DevOps Engineer', 'USC/GC only. Kubernetes on AWS for our platform team.'), { ...H1B, visa: 'Green Card' }, F.NOW);
  check(g, 'Green card + "USC/GC only" -> fine', m.eligible, true);
  m = matchJob(job('DevOps Engineer', 'US Citizens only. Kubernetes on AWS for our platform team.'), { ...H1B, visa: 'Green Card' }, F.NOW);
  check(g, 'Green card + "US Citizens only" -> blocked', m.blockers, ['US citizens only']);
  m = matchJob(job('DevOps Engineer', 'W2 only. Kubernetes on AWS for our platform team.'), H1B, F.NOW);
  check(g, 'C2C candidate + "W2 only" -> blocked', m.blockers, ['W2 only']);
  m = matchJob(job('DevOps Engineer', 'We do not sponsor visas. Kubernetes on AWS for our team.'), { ...H1B, visa: 'Green Card' }, F.NOW);
  check(g, 'Green card + "no sponsorship" -> fine', m.eligible, true);
  m = matchJob(job('DevOps Engineer', 'TS/SCI required. Kubernetes on AWS for our platform team.'), H1B, F.NOW);
  check(g, 'Clearance needed, candidate has none -> blocked', m.blockers, ['Needs TS/SCI']);
  const usc = { ...H1B, visa: 'US Citizen' };
  m = matchJob(job('DevOps Engineer', 'Active Top Secret clearance required. Kubernetes on AWS.'), { ...usc, clearance: 'Secret' }, F.NOW);
  check(g, 'Secret holder + Top Secret job -> still blocked', m.blockers, ['Needs Top Secret']);
  m = matchJob(job('DevOps Engineer', 'Active Secret clearance required. Kubernetes on AWS.'), { ...usc, clearance: 'Top Secret/SCI' }, F.NOW);
  check(g, 'TS/SCI holder + Secret job -> fine', m.blockers, []);
  m = matchJob(job('DevOps Engineer', 'Must be able to obtain a security clearance. Kubernetes on AWS.'), { ...usc, clearance: 'None' }, F.NOW);
  check(g, 'US citizen without clearance + "able to obtain a clearance" -> fine', m.blockers, []);
  m = matchJob(job('DevOps Engineer', 'Must be able to obtain a security clearance. Kubernetes on AWS.'), H1B, F.NOW);
  check(g, 'H-1B + "able to obtain a clearance" -> blocked', m.blockers, ['Needs Must be able to get a clearance']);
  // Visa lists on staffing posts
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. Visa: USC/GC/H4EAD/L2EAD.'), H1B, F.NOW);
  check(g, '"Visa: USC/GC/H4EAD/L2EAD" -> H-1B blocked', m.blockers, ['Takes USC/GC/H4-EAD/L2-EAD only']);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. Visa: USC/GC/H4EAD/L2EAD.'), { ...H1B, visa: 'H4-EAD' }, F.NOW);
  check(g, '"Visa: USC/GC/H4EAD/L2EAD" -> H4-EAD fine', m.blockers, []);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. Visa: USC/GC/H1B.'), H1B, F.NOW);
  check(g, '"Visa: USC/GC/H1B" -> H-1B fine', m.blockers, []);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. No H1B, OPT, CPT.'), H1B, F.NOW);
  check(g, '"No H1B, OPT, CPT" -> H-1B blocked', m.blockers, ['No H-1B/OPT/CPT']);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. No H1B, OPT, CPT.'), { ...H1B, visa: 'Green Card' }, F.NOW);
  check(g, '"No H1B, OPT, CPT" -> green card fine', m.blockers, []);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. Contract, C2C. OPT and CPT candidates are not eligible.'), { ...H1B, visa: 'OPT' }, F.NOW);
  check(g, '"OPT and CPT candidates are not eligible" -> OPT blocked', m.blockers, ['No OPT/CPT']);
  m = matchJob(job('DevOps Engineer', 'Kubernetes on AWS. We are unable to sponsor visas.'), { ...H1B, visa: 'H4-EAD', c2cOnly: false }, F.NOW);
  check(g, 'H4-EAD + "unable to sponsor" -> fine (no sponsorship needed)', m.blockers, []);
  const good = matchJob(job('Senior DevOps Engineer', 'Kubernetes, Terraform, AWS, Jenkins, Python. C2C ok. 12 months contract.'), H1B, F.NOW);
  const weak = matchJob(job('Frontend Developer', 'React, CSS and design systems for our marketing site.'), H1B, F.NOW);
  check(g, 'Right title + skills scores far above an unrelated role', good.score - weak.score >= 40, true);
  check(g, 'Contract, C2C OK, all must-haves -> Ready, Strong', [good.status, good.level], ['ready', 'strong']);
  check(g, 'One-line summary for the results list', good.summary, 'Strong match · has Kubernetes, Terraform, AWS · Contract, C2C OK · just posted');
  const fte = matchJob(job('DevOps Engineer', 'Kubernetes, Terraform and AWS for our internal platform team.', { source: 'greenhouse' }), H1B, F.NOW);
  check(g, 'Company careers job (full-time direct hire) -> Check first', [fte.status, fte.employment], ['check', 'fulltime']);
  const longText = 'Kubernetes, Terraform and AWS platform work. '.repeat(6);
  m = matchJob(job('Senior DevOps Engineer (Kubernetes) - Federal', longText), H1B, F.NOW);
  check(g, '"- Federal" title: H-1B candidate gets a confirm-citizenship warning', m.warnings.some((w) => w.startsWith('Federal')), true);
  m = matchJob(job('Senior DevOps Engineer (Kubernetes) - Federal', longText), { ...H1B, visa: 'US Citizen' }, F.NOW);
  check(g, '"- Federal" title: no warning for a US citizen', m.warnings.some((w) => w.startsWith('Federal')), false);
  m = matchJob(job('DevOps Engineer', ''), H1B, F.NOW);
  check(g, 'Posting not read: recruiter told to open it', m.warnings.some((w) => w.startsWith('Full posting not read')), true);
  check(g, 'Experience read from the posting', [requiredYears('8+ years of experience with Java'), requiredYears('3-5 years of professional experience'), requiredYears('10+ yrs exp in Java')], [8, 3, 10]);
  check(g, '"We have 20 years of experience serving clients" is not a requirement', requiredYears('We have 20 years of experience serving clients.'), null);
  m = matchJob(job('Java Developer', 'Java, Spring Boot and microservices. 12+ years of experience required. C2C OK.'), JAVA_HC, F.NOW);
  check(g, 'Asks 12+ years, candidate has 9 -> warning', m.warnings.includes('Asks for 12+ years, candidate has 9'), true);
  m = matchJob(job('Java Developer', 'HIPAA claims platform for a health plan with EHR and patient data: Java, Spring Boot, microservices. C2C OK.'), JAVA_HC, F.NOW);
  check(g, 'Healthcare job for a healthcare candidate is flagged', [m.industry.name, m.industry.matchesCandidate], ['Healthcare', true]);
  m = matchJob(job('Java Developer', 'Java, Spring Boot and microservices for payments. C2C OK.', { company: 'Wells Fargo' }), { ...JAVA_HC, previousCompanies: ['Wells Fargo & Co.'] }, F.NOW);
  check(g, 'Job at a past client is flagged', m.previousClient, true);
}

// ---------------------------------------------------------------------------
// Careers links recruiters paste
// ---------------------------------------------------------------------------
{
  const g = 'career links';
  check(g, 'Greenhouse board link', parseCareerUrl('https://boards.greenhouse.io/stripe'), { name: 'Stripe', ats: 'greenhouse', token: 'stripe' });
  check(g, 'Greenhouse job-boards link', parseCareerUrl('https://job-boards.greenhouse.io/datadog/jobs/123')?.token, 'datadog');
  check(g, 'Lever link', parseCareerUrl('https://jobs.lever.co/palantir')?.ats, 'lever');
  check(g, 'Ashby link', parseCareerUrl('https://jobs.ashbyhq.com/ramp')?.token, 'ramp');
  check(g, 'SmartRecruiters link', parseCareerUrl('https://jobs.smartrecruiters.com/Visa')?.token, 'Visa');
  check(
    g,
    'Workday link',
    parseCareerUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'),
    { name: 'Nvidia', ats: 'workday', host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' }
  );
  check(g, 'Unknown site', parseCareerUrl('https://example.com/careers'), null);
}

// ---------------------------------------------------------------------------
// Full engine against mocked providers
// ---------------------------------------------------------------------------
function mockFetch(routes: Array<[RegExp, number, unknown]>, log: string[]): FetchLike {
  return async (url, init) => {
    log.push(`${init?.method || 'GET'} ${url}`);
    for (const [re, status, body] of routes) {
      if (re.test(url)) return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}
const ageH = (j: NormalizedJob) => (F.NOW.getTime() - Date.parse(j.postedAt || '0')) / 3600000;

async function engineTests() {
  const g = 'engine';
  const log: string[] = [];
  const fetch = mockFetch(
    [
      [/jsearch\.p\.rapidapi\.com\/search/, 200, F.JSEARCH],
      [/api\.adzuna\.com/, 200, F.ADZUNA],
      [/boards-api\.greenhouse\.io\/v1\/boards\/acmecloud\/jobs$/, 200, F.GREENHOUSE],
      [/boards-api\.greenhouse\.io\/v1\/boards\/acmecloud\/jobs\/101$/, 200, F.GREENHOUSE_DETAIL['101']],
      [/boards-api\.greenhouse\.io\/v1\/boards\/acmecloud\/jobs\/102$/, 200, F.GREENHOUSE_DETAIL['102']],
      [/boards-api\.greenhouse\.io\/v1\/boards\/acmecloud\/jobs\/103$/, 200, F.GREENHOUSE_DETAIL['103']],
      [/api\.lever\.co\/v0\/postings\/brightpath/, 200, F.LEVER],
      [/api\.lever\.co\/v0\/postings\/medtechpartners/, 200, F.LEVER_JAVA],
      [/myworkdayjobs\.com\/wday\/cxs\/defenseco\/External\/jobs$/, 200, F.WORKDAY_LIST],
      [/myworkdayjobs\.com\/wday\/cxs\/defenseco\/External\/job\//, 200, F.WORKDAY_DETAIL],
      [/smartrecruiters\.com\/v1\/companies\/carolinahealth\/postings\?/, 200, F.SMARTRECRUITERS_LIST],
      [/smartrecruiters\.com\/v1\/companies\/carolinahealth\/postings\/sr-1/, 200, F.SMARTRECRUITERS_DETAIL],
    ],
    log
  );
  const ctx = { fetch, config: { JSEARCH_API_KEY: 'test', ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' }, now: () => F.NOW };

  // --- Portal searches: one request by default, industry search first ---
  const q = buildQueries(H1B, { postedWithinDays: 3 });
  check(g, 'Free plans: one portal search per candidate by default', q.map((x) => `${x.keywords} @ ${x.location} [${x.employmentType}, ${x.postedWithinDays}d]`), ['DevOps Engineer @ Austin, TX [contract, 3d]']);
  check(g, 'Healthcare candidate: healthcare search first, then the plain title', buildQueries(JAVA_HC).map((x) => x.keywords), ['Java Developer healthcare', 'Java Developer']);
  check(g, 'Default window is the last 24 hours', buildQueries(JAVA_HC)[0].postedWithinDays, 1);

  const watch = [
    { name: 'AcmeCloud', ats: 'greenhouse' as const, token: 'acmecloud' },
    { name: 'BrightPath', ats: 'lever' as const, token: 'brightpath' },
    { name: 'DefenseCo', ats: 'workday' as const, host: 'defenseco.wd5.myworkdayjobs.com', tenant: 'defenseco', site: 'External' },
    { name: 'Carolina Health', ats: 'smartrecruiters' as const, token: 'carolinahealth' },
    { name: 'Typo Co', ats: 'lever' as const, token: 'typo-co' },
  ];

  // --- Run A: last 3 days, default hiding rules ---
  const out = await findJobs({ candidate: H1B, queries: q, watchlist: watch, filters: { postedWithinDays: 3 } }, ctx);
  const titles = out.jobs.map((j) => `${j.company} | ${j.title}`);
  check(g, 'India job removed', titles.some((t) => t.startsWith('GlobalSoft')), false);
  check(g, '12-day-old job removed', titles.some((t) => t.startsWith('OldCo')), false);
  check(g, 'Sales job on a watchlist board ignored', titles.some((t) => t.includes('Account Executive')), false);
  const acme = out.jobs.filter((j) => /acmecloud/i.test(j.company) && j.title === 'DevOps Engineer');
  check(g, 'Same AcmeCloud job from JSearch + Greenhouse merged into one', acme.length, 1);
  check(g, 'Merged job keeps every apply link (Dice, LinkedIn, careers site)', acme[0]?.applyOptions.map((o) => o.publisher).sort(), ['AcmeCloud careers', 'Dice', 'LinkedIn']);
  check(g, 'Newest job first', `${out.jobs[0].company} | ${out.jobs[0].title}`, 'AcmeCloud Inc | DevOps Engineer');
  const open = out.jobs.filter((j) => j.match?.status !== 'blocked');
  check(g, 'Jobs listed newest first', open.every((j, i) => i === 0 || ageH(open[i - 1]) <= ageH(j)), true);
  check(g, 'Jobs the candidate can\'t be submitted to come last', out.jobs.findIndex((j) => j.match?.status === 'blocked') >= open.length, true);
  check(g, '"USC/GC only" job hidden by default', [titles.some((t) => t.startsWith('Lone Star Bank')), out.removed.citizenship], [false, 1]);
  check(g, 'Clearance job hidden by default', [titles.some((t) => t.startsWith('DefenseCo')), out.removed.clearance], [false, 1]);
  check(g, 'Hidden jobs listed with the reason', out.hidden.filter((h) => /citizenship|clearance/.test(h.reason)).map((h) => `${h.company}: ${h.reason.split(':')[0]}`).sort(), [
    'DefenseCo: Asks for a clearance (Secret)',
    'Lone Star Bank: Asks for US citizenship or a green card',
  ]);
  const lever = out.jobs.find((j) => j.company === 'BrightPath');
  check(g, 'Lever contract job: H1B accepted, 6-month contract, ready', [lever?.match?.status, lever?.signals?.durationMonths], ['ready', 6]);
  const sr = out.jobs.find((j) => j.company === 'Carolina Health');
  check(g, 'SmartRecruiters posting: locals-only warning kept', sr?.match?.warnings.some((w) => w.startsWith('Locals only')), true);
  check(g, 'A broken watchlist link is reported, not hidden', /Typo Co \(lever\): HTTP 404/.test(out.sources.find((s) => s.source === 'lever')?.error || ''), true);
  check(g, 'JSearch asked for US contract jobs from the last 3 days', log.some((l) => /jsearch/.test(l) && /date_posted=3days/.test(l) && /country=us/.test(l) && /employment_types=CONTRACTOR/.test(l)), true);
  check(g, 'Greenhouse: light list first, no bulk download of every description', log.some((l) => /content=true/.test(l)), false);
  check(g, 'Greenhouse: full posting read for the matching recent job', log.some((l) => /acmecloud\/jobs\/101$/.test(l)), true);
  check(g, 'Greenhouse: sales posting never downloaded', log.some((l) => /acmecloud\/jobs\/102$/.test(l)), false);

  // --- Run B: hiding rules switched off -> shown, but marked can't-submit ---
  const shown = await findJobs({ candidate: H1B, queries: q, watchlist: watch, filters: { postedWithinDays: 3, excludeCitizenship: false, excludeClearance: false } }, ctx);
  const bank = shown.jobs.find((j) => j.company === 'Lone Star Bank');
  check(g, 'Filter off: "USC/GC only" + W2 job shown as can\'t-submit', [bank?.match?.status, bank?.match?.blockers], ['blocked', ['USC/GC only', 'W2 only']]);
  const defense = shown.jobs.find((j) => j.company === 'DefenseCo');
  check(g, 'Filter off: Workday clearance job read in full, shown as can\'t-submit', defense?.match?.blockers, ['Needs Secret']);
  check(g, 'Workday multi-location posting keeps every location', defense?.location, 'Plano, TX / US, TX, Austin');

  // --- Run C: default window (24 hours) ---
  const day = await findJobs({ candidate: H1B, queries: buildQueries(H1B), watchlist: watch }, ctx);
  check(g, 'Default search: only jobs from the last 24 hours', [day.filters.postedWithinDays, day.jobs.every((j) => ageH(j) <= 25), day.jobs.length > 0], [1, true, true]);

  // --- Java candidate with healthcare background ---
  const med = [{ name: 'MedTech Partners', ats: 'lever' as const, token: 'medtechpartners' }];
  const j1 = await findJobs({ candidate: JAVA_HC, queries: buildQueries(JAVA_HC), watchlist: med }, { ...ctx, config: {} });
  check(g, 'Healthcare jobs first (newest first), then others, can\'t-submit last', j1.jobs.map((j) => `${j.title} [${j.match?.industry.name || '-'}]`), [
    'Software Engineer [Healthcare]',
    'Senior Java Developer [Healthcare]',
    'Java Developer [Banking / Financial services]',
    'Java Developer [Healthcare]',
  ]);
  check(g, 'Last one is the W2-only job, marked can\'t submit', j1.jobs[3].match?.blockers, ['W2 only']);
  check(g, 'Hidden: citizens-only, clearance, no-Java and 40-hour-old jobs', [j1.removed.citizenship, j1.removed.clearance, j1.removed.missingSkills, j1.removed.tooOld], [1, 1, 1, 1]);
  check(g, 'Hidden reason for the full-stack job', j1.hidden.find((h) => h.title === 'Senior Full-Stack Engineer')?.reason, "doesn't ask for Java");
  check(g, 'Hidden list: citizenship / clearance first, each with its link', j1.hidden.map((h) => `${h.kind} ${h.url.split('/').pop()}`), [
    'citizenship usc-1',
    'clearance clr-1',
    'missing_skills fs-1',
  ]);
  const best = await findJobs({ candidate: JAVA_HC, queries: [], watchlist: med, sortBy: 'best' }, { ...ctx, config: {} });
  check(g, '"Best match" sort: strongest healthcare job first', best.jobs[0].title, 'Senior Java Developer');
  const flat = await findJobs({ candidate: JAVA_HC, queries: [], watchlist: med, filters: { industryFirst: false } }, { ...ctx, config: {} });
  check(g, 'Industry-first off: purely newest first', flat.jobs.slice(0, 3).map((j) => j.title), ['Java Developer', 'Software Engineer', 'Senior Java Developer']);
  const week = await findJobs({ candidate: JAVA_HC, queries: [], watchlist: med, filters: { postedWithinDays: 7 } }, { ...ctx, config: {} });
  check(g, '"Last week" filter brings in the 40-hour-old job', week.jobs.some((j) => j.id.endsWith('old-1')), true);

  // Every provider down: empty result with errors, never made-up jobs
  const dead = mockFetch([], []);
  const none = await findJobs(
    { candidate: H1B, queries: q, watchlist: [{ name: 'AcmeCloud', ats: 'greenhouse', token: 'acmecloud' }] },
    { fetch: dead, config: { JSEARCH_API_KEY: 'test' }, now: () => F.NOW }
  );
  check(g, 'All sources down -> zero jobs (no fake fallback)', none.jobs.length, 0);
  check(g, 'All sources down -> errors explained', none.sources.every((s) => Boolean(s.error)), true);
  return { out, j1 };
}

// ---------------------------------------------------------------------------
// Backend: career-site links, DB candidate -> search profile, API result, request cache
// ---------------------------------------------------------------------------
async function apiTests() {
  let g = 'career sites (backend)';
  const links = companiesFromLinks([
    'https://jobs.lever.co/palantir',
    'boards.greenhouse.io/stripe',
    'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite',
    'https://evil.example.com/jobs',
    'https://evil.wd5.myworkdayjobs.com.attacker.io/External',
    'not a link',
  ]);
  check(g, 'Recruiter links: Lever, Greenhouse (no https), Workday accepted', links.companies.map((c) => `${c.ats}:${c.token || c.site}`), ['lever:palantir', 'greenhouse:stripe', 'workday:NVIDIAExternalCareerSite']);
  check(g, 'Other hosts and look-alike Workday hosts rejected', links.rejected, ['https://evil.example.com/jobs', 'https://evil.wd5.myworkdayjobs.com.attacker.io/External', 'not a link']);
  check(g, 'Workday entry with a foreign host is refused', isValidCompany({ name: 'X', ats: 'workday', host: 'evil.com', tenant: 'x', site: 'y' }), false);
  check(g, 'Board token with a path in it is refused', isValidCompany({ name: 'X', ats: 'lever', token: '../admin' }), false);
  check(g, 'Default list: 28 career sites when JOB_FINDER_WATCHLIST is empty', defaultWatchlist('').length, DEFAULT_WATCHLIST.length);
  check(g, 'JOB_FINDER_WATCHLIST (links + objects) replaces the defaults', defaultWatchlist('["https://jobs.lever.co/acme", {"name":"Beta","ats":"greenhouse","token":"beta"}]').map((c) => c.token), ['beta', 'acme']);
  check(g, 'Broken JOB_FINDER_WATCHLIST falls back to the defaults', defaultWatchlist('{not json').length, DEFAULT_WATCHLIST.length);
  check(g, 'Same board twice is read once', mergeWatchlists([{ name: 'A', ats: 'lever', token: 'Acme' }], [{ name: 'A2', ats: 'lever', token: 'acme' }]).length, 1);

  g = 'candidate profile (backend)';
  const rec: CandidateRecord = {
    fullName: 'Asha Rao',
    primaryTitle: 'Java Developer',
    visaStatus: 'H-1B',
    workPreference: 'Remote',
    securityClearance: 'None',
    yearsOfExperience: 9,
    keySkills: ['Java', 'Spring Boot', 'Microservices', 'AWS'],
    rawResumeText: 'Java developer. Built claims services at UnitedHealth Group (HIPAA, EHR integration, patients).',
    structuredProfile: { personal: { city: 'Charlotte', state: 'NC' }, workHistory: [{ companyName: 'UnitedHealth Group' }, { companyName: 'Wells Fargo' }] },
  };
  const analysis = {
    industriesAndDomains: { handsOnDomains: [{ name: 'Healthcare (payer)' }, { name: 'Banking' }] },
    roleTiers: [{ tier: 'Primary', roles: ['Java Full Stack Developer', 'Backend Engineer', 'Java Architect'] }],
  };
  let sc = toSearchCandidate(rec, analysis);
  check(g, 'Titles: primary title + 2 primary roles from the resume analysis', sc.candidate.titles, ['Java Developer', 'Java Full Stack Developer', 'Backend Engineer']);
  check(g, 'Industries from the resume analysis, in order', [sc.candidate.industries, sc.industrySource], [['Healthcare', 'Banking / Financial services'], 'resume analysis']);
  check(g, 'Past clients from the work history', sc.candidate.previousCompanies, ['UnitedHealth Group', 'Wells Fargo']);
  check(g, 'Location from the structured profile', sc.candidate.location, 'Charlotte, NC');
  check(g, 'Clearance "None" -> no clearance; C2C candidate by default', [sc.candidate.clearance, sc.candidate.c2cOnly], [undefined, true]);
  sc = toSearchCandidate(rec, null);
  check(g, 'No resume analysis: industries from employers + resume words (UnitedHealth/HIPAA/EHR first, then Wells Fargo)', [sc.candidate.industries, sc.industrySource], [['Healthcare', 'Banking / Financial services'], 'resume']);
  sc = toSearchCandidate(rec, analysis, { industry: 'Insurance', titles: ['Java Engineer'], c2cOnly: false });
  check(g, 'Recruiter overrides: industry, titles, W2 candidate', [sc.candidate.industries, sc.industrySource, sc.candidate.titles, sc.candidate.c2cOnly], [['Insurance'], 'chosen', ['Java Engineer'], false]);
  sc = toSearchCandidate(rec, analysis, { industry: 'none' });
  check(g, 'Industry "none": no industry ordering', sc.candidate.industries, []);
  sc = toSearchCandidate({ ...rec, securityClearance: 'Secret', yearsOfExperience: 0, structuredProfile: null }, null);
  check(g, 'Clearance kept; 0 years -> unknown; no profile -> no location', [sc.candidate.clearance, sc.candidate.yearsExperience, sc.candidate.location], ['Secret', undefined, undefined]);
  check(g, 'A DevOps resume that mentions "payments" once is not Banking', industriesFromResume('DevOps engineer. Kubernetes, Terraform, AWS. Ran CI/CD for the payments service.'), []);

  g = 'API result (backend)';
  const log: string[] = [];
  const fetch = mockFetch([[/api\.lever\.co\/v0\/postings\/medtechpartners/, 200, F.LEVER_JAVA]], log);
  const javaRec = toSearchCandidate({ ...rec, primaryTitle: 'Java Developer' }, { ...analysis, industriesAndDomains: { handsOnDomains: [{ name: 'Healthcare' }] } });
  const res = await searchJobsForCandidate(javaRec.candidate, [{ name: 'MedTech Partners', ats: 'lever', token: 'medtechpartners' }], {}, {}, { fetch, now: () => F.NOW });
  check(g, 'Default options: last 24 hours, hide citizenship + clearance, industry first, newest', [res.options.postedWithinDays, res.options.excludeCitizenship, res.options.excludeClearance, res.options.industryFirst, res.options.sortBy], [1, true, true, true, 'newest']);
  check(g, 'No portal keys -> career sites only, said so', [res.portals, res.careerSites], [{ jsearch: false, adzuna: false }, 1]);
  check(g, 'Jobs come back with status, summary and an employment label', res.jobs.every((j) => j.match.status && j.match.summary && j.match.employmentLabel), true);
  check(g, 'Healthcare first, W2-only last', [res.jobs[0].match.industry.name, res.jobs[res.jobs.length - 1].match.blockers], ['Healthcare', ['W2 only']]);
  check(g, 'Hidden jobs listed with kind and link', res.hidden.map((h) => h.kind), ['citizenship', 'clearance', 'missing_skills']);
  check(g, 'Candidate summary sent back (titles, must-haves, industries)', [res.candidate.mustHave.slice(0, 1), res.candidate.industries], [['Java'], ['Healthcare']]);
  const week = await searchJobsForCandidate(javaRec.candidate, [{ name: 'MedTech Partners', ats: 'lever', token: 'medtechpartners' }], { postedWithinDays: 7 }, {}, { fetch, now: () => F.NOW });
  check(g, '"1 week" option brings in the 40-hour-old job', week.total - res.total, 1);

  g = 'posting dates (backend)';
  // Searching from India in the morning = the previous evening in the US
  const istMorning = new Date('2026-11-04T02:30:00Z');
  check(g, 'Workday date "2026-11-03" -> midday US time that day, not midnight UTC', dateOnlyToIso('2026-11-03', istMorning), '2026-11-03T18:00:00.000Z');
  check(g, "A date can't be in the future", dateOnlyToIso('2026-11-04', istMorning), istMorning.toISOString());
  check(g, '"Posted 5 hours ago" keeps the hours', parseRelativePosted('Posted 5 Hours Ago', istMorning), '2026-11-03T21:30:00.000Z');
  const wdRoutes = (start: string): Array<[RegExp, number, unknown]> => [
    [/acme\.wd1\.myworkdayjobs\.com\/wday\/cxs\/acme\/Careers\/jobs$/, 200, { total: 1, jobPostings: [{ title: 'DevOps Engineer', externalPath: '/job/Dallas-TX/DevOps-Engineer_R9', locationsText: 'Dallas, TX', postedOn: 'Posted Yesterday' }] }],
    [/acme\.wd1\.myworkdayjobs\.com\/wday\/cxs\/acme\/Careers\/job\//, 200, { jobPostingInfo: { title: 'DevOps Engineer', jobDescription: '<p>Contract. Kubernetes, Terraform, AWS and Jenkins. Hybrid in Dallas.</p>', location: 'Dallas, TX', startDate: start } }],
  ];
  const acmeWd = [{ name: 'Acme', ats: 'workday' as const, host: 'acme.wd1.myworkdayjobs.com', tenant: 'acme', site: 'Careers' }];
  const wdLog: string[] = [];
  let wd = await findJobs({ candidate: H1B, queries: [], watchlist: acmeWd }, { fetch: mockFetch(wdRoutes('2026-11-03'), wdLog), config: {}, now: () => istMorning });
  check(g, 'Workday job dated yesterday (US) is in the last-24-hours list, labelled by day', [wd.jobs.length, wd.jobs[0]?.match?.summary.endsWith('posted today'), wd.jobs[0]?.postedPrecision], [1, true, 'day']);
  wd = await findJobs({ candidate: H1B, queries: [], watchlist: acmeWd }, { fetch: mockFetch(wdRoutes('2026-11-01'), wdLog), config: {}, now: () => istMorning });
  check(g, 'Workday job dated 3 days ago is not in the last 24 hours', [wd.jobs.length, wd.removed.tooOld], [0, 1]);
  wd = await findJobs({ candidate: H1B, queries: [], watchlist: acmeWd, filters: { postedWithinDays: 3 } }, { fetch: mockFetch(wdRoutes('2026-11-01'), wdLog), config: {}, now: () => istMorning });
  check(g, '... but it is in "last 3 days", labelled "posted 2 days ago"', [wd.jobs.length, wd.jobs[0]?.match?.summary.endsWith('posted 2 days ago')], [1, true]);

  g = 'hidden lists (backend)';
  const mixed = mockFetch([[/api\.lever\.co\/v0\/postings\/medtechpartners/, 200, F.LEVER_JAVA]], []);
  const dev = await findJobs({ candidate: H1B, queries: [], watchlist: [{ name: 'MedTech Partners', ats: 'lever', token: 'medtechpartners' }] }, { fetch: mixed, config: {}, now: () => F.NOW });
  check(g, "DevOps candidate: a citizens-only JAVA job counts as a different role, not as citizenship", [dev.removed.citizenship, dev.removed.clearance, dev.hidden.some((h) => h.kind === 'citizenship')], [0, 0, false]);

  g = 'request cache (backend)';
  clearJobFinderCache();
  let calls = 0;
  const base = (async (url: string) => {
    calls++;
    const fail = String(url).includes('fail');
    return new Response(fail ? 'nope' : JSON.stringify({ ok: true }), { status: fail ? 500 : 200 });
  }) as unknown as typeof globalThis.fetch;
  const cached = createJobFinderFetch(base);
  await cached('https://api.lever.co/v0/postings/acme?mode=json');
  const again = await cached('https://api.lever.co/v0/postings/acme?mode=json');
  check(g, 'Same board within 10 minutes: downloaded once', [calls, (await again.json()).ok], [1, true]);
  await cached('https://api.lever.co/v0/postings/fail');
  await cached('https://api.lever.co/v0/postings/fail');
  check(g, 'Failed responses are not cached', calls, 3);
  await cached('https://x.myworkdayjobs.com/wday/cxs/x/y/jobs', { method: 'POST', body: '{"searchText":"java"}' });
  await cached('https://x.myworkdayjobs.com/wday/cxs/x/y/jobs', { method: 'POST', body: '{"searchText":"devops"}' });
  check(g, 'Workday searches with different keywords are separate', calls, 5);
}

engineTests().then(async ({ out, j1 }) => {
  await apiTests();
  let group = '';
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group}`);
    }
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ${r.detail}`}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  for (const [label, res] of [['DevOps candidate, last 3 days', out], ['Java candidate (healthcare), last 24 hours', j1]] as const) {
    console.log(`\nResults: ${label}`);
    for (const j of res.jobs) {
      const m = j.match!;
      console.log(`  [${m.status.toUpperCase().padEnd(7)}] ${String(m.score).padStart(3)}  ${j.title} | ${j.company} | ${m.summary}${m.blockers.length ? `  (can't submit: ${m.blockers.join(', ')})` : ''}`);
    }
    console.log(`  Hidden: ${Object.entries(res.removed).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
  process.exit(failed ? 1 : 0);
});
