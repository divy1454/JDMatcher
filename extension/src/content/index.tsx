import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const HOST_ELEMENT_ID = 'jdmatcher-extension-host';

function initWidget() {
  if (document.getElementById(HOST_ELEMENT_ID)) {
    return;
  }

  // 1. Create Host Element
  const host = document.createElement('div');
  host.id = HOST_ELEMENT_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '0';
  host.style.left = '0';
  document.body.appendChild(host);

  // 2. Attach Open Shadow DOM (Strict CSS Encapsulation)
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // 3. Inject Scoped Shadow CSS
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('shadow.css');
  shadowRoot.appendChild(styleLink);

  // 4. Create React Container inside Shadow Root
  const reactContainer = document.createElement('div');
  reactContainer.id = 'jdmatcher-shadow-app';
  shadowRoot.appendChild(reactContainer);

  // Default to closed: widget ONLY opens when user explicitly clicks the extension icon
  let isVisible = false;
  const root = createRoot(reactContainer);

  const render = () => {
    if (isVisible) {
      reactContainer.style.display = 'block';
      root.render(
        <React.StrictMode>
          <App
            onClose={() => {
              isVisible = false;
              render();
            }}
          />
        </React.StrictMode>
      );
    } else {
      reactContainer.style.display = 'none';
    }
  };

  render();

  // Listen for toolbar toggle command from background service worker
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_WIDGET') {
      isVisible = !isVisible;
      render();
      sendResponse({ success: true, isVisible });
      return true;
    }
    if (message.type === 'SHOW_WIDGET') {
      isVisible = true;
      render();
      sendResponse({ success: true, isVisible: true });
      return true;
    }
  });

  // Auth Synchronization Bridge between Recruiter Portal & Extension
  window.addEventListener('message', async (event) => {
    if (event.data?.type === 'JDMATCHER_AUTH_SYNC') {
      const { token, user, organization, apiUrl, frontendUrl } = event.data;
      if (token) {
        const name = user?.fullName?.split(' ')[0] || user?.name || 'Recruiter';
        const cleanApiUrl = apiUrl ? apiUrl.replace(/\/api$/, '') : undefined;
        await chrome.storage.local.set({
          token,
          userName: name,
          currentUser: user,
          currentOrg: organization,
          ...(cleanApiUrl ? { apiUrl: cleanApiUrl } : {}),
          frontendUrl: frontendUrl || window.location.origin,
        });
        console.log('[JDMatcher] Auth synced successfully from Recruiter Portal.');
      }
    } else if (event.data?.type === 'JDMATCHER_AUTH_LOGOUT') {
      await chrome.storage.local.remove(['token', 'userName', 'currentUser', 'currentOrg']);
      console.log('[JDMatcher] Session cleared on logout.');
    }
  });

  // If on recruiter portal or localhost page, auto-detect token on page load
  try {
    const isPortalUrl = window.location.href.includes('localhost') || 
                        window.location.href.includes('127.0.0.1') || 
                        window.location.href.includes('recruiter-portal') ||
                        window.location.href.includes('jdmatcher');
    if (isPortalUrl) {
      const localToken = localStorage.getItem('token');
      if (localToken) {
        chrome.storage.local.get(['token'], async (stored) => {
          if (!stored.token || stored.token !== localToken) {
            await chrome.storage.local.set({
              token: localToken,
              frontendUrl: window.location.origin,
            });
            console.log('[JDMatcher] Auto-detected local portal token.');
          }
        });
      }
    }
  } catch (_e) {}
}

// Ensure DOM is ready before injection
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
