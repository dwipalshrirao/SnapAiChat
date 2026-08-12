'use strict';

const PLATFORM_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', kimi: 'Kimi' };
const PLATFORM_DOMAINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
  claude: ['claude.ai'],
  kimi: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'],
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
  const dot = document.createElement('span');
  dot.className = 'dot ' + (rec.platform || 'unknown');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = rec.title;
  name.title = rec.title;
  t.appendChild(dot);
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
  avatar.style.background = 'color-mix(in srgb, var(--' + (rec.platform || 'unknown') + ') 10%, transparent)';
  avatar.style.border = '1px solid color-mix(in srgb, var(--' + (rec.platform || 'unknown') + ') 20%, transparent)';
  avatar.style.color = 'var(--' + (rec.platform || 'unknown') + ')';
  const avIcon = { chatgpt: 'smart_toy', claude: 'psychology', kimi: 'auto_awesome' }[rec.platform] || 'description';
  avatar.innerHTML = icon(avIcon);

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
    setStatus('Open a ChatGPT, Claude, or Kimi conversation to export it.', 'error');
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
    setStatus('Open a ChatGPT, Claude, or Kimi conversation to export it.', 'error');
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
