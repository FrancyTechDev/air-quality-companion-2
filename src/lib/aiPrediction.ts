import { SensorData } from '@/lib/airQuality';

// Simple linear regression for predictions
const linearRegression = (data: number[]): { slope: number; intercept: number } => {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0] || 0 };
  
  const sumX = data.reduce((acc, _, i) => acc + i, 0);
  const sumY = data.reduce((acc, val) => acc + val, 0);
  const sumXY = data.reduce((acc, val, i) => acc + i * val, 0);
  const sumXX = data.reduce((acc, _, i) => acc + i * i, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
};

// Moving average for smoothing
const movingAverage = (data: number[], window: number): number[] => {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
};

export interface PredictionResult {
  pm25Predictions: { hour: number; value: number }[];
  pm10Predictions: { hour: number; value: number }[];
  trend: 'improving' | 'stable' | 'worsening';
  confidence: number;
}

export interface AIAnalysis {
  realtime: { pm25: number; pm10: number; ratio: number; trend: number; volatility: number };
  forecast: { h1: number | null; h2: number | null; h3: number | null; prob_over_threshold: number; threshold: number };
  exposure: { exposure_1h: number; exposure_6h: number; exposure_24h: number; avg_1h: number; avg_6h: number; avg_24h: number };
  moving_averages: { ma_5m: number; ma_15m: number; ma_60m: number };
  adaptive_threshold: { adaptive_threshold: number; method: string };
  data_quality: { samples: number; last_gap_s: number | null; sample_rate_min: number };
  recovery: { recovery_index: number; time_since_peak_h: number | null; time_since_above_threshold_h: number | null; recovery_stage: string; fatigue_score: number };
  ess: number;
  source: { label: string; confidence: number };
  advisory: string[];
}

const AI_BASE = (import.meta as any).env?.VITE_AI_URL || window.location.origin;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mean = (values: number[]) => values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const stddev = (values: number[]) => {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map(v => Math.pow(v - m, 2)));
  return Math.sqrt(variance);
};
const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};
const clamp01 = (value: number) => clamp(value, 0, 1);
const toHours = (ms: number) => ms / 3600000;

export const computeEssFromPm25 = (pm25: number, threshold = 15) => {
  const normalized = clamp(pm25 / Math.max(threshold * 2.5, 1), 0, 1);
  return Math.round(normalized * 100);
};

const windowStats = (history: SensorData[], hours: number, latestTs: number) => {
  const cutoff = latestTs - hours * 3600000;
  const window = history.filter(d => (d.timestamp?.getTime?.() ?? 0) >= cutoff);
  if (window.length === 0) {
    return { avg: 0, exposure: 0, samples: 0 };
  }
  const pm25Values = window.map(d => Math.max(0, d.pm25));
  const avg = mean(pm25Values);
  const spanH = Math.max(0.01, toHours(latestTs - (window[0].timestamp?.getTime?.() ?? latestTs)));
  const exposure = avg * Math.min(hours, spanH);
  return { avg, exposure, samples: window.length };
};

const computeTrend = (history: SensorData[], latestTs: number) => {
  const recent = history.slice(-60);
  if (recent.length < 2) return 0;
  const times = recent.map(d => toHours((d.timestamp?.getTime?.() ?? latestTs) - (recent[0].timestamp?.getTime?.() ?? latestTs)));
  const values = recent.map(d => Math.max(0, d.pm25));
  const reg = linearRegression(values.map((v, i) => v));
  const hoursSpan = Math.max(0.01, times[times.length - 1]);
  const slopePerIndex = reg.slope;
  const slopePerHour = slopePerIndex * (recent.length / hoursSpan);
  return slopePerHour;
};

const classifySource = (pm25: number, pm10: number, ratio: number, trend: number, volatility: number, avg6h: number) => {
  const scoreSpike = clamp01((pm25 - avg6h * 1.6) / 10) * clamp01((volatility - 1.5) / 2.5);
  const scoreCombustion = clamp01((ratio - 0.55) / 0.35) * clamp01((pm25 - 12) / 25);
  const scoreCoarse = clamp01((0.6 - ratio) / 0.4) * clamp01((pm10 - 20) / 40);
  const scoreIndoor = clamp01((ratio - 0.65) / 0.25) * clamp01((pm25 - 8) / 12) * clamp01((1.8 - volatility) / 1.8);
  const scoreBackground = clamp01((ratio - 0.5) / 0.4) * clamp01((pm25 - 10) / 20) * clamp01((0.8 - Math.abs(trend)) / 0.8);

  const scores: Record<string, number> = {
    anomalous_spike: scoreSpike,
    combustion_dominant: scoreCombustion,
    coarse_particle: scoreCoarse,
    indoor_activity: scoreIndoor,
    background_elevation: scoreBackground,
  };

  const best = Object.entries(scores).reduce((acc, [label, score]) => score > acc.score ? { label, score } : acc, { label: 'background_elevation', score: 0 });
  const confidence = clamp(best.score, 0.15, 0.95);
  return { label: best.score < 0.12 ? 'background_elevation' : best.label, confidence };
};

