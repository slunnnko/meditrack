// ── Drug Profiles — metric definitions & category profiles ──

// Metric component types
// scale: 1-5 buttons
// toggle: option buttons (single select)
// time: time input
// number: numeric input with unit
// energy: morning/afternoon/evening energy grid
// textarea: free text

export const METRICS = {
  // ── Scale metrics (1-5) ──
  initiation: {
    type: 'scale', group: 'metrics',
    label: 'metric.initiation',
  },
  focus: {
    type: 'scale', group: 'metrics',
    label: 'metric.focus',
  },
  emotionalReactivity: {
    type: 'scale', group: 'metrics',
    label: 'metric.emotionalReactivity',
  },
  memory: {
    type: 'scale', group: 'metrics',
    label: 'metric.memory',
  },
  mood: {
    type: 'scale', group: 'metrics',
    label: 'metric.mood',
  },
  anxiety: {
    type: 'scale', group: 'metrics',
    label: 'metric.anxiety',
  },
  appetite: {
    type: 'scale', group: 'metrics',
    label: 'metric.appetite',
  },
  energy: {
    type: 'scale', group: 'metrics',
    label: 'metric.energy',
  },
  sleep: {
    type: 'scale', group: 'metrics',
    label: 'metric.sleep',
  },
  libido: {
    type: 'scale', group: 'metrics',
    label: 'metric.libido',
  },
  emotionalBlunting: {
    type: 'scale', group: 'metrics',
    label: 'metric.emotionalBlunting',
  },
  nausea: {
    type: 'scale', group: 'metrics',
    label: 'metric.nausea',
  },
  headache: {
    type: 'scale', group: 'metrics',
    label: 'metric.headache',
  },
  sweating: {
    type: 'scale', group: 'metrics',
    label: 'metric.sweating',
  },
  dizziness: {
    type: 'scale', group: 'metrics',
    label: 'metric.dizziness',
  },
  tremor: {
    type: 'scale', group: 'metrics',
    label: 'metric.tremor',
  },
  sedation: {
    type: 'scale', group: 'metrics',
    label: 'metric.sedation',
  },
  restlessness: {
    type: 'scale', group: 'metrics',
    label: 'metric.restlessness',
  },
  drymouth: {
    type: 'scale', group: 'metrics',
    label: 'metric.drymouth',
  },
  constipation: {
    type: 'scale', group: 'metrics',
    label: 'metric.constipation',
  },
  blurredVision: {
    type: 'scale', group: 'metrics',
    label: 'metric.blurredVision',
  },

  // ── Scale metrics — non-psychiatric ──
  painLevel: {
    type: 'scale', group: 'metrics',
    label: 'metric.painLevel',
  },
  jointPain: {
    type: 'scale', group: 'metrics',
    label: 'metric.jointPain',
  },
  musclePain: {
    type: 'scale', group: 'metrics',
    label: 'metric.musclePain',
  },
  stiffness: {
    type: 'scale', group: 'metrics',
    label: 'metric.stiffness',
  },
  swelling: {
    type: 'scale', group: 'metrics',
    label: 'metric.swelling',
  },
  breathingEase: {
    type: 'scale', group: 'metrics',
    label: 'metric.breathingEase',
  },
  cough: {
    type: 'scale', group: 'metrics',
    label: 'metric.cough',
  },
  skinCondition: {
    type: 'scale', group: 'metrics',
    label: 'metric.skinCondition',
  },
  skinDryness: {
    type: 'scale', group: 'metrics',
    label: 'metric.skinDryness',
  },
  itching: {
    type: 'scale', group: 'metrics',
    label: 'metric.itching',
  },
  heartburn: {
    type: 'scale', group: 'metrics',
    label: 'metric.heartburn',
  },
  bloating: {
    type: 'scale', group: 'metrics',
    label: 'metric.bloating',
  },
  diarrhea: {
    type: 'scale', group: 'metrics',
    label: 'metric.diarrhea',
  },
  fatigue: {
    type: 'scale', group: 'metrics',
    label: 'metric.fatigue',
  },
  hotFlashes: {
    type: 'scale', group: 'metrics',
    label: 'metric.hotFlashes',
  },
  moodSwings: {
    type: 'scale', group: 'metrics',
    label: 'metric.moodSwings',
  },
  waterRetention: {
    type: 'scale', group: 'metrics',
    label: 'metric.waterRetention',
  },
  breastTenderness: {
    type: 'scale', group: 'metrics',
    label: 'metric.breastTenderness',
  },
  migraineIntensity: {
    type: 'scale', group: 'metrics',
    label: 'metric.migraineIntensity',
  },
  migraineFrequency: {
    type: 'scale', group: 'metrics',
    label: 'metric.migraineFrequency',
  },
  bonePain: {
    type: 'scale', group: 'metrics',
    label: 'metric.bonePain',
  },

  // ── Stimulant-specific metrics ──
  onsetTime: {
    type: 'time', group: 'perception',
    label: 'metric.onsetTime',
  },
  afternoonDip: {
    type: 'scale', group: 'metrics',
    label: 'metric.afternoonDip',
  },

  // ── Toggle metrics ──
  bleeding: {
    type: 'toggle', group: 'body',
    label: 'metric.bleeding',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'minor', label: 'opt.minor' },
      { value: 'significant', label: 'opt.significant' },
    ],
  },
  bruising: {
    type: 'toggle', group: 'body',
    label: 'metric.bruising',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'mild', label: 'opt.mild' },
      { value: 'severe', label: 'opt.severe' },
    ],
  },
  wheezing: {
    type: 'toggle', group: 'body',
    label: 'metric.wheezing',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'mild', label: 'opt.mild' },
      { value: 'severe', label: 'opt.severe' },
    ],
  },
  rescueInhaler: {
    type: 'toggle', group: 'body',
    label: 'metric.rescueInhaler',
    options: [
      { value: 'no', label: 'opt.no' },
      { value: 'once', label: 'opt.once' },
      { value: 'multiple', label: 'opt.multiple' },
    ],
  },
  infectionSigns: {
    type: 'toggle', group: 'body',
    label: 'metric.infectionSigns',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'mild', label: 'opt.mild' },
      { value: 'significant', label: 'opt.significant' },
    ],
  },
  hypoglycemia: {
    type: 'toggle', group: 'body',
    label: 'metric.hypoglycemia',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'mild', label: 'opt.mild' },
      { value: 'severe', label: 'opt.severe' },
    ],
  },

  // ── Number metrics — non-psychiatric ──
  bloodSugar: {
    type: 'number', group: 'body',
    label: 'metric.bloodSugar',
    unit: 'mmol/l', min: 1, max: 30, step: 0.1,
  },
  bloodPressureSys: {
    type: 'number', group: 'body',
    label: 'metric.bloodPressureSys',
    unit: 'mmHg', min: 60, max: 250,
  },
  bloodPressureDia: {
    type: 'number', group: 'body',
    label: 'metric.bloodPressureDia',
    unit: 'mmHg', min: 30, max: 150,
  },
  inr: {
    type: 'number', group: 'body',
    label: 'metric.inr',
    unit: 'INR', min: 0.5, max: 10, step: 0.1,
  },
  peakFlow: {
    type: 'number', group: 'body',
    label: 'metric.peakFlow',
    unit: 'l/min', min: 50, max: 800,
  },
  migraineAttacks: {
    type: 'number', group: 'body',
    label: 'metric.migraineAttacks',
    unit: '×', min: 0, max: 20,
  },
  socialPerception: {
    type: 'toggle', group: 'perception',
    label: 'metric.socialPerception',
    options: [
      { value: 'music', label: 'opt.music' },
      { value: 'content', label: 'opt.content' },
      { value: 'both', label: 'opt.both' },
    ],
  },
  fluctuations: {
    type: 'toggle', group: 'perception',
    label: 'metric.fluctuations',
    options: [
      { value: 'smooth', label: 'opt.smooth' },
      { value: 'mild', label: 'opt.mild' },
      { value: 'severe', label: 'opt.severe' },
    ],
  },
  hungerNoticed: {
    type: 'toggle', group: 'body',
    label: 'metric.hungerNoticed',
    options: [
      { value: 'yes', label: 'opt.yes' },
      { value: 'no', label: 'opt.no' },
    ],
  },
  tinnitus: {
    type: 'toggle', group: 'body',
    label: 'metric.tinnitus',
    options: [
      { value: 'better', label: 'opt.better' },
      { value: 'same', label: 'opt.same' },
      { value: 'worse', label: 'opt.worse' },
    ],
  },
  rls: {
    type: 'toggle', group: 'body',
    label: 'metric.rls',
    options: [
      { value: 'better', label: 'opt.better' },
      { value: 'same', label: 'opt.same' },
      { value: 'worse', label: 'opt.worse' },
    ],
  },
  sleepOnset: {
    type: 'toggle', group: 'sleep',
    label: 'metric.sleepOnset',
    options: [
      { value: 'easy', label: 'opt.easy' },
      { value: 'normal', label: 'opt.normal' },
      { value: 'hard', label: 'opt.hard' },
    ],
  },
  nightWaking: {
    type: 'toggle', group: 'sleep',
    label: 'metric.nightWaking',
    options: [
      { value: 'none', label: 'opt.none' },
      { value: 'once', label: 'opt.once' },
      { value: 'multiple', label: 'opt.multiple' },
    ],
  },

  // ── Time metrics ──
  effectEndTime: {
    type: 'time', group: 'perception',
    label: 'metric.effectEndTime',
  },
  firstMeal: {
    type: 'time', group: 'body',
    label: 'metric.firstMeal',
    defaultValue: '11:00',
  },

  // ── Number metrics ──
  heartRate: {
    type: 'number', group: 'body',
    label: 'metric.heartRate',
    unit: 'bpm', min: 40, max: 200,
  },
  weight: {
    type: 'number', group: 'body',
    label: 'metric.weight',
    unit: 'kg', min: 20, max: 300, step: 0.1,
  },

  // ── Quality of Life metrics ──
  dailyFunctioning: {
    type: 'scale', group: 'qol',
    label: 'metric.dailyFunctioning',
  },
  workPerformance: {
    type: 'scale', group: 'qol',
    label: 'metric.workPerformance',
  },
  socialLife: {
    type: 'scale', group: 'qol',
    label: 'metric.socialLife',
  },
  overallWellbeing: {
    type: 'scale', group: 'qol',
    label: 'metric.overallWellbeing',
  },
  lifeSatisfaction: {
    type: 'scale', group: 'qol',
    label: 'metric.lifeSatisfaction',
  },

  // ── Energy grid ──
  energyMorning: {
    type: 'energy-slot', group: 'energy', slot: 'morning',
    label: 'energy.morning',
    options: [
      { value: 'low', label: 'opt.low' },
      { value: 'ok', label: 'opt.ok' },
      { value: 'good', label: 'opt.good' },
    ],
  },
  energyAfternoon: {
    type: 'energy-slot', group: 'energy', slot: 'afternoon',
    label: 'energy.afternoon',
    options: [
      { value: 'low', label: 'opt.low' },
      { value: 'ok', label: 'opt.ok' },
      { value: 'good', label: 'opt.good' },
      { value: 'crash', label: 'opt.crash' },
    ],
  },
  energyEvening: {
    type: 'energy-slot', group: 'energy', slot: 'evening',
    label: 'energy.evening',
    options: [
      { value: 'low', label: 'opt.low' },
      { value: 'ok', label: 'opt.ok' },
      { value: 'good', label: 'opt.good' },
      { value: 'crash', label: 'opt.crash' },
    ],
  },
};

