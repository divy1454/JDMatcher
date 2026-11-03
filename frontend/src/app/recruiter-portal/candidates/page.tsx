'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Users,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  X,
  Check,
  Trash2,
  Copy,
  Sparkles,
  Zap,
  GraduationCap,
  Briefcase,
  Link2,
  ShieldCheck,
  Scale,
  UploadCloud,
  Download,
  AlertCircle,
  MessageSquare,
  User,
  CheckCircle2,
} from 'lucide-react';

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  isActive: boolean;
  createdAt: string;
  visaStatus?: string;
  workPreference?: string;
  resumeFileName?: string;
  hasResumeFile?: boolean;
  hasStructuredProfile?: boolean;
  resumeLength?: number;
  rawResumeText?: string;
}

interface EducationEntry {
  schoolName: string;
  degreeLevel: string;
  major: string;
  graduationYear: string;
  gpa?: string;
}

interface WorkHistoryEntry {
  companyName: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  isCurrentRole: boolean;
  location?: string;
  description: string;
}

interface SavedResponseEntry {
  questionPattern: string;
  answer: string;
  category?: string;
}

interface SpeedyApplyFormData {
  fullName: string;
  primaryTitle: string;
  rawResumeText: string;
  visaStatus: string;
  workPreference: string;
  securityClearance: string;
  yearsOfExperience: number;
  keySkills: string[];

  // 1. Personal & Contact
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  citizenshipStatus: string;

  // 2. Education
  education: EducationEntry[];

  // 3. Work Experience
  workHistory: WorkHistoryEntry[];

  // 4. Social & Portfolios
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  twitterUrl: string;
  otherUrl: string;

  // 5. Work Auth & Screening
  authorizedToWorkInUS: boolean;
  requireSponsorship: boolean;
  currentSponsorshipType: string;
  securityClearanceLevel: string;
  noticePeriodWeeks: string;
  willingToRelocate: boolean;
  desiredSalary: string;

  // 6. EEO Diversity
  eeoGender: string;
  eeoRace: string;
  eeoVeteran: string;
  eeoDisability: string;

  // 7. Resume File Document
  resumeFileBase64: string;
  resumeFileName: string;
  resumeMimeType: string;

  // 8. Application Questions & Saved Responses
  summaryBio: string;
  savedResponses: SavedResponseEntry[];
}

const INITIAL_FORM_DATA: SpeedyApplyFormData = {
  fullName: '',
  primaryTitle: '',
  rawResumeText: '',
  visaStatus: 'US Citizen',
  workPreference: 'Remote',
  securityClearance: 'None',
  yearsOfExperience: 3,
  keySkills: [],

  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  phoneCountryCode: '+1',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'United States',
  citizenshipStatus: 'US Citizen',

  education: [],
  workHistory: [],

  linkedinUrl: '',
  githubUrl: '',
  portfolioUrl: '',
  twitterUrl: '',
  otherUrl: '',

  authorizedToWorkInUS: true,
  requireSponsorship: false,
  currentSponsorshipType: 'US Citizen',
  securityClearanceLevel: 'None',
  noticePeriodWeeks: '2',
  willingToRelocate: true,
  desiredSalary: '',

  // Self-identification is the candidate's choice, so new profiles start at "decline"
  eeoGender: 'Decline to self-identify',
  eeoRace: 'Decline to self-identify',
  eeoVeteran: 'Decline to self-identify',
  eeoDisability: 'Decline to self-identify',

  resumeFileBase64: '',
  resumeFileName: '',
  resumeMimeType: '',

  summaryBio: '',
  savedResponses: [],
};

type FormTab =
  | 'personal'
  | 'education'
  | 'experience'
  | 'social'
  | 'screening'
  | 'eeo'
  | 'resume'
  | 'qa';

