import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Clock, ActivitySquare } from 'lucide-react';
import { SensorData } from '@/lib/airQuality';
import { useAiInsights } from '@/hooks/useAiInsights';
import { format } from 'date-fns';

interface ExposureSectionProps {
  history: SensorData[];
}

const ExposureSection = ({ history }: ExposureSectionProps) => {
  const { data } = useAiInsights();

  const chartData = useMemo(() => {
    return history.slice(-120).map((d) => {
      const date = d.timestamp instanceof Date ? d.timestamp : new Date(Number(d.timestamp));
      return {
        time: format(date, 'HH:mm'),
        pm25: d.pm25,
        pm10: d.pm10,
      };
    });
  }, [history]);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <ActivitySquare className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">Exposure Engine</h2>
          <p className="text-sm text-muted-foreground">Dose cumulativa e medie temporali</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Exposure 1h</p>
          <p className="text-2xl font-bold">{data?.exposure.exposure_1h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground">µg·h/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Exposure 6h</p>
          <p className="text-2xl font-bold">{data?.exposure.exposure_6h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground">µg·h/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Exposure 24h</p>
          <p className="text-2xl font-bold">{data?.exposure.exposure_24h.toFixed(2) ?? '--'}</p>
          <p className="text-xs text-muted-foreground">µg·h/m³</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Media 1h</p>
          <p className="text-2xl font-bold">{data?.exposure.avg_1h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Media 6h</p>
          <p className="text-2xl font-bold">{data?.exposure.avg_6h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-sm text-muted-foreground">Media 24h</p>
          <p className="text-2xl font-bold">{data?.exposure.avg_24h.toFixed(1) ?? '--'} µg/m³</p>
        </div>
      </div>

      <div className="chart-container">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Trend PM (ultimi 120 punti)</h3>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="pm25" name="PM2.5" stroke="hsl(190,95%,50%)" fillOpacity={0.2} fill="hsl(190,95%,50%)" />
            <Area type="monotone" dataKey="pm10" name="PM10" stroke="hsl(260,60%,55%)" fillOpacity={0.1} fill="hsl(260,60%,55%)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default ExposureSection;
