import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';
import { TokenUsage } from './billingService.js';

export interface EvaluationVerdict {
  verdict: 'APPLY' | 'SKIP';
  verdictJustification: string;
  jobTitle?: string;
  companyName?: string;
  eligibilityCheck: string;
  isEligible: boolean;
  matchAssessment: 'Strong Match' | 'Moderate Match' | 'Weak Match' | string;
  candidateFitCheck: {
    alignedSkills: string[];
    gaps: string[];
  };
  naturalFitHighlights: string[];
  applicationQuestions: Array<{ question: string; answer: string }>;
  otherNotes?: string;

  // Compatibility fields
  matchScore: number;
  reasoning: string;
  keyStrengths: string[];
  missingCriticalSkills: string[];
  visaMatch: boolean;
  clearanceMatch: boolean;
  workPrefMatch: boolean;
  strategicNotes?: string;
}

export interface GeminiEvaluationResponse {
  result: EvaluationVerdict;
  usage: TokenUsage;
}

export class GeminiService {
  private static aiClient: GoogleGenAI | null = null;

  private static getClient(): GoogleGenAI | null {
    if (!this.aiClient && env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
      this.aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return this.aiClient;
  }

  static async evaluate(prompt: string): Promise<GeminiEvaluationResponse> {
    const startTime = Date.now();
    const client = this.getClient();

    // If API key is provided, execute real call via @google/genai
    if (client) {
      const candidateModels = [
        env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.5-flash',
      ];

      let finalPrompt = prompt;
      if (!prompt.includes('"jobTitle"') && !prompt.includes('"candidateFitCheck"')) {
        finalPrompt += `\n\nCRITICAL JSON INSTRUCTION:
You MUST respond strictly with valid, unescaped JSON matching this schema exactly (do not output any conversational text or markdown ticks):
{
  "jobTitle": "Extracted or inferred Job Title from the JD (or 'Not Specified')",
  "companyName": "Extracted Company or Client name from the JD (or 'Confidential / Client')",
  "eligibilityCheck": "String: e.g. 'No auto-skip triggers.' or 'No-Go — US Citizenship required'",
  "isEligible": true,
  "matchAssessment": "Strong Match" | "Moderate Match" | "Weak Match",
  "candidateFitCheck": {
    "alignedSkills": ["skill 1", "skill 2"],
    "gaps": ["gap 1", "gap 2"]
  },
  "verdict": "Apply" | "Skip",
  "verdictJustification": "One-line concise justification",
  "naturalFitHighlights": ["highlight 1", "highlight 2"],
  "applicationQuestions": [
    { "question": "...", "answer": "..." }
  ],
  "otherNotes": "1-2 lines quick tips / red flags / strategic notes"
}`;
      }

      for (const modelName of candidateModels) {
        try {
          const response = await client.models.generateContent({
            model: modelName,
            contents: finalPrompt,
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          });

          const latencyMs = Date.now() - startTime;
          const rawText = response.text || '{}';
          const cleanedText = rawText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          const parsed = JSON.parse(cleanedText);

          // Extract or estimate tokens from metadata
          const inputTokens = response.usageMetadata?.promptTokenCount || Math.ceil(finalPrompt.length / 4);
          const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.ceil(cleanedText.length / 4);

          const rawVerdict = (parsed.verdict || parsed.go_no_go_decision || parsed.decision || '').toString().trim();
          const isApply = rawVerdict.toUpperCase().includes('APPLY') || (rawVerdict.toLowerCase().startsWith('go') && !rawVerdict.toLowerCase().includes('no-go'));
          const verdict: 'APPLY' | 'SKIP' = isApply ? 'APPLY' : 'SKIP';

          const matchAssessment = parsed.matchAssessment || parsed.profile_match_assessment || parsed.match_assessment || (isApply ? 'Strong Match' : 'Weak Match');
          let calculatedScore = 50;
          if (matchAssessment.toLowerCase().includes('strong')) calculatedScore = 90;
          else if (matchAssessment.toLowerCase().includes('moderate')) calculatedScore = 70;
          else calculatedScore = 40;

          const eligibilityCheck = parsed.eligibilityCheck || parsed.eligibility_check || parsed.eligibility || (isApply ? 'No auto-skip triggers detected. Meets standard bench eligibility.' : 'No-Go Flagged: Requirement barrier detected.');
          const isEligible = typeof parsed.isEligible === 'boolean'
            ? parsed.isEligible
            : typeof parsed.is_eligible === 'boolean'
            ? parsed.is_eligible
            : !eligibilityCheck.toLowerCase().includes('no-go') && isApply;

          let alignedSkills: string[] = [];
          let gaps: string[] = [];

          if (parsed.candidateFitCheck && typeof parsed.candidateFitCheck === 'object') {
            if (Array.isArray(parsed.candidateFitCheck.alignedSkills)) alignedSkills = parsed.candidateFitCheck.alignedSkills;
            else if (Array.isArray(parsed.candidateFitCheck.aligned_skills)) alignedSkills = parsed.candidateFitCheck.aligned_skills;

            if (Array.isArray(parsed.candidateFitCheck.gaps)) gaps = parsed.candidateFitCheck.gaps;
            else if (Array.isArray(parsed.candidateFitCheck.missing_skills)) gaps = parsed.candidateFitCheck.missing_skills;
          } else if (Array.isArray(parsed.keyStrengths)) {
            alignedSkills = parsed.keyStrengths;
          } else if (typeof parsed.candidate_fit_check === 'string') {
            alignedSkills = [parsed.candidate_fit_check];
          }

          if (Array.isArray(parsed.missingCriticalSkills) && gaps.length === 0) {
            gaps = parsed.missingCriticalSkills;
          }

          const naturalHighlights = Array.isArray(parsed.naturalFitHighlights)
            ? parsed.naturalFitHighlights
            : Array.isArray(parsed.natural_fit_highlights)
            ? parsed.natural_fit_highlights
            : alignedSkills;

          const justification = parsed.verdictJustification || parsed.verdict_justification || parsed.reasoning || (isApply ? 'Strong natural fit' : 'Candidate does not meet core requirements');

          let jobTitle = parsed.jobTitle || parsed.job_title;
          if (!jobTitle || jobTitle === 'Not Specified' || jobTitle === 'Job Application' || jobTitle === 'Opportunity') {
            const titleMatch = prompt.match(/(?:title|role|position|seeking a|hiring a)\s*[:\-]?\s*([^\n\r,\.]{3,50})/i);
            jobTitle = titleMatch ? titleMatch[1].trim() : 'Software Opportunity';
          }

          let companyName = parsed.companyName || parsed.company_name;
          if (!companyName || companyName === 'Confidential / Client' || companyName === 'Client' || companyName === 'Direct Client / Vendor') {
            const compMatch = prompt.match(/(?:company|client|organization|at|with)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&]{2,35})/);
            companyName = compMatch ? compMatch[1].trim() : 'Confidential / Client';
          }

          const applicationQuestions = Array.isArray(parsed.applicationQuestions)
            ? parsed.applicationQuestions
            : Array.isArray(parsed.application_questions)
            ? parsed.application_questions
            : [];

          const otherNotes = parsed.otherNotes || parsed.other_notes || '';

          return {
            result: {
              verdict,
              verdictJustification: justification,
              jobTitle,
              companyName,
              eligibilityCheck,
              isEligible,
              matchAssessment,
              candidateFitCheck: {
                alignedSkills,
                gaps,
              },
              naturalFitHighlights: naturalHighlights,
              applicationQuestions,
              otherNotes,
              matchScore: Number(parsed.matchScore) || calculatedScore,
              reasoning: justification,
              keyStrengths: alignedSkills,
              missingCriticalSkills: gaps,
              visaMatch: !justification.toLowerCase().includes('visa') && !justification.toLowerCase().includes('citizenship'),
              clearanceMatch: !justification.toLowerCase().includes('clearance'),
              workPrefMatch: true,
            },
            usage: {
              inputTokens,
              outputTokens,
              latencyMs,
              modelName,
              isSimulated: false,
            },
          };
        } catch (mErr: any) {
          console.warn(`Model ${modelName} evaluation attempt failed: ${mErr.message?.substring(0, 100)}. Trying fallback...`);
        }
      }
    }

