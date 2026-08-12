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

const PLATFORM_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', kimi: 'Kimi', gemini: 'Gemini', deepseek: 'DeepSeek' };
const PLATFORM_DOMAINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
  claude: ['claude.ai'],
  kimi: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'],
  gemini: ['gemini.google.com', 'aistudio.google.com'],
  deepseek: ['chat.deepseek.com', 'deepseek.com'],
};

const state = { tabId: null, platform: null, available: false, format: 'markdown' };

function $(id) {
  return document.getElementById(id);
}

function icon(name) {
  return '<span class="material-symbols-outlined" aria-hidden="true">' + name + '</span>';
}

function detectPlatformFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [key, domains] of Object.entries(PLATFORM_DOMAINS)) {
      if (domains.some((d) => hostname === d || hostname.endsWith('.' + d))) return key;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: false, error: 'No response from page.' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

// Status indicator (pulsing dot + mono label). kind: '' | 'ok' | 'err'.
function setSiteLabel(text, kind) {
  $('site-label').textContent = text;
  $('status-dot').className = 'status-dot' + (kind ? ' ' + kind : '');
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text || '';
  el.className = 'feedback' + (kind ? ' ' + kind : '');
}

function setExportEnabled(enabled) {
  $('export-btn').disabled = !enabled;
}

function friendlyError(error) {
  const msg = String(error || '');
  if (/receiving end does not exist/i.test(msg)) {
    return 'Extension is not active on this page yet. Reload the chat page (Cmd/Ctrl+R), then try again.';
  }
  if (/no response from page/i.test(msg)) {
    return 'The page did not respond. Reload the chat page, then try again.';
  }
  return msg;
}

// ------------------------------------------------------------ navigation ----

function showTab(tab) {
  const isHistory = tab === 'history';
  $('view-export').classList.toggle('active', !isHistory);
  $('view-history').classList.toggle('active', isHistory);
  $('bar-export').hidden = isHistory;
  $('bar-history').hidden = !isHistory;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

// ------------------------------------------------------------ archive/history

function timeLabel(createdAt) {
  const d = new Date(createdAt);
  if (isNaN(d)) return '';
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fullStamp(createdAt) {
  const d = new Date(createdAt);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
}

function countFor(rec) {
  return rec.messageCount != null ? rec.messageCount : (rec.model && rec.model.messages ? rec.model.messages.length : 0);
}

const ICON_SVG = {
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  delete:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
};

// Brand logomarks for the supported platforms (recent list). These are the
// official OpenAI, Anthropic, Kimi, Google (Gemini) and DeepSeek glyphs;
// trademarks remain with their respective owners and are used here for
// identification only.
const LOGO_SVG = {
  chatgpt:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z"/></svg>',
  claude:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/></svg>',
  kimi:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#000000" d="M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441"/></svg>',
  gemini:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#8E75B2"><path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/></svg>',
  deepseek:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#5786FE"><path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45"/></svg>',
};

function svgIcon(name) {
  return '<span class="svg-icon" aria-hidden="true">' + (ICON_SVG[name] || '') + '</span>';
}

function historyActionButton(name, label, className, onClick) {
  const b = document.createElement('button');
  b.className = 'action-icon' + (className ? ' ' + className : '');
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svgIcon(name);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function buildHistoryRow(rec) {
  const li = document.createElement('li');
  li.className = 'history-item ' + (rec.platform || 'unknown');

  const info = document.createElement('div');
  info.className = 'info';

  const t = document.createElement('div');
  t.className = 't';
  const logo = LOGO_SVG[rec.platform];
  if (logo) {
    // Brand logomark on a white chip so it stays legible on the dark theme.
    const mark = document.createElement('span');
    mark.className = 'row-logo';
    mark.style.background = '#fff';
    mark.style.border = '1px solid rgba(0, 0, 0, 0.12)';
    if (rec.platform === 'chatgpt') mark.style.color = '#111';
    mark.innerHTML = logo;
    t.appendChild(mark);
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot ' + (rec.platform || 'unknown');
    t.appendChild(dot);
  }
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = rec.title;
  name.title = rec.title;
  t.appendChild(name);

  const s = document.createElement('div');
  s.className = 's';
  const msgs = document.createElement('span');
  msgs.textContent = countFor(rec) + ' msgs';
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '·';
  const stamp = document.createElement('span');
  stamp.textContent = fullStamp(rec.createdAt);
  s.appendChild(msgs);
  s.appendChild(sep);
  s.appendChild(stamp);

  info.appendChild(t);
  info.appendChild(s);

  const actions = document.createElement('div');
  actions.className = 'history-actions';
  actions.appendChild(historyActionButton('copy', 'Copy Markdown', '', () => copyArchive(rec)));
  actions.appendChild(historyActionButton('download', 'Download Markdown', '', () => downloadArchive(rec)));
  actions.appendChild(historyActionButton('delete', 'Delete from history', 'trash', () => deleteArchive(rec)));

  li.appendChild(info);
  li.appendChild(actions);
  return li;
}

function buildRecentRow(rec) {
  const li = document.createElement('li');
  li.className = 'recent-item';
  li.title = rec.title;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const platform = rec.platform || 'unknown';
  const logo = LOGO_SVG[platform];
  if (logo) {
    // Brand logomark on a white chip so it stays legible on the dark theme.
    avatar.classList.add('has-logo');
    avatar.style.background = '#fff';
    avatar.style.border = '1px solid rgba(0, 0, 0, 0.12)';
    if (platform === 'chatgpt') avatar.style.color = '#111';
    avatar.innerHTML = logo;
  } else {
    avatar.style.background = 'color-mix(in srgb, var(--' + platform + ') 10%, transparent)';
    avatar.style.border = '1px solid color-mix(in srgb, var(--' + platform + ') 20%, transparent)';
    avatar.style.color = 'var(--' + platform + ')';
    avatar.innerHTML = icon('description');
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const t = document.createElement('div');
  t.className = 't';
  t.textContent = rec.title;
  const s = document.createElement('div');
  s.className = 's';
  s.textContent = timeLabel(rec.createdAt) + ' · ' + countFor(rec) + ' turns';
  meta.appendChild(t);
  meta.appendChild(s);

  const actions = document.createElement('div');
  actions.className = 'recent-actions';
  actions.appendChild(historyActionButton('copy', 'Copy Markdown', '', () => copyArchive(rec)));
  actions.appendChild(historyActionButton('download', 'Download Markdown', '', () => downloadArchive(rec)));
  actions.appendChild(historyActionButton('delete', 'Delete from history', 'trash', () => deleteArchive(rec)));

  li.appendChild(avatar);
  li.appendChild(meta);
  li.appendChild(actions);
  return li;
}

function renderRecent(list) {
  const el = $('recent-list');
  el.textContent = '';
  for (const rec of list.slice(0, 2)) el.appendChild(buildRecentRow(rec));
}

async function renderHistory() {
  const listEl = $('history-list');
  const emptyEl = $('history-empty');
  let archives = [];
  try {
    archives = await listArchives();
  } catch (e) {
    listEl.textContent = '';
    if (emptyEl) emptyEl.hidden = false;
    setStatus('History unavailable: ' + e.message, 'error');
    return;
  }
  listEl.textContent = '';
  if (emptyEl) emptyEl.hidden = archives.length > 0;
  for (const rec of archives) listEl.appendChild(buildHistoryRow(rec));
  renderRecent(archives);
}

async function downloadArchive(rec) {
  try {
    const name = archiveFilenameFor(rec) + '.md';
    downloadFile(name, buildMarkdown(rec.model), 'text/markdown');
    setStatus('Saved ' + name, 'ok');
  } catch (e) {
    setStatus('Download failed: ' + e.message, 'error');
  }
}

async function copyArchive(rec) {
  try {
    const ok = await copyText(buildMarkdown(rec.model));
    setStatus(ok ? 'Copied Markdown to clipboard.' : 'Copy failed.', ok ? 'ok' : 'error');
  } catch (e) {
    setStatus('Copy failed: ' + e.message, 'error');
  }
}

async function deleteArchive(rec) {
  try {
    await removeArchive(rec.id);
    await renderHistory();
    setStatus('Deleted "' + rec.title + '".', 'ok');
  } catch (e) {
    setStatus('Delete failed: ' + e.message, 'error');
  }
}

// ------------------------------------------------------------------- format

function applyFormat(format) {
  state.format = format;
  document.querySelectorAll('.format-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.format === format);
  });
}

async function init() {
  renderHistory();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    setSiteLabel('No active tab.', 'err');
    setStatus('Open a ChatGPT, Claude, Kimi, Gemini or DeepSeek conversation to export it.', 'error');
    return;
  }

  state.tabId = tab.id;
  state.platform = detectPlatformFromUrl(tab.url);

  // Restore the last chosen format.
  const stored = await chrome.storage.local.get('format');
  const wanted = stored.format === 'both' ? 'markdown' : stored.format;
  applyFormat(wanted === 'json' ? 'json' : 'markdown');

  document.querySelectorAll('.format-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormat(btn.dataset.format);
      chrome.storage.local.set({ format: btn.dataset.format });
    });
  });

  if (!state.platform) {
    setSiteLabel('Not a supported site', 'err');
    setStatus('Open a ChatGPT, Claude, Kimi, Gemini or DeepSeek conversation to export it.', 'error');
    setExportEnabled(false);
    return;
  }

  setSiteLabel(PLATFORM_LABELS[state.platform] + ' detected');

  const resp = await sendToTab(state.tabId, { type: 'GET_PLATFORM' });
  if (resp && resp.ok === undefined) {
    // Content script answered the availability probe.
    state.available = !!resp.available;
    if (resp.available) {
      setSiteLabel(PLATFORM_LABELS[state.platform] + ' — conversation ready', 'ok');
      setStatus('');
      setExportEnabled(true);
    } else {
      setSiteLabel('No active chat detected', 'err');
      setStatus('Open a chat first, then retry.', 'error');
      setExportEnabled(false);
    }
  } else {
    const msg = friendlyError(
      resp && resp.error ? resp.error : 'Content script not ready. Reload the chat page.'
    );
    setSiteLabel('No active chat detected', 'err');
    setStatus(msg, 'error');
    setExportEnabled(false);
  }
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  );
}

