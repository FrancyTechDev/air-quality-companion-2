import { useAiInsights } from '@/hooks/useAiInsights';

const DatasetSection = () => {
  const { data } = useAiInsights();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Dataset Intelligence</h3>
        <p className="text-sm text-muted-foreground">Panoramica qualità, densità e copertura temporale.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Samples</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.samples ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-2">Campioni nell’ultima finestra</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Sample Rate</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.sample_rate_min ?? 0}/min</p>
          <p className="text-xs text-muted-foreground mt-2">Frequenza effettiva</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Last Gap</p>
          <p className="text-2xl font-bold mt-2">{data?.data_quality.last_gap_s ?? '--'}s</p>
          <p className="text-xs text-muted-foreground mt-2">Interruzione più recente</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h4 className="text-sm font-semibold mb-2">Data Strategy</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>Normalizzazione valori su bucket da 10 minuti per training.</li>
          <li>Outlier handling con quantili dinamici.</li>
          <li>Rolling feature per pattern giornalieri e settimanali.</li>
        </ul>
      </div>
    </div>
  );
};

export default DatasetSection;
