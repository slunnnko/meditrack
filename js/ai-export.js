// ── AI Export — structured export for AI model consultation ──

import { state, getEntriesForDrug } from './state.js';
import { t, getLang } from './i18n.js';
import { METRICS, getMetricsForProfile, getScaleMetrics } from './drug-profiles.js';
import { toast } from './ui.js';
import { getConfig } from './config.js';

/**
 * Generate AI-ready export text.
 * Includes: system prompt, drug info, condition context, data summary, trends, raw recent data.
 */
export function generateAiExport() {
  const drug = state.settings.activeDrug;
  if (!drug) {
    toast('No medication selected');
    return null;
  }

  const entries = getEntriesForDrug(drug.id);
  if (entries.length === 0) {
    toast('No entries to export');
    return null;
  }

  const lang = getLang();
  const mode = state.settings.mode;
  const scaleMetrics = getScaleMetrics(drug.category, mode);
  const allMetrics = getMetricsForProfile(drug.category, mode);

  const cfg = getConfig();
  let text = '';

  // ── System context / prompt (from config — user editable) ──
  text += `# Medication Tracking Data — AI Consultation Export\n\n`;
  text += `## Instructions for AI assistant\n`;
  text += cfg.ai.prompt + '\n\n';
  text += `**Important**: ${cfg.ai.disclaimer}\n\n`;

  // ── Drug information ──
  text += `## Medication\n`;
  text += `- **Name**: ${drug.name?.[lang] || drug.name?.cs || drug.id}\n`;
  text += `- **Category**: ${drug.category}\n`;
  if (drug.doseUnit) text += `- **Dose unit**: ${drug.doseUnit}\n`;
  text += `- **Tracking mode**: ${mode}\n`;
  text += `- **Recording period**: ${entries[0].date} to ${entries[entries.length - 1].date} (${entries.length} entries)\n\n`;

  // ── Condition context (if available) ──
  const conditionId = state.settings.activeCondition;
  if (conditionId) {
    text += `## Condition context\n`;
    text += `- **Condition ID**: ${conditionId}\n\n`;
  }

  // ── Metric definitions ──
  text += `## Tracked metrics\n`;
  text += `| Metric | Type | Description |\n`;
  text += `|--------|------|-------------|\n`;
  for (const m of allMetrics) {
    const label = t(m.label);
    const type = m.type === 'scale' ? 'Scale 1-5' : m.type === 'toggle' ? 'Choice' : m.type === 'number' ? `Number (${m.unit || ''})` : m.type;
    text += `| ${m.id} | ${type} | ${label} |\n`;
  }
  text += `\n`;

  // ── Statistical summary ──
  text += `## Statistical summary\n`;
  for (const m of scaleMetrics) {
    const vals = entries.map(e => e.metrics?.[m.id]).filter(v => v != null);
    if (vals.length === 0) continue;
    const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const recent5 = vals.slice(-5);
    const recentAvg = recent5.length ? (recent5.reduce((a, b) => a + b, 0) / recent5.length).toFixed(2) : '—';
    const trend = computeTrend(vals);
    text += `- **${m.id}**: avg=${avg}, min=${min}, max=${max}, last5avg=${recentAvg}, trend=${trend}\n`;
  }
  text += `\n`;

  // ── QoL summary ──
  const qolIds = ['dailyFunctioning', 'workPerformance', 'socialLife', 'overallWellbeing', 'lifeSatisfaction'];
  const qolData = qolIds.map(id => {
    const vals = entries.map(e => e.metrics?.[id]).filter(v => v != null);
    if (vals.length === 0) return null;
    const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    const trend = computeTrend(vals);
    return { id, avg, trend, count: vals.length };
  }).filter(Boolean);

  if (qolData.length > 0) {
    text += `## Quality of Life summary\n`;
    for (const q of qolData) {
      text += `- **${q.id}**: avg=${q.avg}, trend=${q.trend} (${q.count} entries)\n`;
    }
    text += `\n`;
  }

  // ── Dose information ──
  const doseSummary = {};
  for (const e of entries) {
    if (!e.doses || e.doses.length === 0) continue;
    const total = e.doses.reduce((s, d) => s + (d.amount || 0), 0);
    const key = total + (drug.doseUnit || 'mg');
    if (!doseSummary[key]) doseSummary[key] = { count: 0, scaleAvgs: {} };
    doseSummary[key].count++;
    for (const m of scaleMetrics) {
      const val = e.metrics?.[m.id];
      if (val != null) {
        if (!doseSummary[key].scaleAvgs[m.id]) doseSummary[key].scaleAvgs[m.id] = [];
        doseSummary[key].scaleAvgs[m.id].push(val);
      }
    }
  }

  if (Object.keys(doseSummary).length > 1) {
    text += `## Dose comparison\n`;
    for (const [dose, data] of Object.entries(doseSummary)) {
      text += `### ${dose} (${data.count} days)\n`;
      for (const [mid, vals] of Object.entries(data.scaleAvgs)) {
        const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        text += `- ${mid}: avg=${avg}\n`;
      }
    }
    text += `\n`;
  }

  // ── Side effects (toggle metrics) ──
  const toggleMetrics = allMetrics.filter(m => m.type === 'toggle');
  if (toggleMetrics.length > 0) {
    text += `## Side effects & observations (toggle metrics)\n`;
    for (const m of toggleMetrics) {
      const vals = entries.map(e => e.metrics?.[m.id]).filter(v => v != null);
      if (vals.length === 0) continue;
      const counts = {};
      for (const v of vals) counts[v] = (counts[v] || 0) + 1;
      const dist = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ');
      text += `- **${m.id}**: ${dist} (out of ${vals.length} entries)\n`;
    }
    text += `\n`;
  }

  // ── Notes ──
  const notes = entries.filter(e => e.note).map(e => `- ${e.date}: ${e.note}`);
  if (notes.length > 0) {
    text += `## Patient notes\n`;
    text += notes.join('\n') + '\n\n';
  }

  // ── Raw data ──
  if (cfg.ai.includeRawData) {
    const rawCount = cfg.ai.rawDataEntries || 14;
    const recent = entries.slice(-rawCount);
    text += `## Raw data (last ${recent.length} entries)\n`;
    text += `\`\`\`json\n`;
    text += JSON.stringify(recent, null, 2);
    text += `\n\`\`\`\n\n`;
  }

  // ── Health data overlay ──
  if (cfg.ai.includeHealthData) {
    const healthDates = Object.keys(state.healthData).filter(d =>
      entries.some(e => e.date === d)
    );
    if (healthDates.length > 0) {
      text += `## Imported health device data\n`;
      text += `\`\`\`json\n`;
      const relevant = {};
      for (const d of healthDates) relevant[d] = state.healthData[d];
      text += JSON.stringify(relevant, null, 2);
      text += `\n\`\`\`\n`;
    }
  }

  return text;
}

function computeTrend(values) {
  if (values.length < 3) return 'insufficient data';
  const n = values.length;
  const firstHalf = values.slice(0, Math.floor(n / 2));
  const secondHalf = values.slice(Math.floor(n / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;
  if (diff > 0.5) return '↑ improving';
  if (diff < -0.5) return '↓ worsening';
  return '→ stable';
}

/**
 * Copy AI export to clipboard.
 */
export async function copyAiExport() {
  const text = generateAiExport();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    toast(t('toast.aiExportCopied'));
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast(t('toast.aiExportCopied'));
  }
}

/**
 * Download AI export as .md file.
 */
export function downloadAiExport() {
  const text = generateAiExport();
  if (!text) return;

  const drug = state.settings.activeDrug;
  const date = new Date().toISOString().slice(0, 10);
  const filename = `ai-export-${drug?.id || 'medication'}-${date}.md`;

  const blob = new Blob([text], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  toast(t('toast.aiExportDownloaded'));
}
