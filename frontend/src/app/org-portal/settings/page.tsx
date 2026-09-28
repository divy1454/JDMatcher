'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { Sliders, Save, Sparkles, Check, RotateCcw, Info } from 'lucide-react';

const VARIABLE_TOKENS = [
  '{{candidate_name}}',
  '{{candidate_title}}',
  '{{visa_status}}',
  '{{clearance}}',
  '{{work_preference}}',
  '{{candidate_resume}}',
  '{{jd_text}}',
];

export default function OrgEvaluationSettingsPage() {
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [fallbackPrompt, setFallbackPrompt] = useState<string>('');
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchPromptSettings = async () => {
    try {
      const data = await apiRequest('/prompt-settings/org');
      setFallbackPrompt(data.fallbackPrompt);
      if (data.customEvalPrompt) {
        setCustomPrompt(data.customEvalPrompt);
        setUseCustom(true);
      } else {
        setCustomPrompt(data.fallbackPrompt);
        setUseCustom(false);
      }
    } catch (err) {
      console.error('Failed to load org prompt settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPromptSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await apiRequest('/prompt-settings/org', {
        method: 'PUT',
        body: JSON.stringify({
          customEvalPrompt: useCustom ? customPrompt : null,
        }),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const insertToken = (token: string) => {
    setCustomPrompt((prev) => prev + `\n${token}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Evaluation Prompt Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Tailor the Gemini 3.8 Flash evaluation instructions to align with your agency's client contracts and placement standards.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
        >
          {saveSuccess ? (
            <>
              <Check className="h-4 w-4 text-emerald-300" />
              <span>Saved Successfully</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save Prompt Settings'}</span>
            </>
          )}
        </button>
      </div>

      {/* Waterfall Hierarchy Info */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-950/20 p-4 text-xs text-violet-300 backdrop-blur">
        <div className="flex items-center gap-2 font-bold text-violet-200">
          <Info className="h-4 w-4 text-violet-400" />
          <span>Waterfall Prompt Execution</span>
        </div>
        <p className="mt-1 text-slate-300">
          When your recruiters evaluate candidate matches in the Chrome Extension, the engine first checks for your agency custom prompt. If disabled or null, it seamlessly falls back to the Super Admin platform prompt.
        </p>
      </div>

      {/* Prompt Mode Switch */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Custom Agency Prompt Mode</h3>
            <p className="text-xs text-slate-400">
              Enable to override the global evaluation prompt with your agency's custom matching criteria.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUseCustom(!useCustom)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useCustom ? 'bg-violet-600' : 'bg-slate-800'
              }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCustom ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
          </button>
        </div>
      </div>

      {/* Variable Chips */}
      {useCustom && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Dynamic Variable Tokens (Click to append)
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {VARIABLE_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-violet-300 transition hover:border-violet-500 hover:bg-violet-950/40 hover:text-white"
              >
                {token}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt Editor */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {useCustom ? 'Agency Custom Prompt Definition' : 'Active Inherited Global Prompt (Read-Only)'}
          </label>
          {useCustom && (
            <button
              type="button"
              onClick={() => setCustomPrompt(fallbackPrompt)}
              className="flex items-center gap-1 text-xs text-violet-400 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset to Platform Default</span>
            </button>
          )}
        </div>

        <textarea
          rows={16}
          disabled={!useCustom}
          value={useCustom ? customPrompt : fallbackPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          className={`w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none transition ${useCustom
              ? 'focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
              : 'opacity-60 cursor-not-allowed'
            }`}
          placeholder="Custom evaluation prompt template..."
        />
      </div>
    </div>
  );
}