export const computeLocalInsights = (history: SensorData[] = [], current?: SensorData | null): AIAnalysis => {
  const latest = current?.timestamp?.getTime?.() ?? history[history.length - 1]?.timestamp?.getTime?.() ?? Date.now();
  const recent = history.length > 0 ? history : [];
  const pm25Now = Math.max(0, current?.pm25 ?? recent[recent.length - 1]?.pm25 ?? 0);
  const pm10Now = Math.max(0, current?.pm10 ?? recent[recent.length - 1]?.pm10 ?? 0);
  const ratio = pm10Now > 0 ? pm25Now / pm10Now : 0;

  const w1 = windowStats(recent, 1, latest);
  const w6 = windowStats(recent, 6, latest);
  const w24 = windowStats(recent, 24, latest);

  const trend = computeTrend(recent, latest);
  const volatility = stddev(recent.slice(-60).map(d => Math.max(0, d.pm25)));
  const ma5m = windowStats(recent, 1 / 12, latest).avg;
  const ma15m = windowStats(recent, 0.25, latest).avg;
  const ma60m = windowStats(recent, 1, latest).avg;

  const thresholdOMS = 15;
  const adaptiveCandidate = Math.max(mean(recent.slice(-120).map(d => Math.max(0, d.pm25))) + stddev(recent.slice(-120).map(d => Math.max(0, d.pm25))) * 0.8, quantile(recent.slice(-240).map(d => Math.max(0, d.pm25)), 0.8));
  const adaptiveThreshold = clamp(Math.round(adaptiveCandidate), 10, 35);
  const adaptiveMethod = 'mean+0.8σ / q80';

  const h1 = Math.round((pm25Now + trend * 1) * 10) / 10;
  const h2 = Math.round((pm25Now + trend * 2) * 10) / 10;
  const h3 = Math.round((pm25Now + trend * 3) * 10) / 10;
  const predictedMax = Math.max(h1, h2, h3, pm25Now);
  const prob = clamp01(1 / (1 + Math.exp(-(predictedMax - thresholdOMS) / (4 + volatility))));

  const timeAbove = recent.length === 0 ? 0 : (recent.filter(d => d.pm25 > thresholdOMS).length / recent.length) * 100;
  const ess = computeEssFromPm25(w6.avg > 0 ? w6.avg : pm25Now, thresholdOMS);

  const lastGap = recent.length >= 2
    ? Math.max(0, ((recent[recent.length - 1].timestamp?.getTime?.() ?? latest) - (recent[recent.length - 2].timestamp?.getTime?.() ?? latest)) / 1000)
    : null;
  const spanMinutes = recent.length > 1 ? Math.max(1, toHours(latest - (recent[0].timestamp?.getTime?.() ?? latest)) * 60) : 0;
  const sampleRate = spanMinutes > 0 ? Math.round((recent.length / spanMinutes) * 10) / 10 : 0;

  const peakWindow = windowStats(recent, 24, latest);
  const peakValue = recent.length > 0 ? Math.max(...recent.map(d => Math.max(0, d.pm25))) : 0;
  const peakIndex = recent.findIndex(d => d.pm25 === peakValue);
  const timeSincePeak = peakIndex >= 0 ? toHours(latest - (recent[peakIndex].timestamp?.getTime?.() ?? latest)) : null;
  const lastAboveIndex = [...recent].reverse().findIndex(d => d.pm25 > thresholdOMS);
  const timeSinceAbove = lastAboveIndex >= 0
    ? toHours(latest - (recent[recent.length - 1 - lastAboveIndex].timestamp?.getTime?.() ?? latest))
    : null;
  const recoveryIndex = clamp(Math.round((1 - (w1.avg / Math.max(thresholdOMS * 2, 1))) * 100), 0, 100);
  const recoveryStage = recoveryIndex > 70 ? 'recovering' : recoveryIndex > 40 ? 'stressed' : 'acute';

  const source = classifySource(pm25Now, pm10Now, ratio, trend, volatility, w6.avg);

  return {
    realtime: { pm25: pm25Now, pm10: pm10Now, ratio, trend, volatility },
    forecast: { h1, h2, h3, prob_over_threshold: prob, threshold: thresholdOMS },
    exposure: {
      exposure_1h: Math.max(0, w1.exposure),
      exposure_6h: Math.max(0, w6.exposure),
      exposure_24h: Math.max(0, w24.exposure),
      avg_1h: Math.max(0, w1.avg),
      avg_6h: Math.max(0, w6.avg),
      avg_24h: Math.max(0, w24.avg),
    },
    moving_averages: { ma_5m: ma5m, ma_15m: ma15m, ma_60m: ma60m },
    adaptive_threshold: { adaptive_threshold: adaptiveThreshold, method: adaptiveMethod },
    data_quality: { samples: recent.length, last_gap_s: lastGap, sample_rate_min: sampleRate },
    recovery: {
      recovery_index: recoveryIndex,
      time_since_peak_h: timeSincePeak,
      time_since_above_threshold_h: timeSinceAbove,
      recovery_stage: recoveryStage,
      fatigue_score: clamp(Math.round((timeAbove / 100) * 100), 0, 100),
    },
    ess,
    source,
    advisory: [
      'Indicatori calcolati localmente su finestra recente per massima coerenza.',
      `Tempo sopra soglia OMS: ${Math.round(timeAbove)}% nelle ultime 24h.`,
    ],
  };
};

