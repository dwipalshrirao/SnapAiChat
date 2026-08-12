/*
 * Copyright 2026 Dwipal Shrirao
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
