# Medication Tracker

Self-hosted medication tracking app for monitoring drug effects, side effects, and quality of life during medication trials or dose adjustments. Runs entirely in the browser — no backend, no account required.

## Features

- **114+ medications** in built-in catalog (psychiatric, cardiovascular, diabetes, asthma, autoimmune, pain, GI, dermatological, hormonal...)
- **28 conditions/diagnoses** — search by condition to filter relevant medications
- **Dynamic tracking forms** — metrics adapt to medication category (stimulant, SSRI, statin, corticosteroid, etc.)
- **Basic / Advanced mode** — basic for most users, advanced for detailed tracking
- **Multi-dose support** — track multiple doses per day with individual times
- **Quality of Life metrics** — daily functioning, work performance, social life, overall wellbeing
- **Charts & analytics** — trends, dose comparison, energy patterns, metric correlations
- **AI-ready export** — structured Markdown with prompt, drug info, statistics, and raw data for consultation with ChatGPT/Claude
- **Diagnosis info** — real-time Wikipedia summaries for conditions
- **Health data import** — Apple Health (XML) and Withings (CSV)
- **Czech / English** UI

## Storage

All data stays in your browser unless you choose to sync:

| Tier | How | Cross-device |
|------|-----|-------------|
| **localStorage** | Automatic, default | No |
| **JSON file** | File System Access API — save to iCloud Drive, Dropbox, OneDrive | Yes |
| **GitHub Gist** | Private gist with Personal Access Token | Yes |

## Tech

- Pure HTML + CSS + ES modules — no build step, no dependencies (except Chart.js CDN)
- Deploys to GitHub Pages as static files
- ~18 source files, modular architecture

## Structure

```
index.html              App shell
css/
  base.css              Variables, reset, typography
  components.css        Buttons, cards, pills, modals
  layout.css            App shell, nav, sections
js/
  app.js                Entry point, init, migration
  state.js              Central state management
  i18n.js               Czech/English translations
  storage.js            localStorage + File API + Gist sync
  drug-profiles.js      Metric definitions, 21 category profiles
  drug-search.js        Catalog search + Wikidata fallback + condition search
  form.js               Dynamic form generation
  history.js            History view + detail modal
  charts.js             Chart.js rendering (5 chart types)
  settings.js           Settings UI
  health-import.js      Apple Health XML + Withings CSV parsers
  ai-export.js          AI consultation export
  ui.js                 Toast, modal, nav helpers
data/
  drug-catalog.json     114 medications with ATC codes
  conditions.json       28 diagnoses → medication mappings
```

## Development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

ES modules require a local server — `file://` won't work due to CORS.

## Deployment

Push to `main` → GitHub Actions deploys to GitHub Pages automatically.

## Data migration

Existing Concerta Tracker data migrates automatically on first load — old flat entries are wrapped into the new format with `drugId: "concerta"`.
