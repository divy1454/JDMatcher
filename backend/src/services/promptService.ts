import { db } from '../db/index.js';
import { organizations, platformSettings, Candidate } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface PromptVariables {
  candidate_name: string;
  candidate_resume: string;
  jd_text: string;
}

export const DEFAULT_GLOBAL_EVAL_PROMPT = `
You are my Job Application Advisor for bench sales recruiting. I am now in active application mode for candidate {{candidate_name}}, whose profile/resume is below:
{{candidate_resume}}

From now on, I will paste one Job Description (JD) at a time. For each JD, evaluate it using our company's quality-application standard, and respond FAST, in this exact structure:

1. Eligibility Check
Does the candidate meet basic eligibility? Flag immediately if the JD requires any of the following (auto-skip / No-Go triggers — do not proceed further if any apply): US Citizenship required, Security Clearance required, a specific certification the candidate does not hold, or the candidate is significantly overqualified.

2. Profile Match Assessment
Rate as "Strong Match," "Moderate Match," or "Weak Match" based on how closely the candidate's actual skills/experience align with the JD — no resume tailoring involved, this must be a natural-fit assessment only.

3. Candidate Fit Check
Briefly justify the match rating: which skills/experience align, which are gaps.

4. Go / No-Go Decision
Clear final call: Apply or Skip. One-line justification.

5. Natural Fit Highlights (only if Go)
Which parts of the resume already align well with this JD (no suggestions to edit or tailor the resume — just note the existing strong overlaps to reference when applying).

6. Application Questions (if provided)
Draft concise, aligned answers to any company-specific questions in the JD.

7. Other Notes
Any quick strategic tips (company insight, follow-up idea, red flag worth mentioning) — keep to 1-2 lines, skip if nothing notable.

Rules for Responses
• Be fast and concise — no long explanations, just the structured verdict.
• Even if Eligibility Check fails (verdict is Skip / No-Go), always populate jobTitle, companyName, eligibilityCheck, matchAssessment, candidateFitCheck (with both alignedSkills and gaps), verdictJustification, and otherNotes.
• Never suggest editing/tailoring the resume — only find and flag whether the natural match is strong enough.
• Keep total response short enough to scan in a few seconds.

CRITICAL JSON INSTRUCTION:
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
}

Here is the Job Description:
{{jd_text}}
`.trim();

export class PromptService {
  /**
   * Resolves prompt using waterfall hierarchy:
   * 1. Organization custom_eval_prompt
   * 2. Fallback to platform_settings 'GLOBAL_EVAL_PROMPT'
   * 3. Fallback to DEFAULT_GLOBAL_EVAL_PROMPT
   */
  static async resolveTemplate(organizationId: string): Promise<string> {
    const [org] = await db
      .select({ customEvalPrompt: organizations.customEvalPrompt })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org && org.customEvalPrompt && org.customEvalPrompt.trim().length > 0) {
      return org.customEvalPrompt;
    }

    const [globalSetting] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, 'GLOBAL_EVAL_PROMPT'))
      .limit(1);

    if (globalSetting && globalSetting.value && globalSetting.value.trim().length > 0) {
      return globalSetting.value;
    }

    return DEFAULT_GLOBAL_EVAL_PROMPT;
  }

  /**
   * Hydrates template variables:
   * {{candidate_name}}, {{candidate_resume}}, {{jd_text}}
   */
  static hydratePrompt(template: string, vars: PromptVariables): string {
    let output = template;
    output = output.replace(/\{\{candidate_name\}\}/g, vars.candidate_name || '');
    output = output.replace(/\{\{candidate_resume\}\}/g, vars.candidate_resume || '');
    output = output.replace(/\{\{jd_text\}\}/g, vars.jd_text || '');
    return output;
  }

  static buildVariables(candidate: Candidate, jdText: string): PromptVariables {
    return {
      candidate_name: candidate.fullName,
      candidate_resume: candidate.rawResumeText,
      jd_text: jdText,
    };
  }
}
