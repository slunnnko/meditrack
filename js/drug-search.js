// ── Drug Search — local catalog + Wikidata fallback ──

import { t, getLang } from './i18n.js';

let catalog = [];
let conditions = [];
let catalogLoaded = false;

// ATC prefix → drug category mapping
const ATC_CATEGORY_MAP = {
  // Psychiatric
  'N06BA': 'stimulant',      // psychostimulants
  'N06AB': 'ssri',           // SSRIs
  'N06AX': 'snri',           // SNRIs and others
  'N06AA': 'ssri',           // tricyclic antidepressants
  'N05A':  'antipsychotic',  // antipsychotics
  'N05BA': 'benzodiazepine', // benzodiazepines (anxiolytic)
  'N05CD': 'benzodiazepine', // benzodiazepines (hypnotic)
  'N03A':  'anticonvulsant', // antiepileptics

  // Cardiovascular
  'C10AA': 'statin',         // statins
  'C10AB': 'statin',         // fibrates
  'C02':   'antihypertensive',
  'C03':   'antihypertensive', // diuretics
  'C07':   'antihypertensive', // beta-blockers
  'C08':   'antihypertensive', // calcium channel blockers
  'C09':   'antihypertensive', // ACE inhibitors / ARBs
  'B01A':  'anticoagulant',  // antithrombotic agents

  // Endocrine
  'H03A':  'thyroid',        // thyroid preparations
  'A10B':  'diabetes',       // oral antidiabetics
  'A10A':  'diabetes',       // insulins
  'H02A':  'corticosteroid', // systemic corticosteroids
  'G03':   'hormonal',       // sex hormones, HRT, contraceptives

  // Respiratory
  'R03':   'asthma',         // drugs for obstructive airway diseases

  // Musculoskeletal / Autoimmune
  'L04A':  'autoimmune',     // immunosuppressants
  'L01':   'autoimmune',     // antineoplastic (biologics overlap)
  'M05B':  'osteoporosis',   // drugs affecting bone structure
  'M01A':  'painManagement', // NSAIDs

  // GI
  'A02B':  'gastrointestinal', // drugs for peptic ulcer / GERD
  'A03':   'gastrointestinal', // drugs for functional GI disorders
  'A07':   'gastrointestinal', // antidiarrheals, intestinal anti-inflammatory

  // Dermatological
  'D10B':  'dermatological', // anti-acne (isotretinoin)
  'D05':   'dermatological', // antipsoriatics
  'D11':   'dermatological', // other dermatological preparations

  // Pain / Migraine
  'N02C':  'migraine',       // antimigraine preparations
  'N02A':  'painManagement', // opioids
  'N02B':  'painManagement', // other analgesics
};

export function atcToCategory(atc) {
  if (!atc) return 'generic';
  // Try longest prefix first
  for (let len = 5; len >= 3; len--) {
    const prefix = atc.substring(0, len);
    if (ATC_CATEGORY_MAP[prefix]) return ATC_CATEGORY_MAP[prefix];
  }
  return 'generic';
}

export async function loadCatalog() {
  if (catalogLoaded) return catalog;
  try {
    const [catRes, condRes] = await Promise.all([
      fetch('data/drug-catalog.json'),
      fetch('data/conditions.json'),
    ]);
    catalog = await catRes.json();
    conditions = await condRes.json();
    catalogLoaded = true;
  } catch (e) {
    console.warn('Failed to load catalog/conditions:', e);
    catalog = catalog.length ? catalog : [];
    conditions = conditions.length ? conditions : [];
  }
  return catalog;
}

// ── Condition search ──
export function searchConditions(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const lang = getLang();
  return conditions.filter(c => {
    const name = (c.name[lang] || c.name.cs || '').toLowerCase();
    const nameAlt = (c.name[lang === 'cs' ? 'en' : 'cs'] || '').toLowerCase();
    const desc = (c.description[lang] || c.description.cs || '').toLowerCase();
    return name.includes(q) || nameAlt.includes(q) || desc.includes(q);
  });
}

