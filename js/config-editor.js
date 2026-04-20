// ── Config Editor — lightweight JSON editor for user config ──

import { getConfig, saveConfig, resetConfig, getDefaultConfig } from './config.js';
import { t } from './i18n.js';
import { toast, closeModal } from './ui.js';
import { state, notify } from './state.js';
import { saveToGist } from './storage.js';

/**
 * Render the config editor modal.
 */
export function showConfigEditor() {
  const config = getConfig();
  const json = JSON.stringify(config, null, 2);

  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modal = document.getElementById('modal');

  modalTitle.textContent = t('config.editorTitle');

  modalBody.innerHTML = `
    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">${t('config.editorDesc')}</p>
    <div style="position:relative;">
      <textarea id="configEditorText" style="
        width:100%; height:400px; resize:vertical;
        font-family:var(--font-mono); font-size:12px;
        background:var(--bg-input); color:var(--text-primary);
        border:1px solid var(--border); border-radius:8px;
        padding:12px; line-height:1.5; tab-size:2;
      ">${escapeHtml(json)}</textarea>
      <div id="configEditorError" style="font-size:11px;color:var(--danger);margin-top:4px;display:none;"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn-s" id="btnConfigSave" style="border-color:var(--success);color:var(--success);">${t('config.save')}</button>
      <button class="btn-s" id="btnConfigFormat">${t('config.format')}</button>
      <button class="btn-s" id="btnConfigReset" style="border-color:var(--danger);color:var(--danger);">${t('config.reset')}</button>
      <button class="btn-s" id="btnConfigClose">${t('modal.close')}</button>
    </div>
    <details style="margin-top:16px;">
      <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;">${t('config.reference')}</summary>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.6;margin-top:8px;">
        <pre style="white-space:pre-wrap;font-family:var(--font-mono);">${escapeHtml(getConfigReference())}</pre>
      </div>
    </details>
  `;

  // Hide default modal actions
  const modalActions = modal.querySelector('.modal-actions');
  if (modalActions) modalActions.style.display = 'none';

  // Bind
  document.getElementById('btnConfigSave').onclick = () => {
    const text = document.getElementById('configEditorText').value;
    const errEl = document.getElementById('configEditorError');
    try {
      const parsed = JSON.parse(text);
      saveConfig(parsed);
      errEl.style.display = 'none';
      toast(t('config.saved'));
      notify({ type: 'config-change' });
      saveToGist();
    } catch (e) {
      errEl.textContent = `JSON Error: ${e.message}`;
      errEl.style.display = 'block';
    }
  };

  document.getElementById('btnConfigFormat').onclick = () => {
    const ta = document.getElementById('configEditorText');
    const errEl = document.getElementById('configEditorError');
    try {
      const parsed = JSON.parse(ta.value);
      ta.value = JSON.stringify(parsed, null, 2);
      errEl.style.display = 'none';
    } catch (e) {
      errEl.textContent = `JSON Error: ${e.message}`;
      errEl.style.display = 'block';
    }
  };

  document.getElementById('btnConfigReset').onclick = () => {
    if (!confirm(t('config.confirmReset'))) return;
    resetConfig();
    document.getElementById('configEditorText').value = JSON.stringify(getConfig(), null, 2);
    toast(t('config.resetDone'));
    notify({ type: 'config-change' });
  };

  document.getElementById('btnConfigClose').onclick = () => {
    const modalActions = modal.querySelector('.modal-actions');
    if (modalActions) modalActions.style.display = '';
    closeModal();
  };

  // Tab key inserts spaces in textarea
  document.getElementById('configEditorText').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = start + 2;
    }
  });

  modal.classList.add('show');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getConfigReference() {
  return `Config reference:

dose.maxDosesPerDay     Max doses per day selector (1-6, default: 3)
dose.allowCustomDose    Allow typing any dose, not just step values
dose.defaultDoseTime    Default time for first dose
dose.doseTimePresets    Preset times for dose slots ["07:00","12:00","18:00"]

form.defaultMode        Default tracking mode: "basic" | "advanced"
form.showQolInBasic     Show QoL metrics in basic mode too
form.scaleRange         Scale button range [min, max]

charts.trendDays        Days shown in trend chart (default: 14)
charts.showCorrelation  Show correlation matrix

ai.prompt               System prompt for AI export (editable!)
ai.disclaimer           Disclaimer text appended to export
ai.includeRawData       Include raw JSON data in export
ai.rawDataEntries       How many recent entries to include
ai.includeHealthData    Include imported health data

profileOverrides        Override metrics per drug category:
  { "stimulant": {
      "addMetrics": ["myCustom"],
      "removeMetrics": ["tinnitus", "rls"]
  }}

customMetrics           Define new metrics:
  [{ "id": "myMetric",
     "type": "scale",
     "group": "metrics",
     "label": { "cs": "Můj ukazatel", "en": "My metric" }
  }]

Metric types: scale, toggle, time, number
Groups: metrics, perception, body, energy, sleep, qol`;
}
