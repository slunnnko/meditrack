// ── Storage — localStorage + File System Access API + GitHub Gist sync ──

import { state, notify, entryKey } from './state.js';
import { t } from './i18n.js';
import { updateStatus } from './ui.js';

const ENTRIES_KEY = 'ct_entries';
const GIST_KEY = 'ct_gist';
const SETTINGS_KEY = 'ct_settings';
const HEALTH_KEY = 'ct_health_data';
const GIST_FILENAME = 'medication-tracker-data.json';
const LEGACY_GIST_FILENAME = 'concerta-data.json';

// ── File System Access API (Tier 2) ──
let fileHandle = null;

export function isFileSystemSupported() {
  return 'showSaveFilePicker' in window;
}

export function hasFileHandle() {
  return fileHandle !== null;
}

export async function pickSyncFile() {
  if (!isFileSystemSupported()) return false;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: 'medication-tracker.json',
      types: [{
        description: 'JSON data',
        accept: { 'application/json': ['.json'] },
      }],
    });
    // Write current data to picked file immediately
    await writeToFile();
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('File picker error:', e);
    return false;
  }
}

export async function openSyncFile() {
  if (!isFileSystemSupported()) return false;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'JSON data',
        accept: { 'application/json': ['.json'] },
      }],
    });
    fileHandle = handle;
    await readFromFile();
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('File open error:', e);
    return false;
  }
}

async function writeToFile() {
  if (!fileHandle) return;
  try {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      entries: state.entries,
      healthData: state.healthData,
      settings: {
        activeDrug: state.settings.activeDrug,
        mode: state.settings.mode,
        lang: state.settings.lang,
        activeCondition: state.settings.activeCondition,
      },
    };
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (e) {
    console.warn('File write error:', e);
    // Permission revoked or file moved — clear handle
    if (e.name === 'NotAllowedError') fileHandle = null;
  }
}

async function readFromFile() {
  if (!fileHandle) return;
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.version >= 2) {
      // Merge entries (newer timestamp wins)
      mergeEntriesSmart(data.entries || []);
      // Merge health data
      if (data.healthData) {
        for (const [date, hd] of Object.entries(data.healthData)) {
          state.healthData[date] = { ...state.healthData[date], ...hd };
        }
      }
    } else if (Array.isArray(data)) {
      // Legacy format: plain array of entries
      mergeEntries(data);
    }

    saveEntries();
    saveHealthData();
    notify({ type: 'entries-changed' });
  } catch (e) {
    console.warn('File read error:', e);
  }
}

function mergeEntriesSmart(remote) {
  const merged = {};
  // Remote entries
  for (const e of remote) merged[entryKey(e)] = e;
  // Local entries override if newer timestamp
  for (const e of state.entries) {
    const key = entryKey(e);
    if (!merged[key] || (e.timestamp && merged[key].timestamp && e.timestamp > merged[key].timestamp)) {
      merged[key] = e;
    }
  }
  state.entries = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sync to file if handle exists. Called after every save.
 */
export async function syncToFile() {
  if (fileHandle) await writeToFile();
}

/**
 * Sync from file if handle exists. Called on app init or manual refresh.
 */
export async function syncFromFile() {
  if (fileHandle) await readFromFile();
}

// ── Load from localStorage ──
export function loadFromLocal() {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (raw) state.entries = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  try {
    const raw = localStorage.getItem(GIST_KEY);
    if (raw) state.settings.gist = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.lang) state.settings.lang = s.lang;
      if (s.activeDrug) state.settings.activeDrug = s.activeDrug;
      if (s.mode) state.settings.mode = s.mode;
    }
  } catch (e) { /* ignore */ }

  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (raw) state.healthData = JSON.parse(raw);
  } catch (e) { /* ignore */ }
}

// ── Save to localStorage + file ──
export function saveEntries() {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(state.entries));
  syncToFile(); // async, fire-and-forget
}

export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    lang: state.settings.lang,
    activeDrug: state.settings.activeDrug,
    mode: state.settings.mode,
  }));
}

export function saveGistConfig() {
  localStorage.setItem(GIST_KEY, JSON.stringify(state.settings.gist));
}

export function saveHealthData() {
  localStorage.setItem(HEALTH_KEY, JSON.stringify(state.healthData));
}

// ── Gist sync ──
export async function saveToGist() {
  const g = state.settings.gist;
  if (!g.token) return;

  const payload = {
    files: { [GIST_FILENAME]: { content: JSON.stringify(state.entries, null, 2) } }
  };

  try {
    if (g.id) {
      await fetch('https://api.github.com/gists/' + g.id, {
        method: 'PATCH',
        headers: { 'Authorization': 'token ' + g.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      payload.description = 'Medication Tracker Data';
      payload.public = false;
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: { 'Authorization': 'token ' + g.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      g.id = json.id;
      saveGistConfig();
    }
    updateStatus(t('status.synced'), true);
  } catch (err) {
    console.error('Gist save:', err);
    updateStatus(t('status.syncError'), false);
  }
}

export async function syncFromGist() {
  const g = state.settings.gist;
  if (!g.token || !g.id) return;

  try {
    const res = await fetch('https://api.github.com/gists/' + g.id, {
      headers: { 'Authorization': 'token ' + g.token }
    });
    const json = await res.json();

    // Try new filename first, fall back to legacy
    let content = json.files?.[GIST_FILENAME]?.content;
    if (!content) {
      content = json.files?.[LEGACY_GIST_FILENAME]?.content;
      if (content) {
        // Migrate: rename file in gist
        await fetch('https://api.github.com/gists/' + g.id, {
          method: 'PATCH',
          headers: { 'Authorization': 'token ' + g.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: {
              [LEGACY_GIST_FILENAME]: { filename: GIST_FILENAME }
            }
          })
        });
      }
    }

    if (content) {
      const remote = JSON.parse(content);
      mergeEntries(remote);
      saveEntries();
      updateStatus(t('status.synced'), true);
      notify({ type: 'entries-changed' });
    }
  } catch (err) {
    console.error('Gist sync:', err);
    updateStatus(t('status.syncError'), false);
  }
}

function mergeEntries(remote) {
  const merged = {};
  for (const e of remote) merged[entryKey(e)] = e;
  for (const e of state.entries) {
    const key = entryKey(e);
    if (!merged[key]) merged[key] = e;
  }
  state.entries = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
}

export async function testGistConnection(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + token }
    });
    const json = await res.json();
    if (json.login) {
      return { ok: true, login: json.login };
    }
    return { ok: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Export / Import ──
export function exportJSON() {
  const blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `medication-tracker-${d}.json`;
  a.click();
}

export function importJSON(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const imp = JSON.parse(await f.text());
      if (Array.isArray(imp)) {
        mergeEntries(imp);
        saveEntries();
        saveToGist();
        if (onDone) onDone(imp.length);
      }
    } catch (e) {
      if (onDone) onDone(-1);
    }
  };
  inp.click();
}
