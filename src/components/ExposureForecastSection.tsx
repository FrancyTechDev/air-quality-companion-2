import { useAiInsights } from '@/hooks/useAiInsights';

const ExposureForecastSection = () => {
  const { data } = useAiInsights();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Exposure Forecast Engine</h3>
        <p className="text-sm text-muted-foreground">Previsione cumulativa su 1h/6h/24h con rischio anticipato.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Exposure 1h</p>
          <p className="text-2xl font-bold mt-2">{data?.exposure.exposure_1h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground mt-2">Media 1h: {data?.exposure.avg_1h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Exposure 6h</p>
          <p className="text-2xl font-bold mt-2">{data?.exposure.exposure_6h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground mt-2">Media 6h: {data?.exposure.avg_6h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-xs text-muted-foreground">Exposure 24h</p>
          <p className="text-2xl font-bold mt-2">{data?.exposure.exposure_24h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground mt-2">Media 24h: {data?.exposure.avg_24h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
      </div>
    </div>
  );
};

export default ExposureForecastSection;
