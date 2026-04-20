// ── Form — dynamic form generation based on drug profile ──

import { state, notify, getEntryByDate } from './state.js';
import { t } from './i18n.js';
import { toast, dateKey } from './ui.js';
import { saveEntries } from './storage.js';
import { saveToGist } from './storage.js';
import { METRICS, GROUPS, getMetricsForProfile } from './drug-profiles.js';
import { getConfig } from './config.js';

/**
 * Auto-fill form fields from imported health device data (Withings, Apple Health).
 * Looks up state.healthData[date] and fills matching metric inputs.
 */
function autoFillFromHealthData(date) {
  const hd = state.healthData?.[date];
  if (!hd) return;

  const drug = state.settings.activeDrug;
  if (!drug) return;

  const mode = state.settings.mode;
  const metrics = getMetricsForProfile(drug.category, mode);

  for (const m of metrics) {
    if (!m.autoFill) continue;
    const val = hd[m.autoFill];
    if (val == null) continue;

    const input = document.getElementById('f-' + m.id);
    if (input) {
      input.value = val;
      input.readOnly = true;
      input.classList.add('auto-filled');
      const badge = document.getElementById('badge-' + m.id);
      if (badge) badge.style.display = 'inline';
    }
  }
}

export function renderForm(container) {
  const drug = state.settings.activeDrug;
  if (!drug) {
    container.innerHTML = '';
    return;
  }

  const mode = state.settings.mode;
  const metrics = getMetricsForProfile(drug.category, mode);
  const dosesPerDay = drug.dosesPerDay || 1;

  let html = '';

  // Date bar
  html += `<div class="date-bar">
    <input type="date" id="entryDate">
    <span id="entryExists" class="warn" style="display:none;">${t('form.dateExists')}</span>
  </div>`;

  // Mode toggle
  html += `<div class="mode-toggle">
    <button class="mode-btn ${mode === 'basic' ? 'active' : ''}" data-mode="basic">${t('mode.basic')}</button>
    <button class="mode-btn ${mode === 'advanced' ? 'active' : ''}" data-mode="advanced">${t('mode.advanced')}</button>
  </div>`;

  // Dose card
  const cfg = getConfig();
  const dpdOptions = cfg.dose.dosesPerDayOptions || [1, 2, 3];
  html += `<div class="form-card">
    <div class="form-card-title">${t('form.dose')}</div>
    <div class="field">
      <label>${t('form.dosesPerDay')}</label>
      <div class="toggle-group" id="dosesPerDayToggle">
        ${dpdOptions.map(n => `<button class="toggle-btn ${n === dosesPerDay ? 'sel' : ''}" data-dpd="${n}">${n}×</button>`).join('')}
      </div>
    </div>
    <div class="dose-rows" id="doseRows">
      ${renderDoseRows(dosesPerDay, drug)}
    </div>
  </div>`;

  // Group metrics by their group
  const grouped = {};
  for (const m of metrics) {
    if (!grouped[m.group]) grouped[m.group] = [];
    grouped[m.group].push(m);
  }

  // Render each group as a form card
  const groupOrder = Object.entries(GROUPS).sort((a, b) => a[1].order - b[1].order);
  for (const [groupId, groupDef] of groupOrder) {
    const groupMetrics = grouped[groupId];
    if (!groupMetrics || groupMetrics.length === 0) continue;

    // Energy group is special — render as a grid
    if (groupId === 'energy') {
      html += renderEnergyCard(groupMetrics, groupDef);
      continue;
    }

    html += `<div class="form-card">
      <div class="form-card-title">${t(groupDef.title)}</div>`;

    for (const m of groupMetrics) {
      html += renderMetricField(m);
    }

    html += `</div>`;
  }

  // Note card
  html += `<div class="form-card">
    <div class="form-card-title">${t('note.title')}</div>
    <div class="field">
      <textarea id="f-note" placeholder="${t('form.note.placeholder')}"></textarea>
    </div>
  </div>`;

  // Save button
  html += `<button class="submit-btn" id="saveBtn">${t('form.save')}</button>`;

  container.innerHTML = html;
  bindFormEvents(container);

  // Set today's date
  document.getElementById('entryDate').value = dateKey(new Date());
  checkExists();
}