export const getAIInsights = async (history?: SensorData[]): Promise<AIAnalysis> => {
  try {
    const res = await fetch(`${AI_BASE}/ai/insights`);
    if (!res.ok) throw new Error('AI insights error');
    const json = (await res.json()) as AIAnalysis;
    return json;
  } catch {
    return computeLocalInsights(history ?? []);
  }
};
export const fetchLocalAiPredictions = async (): Promise<PredictionResult | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const base = (import.meta as any).env?.VITE_AI_URL || window.location.origin;
    const res = await fetch(`${base}/predict`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.pm25Predictions || !data.pm10Predictions) return null;
    return data as PredictionResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const generatePredictions = (history: SensorData[]): PredictionResult => {
  if (history.length < 10) {
    return {
      pm25Predictions: [],
      pm10Predictions: [],
      trend: 'stable',
      confidence: 0
    };
  }
  
  // Use last 60 data points for prediction
  const recentData = history.slice(-60);
  const pm25Values = recentData.map(d => d.pm25);
  const pm10Values = recentData.map(d => d.pm10);
  
  // Smooth the data
  const smoothedPm25 = movingAverage(pm25Values, 5);
  const smoothedPm10 = movingAverage(pm10Values, 5);
  
  // Get regression coefficients
  const pm25Reg = linearRegression(smoothedPm25);
  const pm10Reg = linearRegression(smoothedPm10);
  
  // Generate predictions for next 5 hours
  const pm25Predictions: { hour: number; value: number }[] = [];
  const pm10Predictions: { hour: number; value: number }[] = [];
  
  const currentPm25 = pm25Values[pm25Values.length - 1];
  const currentPm10 = pm10Values[pm10Values.length - 1];
  
  for (let hour = 1; hour <= 5; hour++) {
    // Add some seasonal variation and randomness
    const seasonalFactor = Math.sin((Date.now() / 3600000 + hour) * 0.2) * 5;
    const randomFactor = (Math.random() - 0.5) * 3;
    
    // Predict based on trend + seasonal + random
    const predictedPm25 = Math.max(5, Math.min(150,
      currentPm25 + pm25Reg.slope * hour * 10 + seasonalFactor + randomFactor
    ));
    
    const predictedPm10 = Math.max(10, Math.min(200,
      currentPm10 + pm10Reg.slope * hour * 10 + seasonalFactor * 1.3 + randomFactor
    ));
    
    pm25Predictions.push({ hour, value: Math.round(predictedPm25 * 10) / 10 });
    pm10Predictions.push({ hour, value: Math.round(predictedPm10 * 10) / 10 });
  }
  
  // Determine trend
  let trend: PredictionResult['trend'];
  if (pm25Reg.slope < -0.1) {
    trend = 'improving';
  } else if (pm25Reg.slope > 0.1) {
    trend = 'worsening';
  } else {
    trend = 'stable';
  }
  
  // Calculate confidence based on data consistency
  const variance = pm25Values.reduce((acc, val) => {
    const mean = pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length;
    return acc + Math.pow(val - mean, 2);
  }, 0) / pm25Values.length;
  
  const confidence = Math.max(50, Math.min(95, 90 - variance / 5));
  
  return { pm25Predictions, pm10Predictions, trend, confidence: Math.round(confidence) };
};




