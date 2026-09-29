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

  private static getClient(): GoogleGenAI {
    const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : '';
    if (!apiKey) {
      throw new Error('AI API key is not configured. Please set the AI key in the server environment.');
    }
    if (!this.aiClient) {
      this.aiClient = new GoogleGenAI({ apiKey });
    }
    return this.aiClient;
  }

  /**
   * Strictly uses gemini-3.5-flash-lite as requested.
   * Does NOT fall back to simulation or placeholders under any circumstance.
   */
  static async evaluate(prompt: string): Promise<GeminiEvaluationResponse> {
    const startTime = Date.now();
    const client = this.getClient();
    const modelName = 'gemini-3.5-flash-lite';

    let finalPrompt = prompt;
    if (!prompt.includes('"jobTitle"') && !prompt.includes('"candidateFitCheck"') && !prompt.includes('CRITICAL JSON INSTRUCTION')) {
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

    let rawText = '';
    let usageMetadata: any = null;

    try {
      const config: any = {
        temperature: 0.1,
      };

      if (finalPrompt.includes('CRITICAL JSON INSTRUCTION') || finalPrompt.includes('"jobTitle"')) {
        config.responseMimeType = 'application/json';
      }

      const response = await client.models.generateContent({
        model: modelName,
        contents: finalPrompt,
        config,
      });

      rawText = response.text || '';
      usageMetadata = response.usageMetadata;
    } catch (err: any) {
      console.error(`[GeminiService] AI evaluation error:`, err);
      throw new Error(`AI_EVALUATION_FAILED: ${err.message || 'AI service call failed'}`);
    }

    if (!rawText.trim()) {
      throw new Error('AI_EVALUATION_FAILED: Empty response received from AI engine.');
    }

    const latencyMs = Date.now() - startTime;
    const inputTokens = usageMetadata?.promptTokenCount || Math.ceil(finalPrompt.length / 4);
    const outputTokens = usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4);

    // Dual Parser: Supports JSON and the 7-section Markdown format from Gemini
    const result = this.parseEvaluationOutput(rawText, prompt);

    return {
      result,
      usage: {
        inputTokens,
        outputTokens,
        latencyMs,
        modelName,
        isSimulated: false,
      },
    };
  }

  /**
   * Parses AI output, handling both structured JSON and markdown-formatted output.
   */
  private static parseEvaluationOutput(rawText: string, prompt: string): EvaluationVerdict {
    const cleanedText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // 1. Attempt JSON parsing
    try {
      const parsed = JSON.parse(cleanedText);
      if (parsed && typeof parsed === 'object') {
        return this.mapParsedJson(parsed, prompt);
      }
    } catch (_jsonErr) {
      // Continue to markdown parsing
    }

    // 2. Fallback: Parse 7-section Markdown format
    try {
      return this.parseMarkdownEvaluation(rawText, prompt);
    } catch (mdErr: any) {
      console.error('[GeminiService] Failed to parse evaluation output:', mdErr, rawText);
      throw new Error(`AI_PARSING_FAILED: Could not parse evaluation from AI engine.`);
    }
  }

  private static mapParsedJson(parsed: any, prompt: string): EvaluationVerdict {
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
      jobTitle = titleMatch ? titleMatch[1].trim() : 'Opportunity';
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
      strategicNotes: otherNotes,
    };
  }

  /**
   * Parses the 7-section Markdown format:
   * **1. Eligibility Check**
   * **2. Profile Match Assessment**
   * **3. Candidate Fit Check**
   * **4. Go / No-Go Decision**
   * **5. Natural Fit Highlights**
   * **6. Application Questions**
   * **7. Other Notes**
   */
  private static parseMarkdownEvaluation(text: string, prompt: string): EvaluationVerdict {
    // 1. Eligibility Check
    const eligMatch = text.match(/\*\*\s*1\.\s*Eligibility Check\s*\*\*\s*([\s\S]*?)(?=\*\*\s*2\.|\n\s*2\.|\n\s*#|$)/i);
    const eligibilityCheck = eligMatch ? eligMatch[1].trim() : '';
    const isEligible = /^pass/i.test(eligibilityCheck) || (!/fail|no-go|flagged/i.test(eligibilityCheck) && eligibilityCheck.length > 0);

    // 2. Profile Match Assessment
    const matchMatch = text.match(/\*\*\s*2\.\s*Profile Match Assessment\s*\*\*\s*([\s\S]*?)(?=\*\*\s*3\.|\n\s*3\.|\n\s*#|$)/i);
    let matchAssessment = 'Moderate Match';
    if (matchMatch) {
      const rawMatch = matchMatch[1].replace(/\*/g, '').trim();
      if (/strong/i.test(rawMatch)) matchAssessment = 'Strong Match';
      else if (/weak/i.test(rawMatch)) matchAssessment = 'Weak Match';
      else if (/moderate/i.test(rawMatch)) matchAssessment = 'Moderate Match';
      else if (rawMatch.length > 0) matchAssessment = rawMatch;
    }

    let matchScore = 70;
    if (matchAssessment.toLowerCase().includes('strong')) matchScore = 90;
    else if (matchAssessment.toLowerCase().includes('weak')) matchScore = 40;

    // 3. Candidate Fit Check
    const fitMatch = text.match(/\*\*\s*3\.\s*Candidate Fit Check\s*\*\*\s*([\s\S]*?)(?=\*\*\s*4\.|\n\s*4\.|\n\s*#|$)/i);
    const fitText = fitMatch ? fitMatch[1].trim() : '';

    let alignedSkills: string[] = [];
    const alignsMatch = fitText.match(/(?:[-*•]\s*)?\*\*Aligns:?\*\*\s*([^\n\r]+(?:\n(?![*-•]\s*\*\*)[^\n\r]+)*)/i);
    if (alignsMatch) {
      alignedSkills = alignsMatch[1]
        .split(/,\s*(?![^(]*\))|;\s*|\n[-*•]\s*/g)
        .map((s) => s.trim().replace(/^[-*•]\s*/, '').replace(/\.$/, ''))
        .filter((s) => s.length > 1);
    }

    let gaps: string[] = [];
    const gapsMatch = fitText.match(/(?:[-*•]\s*)?\*\*Gaps:?\*\*\s*([^\n\r]+(?:\n(?![*-•]\s*\*\*)[^\n\r]+)*)/i);
    if (gapsMatch) {
      const rawGaps = gapsMatch[1].trim();
      if (rawGaps.includes('\n-') || rawGaps.includes('\n*') || rawGaps.includes('\n•')) {
        gaps = rawGaps.split(/\n[-*•]\s*/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
      } else {
        gaps = rawGaps.split(/\.\s+(?=[A-Z0-9])/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
      }
    }

    let profileSkew = '';
    const skewMatch = fitText.match(/(?:[-*•]\s*)?\*\*Profile skew:?\*\*\s*([^\n\r]+)/i);
    if (skewMatch) {
      profileSkew = skewMatch[1].trim();
    }

    // 4. Go / No-Go Decision
    const decMatch = text.match(/\*\*\s*4\.\s*Go\s*\/?\s*No-Go Decision\s*\*\*\s*([\s\S]*?)(?=\*\*\s*5\.|\n\s*5\.|\n\s*#|$)/i);
    const decText = decMatch ? decMatch[1].trim() : '';
    const firstLine = decText.split('\n')[0];
    const isApply = /apply/i.test(firstLine) && !/skip|no-go/i.test(firstLine);
    const verdict: 'APPLY' | 'SKIP' = isApply ? 'APPLY' : 'SKIP';
    let verdictJustification = decText
      .replace(/^\*?\*?(?:apply|skip|go|no-go)\.?\*?\*?\s*/i, '')
      .replace(/^[-:—]\s*/, '')
      .trim();
    if (!verdictJustification) {
      verdictJustification = isApply ? 'Strong natural fit' : 'Candidate profile does not align with requirements';
    }

    // 5. Natural Fit Highlights
    const hlMatch = text.match(/\*\*\s*5\.\s*Natural Fit Highlights\s*(?:\([^)]*\))?\s*\*\*\s*([\s\S]*?)(?=\*\*\s*6\.|\n\s*6\.|\n\s*#|$)/i);
    let naturalFitHighlights: string[] = [];
    if (hlMatch) {
      naturalFitHighlights = hlMatch[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('-') || l.startsWith('*') || l.startsWith('•') || l.startsWith('✦'))
        .map((l) => l.replace(/^[-*•✦]\s*/, '').trim())
        .filter(Boolean);
    }

    // 6. Application Questions
    const qaMatch = text.match(/\*\*\s*6\.\s*Application Questions\s*(?:\([^)]*\))?\s*\*\*\s*([\s\S]*?)(?=\*\*\s*7\.|\n\s*7\.|\n\s*#|$)/i);
    const applicationQuestions: Array<{ question: string; answer: string }> = [];
    if (qaMatch && !qaMatch[1].toLowerCase().includes('none provided') && !qaMatch[1].toLowerCase().includes('none')) {
      const lines = qaMatch[1].split('\n').filter(Boolean);
      let curQ = '';
      let curA = '';
      for (const line of lines) {
        if (/^Q:|^Question:/i.test(line)) {
          if (curQ && curA) applicationQuestions.push({ question: curQ, answer: curA });
          curQ = line.replace(/^Q:\s*|^Question:\s*/i, '').trim();
          curA = '';
        } else if (/^A:|^Answer:/i.test(line)) {
          curA = line.replace(/^A:\s*|^Answer:\s*/i, '').trim();
        }
      }
      if (curQ && curA) applicationQuestions.push({ question: curQ, answer: curA });
    }

    // 7. Other Notes
    const notesMatch = text.match(/\*\*\s*7\.\s*Other Notes\s*\*\*\s*([\s\S]*?)(?=$|\n\s*#)/i);
    let otherNotes = notesMatch ? notesMatch[1].trim() : '';
    if (profileSkew) {
      otherNotes = otherNotes ? `Profile Note: ${profileSkew}\n\n${otherNotes}` : `Profile Note: ${profileSkew}`;
    }

    // Extract Job Title & Company Name if possible
    let jobTitle = 'Opportunity';
    const titleMatch = prompt.match(/(?:title|role|position|seeking a|hiring a)\s*[:\-]?\s*([^\n\r,\.]{3,50})/i);
    if (titleMatch) jobTitle = titleMatch[1].trim();

    let companyName = 'Confidential / Client';
    const compMatch = prompt.match(/(?:company|client|organization|at|with)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&]{2,35})/);
    if (compMatch) companyName = compMatch[1].trim();

    return {
      verdict,
      verdictJustification,
      jobTitle,
      companyName,
      eligibilityCheck,
      isEligible,
      matchAssessment,
      candidateFitCheck: {
        alignedSkills,
        gaps,
      },
      naturalFitHighlights,
      applicationQuestions,
      otherNotes,
      matchScore,
      reasoning: verdictJustification,
      keyStrengths: alignedSkills,
      missingCriticalSkills: gaps,
      visaMatch: isEligible,
      clearanceMatch: isEligible,
      workPrefMatch: true,
      strategicNotes: otherNotes,
    };
  }
}
