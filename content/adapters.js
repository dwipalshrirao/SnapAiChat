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

// Per-platform adapters. Each exposes:
//   isConversationPage() -> bool
//   getTitle()           -> string
//   async loadAll()      -> ensure every message is present in the DOM
//   extractMessages()    -> [{ role, timestamp, blocks }]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sortByDomPosition(a, b) {
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function findButtonByText(text) {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    (b.textContent || '').trim().toLowerCase().includes(text.toLowerCase())
  );
}

function getRoleFromTurn(el) {
  if (el.getAttribute) {
    const direct = el.getAttribute('data-message-author-role');
    if (direct === 'user') return 'user';
    if (direct === 'assistant' || direct === 'model') return 'assistant';
    const turn = el.getAttribute('data-turn');
    if (turn === 'user') return 'user';
    if (turn === 'assistant' || turn === 'model') return 'assistant';
  }
  const child = el.querySelector('[data-message-author-role]');
  if (child) {
    const r = child.getAttribute('data-message-author-role');
    if (r === 'user') return 'user';
    if (r === 'assistant' || r === 'model') return 'assistant';
  }
  return '';
}

function findContentElement(messageEl, contentSelectors) {
  for (const sel of contentSelectors) {
    // The message container can itself be the content element (e.g. Kimi's
    // `[class*="user-content"]`), so check it before its descendants.
    if (messageEl.matches && messageEl.matches(sel) && nodeText(messageEl).trim()) return messageEl;
    for (const el of messageEl.querySelectorAll(sel)) {
      if (nodeText(el).trim()) return el;
    }
  }
  return null;
}

// Extract structured blocks from a message element, using the platform's
// content selectors first, then falling back to a cleaned text dump.
function extractMessageContent(messageEl, contentSelectors) {
  const contentEl = findContentElement(messageEl, contentSelectors);
  if (contentEl) {
    // Drop per-message UI chrome (action buttons, icons, inputs) before
    // converting, so it never leaks into the extracted content.
    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll('button, svg, form, textarea, [data-testid="copy-code-button"]').forEach((n) => n.remove());
    return elementToBlocks(clone);
  }
  const clone = messageEl.cloneNode(true);
  clone.querySelectorAll('button, svg, form, textarea').forEach((n) => n.remove());
  const blocks = elementToBlocks(clone);
  if (blocks.length) return blocks;
  return [];
}

function extractTimestamp(el) {
  const time = el.querySelector('time[datetime]') || el.querySelector('time');
  if (time) {
    const dt = time.getAttribute('datetime');
    return dt || (time.textContent || '').trim();
  }
  return '';
}

// Collect every element matched by a list of selectors (used by the role-based
// adapters where a platform has no single stable turn wrapper).
function collectRoleElements(selectors) {
  const found = [];
  for (const sel of [].concat(selectors)) {
    for (const el of document.querySelectorAll(sel)) found.push(el);
  }
  return found;
}

// Drop duplicate references and nested elements so each message is extracted
// once from its outermost container.
function uniqueTopLevel(els) {
  const seen = new Set();
  const uniq = els.filter((el) => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });
  return uniq.filter((el) => !uniq.some((o) => o !== el && o.contains(el)));
}

// Generic extractor for platforms that expose separate user/assistant elements
// but no single turn wrapper: gather each role's elements, drop nesting
// duplicates, order by DOM position, then pull content blocks.
function extractByRoleSelectors(platformKey) {
  const s = PLATFORM_SELECTORS[platformKey];
  const userEls = uniqueTopLevel(collectRoleElements(s.user));
  const asstEls = uniqueTopLevel(collectRoleElements(s.assistant));
  const merged = [
    ...userEls.map((el) => ({ el, role: 'user' })),
    ...asstEls.map((el) => ({ el, role: 'assistant' })),
  ];
  merged.sort((a, b) => sortByDomPosition(a.el, b.el));
  const out = [];
  for (const c of merged) {
    const blocks = extractMessageContent(c.el, s.content);
    if (!blocks.length) continue;
    out.push({ role: c.role, timestamp: extractTimestamp(c.el), blocks });
  }
  return out;
}

// Trigger lazy-loading by scrolling the page and clicking any "load earlier"
// affordance, until the message count stops growing.
async function loadByScrolling(platformKey, maxScrolls) {
  const s = PLATFORM_SELECTORS[platformKey];
  const count = () => collectRoleElements([].concat(s.user, s.assistant)).length;
  for (let i = 0; i < (maxScrolls || 60); i++) {
    const before = count();
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(700);
    window.scrollTo(0, 0);
    await sleep(500);
    const btn =
      findButtonByText('Show more') ||
      findButtonByText('Load earlier') ||
      findButtonByText('Load more messages');
    if (btn) btn.click();
    await sleep(500);
    if (count() <= before) break;
  }
}

