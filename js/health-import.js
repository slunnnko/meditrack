// ── Health Import — Apple Health XML + Withings CSV + Withings API ──

import { state, notify } from './state.js';
import { t } from './i18n.js';
import { toast } from './ui.js';
import { saveHealthData, saveEntries, saveToGist } from './storage.js';
import { getConfig } from './config.js';
import { METRICS } from './drug-profiles.js';

/**
 * Backfill existing entries with device data by date match.
 * Overwrites auto-fill metrics (heartRate, sleep, steps) from healthData.
 * Returns count of entries updated.
 */
export function backfillEntriesFromHealthData() {
  let updated = 0;
  const autoFillMap = {};
  for (const [id, def] of Object.entries(METRICS)) {
    if (def.autoFill) autoFillMap[id] = def.autoFill;
  }

  for (const entry of state.entries) {
    const hd = state.healthData[entry.date];
    if (!hd) continue;
    if (!entry.metrics) entry.metrics = {};
    let changed = false;
    for (const [metricId, hdKey] of Object.entries(autoFillMap)) {
      if (hd[hdKey] != null) {
        entry.metrics[metricId] = hd[hdKey];
        changed = true;
      }
    }
    if (changed) updated++;
  }

  if (updated > 0) {
    saveEntries();
    saveToGist();
    notify({ type: 'entries-changed' });
  }
  return updated;
}

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
      const updated = backfillEntriesFromHealthData();
      toast(t('toast.healthImported', { n: Object.keys(byDate).length }) + (updated ? ` · ${t('toast.backfilled', { n: updated })}` : ''));
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
      const updated = backfillEntriesFromHealthData();
      toast(t('toast.healthImported', { n: Object.keys(records).length }) + (updated ? ` · ${t('toast.backfilled', { n: updated })}` : ''));
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

// ══════════════════════════════════════════════
// ── Withings OAuth2 API Integration ──
// Requires: Cloudflare Worker proxy for token exchange (CORS)
// Config: withings.clientId, withings.clientSecret, withings.proxyUrl
// ══════════════════════════════════════════════

const WITHINGS_AUTH_URL = 'https://account.withings.com/oauth2_user/authorize2';
const WITHINGS_TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const WITHINGS_MEASURE_URL = 'https://wbsapi.withings.net/measure';
const WITHINGS_ACTIVITY_URL = 'https://wbsapi.withings.net/v2/measure';
const WITHINGS_SLEEP_URL = 'https://wbsapi.withings.net/v2/sleep';
const WITHINGS_TOKEN_KEY = 'ct_withings_token';

/**
 * Check if Withings is configured.
 */
export function isWithingsConfigured() {
  const cfg = getConfig();
  return !!(cfg.withings?.clientId && cfg.withings?.proxyUrl);
}

/**
 * Start Withings OAuth2 flow — redirects to Withings login page.
 */
export function startWithingsAuth() {
  const cfg = getConfig();
  if (!cfg.withings?.clientId || !cfg.withings?.proxyUrl) {
    toast(t('withings.notConfigured'));
    return;
  }

  const redirectUri = cfg.withings.redirectUri || window.location.origin + window.location.pathname;
  const scope = 'user.metrics,user.activity';
  const stateParam = 'withings_' + Date.now();
  sessionStorage.setItem('withings_state', stateParam);

  const url = `${WITHINGS_AUTH_URL}?response_type=code&client_id=${encodeURIComponent(cfg.withings.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(stateParam)}`;
  window.location.href = url;
}

/**
 * Handle OAuth2 callback — call after page load if URL has ?code= param.
 */
