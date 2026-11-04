/*
 * Stand-in for the chrome.* APIs the auto-fill content script uses, plus a rule-based "AI"
 * that answers the fixture questions the way a careful model should. Loaded before the engine.
 */
(() => {
  const state = { local: {}, listeners: [], storageListeners: [], sent: [], aiCalls: [], confirms: [] };
  window.__jdm = state;

  state.local = Object.assign(
    {
      autofillEnabled: true,
      autofillAutoAdvance: true,
      autofillPauseOnFlags: true,
      cachedCandidateProfile: window.__JDM_TEST_PROFILE__,
    },
    window.__JDM_TEST_STORAGE__ || {}
  );

  function aiAnswer(f) {
    const q = String(f.question || f.label || '').toLowerCase();
    const base = { fieldId: f.id, elementIndex: f.elementIndex };
    const pick = (want) => (f.options || []).find((o) => o.toLowerCase().includes(want.toLowerCase())) || want;
    if (/kubernetes/.test(q) && /years/.test(q)) {
      return { ...base, value: '3', confidence: 0.9, needsReview: false, reasoning: 'Resume shows Kubernetes at Acme Corp, 2021-2024' };
    }
    if (/terraform/.test(q) && /years/.test(q)) {
      return { ...base, value: pick('2-4'), confidence: 0.85, needsReview: false, reasoning: 'Terraform at Acme Corp since 2022' };
    }
    if (/why are you interested|why do you want/.test(q)) {
      return {
        ...base,
        value:
          'I have spent the last three years running production Kubernetes and Terraform at Acme Corp, and this role is about exactly that work at a larger scale.',
        confidence: 0.82,
        needsReview: false,
        reasoning: 'Built from the resume and the job description',
      };
    }
    if (/hourly rate|desired rate/.test(q)) {
      return { ...base, value: '', confidence: 0.2, needsReview: true, reasoning: 'Rate is not in the profile' };
    }
    if (/tools have you used|technologies have you used/.test(q)) {
      const values = (f.options || []).filter((o) => /kubernetes|terraform|ansible/i.test(o));
      return { ...base, values, value: values.join('; '), confidence: 0.88, needsReview: false, reasoning: 'All three appear in the resume' };
    }
    if (/additional information|anything else/.test(q)) {
      return { ...base, value: '', confidence: 0.5, needsReview: false, reasoning: 'Optional; nothing to add' };
    }
    return { ...base, value: '', confidence: 0.3, needsReview: true, reasoning: 'Not in the profile or resume' };
  }

  function fireStorage(changes) {
    state.storageListeners.forEach((fn) => {
      try {
        fn(changes, 'local');
      } catch (e) {
        console.error(e);
      }
    });
  }

  window.chrome = {
    runtime: {
      id: 'jdm-test',
      lastError: undefined,
      onMessage: { addListener: (fn) => state.listeners.push(fn) },
      sendMessage: (msg, cb) => {
        state.sent.push(msg);
        if (msg && msg.type === 'AUTOFILL_RESOLVE') {
          state.aiCalls.push(JSON.parse(JSON.stringify(msg.payload)));
          const data = { resolvedFields: msg.payload.unresolvedFields.map(aiAnswer) };
          setTimeout(() => cb && cb({ success: true, data }), 40);
          return;
        }
        if (msg && msg.type === 'AUTOFILL_CONFIRM') {
          state.confirms.push(JSON.parse(JSON.stringify(msg.payload)));
          if (cb) cb({ success: true });
          return;
        }
        if (msg && msg.type === 'RESUME_AUTOFILL') {
          setTimeout(() => state.listeners.forEach((fn) => fn({ type: 'RESUME_AUTOFILL' }, {}, () => {})), 10);
          if (cb) cb({ success: true });
          return;
        }
        if (cb) cb({ success: true });
      },
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          list.forEach((k) => {
            if (k in state.local) out[k] = state.local[k];
          });
          if (cb) cb(out);
          return Promise.resolve(out);
        },
        set: (obj, cb) => {
          Object.assign(state.local, obj);
          const changes = {};
          Object.keys(obj).forEach((k) => (changes[k] = { newValue: obj[k] }));
          fireStorage(changes);
          if (cb) cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (fn) => state.storageListeners.push(fn) },
    },
  };

  /** Sends a message to the content script the way the background script would. */
  window.__jdmDispatch = (message) =>
    new Promise((resolve) => {
      let done = false;
      state.listeners.forEach((fn) =>
        fn(message, {}, (res) => {
          if (!done) {
            done = true;
            resolve(res);
          }
        })
      );
      setTimeout(() => {
        if (!done) resolve(null);
      }, 90000);
    });
})();
