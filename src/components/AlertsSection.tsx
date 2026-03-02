import { useAiInsights } from '@/hooks/useAiInsights';

const AlertsSection = () => {
  const { data } = useAiInsights();
  const prob = data?.forecast.prob_over_threshold ?? 0;
  const threshold = data?.forecast.threshold ?? 15;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Alerting & Early Warning</h3>
        <p className="text-sm text-muted-foreground">Sistema di notifiche preventive e soglie dinamiche.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Prob. sopra soglia</p>
          <p className="text-2xl font-bold mt-2">{Math.round(prob * 100)}%</p>
          <p className="text-xs text-muted-foreground mt-2">Soglia attiva: {threshold} µg/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Soglia adattiva</p>
          <p className="text-2xl font-bold mt-2">{data?.adaptive_threshold.adaptive_threshold ?? '--'} µg/m³</p>
          <p className="text-xs text-muted-foreground mt-2">{data?.adaptive_threshold.method ?? '--'}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Raccomandazioni</p>
          <p className="text-sm font-semibold mt-2">{data?.advisory?.[0] ?? 'Nessun alert attivo'}</p>
        </div>
      </div>
    </div>
  );
};

export default AlertsSection;