export async function handleWithingsCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');

  if (!code || !returnedState?.startsWith('withings_')) return false;

  const savedState = sessionStorage.getItem('withings_state');
  if (returnedState !== savedState) {
    toast('Withings auth state mismatch');
    return false;
  }
  sessionStorage.removeItem('withings_state');

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  // Exchange code for token via proxy
  const cfg = getConfig();
  const redirectUri = cfg.withings.redirectUri || window.location.origin + window.location.pathname;

  try {
    toast(t('withings.exchangingToken'));
    const proxyUrl = cfg.withings.proxyUrl;
    console.log('[Withings] Token exchange via proxy:', proxyUrl);
    console.log('[Withings] redirect_uri:', redirectUri);
    console.log('[Withings] code length:', code?.length);

    const payload = {
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: cfg.withings.clientId,
      client_secret: cfg.withings.clientSecret,
      code,
      redirect_uri: redirectUri,
    };

    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[Withings] Proxy response status:', res.status);
    const text = await res.text();
    console.log('[Withings] Proxy response body:', text);

    let data;
    try { data = JSON.parse(text); } catch {
      toast('Proxy returned invalid JSON — check worker logs');
      return false;
    }

    if (data.status === 0 && data.body?.access_token) {
      const tokenData = {
        access_token: data.body.access_token,
        refresh_token: data.body.refresh_token,
        expires_at: Date.now() + (data.body.expires_in * 1000),
        userid: data.body.userid,
      };
      localStorage.setItem(WITHINGS_TOKEN_KEY, JSON.stringify(tokenData));
      toast(t('withings.connected'));
      return true;
    } else {
      const errMsg = data.error || data.message || `status=${data.status}`;
      console.error('[Withings] Token error:', data);
      toast('Withings error: ' + errMsg);
      return false;
    }
  } catch (e) {
    console.error('[Withings] Token exchange failed:', e);
    toast(t('toast.connError') + ' — ' + e.message);
    return false;
  }
}

/**
 * Refresh Withings token if expired.
 */
async function refreshWithingsToken() {
  const cfg = getConfig();
  let tokenData;
  try { tokenData = JSON.parse(localStorage.getItem(WITHINGS_TOKEN_KEY)); } catch { return null; }
  if (!tokenData?.refresh_token) return null;

  // Still valid?
  if (tokenData.expires_at > Date.now() + 60000) return tokenData.access_token;

  try {
    const res = await fetch(cfg.withings.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'requesttoken',
        grant_type: 'refresh_token',
        client_id: cfg.withings.clientId,
        client_secret: cfg.withings.clientSecret,
        refresh_token: tokenData.refresh_token,
      }),
    });
    const data = await res.json();
    if (data.status === 0 && data.body?.access_token) {
      tokenData.access_token = data.body.access_token;
      tokenData.refresh_token = data.body.refresh_token;
      tokenData.expires_at = Date.now() + (data.body.expires_in * 1000);
      localStorage.setItem(WITHINGS_TOKEN_KEY, JSON.stringify(tokenData));
      return tokenData.access_token;
    }
  } catch (e) {
    console.error('Withings token refresh error:', e);
  }
  return null;
}

/**
 * Check if we have a valid Withings token.
 */
export function hasWithingsToken() {
  try {
    const tokenData = JSON.parse(localStorage.getItem(WITHINGS_TOKEN_KEY));
    return !!(tokenData?.access_token);
  } catch { return false; }
}

/**
 * Fetch data from Withings API and merge into healthData.
 */
