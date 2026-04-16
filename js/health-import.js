// ── Health Import — Apple Health XML + Withings CSV ──

import { state } from './state.js';
import { t } from './i18n.js';
import { toast } from './ui.js';
import { saveHealthData } from './storage.js';

// ── Apple Health XML import ──
// Uses streaming approach for large files

const APPLE_HEALTH_TYPES = {
  'HKQuantityTypeIdentifierHeartRate': { key: 'heartRate', aggregate: 'avg' },
  'HKQuantityTypeIdentifierStepCount': { key: 'steps', aggregate: 'sum' },
  'HKQuantityTypeIdentifierBodyMass': { key: 'weight', aggregate: 'last' },
  'HKQuantityTypeIdentifierBloodPressureSystolic': { key: 'systolic', aggregate: 'avg' },
  'HKQuantityTypeIdentifierBloodPressureDiastolic': { key: 'diastolic', aggregate: 'avg' },
  'HKQuantityTypeIdentifierOxygenSaturation': { key: 'spo2', aggregate: 'avg' },
  'HKQuantityTypeIdentifierRestingHeartRate': { key: 'restingHeartRate', aggregate: 'avg' },
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': { key: 'hrv', aggregate: 'avg' },
};

export function importAppleHealth() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xml,.zip';
  input.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    toast('Parsing Apple Health data...');

    try {
      let text;
      if (file.name.endsWith('.zip')) {
        toast('ZIP not supported — export as XML');
        return;
      }
      text = await file.text();

      const records = parseAppleHealthXml(text);
      const byDate = aggregateByDate(records);

      // Merge with existing health data
      for (const [date, data] of Object.entries(byDate)) {
        state.healthData[date] = { ...state.healthData[date], ...data };
      }
      saveHealthData();
      toast(t('toast.healthImported', { n: Object.keys(byDate).length }));
    } catch (e) {
      console.error('Apple Health import error:', e);
      toast(t('toast.importError'));
    }
  };
  input.click();
}

function parseAppleHealthXml(text) {
  const records = [];
  // Use regex-based extraction for performance (faster than DOMParser for large files)
  const recordRegex = /<Record\s+([^>]+)\/>/g;
  let match;

  while ((match = recordRegex.exec(text)) !== null) {
    const attrs = match[1];
    const type = extractAttr(attrs, 'type');
    const mapping = APPLE_HEALTH_TYPES[type];
    if (!mapping) continue;

    const value = parseFloat(extractAttr(attrs, 'value'));
    const dateStr = extractAttr(attrs, 'startDate') || extractAttr(attrs, 'creationDate');
    if (isNaN(value) || !dateStr) continue;

    const date = dateStr.substring(0, 10); // YYYY-MM-DD
    records.push({ key: mapping.key, value, date, aggregate: mapping.aggregate });
  }

  return records;
}

function extractAttr(str, name) {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = str.match(re);
  return m ? m[1] : '';
}

function aggregateByDate(records) {
  const byDate = {};

  // Group by date+key
  const groups = {};
  for (const r of records) {
    const gk = r.date + ':' + r.key;
    if (!groups[gk]) groups[gk] = { key: r.key, date: r.date, values: [], aggregate: r.aggregate };
    groups[gk].values.push(r.value);
  }

  for (const g of Object.values(groups)) {
    if (!byDate[g.date]) byDate[g.date] = {};

    if (g.aggregate === 'sum') {
      byDate[g.date][g.key] = Math.round(g.values.reduce((a, b) => a + b, 0));
    } else if (g.aggregate === 'avg') {
      byDate[g.date][g.key] = Math.round(g.values.reduce((a, b) => a + b, 0) / g.values.length * 10) / 10;
    } else if (g.aggregate === 'last') {
      byDate[g.date][g.key] = g.values[g.values.length - 1];
    }
  }

  return byDate;
}

// ── Withings CSV import ──
// Supports CSV exported from Withings Health Mate app

export function importWithingsCsv() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const records = parseWithingsCsv(text);

      for (const [date, data] of Object.entries(records)) {
        state.healthData[date] = { ...state.healthData[date], ...data };
      }
      saveHealthData();
      toast(t('toast.healthImported', { n: Object.keys(records).length }));
    } catch (e) {
      console.error('Withings CSV import error:', e);
      toast(t('toast.importError'));
    }
  };
  input.click();
}

function parseWithingsCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const byDate = {};

  // Common Withings CSV column names
  const colMap = {
    'weight (kg)': 'weight',
    'weight(kg)': 'weight',
    'fat mass (kg)': 'fatMass',
    'heart rate (bpm)': 'heartRate',
    'systolic (mmhg)': 'systolic',
    'diastolic (mmhg)': 'diastolic',
    'spo2 (%)': 'spo2',
    'steps': 'steps',
    'distance (m)': 'distance',
    'calories': 'calories',
    'sleep score': 'sleepScore',
    'sleep duration': 'sleepDuration',
  };

  const dateIdx = headers.findIndex(h => h.includes('date'));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < headers.length) continue;

    const dateRaw = cols[dateIdx];
    if (!dateRaw) continue;
    const date = normalizeDate(dateRaw);
    if (!date) continue;

    if (!byDate[date]) byDate[date] = {};

    for (let j = 0; j < headers.length; j++) {
      const mapped = colMap[headers[j]];
      if (mapped && cols[j] && cols[j] !== '') {
        const val = parseFloat(cols[j]);
        if (!isNaN(val)) byDate[date][mapped] = val;
      }
    }
  }

  return byDate;
}

function normalizeDate(str) {
  // Handle various date formats
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  // DD/MM/YYYY or MM/DD/YYYY
  const parts = str.split(/[\/\-\.]/);
  if (parts.length >= 3) {
    const [a, b, c] = parts.map(Number);
    if (c > 1900) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    if (a > 1900) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
  }
  return null;
}