function renderDoseRows(count, drug) {
  const cfg = getConfig();
  const timePresets = cfg.dose.doseTimePresets || ['07:00', '12:00', '18:00'];
  const allowCustom = cfg.dose.allowCustomDose;
  // Merge custom dose values from config with drug defaults
  const customValues = cfg.dose.customDoseValues?.length ? cfg.dose.customDoseValues : (drug.doseCommon || []);
  let html = '';
  for (let i = 0; i < count; i++) {
    const label = count > 1 ? t('form.dose.n', { n: i + 1, total: count }) : t('form.dose.amount');
    const defaultTime = timePresets[i] || timePresets[0] || '07:00';
    const step = allowCustom ? 'any' : (drug.doseStep || 1);
    const defaultDose = customValues[0] || '';

    // Dose quick-pick buttons
    let quickPick = '';
    if (customValues.length > 1) {
      quickPick = `<div class="toggle-group dose-quick-pick" data-dose-idx="${i}" style="margin-bottom:6px;">
        ${customValues.map(v => `<button class="toggle-btn" data-dv="${v}" style="flex:0;padding:6px 10px;font-size:11px;height:auto;">${v}</button>`).join('')}
      </div>`;
    }

    html += `<div class="dose-row-item" style="flex-direction:column;align-items:stretch;gap:4px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="dose-row-label">${label}</span>
        <input type="number" class="dose-amount" data-idx="${i}" value="${defaultDose}" step="${step}" min="0" placeholder="—">
        <span class="unit">${drug.doseUnit || 'mg'}</span>
        <span class="unit">${t('form.dose.time')}</span>
        <input type="time" class="dose-time" data-idx="${i}" value="${defaultTime}">
      </div>
      ${quickPick}
    </div>`;
  }
  return html;
}

function renderMetricField(m) {
  let html = `<div class="field">`;

  if (m.type === 'scale') {
    html += `<label>${t(m.label)}</label>
      <div class="scale" data-f="${m.id}">
        <button class="scale-btn" data-v="1">1</button>
        <button class="scale-btn" data-v="2">2</button>
        <button class="scale-btn" data-v="3">3</button>
        <button class="scale-btn" data-v="4">4</button>
        <button class="scale-btn" data-v="5">5</button>
      </div>`;
  } else if (m.type === 'toggle') {
    html += `<label>${t(m.label)}</label>
      <div class="toggle-group" data-f="${m.id}">`;
    for (const opt of m.options) {
      html += `<button class="toggle-btn" data-v="${opt.value}">${t(opt.label)}</button>`;
    }
    html += `</div>`;
  } else if (m.type === 'time') {
    html += `<label>${t(m.label)}</label>
      <input type="time" id="f-${m.id}" value="${m.defaultValue || ''}" style="width:120px;">`;
  } else if (m.type === 'number') {
    const autoTag = m.autoFill ? `<span class="auto-fill-badge" id="badge-${m.id}" style="display:none;">⟵ auto</span>` : '';
    html += `<label>${t(m.label)} ${autoTag}</label>
      <div class="input-row">
        <input type="number" id="f-${m.id}" min="${m.min || ''}" max="${m.max || ''}" step="${m.step || 1}" placeholder="—">
        <span class="unit">${m.unit || ''}</span>
      </div>`;
  }

  html += `</div>`;
  return html;
}

function renderEnergyCard(metrics, groupDef) {
  let html = `<div class="form-card">
    <div class="form-card-title">${t(groupDef.title)}</div>
    <div class="energy-row">`;

  for (const m of metrics) {
    html += `<div class="energy-block">
      <label>${t(m.label)}</label>
      <div class="energy-select" data-f="${m.id}">`;
    for (const opt of m.options) {
      html += `<button class="energy-option" data-v="${opt.value}">${t(opt.label)}</button>`;
    }
    html += `</div></div>`;
  }

  html += `</div></div>`;
  return html;
}

