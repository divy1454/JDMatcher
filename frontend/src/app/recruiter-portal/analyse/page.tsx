'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CustomDropdown, DropdownOption } from '@/components/ui/CustomDropdown';
import {
  Sparkles,
  Search,
  FileText,
  Building2,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  History,
  Trash2,
  ChevronRight,
  Filter,
  Download,
  Flame,
  Award,
  ChevronDown,
  Info,
  Building,
  Target,
  FileCheck,
  UserCheck,
  Globe,
} from 'lucide-react';

interface CandidateSnapshot {
  totalYearsExperience: string;
  coreSpecialization: string;
  targetSeniority: string;
  seniorityRationale: string;
}

interface IndustryDomainItem {
  name: string;
  details: string;
}

interface IndustriesAndDomains {
  handsOnDomains: IndustryDomainItem[];
  functionalExperience: string[];
  unsupportedDomains: string[];
}

interface RoleTier {
  tier: 'Primary' | 'Secondary' | 'Stretch';
  roles: string[];
  skillsToLeadWith: string[];
  bestFitIndustries: string[];
}

interface HonestNotes {
  weakSpotsAndRisks: string[];
  titlingMismatches: string[];
  rolesAndIndustriesToAvoid: string[];
  educationAndTiming: string[];
  workAuthorizationAdvisory: string;
}

interface TargetCompany {
  company: string;
  type: string;
  sponsorshipNotes: string;
}

interface WorkflowNotes {
  verifyBeforeSubmitting: string[];
  workAuthAndTiming: string[];
  titlingAndDualFit: string[];
  sources: Array<{ name: string; url: string }>;
}

interface ResumeAnalysisResult {
  id?: string;
  candidateId?: string;
  candidateName?: string;
  candidateTitle?: string;
  candidateSnapshot: CandidateSnapshot;
  industriesAndDomains: IndustriesAndDomains;
  roleTiers: RoleTier[];
  honestNotes: HonestNotes;
  primaryFitCompanies: TargetCompany[];
  secondaryFitCompanies: TargetCompany[];
  workflowNotes: WorkflowNotes;
  fullMarkdown?: string;
  createdAt?: string;
}

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  isActive: boolean;
  resumeLength?: number;
  rawResumeText?: string;
}

interface HistoryItem {
  id: string;
  candidateId?: string;
  candidateName: string;
  candidateTitle: string;
  totalYearsExperience: string;
  coreSpecialization: string;
  targetSeniority: string;
  createdAt: string;
}