// ── Profiles per drug category ──
export const PROFILES = {
  stimulant: {
    basic: ['mood', 'focus', 'energy', 'appetite', 'sleep'],
    advanced: [
      'initiation', 'focus', 'emotionalReactivity', 'memory',
      'onsetTime', 'afternoonDip',
      'socialPerception', 'fluctuations', 'effectEndTime',
      'hungerNoticed', 'firstMeal', 'heartRate', 'tinnitus', 'rls',
      'energyMorning', 'energyAfternoon', 'energyEvening',
      'sleepOnset', 'nightWaking',
    ],
  },
  ssri: {
    basic: ['mood', 'anxiety', 'sleep', 'energy', 'appetite'],
    advanced: [
      'mood', 'anxiety', 'sleep', 'energy', 'appetite',
      'libido', 'emotionalBlunting', 'nausea', 'headache',
      'sweating', 'weight', 'dizziness',
      'sleepOnset', 'nightWaking',
    ],
  },
  snri: {
    basic: ['mood', 'anxiety', 'sleep', 'energy', 'appetite'],
    advanced: [
      'mood', 'anxiety', 'sleep', 'energy', 'appetite',
      'libido', 'emotionalBlunting', 'nausea', 'headache',
      'sweating', 'weight', 'dizziness', 'heartRate',
      'sleepOnset', 'nightWaking',
    ],
  },
  antipsychotic: {
    basic: ['mood', 'sedation', 'energy', 'appetite', 'sleep'],
    advanced: [
      'mood', 'sedation', 'energy', 'appetite', 'sleep',
      'restlessness', 'tremor', 'weight', 'constipation',
      'blurredVision', 'drymouth', 'dizziness',
      'emotionalBlunting', 'libido',
      'sleepOnset', 'nightWaking',
    ],
  },
  benzodiazepine: {
    basic: ['anxiety', 'mood', 'sedation', 'sleep', 'energy'],
    advanced: [
      'anxiety', 'mood', 'sedation', 'sleep', 'energy',
      'memory', 'dizziness', 'drymouth', 'blurredVision',
      'sleepOnset', 'nightWaking',
    ],
  },
  anticonvulsant: {
    basic: ['mood', 'energy', 'sedation', 'sleep', 'appetite'],
    advanced: [
      'mood', 'energy', 'sedation', 'sleep', 'appetite',
      'dizziness', 'tremor', 'nausea', 'headache',
      'blurredVision', 'weight', 'memory',
      'sleepOnset', 'nightWaking',
    ],
  },
  statin: {
    basic: ['energy', 'musclePain', 'sleep'],
    advanced: [
      'energy', 'musclePain', 'sleep', 'headache',
      'nausea', 'dizziness', 'constipation', 'fatigue',
      'jointPain', 'bloating', 'weight',
    ],
  },
  thyroid: {
    basic: ['mood', 'energy', 'sleep', 'appetite'],
    advanced: [
      'mood', 'energy', 'sleep', 'appetite',
      'heartRate', 'weight', 'tremor', 'sweating',
      'anxiety', 'restlessness',
    ],
  },
  antihypertensive: {
    basic: ['mood', 'energy', 'sleep', 'dizziness'],
    advanced: [
      'mood', 'energy', 'sleep', 'dizziness',
      'headache', 'heartRate', 'nausea',
      'sleepOnset', 'nightWaking',
    ],
  },
  diabetes: {
    basic: ['energy', 'appetite', 'bloodSugar', 'weight'],
    advanced: [
      'energy', 'appetite', 'bloodSugar', 'weight',
      'nausea', 'diarrhea', 'bloating', 'dizziness',
      'hypoglycemia', 'fatigue', 'headache',
      'heartRate', 'blurredVision',
    ],
  },
  asthma: {
    basic: ['breathingEase', 'cough', 'energy', 'sleep'],
    advanced: [
      'breathingEase', 'cough', 'energy', 'sleep',
      'wheezing', 'rescueInhaler', 'peakFlow',
      'heartRate', 'tremor', 'headache',
      'sleepOnset', 'nightWaking',
    ],
  },
  autoimmune: {
    basic: ['painLevel', 'fatigue', 'jointPain', 'energy'],
    advanced: [
      'painLevel', 'fatigue', 'jointPain', 'energy',
      'stiffness', 'swelling', 'skinCondition',
      'infectionSigns', 'nausea', 'headache',
      'weight', 'mood', 'sleep',
    ],
  },
  anticoagulant: {
    basic: ['energy', 'bleeding', 'bruising'],
    advanced: [
      'energy', 'bleeding', 'bruising', 'inr',
      'headache', 'dizziness', 'nausea',
      'fatigue', 'bloodPressureSys', 'bloodPressureDia',
    ],
  },
  corticosteroid: {
    basic: ['mood', 'energy', 'appetite', 'sleep', 'weight'],
    advanced: [
      'mood', 'energy', 'appetite', 'sleep', 'weight',
      'moodSwings', 'waterRetention', 'bloodSugar',
      'bloodPressureSys', 'bloodPressureDia',
      'heartRate', 'sweating', 'anxiety',
      'musclePain', 'skinCondition', 'infectionSigns',
      'sleepOnset', 'nightWaking',
    ],
  },
  hormonal: {
    basic: ['mood', 'energy', 'sleep', 'appetite'],
    advanced: [
      'mood', 'energy', 'sleep', 'appetite',
      'moodSwings', 'hotFlashes', 'headache', 'nausea',
      'breastTenderness', 'waterRetention', 'weight',
      'libido', 'bloating', 'skinCondition',
      'sleepOnset', 'nightWaking',
    ],
  },
  painManagement: {
    basic: ['painLevel', 'mood', 'energy', 'sleep'],
    advanced: [
      'painLevel', 'mood', 'energy', 'sleep',
      'nausea', 'constipation', 'dizziness', 'sedation',
      'appetite', 'fatigue', 'headache',
      'sleepOnset', 'nightWaking',
    ],
  },
  gastrointestinal: {
    basic: ['heartburn', 'bloating', 'appetite', 'energy'],
    advanced: [
      'heartburn', 'bloating', 'appetite', 'energy',
      'nausea', 'diarrhea', 'constipation', 'painLevel',
      'headache', 'fatigue', 'weight',
    ],
  },
  dermatological: {
    basic: ['skinCondition', 'mood', 'energy'],
    advanced: [
      'skinCondition', 'mood', 'energy',
      'skinDryness', 'itching', 'headache',
      'nausea', 'fatigue', 'musclePain', 'jointPain',
      'drymouth', 'blurredVision', 'libido',
    ],
  },
  migraine: {
    basic: ['migraineIntensity', 'migraineFrequency', 'energy', 'mood'],
    advanced: [
      'migraineIntensity', 'migraineFrequency', 'migraineAttacks',
      'energy', 'mood', 'nausea', 'dizziness',
      'fatigue', 'weight', 'appetite',
      'sleepOnset', 'nightWaking',
    ],
  },
  osteoporosis: {
    basic: ['bonePain', 'energy', 'nausea'],
    advanced: [
      'bonePain', 'energy', 'nausea',
      'jointPain', 'musclePain', 'heartburn',
      'dizziness', 'headache', 'fatigue',
    ],
  },
  generic: {
    basic: ['mood', 'energy', 'sleep'],
    advanced: [
      'mood', 'energy', 'sleep', 'appetite',
      'headache', 'nausea', 'dizziness', 'fatigue',
      'sleepOnset', 'nightWaking',
    ],
  },
};

