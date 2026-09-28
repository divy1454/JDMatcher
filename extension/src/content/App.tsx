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
  const [frontendUrl, setFrontendUrl] = useState<string>('http://localhost:3000');

  const containerRef = useRef<HTMLDivElement>(null);

  const getApiUrl = async (): Promise<string> => {
    const data = await chrome.storage.local.get(['apiUrl']);
    return data.apiUrl || 'http://localhost:4000/api';
  };

  // 1. Initial State Restoration & Hardware Fingerprint Synchronization
  useEffect(() => {
    // Generate machine hardware fingerprint and store for persistent device locking
    generateHardwareFingerprint().then((fp) => {
      chrome.storage.local.set({ deviceId: fp });
    });

    chrome.storage.local.get(['token', 'userName', 'evaluationState', 'frontendUrl'], (data) => {
      if (data.frontendUrl) {
        setFrontendUrl(data.frontendUrl);
      }
      if (data.token) {
        setToken(data.token);
        if (data.userName) setUserName(data.userName);
        fetchCandidates(data.token);
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

    // Listen for storage changes from background worker
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.evaluationState) {
          setEvalState(changes.evaluationState.newValue || { status: 'idle' });
        }
        if (changes.frontendUrl) {
          setFrontendUrl(changes.frontendUrl.newValue || 'http://localhost:3000');
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

  // Recruiter Login within Widget (Hardware device-bound)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const baseUrl = await getApiUrl();
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
            <button type="submit" className="jdm-btn-submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'Verifying Hardware Lock...' : 'Sign In & Access Bench'}
            </button>
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
