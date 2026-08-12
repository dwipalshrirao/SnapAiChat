'use strict';

// Content script entry point. Runs on supported chat domains and responds to
// EXPORT requests from the popup. Reads the DOM only — never cookies,
// localStorage, or network.

const currentPlatform = detectPlatform(location.hostname);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'EXPORT') return;
  if (!currentPlatform) {
    sendResponse({ ok: false, error: 'Unsupported page: ' + location.hostname });
    return;
  }
  buildExport(currentPlatform)
    .then((model) => sendResponse({ ok: true, model }))
    .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : String(err) }));
  return true; // keep the channel open for the async response
});

// Inform the popup whether this page can be exported.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'GET_PLATFORM') return;
  let platform = currentPlatform;
  let available = false;
  if (platform) {
    try {
      available = ADAPTERS[platform].isConversationPage();
    } catch (e) {
      available = false;
    }
  }
  sendResponse({ platform, available });
});