// QoL metrics appended to every advanced profile automatically
const QOL_METRICS = ['dailyFunctioning', 'workPerformance', 'socialLife', 'overallWellbeing', 'lifeSatisfaction'];

// Append QoL to all advanced profiles
for (const prof of Object.values(PROFILES)) {
  if (prof.advanced) {
    prof.advanced = [...prof.advanced, ...QOL_METRICS];
  }
}

// Groups define form card sections
export const GROUPS = {
  metrics:    { title: 'metrics.title', order: 1 },
  perception: { title: 'perception.title', order: 2 },
  body:       { title: 'body.title', order: 3 },
  energy:     { title: 'energy.title', order: 4 },
  sleep:      { title: 'sleep.title', order: 5 },
  qol:        { title: 'qol.title', order: 6 },
};

/**
 * Get metric list for a given category and mode.
 * Applies user config overrides and custom metrics via globalThis.__appConfig.
 */
export function getMetricsForProfile(category, mode) {
  const profile = PROFILES[category] || PROFILES.generic;
  let metricIds = [...(profile[mode] || profile.basic)];

  // Apply config overrides (set by config.js via globalThis.__appConfig)
  const cfg = globalThis.__appConfig;
  if (cfg) {
    // Profile overrides
    const overrides = cfg.profileOverrides?.[category];
    if (overrides) {
      if (overrides.removeMetrics) metricIds = metricIds.filter(id => !overrides.removeMetrics.includes(id));
      if (overrides.addMetrics) {
        for (const id of overrides.addMetrics) { if (!metricIds.includes(id)) metricIds.push(id); }
      }
    }

    // Register custom metrics
    for (const cm of (cfg.customMetrics || [])) {
      if (cm.id && cm.type && !METRICS[cm.id]) {
        METRICS[cm.id] = {
          type: cm.type,
          group: cm.group || 'metrics',
          label: typeof cm.label === 'string' ? cm.label : `metric.${cm.id}`,
          // Copy extra fields (options, unit, min, max, etc.)
          ...cm,
        };
      }
    }
  }

  return metricIds.map(id => ({ id, ...METRICS[id] })).filter(m => m.type);
}

/**
 * Get scale-type metrics for chart rendering.
 */
export function getScaleMetrics(category, mode) {
  return getMetricsForProfile(category, mode).filter(m => m.type === 'scale');
}

/**
 * Get numeric-type metrics for chart rendering.
 */
export function getNumericMetrics(category, mode) {
  return getMetricsForProfile(category, mode).filter(m => m.type === 'number');
}
