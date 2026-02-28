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
  ess: number;
  source: { label: string; confidence: number };
  advisory: string[];
}export const getAIInsights = async (history: SensorData[]): Promise<AIAnalysis> => {
  if (history.length === 0) {
    return {
      riskLevel: 'low',
      summary: "Dati insufficienti per un'analisi AI affidabile.",
      recommendations: ['Raccogliere più campioni per attivare l’analisi.']
    };
  }

  const recent = history.slice(-24);
  const avgPm25 = recent.reduce((acc, d) => acc + d.pm25, 0) / recent.length;
  const maxPm25 = Math.max(...recent.map(d => d.pm25));

  let riskLevel: AIAnalysis['riskLevel'] = 'low';
  if (avgPm25 > 55 || maxPm25 > 150) riskLevel = 'critical';
  else if (avgPm25 > 35 || maxPm25 > 100) riskLevel = 'high';
  else if (avgPm25 > 25 || maxPm25 > 55) riskLevel = 'moderate';

  const recommendations: string[] = [];
  if (riskLevel === 'critical') {
    recommendations.push("Evitare attività all'aperto prolungate.");
    recommendations.push('Usare mascherina FFP2 se necessario uscire.');
    recommendations.push('Aerare gli ambienti in fasce con aria più pulita.');
  } else if (riskLevel === 'high') {
    recommendations.push('Limitare attività fisica intensa all’aperto.');
    recommendations.push('Monitorare i picchi nelle prossime ore.');
  } else if (riskLevel === 'moderate') {
    recommendations.push('Preferire percorsi con meno traffico.');
    recommendations.push('Ridurre esposizione nelle ore di punta.');
  } else {
    recommendations.push('Qualità accettabile, mantieni il monitoraggio.');
  }

  return {
    riskLevel,
    summary: `Analisi AI preliminare: media PM2.5 ${avgPm25.toFixed(1)} µg/m³, picco ${maxPm25.toFixed(1)} µg/m³.`,
    recommendations
  };
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




