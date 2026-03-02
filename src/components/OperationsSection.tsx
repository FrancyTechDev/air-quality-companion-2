import { useSensorData } from '@/hooks/useSensorData';

const OperationsSection = () => {
  const { isConnected, history } = useSensorData();
  const last = history[history.length - 1];

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Operations Center</h3>
        <p className="text-sm text-muted-foreground">Stato rete sensori e continuità servizio.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Connessione</p>
          <p className="text-2xl font-bold mt-2">{isConnected ? 'Online' : 'Offline'}</p>
          <p className="text-xs text-muted-foreground mt-2">Ultimo campione: {last?.timestamp?.toISOString?.() ?? '--'}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Buffer storico</p>
          <p className="text-2xl font-bold mt-2">{history.length}</p>
          <p className="text-xs text-muted-foreground mt-2">Max 500 campioni in memoria</p>
        </div>
      </div>
    </div>
  );
};

export default OperationsSection;
