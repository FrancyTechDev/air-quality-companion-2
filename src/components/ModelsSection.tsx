const ModelsSection = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Model Registry</h3>
        <p className="text-sm text-muted-foreground">Catalogo modelli attivi e roadmap di training.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Forecast Model</p>
          <p className="text-xl font-bold mt-2">XGBoost Multi-Step</p>
          <p className="text-xs text-muted-foreground mt-2">Input: lag, rolling mean, hour/day, trend</p>
          <p className="text-xs text-muted-foreground mt-2">Output: +1h/+3h/+6h + intervalli</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Source Classifier</p>
          <p className="text-xl font-bold mt-2">PatternNet v2</p>
          <p className="text-xs text-muted-foreground mt-2">Input: ratio PM1/PM2.5/PM10, spike, durata</p>
          <p className="text-xs text-muted-foreground mt-2">Output: label + confidence</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Exposure Engine</p>
          <p className="text-xl font-bold mt-2">Dose Forecast</p>
          <p className="text-xs text-muted-foreground mt-2">Stima cumulativa 1h/6h/24h</p>
          <p className="text-xs text-muted-foreground mt-2">Allarmi preventivi</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">NeuroHealth Model</p>
          <p className="text-xl font-bold mt-2">Acute Window 6h</p>
          <p className="text-xs text-muted-foreground mt-2">Calibrazione su finestra recente</p>
          <p className="text-xs text-muted-foreground mt-2">Reset automatico post-evento</p>
        </div>
      </div>
    </div>
  );
};

export default ModelsSection;
