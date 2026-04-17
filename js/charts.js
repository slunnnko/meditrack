// ── Charts — Chart.js rendering ──

import { state, getEntriesForDrug } from './state.js';
import { t } from './i18n.js';
import { fmtDate } from './ui.js';
import { getScaleMetrics, getNumericMetrics, METRICS } from './drug-profiles.js';

const COLORS = [
  '#6c8cff', '#4ecb71', '#f0a030', '#a78bfa',
  '#e05555', '#5ce0d8', '#ff6b9d', '#c4b5fd',
];

// ── Render all charts ──
export function renderCharts() {
  const drugId = state.settings.activeDrug?.id;
  const entries = drugId ? getEntriesForDrug(drugId) : state.entries;
  const containers = document.querySelectorAll('#section-charts .chart-container');

  if (entries.length < 2) {
    for (const c of containers) c.style.display = 'none';
    let nd = document.getElementById('noDataMsg');
    if (!nd) {
      document.getElementById('section-charts').insertAdjacentHTML('afterbegin',
        `<div class="no-data" id="noDataMsg">${t('charts.needMore')}</div>`);
    }
    return;
  }

  const nd = document.getElementById('noDataMsg');
  if (nd) nd.remove();
  for (const c of containers) c.style.display = 'block';

  const category = state.settings.activeDrug?.category || 'generic';
  const mode = state.settings.mode;

  renderTrend(entries, category, mode);
  renderNumeric(entries, category, mode);
  renderEnergy(entries, category, mode);
  renderDose(entries, category, mode);
  renderCorr(entries, category, mode);
}

// ── Trend chart (scale metrics) ──
function renderTrend(entries, category, mode) {
  const ctx = document.getElementById('chartTrend');
  if (!ctx) return;
  if (state.ui.charts.trend) state.ui.charts.trend.destroy();

  const scaleMetrics = getScaleMetrics(category, mode);
  const recent = entries.slice(-14);
  const labels = recent.map(e => fmtDate(e.date));

  const datasets = scaleMetrics.map((m, i) => mkds(
    getShortLabel(m.id),
    recent.map(e => e.metrics?.[m.id] ?? null),
    COLORS[i % COLORS.length]
  ));

  // Update chart title
  const titleEl = ctx.closest('.chart-container')?.querySelector('.chart-title');
  if (titleEl) titleEl.textContent = t('charts.trend');

  state.ui.charts.trend = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: chartOpts(1, 5),
  });
}

// ── Numeric metrics chart (heartRate, weight, etc.) ──
function renderNumeric(entries, category, mode) {
  const wrap = document.getElementById('chartNumericWrap');
  if (!wrap) return;

  const numMetrics = getNumericMetrics(category, mode);
  const recent = entries.slice(-14);
  const hasData = numMetrics.some(m => recent.some(e => e.metrics?.[m.id] != null));

  if (!hasData || numMetrics.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  const ctx = document.getElementById('chartNumeric');
  if (!ctx) return;
  if (state.ui.charts.numeric) state.ui.charts.numeric.destroy();

  const labels = recent.map(e => fmtDate(e.date));
  const datasets = numMetrics.map((m, i) => ({
    label: m.unit || getShortLabel(m.id),
    data: recent.map(e => e.metrics?.[m.id] ?? null),
    borderColor: COLORS[(i + 4) % COLORS.length],
    backgroundColor: COLORS[(i + 4) % COLORS.length] + '18',
    tension: 0.3, fill: true, pointRadius: 4,
  }));

  const titleEl = ctx.closest('.chart-container')?.querySelector('.chart-title');
  if (titleEl) titleEl.textContent = numMetrics.map(m => t(m.label)).join(' / ');

  const allVals = datasets.flatMap(d => d.data.filter(v => v != null));
  const minVal = Math.floor(Math.min(...allVals) * 0.9);
  const maxVal = Math.ceil(Math.max(...allVals) * 1.1);

  state.ui.charts.numeric = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: chartOpts(minVal, maxVal),
  });
}

