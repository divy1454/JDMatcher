// Listen for clipboard read requests from background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.target === 'offscreen' && message.type === 'get-clipboard') {
    let clipboardText = '';

    // 1. Try legacy document.execCommand('paste') via an invisible focused textarea
    try {
      const textArea = document.createElement('textarea');
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      document.execCommand('paste');
      clipboardText = textArea.value || '';
      document.body.removeChild(textArea);
    } catch (_err) {}

    // 2. If execCommand returned text, respond immediately
    if (clipboardText && clipboardText.trim().length > 0) {
      sendResponse({ success: true, text: clipboardText });
      return true;
    }

    // 3. Fallback to navigator.clipboard.readText in offscreen context
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      navigator.clipboard.readText()
        .then((text) => {
          sendResponse({ success: true, text: text || '' });
        })
        .catch((_err) => {
          sendResponse({ success: true, text: clipboardText || '' });
        });
      return true;
    }

    sendResponse({ success: true, text: clipboardText || '' });
    return true;
  }
});
