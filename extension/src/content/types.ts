export interface Candidate {
  id: string;
  fullName: string;
  primaryTitle: string;
  createdByRecruiterId?: string | null;
  recruiterName?: string | null;
  isSelected?: boolean;
}

export interface EvaluationResult {
  candidateId: string;
  candidateName: string;
  candidateTitle: string;
  verdict: 'APPLY' | 'SKIP';
  verdictJustification: string;
  jobTitle?: string;
  companyName?: string;
  eligibilityCheck: string;
  isEligible: boolean;
  matchAssessment: 'Strong Match' | 'Moderate Match' | 'Weak Match' | string;
  candidateFitCheck?: {
    alignedSkills: string[];
    gaps: string[];
  };
  naturalFitHighlights?: string[];
  applicationQuestions?: Array<{ question: string; answer: string }>;
  otherNotes?: string;

  // Compatibility / UI helper fields
  matchScore: number;
  reasoning: string;
  keyStrengths?: string[];
  missingCriticalSkills?: string[];
  strategicNotes?: string;
  matchTier?: string;
  evaluatedAt: string;
}

export interface StoredEvaluationState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'locked_402' | 'locked_device';
  result?: EvaluationResult;
  errorMessage?: string;
  selectedCandidateId?: string;
  scrapedJdText?: string;
  jobTitle?: string;
  companyOrClient?: string;
  jobUrl?: string;
  timestamp?: number;
}

// ==========================================
// SPEEDYAPPLY 7-PART AUTO-FILL PROFILE TYPES
// ==========================================

export interface PersonalInformation {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  phoneCountryCode?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  citizenshipStatus?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  gender?: string;
  raceEthnicity?: string;
}

export interface EducationItem {
  degreeLevel: string;
  major: string;
  schoolName: string;
  graduationYear?: string | number;
  gpa?: string | number;
}

export interface WorkExperienceItem {
  companyName: string;
  jobTitle: string;
  startDate?: string;
  endDate?: string;
  isCurrentRole?: boolean;
  description?: string;
  skillsUsed?: string[];
  totalYearsExperience?: number;
}

export interface SocialLinks {
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  twitterUrl?: string;
  otherWebsiteUrl?: string;
}

export interface EqualOpportunity {
  eeoGender?: string;
  eeoRace?: string;
  eeoVeteran?: string;
  eeoDisability?: string;
}

export interface ScreeningAuthorization {
  authorizedToWorkInUS?: boolean | string;
  requireSponsorship?: boolean | string;
  currentSponsorshipType?: string;
  securityClearanceLevel?: string;
  willingToRelocate?: boolean | string;
  willingToTravelPercentage?: string | number;
  noticePeriodWeeks?: string | number;
  desiredSalaryUsd?: string | number;
  currentSalaryUsd?: string | number;
}

export interface ApplicationQuestions {
  customAnswers?: Record<string, string>;
  summaryBio?: string;
}

export interface SavedResponseItem {
  id?: string;
  questionPattern: string;
  answer: string;
  matchType?: 'exact' | 'regex' | 'semantic';
  category?: string;
  updatedAt?: string;
}

export interface CandidateAutoFillProfile {
  id: string;
  fullName: string;
  primaryTitle?: string;
  personal: PersonalInformation;
  education?: EducationItem[];
  workHistory?: WorkExperienceItem[];
  social?: SocialLinks;
  equalOpportunity?: EqualOpportunity;
  screening?: ScreeningAuthorization;
  applicationQuestions?: ApplicationQuestions;
  savedResponses?: SavedResponseItem[];
  resumeFileBase64?: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  rawResumeText?: string;
  customFields?: Record<string, any>;
}

// ==========================================
// FORM DETECTION & RESOLUTION ENGINE TYPES
// ==========================================

export type AutoFillFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'combobox';

export interface AutoFillExtractedField {
  id: string;
  elementIndex: number;
  name: string;
  label: string;
  type: AutoFillFieldType;
  options?: string[];
  placeholder?: string;
  isRequired?: boolean;
  currentValue?: string;
  selector?: string;
  element?: HTMLElement;
}

export interface AutoFillFieldResult {
  fieldId: string;
  elementIndex: number;
  value: string;
  confidence: number; // 0.0 to 1.0
  tier: 'tier1' | 'saved_response' | 'tier2';
  strategy: string;
}

export interface AutoFillResolveRequest {
  candidateId: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  unresolvedFields: Array<{
    id: string;
    elementIndex: number;
    name: string;
    label: string;
    type: AutoFillFieldType;
    options?: string[];
    placeholder?: string;
    isRequired?: boolean;
    currentValue?: string;
  }>;
}

export interface AutoFillResolveResponse {
  resolvedFields: Array<{
    fieldId: string;
    elementIndex: number;
    value: string;
    confidence: number;
    reasoning?: string;
  }>;
}

export interface AutoFillRunStats {
  totalFields: number;
  tier1Filled: number;
  savedFilled: number;
  tier2Filled: number;
  unfilled: number;
  startTime: number;
  durationMs: number;
}