function bindFormEvents(container) {
  // Scale buttons
  for (const scale of container.querySelectorAll('.scale')) {
    for (const btn of scale.querySelectorAll('.scale-btn')) {
      btn.addEventListener('click', () => {
        for (const s of scale.querySelectorAll('.scale-btn')) s.className = 'scale-btn';
        btn.className = 'scale-btn s' + btn.dataset.v;
      });
    }
  }

  // Toggle buttons
  for (const group of container.querySelectorAll('.toggle-group')) {
    for (const btn of group.querySelectorAll('.toggle-btn')) {
      btn.addEventListener('click', () => {
        for (const s of group.querySelectorAll('.toggle-btn')) s.className = 'toggle-btn';
        btn.className = 'toggle-btn sel';
      });
    }
  }

  // Energy buttons
  for (const sel of container.querySelectorAll('.energy-select')) {
    for (const btn of sel.querySelectorAll('.energy-option')) {
      btn.addEventListener('click', () => {
        for (const s of sel.querySelectorAll('.energy-option')) s.className = 'energy-option';
        btn.className = 'energy-option sel';
      });
    }
  }

  // Date change
  const dateInput = document.getElementById('entryDate');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      checkExists();
      loadFormForDate(dateInput.value);
      autoFillFromHealthData(dateInput.value);
    });
    // Auto-fill on initial render
    setTimeout(() => autoFillFromHealthData(dateInput.value), 0);
  }

  // Doses per day toggle
  const dpdToggle = document.getElementById('dosesPerDayToggle');
  if (dpdToggle) {
    for (const btn of dpdToggle.querySelectorAll('.toggle-btn')) {
      btn.addEventListener('click', () => {
        for (const s of dpdToggle.querySelectorAll('.toggle-btn')) s.classList.remove('sel');
        btn.classList.add('sel');
        const count = parseInt(btn.dataset.dpd) || 1;
        const drug = state.settings.activeDrug;
        const rowsHtml = renderDoseRows(count, drug);
        document.getElementById('doseRows').innerHTML = rowsHtml;
        bindDoseQuickPicks(container);
      });
    }
  }

  // Dose quick-pick buttons
  bindDoseQuickPicks(container);

  // Mode toggle
  for (const btn of container.querySelectorAll('.mode-btn')) {
    btn.addEventListener('click', () => {
      state.settings.mode = btn.dataset.mode;
      notify({ type: 'mode-change', mode: btn.dataset.mode });
    });
  }

  // Save
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveEntry);
  }
}

function bindDoseQuickPicks(container) {
  for (const group of container.querySelectorAll('.dose-quick-pick')) {
    const idx = group.dataset.doseIdx;
    for (const btn of group.querySelectorAll('.toggle-btn')) {
      btn.addEventListener('click', () => {
        // Deselect siblings
        for (const s of group.querySelectorAll('.toggle-btn')) s.classList.remove('sel');
        btn.classList.add('sel');
        // Set the corresponding input value
        const input = container.querySelector(`.dose-amount[data-idx="${idx}"]`);
        if (input) input.value = btn.dataset.dv;
      });
    }
  }
}

function getDosesPerDay() {
  const sel = document.querySelector('#dosesPerDayToggle .toggle-btn.sel');
  return sel ? parseInt(sel.dataset.dpd) || 1 : 1;
}

function getFieldValue(field) {
  // Scale
  const scaleEl = document.querySelector(`[data-f="${field}"] .s1, [data-f="${field}"] .s2, [data-f="${field}"] .s3, [data-f="${field}"] .s4, [data-f="${field}"] .s5`);
  if (scaleEl) return scaleEl.dataset.v;
  // Toggle / energy
  const selEl = document.querySelector(`[data-f="${field}"] .sel`);
  if (selEl) return selEl.dataset.v;
  // Input
  const inputEl = document.getElementById('f-' + field);
  if (inputEl) return inputEl.value || null;
  return null;
}

function collectDoses() {
  const amounts = document.querySelectorAll('.dose-amount');
  const times = document.querySelectorAll('.dose-time');
  const doses = [];
  for (let i = 0; i < amounts.length; i++) {
    const amount = parseFloat(amounts[i].value) || 0;
    const time = times[i]?.value || '';
    if (amount > 0) {
      doses.push({ amount, unit: state.settings.activeDrug?.doseUnit || 'mg', time });
    }
  }
  return doses;
}

export function checkExists() {
  const date = document.getElementById('entryDate')?.value;
  if (!date) return;
  const drugId = state.settings.activeDrug?.id;
  const exists = state.entries.some(e => e.date === date && e.drugId === drugId);
  const el = document.getElementById('entryExists');
  if (el) el.style.display = exists ? 'inline' : 'none';
}

