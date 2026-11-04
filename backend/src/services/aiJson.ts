/**
 * Reading JSON from a model's reply. JSON mode is usually clean, but replies can still come back wrapped
 * in ``` fences, with a sentence around them, or cut off when the model runs out of output tokens. One bad
 * character used to fail the whole page ("AI_AUTOFILL_FAILED: Invalid JSON returned by AI model.").
 */

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Complete `{...}` objects inside the array that follows `"key": [`, even if the reply stops halfway. */
export function salvageObjects(text: string, key: string): Record<string, unknown>[] {
  const start = text.search(new RegExp(`"${key}"\\s*:\\s*\\[`));
  if (start < 0) return [];
  const out: Record<string, unknown>[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  for (let i = text.indexOf('[', start) + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const obj = tryParse(text.slice(objStart, i + 1));
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) out.push(obj as Record<string, unknown>);
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return out;
}

/**
 * `{ [key]: [...] }` from a model reply, or null when nothing usable is in it.
 * `complete` is false when only some entries could be recovered (a cut-off reply).
 */
export function parseModelList(text: string, key: string): { items: Record<string, unknown>[]; complete: boolean } | null {
  const cleaned = String(text || '')
    .replace(/^﻿/, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  if (!cleaned) return null;

  const candidates: string[] = [cleaned];
  const first = cleaned.search(/[{[]/);
  const last = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  // Trailing commas: {"a": 1,} / [1,]
  candidates.push(...candidates.map((c) => c.replace(/,\s*([}\]])/g, '$1')));

  for (const c of candidates) {
    const parsed = tryParse(c);
    if (Array.isArray(parsed)) return { items: parsed.filter((x) => x && typeof x === 'object'), complete: true };
    if (parsed && typeof parsed === 'object') {
      const list = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(list)) return { items: list.filter((x) => x && typeof x === 'object') as Record<string, unknown>[], complete: true };
    }
  }

  const salvaged = salvageObjects(cleaned, key);
  return salvaged.length ? { items: salvaged, complete: false } : null;
}
