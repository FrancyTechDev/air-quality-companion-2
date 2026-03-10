import { motion } from 'framer-motion';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SensorData } from '@/lib/airQuality';
import { AIAnalysis } from '@/lib/aiPrediction';

interface ReportSectionProps {
  data: AIAnalysis | null;
  history: SensorData[];
  currentData: SensorData;
}

const ReportSection = ({ data, history, currentData }: ReportSectionProps) => {
  const reportRef = useRef<HTMLDivElement>(null);

  const exportPdf = async () => {
    const fmt = (value: number | undefined | null, digits = 1) =>
      typeof value === 'number' ? value.toFixed(digits) : '--';
    const fmtPct = (value: number | undefined | null) =>
      typeof value === 'number' ? `${Math.round(value * 100)}%` : '--';

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const marginX = 36;
    let cursorY = 48;
    const stamp = new Date();
    const stampText = stamp.toISOString().replace('T', ' ').slice(0, 19);

    const sectionTitle = (title: string) => {
      pdf.setFontSize(14);
      pdf.setTextColor(30);
      pdf.text(title, marginX, cursorY);
      cursorY += 16;
      pdf.setDrawColor(200);
      pdf.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += 16;
    };

    const addParagraph = (text: string) => {
      pdf.setFontSize(10);
      pdf.setTextColor(60);
      const lines = pdf.splitTextToSize(text, pageWidth - marginX * 2);
      pdf.text(lines, marginX, cursorY);
      cursorY += lines.length * 12 + 8;
    };

    const addPageIfNeeded = (space = 120) => {
      if (cursorY + space > pdf.internal.pageSize.getHeight() - 48) {
        pdf.addPage();
        cursorY = 48;
      }
    };

    pdf.setFontSize(18);
    pdf.text('AirWatch Clinical Report', marginX, cursorY);
    cursorY += 18;
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${stampText}`, marginX, cursorY);
    cursorY += 20;

    sectionTitle('Executive Summary');
    addParagraph(clinicalSummary);

    addPageIfNeeded();
    sectionTitle('Vital Metrics');
    autoTable(pdf, {
      startY: cursorY,
      head: [['Metric', 'Value']],
      body: [
        ['PM2.5 (current)', `${fmt(currentData?.pm25)} µg/m³`],
        ['PM10 (current)', `${fmt(currentData?.pm10)} µg/m³`],
        ['ESS', `${data?.ess ?? '--'}`],
        ['Prob. threshold exceed', `${fmtPct(data?.forecast?.prob_over_threshold)}`],
        ['Adaptive threshold', `${data?.adaptive_threshold?.adaptive_threshold ?? '--'} µg/m³`],
        ['Source', `${data?.source?.label ?? '--'} (${fmtPct(data?.source?.confidence)})`],
      ],
      styles: { fontSize: 9 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 20;

    addPageIfNeeded();
    sectionTitle('Exposure Engine');
    autoTable(pdf, {
      startY: cursorY,
      head: [['Window', 'Exposure', 'Average']],
      body: [
        ['1h', `${fmt(data?.exposure?.exposure_1h, 2)}`, `${fmt(data?.exposure?.avg_1h)} µg/m³`],
        ['6h', `${fmt(data?.exposure?.exposure_6h, 2)}`, `${fmt(data?.exposure?.avg_6h)} µg/m³`],
        ['24h', `${fmt(data?.exposure?.exposure_24h, 2)}`, `${fmt(data?.exposure?.avg_24h)} µg/m³`],
      ],
      styles: { fontSize: 9 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 16;

    addPageIfNeeded();
    sectionTitle('Forecast (PM2.5)');
    autoTable(pdf, {
      startY: cursorY,
      head: [['Horizon', 'Forecast']],
      body: [
        ['+1h', `${data?.forecast?.h1 ?? '--'} µg/m³`],
        ['+2h', `${data?.forecast?.h2 ?? '--'} µg/m³`],
        ['+3h', `${data?.forecast?.h3 ?? '--'} µg/m³`],
      ],
      styles: { fontSize: 9 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 16;

    addPageIfNeeded();
    sectionTitle('NeuroHealth Clinical');
    addParagraph(
      `Risk score (ESS): ${data?.ess ?? '--'} / 100. Trend: ${trendLabel}. ` +
      `Recovery index: ${data?.recovery?.recovery_index ?? '--'} (stage ${data?.recovery?.recovery_stage ?? '--'}). ` +
      'Interpretation: The model evaluates acute exposure windows and volatility; upward trends indicate higher short-term neurological risk.'
    );

    addPageIfNeeded();
    sectionTitle('Clinical Recommendations');
    const recs = (data?.advisory ?? []).map((r) => [r]);
    autoTable(pdf, {
      startY: cursorY,
      head: [['Recommendation']],
      body: recs.length > 0 ? recs : [['No recommendations available']],
      styles: { fontSize: 9 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 16;

    addPageIfNeeded();
    sectionTitle('Data Quality');
    autoTable(pdf, {
      startY: cursorY,
      head: [['Metric', 'Value']],
      body: [
        ['Samples', `${data?.data_quality?.samples ?? '--'}`],
        ['Last gap', `${data?.data_quality?.last_gap_s ?? '--'} s`],
        ['Sample rate', `${data?.data_quality?.sample_rate_min ?? '--'} / min`],
      ],
      styles: { fontSize: 9 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 16;

    addPageIfNeeded();
    sectionTitle('Raw Data (Last 20 Samples)');
    const rawRows = lastSamples.map((s) => [
      s.timestamp.toISOString(),
      s.pm25.toFixed(1),
      s.pm10.toFixed(1),
    ]);
    autoTable(pdf, {
      startY: cursorY,
      head: [['Timestamp', 'PM2.5', 'PM10']],
      body: rawRows,
      styles: { fontSize: 7 },
      margin: { left: marginX, right: marginX }
    });
    cursorY = (pdf as any).lastAutoTable.finalY + 16;

    addPageIfNeeded();
    sectionTitle('Methodology & Limits');
    addParagraph(
      'Forecasts are derived from historical patterns and recent trends. WHO thresholds are used as clinical references. '
      + 'Recommendations do not replace professional medical advice. Accuracy depends on data quality and consistency.'
    );

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
        <div className="glass-panel p-6">
          <p className="text-sm text-muted-foreground">
            Il report PDF ora viene generato in modo nativo (compatto, multipagina) e non più da screenshot del DOM.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ReportSection;
