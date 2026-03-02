import { SensorData } from '@/lib/airQuality';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RawDataSectionProps {
  history: SensorData[];
}

const RawDataSection = ({ history }: RawDataSectionProps) => {
  const recent = history.slice(-200).reverse();
  const jsonSample = recent.slice(0, 20).map(item => ({
    pm25: item.pm25,
    pm10: item.pm10,
    lat: item.lat,
    lng: item.lng,
    timestamp: item.timestamp.toISOString()
  }));

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">Raw Data Stream</h3>
        <p className="text-sm text-muted-foreground">Ultimi 200 campioni con timestamp e coordinate.</p>
        <div className="mt-4 max-h-[420px] overflow-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>PM2.5</TableHead>
                <TableHead>PM10</TableHead>
                <TableHead>Lat</TableHead>
                <TableHead>Lng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs text-muted-foreground">{row.timestamp.toISOString()}</TableCell>
                  <TableCell>{row.pm25.toFixed(1)}</TableCell>
                  <TableCell>{row.pm10.toFixed(1)}</TableCell>
                  <TableCell className="text-xs">{row.lat?.toFixed(4) ?? '--'}</TableCell>
                  <TableCell className="text-xs">{row.lng?.toFixed(4) ?? '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold mb-2">JSON Sample</h3>
        <p className="text-sm text-muted-foreground mb-4">Estratto tecnico per debugging o integrazioni.</p>
        <pre className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs overflow-auto custom-scrollbar">
          {JSON.stringify(jsonSample, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default RawDataSection;
