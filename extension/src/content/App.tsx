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

  // JD Inputs
  const [jdText, setJdText] = useState<string>('');

  // Evaluation & Storage State
  const [evalState, setEvalState] = useState<StoredEvaluationState>({ status: 'idle' });
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const DEFAULT_API_URL = 'https://jdmatcher-be.onrender.com';
  const DEFAULT_FRONTEND_URL = 'https://jdmatcher-fe.onrender.com';

  const [frontendUrl, setFrontendUrl] = useState<string>(DEFAULT_FRONTEND_URL);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_API_URL);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const getApiUrl = async (): Promise<string> => {
    const data = await chrome.storage.local.get(['apiUrl', 'frontendUrl']);
    if (data.apiUrl) return data.apiUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    if (data.frontendUrl?.includes('localhost') || data.frontendUrl?.includes('127.0.0.1')) {
      return 'http://localhost:4000';
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:4000';
    }
    return DEFAULT_API_URL;
  };

  // 1. Initial State Restoration & Hardware Fingerprint Synchronization
  useEffect(() => {
    // Generate machine hardware fingerprint and store for persistent device locking
    generateHardwareFingerprint().then((fp) => {
      chrome.storage.local.set({ deviceId: fp });
    });

    chrome.storage.local.get(['token', 'userName', 'evaluationState', 'frontendUrl', 'apiUrl'], async (data) => {
      let activeApiUrl = data.apiUrl;
      if (!activeApiUrl) {
        if (data.frontendUrl?.includes('localhost') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          activeApiUrl = 'http://localhost:4000';
          await chrome.storage.local.set({ apiUrl: 'http://localhost:4000' });
        } else {
          activeApiUrl = DEFAULT_API_URL;
        }
      }
      setServerUrl(activeApiUrl);

      if (data.frontendUrl) {
        setFrontendUrl(data.frontendUrl);
      }
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
        } catch (_e) {}
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
    try {
      const baseUrl = await getApiUrl();
      const res = await fetch(`${baseUrl}/candidates`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const list: Candidate[] = await res.json();
        setCandidates(list);
        setSelectedCandidateId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          return list.length > 0 ? list[0].id : '';
        });
      }
    } catch (e) {
      console.error('Failed to fetch candidates:', e);
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
        baseUrl = cleaned;
        await chrome.storage.local.set({ apiUrl: cleaned });
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

  // Paste last copied clipboard text directly into textarea
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        setJdText(text.trim());
      } else {
        alert('Clipboard is empty or does not contain text. Copy a JD first!');
      }
    } catch (_err) {
      alert('Clipboard access denied. Please click inside the text area and press Ctrl+V / Cmd+V.');
    }
  };

  // Clear text
  const handleClear = () => {
    setJdText('');
  };

  // Hand Evaluation to Background Service Worker
  const handleEvaluate = async () => {
    if (!selectedCandidateId) {
      alert('Please select a bench candidate.');
      return;
    }
    if (!jdText || jdText.trim().length < 20) {
      alert('Job Description text must be at least 20 characters.');
      return;
    }

    setSaveSuccessMsg('');
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
    } catch (_e) {}

    if (!derivedJobTitle) {
      derivedJobTitle = selectedCandidate ? `${selectedCandidate.primaryTitle} Opportunity` : 'Software Opportunity';
    }

    try {
      const response = await new Promise<any>((resolve) => {
        let resolved = false;
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
              resolved = true;
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(res);
              }
            }
          );
          setTimeout(() => {
            if (!resolved) {
              resolve(null);
            }
          }, 3500);
        } catch (_e: any) {
          resolve(null);
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

      // Direct fallback fetch from content script if background script did not respond
      const baseUrl = await getApiUrl();
      let deviceData = await chrome.storage.local.get(['deviceId']);
      let deviceId = deviceData.deviceId;
      if (!deviceId) {
        deviceId = await generateHardwareFingerprint();
        await chrome.storage.local.set({ deviceId });
      }

      const res = await fetch(`${baseUrl}/analyze/eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          candidateId: selectedCandidateId,
          jdText,
          jobTitle: derivedJobTitle,
          jobUrl: window.location.href,
        }),
      });

      if (res.status === 402) {
        const errJson = await res.json().catch(() => ({}));
        setEvalState({
          status: 'locked_402',
          errorMessage: errJson.message || 'Usage Limit Reached. Please Contact Admin.',
        });
        return;
      }

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        setEvalState({
          status: 'locked_device',
          errorMessage: errJson.message || 'Recruiter seat locked to another machine.',
        });
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setEvalState({
          status: 'error',
          errorMessage: errJson.message || `Request failed (${res.status})`,
        });
        return;
      }

      const result = await res.json();
      setEvalState({
        status: 'success',
        result,
        jobTitle: derivedJobTitle,
      });
      chrome.storage.local.set({
        evaluationState: {
          status: 'success',
          result,
          selectedCandidateId,
          scrapedJdText: jdText,
          jobTitle: derivedJobTitle,
          jobUrl: window.location.href,
          timestamp: Date.now(),
        },
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
      const firstLine = jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 80);
      const titleToSave = evalResult.jobTitle || evalState.jobTitle || (firstLine.length > 5 ? firstLine : 'Software Opportunity');

      let currentTabUrl = window.location.href;
      try {
        if (chrome.tabs && chrome.tabs.query) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.url) currentTabUrl = activeTab.url;
        }
      } catch (_e) {}

      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'SAVE_APPLIED',
            payload: {
              candidateId: selectedCandidateId,
              jobTitle: titleToSave,
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
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
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
    : 'BS';

  const evalResult = evalState.result;
  const isApply = evalResult?.verdict === 'APPLY';
  const matchAssessment = evalResult?.matchAssessment || (isApply ? 'Strong Match' : 'Weak Match');

  const jobTitleToDisplay =
    evalResult?.jobTitle ||
    evalState.jobTitle ||
    (jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 80)) ||
    (selectedCandidate ? `${selectedCandidate.primaryTitle} Opportunity` : 'Software Engineering Role');

  const isEligibilityPassed = typeof evalResult?.isEligible === 'boolean'
    ? evalResult.isEligible
    : isApply;

  const eligibilityMessage = evalResult?.eligibilityCheck || (isEligibilityPassed ? 'No auto-skip triggers.' : 'Eligibility mismatch detected.');

  const alignedItems =
    evalResult?.candidateFitCheck?.alignedSkills && evalResult.candidateFitCheck.alignedSkills.length > 0
      ? evalResult.candidateFitCheck.alignedSkills
      : evalResult?.keyStrengths && evalResult.keyStrengths.length > 0
      ? evalResult.keyStrengths
      : [
          'Core technical stack alignment',
          'Demonstrated relevant experience and delivery',
        ];

  const missingItems =
    evalResult?.candidateFitCheck?.gaps && evalResult.candidateFitCheck.gaps.length > 0
      ? evalResult.candidateFitCheck.gaps
      : evalResult?.missingCriticalSkills && evalResult.missingCriticalSkills.length > 0
      ? evalResult.missingCriticalSkills
      : isApply
      ? ['None identified']
      : ['Clearance, experience, or specialized skill gap.'];

  const naturalHighlights = evalResult?.naturalFitHighlights || [];
  const applicationQuestions = evalResult?.applicationQuestions || [];
  const strategicNotes = evalResult?.otherNotes || evalResult?.strategicNotes || '';

  return (
    <div ref={containerRef} className="jdm-popup-window">
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
              <div className="jdm-subtext">Bench Sales AI • Gemini 2.5 Flash</div>
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
            {/* Active Bench Candidate Card */}
            <div className="jdm-candidate-section">
              <div className="jdm-candidate-header">
                <span className="jdm-candidate-label">ACTIVE BENCH CANDIDATE</span>
                <span className="jdm-resume-active-badge">✓ RESUME ACTIVE</span>
              </div>

              <div className="jdm-candidate-card">
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
                <div className="jdm-candidate-caret">▾</div>

                {/* Candidate switching dropdown */}
                <select
                  className="jdm-candidate-select-overlay"
                  value={selectedCandidate?.id || ''}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  title="Select Bench Candidate"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.primaryTitle}
                    </option>
                  ))}
                </select>
              </div>
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
                    placeholder="https://jdmatcher-api.onrender.com"
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
                    placeholder="https://jdmatcher-app.onrender.com"
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

              <div className="jdm-textarea-wrap">
                <textarea
                  className="jdm-jd-textarea"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste Job Description here (responsibilities, required qualifications, client info)..."
                  rows={5}
                />
                <div className="jdm-textarea-footer">
                  <span className="jdm-footer-tag">🛡 Natural Fit Quality Blueprint</span>
                  <span className="jdm-char-count">{jdText.length.toLocaleString()} characters</span>
                </div>
              </div>
            </div>

            {/* Evaluate CTA Button */}
            <button
              className="jdm-evaluate-btn"
              onClick={handleEvaluate}
              disabled={evalState.status === 'loading' || evalState.status === 'locked_402'}
            >
              {evalState.status === 'loading' ? (
                <>
                  <div className="jdm-spinner" />
                  <span>Evaluating Candidate Against JD...</span>
                </>
              ) : (
                <>
                  <span className="jdm-bolt">⚡</span>
                  <span>Evaluate Candidate Against JD</span>
                </>
              )}
            </button>

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

            {/* 3. Evaluation Results Container (7-Point Blueprint) */}
            {evalState.status === 'success' && evalResult && (
              <div className="jdm-results-container">
                {/* Verdict Top Banner (Red for SKIP, Green for APPLY) */}
                <div className={isApply ? 'jdm-verdict-banner-apply' : 'jdm-verdict-banner-skip'}>
                  <div className="jdm-verdict-banner-top">
                    <div className="jdm-verdict-main-text">
                      {isApply ? '✓ APPLY' : '✕ SKIP'}
                    </div>
                    <div className="jdm-match-tier-badge">
                      {matchAssessment}
                    </div>
                  </div>
                  <div className="jdm-verdict-job-title">{jobTitleToDisplay}</div>
                </div>

                {/* 1. ELIGIBILITY VERIFICATION */}
                <div className="jdm-eligibility-card">
                  <div className="jdm-eligibility-header">
                    <div className="jdm-eligibility-title-wrap">
                      <span className="jdm-shield-icon">🛡</span>
                      <span>1. ELIGIBILITY CHECK</span>
                    </div>
                    <span className={isEligibilityPassed ? 'jdm-badge-passed' : 'jdm-badge-disqualified'}>
                      {isEligibilityPassed ? 'PASSED' : 'DISQUALIFIED'}
                    </span>
                  </div>
                  <div className="jdm-eligibility-body">{eligibilityMessage}</div>
                </div>

                {/* 2. DECISION JUSTIFICATION */}
                <div className="jdm-justification-card">
                  <div className="jdm-justification-header">
                    <span>🎯</span>
                    <span>2. GO / NO-GO JUSTIFICATION</span>
                  </div>
                  <div className="jdm-justification-body">
                    {evalResult.verdictJustification || evalResult.reasoning}
                  </div>
                </div>

                {/* 3. CANDIDATE FIT CHECK (STACK MATRIX) */}
                <div className="jdm-matrix-card">
                  <div className="jdm-matrix-header">
                    <span>⚖</span>
                    <span>3. CANDIDATE FIT CHECK</span>
                  </div>
                  <div className="jdm-matrix-grid">
                    {/* Left: Aligned Overlaps */}
                    <div className="jdm-matrix-col-aligned">
                      <div className="jdm-matrix-col-header">
                        <span className="jdm-aligned-title">✓ ALIGNED OVERLAPS</span>
                        <span className="jdm-aligned-count">{alignedItems.length}</span>
                      </div>
                      {alignedItems.map((item, idx) => (
                        <div key={idx} className="jdm-item-aligned">
                          ✓ {item.replace(/^[✓\s*•-]+/, '')}
                        </div>
                      ))}
                    </div>

                    {/* Right: Missing Gaps */}
                    <div className="jdm-matrix-col-gaps">
                      <div className="jdm-matrix-col-header">
                        <span className="jdm-gaps-title">✕ GAPS</span>
                        <span className="jdm-gaps-count">{missingItems.length}</span>
                      </div>
                      {missingItems.map((item, idx) => (
                        <div key={idx} className="jdm-item-gap">
                          ✕ {item.replace(/^[✕\s*•-]+/, '')}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. NATURAL FIT HIGHLIGHTS (If Go or present) */}
                {naturalHighlights.length > 0 && (
                  <div className="jdm-highlights-card">
                    <div className="jdm-highlights-header">
                      <span>✨</span>
                      <span>4. NATURAL FIT HIGHLIGHTS</span>
                    </div>
                    <div className="jdm-highlights-body">
                      {naturalHighlights.map((hl, idx) => (
                        <div key={idx}>• {hl.replace(/^[•\s*-]+/, '')}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. APPLICATION QUESTIONS (If provided in JD) */}
                {applicationQuestions.length > 0 && (
                  <div className="jdm-qa-card">
                    <div className="jdm-qa-header">
                      <span>💬</span>
                      <span>5. APPLICATION QUESTIONS</span>
                    </div>
                    <div>
                      {applicationQuestions.map((qa, idx) => (
                        <div key={idx} className="jdm-qa-item">
                          <div className="jdm-qa-q">Q: {qa.question}</div>
                          <div className="jdm-qa-a">A: {qa.answer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. STRATEGIC PLACEMENT NOTES */}
                {strategicNotes && (
                  <div className="jdm-notes-card">
                    <div className="jdm-notes-header">
                      <span>💡</span>
                      <span>6. STRATEGIC NOTES</span>
                    </div>
                    <div className="jdm-notes-body">{strategicNotes}</div>
                  </div>
                )}

                {/* 7. Bottom Decision Buttons */}
                <div className="jdm-decision-actions">
                  <button className="jdm-btn-applied" onClick={handleSaveApplied} disabled={isSaving}>
                    {isSaving ? 'Saving...' : '✓ Save as Applied'}
                  </button>
                  <button className="jdm-btn-not-applied" onClick={handleDiscard} disabled={isSaving}>
                    ✕ Not Applied
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
