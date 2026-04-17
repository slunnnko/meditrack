// ── App — entry point, init, migration, drug selector ──

import { state, subscribe, notify } from './state.js';
import { t, setLang, getLang } from './i18n.js';
import { loadFromLocal, saveEntries, saveSettings, syncFromGist } from './storage.js';
import { loadCatalog, searchDrugs, createCustomDrug, atcToCategory, searchConditions, getDrugsForCondition, fetchWikiSummary, getConditionById } from './drug-search.js';
import { PROFILES } from './drug-profiles.js';
import { loadConfig } from './config.js';
import { renderForm, checkExists, editEntry, loadFormForDate } from './form.js';
import { renderHistory } from './history.js';
import { renderCharts } from './charts.js';
import { renderSettings } from './settings.js';
import { importAppleHealth, importWithingsCsv } from './health-import.js';
import { showSection, updateStatus, bindModalClose, toast, dateKey } from './ui.js';

// ── Init ──
async function init() {
  loadFromLocal();
  loadConfig();
  setLang(state.settings.lang);
  migrateEntries();

  await loadCatalog();

  bindNav();
  bindModalClose();
  setupSync();

  // Subscribe to state changes
  subscribe(handleEvent);

  // If no drug selected, show drug selector; otherwise render app
  if (!state.settings.activeDrug) {
    showDrugSelector();
  } else {
    renderApp();
  }
}

function migrateEntries() {
  let migrated = false;
  state.entries = state.entries.map(entry => {
    if (entry.drugId) return entry; // already migrated

    migrated = true;
    return {
      date: entry.date,
      timestamp: entry.timestamp,
      drugId: 'concerta',
      drugName: 'Concerta',
      drugCategory: 'stimulant',
      doses: [{
        amount: entry.dose || 0,
        unit: 'mg',
        time: entry.doseTime || '07:00',
      }],
      dosesPerDay: 1,
      mode: 'advanced',
      metrics: {
        initiation: entry.initiation || null,
        focus: entry.focus || null,
        emotionalReactivity: entry.emotionalReactivity || null,
        memory: entry.memory || null,
        socialPerception: entry.socialPerception || null,
        fluctuations: entry.fluctuations || null,
        effectEndTime: entry.effectEndTime || null,
        hungerNoticed: entry.hungerNoticed || null,
        firstMeal: entry.firstMeal || null,
        heartRate: entry.heartRate || null,
        tinnitus: entry.tinnitus || null,
        rls: entry.rls || null,
        energyMorning: entry.energyMorning || null,
        energyAfternoon: entry.energyAfternoon || null,
        energyEvening: entry.energyEvening || null,
        sleepOnset: entry.sleepOnset || null,
        nightWaking: entry.nightWaking || null,
      },
      healthData: {},
      note: entry.note || '',
    };
  });

  if (migrated) {
    saveEntries();
    // Auto-set Concerta as active drug if migrating
    if (!state.settings.activeDrug) {
      state.settings.activeDrug = {
        id: 'concerta',
        name: { cs: 'Concerta', en: 'Concerta' },
        category: 'stimulant',
        dosesPerDay: 1,
        doseStep: 18,
        doseUnit: 'mg',
        doseCommon: [18, 27, 36, 54],
      };
      saveSettings();
    }
  }
}

function renderApp() {
  updateHeader();
  renderForm(document.getElementById('section-log'));
  updateStatus();
}

function updateHeader() {
  const titleEl = document.getElementById('appTitle');
  if (!titleEl) return;
  const drug = state.settings.activeDrug;
  titleEl.textContent = drug ? `◉ ${drug.name?.[getLang()] || drug.name?.cs || drug.id}` : t('app.title');
}

function bindNav() {
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => showSection(btn.dataset.sec));
  }

  // Sync button
  const syncBtn = document.getElementById('btnSync');
  if (syncBtn) syncBtn.addEventListener('click', () => syncFromGist());

  // Settings button
  const settingsBtn = document.getElementById('btnSettings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => showSection('settings'));
}