// ---------------------------------------------------------------- ChatGPT ---

const chatgptAdapter = {
  isConversationPage() {
    return !!document.querySelector('[data-message-author-role]');
  },

  getTitle() {
    return (
      document.title.replace(PLATFORM_SELECTORS.chatgpt.titleStrip, '').trim() ||
      'ChatGPT conversation'
    );
  },

  async loadAll() {
    const sel = PLATFORM_SELECTORS.chatgpt.turns.join(',');
    const count = () => document.querySelectorAll(sel).length;
    for (let i = 0; i < 90; i++) {
      const before = count();
      const first = document.querySelector(sel);
      if (first) first.scrollIntoView({ block: 'start' });
      await sleep(1200);
      const after = count();
      if (after <= before) break;
    }
  },

  extractMessages() {
    const sel = PLATFORM_SELECTORS.chatgpt.turns.join(',');
    const all = Array.from(document.querySelectorAll(sel));
    const turns = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    const out = [];
    for (const turn of turns) {
      const role = getRoleFromTurn(turn);
      if (!role) continue;
      out.push({
        role,
        timestamp: extractTimestamp(turn),
        blocks: extractMessageContent(turn, PLATFORM_SELECTORS.chatgpt.content),
      });
    }
    return out;
  },
};

// ----------------------------------------------------------------- Claude ---

const claudeAdapter = {
  isConversationPage() {
    const sels = [].concat(
      PLATFORM_SELECTORS.claude.user,
      PLATFORM_SELECTORS.claude.assistant
    );
    return sels.some((sel) => document.querySelector(sel));
  },

  getTitle() {
    return (
      document.title.replace(PLATFORM_SELECTORS.claude.titleStrip, '').trim() ||
      'Claude conversation'
    );
  },

  async loadAll() {
    // Claude shows a "Load earlier messages" button when scrolling up.
    for (let i = 0; i < 90; i++) {
      const btn = findButtonByText(PLATFORM_SELECTORS.claude.loadEarlierText);
      if (!btn) break;
      btn.click();
      await sleep(1200);
    }
    // Trigger scroll-based loading for the remaining range.
    const sels = [].concat(
      PLATFORM_SELECTORS.claude.user,
      PLATFORM_SELECTORS.claude.assistant
    );
    const count = () => sels.reduce((n, s) => n + document.querySelectorAll(s).length, 0);
    for (let i = 0; i < 60; i++) {
      const before = count();
      window.scrollTo(0, 0);
      const first = document.querySelector('[data-testid="user-message"]');
      if (first) first.scrollIntoView({ block: 'start' });
      await sleep(1000);
      if (count() <= before) break;
    }
  },

  extractMessages() {
    const candidates = [];
    for (const sel of PLATFORM_SELECTORS.claude.user) {
      for (const el of document.querySelectorAll(sel)) candidates.push({ el, role: 'user' });
    }
    for (const sel of PLATFORM_SELECTORS.claude.assistant) {
      for (const el of document.querySelectorAll(sel)) candidates.push({ el, role: 'assistant' });
    }
    const seen = new Set();
    const uniq = candidates.filter((c) => {
      if (seen.has(c.el)) return false;
      seen.add(c.el);
      return true;
    });
    uniq.sort((a, b) => sortByDomPosition(a.el, b.el));

    const out = [];
    for (const c of uniq) {
      const blocks = extractMessageContent(c.el, PLATFORM_SELECTORS.claude.content);
      if (!blocks.length) continue;
      out.push({ role: c.role, timestamp: extractTimestamp(c.el), blocks });
    }
    return out;
  },
};

// ------------------------------------------------------------------ Kimi ---

const kimiSelectorSet = [
  { sel: PLATFORM_SELECTORS.kimi.user, role: 'user' },
  { sel: PLATFORM_SELECTORS.kimi.assistant, role: 'assistant' },
];

function kimiSelectorCount() {
  return kimiSelectorSet.reduce((n, g) => {
    if (!g.sel.length) return n;
    return n + document.querySelectorAll(g.sel.join(',')).length;
  }, 0);
}

function hasKimiMessages() {
  if (kimiSelectorCount() > 0) return true;
  // Structural fallback: a real conversation shows per-message action buttons.
  const shares = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b) =>
    (b.textContent || '').trim() === 'Share'
  );
  return shares.length > 0 && document.body.innerText.length > 400;
}

