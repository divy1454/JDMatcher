'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { FileCode2, Save, Sparkles, Check, RefreshCw } from 'lucide-react';

const VARIABLE_TOKENS = [
  { token: '{{candidate_name}}', desc: 'Candidate Full Name' },
  { token: '{{candidate_title}}', desc: 'Primary Job Title' },
  { token: '{{visa_status}}', desc: 'Visa Status' },
  { token: '{{clearance}}', desc: 'Security Clearance' },
  { token: '{{work_preference}}', desc: 'Work Preference' },
  { token: '{{candidate_resume}}', desc: 'Candidate Resume' },
  { token: '{{jd_text}}', desc: 'Job Description' },
];

export default function GlobalPromptsPage() {
  const [prompt, setPrompt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchPrompt = async () => {
    try {
      const data = await apiRequest('/prompt-settings/global');
      setPrompt(data.prompt);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      console.error('Failed to load global prompt:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompt();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await apiRequest('/prompt-settings/global', {
        method: 'PUT',
        body: JSON.stringify({ prompt }),
      });
      setUpdatedAt(res.setting.updatedAt);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save prompt: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const insertToken = (token: string) => {
    setPrompt((prev) => prev + `\n${token}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Global Evaluation Prompt</h1>
          <p className="mt-1 text-sm text-slate-400">
            Default evaluation prompt template for candidate job matching.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {saveSuccess ? (
            <>
              <Check className="h-4 w-4 text-emerald-300" />
              <span>Saved Successfully</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save Global Prompt'}</span>
            </>
          )}
        </button>
      </div>

      {/* Available Variable Tokens */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl">
        <div className="mb-2.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Prompt Variables
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {VARIABLE_TOKENS.map(({ token, desc }) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              title={desc}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono text-indigo-300 transition hover:border-indigo-500 hover:bg-indigo-950/40 hover:text-white"
            >
              <span>{token}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Editor */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            GLOBAL_EVAL_PROMPT Template Definition
          </label>
          {updatedAt && (
            <span className="text-[11px] text-slate-500">
              Last saved: {formatDate(updatedAt)}
            </span>
          )}
        </div>

        <textarea
          rows={16}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="Enter prompt template..."
        />
      </div>
    </div>
  );
}
