import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Brain, Database, GitMerge, Upload } from 'lucide-react';
import {
  CsvRow,
  detectNumericColumns,
  detectTimeColumns,
  parseCsvText,
  parseTimestamp,
} from '@/utils/csv';

type CorrelationResult = {
  sensorMetric: string;
  braceletMetric: string;
  r: number;
  n: number;
};

type CsvState = {
  parsed: ParsedCsv | null;
  numericColumns: string[];
  timeColumns: string[];
};

const emptyCsvState: CsvState = { parsed: null, numericColumns: [], timeColumns: [] };

const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Errore lettura file'));
    reader.readAsText(file);
  });

const formatR = (value: number) => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(2);
};

const pearson = (x: number[], y: number[]) => {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, n };
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    const xi = x[i];
    const yi = y[i];
    sumX += xi;
    sumY += yi;
    sumXX += xi * xi;
    sumYY += yi * yi;
    sumXY += xi * yi;
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  return { r: denominator === 0 ? NaN : numerator / denominator, n };
};

const buildMatches = (
  sensorRows: CsvRow[],
  braceletRows: CsvRow[],
  sensorTime?: string,
  braceletTime?: string,
  toleranceMs?: number,
) => {
  if (!sensorTime || !braceletTime) {
    const min = Math.min(sensorRows.length, braceletRows.length);
    return Array.from({ length: min }, (_, idx) => ({
      sensor: sensorRows[idx],
      bracelet: braceletRows[idx],
    }));
  }

  const sensor = sensorRows
    .map((row) => ({ row, t: parseTimestamp(row[sensorTime] ?? '') }))
    .filter((item) => item.t !== null)
    .sort((a, b) => (a.t! - b.t!));
  const bracelet = braceletRows
    .map((row) => ({ row, t: parseTimestamp(row[braceletTime] ?? '') }))
    .filter((item) => item.t !== null)
    .sort((a, b) => (a.t! - b.t!));

  const matches: { sensor: CsvRow; bracelet: CsvRow }[] = [];
  let j = 0;
  const tolerance = toleranceMs ?? 5 * 60 * 1000;

  for (let i = 0; i < sensor.length; i += 1) {
    const target = sensor[i];
    while (j < bracelet.length - 1 && bracelet[j + 1].t! <= target.t!) {
      j += 1;
    }
    const candidates = [bracelet[j], bracelet[j + 1]].filter(Boolean) as typeof bracelet;
    let best: (typeof bracelet)[number] | null = null;
    let bestDiff = Infinity;
    candidates.forEach((cand) => {
      const diff = Math.abs((cand.t ?? 0) - (target.t ?? 0));
      if (diff < bestDiff) {
        best = cand;
        bestDiff = diff;
      }
    });
    if (best && bestDiff <= tolerance) {
      matches.push({ sensor: target.row, bracelet: best.row });
    }
  }

  return matches;
};

const extractSeries = (matches: { sensor: CsvRow; bracelet: CsvRow }[], sensorMetric: string, braceletMetric: string) => {
  const x: number[] = [];
  const y: number[] = [];
  matches.forEach(({ sensor, bracelet }) => {
    const xVal = Number(sensor[sensorMetric]?.replace(',', '.'));
    const yVal = Number(bracelet[braceletMetric]?.replace(',', '.'));
    if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
      x.push(xVal);
      y.push(yVal);
    }
  });
  return { x, y };
};

