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

// Per-platform selector registry.
// Each entry provides selectors to find user/assistant message elements and the
// content container inside a message. Fallback selectors let a platform UI
// change degrade gracefully instead of failing hard.

const PLATFORM_SELECTORS = {
  chatgpt: {
    user: '[data-message-author-role="user"]',
    assistant: '[data-message-author-role="assistant"]',
    // Turn wrappers carry a role and group each exchange.
    turns: [
      'article[data-testid^="conversation-turn-"]',
      '[data-testid="conversation-turn"]',
      '[data-message-author-role]',
    ],
    content: ['.markdown', '.whitespace-pre-wrap'],
    titleStrip: /[\s-]*ChatGPT$/i,
  },

  claude: {
    user: ['[data-testid="user-message"]', '.font-user-message', '[data-testid="message-human"]'],
    assistant: [
      '.font-claude-response',
      '.font-claude-message',
      '[data-testid="ai-message"]',
      '[data-testid="message-assistant"]',
    ],
    content: ['.standard-markdown', '.progressive-markdown', '.markdown'],
    loadEarlierText: 'Load earlier messages',
    titleStrip: /[\s-]*Claude$/i,
  },

  // Kimi does not expose stable data-* attributes to the accessibility tree.
  // `[class*="user-content"]` is a community-verified selector; the rest are
  // candidates, backed by a structural fallback (find per-message action
  // buttons, walk up to the message container) when nothing matches.
  kimi: {
    user: [
      '[data-testid="user-message"]',
      '[data-role="user"]',
      '[class*="user-content"]',
      '[class*="user-message"]',
    ],
    assistant: [
      '[data-testid="assistant-message"]',
      '[data-role="assistant"]',
      '[class*="assistant-content"]',
      '[class*="assistant-message"]',
    ],
    content: ['[class*="user-content"]', '[class*="assistant-content"]', '[class*="markdown"]'],
    titleStrip: /[\s-]*Kimi$/i,
  },
};

const PLATFORM_DOMAINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
  claude: ['claude.ai'],
  kimi: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'],
};

function detectPlatform(hostname) {
  if (!hostname) return null;
  for (const [key, domains] of Object.entries(PLATFORM_DOMAINS)) {
    const h = hostname.toLowerCase();
    if (domains.some((d) => h === d || h.endsWith('.' + d))) return key;
  }
  return null;
}
