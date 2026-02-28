import { motion } from 'framer-motion';
import { FileText, Download } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';
import { Button } from '@/components/ui/button';

const ReportSection = () => {
  const { data } = useAiInsights();

  const exportPdf = () => {
    window.print();
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gradient">Report AI</h2>
          <p className="text-sm text-muted-foreground">Sintesi tecnica e raccomandazioni</p>
        </div>
        <Button className="ml-auto gap-2" onClick={exportPdf}>
          <Download className="w-4 h-4" />
          Esporta PDF
        </Button>
      </div>

      <div className="glass-panel p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Sintesi</p>
        <p className="text-lg font-semibold">ESS: {data?.ess ?? '--'} · Prob. soglia: {Math.round((data?.forecast.prob_over_threshold ?? 0) * 100)}%</p>
        <p className="text-sm">Sorgente: {data?.source.label ?? '--'} ({Math.round((data?.source.confidence ?? 0) * 100)}%)</p>
        <p className="text-sm">Exposure 24h: {data?.exposure.exposure_24h.toFixed(2) ?? '--'} µg·h/m³</p>
      </div>

      <div className="glass-panel p-6">
        <p className="text-sm text-muted-foreground mb-2">Raccomandazioni</p>
        <ul className="space-y-2">
          {(data?.advisory ?? []).map((a, i) => (
            <li key={i} className="text-sm">• {a}</li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
};

export default ReportSection;
