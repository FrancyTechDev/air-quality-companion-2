import { useEffect, useState } from 'react';
import { AIAnalysis } from '@/lib/aiPrediction';

const AI_BASE = (import.meta as any).env?.VITE_AI_URL || window.location.origin;

export const useAiInsights = () => {
  const [data, setData] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${AI_BASE}/ai/insights`);
      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const json = (await res.json()) as AIAnalysis;
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Errore AI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  return { data, loading, error, refetch: fetchInsights };
};
