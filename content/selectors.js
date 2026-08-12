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

  // Gemini's DOM is an SPA with obfuscated class names. The stable hooks are
  // the `user-query` / `model-response` custom elements and the
  // `data-message-author-role` attribute (role `user` or `model`). Assistant
  // content lives in `.model-response-text` (or `.markdown`); the user prompt
  // lives in `.query-text` / `.user-query-container`.
  gemini: {
    user: [
      'user-query',
      '.user-query-container',
      '.user-query-bubble-container',
      '[data-message-author-role="user"]',
      'article[data-author="user"]',
      'div[aria-label="User message"]',
    ],
    assistant: [
      'model-response',
      '.model-response',
      '.model-response-text',
      'response-container',
      '.presented-response-container',
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="model"]',
      'article[data-author="assistant"]',
      '[aria-label="Gemini response"]',
    ],
    content: ['.model-response-text', '.query-text', '.markdown', 'message-content'],
    titleStrip: /[\s-]*Gemini$/i,
  },

  // DeepSeek mirrors ChatGPT but with obfuscated hashed class names. It exposes
  // `data-message-author-role` / `data-role` attributes and renders assistant
  // content as `.ds-markdown` (or `.markdown-body`). User messages use
  // `.user-message` / `[class*="UserMessage"]`.
  deepseek: {
    user: [
      '[data-message-author-role="user"]',
      '.user-message',
      '[data-role="user"]',
      '[class*="UserMessage"]',
      '[data-testid="user-message"]',
    ],
    assistant: [
      '[data-message-author-role="assistant"]',
      '.ds-markdown',
      '.ds-message',
      '.ds-chat-message',
      '[data-role="assistant"]',
      '[class*="AssistantMessage"]',
      '[class*="markdown-body"]',
    ],
    content: ['.ds-markdown', '.markdown-body', '.markdown', '.message-content'],
    titleStrip: /[\s-]*DeepSeek.*$/i,
  },
};

const PLATFORM_DOMAINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
  claude: ['claude.ai'],
  kimi: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'],
  gemini: ['gemini.google.com', 'aistudio.google.com'],
  deepseek: ['chat.deepseek.com', 'deepseek.com'],
};

function detectPlatform(hostname) {
  if (!hostname) return null;
  for (const [key, domains] of Object.entries(PLATFORM_DOMAINS)) {
    const h = hostname.toLowerCase();
    if (domains.some((d) => h === d || h.endsWith('.' + d))) return key;
  }
  return null;
}
