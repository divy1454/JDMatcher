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
  /** Key used by the recruiter portal form (same meaning as otherWebsiteUrl). */
  otherUrl?: string;
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
  /** Key used by the recruiter portal form (same meaning as desiredSalaryUsd). */
  desiredSalary?: string | number;
  currentSalaryUsd?: string | number;
  /** Screening keys the backend filled with a default because the profile had no value. */
  assumed?: string[];
}

export interface ApplicationQuestions {
  customAnswers?: Record<string, string>;
  summaryBio?: string;
}

export interface SavedResponseItem {
  id?: string;
  questionPattern: string;
  question?: string;
  answer: string;
  matchType?: 'exact' | 'regex' | 'semantic' | 'keyword';
  category?: string;
  /** 'confirmed' = answer the recruiter actually submitted, 'ai' = unconfirmed AI suggestion. */
  source?: 'manual' | 'confirmed' | 'ai';
  updatedAt?: string;
}

export interface CandidateAutoFillProfile {
  id: string;
  fullName: string;
  primaryTitle?: string;
  /** Total professional experience in years, when known. */
  totalYearsExperience?: number;
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

export type AutoFillFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'combobox'
  /** One question answered by picking one radio button (native or ARIA). */
  | 'radio_group'
  /** One question answered by ticking one or more checkboxes. */
  | 'checkbox_group'
  /** A button that opens a listbox (Workday "Select One" dropdowns). */
  | 'dropdown_button';

export interface AutoFillOptionElement {
  label: string;
  element: HTMLElement;
}

export interface AutoFillExtractedField {
  id: string;
  elementIndex: number;
  name: string;
  /** The question text shown to the user (for groups: the group question, never an option label). */
  label: string;
  question?: string;
  type: AutoFillFieldType;
  options?: string[];
  placeholder?: string;
  isRequired?: boolean;
  currentValue?: string;
  selector?: string;
  /** Primary element (first radio of a group, the select, the input, the dropdown button). */
  element?: HTMLElement;
  /** Element to highlight for the whole question (fieldset/container for groups). */
  container?: HTMLElement;
  /** For radio/checkbox groups: each option with its element. */
  optionElements?: AutoFillOptionElement[];
  /** True when the widget uses ARIA roles instead of native inputs. */
  isAria?: boolean;
  /** HTML input type for text-like inputs (email, tel, number, date, url...). */
  inputType?: string;
  maxLength?: number;
  autocomplete?: string;
}

export interface AutoFillFieldResult {
  fieldId: string;
  elementIndex: number;
  value: string;
  /** For multi-select checkbox groups. */
  values?: string[];
  confidence: number; // 0.0 to 1.0
  tier: 'tier1' | 'saved_response' | 'tier2';
  strategy: string;
  /** Fill it (if value is set) but ask the recruiter to look at it. */
  needsReview?: boolean;
  reason?: string;
  /** Leave the field alone on purpose (e.g. marketing opt-ins, address line 2). */
  skip?: boolean;
  /** Do not escalate this field to the next tier (e.g. conflicting profile data). */
  final?: boolean;
}

export interface AutoFillResolveFieldPayload {
  id: string;
  elementIndex: number;
  name: string;
  label: string;
  question?: string;
  type: string;
  options?: string[];
  placeholder?: string;
  isRequired?: boolean;
  currentValue?: string;
  maxLength?: number;
}

export interface AutoFillResolveRequest {
  candidateId: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  unresolvedFields: AutoFillResolveFieldPayload[];
}

export interface AutoFillResolveResponse {
  resolvedFields: Array<{
    fieldId: string;
    elementIndex: number;
    value: string;
    values?: string[];
    confidence: number | string;
    needsReview?: boolean;
    reasoning?: string;
  }>;
}

export interface AutoFillRunStats {
  totalFields: number;
  tier1Filled: number;
  savedFilled: number;
  tier2Filled: number;
  unfilled: number;
  /** Answers filled or left blank that the recruiter should look at. */
  flagged?: number;
  startTime: number;
  durationMs: number;
}

export interface AutoFillReviewItem {
  question: string;
  reason: string;
  element?: HTMLElement;
}
