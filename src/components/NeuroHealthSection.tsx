import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Activity, 
  Sparkles,
  ChevronRight,
  RefreshCw,
  Clock,
  Zap
} from 'lucide-react';
import { SensorData, calculateNeuroHealthRisk, NeuroHealthRisk } from '@/lib/airQuality';
import { getAIInsights, AIAnalysis } from '@/lib/aiPrediction';
import { Button } from '@/components/ui/button';

interface NeuroHealthSectionProps {
  risk: NeuroHealthRisk;
  history: SensorData[];
}

const NeuroHealthSection = ({ risk, history }: NeuroHealthSectionProps) => {
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fetchAIAnalysis = async () => {
    if (history.length < 5) return;
    setIsAnalyzing(true);
    try {
      const result = await getAIInsights(history);
      setAiAnalysis(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (history.length >= 10 && !aiAnalysis) {
      fetchAIAnalysis();
    }
  }, [history.length]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-air-excellent';
      case 'moderate': return 'text-air-moderate';
      case 'high': return 'text-air-unhealthy';
      case 'critical': return 'text-air-dangerous';
      default: return 'text-primary';
    }
  };

  const getRiskBg = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-400/10 border-green-400/20';
      case 'moderate': return 'bg-yellow-400/10 border-yellow-400/20';
      case 'high': return 'bg-orange-400/10 border-orange-400/20';
      case 'critical': return 'bg-red-400/10 border-red-400/20';
      default: return 'bg-primary/10 border-primary/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Risk Level Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          className="glass-panel-purple p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-accent/20">
              <Brain className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gradient-neuro">NeuroHealth Monitor</h2>
              <p className="text-sm text-muted-foreground">Analisi impatto neurologico PM2.5</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Livello di Rischio</span>
              <Activity className={`w-5 h-5 ${getRiskColor(risk.level)}`} />
            </div>
            <div className={`text-3xl font-bold uppercase ${getRiskColor(risk.level)}`}>
              {risk.level === 'low' ? 'Basso' : risk.level === 'moderate' ? 'Moderato' : risk.level === 'high' ? 'Alto' : 'Critico'}
            </div>
            
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: risk.level === 'low' 
                    ? 'hsl(var(--air-excellent))' 
                    : risk.level === 'moderate'
                    ? 'hsl(var(--air-moderate))'
                    : risk.level === 'high'
                    ? 'hsl(var(--air-unhealthy))'
                    : 'hsl(var(--air-dangerous))'
                }}
                animate={{ width: `${risk.percentage}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo Sopra Soglia</span>
                </div>
                <div className="text-lg font-bold">{Math.round(risk.timeAboveThreshold)}%</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Media PM2.5</span>
                </div>
                <div className="text-lg font-bold">{Math.round(risk.cumulativeExposure)}</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* AI Insights Card */}
        <motion.div
          className="glass-panel p-6 relative overflow-hidden flex flex-col"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <h3 className="font-semibold">AI Clinical Analysis</h3>
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8 hover-elevate"
              onClick={fetchAIAnalysis}
              disabled={isAnalyzing || history.length < 5}
            >
              <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="flex-1">
            {isAnalyzing ? (
              <div className="space-y-3">
                <div className="h-4 bg-muted/50 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-muted/50 rounded animate-pulse w-1/2" />
                <div className="h-20 bg-muted/50 rounded animate-pulse w-full" />
              </div>
            ) : aiAnalysis ? (
              <div className="space-y-4">
                <div className={`p-3 rounded-xl border ${getRiskBg(aiAnalysis.riskLevel)}`}>
                  <p className="text-sm font-medium leading-relaxed">
                    {aiAnalysis.summary}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Raccomandazioni</p>
                  {aiAnalysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-4">
                <Brain className="w-10 h-10 text-muted/20 mb-3" />
                <p className="text-xs text-muted-foreground mb-4">Analisi AI disponibile con almeno 5 campioni nello storico.</p>
                <Button size="sm" variant="secondary" onClick={fetchAIAnalysis} disabled={history.length < 5}>
                  Avvia Analisi
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default NeuroHealthSection;