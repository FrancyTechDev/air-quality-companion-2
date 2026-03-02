import { motion } from 'framer-motion';
import { FileText, Download } from 'lucide-react';
import { useAiInsights } from '@/hooks/useAiInsights';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useSensorData } from '@/hooks/useSensorData';

const ReportSection = () => {
  const { data } = useAiInsights();
  const { history, currentData } = useSensorData();
  const reportRef = useRef<HTMLDivElement>(null);

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const pages = Array.from(reportRef.current.querySelectorAll('[data-report-page]')) as HTMLDivElement[];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
    const width = pdf.internal.pageSize.getWidth();
    const stamp = new Date();
    const stampText = stamp.toISOString().replace('T', ' ').slice(0, 19);

    const exportPages = pages.length > 0 ? pages : [reportRef.current];

    for (let i = 0; i < exportPages.length; i++) {
      const canvas = await html2canvas(exportPages[i], { scale: 2, backgroundColor: '#0b0f14' });
      const imgData = canvas.toDataURL('image/png');
      const height = (canvas.height * width) / canvas.width;
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.setTextColor(180);
      pdf.setFontSize(9);
      pdf.text(`AirWatch Report • ${stampText}`, 12, height - 10);
    }

    const filename = `report-ai-airwatch-${stamp.toISOString().replace(/[:.]/g, '-')}.pdf`;
    pdf.save(filename);
  };

  const lastSamples = history.slice(-20).reverse();
  const lastSample = history[history.length - 1];
  const avgPm25 = history.length > 0 ? history.reduce((acc, d) => acc + d.pm25, 0) / history.length : 0;
  const maxPm25 = history.length > 0 ? Math.max(...history.map(d => d.pm25)) : 0;
  const avgPm10 = history.length > 0 ? history.reduce((acc, d) => acc + d.pm10, 0) / history.length : 0;
  const maxPm10 = history.length > 0 ? Math.max(...history.map(d => d.pm10)) : 0;
  const trendLabel = data?.realtime.trend
    ? data.realtime.trend > 0.2 ? 'In aumento' : data.realtime.trend < -0.2 ? 'In diminuzione' : 'Stabile'
    : 'Stabile';
  const clinicalSummary = `Livello PM2.5 medio ${avgPm25.toFixed(1)} µg/m³, picco ${maxPm25.toFixed(1)} µg/m³. Trend ${trendLabel}.`;

  const Page = ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-report-page className="glass-panel p-8 space-y-6" style={{ minHeight: 1120 }}>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">AirWatch Clinical Report</span>
      </div>
      {children}
    </div>
  );

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

      <div ref={reportRef} className="space-y-6">
        <Page title="Pagina 1 — Executive Summary">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Node ID</p>
              <p className="text-lg font-semibold">node-01</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Ultimo campione</p>
              <p className="text-sm font-semibold">{lastSample?.timestamp?.toISOString?.() ?? '--'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">PM2.5 attuale</p>
              <p className="text-2xl font-bold">{currentData.pm25.toFixed(1)} µg/m³</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">PM10 attuale</p>
              <p className="text-2xl font-bold">{currentData.pm10.toFixed(1)} µg/m³</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">ESS</p>
              <p className="text-2xl font-bold">{data?.ess ?? '--'}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Prob. soglia</p>
              <p className="text-2xl font-bold">{Math.round((data?.forecast.prob_over_threshold ?? 0) * 100)}%</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Soglia adattiva</p>
              <p className="text-2xl font-bold">{data?.adaptive_threshold.adaptive_threshold ?? '--'} µg/m³</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold mb-2">Impression Clinica</p>
            <p className="text-sm text-muted-foreground">{clinicalSummary}</p>
          </div>
        </Page>

        <Page title="Pagina 2 — Exposure Engine">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Exposure 1h</p>
              <p className="text-lg font-semibold">{data?.exposure.exposure_1h.toFixed(2) ?? '--'}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Exposure 6h</p>
              <p className="text-lg font-semibold">{data?.exposure.exposure_6h.toFixed(2) ?? '--'}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Exposure 24h</p>
              <p className="text-lg font-semibold">{data?.exposure.exposure_24h.toFixed(2) ?? '--'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Media PM2.5</p>
              <p className="text-lg font-semibold">{avgPm25.toFixed(1)} µg/m³</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Picco PM2.5</p>
              <p className="text-lg font-semibold">{maxPm25.toFixed(1)} µg/m³</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Note Cliniche</p>
            <p className="text-sm text-muted-foreground">
              L’esposizione cumulativa integra i livelli PM2.5 sulle ultime finestre temporali, utile per valutare il rischio acuto.
            </p>
          </div>
        </Page>

        <Page title="Pagina 3 — Forecast Clinico">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">+1h</p>
              <p className="text-lg font-semibold">{data?.forecast.h1 ?? '--'} µg/m³</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">+2h</p>
              <p className="text-lg font-semibold">{data?.forecast.h2 ?? '--'} µg/m³</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">+3h</p>
              <p className="text-lg font-semibold">{data?.forecast.h3 ?? '--'} µg/m³</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Trend</p>
              <p className="text-lg font-semibold">{trendLabel}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Prob. sopra soglia</p>
              <p className="text-lg font-semibold">{Math.round((data?.forecast.prob_over_threshold ?? 0) * 100)}%</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Interpretazione</p>
            <p className="text-sm text-muted-foreground">
              Le previsioni multi-step indicano il rischio di superamento soglia OMS nelle prossime ore.
            </p>
          </div>
        </Page>

        <Page title="Pagina 4 — NeuroHealth">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Rischio Neuro</p>
              <p className="text-lg font-semibold">{data?.ess ?? '--'} / 100</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Trend neurologico</p>
              <p className="text-lg font-semibold">{trendLabel}</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Interpretazione</p>
            <p className="text-sm text-muted-foreground">
              L’algoritmo utilizza l’esposizione recente e la volatilità per stimare il rischio acuto neurologico.
            </p>
          </div>
        </Page>

        <Page title="Pagina 5 — Raccomandazioni Cliniche">
          <ul className="space-y-2">
            {(data?.advisory ?? []).map((a, i) => (
              <li key={i} className="text-sm">• {a}</li>
            ))}
          </ul>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Note operative</p>
            <p className="text-sm text-muted-foreground">
              Le raccomandazioni sono adattive e aggiornate in base ai trend previsionali e alla soglia dinamica.
            </p>
          </div>
        </Page>

        <Page title="Pagina 6 — Qualità Dati">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Samples</p>
              <p className="text-lg font-semibold">{data?.data_quality.samples ?? '--'}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Last gap</p>
              <p className="text-lg font-semibold">{data?.data_quality.last_gap_s ?? '--'}s</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Sample rate</p>
              <p className="text-lg font-semibold">{data?.data_quality.sample_rate_min ?? '--'}/min</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Stabilità</p>
            <p className="text-sm text-muted-foreground">
              I gap superiori a 120s possono ridurre l’accuratezza dei modelli previsionali.
            </p>
          </div>
        </Page>

        <Page title="Pagina 7 — Source Pattern">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Sorgente probabile</p>
              <p className="text-lg font-semibold">{data?.source.label ?? '--'}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">Confidenza</p>
              <p className="text-lg font-semibold">{Math.round((data?.source.confidence ?? 0) * 100)}%</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">Interpretazione</p>
            <p className="text-sm text-muted-foreground">
              La classificazione si basa su rapporto PM2.5/PM10, velocità variazione e durata eventi.
            </p>
          </div>
        </Page>

        <Page title="Pagina 8 — Raw Data Snapshot">
          <div className="space-y-2">
            {lastSamples.map((s, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                {s.timestamp.toISOString()} · PM2.5 {s.pm25.toFixed(1)} · PM10 {s.pm10.toFixed(1)}
              </div>
            ))}
          </div>
        </Page>

        <Page title="Pagina 9 — Metodologia & Limiti">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Le previsioni sono basate su modelli storici e trend recenti.</li>
            <li>La soglia OMS è usata come riferimento clinico.</li>
            <li>Le raccomandazioni non sostituiscono parere medico.</li>
            <li>La precisione dipende dalla qualità dei dati e dall’aderenza a pattern storici.</li>
          </ul>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">PM10 medio</p>
              <p className="text-lg font-semibold">{avgPm10.toFixed(1)} µg/m³</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60">
              <p className="text-xs text-muted-foreground">PM10 picco</p>
              <p className="text-lg font-semibold">{maxPm10.toFixed(1)} µg/m³</p>
            </div>
          </div>
        </Page>
      </div>
    </motion.div>
  );
};

export default ReportSection;
