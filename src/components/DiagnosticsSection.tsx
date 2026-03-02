import { useAiInsights } from '@/hooks/useAiInsights';

const DiagnosticsSection = () => {
  const { data } = useAiInsights();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Diagnostics</h3>
        <p className="text-sm text-muted-foreground">Debug tecnico, performance e stabilità pipeline.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Samples</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.samples ?? 0}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Last gap</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.last_gap_s ?? '--'}s</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Sample rate</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.sample_rate_min ?? 0}/min</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h4 className="text-sm font-semibold mb-2">System Notes</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>Monitorare gap superiori a 120s per evitare drift nelle previsioni.</li>
          <li>Verificare la densità dei campioni prima di training avanzati.</li>
          <li>La pipeline si adatta automaticamente in fallback.</li>
        </ul>
      </div>
    </div>
  );
};

export default DiagnosticsSection;
