import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Activity } from 'lucide-react';
import { SensorData } from '@/lib/airQuality';
import { format } from 'date-fns';

interface RiskTimelineSectionProps {
  history: SensorData[];
}

const RiskTimelineSection = ({ history }: RiskTimelineSectionProps) => {
  const data = history.slice(-180).map((d) => {
    const date = d.timestamp instanceof Date ? d.timestamp : new Date(Number(d.timestamp));
    const pm25 = d.pm25;
    const ess = Math.min(100, Math.max(0, (pm25 / 150) * 100));
    return {
      time: format(date, 'HH:mm'),
      pm25,
      ess,
    };
  });

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <Activity className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">Risk Timeline</h2>
          <p className="text-sm text-muted-foreground">Evoluzione rischio e PM2.5</p>
        </div>
      </div>

      <div className="chart-container">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">ESS vs PM2.5</h3>
          <span className="text-xs text-muted-foreground">Ultimi 180 punti</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="pm25" name="PM2.5" stroke="hsl(190,95%,50%)" fillOpacity={0.15} fill="hsl(190,95%,50%)" />
            <Area type="monotone" dataKey="ess" name="ESS" stroke="hsl(280,70%,60%)" fillOpacity={0.12} fill="hsl(280,70%,60%)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default RiskTimelineSection;