    // Heuristic Simulation Fallback for development / offline environments
    return this.simulateEvaluation(prompt, startTime);
  }

  /**
   * Deterministic evaluation simulation when running offline or without Gemini API key
   */
  private static simulateEvaluation(prompt: string, startTime: number): GeminiEvaluationResponse {
    const latencyMs = Math.max(120, Date.now() - startTime + Math.floor(Math.random() * 200 + 150));
    const inputTokens = Math.ceil(prompt.length / 4);
    
    const lowerPrompt = prompt.toLowerCase();
    const isCitizenOnly = lowerPrompt.includes('us citizen only') || lowerPrompt.includes('usc only') || lowerPrompt.includes('clearance required');
    const isCandidateH1B = lowerPrompt.includes('h-1b') || lowerPrompt.includes('h1b') || lowerPrompt.includes('opt');
    
    let verdict: 'APPLY' | 'SKIP' = 'APPLY';
    let matchScore = 88;
    let isEligible = true;
    let eligibilityCheck = 'No auto-skip triggers. Candidate meets baseline criteria.';
    let matchAssessment = 'Strong Match';
    let verdictJustification = 'Candidate profile strongly aligns with required tech stack and experience level.';
    
    const alignedSkills = [
      'Core technical stack and programming languages alignment',
      'Demonstrated relevant project delivery and production scale experience',
      'System architecture, APIs, and cloud services proficiency',
    ];
    const gaps: string[] = [];
    const naturalFitHighlights = [
      'Extensive hands-on experience directly overlapping with primary JD requirements',
      'Proven background in similar domain and engineering workflows',
    ];
    let otherNotes = "Highlight candidate's rapid delivery and strong technical background.";

    if (isCitizenOnly && isCandidateH1B) {
      verdict = 'SKIP';
      matchScore = 35;
      isEligible = false;
      eligibilityCheck = 'No-Go — US Citizenship or Clearance required by client.';
      matchAssessment = 'Weak Match';
      verdictJustification = 'Clearance/Citizenship requirements conflict with candidate profile.';
      gaps.push(
        'US Citizenship / Active Clearance requirement not met',
        'Seniority and specialized clearance level mismatch'
      );
      otherNotes = 'Flagged auto-skip trigger: US Citizen or Security Clearance required.';
    }

    const outputTokens = 180;

    return {
      result: {
        verdict,
        verdictJustification,
        jobTitle: 'Software Engineer',
        companyName: 'Client Enterprise',
        eligibilityCheck,
        isEligible,
        matchAssessment,
        candidateFitCheck: {
          alignedSkills,
          gaps,
        },
        naturalFitHighlights,
        applicationQuestions: [],
        otherNotes,
        matchScore,
        reasoning: verdictJustification,
        keyStrengths: alignedSkills,
        missingCriticalSkills: gaps,
        visaMatch: isEligible,
        clearanceMatch: isEligible,
        workPrefMatch: true,
      },
      usage: {
        inputTokens,
        outputTokens,
        latencyMs,
        modelName: 'gemini-2.5-flash',
        isSimulated: true,
      },
    };
  }
}