export function getDrugsForCondition(conditionId) {
  const cond = conditions.find(c => c.id === conditionId);
  if (!cond) return [];
  return catalog.filter(d => cond.drugIds.includes(d.id));
}

export function getConditions() {
  return conditions;
}

export function getConditionById(id) {
  return conditions.find(c => c.id === id);
}

// ── Wikipedia summary fetch ──
export async function fetchWikiSummary(conditionId) {
  const cond = conditions.find(c => c.id === conditionId);
  if (!cond || !cond.wikiTitle) return null;

  const lang = getLang();
  const title = cond.wikiTitle[lang] || cond.wikiTitle.cs || cond.wikiTitle.en;
  if (!title) return null;

  const wikiLang = lang === 'cs' ? 'cs' : 'en';

  try {
    const res = await fetch(
      `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      extract: data.extract,
      url: data.content_urls?.desktop?.page || null,
      thumbnail: data.thumbnail?.source || null,
    };
  } catch (e) {
    console.warn('Wikipedia fetch failed:', e);
    return null;
  }
}

export function searchCatalog(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const lang = getLang();
  return catalog.filter(drug => {
    const name = (drug.name[lang] || drug.name.cs || drug.name.en || '').toLowerCase();
    const nameAlt = (drug.name[lang === 'cs' ? 'en' : 'cs'] || '').toLowerCase();
    const substance = (drug.substance || '').toLowerCase();
    return name.includes(q) || nameAlt.includes(q) || substance.includes(q);
  }).slice(0, 10);
}

let wikidataAbort = null;

export async function searchWikidata(query) {
  if (!query || query.length < 3) return [];

  // Abort previous request
  if (wikidataAbort) wikidataAbort.abort();
  wikidataAbort = new AbortController();

  const lang = getLang();
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${lang}&uselang=${lang}&type=item&limit=8&format=json&origin=*`;

  try {
    const res = await fetch(url, { signal: wikidataAbort.signal });
    const data = await res.json();

    if (!data.search) return [];

    // Filter to likely medications and fetch ATC codes
    const results = [];
    for (const item of data.search) {
      // Quick check — description often contains "léčivo", "medication", "drug", "pharmaceutical"
      const desc = (item.description || '').toLowerCase();
      const isMed = /léčiv|léčeb|lék|medic|drug|pharm|tablet|capsul|příprav/i.test(desc);

      results.push({
        id: item.id.toLowerCase(),
        name: { [lang]: item.label, ...(lang !== 'en' ? { en: item.label } : {}) },
        substance: item.description || '',
        atc: '',
        category: 'generic',
        source: 'wikidata',
        wikidataId: item.id,
      });
    }
    return results;
  } catch (e) {
    if (e.name === 'AbortError') return [];
    console.warn('Wikidata search failed:', e);
    return [];
  }
}

/**
 * Combined search: catalog first, then Wikidata for additional results.
 * Returns { catalog: [...], wikidata: [...] }
 */
export async function searchDrugs(query) {
  const catalogResults = searchCatalog(query);

  if (catalogResults.length >= 5) {
    return { catalog: catalogResults, wikidata: [] };
  }

  const wikidataResults = await searchWikidata(query);
  // Dedupe by name
  const catalogNames = new Set(catalogResults.map(d => (d.name.cs || d.name.en || '').toLowerCase()));
  const filtered = wikidataResults.filter(d => {
    const name = (d.name.cs || d.name.en || '').toLowerCase();
    return !catalogNames.has(name);
  });

  return { catalog: catalogResults, wikidata: filtered };
}

/**
 * Create a custom drug entry for manual input.
 */
export function createCustomDrug(name, category) {
  return {
    id: 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: { cs: name, en: name },
    substance: '',
    atc: '',
    category: category || 'generic',
    source: 'custom',
  };
}
