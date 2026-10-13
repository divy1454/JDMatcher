import {
  CandidateAutoFillProfile,
  AutoFillExtractedField,
  AutoFillFieldResult,
} from '../content/types';
import { extractElementLabel } from './label-extractor';

export interface FieldPattern {
  name: string;
  regex: RegExp;
  getValue: (profile: CandidateAutoFillProfile) => string | boolean | number | undefined;
  typeMatch?: (field: AutoFillExtractedField) => boolean;
}

/**
 * Normalizes text for matching options in selects or radios.
 */
function normalizeForComparison(val: string): string {
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the best matching option from an array of option strings.
 */
export function matchOptionValue(options: string[], targetValue: string): string | null {
  if (!options || options.length === 0 || !targetValue) return null;

  const targetNorm = normalizeForComparison(targetValue);

  // 1. Exact match (normalized)
  for (const opt of options) {
    if (normalizeForComparison(opt) === targetNorm) {
      return opt;
    }
  }

  // 2. Starts with / contains match
  for (const opt of options) {
    const optNorm = normalizeForComparison(opt);
    if (optNorm.includes(targetNorm) || targetNorm.includes(optNorm)) {
      return opt;
    }
  }

  // 3. Boolean Yes/No heuristics
  if (targetValue.toLowerCase() === 'yes' || targetValue === 'true') {
    const yesMatch = options.find(o => /^yes\b|^i am\b|^true\b/i.test(o));
    if (yesMatch) return yesMatch;
  }
  if (targetValue.toLowerCase() === 'no' || targetValue === 'false') {
    const noMatch = options.find(o => /^no\b|^i am not\b|^false\b/i.test(o));
    if (noMatch) return noMatch;
  }

  // 4. Decline to self-identify heuristics for EEO
  if (/decline|prefer not|choose not/i.test(targetValue)) {
    const declineMatch = options.find(o => /decline|prefer not|choose not|do not wish/i.test(o));
    if (declineMatch) return declineMatch;
  }

  return null;
}

/**
 * Tier 1 pattern registry mapping standard labels and attributes to candidate profile values.
 */
const TIER1_PATTERNS: FieldPattern[] = [
  // 1. Resume / CV File upload
  {
    name: 'resume_file',
    regex: /\b(resume|cv|curriculum vitae|attach resume)\b/i,
    typeMatch: (f) => f.type === 'file',
    getValue: (p) => (p.resumeFileBase64 ? '__RESUME_FILE__' : undefined),
  },

  // 2. Name fields
  {
    name: 'first_name',
    regex: /\b(first(\s*|_)name|given(\s*|_)name|forename)\b/i,
    getValue: (p) => p.personal.firstName || (p.personal.fullName ? p.personal.fullName.split(' ')[0] : undefined),
  },
  {
    name: 'last_name',
    regex: /\b(last(\s*|_)name|family(\s*|_)name|surname)\b/i,
    getValue: (p) => p.personal.lastName || (p.personal.fullName ? p.personal.fullName.split(' ').slice(1).join(' ') : undefined),
  },
  {
    name: 'full_name',
    regex: /\b(full(\s*|_)name|your\s+name|applicant\s+name|candidate\s+name)\b/i,
    getValue: (p) => p.personal.fullName || `${p.personal.firstName || ''} ${p.personal.lastName || ''}`.trim(),
  },

  // 3. Contact fields
  {
    name: 'email',
    regex: /\b(e(\s*|-)mail|email\s*address)\b/i,
    getValue: (p) => p.personal.email,
  },
  {
    name: 'phone_country_code',
    regex: /\b(country\s*code|phone\s*code|calling\s*code)\b/i,
    getValue: (p) => p.personal.phoneCountryCode || '+1',
  },
  {
    name: 'phone',
    regex: /\b(phone|mobile|cell|telephone|contact\s*number)\b/i,
    getValue: (p) => p.personal.phone,
  },

  // 4. Address & Location
  {
    name: 'address',
    regex: /\b(street\s*address|address\s*line\s*1|street|address)\b/i,
    getValue: (p) => p.personal.address,
  },
  {
    name: 'city',
    regex: /\b(city|town|municipality)\b/i,
    getValue: (p) => p.personal.city,
  },
  {
    name: 'state',
    regex: /\b(state|province|region)\b/i,
    getValue: (p) => p.personal.state,
  },
  {
    name: 'zip_code',
    regex: /\b(zip\s*code|postal\s*code|zip|postcode)\b/i,
    getValue: (p) => p.personal.zipCode,
  },
  {
    name: 'country',
    regex: /\b(country|nation)\b/i,
    getValue: (p) => p.personal.country || 'United States',
  },

  // 5. Social & URLs
  {
    name: 'linkedin_url',
    regex: /\b(linkedin(\.com)?|linked\s*in(\s*profile|\s*url)?)\b/i,
    getValue: (p) => p.social?.linkedinUrl,
  },
  {
    name: 'github_url',
    regex: /\b(github(\.com)?|git\s*hub(\s*profile|\s*url)?)\b/i,
    getValue: (p) => p.social?.githubUrl,
  },
  {
    name: 'portfolio_website',
    regex: /\b(portfolio|personal\s*website|website|personal\s*url|web\s*site)\b/i,
    getValue: (p) => p.social?.portfolioUrl || p.social?.otherWebsiteUrl,
  },
  {
    name: 'twitter_url',
    regex: /\b(twitter|x\.com)\b/i,
    getValue: (p) => p.social?.twitterUrl,
  },

  // 6. Work Authorization & Sponsorship (Critical Nuance Polarity!)
  {
    name: 'authorized_to_work_us',
    regex: /\b(authorized|legally\s*authorized|eligible)\s*to\s*work\b/i,
    getValue: (p) => {
      const auth = p.screening?.authorizedToWorkInUS ?? true;
      return typeof auth === 'boolean' ? (auth ? 'Yes' : 'No') : String(auth);
    },
  },
  {
    name: 'require_sponsorship',
    regex: /\b(require|need|will\s*you\s*require|in\s*the\s*future\s*require)\s*.*(sponsorship|visa\s*sponsorship)\b/i,
    getValue: (p) => {
      const req = p.screening?.requireSponsorship ?? false;
      return typeof req === 'boolean' ? (req ? 'Yes' : 'No') : String(req);
    },
  },
  {
    name: 'visa_status',
    regex: /\b(visa\s*status|current\s*visa|immigration\s*status|work\s*authorization\s*type)\b/i,
    getValue: (p) => p.screening?.currentSponsorshipType || p.personal?.citizenshipStatus,
  },
  {
    name: 'security_clearance',
    regex: /\b(security\s*clearance|clearance\s*level)\b/i,
    getValue: (p) => p.screening?.securityClearanceLevel || 'None',
  },
  {
    name: 'willing_to_relocate',
    regex: /\b(willing\s*to\s*relocate|open\s*to\s*relocation|relocate\?)\b/i,
    getValue: (p) => {
      const rel = p.screening?.willingToRelocate ?? true;
      return typeof rel === 'boolean' ? (rel ? 'Yes' : 'No') : String(rel);
    },
  },
  {
    name: 'notice_period',
    regex: /\b(notice\s*period|how\s*soon\s*can\s*you\s*start|start\s*date|availability)\b/i,
    getValue: (p) => {
      const weeks = p.screening?.noticePeriodWeeks;
      return weeks ? `${weeks} weeks` : '2 weeks';
    },
  },
  {
    name: 'desired_salary',
    regex: /\b(desired\s*salary|expected\s*salary|salary\s*expectation|compensation\s*expectation)\b/i,
    getValue: (p) => (p.screening?.desiredSalaryUsd ? String(p.screening.desiredSalaryUsd) : undefined),
  },

  // 7. Experience & Education
  {
    name: 'total_years_experience',
    regex: /\b(years\s*of\s*experience|total\s*experience|how\s*many\s*years)\b/i,
    getValue: (p) => {
      if (p.workHistory && p.workHistory.length > 0) {
        const topExp = p.workHistory[0];
        if (topExp.totalYearsExperience !== undefined) {
          return String(topExp.totalYearsExperience);
        }
      }
      return '5'; // reasonable default if unspecified
    },
  },
  {
    name: 'current_employer',
    regex: /\b(current\s*company|current\s*employer|most\s*recent\s*company)\b/i,
    getValue: (p) => (p.workHistory && p.workHistory.length > 0 ? p.workHistory[0].companyName : undefined),
  },
  {
    name: 'current_job_title',
    regex: /\b(current\s*title|current\s*job\s*title|most\s*recent\s*title)\b/i,
    getValue: (p) => p.primaryTitle || (p.workHistory && p.workHistory.length > 0 ? p.workHistory[0].jobTitle : undefined),
  },
  {
    name: 'degree_level',
    regex: /\b(degree(\s*level)?|highest\s*level\s*of\s*education|education\s*level)\b/i,
    getValue: (p) => (p.education && p.education.length > 0 ? p.education[0].degreeLevel : "Bachelor's Degree"),
  },
  {
    name: 'major_field_study',
    regex: /\b(major|field\s*of\s*study|discipline)\b/i,
    getValue: (p) => (p.education && p.education.length > 0 ? p.education[0].major : 'Computer Science'),
  },
  {
    name: 'school_university',
    regex: /\b(school|university|college|institution)\b/i,
    getValue: (p) => (p.education && p.education.length > 0 ? p.education[0].schoolName : undefined),
  },

  // 8. EEO Demographics (Standard Safe Options or Preference)
  {
    name: 'eeo_gender',
    regex: /\b(gender|sex)\b/i,
    getValue: (p) => p.equalOpportunity?.eeoGender || p.personal.gender || 'Decline to self-identify',
  },
  {
    name: 'eeo_race',
    regex: /\b(race|ethnicity)\b/i,
    getValue: (p) => p.equalOpportunity?.eeoRace || p.personal.raceEthnicity || 'Decline to self-identify',
  },
  {
    name: 'eeo_veteran',
    regex: /\b(veteran\s*status|protected\s*veteran)\b/i,
    getValue: (p) => p.equalOpportunity?.eeoVeteran || 'I am not a protected veteran',
  },
  {
    name: 'eeo_disability',
    regex: /\b(disability(\s*status)?)\b/i,
    getValue: (p) => p.equalOpportunity?.eeoDisability || 'No, I do not have a disability',
  },
];

/**
 * Resolves a field using Tier 1 local heuristic matching against the candidate profile.
 */
export function resolveTier1Field(
  field: AutoFillExtractedField,
  profile: CandidateAutoFillProfile
): AutoFillFieldResult | null {
  const element = field.element;
  const labelInfo = element ? extractElementLabel(element) : { rawLabel: field.label, normalizedLabel: field.label.toLowerCase() };
  const targetLabel = `${labelInfo.normalizedLabel} ${field.name.toLowerCase()} ${field.placeholder?.toLowerCase() || ''}`;

  for (const pattern of TIER1_PATTERNS) {
    if (pattern.typeMatch && !pattern.typeMatch(field)) {
      continue;
    }

    if (pattern.regex.test(targetLabel)) {
      const rawValue = pattern.getValue(profile);
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }

      let finalValue = String(rawValue);

      // Handle Select / Option matching
      if (field.type === 'select' && field.options && field.options.length > 0) {
        const matchedOpt = matchOptionValue(field.options, finalValue);
        if (matchedOpt) {
          finalValue = matchedOpt;
        } else {
          // If option could not be matched, return null to allow Tier 2 AI to pick the closest choice
          continue;
        }
      }

      return {
        fieldId: field.id,
        elementIndex: field.elementIndex,
        value: finalValue,
        confidence: 0.95,
        tier: 'tier1',
        strategy: `tier1:${pattern.name}`,
      };
    }
  }

  return null;
}
