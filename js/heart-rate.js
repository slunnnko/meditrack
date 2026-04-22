// ── Heart-rate processing — cleaning + medication window detection ──
//
// Pure functions. No DOM, no state import.
// Reading shape: { timestamp: Date, bpm: number, corrected?: boolean | string }

// ─────────────────────────────────────────────────────────
// Cleaning pipeline
// ─────────────────────────────────────────────────────────

/**
 * Half-rate error: optical PPG sometimes detects every other beat.
 * If current reading is ~half of the average of its neighbors (and neighbors
 * are in a plausible awake range), double it.
 */
export function detectHalfRateErrors(readings) {
  if (readings.length < 3) return readings.slice();
  const out = readings.map(r => ({ ...r }));
  for (let i = 1; i < out.length - 1; i++) {
    const prev = out[i - 1].bpm;
    const next = out[i + 1].bpm;
    const neighborAvg = (prev + next) / 2;
    if (neighborAvg <= 70) continue;
    const ratio = out[i].bpm / neighborAvg;
    if (ratio >= 0.45 && ratio <= 0.55) {
      out[i] = { ...out[i], bpm: out[i].bpm * 2, corrected: 'doubled' };
    }
  }
  return out;
}

/**
 * Remove physiologically impossible values and spurious spikes where
 * only one reading jumps while its neighbors agree.
 */
export function cleanHeartRateData(readings) {
  const out = [];
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    if (r.bpm < 40 || r.bpm > 200) continue;

    if (i > 0 && i < readings.length - 1) {
      const prev = readings[i - 1];
      const next = readings[i + 1];
      const dtPrev = (r.timestamp - prev.timestamp) / 60000; // min
      const dtNext = (next.timestamp - r.timestamp) / 60000;
      if (dtPrev > 0 && dtNext > 0 && dtPrev < 5 && dtNext < 5) {
        const deltaPrev = Math.abs(r.bpm - prev.bpm) / dtPrev;
        const deltaNext = Math.abs(next.bpm - r.bpm) / dtNext;
        const neighborDelta = Math.abs(next.bpm - prev.bpm);
        if (deltaPrev > 40 && deltaNext > 40 && neighborDelta < Math.max(deltaPrev, deltaNext) / 2) {
          continue; // neighbors agree; current is an isolated spike
        }
      }
    }
    out.push(r);
  }
  return out;
}

/**
 * Rolling median smoother. Replaces a value with the window median when it
 * deviates by more than `deviation` bpm.
 */
export function medianFilter(readings, windowSize = 5, deviation = 25) {
  if (readings.length < windowSize) return readings.slice();
  const half = Math.floor(windowSize / 2);
  const out = readings.map(r => ({ ...r }));
  for (let i = 0; i < out.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(out.length, i + half + 1);
    const window = out.slice(lo, hi).map(x => x.bpm).sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    if (Math.abs(out[i].bpm - median) > deviation) {
      out[i] = { ...out[i], bpm: median, corrected: true };
    }
  }
  return out;
}

/**
 * Full cleaning pipeline. Returns raw, cleaned, and basic stats.
 */
export function processHeartRateData(rawReadings) {
  const raw = rawReadings.slice().sort((a, b) => a.timestamp - b.timestamp);
  let r = detectHalfRateErrors(raw);
  r = cleanHeartRateData(r);
  r = medianFilter(r);

  const correctedCount = r.filter(x => x.corrected).length;
  const mean = r.length ? r.reduce((s, x) => s + x.bpm, 0) / r.length : 0;

  return {
    raw,
    cleaned: r,
    stats: {
      rawCount: raw.length,
      cleanedCount: r.length,
      correctedCount,
      meanBpm: Math.round(mean * 10) / 10,
    },
  };
}

// ─────────────────────────────────────────────────────────
// Baseline
// ─────────────────────────────────────────────────────────

function slotKey(date, slotMinutes) {
  const h = date.getHours();
  const m = Math.floor(date.getMinutes() / slotMinutes) * slotMinutes;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function stdDev(values, mean) {
  if (values.length < 2) return 0;
  const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sq / (values.length - 1));
}

/**
 * Build a per-time-of-day baseline from pre-medication readings.
 * Readings with timestamp >= cutoffDate are ignored.
 */