function setupSync() {
  const g = state.settings.gist;
  if (g.token && g.id) syncFromGist();
}

// ── Event handler ──
function handleEvent(event) {
  switch (event.type) {
    case 'section-change':
      if (event.section === 'history') renderHistory();
      if (event.section === 'charts') renderCharts();
      if (event.section === 'settings') renderSettings(document.getElementById('section-settings'));
      break;

    case 'entries-changed':
      checkExists();
      break;

    case 'mode-change':
      saveSettings();
      renderForm(document.getElementById('section-log'));
      break;

    case 'lang-change':
      renderApp();
      // Re-render active section
      if (state.ui.activeSection === 'settings') {
        renderSettings(document.getElementById('section-settings'));
      }
      break;

    case 'edit-entry':
      showSection('log');
      editEntry(event.date);
      break;

    case 'show-drug-selector':
      showDrugSelector();
      break;

    case 'drug-selected':
      state.settings.activeDrug = event.drug;
      saveSettings();
      hideDrugSelector();
      renderApp();
      showSection('log');
      break;

    case 'config-change':
      renderForm(document.getElementById('section-log'));
      break;

    case 'import-apple-health':
      importAppleHealth();
      break;

    case 'import-withings-csv':
      importWithingsCsv();
      break;
  }
}

// ── Drug Selector (onboarding / change drug) ──
let searchTimeout = null;

function showDrugSelector() {
  const overlay = document.getElementById('drugSelectorOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const drugInput = document.getElementById('drugSearchInput');
  const condInput = document.getElementById('conditionSearchInput');
  const results = document.getElementById('drugSearchResults');
  const condResults = document.getElementById('conditionSearchResults');
  const condInfo = document.getElementById('conditionInfo');
  const categorySelect = document.getElementById('drugCategorySelect');

  // Populate category select
  if (categorySelect) {
    categorySelect.innerHTML = Object.keys(PROFILES).map(cat =>
      `<option value="${cat}">${cat}</option>`
    ).join('');
  }

  // Drug name search
  if (drugInput) {
    drugInput.value = '';
    drugInput.focus();
    drugInput.oninput = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(drugInput.value), 300);
    };
  }

  // Condition search
  if (condInput) {
    condInput.value = '';
    condInput.oninput = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performConditionSearch(condInput.value), 200);
    };
  }

  // Custom drug button
  const customBtn = document.getElementById('btnCustomDrug');
  if (customBtn) {
    customBtn.onclick = () => {
      const name = drugInput?.value?.trim();
      if (!name) { toast(t('drug.search')); return; }
      const cat = categorySelect?.value || 'generic';
      selectDrug(createCustomDrug(name, cat), cat);
    };
  }

  // Clear panels
  if (results) { results.innerHTML = ''; results.classList.remove('show'); }
  if (condResults) { condResults.innerHTML = ''; condResults.classList.remove('show'); }
  if (condInfo) condInfo.style.display = 'none';
}

async function performConditionSearch(query) {
  const results = document.getElementById('conditionSearchResults');
  const condInfo = document.getElementById('conditionInfo');
  if (!results) return;

  if (!query || query.length < 2) {
    results.innerHTML = '';
    results.classList.remove('show');
    return;
  }

  const found = searchConditions(query);
  if (found.length === 0) {
    results.innerHTML = `<div class="drug-result"><span style="color:var(--text-dim);">${t('drug.noResults')}</span></div>`;
    results.classList.add('show');
    return;
  }

  const lang = getLang();
  results.innerHTML = found.map(c => {
    const name = c.name[lang] || c.name.cs;
    const desc = c.description[lang] || c.description.cs;
    return `<div class="drug-result" data-cond-id="${c.id}">
      <div>${name}</div>
      <div class="drug-sub">${desc}</div>
    </div>`;
  }).join('');
  results.classList.add('show');

  for (const el of results.querySelectorAll('.drug-result')) {
    el.onclick = () => selectCondition(el.dataset.condId);
  }
}

