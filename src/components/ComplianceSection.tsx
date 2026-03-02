const ComplianceSection = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Compliance & Guidelines</h3>
        <p className="text-sm text-muted-foreground">Riferimenti WHO e best practice operative.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">WHO PM2.5 24h</p>
          <p className="text-2xl font-bold mt-2">15 µg/m³</p>
          <p className="text-xs text-muted-foreground mt-2">Linee guida OMS 2021</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">WHO PM10 24h</p>
          <p className="text-2xl font-bold mt-2">45 µg/m³</p>
          <p className="text-xs text-muted-foreground mt-2">Linee guida OMS 2021</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Alerting</p>
          <p className="text-2xl font-bold mt-2">Dynamic</p>
          <p className="text-xs text-muted-foreground mt-2">Soglie adattive + probabilità</p>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h4 className="text-sm font-semibold mb-2">Operational Guidelines</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>Evitare esposizione prolungata sopra soglia OMS.</li>
          <li>Programmare attività outdoor nei periodi a rischio più basso.</li>
          <li>Usare filtri e ventilazione controllata nelle ore critiche.</li>
        </ul>
      </div>
    </div>
  );
};

export default ComplianceSection;
