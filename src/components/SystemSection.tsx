import { motion } from 'framer-motion';
import { Server, Database, Activity } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';

const SystemSection = () => {
  const { data } = useAiInsights();
  const quality = data?.data_quality;

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <Server className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">System Status</h2>
          <p className="text-sm text-muted-foreground">Qualità dati e stabilità pipeline</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Campioni disponibili</p>
          </div>
          <p className="text-2xl font-bold">{quality?.samples ?? '--'}</p>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Intervallo ultimo campione</p>
          </div>
          <p className="text-2xl font-bold">{quality?.last_gap_s ?? '--'} s</p>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <p className="text-sm text-muted-foreground">Frequenza campioni</p>
          </div>
          <p className="text-2xl font-bold">{quality?.sample_rate_min ?? '--'} /min</p>
        </div>
      </div>
    </motion.div>
  );
};

export default SystemSection;
