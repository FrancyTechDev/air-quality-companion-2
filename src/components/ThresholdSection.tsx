import { motion } from 'framer-motion';
import { Target, Sliders } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';

const ThresholdSection = () => {
  const { data } = useAiInsights();
  const adaptive = data?.adaptive_threshold?.adaptive_threshold ?? null;
  const method = data?.adaptive_threshold?.method ?? '--';

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <Sliders className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">Adaptive Threshold AI</h2>
          <p className="text-sm text-muted-foreground">Soglie dinamiche basate sul comportamento reale</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center gap-3">
          <Target className="w-7 h-7 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Soglia adattiva</p>
            <p className="text-2xl font-bold">{adaptive ?? '--'} µg/m³</p>
            <p className="text-xs text-muted-foreground">Metodo: {method}</p>
          </div>
          <div className="ml-auto">
            <p className="text-xs text-muted-foreground">Soglia OMS</p>
            <p className="text-lg font-semibold">{data?.forecast.threshold ?? 15} µg/m³</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">Prob. sopra soglia</p>
          <p className="text-xl font-bold">{Math.round((data?.forecast.prob_over_threshold ?? 0) * 100)}%</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">MA 5m</p>
          <p className="text-xl font-bold">{data?.moving_averages.ma_5m.toFixed(1) ?? '--'}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">MA 60m</p>
          <p className="text-xl font-bold">{data?.moving_averages.ma_60m.toFixed(1) ?? '--'}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default ThresholdSection;
