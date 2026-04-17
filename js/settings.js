// ── Settings — settings UI ──

import { state, notify } from './state.js';
import { t, setLang, getLang, getAvailableLangs } from './i18n.js';
import { toast, updateStatus } from './ui.js';
import { saveSettings, saveGistConfig, testGistConnection, exportJSON, importJSON, saveEntries, saveToGist, isFileSystemSupported, hasFileHandle, pickSyncFile, openSyncFile, syncFromFile } from './storage.js';
import { searchDrugs, createCustomDrug, atcToCategory } from './drug-search.js';
import { PROFILES } from './drug-profiles.js';
import { copyAiExport, downloadAiExport } from './ai-export.js';
import { showConfigEditor } from './config-editor.js';

export function renderSettings(container) {
  const g = state.settings.gist;
  const drug = state.settings.activeDrug;
  const lang = getLang();

  let html = '';

  // Language
  html += `<div class="settings-section">
    <h3>${t('settings.language')}</h3>
    <div class="lang-toggle">
      <button class="lang-btn ${lang === 'cs' ? 'active' : ''}" data-lang="cs">CZ</button>
      <button class="lang-btn ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
    </div>
  </div>`;

  // Active medication
  html += `<div class="settings-section">
    <h3>${t('settings.medication')}</h3>`;
  if (drug) {
    html += `<div style="margin-bottom:12px;">
      <span style="font-size:15px;font-weight:600;color:var(--accent);">${drug.name?.cs || drug.name?.en || drug.id}</span>
      <span style="font-size:12px;color:var(--text-dim);margin-left:8px;">${drug.category}</span>
    </div>
    <button class="btn-s" id="btnChangeDrug">${t('settings.changeDrug')}</button>`;
  } else {
    html += `<p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">${t('drug.select')}</p>
    <button class="btn-s" id="btnChangeDrug">${t('settings.changeDrug')}</button>`;
  }
  html += `</div>`;

  // Tracking mode
  html += `<div class="settings-section">
    <h3>${t('settings.mode')}</h3>
    <div class="mode-toggle">
      <button class="mode-btn ${state.settings.mode === 'basic' ? 'active' : ''}" data-smode="basic">${t('mode.basic')}</button>
      <button class="mode-btn ${state.settings.mode === 'advanced' ? 'active' : ''}" data-smode="advanced">${t('mode.advanced')}</button>
    </div>
  </div>`;

  // File Sync (Tier 2)
  const fsSupported = isFileSystemSupported();
  const fsActive = hasFileHandle();
  html += `<div class="settings-section">
    <h3>${t('settings.fileSync')}</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${t('settings.fileSyncDesc')}</p>`;

  if (fsSupported) {
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <button class="btn-s" id="btnFileSyncNew" ${fsActive ? '' : 'style="border-color:var(--success);color:var(--success);"'}>${t('settings.fileSyncNew')}</button>
      <button class="btn-s" id="btnFileSyncOpen">${t('settings.fileSyncOpen')}</button>
      ${fsActive ? `<button class="btn-s" id="btnFileSyncRefresh">${t('settings.fileSyncRefresh')}</button>` : ''}
    </div>`;
    if (fsActive) {
      html += `<div style="font-size:11px;color:var(--success);">✓ ${t('settings.fileSyncActive')}</div>`;
    }
  } else {
    html += `<p style="font-size:12px;color:var(--text-dim);">${t('settings.fileSyncUnsupported')}</p>`;
  }
  html += `</div>`;

  // Gist (Tier 3)
  html += `<div class="settings-section">
    <h3>${t('settings.gist')}</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${t('settings.gistDesc')}</p>
    <div style="margin-bottom:12px;">
      <a href="https://github.com/settings/tokens/new?scopes=gist&description=Medication+Tracker" target="_blank" rel="noopener" style="font-size:12px;color:var(--accent);">${t('settings.gistCreateToken')} →</a>
    </div>
    <div class="settings-row">
      <label>${t('settings.token')}</label>
      <input type="password" id="s-token" value="${g.token || ''}" placeholder="ghp_...">
    </div>
    <div class="settings-row">
      <label>${t('settings.gistId')}</label>
      <input type="text" id="s-gistId" value="${g.id || ''}" placeholder="${t('settings.gistIdPlaceholder')}">
    </div>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button class="btn-s" id="btnSaveGist">${t('settings.save')}</button>
      <button class="btn-s" id="btnTestConn">${t('settings.testConn')}</button>
    </div>
  </div>`;

  // AI Export
  html += `<div class="settings-section">
    <h3>${t('settings.aiExport')}</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${t('settings.aiExportDesc')}</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn-s" id="btnAiCopy" style="border-color:var(--accent-purple);color:var(--accent-purple);">${t('settings.aiExportCopy')}</button>
      <button class="btn-s" id="btnAiDownload">${t('settings.aiExportDownload')}</button>
    </div>
  </div>`;

  // Health import
  html += `<div class="settings-section">
    <h3>${t('settings.healthImport')}</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn-s" id="btnAppleHealth">${t('settings.appleHealth')}</button>
      <button class="btn-s" id="btnWithingsCsv">${t('settings.withingsCsv')}</button>
    </div>
  </div>`;

  // Config editor
  html += `<div class="settings-section">
    <h3>${t('settings.config')}</h3>
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${t('settings.configDesc')}</p>
    <button class="btn-s" id="btnConfigEditor" style="border-color:var(--accent);color:var(--accent);">${t('settings.configOpen')}</button>
  </div>`;

  // Data
  html += `<div class="settings-section">
    <h3>${t('settings.data')}</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn-s" id="btnExport">${t('settings.export')}</button>
      <button class="btn-s" id="btnImport">${t('settings.import')}</button>
      <button class="btn-d" id="btnClear">${t('settings.clearAll')}</button>
    </div>
  </div>`;

  container.innerHTML = html;
  bindSettingsEvents(container);
}

function bindSettingsEvents(container) {
  // Language
  for (const btn of container.querySelectorAll('.lang-btn')) {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      state.settings.lang = btn.dataset.lang;
      saveSettings();
      notify({ type: 'lang-change' });
    });
  }

  // Mode
  for (const btn of container.querySelectorAll('[data-smode]')) {
    btn.addEventListener('click', () => {
      state.settings.mode = btn.dataset.smode;
      saveSettings();
      notify({ type: 'mode-change', mode: btn.dataset.smode });
    });
  }

  // File sync
  const fileSyncNewBtn = document.getElementById('btnFileSyncNew');
  if (fileSyncNewBtn) {
    fileSyncNewBtn.addEventListener('click', async () => {
      const ok = await pickSyncFile();
      if (ok) {
        toast(t('toast.fileSyncLinked'));
        renderSettings(container); // re-render to show active state
      }
    });
  }
  const fileSyncOpenBtn = document.getElementById('btnFileSyncOpen');
  if (fileSyncOpenBtn) {
    fileSyncOpenBtn.addEventListener('click', async () => {
      const ok = await openSyncFile();
      if (ok) {
        toast(t('toast.fileSyncLoaded'));
        renderSettings(container);
        notify({ type: 'entries-changed' });
      }
    });
  }
  const fileSyncRefreshBtn = document.getElementById('btnFileSyncRefresh');
  if (fileSyncRefreshBtn) {
    fileSyncRefreshBtn.addEventListener('click', async () => {
      await syncFromFile();
      toast(t('toast.fileSyncRefreshed'));
      notify({ type: 'entries-changed' });
    });
  }

  // Change drug
  const changeDrugBtn = document.getElementById('btnChangeDrug');
  if (changeDrugBtn) {
    changeDrugBtn.addEventListener('click', () => {
      notify({ type: 'show-drug-selector' });
    });
  }

  // Gist save
  const saveGistBtn = document.getElementById('btnSaveGist');
  if (saveGistBtn) {
    saveGistBtn.addEventListener('click', () => {
      state.settings.gist.token = document.getElementById('s-token').value.trim();
      state.settings.gist.id = document.getElementById('s-gistId').value.trim();
      saveGistConfig();
      toast(t('toast.settingsSaved'));
      updateStatus();
    });
  }

  // Test connection
  const testBtn = document.getElementById('btnTestConn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const token = document.getElementById('s-token').value.trim();
      if (!token) { toast(t('toast.enterToken')); return; }
      const result = await testGistConnection(token);
      if (result.ok) {
        toast(t('toast.tokenOk', { name: result.login }));
        updateStatus(t('status.connected', { name: result.login }), true);
      } else {
        toast(t('toast.tokenFail'));
        updateStatus(t('status.invalidToken'), false);
      }
    });
  }

  // Health import buttons
  const appleBtn = document.getElementById('btnAppleHealth');
  if (appleBtn) {
    appleBtn.addEventListener('click', () => {
      notify({ type: 'import-apple-health' });
    });
  }
  const withingsBtn = document.getElementById('btnWithingsCsv');
  if (withingsBtn) {
    withingsBtn.addEventListener('click', () => {
      notify({ type: 'import-withings-csv' });
    });
  }

  // Config editor
  const configBtn = document.getElementById('btnConfigEditor');
  if (configBtn) configBtn.addEventListener('click', showConfigEditor);

  // AI Export
  const aiCopyBtn = document.getElementById('btnAiCopy');
  if (aiCopyBtn) aiCopyBtn.addEventListener('click', copyAiExport);
  const aiDownloadBtn = document.getElementById('btnAiDownload');
  if (aiDownloadBtn) aiDownloadBtn.addEventListener('click', downloadAiExport);

  // Export
  const exportBtn = document.getElementById('btnExport');
  if (exportBtn) exportBtn.addEventListener('click', exportJSON);

  // Import
  const importBtn = document.getElementById('btnImport');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importJSON((count) => {
        if (count >= 0) {
          toast(t('toast.importDone', { n: count }));
          notify({ type: 'entries-changed' });
        } else {
          toast(t('toast.importError'));
        }
      });
    });
  }

  // Clear
  const clearBtn = document.getElementById('btnClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm(t('confirm.clearAll'))) return;
      if (!confirm(t('confirm.clearAll2'))) return;
      state.entries = [];
      saveEntries();
      saveToGist();
      toast(t('toast.dataCleared'));
      notify({ type: 'entries-changed' });
    });
  }
}