const IntegratedCorrelationSection = () => {
  const [sensorState, setSensorState] = useState<CsvState>(emptyCsvState);
  const [braceletState, setBraceletState] = useState<CsvState>(emptyCsvState);
  const [sensorTime, setSensorTime] = useState<string>('');
  const [braceletTime, setBraceletTime] = useState<string>('');
  const [sensorMetrics, setSensorMetrics] = useState<string[]>([]);
  const [braceletMetrics, setBraceletMetrics] = useState<string[]>([]);
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(5);
  const [results, setResults] = useState<CorrelationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze =
    sensorState.parsed &&
    braceletState.parsed &&
    sensorMetrics.length > 0 &&
    braceletMetrics.length > 0;

  const loadCsv = async (file: File, type: 'sensor' | 'bracelet') => {
    setError(null);
    try {
      const text = await readFileText(file);
      const parsed = parseCsvText(text);
      const numericColumns = detectNumericColumns(parsed.headers, parsed.rows);
      const timeColumns = detectTimeColumns(parsed.headers, parsed.rows);
      const nextState = { parsed, numericColumns, timeColumns };

      if (type === 'sensor') {
        setSensorState(nextState);
        setSensorTime(timeColumns[0] ?? '');
        const auto = numericColumns.filter((col) => col.toLowerCase().includes('pm'));
        setSensorMetrics(auto.length > 0 ? auto : numericColumns.slice(0, 2));
      } else {
        setBraceletState(nextState);
        setBraceletTime(timeColumns[0] ?? '');
        setBraceletMetrics(numericColumns.slice(0, 3));
      }
    } catch (err: any) {
      setError(err?.message || 'Errore parsing CSV');
    }
  };

  const analyze = () => {
    if (!sensorState.parsed || !braceletState.parsed) return;
    const matches = buildMatches(
      sensorState.parsed.rows,
      braceletState.parsed.rows,
      sensorTime || undefined,
      braceletTime || undefined,
      toleranceMinutes * 60 * 1000,
    );

    const resultsList: CorrelationResult[] = [];
    sensorMetrics.forEach((sensorMetric) => {
      braceletMetrics.forEach((braceletMetric) => {
        const { x, y } = extractSeries(matches, sensorMetric, braceletMetric);
        const { r, n } = pearson(x, y);
        resultsList.push({ sensorMetric, braceletMetric, r, n });
      });
    });
    resultsList.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    setResults(resultsList);
  };

  const summary = useMemo(() => {
    if (!results || results.length === 0) return null;
    return results[0];
  }, [results]);

  return (
    <div className="space-y-6">
      <motion.div
        className="glass-panel p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 rounded-2xl bg-primary/20">
            <GitMerge className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gradient">AI di Correlazione Integrata</h2>
            <p className="text-sm text-muted-foreground">
              Incrocio dati ambientali e neuromotori per rilevare correlazioni tra esposizione e variazioni motorie.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Input ambientale</p>
            <p className="text-sm text-muted-foreground">CSV sensore PM2.5/PM10 con timestamp.</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Input neuromotore</p>
            <p className="text-sm text-muted-foreground">CSV braccialetto con parametri motori e orario.</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Output</p>
            <p className="text-sm text-muted-foreground">Correlazioni Pearson e ranking di sensibilità.</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          className="glass-panel p-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">CSV Sensore</h3>
          </div>
          <label className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border bg-card/40 cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carica CSV sensore</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadCsv(file, 'sensor');
              }}
            />
          </label>

          {sensorState.parsed && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">Righe: {sensorState.parsed.rows.length}</p>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Timestamp</p>
                <select
                  value={sensorTime}
                  onChange={(event) => setSensorTime(event.target.value)}
                  className="w-full rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm"
                >
                  <option value="">Nessun timestamp (allineamento per indice)</option>
                  {sensorState.timeColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Metriche ambientali</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sensorState.numericColumns.map((col) => (
                    <label key={col} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={sensorMetrics.includes(col)}
                        onChange={(event) => {
                          setSensorMetrics((prev) =>
                            event.target.checked ? [...prev, col] : prev.filter((item) => item !== col),
                          );
                        }}
                      />
                      <span>{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          className="glass-panel p-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">CSV Braccialetto</h3>
          </div>
          <label className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border bg-card/40 cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carica CSV braccialetto</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadCsv(file, 'bracelet');
              }}
            />
          </label>

          {braceletState.parsed && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">Righe: {braceletState.parsed.rows.length}</p>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Timestamp</p>
                <select
                  value={braceletTime}
                  onChange={(event) => setBraceletTime(event.target.value)}
                  className="w-full rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm"
                >
                  <option value="">Nessun timestamp (allineamento per indice)</option>
                  {braceletState.timeColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Metriche neuromotorie</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {braceletState.numericColumns.map((col) => (
                    <label key={col} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={braceletMetrics.includes(col)}
                        onChange={(event) => {
                          setBraceletMetrics((prev) =>
                            event.target.checked ? [...prev, col] : prev.filter((item) => item !== col),
                          );
                        }}
                      />
                      <span>{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <motion.div
        className="glass-panel p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="font-semibold mb-1">Parametri di allineamento</h3>
            <p className="text-xs text-muted-foreground">
              Seleziona la tolleranza temporale per agganciare i campioni sensore-braccialetto.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={toleranceMinutes}
              onChange={(event) => setToleranceMinutes(Math.max(1, Number(event.target.value)))}
              className="w-24 rounded-lg bg-muted/40 border border-border px-3 py-2 text-sm"
            />
            <span className="text-sm text-muted-foreground">minuti</span>
            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                canAnalyze ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground'
              }`}
            >
              Avvia analisi
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-air-dangerous mt-3">{error}</p>}
      </motion.div>

      <AnimateResults results={results} summary={summary} />
    </div>
  );
};

const AnimateResults = ({
  results,
  summary,
}: {
  results: CorrelationResult[] | null;
  summary: CorrelationResult | null;
}) => {
  if (!results) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
        Carica i CSV e avvia l'analisi per ottenere le correlazioni.
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
        Nessuna correlazione calcolabile con i dati selezionati.
      </div>
    );
  }

  return (
    <motion.div
      className="glass-panel p-6 space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {summary && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/60">
          <Brain className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Correlazione più forte</p>
            <p className="text-xs text-muted-foreground">
              {summary.sensorMetric} ↔ {summary.braceletMetric} · r = {formatR(summary.r)} · n = {summary.n}
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {results.map((item) => (
          <div key={`${item.sensorMetric}-${item.braceletMetric}`} className="p-4 rounded-xl border border-border bg-card/60">
            <p className="text-sm font-semibold">{item.sensorMetric} ↔ {item.braceletMetric}</p>
            <p className="text-xs text-muted-foreground mt-1">r = {formatR(item.r)} · n = {item.n}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default IntegratedCorrelationSection;