// ── Energy chart ──
function renderEnergy(entries, category, mode) {
  const wrap = document.getElementById('chartEnergyWrap');
  if (!wrap) return;

  const hasEnergy = entries.some(e =>
    e.metrics?.energyMorning || e.metrics?.energyAfternoon || e.metrics?.energyEvening
  );
  if (!hasEnergy) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const ctx = document.getElementById('chartEnergy');
  if (!ctx) return;
  if (state.ui.charts.energy) state.ui.charts.energy.destroy();

  const em = { low: 1, ok: 2, good: 3, crash: 0 };
  const recent = entries.slice(-14);
  const labels = recent.map(e => fmtDate(e.date));

  const opts = chartOpts(0, 3);
  opts.scales.y.ticks.callback = v => ['Crash', 'Low', 'OK', 'Good'][v] || '';

  const titleEl = ctx.closest('.chart-container')?.querySelector('.chart-title');
  if (titleEl) titleEl.textContent = t('charts.energy');

  state.ui.charts.energy = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: t('energy.morning'), data: recent.map(e => em[e.metrics?.energyMorning] ?? null), backgroundColor: 'rgba(108,140,255,0.6)' },
        { label: t('energy.afternoon'), data: recent.map(e => em[e.metrics?.energyAfternoon] ?? null), backgroundColor: 'rgba(78,203,113,0.6)' },
        { label: t('energy.evening'), data: recent.map(e => em[e.metrics?.energyEvening] ?? null), backgroundColor: 'rgba(168,139,250,0.6)' },
      ],
    },
    options: opts,
  });
}

// ── Dose comparison ──
function renderDose(entries, category, mode) {
  const ctr = document.getElementById('doseCards');
  const ctx = document.getElementById('chartDose');
  if (!ctr || !ctx) return;
  if (state.ui.charts.dose) state.ui.charts.dose.destroy();

  // Calculate total daily dose for each entry
  const withDose = entries.filter(e => e.doses && e.doses.length);
  const doseSet = {};
  for (const e of withDose) {
    const total = e.doses.reduce((sum, d) => sum + (d.amount || 0), 0);
    if (total > 0) doseSet[total] = true;
  }
  const doses = Object.keys(doseSet).map(Number).sort((a, b) => a - b);

  if (doses.length < 1) {
    ctr.innerHTML = `<div class="no-data">${t('charts.oneDose')}</div>`;
    return;
  }

  const scaleMetrics = getScaleMetrics(category, mode);
  const unit = state.settings.activeDrug?.doseUnit || 'mg';

  // Dose summary cards
  let cardsHtml = '';
  for (const dose of doses) {
    const de = withDose.filter(e => {
      const total = e.doses.reduce((sum, d) => sum + (d.amount || 0), 0);
      return total === dose;
    });

    let sum = 0, cnt = 0;
    for (const m of scaleMetrics) {
      const vals = de.map(e => e.metrics?.[m.id]).filter(v => v != null);
      if (vals.length) { sum += vals.reduce((a, b) => a + b, 0) / vals.length; cnt++; }
    }
    const avg = cnt ? sum / cnt : 0;
    cardsHtml += `<div class="dose-card"><div class="dl">${dose}${unit}</div><div class="dv">${avg.toFixed(1)}</div><div class="ds">${t('charts.avgScore', { n: de.length })}</div></div>`;
  }
  ctr.innerHTML = cardsHtml;

  // Dose comparison bar chart
  const datasets = scaleMetrics.slice(0, 6).map((m, i) => ({
    label: getShortLabel(m.id),
    data: doses.map(dose => {
      const de = withDose.filter(e => {
        const total = e.doses.reduce((s, d) => s + (d.amount || 0), 0);
        return total === dose;
      });
      const vals = de.map(e => e.metrics?.[m.id]).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }),
    backgroundColor: COLORS[i % COLORS.length] + 'b3',
  }));

  state.ui.charts.dose = new Chart(ctx, {
    type: 'bar',
    data: { labels: doses.map(d => d + unit), datasets },
    options: chartOpts(0, 5),
  });
}

