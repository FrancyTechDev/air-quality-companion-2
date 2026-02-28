import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { SensorData } from '@/lib/airQuality';
import { generatePredictions, fetchLocalAiPredictions, PredictionResult } from '@/lib/aiPrediction';
import { format, isValid } from 'date-fns';

interface ForecastSectionProps {
  history: SensorData[];
  currentData: SensorData;
}

const ForecastSection = ({ history, currentData }: ForecastSectionProps) => {
  const [aiPredictions, setAiPredictions] = useState<PredictionResult | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (history.length < 10) return;

    fetchLocalAiPredictions().then((res) => {
      if (isMounted && res) setAiPredictions(res);
    });

    return () => {
      isMounted = false;
    };
  }, [history.length]);

  const predictions = useMemo(() => {
    return aiPredictions ?? generatePredictions(history);
  }, [aiPredictions, history]);

  const chartData = useMemo(() => {
  const toValidDate = (value: unknown): Date | null => {
    const d = value instanceof Date ? value : new Date(value as any);
    return isValid(d) ? d : null;
  };

    // Get last 10 historical points
        const historicalData = history
      .slice(-10)
      .map((d) => {
        const date = toValidDate(d.timestamp);
        if (!date) return null;
        return {
          hour: format(date, 'HH:mm'),
          pm25: d.pm25,
          pm10: d.pm10,
          type: 'historical'
        };
      })
      .filter(Boolean);

    // Add current point
    const currentDate = toValidDate(currentData.timestamp) || new Date();
    const currentPoint = {
      hour: format(currentDate, 'HH:mm'),
      pm25: currentData.pm25,
      pm10: currentData.pm10,
      type: 'current'
    };

    // Add predictions
    const predictionData = predictions.pm25Predictions.map((p, i) => {
      const predDate = new Date(currentDate.getTime() + p.hour * 60 * 60 * 1000);
      return {
        hour: format(predDate, 'HH:mm'),
        pm25Prediction: p.value,
        pm10Prediction: predictions.pm10Predictions[i]?.value,
        type: 'prediction'
      };
    });

    return [...historicalData, currentPoint, ...predictionData];
  }, [history, currentData, predictions]);

  const getTrendIcon = (trend: PredictionResult['trend']) => {
    switch (trend) {
      case 'improving': return TrendingDown;
      case 'worsening': return TrendingUp;
      default: return Minus;
    }
  };

  const getTrendColor = (trend: PredictionResult['trend']) => {
    switch (trend) {
      case 'improving': return 'text-air-excellent';
      case 'worsening': return 'text-air-dangerous';
      default: return 'text-muted-foreground';
    }
  };

  const getTrendLabel = (trend: PredictionResult['trend']) => {
    switch (trend) {
      case 'improving': return 'In Miglioramento';
      case 'worsening': return 'In Peggioramento';
      default: return 'Stabile';
    }
  };

  const TrendIcon = getTrendIcon(predictions.trend);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">AI Previsioni</h2>
          <p className="text-sm text-muted-foreground">Previsioni basate su machine learning</p>
        </div>
      </div>

      {/* Prediction Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Tendenza</span>
            <TrendIcon className={`w-5 h-5 ${getTrendColor(predictions.trend)}`} />
          </div>
          <p className={`text-2xl font-bold ${getTrendColor(predictions.trend)}`}>
            {getTrendLabel(predictions.trend)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Basato sugli ultimi 60 campioni
          </p>
        </div>

        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Confidenza</span>
            <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
              AI Model
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {predictions.confidence}%
          </p>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${predictions.confidence}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">PM2.5 in 3h</span>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {predictions.pm25Predictions[2]?.value || '--'} µg/m³
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Previsione stimata
          </p>
        </div>
      </div>

      {/* Prediction Chart */}
      <div className="chart-container">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Previsioni PM2.5 (5 ore)</h3>
          </div>
          <div className="text-xs text-muted-foreground">
            Linea tratteggiata = previsione
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <defs>
              <linearGradient id="predictionGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(190, 95%, 50%)" />
                <stop offset="100%" stopColor="hsl(260, 60%, 55%)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem'
              }}
            />
            <Legend />
            <ReferenceLine 
              y={35} 
              stroke="hsl(var(--air-unhealthy))" 
              strokeDasharray="5 5"
              label={{ 
                value: 'Soglia WHO', 
                position: 'right',
                fill: 'hsl(var(--air-unhealthy))',
                fontSize: 10
              }}
            />
            {/* Historical line */}
            <Line
              type="monotone"
              dataKey="pm25"
              name="PM2.5 Storico"
              stroke="hsl(190, 95%, 50%)"
              strokeWidth={2}
              dot={{ fill: 'hsl(190, 95%, 50%)', strokeWidth: 0, r: 4 }}
              connectNulls
            />
            {/* Prediction line */}
            <Line
              type="monotone"
              dataKey="pm25Prediction"
              name="PM2.5 Previsione"
              stroke="url(#predictionGradient)"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ fill: 'hsl(260, 60%, 55%)', strokeWidth: 0, r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* PM10 Predictions */}
      <div className="chart-container">
        <div className="flex items-center gap-2 mb-6">
          <TrendIcon className={`w-5 h-5 ${getTrendColor(predictions.trend)}`} />
          <h3 className="font-semibold">Previsioni PM10 (5 ore)</h3>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem'
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="pm10"
              name="PM10 Storico"
              stroke="hsl(260, 60%, 55%)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="pm10Prediction"
              name="PM10 Previsione"
              stroke="hsl(280, 70%, 60%)"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ fill: 'hsl(280, 70%, 60%)', strokeWidth: 0, r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default ForecastSection;

