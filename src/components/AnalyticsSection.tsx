import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import { BarChart3, TrendingUp, Clock, Download } from 'lucide-react';
import { SensorData, getAirQualityInfo } from '@/lib/airQuality';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface AnalyticsSectionProps {
  history: SensorData[];
  currentData: SensorData;
}

const AnalyticsSection = ({ history, currentData }: AnalyticsSectionProps) => {
  const chartData = useMemo(() => {
    return history.slice(-30).map((d) => {
      const date = d.timestamp instanceof Date ? d.timestamp : new Date(d.timestamp);
      return {
        time: format(date, 'HH:mm:ss'),
        fullDate: format(date, 'dd/MM/yyyy HH:mm:ss'),
        pm25: d.pm25,
        pm10: d.pm10
      };
    });
  }, [history]);

  const downloadCSV = () => {
    if (history.length === 0) return;

    const headers = ['Data e Ora', 'PM2.5 (ug/m3)', 'PM10 (ug/m3)', 'Latitudine', 'Longitudine'];
    const rows = history.map(d => {
      const date = d.timestamp instanceof Date ? d.timestamp : new Date(d.timestamp);
      return [
        format(date, 'dd/MM/yyyy HH:mm:ss'),
        d.pm25,
        d.pm10,
        d.lat || '',
        d.lng || ''
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `air_quality_history_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const averages = useMemo(() => {
    if (history.length === 0) return { pm25: 0, pm10: 0 };
    const sum = history.reduce(
      (acc, d) => ({ pm25: acc.pm25 + d.pm25, pm10: acc.pm10 + d.pm10 }),
      { pm25: 0, pm10: 0 }
    );
    return {
      pm25: Math.round(sum.pm25 / history.length * 10) / 10,
      pm10: Math.round(sum.pm10 / history.length * 10) / 10
    };
  }, [history]);

  const airQuality = getAirQualityInfo(currentData.pm25);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gradient">Analytics Dashboard</h2>
            <p className="text-sm text-muted-foreground">Analisi storica della qualità dell'aria</p>
          </div>
        </div>
        <Button 
          onClick={downloadCSV}
          variant="outline" 
          className="gap-2 hover-elevate"
          disabled={history.length === 0}
        >
          <Download className="w-4 h-4" />
          Esporta CSV
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">PM2.5 Attuale</p>
          <p className="text-2xl font-bold" style={{ color: airQuality.color }}>
            {currentData.pm25}
          </p>
          <p className="text-xs text-muted-foreground mt-1">µg/m³</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">PM10 Attuale</p>
          <p className="text-2xl font-bold text-secondary">
            {currentData.pm10}
          </p>
          <p className="text-xs text-muted-foreground mt-1">µg/m³</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Media PM2.5</p>
          <p className="text-2xl font-bold text-foreground">
            {averages.pm25}
          </p>
          <p className="text-xs text-muted-foreground mt-1">µg/m³</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Media PM10</p>
          <p className="text-2xl font-bold text-foreground">
            {averages.pm10}
          </p>
          <p className="text-xs text-muted-foreground mt-1">µg/m³</p>
        </div>
      </div>

      {/* Real-time Chart */}
      <div className="chart-container">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">PM2.5 Real-time</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Ultimi 30 punti</span>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pm25Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(190, 95%, 50%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(190, 95%, 50%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="p-3 border rounded-xl bg-card border-border shadow-xl">
                      <p className="mb-2 text-sm font-medium text-foreground">
                        {payload[0].payload.fullDate}
                      </p>
                      {payload.map((entry, idx) => (
                        <p key={idx} className="text-sm" style={{ color: entry.color }}>
                          {entry.name}: <span className="font-bold">{entry.value}</span> µg/m³
                        </p>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Area
              type="monotone"
              dataKey="pm25"
              stroke="hsl(190, 95%, 50%)"
              strokeWidth={2}
              fill="url(#pm25Gradient)"
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison Chart */}
      <div className="chart-container">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-secondary" />
          <h3 className="font-semibold">Confronto PM2.5 vs PM10</h3>
        </div>
        
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.75rem'
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="pm25"
              name="PM2.5"
              stroke="hsl(190, 95%, 50%)"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
            />
            <Line
              type="monotone"
              dataKey="pm10"
              name="PM10"
              stroke="hsl(260, 60%, 55%)"
              strokeWidth={2}
              dot={false}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default AnalyticsSection;
