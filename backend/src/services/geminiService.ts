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

      for (const modelName of candidateModels) {
        try {
          const response = await client.models.generateContent({
            model: modelName,
            contents: prompt,
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
          const inputTokens = response.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
          const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.ceil(cleanedText.length / 4);

          const isApply = parsed.verdict?.toString().trim().toUpperCase() === 'APPLY';
          const verdict: 'APPLY' | 'SKIP' = isApply ? 'APPLY' : 'SKIP';

          const matchAssessment = parsed.matchAssessment || (isApply ? 'Strong Match' : 'Weak Match');
          let calculatedScore = 50;
          if (matchAssessment.toLowerCase().includes('strong')) calculatedScore = 90;
          else if (matchAssessment.toLowerCase().includes('moderate')) calculatedScore = 70;
          else calculatedScore = 40;

          const alignedSkills = Array.isArray(parsed.candidateFitCheck?.alignedSkills)
            ? parsed.candidateFitCheck.alignedSkills
            : Array.isArray(parsed.keyStrengths)
            ? parsed.keyStrengths
            : [];

          const gaps = Array.isArray(parsed.candidateFitCheck?.gaps)
            ? parsed.candidateFitCheck.gaps
            : Array.isArray(parsed.missingCriticalSkills)
            ? parsed.missingCriticalSkills
            : [];

          const naturalHighlights = Array.isArray(parsed.naturalFitHighlights)
            ? parsed.naturalFitHighlights
            : alignedSkills;

          const justification = parsed.verdictJustification || parsed.reasoning || (isApply ? 'Strong natural fit' : 'Candidate does not meet core requirements');

          return {
            result: {
              verdict,
              verdictJustification: justification,
              jobTitle: parsed.jobTitle || 'Opportunity',
              companyName: parsed.companyName || 'Client',
              eligibilityCheck: parsed.eligibilityCheck || (isApply ? 'No auto-skip triggers.' : 'Eligibility mismatch detected.'),
              isEligible: typeof parsed.isEligible === 'boolean' ? parsed.isEligible : isApply,
              matchAssessment,
              candidateFitCheck: {
                alignedSkills,
                gaps,
              },
              naturalFitHighlights: naturalHighlights,
              applicationQuestions: Array.isArray(parsed.applicationQuestions) ? parsed.applicationQuestions : [],
              otherNotes: parsed.otherNotes || '',
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
