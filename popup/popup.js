'use strict';

const PLATFORM_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', kimi: 'Kimi' };
const PLATFORM_DOMAINS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com', 'openai.com'],
  claude: ['claude.ai'],
  kimi: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'],
};

const state = { tabId: null, platform: null, available: false };

function $(id) {
  return document.getElementById(id);
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

function setSiteLabel(text) {
  $('site-label').textContent = text;
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
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

// ------------------------------------------------------------ archive/history

const ICON_SVG = {
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  delete:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
};

function historyActionButton(kind, label, className, onClick) {
  const b = document.createElement('button');
  b.className = 'history-btn' + (className ? ' ' + className : '');
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = ICON_SVG[kind] || '';
  b.addEventListener('click', onClick);
  return b;
}

function buildHistoryRow(rec) {
  const li = document.createElement('li');
  li.className = 'history-item';

  const badge = document.createElement('span');
  badge.className = 'history-badge ' + (rec.platform || 'unknown');
  badge.textContent = rec.platform || '?';

  const title = document.createElement('div');
  title.className = 'history-title';
  title.textContent = rec.title;
  title.title = rec.title;

  const meta = document.createElement('div');
  meta.className = 'history-meta';
  let metaText = rec.messageCount != null ? rec.messageCount + ' msgs' : '';
  if (rec.createdAt) {
    const d = new Date(rec.createdAt);
    if (!isNaN(d)) {
      const stamp = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      metaText += (metaText ? '\n' : '') + stamp;
    }
  }
  meta.textContent = metaText;

  const actions = document.createElement('div');
  actions.className = 'history-actions';
  actions.appendChild(historyActionButton('download', 'Download Markdown', '', () => downloadArchive(rec)));
  actions.appendChild(historyActionButton('copy', 'Copy Markdown', '', () => copyArchive(rec)));
  actions.appendChild(historyActionButton('delete', 'Delete from history', 'danger', () => deleteArchive(rec)));

  li.appendChild(badge);
  li.appendChild(title);
  li.appendChild(meta);
  li.appendChild(actions);
  return li;
}

async function renderHistory() {
  const listEl = $('history-list');
  const emptyEl = $('history-empty');
  let archives = [];
  try {
    archives = await listArchives();
  } catch (e) {
    listEl.textContent = '';
    if (emptyEl) emptyEl.style.display = '';
    setStatus('History unavailable: ' + e.message, 'error');
    return;
  }
  listEl.textContent = '';
  if (emptyEl) emptyEl.style.display = archives.length ? 'none' : '';
  for (const rec of archives) listEl.appendChild(buildHistoryRow(rec));
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

async function init() {
  renderHistory();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    setSiteLabel('No active tab.');
    setStatus('Open a ChatGPT, Claude, or Kimi conversation to export it.', 'error');
    return;
  }

  state.tabId = tab.id;
  state.platform = detectPlatformFromUrl(tab.url);

  // Restore the last chosen format.
  const stored = await chrome.storage.local.get('format');
  const wanted = stored.format === 'both' ? 'markdown' : stored.format;
  const radio = document.querySelector(`input[name="format"][value="${wanted}"]`);
  if (radio) radio.checked = true;

  document.querySelectorAll('input[name="format"]').forEach((input) => {
    input.addEventListener('change', () => {
      chrome.storage.local.set({ format: input.value });
    });
  });

  if (!state.platform) {
    setSiteLabel('Not a supported site');
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
      setSiteLabel(PLATFORM_LABELS[state.platform] + ' — conversation ready');
      setStatus('');
      setExportEnabled(true);
    } else {
      setSiteLabel(PLATFORM_LABELS[state.platform] + ' detected');
      setStatus('No conversation on this page. Open a chat first.', 'error');
      setExportEnabled(false);
    }
  } else {
    const msg = friendlyError(
      resp && resp.error ? resp.error : 'Content script not ready. Reload the chat page.'
    );
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
  const format = document.querySelector('input[name="format"]:checked').value;
  setExportEnabled(false);
  setStatus('Exporting…');

  const resp = await sendToTab(state.tabId, { type: 'EXPORT' });
  if (!resp || !resp.ok || !resp.model) {
    setStatus(friendlyError((resp && resp.error) || 'Export failed.'), 'error');
    setExportEnabled(true);
    return;
  }

  const model = resp.model;
  const base =
    sanitizeFilename(model.platform + '-' + model.title + '-' + dateStamp());

  const name = base + (format === 'json' ? '.json' : '.md');
  const content = format === 'json' ? buildJson(model) : buildMarkdown(model);
  const mime = format === 'json' ? 'application/json' : 'text/markdown';
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
  init();
});
