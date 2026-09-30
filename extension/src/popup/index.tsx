import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/shadow.css';
import '../styles/popup.css';
import { App } from '../content/App.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App onClose={() => window.close()} />
    </React.StrictMode>
  );
}
