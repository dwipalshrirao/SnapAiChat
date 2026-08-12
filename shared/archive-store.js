'use strict';

// Extension-wide archive of exported conversations, persisted in the
// extension's OWN chrome.storage.local — never the page's storage. Each
// entry stores the export model as a single source of truth; Markdown and
// JSON are rendered on demand from that model.

const ARCHIVE_KEY = 'exports:v1';
const ARCHIVE_CAP = 200;

function readArchive() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(ARCHIVE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const arr = (result && result[ARCHIVE_KEY]) || [];
        resolve(Array.isArray(arr) ? arr : []);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function writeArchive(list) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [ARCHIVE_KEY]: list }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(list);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function listArchives() {
  const list = await readArchive();
  return list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function addArchive(model) {
  return readArchive().then((list) => {
    const id = 'x-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const record = {
      id,
      platform: model.platform || '',
      title: model.title || 'Untitled conversation',
      url: model.url || '',
      createdAt: new Date().toISOString(),
      messageCount: (model.messages || []).length,
      model,
    };
    list.push(record);
    const capped = list.length > ARCHIVE_CAP ? list.slice(list.length - ARCHIVE_CAP) : list;
    return writeArchive(capped).then(() => record);
  });
}

function removeArchive(id) {
  return readArchive().then((list) =>
    writeArchive(list.filter((rec) => rec.id !== id))
  );
}

function clearArchive() {
  return writeArchive([]);
}

// Filesystem-friendly filename built from an archive record.
function archiveFilenameFor(rec) {
  const stamp = (rec.createdAt || '').slice(0, 19).replace(/[:T]/g, '-');
  return sanitizeFilename(rec.platform + '-' + rec.title + '-' + stamp);
}