export function buildBaseline(historicalReadings, { cutoffDate, slotMinutes = 30, minN = 5 } = {}) {
  const cutoff = cutoffDate instanceof Date ? cutoffDate : new Date(cutoffDate);
  const buckets = {};
  for (const r of historicalReadings) {
    if (cutoff && r.timestamp >= cutoff) continue;
    const key = slotKey(r.timestamp, slotMinutes);
    (buckets[key] = buckets[key] || []).push(r.bpm);
  }
  const slots = {};
  for (const [key, values] of Object.entries(buckets)) {
    if (values.length < minN) continue;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    slots[key] = {
      median: Math.round(median(values) * 10) / 10,
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev(values, mean) * 10) / 10,
      n: values.length,
    };
  }
  return {
    slots,
    cutoffDate: cutoff ? cutoff.toISOString() : null,
    slotMinutes,
    builtAt: new Date().toISOString(),
  };
}

function baselineMedianFor(date, baseline) {
  if (!baseline || !baseline.slots) return null;
  const key = slotKey(date, baseline.slotMinutes || 30);
  return baseline.slots[key]?.median ?? null;
}

// ─────────────────────────────────────────────────────────
// Onset / offset / peak
// ─────────────────────────────────────────────────────────

function parseDoseTime(doseTime, refDate) {
  if (!doseTime) return null;
  const [h, m] = doseTime.split(':').map(Number);
  const d = new Date(refDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Detect onset/offset of medication effect by comparing cleaned readings
 * against the per-slot baseline.
 */
export function detectMedicationWindow(dayReadings, baseline, {
  onsetThreshold = 10,
  sustainMinutes = 15,
  doseTime,
} = {}) {
  if (!dayReadings.length || !baseline?.slots) {
    return { onset: null, offset: null, durationMinutes: 0, onsetDelayFromDose: null };
  }

  const elevations = dayReadings.map(r => {
    const base = baselineMedianFor(r.timestamp, baseline);
    return {
      timestamp: r.timestamp,
      bpm: r.bpm,
      base,
      elevation: base == null ? null : r.bpm - base,
    };
  });

  const sustainMs = sustainMinutes * 60000;
  const offsetSustainMs = sustainMs * 2;

  // Onset: first stretch of consecutive elevations > threshold lasting sustainMinutes.
  let onsetIdx = -1;
  for (let i = 0; i < elevations.length; i++) {
    const e = elevations[i];
    if (e.elevation == null || e.elevation <= onsetThreshold) continue;
    // Walk forward while still above threshold.
    let j = i;
    while (j < elevations.length && elevations[j].elevation != null && elevations[j].elevation > onsetThreshold) {
      if (elevations[j].timestamp - e.timestamp >= sustainMs) {
        onsetIdx = i;
        break;
      }
      j++;
    }
    if (onsetIdx >= 0) break;
  }

  if (onsetIdx < 0) {
    return { onset: null, offset: null, durationMinutes: 0, onsetDelayFromDose: null };
  }

  // Offset: after onset, first stretch below threshold lasting 2 * sustainMinutes.
  let offsetIdx = -1;
  for (let i = onsetIdx + 1; i < elevations.length; i++) {
    const e = elevations[i];
    if (e.elevation == null || e.elevation > onsetThreshold) continue;
    let j = i;
    while (j < elevations.length && (elevations[j].elevation == null || elevations[j].elevation <= onsetThreshold)) {
      if (elevations[j].timestamp - e.timestamp >= offsetSustainMs) {
        offsetIdx = i;
        break;
      }
      j++;
    }
    if (offsetIdx >= 0) break;
  }

  const onset = elevations[onsetIdx].timestamp;
  const offset = offsetIdx >= 0 ? elevations[offsetIdx].timestamp : null;
  const durationMinutes = offset ? Math.round((offset - onset) / 60000) : null;

  let onsetDelayFromDose = null;
  const dose = parseDoseTime(doseTime, onset);
  if (dose) onsetDelayFromDose = Math.round((onset - dose) / 60000);

  return {
    onset: onset.toISOString(),
    offset: offset ? offset.toISOString() : null,
    durationMinutes,
    onsetDelayFromDose,
  };
}

/**
 * Rolling window mean of elevation; returns peak time + elevation.
 */
export function findPeakEffect(dayReadings, baseline, windowMinutes = 30) {
  if (!dayReadings.length || !baseline?.slots) {
    return { peakTime: null, peakElevation: 0 };
  }
  const elevations = dayReadings.map(r => {
    const base = baselineMedianFor(r.timestamp, baseline);
    return { timestamp: r.timestamp, elevation: base == null ? null : r.bpm - base };
  });
  const windowMs = windowMinutes * 60000;
  let best = { peakTime: null, peakElevation: -Infinity };
  for (let i = 0; i < elevations.length; i++) {
    const start = elevations[i].timestamp;
    const slice = [];
    for (let j = i; j < elevations.length; j++) {
      if (elevations[j].timestamp - start > windowMs) break;
      if (elevations[j].elevation != null) slice.push(elevations[j].elevation);
    }
    if (!slice.length) continue;
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    if (mean > best.peakElevation) {
      best = {
        peakTime: new Date(start.getTime() + windowMs / 2).toISOString(),
        peakElevation: Math.round(mean * 10) / 10,
      };
    }
  }
  if (best.peakElevation === -Infinity) return { peakTime: null, peakElevation: 0 };
  return best;
}

// ─────────────────────────────────────────────────────────
// Caffeine correlation
// ─────────────────────────────────────────────────────────

function caffeineMg(entry, defaults) {
  if (entry.unit === 'mg') return entry.amount || 0;
  const perUnit = defaults?.[entry.type] ?? 0;
  if (entry.unit === 'cup' || !entry.unit) return (entry.amount || 1) * perUnit;
  if (entry.unit === 'ml') {
    // Assume defaults[type] is mg per ~240 ml cup.
    return ((entry.amount || 0) / 240) * perUnit;
  }
  return 0;
}

function parseDayTime(time, refDate) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const d = new Date(refDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Sum of plasma caffeine equivalent at `atTime`, using exponential decay.
 */
export function estimateCaffeineLoad(caffeineLog, atTime, { halfLifeMinutes = 300, defaults } = {}) {
  if (!Array.isArray(caffeineLog) || !caffeineLog.length || !atTime) return 0;
  const at = atTime instanceof Date ? atTime : new Date(atTime);
  let total = 0;
  for (const e of caffeineLog) {
    const intake = parseDayTime(e.time, at);
    if (!intake || intake > at) continue;
    const mg = caffeineMg(e, defaults);
    const minutes = (at - intake) / 60000;
    total += mg * Math.pow(0.5, minutes / halfLifeMinutes);
  }
  return Math.round(total);
}

/**
 * Flag a detection window with caffeine context. Does NOT alter onset/offset;
 * only annotates so the user can judge.
 */
export function annotateWindowWithCaffeine(window, caffeineLog, {
  halfLifeMinutes = 300,
  correlationWindowMinutes = 90,
  defaults,
} = {}) {
  if (!window || !Array.isArray(caffeineLog) || !caffeineLog.length) return window;
  const out = { ...window };

  if (out.onset) {
    out.caffeineAtOnset = estimateCaffeineLoad(caffeineLog, out.onset, { halfLifeMinutes, defaults });
  }
  if (out.peakTime) {
    out.caffeineAtPeak = estimateCaffeineLoad(caffeineLog, out.peakTime, { halfLifeMinutes, defaults });
  }

  out.possibleCaffeineConfound = false;
  const anchor = out.onset || out.peakTime;
  if (anchor) {
    const anchorDate = new Date(anchor);
    for (const e of caffeineLog) {
      const intake = parseDayTime(e.time, anchorDate);
      if (!intake) continue;
      const diff = (anchorDate - intake) / 60000;
      if (diff >= 0 && diff <= correlationWindowMinutes) {
        out.possibleCaffeineConfound = true;
        break;
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────

/**
 * Process one day's raw readings and produce a medication window summary.
 * `opts.doseTime` is "HH:MM"; `opts.caffeineLog` is the entry's caffeine array.
 */
export function analyzeDay(dayReadings, baseline, opts = {}) {
  const { cleaned, stats } = processHeartRateData(dayReadings);
  const window = detectMedicationWindow(cleaned, baseline, opts);
  const peak = findPeakEffect(cleaned, baseline, opts.peakWindowMinutes || 30);

  let summary = {
    ...window,
    peakTime: peak.peakTime,
    peakElevation: peak.peakElevation,
    rawCount: stats.rawCount,
    cleanedCount: stats.cleanedCount,
    correctedCount: stats.correctedCount,
    meanBpm: stats.meanBpm,
  };

  if (opts.caffeineLog?.length) {
    summary = annotateWindowWithCaffeine(summary, opts.caffeineLog, {
      halfLifeMinutes: opts.caffeineHalfLifeMinutes,
      correlationWindowMinutes: opts.caffeineCorrelationWindowMinutes,
      defaults: opts.caffeineDefaults,
    });
  }

  return summary;
}
