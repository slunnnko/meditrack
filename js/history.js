// ── History — history view + detail modal ──

import { state, notify, getEntriesForDrug } from './state.js';
import { t, getLang } from './i18n.js';
import { toast, showModal, closeModal, fmtDateShort, fmtDateLong, pillClass, scaleColor } from './ui.js';
import { METRICS, getMetricsForProfile } from './drug-profiles.js';
import { saveEntries, saveToGist } from './storage.js';

// ── Labels for raw healthData keys (Withings + Apple Health) ──
const HEALTH_LABELS = {
  heartRate: 'metric.heartRate',
  sleepHours: 'metric.sleepHours',
  sleepScore: 'metric.sleepScore',
  sleepHrAvg: 'metric.sleepHrAvg',
  weight: 'metric.weight',
  steps: 'metric.steps',
  systolic: 'metric.bloodPressureSys',
  diastolic: 'metric.bloodPressureDia',
  spo2: 'health.spo2',
  restingHeartRate: 'health.restingHeartRate',
  hrv: 'health.hrv',
  fatMass: 'health.fatMass',
  fatFreeMass: 'health.fatFreeMass',
  fatRatio: 'health.fatRatio',
  muscleMass: 'health.muscleMass',
  boneMass: 'health.boneMass',
  hydration: 'health.hydration',
  bodyTemp: 'health.bodyTemp',
  skinTemp: 'health.skinTemp',
  distance: 'health.distance',
  elevation: 'health.elevation',
  calories: 'health.calories',
  totalCalories: 'health.totalCalories',
  activeMinutes: 'health.activeMinutes',
  sleepDuration: 'health.sleepDuration',
};

const HEALTH_UNITS = {
  heartRate: 'bpm',
  sleepHours: 'h',
  sleepHrAvg: 'bpm',
  weight: 'kg',
  systolic: 'mmHg',
  diastolic: 'mmHg',
  spo2: '%',
  restingHeartRate: 'bpm',
  hrv: 'ms',
  fatMass: 'kg',
  fatFreeMass: 'kg',
  fatRatio: '%',
  muscleMass: 'kg',
  boneMass: 'kg',
  hydration: 'kg',
  bodyTemp: '°C',
  skinTemp: '°C',
  distance: 'm',
  elevation: 'm',
  calories: 'kcal',
  totalCalories: 'kcal',
  activeMinutes: 'min',
  sleepDuration: 's',
};

export function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  const drugId = state.settings.activeDrug?.id;
  const entries = drugId ? getEntriesForDrug(drugId) : state.entries;

  if (!entries.length) {
    list.innerHTML = `<div class="empty-state"><div class="ei">📋</div><p>${t('history.empty')}</p></div>`;
    return;
  }

  let html = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const ds = fmtDateShort(e.date);
    let pills = '';

    // Dose pills
    if (e.doses && e.doses.length) {
      const doseStr = e.doses.map(d => `${d.amount}${d.unit || 'mg'}`).join(' + ');
      pills += `<span class="pill pill-dose">${doseStr}</span>`;
    }

    // Metric pills — show scale metrics with colored pills
    if (e.metrics) {
      const category = e.drugCategory || 'generic';
      const mode = e.mode || 'advanced';
      const profileMetrics = getMetricsForProfile(category, mode);

      for (const m of profileMetrics) {
        if (m.type !== 'scale') continue;
        const val = e.metrics[m.id];
        if (val == null) continue;
        const shortLabel = getShortLabel(m.id);
        pills += `<span class="pill ${pillClass(val)}">${shortLabel} ${val}</span>`;
      }

      // Show toggle values as purple pills
      for (const m of profileMetrics) {
        if (m.type !== 'toggle') continue;
        const val = e.metrics[m.id];
        if (!val) continue;
        const optLabel = m.options?.find(o => o.value === val);
        if (optLabel) {
          pills += `<span class="pill pill-purple">${t(optLabel.label)}</span>`;
        }
      }

      // Heart rate pill
      if (e.metrics.heartRate) {
        pills += `<span class="pill pill-dose">${e.metrics.heartRate}bpm</span>`;
      }

      // Effect end time
      if (e.metrics.effectEndTime) {
        pills += `<span class="pill pill-mid">→${e.metrics.effectEndTime}</span>`;
      }
    }

    html += `<div class="history-item" data-date="${e.date}">
      <div class="history-top">
        <span class="history-date">${ds}</span>
        <button class="history-edit" data-action="edit" data-date="${e.date}">${t('history.edit')}</button>
      </div>
      <div class="history-pills" data-action="detail" data-date="${e.date}">${pills}</div>
    </div>`;
  }

  list.innerHTML = html;

  // Bind events via delegation
  list.onclick = (ev) => {
    const target = ev.target.closest('[data-action]');
    if (!target) return;
    const date = target.dataset.date;
    if (target.dataset.action === 'edit') {
      notify({ type: 'edit-entry', date });
    } else if (target.dataset.action === 'detail') {
      showDetail(date);
    }
  };
}

