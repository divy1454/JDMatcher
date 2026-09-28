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
}

// Ensure DOM is ready before injection
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
