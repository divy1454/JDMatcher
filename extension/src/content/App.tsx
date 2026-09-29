import React, { useState, useEffect, useRef } from 'react';
import { Candidate, StoredEvaluationState } from './types.js';
import { generateHardwareFingerprint } from './fingerprint.js';
import { ExtensionLogo } from './ExtensionLogo.js';

interface AppProps {
  onClose: () => void;
}

export const App: React.FC<AppProps> = ({ onClose }) => {
  // Authentication & Configuration State
  const [token, setToken] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [recruiterPassword, setRecruiterPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Candidates & Selection
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [isLoadingCandidates, setIsLoadingCandidates] = useState<boolean>(false);
  const [candidateFetchError, setCandidateFetchError] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // JD Inputs
  const [jdText, setJdText] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reactive Validation & Toast States (No alert popups)
  const [candidateError, setCandidateError] = useState<string>('');
  const [jdTextError, setJdTextError] = useState<string>('');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const showToast = (text: string, type: 'info' | 'error' | 'success' = 'info', duration = 3500) => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, duration);
  };

  // Evaluation & Storage State
  const [evalState, setEvalState] = useState<StoredEvaluationState>({ status: 'idle' });
  const [evalElapsedSeconds, setEvalElapsedSeconds] = useState<number>(0);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (evalState.status === 'loading') {
      const startTime = Date.now();
      setEvalElapsedSeconds(0);
      interval = setInterval(() => {
        setEvalElapsedSeconds(Number(((Date.now() - startTime) / 1000).toFixed(1)));
      }, 100);
    } else {
      setEvalElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [evalState.status]);

  const DEFAULT_API_URL = 'https://jdmatcher-be.onrender.com';
  const DEFAULT_FRONTEND_URL = 'https://jdmatcher-fe.onrender.com';

  const [frontendUrl, setFrontendUrl] = useState<string>(DEFAULT_FRONTEND_URL);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_API_URL);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const getApiUrl = async (): Promise<string> => {
    const data = await chrome.storage.local.get(['apiUrl', 'frontendUrl']);
    if (data.apiUrl && typeof data.apiUrl === 'string' && data.apiUrl.trim()) {
      const clean = data.apiUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
      // Guard: Ensure apiUrl is NEVER set to the frontend web app domain
      if (!clean.includes('jdmatcher-fe') && !clean.includes('recruiter-portal') && !clean.includes('jd-matcher-pdm1')) {
        return clean;
      }
    }
    if (data.frontendUrl?.includes('localhost') || data.frontendUrl?.includes('127.0.0.1')) {
      return 'http://localhost:4000';
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:4000';
    }
    return DEFAULT_API_URL;
  };

  // Close candidate dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // 1. Initial State Restoration & Hardware Fingerprint Synchronization
  useEffect(() => {
    // Generate machine hardware fingerprint and store for persistent device locking
    generateHardwareFingerprint().then((fp) => {
      chrome.storage.local.set({ deviceId: fp });
    });

    chrome.storage.local.get(['token', 'userName', 'evaluationState', 'frontendUrl', 'apiUrl'], async (data) => {
      let activeApiUrl = data.apiUrl;
      // If apiUrl is missing, or set to the frontend domain, or contains old test URLs, fix to real backend!
      if (!activeApiUrl || activeApiUrl.includes('jd-matcher-pdm1') || activeApiUrl.includes('jdmatcher-fe') || activeApiUrl.includes('recruiter-portal') || activeApiUrl.includes('jdmatcher-api.onrender.com')) {
        if (data.frontendUrl?.includes('localhost') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          activeApiUrl = 'http://localhost:4000';
        } else {
          activeApiUrl = DEFAULT_API_URL;
        }
        await chrome.storage.local.set({ apiUrl: activeApiUrl });
      }
      setServerUrl(activeApiUrl);

      let activeFrontendUrl = data.frontendUrl;
      // If frontendUrl is missing or points to the old pdm1/app domains, update to the actual frontend: jdmatcher-fe.onrender.com
      if (!activeFrontendUrl || activeFrontendUrl.includes('jd-matcher-pdm1') || activeFrontendUrl.includes('jdmatcher-app.onrender.com')) {
        activeFrontendUrl = DEFAULT_FRONTEND_URL;
        await chrome.storage.local.set({ frontendUrl: DEFAULT_FRONTEND_URL });
      }
      setFrontendUrl(activeFrontendUrl);

      if (data.token) {
        setToken(data.token);
        if (data.userName) setUserName(data.userName);
        fetchCandidates(data.token);
      } else {
        // Automatically attempt to sync session from any active Recruiter Portal tab
        try {
          chrome.runtime.sendMessage({ type: 'SYNC_FROM_PORTAL' }, (res) => {
            if (res && res.success && res.token) {
              setToken(res.token);
              if (res.userName) setUserName(res.userName);
              fetchCandidates(res.token);
            }
          });
        } catch (_e) { }
      }
      if (data.evaluationState) {
        setEvalState(data.evaluationState);
        if (data.evaluationState.selectedCandidateId) {
          setSelectedCandidateId(data.evaluationState.selectedCandidateId);
        }
        if (data.evaluationState.scrapedJdText) {
          setJdText(data.evaluationState.scrapedJdText);
        }
      }
    });

    // Listen for storage changes from background worker or auth bridge
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.token) {
          const newToken = changes.token.newValue || '';
          setToken(newToken);
          if (newToken) fetchCandidates(newToken);
        }
        if (changes.userName) {
          setUserName(changes.userName.newValue || 'Recruiter');
        }
        if (changes.evaluationState) {
          setEvalState(changes.evaluationState.newValue || { status: 'idle' });
        }
        if (changes.frontendUrl) {
          setFrontendUrl(changes.frontendUrl.newValue || 'http://localhost:3000');
        }
        if (changes.apiUrl) {
          setServerUrl(changes.apiUrl.newValue || DEFAULT_API_URL);
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  // Fetch Candidates for Recruiter's Agency (Recruiter isolation enforced by backend)
  const fetchCandidates = async (authToken: string) => {
    if (!authToken) return;
    setIsLoadingCandidates(true);
    setCandidateFetchError('');
    try {
      const baseUrl = await getApiUrl();
      let res = await fetch(`${baseUrl}/candidates`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 404) {
        res = await fetch(`${baseUrl}/api/candidates`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }

      if (res.status === 401) {
        console.warn('[JDMatcher] Token returned 401 Unauthorized. Attempting to sync fresh token from portal...');
        // Try auto-sync with active portal tab before giving up
        try {
          const syncRes = await new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ type: 'SYNC_FROM_PORTAL' }, (response) => {
              resolve(response);
            });
          });
          if (syncRes && syncRes.success && syncRes.token && syncRes.token !== authToken) {
            console.log('[JDMatcher] Successfully retrieved fresh session token from portal tab!');
            setToken(syncRes.token);
            if (syncRes.userName) setUserName(syncRes.userName);
            await fetchCandidates(syncRes.token);
            return;
          }
        } catch (_syncErr) { }

        // Token is genuinely expired and no fresh portal session exists: reset token so login form appears!
        await chrome.storage.local.remove(['token', 'userName']);
        setToken('');
        setUserName('');
        setCandidates([]);
        setLoginError('Your session has expired. Please sign in or click Auto-Sync below.');
        setCandidateFetchError('SESSION_EXPIRED');
        return;
      }

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error === 'ZERO_KNOWLEDGE_VIOLATION') {
          setCandidateFetchError('SUPER_ADMIN_RESTRICTED');
        } else {
          setCandidateFetchError(errJson.message || 'Access restricted for current account.');
        }
        setCandidates([]);
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setCandidateFetchError(errJson.message || `Failed to fetch candidates (Status ${res.status})`);
        setCandidates([]);
        return;
      }

      const list: Candidate[] = await res.json();
      const validList = Array.isArray(list) ? list : [];
      setCandidates(validList);
      if (validList.length === 0) {
        setCandidateFetchError('NO_CANDIDATES');
      }
      setSelectedCandidateId((prev) => {
        if (prev && validList.some((c) => c.id === prev)) return prev;
        return validList.length > 0 ? validList[0].id : '';
      });
    } catch (e: any) {
      console.error('Failed to fetch candidates:', e);
      setCandidateFetchError(e.message || 'Network connection failed. Verify backend is running.');
      setCandidates([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  // Smart reload: attempt syncing fresh token from portal first, then fetch
  const handleSmartRefresh = async () => {
    setIsLoadingCandidates(true);
    setCandidateFetchError('');
    try {
      const syncRes = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SYNC_FROM_PORTAL' }, (response) => {
          resolve(response);
        });
      });
      if (syncRes && syncRes.success && syncRes.token) {
        setToken(syncRes.token);
        if (syncRes.userName) setUserName(syncRes.userName);
        await fetchCandidates(syncRes.token);
        return;
      }
    } catch (_e) { }

    if (token) {
      await fetchCandidates(token);
    } else {
      setIsLoadingCandidates(false);
      setCandidateFetchError('SESSION_EXPIRED');
    }
  };

  // 1-Click Synchronize Session from active Recruiter Portal tab
  const handleSyncPortal = async () => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SYNC_FROM_PORTAL' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, message: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, message: 'No response from background worker' });
          }
        });
      });
      if (res && res.success && res.token) {
        setToken(res.token);
        if (res.userName) setUserName(res.userName);
        await fetchCandidates(res.token);
      } else {
        setLoginError(res.message || 'No active portal session found. Please sign into the Recruiter Portal or enter credentials below.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Portal session sync failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Recruiter Login within Widget (Hardware device-bound)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      let baseUrl = await getApiUrl();
      if (serverUrl && serverUrl.trim()) {
        const cleaned = serverUrl.trim().replace(/\/+$/, '');
        if (!cleaned.includes('jd-matcher-pdm1') && !cleaned.includes('recruiter-portal') && !cleaned.includes('jdmatcher-fe')) {
          baseUrl = cleaned;
          await chrome.storage.local.set({ apiUrl: cleaned });
        }
      }

      let deviceData = await chrome.storage.local.get(['deviceId']);
      let deviceId = deviceData.deviceId;
      if (!deviceId) {
        deviceId = await generateHardwareFingerprint();
        await chrome.storage.local.set({ deviceId });
      }

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({ email: recruiterEmail, password: recruiterPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.message || 'Login failed');
        return;
      }

      const name = data.user?.fullName?.split(' ')[0] || 'Recruiter';
      await chrome.storage.local.set({ token: data.token, userName: name });
      setToken(data.token);
      setUserName(name);
      fetchCandidates(data.token);
    } catch (err: any) {
      setLoginError(err.message || 'Connection error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await chrome.storage.local.remove(['token', 'userName']);
    setToken('');
    setUserName('');
    setCandidates([]);
  };

  // Paste clipboard text directly into textarea without permission prompts
  const handlePasteClipboard = async () => {
    // Strategy 1: Try reading via extension background offscreen document (extension origin - never prompts for site permission)
    try {
      const bgRes = await new Promise<{ success: boolean; text?: string }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'READ_CLIPBOARD' }, (res) => {
          if (chrome.runtime.lastError || !res || !res.success) {
            resolve({ success: false });
          } else {
            resolve(res);
          }
        });
      });

      if (bgRes && bgRes.success && bgRes.text && bgRes.text.trim().length > 0) {
        setJdText(bgRes.text.trim());
        return;
      }
    } catch (_e) {}

    // Strategy 2: Direct navigator.clipboard.readText() (granted silently when in extension popup / context with clipboardRead)
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        setJdText(text.trim());
        return;
      }
    } catch (_err) {}

    // Strategy 3: Focus textarea and trigger document.execCommand('paste')
    try {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.select();
        const success = document.execCommand('paste');
        if (success && textarea.value && textarea.value.trim().length > 0) {
          setJdText(textarea.value.trim());
          return;
        }
      }
    } catch (_e3) {}

    // Fallback: Notify user with smooth inline toast instead of alert popup
    showToast('Clipboard is empty or contains no readable text. Copy a JD first!', 'error');
  };

  // Clear text
  const handleClear = () => {
    setJdText('');
  };

  // Hand Evaluation to Background Service Worker
  const handleEvaluate = async () => {
    let hasValidationError = false;
    if (!selectedCandidateId) {
      setCandidateError('Please select a candidate from your bench.');
      hasValidationError = true;
    } else {
      setCandidateError('');
    }

    if (!jdText || jdText.trim().length < 20) {
      setJdTextError('Job Description must be at least 20 characters.');
      hasValidationError = true;
    } else {
      setJdTextError('');
    }

    if (hasValidationError) {
      showToast('Please fix the highlighted fields to evaluate.', 'error');
      return;
    }

    setSaveSuccessMsg('');
    setSaveErrorMsg('');
    setEvalState({ status: 'loading' });

    const firstLine = jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 80);
    let derivedJobTitle = firstLine.length > 5 ? firstLine : '';
    let currentTabUrl = window.location.href;

    try {
      if (chrome.tabs && chrome.tabs.query) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) currentTabUrl = activeTab.url;
        if (!derivedJobTitle && activeTab?.title) {
          derivedJobTitle = activeTab.title.split('-')[0].trim();
        }
      }
    } catch (_e) { }

    if (!derivedJobTitle) {
      derivedJobTitle = selectedCandidate ? `${selectedCandidate.primaryTitle} Opportunity` : 'Software Opportunity';
    }

    try {
      const response = await new Promise<any>((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              type: 'START_EVALUATION',
              payload: {
                candidateId: selectedCandidateId,
                jdText,
                jobTitle: derivedJobTitle,
                jobUrl: currentTabUrl,
              },
            },
            (res) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(res);
              }
            }
          );
        } catch (msgErr: any) {
          resolve({ success: false, error: msgErr.message });
        }
      });

      if (response && response.success && response.result) {
        setEvalState({
          status: 'success',
          result: response.result,
          jobTitle: derivedJobTitle,
        });
        return;
      } else if (response && response.status === 'locked_402') {
        setEvalState({
          status: 'locked_402',
          errorMessage: response.error,
        });
        return;
      } else if (response && response.status === 'locked_device') {
        setEvalState({
          status: 'locked_device',
          errorMessage: response.error,
        });
        return;
      } else if (response && response.error) {
        setEvalState({
          status: 'error',
          errorMessage: response.error,
        });
        return;
      }

      setEvalState({
        status: 'error',
        errorMessage: 'AI evaluation failed. Please verify that the backend server is running and Gemini 3.5 Flash-Lite is accessible.',
      });
    } catch (err: any) {
      console.error('Failed to trigger evaluation:', err);
      setEvalState({
        status: 'error',
        errorMessage: err.message || 'Failed to complete evaluation. Please check your backend connection.',
      });
    }
  };

  // Recruiter Action: Save as Applied
  const handleSaveApplied = async () => {
    if (!evalState.result) return;
    const evalResult = evalState.result;
    setIsSaving(true);

    try {
      let titleToSave = evalResult.jobTitle || evalState.jobTitle;
      if (!titleToSave || titleToSave === 'Opportunity' || titleToSave === 'Software Opportunity' || titleToSave === 'Job Application') {
        const titleMatch = jdText.match(/(?:job\s*title|role|position)\s*[:\-–]?\s*([^\n\r,\.]{3,50})/i);
        if (titleMatch && titleMatch[1]) {
          titleToSave = titleMatch[1].trim();
        } else {
          const firstLine = jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 80);
          titleToSave = firstLine.length > 5 ? firstLine : (selectedCandidate ? `${selectedCandidate.primaryTitle} Opportunity` : 'Software Opportunity');
        }
      }

      let companyToSave = evalResult.companyName || evalState.companyOrClient;
      if (!companyToSave || companyToSave === 'Confidential / Client' || companyToSave === 'Client') {
        const compMatch = jdText.match(/(?:company|client|employer|organization|at|with)\s*[:\-–]?\s*([A-Z][A-Za-z0-9&.\s]{2,35})/);
        if (compMatch && compMatch[1]) {
          companyToSave = compMatch[1].trim();
        } else {
          companyToSave = 'Confidential / Client';
        }
      }

      let currentTabUrl = window.location.href;
      try {
        if (chrome.tabs && chrome.tabs.query) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.url) currentTabUrl = activeTab.url;
        }
      } catch (_e) { }

      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'SAVE_APPLIED',
            payload: {
              candidateId: selectedCandidateId,
              jobTitle: titleToSave,
              companyOrClient: companyToSave,
              jobUrl: currentTabUrl,
              rawJdText: jdText,
              verdict: evalResult.verdict,
              matchScore: evalResult.matchScore,
              matchReasoning: evalResult.verdictJustification || evalResult.reasoning,
            },
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res);
            }
          }
        );
      });

      if (!response || response.success === false || response.error) {
        throw new Error(response?.error || 'Failed to save matched JD');
      }

      // Clear out evaluation result and pasted JD text upon saving
      await chrome.storage.local.remove(['evaluationState']);
      setEvalState({ status: 'idle' });
      setJdText('');

      setSaveSuccessMsg('Saved to Matched JDs & Cleared!');
      setSaveErrorMsg('');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err: any) {
      setSaveErrorMsg(err.message || 'Failed to save matched JD');
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Recruiter Action: Not Applied (Clear out without DB save)
  const handleDiscard = async () => {
    await chrome.storage.local.remove(['evaluationState']);
    setEvalState({ status: 'idle' });
    setSaveSuccessMsg('');
    setJdText('');
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];
  const initials = selectedCandidate
    ? selectedCandidate.fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    : 'JD';

  const filteredCandidates = candidates.filter((c) => {
    if (!candidateSearchQuery.trim()) return true;
    const q = candidateSearchQuery.toLowerCase().trim();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.primaryTitle && c.primaryTitle.toLowerCase().includes(q)) ||
      (c.recruiterName && c.recruiterName.toLowerCase().includes(q))
    );
  });

  const evalResult = evalState.result;
  const isApply = (evalResult?.verdict || '').toUpperCase() === 'APPLY';
  const matchAssessment = evalResult?.matchAssessment || (isApply ? 'Strong Match' : 'Weak Match');

  // Smart Role / Job Title derivation matching D:\JD Matcher
  let derivedJobTitle = evalResult?.jobTitle;
  if (!derivedJobTitle || derivedJobTitle === 'Opportunity' || derivedJobTitle === 'Job Application' || derivedJobTitle === 'Not Specified') {
    const titleMatch = jdText.match(/(?:title|role|position|seeking a|hiring a)\s*[:\-]?\s*([^\n\r,\.]{3,50})/i);
    if (titleMatch && titleMatch[1]) {
      derivedJobTitle = titleMatch[1].trim();
    } else {
      const firstLine = jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().substring(0, 60);
      if (firstLine && !firstLine.toLowerCase().includes('job description') && firstLine.length > 3) {
        derivedJobTitle = firstLine;
      } else {
        derivedJobTitle = selectedCandidate ? `${selectedCandidate.primaryTitle} Opportunity` : 'Opportunity';
      }
    }
  }

  // Smart Company Name derivation matching D:\JD Matcher
  let derivedCompanyName = evalResult?.companyName;
  if (!derivedCompanyName || derivedCompanyName === 'Client' || derivedCompanyName === 'Confidential / Client' || derivedCompanyName === 'Direct Client / Vendor') {
    const compMatch = jdText.match(/(?:company|client|organization|at|with)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&]{2,35})/);
    if (compMatch && compMatch[1]) {
      derivedCompanyName = compMatch[1].trim();
    } else {
      derivedCompanyName = 'Confidential / Client';
    }
  }

  const jobTitleToDisplay = derivedJobTitle;
  const companyNameToDisplay = derivedCompanyName;
  const candidateNameToDisplay = evalResult?.candidateName || (selectedCandidate ? selectedCandidate.fullName : 'Candidate');

  const isEligibilityPassed = typeof evalResult?.isEligible === 'boolean'
    ? evalResult.isEligible
    : isApply;

  const eligibilityMessage = evalResult?.eligibilityCheck ||
    (isEligibilityPassed
      ? 'No auto-skip triggers detected. Meets standard bench eligibility.'
      : 'No-Go — Client requirement barrier or auto-skip trigger detected.');

  const alignedItems: string[] = Array.isArray(evalResult?.candidateFitCheck?.alignedSkills)
    ? evalResult.candidateFitCheck.alignedSkills
    : Array.isArray(evalResult?.keyStrengths)
      ? evalResult.keyStrengths
      : [];

  const missingItems: string[] = Array.isArray(evalResult?.candidateFitCheck?.gaps)
    ? evalResult.candidateFitCheck.gaps
    : Array.isArray(evalResult?.missingCriticalSkills)
      ? evalResult.missingCriticalSkills
      : [];

  const naturalHighlights: string[] = Array.isArray(evalResult?.naturalFitHighlights)
    ? evalResult.naturalFitHighlights
    : [];

  const applicationQuestions: Array<{ question: string; answer: string }> = Array.isArray(evalResult?.applicationQuestions)
    ? evalResult.applicationQuestions
    : [];

  const strategicNotes = evalResult?.otherNotes || evalResult?.strategicNotes || '';

  return (
    <div ref={containerRef} className="jdm-popup-window">
      {/* Non-intrusive Toast Notifications */}
      {toastMessage && (
        <div className="jdm-toast-container">
          <div className={`jdm-toast jdm-toast-${toastMessage.type}`}>
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 1. Top Dark Section (Header, Active Candidate, Quota Bar) */}
      <div className="jdm-top-dark-section">
        {/* Header Bar */}
        <div className="jdm-header">
          <div className="jdm-header-left">
            <ExtensionLogo size={34} className="shrink-0" />
            <div>
              <div className="jdm-title-row">
                <span className="jdm-app-name">JD Matcher</span>
                <span className="jdm-pro-badge">PRO</span>
              </div>
              <div className="jdm-subtext">Bench Sales AI • Gemini 3.5 Flash-Lite</div>
            </div>
          </div>

          <div className="jdm-header-right">
            {token && (
              <div className="jdm-user-pill">
                <span className="jdm-status-dot" />
                <span className="jdm-user-icon">👤</span>
                <span>{userName || 'Recruiter'}</span>
              </div>
            )}
            {token && (
              <button className="jdm-icon-btn" onClick={handleLogout} title="Sign Out">
                ↪
              </button>
            )}
            <a
              href={`${frontendUrl}/recruiter-portal/candidates`}
              target="_blank"
              rel="noreferrer"
              className="jdm-icon-btn"
              title="Open Settings"
            >
              ⚙
            </a>
            <button className="jdm-icon-btn" onClick={onClose} title="Close Widget">
              ✕
            </button>
          </div>
        </div>

        {token && (
          <>
            {/* Active Bench Candidate Section */}
            <div className="jdm-candidate-section">
              <div className="jdm-candidate-header">
                <span className="jdm-candidate-label">ACTIVE BENCH CANDIDATE</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleSmartRefresh}
                    disabled={isLoadingCandidates}
                    className={`jdm-refresh-icon-btn ${isLoadingCandidates ? 'is-spinning' : ''}`}
                    title="Refresh Candidate Roster"
                  >
                    ↻
                  </button>
                  {candidates.length > 0 && (
                    <span className="jdm-resume-active-badge">✓ RESUME ACTIVE</span>
                  )}
                </div>
              </div>

              {isLoadingCandidates && candidates.length === 0 ? (
                <div className="jdm-candidate-card" style={{ cursor: 'wait' }}>
                  <div className="jdm-candidate-card-left">
                    <div className="jdm-candidate-avatar" style={{ background: '#334155' }}>
                      <span className="jdm-spinner" style={{ width: '16px', height: '16px' }} />
                    </div>
                    <div className="jdm-candidate-info">
                      <div className="jdm-candidate-name">Loading Candidates...</div>
                      <div className="jdm-candidate-title">Connecting to agency talent roster</div>
                    </div>
                  </div>
                </div>
              ) : candidates.length === 0 ? (
                /* Enhanced Empty State Card when no candidates exist */
                <div className="jdm-no-candidates-card">
                  <div className="jdm-no-candidates-icon-wrap">
                    <span className="jdm-no-candidates-icon">👥</span>
                  </div>
                  <div className="jdm-no-candidates-title">
                    {candidateFetchError === 'SESSION_EXPIRED' ? 'Session Expired' : 'No Candidates Found'}
                  </div>
                  <div className="jdm-no-candidates-desc">
                    {candidateFetchError === 'SUPER_ADMIN_RESTRICTED'
                      ? 'You are signed in as Super Admin. Super Admins are restricted from viewing candidate talent resumes. Please sign in as a Recruiter or Org Admin.'
                      : candidateFetchError === 'SESSION_EXPIRED'
                        ? 'Your login session has expired or is invalid. Click Auto-Sync below if you are signed in on the Recruiter Portal, or sign in again.'
                        : candidateFetchError && candidateFetchError !== 'NO_CANDIDATES'
                          ? candidateFetchError
                          : 'No active bench candidates found in your agency roster. Upload or add candidates via the Recruiter Portal to start evaluating.'}
                  </div>
                  <div className="jdm-no-candidates-actions">
                    {candidateFetchError === 'SESSION_EXPIRED' ? (
                      <>
                        <button
                          type="button"
                          onClick={handleSyncPortal}
                          disabled={isLoggingIn || isLoadingCandidates}
                          className="jdm-btn-add-candidate"
                          style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          title="Instantly link login from your open Recruiter Portal browser tab"
                        >
                          <span>⚡</span>
                          <span>{isLoggingIn ? 'Syncing...' : 'Auto-Sync Session'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="jdm-btn-refresh-candidate"
                          title="Sign in with email and password"
                        >
                          ↪ Sign In
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          href={`${frontendUrl}/recruiter-portal/candidates`}
                          target="_blank"
                          rel="noreferrer"
                          className="jdm-btn-add-candidate"
                        >
                          <span>+</span>
                          <span>Add Candidates in Portal</span>
                        </a>
                        <button
                          type="button"
                          onClick={handleSmartRefresh}
                          disabled={isLoadingCandidates}
                          className="jdm-btn-refresh-candidate"
                          title="Reload candidates from database"
                        >
                          {isLoadingCandidates ? 'Loading...' : '↻ Refresh'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Enhanced Custom Dropdown Trigger & Popover */}
                  <div className="jdm-dropdown-container" ref={dropdownRef}>
                  <div
                    className={`jdm-candidate-card ${isDropdownOpen ? 'is-open' : ''} ${candidateError ? 'jdm-card-error' : ''}`}
                    onClick={() => {
                      setIsDropdownOpen(!isDropdownOpen);
                      if (candidateError) setCandidateError('');
                    }}
                    role="button"
                    tabIndex={0}
                    title="Click to switch candidate profile"
                  >
                    <div className="jdm-candidate-card-left">
                      <div className="jdm-candidate-avatar">{initials}</div>
                      <div className="jdm-candidate-info">
                        <div className="jdm-candidate-name">
                          {selectedCandidate ? selectedCandidate.fullName : 'Select Candidate'}
                        </div>
                        <div className="jdm-candidate-title">
                          {selectedCandidate ? selectedCandidate.primaryTitle : 'No Candidate Selected'}
                        </div>
                      </div>
                    </div>
                    <div className="jdm-candidate-caret-wrap">
                      <span className={`jdm-candidate-caret ${isDropdownOpen ? 'is-rotated' : ''}`}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* Floating Custom Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="jdm-candidate-dropdown-menu">
                      <div className="jdm-dropdown-header">
                        <span className="jdm-dropdown-header-title">Switch Bench Profile</span>
                        <span className="jdm-dropdown-count-badge">
                          {filteredCandidates.length} of {candidates.length} Profiles
                        </span>
                      </div>

                      {/* Search Bar for Quick Filtering */}
                      {candidates.length > 2 && (
                        <div className="jdm-dropdown-search-wrap">
                          <span className="jdm-dropdown-search-icon">🔍</span>
                          <input
                            type="text"
                            className="jdm-dropdown-search-input"
                            value={candidateSearchQuery}
                            onChange={(e) => setCandidateSearchQuery(e.target.value)}
                            placeholder="Filter by name or title..."
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          {candidateSearchQuery && (
                            <button
                              type="button"
                              className="jdm-dropdown-search-clear"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCandidateSearchQuery('');
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}

                      {/* Candidate Options List */}
                      <div className="jdm-dropdown-list">
                        {filteredCandidates.length === 0 ? (
                          <div className="jdm-dropdown-empty">
                            No profiles match "{candidateSearchQuery}"
                          </div>
                        ) : (
                          filteredCandidates.map((c) => {
                            const isSelected = c.id === (selectedCandidate?.id || '');
                            const optInitials = c.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase();

                            return (
                              <div
                                key={c.id}
                                className={`jdm-candidate-option ${isSelected ? 'is-selected' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCandidateId(c.id);
                                  setCandidateError('');
                                  setIsDropdownOpen(false);
                                  setCandidateSearchQuery('');
                                }}
                              >
                                <div className="jdm-candidate-option-left">
                                  <div className="jdm-candidate-option-avatar">
                                    {optInitials}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="jdm-candidate-option-name">{c.fullName}</div>
                                    <div className="jdm-candidate-option-title">{c.primaryTitle}</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  {c.recruiterName && (
                                    <span className="jdm-candidate-option-badge" title={`Added by ${c.recruiterName}`}>
                                      {c.recruiterName.split(' ')[0]}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="jdm-candidate-option-check">✓</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      <div className="jdm-dropdown-footer">
                        <a
                          href={`${frontendUrl}/recruiter-portal/candidates`}
                          target="_blank"
                          rel="noreferrer"
                          className="jdm-dropdown-footer-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>+ Manage / Add candidates in Portal →</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                  {candidateError && (
                    <div className="jdm-inline-validation-msg">
                      ⚠️ {candidateError}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Quota Bar */}
            <div className="jdm-quota-bar">
              <span className="jdm-quota-left">⚡ Bench AI Active</span>
              <span className="jdm-quota-right">{candidates.length} Profiles Available</span>
            </div>
          </>
        )}
      </div>

      {/* 2. Main Popup Content */}
      <div className="jdm-popup-content">
        {!token ? (
          /* Login Form */
          <form onSubmit={handleLogin} className="jdm-login-box">
            <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
              Sign In to Your Recruiter Seat
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
              Credentials bind your physical machine hardware to your agency seat.
            </p>
            {loginError && <div className="jdm-error-alert">{loginError}</div>}

            {/* Auto-Sync with Recruiter Portal Tab */}
            <div style={{ marginTop: '10px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={handleSyncPortal}
                disabled={isLoggingIn}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                }}
              >
                <span>⚡</span>
                <span>{isLoggingIn ? 'Syncing Session...' : 'Auto-Sync from Recruiter Portal Tab'}</span>
              </button>
              <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                Signed in on the web portal? Click above to instantly link this extension.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0', gap: '8px' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>or sign in manually</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>

            <div>
              <label className="jdm-field-label">Email</label>
              <input
                type="email"
                className="jdm-text-input"
                value={recruiterEmail}
                onChange={(e) => setRecruiterEmail(e.target.value)}
                placeholder="recruiter@agency.com"
                required
              />
            </div>
            <div>
              <label className="jdm-field-label">Password</label>
              <input
                type="password"
                className="jdm-text-input"
                value={recruiterPassword}
                onChange={(e) => setRecruiterPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div style={{ marginTop: '2px', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6366f1',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⚙ {showServerConfig ? 'Hide Server Configuration' : 'Server Connection (Render / Production)'}
              </button>

              {showServerConfig && (
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '6px' }}>
                  <label className="jdm-field-label" style={{ marginBottom: '4px' }}>Backend API URL</label>
                  <input
                    type="url"
                    className="jdm-text-input"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://jdmatcher-be.onrender.com"
                    style={{ fontSize: '11px', marginBottom: '6px' }}
                  />
                  <label className="jdm-field-label" style={{ marginBottom: '4px' }}>Frontend App URL</label>
                  <input
                    type="url"
                    className="jdm-text-input"
                    value={frontendUrl}
                    onChange={(e) => {
                      setFrontendUrl(e.target.value);
                      chrome.storage.local.set({ frontendUrl: e.target.value.trim().replace(/\/+$/, '') });
                    }}
                    placeholder="https://jdmatcher-fe.onrender.com"
                    style={{ fontSize: '11px' }}
                  />
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                    Tip: Enter your live Render backend URL above.
                  </div>
                </div>
              )}
            </div>

            <button type="submit" className="jdm-btn-submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'Verifying Hardware Lock...' : 'Sign In & Access Bench'}
            </button>

            <div style={{ marginTop: '8px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setRecruiterEmail('recruiter@apexit.com');
                  setRecruiterPassword('Recruiter2026!');
                  setLoginError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4f46e5',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px',
                }}
              >
                Quick-Fill Demo Recruiter Credentials (Apex IT)
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Open Settings & Matched JDs Card */}
            <a
              href={`${frontendUrl}/recruiter-portal/matched-jds`}
              target="_blank"
              rel="noreferrer"
              className="jdm-settings-card"
            >
              <div className="jdm-settings-icon-wrap">⚙</div>
              <div>
                <div className="jdm-settings-title">Open Settings & Matched JDs</div>
                <div className="jdm-settings-sub">Manage candidates, view exact JDs & export →</div>
              </div>
            </a>

            {/* Paste Incoming Job Description Box */}
            <div className="jdm-jd-card">
              <div className="jdm-jd-header">
                <div className="jdm-jd-title">
                  <span className="jdm-sparkle">✨</span>
                  <span>PASTE INCOMING JOB DESCRIPTION</span>
                </div>
                <div className="jdm-jd-actions">
                  <button type="button" onClick={handlePasteClipboard} className="jdm-btn-action jdm-btn-paste">
                    📋 Paste
                  </button>
                  <button type="button" onClick={handleClear} className="jdm-btn-action">
                    ✕ Clear
                  </button>
                </div>
              </div>

              <div className={`jdm-textarea-wrap ${jdTextError ? 'jdm-wrap-error' : ''}`}>
                <textarea
                  ref={textareaRef}
                  className="jdm-jd-textarea"
                  value={jdText}
                  onChange={(e) => {
                    setJdText(e.target.value);
                    if (jdTextError) setJdTextError('');
                  }}
                  placeholder="Paste Job Description here (responsibilities, required qualifications, client info)..."
                  rows={5}
                />
                <div className="jdm-textarea-footer">
                  <span className="jdm-footer-tag">🛡 Natural Fit Quality Blueprint</span>
                  <span className="jdm-char-count">{jdText.length.toLocaleString()} characters</span>
                </div>
              </div>
              {jdTextError && (
                <div className="jdm-inline-validation-msg">
                  ⚠️ {jdTextError}
                </div>
              )}
            </div>

            {/* Evaluate CTA Button */}
            <button
              className="jdm-evaluate-btn"
              onClick={handleEvaluate}
              disabled={
                evalState.status === 'loading' ||
                evalState.status === 'locked_402' ||
                candidates.length === 0
              }
              title={
                candidates.length === 0
                  ? 'Please add candidates in the Recruiter Portal before evaluating'
                  : 'Evaluate Candidate Against JD'
              }
            >
              {evalState.status === 'loading' ? (
                <>
                  <div className="jdm-spinner" />
                  <span>Evaluating Candidate Against JD...</span>
                </>
              ) : candidates.length === 0 ? (
                <>
                  <span>⚠️</span>
                  <span>No Candidates Available to Match</span>
                </>
              ) : (
                <>
                  <span className="jdm-bolt">⚡</span>
                  <span>Evaluate Candidate Against JD</span>
                </>
              )}
            </button>

            {/* Real-Time Evaluation Progress Card */}
            {evalState.status === 'loading' && (
              <div className="jdm-eval-progress-card">
                <div className="jdm-progress-header">
                  <div className="jdm-progress-title-wrap">
                    <span className="jdm-spinner" style={{ width: '13px', height: '13px' }} />
                    <span className="jdm-progress-title">Evaluating Candidate Against JD</span>
                    <span className="jdm-progress-model-badge">gemini-3.5-flash-lite</span>
                  </div>
                  <span className="jdm-progress-timer">{evalElapsedSeconds.toFixed(1)}s</span>
                </div>

                <div className="jdm-progress-steps">
                  <div className={`jdm-progress-step ${evalElapsedSeconds >= 0.4 ? 'is-done' : 'is-active'}`}>
                    <div className="jdm-step-icon">
                      {evalElapsedSeconds >= 0.4 ? '✓' : <div className="jdm-step-spinner" />}
                    </div>
                    <span>1. Analyzing Technical Requirements & Deliverables</span>
                  </div>

                  <div
                    className={`jdm-progress-step ${
                      evalElapsedSeconds >= 1.1
                        ? 'is-done'
                        : evalElapsedSeconds >= 0.4
                        ? 'is-active'
                        : 'is-pending'
                    }`}
                  >
                    <div className="jdm-step-icon">
                      {evalElapsedSeconds >= 1.1 ? (
                        '✓'
                      ) : evalElapsedSeconds >= 0.4 ? (
                        <div className="jdm-step-spinner" />
                      ) : (
                        '○'
                      )}
                    </div>
                    <span>2. Checking Basic Eligibility (Visa, Clearance, Overqual)</span>
                  </div>

                  <div
                    className={`jdm-progress-step ${
                      evalElapsedSeconds >= 1.1 ? 'is-active' : 'is-pending'
                    }`}
                  >
                    <div className="jdm-step-icon">
                      {evalElapsedSeconds >= 1.1 ? (
                        <div className="jdm-step-spinner" />
                      ) : (
                        '○'
                      )}
                    </div>
                    <span>3. Calculating Natural Fit Stack Alignment</span>
                  </div>
                </div>

                <div className="jdm-shimmer-box">
                  <div className="jdm-shimmer-hero" />
                  <div className="jdm-shimmer-line" style={{ width: '90%' }} />
                  <div className="jdm-shimmer-line" style={{ width: '75%' }} />
                </div>
              </div>
            )}

            {/* Lockout & Error Alerts */}
            {evalState.status === 'locked_402' && (
              <div className="jdm-error-alert" style={{ background: '#fff1f2', borderColor: '#f43f5e', color: '#9f1239' }}>
                <div style={{ fontWeight: 700 }}>⚠️ Security Deposit Limit Reached</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {evalState.errorMessage || 'Agency prepaid balance depleted. Evaluations are paused until settled with Super Admin.'}
                </div>
              </div>
            )}

            {evalState.status === 'locked_device' && (
              <div className="jdm-error-alert" style={{ background: '#fff1f2', borderColor: '#f43f5e', color: '#9f1239' }}>
                <div style={{ fontWeight: 700 }}>🔒 Hardware Device Locked</div>
                <div style={{ fontSize: '11px', marginTop: '3px', lineHeight: 1.4 }}>
                  {evalState.errorMessage || 'This seat is locked to another machine.'}
                  <div style={{ marginTop: '4px', fontWeight: 600 }}>
                    Please contact your Super Admin to reset your hardware device authorization.
                  </div>
                </div>
              </div>
            )}

            {evalState.status === 'error' && (
              <div className="jdm-error-alert">
                <div style={{ fontWeight: 700 }}>Evaluation Error</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {evalState.errorMessage || 'Unable to complete evaluation. Ensure backend is running.'}
                </div>
              </div>
            )}

            {saveSuccessMsg && <div className="jdm-success-alert">✓ {saveSuccessMsg}</div>}
            {saveErrorMsg && <div className="jdm-error-alert">⚠️ {saveErrorMsg}</div>}

            {/* 3. Dynamic Live Results Card (1:1 Exact Blueprint to Image 1 / D:\JD Matcher) */}
            {evalState.status === 'success' && evalResult && (
              <div id="result-card" className="result-card">
                {/* Hero Verdict Banner */}
                <div id="verdict-banner" className={`verdict-hero-card ${isApply ? 'banner-apply' : 'banner-skip'}`}>
                  <div className="hero-top-row">
                    <div className="verdict-pill-wrap">
                      <span id="verdict-tag" className="verdict-badge-large">
                        {isApply ? '✓ APPLY' : '✕ SKIP'}
                      </span>
                    </div>
                    <div className="match-pill-wrap">
                      <span id="match-rating-badge" className="match-rating-pill">
                        {matchAssessment}
                      </span>
                    </div>
                  </div>

                  <div className="hero-role-block">
                    <div id="res-role-title" className="hero-job-title">{jobTitleToDisplay}</div>
                    <div id="res-company-name" className="hero-company-name">{companyNameToDisplay}</div>
                  </div>

                  <div className="hero-cand-row">
                    <span className="hero-cand-icon">👤</span>
                    <span id="res-cand-name" className="hero-cand-val">{candidateNameToDisplay}</span>
                    <span className="hero-meta-divider">•</span>
                    <span className="hero-badge-tag">Zero Tailoring Policy</span>
                  </div>
                </div>

                {/* Section 1: Eligibility Alert Callout */}
                <div id="section-eligibility" className={`card-box eligibility-box ${isEligibilityPassed ? 'elig-passed' : 'elig-failed'}`}>
                  <div className="box-title-row">
                    <div className="box-title-left">
                      <span id="elig-icon" className="box-icon">{isEligibilityPassed ? '🛡️' : '⚠️'}</span>
                      <span className="box-label">1. ELIGIBILITY VERIFICATION</span>
                    </div>
                    <span id="elig-status-badge" className={`micro-badge ${isEligibilityPassed ? 'badge-passed' : 'badge-failed'}`}>
                      {isEligibilityPassed ? 'PASSED' : 'FLAGGED'}
                    </span>
                  </div>
                  <div id="res-eligibility-text" className="box-content-text">{eligibilityMessage}</div>
                </div>

                {/* Section 2: Decision Justification */}
                <div className="card-box quote-box">
                  <div className="box-label-sub">
                    <span className="sub-icon">🎯</span> Decision Justification
                  </div>
                  <div id="res-justification" className="justification-quote">
                    {evalResult.verdictJustification || evalResult.reasoning || (isApply ? 'Natural overlap matches core technical deliverables.' : 'Gaps exceed benchmark for zero-tailoring placement.')}
                  </div>
                </div>

                {/* Section 3: Fit Check (Aligned vs Gaps) */}
                <div className="card-box fit-section-box">
                  <div className="box-label-sub">
                    <span className="sub-icon">⚖️</span> Candidate Stack Matrix
                  </div>
                  <div className="fit-columns-grid">
                    <div className="fit-column col-aligned">
                      <div className="col-header aligned-header">
                        <span>✓ Aligned Overlaps</span>
                        <span id="count-aligned" className="chip-count count-aligned">{alignedItems.length}</span>
                      </div>
                      <div id="res-aligned-skills" className="chip-container">
                        {alignedItems.length === 0 ? (
                          <span className="chip" style={{ background: '#f1f5f9', color: '#64748b' }}>None detected</span>
                        ) : (
                          alignedItems.map((skill, idx) => (
                            <span key={idx} className="chip chip-aligned">
                              ✓ {skill.replace(/^[✓\s*•-]+/, '')}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="fit-column col-gaps">
                      <div className="col-header gaps-header">
                        <span>✕ Missing Gaps</span>
                        <span id="count-gaps" className="chip-count count-gaps">{missingItems.length}</span>
                      </div>
                      <div id="res-gaps" className="chip-container">
                        {missingItems.length === 0 ? (
                          <span className="chip" style={{ background: '#f0fdf4', color: '#065f46' }}>No critical gaps</span>
                        ) : (
                          missingItems.map((gap, idx) => (
                            <span key={idx} className="chip chip-gap">
                              ✕ {gap.replace(/^[✕\s*•-]+/, '')}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Strategic Notes */}
                {strategicNotes && (
                  <div id="section-notes" className="card-box strategy-box">
                    <div className="box-label-sub">
                      <span className="sub-icon">💡</span> Strategic Placement Notes
                    </div>
                    <div id="res-other-notes" className="strategy-text">{strategicNotes}</div>
                  </div>
                )}

                {/* Section 5: Natural Fit Highlights (Zero Tailoring) - Shown when Apply */}
                {isApply && naturalHighlights.length > 0 && (
                  <div id="section-highlights" className="card-box highlights-box">
                    <div className="box-label-sub">
                      <span className="sub-icon">✨</span> Natural Fit Highlights (Zero Tailoring)
                    </div>
                    <ul id="res-highlights-list" className="styled-highlights-list">
                      {naturalHighlights.map((hl, idx) => (
                        <li key={idx} className="highlight-item">
                          <span className="highlight-bullet">✦</span>
                          <span>{hl.replace(/^[✦•\s*-]+/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Section 6: Application Questions (if any) */}
                {applicationQuestions.length > 0 && (
                  <div id="section-questions" className="card-box qa-box">
                    <div className="box-label-sub">
                      <span className="sub-icon">💬</span> Application Questions &amp; Draft Answers
                    </div>
                    <div id="res-questions-container" className="qa-block-list">
                      {applicationQuestions.map((qa, idx) => (
                        <div key={idx} className="qa-item">
                          <div className="qa-q-row">
                            <div className="qa-q">Q: {qa.question}</div>
                            <button
                              type="button"
                              className="btn-copy-qa"
                              title="Copy answer to clipboard"
                              onClick={() => {
                                navigator.clipboard.writeText(qa.answer);
                                setSaveSuccessMsg('Copied answer to clipboard!');
                                setTimeout(() => setSaveSuccessMsg(''), 2000);
                              }}
                            >
                              Copy Answer
                            </button>
                          </div>
                          <div className="qa-a">{qa.answer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decision Footer Actions: ONLY Applied / Not Applied */}
                <div className="verdict-footer-actions">
                  <button
                    type="button"
                    id="btn-applied"
                    className="footer-btn btn-applied"
                    onClick={handleSaveApplied}
                    disabled={isSaving}
                    title="Save this JD as Applied"
                  >
                    <span className="btn-action-icon">✓</span>
                    <span className="btn-action-label">{isSaving ? 'Saving...' : 'Applied'}</span>
                  </button>
                  <button
                    type="button"
                    id="btn-not-applied"
                    className="footer-btn btn-not-applied"
                    onClick={handleDiscard}
                    disabled={isSaving}
                    title="Do not save - Clear JD"
                  >
                    <span className="btn-action-icon">✕</span>
                    <span className="btn-action-label">Not Applied</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