async function doExport() {
  setExportEnabled(false);
  setStatus('Exporting…');

  const resp = await sendToTab(state.tabId, { type: 'EXPORT' });
  if (!resp || !resp.ok || !resp.model) {
    setStatus(friendlyError((resp && resp.error) || 'Export failed.'), 'error');
    setExportEnabled(true);
    return;
  }

  const model = resp.model;
  const base = sanitizeFilename(model.platform + '-' + model.title + '-' + dateStamp());

  const name = base + (state.format === 'json' ? '.json' : '.md');
  const content = state.format === 'json' ? buildJson(model) : buildMarkdown(model);
  const mime = state.format === 'json' ? 'application/json' : 'text/markdown';
  downloadFile(name, content, mime);

  try {
    await addArchive(model);
    await renderHistory();
  } catch (e) {
    // Export succeeded but saving to history failed — surface it, keep the file.
    setStatus('Exported. History save failed: ' + e.message, 'error');
    return;
  }

  setStatus('Saved ' + name, 'ok');
  setExportEnabled(true);
}

document.addEventListener('DOMContentLoaded', () => {
  $('export-btn').addEventListener('click', doExport);
  $('view-all').addEventListener('click', () => showTab('history'));
  $('history-back').addEventListener('click', () => showTab('export'));
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.tab));
  });
  init();
});