function showDetail(date) {
  const drugId = state.settings.activeDrug?.id;
  const e = state.entries.find(en => en.date === date && en.drugId === drugId);
  if (!e) return;

  state.ui.modalDate = date;
  const title = fmtDateLong(date);

  let h = '<div style="display:grid;gap:6px;">';

  // Doses
  if (e.doses && e.doses.length) {
    const doseStr = e.doses.map(d => `${d.amount}${d.unit || 'mg'} v ${d.time}`).join(', ');
    h += `<div class="pill pill-dose" style="display:inline-block;width:fit-content;">${doseStr}</div>`;
  }

  // Metrics
  if (e.metrics) {
    const category = e.drugCategory || 'generic';
    const mode = e.mode || 'advanced';
    const profileMetrics = getMetricsForProfile(category, mode);

    for (const m of profileMetrics) {
      const val = e.metrics[m.id];
      if (val == null && val !== 0) continue;

      let displayVal = '';
      if (m.type === 'scale') {
        const color = scaleColor(val);
        displayVal = `<span style="color:${color};font-family:var(--font-mono);font-weight:600;">${val}/5</span>`;
      } else if (m.type === 'toggle' || m.type === 'energy-slot') {
        const opt = m.options?.find(o => o.value === val);
        displayVal = opt ? t(opt.label) : val;
      } else {
        displayVal = val + (m.unit ? ' ' + m.unit : '');
      }

      h += detailRow(t(m.label), displayVal);
    }
  }

  // Device data — everything Withings/Apple Health imported for this date,
  // regardless of whether the drug profile lists those metrics.
  const hd = state.healthData[date];
  if (hd && Object.keys(hd).length) {
    const shownAutoFillKeys = new Set();
    if (e.metrics) {
      for (const pm of getMetricsForProfile(e.drugCategory || 'generic', e.mode || 'advanced')) {
        const def = METRICS[pm.id];
        if (def?.autoFill && e.metrics[pm.id] != null) shownAutoFillKeys.add(def.autoFill);
      }
    }

    let deviceRows = '';
    for (const [k, v] of Object.entries(hd)) {
      if (v == null || v === '') continue;
      if (shownAutoFillKeys.has(k)) continue;
      const labelKey = HEALTH_LABELS[k];
      const label = labelKey ? t(labelKey) : k;
      const unit = HEALTH_UNITS[k];
      deviceRows += detailRow(label, unit ? `${v} ${unit}` : String(v));
    }

    if (deviceRows) {
      h += `<div style="margin-top:12px;padding-top:8px;border-top:1px dashed var(--border);font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">${t('deviceData.title')}</div>`;
      h += deviceRows;
    }
  }

  // Note
  if (e.note) h += detailRow(t('form.note'), e.note);

  h += '</div>';

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = h;

  // Wire modal buttons
  const editBtn = document.getElementById('btnModalEdit');
  const delBtn = document.getElementById('btnModalDel');

  editBtn.onclick = () => {
    closeModal();
    notify({ type: 'edit-entry', date });
  };

  delBtn.onclick = () => {
    if (!confirm(t('confirm.delete'))) return;
    state.entries = state.entries.filter(en => !(en.date === date && en.drugId === drugId));
    saveEntries();
    saveToGist();
    closeModal();
    renderHistory();
    toast(t('toast.deleted'));
    notify({ type: 'entries-changed' });
  };

  document.getElementById('modal').classList.add('show');
}

function detailRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
    <span style="color:var(--text-secondary);font-size:13px;">${label}</span>
    <span style="font-size:13px;font-weight:500;">${value}</span></div>`;
}

function getShortLabel(metricId) {
  const map = {
    initiation: 'Init', focus: 'Focus', emotionalReactivity: 'Emo', memory: 'Mem',
    mood: 'Mood', anxiety: 'Anx', appetite: 'App', energy: 'Enrg', sleep: 'Sleep',
    libido: 'Lib', emotionalBlunting: 'Blunt', nausea: 'Naus', headache: 'Head',
    sweating: 'Sweat', dizziness: 'Dizz', tremor: 'Trem', sedation: 'Sed',
    restlessness: 'Rest', drymouth: 'Dry', constipation: 'Const', blurredVision: 'Blur',
    weight: 'Wt', painLevel: 'Pain', jointPain: 'Joint', musclePain: 'Musc',
    stiffness: 'Stiff', swelling: 'Swell', breathingEase: 'Brth', cough: 'Cough',
    skinCondition: 'Skin', skinDryness: 'Dry', itching: 'Itch', heartburn: 'Hbrn',
    bloating: 'Bloat', diarrhea: 'Diar', fatigue: 'Fatig', hotFlashes: 'Flash',
    moodSwings: 'MdSw', waterRetention: 'Water', breastTenderness: 'Brst',
    migraineIntensity: 'MigI', migraineFrequency: 'MigF', bonePain: 'Bone',
    afternoonDip: 'Dip', dailyFunctioning: 'Func', workPerformance: 'Work',
    socialLife: 'Social', overallWellbeing: 'Well', lifeSatisfaction: 'Satis',
    sleepHours: 'Slp', sleepScore: 'SlpS', sleepHrAvg: 'SlpHR', steps: 'Steps',
  };
  return map[metricId] || metricId.substring(0, 4);
}
