import { StoredEvaluationState } from '../content/types.js';

const API_BASE_URL = 'https://jdmatcher-be.onrender.com';

// Generate or retrieve persistent machine hardware ID for recruiter seat locking
async function getOrCreateDeviceId(): Promise<string> {
  const data = await chrome.storage.local.get(['deviceId']);
  if (data.deviceId) {
    return data.deviceId;
  }
  const newDeviceId = 'hw-' + crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: newDeviceId });
  return newDeviceId;
}

// Toggle floating widget when extension action icon is clicked in Chrome toolbar
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  
  // Guard against internal browser pages
  if (
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('view-source:')
  ) {
    console.log('JDMatcher cannot run on internal browser URLs.');
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_WIDGET' });
    if (!res || !res.success) {
      throw new Error('No listener ack');
    }
  } catch (_err) {
    // If receiving end does not exist, inject content script directly
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    } catch (injectErr) {
      console.warn('Could not inject content script into tab:', injectErr);
    }
  }
});

// Listen for messages from Content Script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_EVALUATION') {
    handleEvaluation(message.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SAVE_APPLIED') {
    handleSaveApplied(message.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_DEVICE_ID') {
    getOrCreateDeviceId().then((deviceId) => sendResponse({ deviceId }));
    return true;
  }
});

async function handleEvaluation(payload: {
  candidateId: string;
  jdText: string;
  jobTitle?: string;
  jobUrl?: string;
  companyOrClient?: string;
}) {
  const deviceId = await getOrCreateDeviceId();
  const storage = await chrome.storage.local.get(['token', 'apiUrl']);
  const token = storage.token;
  const rawUrl = storage.apiUrl || API_BASE_URL;
  const baseUrl = rawUrl.trim().replace(/\/+$/, '');

  // Persist loading state so reopening widget restores progress
  const loadingState: StoredEvaluationState = {
    status: 'loading',
    selectedCandidateId: payload.candidateId,
    scrapedJdText: payload.jdText,
    jobTitle: payload.jobTitle,
    companyOrClient: payload.companyOrClient,
    jobUrl: payload.jobUrl,
    timestamp: Date.now(),
  };
  await chrome.storage.local.set({ evaluationState: loadingState });

  try {
    const response = await fetch(`${baseUrl}/analyze/eval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({
        candidateId: payload.candidateId,
        jdText: payload.jdText,
        jobTitle: payload.jobTitle,
        jobUrl: payload.jobUrl,
        companyOrClient: payload.companyOrClient,
      }),
    });

    // Handle 402 Hard Deposit Lock
    if (response.status === 402) {
      const errData = await response.json().catch(() => ({}));
      const lockedState: StoredEvaluationState = {
        ...loadingState,
        status: 'locked_402',
        errorMessage: errData.message || 'Security deposit limit reached. Contact Super Admin to settle.',
      };
      await chrome.storage.local.set({ evaluationState: lockedState });
      return { success: false, status: 'locked_402', error: lockedState.errorMessage };
    }

    // Handle 403 Device Lock Mismatch
    if (response.status === 403) {
      const errData = await response.json().catch(() => ({}));
      const lockedState: StoredEvaluationState = {
        ...loadingState,
        status: 'locked_device',
        errorMessage: errData.message || 'Recruiter seat locked to another machine.',
      };
      await chrome.storage.local.set({ evaluationState: lockedState });
      return { success: false, status: 'locked_device', error: lockedState.errorMessage };
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorState: StoredEvaluationState = {
        ...loadingState,
        status: 'error',
        errorMessage: errData.message || `Request failed with status ${response.status}`,
      };
      await chrome.storage.local.set({ evaluationState: errorState });
      return { success: false, error: errorState.errorMessage };
    }

    const data = await response.json();
    const successState: StoredEvaluationState = {
      ...loadingState,
      status: 'success',
      result: data,
    };
    await chrome.storage.local.set({ evaluationState: successState });
    return { success: true, result: data };
  } catch (error: any) {
    const errState: StoredEvaluationState = {
      ...loadingState,
      status: 'error',
      errorMessage: error.message || 'Network error connecting to JDMatcher Backend',
    };
    await chrome.storage.local.set({ evaluationState: errState });
    return { success: false, error: errState.errorMessage };
  }
}

async function handleSaveApplied(payload: {
  candidateId: string;
  jobTitle: string;
  companyOrClient?: string;
  jobUrl?: string;
  rawJdText: string;
  verdict: 'APPLY' | 'SKIP';
  matchScore: number;
  matchReasoning: string;
}) {
  const deviceId = await getOrCreateDeviceId();
  const storage = await chrome.storage.local.get(['token', 'apiUrl']);
  const token = storage.token;
  const rawUrl = storage.apiUrl || API_BASE_URL;
  const baseUrl = rawUrl.trim().replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/analyze/save-applied`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`,
      'x-device-id': deviceId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || 'Failed to save matched JD');
  }

  return response.json();
}
