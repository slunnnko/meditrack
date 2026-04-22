// ── State — central state management ──

const listeners = [];

export const state = {
  entries: [],
  healthData: {},
  hrBaseline: null,  // per-time-of-day HR baseline, built from pre-medication readings
  config: null,  // loaded from config.js
  settings: {
    gist: { token: '', id: '' },
    lang: 'cs',
    activeDrug: null,  // { id, name, category, dosesPerDay, doseStep, doseCommon }
    mode: 'advanced',  // 'basic' | 'advanced'
  },
  ui: {
    modalDate: null,
    activeSection: 'log',
    charts: {},
    hrFetchProgress: null,  // { current, total, date, phase } during intraday fetch
  }
};

export function subscribe(listener) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function notify(event) {
  for (const fn of listeners) {
    try { fn(event); } catch (e) { console.error('State listener error:', e); }
  }
}

export function getEntriesForDrug(drugId) {
  if (!drugId) return state.entries;
  return state.entries.filter(e => e.drugId === drugId);
}

export function getEntryByDate(date, drugId) {
  return state.entries.find(e => e.date === date && (!drugId || e.drugId === drugId));
}

export function entryKey(entry) {
  return entry.date + ':' + (entry.drugId || '');
}
