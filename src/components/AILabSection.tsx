import { useAiInsights } from '@/hooks/useAiInsights';
import { Badge } from '@/components/ui/badge';

const AILabSection = () => {
  const { data, loading, error, refetch } = useAiInsights();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Lab Control Room</h3>
          <p className="text-sm text-muted-foreground">Stato modelli, qualità dati, suggerimenti operativi.</p>
        </div>
        <button className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm" onClick={refetch}>
          Aggiorna
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Model Status</p>
          <p className="text-2xl font-bold mt-2">{loading ? '...' : error ? 'Degraded' : 'Operational'}</p>
          <p className="text-xs text-muted-foreground mt-2">Pipeline: Forecast + Exposure + Source</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Data Quality</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.samples ?? 0} campioni</p>
          <p className="text-xs text-muted-foreground mt-2">Gap ultimo: {data?.data_quality.last_gap_s ?? '--'}s</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">ESS</p>
          <p className="text-2xl font-bold mt-2">{data?.ess ?? '--'}</p>
          <p className="text-xs text-muted-foreground mt-2">Stress ambientale stimato</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h4 className="text-sm font-semibold mb-3">AI Signals</h4>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Trend PM2.5: {data?.realtime.trend?.toFixed?.(2) ?? '--'}</Badge>
          <Badge variant="secondary">Volatilità: {data?.realtime.volatility?.toFixed?.(2) ?? '--'}</Badge>
          <Badge variant="secondary">Soglia adattiva: {data?.adaptive_threshold.adaptive_threshold ?? '--'} µg/m³</Badge>
          <Badge variant="secondary">Fonte: {data?.source.label ?? 'unknown'}</Badge>
        </div>
      </div>
    </div>
  );
};

export default AILabSection;