function ResumeAnalyserContent() {
  const searchParams = useSearchParams();
  const initialCandidateId = searchParams.get('candidateId');

  // Candidate Data State
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateItem | null>(null);

  // Custom ad-hoc mode
  const [inputMode, setInputMode] = useState<'bench' | 'custom'>('bench');
  const [customFullName, setCustomFullName] = useState('');
  const [customPrimaryTitle, setCustomPrimaryTitle] = useState('');
  const [customResumeText, setCustomResumeText] = useState('');

  // Analysis State
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<ResumeAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // History & Tabs State
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'advisory' | 'companies' | 'workflow' | 'markdown'>('overview');
  const [companyTab, setCompanyTab] = useState<'all' | 'primary' | 'secondary'>('all');
  const [companySearch, setCompanySearch] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Analysis Progress Animation Steps
  const progressSteps = [
    'Parsing Candidate Work History & Tenure...',
    'Extracting Hands-On & Cross-Industry Domains...',
    'Building Primary, Secondary & Stretch Role Matrix...',
    'Compiling Recruiter Honest Advisory & Weak Spot Checks...',
    'Researching 20+ Visa Sponsorship Target Employers...',
    'Synthesizing Pre-Submission Workflow & Verification Checklist...',
  ];

  // 1. Fetch Candidates List
  useEffect(() => {
    async function loadCandidates() {
      try {
        const data = await apiRequest('/candidates');
        setCandidates(data || []);
      } catch (err) {
        console.error('Failed to load bench candidates:', err);
      } finally {
        setIsLoadingCandidates(false);
      }
    }
    loadCandidates();
    loadHistory();
  }, []);

  // 2. Fetch Analysis History
  async function loadHistory() {
    try {
      const history = await apiRequest('/analyze/resume-history');
      setHistoryList(history || []);
    } catch (err) {
      console.error('Failed to load analysis history:', err);
    }
  }

  // 3. Handle Initial Candidate ID from URL
  useEffect(() => {
    if (initialCandidateId && candidates.length > 0) {
      const match = candidates.find((c) => c.id === initialCandidateId);
      if (match) {
        setSelectedCandidateId(match.id);
        handleSelectCandidate(match.id);
      }
    }
  }, [initialCandidateId, candidates]);

  // Options for Bench Candidate Custom Dropdown
  const candidateDropdownOptions: DropdownOption[] = useMemo(() => {
    return [
      { value: '', label: '-- Choose Candidate to Analyse --' },
      ...candidates.map((cand) => ({
        value: cand.id,
        label: cand.fullName,
        sublabel: cand.primaryTitle,
        badge: cand.resumeLength ? `${cand.resumeLength} chars` : 'Resume attached',
      })),
    ];
  }, [candidates]);

  // Handle Candidate Selection from Dropdown
  const handleSelectCandidate = async (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    if (!candidateId) {
      setSelectedCandidate(null);
      return;
    }
    try {
      const full = await apiRequest(`/candidates/${candidateId}`);
      setSelectedCandidate(full);
      setCustomResumeText(full.rawResumeText || '');
    } catch (err) {
      console.error('Failed to fetch candidate details:', err);
    }
  };

  // Run Deep Analysis & Research
  const handleRunAnalysis = async () => {
    setErrorMsg(null);
    let payload: any = {};

    if (inputMode === 'bench') {
      if (!selectedCandidateId) {
        setErrorMsg('Please select a bench candidate first.');
        return;
      }
      payload = {
        candidateId: selectedCandidateId,
        rawResumeText: customResumeText || selectedCandidate?.rawResumeText,
        candidateName: selectedCandidate?.fullName,
        candidateTitle: selectedCandidate?.primaryTitle,
      };
    } else {
      if (!customResumeText.trim() || customResumeText.trim().length < 50) {
        setErrorMsg('Please paste a complete resume (minimum 50 characters).');
        return;
      }
      payload = {
        rawResumeText: customResumeText.trim(),
        candidateName: customFullName.trim() || 'Candidate Profile',
        candidateTitle: customPrimaryTitle.trim() || 'Professional',
      };
    }

    setIsAnalyzing(true);
    setAnalysisStep(0);

    // Step cycle animation
    const interval = setInterval(() => {
      setAnalysisStep((prev) => (prev < progressSteps.length - 1 ? prev + 1 : prev));
    }, 2800);

    try {
      const response = await apiRequest<ResumeAnalysisResult>('/analyze/resume', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setAnalysisResult(response);
      setActiveTab('overview');
      await loadHistory();
    } catch (err: any) {
      setErrorMsg(err.message || 'Analysis failed. Please check the resume text and try again.');
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
    }
  };

  // Load a Saved Analysis from History
  const handleLoadSavedAnalysis = async (id: string) => {
    try {
      const saved = await apiRequest<ResumeAnalysisResult>(`/analyze/resume/${id}`);
      setAnalysisResult(saved);
      setShowHistoryModal(false);
      setActiveTab('overview');
    } catch (err: any) {
      alert('Failed to load saved analysis: ' + err.message);
    }
  };

  // Delete an Analysis from History
  const handleDeleteSavedAnalysis = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this saved analysis?')) return;
    try {
      await apiRequest(`/analyze/resume/${id}`, { method: 'DELETE' });
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
      if (analysisResult?.id === id) {
        setAnalysisResult(null);
      }
    } catch (err: any) {
      alert('Failed to delete analysis: ' + err.message);
    }
  };

  // Copy helper
  const handleCopy = async (text: string, sectionKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionKey);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    if (!analysisResult) return [];
    let list: Array<TargetCompany & { tier: 'Primary' | 'Secondary' }> = [];

    if (companyTab === 'all' || companyTab === 'primary') {
      const primary = (analysisResult.primaryFitCompanies || []).map((c) => ({
        ...c,
        tier: 'Primary' as const,
      }));
      list = [...list, ...primary];
    }

    if (companyTab === 'all' || companyTab === 'secondary') {
      const secondary = (analysisResult.secondaryFitCompanies || []).map((c) => ({
        ...c,
        tier: 'Secondary' as const,
      }));
      list = [...list, ...secondary];
    }

    if (companySearch.trim()) {
      const q = companySearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.company.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q) ||
          c.sponsorshipNotes.toLowerCase().includes(q)
      );
    }

    return list;
  }, [analysisResult, companyTab, companySearch]);

  const totalCompaniesCount = useMemo(() => {
    if (!analysisResult) return 0;
    return (
      (analysisResult.primaryFitCompanies?.length || 0) +
      (analysisResult.secondaryFitCompanies?.length || 0)
    );
  }, [analysisResult]);

  return (
    <div className="space-y-7 pb-16">
      {/* Top Banner / Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
                Resume Analyser
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Candidate snapshot, domain mapping, role tiering, and visa sponsorship employer research.
              </p>
            </div>
          </div>
        </div>

        {/* History Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white shadow-xs"
          >
            <History className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            <span>Past Reports</span>
            {historyList.length > 0 && (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {historyList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Candidate Selection & Action Workspace */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/80 p-6 shadow-sm dark:shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-4">
            {/* Input Mode Selector */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => setInputMode('bench')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  inputMode === 'bench'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Select from Bench ({candidates.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('custom')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  inputMode === 'custom'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Custom / Ad-Hoc Resume</span>
              </button>
            </div>

            {/* Mode 1: Bench Dropdown */}
            {inputMode === 'bench' ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Bench Candidate
                </label>
                <div>
                  <CustomDropdown
                    value={selectedCandidateId}
                    onChange={(val) => handleSelectCandidate(val)}
                    disabled={isLoadingCandidates || isAnalyzing}
                    options={candidateDropdownOptions}
                    icon={<UserCheck className="h-4 w-4 text-emerald-500" />}
                    placeholder="-- Choose Candidate to Analyse --"
                  />
                </div>
              </div>
            ) : (
              /* Mode 2: Custom Resume Input */
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Candidate Full Name
                    </label>
                    <input
                      type="text"
                      value={customFullName}
                      onChange={(e) => setCustomFullName(e.target.value)}
                      placeholder="e.g. Daksh Patel"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Role Title (Optional)
                    </label>
                    <input
                      type="text"
                      value={customPrimaryTitle}
                      onChange={(e) => setCustomPrimaryTitle(e.target.value)}
                      placeholder="e.g. Marketing Analyst"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Paste Resume Content
                  </label>
                  <textarea
                    rows={5}
                    value={customResumeText}
                    onChange={(e) => setCustomResumeText(e.target.value)}
                    placeholder="Paste full candidate resume here (work history, tech stack, education)..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Action CTA Box */}
          <div className="flex flex-col gap-3 lg:w-72 shrink-0 pt-2 lg:pt-8">
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || (inputMode === 'bench' && !selectedCandidateId)}
              className="relative flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.02] hover:shadow-emerald-500/40 disabled:opacity-50 disabled:hover:scale-100"
            >
              <Sparkles className={`h-5 w-5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Researching...' : 'Analyse & Research'}</span>
            </button>
          </div>
        </div>

        {/* Loading Progress State */}
        {isAnalyzing && (
          <div className="mt-6 border-t border-slate-800/80 pt-5">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative flex items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-400" />
                <Sparkles className="absolute h-5 w-5 text-emerald-400 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{progressSteps[analysisStep]}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Step {analysisStep + 1} of {progressSteps.length}
                </p>
              </div>
              <div className="w-full max-w-md bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 transition-all duration-700 rounded-full"
                  style={{ width: `${((analysisStep + 1) / progressSteps.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ANALYSIS RESULTS SECTION */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Executive Metrics Top Bar */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Experience */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Total Experience
                </span>
                <span className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                  Verified
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {analysisResult.candidateSnapshot?.totalYearsExperience || 'N/A'}
              </p>
            </div>

            {/* Core Specialization */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Core Specialization
                </span>
                <span className="rounded-md bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-700 dark:text-teal-400 font-bold">
                  Focus
                </span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 dark:text-white leading-tight line-clamp-2">
                {analysisResult.candidateSnapshot?.coreSpecialization || 'N/A'}
              </p>
            </div>

            {/* Target Seniority */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Target Seniority
                </span>
                <span className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                  Calibrated
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-amber-700 dark:text-amber-300 leading-tight">
                {analysisResult.candidateSnapshot?.targetSeniority || 'Senior'}
              </p>
            </div>

            {/* Visa Sponsoring Target Companies */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <Building className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  Sponsor Employers
                </span>
                <span className="rounded-md bg-cyan-50 dark:bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-400 font-bold">
                  Track Record
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-cyan-700 dark:text-cyan-300">
                {totalCompaniesCount}+ Employers Found
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {analysisResult.primaryFitCompanies?.length || 0} Primary • {analysisResult.secondaryFitCompanies?.length || 0} Secondary Fit
              </p>
            </div>
          </div>

          {/* Interactive Navigation Tabs & Action Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'overview', label: 'Candidate Snapshot & Domains', icon: Target },
                { id: 'roles', label: 'Primary / Secondary / Stretch Roles', icon: Layers },
                { id: 'advisory', label: 'Honest Notes for Team', icon: ShieldAlert },
                { id: 'companies', label: `Target Companies (${totalCompaniesCount})`, icon: Building2 },
                { id: 'workflow', label: 'Workflow & Verification', icon: FileCheck },
                { id: 'markdown', label: 'Full Report Markdown', icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(analysisResult.fullMarkdown || '', 'report')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                title="Copy entire formatted markdown report"
              >
                {copiedSection === 'report' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copy Full Report</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* TAB 1: CANDIDATE SNAPSHOT & DOMAINS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Seniority Calibration Breakdown */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                  <Award className="h-4 w-4" />
                  <span>Candidate Snapshot</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Experience Tenure
                    </span>
                    <p className="mt-1 text-sm font-bold text-white">
                      {analysisResult.candidateSnapshot?.totalYearsExperience}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Core Specialization
                    </span>
                    <p className="mt-1 text-sm font-bold text-white">
                      {analysisResult.candidateSnapshot?.coreSpecialization}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Target Seniority Level
                    </span>
                    <p className="mt-1 text-sm font-bold text-amber-300">
                      {analysisResult.candidateSnapshot?.targetSeniority}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 text-xs text-slate-300 leading-relaxed">
                  <span className="font-semibold text-white">Rationale: </span>
                  {analysisResult.candidateSnapshot?.seniorityRationale}
                </div>
              </div>

              {/* 2. Industries & Domains */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-5">
                <div className="flex items-center gap-2 text-teal-400 text-sm font-bold">
                  <Globe className="h-4 w-4" />
                  <span>Industries & Domains</span>
                </div>

                {/* Hands-On Domains */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Experience Domains
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(analysisResult.industriesAndDomains?.handsOnDomains || []).map((dom, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="text-sm font-bold text-white">{dom.name}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed pl-6">
                          {dom.details}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Functional Cross-Industry */}
                {analysisResult.industriesAndDomains?.functionalExperience?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                      Cross-Industry Functional Skills
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.industriesAndDomains.functionalExperience.map((fn, i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-teal-500/20 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300"
                        >
                          {fn}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing / Unsupported Domains Callout */}
                {analysisResult.industriesAndDomains?.unsupportedDomains?.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Unsupported Domains</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 pl-1">
                      {analysisResult.industriesAndDomains.unsupportedDomains.map((un, i) => (
                        <li key={i}>{un}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROLE TIERS MATRIX (PRIMARY, SECONDARY, STRETCH) */}
          {activeTab === 'roles' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                  <Layers className="h-4 w-4" />
                  <span>Role Tiers Matrix</span>
                </div>
                <button
                  onClick={() => {
                    const tableText = (analysisResult.roleTiers || [])
                      .map(
                        (t) =>
                          `${t.tier.toUpperCase()}:\nRoles: ${t.roles.join(', ')}\nLead Skills: ${t.skillsToLeadWith.join(', ')}\nBest Fit: ${t.bestFitIndustries.join(', ')}`
                      )
                      .join('\n\n');
                    handleCopy(tableText, 'roles');
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  {copiedSection === 'roles' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedSection === 'roles' ? 'Copied' : 'Copy Matrix'}</span>
                </button>
              </div>

              <div className="space-y-4">
                {(analysisResult.roleTiers || []).map((tier, idx) => {
                  const isPrimary = tier.tier.toLowerCase() === 'primary';
                  const isSecondary = tier.tier.toLowerCase() === 'secondary';
                  const isStretch = tier.tier.toLowerCase() === 'stretch';

                  const badgeColor = isPrimary
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : isSecondary
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                    : 'border-purple-500/30 bg-purple-500/10 text-purple-400';

                  const headerTitle = isPrimary
                    ? 'Primary Fit'
                    : isSecondary
                    ? 'Secondary Fit'
                    : 'Stretch Fit';

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-4 transition hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${badgeColor}`}>
                            {tier.tier.toUpperCase()} TIER
                          </span>
                          <span className="text-sm font-bold text-white">{headerTitle}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {/* Roles */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                            Matching Role Titles
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(tier.roles || []).map((r, rIdx) => (
                              <span
                                key={rIdx}
                                className="rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-slate-200"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Skills to Lead With */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                            Skills to Lead With
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                            {tier.skillsToLeadWith?.join(', ') || 'Standard profile skills'}
                          </p>
                        </div>

                        {/* Best Fit Industries */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                            Best-Fit Industries
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                            {tier.bestFitIndustries?.join(', ') || 'Relevant industry verticals'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: HONEST NOTES FOR MY TEAM (ADVISORY) */}
          {activeTab === 'advisory' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 p-6 backdrop-blur-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-bold">
                    <ShieldAlert className="h-5 w-5" />
                    <span>Advisory Notes</span>
                  </div>
                </div>

                {/* 1. Weak Spots & Overselling Risks */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span>Weak Spots & Risks</span>
                  </h4>
                  <div className="space-y-2">
                    {(analysisResult.honestNotes?.weakSpotsAndRisks || []).map((risk, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5"
                      >
                        <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                        <span>{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Titling Mismatches */}
                {analysisResult.honestNotes?.titlingMismatches?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-cyan-400" />
                      <span>Titling Mismatches</span>
                    </h4>
                    <div className="space-y-2">
                      {analysisResult.honestNotes.titlingMismatches.map((tm, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5 text-xs text-slate-300 leading-relaxed"
                        >
                          {tm}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Roles and Industries to Avoid */}
                {analysisResult.honestNotes?.rolesAndIndustriesToAvoid?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-red-400" />
                      <span>Roles & Industries to Avoid</span>
                    </h4>
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                      <ul className="list-disc list-inside space-y-1.5 text-xs text-red-200">
                        {analysisResult.honestNotes.rolesAndIndustriesToAvoid.map((avoid, i) => (
                          <li key={i}>{avoid}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* 4. Education vs Experience Timing */}
                {analysisResult.honestNotes?.educationAndTiming?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-400" />
                      <span>Timeline Overlaps</span>
                    </h4>
                    <div className="space-y-2">
                      {analysisResult.honestNotes.educationAndTiming.map((timing, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5 text-xs text-slate-300 leading-relaxed"
                        >
                          {timing}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Work Authorization Advisory */}
                {analysisResult.honestNotes?.workAuthorizationAdvisory && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Work Authorization</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {analysisResult.honestNotes.workAuthorizationAdvisory}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: 20+ VISA SPONSORING TARGET COMPANIES */}
          {activeTab === 'companies' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold">
                    <Building2 className="h-4 w-4" />
                    <span>Target Employers with Visa Sponsorship</span>
                  </div>
                </div>

                {/* Copy Companies List Button */}
                <button
                  onClick={() => {
                    const text = filteredCompanies
                      .map((c) => `${c.company} | ${c.type} | ${c.sponsorshipNotes}`)
                      .join('\n');
                    handleCopy(text, 'companies');
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5"
                >
                  {copiedSection === 'companies' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>Copy Company Table</span>
                </button>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 w-fit">
                  <button
                    onClick={() => setCompanyTab('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      companyTab === 'all'
                        ? 'bg-cyan-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Companies ({totalCompaniesCount})
                  </button>
                  <button
                    onClick={() => setCompanyTab('primary')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      companyTab === 'primary'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Primary Fit ({analysisResult.primaryFitCompanies?.length || 0})
                  </button>
                  <button
                    onClick={() => setCompanyTab('secondary')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      companyTab === 'secondary'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Secondary Fit ({analysisResult.secondaryFitCompanies?.length || 0})
                  </button>
                </div>

                {/* Company Search Input */}
                <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 sm:w-64">
                  <Search className="h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Filter employers or keywords..."
                    className="ml-2 w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none"
                  />
                </div>
              </div>

              {/* Companies Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Company</th>
                      <th className="py-3 px-4">Tier</th>
                      <th className="py-3 px-4">Type / Domain</th>
                      <th className="py-3 px-4">Sponsorship Notes & Verified Filings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredCompanies.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                          {c.company}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              c.tier === 'Primary'
                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                                : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                            }`}
                          >
                            {c.tier} Fit
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-medium whitespace-nowrap">
                          {c.type}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 leading-relaxed max-w-xl">
                          {c.sponsorshipNotes}
                        </td>
                      </tr>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No matching target companies found for current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: WORKFLOW NOTES & PRE-SUBMISSION CHECKLIST */}
          {activeTab === 'workflow' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-6">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                <FileCheck className="h-5 w-5" />
                <span>Workflow & Pre-Submission Checklist</span>
              </div>

              {/* Verify Before Submitting */}
              {analysisResult.workflowNotes?.verifyBeforeSubmitting?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Verify Before Submitting Candidate</span>
                  </h4>
                  <div className="space-y-2">
                    {analysisResult.workflowNotes.verifyBeforeSubmitting.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5"
                      >
                        <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Work Auth & Timing */}
              {analysisResult.workflowNotes?.workAuthAndTiming?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span>Work Authorization Timing & Lottery Constraints</span>
                  </h4>
                  <div className="space-y-2">
                    {analysisResult.workflowNotes.workAuthAndTiming.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-slate-300 leading-relaxed"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Titling and Dual-Fit */}
              {analysisResult.workflowNotes?.titlingAndDualFit?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-teal-400" />
                    <span>Titling Defense & Dual-Fit Opportunities</span>
                  </h4>
                  <div className="space-y-2">
                    {analysisResult.workflowNotes.titlingAndDualFit.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 text-xs text-slate-300 leading-relaxed"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified Sources */}
              {analysisResult.workflowNotes?.sources?.length > 0 && (
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    Data Verification Sources
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.workflowNotes.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 hover:border-slate-700 transition"
                      >
                        <span>{src.name}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: FULL REPORT RAW MARKDOWN */}
          {activeTab === 'markdown' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-white text-sm font-bold">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <span>Formatted Intelligence Report Markdown</span>
                </div>
                <button
                  onClick={() => handleCopy(analysisResult.fullMarkdown || '', 'markdown-tab')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                >
                  {copiedSection === 'markdown-tab' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="max-h-[600px] overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed bg-slate-950 p-5 rounded-xl border border-slate-800 scrollbar-thin">
                {analysisResult.fullMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* MODAL: PAST SAVED ANALYSES */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <History className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Past Resume Analyses</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg border border-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[480px] overflow-y-auto space-y-2.5 pr-1">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleLoadSavedAnalysis(item.id)}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 hover:border-slate-700 cursor-pointer transition group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white group-hover:text-emerald-400 transition">
                        {item.candidateName}
                      </span>
                      {item.candidateTitle && (
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">
                          {item.candidateTitle}
                        </span>
                      )}
                      <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300 font-semibold">
                        {item.targetSeniority || 'Senior'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{item.totalYearsExperience || 'Experience Analyzed'}</span>
                      <span>•</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDeleteSavedAnalysis(e, item.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      title="Delete saved report"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition" />
                  </div>
                </div>
              ))}

              {historyList.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  No previous analyses found. Select a candidate and click &quot;Analyse &amp; Research&quot; above.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResumeAnalyserPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <ResumeAnalyserContent />
    </Suspense>
  );
}
