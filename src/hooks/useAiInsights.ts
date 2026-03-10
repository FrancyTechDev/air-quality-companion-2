import { useEffect, useMemo, useState } from 'react';
import { AIAnalysis, computeLocalInsights } from '@/lib/aiPrediction';
import { SensorData } from '@/lib/airQuality';

const AI_INSIGHTS_URL =
  (import.meta as any).env?.VITE_AI_INSIGHTS_URL ||
  'https://ai-python-kae4.onrender.com/ai/insights';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeAi = (remote: Partial<AIAnalysis> | null, local: AIAnalysis): AIAnalysis => {
  if (!remote) return local;

  const merged: AIAnalysis = {
    realtime: {
      pm25: isFiniteNumber(remote.realtime?.pm25) ? Math.max(0, remote.realtime!.pm25) : local.realtime.pm25,
      pm10: isFiniteNumber(remote.realtime?.pm10) ? Math.max(0, remote.realtime!.pm10) : local.realtime.pm10,
      ratio: isFiniteNumber(remote.realtime?.ratio) ? Math.max(0, remote.realtime!.ratio) : local.realtime.ratio,
      trend: isFiniteNumber(remote.realtime?.trend) ? remote.realtime!.trend : local.realtime.trend,
      volatility: isFiniteNumber(remote.realtime?.volatility) ? Math.max(0, remote.realtime!.volatility) : local.realtime.volatility,
    },
    forecast: {
      h1: isFiniteNumber(remote.forecast?.h1) ? remote.forecast!.h1 : local.forecast.h1,
      h2: isFiniteNumber(remote.forecast?.h2) ? remote.forecast!.h2 : local.forecast.h2,
      h3: isFiniteNumber(remote.forecast?.h3) ? remote.forecast!.h3 : local.forecast.h3,
      prob_over_threshold: isFiniteNumber(remote.forecast?.prob_over_threshold)
        ? clamp(remote.forecast!.prob_over_threshold, 0, 1)
        : local.forecast.prob_over_threshold,
      threshold: isFiniteNumber(remote.forecast?.threshold)
        ? Math.max(1, remote.forecast!.threshold)
        : local.forecast.threshold,
    },
    exposure: {
      exposure_1h: isFiniteNumber(remote.exposure?.exposure_1h) ? Math.max(0, remote.exposure!.exposure_1h) : local.exposure.exposure_1h,
      exposure_6h: isFiniteNumber(remote.exposure?.exposure_6h) ? Math.max(0, remote.exposure!.exposure_6h) : local.exposure.exposure_6h,
      exposure_24h: isFiniteNumber(remote.exposure?.exposure_24h) ? Math.max(0, remote.exposure!.exposure_24h) : local.exposure.exposure_24h,
      avg_1h: isFiniteNumber(remote.exposure?.avg_1h) ? Math.max(0, remote.exposure!.avg_1h) : local.exposure.avg_1h,
      avg_6h: isFiniteNumber(remote.exposure?.avg_6h) ? Math.max(0, remote.exposure!.avg_6h) : local.exposure.avg_6h,
      avg_24h: isFiniteNumber(remote.exposure?.avg_24h) ? Math.max(0, remote.exposure!.avg_24h) : local.exposure.avg_24h,
    },
    moving_averages: {
      ma_5m: isFiniteNumber(remote.moving_averages?.ma_5m) ? Math.max(0, remote.moving_averages!.ma_5m) : local.moving_averages.ma_5m,
      ma_15m: isFiniteNumber(remote.moving_averages?.ma_15m) ? Math.max(0, remote.moving_averages!.ma_15m) : local.moving_averages.ma_15m,
      ma_60m: isFiniteNumber(remote.moving_averages?.ma_60m) ? Math.max(0, remote.moving_averages!.ma_60m) : local.moving_averages.ma_60m,
    },
    adaptive_threshold: {
      adaptive_threshold: isFiniteNumber(remote.adaptive_threshold?.adaptive_threshold)
        ? Math.max(1, remote.adaptive_threshold!.adaptive_threshold)
        : local.adaptive_threshold.adaptive_threshold,
      method: typeof remote.adaptive_threshold?.method === 'string' ? remote.adaptive_threshold!.method : local.adaptive_threshold.method,
    },
    data_quality: {
      samples: isFiniteNumber(remote.data_quality?.samples) ? Math.max(0, Math.round(remote.data_quality!.samples)) : local.data_quality.samples,
      last_gap_s: isFiniteNumber(remote.data_quality?.last_gap_s) ? Math.max(0, remote.data_quality!.last_gap_s) : local.data_quality.last_gap_s,
      sample_rate_min: isFiniteNumber(remote.data_quality?.sample_rate_min)
        ? Math.max(0, remote.data_quality!.sample_rate_min)
        : local.data_quality.sample_rate_min,
    },
    recovery: {
      recovery_index: isFiniteNumber(remote.recovery?.recovery_index) ? clamp(remote.recovery!.recovery_index, 0, 100) : local.recovery.recovery_index,
      time_since_peak_h: isFiniteNumber(remote.recovery?.time_since_peak_h) ? Math.max(0, remote.recovery!.time_since_peak_h) : local.recovery.time_since_peak_h,
      time_since_above_threshold_h: isFiniteNumber(remote.recovery?.time_since_above_threshold_h)
        ? Math.max(0, remote.recovery!.time_since_above_threshold_h)
        : local.recovery.time_since_above_threshold_h,
      recovery_stage: typeof remote.recovery?.recovery_stage === 'string' ? remote.recovery!.recovery_stage : local.recovery.recovery_stage,
      fatigue_score: isFiniteNumber(remote.recovery?.fatigue_score) ? clamp(remote.recovery!.fatigue_score, 0, 100) : local.recovery.fatigue_score,
    },
    ess: isFiniteNumber(remote.ess) ? clamp(remote.ess, 0, 100) : local.ess,
    source: {
      label: typeof remote.source?.label === 'string' ? remote.source!.label : local.source.label,
      confidence: isFiniteNumber(remote.source?.confidence) ? clamp(remote.source!.confidence, 0, 1) : local.source.confidence,
    },
    vulnerability: {
      score: isFiniteNumber(remote.vulnerability?.score) ? clamp(remote.vulnerability!.score, 0, 100) : local.vulnerability.score,
      level: typeof remote.vulnerability?.level === 'string' ? (remote.vulnerability!.level as AIAnalysis['vulnerability']['level']) : local.vulnerability.level,
    },
    advisory: Array.isArray(remote.advisory) && remote.advisory.length > 0 ? remote.advisory : local.advisory,
  };

  const exposureEqual =
    merged.exposure.exposure_1h === merged.exposure.exposure_6h &&
    merged.exposure.exposure_6h === merged.exposure.exposure_24h;
  if (exposureEqual && local.data_quality.samples >= 20) {
    merged.exposure = local.exposure;
  }

  const likelyBelowThreshold = merged.realtime.pm25 < merged.forecast.threshold * 0.9;
  if (likelyBelowThreshold && merged.forecast.prob_over_threshold > 0.8) {
    merged.forecast.prob_over_threshold = local.forecast.prob_over_threshold;
  }

  if (merged.source.label === 'unknown' || merged.source.confidence < 0.45) {
    merged.source = local.source;
  }

  return merged;
};

export const useAiInsights = (history: SensorData[], currentData: SensorData) => {
  const [data, setData] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = useMemo(() => computeLocalInsights(history, currentData), [history, currentData]);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(AI_INSIGHTS_URL);
      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const json = (await res.json()) as Partial<AIAnalysis>;
      setData(normalizeAi(json, local));
    } catch (err: any) {
      setError(err?.message || 'Errore AI');
      setData(local);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [local]);

  return { data, loading, error, refetch: fetchInsights };
};