// ── Correlation matrix ──
function renderCorr(entries, category, mode) {
  const ctr = document.getElementById('corrMatrix');
  if (!ctr) return;

  const scaleMetrics = getScaleMetrics(category, mode);
  // Add dose as pseudo-metric
  const metricIds = [...scaleMetrics.map(m => m.id), '_totalDose'];
  const metricLabels = [...scaleMetrics.map(m => getShortLabel(m.id)), t('form.dose')];

  // Check enough data
  const hasEnough = metricIds.every(id => {
    let cnt = 0;
    for (const e of entries) {
      if (id === '_totalDose') {
        if (e.doses?.reduce((s, d) => s + (d.amount || 0), 0) > 0) cnt++;
      } else {
        if (e.metrics?.[id] != null) cnt++;
      }
    }
    return cnt >= 3;
  });

  if (!hasEnough) {
    ctr.innerHTML = `<div class="no-data">${t('charts.needMoreCorr')}</div>`;
    return;
  }

  const n = metricIds.length;
  const vals = metricIds.map(id =>
    entries.map(e => {
      if (id === '_totalDose') return e.doses?.reduce((s, d) => s + (d.amount || 0), 0) ?? null;
      return e.metrics?.[id] ?? null;
    }).filter(v => v != null)
  );

  let h = `<div class="corr-grid" style="grid-template-columns:50px repeat(${n},1fr);"><div></div>`;
  for (let i = 0; i < n; i++) h += `<div class="corr-label" style="justify-content:center;">${metricLabels[i]}</div>`;
  for (let i = 0; i < n; i++) {
    h += `<div class="corr-label">${metricLabels[i]}</div>`;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        h += '<div class="corr-cell" style="background:#22222f;color:var(--text-dim);">1.0</div>';
      } else {
        const r = pearson(vals[i], vals[j]);
        const c = r > 0.3 ? `rgba(78,203,113,${Math.abs(r)})` : r < -0.3 ? `rgba(224,85,85,${Math.abs(r)})` : `rgba(136,136,160,${Math.max(0.1, Math.abs(r))})`;
        h += `<div class="corr-cell" style="background:${c};">${r.toFixed(1)}</div>`;
      }
    }
  }
  h += '</div>';
  ctr.innerHTML = h;
}

// ── Helpers ──
function mkds(label, data, color) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: color + '18',
    tension: 0.3, fill: false, pointRadius: 3,
  };
}

function chartOpts(min, max) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#8888a0', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 },
      },
    },
    scales: {
      x: { ticks: { color: '#555568', font: { family: 'DM Sans', size: 10 } }, grid: { color: 'rgba(42,42,58,0.5)' } },
      y: { min, max, ticks: { color: '#555568', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 }, grid: { color: 'rgba(42,42,58,0.5)' } },
    },
  };
}

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const ax = x.slice(0, n), ay = y.slice(0, n);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += ax[i]; my += ay[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = ax[i] - mx, yi = ay[i] - my;
    num += xi * yi; dx += xi * xi; dy += yi * yi;
  }
  const d = Math.sqrt(dx * dy);
  return d === 0 ? 0 : num / d;
}

function getShortLabel(id) {
  const map = {
    initiation: 'Init', focus: 'Focus', emotionalReactivity: 'Emo', memory: 'Mem',
    mood: 'Mood', anxiety: 'Anx', appetite: 'App', energy: 'Enrg', sleep: 'Sleep',
    libido: 'Lib', emotionalBlunting: 'Blunt', nausea: 'Naus', headache: 'Head',
    sweating: 'Sweat', dizziness: 'Dizz', tremor: 'Trem', sedation: 'Sed',
    restlessness: 'Rest', drymouth: 'Dry', constipation: 'Const', blurredVision: 'Blur',
    painLevel: 'Pain', jointPain: 'Joint', musclePain: 'Musc', stiffness: 'Stiff',
    swelling: 'Swell', breathingEase: 'Brth', cough: 'Cough', skinCondition: 'Skin',
    skinDryness: 'Dry', itching: 'Itch', heartburn: 'Hbrn', bloating: 'Bloat',
    diarrhea: 'Diar', fatigue: 'Fatig', hotFlashes: 'Flash', moodSwings: 'MdSw',
    waterRetention: 'Water', breastTenderness: 'Brst', migraineIntensity: 'MigI',
    migraineFrequency: 'MigF', bonePain: 'Bone',
    afternoonDip: 'Dip', dailyFunctioning: 'Func', workPerformance: 'Work',
    socialLife: 'Social', overallWellbeing: 'Well', lifeSatisfaction: 'Satis',
  };
  return map[id] || id.substring(0, 4);
}
