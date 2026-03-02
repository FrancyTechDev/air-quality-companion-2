import { useSensorData } from '@/hooks/useSensorData';

const MobilitySection = () => {
  const { history } = useSensorData();
  const recent = history.slice(-50);
  const movingPoints = recent.filter(d => d.lat && d.lng).length;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Mobility & Route Intelligence</h3>
        <p className="text-sm text-muted-foreground">Analisi movimento e contaminazione lungo il percorso.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Punti con GPS</p>
          <p className="text-2xl font-bold mt-2">{movingPoints}</p>
          <p className="text-xs text-muted-foreground mt-2">Ultimi 50 campioni</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Insight</p>
          <p className="text-sm font-semibold mt-2">Percorsi ad alta esposizione identificati</p>
          <p className="text-xs text-muted-foreground mt-2">Integrare heatmap dinamica per routing</p>
        </div>
      </div>
    </div>
  );
};

export default MobilitySection;
