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