function saveEntry() {
  const drug = state.settings.activeDrug;
  if (!drug) return;

  const mode = state.settings.mode;
  const metrics = getMetricsForProfile(drug.category, mode);
  const metricsData = {};

  for (const m of metrics) {
    const val = getFieldValue(m.id);
    if (val !== null && val !== '') {
      metricsData[m.id] = m.type === 'scale' ? parseInt(val) : val;
    }
  }

  const entry = {
    date: document.getElementById('entryDate').value,
    timestamp: new Date().toISOString(),
    drugId: drug.id,
    drugName: drug.name?.cs || drug.name?.en || drug.id,
    drugCategory: drug.category,
    doses: collectDoses(),
    dosesPerDay: getDosesPerDay(),
    mode,
    metrics: metricsData,
    healthData: {},
    note: document.getElementById('f-note')?.value?.trim() || '',
  };

  // Merge health data if exists for this date
  if (state.healthData[entry.date]) {
    entry.healthData = { ...state.healthData[entry.date] };
  }

  const idx = state.entries.findIndex(e => e.date === entry.date && e.drugId === entry.drugId);
  if (idx >= 0) state.entries[idx] = entry;
  else state.entries.push(entry);

  state.entries.sort((a, b) => a.date.localeCompare(b.date));
  saveEntries();
  saveToGist();
  checkExists();
  toast(t('toast.saved'));
  notify({ type: 'entries-changed' });
}

export function loadFormForDate(date) {
  const drugId = state.settings.activeDrug?.id;
  const entry = state.entries.find(e => e.date === date && e.drugId === drugId);
  resetForm();
  if (!entry) return;

  // Load doses per day toggle
  if (entry.dosesPerDay) {
    const toggle = document.getElementById('dosesPerDayToggle');
    if (toggle) {
      for (const btn of toggle.querySelectorAll('.toggle-btn')) {
        btn.classList.toggle('sel', parseInt(btn.dataset.dpd) === entry.dosesPerDay);
      }
    }
    const drug = state.settings.activeDrug;
    document.getElementById('doseRows').innerHTML = renderDoseRows(entry.dosesPerDay, drug);
    bindDoseQuickPicks(document.getElementById('section-log'));
  }
  if (entry.doses) {
    const amounts = document.querySelectorAll('.dose-amount');
    const times = document.querySelectorAll('.dose-time');
    for (let i = 0; i < entry.doses.length && i < amounts.length; i++) {
      amounts[i].value = entry.doses[i].amount || '';
      if (times[i]) times[i].value = entry.doses[i].time || '';
    }
  }

  // Load metrics
  if (entry.metrics) {
    for (const [field, val] of Object.entries(entry.metrics)) {
      const metric = METRICS[field];
      if (!metric) continue;

      if (metric.type === 'scale' && val) {
        const btn = document.querySelector(`[data-f="${field}"] [data-v="${val}"]`);
        if (btn) btn.className = 'scale-btn s' + val;
      } else if (metric.type === 'toggle' || metric.type === 'energy-slot') {
        const btn = document.querySelector(`[data-f="${field}"] [data-v="${val}"]`);
        if (btn) btn.className = (metric.type === 'toggle' ? 'toggle-btn' : 'energy-option') + ' sel';
      } else if (metric.type === 'time' || metric.type === 'number') {
        const input = document.getElementById('f-' + field);
        if (input) input.value = val;
      }
    }
  }

  // Load note
  const noteEl = document.getElementById('f-note');
  if (noteEl && entry.note) noteEl.value = entry.note;

  // Auto-fill remaining empty fields from health data
  autoFillFromHealthData(date);
}

function resetForm() {
  for (const el of document.querySelectorAll('.scale-btn')) el.className = 'scale-btn';
  for (const el of document.querySelectorAll('.toggle-btn')) el.className = 'toggle-btn';
  for (const el of document.querySelectorAll('.energy-option')) el.className = 'energy-option';

  const drug = state.settings.activeDrug;
  const defaultDose = drug?.doseCommon?.[0] || '';
  for (const el of document.querySelectorAll('.dose-amount')) el.value = defaultDose;

  const noteEl = document.getElementById('f-note');
  if (noteEl) noteEl.value = '';

  // Reset number/time inputs
  for (const el of document.querySelectorAll('[id^="f-"]')) {
    if (el.type === 'number' && el.id !== 'f-dosesPerDay') el.value = '';
    if (el.type === 'time' && !el.classList.contains('dose-time')) el.value = '';
  }
}

export function editEntry(date) {
  document.getElementById('entryDate').value = date;
  loadFormForDate(date);
  checkExists();
  toast(t('toast.editing'));
}
