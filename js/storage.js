// ── Storage — localStorage + File System Access API + GitHub Gist sync ──

import { state, notify, entryKey } from './state.js';
import { t } from './i18n.js';
import { updateStatus, toast } from './ui.js';
import { getSyncedConfig, applySyncedConfig } from './config.js';
import {
  isUnlocked, getMkBytes, getEnvelope, setSession, clearSession,
  promptUnlock, promptSetup, reseal,
} from './sync-unlock.js';
import { decryptPayload } from './crypto.js';

const ENTRIES_KEY = 'ct_entries';
const GIST_KEY = 'ct_gist';
const SETTINGS_KEY = 'ct_settings';
const HEALTH_KEY = 'ct_health_data';
const HR_BASELINE_KEY = 'ct_hr_baseline';
const GIST_FILENAME_ENC = 'medication-tracker.enc.json';
const GIST_FILENAME_LEGACY = 'medication-tracker-data.json';
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

  try {
    const raw = localStorage.getItem(HR_BASELINE_KEY);
    if (raw) state.hrBaseline = JSON.parse(raw);
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

export function saveHrBaseline() {
  if (state.hrBaseline) {
    localStorage.setItem(HR_BASELINE_KEY, JSON.stringify(state.hrBaseline));
  } else {
    localStorage.removeItem(HR_BASELINE_KEY);
  }
}

// ── Gist sync (E2E encrypted) ──
async function patchGist(g, files) {
  return fetch('https://api.github.com/gists/' + g.id, {
    method: 'PATCH',
    headers: { 'Authorization': 'token ' + g.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
}

async function createGist(g, files) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { 'Authorization': 'token ' + g.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'Medication Tracker Data', public: false, files }),
  });
  return res.json();
}

async function fetchGist(g) {
  const res = await fetch('https://api.github.com/gists/' + g.id, {
    headers: { 'Authorization': 'token ' + g.token },
  });
  return res.json();
}

function buildPlaintext() {
  return {
    entries: state.entries,
    config: getSyncedConfig(),
  };
}

function applyPlaintext(plain) {
  if (Array.isArray(plain?.entries)) {
    mergeEntries(plain.entries);
    saveEntries();
    notify({ type: 'entries-changed' });
  }
  if (plain?.config && typeof plain.config === 'object') {
    applySyncedConfig(plain.config);
  }
}

export async function saveToGist() {
  const g = state.settings.gist;
  if (!g.token) return;
  if (!isUnlocked()) return; // nothing to do until user unlocks this session

  const envelope = getEnvelope();
  if (!envelope) return;

  try {
    const sealed = await reseal(envelope, getMkBytes(), buildPlaintext());
    setSession(sealed, getMkBytes());

    const content = JSON.stringify(sealed);
    const files = { [GIST_FILENAME_ENC]: { content } };

    if (g.id) {
      await patchGist(g, files);
    } else {
      const json = await createGist(g, files);
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
    const json = await fetchGist(g);

    const encContent = json.files?.[GIST_FILENAME_ENC]?.content;
    if (encContent) {
      let envelope;
      try { envelope = JSON.parse(encContent); }
      catch (_) { updateStatus(t('status.syncError'), false); return; }

      // Already unlocked this session? Try the cached MK first.
      if (isUnlocked()) {
        try {
          const plain = await decryptPayload(envelope.payload, envelope.payloadIv, getMkBytes());
          setSession(envelope, getMkBytes());
          applyPlaintext(plain);
          updateStatus(t('status.synced'), true);
          return;
        } catch (_) {
          // Cached MK doesn't match (key rotated elsewhere). Force re-unlock.
          clearSession();
        }
      }

      try {
        const { plaintext, mkBytes } = await promptUnlock(envelope);
        setSession(envelope, mkBytes);
        applyPlaintext(plaintext);
        updateStatus(t('status.synced'), true);
      } catch (_) {
        updateStatus(t('unlock.cancelledStatus'), false);
      }
      return;
    }

    // No encrypted file. Check for legacy plaintext — user needs to opt in to migrate.
    const legacyContent = json.files?.[GIST_FILENAME_LEGACY]?.content
                       ?? json.files?.[LEGACY_GIST_FILENAME]?.content;
    if (legacyContent) {
      updateStatus(t('status.legacyFound'), false);
      toast(t('toast.legacyFound'));
      return;
    }

    // Empty gist — nothing to sync.
  } catch (err) {
    console.error('Gist sync:', err);
    updateStatus(t('status.syncError'), false);
  }
}

/**
 * First-time enable: build an envelope from local state (and any legacy plaintext),
 * upload to the Gist, and retire the legacy file.
 * Called from the settings panel.
 */
export async function setupEncryptedSync() {
  const g = state.settings.gist;
  if (!g.token) {
    toast(t('toast.enterToken'));
    return false;
  }

  let legacyEntries = null;
  if (g.id) {
    try {
      const json = await fetchGist(g);
      if (json.files?.[GIST_FILENAME_ENC]) {
        toast(t('toast.alreadyEncrypted'));
        return false;
      }
      const legacyContent = json.files?.[GIST_FILENAME_LEGACY]?.content
                         ?? json.files?.[LEGACY_GIST_FILENAME]?.content;
      if (legacyContent) {
        try { legacyEntries = JSON.parse(legacyContent); } catch (_) {}
      }
    } catch (err) {
      console.warn('Setup precheck failed:', err);
    }
  }

  // Merge legacy entries into local state so they end up in the encrypted payload.
  if (Array.isArray(legacyEntries)) {
    mergeEntries(legacyEntries);
    saveEntries();
  }

  try {
    const { envelope, mkBytes } = await promptSetup({ plaintext: buildPlaintext() });

    const content = JSON.stringify(envelope);
    const files = { [GIST_FILENAME_ENC]: { content } };
    // Remove legacy files on the same PATCH so they don't leak.
    if (g.id) {
      files[GIST_FILENAME_LEGACY] = null;
      files[LEGACY_GIST_FILENAME] = null;
      await patchGist(g, files);
    } else {
      const json = await createGist(g, files);
      g.id = json.id;
      saveGistConfig();
    }

    setSession(envelope, mkBytes);
    updateStatus(t('status.synced'), true);
    notify({ type: 'entries-changed' });
    return true;
  } catch (e) {
    if (e?.message !== 'cancelled') console.error('Setup failed:', e);
    return false;
  }
}

/**
 * Replace the stored envelope on the Gist (after password change / passkey add).
 */
export async function pushEnvelope(envelope) {
  const g = state.settings.gist;
  if (!g.token || !g.id) return false;
  try {
    await patchGist(g, { [GIST_FILENAME_ENC]: { content: JSON.stringify(envelope) } });
    return true;
  } catch (err) {
    console.error('Envelope push failed:', err);
    return false;
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
