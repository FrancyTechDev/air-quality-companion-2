import { motion } from 'framer-motion';
import { FileText, Download } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const ReportSection = () => {
  const { data } = useAiInsights();
  const reportRef = useRef<HTMLDivElement>(null);

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#0b0f14' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, width, height);
    pdf.save('report-ai-airwatch.pdf');
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

      <div ref={reportRef} className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">AirWatch – Report Completo</h3>
          <span className="text-xs text-muted-foreground">Generato automaticamente</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">ESS</p>
            <p className="text-2xl font-bold">{data?.ess ?? '--'}</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Prob. soglia</p>
            <p className="text-2xl font-bold">{Math.round((data?.forecast.prob_over_threshold ?? 0) * 100)}%</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Soglia adattiva</p>
            <p className="text-2xl font-bold">{data?.adaptive_threshold.adaptive_threshold ?? '--'} µg/m³</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Sorgente</p>
            <p className="text-lg font-semibold">{data?.source.label ?? '--'} ({Math.round((data?.source.confidence ?? 0) * 100)}%)</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Exposure 1h</p>
            <p className="text-lg font-semibold">{data?.exposure.exposure_1h.toFixed(2) ?? '--'}</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Exposure 6h</p>
            <p className="text-lg font-semibold">{data?.exposure.exposure_6h.toFixed(2) ?? '--'}</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card/60">
            <p className="text-xs text-muted-foreground">Exposure 24h</p>
            <p className="text-lg font-semibold">{data?.exposure.exposure_24h.toFixed(2) ?? '--'}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60">
          <p className="text-sm text-muted-foreground mb-2">Raccomandazioni</p>
          <ul className="space-y-2">
            {(data?.advisory ?? []).map((a, i) => (
              <li key={i} className="text-sm">• {a}</li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
};

export default ReportSection;