async function selectCondition(conditionId) {
  state.settings.activeCondition = conditionId;
  const condResults = document.getElementById('conditionSearchResults');
  if (condResults) condResults.classList.remove('show');

  const condInfo = document.getElementById('conditionInfo');
  const drugResults = document.getElementById('drugSearchResults');

  // Show drugs for condition
  const drugs = getDrugsForCondition(conditionId);
  const lang = getLang();

  if (drugResults && drugs.length > 0) {
    drugResults.innerHTML = `<div style="padding:8px 12px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;">${t('drug.conditionDrugs')}</div>` +
      drugs.map(drug => {
        const name = drug.name?.[lang] || drug.name?.cs || drug.id;
        const sub = [drug.substance, drug.category].filter(Boolean).join(' · ');
        return `<div class="drug-result" data-drug-id="${drug.id}">
          <div>${name}</div>
          ${sub ? `<div class="drug-sub">${sub}</div>` : ''}
        </div>`;
      }).join('');
    drugResults.classList.add('show');

    for (const el of drugResults.querySelectorAll('.drug-result[data-drug-id]')) {
      el.onclick = () => {
        const drug = drugs.find(d => d.id === el.dataset.drugId);
        if (drug) selectDrug(drug, drug.category);
      };
    }
  }

  // Fetch Wikipedia summary
  if (condInfo) {
    condInfo.style.display = 'block';
    condInfo.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-dim);">${t('drug.loadingInfo')}</div>`;

    const wiki = await fetchWikiSummary(conditionId);
    if (wiki) {
      condInfo.innerHTML = `<div style="padding:12px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">${wiki.title}</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px;">${wiki.extract}</div>
        ${wiki.url ? `<a href="${wiki.url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);">${t('drug.wikiSource')} →</a>` : ''}
      </div>`;
    } else {
      condInfo.style.display = 'none';
    }
  }
}

function hideDrugSelector() {
  const overlay = document.getElementById('drugSelectorOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function performSearch(query) {
  const results = document.getElementById('drugSearchResults');
  if (!results) return;

  if (!query || query.length < 2) {
    results.innerHTML = '';
    results.classList.remove('show');
    return;
  }

  const { catalog, wikidata } = await searchDrugs(query);
  const all = [...catalog, ...wikidata];

  if (all.length === 0) {
    results.innerHTML = `<div class="drug-result"><span style="color:var(--text-dim);">${t('drug.noResults')}</span></div>`;
    results.classList.add('show');
    return;
  }

  results.innerHTML = all.map(drug => {
    const lang = getLang();
    const name = drug.name?.[lang] || drug.name?.cs || drug.name?.en || drug.id;
    const sub = [drug.substance, drug.atc, drug.category].filter(Boolean).join(' · ');
    const source = drug.source === 'wikidata' ? ' 🌐' : '';
    return `<div class="drug-result" data-drug-id="${drug.id}" data-source="${drug.source || 'catalog'}">
      <div>${name}${source}</div>
      ${sub ? `<div class="drug-sub">${sub}</div>` : ''}
    </div>`;
  }).join('');

  results.classList.add('show');

  // Bind click
  for (const el of results.querySelectorAll('.drug-result')) {
    el.onclick = () => {
      const drugId = el.dataset.drugId;
      const drug = all.find(d => d.id === drugId);
      if (drug) selectDrug(drug, drug.category);
    };
  }
}

function selectDrug(drug, category) {
  const activeDrug = {
    id: drug.id,
    name: drug.name,
    category: category || atcToCategory(drug.atc) || 'generic',
    dosesPerDay: 1,
    doseStep: drug.defaultDose?.step || 1,
    doseUnit: drug.doseUnit || 'mg',
    doseCommon: drug.defaultDose?.common || [],
  };

  notify({ type: 'drug-selected', drug: activeDrug });
}

// ── Start ──
init();