export async function fetchWithingsData(startDate, endDate) {
  const token = await refreshWithingsToken();
  if (!token) {
    toast(t('withings.notConnected'));
    return;
  }

  toast(t('withings.fetching'));
  const start = Math.floor(new Date(startDate + 'T00:00:00').getTime() / 1000);
  const end = Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000);
  let imported = 0;

  const errors = [];

  try {
    // Fetch measurements (weight, blood pressure, heart rate, SpO2, fat mass, temperature)
    // meastypes (plural) is required when requesting more than one type.
    // 1=weight, 5=fatFreeMass, 6=fatRatio, 8=fatMass, 9=diastolic, 10=systolic,
    // 11=heartRate, 54=spo2, 71=bodyTemp, 73=skinTemp, 76=muscleMass, 88=boneMass
    const MEASTYPES = '1,5,6,8,9,10,11,54,71,73,76,77,88';
    const measRes = await fetch(WITHINGS_MEASURE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `action=getmeas&meastypes=${MEASTYPES}&category=1&startdate=${start}&enddate=${end}`,
    });
    const measData = await measRes.json();
    console.log('[Withings] getmeas status:', measData.status, 'groups:', measData.body?.measuregrps?.length ?? 0);

    if (measData.status !== 0) {
      errors.push('getmeas status=' + measData.status + (measData.error ? ' ' + measData.error : ''));
    } else if (measData.body?.measuregrps) {
      for (const grp of measData.body.measuregrps) {
        const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
        if (!state.healthData[date]) state.healthData[date] = {};

        for (const m of grp.measures) {
          const val = m.value * Math.pow(10, m.unit);
          switch (m.type) {
            case 1:  state.healthData[date].weight = Math.round(val * 10) / 10; break;
            case 5:  state.healthData[date].fatFreeMass = Math.round(val * 10) / 10; break;
            case 6:  state.healthData[date].fatRatio = Math.round(val * 10) / 10; break;
            case 8:  state.healthData[date].fatMass = Math.round(val * 10) / 10; break;
            case 9:  state.healthData[date].diastolic = Math.round(val); break;
            case 10: state.healthData[date].systolic = Math.round(val); break;
            case 11: state.healthData[date].heartRate = Math.round(val); break;
            case 54: state.healthData[date].spo2 = Math.round(val * 100); break;
            case 71: state.healthData[date].bodyTemp = Math.round(val * 10) / 10; break;
            case 73: state.healthData[date].skinTemp = Math.round(val * 10) / 10; break;
            case 76: state.healthData[date].muscleMass = Math.round(val * 10) / 10; break;
            case 77: state.healthData[date].hydration = Math.round(val * 10) / 10; break;
            case 88: state.healthData[date].boneMass = Math.round(val * 10) / 10; break;
          }
          imported++;
        }
      }
    }

    // Fetch activity (steps, distance, calories, resting HR)
    const actRes = await fetch(WITHINGS_ACTIVITY_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `action=getactivity&startdateymd=${startDate}&enddateymd=${endDate}&data_fields=steps,distance,elevation,calories,totalcalories,hr_average,hr_min,hr_max,active`,
    });
    const actData = await actRes.json();
    console.log('[Withings] getactivity status:', actData.status, 'days:', actData.body?.activities?.length ?? 0);

    if (actData.status !== 0) {
      errors.push('getactivity status=' + actData.status + (actData.error ? ' ' + actData.error : ''));
    } else if (actData.body?.activities) {
      for (const a of actData.body.activities) {
        const date = a.date;
        if (!state.healthData[date]) state.healthData[date] = {};
        if (a.steps != null)        state.healthData[date].steps = a.steps;
        if (a.distance != null)     state.healthData[date].distance = Math.round(a.distance);
        if (a.elevation != null)    state.healthData[date].elevation = Math.round(a.elevation);
        if (a.calories != null)     state.healthData[date].calories = Math.round(a.calories);
        if (a.totalcalories != null) state.healthData[date].totalCalories = Math.round(a.totalcalories);
        if (a.hr_average != null)   state.healthData[date].restingHeartRate = Math.round(a.hr_average);
        if (a.active != null)       state.healthData[date].activeMinutes = Math.round(a.active / 60);
        imported++;
      }
    }

    // Fetch sleep summary
    const sleepRes = await fetch(WITHINGS_SLEEP_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `action=getsummary&startdateymd=${startDate}&enddateymd=${endDate}`,
    });
    const sleepData = await sleepRes.json();
    console.log('[Withings] getsummary status:', sleepData.status, 'nights:', sleepData.body?.series?.length ?? 0);

    if (sleepData.status !== 0) {
      errors.push('sleep getsummary status=' + sleepData.status + (sleepData.error ? ' ' + sleepData.error : ''));
    } else if (sleepData.body?.series) {
      for (const s of sleepData.body.series) {
        const date = s.date;
        if (!state.healthData[date]) state.healthData[date] = {};
        if (s.data) {
          if (s.data.total_sleep_time) state.healthData[date].sleepHours = Math.round(s.data.total_sleep_time / 3600 * 10) / 10;
          if (s.data.sleep_score) state.healthData[date].sleepScore = s.data.sleep_score;
          if (s.data.hr_average) state.healthData[date].sleepHrAvg = Math.round(s.data.hr_average);
          imported++;
        }
      }
    }

    saveHealthData();
    const updated = backfillEntriesFromHealthData();

    if (errors.length) {
      console.error('[Withings] errors:', errors);
      toast('Withings: ' + errors.join(' | '));
    } else {
      toast(t('toast.healthImported', { n: imported }) + (updated ? ` · ${t('toast.backfilled', { n: updated })}` : ''));
    }
  } catch (e) {
    console.error('Withings API error:', e);
    toast(t('toast.importError') + ' — ' + e.message);
  }
}

/**
 * Disconnect Withings — remove stored token.
 */
export function disconnectWithings() {
  localStorage.removeItem(WITHINGS_TOKEN_KEY);
  toast(t('withings.disconnected'));
}
