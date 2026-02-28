import { motion } from 'framer-motion';
import { Flame, Wind, Home, AlertTriangle } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';

const labelMap: Record<string, { label: string; icon: any; color: string }> = {
  combustion_dominant: { label: 'Combustione/Traffico', icon: Flame, color: 'text-air-dangerous' },
  coarse_particle: { label: 'Polveri/vento', icon: Wind, color: 'text-air-moderate' },
  indoor_activity: { label: 'Attività indoor', icon: Home, color: 'text-air-unhealthy' },
  background_elevation: { label: 'Fondo elevato', icon: Wind, color: 'text-air-good' },
  anomalous_spike: { label: 'Picco anomalo', icon: AlertTriangle, color: 'text-air-dangerous' },
  unknown: { label: 'Non determinato', icon: AlertTriangle, color: 'text-muted-foreground' },
};

const SourceSection = () => {
  const { data } = useAiInsights();
  const source = data?.source || { label: 'unknown', confidence: 0 };
  const meta = labelMap[source.label] || labelMap.unknown;
  const Icon = meta.icon;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <Icon className={`w-6 h-6 ${meta.color}`} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">Source Pattern Classifier</h2>
          <p className="text-sm text-muted-foreground">Classificazione della fonte del particolato</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center gap-3">
          <Icon className={`w-8 h-8 ${meta.color}`} />
          <div>
            <p className="text-sm text-muted-foreground">Sorgente probabile</p>
            <p className="text-2xl font-bold">{meta.label}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Confidenza</p>
            <p className="text-lg font-semibold">{Math.round((source.confidence || 0) * 100)}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">Rapporto PM2.5/PM10</p>
          <p className="text-xl font-bold">{data?.realtime.ratio.toFixed(2) ?? '--'}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">Trend (µg/m³/h)</p>
          <p className="text-xl font-bold">{data?.realtime.trend.toFixed(1) ?? '--'}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">Volatilità</p>
          <p className="text-xl font-bold">{data?.realtime.volatility.toFixed(2) ?? '--'}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground">PM2.5 attuale</p>
          <p className="text-xl font-bold">{data?.realtime.pm25.toFixed(1) ?? '--'}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default SourceSection;