export default function RecruiterCandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [copiedResumeId, setCopiedResumeId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTab>('personal');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [extractingAi, setExtractingAi] = useState(false);
  const [aiExtractSuccess, setAiExtractSuccess] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<SpeedyApplyFormData>(INITIAL_FORM_DATA);

  const fetchCandidates = async () => {
    try {
      const data = await apiRequest('/candidates');
      setCandidates(data);
    } catch (err) {
      console.error('Failed to load candidates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleCopyResume = async (resumeText: string, id: string) => {
    if (!resumeText) return;
    try {
      await navigator.clipboard.writeText(resumeText);
      setCopiedResumeId(id);
      setTimeout(() => setCopiedResumeId(null), 2000);
    } catch (err) {
      console.error('Failed to copy resume:', err);
    }
  };

  const openAddModal = () => {
    setEditingCandidateId(null);
    setFormData(INITIAL_FORM_DATA);
    setActiveTab('personal');
    setAiExtractSuccess(null);
    setIsModalOpen(true);
  };

  const openEditModal = async (c: CandidateItem) => {
    setEditingCandidateId(c.id);
    setActiveTab('personal');
    setAiExtractSuccess(null);
    setActionLoading(true);
    setIsModalOpen(true);

    try {
      const full = await apiRequest(`/candidates/${c.id}`);
      const structured = full.structuredProfile || {};
      const savedResps = Array.isArray(full.savedResponses) ? full.savedResponses : [];

      const nameParts = (full.fullName || '').trim().split(/\s+/);
      const firstName = structured.personal?.firstName || nameParts[0] || '';
      const lastName = structured.personal?.lastName || nameParts.slice(1).join(' ') || '';

      setFormData({
        fullName: full.fullName || '',
        primaryTitle: full.primaryTitle || '',
        rawResumeText: full.rawResumeText || '',
        visaStatus: full.visaStatus || structured.personal?.citizenshipStatus || 'US Citizen',
        workPreference: full.workPreference || 'Remote',
        securityClearance: full.securityClearance || structured.screening?.securityClearanceLevel || 'None',
        yearsOfExperience: full.yearsOfExperience || 3,
        keySkills: full.keySkills || [],

        firstName,
        lastName,
        email: structured.personal?.email || '',
        phone: structured.personal?.phone || '',
        phoneCountryCode: structured.personal?.phoneCountryCode || '+1',
        address: structured.personal?.address || '',
        city: structured.personal?.city || '',
        state: structured.personal?.state || '',
        zipCode: structured.personal?.zipCode || '',
        country: structured.personal?.country || 'United States',
        citizenshipStatus: structured.personal?.citizenshipStatus || full.visaStatus || 'US Citizen',

        education: Array.isArray(structured.education) ? structured.education : [],
        workHistory: Array.isArray(structured.workHistory) ? structured.workHistory : [],

        linkedinUrl: structured.social?.linkedinUrl || '',
        githubUrl: structured.social?.githubUrl || '',
        portfolioUrl: structured.social?.portfolioUrl || '',
        twitterUrl: structured.social?.twitterUrl || '',
        otherUrl: structured.social?.otherUrl || '',

        authorizedToWorkInUS: structured.screening?.authorizedToWorkInUS !== undefined ? structured.screening.authorizedToWorkInUS : true,
        // When not saved yet, derive it from the visa so an H-1B profile never defaults to "no sponsorship"
        requireSponsorship:
          structured.screening?.requireSponsorship !== undefined
            ? structured.screening.requireSponsorship
            : !['US Citizen', 'Green Card'].includes(full.visaStatus || structured.personal?.citizenshipStatus || 'US Citizen'),
        currentSponsorshipType: structured.screening?.currentSponsorshipType || full.visaStatus || 'US Citizen',
        securityClearanceLevel: structured.screening?.securityClearanceLevel || full.securityClearance || 'None',
        noticePeriodWeeks: structured.screening?.noticePeriodWeeks || '2',
        willingToRelocate: structured.screening?.willingToRelocate !== undefined ? structured.screening.willingToRelocate : true,
        desiredSalary: structured.screening?.desiredSalary || '',

        eeoGender: structured.equalOpportunity?.eeoGender || 'Decline to self-identify',
        eeoRace: structured.equalOpportunity?.eeoRace || 'Decline to self-identify',
        eeoVeteran: structured.equalOpportunity?.eeoVeteran || 'Decline to self-identify',
        eeoDisability: structured.equalOpportunity?.eeoDisability || 'Decline to self-identify',

        resumeFileBase64: full.resumeFileBase64 || '',
        resumeFileName: full.resumeFileName || '',
        resumeMimeType: full.resumeMimeType || '',

        summaryBio: structured.applicationQuestions?.summaryBio || '',
        savedResponses: savedResps.map((r: any) => ({
          questionPattern: r.questionPattern || r.question || '',
          answer: r.answer || '',
          category: r.category || 'screening',
        })),
      });
    } catch (err) {
      console.error('Failed to load full candidate data:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // AI Auto-Extract from Resume
  const handleAiAutoExtract = async () => {
    if (!formData.rawResumeText || formData.rawResumeText.trim().length < 20) {
      alert('Please paste candidate resume text (at least 20 characters) or upload a resume file first.');
      setActiveTab('resume');
      return;
    }

    setExtractingAi(true);
    setAiExtractSuccess(null);

    try {
      const res = await apiRequest('/candidates/extract-profile', {
        method: 'POST',
        body: JSON.stringify({
          rawResumeText: formData.rawResumeText.trim(),
          fullName: formData.fullName || undefined,
          primaryTitle: formData.primaryTitle || undefined,
          visaStatus: formData.visaStatus || undefined,
          yearsOfExperience: formData.yearsOfExperience || undefined,
          keySkills: formData.keySkills || undefined,
        }),
      });

      if (res && res.profile) {
        const p = res.profile;
        setFormData((prev) => {
          const next = { ...prev };
          if (p.personal) {
            if (p.personal.firstName) next.firstName = p.personal.firstName;
            if (p.personal.lastName) next.lastName = p.personal.lastName;
            if (p.personal.fullName && !next.fullName) next.fullName = p.personal.fullName;
            if (p.personal.email) next.email = p.personal.email;
            if (p.personal.phone) next.phone = p.personal.phone;
            if (p.personal.phoneCountryCode) next.phoneCountryCode = p.personal.phoneCountryCode;
            if (p.personal.address) next.address = p.personal.address;
            if (p.personal.city) next.city = p.personal.city;
            if (p.personal.state) next.state = p.personal.state;
            if (p.personal.zipCode) next.zipCode = p.personal.zipCode;
            if (p.personal.country) next.country = p.personal.country;
            if (p.personal.citizenshipStatus) {
              next.citizenshipStatus = p.personal.citizenshipStatus;
              next.visaStatus = p.personal.citizenshipStatus;
            }
          }
          if (Array.isArray(p.education) && p.education.length > 0) {
            next.education = p.education;
          }
          if (Array.isArray(p.workHistory) && p.workHistory.length > 0) {
            next.workHistory = p.workHistory;
          }
          if (p.social) {
            if (p.social.linkedinUrl) next.linkedinUrl = p.social.linkedinUrl;
            if (p.social.githubUrl) next.githubUrl = p.social.githubUrl;
            if (p.social.portfolioUrl) next.portfolioUrl = p.social.portfolioUrl;
          }
          if (p.screening) {
            if (p.screening.authorizedToWorkInUS !== undefined) next.authorizedToWorkInUS = p.screening.authorizedToWorkInUS;
            if (p.screening.requireSponsorship !== undefined) next.requireSponsorship = p.screening.requireSponsorship;
            if (p.screening.currentSponsorshipType) next.currentSponsorshipType = p.screening.currentSponsorshipType;
            if (p.screening.securityClearanceLevel) next.securityClearanceLevel = p.screening.securityClearanceLevel;
            if (p.screening.noticePeriodWeeks) next.noticePeriodWeeks = String(p.screening.noticePeriodWeeks);
            if (p.screening.willingToRelocate !== undefined) next.willingToRelocate = p.screening.willingToRelocate;
          }
          if (p.applicationQuestions?.summaryBio) {
            next.summaryBio = p.applicationQuestions.summaryBio;
          }
          return next;
        });

        setAiExtractSuccess('✨ Gemini AI extracted all 7 candidate profile categories successfully!');
        setTimeout(() => setAiExtractSuccess(null), 6000);
      }
    } catch (err: any) {
      alert('AI Extraction Failed: ' + (err.message || 'Check Gemini API connection'));
    } finally {
      setExtractingAi(false);
    }
  };

  // Resume File Upload Drag-and-Drop Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4.5 * 1024 * 1024) {
      alert('File size exceeds 4.5MB limit. Please upload a smaller PDF or document.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFormData((prev) => ({
        ...prev,
        resumeFileBase64: base64,
        resumeFileName: file.name,
        resumeMimeType: file.type || 'application/pdf',
      }));

      // If text file, also load text into rawResumeText
      if (file.type.includes('text') || file.name.endsWith('.txt')) {
        const textReader = new FileReader();
        textReader.onload = () => {
          setFormData((prev) => ({ ...prev, rawResumeText: textReader.result as string }));
        };
        textReader.readAsText(file);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveResumeFile = () => {
    setFormData((prev) => ({
      ...prev,
      resumeFileBase64: '',
      resumeFileName: '',
      resumeMimeType: '',
    }));
  };

  // Education Helpers
  const addEducationEntry = () => {
    setFormData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        { schoolName: '', degreeLevel: "Bachelor's Degree", major: '', graduationYear: '' },
      ],
    }));
  };

  const removeEducationEntry = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  const updateEducationEntry = (index: number, field: keyof EducationEntry, value: string) => {
    setFormData((prev) => {
      const copy = [...prev.education];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, education: copy };
    });
  };

  // Experience Helpers
  const addExperienceEntry = () => {
    setFormData((prev) => ({
      ...prev,
      workHistory: [
        ...prev.workHistory,
        {
          companyName: '',
          jobTitle: '',
          startDate: '',
          endDate: 'Present',
          isCurrentRole: true,
          location: '',
          description: '',
        },
      ],
    }));
  };

  const removeExperienceEntry = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      workHistory: prev.workHistory.filter((_, i) => i !== index),
    }));
  };

  const updateExperienceEntry = (index: number, field: keyof WorkHistoryEntry, value: any) => {
    setFormData((prev) => {
      const copy = [...prev.workHistory];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, workHistory: copy };
    });
  };

  // Custom Screening Q&A Helpers
  const addSavedResponse = () => {
    setFormData((prev) => ({
      ...prev,
      savedResponses: [
        ...prev.savedResponses,
        { questionPattern: '', answer: '', category: 'screening' },
      ],
    }));
  };

  const removeSavedResponse = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      savedResponses: prev.savedResponses.filter((_, i) => i !== index),
    }));
  };

  const updateSavedResponse = (index: number, field: keyof SavedResponseEntry, value: string) => {
    setFormData((prev) => {
      const copy = [...prev.savedResponses];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, savedResponses: copy };
    });
  };

  // Auto-Fill Readiness Calculation
  const calculateReadinessScore = (): { score: number; missing: string[] } => {
    const checks = [
      { name: 'Full Name', pass: Boolean(formData.fullName.trim()) },
      { name: 'Primary Role', pass: Boolean(formData.primaryTitle.trim()) },
      { name: 'Email Address', pass: Boolean(formData.email.trim()) },
      { name: 'Phone Number', pass: Boolean(formData.phone.trim()) },
      { name: 'City / Location', pass: Boolean(formData.city.trim() || formData.address.trim()) },
      { name: 'Education', pass: formData.education.length > 0 },
      { name: 'Work History', pass: formData.workHistory.length > 0 },
      { name: 'LinkedIn URL', pass: Boolean(formData.linkedinUrl.trim()) },
      { name: 'Work Auth', pass: formData.authorizedToWorkInUS !== undefined },
      { name: 'Resume Document', pass: Boolean(formData.resumeFileBase64 || formData.rawResumeText.trim()) },
    ];

    const passed = checks.filter((c) => c.pass).length;
    const score = Math.round((passed / checks.length) * 100);
    const missing = checks.filter((c) => !c.pass).map((c) => c.name);
    return { score, missing };
  };

  const { score: readinessScore, missing: missingFields } = calculateReadinessScore();

  // Save Candidate Profile (persisting to local Postgres DB)
  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    const structuredProfile = {
      personal: {
        firstName: formData.firstName.trim() || formData.fullName.split(' ')[0] || '',
        lastName: formData.lastName.trim() || formData.fullName.split(' ').slice(1).join(' ') || '',
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        phoneCountryCode: formData.phoneCountryCode || '+1',
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        zipCode: formData.zipCode.trim(),
        country: formData.country || 'United States',
        citizenshipStatus: formData.citizenshipStatus || formData.visaStatus || 'US Citizen',
      },
      education: formData.education,
      workHistory: formData.workHistory,
      social: {
        linkedinUrl: formData.linkedinUrl.trim(),
        githubUrl: formData.githubUrl.trim(),
        portfolioUrl: formData.portfolioUrl.trim(),
        twitterUrl: formData.twitterUrl.trim(),
        otherUrl: formData.otherUrl.trim(),
      },
      equalOpportunity: {
        eeoGender: formData.eeoGender,
        eeoRace: formData.eeoRace,
        eeoVeteran: formData.eeoVeteran,
        eeoDisability: formData.eeoDisability,
      },
      screening: {
        authorizedToWorkInUS: formData.authorizedToWorkInUS,
        requireSponsorship: formData.requireSponsorship,
        currentSponsorshipType: formData.currentSponsorshipType || formData.visaStatus || 'US Citizen',
        securityClearanceLevel: formData.securityClearanceLevel || formData.securityClearance || 'None',
        noticePeriodWeeks: formData.noticePeriodWeeks || '2',
        willingToRelocate: formData.willingToRelocate,
        desiredSalary: formData.desiredSalary,
      },
      applicationQuestions: {
        summaryBio: formData.summaryBio,
      },
    };

    const payload = {
      fullName: formData.fullName.trim(),
      primaryTitle: formData.primaryTitle.trim(),
      rawResumeText: formData.rawResumeText.trim() || `${formData.fullName} - ${formData.primaryTitle} Professional`,
      visaStatus: (formData.visaStatus as any) || 'US Citizen',
      workPreference: (formData.workPreference as any) || 'Remote',
      securityClearance: (formData.securityClearance as any) || 'None',
      yearsOfExperience: Number(formData.yearsOfExperience) || 3,
      keySkills: formData.keySkills || [],
      structuredProfile,
      savedResponses: formData.savedResponses.map((r) => ({
        questionPattern: r.questionPattern,
        question: r.questionPattern,
        answer: r.answer,
        matchType: 'semantic',
        category: r.category || 'screening',
      })),
      ...(formData.resumeFileBase64 && {
        resumeFileBase64: formData.resumeFileBase64,
        resumeFileName: formData.resumeFileName,
        resumeMimeType: formData.resumeMimeType,
      }),
    };

    try {
      if (editingCandidateId) {
        await apiRequest(`/candidates/${editingCandidateId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/candidates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await fetchCandidates();
    } catch (err: any) {
      alert('Failed to save candidate in local DB: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete candidate "${name}" from your local talent database?`)) return;
    try {
      await apiRequest(`/candidates/${id}`, { method: 'DELETE' });
      await fetchCandidates();
    } catch (err: any) {
      alert('Failed to delete candidate: ' + err.message);
    }
  };

  const toggleResume = async (id: string) => {
    if (expandedResumeId === id) {
      setExpandedResumeId(null);
      return;
    }
    try {
      const full = await apiRequest(`/candidates/${id}`);
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, rawResumeText: full.rawResumeText } : c))
      );
      setExpandedResumeId(id);
    } catch (err) {
      console.error('Failed to load resume text:', err);
    }
  };

  const filtered = candidates.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.primaryTitle.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Talent Bench & Auto-Fill Profiles
            </h1>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {candidates.length} Candidate Profiles
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            SpeedyApply-powered universal auto-fill profiles stored securely in local database.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Candidate</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3.5 py-2.5 shadow-sm">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidates by name, job title, or visa status..."
          className="ml-2.5 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
        />
      </div>

      {/* Candidates List */}
      {isLoading ? (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((candidate) => {
            const isExpanded = expandedResumeId === candidate.id;

            return (
              <div
                key={candidate.id}
                className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm dark:shadow-none transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {candidate.fullName}
                      </h3>
                      <span className="rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {candidate.primaryTitle}
                      </span>
                      {candidate.visaStatus && (
                        <span className="rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                          {candidate.visaStatus}
                        </span>
                      )}
                      {candidate.hasStructuredProfile && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                          <Zap className="h-3 w-3 text-teal-500" />
                          <span>Auto-Fill Ready</span>
                        </span>
                      )}
                      {candidate.hasResumeFile && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
                          <FileText className="h-3 w-3 text-purple-500" />
                          <span>PDF Attached</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Added {formatDate(candidate.createdAt)}</span>
                      <span>•</span>
                      <span>
                        {candidate.resumeLength
                          ? `${candidate.resumeLength} chars resume`
                          : 'Resume stored'}
                      </span>
                      {candidate.workPreference && (
                        <>
                          <span>•</span>
                          <span>{candidate.workPreference}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/recruiter-portal/analyse?candidateId=${candidate.id}`}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                      title="Run AI Resume Analyser"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Analyse</span>
                    </Link>

                    <button
                      onClick={() => openEditModal(candidate)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700"
                      title="Edit SpeedyApply Profile & Resume"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Edit Profile</span>
                    </button>

                    <button
                      onClick={() => toggleResume(candidate.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{isExpanded ? 'Hide' : 'Resume'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    <button
                      onClick={() => handleDelete(candidate.id, candidate.fullName)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition"
                      title="Delete Candidate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Raw Resume Text */}
                {isExpanded && (
                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Candidate Resume</span>
                      </div>
                      <button
                        onClick={() => handleCopyResume(candidate.rawResumeText || '', candidate.id)}
                        disabled={!candidate.rawResumeText}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-50"
                      >
                        {copiedResumeId === candidate.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Copy Resume</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-800 dark:text-slate-300 leading-relaxed scrollbar-thin">
                      {candidate.rawResumeText || 'No resume text stored for this candidate.'}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-12 text-center text-slate-500 shadow-sm">
              <Users className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm">No bench candidates found.</p>
            </div>
          )}
        </div>
      )}

      {/* SpeedyApply 7-Part Candidate Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {editingCandidateId ? 'Edit Candidate Profile' : 'New Candidate Profile'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      SpeedyApply 7-Part Schema • Local Database Persistence
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* AI 1-Click Auto-Extract Button */}
                  <button
                    type="button"
                    onClick={handleAiAutoExtract}
                    disabled={extractingAi}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:from-emerald-100 hover:to-teal-100 transition shadow-xs disabled:opacity-50"
                    title="Auto-fill all 7 tabs instantly from resume text using Gemini AI"
                  >
                    {extractingAi ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <span>{extractingAi ? 'AI Extracting...' : '✨ AI Auto-Extract Profile'}</span>
                  </button>

                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Live Readiness Meter & AI Success Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        readinessScore >= 80 ? 'bg-emerald-500' : readinessScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${readinessScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {readinessScore}% Auto-Fill Ready
                  </span>
                  {missingFields.length > 0 && (
                    <span className="text-[11px] text-slate-400 hidden md:inline">
                      (Missing: {missingFields.slice(0, 3).join(', ')}
                      {missingFields.length > 3 ? ` +${missingFields.length - 3} more` : ''})
                    </span>
                  )}
                </div>

                {aiExtractSuccess && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-pulse">
                    {aiExtractSuccess}
                  </span>
                )}
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/60 px-3 scrollbar-none text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'personal'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>1. Personal & Contact</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('education')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'education'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>2. Education ({formData.education.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('experience')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'experience'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>3. Experience ({formData.workHistory.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('social')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'social'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span>4. Social Links</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('screening')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'screening'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>5. Work Auth & Screening</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('eeo')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'eeo'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                <span>6. EEO Diversity</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('resume')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'resume'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>7. Resume File & Text</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('qa')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 transition whitespace-nowrap ${
                  activeTab === 'qa'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>8. Saved Q&A ({formData.savedResponses.length})</span>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveCandidate} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* TAB 1: PERSONAL & CONTACT */}
              {activeTab === 'personal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parts = val.trim().split(/\s+/);
                          setFormData({
                            ...formData,
                            fullName: val,
                            firstName: parts[0] || '',
                            lastName: parts.slice(1).join(' ') || '',
                          });
                        }}
                        placeholder="e.g. Alexandra Chen"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Primary Role / Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.primaryTitle}
                        onChange={(e) => setFormData({ ...formData, primaryTitle: e.target.value })}
                        placeholder="e.g. Senior Full Stack Engineer"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder="Alexandra"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        placeholder="Chen"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="alexandra@example.com"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Country Code
                      </label>
                      <input
                        type="text"
                        value={formData.phoneCountryCode}
                        onChange={(e) => setFormData({ ...formData, phoneCountryCode: e.target.value })}
                        placeholder="+1"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="555-019-2834"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Tech Boulevard, Apt 4B"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="San Francisco"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">State / Province</label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="CA"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Zip / Postal Code</label>
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        placeholder="94105"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Country</label>
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="United States"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Visa / Citizenship
                      </label>
                      <select
                        value={formData.visaStatus}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            visaStatus: e.target.value,
                            citizenshipStatus: e.target.value,
                            requireSponsorship: e.target.value !== 'US Citizen' && e.target.value !== 'Green Card',
                          });
                        }}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="US Citizen">US Citizen</option>
                        <option value="Green Card">Green Card / Permanent Resident</option>
                        <option value="H-1B">H-1B Visa</option>
                        <option value="OPT">OPT / F-1</option>
                        <option value="CPT">CPT</option>
                        <option value="TN">TN Visa</option>
                        <option value="E-3">E-3 (Australian)</option>
                        <option value="H4-EAD">H4-EAD</option>
                        <option value="L2-EAD">L2-EAD</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Work Preference
                      </label>
                      <select
                        value={formData.workPreference}
                        onChange={(e) => setFormData({ ...formData, workPreference: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="Remote">Remote</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-Site">On-Site</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Years of Experience
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={formData.yearsOfExperience}
                        onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value, 10) || 0 })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EDUCATION */}
              {activeTab === 'education' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Academic History</h3>
                      <p className="text-xs text-slate-500">Add candidate degrees and educational institutions.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addEducationEntry}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Degree</span>
                    </button>
                  </div>

                  {formData.education.map((edu, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-3"
                    >
                      <button
                        type="button"
                        onClick={() => removeEducationEntry(idx)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition"
                        title="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            University / School Name
                          </label>
                          <input
                            type="text"
                            value={edu.schoolName}
                            onChange={(e) => updateEducationEntry(idx, 'schoolName', e.target.value)}
                            placeholder="e.g. Stanford University"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Degree Level
                          </label>
                          <select
                            value={edu.degreeLevel}
                            onChange={(e) => updateEducationEntry(idx, 'degreeLevel', e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          >
                            <option value="Bachelor's Degree">Bachelor's Degree</option>
                            <option value="Master's Degree">Master's Degree</option>
                            <option value="Doctorate">Doctorate / Ph.D.</option>
                            <option value="Associate's Degree">Associate's Degree</option>
                            <option value="High School">High School / GED</option>
                            <option value="Bootcamp">Bootcamp / Certificate</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Major / Field of Study
                          </label>
                          <input
                            type="text"
                            value={edu.major}
                            onChange={(e) => updateEducationEntry(idx, 'major', e.target.value)}
                            placeholder="e.g. Computer Science"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Graduation Year
                          </label>
                          <input
                            type="text"
                            value={edu.graduationYear}
                            onChange={(e) => updateEducationEntry(idx, 'graduationYear', e.target.value)}
                            placeholder="e.g. 2021"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {formData.education.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
                      <GraduationCap className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs">No education records added yet.</p>
                      <button
                        type="button"
                        onClick={addEducationEntry}
                        className="mt-2 text-xs font-semibold text-emerald-600 hover:underline"
                      >
                        + Add Education Entry
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: WORK HISTORY */}
              {activeTab === 'experience' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Employment History</h3>
                      <p className="text-xs text-slate-500">Add candidate previous jobs and positions.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addExperienceEntry}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Position</span>
                    </button>
                  </div>

                  {formData.workHistory.map((job, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-3"
                    >
                      <button
                        type="button"
                        onClick={() => removeExperienceEntry(idx)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition"
                        title="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Company Name
                          </label>
                          <input
                            type="text"
                            value={job.companyName}
                            onChange={(e) => updateExperienceEntry(idx, 'companyName', e.target.value)}
                            placeholder="e.g. Acme Cloud Corp"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Job Title / Role
                          </label>
                          <input
                            type="text"
                            value={job.jobTitle}
                            onChange={(e) => updateExperienceEntry(idx, 'jobTitle', e.target.value)}
                            placeholder="e.g. Senior Software Engineer"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Start Date (YYYY-MM)
                          </label>
                          <input
                            type="text"
                            value={job.startDate}
                            onChange={(e) => updateExperienceEntry(idx, 'startDate', e.target.value)}
                            placeholder="2022-01"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            End Date (or 'Present')
                          </label>
                          <input
                            type="text"
                            value={job.endDate}
                            onChange={(e) => updateExperienceEntry(idx, 'endDate', e.target.value)}
                            placeholder="Present"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Location
                          </label>
                          <input
                            type="text"
                            value={job.location || ''}
                            onChange={(e) => updateExperienceEntry(idx, 'location', e.target.value)}
                            placeholder="San Francisco, CA"
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Role Summary / Bullet Points
                        </label>
                        <textarea
                          rows={3}
                          value={job.description}
                          onChange={(e) => updateExperienceEntry(idx, 'description', e.target.value)}
                          placeholder="Architected distributed microservices handling 2M req/day using TypeScript, Go, and Kafka..."
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}

                  {formData.workHistory.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
                      <Briefcase className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs">No work history entries added yet.</p>
                      <button
                        type="button"
                        onClick={addExperienceEntry}
                        className="mt-2 text-xs font-semibold text-emerald-600 hover:underline"
                      >
                        + Add Work Experience Entry
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SOCIAL LINKS */}
              {activeTab === 'social' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Social & Portfolio URLs</h3>
                    <p className="text-xs text-slate-500">Auto-filled into ATS application link fields.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        LinkedIn Profile URL
                      </label>
                      <input
                        type="url"
                        value={formData.linkedinUrl}
                        onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                        placeholder="https://linkedin.com/in/alexandrachen"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GitHub Profile URL
                      </label>
                      <input
                        type="url"
                        value={formData.githubUrl}
                        onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                        placeholder="https://github.com/alexandrachen"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Personal Portfolio / Website
                      </label>
                      <input
                        type="url"
                        value={formData.portfolioUrl}
                        onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
                        placeholder="https://alexandrachen.dev"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Twitter / X URL (Optional)
                      </label>
                      <input
                        type="url"
                        value={formData.twitterUrl}
                        onChange={(e) => setFormData({ ...formData, twitterUrl: e.target.value })}
                        placeholder="https://x.com/alexandrachen"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: WORK AUTH & SCREENING */}
              {activeTab === 'screening' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Work Authorization & Screening</h3>
                    <p className="text-xs text-slate-500">Heuristically matched to common ATS screening questionnaires.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4">
                      <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1">
                        Are you legally authorized to work in the United States?
                      </label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="authorizedToWorkInUS"
                            checked={formData.authorizedToWorkInUS === true}
                            onChange={() => setFormData({ ...formData, authorizedToWorkInUS: true })}
                            className="text-emerald-600"
                          />
                          <span>Yes</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="authorizedToWorkInUS"
                            checked={formData.authorizedToWorkInUS === false}
                            onChange={() => setFormData({ ...formData, authorizedToWorkInUS: false })}
                            className="text-emerald-600"
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4">
                      <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1">
                        Will you now or in the future require visa sponsorship?
                      </label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="requireSponsorship"
                            checked={formData.requireSponsorship === true}
                            onChange={() => setFormData({ ...formData, requireSponsorship: true })}
                            className="text-emerald-600"
                          />
                          <span>Yes</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="requireSponsorship"
                            checked={formData.requireSponsorship === false}
                            onChange={() => setFormData({ ...formData, requireSponsorship: false })}
                            className="text-emerald-600"
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Security Clearance
                      </label>
                      <select
                        value={formData.securityClearance}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            securityClearance: e.target.value,
                            securityClearanceLevel: e.target.value,
                          })
                        }
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="None">None</option>
                        <option value="Public Trust">Public Trust</option>
                        <option value="Secret">Secret</option>
                        <option value="Top Secret">Top Secret</option>
                        <option value="Top Secret/SCI">Top Secret/SCI</option>
                        <option value="Polygraph">Polygraph</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Notice Period
                      </label>
                      <select
                        value={formData.noticePeriodWeeks}
                        onChange={(e) => setFormData({ ...formData, noticePeriodWeeks: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="0">Immediately / Available now</option>
                        <option value="1">1 Week</option>
                        <option value="2">2 Weeks standard</option>
                        <option value="4">1 Month</option>
                        <option value="8">2 Months</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Willing to Relocate?
                      </label>
                      <div className="flex gap-4 mt-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="willingToRelocate"
                            checked={formData.willingToRelocate === true}
                            onChange={() => setFormData({ ...formData, willingToRelocate: true })}
                          />
                          <span>Yes</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="willingToRelocate"
                            checked={formData.willingToRelocate === false}
                            onChange={() => setFormData({ ...formData, willingToRelocate: false })}
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Target Salary ($ / Year)
                    </label>
                    <input
                      type="text"
                      value={formData.desiredSalary}
                      onChange={(e) => setFormData({ ...formData, desiredSalary: e.target.value })}
                      placeholder="e.g. 165000"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 6: EEO DIVERSITY */}
              {activeTab === 'eeo' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Equal Employment Opportunity (EEO)</h3>
                    <p className="text-xs text-slate-500">Government compliance questions asked on US ATS platforms.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Gender</label>
                      <select
                        value={formData.eeoGender}
                        onChange={(e) => setFormData({ ...formData, eeoGender: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-Binary">Non-Binary</option>
                        <option value="Decline to self-identify">Decline to self-identify</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Race / Ethnicity</label>
                      <select
                        value={formData.eeoRace}
                        onChange={(e) => setFormData({ ...formData, eeoRace: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="White">White</option>
                        <option value="Black or African American">Black or African American</option>
                        <option value="Asian">Asian</option>
                        <option value="Hispanic or Latino">Hispanic or Latino</option>
                        <option value="American Indian or Alaska Native">American Indian or Alaska Native</option>
                        <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian or Other Pacific Islander</option>
                        <option value="Two or More Races">Two or More Races</option>
                        <option value="Decline to self-identify">Decline to self-identify</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Veteran Status</label>
                      <select
                        value={formData.eeoVeteran}
                        onChange={(e) => setFormData({ ...formData, eeoVeteran: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="I am not a protected veteran">I am not a protected veteran</option>
                        <option value="I identify as one or more of the classifications of protected veteran">I identify as a protected veteran</option>
                        <option value="Decline to self-identify">Decline to self-identify</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Disability Status</label>
                      <select
                        value={formData.eeoDisability}
                        onChange={(e) => setFormData({ ...formData, eeoDisability: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      >
                        <option value="No, I do not have a disability">No, I do not have a disability</option>
                        <option value="Yes, I have a disability">Yes, I have a disability</option>
                        <option value="Decline to self-identify">Decline to self-identify</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: RESUME FILE & TEXT */}
              {activeTab === 'resume' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Resume Document & Raw Text</h3>
                    <p className="text-xs text-slate-500">
                      Uploaded file is converted to Base64 and automatically injected into file input fields across ATS platforms.
                    </p>
                  </div>

                  {/* Resume Document Upload Dropzone */}
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/60 p-5 text-center">
                    {formData.resumeFileBase64 ? (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-left">
                        <div className="flex items-center gap-3">
                          <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <span className="block text-xs font-bold text-emerald-900 dark:text-emerald-200">
                              {formData.resumeFileName || 'Resume Attached'}
                            </span>
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              {formData.resumeMimeType || 'application/pdf'} • Ready for auto-fill file injection
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={formData.resumeFileBase64}
                            download={formData.resumeFileName || 'Resume.pdf'}
                            className="flex items-center gap-1 rounded-md bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </a>

                          <button
                            type="button"
                            onClick={handleRemoveResumeFile}
                            className="rounded-md bg-red-50 dark:bg-red-500/10 p-1.5 text-red-600 hover:bg-red-100 transition"
                            title="Remove file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer py-4">
                        <UploadCloud className="h-8 w-8 text-emerald-500 mb-2" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Click to upload or drag & drop candidate resume
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">
                          PDF, DOCX, or TXT up to 4.5MB
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.doc,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Raw Resume Text */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Raw Resume Text
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {formData.rawResumeText.length} characters
                      </span>
                    </div>
                    <textarea
                      rows={9}
                      value={formData.rawResumeText}
                      onChange={(e) => setFormData({ ...formData, rawResumeText: e.target.value })}
                      placeholder="Paste complete candidate resume text here (used by Gemini AI for auto-fill screening answers & profile extraction)..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-emerald-500 leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 8: SAVED Q&A */}
              {activeTab === 'qa' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Custom Screening Q&A & Bio</h3>
                      <p className="text-xs text-slate-500">
                        Pre-saved answers for common application questions (e.g. "Why this company?", "Years with React").
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addSavedResponse}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Q&A Pair</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Executive Summary / Bio
                    </label>
                    <textarea
                      rows={3}
                      value={formData.summaryBio}
                      onChange={(e) => setFormData({ ...formData, summaryBio: e.target.value })}
                      placeholder="1-2 paragraph pitch summarizing candidate background, core strengths, and goals..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  {formData.savedResponses.map((item, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-3"
                    >
                      <button
                        type="button"
                        onClick={() => removeSavedResponse(idx)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition"
                        title="Delete question"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Question / Pattern Match
                        </label>
                        <input
                          type="text"
                          value={item.questionPattern}
                          onChange={(e) => updateSavedResponse(idx, 'questionPattern', e.target.value)}
                          placeholder="e.g. How many years of experience do you have with AWS?"
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Candidate Answer
                        </label>
                        <textarea
                          rows={2}
                          value={item.answer}
                          onChange={(e) => updateSavedResponse(idx, 'answer', e.target.value)}
                          placeholder="e.g. 5+ years building production applications on ECS, Lambda, and DynamoDB."
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}

                  {formData.savedResponses.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-slate-400">
                      <MessageSquare className="mx-auto h-6 w-6 mb-1 opacity-50" />
                      <p className="text-xs">No custom screening Q&As added.</p>
                      <button
                        type="button"
                        onClick={addSavedResponse}
                        className="mt-1 text-xs font-semibold text-emerald-600 hover:underline"
                      >
                        + Add Custom Screening Question & Answer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                  Data persists locally in PostgreSQL DB
                </span>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>{editingCandidateId ? 'Update in Database' : 'Save in Database'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
