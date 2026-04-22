// ── Config — user-editable global configuration ──
// All configurable values in one place, stored in localStorage.
// Users can edit via in-app JSON editor.

import { state, notify } from './state.js';

const CONFIG_KEY = 'ct_config';

const DEFAULT_CONFIG = {
  // ── Dose settings ──
  dose: {
    dosesPerDayOptions: [1, 2, 3], // toggle list for doses/day selector
    allowCustomDose: true,          // allow typing any value, not just step increments
    customDoseValues: [],           // predefined dose buttons, e.g. [17.5, 35, 52.5, 70]
    doseTimePresets: ['07:00', '12:00', '18:00'],
  },

  // ── Withings API ──
  withings: {
    clientId: '',                   // from developer.withings.com
    clientSecret: '',               // from developer.withings.com
    proxyUrl: '',                   // Cloudflare Worker URL for OAuth token exchange
    redirectUri: '',                // auto-detected if empty (current page URL)
    // Available data types to fetch
    fetchTypes: ['weight', 'heartRate', 'bloodPressure', 'sleep', 'activity'],
  },

  // ── Form settings ──
  form: {
    defaultMode: 'advanced',      // 'basic' | 'advanced'
    showQolInBasic: false,        // show QoL metrics even in basic mode
    scaleRange: [1, 5],           // min, max for scale buttons
  },

  // ── Chart settings ──
  charts: {
    trendDays: 14,                // how many recent days to show in trend chart
    showCorrelation: true,
  },

  // ── Heart-rate analysis ──
  heartRate: {
    baselineCutoff: '',           // 'YYYY-MM-DD' — readings before this feed baseline
    slotMinutes: 30,              // time-of-day slot size for baseline bucketing
    slotMinN: 5,                  // minimum samples required per slot
    onsetThreshold: 10,           // bpm above baseline median
    sustainMinutes: 15,           // must hold above threshold this long to count as onset
    peakWindowMinutes: 30,        // window size for rolling peak search
  },

  // ── Caffeine tracking (for HR window correlation) ──
  caffeine: {
    types: ['coffee', 'tea', 'energy'],
    defaults: {                   // mg caffeine per unit (cup by default)
      coffee: 90,
      tea: 40,
      energy: 80,
    },
    halfLifeMinutes: 300,         // plasma half-life ~5h — exponential decay model
    correlationWindowMinutes: 90, // flag HR onset if caffeine intake within this window
  },

  // ── AI Export ──
  ai: {
    prompt: `You are analyzing medication tracking data for a patient. The data below contains daily self-reported metrics recorded during a medication trial/adjustment period. Your role is to:
1. Identify trends, patterns, and correlations in the data
2. Note any concerning side effects or worsening symptoms
3. Assess overall medication effectiveness based on the tracked metrics
4. Highlight quality of life impact
5. Suggest questions the patient might want to discuss with their doctor
6. Be factual and evidence-based — do NOT diagnose or recommend medication changes
7. If data shows concerning patterns (e.g., persistent side effects, worsening metrics), flag them clearly`,
    disclaimer: 'This is self-reported subjective data. Scale metrics are 1-5 where 1 is worst and 5 is best unless noted otherwise. This export is meant to help the patient discuss their medication with their healthcare provider.',
    includeRawData: true,
    rawDataEntries: 14,           // how many recent entries to include
    includeHealthData: true,
  },

  // ── Profile overrides ──
  // Users can add/remove metrics per category.
  // Format: { "stimulant": { "addMetrics": ["customMetric"], "removeMetrics": ["tinnitus"] } }
  profileOverrides: {},

  // ── Custom metrics ──
  // Users can define their own metrics.
  // Format: [{ "id": "myMetric", "type": "scale", "group": "metrics", "label": { "cs": "...", "en": "..." } }]
  customMetrics: [],
};

let userConfig = null;

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      userConfig = deepMerge(structuredClone(DEFAULT_CONFIG), JSON.parse(raw));
    } else {
      userConfig = structuredClone(DEFAULT_CONFIG);
    }
  } catch (e) {
    console.warn('Config load error:', e);
    userConfig = structuredClone(DEFAULT_CONFIG);
  }
  state.config = userConfig;
  globalThis.__appConfig = userConfig;
  return userConfig;
}

export function saveConfig(newConfig) {
  userConfig = newConfig || userConfig;
  state.config = userConfig;
  globalThis.__appConfig = userConfig;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(userConfig));
}

export function getConfig() {
  if (!userConfig) loadConfig();
  return userConfig;
}

export function resetConfig() {
  userConfig = structuredClone(DEFAULT_CONFIG);
  state.config = userConfig;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(userConfig));
}

export function getDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

/**
 * Return the config slice that should be synced to the encrypted Gist blob.
 * Today this is the whole config (Withings OAuth tokens live in a separate
 * localStorage key — they rotate per device and are never synced).
 */
export function getSyncedConfig() {
  return structuredClone(getConfig());
}

/**
 * Replace the local config with a synced-config payload pulled from the Gist.
 * Persists to localStorage so offline reads still work.
 */
export function applySyncedConfig(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  const merged = deepMerge(structuredClone(DEFAULT_CONFIG), incoming);
  userConfig = merged;
  state.config = userConfig;
  globalThis.__appConfig = userConfig;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(userConfig));
  notify({ type: 'config-change' });
}

/**
 * Get the full AI prompt (user-customized or default).
 */
export function getAiPrompt() {
  return getConfig().ai.prompt;
}

/**
 * Get the AI disclaimer text.
 */
export function getAiDisclaimer() {
  return getConfig().ai.disclaimer;
}

/**
 * Apply profile overrides and custom metrics.
 * Called by drug-profiles.js when building metric list.
 */
export function applyProfileOverrides(category, metricIds) {
  const cfg = getConfig();
  const overrides = cfg.profileOverrides[category];
  let result = [...metricIds];

  if (overrides) {
    if (overrides.removeMetrics) {
      result = result.filter(id => !overrides.removeMetrics.includes(id));
    }
    if (overrides.addMetrics) {
      for (const id of overrides.addMetrics) {
        if (!result.includes(id)) result.push(id);
      }
    }
  }

  return result;
}

/**
 * Get custom metric definitions from config.
 */
export function getCustomMetrics() {
  return getConfig().customMetrics || [];
}

// ── Deep merge utility ──
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