// Structural fallback: locate per-message action buttons and group them.
// User messages expose Edit/Copy/Share; assistant messages expose Share.
function kimiMessageContainers() {
  // 1) Preferred: explicit selectors.
  const found = [];
  for (const g of kimiSelectorSet) {
    if (!g.sel.length) continue;
    for (const el of document.querySelectorAll(g.sel.join(','))) found.push({ el, role: g.role });
  }
  if (found.length) {
    const seen = new Set();
    const uniq = found.filter((c) => {
      if (seen.has(c.el)) return false;
      seen.add(c.el);
      return true;
    });
    uniq.sort((a, b) => sortByDomPosition(a.el, b.el));
    return uniq;
  }

  // 2) Heuristic: bubble up from each Share/Copy action label to the first
  //    ancestor whose text is substantial — that is the message container.
  const bubble = (start) => {
    let el = start;
    for (let i = 0; i < 25 && el && el !== document.body; i++) {
      const text = nodeText(el).trim();
      if (text.length > 40 && text.length < 200000) return el;
      el = el.parentElement;
    }
    return null;
  };

  const containers = new Map();
  const actionLabels = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
    (b) => ['Share', 'Copy', 'Edit'].includes((b.textContent || '').trim())
  );
  for (const label of actionLabels) {
    const el = bubble(label);
    if (!el) continue;
    const role = nodeText(el).includes('Edit') ? 'user' : 'assistant';
    // Keep the innermost container when several labels bubble to nested nodes.
    const existing = containers.get(el);
    if (!existing) containers.set(el, { el, role });
  }
  const unique = Array.from(containers.values());
  // Drop containers that fully contain another container (e.g. a header-level
  // Share button that bubbles up to the whole conversation).
  return unique
    .filter((c) => !unique.some((o) => o.el !== c.el && o.el.contains(c.el)))
    .sort((a, b) => sortByDomPosition(a.el, b.el));
}

const kimiAdapter = {
  isConversationPage() {
    return hasKimiMessages();
  },

  getTitle() {
    return (
      document.title.replace(PLATFORM_SELECTORS.kimi.titleStrip, '').trim() ||
      'Kimi conversation'
    );
  },

  async loadAll() {
    for (let i = 0; i < 90; i++) {
      const before = kimiSelectorCount() || kimiMessageContainers().length;
      window.scrollTo(0, 0);
      const sentinel = findButtonByText('Load earlier');
      if (sentinel) sentinel.click();
      await sleep(1200);
      const after = kimiSelectorCount() || kimiMessageContainers().length;
      if (after <= before) break;
    }
  },

  extractMessages() {
    const containers = kimiMessageContainers();
    const out = [];
    for (const c of containers) {
      const blocks = extractMessageContent(c.el, PLATFORM_SELECTORS.kimi.content);
      if (!blocks.length) continue;
      out.push({ role: c.role, timestamp: extractTimestamp(c.el), blocks });
    }
    return out;
  },
};

// --------------------------------------------------------------- Gemini ---

const geminiAdapter = {
  isConversationPage() {
    const s = PLATFORM_SELECTORS.gemini;
    return [].concat(s.user, s.assistant).some((sel) => document.querySelector(sel));
  },

  getTitle() {
    return (
      document.title.replace(PLATFORM_SELECTORS.gemini.titleStrip, '').trim() ||
      'Gemini conversation'
    );
  },

  async loadAll() {
    await loadByScrolling('gemini', 60);
  },

  extractMessages() {
    return extractByRoleSelectors('gemini');
  },
};

// ------------------------------------------------------------- DeepSeek ---

const deepseekAdapter = {
  isConversationPage() {
    const s = PLATFORM_SELECTORS.deepseek;
    return [].concat(s.user, s.assistant).some((sel) => document.querySelector(sel));
  },

  getTitle() {
    return (
      document.title.replace(PLATFORM_SELECTORS.deepseek.titleStrip, '').trim() ||
      'DeepSeek conversation'
    );
  },

  async loadAll() {
    await loadByScrolling('deepseek', 60);
  },

  extractMessages() {
    return extractByRoleSelectors('deepseek');
  },
};

// ------------------------------------------------------------- dispatch ----

const ADAPTERS = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  kimi: kimiAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
};

async function buildExport(platform) {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error('Unsupported platform: ' + platform);
  if (!adapter.isConversationPage()) {
    throw new Error('No conversation found. Open a chat first.');
  }

  const model = createExportModel(platform, adapter.getTitle(), location.href);
  await adapter.loadAll();
  const messages = adapter.extractMessages();
  if (!messages.length) {
    throw new Error('No messages could be extracted from this page.');
  }
  for (const m of messages) {
    addMessage(model, m.role, m.blocks, m.timestamp);
  }
  return model;
}
